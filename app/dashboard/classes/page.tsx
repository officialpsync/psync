"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Loader2,
  Plus,
  Users,
  X,
  Trash2,
  CalendarDays,
  Search,
} from "lucide-react";
import { Avatar, formatDate, Segmented, Skeleton, useToast } from "../components/ui";
import { DesignStyles } from "../components/DesignSystem";

const supabase = createClient();

// schedule_day is stored as text: "Monday", "Tuesday" etc.
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Map schedule_day text → 0-based index (Mon=0)
function dayIndex(scheduleDay: string): number {
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === scheduleDay.toLowerCase());
  return idx === -1 ? 0 : idx;
}

// Whether a class occurs on a given ISO date, honoring its recurrence rule.
function occursOn(cls: GymClass, iso: string, exceptions?: Set<string>): boolean {
  if (exceptions?.has(`${cls.id}:${iso}`)) return false;
  const date = new Date(iso + "T00:00:00");
  const start = new Date(cls.recurrence_start_date + "T00:00:00");
  if (date < start) return false;
  if (cls.recurrence_end_date) {
    const end = new Date(cls.recurrence_end_date + "T00:00:00");
    if (date > end) return false;
  }
  const daysSince = Math.round((date.getTime() - start.getTime()) / 86400000);
  const interval = Math.max(1, cls.recurrence_interval || 1);

  if (cls.recurrence_unit === "day") {
    return daysSince % interval === 0;
  }
  // week unit — must match the class's weekday
  if (dayIndex(cls.schedule_day) !== (date.getDay() === 0 ? 6 : date.getDay() - 1)) return false;
  const weeksSince = Math.floor(daysSince / 7);
  return weeksSince % interval === 0;
}

const CLASS_COLORS = ["blue", "green", "amber", "red", "purple", "teal"] as const;
type ClassColor = typeof CLASS_COLORS[number];

const COLOR_STYLES: Record<ClassColor, { bg: string; text: string; border: string }> = {
  blue:   { bg: "var(--accent-dim)",  text: "var(--accent)", border: "var(--accent-border)" },
  green:  { bg: "var(--green-dim)",   text: "var(--green)",  border: "rgba(31,138,59,0.2)" },
  amber:  { bg: "var(--amber-dim)",   text: "var(--amber)",  border: "rgba(180,83,9,0.2)" },
  red:    { bg: "var(--red-dim)",     text: "var(--red)",    border: "rgba(215,0,21,0.2)" },
  purple: { bg: "var(--purple-dim)",  text: "var(--purple)", border: "rgba(137,68,171,0.2)" },
  teal:   { bg: "var(--teal-dim)",    text: "var(--teal)",   border: "rgba(14,124,143,0.2)" },
};

type RepeatPreset = "weekly" | "biweekly" | "daily" | "none" | "custom";

const REPEAT_LABELS: Record<RepeatPreset, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  daily: "Daily",
  none: "Does not repeat",
  custom: "Custom…",
};

// Local-date ISO string (YYYY-MM-DD) avoiding UTC shifts
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return toLocalIso(new Date());
}

