"use client";
// app/dashboard/reports/page.tsx
// Reports: period + compare filters, KPI strip with change vs the previous period, and an editable
// grid of report cards (drag, resize, hide; saved on this device). Numbers read compact (₹4.2K) and
// show the full figure on click, same as the Overview.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, Sector, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceLine, Brush,
} from "recharts";
import {
  Download, BarChart3, Users, Activity, Wallet, TrendingUp, TrendingDown, RefreshCw, UserPlus, UserMinus, Clock,
  CalendarDays, LayoutGrid, Check, GripVertical, EyeOff, Plus, RotateCcw, AlertTriangle, Repeat, Target, Filter, X,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { Avatar, Skeleton } from "../components/ui";
import { DesignStyles } from "../components/DesignSystem";

const supabase = createClient();

// Brand palette for charts: blues first, then neutral accents
const PALETTE = ["#0a66d6", "#3c4fe0", "#30b0c7", "#7aa7ff", "#5e5ce6", "#0e7c8f", "#a9c4f5", "#1f3f8a"];
const BRAND = "#0a66d6";
const PREV = "#b8c7e3";

/* ───────── Numbers (same behaviour as the Overview) ───────── */

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
    if (i > 0 && shown * base >= units[i - 1][0]) return `${sign}1${units[i - 1][1]}`;
    return `${sign}${shown}${suffix}`;
  }
  return `${sign}${a}`;
}
const fullNum = (n: number) => Math.round(n).toLocaleString("en-IN");
const rupees = (paise: number) => Math.round(paise / 100);

function Num({ v, money, suffix = "" }: { v: number; money?: boolean; suffix?: string }) {
  const [open, setOpen] = useState(false);
  const value = money ? rupees(v) : Math.round(v);
  const prefix = money ? "₹" : "";
  const long = `${prefix}${fullNum(value)}${suffix}`;
  if (Math.abs(value) < 1000) return <span className="rp-num">{long}</span>;
  return (
    <button type="button" className="rp-num rp-num--toggle" title={long} aria-label={`${long}. Toggle full figure`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>
      {open ? long : `${prefix}${compact(value)}${suffix}`}
    </button>
  );
}

function Delta({ now, prev, invert }: { now: number; prev: number; invert?: boolean }) {
  if (!prev && !now) return <span className="rp-delta rp-delta--flat">—</span>;
  if (!prev) return <span className="rp-delta rp-delta--up">New</span>;
  const pct = Math.round(((now - prev) / Math.abs(prev)) * 100);
  const good = invert ? pct < 0 : pct > 0;
  if (pct === 0) return <span className="rp-delta rp-delta--flat">0%</span>;
  return (
    <span className={`rp-delta ${good ? "rp-delta--up" : "rp-delta--down"}`}>
      {pct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(pct)}%
    </span>
  );
}

/* ───────── Types & periods ───────── */

type Period = "7d" | "30d" | "90d" | "mtd" | "ytd" | "12m" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "7d", label: "7D" }, { key: "30d", label: "30D" }, { key: "90d", label: "90D" },
  { key: "mtd", label: "This month" }, { key: "ytd", label: "This year" }, { key: "12m", label: "12M" }, { key: "custom", label: "Custom" },
];
type GroupBy = "auto" | "day" | "week" | "month";
type Filters = {
  period: Period; from: string; to: string; planId: string; method: string; gender: string; goal: string
  member: string; days: number[]; band: number | null; minAmt: string; maxAmt: string; groupBy: GroupBy
};
const NO_EXTRA = { planId: "", method: "", gender: "", goal: "", member: "", days: [] as number[], band: null, minAmt: "", maxAmt: "" };

type Tab = "overview" | "revenue" | "members" | "attendance" | "retention" | "classes";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" }, { key: "revenue", label: "Revenue" }, { key: "members", label: "Members" },
  { key: "attendance", label: "Attendance" }, { key: "retention", label: "Renewals & retention" }, { key: "classes", label: "Classes" },
];
/** Which filters make sense on each report. Others are hidden and cleared when you switch. */
type FKey = "plan" | "member" | "method" | "gender" | "goal" | "amount" | "days" | "band"
const TAB_FILTERS: Record<Tab, FKey[]> = {
  overview: ["plan", "member", "method", "gender", "goal", "amount", "days", "band"],
  revenue: ["plan", "member", "method", "amount", "days", "gender", "goal"],
  members: ["plan", "member", "gender", "goal"],
  attendance: ["plan", "member", "gender", "goal", "days", "band"],
  retention: ["plan", "member", "gender", "goal"],
  classes: [],
}
const FILTER_RESET: Record<FKey, Partial<Filters>> = {
  plan: { planId: "" }, member: { member: "" }, method: { method: "" }, gender: { gender: "" }, goal: { goal: "" },
  amount: { minAmt: "", maxAmt: "" }, days: { days: [] }, band: { band: null },
}
const BANDS = [[5, 8, "5–8am"], [8, 11, "8–11am"], [11, 16, "11am–4pm"], [16, 19, "4–7pm"], [19, 23, "7–11pm"]] as const;

type Plan = { id: string; name: string; price_paise: number; duration_days: number | null };
type MemberRow = { id: string; created_at: string; full_name: string; phone: string | null; primary_goal: string | null; sex: string | null };
type PaymentRow = { total_paise: number; paid_at: string; method: string | null; member_id: string; memberships: { membership_plans: { id: string; name: string } | null } | null };
type AttendanceRow = { check_in_at: string; member_id: string };
type MembershipRow = { member_id: string; start_date: string | null; end_date: string; status: string; membership_plans: { id: string; name: string; price_paise: number; duration_days: number | null } | null };
type ClassRow = { id: string; name: string; capacity: number };
type BookingRow = { class_id: string; booked_for: string };

function range(f: Filters) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  let start = new Date(); start.setHours(0, 0, 0, 0);
  if (f.period === "7d") start.setDate(start.getDate() - 6);
  else if (f.period === "30d") start.setDate(start.getDate() - 29);
  else if (f.period === "90d") start.setDate(start.getDate() - 89);
  else if (f.period === "mtd") start = new Date(start.getFullYear(), start.getMonth(), 1);
  else if (f.period === "ytd") start = new Date(start.getFullYear(), 0, 1);
  else if (f.period === "12m") { start.setMonth(start.getMonth() - 12); start.setDate(start.getDate() + 1); }
  else if (f.period === "custom" && f.from && f.to) return { start: new Date(`${f.from}T00:00:00`), end: new Date(`${f.to}T23:59:59`) };
  return { start, end };
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank transfer", online: "Online", cheque: "Cheque" };
const GOAL_LABEL: Record<string, string> = { fat_loss: "Fat loss", muscle_gain: "Muscle gain", weight_gain: "Weight gain", maintenance: "Maintenance", healthy_eating: "Healthy eating", general_fitness: "General fitness", strength: "Strength", endurance: "Endurance" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ───────── Layout ───────── */

type CardId = "revenue" | "byplan" | "methods" | "growth" | "checkins" | "peak" | "renewals" | "atrisk" | "topmembers" | "goals" | "classes" | "outstanding";
type Span = 4 | 6 | 8 | 12;
type Layout = { order: CardId[]; hidden: CardId[]; sizes: Partial<Record<CardId, Span>>; kpis: KpiId[] };
type KpiId = "revenue" | "payments" | "avg_ticket" | "mrr" | "active" | "new" | "churn" | "retention" | "checkins" | "visits_per" | "renewal_value" | "class_fill";

const CARD_LABEL: Record<CardId, string> = {
  revenue: "Revenue trend", byplan: "Revenue by plan", methods: "Payment methods", growth: "Joins vs lapses",
  checkins: "Check-ins", peak: "Peak hours", renewals: "Renewals due", atrisk: "At-risk members",
  topmembers: "Most active members", goals: "Member goals", classes: "Class fill rate", outstanding: "Plan mix",
};
const KPI_LABEL: Record<KpiId, string> = {
  revenue: "Revenue", payments: "Payments", avg_ticket: "Avg. payment", mrr: "MRR", active: "Active members",
  new: "New members", churn: "Lapsed", retention: "Retention", checkins: "Check-ins", visits_per: "Visits / member",
  renewal_value: "Renewals due", class_fill: "Class fill",
};
const DEFAULT_LAYOUT: Layout = {
  order: ["revenue", "byplan", "growth", "methods", "checkins", "peak", "renewals", "atrisk", "topmembers", "goals", "outstanding", "classes"],
  hidden: [],
  sizes: { revenue: 8, byplan: 4, growth: 8, methods: 4, checkins: 6, peak: 6, renewals: 6, atrisk: 6, topmembers: 4, goals: 4, outstanding: 4, classes: 12 },
  kpis: ["revenue", "mrr", "active", "new", "churn", "retention", "checkins", "renewal_value"],
};
/** Focused reports: only the cards and KPIs that belong to that topic. */
const TAB_DEFAULTS: Record<Tab, Layout> = {
  overview: DEFAULT_LAYOUT,
  revenue: { order: ["revenue", "byplan", "methods", "outstanding", "renewals"], hidden: [], sizes: { revenue: 8, byplan: 4, methods: 4, outstanding: 4, renewals: 4 }, kpis: ["revenue", "payments", "avg_ticket", "mrr", "renewal_value"] },
  members: { order: ["growth", "goals", "outstanding", "atrisk", "topmembers"], hidden: [], sizes: { growth: 8, goals: 4, outstanding: 4, atrisk: 4, topmembers: 4 }, kpis: ["active", "new", "churn", "retention", "visits_per"] },
  attendance: { order: ["checkins", "topmembers", "peak", "atrisk"], hidden: [], sizes: { checkins: 8, topmembers: 4, peak: 8, atrisk: 4 }, kpis: ["checkins", "visits_per", "active", "class_fill"] },
  retention: { order: ["renewals", "atrisk", "growth", "outstanding"], hidden: [], sizes: { renewals: 6, atrisk: 6, growth: 8, outstanding: 4 }, kpis: ["retention", "churn", "renewal_value", "active", "mrr"] },
  classes: { order: ["classes", "peak"], hidden: [], sizes: { classes: 6, peak: 6 }, kpis: ["class_fill", "checkins", "active"] },
};
const LAYOUT_KEY = "psync.reports.layout.v3";
const SIZE_LABEL: Record<Span, string> = { 4: "S", 6: "M", 8: "L", 12: "Full" };

function readLayout(tab: Tab): Layout {
  const def = TAB_DEFAULTS[tab];
  try {
    const raw = JSON.parse(localStorage.getItem(`${LAYOUT_KEY}.${tab}`) ?? "null") as Partial<Layout> | null;
    if (!raw) return def;
    const known = def.order;
    const order = (raw.order ?? []).filter((c): c is CardId => known.includes(c as CardId));
    known.forEach((c) => { if (!order.includes(c)) order.push(c); });
    const kpis = (raw.kpis ?? def.kpis).filter((k) => k in KPI_LABEL) as KpiId[];
    return { order, hidden: (raw.hidden ?? []).filter((c) => known.includes(c)), sizes: { ...def.sizes, ...(raw.sizes ?? {}) }, kpis };
  } catch { return def; }
}

function Tile({ id, span, editing, onSize, onHide, children }: {
  id: CardId; span: Span; editing: boolean; onSize: (s: Span) => void; onHide: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  return (
    <div ref={setNodeRef} className={`rp-tile rp-span-${span}`} data-dragging={isDragging}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}>
      {editing && (
        <div className="rp-tools">
          <button type="button" ref={setActivatorNodeRef} className="rp-tool rp-grip" aria-label={`Move ${CARD_LABEL[id]}`} {...attributes} {...listeners}><GripVertical size={14} /></button>
          <div className="rp-sizes">
            {([4, 6, 8, 12] as Span[]).map((s) => <button key={s} type="button" aria-pressed={s === span} onClick={() => onSize(s)}>{SIZE_LABEL[s]}</button>)}
          </div>
          <button type="button" className="rp-tool" aria-label={`Hide ${CARD_LABEL[id]}`} onClick={onHide}><EyeOff size={14} /></button>
        </div>
      )}
      {children}
    </div>
  );
}

/** Small segmented toggle used inside card headers. */
function Mini<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="rp-mini" role="group">
      {options.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}
    </span>
  );
}

