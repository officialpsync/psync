"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import {
  UserPlus, Wallet, UserCheck, BarChart2, ArrowUpRight, ArrowDownRight, Check, ChevronRight,
  ChevronUp, ChevronDown, Users, IndianRupee, CalendarDays, SlidersHorizontal, Sparkles, Activity,
  RotateCcw, ListChecks, PhoneCall, GripVertical, EyeOff, LayoutGrid, Salad, Dumbbell, Ticket,
  BookOpen, Settings, Target, CalendarClock, Clock, Sun, IndianRupee as RupeeIcon, Receipt,
  TrendingUp, UserPlus2, Gauge, ClipboardCheck,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Skeleton, Avatar } from "./components/ui";
import { Sheet } from "./components/Sheet";
import { DesignStyles } from "./components/DesignSystem";
import { useRole } from "./components/useRole";

/* ───────────────────────── Types ───────────────────────── */

type Stats = {
  // today
  revenueToday: number; paymentsToday: number; checkinsToday: number; newMembersToday: number;
  newLeadsToday: number; followupsDue: number; followupsOverdue: number; expiringToday: number; classesToday: number;
  // month to date
  revenueMtd: number; revenueMtdPrev: number; paymentsMtd: number;
  newMembersMtd: number; newMembersMtdPrev: number;
  checkinsMtd: number; checkinsMtdPrev: number;
  leadsMtd: number; leadsMtdPrev: number; conversionsMtd: number;
  activeMembers: number; activeLastMonth: number; expiring7: number;
};
type Point = { label: string; value: number };
type ExpiringRow = { id: string; end_date: string; members: { id: string; full_name: string } | null; membership_plans: { name: string } | null };
type PaymentRow = { id: string; total_paise: number; paid_at: string; method: string | null; members: { id: string; full_name: string } | null };
type VisitRow = { id: string; check_in_at: string; check_out_at: string | null; members: { id: string; full_name: string } | null };
type ClassRow = { id: string; name: string; trainer_name: string | null; start_time: string; duration_mins: number; color: string | null };
type TaskRow = { id: string; title: string; sub: string; overdue: boolean; href: string; kind: "followup" | "expiring" };
type Perms = Record<string, boolean> | null | undefined;
type Tone = "blue" | "green" | "purple" | "amber";

/* ───────────────────────── Number formatting ───────────────────────── */

// Indian units: K (thousand), L (lakh), Cr (crore). One decimal under 10, whole numbers above.
function compact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(Math.round(n));
  if (a < 1000) return `${sign}${a}`;
  const units: [number, string][] = [[1e7, "Cr"], [1e5, "L"], [1e3, "K"]];
  for (let i = 0; i < units.length; i++) {
    const [base, suffix] = units[i];
    if (a < base) continue;
    const x = a / base;
    const shown = x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
    // 99,960 would read "100K": promote to the next unit instead.
    if (i > 0 && shown * base >= units[i - 1][0]) return `${sign}1${units[i - 1][1]}`;
    return `${sign}${shown}${suffix}`;
  }
  return `${sign}${a}`;
}
const fullNum = (n: number) => Math.round(n).toLocaleString("en-IN");
const rupees = (paise: number) => Math.round(paise / 100);