function nextDateForWeekday(dayName: string): string {
  const target = dayIndex(dayName); // 0=Mon..6=Sun
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1;
  let diff = target - todayIdx;
  if (diff < 0) diff += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return toLocalIso(d);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmt12(t: string): string {
  const mins = parseTime(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
}

type GymClass = {
  id: string; org_id: string; name: string; description: string | null;
  trainer_name: string | null; color: ClassColor;
  schedule_day: string; start_time: string; duration_mins: number;
  capacity: number; is_active: boolean;
  recurrence_unit: "day" | "week";
  recurrence_interval: number;
  recurrence_start_date: string;
  recurrence_end_date: string | null;
};

type ClassBooking = {
  id: string; class_id: string; member_id: string;
  booked_for: string; status: string; session_deducted: boolean;
  members?: { id: string; full_name: string } | null;
};

type Member = { id: string; full_name: string; phone?: string | null };

type ClassException = { id: string; class_id: string; exception_date: string };

type TrainerOption = { name: string; role?: string };

// Google Calendar style layout: place overlapping classes in side-by-side columns
type PlacedClass = {
  cls: GymClass;
  col: number;
  cols: number;
  span: number;
};

function layoutDayClasses(dayClasses: GymClass[]): PlacedClass[] {
  const sorted = [...dayClasses].sort((a, b) => {
    const diff = parseTime(a.start_time) - parseTime(b.start_time);
    return diff !== 0 ? diff : b.duration_mins - a.duration_mins;
  });

  const placed: PlacedClass[] = sorted.map((cls) => ({ cls, col: 0, cols: 1, span: 1 }));
  const colEnds: number[] = [];

  for (const p of placed) {
    const start = parseTime(p.cls.start_time);
    const end = start + p.cls.duration_mins;
    let c = colEnds.findIndex((e) => e <= start);
    if (c === -1) { c = colEnds.length; colEnds.push(end); }
    else { colEnds[c] = end; }
    p.col = c;
  }

  const totalCols = colEnds.length;

  for (const p of placed) {
    p.cols = totalCols;
    const start = parseTime(p.cls.start_time);
    const end = start + p.cls.duration_mins;
    let span = 1;
    while (
      p.col + span < totalCols &&
      !placed.some(
        (o) =>
          o !== p &&
          o.col === p.col + span &&
          parseTime(o.cls.start_time) < end &&
          parseTime(o.cls.start_time) + o.cls.duration_mins > start
      )
    ) {
      span++;
    }
    p.span = span;
  }

  return placed;
}

function hourLabel(h: number) {
  if (h === 0 || h === 24) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

// ---- Create Class Sheet ----
function CreateClassSheet({ orgId, branchId, onClose, onCreated }: {
  orgId: string; branchId: string | null; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [trainerSelectMode, setTrainerSelectMode] = useState<"select" | "custom">("select");
  const [availableTrainers, setAvailableTrainers] = useState<TrainerOption[]>([]);
  const [availableMembers, setAvailableMembers] = useState<Member[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [color, setColor] = useState<ClassColor>("blue");
  const [scheduleDay, setScheduleDay] = useState("Monday");
  const [startTime, setStartTime] = useState("07:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("20");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>("weekly");
  const [customUnit, setCustomUnit] = useState<"day" | "week">("week");
  const [customInterval, setCustomInterval] = useState("1");
  const [startDate, setStartDate] = useState(nextDateForWeekday("Monday"));
  const [startDateTouched, setStartDateTouched] = useState(false);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  // Load available trainers and active members
  useEffect(() => {
    async function loadData() {
      const [sRes, cRes, mRes] = await Promise.all([
        supabase.from("staff").select("id, name, role").eq("org_id", orgId).order("name"),
        supabase.from("classes").select("trainer_name").eq("org_id", orgId).not("trainer_name", "is", null),
        supabase.from("members").select("id, full_name, phone").eq("org_id", orgId).eq("status", "active").order("full_name").limit(300),
      ]);

      const staffList = (sRes.data || []) as Array<{ id: string; name: string; role?: string }>;
      const existingNames = (cRes.data || []).map((c: { trainer_name: string | null }) => c.trainer_name).filter(Boolean) as string[];

      const combined: TrainerOption[] = [];
      const seen = new Set<string>();

      for (const s of staffList) {
        if (s.name && !seen.has(s.name.toLowerCase())) {
          seen.add(s.name.toLowerCase());
          combined.push({ name: s.name, role: s.role || "Staff" });
        }
      }
      for (const t of existingNames) {
        if (t && !seen.has(t.toLowerCase())) {
          seen.add(t.toLowerCase());
          combined.push({ name: t, role: "Trainer" });
        }
      }
      setAvailableTrainers(combined);
      setAvailableMembers((mRes.data as Member[]) || []);
    }
    loadData();
  }, [orgId]);

  useEffect(() => {
    if (!startDateTouched) setStartDate(nextDateForWeekday(scheduleDay));
  }, [scheduleDay, startDateTouched]);

  function resolveRecurrence(): { unit: "day" | "week"; interval: number } {
    if (repeatPreset === "weekly") return { unit: "week", interval: 1 };
    if (repeatPreset === "biweekly") return { unit: "week", interval: 2 };
    if (repeatPreset === "daily") return { unit: "day", interval: 1 };
    if (repeatPreset === "none") return { unit: "week", interval: 1 };
    return { unit: customUnit, interval: Math.max(1, parseInt(customInterval) || 1) };
  }

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableMembers;
    return availableMembers.filter(
      (m) => m.full_name.toLowerCase().includes(q) || (m.phone && m.phone.includes(q))
    );
  }, [availableMembers, memberSearch]);

  const capNum = Math.max(1, parseInt(capacity) || 20);

  async function handleSave() {
    if (!name.trim()) { setError("Class name is required"); return; }
    setSaving(true); setError("");

    let resolvedBranchId = branchId;
    if (!resolvedBranchId) {
      const { data: b } = await supabase
        .from("branches")
        .select("id")
        .eq("org_id", orgId)
        .limit(1)
        .single();
      resolvedBranchId = b?.id ?? null;
    }

    if (!resolvedBranchId) {
      setError("No branch found for this gym. Please create a branch first.");
      setSaving(false);
      return;
    }

    const { unit, interval } = resolveRecurrence();
    const resolvedEndDate = repeatPreset === "none" ? startDate : (hasEndDate ? endDate || null : null);

    const { data: newClass, error: err } = await supabase.from("classes").insert({
      org_id: orgId,
      branch_id: resolvedBranchId,
      name: name.trim(),
      description: description.trim() || null,
      trainer_name: trainerName.trim() || null,
      color,
      schedule_day: scheduleDay,
      start_time: startTime,
      duration_mins: parseInt(duration) || 60,
      capacity: capNum,
      is_active: true,
      recurrence_unit: unit,
      recurrence_interval: interval,
      recurrence_start_date: startDate,
      recurrence_end_date: resolvedEndDate,
    }).select().single();

    if (err) { setError(err.message); setSaving(false); return; }

    // If members were selected, enroll them into the first occurrence
    if (newClass && selectedMemberIds.length > 0) {
      const bookingsToInsert = selectedMemberIds.map((mId) => ({
        org_id: orgId,
        class_id: newClass.id,
        member_id: mId,
        booked_for: startDate,
        status: "booked",
        session_deducted: false,
      }));
      const { error: bErr } = await supabase.from("class_bookings").insert(bookingsToInsert);
      if (bErr) console.warn("Failed to book members for new class:", bErr);
    }

    onCreated();
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "520px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">New class</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px" }}>
          <div className="ps-form-grid">
            <div className="ps-field ps-span-2">
              <label className="ps-label" htmlFor="cls-name">Class name</label>
              <input id="cls-name" className="ps-input" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Yoga, Zumba, CrossFit…"
                style={!name && error ? { borderColor: "var(--red)" } : undefined} />
            </div>

            {/* Trainer selection with dropdown + custom entry */}
            <div className="ps-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="ps-label" htmlFor="cls-trainer-select">Trainer</label>
                <button
                  type="button"
                  className="ps-btn ps-btn--plain ps-btn--sm"
                  style={{ fontSize: 11, padding: 0, height: "auto", color: "var(--accent)" }}
                  onClick={() => {
                    if (trainerSelectMode === "select") {
                      setTrainerSelectMode("custom");
                    } else {
                      setTrainerSelectMode("select");
                    }
                  }}
                >
                  {trainerSelectMode === "select" ? "+ Custom name" : "← Pick from list"}
                </button>
              </div>
              {trainerSelectMode === "select" ? (
                <select
                  id="cls-trainer-select"
                  className="ps-input"
                  value={trainerName}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setTrainerSelectMode("custom");
                      setTrainerName("");
                    } else {
                      setTrainerName(e.target.value);
                    }
                  }}
                  style={{ height: 42 }}
                >
                  <option value="">Select available trainer…</option>
                  {availableTrainers.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} {t.role ? `(${t.role})` : ""}
                    </option>
                  ))}
                  <option value="__custom__">+ Enter custom trainer name…</option>
                </select>
              ) : (
                <input
                  id="cls-trainer"
                  className="ps-input"
                  value={trainerName}
                  onChange={(e) => setTrainerName(e.target.value)}
                  placeholder="Type trainer name"
                  autoFocus
                  style={{ height: 42 }}
                />
              )}
            </div>

            <div className="ps-field">
              <span className="ps-label">Colour</span>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {CLASS_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: "50%",
                      border: color === c ? "3px solid var(--text-primary)" : "2px solid transparent",
                      background: COLOR_STYLES[c].bg, cursor: "pointer", outline: "none",
                      boxShadow: color === c ? `0 0 0 1px ${COLOR_STYLES[c].text}` : "none",
                    }}
                    aria-label={c} aria-pressed={color === c}
                  />
                ))}
              </div>
            </div>

            <div className="ps-field ps-span-2">
              <span className="ps-label">Day</span>
              <Segmented<string>
                block label="Day of week" value={scheduleDay}
                onChange={setScheduleDay}
                options={DAY_NAMES.map((d) => ({ value: d, label: d.slice(0, 3) }))}
              />
            </div>

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-repeat">Repeats</label>
              <select id="cls-repeat" className="ps-input" value={repeatPreset}
                onChange={(e) => setRepeatPreset(e.target.value as RepeatPreset)}
                style={{ height: 42 }}>
                {(["weekly", "biweekly", "daily", "none", "custom"] as RepeatPreset[]).map((p) => (
                  <option key={p} value={p}>{REPEAT_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-start-date">Starts</label>
              <input id="cls-start-date" className="ps-input" type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setStartDateTouched(true); }}
                style={{ height: 42 }} />
              <span className="ps-hint">
                {startDateTouched
                  ? "First class on this date. Change Day above to re-sync."
                  : `Matches the next ${scheduleDay}`}
              </span>
            </div>

            {repeatPreset === "custom" && (
              <div className="ps-field ps-span-2" style={{ background: "var(--fill)", borderRadius: 12, padding: "12px 14px" }}>
                <span className="ps-label">Repeat every</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="ps-input ps-num"
                    type="number" min={1} max={52}
                    value={customInterval}
                    onChange={(e) => setCustomInterval(e.target.value)}
                    style={{ width: 64, flexShrink: 0 }}
                  />
                  <select
                    className="ps-input"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as "day" | "week")}
                    style={{ flex: 1 }}
                  >
                    <option value="day">day(s)</option>
                    <option value="week">week(s) on {scheduleDay}</option>
                  </select>
                </div>
              </div>
            )}

            {repeatPreset !== "none" && (
              <div className="ps-field ps-span-2">
                <span className="ps-label">Ends</span>
                <Segmented<"never" | "on">
                  block label="Ends"
                  value={hasEndDate ? "on" : "never"}
                  onChange={(v) => { setHasEndDate(v === "on"); if (v === "never") setEndDate(""); }}
                  options={[{ value: "never", label: "Never" }, { value: "on", label: "On a date" }]}
                />
                {hasEndDate && (
                  <input id="cls-end-date" className="ps-input" type="date"
                    value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    style={{ height: 42, marginTop: 8 }} />
                )}
              </div>
            )}

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-time">Start time</label>
              <input id="cls-time" className="ps-input" type="time" value={startTime}
                onChange={(e) => setStartTime(e.target.value)} style={{ height: 42 }} />
            </div>

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-dur">Duration</label>
              <select id="cls-dur" className="ps-input" value={duration}
                onChange={(e) => setDuration(e.target.value)}>
                {[30, 45, 60, 75, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>

            <div className="ps-field ps-span-2">
              <label className="ps-label" htmlFor="cls-cap">Capacity</label>
              <input id="cls-cap" className="ps-input" type="number" min={1} max={500}
                value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>

            {/* Select members for the class */}
            <div className="ps-field ps-span-2" style={{ borderTop: "1px solid var(--separator)", paddingTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="ps-label" style={{ margin: 0, fontWeight: 650 }}>
                  Pre-enroll members (optional)
                </span>
                <span style={{ fontSize: 12, color: selectedMemberIds.length >= capNum ? "var(--amber)" : "var(--text-tertiary)" }}>
                  {selectedMemberIds.length} / {capNum} selected
                </span>
              </div>

              {selectedMemberIds.length > 0 && (
                <div className="cl-selected-chips">
                  {selectedMemberIds.map((mId) => {
                    const mem = availableMembers.find((m) => m.id === mId);
                    return (
                      <span key={mId} className="cl-member-chip">
                        <span>{mem?.full_name ?? "Member"}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedMemberIds((prev) => prev.filter((id) => id !== mId))}
                          aria-label="Remove"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    className="ps-btn ps-btn--plain ps-btn--sm"
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    onClick={() => setSelectedMemberIds([])}
                  >
                    Clear all
                  </button>
                </div>
              )}

              <div style={{ position: "relative", marginBottom: 6 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: 12, color: "var(--text-tertiary)" }} />
                <input
                  className="ps-input"
                  placeholder="Search members to add…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  style={{ height: 38, paddingLeft: 30 }}
                />
              </div>

              <div className="cl-member-picker-box">
                {availableMembers.length === 0 ? (
                  <div style={{ padding: "12px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
                    No members found
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div style={{ padding: "12px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
                    No matching members
                  </div>
                ) : (
                  filteredMembers.slice(0, 40).map((m) => {
                    const isSelected = selectedMemberIds.includes(m.id);
                    const atCap = !isSelected && selectedMemberIds.length >= capNum;
                    return (
                      <label
                        key={m.id}
                        className={`cl-member-row ${isSelected ? "selected" : ""} ${atCap ? "disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={atCap}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== m.id));
                            } else if (!atCap) {
                              setSelectedMemberIds((prev) => [...prev, m.id]);
                            }
                          }}
                        />
                        <Avatar name={m.full_name} size={24} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                          {m.full_name}
                        </span>
                        {m.phone && (
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                            {m.phone}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="ps-field ps-span-2">
              <label className="ps-label" htmlFor="cls-desc">Description (optional)</label>
              <textarea id="cls-desc" className="ps-input" rows={2} value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Equipment needed, level, instructions…" />
            </div>
          </div>
          {error && <div className="ps-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving…" : selectedMemberIds.length > 0 ? `Create & enroll (${selectedMemberIds.length})` : "Create class"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Class Detail Sheet ----
function ClassDetailSheet({ cls, bookedFor, orgId, onClose, onUpdated }: {
  cls: GymClass; bookedFor: string; orgId: string;
  onClose: () => void; onUpdated: () => void;
}) {
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteChoice, setDeleteChoice] = useState(false);
  const { toast, show } = useToast();
  const colorStyle = COLOR_STYLES[cls.color] ?? COLOR_STYLES.blue;

  useEffect(() => {
    async function load() {
      const [{ data: b }, { data: m }] = await Promise.all([
        supabase.from("class_bookings")
          .select("id, class_id, member_id, booked_for, status, session_deducted, members(id, full_name)")
          .eq("class_id", cls.id).eq("booked_for", bookedFor).eq("status", "booked"),
        supabase.from("members").select("id, full_name, phone")
          .eq("org_id", orgId).eq("status", "active").order("full_name").limit(300),
      ]);
      setBookings((b as unknown as ClassBooking[]) || []);
      setMembers((m as Member[]) || []);
      setLoading(false);
    }
    load();
  }, [cls.id, bookedFor, orgId]);

  const bookedIds = useMemo(() => new Set(bookings.map((b) => b.member_id)), [bookings]);
  const available = useMemo(() => members.filter((m) => !bookedIds.has(m.id)), [members, bookedIds]);
  const spotsLeft = cls.capacity - bookings.length;

  const filteredAvailable = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (m) => m.full_name.toLowerCase().includes(q) || (m.phone && m.phone.includes(q))
    );
  }, [available, searchQuery]);

  async function bookSelectedMembers() {
    if (selectedMemberIds.length === 0) return;
    setSaving(true);
    const rows = selectedMemberIds.map((mId) => ({
      org_id: orgId,
      class_id: cls.id,
      member_id: mId,
      booked_for: bookedFor,
      status: "booked",
      session_deducted: false,
    }));

    const { error } = await supabase.from("class_bookings").insert(rows);
    if (error) {
      show("Couldn't book: " + error.message, "error");
    } else {
      show(`${selectedMemberIds.length} member${selectedMemberIds.length > 1 ? "s" : ""} booked`);
      setSelectedMemberIds([]);
      setSearchQuery("");
      const { data: b } = await supabase.from("class_bookings")
        .select("id, class_id, member_id, booked_for, status, session_deducted, members(id, full_name)")
        .eq("class_id", cls.id).eq("booked_for", bookedFor).eq("status", "booked");
      setBookings((b as unknown as ClassBooking[]) || []);
      onUpdated();
    }
    setSaving(false);
  }

  async function cancelBooking(bookingId: string, memberName: string) {
    await supabase.from("class_bookings").update({ status: "cancelled" }).eq("id", bookingId);
    show(`${memberName.split(" ")[0]} removed`);
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    onUpdated();
  }

  const isRecurring = cls.recurrence_end_date !== cls.recurrence_start_date;

  async function deleteThisOccurrence() {
    setDeleting(true);
    const [{ error: exErr }] = await Promise.all([
      supabase.from("class_exceptions").insert({ org_id: orgId, class_id: cls.id, exception_date: bookedFor }),
      supabase.from("class_bookings").update({ status: "cancelled" }).eq("class_id", cls.id).eq("booked_for", bookedFor),
    ]);
    if (exErr) { show("Couldn't remove this date: " + exErr.message, "error"); setDeleting(false); return; }
    onUpdated();
    onClose();
  }

  async function deleteThisAndFollowing() {
    const dayBefore = new Date(bookedFor + "T00:00:00");
    dayBefore.setDate(dayBefore.getDate() - 1);
    const newEnd = dayBefore.toISOString().slice(0, 10);

    if (newEnd < cls.recurrence_start_date) {
      return deleteAllOccurrences();
    }

    setDeleting(true);
    const { error } = await supabase
      .from("classes")
      .update({ recurrence_end_date: newEnd })
      .eq("id", cls.id);
    if (error) { show("Couldn't update series: " + error.message, "error"); setDeleting(false); return; }
    await supabase.from("class_bookings").update({ status: "cancelled" }).eq("class_id", cls.id).gte("booked_for", bookedFor);
    onUpdated();
    onClose();
  }

  async function deleteAllOccurrences() {
    setDeleting(true);
    const { error } = await supabase
      .from("classes")
      .update({ is_active: false })
      .eq("id", cls.id);
    if (error) {
      show("Couldn't delete: " + error.message, "error");
      setDeleting(false);
      return;
    }
    await supabase.from("class_bookings").update({ status: "cancelled" }).eq("class_id", cls.id).gte("booked_for", todayIso());
    onUpdated();
    onClose();
  }

  function deleteClass() {
    if (!isRecurring) {
      if (!confirm(`Delete "${cls.name}"? This will remove all its bookings.`)) return;
      deleteAllOccurrences();
      return;
    }
    setDeleteChoice(true);
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>

        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: colorStyle.text, flexShrink: 0 }} />
                <div className="ps-sheet-title">{cls.name}</div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>
                {cls.schedule_day} &middot; {fmt12(cls.start_time)} &middot; {cls.duration_mins} min
                {cls.trainer_name ? ` · ${cls.trainer_name}` : ""}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {bookings.length} of {cls.capacity} booked
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: spotsLeft <= 0 ? "var(--red)" : spotsLeft <= 3 ? "var(--amber)" : "var(--green)" }}>
                {spotsLeft <= 0 ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
              </span>
            </div>
            <div className="ps-progress" style={{ height: 6 }}>
              <span style={{
                transform: `scaleX(${Math.min(1, bookings.length / cls.capacity)})`,
                background: spotsLeft <= 0 ? "var(--red-fill)" : "var(--accent)",
              }} />
            </div>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "0 0 16px" }}>
          {/* Multi-member selection picker */}
          {spotsLeft > 0 ? (
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--separator)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>
                  Book members ({spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left)
                </div>
                {selectedMemberIds.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                    {selectedMemberIds.length} selected
                  </span>
                )}
              </div>

              {selectedMemberIds.length > 0 && (
                <div className="cl-selected-chips">
                  {selectedMemberIds.map((mId) => {
                    const m = members.find((x) => x.id === mId);
                    return (
                      <span key={mId} className="cl-member-chip">
                        <span>{m?.full_name ?? "Member"}</span>
                        <button type="button" onClick={() => setSelectedMemberIds((prev) => prev.filter((id) => id !== mId))}>
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    className="ps-btn ps-btn--plain ps-btn--sm"
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    onClick={() => setSelectedMemberIds([])}
                  >
                    Clear
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--text-tertiary)" }} />
                  <input
                    className="ps-input"
                    placeholder="Search available members…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ height: 36, paddingLeft: 30 }}
                  />
                </div>
                {filteredAvailable.length > 1 && spotsLeft > 1 && (
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    style={{ height: 36, whiteSpace: "nowrap", fontSize: 12 }}
                    onClick={() => {
                      const limit = Math.min(spotsLeft, filteredAvailable.length);
                      setSelectedMemberIds(filteredAvailable.slice(0, limit).map((m) => m.id));
                    }}
                  >
                    Select top {Math.min(spotsLeft, filteredAvailable.length)}
                  </button>
                )}
              </div>

              <div className="cl-member-picker-box" style={{ maxHeight: 150 }}>
                {filteredAvailable.length === 0 ? (
                  <div style={{ padding: "12px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
                    {available.length === 0 ? "All active members are already booked" : "No matching members found"}
                  </div>
                ) : (
                  filteredAvailable.map((m) => {
                    const isSelected = selectedMemberIds.includes(m.id);
                    const reachedLimit = !isSelected && selectedMemberIds.length >= spotsLeft;
                    return (
                      <label
                        key={m.id}
                        className={`cl-member-row ${isSelected ? "selected" : ""} ${reachedLimit ? "disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={reachedLimit}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedMemberIds((prev) => prev.filter((id) => id !== m.id));
                            } else if (!reachedLimit) {
                              setSelectedMemberIds((prev) => [...prev, m.id]);
                            }
                          }}
                        />
                        <Avatar name={m.full_name} size={24} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1 }}>
                          {m.full_name}
                        </span>
                        {m.phone && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.phone}</span>}
                      </label>
                    );
                  })
                )}
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ps-btn ps-btn--primary ps-btn--sm"
                  disabled={selectedMemberIds.length === 0 || saving}
                  onClick={bookSelectedMembers}
                  style={{ height: 36, padding: "0 14px" }}
                >
                  {saving ? <Loader2 size={14} className="ps-spin" /> : <Plus size={14} />}
                  {saving
                    ? "Booking…"
                    : selectedMemberIds.length > 1
                    ? `Book ${selectedMemberIds.length} members`
                    : selectedMemberIds.length === 1
                    ? `Book 1 member`
                    : "Select members to book"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--separator)", background: "var(--fill)", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
              This class is full ({cls.capacity}/{cls.capacity})
            </div>
          )}

          {/* Booked attendees list */}
          <div style={{ padding: "8px 8px 0" }}>
            <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 650, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Enrolled attendees ({bookings.length})
            </div>
            {loading ? (
              <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Skeleton w={32} h={32} r={16} />
                    <Skeleton w={140} h={13} />
                  </div>
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div style={{ padding: "24px 12px", textAlign: "center" }}>
                <Users size={20} style={{ color: "var(--text-tertiary)", margin: "0 auto 8px" }} />
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No bookings yet for this date</div>
              </div>
            ) : (
              bookings.map((b) => {
                const name = (b.members as { full_name: string } | null)?.full_name ?? "Member";
                return (
                  <div key={b.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10 }}
                    className="booking-row">
                    <Avatar name={name} size={32} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{name}</span>
                    <button type="button" className="ps-icon-btn ps-icon-btn--danger"
                      style={{ width: 28, height: 28 }}
                      onClick={() => cancelBooking(b.id, name)} aria-label="Remove booking">
                      <X size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {deleteChoice ? (
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--separator)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
              This is a repeating class. What do you want to delete?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button type="button" className="ps-btn ps-btn--secondary" style={{ justifyContent: "flex-start", color: "var(--red)" }}
                onClick={deleteThisOccurrence} disabled={deleting}>
                {deleting ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}
                Just this class ({formatDate(bookedFor)})
              </button>
              <button type="button" className="ps-btn ps-btn--secondary" style={{ justifyContent: "flex-start", color: "var(--red)" }}
                onClick={deleteThisAndFollowing} disabled={deleting}>
                {deleting ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}
                This and all following classes
              </button>
              <button type="button" className="ps-btn ps-btn--secondary" style={{ justifyContent: "flex-start", color: "var(--red)" }}
                onClick={deleteAllOccurrences} disabled={deleting}>
                {deleting ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}
                All classes in this series
              </button>
            </div>
            <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ marginTop: 8 }}
              onClick={() => setDeleteChoice(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="ps-sheet-footer" style={{ justifyContent: "space-between" }}>
            <button type="button" className="ps-btn ps-btn--secondary"
              style={{ color: "var(--red)" }}
              onClick={deleteClass} disabled={deleting}>
              <Trash2 size={14} />
              Delete class
            </button>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Close</button>
          </div>
        )}

        {toast}
      </div>
    </div>
  );
}

// ---- Main Page ----

type View = "week" | "day" | "month" | "agenda";

const HOUR_ROW_HEIGHT = 58;

export default function ClassesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Active anchor date for Google Calendar navigation
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [view, setView] = useState<View>("week");
  const [trainer, setTrainer] = useState<string | null>(null);
  const [trainerDropdownOpen, setTrainerDropdownOpen] = useState(false);
  const trainerDropdownRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);
  const [selectedBookedFor, setSelectedBookedFor] = useState<string>("");

  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Close trainer dropdown on click outside or escape
  useEffect(() => {
    if (!trainerDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (trainerDropdownRef.current && !trainerDropdownRef.current.contains(e.target as Node)) {
        setTrainerDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrainerDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [trainerDropdownOpen]);

  // Responsive default on mobile
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setView("day");
    }
  }, []);

  // Update "Now" red line every minute
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Compute week dates around anchorDate
  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);
  const weekIsos = useMemo(() => weekDates.map(toLocalIso), [weekDates]);

  // Compute month dates (42-day standard Google Calendar month grid)
  const monthDates = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDayIdx = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1; // Mon=0
    const gridStart = new Date(year, month, 1 - startDayIdx);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [anchorDate]);
  const monthIsos = useMemo(() => monthDates.map(toLocalIso), [monthDates]);

  // Day view date
  const dayIso = useMemo(() => toLocalIso(anchorDate), [anchorDate]);
  const todayStr = useMemo(() => todayIso(), []);

  // Query dates for current view
  const queryIsos = useMemo(() => {
    if (view === "month") return monthIsos;
    if (view === "day") return [dayIso];
    return weekIsos;
  }, [view, monthIsos, dayIso, weekIsos]);

  // Header Title
  const titleLabel = useMemo(() => {
    const monthName = anchorDate.toLocaleDateString("en-US", { month: "long" });
    const year = anchorDate.getFullYear();
    if (view === "day") {
      return anchorDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
    if (view === "week") {
      const endOfWeek = new Date(weekStart);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      const startM = weekStart.toLocaleDateString("en-US", { month: "short" });
      const endM = endOfWeek.toLocaleDateString("en-US", { month: "short" });
      if (startM === endM) {
        return `${monthName} ${year}`;
      }
      return `${startM} – ${endM} ${year}`;
    }
    return `${monthName} ${year}`;
  }, [anchorDate, view, weekStart]);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
    if (!roleData) return;
    setOrgId(roleData.org_id);

    const { data: branchData } = await supabase.from("branches").select("id").eq("org_id", roleData.org_id).limit(1).single();
    if (branchData) setBranchId(branchData.id);

    const [{ data: c }, { data: b }, { data: ex }] = await Promise.all([
      supabase.from("classes")
        .select("id, org_id, name, description, trainer_name, color, schedule_day, start_time, duration_mins, capacity, is_active, recurrence_unit, recurrence_interval, recurrence_start_date, recurrence_end_date")
        .eq("org_id", roleData.org_id).eq("is_active", true).order("start_time"),
      supabase.from("class_bookings")
        .select("id, class_id, member_id, booked_for, status, session_deducted")
        .eq("org_id", roleData.org_id).in("booked_for", queryIsos).eq("status", "booked").limit(2000),
      supabase.from("class_exceptions").select("id, class_id, exception_date").eq("org_id", roleData.org_id),
    ]);

    setClasses((c as GymClass[]) || []);
    setBookings((b as ClassBooking[]) || []);
    setExceptions(new Set(((ex as ClassException[]) || []).map((e) => `${e.class_id}:${e.exception_date}`)));
    setLoading(false);
  }, [queryIsos]);

  useEffect(() => { loadData(); }, [loadData]);

  const bookingCount = useCallback((classId: string, iso: string) => {
    return bookings.filter((b) => b.class_id === classId && b.booked_for === iso).length;
  }, [bookings]);

  const trainers = useMemo(() => {
    return [...new Set(classes.map((c) => c.trainer_name).filter(Boolean) as string[])].sort();
  }, [classes]);

  const shown = useMemo(() => {
    return trainer ? classes.filter((c) => c.trainer_name === trainer) : classes;
  }, [classes, trainer]);

  // Occurrences for week view
  const weekOcc = useMemo(() => {
    return weekIsos.map((iso) => shown.filter((c) => occursOn(c, iso, exceptions)));
  }, [shown, exceptions, weekIsos]);

  // Occurrences for day view
  const dayOcc = useMemo(() => {
    return shown.filter((c) => occursOn(c, dayIso, exceptions));
  }, [shown, exceptions, dayIso]);

  // Visible hours range: at least 6 AM to 10 PM
  const allActiveTimes = view === "day" ? dayOcc : weekOcc.flat();
  const startH = Math.min(6, ...allActiveTimes.map((c) => Math.floor(parseTime(c.start_time) / 60)));
  const endH = Math.max(22, ...allActiveTimes.map((c) => Math.ceil((parseTime(c.start_time) + c.duration_mins) / 60)));
  const hours = useMemo(() => Array.from({ length: endH - startH }, (_, i) => startH + i), [startH, endH]);

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMins / 60) - startH) * HOUR_ROW_HEIGHT;
  const showNow = nowMins / 60 >= startH && nowMins / 60 <= endH;

  // Auto-scroll to earliest class or current hour on mount / date change
  useEffect(() => {
    if (!gridScrollRef.current) return;
    const currentH = now.getHours();
    let targetHour = Math.max(startH, Math.min(currentH - 1, 9));

    const dayTimes = (view === "day" ? dayOcc : weekOcc.flat()).map((c) => Math.floor(parseTime(c.start_time) / 60));
    if (dayTimes.length > 0) {
      const earliest = Math.min(...dayTimes);
      targetHour = Math.max(startH, earliest - 1);
    }

    gridScrollRef.current.scrollTop = (targetHour - startH) * HOUR_ROW_HEIGHT;
  }, [anchorDate, view, startH, dayOcc, weekOcc, now]);

  function open(cls: GymClass, iso: string) {
    setSelectedClass(cls);
    setSelectedBookedFor(iso);
  }

  // Navigation handlers
  function handlePrev() {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === "day") d.setDate(d.getDate() - 1);
      else if (view === "month") d.setMonth(d.getMonth() - 1);
      else d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function handleNext() {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === "day") d.setDate(d.getDate() + 1);
      else if (view === "month") d.setMonth(d.getMonth() + 1);
      else d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function handleToday() {
    setAnchorDate(new Date());
  }

  function renderEventBlock(cls: GymClass, iso: string, col: number, cols: number, span: number) {
    const top = ((parseTime(cls.start_time) / 60) - startH) * HOUR_ROW_HEIGHT;
    const height = Math.max((cls.duration_mins / 60) * HOUR_ROW_HEIGHT - 3, 24);
    const n = bookingCount(cls.id, iso);
    const full = n >= cls.capacity;
    const pct = cls.capacity > 0 ? Math.min(1, n / cls.capacity) : 0;
    const tight = height < 44 || cols > 2;

    return (
      <button
        key={cls.id}
        type="button"
        className={`cl-block cl-theme-${cls.color}`}
        onClick={() => open(cls, iso)}
        title={`${cls.name} · ${fmt12(cls.start_time)} · ${cls.duration_mins} min${cls.trainer_name ? ` · ${cls.trainer_name}` : ""} · ${n}/${cls.capacity} booked`}
        style={{
          top: top + 1,
          height,
          left: `calc(2px + ${col} * (100% - 4px) / ${cols})`,
          width: `calc(${span} * (100% - 4px) / ${cols} - 2px)`,
        } as React.CSSProperties}
      >
        <span className="cl-block-name">{cls.name}</span>
        {!tight && (
          <span className="cl-block-sub">
            {fmt12(cls.start_time)}{cls.trainer_name ? ` · ${cls.trainer_name}` : ""}
          </span>
        )}
        {height >= 34 && (
          <span className="cl-block-foot">
            {full ? <b className="cl-full">Full</b> : <span>{n}/{cls.capacity}</span>}
            <i className="cl-block-bar">
              <i style={{ width: `${pct * 100}%` }} />
            </i>
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="ps-page db cl">
      <DesignStyles />
      <style>{CL_CSS}</style>

      {/* Header without top KPI cards */}
      <header className="cl-head">
        <div className="cl-title">
          <div>
            <h1>Classes</h1>
            <p>{loading ? "\u00a0" : `${classes.length} active class${classes.length === 1 ? "" : "es"} · ${titleLabel}`}</p>
          </div>
        </div>
        {orgId && (
          <button type="button" className="ps-btn ps-btn--primary cl-new" onClick={() => setCreateOpen(true)}>
            <Plus size={16} strokeWidth={2.4} /> <span>New class</span>
          </button>
        )}
      </header>

      {/* Google Calendar Card */}
      <div className="cl-card">
        {/* Google Calendar Toolbar */}
        <div className="cl-toolbar">
          <div className="cl-nav">
            <button type="button" className="cl-today-btn" onClick={handleToday}>
              Today
            </button>
            <div className="cl-nav-chevrons">
              <button type="button" className="cl-icon-arrow" onClick={handlePrev} aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <button type="button" className="cl-icon-arrow" onClick={handleNext} aria-label="Next">
                <ChevronRight size={18} />
              </button>
            </div>
            <strong className="cl-title-label">{titleLabel}</strong>
          </div>

          {trainers.length > 0 && (
            <div className="cl-trainer-filter-wrap" ref={trainerDropdownRef}>
              <button
                type="button"
                className={`cl-trainer-filter-btn ${trainer ? "cl-trainer-filter-btn--active" : ""}`}
                onClick={() => setTrainerDropdownOpen((prev) => !prev)}
                aria-expanded={trainerDropdownOpen}
                aria-haspopup="listbox"
                title="Filter by trainer"
              >
                {trainer ? (
                  <>
                    <Avatar name={trainer} size={18} />
                    <span className="cl-trainer-filter-name">{trainer}</span>
                  </>
                ) : (
                  <>
                    <Users size={14} className="cl-trainer-filter-icon" />
                    <span>All trainers</span>
                  </>
                )}
                <ChevronDown size={13} className={`cl-trainer-chevron ${trainerDropdownOpen ? "cl-trainer-chevron--open" : ""}`} />
              </button>

              {trainer && (
                <button
                  type="button"
                  className="cl-trainer-clear-btn"
                  onClick={() => setTrainer(null)}
                  title="Clear trainer filter"
                  aria-label="Clear trainer filter"
                >
                  <X size={12} />
                </button>
              )}

              {trainerDropdownOpen && (
                <div className="cl-trainer-menu" role="listbox" aria-label="Select trainer">
                  <div className="cl-trainer-menu-header">
                    <span>Filter by trainer</span>
                    {trainer && (
                      <button
                        type="button"
                        className="cl-trainer-reset-link"
                        onClick={() => {
                          setTrainer(null);
                          setTrainerDropdownOpen(false);
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    role="option"
                    aria-selected={trainer === null}
                    className={`cl-trainer-menu-item ${trainer === null ? "active" : ""}`}
                    onClick={() => {
                      setTrainer(null);
                      setTrainerDropdownOpen(false);
                    }}
                  >
                    <span className="cl-trainer-menu-all-icon">
                      <Users size={12} />
                    </span>
                    <span className="cl-trainer-item-name">All trainers</span>
                    <span className="cl-trainer-item-count">{classes.length}</span>
                    {trainer === null && <Check size={14} className="cl-trainer-check" />}
                  </button>

                  <div className="cl-trainer-divider" />

                  <div className="cl-trainer-list">
                    {trainers.map((t) => {
                      const count = classes.filter((c) => c.trainer_name === t).length;
                      return (
                        <button
                          key={t}
                          type="button"
                          role="option"
                          aria-selected={trainer === t}
                          className={`cl-trainer-menu-item ${trainer === t ? "active" : ""}`}
                          onClick={() => {
                            setTrainer(t);
                            setTrainerDropdownOpen(false);
                          }}
                        >
                          <Avatar name={t} size={20} />
                          <span className="cl-trainer-item-name">{t}</span>
                          <span className="cl-trainer-item-count">{count}</span>
                          {trainer === t && <Check size={14} className="cl-trainer-check" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="cl-views" role="tablist" aria-label="Calendar view">
            {(["day", "week", "month", "agenda"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-view={v}
                onClick={() => setView(v)}
              >
                {v === "day" ? "Day" : v === "week" ? "Week" : v === "month" ? "Month" : "Schedule"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="cl-loading">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={56} r={12} />)}
          </div>
        ) : view === "month" ? (
          /* Google Calendar Month View */
          <div className="cl-month-view">
            <div className="cl-month-header">
              {DAY_SHORT.map((day) => (
                <div key={day} className="cl-month-header-cell">
                  {day}
                </div>
              ))}
            </div>
            <div className="cl-month-grid">
              {monthDates.map((date, idx) => {
                const iso = monthIsos[idx];
                const isCurrentMonth = date.getMonth() === anchorDate.getMonth();
                const isToday = iso === todayStr;
                const dayClasses = shown
                  .filter((c) => occursOn(c, iso, exceptions))
                  .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));

                return (
                  <div
                    key={iso}
                    className={`cl-month-cell ${!isCurrentMonth ? "other-month" : ""} ${isToday ? "today" : ""}`}
                    onClick={() => {
                      setAnchorDate(date);
                      setView("day");
                    }}
                  >
                    <div className="cl-month-cell-head">
                      <span className={`cl-month-date ${isToday ? "today-badge" : ""}`}>
                        {date.getDate()}
                      </span>
                      {dayClasses.length > 0 && (
                        <span className="cl-month-count">{dayClasses.length} class{dayClasses.length > 1 ? "es" : ""}</span>
                      )}
                    </div>
                    <div className="cl-month-cell-events">
                      {dayClasses.slice(0, 3).map((cls) => {
                        const n = bookingCount(cls.id, iso);
                        const full = n >= cls.capacity;
                        return (
                          <div
                            key={cls.id}
                            className={`cl-month-pill cl-theme-${cls.color}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              open(cls, iso);
                            }}
                            title={`${cls.name} · ${fmt12(cls.start_time)} · ${n}/${cls.capacity} booked`}
                          >
                            <span className="cl-month-pill-time">{fmt12(cls.start_time)}</span>
                            <span className="cl-month-pill-name">{cls.name}</span>
                            {full && <span className="cl-month-pill-full">Full</span>}
                          </div>
                        );
                      })}
                      {dayClasses.length > 3 && (
                        <div
                          className="cl-month-more"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnchorDate(date);
                            setView("day");
                          }}
                        >
                          +{dayClasses.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : view === "agenda" ? (
          /* Google Calendar Schedule / Agenda View */
          <div className="cl-agenda">
            {weekDates.map((d, i) => {
              const iso = weekIsos[i];
              const list = [...weekOcc[i]].sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
              if (!list.length) return null;
              return (
                <section key={iso} className="cl-ag-day" data-today={iso === todayStr}>
                  <h3>
                    <span>{d.toLocaleDateString("en-US", { weekday: "long" })}</span>
                    <small>{d.toLocaleDateString("en-US", { day: "numeric", month: "short" })}</small>
                    {iso === todayStr && <em>Today</em>}
                  </h3>
                  {list.map((c) => {
                    const n = bookingCount(c.id, iso), full = n >= c.capacity;
                    return (
                      <button key={c.id} type="button" className={`cl-ag-row cl-theme-${c.color}`} onClick={() => open(c, iso)}>
                        <span className="cl-ag-time"><b>{fmt12(c.start_time)}</b><small>{c.duration_mins} min</small></span>
                        <span className="cl-ag-main"><strong>{c.name}</strong><small>{c.trainer_name ? `with ${c.trainer_name}` : "No trainer set"}</small></span>
                        <span className="cl-ag-cap">
                          <span>{full ? <b className="cl-full">Full</b> : `${n}/${c.capacity}`}</span>
                          <i className="cl-block-bar"><i style={{ width: `${Math.min(100, (n / Math.max(1, c.capacity)) * 100)}%` }} /></i>
                        </span>
                        <ChevronRight size={16} className="cl-ag-chev" />
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {classes.length === 0 && (
              <div className="cl-empty">
                <CalendarDays size={20} />
                <strong>No classes this week</strong>
                <span>{trainer ? "Try another trainer filter." : "Create a class to get started."}</span>
              </div>
            )}
          </div>
        ) : (
          /* Google Calendar Time Grid (Week & Day Views) */
          <div className="cl-grid-container">
            {/* Sticky Day Header */}
            <div className="cl-grid-header" data-view={view}>
              <div className="cl-time-spacer">
                <span className="cl-gmt-label">GMT</span>
              </div>
              {view === "day" ? (
                <div className="cl-grid-header-col" data-today={dayIso === todayStr}>
                  <span className="cl-gday-label">
                    {anchorDate.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <div className={`cl-gdate-circle ${dayIso === todayStr ? "is-today" : ""}`}>
                    {anchorDate.getDate()}
                  </div>
                  <span className="cl-gday-meta">
                    {dayOcc.length} class{dayOcc.length === 1 ? "" : "es"}
                  </span>
                </div>
              ) : (
                weekDates.map((d, i) => {
                  const iso = weekIsos[i];
                  const isToday = iso === todayStr;
                  const list = weekOcc[i];
                  return (
                    <div
                      key={iso}
                      className="cl-grid-header-col"
                      data-today={isToday}
                      onClick={() => {
                        setAnchorDate(d);
                        setView("day");
                      }}
                      title="Click to view day"
                    >
                      <span className="cl-gday-label">{DAY_SHORT[i]}</span>
                      <div className={`cl-gdate-circle ${isToday ? "is-today" : ""}`}>
                        {d.getDate()}
                      </div>
                      <span className="cl-gday-meta">
                        {list.length ? `${list.length} class${list.length > 1 ? "es" : ""}` : "—"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Scrollable Time Grid */}
            <div className="cl-grid-scroll" ref={gridScrollRef}>
              <div className="cl-grid-body" data-view={view} style={{ height: hours.length * HOUR_ROW_HEIGHT }}>
                {/* Time labels axis */}
                <div className="cl-times-axis">
                  {hours.map((h) => (
                    <div key={h} className="cl-time-slot" style={{ height: HOUR_ROW_HEIGHT }}>
                      <span>{hourLabel(h)}</span>
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                {view === "day" ? (
                  <div className="cl-day-col" data-today={dayIso === todayStr}>
                    {hours.map((h, i) => (
                      <i key={h} className="cl-grid-line" style={{ top: i * HOUR_ROW_HEIGHT }} />
                    ))}
                    {dayIso === todayStr && showNow && (
                      <div className="cl-red-now-line" style={{ top: nowTop }}>
                        <i className="cl-red-now-dot" />
                      </div>
                    )}
                    {layoutDayClasses(dayOcc).map(({ cls, col, cols, span }) =>
                      renderEventBlock(cls, dayIso, col, cols, span)
                    )}
                    {dayOcc.length === 0 && (
                      <div className="cl-col-empty">
                        <CalendarDays size={20} />
                        <span>No classes scheduled on this day</span>
                      </div>
                    )}
                  </div>
                ) : (
                  weekDates.map((d, di) => {
                    const iso = weekIsos[di];
                    const isToday = iso === todayStr;
                    return (
                      <div key={iso} className="cl-day-col" data-today={isToday}>
                        {hours.map((h, i) => (
                          <i key={h} className="cl-grid-line" style={{ top: i * HOUR_ROW_HEIGHT }} />
                        ))}
                        {isToday && showNow && (
                          <div className="cl-red-now-line" style={{ top: nowTop }}>
                            <i className="cl-red-now-dot" />
                          </div>
                        )}
                        {layoutDayClasses(weekOcc[di]).map(({ cls, col, cols, span }) =>
                          renderEventBlock(cls, iso, col, cols, span)
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {!loading && classes.length === 0 && (
        <div className="cl-first">
          <span>No classes yet. Create your first class and start booking members.</span>
          {orgId && (
            <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> New class
            </button>
          )}
        </div>
      )}

      {/* Floating Add on Phone */}
      {orgId && (
        <button type="button" className="cl-fab" onClick={() => setCreateOpen(true)} aria-label="New class">
          <Plus size={22} strokeWidth={2.4} />
        </button>
      )}

      {createOpen && orgId && (
        <CreateClassSheet
          orgId={orgId}
          branchId={branchId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); loadData(); }}
        />
      )}

      {selectedClass && orgId && (
        <ClassDetailSheet
          cls={selectedClass}
          bookedFor={selectedBookedFor}
          orgId={orgId}
          onClose={() => setSelectedClass(null)}
          onUpdated={loadData}
        />
      )}
    </div>
  );
}

// NOTE: no backticks inside CSS
const CL_CSS = `
.ps-page.cl { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.cl { max-width: none; }
@media (min-width: 761px) {
  .ps-page.cl { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
}

/* Header */
.cl-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.cl-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cl-title-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #1a73e8, #4285f4 55%, #185abc); box-shadow: 0 8px 18px -8px rgba(26,115,232,0.6); flex-shrink: 0; }
.cl-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; color: var(--text-primary); }
.cl-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.cl-new { height: 42px; border-radius: 12px; margin-left: auto; }

/* Main Calendar Card */
.cl-card { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--surface, #fff); border: 1px solid var(--separator); border-radius: 18px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,0.05); position: relative; }
html.dark .cl-card, html[data-theme="dark"] .cl-card { background: var(--surface); border-color: var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.25); }

/* Google Calendar Toolbar */
.cl-toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--separator); flex-wrap: wrap; background: var(--surface, #fff); }
html.dark .cl-toolbar, html[data-theme="dark"] .cl-toolbar { background: var(--surface); border-color: var(--border); }
.cl-nav { display: flex; align-items: center; gap: 8px; }
.cl-today-btn { height: 36px; padding: 0 16px; border-radius: 18px; border: 1px solid var(--separator); background: var(--surface, #fff); color: var(--text-primary); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background 120ms ease; }
.cl-today-btn:hover { background: var(--fill); }
html.dark .cl-today-btn, html[data-theme="dark"] .cl-today-btn { background: var(--surface-2, rgba(255,255,255,0.06)); border-color: var(--border); color: var(--text-primary); }
html.dark .cl-today-btn:hover, html[data-theme="dark"] .cl-today-btn:hover { background: var(--fill); }

.cl-nav-chevrons { display: flex; align-items: center; gap: 2px; }
.cl-icon-arrow { width: 34px; height: 34px; border-radius: 50%; border: none; background: transparent; display: grid; place-items: center; cursor: pointer; color: var(--text-secondary); transition: background 120ms ease, color 120ms ease; }
.cl-icon-arrow:hover { background: var(--fill); color: var(--text-primary); }
html.dark .cl-icon-arrow, html[data-theme="dark"] .cl-icon-arrow { color: var(--text-secondary); }
html.dark .cl-icon-arrow:hover, html[data-theme="dark"] .cl-icon-arrow:hover { color: var(--text-primary); background: var(--fill); }

.cl-title-label { font-size: 19px; font-weight: 650; color: var(--text-primary); margin-left: 6px; white-space: nowrap; }

.cl-trainer-filter-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cl-trainer-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: 17px;
  border: 1px solid var(--separator);
  background: var(--surface, #fff);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 140ms ease;
}
.cl-trainer-filter-btn:hover {
  background: var(--fill);
  color: var(--text-primary);
  border-color: var(--border, #d1d1d6);
}
.cl-trainer-filter-btn--active {
  background: var(--text-primary);
  color: var(--surface, #fff);
  border-color: var(--text-primary);
}
.cl-trainer-filter-btn--active:hover {
  background: var(--text-primary);
  color: var(--surface, #fff);
  opacity: 0.92;
}
html.dark .cl-trainer-filter-btn, html[data-theme="dark"] .cl-trainer-filter-btn {
  background: var(--surface-2, rgba(255,255,255,0.06));
  border-color: var(--border);
  color: var(--text-secondary);
}
html.dark .cl-trainer-filter-btn:hover, html[data-theme="dark"] .cl-trainer-filter-btn:hover {
  background: var(--fill);
  color: var(--text-primary);
}
html.dark .cl-trainer-filter-btn--active, html[data-theme="dark"] .cl-trainer-filter-btn--active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.cl-trainer-filter-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-trainer-filter-icon {
  color: var(--text-tertiary);
}
.cl-trainer-filter-btn--active .cl-trainer-filter-icon {
  color: currentColor;
}
.cl-trainer-chevron {
  opacity: 0.65;
  transition: transform 140ms ease;
}
.cl-trainer-chevron--open {
  transform: rotate(180deg);
}
.cl-trainer-clear-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: var(--fill);
  color: var(--text-tertiary);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 120ms ease;
}
.cl-trainer-clear-btn:hover {
  background: var(--text-primary);
  color: var(--surface, #fff);
}
.cl-trainer-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 60;
  min-width: 210px;
  padding: 6px;
  border-radius: 14px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e5ea);
  box-shadow: 0 12px 32px -6px rgba(15, 23, 42, 0.2), 0 0 1px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
  animation: cl-fade-in 120ms ease;
}
html.dark .cl-trainer-menu, html[data-theme="dark"] .cl-trainer-menu {
  background: var(--surface-2, #1c1c1e);
  border-color: var(--border, #2c2c2e);
  box-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.5);
}
@keyframes cl-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.cl-trainer-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
  font-size: 11.5px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}
.cl-trainer-reset-link {
  border: none;
  background: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
}
.cl-trainer-reset-link:hover {
  text-decoration: underline;
}
.cl-trainer-divider {
  height: 1px;
  background: var(--separator, #e5e5ea);
  margin: 4px 0;
}
html.dark .cl-trainer-divider, html[data-theme="dark"] .cl-trainer-divider {
  background: var(--border, #2c2c2e);
}
.cl-trainer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.cl-trainer-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 120ms ease;
}
.cl-trainer-menu-item:hover {
  background: var(--fill, rgba(118, 118, 128, 0.08));
}
.cl-trainer-menu-item.active {
  font-weight: 650;
  background: rgba(10, 102, 214, 0.08);
  color: var(--accent, #0a66d6);
}
html.dark .cl-trainer-menu-item.active, html[data-theme="dark"] .cl-trainer-menu-item.active {
  background: rgba(10, 132, 255, 0.16);
  color: #58a6ff;
}
.cl-trainer-menu-all-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--fill, #eef0f4);
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.cl-trainer-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-trainer-item-count {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-weight: 600;
  margin-left: 4px;
}
.cl-trainer-check {
  margin-left: auto;
  color: var(--accent);
  flex-shrink: 0;
}

.cl-views { display: flex; padding: 3px; border-radius: 10px; background: var(--fill); border: 1px solid var(--separator); margin-left: auto; }
.cl-views button { height: 28px; padding: 0 12px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 120ms ease; }
.cl-views button[aria-selected="true"] { background: var(--surface, #fff); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
html.dark .cl-views, html[data-theme="dark"] .cl-views { background: var(--fill); border-color: var(--border); }
html.dark .cl-views button, html[data-theme="dark"] .cl-views button { color: var(--text-secondary); }
html.dark .cl-views button[aria-selected="true"], html[data-theme="dark"] .cl-views button[aria-selected="true"] { background: var(--surface-2, rgba(255,255,255,0.1)); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

/* Google Calendar Time Grid */
.cl-grid-container { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.cl-grid-header { display: grid; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--separator); background: var(--surface, #fff); z-index: 10; }
.cl-grid-header[data-view="day"] { grid-template-columns: 56px minmax(0, 1fr); }
html.dark .cl-grid-header, html[data-theme="dark"] .cl-grid-header { background: var(--surface); border-color: var(--border); }

.cl-time-spacer { display: flex; align-items: flex-end; justify-content: flex-end; padding: 0 8px 6px; border-right: 1px solid var(--separator); }
.cl-gmt-label { font-size: 10px; font-weight: 600; color: var(--text-tertiary); letter-spacing: 0.04em; }
html.dark .cl-time-spacer, html[data-theme="dark"] .cl-time-spacer { border-color: var(--border); }

.cl-grid-header-col { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 4px 8px; border-right: 1px solid var(--separator); cursor: pointer; transition: background 120ms ease; }
.cl-grid-header-col:hover { background: var(--fill); }
html.dark .cl-grid-header-col, html[data-theme="dark"] .cl-grid-header-col { border-color: var(--border); }

.cl-gday-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); line-height: 1; }
.cl-grid-header-col[data-today="true"] .cl-gday-label { color: #1a73e8; }
.cl-gdate-circle { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; font-weight: 600; color: var(--text-primary); margin: 3px 0 2px; }
.cl-gdate-circle.is-today { background: #1a73e8; color: #ffffff !important; font-weight: 700; box-shadow: 0 2px 6px rgba(26,115,232,0.4); }
.cl-gday-meta { font-size: 10.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

.cl-grid-scroll { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.cl-grid-body { display: grid; grid-template-columns: 56px repeat(7, minmax(0, 1fr)); position: relative; }
.cl-grid-body[data-view="day"] { grid-template-columns: 56px minmax(0, 1fr); }

.cl-times-axis { position: relative; border-right: 1px solid var(--separator); background: var(--surface, #fff); }
html.dark .cl-times-axis, html[data-theme="dark"] .cl-times-axis { background: var(--surface); border-color: var(--border); }

.cl-time-slot { position: relative; text-align: right; padding-right: 8px; }
.cl-time-slot span { position: relative; top: -7px; font-size: 11px; font-weight: 600; color: var(--text-tertiary); }
.cl-time-slot:first-child span { top: 2px; }

.cl-day-col { position: relative; border-right: 1px solid var(--separator); min-width: 0; }
html.dark .cl-day-col, html[data-theme="dark"] .cl-day-col { border-color: var(--border); }
.cl-day-col[data-today="true"] { background: rgba(26,115,232,0.025); }
html.dark .cl-day-col[data-today="true"], html[data-theme="dark"] .cl-day-col[data-today="true"] { background: rgba(26,115,232,0.07); }
.cl-grid-line { position: absolute; left: 0; right: 0; height: 1px; background: var(--separator); opacity: 0.6; pointer-events: none; }
html.dark .cl-grid-line, html[data-theme="dark"] .cl-grid-line { background: var(--border); opacity: 0.45; }

.cl-red-now-line { position: absolute; left: 0; right: 0; height: 2px; background: #ff453a; z-index: 6; pointer-events: none; }
.cl-red-now-dot { position: absolute; left: -6px; top: -5px; width: 12px; height: 12px; border-radius: 50%; background: #ff453a; box-shadow: 0 0 0 2px var(--surface, #fff); }
html.dark .cl-red-now-dot, html[data-theme="dark"] .cl-red-now-dot { box-shadow: 0 0 0 2px var(--surface); }

/* Color Themes for Blocks, Pills & Agenda */
.cl-theme-blue { --cl-fill: #e8f1ff; --cl-border: #cfe2ff; --cl-text: #0b4a99; --cl-sub: #1a56a5; --cl-acc: #1a73e8; }
.cl-theme-green { --cl-fill: #e6f4ea; --cl-border: #ceead6; --cl-text: #137333; --cl-sub: #1e7e34; --cl-acc: #1e8e3e; }
.cl-theme-amber { --cl-fill: #fef7e0; --cl-border: #feefc3; --cl-text: #965000; --cl-sub: #a85d00; --cl-acc: #f9ab00; }
.cl-theme-red { --cl-fill: #fce8e6; --cl-border: #fad2cf; --cl-text: #c5221f; --cl-sub: #d02e2b; --cl-acc: #d93025; }
.cl-theme-purple { --cl-fill: #f3e8fd; --cl-border: #e8d0fb; --cl-text: #7627bb; --cl-sub: #8232c9; --cl-acc: #9334e6; }
.cl-theme-teal { --cl-fill: #e4f7fb; --cl-border: #cbf0f8; --cl-text: #007b83; --cl-sub: #088b94; --cl-acc: #129eaf; }

html.dark .cl-theme-blue, html[data-theme="dark"] .cl-theme-blue {
  --cl-fill: rgba(26,115,232,0.18); --cl-border: rgba(26,115,232,0.38); --cl-text: #d2e3fc; --cl-sub: #a8c7fa; --cl-acc: #8ab4f8;
}
html.dark .cl-theme-green, html[data-theme="dark"] .cl-theme-green {
  --cl-fill: rgba(30,142,62,0.18); --cl-border: rgba(30,142,62,0.38); --cl-text: #ceead6; --cl-sub: #a8dab5; --cl-acc: #81c995;
}
html.dark .cl-theme-amber, html[data-theme="dark"] .cl-theme-amber {
  --cl-fill: rgba(249,171,0,0.18); --cl-border: rgba(249,171,0,0.38); --cl-text: #feefc3; --cl-sub: #fdd663; --cl-acc: #fdd663;
}
html.dark .cl-theme-red, html[data-theme="dark"] .cl-theme-red {
  --cl-fill: rgba(217,48,37,0.18); --cl-border: rgba(217,48,37,0.38); --cl-text: #fad2cf; --cl-sub: #f6aea9; --cl-acc: #f28b82;
}
html.dark .cl-theme-purple, html[data-theme="dark"] .cl-theme-purple {
  --cl-fill: rgba(147,52,230,0.18); --cl-border: rgba(147,52,230,0.38); --cl-text: #e8d0fb; --cl-sub: #d7aefb; --cl-acc: #c58af9;
}
html.dark .cl-theme-teal, html[data-theme="dark"] .cl-theme-teal {
  --cl-fill: rgba(18,158,175,0.18); --cl-border: rgba(18,158,175,0.38); --cl-text: #cbf0f8; --cl-sub: #9ae2ed; --cl-acc: #78d9ec;
}

/* Event Block */
.cl-block { position: absolute; z-index: 2; display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 4px 7px 4px 9px; border: 1px solid var(--cl-border); background: var(--cl-fill); color: var(--cl-text); border-radius: 7px; font: inherit; text-align: left; cursor: pointer; overflow: hidden; min-width: 0; transition: transform 120ms ease, box-shadow 120ms ease; }
.cl-block::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3.5px; background: var(--cl-acc); border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.cl-block:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -6px rgba(15,23,42,0.4); z-index: 8; }
.cl-block-name { font-size: 12.5px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--cl-text); }
.cl-block-sub { font-size: 11px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--cl-sub); }
.cl-block-foot { display: flex; align-items: center; gap: 6px; margin-top: auto; font-size: 11px; font-weight: 650; color: var(--cl-text); }
.cl-block-bar { flex: 1; height: 4px; border-radius: 2px; background: rgba(0,0,0,0.1); overflow: hidden; display: block; min-width: 16px; }
html.dark .cl-block-bar, html[data-theme="dark"] .cl-block-bar { background: rgba(255,255,255,0.15); }
.cl-block-bar i { display: block; height: 100%; border-radius: 2px; background: var(--cl-acc); }
.cl-full { color: #ff453a; font-weight: 750; }
.cl-col-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-tertiary); font-size: 13.5px; }

/* Google Calendar Month View */
.cl-month-view { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; background: var(--surface, #fff); }
html.dark .cl-month-view, html[data-theme="dark"] .cl-month-view { background: var(--surface); }

.cl-month-header { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--separator); background: var(--surface, #fff); position: sticky; top: 0; z-index: 5; }
html.dark .cl-month-header, html[data-theme="dark"] .cl-month-header { background: var(--surface); border-color: var(--border); }
.cl-month-header-cell { padding: 8px 4px; text-align: center; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); border-right: 1px solid var(--separator); }
.cl-month-header-cell:last-child { border-right: none; }
html.dark .cl-month-header-cell, html[data-theme="dark"] .cl-month-header-cell { border-color: var(--border); color: var(--text-secondary); }

.cl-month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(105px, 1fr); flex: 1; }
.cl-month-cell { border-right: 1px solid var(--separator); border-bottom: 1px solid var(--separator); padding: 4px 6px; display: flex; flex-direction: column; cursor: pointer; transition: background 120ms ease; overflow: hidden; background: var(--surface, #fff); }
.cl-month-cell:nth-child(7n) { border-right: none; }
.cl-month-cell:hover { background: var(--fill); }
.cl-month-cell.other-month { background: rgba(0,0,0,0.02); opacity: 0.6; }
.cl-month-cell.today { background: rgba(26,115,232,0.035); }
html.dark .cl-month-cell, html[data-theme="dark"] .cl-month-cell { background: var(--surface); border-color: var(--border); }
html.dark .cl-month-cell.other-month, html[data-theme="dark"] .cl-month-cell.other-month { background: rgba(255,255,255,0.02); opacity: 0.45; }
html.dark .cl-month-cell.today, html[data-theme="dark"] .cl-month-cell.today { background: rgba(26,115,232,0.08); }
html.dark .cl-month-cell:hover, html[data-theme="dark"] .cl-month-cell:hover { background: var(--fill); }

.cl-month-cell-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.cl-month-date { font-size: 12px; font-weight: 600; color: var(--text-primary); width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; }
.cl-month-date.today-badge { background: #1a73e8; color: #ffffff !important; font-weight: 700; }
.cl-month-count { font-size: 10px; color: var(--text-tertiary); font-weight: 550; }

.cl-month-cell-events { display: flex; flex-direction: column; gap: 3px; flex: 1; min-height: 0; }
.cl-month-pill { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; border-left: 3px solid var(--cl-acc); background: var(--cl-fill); color: var(--cl-text); border-top: 1px solid var(--cl-border); border-right: 1px solid var(--cl-border); border-bottom: 1px solid var(--cl-border); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; transition: filter 120ms ease; }
.cl-month-pill:hover { filter: brightness(0.95); }
.cl-month-pill-time { opacity: 0.85; font-size: 10px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.cl-month-pill-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.cl-month-pill-full { color: #ff453a; font-size: 9.5px; font-weight: 750; flex-shrink: 0; }
.cl-month-more { font-size: 11px; font-weight: 650; color: var(--accent); padding: 1px 4px; border-radius: 3px; cursor: pointer; margin-top: auto; }
.cl-month-more:hover { text-decoration: underline; }

/* Member Picker & Chips */
.cl-selected-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; max-height: 76px; overflow-y: auto; padding: 2px 0; }
.cl-member-chip { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px 0 10px; border-radius: 13px; background: var(--fill); border: 1px solid var(--separator); font-size: 12px; font-weight: 550; color: var(--text-primary); }
html.dark .cl-member-chip, html[data-theme="dark"] .cl-member-chip { background: var(--surface-2, rgba(255,255,255,0.06)); border-color: var(--border); color: var(--text-primary); }
.cl-member-chip button { display: grid; place-items: center; border: none; background: none; color: var(--text-tertiary); cursor: pointer; padding: 0; margin-left: 2px; }
.cl-member-chip button:hover { color: var(--red); }

.cl-member-picker-box { max-height: 160px; overflow-y: auto; border: 1px solid var(--separator); border-radius: 10px; background: var(--surface, #fff); }
html.dark .cl-member-picker-box, html[data-theme="dark"] .cl-member-picker-box { background: var(--surface); border-color: var(--border); }

.cl-member-row { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-bottom: 1px solid var(--separator); cursor: pointer; user-select: none; transition: background 100ms ease; color: var(--text-primary); }
.cl-member-row:last-child { border-bottom: none; }
.cl-member-row:hover { background: var(--fill); }
.cl-member-row.selected { background: rgba(26,115,232,0.08); }
.cl-member-row.disabled { opacity: 0.45; cursor: not-allowed; }
.cl-member-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: #1a73e8; cursor: pointer; }
html.dark .cl-member-row, html[data-theme="dark"] .cl-member-row { border-color: var(--border); color: var(--text-primary); }
html.dark .cl-member-row:hover, html[data-theme="dark"] .cl-member-row:hover { background: var(--fill); }
html.dark .cl-member-row.selected, html[data-theme="dark"] .cl-member-row.selected { background: rgba(26,115,232,0.18); }

/* Schedule / Agenda View */
.cl-agenda { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 16px 20px; }
.cl-ag-day h3 { position: sticky; top: 0; z-index: 2; display: flex; align-items: baseline; gap: 8px; margin: 0; padding: 12px 4px 8px; background: var(--surface, #fff); font-size: 14px; font-weight: 700; color: var(--text-primary); border-bottom: 1px solid var(--separator); }
html.dark .cl-ag-day h3, html[data-theme="dark"] .cl-ag-day h3 { background: var(--surface); border-color: var(--border); }
.cl-ag-day h3 small { font-size: 12.5px; color: var(--text-tertiary); font-weight: 550; }
.cl-ag-day h3 em { font-style: normal; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9px; background: rgba(26,115,232,0.12); color: #1a73e8; }
html.dark .cl-ag-day h3 em, html[data-theme="dark"] .cl-ag-day h3 em { background: rgba(26,115,232,0.22); color: #8ab4f8; }

.cl-ag-row { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr) 140px 18px; align-items: center; gap: 12px; width: 100%; padding: 10px 12px 10px 16px; margin-top: 8px; border: 1px solid var(--separator); border-radius: 12px; background: var(--surface, #fff); font: inherit; text-align: left; cursor: pointer; overflow: hidden; transition: background 120ms ease, border-color 120ms ease; color: var(--text-primary); }
.cl-ag-row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--cl-acc); }
.cl-ag-row:hover { background: var(--fill); border-color: var(--border); }
html.dark .cl-ag-row, html[data-theme="dark"] .cl-ag-row { background: var(--surface); border-color: var(--border); color: var(--text-primary); }
html.dark .cl-ag-row:hover, html[data-theme="dark"] .cl-ag-row:hover { background: var(--fill); }

.cl-ag-time { display: flex; flex-direction: column; } .cl-ag-time b { font-size: 14px; color: var(--text-primary); } .cl-ag-time small { font-size: 12px; color: var(--text-tertiary); }
.cl-ag-main { display: flex; flex-direction: column; min-width: 0; }
.cl-ag-main strong { font-size: 14.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-ag-main small { font-size: 12.5px; color: var(--text-tertiary); }
.cl-ag-cap { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; color: var(--text-primary); }
.cl-ag-cap > span { min-width: 34px; }
.cl-ag-chev { color: var(--text-tertiary); }

.cl-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 48px 16px; color: var(--text-tertiary); font-size: 13.5px; }
.cl-empty strong { color: var(--text-primary); font-size: 15px; }
.cl-loading { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.cl-first { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; padding: 10px 14px; border-radius: 12px; background: var(--amber-dim); color: var(--amber); font-size: 13.5px; }
.cl-fab { display: none; }

.booking-row:hover { background: var(--fill); }

/* Sheet dark mode polish */
html.dark .ps-sheet, html[data-theme="dark"] .ps-sheet { background: var(--surface); border-color: var(--border); color: var(--text-primary); }
html.dark .ps-sheet-header, html[data-theme="dark"] .ps-sheet-header { background: var(--surface); border-color: var(--border); }
html.dark .ps-sheet-title, html[data-theme="dark"] .ps-sheet-title { color: var(--text-primary); }
html.dark .ps-sheet-footer, html[data-theme="dark"] .ps-sheet-footer { background: var(--surface); border-color: var(--border); }
html.dark .ps-field .ps-input, html[data-theme="dark"] .ps-field .ps-input { background: var(--surface); border-color: var(--border); color: var(--text-primary); }
html.dark .ps-field .ps-input:focus, html[data-theme="dark"] .ps-field .ps-input:focus { border-color: var(--accent); }
html.dark .ps-label, html[data-theme="dark"] .ps-label { color: var(--text-secondary); }

@media (max-width: 760px) {
  .ps-page.cl { padding: 10px 10px calc(84px + env(safe-area-inset-bottom, 0px)) !important; }
  .cl-head { gap: 10px; }
  .cl-title h1 { font-size: 22px; }
  .cl-new { display: none; }
  .cl-card { border-radius: 16px; }
  .cl-toolbar { padding: 10px; gap: 8px; }
  .cl-title-label { font-size: 16px; }
  .cl-views { margin-left: auto; }
  .cl-views button[data-view="week"] { display: none; }
  .cl-trainer-filter-wrap { order: 3; }
  .cl-grid-container { height: calc(100dvh - 250px); min-height: 380px; flex: none; }
  .cl-month-view { height: calc(100dvh - 250px); min-height: 380px; flex: none; }
  .cl-agenda { max-height: none; overflow: visible; padding: 4px 8px 12px; }
  .cl-ag-row { grid-template-columns: 62px minmax(0, 1fr) 18px; gap: 10px; }
  .cl-ag-cap { grid-column: 2; grid-row: 2; }
  .cl-ag-chev { grid-column: 3; grid-row: 1 / span 2; }
  .cl-fab { position: fixed; right: 16px; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px) + 16px); z-index: 40; width: 54px; height: 54px; border-radius: 50%; border: none; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #1a73e8, #4285f4); box-shadow: 0 12px 24px -8px rgba(26,115,232,0.7); cursor: pointer; }
}
@media (max-width: 360px) {
  .cl-title h1 { font-size: 20px; }
}
@media (min-width: 1920px) {
  .ps-page.cl { max-width: 1720px !important; margin: 0 auto !important; }
}
`;