/** Donut slice that grows on hover. */
function ActiveSlice(props: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string }) {
  return <Sector {...props} outerRadius={props.outerRadius + 6} cornerRadius={3} />;
}

function Card({ title, icon: Icon, sub, right, children }: { title: string; icon: React.ElementType; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rp-card">
      <header className="rp-card-h">
        <span className="rp-card-icon"><Icon size={14} /></span>
        <div className="rp-card-t"><h3>{title}</h3>{sub && <small>{sub}</small>}</div>
        {right}
      </header>
      {children}
    </section>
  );
}

function ChartTip({ active, payload, label, money }: { active?: boolean; payload?: { value: number; name: string; color?: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rp-tip">
      <b>{label}</b>
      {payload.map((p) => (
        <span key={p.name}><i style={{ background: p.color }} />{p.name}: {money ? `₹${fullNum(rupees(p.value))}` : fullNum(p.value)}</span>
      ))}
    </div>
  );
}

const axis = { fontSize: 11, fill: "var(--text-tertiary)" };

/* ───────── Detail table ───────── */

type Col<R> = { key: string; label: string; get: (r: R) => string | number; show?: (r: R) => React.ReactNode; right?: boolean; money?: boolean };
function DetailTable<R>({ title, rows, cols, defaultSort, empty, file }: {
  title: string; rows: R[]; cols: Col<R>[]; defaultSort: string; empty: string; file: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: defaultSort, dir: -1 });
  const [page, setPage] = useState(0);
  const PER = 15;
  const term = q.trim().toLowerCase();
  const list = useMemo(() => {
    const col = cols.find((c) => c.key === sort.k) ?? cols[0];
    const r = rows.filter((x) => !term || cols.some((c) => String(c.get(x)).toLowerCase().includes(term)));
    return [...r].sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, term, sort]);
  useEffect(() => { setPage(0); }, [term, sort, rows]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c.label)).join(","), ...list.map((r) => cols.map((c) => esc(c.money ? rupees(Number(c.get(r))) : c.get(r))).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `${file}.csv`; a.click();
  }
  return (
    <section className="rp-card rp-table">
      <header className="rp-card-h">
        <span className="rp-card-icon"><BarChart3 size={14} /></span>
        <div className="rp-card-t"><h3>{title}</h3><small>{list.length} row{list.length === 1 ? "" : "s"}{term ? ` matching "${q.trim()}"` : ""}</small></div>
        <label className="rp-tsearch"><input type="search" placeholder="Search this table" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button type="button" className="rp-tbtn" onClick={csv}><Download size={13} />CSV</button>
      </header>
      {list.length === 0 ? <div className="rp-empty">{empty}</div> : (
        <div className="rp-tscroll">
          <table>
            <thead><tr>{cols.map((c) => (
              <th key={c.key} data-right={c.right}>
                <button type="button" data-on={sort.k === c.key} onClick={() => setSort((s0) => s0.k === c.key ? { k: c.key, dir: (s0.dir * -1) as 1 | -1 } : { k: c.key, dir: -1 })}>
                  {c.label}{sort.k === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}</tr></thead>
            <tbody>{list.slice(page * PER, (page + 1) * PER).map((r, i) => (
              <tr key={i}>{cols.map((c) => <td key={c.key} data-right={c.right}>{c.show ? c.show(r) : c.money ? <Num v={Number(c.get(r))} money /> : c.get(r)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="rp-tpager">
          <span>{page * PER + 1}–{Math.min((page + 1) * PER, list.length)} of {list.length}</span>
          <button type="button" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>Previous</button>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((x) => x + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

/* ───────── Page ───────── */

export default function ReportsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ period: "30d", from: "", to: "", groupBy: "auto", ...NO_EXTRA });
  const [tab, setTab] = useState<Tab>("overview");
  const [compare, setCompare] = useState(true);
  const [revMode, setRevMode] = useState<"cumulative" | "daily">("cumulative");
  const [growthHide, setGrowthHide] = useState<string[]>([]);
  const [donutIdx, setDonutIdx] = useState<number | null>(null);
  const [peakSel, setPeakSel] = useState<[number, number] | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("report") as Tab | null;
    if (t && TAB_DEFAULTS[t]) setTab(t);
  }, []);
  useEffect(() => { setLayout(readLayout(tab)); setEditing(false); }, [tab]);
  function saveLayout(next: Layout) { setLayout(next); try { localStorage.setItem(`${LAYOUT_KEY}.${tab}`, JSON.stringify(next)); } catch { /* ignore */ } }
  function changeTab(t: Tab) {
    setTab(t);
    const allowed = TAB_FILTERS[t];
    const clear = (Object.keys(FILTER_RESET) as FKey[]).filter((k) => !allowed.includes(k)).reduce((acc, k) => ({ ...acc, ...FILTER_RESET[k] }), {} as Partial<Filters>);
    setFilters((f) => ({ ...f, ...clear }));
    if (!allowed.length) setMoreOpen(false);
    const u = new URL(window.location.href); if (t === "overview") u.searchParams.delete("report"); else u.searchParams.set("report", t);
    window.history.replaceState(null, "", u.toString());
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { start, end } = range(filters);
  const len = end.getTime() - start.getTime();
  const pStart = new Date(start.getTime() - len - 1), pEnd = new Date(start.getTime() - 1);

  const load = useCallback(async (oid: string, f: Filters) => {
    setLoading(true);
    const { start: s, end: e } = range(f);
    const l = e.getTime() - s.getTime();
    const from = new Date(s.getTime() - l - 1).toISOString(); // previous period too, for comparison
    const to = e.toISOString();
    const lookback = new Date(); lookback.setDate(lookback.getDate() - 60);
    const attFrom = new Date(Math.min(new Date(from).getTime(), lookback.getTime())).toISOString();
    const [p, m, ms, a, c, b] = await Promise.all([
      supabase.from("payments").select("total_paise, paid_at, method, member_id, memberships(membership_plans(id, name))").eq("org_id", oid).eq("status", "paid").gte("paid_at", from).lte("paid_at", to),
      supabase.from("members").select("id, created_at, full_name, phone, primary_goal, sex").eq("org_id", oid),
      supabase.from("memberships").select("member_id, start_date, end_date, status, membership_plans(id, name, price_paise, duration_days)").eq("org_id", oid),
      supabase.from("attendance_logs").select("check_in_at, member_id").eq("org_id", oid).gte("check_in_at", attFrom).lte("check_in_at", to),
      supabase.from("classes").select("id, name, capacity").eq("org_id", oid).eq("is_active", true),
      supabase.from("class_bookings").select("class_id, booked_for").eq("org_id", oid).eq("status", "booked").gte("booked_for", from.slice(0, 10)).lte("booked_for", to.slice(0, 10)),
    ]);
    setPayments((p.data as unknown as PaymentRow[]) || []);
    setMembers((m.data as MemberRow[]) || []);
    setMemberships((ms.data as unknown as MembershipRow[]) || []);
    setAttendance((a.data as AttendanceRow[]) || []);
    setClasses((c.data as ClassRow[]) || []);
    setBookings((b.data as BookingRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!role) return;
      setOrgId(role.org_id);
      const { data: pl } = await supabase.from("membership_plans").select("id, name, price_paise, duration_days").eq("org_id", role.org_id);
      setPlans((pl as Plan[]) || []);
      await load(role.org_id, filters);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next: Partial<Filters>) {
    const f = { ...filters, ...next };
    setFilters(f);
    const needsReload = "period" in next || "from" in next || "to" in next;
    if (needsReload && orgId && (f.period !== "custom" || (f.from && f.to))) load(orgId, f);
  }

  /* ───────── Derived data ───────── */
  const d = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inCur = (iso: string) => { const t = new Date(iso).getTime(); return t >= start.getTime() && t <= end.getTime(); };
    const inPrev = (iso: string) => { const t = new Date(iso).getTime(); return t >= pStart.getTime() && t <= pEnd.getTime(); };

    // Member-level filters (gender, goal) narrow everything member-based
    const term = filters.member.trim().toLowerCase();
    const memberOk = new Set(members.filter((m) =>
      (!filters.gender || (m.sex ?? "").toLowerCase() === filters.gender) &&
      (!filters.goal || m.primary_goal === filters.goal) &&
      (!term || m.full_name.toLowerCase().includes(term) || (m.phone ?? "").includes(term))).map((m) => m.id));
    const mFiltered = !!(filters.gender || filters.goal || term);
    const dayOk = (iso: string) => !filters.days.length || filters.days.includes((new Date(iso).getDay() + 6) % 7);
    const bandOk = (iso: string) => { if (filters.band === null) return true; const h = new Date(iso).getHours(); const [s0, e0] = BANDS[filters.band]; return h >= s0 && h < e0; };
    const minA = parseFloat(filters.minAmt) * 100, maxA = parseFloat(filters.maxAmt) * 100;
    const okMember = (id: string) => !mFiltered || memberOk.has(id);

    const pay = payments.filter((p) => okMember(p.member_id) &&
      (!filters.planId || p.memberships?.membership_plans?.id === filters.planId) &&
      (!filters.method || (p.method ?? "other") === filters.method) && dayOk(p.paid_at) &&
      (!(minA > 0) || p.total_paise >= minA) && (!(maxA > 0) || p.total_paise <= maxA));
    const payCur = pay.filter((p) => inCur(p.paid_at)), payPrev = pay.filter((p) => inPrev(p.paid_at));
    const sum = (rows: PaymentRow[]) => rows.reduce((s, p) => s + p.total_paise, 0);
    const revenue = sum(payCur), revenuePrev = sum(payPrev);

    const ms = memberships.filter((x) => okMember(x.member_id) && (!filters.planId || x.membership_plans?.id === filters.planId));
    const activeMs = ms.filter((x) => x.status === "active" && new Date(`${x.end_date.slice(0, 10)}T23:59:59`) >= today);
    const activeIds = new Set(activeMs.map((x) => x.member_id));
    const mrr = activeMs.reduce((s, x) => s + ((x.membership_plans?.price_paise ?? 0) / Math.max(1, x.membership_plans?.duration_days ?? 30)) * 30, 0);

    const mem = members.filter((m) => okMember(m.id));
    const newCur = mem.filter((m) => inCur(m.created_at)).length, newPrev = mem.filter((m) => inPrev(m.created_at)).length;
    const lapsedIn = (fn: (iso: string) => boolean) => new Set(ms.filter((x) => fn(`${x.end_date.slice(0, 10)}T12:00:00`) && !activeIds.has(x.member_id)).map((x) => x.member_id)).size;
    const lapsedCur = lapsedIn(inCur), lapsedPrev = lapsedIn(inPrev);
    const retention = activeIds.size + lapsedCur ? Math.round((activeIds.size / (activeIds.size + lapsedCur)) * 100) : 100;
    const retentionPrev = activeIds.size + lapsedPrev ? Math.round((activeIds.size / (activeIds.size + lapsedPrev)) * 100) : 100;

    const att = attendance.filter((a) => okMember(a.member_id) && dayOk(a.check_in_at) && bandOk(a.check_in_at));
    const attCur = att.filter((a) => inCur(a.check_in_at)), attPrev = att.filter((a) => inPrev(a.check_in_at));
    const visitors = new Set(attCur.map((a) => a.member_id)).size;

    // Renewals due in the next 30 days
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const renewals = activeMs.filter((x) => { const e = new Date(`${x.end_date.slice(0, 10)}T00:00:00`); return e >= today && e <= in30; })
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
    const renewalValue = renewals.reduce((s, x) => s + (x.membership_plans?.price_paise ?? 0), 0);

    // At-risk: active membership, no visit in 14+ days
    const lastVisit = new Map<string, number>();
    att.forEach((a) => { const t = new Date(a.check_in_at).getTime(); if (t > (lastVisit.get(a.member_id) ?? 0)) lastVisit.set(a.member_id, t); });
    const atRisk = [...activeIds].map((id) => ({ id, last: lastVisit.get(id) ?? 0 }))
      .filter((x) => !x.last || Date.now() - x.last > 14 * 86400000).sort((a, b) => a.last - b.last);

    // Trend buckets: days for ≤ 92 days, else months
    const gb: "day" | "week" | "month" = filters.groupBy !== "auto" ? filters.groupBy : len <= 45 * 86400000 ? "day" : len <= 120 * 86400000 ? "week" : "month";
    const byDay = gb === "day";
    const weekKey = (dt: Date) => { const x = new Date(dt); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(x); };
    const buckets: { key: string; label: string; rev: number; prev: number; checkins: number; joins: number; lapses: number; pays: number }[] = [];
    const blank = { rev: 0, prev: 0, checkins: 0, joins: 0, lapses: 0, pays: 0 };
    if (gb === "day") {
      for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) buckets.push({ key: dayKey(t), label: t.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), ...blank });
    } else if (gb === "week") {
      const t = new Date(weekKey(start) + "T00:00:00");
      for (; t <= end; t.setDate(t.getDate() + 7)) buckets.push({ key: dayKey(t), label: `Wk ${t.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, ...blank });
    } else {
      for (let t = new Date(start.getFullYear(), start.getMonth(), 1); t <= end; t.setMonth(t.getMonth() + 1)) buckets.push({ key: monthKey(t), label: t.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), ...blank });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const keyOf = (dt: Date) => (gb === "day" ? dayKey(dt) : gb === "week" ? weekKey(dt) : monthKey(dt));
    payCur.forEach((p) => { const i = idx.get(keyOf(new Date(p.paid_at))); if (i !== undefined) { buckets[i].rev += p.total_paise; buckets[i].pays++; } });
    payPrev.forEach((p) => { const shifted = new Date(new Date(p.paid_at).getTime() + len + 1); const i = idx.get(keyOf(shifted)); if (i !== undefined) buckets[i].prev += p.total_paise; });
    attCur.forEach((a) => { const i = idx.get(keyOf(new Date(a.check_in_at))); if (i !== undefined) buckets[i].checkins++; });
    mem.forEach((m) => { if (!inCur(m.created_at)) return; const i = idx.get(keyOf(new Date(m.created_at))); if (i !== undefined) buckets[i].joins++; });
    ms.forEach((x) => { const iso = `${x.end_date.slice(0, 10)}T12:00:00`; if (!inCur(iso) || activeIds.has(x.member_id)) return; const i = idx.get(keyOf(new Date(iso))); if (i !== undefined) buckets[i].lapses++; });

    // Revenue by plan / method
    const byPlan = new Map<string, number>(), byMethod = new Map<string, number>();
    payCur.forEach((p) => {
      const n = p.memberships?.membership_plans?.name ?? "Other"; byPlan.set(n, (byPlan.get(n) ?? 0) + p.total_paise);
      const mth = p.method ?? "other"; byMethod.set(mth, (byMethod.get(mth) ?? 0) + p.total_paise);
    });

    // Peak hours: weekday × time band
    const bands = [[5, 8, "5–8am"], [8, 11, "8–11am"], [11, 16, "11–4pm"], [16, 19, "4–7pm"], [19, 23, "7–11pm"]] as const;
    const peak = DOW.map(() => bands.map(() => 0));
    attCur.forEach((a) => {
      const t = new Date(a.check_in_at); const dow = (t.getDay() + 6) % 7; const h = t.getHours();
      const bi = bands.findIndex(([s, e]) => h >= s && h < e); if (bi >= 0) peak[dow][bi]++;
    });
    const peakMax = Math.max(1, ...peak.flat());

    // Top members by visits
    const visits = new Map<string, number>();
    attCur.forEach((a) => visits.set(a.member_id, (visits.get(a.member_id) ?? 0) + 1));
    const nameOf = new Map(members.map((m) => [m.id, m]));
    const top = [...visits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ m: nameOf.get(id), n }));

    // Goals among active members
    const goals = new Map<string, number>();
    mem.filter((m) => activeIds.has(m.id)).forEach((m) => { const g = m.primary_goal ?? "not_set"; goals.set(g, (goals.get(g) ?? 0) + 1); });

    // Class fill
    const fill = classes.map((c) => {
      const curB = bookings.filter((b) => b.class_id === c.id && inCur(`${b.booked_for}T12:00:00`));
      const sessions = new Set(curB.map((b) => b.booked_for)).size || 1;
      return { name: c.name, pct: Math.min(100, Math.round((curB.length / (c.capacity * sessions)) * 100)), booked: curB.length };
    }).sort((a, b) => b.pct - a.pct);
    const classFill = fill.length ? Math.round(fill.reduce((s, x) => s + x.pct, 0) / fill.length) : 0;

    // Plan mix (active memberships)
    const mix = new Map<string, number>();
    activeMs.forEach((x) => { const n = x.membership_plans?.name ?? "Other"; mix.set(n, (mix.get(n) ?? 0) + 1); });

    return {
      revenue, revenuePrev, payCount: payCur.length, payPrev: payPrev.length,
      avgTicket: payCur.length ? revenue / payCur.length : 0, avgTicketPrev: payPrev.length ? revenuePrev / payPrev.length : 0,
      mrr, active: activeIds.size, newCur, newPrev, lapsedCur, lapsedPrev, retention, retentionPrev,
      checkins: attCur.length, checkinsPrev: attPrev.length, visitsPer: visitors ? attCur.length / Math.max(1, activeIds.size) : 0,
      renewals, renewalValue, atRisk, lastVisit, nameOf, buckets, byDay, gb, payCur, attCur, mem, ms, activeIds, inCur,
      byPlan: [...byPlan.entries()].map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v),
      byMethod: [...byMethod.entries()].map(([k, v]) => ({ name: METHOD_LABEL[k] ?? (k === "other" ? "Other" : k), key: k, v })).sort((a, b) => b.v - a.v),
      peak, peakMax, bands, top, goals: [...goals.entries()].map(([k, v]) => ({ name: k === "not_set" ? "Not set" : GOAL_LABEL[k] ?? k, v })).sort((a, b) => b.v - a.v),
      fill, classFill, mix: [...mix.entries()].map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, members, memberships, attendance, classes, bookings, filters, start.getTime(), end.getTime()]);

  const methodsAvail = useMemo(() => [...new Set(payments.map((p) => p.method ?? "other"))], [payments]);
  const goalsAvail = useMemo(() => [...new Set(members.map((m) => m.primary_goal).filter(Boolean))] as string[], [members]);
  const has = (k: FKey) => TAB_FILTERS[tab].includes(k);
  const activeFilters = [filters.planId, filters.method, filters.gender, filters.goal, filters.member, filters.minAmt, filters.maxAmt].filter(Boolean).length + (filters.days.length ? 1 : 0) + (filters.band !== null ? 1 : 0);

  /* ───────── KPIs ───────── */
  const KPI: Record<KpiId, { icon: React.ElementType; value: React.ReactNode; delta?: React.ReactNode; foot?: string }> = {
    revenue: { icon: Wallet, value: <Num v={d.revenue} money />, delta: compare ? <Delta now={d.revenue} prev={d.revenuePrev} /> : null },
    payments: { icon: Wallet, value: <Num v={d.payCount} />, delta: compare ? <Delta now={d.payCount} prev={d.payPrev} /> : null },
    avg_ticket: { icon: Wallet, value: <Num v={d.avgTicket} money />, delta: compare ? <Delta now={d.avgTicket} prev={d.avgTicketPrev} /> : null },
    mrr: { icon: Repeat, value: <Num v={d.mrr} money />, foot: "from active plans" },
    active: { icon: Users, value: <Num v={d.active} />, foot: "right now" },
    new: { icon: UserPlus, value: <Num v={d.newCur} />, delta: compare ? <Delta now={d.newCur} prev={d.newPrev} /> : null },
    churn: { icon: UserMinus, value: <Num v={d.lapsedCur} />, delta: compare ? <Delta now={d.lapsedCur} prev={d.lapsedPrev} invert /> : null },
    retention: { icon: Target, value: <span className="rp-num">{d.retention}%</span>, delta: compare ? <Delta now={d.retention} prev={d.retentionPrev} /> : null },
    checkins: { icon: Activity, value: <Num v={d.checkins} />, delta: compare ? <Delta now={d.checkins} prev={d.checkinsPrev} /> : null },
    visits_per: { icon: Activity, value: <span className="rp-num">{d.visitsPer.toFixed(1)}</span>, foot: "per active member" },
    renewal_value: { icon: RefreshCw, value: <Num v={d.renewalValue} money />, foot: `${d.renewals.length} in the next 30 days` },
    class_fill: { icon: CalendarDays, value: <span className="rp-num">{d.classFill}%</span>, foot: "average across classes" },
  };

  /* ───────── Cards ───────── */
  const rangeLabel = `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const H = 200;
  // Cumulative series: running totals read far better than spiky daily sums
  let runC = 0, runP = 0;
  const revSeries = d.buckets.map((b) => { runC += b.rev; runP += b.prev; return { ...b, cum: runC, cumPrev: runP } });
  const avgCheckins = d.buckets.length ? d.checkins / d.buckets.length : 0;
  const showBrush = d.buckets.length > 20;
  const methodTotal = d.byMethod.reduce((s, x) => s + x.v, 0);
  const donutSel = donutIdx !== null ? d.byMethod[donutIdx] : null;
  const empty = (text: string) => <div className="rp-empty">{text}</div>;

  const cards: Record<CardId, React.ReactNode> = {
    revenue: (
      <Card title="Revenue trend" icon={TrendingUp} sub={compare ? "Dashed: previous period · drag the handles below to zoom" : rangeLabel}
        right={<><Mini value={revMode} options={[["cumulative", "Running total"], ["daily", d.gb === "day" ? "Daily" : d.gb === "week" ? "Weekly" : "Monthly"]]} onChange={setRevMode} /><span className="rp-big"><Num v={d.revenue} money /></span></>}>
        <div className="rp-chart">
          <ResponsiveContainer width="100%" height="100%">
            {revMode === "cumulative" ? (
              <AreaChart data={revSeries} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <defs><linearGradient id="rpRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.3} /><stop offset="100%" stopColor={BRAND} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${compact(v / 100)}`} width={54} />
                <Tooltip content={<ChartTip money />} cursor={{ stroke: BRAND, strokeDasharray: "3 3" }} />
                {compare && <Area type="monotone" dataKey="cumPrev" name="Previous" stroke={PREV} strokeDasharray="5 4" fill="none" strokeWidth={1.8} dot={false} />}
                <Area type="monotone" dataKey="cum" name="Revenue" stroke={BRAND} fill="url(#rpRev)" strokeWidth={2.4} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} animationDuration={500} />
                {showBrush && <Brush dataKey="label" height={16} stroke="#9db8e8" travellerWidth={8} fill="#f6f8fc" tickFormatter={() => ""} />}
              </AreaChart>
            ) : (
              <ComposedChart data={d.buckets} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${compact(v / 100)}`} width={54} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "rgba(10,102,214,0.06)" }} />
                {compare && <Line type="monotone" dataKey="prev" name="Previous" stroke={PREV} strokeDasharray="5 4" dot={false} strokeWidth={1.6} />}
                <Bar dataKey="rev" name="Revenue" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={500} />
                {showBrush && <Brush dataKey="label" height={16} stroke="#9db8e8" travellerWidth={8} fill="#f6f8fc" tickFormatter={() => ""} />}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    byplan: (
      <Card title="Revenue by plan" icon={BarChart3} sub={d.byPlan.length ? `${d.byPlan.length} plan${d.byPlan.length === 1 ? "" : "s"} paid for this period` : undefined}>
        {d.byPlan.length === 0 ? empty("No payments in this period") : (
          <div className="rp-plan">
            <div className="rp-plan-top">
              <div><small>Top plan</small><b>{d.byPlan[0].name}</b></div>
              <div><small>Share</small><b>{Math.round((d.byPlan[0].v / Math.max(1, d.revenue)) * 100)}%</b></div>
              <div><small>Avg. payment</small><b><Num v={d.avgTicket} money /></b></div>
            </div>
            <div className="rp-stack rp-stack--lg">
              {d.byPlan.map((x, i) => <i key={x.name} style={{ flexGrow: x.v, background: PALETTE[i % PALETTE.length] }} title={`${x.name}: ₹${fullNum(rupees(x.v))}`} />)}
            </div>
            <div className="rp-plan-list">
              {d.byPlan.slice(0, 6).map((x, i) => (
                <div key={x.name} className="rp-plan-row">
                  <span><i style={{ background: PALETTE[i % PALETTE.length] }} />{x.name}</span>
                  <em>{Math.round((x.v / Math.max(1, d.revenue)) * 100)}%</em>
                  <b><Num v={x.v} money /></b>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    ),
    methods: (
      <Card title="Payment methods" icon={Wallet} sub="Click a method to filter the report">
        {d.byMethod.length === 0 ? empty("No payments in this period") : (
          <div className="rp-donut">
            <div className="rp-donut-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.byMethod} dataKey="v" nameKey="name" innerRadius="62%" outerRadius="86%" paddingAngle={d.byMethod.length > 1 ? 3 : 0} stroke="none"
                    activeIndex={donutIdx ?? undefined} activeShape={ActiveSlice as never}
                    onMouseEnter={(_, i) => setDonutIdx(i)} onMouseLeave={() => setDonutIdx(null)}
                    onClick={(x: { key?: string; payload?: { key: string } }) => { const k = x.payload?.key ?? x.key; if (k) apply({ method: filters.method === k ? "" : k }) }}>
                    {d.byMethod.map((x, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} style={{ cursor: "pointer", outline: "none" }} opacity={filters.method && filters.method !== x.key ? 0.35 : 1} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="rp-donut-center">
                <small>{donutSel ? donutSel.name : "Total"}</small>
                <b><Num v={donutSel ? donutSel.v : methodTotal} money /></b>
                {donutSel && <em>{Math.round((donutSel.v / Math.max(1, methodTotal)) * 100)}%</em>}
              </div>
            </div>
            <div className="rp-legend">
              {d.byMethod.map((x, i) => (
                <button key={x.key} type="button" className="rp-leg" data-on={filters.method === x.key}
                  onMouseEnter={() => setDonutIdx(i)} onMouseLeave={() => setDonutIdx(null)}
                  onClick={() => apply({ method: filters.method === x.key ? "" : x.key })}>
                  <i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{x.name}</span><b>{Math.round((x.v / Math.max(1, methodTotal)) * 100)}%</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    ),
    growth: (
      <Card title="Joins vs lapses" icon={Users} sub={`${d.newCur} joined · ${d.lapsedCur} lapsed · net ${d.newCur - d.lapsedCur >= 0 ? "+" : ""}${d.newCur - d.lapsedCur}`}
        right={<span className="rp-series">
          {([["joins", "Joined", BRAND], ["lapses", "Lapsed", "#9db8e8"]] as const).map(([k, l, c]) => (
            <button key={k} type="button" aria-pressed={!growthHide.includes(k)} onClick={() => setGrowthHide((h) => h.includes(k) ? h.filter((x) => x !== k) : [...h, k])}><i style={{ background: c }} />{l}</button>
          ))}
        </span>}>
        <div className="rp-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.buckets} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#eef0f4" vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(10,102,214,0.06)" }} />
              {!growthHide.includes("joins") && <Bar dataKey="joins" name="Joined" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={500} />}
              {!growthHide.includes("lapses") && <Bar dataKey="lapses" name="Lapsed" fill="#9db8e8" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={500} />}
              {showBrush && <Brush dataKey="label" height={16} stroke="#9db8e8" travellerWidth={8} fill="#f6f8fc" tickFormatter={() => ""} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    checkins: (
      <Card title="Check-ins" icon={Activity} sub={`Avg ${avgCheckins.toFixed(1)} a ${d.gb} · ${d.visitsPer.toFixed(1)} per active member`} right={<span className="rp-big"><Num v={d.checkins} /></span>}>
        <div className="rp-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.buckets} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs><linearGradient id="rpChk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3c4fe0" /><stop offset="100%" stopColor={BRAND} /></linearGradient></defs>
              <CartesianGrid stroke="#eef0f4" vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(10,102,214,0.06)" }} />
              {avgCheckins > 0 && <ReferenceLine y={avgCheckins} stroke="#1f3f8a" strokeDasharray="4 4" label={{ value: "avg", position: "insideTopRight", fontSize: 10, fill: "#1f3f8a" }} />}
              <Bar dataKey="checkins" name="Check-ins" fill="url(#rpChk)" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={500} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    ),
    peak: (
      <Card title="Peak hours" icon={Clock}
        sub={peakSel ? `${DOW[peakSel[0]]}, ${d.bands[peakSel[1]][2]}: ${d.peak[peakSel[0]][peakSel[1]]} check-ins` : "Hover or tap a cell for the exact count"}>
        <div className="rp-heat" onMouseLeave={() => setPeakSel(null)}>
          <span />
          {d.bands.map(([, , l]) => <small key={l}>{l}</small>)}
          <small>Total</small>
          {DOW.map((day, r) => {
            const rowTotal = d.peak[r].reduce((a, b) => a + b, 0);
            return (
              <div key={day} className="rp-heat-row">
                <small>{day}</small>
                {d.peak[r].map((n, c) => (
                  <button key={c} type="button" data-on={peakSel?.[0] === r && peakSel?.[1] === c}
                    onMouseEnter={() => setPeakSel([r, c])} onFocus={() => setPeakSel([r, c])} onClick={() => setPeakSel([r, c])}
                    style={{ background: n ? `rgba(10,102,214,${0.14 + 0.86 * (n / d.peakMax)})` : "#f2f4f8", color: n / d.peakMax > 0.55 ? "#fff" : "var(--text-secondary)" }}>{n || ""}</button>
                ))}
                <b>{rowTotal}</b>
              </div>
            );
          })}
        </div>
      </Card>
    ),
    renewals: (
      <Card title="Renewals due" icon={RefreshCw} sub="Active memberships ending in the next 30 days" right={<span className="rp-big"><Num v={d.renewalValue} money /></span>}>
        {d.renewals.length === 0 ? empty("Nothing due in the next 30 days") : (
          <div className="rp-list">
            {d.renewals.slice(0, 6).map((x) => {
              const m = d.nameOf.get(x.member_id); const days = Math.ceil((new Date(`${x.end_date.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86400000);
              return (
                <Link key={x.member_id + x.end_date} href={`/dashboard/members/${x.member_id}`} className="rp-li">
                  <Avatar name={m?.full_name ?? "?"} size={28} />
                  <span className="rp-li-t"><b>{m?.full_name ?? "Member"}</b><small>{x.membership_plans?.name ?? "Plan"}</small></span>
                  <span className={`rp-chip ${days <= 7 ? "rp-chip--warn" : ""}`}>{days <= 0 ? "Today" : `${days}d`}</span>
                </Link>
              );
            })}
            {d.renewals.length > 6 && <Link href="/dashboard/members?filter=expiring" className="rp-more">See all {d.renewals.length}</Link>}
          </div>
        )}
      </Card>
    ),
    atrisk: (
      <Card title="At-risk members" icon={AlertTriangle} sub="Active, but no visit in 14+ days" right={<span className="rp-count">{d.atRisk.length}</span>}>
        {d.atRisk.length === 0 ? empty("Everyone with a plan has visited recently") : (
          <div className="rp-list">
            {d.atRisk.slice(0, 6).map((x) => {
              const m = d.nameOf.get(x.id);
              return (
                <Link key={x.id} href={`/dashboard/members/${x.id}`} className="rp-li">
                  <Avatar name={m?.full_name ?? "?"} size={28} />
                  <span className="rp-li-t"><b>{m?.full_name ?? "Member"}</b><small>{x.last ? `Last visit ${Math.floor((Date.now() - x.last) / 86400000)} days ago` : "No visits recorded"}</small></span>
                  {m?.phone && <a className="rp-chip" href={`https://wa.me/${m.phone.replace(/\D/g, "").length === 10 ? "91" : ""}${m.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>WhatsApp</a>}
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    ),
    topmembers: (
      <Card title="Most active members" icon={Activity}>
        {d.top.length === 0 ? empty("No check-ins in this period") : (
          <div className="rp-list">
            {d.top.map(({ m, n }, i) => (
              <div key={m?.id ?? i} className="rp-li">
                <span className="rp-rank">{i + 1}</span>
                <span className="rp-li-t"><b>{m?.full_name ?? "Member"}</b></span>
                <span className="rp-chip">{n} visits</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    goals: (
      <Card title="Member goals" icon={Target} sub="Active members">
        {d.goals.length === 0 ? empty("No active members") : (
          <div className="rp-bars">
            {d.goals.slice(0, 6).map((x, i) => (
              <div key={x.name} className="rp-bar">
                <span className="rp-bar-name">{x.name}</span>
                <span className="rp-bar-track"><i style={{ width: `${(x.v / d.goals[0].v) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></span>
                <b>{x.v}</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    classes: (
      <Card title="Class fill rate" icon={CalendarDays} right={<span className="rp-count">{d.classFill}%</span>}>
        {d.fill.length === 0 ? empty("No active classes") : (
          <div className="rp-bars">
            {d.fill.slice(0, 6).map((x) => (
              <div key={x.name} className="rp-bar">
                <span className="rp-bar-name">{x.name}</span>
                <span className="rp-bar-track"><i style={{ width: `${x.pct}%`, background: BRAND }} /></span>
                <b>{x.pct}%</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
    outstanding: (
      <Card title="Plan mix" icon={Repeat} sub="Active memberships by plan">
        {d.mix.length === 0 ? empty("No active memberships") : (
          <>
            <div className="rp-stack">{d.mix.map((x, i) => <i key={x.name} style={{ flexGrow: x.v, background: PALETTE[i % PALETTE.length] }} title={`${x.name}: ${x.v}`} />)}</div>
            <div className="rp-bars" style={{ marginTop: 10 }}>
              {d.mix.slice(0, 5).map((x, i) => (
                <button key={x.name} type="button" className="rp-bar rp-bar--btn" onClick={() => { const p = plans.find((pl) => pl.name === x.name); if (p) apply({ planId: filters.planId === p.id ? "" : p.id }); }}>
                  <span className="rp-bar-name"><i style={{ background: PALETTE[i % PALETTE.length] }} />{x.name}</span>
                  <b>{x.v} · {Math.round((x.v / d.active) * 100) || 0}%</b>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    ),
  };

  const shown = layout.order.filter((c) => !layout.hidden.includes(c));
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = layout.order.indexOf(active.id as CardId), b = layout.order.indexOf(over.id as CardId);
    if (a >= 0 && b >= 0) saveLayout({ ...layout, order: arrayMove(layout.order, a, b) });
  }

  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows: string[][] = [
      ["Report", rangeLabel], [],
      ["Metric", "This period", "Previous period"],
      ["Revenue (₹)", String(rupees(d.revenue)), String(rupees(d.revenuePrev))],
      ["Payments", String(d.payCount), String(d.payPrev)],
      ["New members", String(d.newCur), String(d.newPrev)],
      ["Lapsed", String(d.lapsedCur), String(d.lapsedPrev)],
      ["Check-ins", String(d.checkins), String(d.checkinsPrev)],
      ["MRR (₹)", String(rupees(d.mrr)), ""], ["Active members", String(d.active), ""], [],
      [d.gb === "day" ? "Day" : d.gb === "week" ? "Week" : "Month", "Revenue (₹)", "Check-ins", "Joined", "Lapsed"],
      ...d.buckets.map((b) => [b.label, String(rupees(b.rev)), String(b.checkins), String(b.joins), String(b.lapses)]),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `report-${dayKey(start)}-to-${dayKey(end)}.csv`;
    a.click();
  }

  return (
    <div className="ps-page db rp">
      <DesignStyles />
      <style>{RP_CSS}</style>

      {/* Header + filters */}
      <header className="rp-head">
        <div className="rp-title">
          <span className="rp-title-icon"><BarChart3 size={20} /></span>
          <div><h1>Reports</h1><p>{rangeLabel}{compare ? " · compared with the previous period" : ""}</p></div>
        </div>
        <div className="rp-head-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={exportCSV} disabled={loading}><Download size={15} /><span>Export</span></button>
          <button type="button" className={`ps-btn ${editing ? "ps-btn--primary" : "ps-btn--secondary"}`} onClick={() => setEditing((e) => !e)}>
            {editing ? <Check size={15} /> : <LayoutGrid size={15} />}<span>{editing ? "Done" : "Edit layout"}</span>
          </button>
        </div>
      </header>

      <nav className="rp-tabs" role="tablist" aria-label="Report">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => changeTab(t.key)}>{t.label}</button>)}
      </nav>

      <div className="rp-filters">
        <div className="rp-seg" role="group" aria-label="Period">
          {PERIODS.map((p) => <button key={p.key} type="button" aria-pressed={filters.period === p.key} onClick={() => apply({ period: p.key })}>{p.label}</button>)}
        </div>
        {filters.period === "custom" && (
          <div className="rp-dates">
            <input type="date" value={filters.from} onChange={(e) => apply({ from: e.target.value })} aria-label="From" />
            <span>to</span>
            <input type="date" value={filters.to} onChange={(e) => apply({ to: e.target.value })} aria-label="To" />
          </div>
        )}
        {has("plan") && (
          <select className="rp-select" value={filters.planId} onChange={(e) => apply({ planId: e.target.value })} aria-label="Plan">
            <option value="">All plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {TAB_FILTERS[tab].some((k) => k !== "plan") && <button type="button" className="rp-more-btn" data-on={moreOpen || activeFilters > 0} onClick={() => setMoreOpen((o) => !o)}>
          <Filter size={14} />More filters{activeFilters > 0 && <span>{activeFilters}</span>}
        </button>}
        <select className="rp-select" value={filters.groupBy} onChange={(e) => apply({ groupBy: e.target.value as GroupBy })} aria-label="Group by">
          <option value="auto">Group: auto</option><option value="day">By day</option><option value="week">By week</option><option value="month">By month</option>
        </select>
        <label className="rp-compare"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />Compare</label>
        {moreOpen && TAB_FILTERS[tab].length > 0 && (
          <div className="rp-more-row">
            {has("member") && <label className="rp-fsearch"><input type="search" placeholder="Member name or phone" value={filters.member} onChange={(e) => apply({ member: e.target.value })} /></label>}
            {has("method") && <select className="rp-select" value={filters.method} onChange={(e) => apply({ method: e.target.value })} aria-label="Payment method">
              <option value="">All payment methods</option>
              {methodsAvail.map((m) => <option key={m} value={m}>{METHOD_LABEL[m] ?? (m === "other" ? "Other" : m)}</option>)}
            </select>}
            {has("gender") && <select className="rp-select" value={filters.gender} onChange={(e) => apply({ gender: e.target.value })} aria-label="Gender">
              <option value="">All genders</option><option value="male">Male</option><option value="female">Female</option>
            </select>}
            {has("goal") && <select className="rp-select" value={filters.goal} onChange={(e) => apply({ goal: e.target.value })} aria-label="Goal">
              <option value="">All goals</option>
              {goalsAvail.map((g) => <option key={g} value={g}>{GOAL_LABEL[g] ?? g}</option>)}
            </select>}
            {has("amount") && <span className="rp-amt">
              <span>₹</span><input inputMode="numeric" placeholder="Min" value={filters.minAmt} onChange={(e) => apply({ minAmt: e.target.value.replace(/\D/g, "") })} aria-label="Minimum payment" />
              <span>to</span><input inputMode="numeric" placeholder="Max" value={filters.maxAmt} onChange={(e) => apply({ maxAmt: e.target.value.replace(/\D/g, "") })} aria-label="Maximum payment" />
            </span>}
            {has("days") && <div className="rp-fgroup" role="group" aria-label="Days of the week">
              <small>Days</small>
              {DOW.map((dname, i) => (
                <button key={dname} type="button" aria-pressed={filters.days.includes(i)} onClick={() => apply({ days: filters.days.includes(i) ? filters.days.filter((x) => x !== i) : [...filters.days, i] })}>{dname.slice(0, 2)}</button>
              ))}
            </div>}
            {has("band") && <div className="rp-fgroup" role="group" aria-label="Time of day">
              <small>Time</small>
              {BANDS.map(([, , l], i) => (
                <button key={l} type="button" aria-pressed={filters.band === i} onClick={() => apply({ band: filters.band === i ? null : i })}>{l}</button>
              ))}
            </div>}
            {activeFilters > 0 && <button type="button" className="rp-clear" onClick={() => apply({ ...NO_EXTRA })}><X size={13} />Clear all</button>}
          </div>
        )}
        {!moreOpen && activeFilters > 0 && (
          <div className="rp-active">
            {filters.planId && <span>Plan: {plans.find((p) => p.id === filters.planId)?.name}<button type="button" onClick={() => apply({ planId: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.member && <span>Member: {filters.member}<button type="button" onClick={() => apply({ member: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.method && <span>{METHOD_LABEL[filters.method] ?? filters.method}<button type="button" onClick={() => apply({ method: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.gender && <span>{filters.gender === "male" ? "Male" : "Female"}<button type="button" onClick={() => apply({ gender: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.goal && <span>{GOAL_LABEL[filters.goal] ?? filters.goal}<button type="button" onClick={() => apply({ goal: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {(filters.minAmt || filters.maxAmt) && <span>₹{filters.minAmt || "0"}–{filters.maxAmt || "any"}<button type="button" onClick={() => apply({ minAmt: "", maxAmt: "" })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.days.length > 0 && <span>{[...filters.days].sort().map((i) => DOW[i]).join(", ")}<button type="button" onClick={() => apply({ days: [] })} aria-label="Remove"><X size={11} /></button></span>}
            {filters.band !== null && <span>{BANDS[filters.band][2]}<button type="button" onClick={() => apply({ band: null })} aria-label="Remove"><X size={11} /></button></span>}
          </div>
        )}
      </div>

      {editing && (
        <div className="rp-editbar">
          <span><b>Edit layout.</b> Drag cards by the handle, set widths with S, M, L and Full, and choose the KPIs below.</span>
          {layout.hidden.map((h) => (
            <button key={h} type="button" className="rp-restore" onClick={() => saveLayout({ ...layout, hidden: layout.hidden.filter((x) => x !== h) })}><Plus size={12} />{CARD_LABEL[h]}</button>
          ))}
          <button type="button" className="rp-reset" onClick={() => saveLayout(TAB_DEFAULTS[tab])}><RotateCcw size={13} />Reset</button>
          <div className="rp-kpi-pick">
            {(Object.keys(KPI_LABEL) as KpiId[]).map((k) => {
              const on = layout.kpis.includes(k);
              return <button key={k} type="button" aria-pressed={on} onClick={() => saveLayout({ ...layout, kpis: on ? layout.kpis.filter((x) => x !== k) : [...layout.kpis, k] })}>{on && <Check size={11} strokeWidth={3} />}{KPI_LABEL[k]}</button>;
            })}
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="rp-kpis" style={{ ["--n" as string]: layout.kpis.length, ["--n2" as string]: Math.ceil(layout.kpis.length / 2) } as React.CSSProperties}>
        {layout.kpis.map((k) => {
          const K = KPI[k];
          return (
            <div key={k} className="rp-kpi">
              <span className="rp-kpi-top"><span className="rp-kpi-icon"><K.icon size={13} /></span>{KPI_LABEL[k]}</span>
              <span className="rp-kpi-val">{loading ? <Skeleton w={64} h={20} /> : K.value}</span>
              <span className="rp-kpi-foot">{loading ? "\u00a0" : K.delta ?? K.foot ?? ""}{K.delta && <em>vs prev.</em>}</span>
            </div>
          );
        })}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="rp-grid-skel">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={240} r={16} />)}</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown} strategy={rectSortingStrategy}>
            <div className="rp-grid" data-editing={editing}>
              {shown.map((c) => (
                <Tile key={c} id={c} span={layout.sizes[c] ?? TAB_DEFAULTS[tab].sizes[c] ?? 6} editing={editing}
                  onSize={(s) => saveLayout({ ...layout, sizes: { ...layout.sizes, [c]: s } })}
                  onHide={() => saveLayout({ ...layout, hidden: [...layout.hidden, c] })}>
                  {cards[c]}
                </Tile>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!loading && tab === "revenue" && (
        <DetailTable title="Payments" file={`payments-${dayKey(start)}`} rows={d.payCur} defaultSort="date" empty="No payments match these filters"
          cols={[
            { key: "date", label: "Date", get: (p: PaymentRow) => p.paid_at, show: (p) => new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
            { key: "member", label: "Member", get: (p) => d.nameOf.get(p.member_id)?.full_name ?? "—", show: (p) => <Link href={`/dashboard/members/${p.member_id}`} className="rp-tlink">{d.nameOf.get(p.member_id)?.full_name ?? "—"}</Link> },
            { key: "plan", label: "Plan", get: (p) => p.memberships?.membership_plans?.name ?? "Other" },
            { key: "method", label: "Method", get: (p) => METHOD_LABEL[p.method ?? ""] ?? p.method ?? "Other" },
            { key: "amount", label: "Amount", get: (p) => p.total_paise, right: true, money: true },
          ]} />
      )}
      {!loading && tab === "members" && (
        <DetailTable title="New members" file={`new-members-${dayKey(start)}`} rows={d.mem.filter((m) => d.inCur(m.created_at))} defaultSort="joined" empty="No one joined in this period"
          cols={[
            { key: "name", label: "Member", get: (m: MemberRow) => m.full_name, show: (m) => <Link href={`/dashboard/members/${m.id}`} className="rp-tlink">{m.full_name}</Link> },
            { key: "joined", label: "Joined", get: (m) => m.created_at, show: (m) => new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
            { key: "phone", label: "Phone", get: (m) => m.phone ?? "—" },
            { key: "goal", label: "Goal", get: (m) => (m.primary_goal ? GOAL_LABEL[m.primary_goal] ?? m.primary_goal : "—") },
            { key: "status", label: "Status", get: (m) => (d.activeIds.has(m.id) ? "Active" : "No active plan"), show: (m) => <span className={`rp-chip ${d.activeIds.has(m.id) ? "" : "rp-chip--warn"}`}>{d.activeIds.has(m.id) ? "Active" : "No active plan"}</span> },
          ]} />
      )}
      {!loading && tab === "attendance" && (() => {
        const per = new Map<string, { n: number; last: number }>();
        d.attCur.forEach((a) => { const t = new Date(a.check_in_at).getTime(); const x = per.get(a.member_id) ?? { n: 0, last: 0 }; per.set(a.member_id, { n: x.n + 1, last: Math.max(x.last, t) }); });
        const rows = [...per.entries()].map(([id, v]) => ({ id, ...v }));
        return (
          <DetailTable title="Visits by member" file={`attendance-${dayKey(start)}`} rows={rows} defaultSort="visits" empty="No check-ins match these filters"
            cols={[
              { key: "name", label: "Member", get: (r: { id: string; n: number; last: number }) => d.nameOf.get(r.id)?.full_name ?? "—", show: (r) => <Link href={`/dashboard/members/${r.id}`} className="rp-tlink">{d.nameOf.get(r.id)?.full_name ?? "—"}</Link> },
              { key: "visits", label: "Visits", get: (r) => r.n, right: true },
              { key: "perweek", label: "Per week", get: (r) => Math.round((r.n / Math.max(1, len / (7 * 86400000))) * 10) / 10, right: true },
              { key: "last", label: "Last visit", get: (r) => r.last, show: (r) => new Date(r.last).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) },
            ]} />
        );
      })()}
      {!loading && tab === "retention" && (
        <DetailTable title="Memberships ending soon" file="renewals" rows={d.renewals} defaultSort="ends" empty="Nothing due in the next 30 days"
          cols={[
            { key: "name", label: "Member", get: (x: MembershipRow) => d.nameOf.get(x.member_id)?.full_name ?? "—", show: (x) => <Link href={`/dashboard/members/${x.member_id}`} className="rp-tlink">{d.nameOf.get(x.member_id)?.full_name ?? "—"}</Link> },
            { key: "plan", label: "Plan", get: (x) => x.membership_plans?.name ?? "—" },
            { key: "ends", label: "Ends", get: (x) => -new Date(x.end_date).getTime(), show: (x) => new Date(x.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
            { key: "last", label: "Last visit", get: (x) => d.lastVisit.get(x.member_id) ?? 0, show: (x) => { const t = d.lastVisit.get(x.member_id); return t ? `${Math.floor((Date.now() - t) / 86400000)}d ago` : "Never" } },
            { key: "value", label: "Value", get: (x) => x.membership_plans?.price_paise ?? 0, right: true, money: true },
          ]} />
      )}
      {!loading && tab === "classes" && (
        <DetailTable title="Classes" file={`classes-${dayKey(start)}`} rows={d.fill} defaultSort="fill" empty="No active classes"
          cols={[
            { key: "name", label: "Class", get: (c: { name: string; pct: number; booked: number }) => c.name },
            { key: "booked", label: "Bookings", get: (c) => c.booked, right: true },
            { key: "fill", label: "Fill rate", get: (c) => c.pct, right: true, show: (c) => <span className="rp-tfill"><i><b style={{ width: `${c.pct}%` }} /></i>{c.pct}%</span> },
          ]} />
      )}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const RP_CSS = `
.ps-page.rp { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.rp { max-width: none; }
.rp { --rp-line: var(--separator); }

.rp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.rp-title { display: flex; align-items: center; gap: 12px; }
.rp-title-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); }
.rp-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.rp-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.rp-head-actions { display: flex; gap: 8px; }
.rp-head-actions .ps-btn { height: 40px; border-radius: 11px; }

.rp-tabs { display: flex; gap: 4px; margin-bottom: 10px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--rp-line); }
.rp-tabs::-webkit-scrollbar { display: none; }
.rp-tabs button { flex: 0 0 auto; height: 38px; padding: 0 14px; border: none; border-bottom: 2.5px solid transparent; margin-bottom: -1px; background: none; font: inherit; font-size: 14px; font-weight: 620; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.rp-tabs button:hover { color: var(--text-primary); }
.rp-tabs button[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.rp-fsearch input, .rp-amt input { height: 36px; padding: 0 10px; border: 1px solid var(--rp-line); border-radius: 9px; font: inherit; font-size: 13px; background: #fff; outline: none; }
.rp-fsearch input { width: 200px; }
.rp-fsearch input:focus, .rp-amt input:focus { border-color: var(--accent); }
.rp-amt { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-tertiary); }
.rp-amt input { width: 74px; }
.rp-fgroup { display: inline-flex; align-items: center; gap: 3px; padding: 3px; border-radius: 10px; background: #f2f3f6; }
.rp-fgroup small { font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); padding: 0 6px; }
.rp-fgroup button { height: 28px; padding: 0 9px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.rp-fgroup button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.rp-active { flex-basis: 100%; display: flex; gap: 6px; flex-wrap: wrap; }
.rp-active > span { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 10px; border-radius: 13px; background: #eef4ff; color: #0b4e98; font-size: 12.5px; font-weight: 600; }
.rp-active button { width: 18px; height: 18px; border: none; border-radius: 50%; background: none; display: grid; place-items: center; color: inherit; cursor: pointer; }
.rp-active button:hover { background: #d9e6fb; }

.rp-table { margin-top: 12px; }
.rp-tsearch input { height: 32px; width: 200px; padding: 0 10px; border: 1px solid var(--rp-line); border-radius: 8px; font: inherit; font-size: 13px; outline: none; }
.rp-tsearch input:focus { border-color: var(--accent); }
.rp-tbtn { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 11px; border: 1px solid var(--rp-line); border-radius: 8px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 650; color: var(--text-secondary); cursor: pointer; }
.rp-tscroll { overflow-x: auto; margin: 0 -14px; }
.rp-table table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.rp-table th { position: sticky; top: 0; background: #f6f8fb; text-align: left; padding: 0 14px; height: 36px; border-bottom: 1px solid var(--rp-line); white-space: nowrap; }
.rp-table th button { border: none; background: none; padding: 0; font: inherit; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); cursor: pointer; }
.rp-table th button[data-on="true"] { color: var(--accent); }
.rp-table td { padding: 0 14px; height: 42px; border-bottom: 1px solid #f0f2f5; white-space: nowrap; }
.rp-table tr:hover td { background: #f8fbff; }
.rp-table [data-right="true"] { text-align: right; }
.rp-tlink { color: var(--text-primary); font-weight: 620; text-decoration: none; }
.rp-tlink:hover { color: var(--accent); }
.rp-tfill { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.rp-tfill i { display: inline-block; height: 6px; width: 60px; border-radius: 3px; background: #eef2f8; overflow: hidden; }
.rp-tfill i b { display: block; height: 100%; background: #0a66d6; }
.rp-tpager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 10px; font-size: 12.5px; color: var(--text-tertiary); }
.rp-tpager button { height: 30px; padding: 0 12px; border: 1px solid var(--rp-line); border-radius: 8px; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.rp-tpager button:disabled { opacity: 0.4; cursor: default; }
@media (max-width: 760px) { .rp-tsearch { display: none; } .rp-fsearch input { width: 100%; } .rp-fsearch { flex-basis: 100%; } }

.rp-filters { position: relative; overflow: hidden; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px; margin-bottom: 12px; border-radius: 14px; background: #fff; border: 1px solid var(--rp-line); }
.rp-filters::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.rp-seg { display: flex; padding: 3px; border-radius: 10px; background: #f2f3f6; overflow-x: auto; scrollbar-width: none; }
.rp-seg button { flex: 0 0 auto; height: 30px; padding: 0 11px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.rp-seg button[aria-pressed="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.rp-dates { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); }
.rp-dates input { height: 36px; padding: 0 8px; border: 1px solid var(--rp-line); border-radius: 9px; font: inherit; font-size: 13px; color-scheme: light; }
.rp-select { height: 36px; padding: 0 28px 0 10px; border: 1px solid var(--rp-line); border-radius: 9px; font: inherit; font-size: 13px; font-weight: 600; background: #fff; color: var(--text-primary); }
.rp-more-btn { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--rp-line); border-radius: 9px; background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.rp-more-btn[data-on="true"] { color: var(--accent); border-color: #b9cdee; background: #f3f8ff; }
.rp-more-btn span { min-width: 18px; height: 18px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
.rp-compare { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.rp-compare input { accent-color: var(--accent); width: 15px; height: 15px; }
.rp-more-row { flex-basis: 100%; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding-top: 8px; border-top: 1px dashed var(--rp-line); }
.rp-clear { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; }

.rp-editbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; border-radius: 12px; background: #eef4ff; color: #0b4e98; font-size: 13px; }
.rp-editbar > span { flex: 1; min-width: 240px; }
.rp-restore { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 13px; border: 1px dashed #8fb3ea; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #0b5cc0; cursor: pointer; }
.rp-reset { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; }
.rp-kpi-pick { flex-basis: 100%; display: flex; gap: 6px; flex-wrap: wrap; }
.rp-kpi-pick button { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 13px; border: 1px solid #c9d8f0; background: #fff; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.rp-kpi-pick button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }

.rp-kpis { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
@media (max-width: 1250px) { .rp-kpis { grid-template-columns: repeat(var(--n2), minmax(0, 1fr)); } }
.rp-kpi { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 13px; background: #fff; border: 1px solid var(--rp-line); min-width: 0; }
.rp-kpi-top { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-kpi-icon { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); flex-shrink: 0; }
.rp-kpi-val { font-size: 21px; font-weight: 760; letter-spacing: -0.02em; line-height: 1.15; }
.rp-kpi-foot { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-tertiary); min-height: 18px; }
.rp-kpi-foot em { font-style: normal; }

.rp-num { font: inherit; color: inherit; font-variant-numeric: tabular-nums; }
.rp-num--toggle { border: none; background: none; padding: 0; cursor: pointer; border-bottom: 1px dashed transparent; }
.rp-num--toggle:hover { border-bottom-color: currentColor; }
.rp-delta { display: inline-flex; align-items: center; gap: 2px; height: 18px; padding: 0 6px; border-radius: 9px; font-size: 11px; font-weight: 700; }
.rp-delta--up { background: #e6f6ec; color: #1f8a3b; } .rp-delta--down { background: #ffecef; color: #c4001a; } .rp-delta--flat { background: #f0f0f3; color: #6e6e73; }

.rp-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; grid-auto-flow: row dense; align-items: stretch; }
.rp-grid-skel { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.rp-tile { position: relative; min-width: 0; }
.rp-tile { display: flex; flex-direction: column; }
.rp-tile > .rp-card { flex: 1; }
.rp-span-4 { grid-column: span 4; } .rp-span-6 { grid-column: span 6; } .rp-span-8 { grid-column: span 8; } .rp-span-12 { grid-column: span 12; }
.rp-tile[data-dragging="true"] { z-index: 30; opacity: 0.92; }
.rp-grid[data-editing="true"] .rp-card { outline: 2px dashed #c9d6f2; outline-offset: -2px; padding-top: 48px; }
.rp-tile { position: relative; }
.rp-tools { position: absolute; top: 9px; left: 9px; right: 9px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 3px; border-radius: 10px; background: #fff; box-shadow: 0 0 0 1px rgba(15,23,42,0.08), 0 6px 16px -6px rgba(15,23,42,0.25); }
.rp-tool { width: 28px; height: 28px; border: none; border-radius: 7px; background: none; display: grid; place-items: center; color: var(--text-secondary); cursor: pointer; }
.rp-tool:hover { background: #f2f4f8; }
.rp-grip { cursor: grab; touch-action: none; }
.rp-sizes { display: flex; margin-right: auto; background: #f2f3f6; border-radius: 7px; padding: 2px; }
.rp-sizes button { height: 24px; min-width: 26px; padding: 0 6px; border: none; border-radius: 5px; background: none; font: inherit; font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); cursor: pointer; }
.rp-sizes button[aria-pressed="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

.rp-card { display: flex; flex-direction: column; background: #fff; border: 1px solid var(--rp-line); border-radius: 16px; padding: 12px 14px 14px; transition: box-shadow 160ms, border-color 160ms; min-height: 0; }
.rp-card:hover { border-color: #d3dff2; box-shadow: 0 10px 26px -18px rgba(10,60,160,0.45); }
.rp-chart { flex: 1; min-height: 200px; position: relative; }
.rp-chart .recharts-surface { overflow: hidden; }
.rp-chart .recharts-brush-texts { display: none; }
.rp-mini { display: inline-flex; padding: 2px; border-radius: 8px; background: #f2f3f6; flex-shrink: 0; }
.rp-mini button { height: 24px; padding: 0 9px; border: none; border-radius: 6px; background: none; font: inherit; font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); cursor: pointer; white-space: nowrap; }
.rp-mini button[aria-pressed="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.rp-series { display: inline-flex; gap: 4px; }
.rp-series button { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 12px; border: 1px solid var(--rp-line); background: #fff; font: inherit; font-size: 11.5px; font-weight: 650; color: var(--text-secondary); cursor: pointer; }
.rp-series button i { width: 8px; height: 8px; border-radius: 2px; }
.rp-series button[aria-pressed="false"] { opacity: 0.45; text-decoration: line-through; }
.rp-donut-chart { position: relative; width: 150px; height: 150px; flex-shrink: 0; }
.rp-donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; text-align: center; }
.rp-donut-center small { font-size: 11px; color: var(--text-tertiary); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-donut-center b { font-size: 17px; font-weight: 780; color: var(--text-primary); }
.rp-donut-center b .rp-num--toggle { pointer-events: auto; }
.rp-donut-center em { font-style: normal; font-size: 11px; font-weight: 700; color: var(--accent); }
.rp-card-h { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; min-width: 0; }
.rp-card-icon { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); flex-shrink: 0; }
.rp-card-t { flex: 1; min-width: 0; }
.rp-card-t h3 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.rp-card-t small { display: block; font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-big { font-size: 18px; font-weight: 760; letter-spacing: -0.02em; color: var(--accent); }
.rp-count { min-width: 30px; height: 26px; padding: 0 9px; border-radius: 13px; display: grid; place-items: center; font-size: 13px; font-weight: 750; background: var(--accent-dim, #e8f1ff); color: var(--accent); }
.rp-empty { padding: 26px 8px; text-align: center; font-size: 13px; color: var(--text-tertiary); }
.rp-tip { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: #fff; box-shadow: 0 8px 24px -8px rgba(15,23,42,0.3); font-size: 12px; }
.rp-tip span { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.rp-tip i { width: 8px; height: 8px; border-radius: 2px; }

.rp-bars { display: flex; flex-direction: column; gap: 8px; }
.rp-card > .rp-bars { flex: 1; justify-content: center; gap: 12px; }
.rp-card > .rp-empty { flex: 1; display: grid; place-items: center; }
.rp-bar { display: grid; grid-template-columns: minmax(70px, 0.9fr) minmax(0, 1.4fr) auto; align-items: center; gap: 8px; font-size: 12.5px; }
.rp-bar--btn { grid-template-columns: minmax(0, 1fr) auto; border: none; background: none; padding: 3px 4px; margin: -3px -4px; border-radius: 7px; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.rp-bar--btn:hover { background: #f4f7fc; }
.rp-bar-name { display: inline-flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
.rp-bar-name i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.rp-bar-track { height: 8px; border-radius: 5px; background: #eef2f8; overflow: hidden; }
.rp-bar-track i { display: block; height: 100%; border-radius: 5px; }
.rp-bar b { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.rp-stack { display: flex; gap: 2px; height: 12px; border-radius: 6px; overflow: hidden; }
.rp-stack--lg { height: 14px; border-radius: 7px; }
.rp-plan { flex: 1; display: flex; flex-direction: column; gap: 14px; justify-content: space-between; }
.rp-plan-top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.rp-plan-top div { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 11px; background: #f4f7fc; min-width: 0; }
.rp-plan-top small { font-size: 11px; color: var(--text-tertiary); }
.rp-plan-top b { font-size: 15px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-plan-list { display: flex; flex-direction: column; }
.rp-plan-row { display: grid; grid-template-columns: minmax(0, 1fr) 44px auto; gap: 8px; align-items: center; padding: 7px 2px; font-size: 13px; }
.rp-plan-row + .rp-plan-row { border-top: 1px solid #f0f2f5; }
.rp-plan-row span { display: inline-flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
.rp-plan-row span i { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.rp-plan-row em { font-style: normal; font-size: 12px; font-weight: 650; color: var(--text-tertiary); text-align: right; }
.rp-plan-row b { font-weight: 700; text-align: right; }
.rp-stack i { display: block; }

.rp-donut { flex: 1; display: flex; align-items: center; gap: 14px; }
.rp-legend { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rp-leg { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 4px 6px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; color: var(--text-secondary); }
.rp-leg:hover, .rp-leg[data-on="true"] { background: #f3f8ff; }
.rp-leg i { width: 10px; height: 10px; border-radius: 3px; }
.rp-leg span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-leg b { color: var(--text-primary); }

.rp-heat { flex: 1; display: grid; grid-template-columns: 34px repeat(5, minmax(0, 1fr)) 34px; grid-auto-rows: minmax(22px, 1fr); gap: 3px; font-size: 11px; }
.rp-heat > small { text-align: center; color: var(--text-tertiary); font-size: 10.5px; padding-bottom: 2px; }
.rp-heat-row { display: contents; }
.rp-heat-row small { align-self: center; color: var(--text-tertiary); }
.rp-heat-row button { min-height: 22px; border: none; border-radius: 5px; display: grid; place-items: center; font: inherit; font-weight: 700; font-size: 11px; cursor: pointer; transition: transform 120ms, box-shadow 120ms; }
.rp-heat-row button:hover, .rp-heat-row button[data-on="true"] { transform: scale(1.06); box-shadow: 0 0 0 2px #fff, 0 0 0 4px #0a66d6; position: relative; z-index: 1; }
.rp-heat-row b { align-self: center; text-align: right; font-size: 11.5px; color: var(--text-primary); }

.rp-list { display: flex; flex-direction: column; }
.rp-li { display: flex; align-items: center; gap: 9px; padding: 6px 4px; border-radius: 9px; color: inherit; text-decoration: none; }
a.rp-li:hover { background: #f4f7fc; }
.rp-li + .rp-li { border-top: 1px solid #f0f2f5; }
.rp-li-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rp-li-t b { font-size: 13px; font-weight: 620; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-li-t small { font-size: 11.5px; color: var(--text-tertiary); }
.rp-chip { height: 22px; padding: 0 9px; border-radius: 11px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 700; background: var(--accent-dim, #e8f1ff); color: var(--accent); text-decoration: none; white-space: nowrap; }
.rp-chip--warn { background: #fff1de; color: #b45309; }
.rp-rank { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 11.5px; font-weight: 750; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); flex-shrink: 0; }
.rp-more { display: block; padding: 8px 4px 0; font-size: 12.5px; font-weight: 650; color: var(--accent); text-decoration: none; }

@media (max-width: 1100px) {
  .rp-span-4 { grid-column: span 6; } .rp-span-8 { grid-column: span 12; }
}
@media (max-width: 760px) {
  .ps-page.rp { padding: 10px 10px 24px !important; }
  .rp-title h1 { font-size: 22px; }
  .rp-head-actions { width: 100%; }
  .rp-head-actions .ps-btn { flex: 1; justify-content: center; }
  .rp-seg { flex-basis: 100%; }
  .rp-compare { margin-left: 0; }
  .rp-kpis { display: flex; overflow-x: auto; scrollbar-width: none; }
  .rp-kpi { flex: 0 0 150px; }
  .rp-grid > .rp-tile { grid-column: span 12; }
  .rp-sizes { display: none; }
  .rp-select, .rp-dates input { font-size: 16px; }
}
`;