/** A number that reads compact (4.6K) and reveals the full figure (4,590) on click. */
function Num({ v, money, full }: { v: number; money?: boolean; full?: boolean }) {
  const [open, setOpen] = useState(false);
  const value = money ? rupees(v) : Math.round(v);
  const prefix = money ? "₹" : "";
  const long = `${prefix}${fullNum(value)}`;
  if (full || Math.abs(value) < 1000) return <span className="dz-num">{long}</span>;
  return (
    <button
      type="button"
      className="dz-num dz-num--toggle"
      title={long}
      aria-label={`${long}. Toggle full figure`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
    >
      {open ? long : `${prefix}${compact(value)}`}
    </button>
  );
}

/* ───────────────────────── Catalogs ───────────────────────── */

type MetricId =
  | "revenue_today" | "payments_today" | "checkins_today" | "turnout_today" | "new_members_today"
  | "new_leads_today" | "followups_today" | "expiring_today" | "classes_today"
  | "revenue_mtd" | "avg_ticket_mtd" | "new_members_mtd" | "active_members" | "checkins_mtd"
  | "leads_mtd" | "conversions_mtd" | "renewals_7d";

type MetricDef = {
  id: MetricId; scope: "today" | "mtd"; label: string; tone: Tone; href: string; icon: React.ElementType;
  allowed: (p: Perms) => boolean;
};

const METRICS: MetricDef[] = [
  { id: "revenue_today", scope: "today", label: "Collected", tone: "blue", icon: RupeeIcon, href: "/dashboard/payments", allowed: (p) => !!(p?.payments || p?.reports) },
  { id: "payments_today", scope: "today", label: "Payments", tone: "blue", icon: Receipt, href: "/dashboard/payments", allowed: (p) => !!p?.payments },
  { id: "checkins_today", scope: "today", label: "Check-ins", tone: "green", icon: UserCheck, href: "/dashboard/attendance", allowed: (p) => !!p?.attendance },
  { id: "turnout_today", scope: "today", label: "Turnout", tone: "green", icon: Gauge, href: "/dashboard/attendance", allowed: (p) => !!p?.attendance },
  { id: "new_members_today", scope: "today", label: "New members", tone: "purple", icon: UserPlus, href: "/dashboard/members", allowed: (p) => !!p?.members },
  { id: "new_leads_today", scope: "today", label: "New leads", tone: "purple", icon: UserPlus2, href: "/dashboard/leads", allowed: (p) => !!p?.leads },
  { id: "followups_today", scope: "today", label: "Follow-ups due", tone: "amber", icon: PhoneCall, href: "/dashboard/leads", allowed: (p) => !!p?.leads },
  { id: "expiring_today", scope: "today", label: "Expiring today", tone: "amber", icon: Clock, href: "/dashboard/members?filter=expiring", allowed: (p) => !!p?.membership_plans },
  { id: "classes_today", scope: "today", label: "Classes", tone: "blue", icon: CalendarDays, href: "/dashboard/classes", allowed: (p) => !!p?.classes },

  { id: "revenue_mtd", scope: "mtd", label: "Revenue", tone: "blue", icon: RupeeIcon, href: "/dashboard/reports", allowed: (p) => !!(p?.payments || p?.reports) },
  { id: "avg_ticket_mtd", scope: "mtd", label: "Avg payment", tone: "blue", icon: Receipt, href: "/dashboard/payments", allowed: (p) => !!(p?.payments || p?.reports) },
  { id: "new_members_mtd", scope: "mtd", label: "New members", tone: "purple", icon: UserPlus, href: "/dashboard/members", allowed: (p) => !!p?.members },
  { id: "active_members", scope: "mtd", label: "Active members", tone: "green", icon: Users, href: "/dashboard/members?filter=active", allowed: (p) => !!p?.members },
  { id: "checkins_mtd", scope: "mtd", label: "Check-ins", tone: "green", icon: UserCheck, href: "/dashboard/attendance", allowed: (p) => !!p?.attendance },
  { id: "leads_mtd", scope: "mtd", label: "Leads", tone: "purple", icon: Target, href: "/dashboard/leads", allowed: (p) => !!p?.leads },
  { id: "conversions_mtd", scope: "mtd", label: "Converted", tone: "purple", icon: ClipboardCheck, href: "/dashboard/leads", allowed: (p) => !!p?.leads },
  { id: "renewals_7d", scope: "mtd", label: "Renewals due", tone: "amber", icon: TrendingUp, href: "/dashboard/members?filter=expiring", allowed: (p) => !!p?.membership_plans },
];
const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;

type ActionId =
  | "add_member" | "record_payment" | "check_in" | "leads" | "new_diet" | "new_workout"
  | "classes" | "plans" | "recipes" | "reports" | "staff" | "settings";

type ActionDef = { id: ActionId; label: string; sub: string; href: string; icon: React.ElementType; tone: Tone; allowed: (p: Perms, mgr: boolean) => boolean };

const ACTIONS: ActionDef[] = [
  { id: "add_member", label: "Add member", sub: "Register someone new", href: "/dashboard/members/new", icon: UserPlus, tone: "purple", allowed: (p) => !!p?.members },
  { id: "record_payment", label: "Record payment", sub: "Cash, UPI or card", href: "/dashboard/payments", icon: Wallet, tone: "blue", allowed: (p) => !!p?.payments },
  { id: "check_in", label: "Check in", sub: "Manual attendance", href: "/dashboard/attendance", icon: UserCheck, tone: "green", allowed: (p) => !!p?.attendance },
  { id: "leads", label: "Leads", sub: "Pipeline and follow-ups", href: "/dashboard/leads", icon: Target, tone: "purple", allowed: (p) => !!p?.leads },
  { id: "new_diet", label: "New diet plan", sub: "Generate or build", href: "/dashboard/diet/new", icon: Salad, tone: "purple", allowed: (p) => !!p?.diet },
  { id: "new_workout", label: "New workout", sub: "Build a program", href: "/dashboard/workouts/new", icon: Dumbbell, tone: "purple", allowed: (p) => !!p?.workouts },
  { id: "classes", label: "Class schedule", sub: "Book and manage", href: "/dashboard/classes", icon: CalendarDays, tone: "blue", allowed: (p) => !!p?.classes },
  { id: "plans", label: "Membership plans", sub: "Pricing and duration", href: "/dashboard/membership-plans", icon: Ticket, tone: "blue", allowed: (p) => !!p?.membership_plans },
  { id: "recipes", label: "Recipe library", sub: "Your gym recipes", href: "/dashboard/diet/recipes", icon: BookOpen, tone: "purple", allowed: (p) => !!p?.recipes },
  { id: "reports", label: "Reports", sub: "Revenue and retention", href: "/dashboard/reports", icon: BarChart2, tone: "blue", allowed: (p) => !!p?.reports },
  { id: "staff", label: "Staff", sub: "Roles and access", href: "/dashboard/staff", icon: Users, tone: "blue", allowed: (_p, mgr) => mgr },
  { id: "settings", label: "Settings", sub: "Gym and branches", href: "/dashboard/settings", icon: Settings, tone: "blue", allowed: (p, mgr) => mgr || !!p?.settings },
];
const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;
const MAX_ACTIONS = 8;

type WidgetId =
  | "today" | "mtd" | "revenue" | "turnout" | "tasks" | "checkins" | "expiring" | "payments"
  | "classes" | "activity" | "actions" | "setup";
type Span = 4 | 6 | 8 | 12;

const WIDGETS: { id: WidgetId; label: string; sub: string; sizes: Span[]; def: Span }[] = [
  { id: "today", label: "Today at a glance", sub: "Everything that happened today", sizes: [6, 12], def: 12 },
  { id: "mtd", label: "Month to date", sub: "This month vs the same days last month", sizes: [6, 12], def: 12 },
  { id: "revenue", label: "Revenue trend", sub: "Monthly collections", sizes: [6, 8, 12], def: 8 },
  { id: "turnout", label: "Today's turnout", sub: "Check-ins vs active members", sizes: [4, 6, 8, 12], def: 4 },
  { id: "tasks", label: "Today's updates", sub: "Follow-ups and renewals due", sizes: [4, 6, 8, 12], def: 4 },
  { id: "checkins", label: "Weekly check-ins", sub: "Last 7 days", sizes: [4, 6, 8, 12], def: 4 },
  { id: "expiring", label: "Expiring soon", sub: "Renewals due this week", sizes: [4, 6, 8, 12], def: 4 },
  { id: "payments", label: "Recent payments", sub: "Latest transactions", sizes: [4, 6, 8, 12], def: 4 },
  { id: "actions", label: "Quick actions", sub: "Your shortcuts", sizes: [4, 6, 8, 12], def: 4 },
  { id: "classes", label: "Today's classes", sub: "Schedule for today", sizes: [4, 6, 8, 12], def: 4 },
  { id: "activity", label: "Live activity", sub: "Recent check-ins", sizes: [4, 6, 8, 12], def: 4 },
  { id: "setup", label: "Setup checklist", sub: "Shown until setup is complete", sizes: [6, 12], def: 12 },
];
const WIDGET = Object.fromEntries(WIDGETS.map((w) => [w.id, w])) as Record<WidgetId, (typeof WIDGETS)[number]>;
const SIZE_LABEL: Record<Span, string> = { 4: "S", 6: "M", 8: "L", 12: "Full" };
const SIZE_HINT: Record<Span, string> = { 4: "One third", 6: "Half", 8: "Two thirds", 12: "Full width" };

/* ───────────────────────── Preferences ───────────────────────── */

type Prefs = {
  order: WidgetId[];
  hidden: WidgetId[];
  sizes: Partial<Record<WidgetId, Span>>;
  todayMetrics: MetricId[];   // visible, in order
  mtdMetrics: MetricId[];
  actions: ActionId[];
  fullNumbers: boolean;
  revenueMonths: 6 | 12;
};

const DEFAULT_PREFS: Prefs = {
  order: WIDGETS.map((w) => w.id),
  hidden: [],
  sizes: {},
  todayMetrics: ["revenue_today", "checkins_today", "new_members_today", "new_leads_today", "followups_today", "expiring_today"],
  mtdMetrics: ["revenue_mtd", "new_members_mtd", "active_members", "checkins_mtd", "leads_mtd", "renewals_7d"],
  actions: ["add_member", "record_payment", "check_in", "leads"],
  fullNumbers: false,
  revenueMonths: 6,
};
const STORAGE_KEY = "psync.dashboard.v2";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const s = JSON.parse(raw) as Partial<Prefs>;
    const known = (ids: unknown, valid: Set<string>) => (Array.isArray(ids) ? ids.filter((x) => valid.has(x)) : null);
    const wIds = new Set<string>(WIDGETS.map((w) => w.id));
    const mIds = new Set<string>(METRICS.map((m) => m.id));
    const aIds = new Set<string>(ACTIONS.map((a) => a.id));
    const order = (known(s.order, wIds) as WidgetId[] | null) ?? [...DEFAULT_PREFS.order];
    // Widgets added in a later release get appended so nobody loses them.
    for (const w of WIDGETS) if (!order.includes(w.id)) order.push(w.id);
    return {
      order,
      hidden: (known(s.hidden, wIds) as WidgetId[] | null) ?? [],
      sizes: s.sizes ?? {},
      todayMetrics: (known(s.todayMetrics, mIds) as MetricId[] | null) ?? DEFAULT_PREFS.todayMetrics,
      mtdMetrics: (known(s.mtdMetrics, mIds) as MetricId[] | null) ?? DEFAULT_PREFS.mtdMetrics,
      actions: ((known(s.actions, aIds) as ActionId[] | null) ?? DEFAULT_PREFS.actions).slice(0, MAX_ACTIONS),
      fullNumbers: !!s.fullNumbers,
      revenueMonths: s.revenueMonths === 12 ? 12 : 6,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/* ───────────────────────── Helpers ───────────────────────── */

const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", online: "Online" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const supabase = createClient();

const pct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const fmt12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};
const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const daysUntil = (iso: string) => Math.ceil((new Date(iso + "T23:59:59").getTime() - Date.now()) / 86400000);
function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/* ───────────────────────── Small components ───────────────────────── */

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="db-trend db-trend--flat">New</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`db-trend ${up ? "db-trend--up" : "db-trend--down"}`}>
      <Icon size={12} strokeWidth={2.8} />{Math.abs(value)}%
    </span>
  );
}

