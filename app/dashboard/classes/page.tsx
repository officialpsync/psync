"use client";

import { useCallback, useEffect, useState } from "react";
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

  const weekStart = getWeekStart(new Date());
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const isCurrentWeek = weekOffset === 0;
  const weekLabel = isCurrentWeek ? "This week"
    : weekOffset === 1 ? "Next week"
    : weekOffset === -1 ? "Last week"
    : `${formatDate(weekStart.toISOString().slice(0, 10))} – ${formatDate(weekEnd.toISOString().slice(0, 10))}`;

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
    if (!roleData) return;
    setOrgId(roleData.org_id);

    // Fetch first branch for this org
    const { data: branchData } = await supabase
      .from("branches")
      .select("id")
      .eq("org_id", roleData.org_id)
      .limit(1)
      .single();
    if (branchData) setBranchId(branchData.id);

    // Load all active classes
    const { data: c } = await supabase
      .from("classes")
      .select("id, org_id, name, description, trainer_name, color, schedule_day, start_time, duration_mins, capacity, is_active, recurrence_unit, recurrence_interval, recurrence_start_date, recurrence_end_date")
      .eq("org_id", roleData.org_id)
      .eq("is_active", true)
      .order("start_time");

    setClasses((c as GymClass[]) || []);

    // Load bookings for each day of this week
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const { data: b } = await supabase
      .from("class_bookings")
      .select("id, class_id, member_id, booked_for, status, session_deducted")
      .eq("org_id", roleData.org_id)
      .in("booked_for", weekDates)
      .eq("status", "booked");

    setBookings((b as ClassBooking[]) || []);

    const { data: ex } = await supabase
      .from("class_exceptions")
      .select("id, class_id, exception_date")
      .eq("org_id", roleData.org_id);

    setExceptions(new Set(((ex as ClassException[]) || []).map((e) => `${e.class_id}:${e.exception_date}`)));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  const bookingCount = (classId: string, dayIso: string) =>
    bookings.filter((b) => b.class_id === classId && b.booked_for === dayIso).length;

  const totalBooked = bookings.length;
  const totalSpots = classes.reduce((s, c) => s + c.capacity, 0);

  const uniqueTrainers = new Set(classes.map((c) => c.trainer_name).filter(Boolean)).size;

  return (
    <div className="ps-page db" style={{ paddingBottom: 40 }}>
      <DesignStyles />

      {/* Header */}
      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Classes</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{classes.length}</strong> active class{classes.length === 1 ? "" : "es"} this week</>}
          </p>
        </div>
        <div className="db-header-actions">
          {orgId && (
            <button type="button" className="ps-btn ps-btn--primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} strokeWidth={2.4} /> <span>New class</span>
            </button>
          )}
        </div>
      </header>

      {/* Summary bar — compact, sits above the calendar which is the real content */}
      <div className="db-card db-statbar">
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><CalendarDays size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Active classes</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : classes.length}</div>
          </div>
        </div>
        <div className="db-stat db-tone-green">
          <span className="db-chip"><CheckCircle2 size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Booked this week</div>
            <div className="db-stat-value">{loading ? <Skeleton w={50} h={20} /> : <>{totalBooked}<span className="db-stat-note">of {totalSpots} spots</span></>}</div>
          </div>
        </div>
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><Users size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Fill rate</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : totalSpots > 0 ? `${Math.round((totalBooked / totalSpots) * 100)}%` : "—"}</div>
          </div>
        </div>
        <div className="db-stat db-tone-amber">
          <span className="db-chip"><Dumbbell size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Trainers</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : uniqueTrainers}</div>
          </div>
        </div>
      </div>

      {/* Week nav */}
      <div className="db-week-nav">
        <button type="button" className="db-icon-btn db-week-arrow" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
          <ChevronLeft size={18} />
        </button>
        <span className="db-week-label">{weekLabel}</span>
        <button type="button" className="db-icon-btn db-week-arrow" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
          <ChevronRight size={18} />
        </button>
        {weekOffset !== 0 && (
          <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm" onClick={() => setWeekOffset(0)}>
            Today
          </button>
        )}
      </div>

      {/* Calendar */}
      <div className="db-card db-calendar">
        {/* Day header row */}
        <div className="db-cal-head" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
          <div />
          {DAY_SHORT.map((day, di) => {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + di);
            const isToday = dayDate.toDateString() === new Date().toDateString();
            const dayIso2 = dayDate.toISOString().slice(0, 10);
            const dayClasses = classes.filter((c) => occursOn(c, dayIso2, exceptions));
            return (
              <div key={day} className={`db-cal-daycol${isToday ? " db-cal-daycol--today" : ""}`}>
                <div className="db-cal-dayname">{day}</div>
                <div className="db-cal-daynum">{isToday ? <span className="db-cal-today-badge">{dayDate.getDate()}</span> : dayDate.getDate()}</div>
                {dayClasses.length > 0 && (
                  <div className="db-cal-daycount">{dayClasses.length} class{dayClasses.length > 1 ? "es" : ""}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        {loading ? (
          <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={60} r={12} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)", overflowY: "auto", maxHeight: "70vh" }}>
            {/* Time labels */}
            <div>
              {HOURS.map((h) => (
                <div key={h} className="db-cal-timelabel" style={{ height: HOUR_HEIGHT }}>
                  {h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAY_SHORT.map((_, di) => {
              const dayDate = new Date(weekStart);
              dayDate.setDate(dayDate.getDate() + di);
              const dayIso = dayDate.toISOString().slice(0, 10);
              const isToday = dayDate.toDateString() === new Date().toDateString();
              const dayClasses = classes.filter((c) => occursOn(c, dayIso, exceptions));

              return (
                <div key={di} className={`db-cal-col${isToday ? " db-cal-col--today" : ""}`} style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  {/* Hour lines */}
                  {HOURS.map((h) => (
                    <div key={h} className="db-cal-hourline" style={{ top: (h - GRID_START) * HOUR_HEIGHT }} />
                  ))}

                  {/* Class blocks — Google Calendar style side-by-side layout */}
                  {layoutDayClasses(dayClasses).map(({ cls, col, cols, span }) => {
                    const timeMins = parseTime(cls.start_time);
                    const top = ((timeMins / 60) - GRID_START) * HOUR_HEIGHT;
                    const height = Math.max((cls.duration_mins / 60) * HOUR_HEIGHT - 4, 28);
                    const booked = bookingCount(cls.id, dayIso);
                    const full = booked >= cls.capacity;
                    const pct = cls.capacity > 0 ? booked / cls.capacity : 0;
                    const colorStyle = COLOR_STYLES[cls.color] ?? COLOR_STYLES.blue;

                    // Each column gets an equal slice of the day column width.
                    // GAP = 2px between adjacent cards; 3px outer margin on each side.
                    const colW = `calc((100% - 6px) / ${cols})`;
                    const leftPx = `calc(3px + ${col} * (100% - 6px) / ${cols})`;
                    const widthPx = `calc(${span} * (100% - 6px) / ${cols} - 2px)`;

                    // For compact cards (< 40px), collapse subtitle into one line
                    const compact = height < 42;

                    return (
                      <button key={cls.id} type="button"
                        onClick={() => { setSelectedClass(cls); setSelectedBookedFor(dayIso); }}
                        style={{
                          position: "absolute",
                          top: top + 2,
                          left: leftPx,
                          width: widthPx,
                          height,
                          background: colorStyle.bg,
                          border: `1px solid ${colorStyle.border}`,
                          borderLeft: `3px solid ${colorStyle.text}`,
                          padding: compact ? "3px 5px" : "4px 7px",
                          minWidth: 0,
                        }}
                        className="db-class-block"
                      >
                        {compact ? (
                          // Single-line compact layout: name · time · count
                          <div style={{ fontSize: 11, fontWeight: 600, color: colorStyle.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cls.name}
                            <span style={{ fontWeight: 400, opacity: 0.75 }}>
                              {" · "}{fmt12(cls.start_time)}{" · "}{full ? "Full" : `${booked}/${cls.capacity}`}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, color: colorStyle.text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {cls.name}
                            </div>
                            <div style={{ fontSize: 11, color: colorStyle.text, opacity: 0.8, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {fmt12(cls.start_time)}{cls.trainer_name ? ` · ${cls.trainer_name}` : ""}
                            </div>
                            {height > 56 && (
                              <div style={{ fontSize: 11, color: full ? "var(--red)" : colorStyle.text, opacity: 0.9, marginTop: 2, fontWeight: full ? 600 : 400 }}>
                                {full ? "Full" : `${booked}/${cls.capacity}`}
                              </div>
                            )}
                          </>
                        )}
                        {/* Capacity bar — only when tall enough */}
                        {height > 36 && (
                          <div style={{ position: "absolute", bottom: 3, left: 7, right: 7, height: 2, background: "rgba(0,0,0,0.08)", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ width: `${pct * 100}%`, height: "100%", background: full ? "var(--red-fill)" : colorStyle.text, borderRadius: 1 }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!loading && classes.length === 0 && (
        <div className="db-card db-pad" style={{ marginTop: 16 }}>
          <div className="db-empty" style={{ padding: "32px 16px" }}>
            <span className="db-empty-icon"><CalendarDays size={18} /></span>
            <div className="db-empty-title">No classes yet</div>
            <div className="db-empty-text">Create your first class and start booking members.</div>
            {orgId && (
              <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={() => setCreateOpen(true)}>
                <Plus size={16} /> New class
              </button>
            )}
          </div>
        </div>
      )}

      {createOpen && orgId && (
        <CreateClassSheet orgId={orgId} branchId={branchId} onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); loadData(); }} />
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
