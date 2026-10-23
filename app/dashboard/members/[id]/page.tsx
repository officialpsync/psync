"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { BookOpen, Calendar, Camera, ChevronRight, Copy, Dumbbell, Loader2, LogIn, LogOut, Pencil, Plus, RefreshCw, Salad, Search, Wallet, UserCheck, X } from "lucide-react";
import {
  Avatar, BackLink, cols, formatDate, formatINR, formatTime, Segmented, Skeleton, useToast,
} from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";
import {
  Activity, AlertTriangle, CalendarDays, ChevronLeft, Clock, Flame, HeartPulse, Mail, MapPin, MessageCircle,
  MoreHorizontal, Phone, Receipt, ShieldAlert, Sparkles, StickyNote, Target, User,
} from "lucide-react";
import { CopyPlanSheet, type CopyMember, type Kind } from "../components/CopyPlanSheet";
import { EyeOff, GripVertical, LayoutGrid, RotateCcw, Check as CheckIcon } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
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

// ---- Member profile ----

type CopyState = { kind: Kind; planId: string } | null;
type HeatDay = { date: string; count: number };

const TAB_META: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "diet", label: "Diet", icon: Salad },
  { key: "workout", label: "Workout", icon: Dumbbell },
  { key: "classes", label: "Classes", icon: BookOpen },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "visits", label: "Visits", icon: UserCheck },
];

function waLink(phone: string | null, text?: string) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : formatDate(iso);
}

