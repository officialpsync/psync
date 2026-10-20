"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { BookOpen, Calendar, Camera, ChevronRight, Copy, Dumbbell, Loader2, LogIn, LogOut, Pencil, Plus, RefreshCw, Salad, Search, Wallet, UserCheck, X } from "lucide-react";
import {
  Avatar, BackLink, cols, formatDate, formatINR, formatTime, Segmented, Skeleton, useToast,
} from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";
import { GOAL_BADGE, GOAL_LABELS as WORKOUT_GOAL_LABELS, DIFFICULTY_LABELS } from "@/lib/workout/types";

type Member = {
  id: string; org_id: string; full_name: string; phone: string | null; email: string | null;
  sex: string | null; date_of_birth: string | null; height_cm: number | null;
  weight_kg: number | null; primary_goal: string | null; medical_conditions: string[] | null;
  diet_type: string | null; job_activity: string | null; exercise_days_per_week: number | null;
  gut_symptoms: string[] | null;
  food_intolerances: string[] | string | null; allergies: string[] | string | null;
  spice_tolerance: string | null; notes: string | null; created_at: string;
  photo_url: string | null;
  branches: { name: string } | null;
};

type Membership = {
  id: string; status: string; start_date: string; end_date: string | null;
  membership_plans: { name: string; duration_days: number | null } | null;
};

type Payment = { id: string; total_paise: number; paid_at: string; method: string | null; notes: string | null; status: string };
type AttendanceLog = { id: string; check_in_at: string; check_out_at: string | null; method: string | null };
type DietPlan = { id: string; version_number: number; status: string; valid_from: string; start_date?: string; target_kcal: number; plan_mode: string; plan_days: number; created_at: string };
type AssignedProgram = {
  id: string; program_id: string; valid_from: string; valid_until: string | null; status: string; notes: string | null; created_at: string;
  workout_programs: { id: string; name: string; goal: string; difficulty: string; days_per_week: number; duration_weeks: number } | null;
};
type ProgramOption = { id: string; name: string; goal: string; difficulty: string; days_per_week: number; duration_weeks: number };
type RenewalPlan = { id: string; name: string; duration_days: number | null; price_paise: number; plan_type: string };
type Method = "cash" | "upi" | "card" | "online";
type MemberClassBooking = {
  id: string; booked_for: string; status: string; created_at: string;
  classes: { id: string; name: string; trainer_name: string | null; schedule_day: string; start_time: string; duration_mins: number; color: string } | null;
};
type ClassOption = { id: string; name: string; trainer_name: string | null; schedule_day: string; start_time: string; duration_mins: number; color: string };
type Tab = "overview" | "diet" | "workout" | "classes" | "payments" | "visits";

const supabase = createClient();

const GOAL_LABELS: Record<string, string> = { fat_loss: "Fat loss", muscle_gain: "Muscle gain", weight_gain: "Weight gain", maintenance: "Maintenance", healthy_eating: "Healthy eating" };
const DIET_LABELS: Record<string, string> = { non_vegetarian: "Non-vegetarian", eggetarian: "Eggetarian", vegetarian: "Vegetarian", vegan: "Vegan", jain: "Jain" };
const JOB_LABELS: Record<string, string> = { desk: "Desk job", on_feet: "On their feet", physical: "Physical work" };
const MODE_LABELS: Record<string, string> = { recipe: "Standard", protein_heavy: "Protein heavy", ingredient: "Simple foods" };
const METHOD_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", online: "Online" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asList = (v: string[] | string | null | undefined) =>
  !v ? [] : Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean);

