"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { createClient } from "@/lib/supabase";
import {
  UserPlus, Wallet, UserCheck, BarChart2, ArrowUpRight, ArrowDownRight, Check, ChevronRight,
  ChevronUp, ChevronDown, Users, IndianRupee, CalendarDays, SlidersHorizontal, Sparkles, Activity,
  RotateCcw, ListChecks, PhoneCall, GripVertical, EyeOff, LayoutGrid, Salad, Dumbbell, Ticket,
  BookOpen, Settings, Target, CalendarClock, Clock, Sun, Moon, LogOut, UsersRound, IndianRupee as RupeeIcon, Receipt,
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
import { getStoredTheme, toggleTheme, THEME_EVENT } from "./components/brand";

/* ───────────────────────── Types ───────────────────────── */

type Stats = {
  // today
  revenueToday: number; paymentsToday: number; checkinsToday: number; checkoutsToday: number; newMembersToday: number;
  newLeadsToday: number; followupsDue: number; followupsOverdue: number; expiringToday: number; classesToday: number;
  // month to date
  revenueMtd: number; revenueMtdPrev: number; paymentsMtd: number;
  newMembersMtd: number; newMembersMtdPrev: number;
  checkinsMtd: number; checkinsMtdPrev: number;
  leadsMtd: number; leadsMtdPrev: number; conversionsMtd: number;
  activeMembers: number; activeLastMonth: number; expiring7: number;
  // period breakdown (weekly / monthly)
  checkinsWeek: number; checkoutsWeek: number; checkoutsMtd: number;
  paymentsWeek: number; revenueWeek: number;
  activeStaff: number; classesTotal: number;
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
  order: [
    "turnout",
    "tasks",
    "expiring",
    "revenue",
    "payments",
    "today",
    "mtd",
    "checkins",
    "classes",
    "activity",
    "actions",
    "setup",
  ],
  hidden: ["today", "mtd", "checkins", "classes", "activity", "actions", "setup"],
  sizes: { turnout: 4, tasks: 4, expiring: 4, revenue: 8, payments: 4 },
  todayMetrics: ["revenue_today", "checkins_today", "new_members_today", "new_leads_today", "followups_today", "expiring_today"],
  mtdMetrics: ["revenue_mtd", "new_members_mtd", "active_members", "checkins_mtd", "leads_mtd", "renewals_7d"],
  actions: ["add_member", "record_payment", "check_in", "leads"],
  fullNumbers: false,
  revenueMonths: 6,
};
const STORAGE_KEY = "psync.dashboard.v3";

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
      hidden: (known(s.hidden, wIds) as WidgetId[] | null) ?? [...DEFAULT_PREFS.hidden],
      sizes: s.sizes ?? { ...DEFAULT_PREFS.sizes },
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

function Ring({ count, pct: p, size = 148 }: { count?: number | null; pct: number; size?: number }) {
  const r = 58;
  const strokeWidth = 10;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, p));
  return (
    <div
      className="db-ring db-ring--hero"
      style={{ width: size, height: size }}
      aria-label={`Check-ins: ${count ?? 0}, turnout: ${Math.round(clamped)}%`}
    >
      <svg viewBox="0 0 144 144" width="100%" height="100%">
        <defs>
          <linearGradient id="db-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
            <stop offset="100%" stopColor="#c2e2ff" stopOpacity={0.92} />
          </linearGradient>
          <filter id="db-ring-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#ffffff" floodOpacity="0.3" />
          </filter>
        </defs>
        <circle cx="72" cy="72" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={strokeWidth} />
        <circle
          className="db-ring-arc"
          cx="72"
          cy="72"
          r={r}
          fill="none"
          stroke="url(#db-ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ opacity: clamped > 0 ? 1 : 0 }}
          transform="rotate(-90 72 72)"
          filter={clamped > 0 ? "url(#db-ring-glow)" : undefined}
        />
      </svg>
      <div className="db-ring-center">
        <div className="db-ring-value">{count !== undefined && count !== null ? count : Math.round(p)}</div>
        <div className="db-ring-caption">{count !== undefined && count !== null ? "check-ins" : "turnout"}</div>
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
  const perm: Perms = roleData.loading ? null : (roleData.permissions as unknown as Perms);
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
  const [greeting, setGreeting] = useState("Hi");
  const [todayName, setTodayName] = useState("");
  const [mtdRange, setMtdRange] = useState({ now: "", prev: "" });
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>("widgets");
  const [updatePeriod, setUpdatePeriod] = useState<"today" | "weekly" | "monthly">("today");
  const [expiringDays, setExpiringDays] = useState<7 | 15 | 30>(7);
  const [paymentPeriod, setPaymentPeriod] = useState<"today" | "weekly" | "monthly">("today");
  const [checkInDropdownOpen, setCheckInDropdownOpen] = useState(false);
  const checkInDropdownRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (!checkInDropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (checkInDropdownRef.current && !checkInDropdownRef.current.contains(e.target as Node)) {
        setCheckInDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCheckInDropdownOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [checkInDropdownOpen]);

  useEffect(() => {
    setIsDark(getStoredTheme() === "dark");
    const onTheme = (e: Event) => {
      const detail = (e as CustomEvent<"light" | "dark">).detail;
      if (detail) setIsDark(detail === "dark");
      else setIsDark(getStoredTheme() === "dark");
    };
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setIsDark(next === "dark");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Client-only values: dates, saved layout
  useEffect(() => {
    const now = new Date();
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
  const resetLayout = () => update({ order: [...DEFAULT_PREFS.order], sizes: { ...DEFAULT_PREFS.sizes }, hidden: [...DEFAULT_PREFS.hidden] });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let userName = "";
      const meta = user.user_metadata;
      if (typeof meta?.name === "string" && meta.name.trim()) {
        userName = meta.name.trim();
      } else if (typeof meta?.full_name === "string" && meta.full_name.trim()) {
        userName = meta.full_name.trim();
      } else if (typeof meta?.first_name === "string" && meta.first_name.trim()) {
        userName = meta.first_name.trim();
      }

      if (userName) {
        const first = userName.split(/\s+/)[0];
        setGreeting(`Hi ${first.charAt(0).toUpperCase() + first.slice(1)}`);
      }

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
      const earliest = weekStart < monthStart ? weekStart : monthStart;
      const in7 = isoDay(new Date(Date.now() + 7 * 86400000));
      const in30 = isoDay(new Date(Date.now() + 30 * 86400000));
      const iso = (d: Date) => d.toISOString();
      const head = { count: "exact" as const, head: true };
      const closed = "(converted,lost)";

      const [
        org, active, lastActive, pay12m, visits7d, expCount, expTodayCount,
        newToday, newMtd, newPrev, ciMtd, ciPrev,
        leadsToday, leadsMtd, leadsPrev, convMtd, fuDue, fuOverdue,
        plans, membersAll, branches, expList, payList, visitList, classList, fuList, staffUser,
        activeStaffCount, activeClassesCount, attendancePeriod,
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
          .eq("org_id", oid).eq("status", "active").gte("end_date", today).lte("end_date", in30).order("end_date").limit(30),
        supabase.from("payments").select("id, total_paise, paid_at, method, members(id, full_name)")
          .eq("org_id", oid).order("paid_at", { ascending: false }).limit(50),
        supabase.from("attendance_logs").select("id, check_in_at, check_out_at, members(id, full_name)")
          .eq("org_id", oid).order("check_in_at", { ascending: false }).limit(6),
        supabase.from("classes").select("id, name, trainer_name, start_time, duration_mins, color")
          .eq("org_id", oid).eq("is_active", true).eq("schedule_day", DAYS[now.getDay()]).order("start_time"),
        supabase.from("leads").select("id, full_name, follow_up_at")
          .eq("org_id", oid).not("status", "in", closed).lte("follow_up_at", iso(todayEnd))
          .order("follow_up_at").limit(5),
        supabase.from("staff").select("name").eq("user_id", user.id).maybeSingle(),
        supabase.from("staff").select("*", head).eq("org_id", oid).eq("is_active", true),
        supabase.from("classes").select("*", head).eq("org_id", oid).eq("is_active", true),
        supabase.from("attendance_logs").select("check_in_at, check_out_at").eq("org_id", oid).gte("check_in_at", iso(earliest)),
      ]);

      if (org.data) setOrgName(org.data.name);

      if (!userName) {
        const staffName = (staffUser?.data as { name?: string } | null)?.name?.trim();
        if (staffName) {
          userName = staffName;
        } else if (user.email) {
          const local = user.email.split("@")[0].replace(/[._-]+/g, " ").trim();
          if (local) userName = local;
        }
        if (userName) {
          const first = userName.split(/\s+/)[0];
          setGreeting(`Hi ${first.charAt(0).toUpperCase() + first.slice(1)}`);
        }
      }

      // Revenue: 12 monthly buckets, plus today, MTD and the same days last month
      const months: Point[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), value: 0 });
      }
      let revenueToday = 0, paymentsToday = 0, revenueWeek = 0, paymentsWeek = 0, revenueMtd = 0, paymentsMtd = 0, revenueMtdPrev = 0;
      (pay12m.data || []).forEach((p: { total_paise: number; paid_at: string }) => {
        const d = new Date(p.paid_at);
        const idx = 11 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
        if (idx >= 0 && idx < 12) months[idx].value += p.total_paise;
        if (d >= todayStart) { revenueToday += p.total_paise; paymentsToday++; }
        if (d >= weekStart) { revenueWeek += p.total_paise; paymentsWeek++; }
        if (d >= monthStart) { revenueMtd += p.total_paise; paymentsMtd++; }
        else if (d >= prevStart && d <= prevSameDay) revenueMtdPrev += p.total_paise;
      });
      setRevenue(months);

      let ciWeek = 0, coWeek = 0, ciMonth = 0, coMonth = 0, coToday = 0;
      (attendancePeriod?.data || []).forEach((a: { check_in_at: string; check_out_at: string | null }) => {
        const inD = new Date(a.check_in_at);
        if (inD >= weekStart) ciWeek++;
        if (inD >= monthStart) ciMonth++;
        if (a.check_out_at) {
          const outD = new Date(a.check_out_at);
          if (outD >= todayStart) coToday++;
          if (outD >= weekStart) coWeek++;
          if (outD >= monthStart) coMonth++;
        }
      });

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
        checkoutsToday: coToday,
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
        checkinsWeek: ciWeek,
        checkoutsWeek: coWeek,
        checkoutsMtd: coMonth,
        paymentsWeek,
        revenueWeek,
        activeStaff: activeStaffCount.count || 0,
        classesTotal: activeClassesCount.count || classRows.length,
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

  const expiringFiltered = useMemo(() => {
    if (!expiring) return null;
    const maxDate = isoDay(new Date(Date.now() + expiringDays * 86400000));
    return expiring.filter((e) => e.end_date <= maxDate).slice(0, 5);
  }, [expiring, expiringDays]);

  const paymentsFiltered = useMemo(() => {
    if (!payments) return null;
    const now = new Date();
    const todayStartIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStartIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
    const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let list = payments;
    if (paymentPeriod === "today") {
      list = payments.filter((p) => p.paid_at >= todayStartIso);
    } else if (paymentPeriod === "weekly") {
      list = payments.filter((p) => p.paid_at >= weekStartIso);
    } else if (paymentPeriod === "monthly") {
      list = payments.filter((p) => p.paid_at >= monthStartIso);
    }
    return list.slice(0, 5);
  }, [payments, paymentPeriod]);

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
          <div className="db-hero-bg" aria-hidden>
            <div className="db-hero-glow" />
          </div>
          <div className="db-hero-top">
            <span className="db-hero-label"><Activity size={14} className="db-activity-pulse" /> Today</span>
            <span className="db-live db-live--red" title="Live real-time attendance">
              <span className="db-live-beacon db-live-beacon--red" aria-hidden>
                <span className="db-live-ping" />
                <span className="db-live-ping-ring" />
                <span className="db-live-core" />
              </span>
              <span>Live</span>
            </span>
          </div>
          <div className="db-hero-body db-hero-body--vertical">
            <Ring count={stats ? stats.checkinsToday : null} pct={turnout} size={152} />
            <div className="db-hero-info">
              <div className="db-hero-meta-row">
                <span className="db-hero-pill-pct">{turnout}% Turnout</span>
                {stats && stats.activeMembers > 0 && (
                  <span className="db-hero-pill-sub">{stats.checkinsToday} / {fullNum(stats.activeMembers)} active</span>
                )}
              </div>
              <div className="db-hero-sub">
                {!stats ? "\u00a0" : stats.activeMembers > 0
                  ? (stats.checkinsToday === 0
                      ? "No check-ins recorded yet today"
                      : `${stats.checkinsToday} visited · ${plural(stats.checkinsToday, "check-in")} recorded today`)
                  : "No active members yet"}
              </div>
            </div>
          </div>
          <div className="db-hero-action-wrap" ref={checkInDropdownRef}>
            <button
              type="button"
              className="db-hero-btn"
              onClick={() => setCheckInDropdownOpen((o) => !o)}
              aria-expanded={checkInDropdownOpen}
              aria-haspopup="menu"
            >
              <UserCheck size={15} strokeWidth={2.4} />
              <span>Check in</span>
              <ChevronDown size={14} className={clsx("db-hero-btn-arrow", checkInDropdownOpen && "db-hero-btn-arrow--open")} />
            </button>

            {checkInDropdownOpen && (
              <div className="db-checkin-menu" role="menu">
                <Link
                  href="/dashboard/attendance"
                  className="db-checkin-menu-item"
                  role="menuitem"
                  onClick={() => setCheckInDropdownOpen(false)}
                >
                  <span className="db-checkin-menu-icon db-tone-green">
                    <Users size={16} strokeWidth={2.4} />
                  </span>
                  <div className="db-checkin-menu-text">
                    <div className="db-checkin-menu-title">Member Check-in</div>
                    <div className="db-checkin-menu-sub">Record member attendance</div>
                  </div>
                  <ChevronRight size={14} className="db-checkin-menu-chev" />
                </Link>

                <div className="db-checkin-menu-sep" />

                <Link
                  href="/dashboard/staff"
                  className="db-checkin-menu-item"
                  role="menuitem"
                  onClick={() => setCheckInDropdownOpen(false)}
                >
                  <span className="db-checkin-menu-icon db-tone-purple">
                    <UsersRound size={16} strokeWidth={2.4} />
                  </span>
                  <div className="db-checkin-menu-text">
                    <div className="db-checkin-menu-title">Employee Check-in</div>
                    <div className="db-checkin-menu-sub">Staff check-in & roster</div>
                  </div>
                  <ChevronRight size={14} className="db-checkin-menu-chev" />
                </Link>
              </div>
            )}
          </div>
        </section>
      );

      case "tasks": {
        const isToday = updatePeriod === "today";
        const isWeekly = updatePeriod === "weekly";
        const isMonthly = updatePeriod === "monthly";

        const curActive = stats?.activeMembers ?? 0;
        const curCheckins = isToday
          ? (stats?.checkinsToday ?? 0)
          : isWeekly
          ? (stats?.checkinsWeek ?? stats?.checkinsToday ?? 0)
          : (stats?.checkinsMtd ?? 0);

        const curCheckouts = isToday
          ? (stats?.checkoutsToday ?? 0)
          : isWeekly
          ? (stats?.checkoutsWeek ?? 0)
          : (stats?.checkoutsMtd ?? 0);

        const curPayCount = isToday
          ? (stats?.paymentsToday ?? 0)
          : isWeekly
          ? (stats?.paymentsWeek ?? 0)
          : (stats?.paymentsMtd ?? 0);

        const curPayRev = isToday
          ? (stats?.revenueToday ?? 0)
          : isWeekly
          ? (stats?.revenueWeek ?? 0)
          : (stats?.revenueMtd ?? 0);

        const curClasses = isToday
          ? (stats?.classesToday ?? 0)
          : (stats?.classesTotal ?? stats?.classesToday ?? 0);

        const curStaff = stats?.activeStaff ?? 0;

        const subPeriodText = isToday
          ? "Today's overview & activity"
          : isWeekly
          ? "Weekly overview & activity"
          : "Monthly overview & activity";

        const periodLabel = isToday ? "Today" : isWeekly ? "This week" : "This month";

        return (
          <section className="db-card db-pad db-updates-card">
            <div className="db-card-head" style={{ alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="db-card-title">Today&apos;s updates</h2>
                <div className="db-card-sub">{subPeriodText}</div>
              </div>
              <div className="db-period-toggle" role="group" aria-label="Updates time range">
                <button
                  type="button"
                  className={clsx("db-period-btn", isToday && "active")}
                  onClick={() => setUpdatePeriod("today")}
                  aria-pressed={isToday}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={clsx("db-period-btn", isWeekly && "active")}
                  onClick={() => setUpdatePeriod("weekly")}
                  aria-pressed={isWeekly}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={clsx("db-period-btn", isMonthly && "active")}
                  onClick={() => setUpdatePeriod("monthly")}
                  aria-pressed={isMonthly}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div className="db-updates-grid">
              <Link href="/dashboard/members?filter=active" className="db-update-cell db-tone-blue">
                <div className="db-update-head">
                  <span className="db-update-icon"><Users size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">{stats === null ? "-" : fullNum(curActive)}</div>
                <div className="db-update-lbl">Active members</div>
                <div className="db-update-sub">Enrolled members</div>
              </Link>

              <Link href="/dashboard/attendance" className="db-update-cell db-tone-green">
                <div className="db-update-head">
                  <span className="db-update-icon"><UserCheck size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">{stats === null ? "-" : fullNum(curCheckins)}</div>
                <div className="db-update-lbl">Check in</div>
                <div className="db-update-sub">{periodLabel}</div>
              </Link>

              <Link href="/dashboard/attendance" className="db-update-cell db-tone-purple">
                <div className="db-update-head">
                  <span className="db-update-icon"><LogOut size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">{stats === null ? "-" : fullNum(curCheckouts)}</div>
                <div className="db-update-lbl">Check out</div>
                <div className="db-update-sub">{periodLabel}</div>
              </Link>

              <Link href="/dashboard/payments" className="db-update-cell db-tone-blue">
                <div className="db-update-head">
                  <span className="db-update-icon"><Wallet size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">
                  {stats === null ? "-" : curPayRev > 0 ? `₹${compact(rupees(curPayRev))}` : `${curPayCount}`}
                </div>
                <div className="db-update-lbl">Payments</div>
                <div className="db-update-sub">{stats === null ? "-" : `${fullNum(curPayCount)} ${plural(curPayCount, "paid")}`}</div>
              </Link>

              <Link href="/dashboard/classes" className="db-update-cell db-tone-green">
                <div className="db-update-head">
                  <span className="db-update-icon"><CalendarDays size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">{stats === null ? "-" : fullNum(curClasses)}</div>
                <div className="db-update-lbl">Classes</div>
                <div className="db-update-sub">{isToday ? "Scheduled today" : "Active schedules"}</div>
              </Link>

              <Link href="/dashboard/staff" className="db-update-cell db-tone-purple">
                <div className="db-update-head">
                  <span className="db-update-icon"><UsersRound size={15} strokeWidth={2.4} /></span>
                  <ChevronRight size={13} className="db-update-chev" />
                </div>
                <div className="db-update-val">{stats === null ? "-" : fullNum(curStaff)}</div>
                <div className="db-update-lbl">Employees</div>
                <div className="db-update-sub">Active staff</div>
              </Link>
            </div>
          </section>
        );
      }

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

      case "expiring": {
        const rows = expiringFiltered;
        return (
          <section className="db-card db-pad">
            <div className="db-card-head" style={{ alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="db-card-title">Expiring soon</h2>
                <div className="db-card-sub">Renewals due in {expiringDays} days</div>
              </div>
              <div className="db-period-toggle" role="group" aria-label="Expiring days range">
                {([7, 15, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={clsx("db-period-btn", expiringDays === d && "active")}
                    onClick={() => setExpiringDays(d)}
                    aria-pressed={expiringDays === d}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            {rows === null ? <RowsSkeleton /> : rows.length === 0 ? (
              <Empty icon={Check} title="All caught up" text={`No memberships expire in the next ${expiringDays} days.`} />
            ) : (
              <div className="db-rows">
                {rows.map((e) => {
                  const d = daysUntil(e.end_date);
                  return (
                    <Link
                      key={e.id}
                      href={e.members ? `/dashboard/members/${e.members.id}` : "/dashboard/members?filter=expiring"}
                      className="db-row db-row--link"
                    >
                      <Avatar name={e.members?.full_name ?? "?"} size={34} />
                      <div className="db-row-text">
                        <div className="db-row-title">{e.members?.full_name ?? "Member"}</div>
                        <div className="db-row-sub">{e.membership_plans?.name ?? "Membership"}</div>
                      </div>
                      <span className={`db-pill ${d <= 2 ? "db-pill--red" : "db-pill--amber"}`}>
                        {d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days left`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      }

      case "payments": {
        const rows = paymentsFiltered;
        const subText =
          paymentPeriod === "today"
            ? "Transactions today"
            : paymentPeriod === "weekly"
            ? "Transactions this week"
            : "Transactions this month";
        const emptyText =
          paymentPeriod === "today"
            ? "No payments recorded today."
            : paymentPeriod === "weekly"
            ? "No payments recorded this week."
            : "No payments recorded this month.";
        return (
          <section className="db-card db-pad">
            <div className="db-card-head" style={{ alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="db-card-title">Recent payments</h2>
                <div className="db-card-sub">{subText}</div>
              </div>
              <div className="db-period-toggle" role="group" aria-label="Recent payments range">
                <button
                  type="button"
                  className={clsx("db-period-btn", paymentPeriod === "today" && "active")}
                  onClick={() => setPaymentPeriod("today")}
                  aria-pressed={paymentPeriod === "today"}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={clsx("db-period-btn", paymentPeriod === "weekly" && "active")}
                  onClick={() => setPaymentPeriod("weekly")}
                  aria-pressed={paymentPeriod === "weekly"}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={clsx("db-period-btn", paymentPeriod === "monthly" && "active")}
                  onClick={() => setPaymentPeriod("monthly")}
                  aria-pressed={paymentPeriod === "monthly"}
                >
                  Monthly
                </button>
              </div>
            </div>
            {rows === null ? <RowsSkeleton /> : rows.length === 0 ? (
              <Empty icon={Wallet} title="No payments yet" text={emptyText} />
            ) : (
              <div className="db-rows">
                {rows.map((p) => (
                  <Link
                    key={p.id}
                    href={p.members ? `/dashboard/members/${p.members.id}` : "/dashboard/payments"}
                    className="db-row db-row--link"
                  >
                    <span className="db-pay-icon"><IndianRupee size={15} strokeWidth={2.4} /></span>
                    <div className="db-row-text">
                      <div className="db-row-title">{p.members?.full_name ?? "Payment"}</div>
                      <div className="db-row-sub">{p.method ? METHOD[p.method] ?? p.method : "Payment"} · {ago(p.paid_at)}</div>
                    </div>
                    <span className="db-amount">+<Num v={p.total_paise} money full={full} /></span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      }

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
          <h1 className="db-title">{greeting}</h1>
          <p className="db-subtitle">Gym Snapshot</p>
        </div>
        <div className="db-header-actions">
          <Link
            href="/dashboard/settings"
            className="db-sub-pill"
            title="Gym subscription: 35 days left · View subscription & settings"
            aria-label="Gym subscription: 35 days left"
          >
            <span className="db-sub-dot" />
            <span>35 days left</span>
          </Link>

          <button
            type="button"
            className="ps-btn ps-btn--secondary db-btn-icon"
            onClick={handleToggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {!editing && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary db-btn-icon"
              onClick={() => openSheet("widgets")}
              title={`Customize widgets${hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}`}
              aria-label="Customize widgets"
            >
              <SlidersHorizontal size={15} />
              {hiddenCount > 0 && <span className="db-count">{hiddenCount}</span>}
            </button>
          )}
          <button
            type="button"
            className={clsx("ps-btn db-btn-icon", editing ? "ps-btn--primary" : "ps-btn--secondary")}
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
            title={editing ? "Done editing layout" : "Edit layout"}
            aria-label={editing ? "Done editing layout" : "Edit layout"}
          >
            {editing ? <Check size={15} strokeWidth={2.6} /> : <LayoutGrid size={15} />}
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
@media (min-width: 1920px) {
  .ps-page.ov { max-width: 1680px !important; margin: 0 auto !important; }
}

.ov .db-header { align-items: center; margin-bottom: 12px; gap: 12px; }
.ov .db-kicker { font-size: 11.5px; margin-bottom: 2px; }
.ov .db-title { font-size: 24px; }
.ov .db-subtitle { font-size: 13.5px; margin-top: 2px; }
.ov .db-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ov .db-header-actions .ps-btn { height: 34px; padding: 0 12px; font-size: 13.5px; }
.ov .db-header-actions .db-btn-icon {
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative;
  flex: 0 0 34px !important;
  border-radius: 9px;
}
.ov .db-btn-icon .db-count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 0 4px;
  border: 2px solid var(--bg-page, #f5f5f7);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.ov .db-sub-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 550;
  letter-spacing: -0.01em;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  cursor: pointer;
  transition: all 140ms ease;
}
.ov .db-sub-pill:hover {
  background: var(--fill, rgba(118, 118, 128, 0.08));
  color: var(--text-primary);
  border-color: var(--border-mid);
  transform: translateY(-1px);
}
.ov .db-sub-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34c759;
  box-shadow: 0 0 6px rgba(52, 199, 89, 0.6);
  flex-shrink: 0;
}

/* Period toggle */
.ov .db-period-toggle {
  display: inline-flex;
  align-items: center;
  background: var(--fill, rgba(118, 118, 128, 0.1));
  border-radius: 999px;
  padding: 3px;
  border: 1px solid var(--border);
  gap: 2px;
}
.ov .db-period-btn {
  background: transparent;
  border: 0;
  font-size: 12px;
  font-weight: 550;
  color: var(--text-secondary);
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 140ms ease;
  line-height: 1.3;
}
.ov .db-period-btn:hover {
  color: var(--text-primary);
}
.ov .db-period-btn.active {
  background: var(--surface, #ffffff);
  color: var(--text-primary);
  font-weight: 650;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
html[data-theme="dark"] .ov .db-period-btn.active,
html.dark .ov .db-period-btn.active {
  background: var(--surface-3, #252936);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.35);
}

/* Updates grid */
.ov .db-updates-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 680px) {
  .ov .db-updates-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 380px) {
  .ov .db-updates-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.ov .db-update-cell {
  display: flex;
  flex-direction: column;
  padding: 11px 13px;
  border-radius: 14px;
  background: var(--surface-2, #f5f5f7);
  border: 1px solid var(--border);
  text-decoration: none;
  color: inherit;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
  min-height: 102px;
}
.ov .db-update-cell:hover {
  transform: translateY(-1.5px);
  border-color: var(--border-mid);
  box-shadow: var(--shadow-sm);
}
.ov .db-update-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.ov .db-update-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--t-dim, rgba(10, 102, 214, 0.1));
  color: var(--t, var(--accent));
}
.ov .db-update-chev {
  color: var(--text-tertiary);
  opacity: 0.5;
  transition: transform 140ms ease, opacity 140ms ease;
}
.ov .db-update-cell:hover .db-update-chev {
  opacity: 1;
  transform: translateX(2px);
  color: var(--accent);
}
.ov .db-update-val {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.ov .db-update-lbl {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov .db-update-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Eye-catching RED blinking live beacon & hero animations */
.db-live--red {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6.5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.24);
  border: 1px solid rgba(255, 69, 58, 0.5);
  color: #ffffff;
  backdrop-filter: blur(8px);
  animation: db-live-red-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.db-live-beacon--red {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
}
.db-live-beacon--red .db-live-ping {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #ff3b30;
  opacity: 0.85;
  animation: db-live-red-radar 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.db-live-beacon--red .db-live-ping-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1.5px solid #ff3b30;
  opacity: 0.75;
  animation: db-live-red-radar 1.6s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s;
}
.db-live-beacon--red .db-live-core {
  position: relative;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff3b30;
  box-shadow: 0 0 10px #ff3b30, 0 0 16px rgba(255, 59, 48, 0.85);
}

@keyframes db-live-red-radar {
  0% { transform: scale(1); opacity: 0.95; }
  70%, 100% { transform: scale(3.2); opacity: 0; }
}

@keyframes db-live-red-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 59, 48, 0.35), 0 0 12px rgba(255, 59, 48, 0.4);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.2), 0 0 20px rgba(255, 59, 48, 0.7);
  }
}

.db-activity-pulse {
  animation: db-heartbeat 2.4s ease-in-out infinite;
}

@keyframes db-heartbeat {
  0%, 100% { transform: scale(1); }
  10% { transform: scale(1.22); }
  20% { transform: scale(1); }
  30% { transform: scale(1.15); }
  40% { transform: scale(1); }
}

.ov .db-hero {
  position: relative;
  overflow: visible !important;
  border-radius: var(--db-r-card, 20px);
  padding: 16px;
  gap: 12px;
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.ov .db-hero:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 34px -8px rgba(10,102,214,0.55);
}

.ov .db-hero-bg {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.ov .db-hero > *:not(.db-hero-bg) {
  position: relative;
  z-index: 1;
}

.ov .db-hero-glow {
  animation: db-hero-ambient 6s ease-in-out infinite alternate;
}

@keyframes db-hero-ambient {
  0% { transform: translate(0, 0) scale(1); opacity: 0.7; }
  100% { transform: translate(-18px, 12px) scale(1.18); opacity: 0.95; }
}

.db-ring--hero, .ov .db-ring--hero {
  transform: none !important;
  width: 152px !important;
  height: 152px !important;
  flex-shrink: 0;
  margin: 4px auto;
  position: relative;
}
.db-ring--hero .db-ring-value {
  font-size: 38px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #ffffff;
  line-height: 1;
}
.db-ring--hero .db-ring-caption {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.88);
  margin-top: 4px;
}
.ov .db-hero-body, .db-hero-body--vertical {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 12px;
  position: relative;
  flex: 1;
  text-align: center;
  padding: 6px 0 2px;
}
.ov .db-hero.db-span-4 .db-hero-body {
  justify-content: center !important;
  align-items: center !important;
}
.db-hero-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
}
.db-hero-meta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.db-hero-pill-pct {
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2.5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  letter-spacing: 0.01em;
  backdrop-filter: blur(4px);
}
.db-hero-pill-sub {
  font-size: 12px;
  opacity: 0.9;
  font-weight: 550;
  color: rgba(255, 255, 255, 0.95);
}
.db-hero-sub {
  font-size: 12.5px;
  opacity: 0.85;
  margin-top: 2px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
}

/* Checkin Dropdown */
.db-hero-action-wrap {
  position: relative;
  width: 100%;
}
.ov .db-hero-btn {
  width: 100%;
  cursor: pointer;
  border: none;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.db-hero-btn-arrow {
  transition: transform 180ms ease;
  margin-left: 2px;
}
.db-hero-btn-arrow--open {
  transform: rotate(180deg);
}
.db-checkin-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--surface, #ffffff);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
  z-index: 60;
  animation: db-menu-pop 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
html[data-theme="dark"] .db-checkin-menu,
html.dark .db-checkin-menu {
  background: var(--surface-2, #1c1f2a);
  border-color: var(--border-strong, rgba(255, 255, 255, 0.14));
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
}
@keyframes db-menu-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.db-checkin-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--text-primary, #1d1d1f);
  transition: background 120ms ease;
  cursor: pointer;
}
.db-checkin-menu-item:hover {
  background: var(--fill, rgba(118, 118, 128, 0.08));
}
html[data-theme="dark"] .db-checkin-menu-item,
html.dark .db-checkin-menu-item {
  color: #ffffff;
}
.db-checkin-menu-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.db-checkin-menu-text {
  flex: 1;
  min-width: 0;
}
.db-checkin-menu-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.25;
}
.db-checkin-menu-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 1px;
}
.db-checkin-menu-chev {
  color: var(--text-tertiary);
  opacity: 0.6;
  flex-shrink: 0;
}
.db-checkin-menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 6px;
}

.ov .dz-grid { gap: 12px; margin-bottom: 0; }
.ov .dz-editbar { margin-bottom: 12px; }

.ov .db-pad { padding: 14px 16px; }
.ov .db-card-head { margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.ov .db-card-title { font-size: 15px; }
.ov .db-chart { height: 200px; }
.ov .db-chart--sm { height: 170px; }

.ov .db-hero { padding: 18px 16px 16px; gap: 12px; }
.ov .db-ring { transform: scale(0.86); transform-origin: center; }
.ov .db-ring--hero { transform: none !important; width: 152px !important; height: 152px !important; flex-shrink: 0; }

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
  .ov .db-header-actions .db-btn-icon { width: 38px !important; height: 38px !important; flex: 0 0 38px !important; }
  .ov .db-sub-pill { height: 38px; }
  .ov .dz-grid { gap: 10px; }
  .ov .dz-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ov .db-pad { padding: 12px 14px; }
  .ov .db-chart { height: 180px; }
}
@media (max-width: 360px) {
  .ov .dz-cells { grid-template-columns: minmax(0, 1fr); }
  .ov .db-title { font-size: 20px; }
}
`;