/** 12 weeks of check-ins, Monday-first columns, like a contribution graph. */
function Heatmap({ days }: { days: HeatDay[] }) {
  const map = new Map(days.map((d) => [d.date, d.count]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 7 * 12 + 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const weeks: { date: Date; count: number; future: boolean }[][] = [];
  for (const d = new Date(start); d <= today || weeks[weeks.length - 1]?.length !== 7; d.setDate(d.getDate() + 1)) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    const k = dayKey(d);
    weeks[weeks.length - 1].push({ date: new Date(d), count: map.get(k) ?? 0, future: d > today });
    if (weeks.length > 14) break;
  }
  return (
    <div className="mp-heat" role="img" aria-label="Check-ins over the last 12 weeks">
      <div className="mp-heat-days" aria-hidden><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
      <div className="mp-heat-grid">
        {weeks.map((w, i) => (
          <div key={i} className="mp-heat-col">
            {w.map((c) => (
              <span key={c.date.toISOString()} data-level={c.future ? "f" : Math.min(c.count, 2)}
                title={`${c.date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}: ${c.count ? "visited" : "no visit"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Editable overview layout (same idea as the dashboard Overview; saved on this device) ──
type WidgetId = "membership" | "attendance" | "programs" | "body" | "health" | "personal" | "notes";
type Span = 4 | 6 | 8 | 12;
type Layout = { order: WidgetId[]; hidden: WidgetId[]; sizes: Partial<Record<WidgetId, Span>> };
const WIDGET_LABEL: Record<WidgetId, string> = {
  membership: "Membership", attendance: "Attendance", programs: "Current programs",
  body: "Body and goals", health: "Health", personal: "Personal", notes: "Notes",
};
const DEFAULT_LAYOUT: Layout = {
  order: ["membership", "body", "attendance", "health", "programs", "personal", "notes"],
  hidden: [],
  sizes: { membership: 8, body: 4, attendance: 8, health: 4, programs: 8, personal: 4, notes: 4 },
};
const LAYOUT_KEY = "psync.member.overview.layout";
const SIZE_LABEL: Record<Span, string> = { 4: "S", 6: "M", 8: "L", 12: "Full" };

function readLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Partial<Layout> | null;
    if (!raw) return DEFAULT_LAYOUT;
    const known = DEFAULT_LAYOUT.order;
    const order = (raw.order ?? []).filter((w): w is WidgetId => known.includes(w as WidgetId));
    known.forEach((w) => { if (!order.includes(w)) order.push(w); }); // new cards appear at the end
    return { order, hidden: (raw.hidden ?? []).filter((w) => known.includes(w)), sizes: { ...DEFAULT_LAYOUT.sizes, ...(raw.sizes ?? {}) } };
  } catch { return DEFAULT_LAYOUT; }
}

function WTile({ id, span, editing, onSize, onHide, children }: {
  id: WidgetId; span: Span; editing: boolean; onSize: (s: Span) => void; onHide: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  // Masonry: each tile spans as many 2px grid rows as its content needs, so a short card
  // doesn't leave a gap under it when the card next to it is taller.
  const inner = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setRows(Math.ceil((el.getBoundingClientRect().height + 14) / 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={setNodeRef} className={`mp-wtile mp-span-${span}`} data-dragging={isDragging}
      style={{ transform: DndCSS.Transform.toString(transform), transition, gridRowEnd: rows ? `span ${rows}` : undefined }}>
      <div ref={inner} className="mp-wtile-in">
      {editing && (
        <div className="mp-wtools">
          <button type="button" ref={setActivatorNodeRef} className="mp-wtool mp-grip" aria-label={`Move ${WIDGET_LABEL[id]}`} {...attributes} {...listeners}><GripVertical size={14} /></button>
          <div className="mp-wsizes" role="group" aria-label={`${WIDGET_LABEL[id]} width`}>
            {([4, 6, 8, 12] as Span[]).map((s) => (
              <button key={s} type="button" aria-pressed={s === span} onClick={() => onSize(s)}>{SIZE_LABEL[s]}</button>
            ))}
          </div>
          <button type="button" className="mp-wtool" aria-label={`Hide ${WIDGET_LABEL[id]}`} title="Hide" onClick={onHide}><EyeOff size={14} /></button>
        </div>
      )}
      {children}
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
  const [heat, setHeat] = useState<HeatDay[]>([]);
  const [dietPlans, setDietPlans] = useState<DietPlan[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [renewSheetOpen, setRenewSheetOpen] = useState(false);
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [bookClassSheetOpen, setBookClassSheetOpen] = useState(false);
  const [assignedPrograms, setAssignedPrograms] = useState<AssignedProgram[]>([]);
  const [classBookings, setClassBookings] = useState<MemberClassBooking[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copy, setCopy] = useState<CopyState>(null);
  const [copyMembers, setCopyMembers] = useState<CopyMember[] | null>(null);
  const { toast, show } = useToast();
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  useEffect(() => { setLayout(readLayout()); }, []);
  function saveLayout(next: Layout) {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!member || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    if (file.size > 2 * 1024 * 1024) { show("Photo must be under 2 MB", "error"); return; }
    setPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `member-photos/${member.org_id}/${member.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("org-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { show("Upload failed: " + upErr.message, "error"); return; }
      const { data: { publicUrl } } = supabase.storage.from("org-assets").getPublicUrl(path);
      const url = `${publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from("members").update({ photo_url: url }).eq("id", member.id);
      if (dbErr) { show("Couldn't save photo", "error"); return; }
      setMember((prev) => (prev ? { ...prev, photo_url: url } : prev));
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
    setMember((prev) => (prev ? { ...prev, photo_url: null } : prev));
    setPhotoUploading(false);
    show("Photo removed");
  }

  const loadAttendance = useCallback(async () => {
    const since = new Date(); since.setDate(since.getDate() - 7 * 13);
    const [{ data }, { data: h }] = await Promise.all([
      supabase.from("attendance_logs").select("*").eq("member_id", id).order("check_in_at", { ascending: false }).limit(60),
      supabase.from("attendance_logs").select("check_in_at").eq("member_id", id).gte("check_in_at", since.toISOString()),
    ]);
    setAttendance((data as AttendanceLog[]) || []);
    const counts = new Map<string, number>();
    (h ?? []).forEach((r: { check_in_at: string }) => { const k = dayKey(new Date(r.check_in_at)); counts.set(k, (counts.get(k) ?? 0) + 1); });
    setHeat([...counts.entries()].map(([date, count]) => ({ date, count })));
  }, [id]);

  const loadWorkouts = useCallback(async () => {
    const { data } = await supabase
      .from("member_workout_programs")
      .select("id, program_id, valid_from, valid_until, status, notes, created_at, workout_programs(id, name, goal, difficulty, days_per_week, duration_weeks)")
      .eq("member_id", id).order("created_at", { ascending: false }).limit(20);
    setAssignedPrograms((data as unknown as AssignedProgram[]) || []);
  }, [id]);

  const loadClasses = useCallback(async () => {
    const { data } = await supabase
      .from("class_bookings")
      .select("id, booked_for, status, created_at, classes(id, name, trainer_name, schedule_day, start_time, duration_mins, color)")
      .eq("member_id", id).eq("status", "booked").order("booked_for", { ascending: false }).limit(30);
    setClassBookings((data as unknown as MemberClassBooking[]) || []);
  }, [id]);

  const loadDietPlans = useCallback(async () => {
    const { data } = await supabase
      .from("member_diet_plans")
      .select("id, version_number, status, valid_from, start_date, target_kcal, plan_mode, plan_days, created_at")
      .eq("member_id", id).order("created_at", { ascending: false });
    setDietPlans((data as DietPlan[]) || []);
  }, [id]);

  useEffect(() => {
    async function load() {
      const [{ data: m }, { data: ms }, { data: p }] = await Promise.all([
        supabase.from("members").select("*, branches(name)").eq("id", id).single(),
        supabase.from("memberships").select("*, membership_plans(name, duration_days)").eq("member_id", id).order("start_date", { ascending: false }),
        supabase.from("payments").select("*").eq("member_id", id).order("paid_at", { ascending: false }).limit(50),
        loadAttendance(), loadDietPlans(), loadWorkouts(), loadClasses(),
      ]);
      if (!m) { setNotFound(true); return; }
      setMember(m as Member);
      setMemberships((ms as Membership[]) || []);
      setPayments((p as Payment[]) || []);
    }
    load();
  }, [id, loadAttendance, loadWorkouts, loadClasses, loadDietPlans]);

  // Close the actions menu on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", key); };
  }, [menuOpen]);

  const stats = useMemo(() => {
    const now = Date.now();
    const last30 = heat.filter((d) => now - new Date(`${d.date}T00:00:00`).getTime() <= 30 * 86400000).length;
    // Weekly streak: consecutive weeks (ending this or last week) with at least one visit
    const weeks = new Set(heat.map((d) => { const x = new Date(`${d.date}T00:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(x); }));
    let streak = 0;
    const w = new Date(); w.setHours(0, 0, 0, 0); w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
    if (!weeks.has(dayKey(w))) w.setDate(w.getDate() - 7);
    while (weeks.has(dayKey(w))) { streak++; w.setDate(w.getDate() - 7); }
    const done = attendance.filter((a) => a.check_out_at);
    const avg = done.length ? Math.round(done.reduce((s, a) => s + (new Date(a.check_out_at!).getTime() - new Date(a.check_in_at).getTime()) / 60000, 0) / done.length) : null;
    return { last30, streak, avg, lastVisit: attendance[0]?.check_in_at ?? null };
  }, [heat, attendance]);

  if (notFound) {
    return (
      <div className="ps-page db mp">
        <DesignStyles /><style>{MP_CSS}</style>
        <BackLink href="/dashboard/members" label="Members" />
        <div className="mp-card mp-empty">
          <span className="mp-empty-icon"><User size={20} /></span>
          <strong>Member not found</strong>
          <p>They may have been removed, or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="ps-page db mp">
        <DesignStyles /><style>{MP_CSS}</style>
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <Skeleton w="100%" h={210} r={22} />
          <Skeleton w="100%" h={90} r={16} />
          <Skeleton w="100%" h={320} r={16} />
        </div>
      </div>
    );
  }

  const first = member.full_name.split(" ")[0];
  const openVisit = attendance.find((a) => !a.check_out_at && a.check_in_at.slice(0, 10) === new Date().toISOString().slice(0, 10));

  async function toggleCheckIn() {
    if (!member) return;
    setBusy(true);
    if (openVisit) {
      await supabase.from("attendance_logs").update({ check_out_at: new Date().toISOString() }).eq("id", openVisit.id);
      show(`${first} checked out`);
    } else {
      const { error } = await supabase.from("attendance_logs").insert({
        org_id: member.org_id, member_id: member.id, method: "manual", check_in_at: new Date().toISOString(),
      });
      if (error) { show("Couldn't check in. Try again.", "error"); setBusy(false); return; }
      show(`${first} checked in`);
    }
    await loadAttendance();
    setBusy(false);
  }

  async function reloadMemberships() {
    const [{ data }, { data: p }] = await Promise.all([
      supabase.from("memberships").select("*, membership_plans(name, duration_days)").eq("member_id", id).order("start_date", { ascending: false }),
      supabase.from("payments").select("*").eq("member_id", id).order("paid_at", { ascending: false }).limit(50),
    ]);
    setMemberships((data as Membership[]) || []);
    setPayments((p as Payment[]) || []);
  }

  async function openCopy(kind: Kind, planId: string) {
    if (!member) return;
    if (!copyMembers) {
      const [{ data: ms }, { data: d }, { data: w }] = await Promise.all([
        supabase.from("members").select("id, full_name, phone").eq("org_id", member.org_id).order("full_name"),
        supabase.from("member_diet_plans").select("member_id").eq("org_id", member.org_id).eq("status", "active"),
        supabase.from("member_workout_programs").select("member_id").eq("org_id", member.org_id).eq("status", "active"),
      ]);
      const ds = new Set((d ?? []).map((r: { member_id: string }) => r.member_id));
      const ws = new Set((w ?? []).map((r: { member_id: string }) => r.member_id));
      setCopyMembers(((ms ?? []) as { id: string; full_name: string; phone: string | null }[]).map((x) => ({ ...x, hasDiet: ds.has(x.id), hasWorkout: ws.has(x.id) })));
    }
    setCopy({ kind, planId });
  }

  const active = memberships.find((ms) => ms.status === "active");
  const daysLeft = active?.end_date ? Math.ceil((new Date(active.end_date).getTime() - Date.now()) / 86400000) : null;
  const totalDays = active?.end_date ? Math.max(1, Math.round((new Date(active.end_date).getTime() - new Date(active.start_date).getTime()) / 86400000)) : null;
  const used = totalDays && daysLeft !== null ? Math.min(1, Math.max(0, (totalDays - daysLeft) / totalDays)) : 0;
  const tone: "green" | "amber" | "red" | "grey" = !active ? "grey" : daysLeft === null ? "green" : daysLeft < 0 ? "red" : daysLeft <= 7 ? "amber" : "green";
  const statusLabel = !active ? "No active plan" : daysLeft === null ? "Active" : daysLeft < 0 ? "Expired" : daysLeft === 0 ? "Ends today" : daysLeft <= 7 ? `${daysLeft}d left` : "Active";

  const bmi = member.height_cm && member.weight_kg ? member.weight_kg / Math.pow(member.height_cm / 100, 2) : null;
  const bmiBand = bmi ? (bmi < 18.5 ? "Under" : bmi < 25 ? "Healthy" : bmi < 30 ? "Over" : "High") : null;
  const dietHref = `/dashboard/diet/new?member_id=${member.id}`;
  const activeProgram = assignedPrograms.find((ap) => ap.status === "active");
  const activeDiet = dietPlans.find((d) => d.status === "active");
  const totalPaid = payments.reduce((sum, p) => sum + p.total_paise, 0);
  const wa = waLink(member.phone);
  const renewMsg = active?.end_date
    ? `Hi ${first}, your ${active.membership_plans?.name ?? ""} membership ${daysLeft !== null && daysLeft < 0 ? "ended" : "ends"} on ${formatDate(active.end_date, { year: true })}. Reply here to renew.`
    : `Hi ${first}!`;

  const counts: Partial<Record<Tab, number>> = {
    diet: dietPlans.length, workout: assignedPrograms.length, classes: classBookings.length, payments: payments.length, visits: attendance.length,
  };

  const fmt12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
  };

  const menu = [
    { label: active ? "Renew membership" : "Add membership", icon: RefreshCw, run: () => setRenewSheetOpen(true) },
    { label: activeProgram ? "Change workout" : "Assign workout", icon: Dumbbell, run: () => setAssignSheetOpen(true) },
    { label: "Book a class", icon: BookOpen, run: () => setBookClassSheetOpen(true) },
    ...(activeDiet ? [{ label: "Copy diet plan", icon: Copy, run: () => openCopy("diet", activeDiet.id) }] : []),
    ...(activeProgram ? [{ label: "Copy workout", icon: Copy, run: () => openCopy("workout", activeProgram.id) }] : []),
  ];

  // Overview cards, keyed for the editable layout. Notes only exists when there are notes.
  const widgets: Record<WidgetId, React.ReactNode> = {
    membership: (
      <section className="mp-card">
        <div className="mp-card-h">
          <h2><RefreshCw size={15} /> Membership</h2>
          <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm" onClick={() => setRenewSheetOpen(true)}><RefreshCw size={13} /> {active ? "Renew" : "Add membership"}</button>
        </div>
        {active ? (
          <div className="mp-ms">
            <div className="mp-ms-top">
              <div><strong>{active.membership_plans?.name ?? "Active plan"}</strong><small>{active.end_date ? `${formatDate(active.start_date)} → ${formatDate(active.end_date, { year: true })}` : `Since ${formatDate(active.start_date)}`}</small></div>
              <span className={`mp-status mp-status--${tone} mp-status--soft`}><i />{statusLabel}</span>
            </div>
            {active.end_date && (
              <div className="mp-bar" data-tone={tone}><span style={{ width: `${Math.round(used * 100)}%` }} /></div>
            )}
            {totalDays && daysLeft !== null && <small className="mp-muted">{Math.max(0, totalDays - Math.max(daysLeft, 0))} of {totalDays} days used</small>}
          </div>
        ) : <p className="mp-muted" style={{ margin: 0 }}>No active membership. Add one to start tracking renewals.</p>}
        {memberships.length > 1 && (
          <div className="mp-history">
            <div className="mp-label">History</div>
            {memberships.filter((m) => m.id !== active?.id).slice(0, 4).map((m) => (
              <div key={m.id} className="mp-hrow">
                <span>{m.membership_plans?.name ?? "Plan"}</span>
                <small>{formatDate(m.start_date, { year: true })}{m.end_date ? ` → ${formatDate(m.end_date, { year: true })}` : ""}</small>
                <span className="mp-pill">{cap(m.status)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    ),
    attendance: (
      <section className="mp-card">
        <div className="mp-card-h">
          <h2><Activity size={15} /> Attendance</h2>
          <span className="mp-muted">{stats.avg ? `Avg session ${stats.avg < 60 ? `${stats.avg}m` : `${Math.floor(stats.avg / 60)}h ${stats.avg % 60}m`}` : "Last 12 weeks"}</span>
        </div>
        <Heatmap days={heat} />
        <div className="mp-heat-legend"><span>Less</span><i data-level="0" /><i data-level="1" /><i data-level="2" /><span>More</span></div>
      </section>
    ),
    programs: (
      <section className="mp-card">
        <div className="mp-card-h"><h2><Sparkles size={15} /> Current programs</h2></div>
        <div className="mp-programs">
          <div className="mp-prog mp-prog--diet">
            <span className="mp-prog-icon"><Salad size={18} /></span>
            {activeDiet ? (
              <>
                <div className="mp-prog-text">
                  <strong>{activeDiet.target_kcal.toLocaleString("en-IN")} kcal · {activeDiet.plan_days}-day</strong>
                  <small>{MODE_LABELS[activeDiet.plan_mode] ?? cap(activeDiet.plan_mode)} · v{activeDiet.version_number}</small>
                </div>
                <div className="mp-prog-actions">
                  <button type="button" className="mp-icon" title="Copy to another member" onClick={() => openCopy("diet", activeDiet.id)}><Copy size={14} /></button>
                  <Link href={`/dashboard/diet/${activeDiet.id}`} className="mp-icon" title="Open"><ChevronRight size={16} /></Link>
                </div>
              </>
            ) : (
              <>
                <div className="mp-prog-text"><strong>No diet plan</strong><small>Build one from the health profile</small></div>
                <Link href={dietHref} className="ps-btn ps-btn--secondary ps-btn--sm"><Plus size={13} /> Create</Link>
              </>
            )}
          </div>
          <div className="mp-prog mp-prog--workout">
            <span className="mp-prog-icon"><Dumbbell size={18} /></span>
            {activeProgram?.workout_programs ? (
              <>
                <div className="mp-prog-text">
                  <strong>{activeProgram.workout_programs.name}</strong>
                  <small>{activeProgram.workout_programs.days_per_week} days/week · {activeProgram.workout_programs.duration_weeks} weeks</small>
                </div>
                <div className="mp-prog-actions">
                  <button type="button" className="mp-icon" title="Copy to another member" onClick={() => openCopy("workout", activeProgram.id)}><Copy size={14} /></button>
                  <Link href={`/dashboard/workouts/${activeProgram.program_id}`} className="mp-icon" title="Open"><ChevronRight size={16} /></Link>
                </div>
              </>
            ) : (
              <>
                <div className="mp-prog-text"><strong>No workout</strong><small>Assign one from your library</small></div>
                <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setAssignSheetOpen(true)}><Plus size={13} /> Assign</button>
              </>
            )}
          </div>
        </div>
      </section>
    ),
    body: (
      <section className="mp-card">
        <div className="mp-card-h"><h2><HeartPulse size={15} /> Body and goals</h2></div>
        <div className="mp-metrics">
          <div className="mp-metric"><small>Height</small><strong>{member.height_cm ? <>{member.height_cm}<em>cm</em></> : "—"}</strong></div>
          <div className="mp-metric"><small>Weight</small><strong>{member.weight_kg ? <>{member.weight_kg}<em>kg</em></> : "—"}</strong></div>
          <div className="mp-metric" data-band={bmiBand ?? undefined}><small>BMI</small><strong>{bmi ? bmi.toFixed(1) : "—"}</strong>{bmiBand && <span>{bmiBand}</span>}</div>
        </div>
        <KV label="Goal" value={member.primary_goal ? GOAL_LABELS[member.primary_goal] ?? member.primary_goal : null} />
        <KV label="Diet" value={member.diet_type ? DIET_LABELS[member.diet_type] ?? member.diet_type : null} />
        <KV label="Work" value={member.job_activity ? JOB_LABELS[member.job_activity] ?? member.job_activity : null} />
        <KV label="Training days" value={member.exercise_days_per_week != null ? `${member.exercise_days_per_week} a week` : null} />
        <KV label="Spice tolerance" value={member.spice_tolerance ? cap(member.spice_tolerance) : null} />
      </section>
    ),
    health: (
      <section className="mp-card">
        <div className="mp-card-h"><h2><ShieldAlert size={15} /> Health</h2></div>
        <KV label="Conditions" value={<Tags items={member.medical_conditions ?? []} tone="amber" none="None" />} />
        <KV label="Gut symptoms" value={<Tags items={member.gut_symptoms ?? []} none="None" />} />
        <KV label="Intolerances" value={<Tags items={asList(member.food_intolerances)} none="None" />} />
        <KV label="Allergies" value={<Tags items={asList(member.allergies)} tone="red" none="None" />} />
      </section>
    ),
    personal: (
      <section className="mp-card">
        <div className="mp-card-h"><h2><User size={15} /> Personal</h2></div>
        <KV label="Sex" value={member.sex ? cap(member.sex) : null} />
        <KV label="Age" value={member.date_of_birth ? `${ageFrom(member.date_of_birth)} years` : null} />
        <KV label="Date of birth" value={member.date_of_birth ? formatDate(member.date_of_birth, { year: true }) : null} />
        <KV label="Branch" value={member.branches?.name ?? null} />
      </section>
    ),
    notes: member.notes ? (
      <section className="mp-card mp-notes">
        <div className="mp-card-h"><h2><StickyNote size={15} /> Notes</h2></div>
        <p>{member.notes}</p>
      </section>
    ) : null,
  };
  const shownWidgets = layout.order.filter((w) => widgets[w] && !layout.hidden.includes(w));
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = layout.order.indexOf(a.id as WidgetId), to = layout.order.indexOf(over.id as WidgetId);
    if (from < 0 || to < 0) return;
    saveLayout({ ...layout, order: arrayMove(layout.order, from, to) });
  }

  return (
    <div className="ps-page db mp">
      <DesignStyles />
      <style>{MP_CSS}</style>

      <div className="mp-crumbs">
        <Link href="/dashboard/members"><ChevronLeft size={16} /> Members</Link>
        <span>/</span>
        <b>{member.full_name}</b>
      </div>

      {/* ── Hero ── */}
      <header className="mp-hero" data-tone={tone}>
        <div className="mp-hero-bg" aria-hidden />
        <div className="mp-hero-top">
          <div className="mp-photo" data-tone={tone}>
            <label htmlFor="member-photo-input" aria-label="Change member photo">
              {member.photo_url
                ? <img src={member.photo_url} alt={member.full_name} />
                : <Avatar name={member.full_name} size={84} />}
              <span className="mp-photo-overlay" data-busy={photoUploading}>
                {photoUploading ? <Loader2 size={20} className="ps-spin" /> : <Camera size={20} />}
              </span>
            </label>
            <input id="member-photo-input" type="file" accept="image/jpeg,image/png,image/webp" className="mp-hidden" onChange={handlePhotoChange} disabled={photoUploading} />
            {member.photo_url && !photoUploading && (
              <button type="button" className="mp-photo-x" onClick={handlePhotoRemove} aria-label="Remove photo"><X size={11} strokeWidth={2.6} /></button>
            )}
          </div>

          <div className="mp-hero-id">
            <div className="mp-hero-badges">
              <span className={`mp-status mp-status--${tone}`}><i />{statusLabel}</span>
              {openVisit && <span className="mp-live"><i />In gym now</span>}
              {member.primary_goal && <span className="mp-glass-tag"><Target size={12} />{GOAL_LABELS[member.primary_goal] ?? member.primary_goal}</span>}
            </div>
            <h1>{member.full_name}</h1>
            <div className="mp-hero-meta">
              {member.phone && <span><Phone size={13} />{member.phone}</span>}
              {member.email && <span><Mail size={13} />{member.email}</span>}
              {member.branches?.name && <span><MapPin size={13} />{member.branches.name}</span>}
              <span><CalendarDays size={13} />Member since {formatDate(member.created_at, { year: true })}</span>
            </div>
          </div>

          <div className="mp-hero-actions">
            <div className="mp-quick">
              {member.phone && <a href={`tel:${member.phone}`} className="mp-round" aria-label="Call" title="Call"><Phone size={16} /></a>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="mp-round" aria-label="WhatsApp" title="WhatsApp"><MessageCircle size={16} /></a>}
              {member.email && <a href={`mailto:${member.email}`} className="mp-round" aria-label="Email" title="Email"><Mail size={16} /></a>}
            </div>
            <Link href={`/dashboard/members/${member.id}/edit`} className="mp-glass"><Pencil size={15} /><span>Edit</span></Link>
            <button type="button" className="mp-glass mp-glass--solid mp-hide-sm" onClick={toggleCheckIn} disabled={busy}>
              {busy ? <Loader2 size={15} className="ps-spin" /> : openVisit ? <LogOut size={15} /> : <LogIn size={15} />}
              <span>{openVisit ? "Check out" : "Check in"}</span>
            </button>
            <div className="mp-menu-anchor" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="mp-glass mp-glass--icon" aria-label="More actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}><MoreHorizontal size={18} /></button>
              {menuOpen && (
                <div className="mp-menu" role="menu">
                  {menu.map((m) => (
                    <button key={m.label} type="button" role="menuitem" onClick={() => { setMenuOpen(false); m.run(); }}><m.icon size={15} />{m.label}</button>
                  ))}
                  <Link href={dietHref} role="menuitem" onClick={() => setMenuOpen(false)}><Salad size={15} />New diet plan</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mp-stats">
          <div className="mp-stat">
            <span className="mp-ring" style={{ "--p": `${Math.round((1 - used) * 100)}` } as React.CSSProperties}><b>{daysLeft === null ? "—" : Math.max(daysLeft, 0)}</b></span>
            <div><small>Days left</small><strong>{active?.membership_plans?.name ?? "No plan"}</strong></div>
          </div>
          <div className="mp-stat"><span className="mp-stat-icon"><Activity size={17} /></span><div><small>Visits, 30 days</small><strong>{stats.last30}</strong></div></div>
          <div className="mp-stat"><span className="mp-stat-icon"><Flame size={17} /></span><div><small>Weekly streak</small><strong>{stats.streak} wk{stats.streak === 1 ? "" : "s"}</strong></div></div>
          <div className="mp-stat"><span className="mp-stat-icon"><Clock size={17} /></span><div><small>Last visit</small><strong>{stats.lastVisit ? ago(stats.lastVisit) : "Never"}</strong></div></div>
          <div className="mp-stat"><span className="mp-stat-icon"><Wallet size={17} /></span><div><small>Total paid</small><strong>{formatINR(totalPaid)}</strong></div></div>
        </div>
      </header>

      {/* ── Alerts ── */}
      {active && daysLeft !== null && daysLeft <= 7 && (
        <div className={`mp-alert mp-alert--${daysLeft < 0 ? "red" : "amber"}`}>
          <AlertTriangle size={16} />
          <span>{daysLeft < 0 ? `Membership expired ${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} ago.` : daysLeft === 0 ? "Membership ends today." : `Membership ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`}</span>
          {wa && <a href={waLink(member.phone, renewMsg)!} target="_blank" rel="noreferrer" className="mp-alert-link"><MessageCircle size={14} /> Remind on WhatsApp</a>}
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setRenewSheetOpen(true)}><RefreshCw size={13} /> Renew</button>
        </div>
      )}

      {/* ── Tabs ── */}
      <nav className="mp-tabs" role="tablist" aria-label="Member sections">
        {TAB_META.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            <t.icon size={15} />{t.label}
            {counts[t.key] ? <span className="mp-count">{counts[t.key]}</span> : null}
          </button>
        ))}
        {tab === "overview" && (
          <button type="button" className="mp-tabs-edit" data-on={editing} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
            {editing ? <CheckIcon size={15} strokeWidth={2.6} /> : <LayoutGrid size={15} />}{editing ? "Done" : "Edit layout"}
          </button>
        )}
      </nav>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <>
          {editing && (
            <div className="mp-editbar" role="status">
              <GripVertical size={14} aria-hidden />
              <span>Drag the handle to move a card. S, M, L and Full set its width.</span>
              {layout.hidden.filter((h) => widgets[h]).map((h) => (
                <button key={h} type="button" className="mp-restore" onClick={() => saveLayout({ ...layout, hidden: layout.hidden.filter((x) => x !== h) })}>
                  <Plus size={12} /> {WIDGET_LABEL[h]}
                </button>
              ))}
              <button type="button" className="mp-reset" onClick={() => saveLayout(DEFAULT_LAYOUT)}><RotateCcw size={13} /> Reset layout</button>
            </div>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shownWidgets} strategy={rectSortingStrategy}>
              <div className="mp-wgrid" data-editing={editing}>
                {shownWidgets.map((wid) => (
                  <WTile key={wid} id={wid} span={layout.sizes[wid] ?? DEFAULT_LAYOUT.sizes[wid]} editing={editing}
                    onSize={(sz) => saveLayout({ ...layout, sizes: { ...layout.sizes, [wid]: sz } })}
                    onHide={() => saveLayout({ ...layout, hidden: [...layout.hidden, wid] })}>
                    {widgets[wid]}
                  </WTile>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {/* ── Diet ── */}
      {tab === "diet" && (
        dietPlans.length === 0 ? (
          <div className="mp-card mp-empty">
            <span className="mp-empty-icon mp-empty-icon--green"><Salad size={20} /></span>
            <strong>No diet plans yet</strong>
            <p>Generate a plan from {first}&apos;s health profile, or build one by hand.</p>
            <Link href={dietHref} className="ps-btn ps-btn--primary ps-btn--sm"><Plus size={14} /> New plan</Link>
          </div>
        ) : (
          <div className="mp-grid">
            {dietPlans.map((dp) => (
              <article key={dp.id} className="mp-plan mp-plan--diet" data-active={dp.status === "active"}>
                <Link href={`/dashboard/diet/${dp.id}`} className="mp-plan-link">
                  <div className="mp-plan-top">
                    <span className="mp-plan-icon"><Salad size={17} /></span>
                    <span className={`mp-pill mp-pill--${dp.status === "active" ? "green" : dp.status === "draft" ? "blue" : "grey"}`}>{dp.status === "active" ? "Current" : cap(dp.status)}</span>
                  </div>
                  <div className="mp-plan-kcal">{dp.target_kcal.toLocaleString("en-IN")}<em>kcal / day</em></div>
                  <div className="mp-plan-sub">{MODE_LABELS[dp.plan_mode] ?? cap(dp.plan_mode)} · version {dp.version_number}</div>
                  <div className="mp-plan-meta">
                    <span><CalendarDays size={12} />{dp.plan_days} days from {formatDate(dp.start_date || dp.valid_from || dp.created_at)}</span>
                    <span>Created {formatDate(dp.created_at)}</span>
                  </div>
                </Link>
                <div className="mp-plan-actions">
                  <button type="button" onClick={() => openCopy("diet", dp.id)}><Copy size={14} /> Copy</button>
                  <Link href={`/dashboard/diet/${dp.id}/edit`}><Pencil size={14} /> Edit</Link>
                  <Link href={`/dashboard/diet/${dp.id}`}>Open <ChevronRight size={14} /></Link>
                </div>
              </article>
            ))}
            <Link href={dietHref} className="mp-plan mp-plan--new"><Plus size={20} /><strong>New version</strong><small>Start from the latest profile</small></Link>
          </div>
        )
      )}

      {/* ── Workout ── */}
      {tab === "workout" && (
        assignedPrograms.length === 0 ? (
          <div className="mp-card mp-empty">
            <span className="mp-empty-icon mp-empty-icon--purple"><Dumbbell size={20} /></span>
            <strong>No workout assigned yet</strong>
            <p>Assign a program from your library to {first}.</p>
            <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setAssignSheetOpen(true)}><Plus size={14} /> Assign program</button>
          </div>
        ) : (
          <div className="mp-grid">
            {assignedPrograms.map((ap) => {
              const wp = ap.workout_programs;
              return (
                <article key={ap.id} className="mp-plan mp-plan--workout" data-active={ap.status === "active"}>
                  <Link href={`/dashboard/workouts/${ap.program_id}`} className="mp-plan-link">
                    <div className="mp-plan-top">
                      <span className="mp-plan-icon"><Dumbbell size={17} /></span>
                      <span className={`mp-pill mp-pill--${ap.status === "active" ? "green" : "grey"}`}>{ap.status === "active" ? "Current" : cap(ap.status)}</span>
                    </div>
                    <div className="mp-plan-name">{wp?.name ?? "Program"}</div>
                    <div className="mp-plan-tags">
                      {wp && <span className={`ps-badge ${GOAL_BADGE[wp.goal as keyof typeof GOAL_BADGE] ?? ""}`}>{WORKOUT_GOAL_LABELS[wp.goal as keyof typeof WORKOUT_GOAL_LABELS] ?? wp.goal}</span>}
                      {wp && <span className="ps-badge">{DIFFICULTY_LABELS[wp.difficulty as keyof typeof DIFFICULTY_LABELS] ?? wp.difficulty}</span>}
                    </div>
                    <div className="mp-plan-meta">
                      {wp && <span><Dumbbell size={12} />{wp.days_per_week} days/week · {wp.duration_weeks} weeks</span>}
                      <span>Since {formatDate(ap.valid_from, { year: true })}</span>
                    </div>
                  </Link>
                  <div className="mp-plan-actions">
                    <button type="button" onClick={() => openCopy("workout", ap.id)}><Copy size={14} /> Copy</button>
                    {ap.status === "active" && <button type="button" onClick={() => setAssignSheetOpen(true)}><RefreshCw size={14} /> Change</button>}
                    <Link href={`/dashboard/workouts/${ap.program_id}`}>Open <ChevronRight size={14} /></Link>
                  </div>
                </article>
              );
            })}
            <button type="button" className="mp-plan mp-plan--new" onClick={() => setAssignSheetOpen(true)}><Plus size={20} /><strong>Assign program</strong><small>Replaces the current one</small></button>
          </div>
        )
      )}

      {/* ── Classes ── */}
      {tab === "classes" && (
        <section className="mp-card mp-list">
          <div className="mp-card-h">
            <h2><BookOpen size={15} /> Booked classes</h2>
            <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm" onClick={() => setBookClassSheetOpen(true)}><Plus size={13} /> Book a class</button>
          </div>
          {classBookings.length === 0 ? (
            <div className="mp-empty mp-empty--flat"><span className="mp-empty-icon"><BookOpen size={20} /></span><strong>No class bookings yet</strong><p>Book {first} into a class from here.</p></div>
          ) : classBookings.map((b) => {
            const c = b.classes;
            return (
              <Link key={b.id} href="/dashboard/classes" className="mp-row">
                <span className="mp-row-swatch" style={{ background: c?.color || "var(--accent)" }} />
                <div className="mp-row-text"><strong>{c?.name ?? "Class"}</strong><small>{[c?.trainer_name && `with ${c.trainer_name}`, c?.duration_mins && `${c.duration_mins} min`].filter(Boolean).join(" · ")}</small></div>
                <div className="mp-row-right"><strong>{formatDate(b.booked_for)}</strong><small>{c ? `${c.schedule_day.slice(0, 3)} · ${fmt12(c.start_time)}` : ""}</small></div>
                <ChevronRight size={16} className="mp-chev" />
              </Link>
            );
          })}
        </section>
      )}

      {/* ── Payments ── */}
      {tab === "payments" && (
        <>
          <div className="mp-summary">
            <div><small>Total paid</small><strong>{formatINR(totalPaid)}</strong></div>
            <div><small>Payments</small><strong>{payments.length}</strong></div>
            <div><small>Last payment</small><strong>{payments[0] ? formatDate(payments[0].paid_at, { year: true }) : "—"}</strong></div>
          </div>
          <section className="mp-card mp-list">
            {payments.length === 0 ? (
              <div className="mp-empty mp-empty--flat"><span className="mp-empty-icon"><Wallet size={20} /></span><strong>No payments yet</strong><p>Payments recorded for {first} will show here.</p></div>
            ) : payments.map((p) => {
              const receipt = waLink(member.phone, `Hi ${first}, we've received your payment of ${formatINR(p.total_paise)} on ${formatDate(p.paid_at, { year: true })}${p.method ? ` via ${METHOD_LABELS[p.method] ?? p.method}` : ""}. Thank you!`);
              return (
                <div key={p.id} className="mp-row">
                  <span className="mp-row-icon"><Receipt size={16} /></span>
                  <div className="mp-row-text"><strong>{p.notes || "Payment"}</strong><small>{formatDate(p.paid_at, { year: true })}{p.method ? ` · ${METHOD_LABELS[p.method] ?? p.method}` : ""}</small></div>
                  <div className="mp-row-right"><strong className="mp-amount">{formatINR(p.total_paise)}</strong>{p.status && p.status !== "paid" && <small>{cap(p.status)}</small>}</div>
                  {receipt && <a href={receipt} target="_blank" rel="noreferrer" className="mp-icon" title="Send receipt on WhatsApp" aria-label="Send receipt on WhatsApp"><MessageCircle size={15} /></a>}
                </div>
              );
            })}
          </section>
        </>
      )}

      {/* ── Visits ── */}
      {tab === "visits" && (
        <>
          <div className="mp-summary">
            <div><small>Last 30 days</small><strong>{stats.last30} visits</strong></div>
            <div><small>Weekly streak</small><strong>{stats.streak} wk{stats.streak === 1 ? "" : "s"}</strong></div>
            <div><small>Avg session</small><strong>{stats.avg ? (stats.avg < 60 ? `${stats.avg}m` : `${Math.floor(stats.avg / 60)}h ${stats.avg % 60}m`) : "—"}</strong></div>
          </div>
          <section className="mp-card" style={{ marginBottom: 14 }}>
            <div className="mp-card-h"><h2><Activity size={15} /> Last 12 weeks</h2></div>
            <Heatmap days={heat} />
          </section>
          <section className="mp-card mp-list">
            {attendance.length === 0 ? (
              <div className="mp-empty mp-empty--flat"><span className="mp-empty-icon"><UserCheck size={20} /></span><strong>No visits yet</strong><p>Check-ins will appear once {first} starts coming in.</p></div>
            ) : attendance.map((a) => (
              <div key={a.id} className="mp-row" data-live={!a.check_out_at}>
                <span className="mp-row-icon"><LogIn size={15} /></span>
                <div className="mp-row-text"><strong>{formatDate(a.check_in_at, { weekday: true })}</strong><small>{formatTime(a.check_in_at)}{a.check_out_at ? ` → ${formatTime(a.check_out_at)}` : ""}{a.method ? ` · ${cap(a.method)}` : ""}</small></div>
                {a.check_out_at ? <span className="mp-pill">{duration(a.check_in_at, a.check_out_at)}</span> : <span className="mp-live mp-live--soft"><i />In gym</span>}
              </div>
            ))}
          </section>
        </>
      )}

      {/* ── Phone action bar ── */}
      <div className="mp-bottombar">
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="mp-bb-btn" aria-label="WhatsApp"><MessageCircle size={18} /></a>}
        <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setRenewSheetOpen(true)}><RefreshCw size={15} /> {active ? "Renew" : "Add plan"}</button>
        <button type="button" className="ps-btn ps-btn--primary" onClick={toggleCheckIn} disabled={busy}>
          {openVisit ? <LogOut size={15} /> : <LogIn size={15} />} {openVisit ? "Check out" : "Check in"}
        </button>
      </div>

      {toast}

      {renewSheetOpen && (
        <RenewalSheet
          member={member}
          currentPlan={active?.membership_plans ? { id: active.id, name: active.membership_plans.name, duration_days: active.membership_plans.duration_days, price_paise: 0, plan_type: "duration" } : null}
          onClose={() => setRenewSheetOpen(false)}
          onRenewed={async () => { setRenewSheetOpen(false); await reloadMemberships(); show("Membership renewed"); }}
        />
      )}
      {assignSheetOpen && (
        <AssignProgramSheet memberId={member.id} orgId={member.org_id}
          onClose={() => setAssignSheetOpen(false)}
          onAssigned={async () => { setAssignSheetOpen(false); await loadWorkouts(); show("Program assigned"); }} />
      )}
      {bookClassSheetOpen && (
        <BookClassSheet memberId={member.id} orgId={member.org_id}
          onClose={() => setBookClassSheetOpen(false)}
          onBooked={async () => { setBookClassSheetOpen(false); await loadClasses(); show("Class booked"); }} />
      )}

      <CopyPlanSheet
        source={copy ? { id: member.id, full_name: member.full_name, phone: member.phone, hasDiet: !!activeDiet, hasWorkout: !!activeProgram } : null}
        members={copyMembers ?? []}
        orgId={member.org_id}
        initialKind={copy?.kind}
        initialPlanId={copy?.planId}
        onClose={() => setCopy(null)}
        onDone={(msg) => { setCopy(null); setCopyMembers(null); show(msg); }}
        onError={(msg) => show(msg, "error")}
      />
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const MP_CSS = `
.ps-page.mp { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.mp { --mp-line: var(--separator); --mp-soft: #f5f6f9; }
.mp-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.mp-muted { color: var(--text-tertiary); font-size: 12.5px; }

.mp-crumbs { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-tertiary); margin-bottom: 14px; min-width: 0; }
.mp-crumbs a { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); text-decoration: none; font-weight: 550; }
.mp-crumbs b { color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Hero */
.mp-hero { position: relative; border-radius: 22px; padding: 22px 22px 18px; color: #fff; overflow: hidden; isolation: isolate; box-shadow: 0 18px 40px -18px rgba(10, 60, 160, 0.55); }
.mp-hero-bg { position: absolute; inset: 0; z-index: -1; background:
  radial-gradient(600px 220px at 85% -10%, rgba(94, 92, 230, 0.75), transparent 60%),
  radial-gradient(500px 260px at 10% 120%, rgba(48, 176, 199, 0.55), transparent 60%),
  linear-gradient(120deg, #0a3d91 0%, #0a66d6 45%, #3c4fe0 100%); }
.mp-hero[data-tone="amber"] .mp-hero-bg { background: radial-gradient(600px 220px at 85% -10%, rgba(255, 159, 10, 0.55), transparent 60%), linear-gradient(120deg, #0a3d91, #0a66d6 55%, #5e5ce6); }
.mp-hero[data-tone="red"] .mp-hero-bg { background: radial-gradient(600px 220px at 85% -10%, rgba(255, 59, 48, 0.5), transparent 60%), linear-gradient(120deg, #2b2f6b, #3c3f9e 55%, #6b3fa0); }
.mp-hero-top { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.mp-photo { position: relative; width: 92px; height: 92px; padding: 4px; border-radius: 50%; flex-shrink: 0; background: conic-gradient(#34c759, #30d5c8, #34c759); }
.mp-photo[data-tone="amber"] { background: conic-gradient(#ff9f0a, #ffd60a, #ff9f0a); }
.mp-photo[data-tone="red"] { background: conic-gradient(#ff3b30, #ff6b6b, #ff3b30); }
.mp-photo[data-tone="grey"] { background: rgba(255,255,255,0.35); }
.mp-photo label { position: relative; display: block; width: 84px; height: 84px; border-radius: 50%; overflow: hidden; cursor: pointer; border: 3px solid rgba(255,255,255,0.9); box-sizing: content-box; margin: -3px; }
.mp-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mp-photo .ps-avatar { border-radius: 50%; }
.mp-photo-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.42); color: #fff; opacity: 0; transition: opacity 150ms ease; }
.mp-photo label:hover .mp-photo-overlay, .mp-photo-overlay[data-busy="true"] { opacity: 1; }
.mp-photo-x { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; border: none; background: #fff; color: var(--text-secondary); display: grid; place-items: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
.mp-hero-id { flex: 1; min-width: 220px; }
.mp-hero-id h1 { margin: 6px 0 6px; font-size: 30px; line-height: 1.1; font-weight: 750; letter-spacing: -0.03em; color: #fff; }
.mp-hero-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.mp-hero-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13.5px; color: rgba(255,255,255,0.86); }
.mp-hero-meta span { display: inline-flex; align-items: center; gap: 6px; }
.mp-status { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 650; background: rgba(255,255,255,0.18); color: #fff; backdrop-filter: blur(8px); }
.mp-status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.mp-status--green i { background: #4cd964; } .mp-status--amber i { background: #ffcc00; } .mp-status--red i { background: #ff6b6b; } .mp-status--grey i { background: #d1d1d6; }
.mp-status--soft { backdrop-filter: none; }
.mp-status--soft.mp-status--green { background: #e6f6ec; color: #1f8a3b; } .mp-status--soft.mp-status--amber { background: #fff1de; color: #b45309; }
.mp-status--soft.mp-status--red { background: #ffe9ec; color: #c4001a; } .mp-status--soft.mp-status--grey { background: #f0f0f3; color: #6e6e73; }
.mp-status--soft i { background: currentColor !important; }
.mp-glass-tag { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22); }
.mp-live { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 650; background: #34c759; color: #fff; }
.mp-live i { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: mp-pulse 1.6s ease-in-out infinite; }
.mp-live--soft { background: #e6f6ec; color: #1f8a3b; } .mp-live--soft i { background: #34c759; }
@keyframes mp-pulse { 50% { opacity: 0.35; } }
.mp-hero-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.mp-quick { display: flex; gap: 6px; margin-right: 4px; }
.mp-round { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.24); transition: background 150ms; }
.mp-round:hover { background: rgba(255,255,255,0.26); }
.mp-glass { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.26); background: rgba(255,255,255,0.14); color: #fff; font: inherit; font-size: 14px; font-weight: 620; cursor: pointer; text-decoration: none; backdrop-filter: blur(10px); transition: background 150ms, transform 120ms; }
.mp-glass:hover { background: rgba(255,255,255,0.24); }
.mp-glass:active { transform: scale(0.97); }
.mp-glass--solid { background: #fff; color: #0a4fb0; border-color: #fff; }
.mp-glass--solid:hover { background: #eef4ff; }
.mp-glass--icon { width: 38px; padding: 0; justify-content: center; }
.mp-menu-anchor { position: relative; }
.mp-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; min-width: 220px; padding: 6px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px rgba(15,23,42,0.06), 0 18px 40px -10px rgba(15,23,42,0.3); }
.mp-menu button, .mp-menu a { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: none; background: none; border-radius: 9px; font: inherit; font-size: 14px; color: var(--text-primary); text-decoration: none; cursor: pointer; text-align: left; }
.mp-menu button:hover, .mp-menu a:hover { background: var(--mp-soft); }
.mp-menu svg { color: var(--text-tertiary); }

.mp-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
.mp-stat { display: flex; align-items: center; gap: 11px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18); backdrop-filter: blur(10px); min-width: 0; }
.mp-stat > div { min-width: 0; display: flex; flex-direction: column; }
.mp-stat small { font-size: 11.5px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(255,255,255,0.75); }
.mp-stat strong { font-size: 17px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-stat-icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,0.18); flex-shrink: 0; }
.mp-ring { --p: 0; width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: conic-gradient(#fff calc(var(--p) * 1%), rgba(255,255,255,0.22) 0); }
.mp-ring b { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; background: #2453c9; }

/* Alerts */
.mp-alert { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 14px; padding: 11px 14px; border-radius: 14px; font-size: 13.5px; font-weight: 550; }
.mp-alert span { flex: 1; min-width: 180px; }
.mp-alert--amber { background: #fff6e8; color: #8a4500; border: 1px solid #ffe0b0; }
.mp-alert--red { background: #fff0f1; color: #a3001a; border: 1px solid #ffd0d6; }
.mp-alert-link { display: inline-flex; align-items: center; gap: 5px; color: #1f8a3b; font-weight: 650; text-decoration: none; font-size: 13px; }

/* Tabs */
.mp-tabs { position: sticky; top: 0; z-index: 20; display: flex; gap: 4px; margin: 16px 0 14px; padding: 5px; border-radius: 14px; background: rgba(255,255,255,0.88); border: 1px solid var(--mp-line); backdrop-filter: blur(14px) saturate(180%); overflow-x: auto; scrollbar-width: none; }
.mp-tabs::-webkit-scrollbar { display: none; }
.mp-tabs button { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: background 150ms, color 150ms; }
.mp-tabs button:hover { background: var(--mp-soft); color: var(--text-primary); }
.mp-tabs button[aria-selected="true"] { background: linear-gradient(135deg, #0a66d6, #3c4fe0); color: #fff; box-shadow: 0 6px 14px -6px rgba(10,102,214,0.6); }
.mp-count { min-width: 20px; height: 19px; padding: 0 6px; border-radius: 10px; font-size: 11.5px; font-weight: 700; display: inline-grid; place-items: center; background: var(--mp-soft); color: var(--text-tertiary); }
.mp-tabs button[aria-selected="true"] .mp-count { background: rgba(255,255,255,0.24); color: #fff; }

/* Cards */
.mp-card { background: #fff; border: 1px solid var(--mp-line); border-radius: 18px; padding: 16px 18px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
.mp-card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.mp-card-h h2 { margin: 0; display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 680; letter-spacing: -0.01em; }
.mp-card-h h2 svg { color: var(--accent); }
.mp-overview { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.mp-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.mp-label { font-size: 11.5px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 6px; }

.mp-ms { display: flex; flex-direction: column; gap: 8px; }
.mp-ms-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mp-ms-top > div { display: flex; flex-direction: column; }
.mp-ms-top strong { font-size: 17px; }
.mp-ms-top small { font-size: 13px; color: var(--text-secondary); }
.mp-bar { height: 8px; border-radius: 6px; background: var(--mp-soft); overflow: hidden; }
.mp-bar span { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #34c759, #30b0c7); }
.mp-bar[data-tone="amber"] span { background: linear-gradient(90deg, #ff9f0a, #ffcc00); }
.mp-bar[data-tone="red"] span { background: linear-gradient(90deg, #ff3b30, #ff6b6b); }
.mp-history { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--mp-line); }
.mp-hrow { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 10px; align-items: center; padding: 6px 0; font-size: 13.5px; }
.mp-hrow small { color: var(--text-tertiary); font-size: 12.5px; }
.mp-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 11px; font-size: 11.5px; font-weight: 650; background: #f0f0f3; color: #6e6e73; white-space: nowrap; }
.mp-pill--green { background: #e6f6ec; color: #1f8a3b; } .mp-pill--blue { background: #e7f0ff; color: #0062c4; } .mp-pill--grey { background: #f0f0f3; color: #6e6e73; }

.mp-heat { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.mp-heat-days { display: grid; grid-template-rows: repeat(7, 14px); gap: 4px; font-size: 10px; color: var(--text-tertiary); line-height: 14px; }
.mp-heat-grid { display: flex; gap: 4px; flex: 1; }
.mp-heat-col { display: grid; grid-template-rows: repeat(7, 14px); gap: 4px; flex: 1; min-width: 14px; }
.mp-heat-col span, .mp-heat-legend i { border-radius: 4px; background: #eef0f4; }
.mp-heat-col span[data-level="1"], .mp-heat-legend i[data-level="1"] { background: #7ed9a0; }
.mp-heat-col span[data-level="2"], .mp-heat-legend i[data-level="2"] { background: #1f9d48; }
.mp-heat-col span[data-level="f"] { background: transparent; }
.mp-heat-legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 10px; font-size: 11px; color: var(--text-tertiary); }
.mp-heat-legend i { width: 12px; height: 12px; display: inline-block; }

.mp-programs { display: grid; gap: 10px; }
.mp-prog { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--mp-line); }
.mp-prog--diet { background: linear-gradient(90deg, #f1fbf4, #fff 70%); }
.mp-prog--workout { background: linear-gradient(90deg, #f8f2fd, #fff 70%); }
.mp-prog-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.mp-prog--diet .mp-prog-icon { background: #e1f5e8; color: #1f8a3b; }
.mp-prog--workout .mp-prog-icon { background: #f1e5fb; color: #8944ab; }
.mp-prog-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mp-prog-text strong { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-prog-text small { font-size: 12.5px; color: var(--text-tertiary); }
.mp-prog-actions { display: flex; gap: 2px; }
.mp-icon { width: 34px; height: 34px; border-radius: 9px; border: none; background: none; display: inline-grid; place-items: center; color: var(--text-tertiary); cursor: pointer; flex-shrink: 0; text-decoration: none; }
.mp-icon:hover { background: var(--mp-soft); color: var(--text-primary); }

.mp-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
.mp-metric { padding: 10px 12px; border-radius: 12px; background: var(--mp-soft); display: flex; flex-direction: column; gap: 2px; }
.mp-metric small { font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
.mp-metric strong { font-size: 20px; font-weight: 720; }
.mp-metric em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--text-tertiary); margin-left: 2px; }
.mp-metric > span { font-size: 11.5px; font-weight: 650; }
.mp-metric[data-band="Healthy"] { background: #edf8f1; } .mp-metric[data-band="Healthy"] > span { color: #1f8a3b; }
.mp-metric[data-band="Over"], .mp-metric[data-band="Under"] { background: #fff5e6; } .mp-metric[data-band="Over"] > span, .mp-metric[data-band="Under"] > span { color: #b45309; }
.mp-metric[data-band="High"] { background: #fff0f1; } .mp-metric[data-band="High"] > span { color: #c4001a; }
.mp-notes p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-secondary); white-space: pre-line; }

/* Plan cards */
.mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.mp-plan { position: relative; display: flex; flex-direction: column; border-radius: 18px; border: 1px solid var(--mp-line); background: #fff; overflow: hidden; transition: box-shadow 160ms, transform 160ms, border-color 160ms; }
.mp-plan:hover { box-shadow: 0 12px 28px -14px rgba(15,23,42,0.28); transform: translateY(-1px); }
.mp-plan::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: #e4e6eb; }
.mp-plan--diet[data-active="true"]::before { background: linear-gradient(90deg, #34c759, #30b0c7); }
.mp-plan--workout[data-active="true"]::before { background: linear-gradient(90deg, #af52de, #5856d6); }
.mp-plan[data-active="true"] { border-color: transparent; box-shadow: 0 0 0 1px rgba(15,23,42,0.06), 0 10px 24px -14px rgba(15,23,42,0.3); }
.mp-plan-link { display: flex; flex-direction: column; gap: 6px; padding: 16px 16px 12px; color: inherit; text-decoration: none; flex: 1; }
.mp-plan-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.mp-plan-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; }
.mp-plan--diet .mp-plan-icon { background: #e6f6ec; color: #1f8a3b; }
.mp-plan--workout .mp-plan-icon { background: #f3eafb; color: #8944ab; }
.mp-plan-kcal { font-size: 26px; font-weight: 760; letter-spacing: -0.02em; }
.mp-plan-kcal em { font-style: normal; font-size: 13px; font-weight: 600; color: var(--text-tertiary); margin-left: 6px; }
.mp-plan-name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.mp-plan-sub { font-size: 13.5px; color: var(--text-secondary); }
.mp-plan-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.mp-plan-meta { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; font-size: 12.5px; color: var(--text-tertiary); }
.mp-plan-meta span { display: inline-flex; align-items: center; gap: 5px; }
.mp-plan-actions { display: flex; border-top: 1px solid var(--mp-line); }
.mp-plan-actions > * { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; text-decoration: none; }
.mp-plan-actions > * + * { border-left: 1px solid var(--mp-line); }
.mp-plan-actions > *:hover { background: var(--mp-soft); color: var(--accent); }
.mp-plan--new { align-items: center; justify-content: center; gap: 4px; min-height: 180px; border-style: dashed; border-width: 1.5px; color: var(--accent); background: #fafbfd; font: inherit; cursor: pointer; text-decoration: none; }
.mp-plan--new::before { display: none; }
.mp-plan--new strong { font-size: 15px; } .mp-plan--new small { font-size: 12.5px; color: var(--text-tertiary); }

/* Lists */
.mp-list { padding: 6px 6px; }
.mp-list > .mp-card-h { padding: 10px 12px 4px; }
.mp-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; color: inherit; text-decoration: none; }
.mp-row + .mp-row { box-shadow: 0 -1px 0 var(--mp-line); }
a.mp-row:hover { background: var(--mp-soft); }
.mp-row[data-live="true"] { background: #f1fbf4; }
.mp-row-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--mp-soft); color: var(--text-secondary); flex-shrink: 0; }
.mp-row-swatch { width: 6px; align-self: stretch; border-radius: 4px; flex-shrink: 0; }
.mp-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mp-row-text strong { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-row-text small, .mp-row-right small { font-size: 12.5px; color: var(--text-tertiary); }
.mp-row-right { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
.mp-row-right strong { font-size: 14px; }
.mp-amount { font-variant-numeric: tabular-nums; font-size: 15px !important; }
.mp-chev { color: var(--text-tertiary); }
.mp-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.mp-summary > div { padding: 14px 16px; border-radius: 16px; background: #fff; border: 1px solid var(--mp-line); display: flex; flex-direction: column; gap: 2px; }
.mp-summary > div:first-child { background: linear-gradient(135deg, #0a66d6, #3c4fe0); color: #fff; border-color: transparent; }
.mp-summary small { font-size: 11.5px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
.mp-summary strong { font-size: 20px; font-weight: 740; }

.mp-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 48px 20px; }
.mp-empty--flat { padding: 36px 16px; }
.mp-empty strong { font-size: 15.5px; }
.mp-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); max-width: 340px; }
.mp-empty-icon { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: var(--mp-soft); color: var(--text-tertiary); margin-bottom: 4px; }
.mp-empty-icon--green { background: #e6f6ec; color: #1f8a3b; } .mp-empty-icon--purple { background: #f3eafb; color: #8944ab; }

.mp-bottombar { display: none; }

@media (max-width: 1100px) {
  .mp-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mp-overview { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .ps-page.mp { padding: 10px 10px calc(84px + env(safe-area-inset-bottom, 0px)) !important; }
  .mp-crumbs { margin-bottom: 10px; }
  .mp-hero { padding: 16px; border-radius: 20px; }
  .mp-hero-top { gap: 14px; }
  .mp-photo { width: 68px; height: 68px; padding: 3px; }
  .mp-photo label { width: 62px; height: 62px; }
  .mp-photo .ps-avatar { width: 62px !important; height: 62px !important; font-size: 22px !important; }
  .mp-hero-id { min-width: 0; flex: 1 1 calc(100% - 90px); }
  .mp-hero-id h1 { font-size: 23px; }
  .mp-hero-meta { font-size: 12.5px; gap: 4px 12px; }
  .mp-hero-meta span:nth-child(n+3) { display: none; }
  .mp-hero-actions { width: 100%; margin-left: 0; }
  .mp-hero-actions .mp-glass:not(.mp-glass--icon) { flex: 1; justify-content: center; }
  .mp-hide-sm { display: none !important; }
  .mp-stats { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 8px; margin: 14px -16px 0; padding: 0 16px; scrollbar-width: none; }
  .mp-stats::-webkit-scrollbar { display: none; }
  .mp-stat { flex: 0 0 auto; min-width: 150px; scroll-snap-align: start; }
  .mp-tabs { top: 0; margin: 12px -10px 12px; border-radius: 0; border-left: none; border-right: none; padding: 6px 10px; }
  .mp-tabs button { height: 36px; padding: 0 12px; font-size: 13.5px; }
  .mp-card { padding: 14px; border-radius: 16px; }
  .mp-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mp-metric strong { font-size: 17px; }
  .mp-grid { grid-template-columns: minmax(0, 1fr); }
  .mp-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .mp-summary > div { padding: 10px 12px; }
  .mp-summary strong { font-size: 15px; }
  .mp-hrow { grid-template-columns: minmax(0,1fr) auto; }
  .mp-hrow small { grid-column: 1; grid-row: 2; }
  .mp-menu { position: fixed; left: 10px; right: 10px; top: auto; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
  .mp-bottombar { position: fixed; left: 0; right: 0; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px)); z-index: 40; display: flex; gap: 8px; padding: 10px 12px; background: rgba(255,255,255,0.92); border-top: 1px solid var(--mp-line); backdrop-filter: blur(16px) saturate(180%); }
  .mp-bottombar .ps-btn { flex: 1; height: 46px; justify-content: center; border-radius: 12px; }
  .mp-bb-btn { width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; background: #e6f6ec; color: #1f8a3b; flex-shrink: 0; }
}
/* Editable overview */
.mp-wgrid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 2px; column-gap: 14px; row-gap: 0; grid-auto-flow: row dense; align-items: start; }
.mp-wtile-in { position: relative; }
.mp-wtile { position: relative; min-width: 0; }

.mp-span-4 { grid-column: span 4; } .mp-span-6 { grid-column: span 6; } .mp-span-8 { grid-column: span 8; } .mp-span-12 { grid-column: span 12; }
.mp-wgrid[data-editing="true"] .mp-wtile-in > .mp-card { outline: 2px dashed #c9d6f2; outline-offset: -2px; }
.mp-wtile[data-dragging="true"] { z-index: 30; opacity: 0.92; }
.mp-wgrid[data-editing="true"] .mp-wtile-in > .mp-card { padding-top: 50px; }
.mp-wtools { left: 10px; justify-content: space-between; }
.mp-wtools .mp-wsizes { margin-right: auto; }
.mp-wtile[data-dragging="true"] .mp-card { box-shadow: 0 24px 50px -20px rgba(15,23,42,0.45); }
.mp-wtools { position: absolute; top: 10px; right: 10px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 3px; border-radius: 10px; background: #fff; box-shadow: 0 0 0 1px rgba(15,23,42,0.08), 0 6px 16px -6px rgba(15,23,42,0.25); }
.mp-wtool { width: 28px; height: 28px; border: none; border-radius: 7px; background: none; display: grid; place-items: center; color: var(--text-secondary); cursor: pointer; }
.mp-wtool:hover { background: var(--mp-soft); color: var(--text-primary); }
.mp-grip { cursor: grab; touch-action: none; } .mp-grip:active { cursor: grabbing; }
.mp-wsizes { display: flex; background: var(--mp-soft); border-radius: 7px; padding: 2px; }
.mp-wsizes button { height: 24px; min-width: 26px; padding: 0 6px; border: none; border-radius: 5px; background: none; font: inherit; font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); cursor: pointer; }
.mp-wsizes button[aria-pressed="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.mp-editbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding: 9px 12px; border-radius: 12px; background: #eef4ff; color: #0b4e98; font-size: 13px; }
.mp-editbar > span { flex: 1; min-width: 200px; }
.mp-restore { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 13px; border: 1px dashed #8fb3ea; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #0b5cc0; cursor: pointer; }
.mp-reset { display: inline-flex; align-items: center; gap: 5px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; }
.mp-tabs-edit { margin-left: auto; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border: 1px solid var(--mp-line) !important; border-radius: 10px; background: #fff !important; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary) !important; cursor: pointer; box-shadow: none !important; }
.mp-tabs-edit[data-on="true"] { background: var(--accent) !important; border-color: var(--accent) !important; color: #fff !important; }
@media (max-width: 1100px) {
  .mp-span-4 { grid-column: span 6; } .mp-span-8 { grid-column: span 12; }
}
@media (max-width: 760px) {
  .mp-wgrid { column-gap: 10px; }
  .mp-wgrid > .mp-wtile { grid-column: span 12; }
  .mp-wsizes { display: none; }
  .mp-tabs-edit { height: 36px; }
}
`;