function ageFrom(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

function duration(inTime: string, outTime: string | null) {
  if (!outTime) return null;
  const mins = Math.round((new Date(outTime).getTime() - new Date(inTime).getTime()) / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="ps-kv">
      <span className="ps-kv-label">{label}</span>
      <span className={`ps-kv-value${empty ? " ps-kv-value--muted" : ""}`}>{empty ? "Not added" : value}</span>
    </div>
  );
}

function Tags({ items, tone, none }: { items: string[]; tone?: "red" | "amber"; none: string }) {
  if (items.length === 0) return <>{none}</>;
  return (
    <span className="ps-tags">
      {items.map((t) => <span key={t} className={`ps-tag${tone ? ` ps-tag--${tone}` : ""}`}>{cap(t)}</span>)}
    </span>
  );
}

// ---- Renewal Sheet ----
function RenewalSheet({ member, currentPlan, onClose, onRenewed }: {
  member: Member;
  currentPlan: RenewalPlan | null;
  onClose: () => void;
  onRenewed: () => void;
}) {
  const [plans, setPlans] = useState<RenewalPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(currentPlan?.id ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("cash");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("membership_plans")
        .select("id, name, duration_days, price_paise, plan_type")
        .eq("org_id", member.org_id)
        .eq("is_active", true)
        .order("name");
      setPlans((data as RenewalPlan[]) || []);
      setLoading(false);
    }
    load();
  }, [member.org_id]);

  const selected = plans.find((p) => p.id === selectedPlanId);

  async function handleRenew() {
    if (!selected) return;
    setSaving(true);
    try {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + (selected.duration_days || 30));
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // Expire current active membership if any
      await supabase
        .from("memberships")
        .update({ status: "expired" })
        .eq("member_id", member.id)
        .eq("status", "active");

      // Insert new membership
      const { data: membership } = await supabase
        .from("memberships")
        .insert({
          org_id: member.org_id,
          member_id: member.id,
          plan_id: selected.id,
          start_date: iso(start),
          end_date: iso(end),
          status: "active",
        })
        .select()
        .single();

      // Record payment
      await supabase.from("payments").insert({
        org_id: member.org_id,
        member_id: member.id,
        membership_id: membership?.id ?? null,
        amount_paise: selected.price_paise,
        total_paise: selected.price_paise,
        method,
        status: "paid",
        notes: `${selected.name} renewal`,
      });

      onRenewed();
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Renew membership"
      >
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Renew membership</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                Pick a plan and record payment
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton w={160} h={13} /><Skeleton w={100} h={11} />
                  </div>
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-title">No active plans</div>
              <div className="ps-empty-text">Create a membership plan first.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 12, width: "100%", textAlign: "left",
                    border: selectedPlanId === p.id ? "2px solid var(--accent)" : "2px solid transparent",
                    background: selectedPlanId === p.id ? "var(--accent-dim)" : "var(--fill)",
                    cursor: "pointer", transition: "border-color 150ms, background 150ms", gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{p.name}</div>
                    <div className="ps-cell-sub">
                      {p.duration_days ? `${p.duration_days} days` : "Session-based"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(p.price_paise)}
                    </span>
                    {selectedPlanId === p.id && (
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {plans.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div className="ps-field">
                <label className="ps-label" htmlFor="renew-start">
                  <Calendar size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                  Starts on
                </label>
                <input
                  id="renew-start"
                  type="date"
                  className="ps-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ height: 40, colorScheme: "light", color: "var(--text-primary)" }}
                />
              </div>
              <div className="ps-field">
                <span className="ps-label">Paid by</span>
                <Segmented<Method>
                  block
                  label="Payment method"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "upi", label: "UPI" },
                    { value: "card", label: "Card" },
                    { value: "online", label: "Online" },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        {plans.length > 0 && (
          <div className="ps-sheet-footer">
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={handleRenew}
              disabled={!selectedPlanId || saving}
            >
              {saving && <Loader2 size={15} className="ps-spin" />}
              {saving ? "Renewing…" : selected ? `Renew — ${formatINR(selected.price_paise)}` : "Renew"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Assign Program Sheet ----
function AssignProgramSheet({ memberId, orgId, onClose, onAssigned }: {
  memberId: string; orgId: string; onClose: () => void; onAssigned: () => void;
}) {
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("workout_programs")
        .select("id, name, goal, difficulty, days_per_week, duration_weeks")
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("name");
      setPrograms((data as ProgramOption[]) || []);
      setLoading(false);
    }
    load();
  }, [orgId]);

  async function handleAssign() {
    if (!selected) return;
    setSaving(true);
    try {
      await supabase.from("member_workout_programs").update({ status: "cancelled" }).eq("member_id", memberId).eq("status", "active");
      const { error } = await supabase.from("member_workout_programs").insert({
        org_id: orgId, member_id: memberId, program_id: selected, valid_from: startDate, status: "active",
      });
      if (error) throw error;
      onAssigned();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const prog = programs.find((p) => p.id === selected);

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "460px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Assign workout">
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Assign workout</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Pick a program from your library</div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton w={160} h={13} /><Skeleton w={100} h={11} />
                  </div>
                </div>
              ))}
            </div>
          ) : programs.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-icon"><Dumbbell size={20} /></div>
              <div className="ps-empty-title">No programs in your library</div>
              <div className="ps-empty-text">Create a workout program first.</div>
              <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary" onClick={onClose}><Plus size={15} /> Create program</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {programs.map((p) => (
                <button key={p.id} type="button" onClick={() => setSelected(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: selected === p.id ? "2px solid var(--accent)" : "2px solid transparent", background: selected === p.id ? "var(--accent-dim)" : "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  <div className="ps-tile ps-tile--blue" style={{ borderRadius: 10, flexShrink: 0, width: 36, height: 36 }}><Dumbbell size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{p.name}</div>
                    <div className="ps-cell-sub">
                      <span className={`ps-badge ${GOAL_BADGE[p.goal as keyof typeof GOAL_BADGE] ?? ""}`} style={{ height: 18, fontSize: 11 }}>
                        {WORKOUT_GOAL_LABELS[p.goal as keyof typeof WORKOUT_GOAL_LABELS] ?? p.goal}
                      </span>
                      <span style={{ marginLeft: 6 }}>{DIFFICULTY_LABELS[p.difficulty as keyof typeof DIFFICULTY_LABELS] ?? p.difficulty} &middot; {p.days_per_week}d/wk</span>
                    </div>
                  </div>
                  {selected === p.id && (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {programs.length > 0 && (
            <div className="ps-field" style={{ marginTop: 16, paddingBottom: 4 }}>
              <label className="ps-label" htmlFor="assign-start">
                <Calendar size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Start date
              </label>
              <input id="assign-start" type="date" className="ps-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ height: 40, maxWidth: 200 }} />
            </div>
          )}
        </div>
        {programs.length > 0 && (
          <div className="ps-sheet-footer">
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleAssign} disabled={!selected || saving}>
              {saving && <Loader2 size={15} className="ps-spin" />}
              {saving ? "Assigning…" : prog ? `Assign "${prog.name}"` : "Assign program"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Book Class Sheet ----
function BookClassSheet({ memberId, orgId, onClose, onBooked }: {
  memberId: string; orgId: string; onClose: () => void; onBooked: () => void;
}) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [bookedFor, setBookedFor] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("classes")
        .select("id, name, trainer_name, schedule_day, start_time, duration_mins, color")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("name");
      setClasses((data as ClassOption[]) || []);
      setLoading(false);
    }
    load();
  }, [orgId]);

  async function handleBook() {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("class_bookings").insert({
        org_id: orgId,
        member_id: memberId,
        class_id: selected,
        booked_for: bookedFor,
        status: "booked",
      });
      if (error) throw error;
      onBooked();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const fmt12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h < 12 ? "am" : "pm";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
  };

  const cls = classes.find((c) => c.id === selected);

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "460px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Book a class">
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Book a class</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Pick a class and date</div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton w={160} h={13} /><Skeleton w={100} h={11} />
                  </div>
                </div>
              ))}
            </div>
          ) : classes.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-icon"><BookOpen size={20} /></div>
              <div className="ps-empty-title">No active classes</div>
              <div className="ps-empty-text">Create a class first from the Classes page.</div>
              <Link href="/dashboard/classes" className="ps-btn ps-btn--primary" onClick={onClose}><Plus size={15} /> Go to classes</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {classes.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelected(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: selected === c.id ? "2px solid var(--accent)" : "2px solid transparent", background: selected === c.id ? "var(--accent-dim)" : "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  <div
                    style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: c.color || "var(--accent)", opacity: 0.85, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <BookOpen size={16} style={{ color: "#fff" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{c.name}</div>
                    <div className="ps-cell-sub">
                      {c.schedule_day.slice(0, 3)} · {fmt12(c.start_time)}
                      {c.duration_mins ? ` · ${c.duration_mins} min` : ""}
                      {c.trainer_name ? ` · ${c.trainer_name}` : ""}
                    </div>
                  </div>
                  {selected === c.id && (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {classes.length > 0 && (
            <div className="ps-field" style={{ marginTop: 16, paddingBottom: 4 }}>
              <label className="ps-label" htmlFor="book-date">
                <Calendar size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Date
              </label>
              <input id="book-date" type="date" className="ps-input" value={bookedFor} onChange={(e) => setBookedFor(e.target.value)} style={{ height: 40, maxWidth: 200 }} />
            </div>
          )}
        </div>
        {classes.length > 0 && (
          <div className="ps-sheet-footer">
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleBook} disabled={!selected || saving}>
              {saving && <Loader2 size={15} className="ps-spin" />}
              {saving ? "Booking…" : cls ? `Book "${cls.name}"` : "Book class"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Copy Diet Plan Sheet ----
type CopyMemberOption = { id: string; full_name: string };

function CopyPlanSheet({ sourcePlanId, sourceMemberId, orgId, onClose, onCopied }: {
  sourcePlanId: string; sourceMemberId: string; orgId: string; onClose: () => void; onCopied: (targetName: string) => void;
}) {
  const [members, setMembers] = useState<CopyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CopyMemberOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("members")
        .select("id, full_name")
        .eq("org_id", orgId)
        .eq("status", "active")
        .neq("id", sourceMemberId)
        .order("full_name");
      setMembers((data as CopyMemberOption[]) || []);
      setLoading(false);
    }
    load();
  }, [orgId, sourceMemberId]);

  const q = query.trim().toLowerCase();
  const filtered = members.filter((m) => !q || m.full_name.toLowerCase().includes(q));

  async function handleCopy() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const { data: source, error: fetchErr } = await supabase
        .from("member_diet_plans")
        .select("plan_mode, plan_days, start_date, target_kcal, target_protein_g, target_carbs_g, target_fat_g, plan_json, coach_notes")
        .eq("id", sourcePlanId)
        .single();

      if (fetchErr || !source) { setError("Couldn't load the source plan. Try again."); return; }

      // Deactivate target member's current active plan, if any
      await supabase
        .from("member_diet_plans")
        .update({ status: "superseded" })
        .eq("member_id", selected.id)
        .eq("status", "active");

      const { error: insertErr } = await supabase.from("member_diet_plans").insert({
        org_id: orgId,
        member_id: selected.id,
        plan_mode: source.plan_mode,
        plan_days: source.plan_days,
        start_date: new Date().toISOString().slice(0, 10),
        target_kcal: source.target_kcal,
        target_protein_g: source.target_protein_g,
        target_carbs_g: source.target_carbs_g,
        target_fat_g: source.target_fat_g,
        plan_json: source.plan_json,
        coach_notes: source.coach_notes,
        status: "active",
        version_number: 1,
      });

      if (insertErr) { setError(insertErr.message); return; }
      onCopied(selected.full_name);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Copy diet plan"
      >
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Copy plan to another member</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                This becomes their active plan. Their current plan, if any, is kept as an older version.
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ps-input-wrap" style={{ marginTop: 12 }}>
            <span className="ps-input-icon"><Search size={16} /></span>
            <input
              className="ps-input ps-input--icon"
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <Skeleton w={160} h={13} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-title">No members found</div>
              <div className="ps-empty-text">
                {members.length === 0 ? "No other active members in your gym yet." : "Try a different name."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
                    border: selected?.id === m.id ? "2px solid var(--accent)" : "2px solid transparent",
                    background: selected?.id === m.id ? "var(--accent-dim)" : "none",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <Avatar name={m.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{m.full_name}</div>
                  </div>
                  {selected?.id === m.id && (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {error && <div className="ps-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleCopy} disabled={!selected || saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Copying…" : selected ? `Copy to ${selected.full_name.split(" ")[0]}` : "Copy plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Copy Workout Program Sheet ----
function CopyWorkoutSheet({ sourceProgramId, sourceMemberId, orgId, onClose, onCopied }: {
  sourceProgramId: string; sourceMemberId: string; orgId: string; onClose: () => void; onCopied: (targetName: string) => void;
}) {
  const [members, setMembers] = useState<CopyMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CopyMemberOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("members")
        .select("id, full_name")
        .eq("org_id", orgId)
        .eq("status", "active")
        .neq("id", sourceMemberId)
        .order("full_name");
      setMembers((data as CopyMemberOption[]) || []);
      setLoading(false);
    }
    load();
  }, [orgId, sourceMemberId]);

  const q = query.trim().toLowerCase();
  const filtered = members.filter((m) => !q || m.full_name.toLowerCase().includes(q));

  async function handleCopy() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      // Cancel target member's current active program if any
      await supabase
        .from("member_workout_programs")
        .update({ status: "cancelled" })
        .eq("member_id", selected.id)
        .eq("status", "active");

      const { error: insertErr } = await supabase.from("member_workout_programs").insert({
        org_id: orgId,
        member_id: selected.id,
        program_id: sourceProgramId,
        valid_from: new Date().toISOString().slice(0, 10),
        status: "active",
      });

      if (insertErr) { setError(insertErr.message); return; }
      onCopied(selected.full_name);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Copy workout program"
      >
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Copy program to another member</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                This becomes their active program. Their current program, if any, is cancelled.
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ps-input-wrap" style={{ marginTop: 12 }}>
            <span className="ps-input-icon"><Search size={16} /></span>
            <input
              className="ps-input ps-input--icon"
              placeholder="Search members…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <Skeleton w={160} h={13} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-title">No members found</div>
              <div className="ps-empty-text">
                {members.length === 0 ? "No other active members in your gym yet." : "Try a different name."}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
                    border: selected?.id === m.id ? "2px solid var(--accent)" : "2px solid transparent",
                    background: selected?.id === m.id ? "var(--accent-dim)" : "none",
                    cursor: "pointer", textAlign: "left", width: "100%",
                  }}
                >
                  <Avatar name={m.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{m.full_name}</div>
                  </div>
                  {selected?.id === m.id && (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {error && <div className="ps-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleCopy} disabled={!selected || saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Copying…" : selected ? `Copy to ${selected.full_name.split(" ")[0]}` : "Copy program"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemberProfilePage() {
  const { id } = useParams() as { id: string };
  const [member, setMember] = useState<Member | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [dietPlans, setDietPlans] = useState<DietPlan[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [renewSheetOpen, setRenewSheetOpen] = useState(false);
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [bookClassSheetOpen, setBookClassSheetOpen] = useState(false);
  const [copySheetPlanId, setCopySheetPlanId] = useState<string | null>(null);
  const [copyWorkoutProgramId, setCopyWorkoutProgramId] = useState<string | null>(null);
  const [assignedPrograms, setAssignedPrograms] = useState<AssignedProgram[]>([]);
  const [classBookings, setClassBookings] = useState<MemberClassBooking[]>([]);
  const { toast, show } = useToast();
  const [photoUploading, setPhotoUploading] = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!member || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) { show("Photo must be under 2 MB", "error"); return; }
    setPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `member-photos/${member.org_id}/${member.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("org-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { show("Upload failed: " + upErr.message, "error"); return; }
      const { data: { publicUrl } } = supabase.storage.from("org-assets").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("members")
        .update({ photo_url: publicUrl })
        .eq("id", member.id);
      if (dbErr) { show("Couldn't save photo", "error"); return; }
      setMember((prev) => prev ? { ...prev, photo_url: publicUrl } : prev);
      show("Photo updated");
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  }

  async function handlePhotoRemove() {
    if (!member) return;
    setPhotoUploading(true);
    await supabase.from("members").update({ photo_url: null }).eq("id", member.id);
    setMember((prev) => prev ? { ...prev, photo_url: null } : prev);
    setPhotoUploading(false);
    show("Photo removed");
  }

  const loadAttendance = useCallback(async () => {
    const { data } = await supabase.from("attendance_logs").select("*").eq("member_id", id).order("check_in_at", { ascending: false }).limit(30);
    setAttendance((data as AttendanceLog[]) || []);
  }, [id]);

  const loadWorkouts = useCallback(async () => {
    const { data } = await supabase
      .from("member_workout_programs")
      .select("id, program_id, valid_from, valid_until, status, notes, created_at, workout_programs(id, name, goal, difficulty, days_per_week, duration_weeks)")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAssignedPrograms((data as unknown as AssignedProgram[]) || []);
  }, [id]);

  const loadClasses = useCallback(async () => {
    const { data } = await supabase
      .from("class_bookings")
      .select("id, booked_for, status, created_at, classes(id, name, trainer_name, schedule_day, start_time, duration_mins, color)")
      .eq("member_id", id)
      .eq("status", "booked")
      .order("booked_for", { ascending: false })
      .limit(30);
    setClassBookings((data as unknown as MemberClassBooking[]) || []);
  }, [id]);

  const loadDietPlans = useCallback(async () => {
    const { data } = await supabase
      .from("member_diet_plans")
      .select("id, version_number, status, valid_from, start_date, target_kcal, plan_mode, plan_days, created_at")
      .eq("member_id", id)
      .order("created_at", { ascending: false });
    setDietPlans((data as DietPlan[]) || []);
  }, [id]);

  useEffect(() => {
    async function load() {
      const [{ data: m }, { data: ms }, { data: p }, , { data: dp }] = await Promise.all([
        supabase.from("members").select("*, branches(name)").eq("id", id).single(),
        supabase.from("memberships").select("*, membership_plans(name, duration_days)").eq("member_id", id).order("start_date", { ascending: false }),
        supabase.from("payments").select("*").eq("member_id", id).order("paid_at", { ascending: false }).limit(20),
        loadAttendance(),
        supabase.from("member_diet_plans").select("id, version_number, status, valid_from, start_date, target_kcal, plan_mode, plan_days, created_at").eq("member_id", id).order("created_at", { ascending: false }),
      ]);
      if (!m) { setNotFound(true); return; }
      setMember(m as Member);
      setMemberships((ms as Membership[]) || []);
      setPayments((p as Payment[]) || []);
      setDietPlans((dp as DietPlan[]) || []);
      await loadWorkouts();
      await loadClasses();
    }
    load();
  }, [id, loadAttendance, loadWorkouts, loadClasses]);

  if (notFound) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <BackLink href="/dashboard/members" label="Members" />
        <div className="ps-card ps-empty">
          <div className="ps-empty-title">Member not found</div>
          <div className="ps-empty-text">They may have been removed, or the link is incorrect.</div>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="ps-page db">
        <DesignStyles />
        <Skeleton w={90} h={16} />
        <div className="ps-hero" style={{ marginTop: 18 }}>
          <Skeleton w={72} h={72} r={36} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <Skeleton w={220} h={30} r={8} />
            <Skeleton w={260} h={14} />
          </div>
        </div>
        <Skeleton w="100%" h={110} r={16} />
      </div>
    );
  }

  const openVisit = attendance.find((a) => !a.check_out_at && a.check_in_at.slice(0, 10) === new Date().toISOString().slice(0, 10));

  async function toggleCheckIn() {
    if (!member) return;
    setBusy(true);
    if (openVisit) {
      await supabase.from("attendance_logs").update({ check_out_at: new Date().toISOString() }).eq("id", openVisit.id);
      show(`${member.full_name.split(" ")[0]} checked out`);
    } else {
      const { error } = await supabase.from("attendance_logs").insert({
        org_id: member.org_id, member_id: member.id, method: "manual", check_in_at: new Date().toISOString(),
      });
      if (error) { show("Couldn't check in. Try again.", "error"); setBusy(false); return; }
      show(`${member.full_name.split(" ")[0]} checked in`);
    }
    await loadAttendance();
    setBusy(false);
  }

  const active = memberships.find((ms) => ms.status === "active");
  const daysLeft = active?.end_date ? Math.ceil((new Date(active.end_date).getTime() - Date.now()) / 86400000) : null;
  const totalDays = active?.end_date
    ? Math.max(1, Math.round((new Date(active.end_date).getTime() - new Date(active.start_date).getTime()) / 86400000))
    : null;
  const used = totalDays && daysLeft !== null ? Math.min(1, Math.max(0, (totalDays - daysLeft) / totalDays)) : 0;
  const membershipTone = daysLeft === null ? "green" : daysLeft < 0 ? "red" : daysLeft <= 7 ? "amber" : "green";

  const bmi = member.height_cm && member.weight_kg ? member.weight_kg / Math.pow(member.height_cm / 100, 2) : null;
  const dietHref = `/dashboard/diet/new?member_id=${member.id}`;
  const contact = [member.phone, member.email, member.branches?.name].filter(Boolean) as string[];
  const activeProgram = assignedPrograms.find((ap) => ap.status === "active");

  async function reloadMemberships() {
    const { data } = await supabase
      .from("memberships")
      .select("*, membership_plans(name, duration_days)")
      .eq("member_id", id)
      .order("start_date", { ascending: false });
    setMemberships((data as Membership[]) || []);
    const { data: p } = await supabase
      .from("payments")
      .select("*")
      .eq("member_id", id)
      .order("paid_at", { ascending: false })
      .limit(20);
    setPayments((p as Payment[]) || []);
  }

  return (
    <div className="ps-page db">
      <DesignStyles />
      <BackLink href="/dashboard/members" label="Members" />

      {/* Profile header */}
      <header className="db-profile">
        <div className="db-hero-glow" aria-hidden />
        <div className="db-profile-top">
          {/* Member photo — click to upload, hover shows camera overlay */}
          <div className="db-avatar-ring">
            <div style={{ position: "relative", width: 76, height: 76 }}>
              <label htmlFor="member-photo-input" style={{ cursor: "pointer", display: "block", width: 76, height: 76 }} aria-label="Change member photo">
                {member.photo_url ? (
                  <img src={member.photo_url} alt={member.full_name} style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", display: "block" }} />
                ) : (
                  <Avatar name={member.full_name} size={76} />
                )}
                <div className="photo-overlay" style={{
                  position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.38)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: photoUploading ? 1 : 0, transition: "opacity 150ms ease",
                }}>
                  {photoUploading ? <Loader2 size={20} style={{ color: "#fff" }} className="ps-spin" /> : <Camera size={20} style={{ color: "#fff" }} />}
                </div>
              </label>
              <input
                id="member-photo-input" type="file" accept="image/jpeg,image/png,image/webp"
                style={{ position: "absolute", inset: 0, opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                onChange={handlePhotoChange} disabled={photoUploading}
              />
              {member.photo_url && !photoUploading && (
                <button type="button" onClick={handlePhotoRemove} aria-label="Remove photo" style={{
                  position: "absolute", top: -2, right: -2, width: 22, height: 22, borderRadius: "50%",
                  background: "#fff", border: "none", display: "grid", placeItems: "center",
                  cursor: "pointer", padding: 0, color: "var(--text-secondary)", boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}>
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
          <style>{`label:hover .photo-overlay { opacity: 1 !important; }`}</style>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="db-profile-name">{member.full_name}</h1>
            <div className="db-profile-meta">
              {member.phone && <a href={`tel:${member.phone}`}>{member.phone}</a>}
              {member.email && <a href={`mailto:${member.email}`}>{member.email}</a>}
              {member.branches?.name && <span>{member.branches.name}</span>}
              {openVisit && <span className="db-live"><span className="db-live-dot" />In gym now</span>}
            </div>
          </div>

          <div className="db-profile-actions">
            <Link href={`/dashboard/members/${member.id}/edit`} className="db-glass-btn"><Pencil size={15} /> Edit</Link>
            <Link href={dietHref} className="db-glass-btn"><Salad size={16} /> Diet plan</Link>
            <button type="button" className="db-glass-btn db-glass-btn--solid" onClick={toggleCheckIn} disabled={busy}>
              {openVisit ? <><LogOut size={16} /> Check out</> : <><LogIn size={16} /> Check in</>}
            </button>
          </div>
        </div>

        <div className="db-profile-stats">
          <div className="db-pstat">
            <div className="db-pstat-label">Plan</div>
            <div className="db-pstat-value">{active?.membership_plans?.name ?? "None"}</div>
          </div>
          <div className="db-pstat">
            <div className="db-pstat-label">Days left</div>
            <div className="db-pstat-value">{daysLeft === null ? "—" : daysLeft < 0 ? "Expired" : daysLeft}</div>
          </div>
          <div className="db-pstat">
            <div className="db-pstat-label">Visits (recent)</div>
            <div className="db-pstat-value">{attendance.length}</div>
          </div>
          <div className="db-pstat">
            <div className="db-pstat-label">Total paid</div>
            <div className="db-pstat-value">{formatINR(payments.reduce((sum, p) => sum + p.total_paise, 0))}</div>
          </div>
        </div>
      </header>

      {/* Membership */}
      <section className={`db-card db-pad db-membership db-tone-${membershipTone === "green" ? "green" : membershipTone === "amber" ? "amber" : "purple"}`}>
        <span className="db-chip db-chip--lg"><RefreshCw size={18} /></span>
        {active ? (
          <>
            <div style={{ minWidth: 0 }}>
              <div className="db-card-sub" style={{ marginTop: 0 }}>Membership</div>
              <div className="db-card-title">{active.membership_plans?.name ?? "Active plan"}</div>
            </div>
            <div className="db-membership-bar">
              {active.end_date && (
                <>
                  <div className="db-progress" style={{ marginBottom: 6 }}>
                    <span style={{ transform: `scaleX(${used})`, background: `var(--${membershipTone}-fill)` }} />
                  </div>
                  <div className="db-card-sub">Started {formatDate(active.start_date)} · Ends {formatDate(active.end_date)}</div>
                </>
              )}
            </div>
            <span className={`db-pill db-pill--${membershipTone === "green" ? "green" : membershipTone === "amber" ? "amber" : "red"}`}>
              {daysLeft === null ? "Active" : daysLeft < 0 ? "Expired" : daysLeft === 0 ? "Ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
            </span>
            <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm" onClick={() => setRenewSheetOpen(true)}>
              <RefreshCw size={13} /> Renew
            </button>
          </>
        ) : (
          <>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="db-card-sub" style={{ marginTop: 0 }}>Membership</div>
              <div className="db-card-title">No active plan</div>
            </div>
            <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setRenewSheetOpen(true)}>
              <RefreshCw size={13} /> Add membership
            </button>
          </>
        )}
      </section>

      {/* Tabs */}
      <div style={{ marginBottom: 16, maxWidth: 560 }}>
        <Segmented<Tab>
          block
          label="Member sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Profile" },
            { value: "diet", label: "Diet" },
            { value: "workout", label: "Workout" },
            { value: "classes", label: "Classes" },
            { value: "payments", label: "Payments" },
            { value: "visits", label: "Visits" },
          ]}
        />
      </div>

      {/* Profile */}
      {tab === "overview" && (
        <div className="ps-grid-2">
          <section className="ps-card ps-card-body" style={{ paddingTop: 18, paddingBottom: 10 }}>
            <h2 className="ps-card-title" style={{ marginBottom: 4 }}>Personal</h2>
            <KV label="Sex" value={member.sex ? cap(member.sex) : null} />
            <KV label="Age" value={member.date_of_birth ? `${ageFrom(member.date_of_birth)} years` : null} />
            <KV label="Date of birth" value={member.date_of_birth ? formatDate(member.date_of_birth, { year: true }) : null} />
            <KV label="Member since" value={formatDate(member.created_at, { year: true })} />
          </section>

          <section className="ps-card ps-card-body" style={{ paddingTop: 18, paddingBottom: 10 }}>
            <h2 className="ps-card-title" style={{ marginBottom: 4 }}>Body and goals</h2>
            <KV label="Height" value={member.height_cm ? `${member.height_cm} cm` : null} />
            <KV label="Weight" value={member.weight_kg ? `${member.weight_kg} kg` : null} />
            <KV label="BMI" value={bmi ? bmi.toFixed(1) : null} />
            <KV label="Goal" value={member.primary_goal ? GOAL_LABELS[member.primary_goal] ?? member.primary_goal : null} />
            <KV label="Diet" value={member.diet_type ? DIET_LABELS[member.diet_type] ?? member.diet_type : null} />
          </section>

          <section className="ps-card ps-card-body" style={{ paddingTop: 18, paddingBottom: 10 }}>
            <h2 className="ps-card-title" style={{ marginBottom: 4 }}>Activity</h2>
            <KV label="Work" value={member.job_activity ? JOB_LABELS[member.job_activity] ?? member.job_activity : null} />
            <KV label="Training days" value={member.exercise_days_per_week != null ? `${member.exercise_days_per_week} a week` : null} />
            <KV label="Spice tolerance" value={member.spice_tolerance ? cap(member.spice_tolerance) : null} />
          </section>

          <section className="ps-card ps-card-body" style={{ paddingTop: 18, paddingBottom: 10 }}>
            <h2 className="ps-card-title" style={{ marginBottom: 4 }}>Health</h2>
            <KV label="Conditions" value={<Tags items={member.medical_conditions ?? []} tone="amber" none="None" />} />
            <KV label="Gut symptoms" value={<Tags items={member.gut_symptoms ?? []} none="None" />} />
            <KV label="Intolerances" value={<Tags items={asList(member.food_intolerances)} none="None" />} />
            <KV label="Allergies" value={<Tags items={asList(member.allergies)} tone="red" none="None" />} />
          </section>

          {member.notes && (
            <section className="ps-card ps-card-body ps-span-2" style={{ gridColumn: "1 / -1" }}>
              <h2 className="ps-card-title" style={{ marginBottom: 8 }}>Notes</h2>
              <p style={{ fontSize: 14.5, color: "var(--text-secondary)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{member.notes}</p>
            </section>
          )}
        </div>
      )}

      {/* Diet */}
      {tab === "diet" && (
        <div className="ps-list">
          {dietPlans.length === 0 ? (
            <div className="ps-empty">
              <div className="ps-empty-icon"><Salad size={22} /></div>
              <div className="ps-empty-title">No diet plans yet</div>
              <div className="ps-empty-text">Generate a plan from {member.full_name.split(" ")[0]}&apos;s health profile.</div>
              <Link href={dietHref} className="ps-btn ps-btn--primary"><Plus size={16} /> New plan</Link>
            </div>
          ) : (
            <>
              {dietPlans.map((dp) => (
                <div key={dp.id} className="ps-row" style={{ ...cols("minmax(0,1fr) auto auto 32px 32px 16px", "minmax(0,1fr) auto 32px 32px 16px") } as React.CSSProperties}>
                  <Link
                    href={`/dashboard/diet/${dp.id}`}
                    style={{ display: "contents", textDecoration: "none" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="ps-cell-title">{MODE_LABELS[dp.plan_mode] ?? dp.plan_mode}, version {dp.version_number}</div>
                      <div className="ps-cell-sub">
                        {dp.plan_days} days from {formatDate(dp.start_date || dp.valid_from || dp.created_at)}, {dp.target_kcal.toLocaleString("en-IN")} kcal a day
                      </div>
                    </div>
                    <span className="ps-cell ps-hide-sm">Created {formatDate(dp.created_at)}</span>
                    <span className={`ps-badge${dp.status === "active" ? " ps-badge--green" : ""}`}>
                      {dp.status === "active" ? "Active" : "Older"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="ps-icon-btn"
                    style={{ width: 32, height: 32, flexShrink: 0 }}
                    title="Copy to another member"
                    aria-label="Copy to another member"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setCopySheetPlanId(dp.id); }}
                  >
                    <Copy size={14} />
                  </button>
                  <Link
                    href={`/dashboard/diet/${dp.id}/edit`}
                    className="ps-icon-btn"
                    style={{ width: 32, height: 32, flexShrink: 0 }}
                    title="Edit plan"
                    aria-label="Edit plan"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Pencil size={14} />
                  </Link>
                  <Link href={`/dashboard/diet/${dp.id}`} style={{ display: "flex", alignItems: "center" }}>
                    <ChevronRight size={16} className="ps-chevron" />
                  </Link>
                </div>
              ))}
              <Link href={dietHref} className="ps-row ps-row--link" style={{ ...cols("minmax(0,1fr)"), textDecoration: "none", color: "var(--accent)", fontWeight: 500, minHeight: 52 } as React.CSSProperties}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Plus size={16} /> New version</span>
              </Link>
            </>
          )}
        </div>
      )}

      {/* Workout */}
      {tab === "workout" && (
        <div>
          {activeProgram?.workout_programs && (
            <div className="ps-card ps-card-body" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="ps-stat-label">Current program</div>
                  <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.02em", marginTop: 2 }}>
                    {activeProgram.workout_programs.name}
                  </div>
                  <div className="ps-meta" style={{ marginTop: 6 }}>
                    <span className={`ps-badge ${GOAL_BADGE[activeProgram.workout_programs.goal as keyof typeof GOAL_BADGE] ?? ""}`}>
                      {WORKOUT_GOAL_LABELS[activeProgram.workout_programs.goal as keyof typeof WORKOUT_GOAL_LABELS] ?? activeProgram.workout_programs.goal}
                    </span>
                    <span className="ps-badge">
                      {DIFFICULTY_LABELS[activeProgram.workout_programs.difficulty as keyof typeof DIFFICULTY_LABELS] ?? activeProgram.workout_programs.difficulty}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      {activeProgram.workout_programs.days_per_week}d/wk &middot; {activeProgram.workout_programs.duration_weeks} wks
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <span className="ps-badge ps-badge--green"><span className="ps-dot" />Active</span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Since {formatDate(activeProgram.valid_from)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <Link href={`/dashboard/workouts/${activeProgram.program_id}`} className="ps-btn ps-btn--secondary ps-btn--sm">
                  View program
                </Link>
                <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm" onClick={() => setAssignSheetOpen(true)}>
                  <Dumbbell size={14} /> Change program
                </button>
              </div>
            </div>
          )}

          <div className="ps-list">
            <div className="ps-list-head" style={cols("minmax(0,2fr) minmax(0,1fr) auto", "minmax(0,1fr) auto")}>
              <span>Program</span><span className="ps-hide-sm">Started</span><span>Status</span>
            </div>
            {assignedPrograms.length === 0 ? (
              <div className="ps-empty">
                <div className="ps-empty-icon"><Dumbbell size={22} /></div>
                <div className="ps-empty-title">No workout assigned yet</div>
                <div className="ps-empty-text">Assign a program from your library to {member.full_name.split(" ")[0]}.</div>
                <button type="button" className="ps-btn ps-btn--primary" onClick={() => setAssignSheetOpen(true)}>
                  <Plus size={16} /> Assign program
                </button>
              </div>
            ) : (
              <>
                {assignedPrograms.map((ap) => (
                  <div key={ap.id} className="ps-row" style={{ ...cols("minmax(0,2fr) minmax(0,1fr) auto 32px 16px", "minmax(0,1fr) auto 32px 16px") } as React.CSSProperties}>
                    <Link href={`/dashboard/workouts/${ap.program_id}`} style={{ display: "contents", textDecoration: "none" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="ps-cell-title">{ap.workout_programs?.name ?? "Program"}</div>
                        <div className="ps-cell-sub">
                          {ap.workout_programs ? `${WORKOUT_GOAL_LABELS[ap.workout_programs.goal as keyof typeof WORKOUT_GOAL_LABELS] ?? ap.workout_programs.goal} · ${ap.workout_programs.days_per_week}d/wk` : ""}
                        </div>
                      </div>
                      <div className="ps-cell ps-hide-sm">{formatDate(ap.valid_from, { year: true })}</div>
                      <span className={`ps-badge${ap.status === "active" ? " ps-badge--green" : ""}`}>
                        {ap.status === "active" ? "Active" : ap.status === "completed" ? "Completed" : "Cancelled"}
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="ps-icon-btn"
                      style={{ width: 32, height: 32, flexShrink: 0 }}
                      title="Copy program to another member"
                      aria-label="Copy program to another member"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setCopyWorkoutProgramId(ap.program_id); }}
                    >
                      <Copy size={14} />
                    </button>
                    <Link href={`/dashboard/workouts/${ap.program_id}`} style={{ display: "flex", alignItems: "center" }}>
                      <ChevronRight size={16} className="ps-chevron" />
                    </Link>
                  </div>
                ))}
                <button type="button" className="ps-row"
                  onClick={() => setAssignSheetOpen(true)}
                  style={{ ...cols("minmax(0,1fr)"), color: "var(--accent)", fontWeight: 500, minHeight: 52, border: "none", background: "none", cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit" } as React.CSSProperties}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Plus size={16} /> Assign new program</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Classes */}
      {tab === "classes" && (
        <div className="ps-list">
          <div className="ps-list-head" style={cols("minmax(0,1fr) 110px 110px 16px", "minmax(0,1fr) 100px 16px")}>
            <span>Class</span>
            <span className="ps-hide-sm">Booked for</span>
            <span>Schedule</span>
            <span />
          </div>

          {classBookings.length === 0 ? (
            <div className="ps-empty">
              <div className="ps-empty-icon"><BookOpen size={22} /></div>
              <div className="ps-empty-title">No class bookings yet</div>
              <div className="ps-empty-text">
                Book {member.full_name.split(" ")[0]} into a class directly from here.
              </div>
              <button type="button" className="ps-btn ps-btn--primary" onClick={() => setBookClassSheetOpen(true)}>
                <Plus size={16} /> Book a class
              </button>
            </div>
          ) : (
            <>
              {classBookings.map((b) => {
                const cls = b.classes;
                const fmt12 = (t: string) => {
                  const [h, m] = t.split(":").map(Number);
                  const ampm = h < 12 ? "am" : "pm";
                  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                  return `${h12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
                };
                return (
                  <Link
                    key={b.id}
                    href="/dashboard/classes"
                    className="ps-row ps-row--link"
                    style={{ ...cols("minmax(0,1fr) 110px 110px 16px", "minmax(0,1fr) 100px 16px"), textDecoration: "none" } as React.CSSProperties}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="ps-cell-title">{cls?.name ?? "Class"}</div>
                      <div className="ps-cell-sub">
                        {cls?.trainer_name ? `with ${cls.trainer_name}` : ""}
                        {cls?.duration_mins ? ` · ${cls.duration_mins} min` : ""}
                      </div>
                    </div>
                    <div className="ps-cell ps-hide-sm" style={{ fontSize: 13 }}>
                      {formatDate(b.booked_for)}
                    </div>
                    <div className="ps-cell" style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {cls ? `${cls.schedule_day.slice(0, 3)} · ${fmt12(cls.start_time)}` : ""}
                    </div>
                    <ChevronRight size={16} className="ps-chevron" />
                  </Link>
                );
              })}
              <button type="button" className="ps-row"
                onClick={() => setBookClassSheetOpen(true)}
                style={{ ...cols("minmax(0,1fr)"), color: "var(--accent)", fontWeight: 500, minHeight: 52, border: "none", background: "none", cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit" } as React.CSSProperties}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Plus size={16} /> Book another class</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && (
        <div className="ps-list">
          {payments.length === 0 ? (
            <div className="ps-empty">
              <div className="ps-empty-icon"><Wallet size={22} /></div>
              <div className="ps-empty-title">No payments yet</div>
              <div className="ps-empty-text">Payments recorded for this member will show here.</div>
            </div>
          ) : payments.map((p) => (
            <div key={p.id} className="ps-row" style={cols("minmax(0,1fr) auto", "minmax(0,1fr) auto")}>
              <div style={{ minWidth: 0 }}>
                <div className="ps-cell-title">{p.notes || "Payment"}</div>
                <div className="ps-cell-sub">{formatDate(p.paid_at, { year: true })}{p.method ? `, ${METHOD_LABELS[p.method] ?? p.method}` : ""}</div>
              </div>
              <div className="ps-num" style={{ fontSize: 15, fontWeight: 600 }}>{formatINR(p.total_paise)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Visits */}
      {tab === "visits" && (
        <div className="ps-list">
          {attendance.length === 0 ? (
            <div className="ps-empty">
              <div className="ps-empty-icon"><UserCheck size={22} /></div>
              <div className="ps-empty-title">No visits yet</div>
              <div className="ps-empty-text">Check-ins will appear here once {member.full_name.split(" ")[0]} starts coming in.</div>
            </div>
          ) : attendance.map((a) => {
            const dur = duration(a.check_in_at, a.check_out_at);
            return (
              <div key={a.id} className={`ps-row${a.check_out_at ? "" : " ps-row--live"}`} style={cols("minmax(0,1fr) auto", "minmax(0,1fr) auto")}>
                <div style={{ minWidth: 0 }}>
                  <div className="ps-cell-title">{formatDate(a.check_in_at, { weekday: true })}</div>
                  <div className="ps-cell-sub ps-num">
                    {formatTime(a.check_in_at)}{a.check_out_at ? ` to ${formatTime(a.check_out_at)}` : ""}
                  </div>
                </div>
                {a.check_out_at
                  ? <span className="ps-cell ps-num">{dur}</span>
                  : <span className="ps-badge ps-badge--green"><span className="ps-dot" />In gym</span>}
              </div>
            );
          })}
        </div>
      )}

      {toast}

      {renewSheetOpen && member && (
        <RenewalSheet
          member={member}
          currentPlan={active?.membership_plans ? { id: active.id, name: active.membership_plans.name, duration_days: active.membership_plans.duration_days, price_paise: 0, plan_type: "duration" } : null}
          onClose={() => setRenewSheetOpen(false)}
          onRenewed={async () => {
            setRenewSheetOpen(false);
            await reloadMemberships();
            show("Membership renewed");
          }}
        />
      )}

      {assignSheetOpen && member && (
        <AssignProgramSheet
          memberId={member.id}
          orgId={member.org_id}
          onClose={() => setAssignSheetOpen(false)}
          onAssigned={async () => {
            setAssignSheetOpen(false);
            await loadWorkouts();
            show("Program assigned");
          }}
        />
      )}

      {bookClassSheetOpen && member && (
        <BookClassSheet
          memberId={member.id}
          orgId={member.org_id}
          onClose={() => setBookClassSheetOpen(false)}
          onBooked={async () => {
            setBookClassSheetOpen(false);
            await loadClasses();
            show("Class booked");
          }}
        />
      )}

      {copySheetPlanId && member && (
        <CopyPlanSheet
          sourcePlanId={copySheetPlanId}
          sourceMemberId={member.id}
          orgId={member.org_id}
          onClose={() => setCopySheetPlanId(null)}
          onCopied={async (targetName) => {
            setCopySheetPlanId(null);
            await loadDietPlans();
            show(`Plan copied to ${targetName}`);
          }}
        />
      )}

      {copyWorkoutProgramId && member && (
        <CopyWorkoutSheet
          sourceProgramId={copyWorkoutProgramId}
          sourceMemberId={member.id}
          orgId={member.org_id}
          onClose={() => setCopyWorkoutProgramId(null)}
          onCopied={(targetName) => {
            setCopyWorkoutProgramId(null);
            show(`Program copied to ${targetName}`);
          }}
        />
      )}
    </div>
  );
}