function Ring({ pct: p }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="db-ring" aria-hidden>
      <svg viewBox="0 0 128 128" width="100%" height="100%">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
        <circle
          className="db-ring-arc" cx="64" cy="64" r={r} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ opacity: p > 0 ? 1 : 0 }}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="db-ring-center">
        <div className="db-ring-value">{Math.round(p)}%</div>
        <div className="db-ring-caption">turnout</div>
      </div>
    </div>
  );
}

function CardHead({ title, sub, href, cta = "View all" }: { title: string; sub?: string; href?: string; cta?: string }) {
  return (
    <div className="db-card-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="db-card-title">{title}</h2>
        {sub && <div className="db-card-sub">{sub}</div>}
      </div>
      {href && <Link href={href} className="db-link">{cta}<ChevronRight size={14} /></Link>}
    </div>
  );
}

function Empty({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="db-empty">
      <span className="db-empty-icon"><Icon size={18} /></span>
      <div className="db-empty-title">{title}</div>
      <div className="db-empty-text">{text}</div>
    </div>
  );
}

function RowsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="db-rows">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="db-row">
          <Skeleton w={34} h={34} r={17} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton w="60%" h={12} /><Skeleton w="35%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartTip({ active, payload, label, money }: { active?: boolean; payload?: { value: number }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="db-tip">
      <div className="db-tip-label">{label}</div>
      <div className="db-tip-value">{money ? `₹${fullNum(rupees(v))}` : `${fullNum(v)} ${plural(v, "check-in")}`}</div>
    </div>
  );
}

/** One compact metric inside a strip. The label links to the module; the number toggles on click. */
function MetricCell({ def, value, foot }: { def: MetricDef; value: React.ReactNode; foot: React.ReactNode }) {
  // Only the icon+label row is a link — value/foot can hold the Num toggle button,
  // and a <button> inside an <a> would be invalid, nested-interactive markup.
  return (
    <div className={`dz-cell db-tone-${def.tone}`}>
      <Link href={def.href} className="dz-cell-head">
        <span className="dz-cell-chip"><def.icon size={13} strokeWidth={2.4} /></span>
        <span className="ps-truncate dz-cell-label">{def.label}</span>
        <ChevronRight size={12} className="dz-cell-chev" aria-hidden />
      </Link>
      <div className="dz-cell-value">{value}</div>
      <div className="dz-cell-foot">{foot}</div>
    </div>
  );
}

