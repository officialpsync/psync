"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { ChevronLeft, ChevronRight, Loader2, Plus, Users, X, Trash2, CalendarDays, CheckCircle2, Dumbbell } from "lucide-react";
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
// "week" unit: must land on the class's weekday, every N weeks from the start date.
// "day" unit: ignores weekday entirely, every N days from the start date.
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

const HOURS = Array.from({ length: 15 }, (_, i) => i + 5); // 5am–7pm
const HOUR_HEIGHT = 64; // px per hour
const GRID_START = 5;

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

// Local-date ISO string — avoids the UTC shift that toISOString() introduces
// (which can silently land on the wrong calendar day for IST and other +offset zones).
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return toLocalIso(new Date());
}

// The next date (today included) that falls on the given weekday name.
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

type Member = { id: string; full_name: string };

type ClassException = { id: string; class_id: string; exception_date: string };

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
  return h * 60 + (m || 0);
}

// Google-Calendar style layout: place overlapping classes in side-by-side columns
type PlacedClass = {
  cls: GymClass;
  col: number;
  cols: number;
  span: number;
};

function layoutDayClasses(dayClasses: GymClass[]): PlacedClass[] {
  // Sort by start time then by duration descending so wider events prefer earlier columns
  const sorted = [...dayClasses].sort((a, b) => {
    const diff = parseTime(a.start_time) - parseTime(b.start_time);
    return diff !== 0 ? diff : b.duration_mins - a.duration_mins;
  });

  const placed: PlacedClass[] = sorted.map((cls) => ({ cls, col: 0, cols: 1, span: 1 }));
  const colEnds: number[] = []; // tracks when each column becomes free (end minutes)

  // Assign columns greedily
  for (const p of placed) {
    const start = parseTime(p.cls.start_time);
    const end = start + p.cls.duration_mins;
    let c = colEnds.findIndex((e) => e <= start);
    if (c === -1) { c = colEnds.length; colEnds.push(end); }
    else { colEnds[c] = end; }
    p.col = c;
  }

  const totalCols = colEnds.length;

  // Compute total cols and span for each event
  for (const p of placed) {
    p.cols = totalCols;
    const start = parseTime(p.cls.start_time);
    const end = start + p.cls.duration_mins;
    let span = 1;
    // stretch right while no sibling occupies that column during this event's time
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

function fmt12(t: string): string {
  const mins = parseTime(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
}

// ---- Create Class Sheet ----
function CreateClassSheet({ orgId, branchId, onClose, onCreated }: {
  orgId: string; branchId: string | null; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trainerName, setTrainerName] = useState("");
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

  // Keep Starts in sync with the selected Day — unless the gym owner has
  // deliberately picked their own date, in which case we leave it alone.
  useEffect(() => {
    if (!startDateTouched) setStartDate(nextDateForWeekday(scheduleDay));
  }, [scheduleDay, startDateTouched]);

  function resolveRecurrence(): { unit: "day" | "week"; interval: number } {
    if (repeatPreset === "weekly") return { unit: "week", interval: 1 };
    if (repeatPreset === "biweekly") return { unit: "week", interval: 2 };
    if (repeatPreset === "daily") return { unit: "day", interval: 1 };
    if (repeatPreset === "none") return { unit: "week", interval: 1 }; // end date = start date handles "once"
    return { unit: customUnit, interval: Math.max(1, parseInt(customInterval) || 1) };
  }

  async function handleSave() {
    if (!name.trim()) { setError("Class name is required"); return; }
    setSaving(true); setError("");

    // Always fetch branch fresh at save time to avoid race with load
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

    const { error: err } = await supabase.from("classes").insert({
      org_id: orgId,
      branch_id: resolvedBranchId,
      name: name.trim(),
      description: description.trim() || null,
      trainer_name: trainerName.trim() || null,
      color,
      schedule_day: scheduleDay,
      start_time: startTime,
      duration_mins: parseInt(duration) || 60,
      capacity: parseInt(capacity) || 20,
      is_active: true,
      recurrence_unit: unit,
      recurrence_interval: interval,
      recurrence_start_date: startDate,
      recurrence_end_date: resolvedEndDate,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    onCreated();
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "480px" } as React.CSSProperties}
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

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-trainer">Trainer</label>
              <input id="cls-trainer" className="ps-input" value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)} placeholder="Trainer name" />
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
                  ? "First class on this date. Change the Day above to re-sync."
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

            <div className="ps-field">
              <label className="ps-label" htmlFor="cls-cap">Capacity</label>
              <input id="cls-cap" className="ps-input" type="number" min={1} max={500}
                value={capacity} onChange={(e) => setCapacity(e.target.value)} />
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
            {saving ? "Saving…" : "Create class"}
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
  const [bookingMemberId, setBookingMemberId] = useState("");
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
        supabase.from("members").select("id, full_name")
          .eq("org_id", orgId).eq("status", "active").order("full_name").limit(200),
      ]);
      setBookings((b as unknown as ClassBooking[]) || []);
      setMembers((m as Member[]) || []);
      setLoading(false);
    }
    load();
  }, [cls.id, bookedFor, orgId]);

  const bookedIds = new Set(bookings.map((b) => b.member_id));
  const available = members.filter((m) => !bookedIds.has(m.id));
  const spotsLeft = cls.capacity - bookings.length;

  async function bookMember() {
    if (!bookingMemberId) return;
    setSaving(true);
    const { error } = await supabase.from("class_bookings").insert({
      org_id: orgId, class_id: cls.id, member_id: bookingMemberId,
      booked_for: bookedFor, status: "booked", session_deducted: false,
    });
    if (error) { show("Couldn't book. " + error.message, "error"); }
    else {
      const name = members.find((m) => m.id === bookingMemberId)?.full_name ?? "Member";
      show(`${name.split(" ")[0]} booked`);
      setBookingMemberId("");
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

  // "This event" — cancel just this one occurrence; the series continues otherwise.
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

  // "This and following" — end the series the day before this occurrence; past dates stay intact.
  async function deleteThisAndFollowing() {
    const dayBefore = new Date(bookedFor + "T00:00:00");
    dayBefore.setDate(dayBefore.getDate() - 1);
    const newEnd = dayBefore.toISOString().slice(0, 10);

    if (newEnd < cls.recurrence_start_date) {
      // This is the very first occurrence — "from here on" is the whole series.
      return deleteAllOccurrences();
    }

    setDeleting(true);
    const { error } = await supabase
      .from("classes")
      .update({ recurrence_end_date: newEnd })
      .eq("id", cls.id);
    if (error) { show("Couldn't update the series: " + error.message, "error"); setDeleting(false); return; }
    await supabase.from("class_bookings").update({ status: "cancelled" }).eq("class_id", cls.id).gte("booked_for", bookedFor);
    onUpdated();
    onClose();
  }

  // "All events" — deactivate the whole series, same as the old single-option delete.
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

  // Entry point for the Delete button — single occurrence classes just confirm and go,
  // recurring ones open the Google-Calendar-style choice first.
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
      <div className="ps-sheet" style={{ "--sheet-w": "440px" } as React.CSSProperties}
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
          {spotsLeft > 0 && (
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--separator)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>Book a member</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="ps-input" value={bookingMemberId}
                  onChange={(e) => setBookingMemberId(e.target.value)} style={{ flex: 1, height: 38 }}>
                  <option value="">Select member…</option>
                  {available.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
                <button type="button" className="ps-btn ps-btn--primary ps-btn--sm"
                  onClick={bookMember} disabled={!bookingMemberId || saving} style={{ flexShrink: 0 }}>
                  {saving ? <Loader2 size={14} className="ps-spin" /> : <Plus size={14} />}
                  Book
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: "0 8px" }}>
            {loading ? (
              <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
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
        <style>{`.booking-row:hover { background: var(--fill); }`}</style>
      </div>
    </div>
  );
}

// ---- Main page ----

// ---- Page ----

type View = "week" | "day" | "agenda";

// Strong, readable colours for class blocks (light fill, solid accent, dark text).
const BLOCK: Record<ClassColor, { fill: string; accent: string; text: string; soft: string }> = {
  blue:   { fill: "#e8f1ff", accent: "#0a84ff", text: "#0b4a99", soft: "#cfe2ff" },
  green:  { fill: "#e7f7ed", accent: "#28b04f", text: "#17672f", soft: "#c6edd3" },
  amber:  { fill: "#fff3e0", accent: "#ff9f0a", text: "#8a4b00", soft: "#ffe0b0" },
  red:    { fill: "#ffecef", accent: "#ff375f", text: "#9e0a26", soft: "#ffcbd5" },
  purple: { fill: "#f4ecfc", accent: "#af52de", text: "#6b2591", soft: "#e4cdf6" },
  teal:   { fill: "#e4f6f8", accent: "#30b0c7", text: "#0d6676", soft: "#c0e9ef" },
};

function hourLabel(h: number) { return h === 0 || h === 24 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`; }

export default function ClassesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [bookings, setBookings] = useState<ClassBooking[]>([]);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);
  const [selectedBookedFor, setSelectedBookedFor] = useState<string>("");
  const [view, setView] = useState<View>("week");
  const [dayIdx, setDayIdx] = useState(() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; });
  const [trainer, setTrainer] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [gridH, setGridH] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Phones start on the day view; the 7-column week is too narrow there.
  useEffect(() => { if (window.matchMedia("(max-width: 760px)").matches) setView("day"); }, []);
  // Current-time line
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(t); }, []);
  // Hour height is computed from the space available, so the whole day fits without scrolling.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridH(el.clientHeight));
    ro.observe(el);
    setGridH(el.clientHeight);
    return () => ro.disconnect();
  }, [view, loading]);

  const weekStart = getWeekStart(new Date());
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const weekIsos = weekDates.map(toLocalIso);
  const todayStr = todayIso();

  const rangeLabel = `${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const weekLabel = weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : rangeLabel;

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
      // Local dates (not toISOString) so IST doesn't shift bookings onto the previous day
      supabase.from("class_bookings").select("id, class_id, member_id, booked_for, status, session_deducted")
        .eq("org_id", roleData.org_id).in("booked_for", weekIsos).eq("status", "booked"),
      supabase.from("class_exceptions").select("id, class_id, exception_date").eq("org_id", roleData.org_id),
    ]);
    setClasses((c as GymClass[]) || []);
    setBookings((b as ClassBooking[]) || []);
    setExceptions(new Set(((ex as ClassException[]) || []).map((e) => `${e.class_id}:${e.exception_date}`)));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  const bookingCount = (classId: string, iso: string) => bookings.filter((b) => b.class_id === classId && b.booked_for === iso).length;

  const trainers = useMemo(() => [...new Set(classes.map((c) => c.trainer_name).filter(Boolean) as string[])].sort(), [classes]);
  const shown = trainer ? classes.filter((c) => c.trainer_name === trainer) : classes;

  // Occurrences this week (respecting recurrence and cancellations)
  const occ = useMemo(() => weekIsos.map((iso) => shown.filter((c) => occursOn(c, iso, exceptions))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, exceptions, weekIsos.join()]);
  const sessions = occ.reduce((s, d) => s + d.length, 0);
  const spots = occ.reduce((s, d) => s + d.reduce((x, c) => x + c.capacity, 0), 0);
  const booked = occ.reduce((s, d, i) => s + d.reduce((x, c) => x + bookingCount(c.id, weekIsos[i]), 0), 0);
  const fill = spots ? Math.round((booked / spots) * 100) : 0;
  const fullSessions = occ.reduce((s, d, i) => s + d.filter((c) => bookingCount(c.id, weekIsos[i]) >= c.capacity).length, 0);

  // Visible hours: fit around this week's classes, never less than 6am–9pm
  const allTimes = occ.flat();
  const startH = Math.min(6, ...allTimes.map((c) => Math.floor(parseTime(c.start_time) / 60)));
  const endH = Math.max(21, ...allTimes.map((c) => Math.ceil((parseTime(c.start_time) + c.duration_mins) / 60)));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const hourH = Math.max(26, gridH > 0 ? Math.floor(gridH / hours.length) : 44);

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMins / 60) - startH) * hourH;
  const showNow = nowMins / 60 >= startH && nowMins / 60 <= endH;

  const visibleDays = view === "day" ? [dayIdx] : [0, 1, 2, 3, 4, 5, 6];

  function open(cls: GymClass, iso: string) { setSelectedClass(cls); setSelectedBookedFor(iso); }

  function renderBlock(cls: GymClass, iso: string, col: number, cols: number, span: number) {
    const top = ((parseTime(cls.start_time) / 60) - startH) * hourH;
    const height = Math.max((cls.duration_mins / 60) * hourH - 3, 22);
    const n = bookingCount(cls.id, iso);
    const full = n >= cls.capacity;
    const pct = cls.capacity > 0 ? Math.min(1, n / cls.capacity) : 0;
    const c = BLOCK[cls.color] ?? BLOCK.blue;
    const tight = height < 44 || cols > 2;
    return (
      <button key={cls.id} type="button" className="cl-block" onClick={() => open(cls, iso)}
        title={`${cls.name} · ${fmt12(cls.start_time)} · ${cls.duration_mins} min${cls.trainer_name ? ` · ${cls.trainer_name}` : ""} · ${n}/${cls.capacity} booked`}
        style={{
          top: top + 1, height,
          left: `calc(2px + ${col} * (100% - 4px) / ${cols})`,
          width: `calc(${span} * (100% - 4px) / ${cols} - 2px)`,
          background: c.fill, borderColor: c.soft, color: c.text, ["--acc" as string]: c.accent,
        } as React.CSSProperties}>
        <span className="cl-block-name">{cls.name}</span>
        {!tight && <span className="cl-block-sub">{fmt12(cls.start_time)}{cls.trainer_name ? ` · ${cls.trainer_name}` : ""}</span>}
        {height >= 34 && (
          <span className="cl-block-foot">
            {full ? <b className="cl-full">Full</b> : <span>{n}/{cls.capacity}</span>}
            <i className="cl-block-bar"><i style={{ width: `${pct * 100}%`, background: full ? "#ff3b30" : c.accent }} /></i>
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="ps-page db cl">
      <DesignStyles />
      <style>{CL_CSS}</style>

      {/* Header */}
      <header className="cl-head">
        <div className="cl-title">
          <span className="cl-title-icon"><CalendarDays size={20} /></span>
          <div>
            <h1>Classes</h1>
            <p>{loading ? "\u00a0" : `${classes.length} active class${classes.length === 1 ? "" : "es"} · ${rangeLabel}`}</p>
          </div>
        </div>
        <div className="cl-kpis">
          <div className="cl-kpi cl-kpi--blue"><CalendarDays size={15} /><div><small>Sessions</small><b>{loading ? "–" : sessions}</b></div></div>
          <div className="cl-kpi cl-kpi--green"><CheckCircle2 size={15} /><div><small>Booked</small><b>{loading ? "–" : <>{booked}<em>/{spots}</em></>}</b></div></div>
          <div className="cl-kpi cl-kpi--purple">
            <span className="cl-mini-ring" style={{ "--p": fill } as React.CSSProperties} />
            <div><small>Fill rate</small><b>{loading ? "–" : `${fill}%`}</b></div>
          </div>
          <div className="cl-kpi cl-kpi--red"><Users size={15} /><div><small>Full</small><b>{loading ? "–" : fullSessions}</b></div></div>
          <div className="cl-kpi cl-kpi--amber"><Dumbbell size={15} /><div><small>Trainers</small><b>{loading ? "–" : trainers.length}</b></div></div>
        </div>
        {orgId && (
          <button type="button" className="ps-btn ps-btn--primary cl-new" onClick={() => setCreateOpen(true)}>
            <Plus size={16} strokeWidth={2.4} /> <span>New class</span>
          </button>
        )}
      </header>

      {/* Calendar card */}
      <div className="cl-card">
        <div className="cl-toolbar">
          <div className="cl-nav">
            <button type="button" className="cl-arrow" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week"><ChevronLeft size={17} /></button>
            <button type="button" className="cl-arrow" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week"><ChevronRight size={17} /></button>
            <strong className="cl-week">{weekLabel}</strong>
            {weekOffset !== 0 && <button type="button" className="cl-today" onClick={() => { setWeekOffset(0); const d = new Date().getDay(); setDayIdx(d === 0 ? 6 : d - 1); }}>Today</button>}
          </div>

          {trainers.length > 0 && (
            <div className="cl-trainers" role="group" aria-label="Filter by trainer">
              <button type="button" aria-pressed={!trainer} onClick={() => setTrainer(null)}>All trainers</button>
              {trainers.map((t) => (
                <button key={t} type="button" aria-pressed={trainer === t} onClick={() => setTrainer(trainer === t ? null : t)}>
                  <Avatar name={t} size={18} />{t}
                </button>
              ))}
            </div>
          )}

          <div className="cl-views" role="tablist" aria-label="Calendar view">
            {(["week", "day", "agenda"] as View[]).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} data-view={v} onClick={() => setView(v)}>{v === "week" ? "Week" : v === "day" ? "Day" : "List"}</button>
            ))}
          </div>
        </div>

        {/* Day header / day picker */}
        <div className="cl-days" data-view={view}>
          <div className="cl-gutter" />
          {weekDates.map((d, i) => {
            const iso = weekIsos[i];
            const isToday = iso === todayStr;
            const list = occ[i];
            const dayBooked = list.reduce((s, c) => s + bookingCount(c.id, iso), 0);
            const daySpots = list.reduce((s, c) => s + c.capacity, 0);
            return (
              <button key={iso} type="button" className="cl-day" data-today={isToday} data-on={view !== "week" && i === dayIdx}
                onClick={() => { setDayIdx(i); if (view === "week") setView("day"); }}>
                <small>{DAY_SHORT[i]}</small>
                <b>{d.getDate()}</b>
                <span className="cl-day-meta">
                  {list.length ? <>{list.length} class{list.length > 1 ? "es" : ""}{daySpots ? ` · ${Math.round((dayBooked / daySpots) * 100)}%` : ""}</> : "—"}
                </span>
                <span className="cl-day-dots" aria-hidden>{list.slice(0, 5).map((c) => <i key={c.id} style={{ background: (BLOCK[c.color] ?? BLOCK.blue).accent }} />)}</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="cl-loading">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={56} r={12} />)}</div>
        ) : view === "agenda" ? (
          <div className="cl-agenda">
            {weekDates.map((d, i) => {
              const iso = weekIsos[i];
              const list = [...occ[i]].sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
              if (!list.length) return null;
              return (
                <section key={iso} className="cl-ag-day" data-today={iso === todayStr}>
                  <h3><span>{d.toLocaleDateString("en-IN", { weekday: "long" })}</span><small>{d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small>{iso === todayStr && <em>Today</em>}</h3>
                  {list.map((c) => {
                    const n = bookingCount(c.id, iso), full = n >= c.capacity, col = BLOCK[c.color] ?? BLOCK.blue;
                    return (
                      <button key={c.id} type="button" className="cl-ag-row" onClick={() => open(c, iso)} style={{ ["--acc" as string]: col.accent } as React.CSSProperties}>
                        <span className="cl-ag-time"><b>{fmt12(c.start_time)}</b><small>{c.duration_mins} min</small></span>
                        <span className="cl-ag-main"><strong>{c.name}</strong><small>{c.trainer_name ? `with ${c.trainer_name}` : "No trainer set"}</small></span>
                        <span className="cl-ag-cap">
                          <span>{full ? <b className="cl-full">Full</b> : `${n}/${c.capacity}`}</span>
                          <i className="cl-block-bar"><i style={{ width: `${Math.min(100, (n / Math.max(1, c.capacity)) * 100)}%`, background: full ? "#ff3b30" : col.accent }} /></i>
                        </span>
                        <ChevronRight size={16} className="cl-ag-chev" />
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {sessions === 0 && <div className="cl-empty"><CalendarDays size={20} /><strong>No classes this week</strong><span>{trainer ? "Try another trainer." : "Create a class to get started."}</span></div>}
          </div>
        ) : (
          <div className="cl-grid-wrap" ref={gridRef}>
            <div className="cl-grid" data-view={view} style={{ height: hours.length * hourH }}>
              <div className="cl-times">
                {hours.map((h) => <span key={h} style={{ height: hourH }}>{hourLabel(h)}</span>)}
              </div>
              {visibleDays.map((di) => {
                const iso = weekIsos[di];
                const isToday = iso === todayStr;
                return (
                  <div key={iso} className="cl-col" data-today={isToday}>
                    {hours.map((h, i) => <i key={h} className="cl-line" style={{ top: i * hourH }} />)}
                    {isToday && showNow && <span className="cl-now" style={{ top: nowTop }}><i /></span>}
                    {layoutDayClasses(occ[di]).map(({ cls, col, cols, span }) => renderBlock(cls, iso, col, cols, span))}
                    {view === "day" && occ[di].length === 0 && (
                      <div className="cl-col-empty"><CalendarDays size={18} /><span>No classes on {DAY_NAMES[di]}</span></div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!loading && classes.length === 0 && (
        <div className="cl-first">
          <span>No classes yet. Create your first class and start booking members.</span>
          {orgId && <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> New class</button>}
        </div>
      )}

      {/* Phone: floating add */}
      {orgId && <button type="button" className="cl-fab" onClick={() => setCreateOpen(true)} aria-label="New class"><Plus size={22} strokeWidth={2.4} /></button>}

      {createOpen && orgId && (
        <CreateClassSheet orgId={orgId} branchId={branchId} onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); loadData(); }} />
      )}
      {selectedClass && orgId && (
        <ClassDetailSheet cls={selectedClass} bookedFor={selectedBookedFor} orgId={orgId}
          onClose={() => setSelectedClass(null)} onUpdated={loadData} />
      )}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const CL_CSS = `
.ps-page.cl { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.cl { max-width: none; }
@media (min-width: 761px) {
  .ps-page.cl { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
}

/* Header */
.cl-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.cl-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cl-title-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #ff9f0a, #ff375f 55%, #af52de); box-shadow: 0 8px 18px -8px rgba(255,55,95,0.6); flex-shrink: 0; }
.cl-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.cl-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.cl-kpis { display: flex; gap: 8px; flex: 1; justify-content: flex-end; flex-wrap: wrap; }
.cl-kpi { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 12px; border-radius: 12px; background: #fff; border: 1px solid var(--separator); }
.cl-kpi > svg { flex-shrink: 0; }
.cl-kpi div { display: flex; flex-direction: column; line-height: 1.15; }
.cl-kpi small { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
.cl-kpi b { font-size: 16px; font-weight: 740; font-variant-numeric: tabular-nums; }
.cl-kpi em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--text-tertiary); }
.cl-kpi--blue > svg { color: #0a84ff; } .cl-kpi--green > svg { color: #28b04f; } .cl-kpi--red > svg { color: #ff375f; } .cl-kpi--amber > svg { color: #ff9f0a; }
.cl-mini-ring { --p: 0; width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle, #fff 52%, transparent 54%), conic-gradient(#af52de calc(var(--p) * 1%), #ece3f7 0); flex-shrink: 0; }
.cl-new { height: 42px; border-radius: 12px; }

/* Card */
.cl-card { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fff; border: 1px solid var(--separator); border-radius: 18px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,0.04); position: relative; }
.cl-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a84ff, #5e5ce6 30%, #af52de 55%, #ff375f 78%, #ff9f0a); z-index: 3; }
.cl-toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 12px 10px; border-bottom: 1px solid var(--separator); flex-wrap: wrap; }
.cl-nav { display: flex; align-items: center; gap: 6px; }
.cl-arrow { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--separator); background: #fff; display: grid; place-items: center; cursor: pointer; color: var(--text-secondary); }
.cl-arrow:hover { background: #f5f6f9; color: var(--text-primary); }
.cl-week { font-size: 15px; font-weight: 700; margin: 0 4px; white-space: nowrap; }
.cl-today { height: 28px; padding: 0 10px; border-radius: 8px; border: none; background: #e8f1ff; color: #0a66d6; font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
.cl-trainers { display: flex; gap: 6px; overflow-x: auto; flex: 1; min-width: 0; scrollbar-width: none; }
.cl-trainers::-webkit-scrollbar { display: none; }
.cl-trainers button { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px 0 6px; border-radius: 15px; border: 1px solid var(--separator); background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.cl-trainers button:first-child { padding-left: 11px; }
.cl-trainers button[aria-pressed="true"] { background: #1c1c1e; color: #fff; border-color: #1c1c1e; }
.cl-views { display: flex; padding: 3px; border-radius: 10px; background: #f2f3f6; margin-left: auto; }
.cl-views button { height: 28px; padding: 0 12px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.cl-views button[aria-selected="true"] { background: #fff; color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }

/* Day header */
.cl-days { display: grid; grid-template-columns: 52px repeat(7, minmax(0, 1fr)); border-bottom: 1px solid var(--separator); background: #fbfbfd; }
.cl-days[data-view="day"], .cl-days[data-view="agenda"] { padding: 8px 8px 8px 0; gap: 6px; }
.cl-days[data-view="agenda"] .cl-gutter { width: 8px; }
.cl-days[data-view="agenda"] { grid-template-columns: 0 repeat(7, minmax(0, 1fr)); }
.cl-day { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 4px 7px; border: none; border-left: 1px solid #eef0f3; background: none; font: inherit; cursor: pointer; color: var(--text-secondary); min-width: 0; }
.cl-days[data-view="day"] .cl-day, .cl-days[data-view="agenda"] .cl-day { border: 1px solid transparent; border-radius: 12px; }
.cl-day:hover { background: #f2f4f8; }
.cl-day small { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.cl-day b { font-size: 19px; font-weight: 720; color: var(--text-primary); width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; }
.cl-day[data-today="true"] small { color: #0a66d6; }
.cl-day[data-today="true"] b { background: linear-gradient(135deg, #0a84ff, #5e5ce6); color: #fff; box-shadow: 0 4px 10px -4px rgba(10,132,255,0.7); }
.cl-day-meta { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cl-day-dots { display: flex; gap: 3px; height: 6px; margin-top: 2px; }
.cl-day-dots i { width: 6px; height: 6px; border-radius: 50%; }
.cl-day[data-on="true"] { background: #fff; border-color: #0a84ff !important; box-shadow: 0 0 0 3px rgba(10,132,255,0.12); }

/* Grid */
.cl-grid-wrap { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.cl-grid { display: grid; grid-template-columns: 52px repeat(7, minmax(0, 1fr)); position: relative; }
.cl-grid[data-view="day"] { grid-template-columns: 52px minmax(0, 1fr); }
.cl-times span { display: block; position: relative; font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-align: right; padding-right: 8px; transform: translateY(-7px); }
.cl-times span:first-child { transform: none; padding-top: 2px; }
.cl-col { position: relative; border-left: 1px solid #eef0f3; min-width: 0; }
.cl-col[data-today="true"] { background: linear-gradient(180deg, rgba(10,132,255,0.05), rgba(10,132,255,0.025)); }
.cl-line { position: absolute; left: 0; right: 0; height: 1px; background: #f0f1f4; }
.cl-now { position: absolute; left: -1px; right: 0; height: 2px; background: #ff3b30; z-index: 4; pointer-events: none; }
.cl-now i { position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,0.2); }
.cl-col-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); font-size: 13.5px; }

.cl-block { position: absolute; z-index: 2; display: flex; flex-direction: column; align-items: stretch; gap: 1px; padding: 4px 7px 4px 9px; border: 1px solid; border-radius: 9px; font: inherit; text-align: left; cursor: pointer; overflow: hidden; min-width: 0; transition: transform 120ms ease, box-shadow 120ms ease; }
.cl-block::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--acc); }
.cl-block:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -10px rgba(15,23,42,0.45); z-index: 5; }
.cl-block-name { font-size: 12.5px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-block-sub { font-size: 11px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-block-foot { display: flex; align-items: center; gap: 6px; margin-top: auto; font-size: 11px; font-weight: 650; }
.cl-block-bar { flex: 1; height: 4px; border-radius: 3px; background: rgba(0,0,0,0.08); overflow: hidden; display: block; min-width: 16px; }
.cl-block-bar i { display: block; height: 100%; border-radius: 3px; }
.cl-full { color: #d70015; font-weight: 750; }

/* Agenda */
.cl-agenda { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px 16px; }
.cl-ag-day h3 { position: sticky; top: 0; z-index: 2; display: flex; align-items: baseline; gap: 8px; margin: 0; padding: 12px 4px 8px; background: #fff; font-size: 14px; font-weight: 700; }
.cl-ag-day h3 small { font-size: 12.5px; color: var(--text-tertiary); font-weight: 550; }
.cl-ag-day h3 em { font-style: normal; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9px; background: #e8f1ff; color: #0a66d6; }
.cl-ag-row { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr) 140px 18px; align-items: center; gap: 12px; width: 100%; padding: 10px 12px 10px 16px; margin-bottom: 6px; border: 1px solid var(--separator); border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; overflow: hidden; }
.cl-ag-row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--acc); }
.cl-ag-row:hover { background: #fafbfd; border-color: #d5d9e0; }
.cl-ag-time { display: flex; flex-direction: column; } .cl-ag-time b { font-size: 14px; } .cl-ag-time small { font-size: 12px; color: var(--text-tertiary); }
.cl-ag-main { display: flex; flex-direction: column; min-width: 0; }
.cl-ag-main strong { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-ag-main small { font-size: 12.5px; color: var(--text-tertiary); }
.cl-ag-cap { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 650; }
.cl-ag-cap > span { min-width: 34px; }
.cl-ag-chev { color: var(--text-tertiary); }
.cl-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 48px 16px; color: var(--text-tertiary); font-size: 13.5px; }
.cl-empty strong { color: var(--text-primary); font-size: 15px; }
.cl-loading { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.cl-first { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; padding: 10px 14px; border-radius: 12px; background: #fff6e8; color: #8a4500; font-size: 13.5px; }
.cl-fab { display: none; }

@media (max-width: 1200px) { .cl-kpi:nth-child(4) { display: none; } }
@media (max-width: 1000px) {
  .cl-kpis { order: 3; flex-basis: 100%; justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
  .cl-kpi:nth-child(4) { display: flex; }
  .cl-kpi { flex: 0 0 auto; }
  .cl-new { margin-left: auto; }
}
@media (max-width: 760px) {
  .ps-page.cl { padding: 10px 10px calc(84px + env(safe-area-inset-bottom, 0px)) !important; }
  .cl-head { gap: 10px; }
  .cl-title h1 { font-size: 22px; }
  .cl-new { display: none; }
  .cl-kpi { height: 42px; padding: 0 10px; }
  .cl-card { border-radius: 16px; }
  .cl-toolbar { padding: 10px; gap: 8px; }
  .cl-views { margin-left: auto; }
  .cl-views button[data-view="week"] { display: none; }
  .cl-trainers { order: 3; flex-basis: 100%; }
  .cl-days { grid-template-columns: 0 repeat(7, minmax(0, 1fr)) !important; padding: 6px 6px 6px 0; gap: 2px; }
  .cl-days .cl-day { border: 1px solid transparent; border-radius: 12px; padding: 6px 0; }
  .cl-day b { width: 30px; height: 30px; font-size: 16px; }
  .cl-day-meta { display: none; }
  .cl-grid-wrap { height: calc(100dvh - 330px); min-height: 380px; flex: none; }
  .cl-agenda { max-height: none; overflow: visible; padding: 4px 8px 12px; }
  .cl-ag-row { grid-template-columns: 62px minmax(0, 1fr) 18px; gap: 10px; }
  .cl-ag-cap { grid-column: 2; grid-row: 2; }
  .cl-ag-chev { grid-column: 3; grid-row: 1 / span 2; }
  .cl-fab { position: fixed; right: 16px; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px) + 16px); z-index: 40; width: 54px; height: 54px; border-radius: 50%; border: none; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a84ff, #5e5ce6); box-shadow: 0 12px 24px -8px rgba(10,132,255,0.7); cursor: pointer; }
}
`;