/** Sortable + resizable shell around every widget. Tools only render in edit mode. */
function Tile({
  id, span, editing, onSize, onHide, children,
}: { id: WidgetId; span: Span; editing: boolean; onSize: (s: Span) => void; onHide: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });
  const w = WIDGET[id];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx("dz-item", `dz-span-${span}`, isDragging && "dz-item--dragging")}
    >
      <div className="dz-body">{children}</div>
      {editing && (
        <div className="dz-tools">
          <button
            ref={setActivatorNodeRef} type="button" className="dz-tool dz-grip"
            aria-label={`Move ${w.label}`} {...attributes} {...listeners}
          >
            <GripVertical size={14} />
          </button>
          {w.sizes.length > 1 && (
            <div className="dz-sizes" role="group" aria-label={`${w.label} width`}>
              {w.sizes.map((s) => (
                <button
                  key={s} type="button" className="dz-size" aria-pressed={s === span}
                  title={SIZE_HINT[s]} onClick={() => onSize(s)}
                >
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="dz-tool" aria-label={`Hide ${w.label}`} title="Hide" onClick={onHide}>
            <EyeOff size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Reorderable checklist used in the Customize sheet. */
function OrderList<T extends string>({
  all, selected, label, sub, onChange, max,
}: {
  all: T[]; selected: T[]; label: (id: T) => string; sub?: (id: T) => string;
  onChange: (next: T[]) => void; max?: number;
}) {
  const rest = all.filter((id) => !selected.includes(id));
  const atLimit = max !== undefined && selected.length >= max;
  return (
    <div className="dz-olist">
      {selected.map((id, i) => (
        <div key={id} className="dz-orow">
          <input type="checkbox" className="db-switch" checked aria-label={`Hide ${label(id)}`} onChange={() => onChange(selected.filter((x) => x !== id))} />
          <div className="dz-orow-text">
            <div className="db-toggle-title">{label(id)}</div>
            {sub && <div className="db-toggle-sub">{sub(id)}</div>}
          </div>
          <div className="dz-orow-move">
            <button type="button" className="dz-tool" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => onChange(move(selected, i, -1))}><ChevronUp size={14} /></button>
            <button type="button" className="dz-tool" aria-label={`Move ${label(id)} down`} disabled={i === selected.length - 1} onClick={() => onChange(move(selected, i, 1))}><ChevronDown size={14} /></button>
          </div>
        </div>
      ))}
      {rest.length > 0 && <div className="dz-olist-sep">{atLimit ? `Limit of ${max} reached` : "Not shown"}</div>}
      {rest.map((id) => (
        <div key={id} className="dz-orow dz-orow--off">
          <input type="checkbox" className="db-switch" checked={false} disabled={atLimit} aria-label={`Show ${label(id)}`} onChange={() => onChange([...selected, id])} />
          <div className="dz-orow-text">
            <div className="db-toggle-title">{label(id)}</div>
            {sub && <div className="db-toggle-sub">{sub(id)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

type SheetTab = "widgets" | "today" | "mtd" | "actions" | "display";

export default function DashboardPage() {
  const roleData = useRole();
  // While the role resolves, nothing is visible, so staff never get a flash of owner-only data.
  const perm: Perms = roleData.loading ? null : (roleData.permissions as Perms);
  const isManager = !roleData.loading && (roleData.staff_role === "owner" || roleData.staff_role === "manager");

  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Point[]>([]);   // 12 months, oldest first, paise
  const [week, setWeek] = useState<Point[]>([]);
  const [expiring, setExpiring] = useState<ExpiringRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [checklist, setChecklist] = useState({ hasPlan: false, hasMember: false, hasBranch: false });
  const [orgName, setOrgName] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");
  const [dateLabel, setDateLabel] = useState("");
  const [todayName, setTodayName] = useState("");
  const [mtdRange, setMtdRange] = useState({ now: "", prev: "" });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>("widgets");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Client-only values: greeting, dates, saved layout
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setDateLabel(now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }));
    setTodayName(DAYS[now.getDay()]);
    const mon = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevDays = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate());
    setMtdRange({ now: `1–${now.getDate()} ${mon(now)}`, prev: `1–${prevDays} ${mon(prevMonth)}` });
    setPrefs(loadPrefs());
  }, []);

  function update(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
      return next;
    });
  }
  function resetPrefs() {
    setPrefs(DEFAULT_PREFS);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  const resetLayout = () => update({ order: [...DEFAULT_PREFS.order], sizes: {}, hidden: [] });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!role) return;
      const oid = role.org_id;

      const now = new Date();
      const today = isoDay(now);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const prevSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), prevMonthEnd.getDate()), 23, 59, 59);
      const yearStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const in7 = isoDay(new Date(Date.now() + 7 * 86400000));
      const iso = (d: Date) => d.toISOString();
      const head = { count: "exact" as const, head: true };
      const closed = "(converted,lost)";

      const [
        org, active, lastActive, pay12m, visits7d, expCount, expTodayCount,
        newToday, newMtd, newPrev, ciMtd, ciPrev,
        leadsToday, leadsMtd, leadsPrev, convMtd, fuDue, fuOverdue,
        plans, membersAll, branches, expList, payList, visitList, classList, fuList,
      ] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", oid).single(),
        supabase.from("memberships").select("*", head).eq("org_id", oid).eq("status", "active"),
        supabase.from("memberships").select("*", head).eq("org_id", oid).lte("start_date", isoDay(prevMonthEnd)).gte("end_date", isoDay(prevStart)),
        supabase.from("payments").select("total_paise, paid_at").eq("org_id", oid).gte("paid_at", iso(yearStart)),
        supabase.from("attendance_logs").select("check_in_at").eq("org_id", oid).gte("check_in_at", iso(weekStart)),
        supabase.from("memberships").select("*", head).eq("org_id", oid).eq("status", "active").gte("end_date", today).lte("end_date", in7),
        supabase.from("memberships").select("*", head).eq("org_id", oid).eq("status", "active").eq("end_date", today),
        supabase.from("members").select("*", head).eq("org_id", oid).gte("created_at", iso(todayStart)),
        supabase.from("members").select("*", head).eq("org_id", oid).gte("created_at", iso(monthStart)),
        supabase.from("members").select("*", head).eq("org_id", oid).gte("created_at", iso(prevStart)).lte("created_at", iso(prevSameDay)),
        supabase.from("attendance_logs").select("*", head).eq("org_id", oid).gte("check_in_at", iso(monthStart)),
        supabase.from("attendance_logs").select("*", head).eq("org_id", oid).gte("check_in_at", iso(prevStart)).lte("check_in_at", iso(prevSameDay)),
        supabase.from("leads").select("*", head).eq("org_id", oid).gte("created_at", iso(todayStart)),
        supabase.from("leads").select("*", head).eq("org_id", oid).gte("created_at", iso(monthStart)),
        supabase.from("leads").select("*", head).eq("org_id", oid).gte("created_at", iso(prevStart)).lte("created_at", iso(prevSameDay)),
        supabase.from("leads").select("*", head).eq("org_id", oid).eq("status", "converted").gte("created_at", iso(monthStart)),
        supabase.from("leads").select("*", head).eq("org_id", oid).not("status", "in", closed).lte("follow_up_at", iso(todayEnd)),
        supabase.from("leads").select("*", head).eq("org_id", oid).not("status", "in", closed).lt("follow_up_at", iso(todayStart)),
        supabase.from("membership_plans").select("*", head).eq("org_id", oid).eq("is_active", true),
        supabase.from("members").select("*", head).eq("org_id", oid),
        supabase.from("branches").select("*", head).eq("org_id", oid),
        supabase.from("memberships").select("id, end_date, members(id, full_name), membership_plans(name)")
          .eq("org_id", oid).eq("status", "active").gte("end_date", today).lte("end_date", in7).order("end_date").limit(5),
        supabase.from("payments").select("id, total_paise, paid_at, method, members(id, full_name)")
          .eq("org_id", oid).order("paid_at", { ascending: false }).limit(5),
        supabase.from("attendance_logs").select("id, check_in_at, check_out_at, members(id, full_name)")
          .eq("org_id", oid).order("check_in_at", { ascending: false }).limit(6),
        supabase.from("classes").select("id, name, trainer_name, start_time, duration_mins, color")
          .eq("org_id", oid).eq("is_active", true).eq("schedule_day", DAYS[now.getDay()]).order("start_time"),
        supabase.from("leads").select("id, full_name, follow_up_at")
          .eq("org_id", oid).not("status", "in", closed).lte("follow_up_at", iso(todayEnd))
          .order("follow_up_at").limit(5),
      ]);

      if (org.data) setOrgName(org.data.name);

      // Revenue: 12 monthly buckets, plus today, MTD and the same days last month
      const months: Point[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), value: 0 });
      }
      let revenueToday = 0, paymentsToday = 0, revenueMtd = 0, paymentsMtd = 0, revenueMtdPrev = 0;
      (pay12m.data || []).forEach((p: { total_paise: number; paid_at: string }) => {
        const d = new Date(p.paid_at);
        const idx = 11 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
        if (idx >= 0 && idx < 12) months[idx].value += p.total_paise;
        if (d >= todayStart) { revenueToday += p.total_paise; paymentsToday++; }
        if (d >= monthStart) { revenueMtd += p.total_paise; paymentsMtd++; }
        else if (d >= prevStart && d <= prevSameDay) revenueMtdPrev += p.total_paise;
      });
      setRevenue(months);

      // Check-ins: last 7 days
      const days: Point[] = [];
      const keyIndex: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        keyIndex[isoDay(d)] = days.length;
        days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), value: 0 });
      }
      (visits7d.data || []).forEach((v: { check_in_at: string }) => {
        const k = isoDay(new Date(v.check_in_at));
        if (k in keyIndex) days[keyIndex[k]].value++;
      });
      setWeek(days);

      const classRows = (classList.data as ClassRow[]) || [];
      setStats({
        revenueToday, paymentsToday,
        checkinsToday: days[6].value,
        newMembersToday: newToday.count || 0,
        newLeadsToday: leadsToday.count || 0,
        followupsDue: fuDue.count || 0,
        followupsOverdue: fuOverdue.count || 0,
        expiringToday: expTodayCount.count || 0,
        classesToday: classRows.length,
        revenueMtd, revenueMtdPrev, paymentsMtd,
        newMembersMtd: newMtd.count || 0, newMembersMtdPrev: newPrev.count || 0,
        checkinsMtd: ciMtd.count || 0, checkinsMtdPrev: ciPrev.count || 0,
        leadsMtd: leadsMtd.count || 0, leadsMtdPrev: leadsPrev.count || 0,
        conversionsMtd: convMtd.count || 0,
        activeMembers: active.count || 0, activeLastMonth: lastActive.count || 0,
        expiring7: expCount.count || 0,
      });

      const expRows = (expList.data as unknown as ExpiringRow[]) || [];
      setExpiring(expRows);
      setPayments((payList.data as unknown as PaymentRow[]) || []);
      setVisits((visitList.data as unknown as VisitRow[]) || []);
      setClasses(classRows);
      setChecklist({ hasPlan: (plans.count || 0) > 0, hasMember: (membersAll.count || 0) > 0, hasBranch: (branches.count || 0) > 0 });

      const short = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const followups: TaskRow[] = ((fuList.data as { id: string; full_name: string; follow_up_at: string }[] | null) || [])
        .map((l) => {
          const due = new Date(l.follow_up_at);
          const overdue = due < todayStart;
          return {
            id: `fu-${l.id}`, kind: "followup" as const, href: "/dashboard/leads", overdue,
            title: `Follow up with ${l.full_name}`,
            sub: overdue ? `Overdue since ${short(due)}` : `Due ${due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`,
          };
        });
      const endingToday: TaskRow[] = expRows.filter((e) => e.end_date === today).map((e) => ({
        id: `ex-${e.id}`, kind: "expiring" as const, overdue: false,
        href: e.members ? `/dashboard/members/${e.members.id}` : "/dashboard/members?filter=expiring",
        title: `${e.members?.full_name ?? "Member"}'s membership ends today`,
        sub: e.membership_plans?.name ?? "Membership",
      }));
      setTasks([...followups, ...endingToday].sort((a, b) => Number(b.overdue) - Number(a.overdue)).slice(0, 6));
    }
    load();
  }, []);

  /* ── Derived ── */

  const full = prefs.fullNumbers;
  const turnout = stats && stats.activeMembers > 0 ? Math.min(100, Math.round((stats.checkinsToday / stats.activeMembers) * 100)) : 0;
  const revenueSeries = useMemo(() => revenue.slice(12 - prefs.revenueMonths), [revenue, prefs.revenueMonths]);
  const revenueTotal = useMemo(() => revenueSeries.reduce((s, p) => s + p.value, 0), [revenueSeries]);
  const weekTotal = useMemo(() => week.reduce((s, p) => s + p.value, 0), [week]);

  function metric(id: MetricId): { value: React.ReactNode; foot: React.ReactNode } {
    if (!stats) return { value: <Skeleton w={64} h={22} />, foot: "\u00a0" };
    const s = stats;
    const n = (v: number, money?: boolean) => <Num v={v} money={money} full={full} />;
    const vs = (now: number, prev: number) => <><Trend value={pct(now, prev)} /> <span>vs last month</span></>;
    switch (id) {
      case "revenue_today": return { value: n(s.revenueToday, true), foot: `${s.paymentsToday} ${plural(s.paymentsToday, "payment")}` };
      case "payments_today": return { value: n(s.paymentsToday), foot: "recorded today" };
      case "checkins_today": return { value: n(s.checkinsToday), foot: `${turnout}% of active` };
      case "turnout_today": return { value: `${turnout}%`, foot: `${fullNum(s.checkinsToday)} of ${fullNum(s.activeMembers)}` };
      case "new_members_today": return { value: n(s.newMembersToday), foot: "joined today" };
      case "new_leads_today": return { value: n(s.newLeadsToday), foot: "added today" };
      case "followups_today": return {
        value: n(s.followupsDue),
        foot: s.followupsOverdue > 0 ? <span className="dz-warn">{s.followupsOverdue} overdue</span> : "none overdue",
      };
      case "expiring_today": return { value: n(s.expiringToday), foot: s.expiringToday === 1 ? "plan ends today" : "plans end today" };
      case "classes_today": return { value: n(s.classesToday), foot: "scheduled" };
      case "revenue_mtd": return { value: n(s.revenueMtd, true), foot: vs(s.revenueMtd, s.revenueMtdPrev) };
      case "avg_ticket_mtd": return {
        value: n(s.paymentsMtd > 0 ? s.revenueMtd / s.paymentsMtd : 0, true),
        foot: `${s.paymentsMtd} ${plural(s.paymentsMtd, "payment")}`,
      };
      case "new_members_mtd": return { value: n(s.newMembersMtd), foot: vs(s.newMembersMtd, s.newMembersMtdPrev) };
      case "active_members": return { value: n(s.activeMembers), foot: vs(s.activeMembers, s.activeLastMonth) };
      case "checkins_mtd": return { value: n(s.checkinsMtd), foot: vs(s.checkinsMtd, s.checkinsMtdPrev) };
      case "leads_mtd": return { value: n(s.leadsMtd), foot: vs(s.leadsMtd, s.leadsMtdPrev) };
      case "conversions_mtd": return {
        value: n(s.conversionsMtd),
        foot: s.leadsMtd > 0 ? `${Math.round((s.conversionsMtd / s.leadsMtd) * 100)}% of new leads` : "no leads yet",
      };
      case "renewals_7d": return { value: n(s.expiring7), foot: "next 7 days" };
    }
  }

  const canSee: Record<WidgetId, boolean> = {
    today: METRICS.some((m) => m.scope === "today" && m.allowed(perm)),
    mtd: METRICS.some((m) => m.scope === "mtd" && m.allowed(perm)),
    revenue: !!perm?.reports,
    turnout: !!perm?.attendance,
    tasks: !!perm?.leads || !!perm?.membership_plans,
    checkins: !!perm?.attendance,
    expiring: !!perm?.membership_plans,
    payments: !!perm?.payments,
    classes: !!perm?.classes,
    activity: !!perm?.attendance,
    actions: ACTIONS.some((a) => a.allowed(perm, isManager)),
    setup: isManager,
  };

  const checklistItems = [
    { label: "Create your first membership plan", done: checklist.hasPlan, href: "/dashboard/membership-plans" },
    { label: "Add your first member", done: checklist.hasMember, href: "/dashboard/members/new" },
    { label: "Set up a branch", done: checklist.hasBranch, href: "/dashboard/settings" },
    { label: "Connect Razorpay for online payments", done: false, href: "/dashboard/settings" },
  ];
  const doneCount = checklistItems.filter((c) => c.done).length;
  const setupDone = stats !== null && doneCount === checklistItems.length;

  const visible = prefs.order.filter((id) =>
    canSee[id] && !prefs.hidden.includes(id) && !(id === "setup" && (setupDone || stats === null)));
  const hiddenCount = WIDGETS.filter((w) => canSee[w.id] && prefs.hidden.includes(w.id)).length;
  const spanOf = (id: WidgetId): Span => {
    const s = prefs.sizes[id];
    return s && WIDGET[id].sizes.includes(s) ? s : WIDGET[id].def;
  };
  const visibleActions = prefs.actions.map((id) => ACTION[id]).filter((a) => a.allowed(perm, isManager));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = prefs.order.indexOf(active.id as WidgetId);
    const to = prefs.order.indexOf(over.id as WidgetId);
    if (from < 0 || to < 0) return;
    update({ order: arrayMove(prefs.order, from, to) });
  }
  function openSheet(t: SheetTab) { setTab(t); setSheetOpen(true); }

  /* ── Widgets ── */

  function strip(scope: "today" | "mtd") {
    const ids = (scope === "today" ? prefs.todayMetrics : prefs.mtdMetrics).filter((id) => METRIC[id].allowed(perm));
    const title = scope === "today" ? "Today" : "Month to date";
    const meta = scope === "today"
      ? todayName || "\u00a0"
      : mtdRange.now ? `${mtdRange.now} · compared with ${mtdRange.prev}` : "\u00a0";
    return (
      <section className="db-card dz-strip" aria-label={title}>
        <div className="dz-strip-head">
          <div className="dz-strip-title">
            {scope === "today" ? <Sun size={14} strokeWidth={2.3} /> : <CalendarClock size={14} strokeWidth={2.3} />}
            {title}
          </div>
          <div className="dz-strip-meta">{meta}</div>
          <button type="button" className="db-link dz-strip-edit" onClick={() => openSheet(scope)}>Edit metrics</button>
        </div>
        {ids.length === 0 ? (
          <div className="dz-strip-empty">No metrics selected. Pick some from Edit metrics.</div>
        ) : (
          <div className="dz-cells">
            {ids.map((id) => {
              const m = metric(id);
              return <MetricCell key={id} def={METRIC[id]} value={m.value} foot={m.foot} />;
            })}
          </div>
        )}
      </section>
    );
  }

  function render(id: WidgetId): React.ReactNode {
    switch (id) {
      case "today": return strip("today");
      case "mtd": return strip("mtd");

      case "revenue": return (
        <section className="db-card db-pad">
          <CardHead
            title="Revenue"
            sub={revenueSeries.length ? `₹${compact(rupees(revenueTotal))} collected in the last ${prefs.revenueMonths} months` : `Last ${prefs.revenueMonths} months`}
            href="/dashboard/reports" cta="Reports"
          />
          <div className="db-chart">
            {revenueSeries.length === 0 ? <Skeleton w="100%" h={220} r={12} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries} margin={{ top: 10, right: 6, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0A66D6" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#0A66D6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.08)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} tickFormatter={(v: number) => `₹${compact(rupees(v))}`} />
                  <Tooltip content={<ChartTip money />} cursor={{ stroke: "rgba(10,102,214,0.25)" }} />
                  <Area type="monotone" dataKey="value" stroke="#0A66D6" strokeWidth={2.2} fill="url(#rev-fill)" animationDuration={500} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      );

      case "turnout": return (
        <section className="db-hero" aria-label="Today's turnout">
          <div className="db-hero-glow" aria-hidden />
          <div className="db-hero-top">
            <span className="db-hero-label"><Activity size={14} /> Today</span>
            <span className="db-live"><span className="db-live-dot" />Live</span>
          </div>
          <div className="db-hero-body">
            <Ring pct={turnout} />
            <div style={{ minWidth: 0 }}>
              <div className="db-hero-value">{stats ? <Num v={stats.checkinsToday} full={full} /> : "–"}</div>
              <div className="db-hero-sub">
                {!stats ? "\u00a0" : stats.activeMembers > 0
                  ? `${plural(stats.checkinsToday, "check-in")} of ${fullNum(stats.activeMembers)} active ${plural(stats.activeMembers, "member")}`
                  : "No active members yet"}
              </div>
            </div>
          </div>
          <Link href="/dashboard/attendance" className="db-hero-btn">
            <UserCheck size={15} strokeWidth={2.4} /> Check someone in
          </Link>
        </section>
      );

      case "tasks": return (
        <section className="db-card db-pad">
          <CardHead title="Today's updates" sub="Follow-ups and renewals due" href="/dashboard/leads" />
          {tasks === null ? <RowsSkeleton n={3} /> : tasks.length === 0 ? (
            <Empty icon={ListChecks} title="All caught up" text="No follow-ups or renewals need attention today." />
          ) : (
            <div className="db-rows">
              {tasks.map((t) => (
                <Link key={t.id} href={t.href} className={`db-row db-row--link ${t.kind === "followup" ? "db-tone-purple" : "db-tone-amber"}`}>
                  <span className="db-chip">{t.kind === "followup" ? <PhoneCall size={14} strokeWidth={2.3} /> : <Clock size={14} strokeWidth={2.3} />}</span>
                  <div className="db-row-text">
                    <div className="db-row-title">{t.title}</div>
                    <div className="db-row-sub">{t.sub}</div>
                  </div>
                  {t.overdue && <span className="db-pill db-pill--red">Overdue</span>}
                </Link>
              ))}
            </div>
          )}
        </section>
      );

      case "checkins": return (
        <section className="db-card db-pad">
          <CardHead title="Check-ins" sub={week.length ? `${fullNum(weekTotal)} ${plural(weekTotal, "visit")} in the last 7 days` : "Last 7 days"} href="/dashboard/attendance" />
          <div className="db-chart db-chart--sm">
            {week.length === 0 ? <Skeleton w="100%" h={180} r={12} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week} margin={{ top: 10, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.08)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} tickFormatter={(v: number) => compact(v)} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(9,211,245,0.08)" }} />
                  <Bar dataKey="value" radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={500}>
                    {week.map((_, i) => <Cell key={i} fill={i === week.length - 1 ? "#09D3F5" : "rgba(10,102,214,0.28)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      );

      case "expiring": return (
        <section className="db-card db-pad">
          <CardHead title="Expiring soon" sub="Renewals due in 7 days" href="/dashboard/members?filter=expiring" />
          {expiring === null ? <RowsSkeleton /> : expiring.length === 0 ? (
            <Empty icon={Check} title="All caught up" text="No memberships expire in the next 7 days." />
          ) : (
            <div className="db-rows">
              {expiring.map((e) => {
                const d = daysUntil(e.end_date);
                return (
                  <Link key={e.id} href={e.members ? `/dashboard/members/${e.members.id}` : "/dashboard/members"} className="db-row db-row--link">
                    <Avatar name={e.members?.full_name ?? "?"} size={34} />
                    <div className="db-row-text">
                      <div className="db-row-title">{e.members?.full_name ?? "Member"}</div>
                      <div className="db-row-sub">{e.membership_plans?.name ?? "Membership"}</div>
                    </div>
                    <span className={`db-pill ${d <= 2 ? "db-pill--red" : "db-pill--amber"}`}>
                      {d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      );

      case "payments": return (
        <section className="db-card db-pad">
          <CardHead title="Recent payments" sub="Latest transactions" href="/dashboard/payments" />
          {payments === null ? <RowsSkeleton /> : payments.length === 0 ? (
            <Empty icon={Wallet} title="No payments yet" text="Recorded payments will show up here." />
          ) : (
            <div className="db-rows">
              {payments.map((p) => (
                <div key={p.id} className="db-row">
                  <span className="db-pay-icon"><IndianRupee size={15} strokeWidth={2.4} /></span>
                  <div className="db-row-text">
                    <div className="db-row-title">{p.members?.full_name ?? "Payment"}</div>
                    <div className="db-row-sub">{p.method ? METHOD[p.method] ?? p.method : "Payment"} · {ago(p.paid_at)}</div>
                  </div>
                  <span className="db-amount">+<Num v={p.total_paise} money full={full} /></span>
                </div>
              ))}
            </div>
          )}
        </section>
      );

      case "actions": return (
        <section className="dz-actions-wrap">
          <div className="dz-actions-head">
            <h2 className="db-section-title">Quick actions</h2>
            <button type="button" className="db-link" onClick={() => openSheet("actions")}>Edit</button>
          </div>
          {visibleActions.length === 0 ? (
            <div className="db-card db-pad"><Empty icon={LayoutGrid} title="No shortcuts" text="Add the actions you use most from Edit." /></div>
          ) : (
            <div className="db-actions">
              {visibleActions.map((a) => (
                <Link key={a.id} href={a.href} className={`db-action db-tone-${a.tone}`}>
                  <span className="db-chip db-chip--lg"><a.icon size={18} strokeWidth={2.2} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="db-action-title">{a.label}</div>
                    <div className="db-action-sub">{a.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      );

      case "classes": return (
        <section className="db-card db-pad">
          <CardHead title="Today's classes" sub={todayName || "\u00a0"} href="/dashboard/classes" />
          {classes === null ? <RowsSkeleton n={3} /> : classes.length === 0 ? (
            <Empty icon={CalendarDays} title="No classes today" text="Scheduled classes for today will appear here." />
          ) : (
            <div className="db-rows">
              {classes.slice(0, 5).map((c) => (
                <div key={c.id} className="db-row">
                  <span className="db-class-bar" style={{ background: c.color || "#0A66D6" }} />
                  <div className="db-row-text">
                    <div className="db-row-title">{c.name}</div>
                    <div className="db-row-sub">{c.trainer_name ? `with ${c.trainer_name} · ` : ""}{c.duration_mins} min</div>
                  </div>
                  <span className="db-time">{fmt12(c.start_time)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      );

      case "activity": return (
        <section className="db-card db-pad">
          <CardHead title="Live activity" sub="Recent check-ins" href="/dashboard/attendance" />
          {visits === null ? <RowsSkeleton /> : visits.length === 0 ? (
            <Empty icon={Activity} title="No visits yet" text="Check-ins will stream in here as members arrive." />
          ) : (
            <div className="db-rows">
              {visits.map((v) => (
                <div key={v.id} className="db-row">
                  <Avatar name={v.members?.full_name ?? "?"} size={34} />
                  <div className="db-row-text">
                    <div className="db-row-title">{v.members?.full_name ?? "Member"}</div>
                    <div className="db-row-sub">{v.check_out_at ? "Checked out" : "Checked in"} · {ago(v.check_out_at ?? v.check_in_at)}</div>
                  </div>
                  {!v.check_out_at && <span className="db-pill db-pill--green"><span className="db-live-dot db-live-dot--green" />In gym</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      );

      case "setup": return (
        <section className="db-card db-pad db-setup">
          <div className="db-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span className="db-chip db-tone-blue db-chip--lg"><Sparkles size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <h2 className="db-card-title">Finish setting up</h2>
                <div className="db-card-sub">{doneCount} of {checklistItems.length} done</div>
              </div>
            </div>
          </div>
          <div className="db-progress"><span style={{ transform: `scaleX(${doneCount / checklistItems.length})` }} /></div>
          <div className="db-checks">
            {checklistItems.map((item) => {
              const inner = (
                <>
                  <span className={`db-check ${item.done ? "db-check--done" : ""}`}>{item.done && <Check size={12} strokeWidth={3} />}</span>
                  <span className="db-check-label">{item.label}</span>
                  {!item.done && <ChevronRight size={15} className="db-check-chev" />}
                </>
              );
              return item.done
                ? <div key={item.label} className="db-check-row db-check-row--done">{inner}</div>
                : <Link key={item.label} href={item.href} className="db-check-row">{inner}</Link>;
            })}
          </div>
        </section>
      );
    }
  }

  /* ── Customize sheet ── */

  const allowedMetrics = (scope: "today" | "mtd") => METRICS.filter((m) => m.scope === scope && m.allowed(perm)).map((m) => m.id);
  const allowedActions = ACTIONS.filter((a) => a.allowed(perm, isManager)).map((a) => a.id);
  const TABS: { id: SheetTab; label: string }[] = [
    { id: "widgets", label: "Widgets" },
    { id: "today", label: "Today" },
    { id: "mtd", label: "Month" },
    { id: "actions", label: "Shortcuts" },
    { id: "display", label: "Display" },
  ];

  return (
    <div className={clsx("ps-page db ov", editing && "dz-editing")}>
      <DesignStyles />
      <style>{OV_CSS}</style>

      <header className="db-header db-in">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">{dateLabel || "\u00a0"}</div>
          <h1 className="db-title">{greeting}</h1>
          <p className="db-subtitle">
            {orgName ? <>Here&apos;s how <strong>{orgName}</strong> is doing today.</> : "Here's how your gym is doing today."}
          </p>
        </div>
        <div className="db-header-actions">
          {!editing && (
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => openSheet("widgets")}>
              <SlidersHorizontal size={15} /> <span>Customize</span>
              {hiddenCount > 0 && <span className="db-count">{hiddenCount}</span>}
            </button>
          )}
          <button
            type="button"
            className={clsx("ps-btn", editing ? "ps-btn--primary" : "ps-btn--secondary")}
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Check size={15} strokeWidth={2.6} /> : <LayoutGrid size={15} />}
            <span>{editing ? "Done" : "Edit layout"}</span>
          </button>
        </div>
      </header>

      {editing && (
        <div className="dz-editbar" role="status">
          <GripVertical size={14} aria-hidden />
          <span>Drag the handle to move a widget. S, M, L and Full set its width. Hidden widgets come back from Customize.</span>
          <button type="button" className="db-link" onClick={resetLayout}><RotateCcw size={13} /> Reset layout</button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="db-card db-pad">
          <Empty icon={SlidersHorizontal} title="Your dashboard is empty" text="Turn widgets back on from Customize." />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible} strategy={rectSortingStrategy}>
            <div className="dz-grid">
              {visible.map((id) => (
                <Tile
                  key={id} id={id} span={spanOf(id)} editing={editing}
                  onSize={(s) => update({ sizes: { ...prefs.sizes, [id]: s } })}
                  onHide={() => update({ hidden: [...prefs.hidden, id] })}
                >
                  {render(id)}
                </Tile>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Customize dashboard"
        description="Saved on this device."
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--plain" onClick={resetPrefs}><RotateCcw size={14} /> Reset everything</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={() => setSheetOpen(false)}>Done</button>
          </>
        }
      >
        <div className="dz-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="dz-tab" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "widgets" && (
          <>
            <p className="dz-hint">Show, hide and size widgets. To reorder, use Edit layout on the dashboard.</p>
            <div className="dz-olist">
              {prefs.order.filter((id) => canSee[id]).map((id) => {
                const w = WIDGET[id];
                const on = !prefs.hidden.includes(id);
                return (
                  <div key={id} className={clsx("dz-orow", !on && "dz-orow--off")}>
                    <input
                      type="checkbox" className="db-switch" checked={on} aria-label={`${on ? "Hide" : "Show"} ${w.label}`}
                      onChange={() => update({ hidden: on ? [...prefs.hidden, id] : prefs.hidden.filter((x) => x !== id) })}
                    />
                    <div className="dz-orow-text">
                      <div className="db-toggle-title">{w.label}</div>
                      <div className="db-toggle-sub">{w.sub}</div>
                    </div>
                    {w.sizes.length > 1 && (
                      <div className="dz-sizes" role="group" aria-label={`${w.label} width`}>
                        {w.sizes.map((s) => (
                          <button key={s} type="button" className="dz-size" aria-pressed={spanOf(id) === s} title={SIZE_HINT[s]}
                            onClick={() => update({ sizes: { ...prefs.sizes, [id]: s } })}>
                            {SIZE_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "today" && (
          <>
            <p className="dz-hint">The first row. Pick what you want to see at a glance and set the order.</p>
            <OrderList<MetricId>
              all={allowedMetrics("today")}
              selected={prefs.todayMetrics.filter((id) => METRIC[id].allowed(perm))}
              label={(id) => METRIC[id].label}
              onChange={(next) => update({ todayMetrics: next })}
            />
          </>
        )}

        {tab === "mtd" && (
          <>
            <p className="dz-hint">The second row. Each figure compares this month with the same days last month.</p>
            <OrderList<MetricId>
              all={allowedMetrics("mtd")}
              selected={prefs.mtdMetrics.filter((id) => METRIC[id].allowed(perm))}
              label={(id) => METRIC[id].label}
              onChange={(next) => update({ mtdMetrics: next })}
            />
          </>
        )}

        {tab === "actions" && (
          <>
            <p className="dz-hint">Up to {MAX_ACTIONS} shortcuts, in the order you set.</p>
            <OrderList<ActionId>
              all={allowedActions}
              selected={prefs.actions.filter((id) => allowedActions.includes(id))}
              label={(id) => ACTION[id].label}
              sub={(id) => ACTION[id].sub}
              max={MAX_ACTIONS}
              onChange={(next) => update({ actions: next })}
            />
          </>
        )}

        {tab === "display" && (
          <div className="db-toggles">
            <label className="db-toggle">
              <div style={{ minWidth: 0 }}>
                <div className="db-toggle-title">Always show full numbers</div>
                <div className="db-toggle-sub">Off shows 4.6K. Tap any short figure to see 4,590.</div>
              </div>
              <input type="checkbox" className="db-switch" checked={prefs.fullNumbers} onChange={() => update({ fullNumbers: !prefs.fullNumbers })} />
            </label>
            <div className="db-toggle">
              <div style={{ minWidth: 0 }}>
                <div className="db-toggle-title">Revenue chart range</div>
                <div className="db-toggle-sub">Months shown on the revenue trend</div>
              </div>
              <div className="dz-sizes" role="group" aria-label="Revenue chart range">
                {([6, 12] as const).map((m) => (
                  <button key={m} type="button" className="dz-size" aria-pressed={prefs.revenueMonths === m} onClick={() => update({ revenueMonths: m })}>
                    {m}m
                  </button>
                ))}
              </div>
            </div>
            <div className="db-toggle">
              <div style={{ minWidth: 0 }}>
                <div className="db-toggle-title">Layout</div>
                <div className="db-toggle-sub">Order and widths go back to default. Metrics and shortcuts stay.</div>
              </div>
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={resetLayout}>Reset</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* Overview: same 18px gutter as Members and Leads, full width, and a denser layout so more fits on one screen.
   NOTE: no backticks inside this CSS. */
const OV_CSS = `
.ps-page.ov { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.ov { max-width: none; }

.ov .db-header { align-items: center; margin-bottom: 12px; gap: 12px; }
.ov .db-kicker { font-size: 11.5px; margin-bottom: 2px; }
.ov .db-title { font-size: 24px; }
.ov .db-subtitle { font-size: 13.5px; margin-top: 2px; }
.ov .db-header-actions .ps-btn { height: 34px; padding: 0 12px; font-size: 13.5px; }

.ov .dz-grid { gap: 12px; margin-bottom: 0; }
.ov .dz-editbar { margin-bottom: 12px; }

.ov .db-pad { padding: 14px 16px; }
.ov .db-card-head { margin-bottom: 10px; }
.ov .db-card-title { font-size: 15px; }
.ov .db-chart { height: 200px; }
.ov .db-chart--sm { height: 170px; }

.ov .db-hero { padding: 16px; gap: 12px; }
.ov .db-ring { transform: scale(0.86); transform-origin: center; }

.ov .db-row { min-height: 44px; padding: 6px 8px; gap: 10px; }
.ov .db-rows { gap: 0; }

.ov .dz-strip { padding: 0; }
.ov .dz-strip-head { padding: 2px 2px 8px; }
.ov .dz-cells { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.ov .dz-cell { padding: 10px 12px; gap: 4px; }
.ov .dz-cell-value { font-size: 19px; }

.ov .dz-actions-head { margin-bottom: 8px; }
.ov .db-empty { padding: 18px 8px; }

@media (max-width: 760px) {
  .ps-page.ov { padding: 10px !important; }
  .ov .db-header { margin-bottom: 10px; }
  .ov .db-title { font-size: 22px; }
  .ov .db-header-actions .ps-btn { height: 38px; }
  .ov .dz-grid { gap: 10px; }
  .ov .dz-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov .db-pad { padding: 12px 14px; }
  .ov .db-chart { height: 180px; }
}
`;
