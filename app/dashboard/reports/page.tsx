"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, ComposedChart,
} from "recharts";
import {
  Download, TrendingUp, Users, Calendar, Activity, Target, DollarSign,
  BarChart2, Settings, X, GripVertical, Eye, EyeOff,
} from "lucide-react";
import { Avatar, formatINR, Skeleton } from "../components/ui";

const supabase = createClient();

const COLORS = ["#0071e3", "#34c759", "#ff9f0a", "#ff3b30", "#af52de", "#30b0c7", "#ff6b35", "#a2845e"];
const ACCENT = "#0071e3";

// ---- Types ----
type Period = "7d" | "30d" | "90d" | "6m" | "12m" | "custom";
type ReportType = "overview" | "revenue" | "members" | "attendance" | "retention" | "goals" | "classes";
type WidgetId = "mrr" | "arr" | "arpm" | "churn" | "active" | "total" | "checkins" | "goal_rate" | "ltv" | "pending" | "new_members" | "forecast";

interface Filters {
  period: Period;
  customStart: string;
  customEnd: string;
  planId: string;
  memberStatus: "all" | "active" | "expired";
}

interface Widget { id: WidgetId; label: string; visible: boolean }

type MembershipPlan = { id: string; name: string };
type MemberRow = { id: string; created_at: string; full_name: string; phone: string | null; primary_goal: string | null; weight_kg: number | null; target_weight_kg: number | null; sex: string | null };
type PaymentRow = { total_paise: number; paid_at: string; method: string | null; member_id: string; memberships: { membership_plans: { id: string; name: string; duration_days: number | null } | null } | null };
type AttendanceRow = { check_in_at: string; member_id: string };
type MembershipRow = { member_id: string; end_date: string; status: string; membership_plans: { name: string; price_paise: number; duration_days: number | null } | null };
type ClassRow = { id: string; name: string; capacity: number; schedule_day: string; start_time: string };
type ClassBookingRow = { class_id: string; booked_for: string };

// ---- Helpers ----
function getPeriodDates(period: Period, customStart: string, customEnd: string) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date();
  if (period === "7d") start.setDate(start.getDate() - 7);
  else if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "90d") start.setDate(start.getDate() - 90);
  else if (period === "6m") start.setMonth(start.getMonth() - 6);
  else if (period === "12m") start.setMonth(start.getMonth() - 12);
  else if (period === "custom" && customStart && customEnd) {
    return { start: new Date(customStart + "T00:00:00"), end: new Date(customEnd + "T23:59:59") };
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fmtMonth = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const fmtMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function groupByDay(items: { date: string; amount: number }[]) {
  const map = new Map<string, number>();
  for (const it of items) { const d = it.date.slice(0, 10); map.set(d, (map.get(d) ?? 0) + it.amount); }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount, label: fmtDate(date) }));
}

function groupByMonth(items: { date: string; amount: number }[]) {
  const map = new Map<string, number>();
  for (const it of items) { const d = new Date(it.date); const key = fmtMonthKey(d); map.set(key, (map.get(key) ?? 0) + it.amount); }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, amount]) => {
    const [y, m] = key.split("-"); return { month: key, amount, label: fmtMonth(new Date(parseInt(y), parseInt(m) - 1, 1)) };
  });
}

// ---- Tooltip components ----
function RevTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 10, padding: "8px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 650, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatINR(payload[0].value * 100)}</div>
    </div>
  );
}

function CntTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 10, padding: "8px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color ?? COLORS[i] }}>{p.name}: {p.value}</div>)}
    </div>
  );
}

// ---- KPI card ----
function KpiCard({ label, value, sub, tone, icon, onClick }: {
  label: string; value: string; sub?: string; tone?: "green" | "red" | "amber" | "blue";
  icon?: React.ReactNode; onClick?: () => void;
}) {
  const toneColor = { green: "var(--green)", red: "var(--red)", amber: "var(--amber)", blue: "var(--accent)" }[tone ?? ""] ?? "var(--text-tertiary)";
  return (
    <div onClick={onClick} style={{ background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 16, padding: "18px 20px", cursor: onClick ? "pointer" : "default", transition: "box-shadow 120ms" }}
      onMouseEnter={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 2px var(--accent)")}
      onMouseLeave={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", fontWeight: 500 }}>{label}</div>
        {icon && <div style={{ color: "var(--text-tertiary)", opacity: 0.7 }}>{icon}</div>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: toneColor, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

// ---- Chart wrapper ----
function ChartCard({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 16, padding: "20px 20px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const chartStyle = { fontSize: 12, fill: "var(--text-tertiary)" };
const gridStyle = { stroke: "var(--separator)", strokeDasharray: "3 3" };

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat loss", muscle_gain: "Muscle gain", weight_gain: "Weight gain",
  maintenance: "Maintenance", healthy_eating: "Healthy eating",
};

const DEFAULT_WIDGETS: Widget[] = [
  { id: "mrr", label: "MRR", visible: true },
  { id: "arr", label: "ARR", visible: true },
  { id: "arpm", label: "Avg Revenue / Member", visible: true },
  { id: "forecast", label: "Revenue Forecast", visible: true },
  { id: "active", label: "Active Members", visible: true },
  { id: "total", label: "Total Members", visible: true },
  { id: "new_members", label: "New This Period", visible: true },
  { id: "churn", label: "Churn Rate", visible: true },
  { id: "checkins", label: "Check-ins", visible: true },
  { id: "goal_rate", label: "Goal Achievement", visible: true },
  { id: "ltv", label: "Avg Lifetime Value", visible: true },
  { id: "pending", label: "Pending Renewals", visible: true },
];

const PERIOD_OPTS: { key: Period; label: string }[] = [
  { key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "90d", label: "90d" },
  { key: "6m", label: "6m" }, { key: "12m", label: "12m" }, { key: "custom", label: "Custom" },
];

const REPORT_TYPES: { key: ReportType; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <BarChart2 size={15} /> },
  { key: "revenue", label: "Revenue", icon: <TrendingUp size={15} /> },
  { key: "members", label: "Members", icon: <Users size={15} /> },
  { key: "attendance", label: "Attendance", icon: <Activity size={15} /> },
  { key: "retention", label: "Retention", icon: <Calendar size={15} /> },
  { key: "goals", label: "Goals", icon: <Target size={15} /> },
  { key: "classes", label: "Classes", icon: <DollarSign size={15} /> },
];

// ============================================================
export default function ReportsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>("overview");
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS);
  const [showWidgetEditor, setShowWidgetEditor] = useState(false);
  const [filters, setFilters] = useState<Filters>({ period: "30d", customStart: "", customEnd: "", planId: "", memberStatus: "all" });

  // Raw data
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classBookings, setClassBookings] = useState<ClassBookingRow[]>([]);

  const loadData = useCallback(async (oid: string, f: Filters) => {
    setLoading(true);
    const { start, end } = getPeriodDates(f.period, f.customStart, f.customEnd);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [
      { data: payData },
      { data: memData },
      { data: mshipData },
      { data: attData },
      { data: classData },
      { data: bookData },
    ] = await Promise.all([
      supabase.from("payments").select("total_paise, paid_at, method, member_id, memberships(membership_plans(id, name, duration_days))").eq("org_id", oid).eq("status", "paid").gte("paid_at", startIso).lte("paid_at", endIso),
      supabase.from("members").select("id, created_at, full_name, phone, primary_goal, weight_kg, target_weight_kg, sex").eq("org_id", oid),
      supabase.from("memberships").select("member_id, end_date, status, membership_plans(name, price_paise, duration_days)").eq("org_id", oid),
      supabase.from("attendance_logs").select("check_in_at, member_id").eq("org_id", oid).gte("check_in_at", startIso).lte("check_in_at", endIso),
      supabase.from("classes").select("id, name, capacity, schedule_day, start_time").eq("org_id", oid).eq("is_active", true),
      supabase.from("class_bookings").select("class_id, booked_for").eq("org_id", oid).eq("status", "booked").gte("booked_for", startIso.slice(0, 10)).lte("booked_for", endIso.slice(0, 10)),
    ]);

    let filteredPayments = (payData as PaymentRow[] || []);
    if (f.planId) filteredPayments = filteredPayments.filter((p) => p.memberships?.membership_plans?.id === f.planId);

    setPayments(filteredPayments);
    setMembers((memData as MemberRow[]) || []);
    setMemberships((mshipData as MembershipRow[]) || []);
    setAttendance((attData as AttendanceRow[]) || []);
    setClasses((classData as ClassRow[]) || []);
    setClassBookings((bookData as ClassBookingRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const { data: planData } = await supabase.from("membership_plans").select("id, name").eq("org_id", roleData.org_id).eq("is_active", true);
      setPlans((planData as MembershipPlan[]) || []);
      await loadData(roleData.org_id, filters);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(f: Filters) { setFilters(f); if (orgId) loadData(orgId, f); }

  // ---- Computed KPIs ----
  const activeMs = useMemo(() => memberships.filter((m) => m.status === "active"), [memberships]);
  const activeIds = useMemo(() => new Set(activeMs.map((m) => m.member_id)), [activeMs]);
  const activeMembers = activeIds.size;
  const totalMembers = members.length;

  // MRR — sum of (plan price / duration_days * 30) for all active memberships
  const mrr = useMemo(() => {
    return activeMs.reduce((sum, ms) => {
      const price = ms.membership_plans?.price_paise ?? 0;
      const days = ms.membership_plans?.duration_days ?? 30;
      return sum + (price / days) * 30;
    }, 0);
  }, [activeMs]);

  const arr = mrr * 12;

  const totalRevenue = useMemo(() => payments.reduce((s, p) => s + p.total_paise, 0), [payments]);

  const arpm = activeMembers > 0 ? totalRevenue / activeMembers : 0;

  // LTV — total payments per member, averaged
  const ltv = useMemo(() => {
    if (members.length === 0) return 0;
    const memberPayMap = new Map<string, number>();
    for (const p of payments) memberPayMap.set(p.member_id, (memberPayMap.get(p.member_id) ?? 0) + p.total_paise);
    const total = Array.from(memberPayMap.values()).reduce((s, v) => s + v, 0);
    return memberPayMap.size > 0 ? total / memberPayMap.size : 0;
  }, [payments, members]);

  // Churn — expired memberships with no active renewal / total
  const churnedIds = useMemo(() => {
    const expired = memberships.filter((m) => m.status === "expired").map((m) => m.member_id);
    return expired.filter((id) => !activeIds.has(id));
  }, [memberships, activeIds]);
  const churnRate = totalMembers > 0 ? (churnedIds.length / totalMembers) * 100 : 0;

  // Pending renewals
  const pendingRenewals = useMemo(() => {
    return memberships.filter((m) => m.status === "expired" && !activeIds.has(m.member_id)).length;
  }, [memberships, activeIds]);

  // New members in period
  const { start: periodStart } = getPeriodDates(filters.period, filters.customStart, filters.customEnd);
  const newMembersCount = members.filter((m) => new Date(m.created_at) >= periodStart).length;

  // Revenue forecast — next month based on active memberships
  const forecast = useMemo(() => {
    return activeMs.reduce((sum, ms) => {
      const price = ms.membership_plans?.price_paise ?? 0;
      const days = ms.membership_plans?.duration_days ?? 30;
      const endDate = new Date(ms.end_date);
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      if (endDate >= nextMonth) return sum + price;
      if (endDate >= new Date()) return sum + (price / days) * Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000));
      return sum;
    }, 0);
  }, [activeMs]);

  // Goal achievement
  const goalStats = useMemo(() => {
    const withGoal = members.filter((m) => m.weight_kg != null && m.target_weight_kg != null && m.primary_goal);
    const achieved = withGoal.filter((m) => {
      const diff = Math.abs((m.weight_kg! - m.target_weight_kg!) / m.target_weight_kg!) * 100;
      return diff <= 5;
    });
    return { total: withGoal.length, achieved: achieved.length, rate: withGoal.length > 0 ? (achieved.length / withGoal.length) * 100 : 0 };
  }, [members]);

  // Goal distribution
  const goalDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) if (m.primary_goal) map.set(m.primary_goal, (map.get(m.primary_goal) ?? 0) + 1);
    return Array.from(map.entries()).map(([goal, count]) => ({ name: GOAL_LABELS[goal] ?? goal, value: count })).sort((a, b) => b.value - a.value);
  }, [members]);

  // Revenue over time
  const revenueItems = useMemo(() => payments.map((p) => ({ date: p.paid_at, amount: p.total_paise / 100 })), [payments]);
  const useMonthly = filters.period === "6m" || filters.period === "12m";
  const revenueChart = useMemo(() => useMonthly ? groupByMonth(revenueItems) : groupByDay(revenueItems), [revenueItems, useMonthly]);

  // MRR trend (last 6 months from all payments)
  const mrrTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return d;
    });
    return months.map((d) => {
      const key = fmtMonthKey(d);
      const monthPayments = payments.filter((p) => p.paid_at.startsWith(key));
      const amount = monthPayments.reduce((s, p) => s + p.total_paise / 100, 0);
      return { month: fmtMonth(d), amount };
    });
  }, [payments]);

  // Plan revenue breakdown
  const planRevChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      const name = p.memberships?.membership_plans?.name ?? "Direct";
      map.set(name, (map.get(name) ?? 0) + p.total_paise / 100);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [payments]);

  // Method breakdown
  const methodChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      const m = p.method === "upi" ? "UPI" : p.method === "card" ? "Card" : p.method === "online" ? "Online" : "Cash";
      map.set(m, (map.get(m) ?? 0) + p.total_paise / 100);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [payments]);

  // Member growth
  const memberGrowth = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return d; });
    return months.map((d) => {
      const key = fmtMonthKey(d);
      const newM = members.filter((m) => m.created_at.startsWith(key)).length;
      const cumulative = members.filter((m) => new Date(m.created_at) <= new Date(d.getFullYear(), d.getMonth() + 1, 0)).length;
      return { month: fmtMonth(d), new: newM, total: cumulative };
    });
  }, [members]);

  // Attendance heatmap by hour
  const checkinsByHour = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of attendance) {
      const h = new Date(a.check_in_at).getHours();
      map.set(h, (map.get(h) ?? 0) + 1);
    }
    return Array.from({ length: 15 }, (_, i) => i + 5).map((h) => ({
      hour: h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
      checkins: map.get(h) ?? 0,
    }));
  }, [attendance]);

  // Top visitors
  const topVisitors = useMemo(() => {
    const map = new Map<string, { count: number; last: string; name: string; phone: string | null }>();
    for (const a of attendance) {
      const m = members.find((mb) => mb.id === a.member_id);
      if (!m) continue;
      const ex = map.get(a.member_id) ?? { count: 0, last: a.check_in_at, name: m.full_name, phone: m.phone };
      ex.count += 1;
      if (a.check_in_at > ex.last) ex.last = a.check_in_at;
      map.set(a.member_id, ex);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ member_id: id, ...v })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [attendance, members]);

  // Absent members
  const absentMembers = useMemo(() => {
    const lastSeen = new Map<string, string>();
    const allAtt = attendance;
    for (const a of allAtt) if (!lastSeen.has(a.member_id) || a.check_in_at > lastSeen.get(a.member_id)!) lastSeen.set(a.member_id, a.check_in_at);
    const cutoff = new Date(Date.now() - 14 * 86400000);
    return members.filter((m) => {
      const last = lastSeen.get(m.id);
      return !last || new Date(last) < cutoff;
    }).map((m) => ({ ...m, last_seen: lastSeen.get(m.id) ?? null, days_absent: lastSeen.get(m.id) ? Math.floor((Date.now() - new Date(lastSeen.get(m.id)!).getTime()) / 86400000) : 9999 }))
      .sort((a, b) => b.days_absent - a.days_absent).slice(0, 20);
  }, [attendance, members]);

  // Renewal trend
  const renewalTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); return d; });
    return months.map((d) => {
      const key = fmtMonthKey(d);
      const monthMs = memberships.filter((m) => m.end_date?.startsWith(key));
      return { month: fmtMonth(d), renewed: monthMs.filter((m) => m.status === "active").length, expired: monthMs.filter((m) => m.status === "expired").length };
    });
  }, [memberships]);

  // Pending renewal members list
  const pendingList = useMemo(() =>
    memberships.filter((m) => m.status === "expired" && !activeIds.has(m.member_id)).slice(0, 20).map((ms) => {
      const mem = members.find((m) => m.id === ms.member_id);
      return { member_id: ms.member_id, full_name: mem?.full_name ?? "—", phone: mem?.phone ?? null, end_date: ms.end_date, plan_name: ms.membership_plans?.name ?? null };
    }),
  [memberships, activeIds, members]);

  // Class occupancy
  const classOccupancy = useMemo(() => {
    return classes.map((cls) => {
      const booked = classBookings.filter((b) => b.class_id === cls.id).length;
      const pct = cls.capacity > 0 ? Math.round((booked / cls.capacity) * 100) : 0;
      return { name: cls.name, capacity: cls.capacity, booked, occupancy: pct, day: cls.schedule_day };
    }).sort((a, b) => b.occupancy - a.occupancy);
  }, [classes, classBookings]);

  // Sex distribution
  const sexDist = useMemo(() => {
    const m = members.filter((mb) => mb.sex === "male").length;
    const f = members.filter((mb) => mb.sex === "female").length;
    return [{ name: "Male", value: m }, { name: "Female", value: f }];
  }, [members]);

  // Widget visibility
  const visibleWidgets = widgets.filter((w) => w.visible);
  function toggleWidget(id: WidgetId) { setWidgets((ws) => ws.map((w) => w.id === id ? { ...w, visible: !w.visible } : w)); }

  const widgetValues: Record<WidgetId, { value: string; sub?: string; tone?: "green" | "red" | "amber" | "blue"; icon?: React.ReactNode }> = {
    mrr: { value: formatINR(mrr), sub: "Monthly recurring revenue", tone: "blue", icon: <TrendingUp size={16} /> },
    arr: { value: formatINR(arr), sub: "Annual run rate", icon: <TrendingUp size={16} /> },
    arpm: { value: formatINR(arpm), sub: "Avg revenue per member", icon: <DollarSign size={16} /> },
    forecast: { value: formatINR(forecast), sub: "Projected next 30 days", tone: "green", icon: <TrendingUp size={16} /> },
    active: { value: String(activeMembers), sub: `${totalMembers} total`, tone: "green", icon: <Users size={16} /> },
    total: { value: String(totalMembers), sub: `${activeMembers} active`, icon: <Users size={16} /> },
    new_members: { value: String(newMembersCount), sub: "New in this period", tone: newMembersCount > 0 ? "green" : undefined, icon: <Users size={16} /> },
    churn: { value: `${churnRate.toFixed(1)}%`, sub: `${churnedIds.length} churned members`, tone: churnRate > 20 ? "red" : churnRate > 10 ? "amber" : "green", icon: <Activity size={16} /> },
    checkins: { value: String(attendance.length), sub: `${topVisitors.length} unique members`, icon: <Activity size={16} /> },
    goal_rate: { value: `${goalStats.rate.toFixed(0)}%`, sub: `${goalStats.achieved} of ${goalStats.total} on track`, tone: goalStats.rate > 70 ? "green" : "amber", icon: <Target size={16} /> },
    ltv: { value: formatINR(ltv), sub: "Avg lifetime value per member", icon: <DollarSign size={16} /> },
    pending: { value: String(pendingRenewals), sub: "Pending renewals", tone: pendingRenewals > 0 ? "amber" : "green", icon: <Calendar size={16} /> },
  };

  function exportCSV() {
    const rows = reportType === "revenue"
      ? [["Date", "Amount (₹)", "Method"], ...payments.map((p) => [fmtDate(p.paid_at), (p.total_paise / 100).toFixed(2), p.method ?? ""])]
      : reportType === "attendance"
      ? [["Member", "Visits", "Last seen"], ...topVisitors.map((v) => [v.name, v.count, v.last.slice(0, 10)])]
      : reportType === "retention"
      ? [["Member", "Plan", "Expired"], ...pendingList.map((p) => [p.full_name, p.plan_name ?? "", p.end_date])]
      : [["Metric", "Value"], ["MRR", formatINR(mrr)], ["ARR", formatINR(arr)], ["Active members", activeMembers], ["Churn rate", `${churnRate.toFixed(1)}%`]];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="ps-page">
      {/* Header */}
      <header className="ps-header">
        <div className="ps-header-text">
          <h1 className="ps-title">Reports</h1>
          <p className="ps-subtitle">Full analytics suite for your gym</p>
        </div>
        <div className="ps-header-actions">
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setShowWidgetEditor(true)}>
            <Settings size={14} /> Customize
          </button>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={exportCSV} disabled={loading}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      {/* Report type pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {REPORT_TYPES.map(({ key, label, icon }) => (
          <button key={key} type="button" onClick={() => setReportType(key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 22, fontSize: 13, fontWeight: reportType === key ? 600 : 500, cursor: "pointer", border: reportType === key ? "2px solid var(--accent)" : "2px solid var(--separator)", background: reportType === key ? "var(--accent-dim)" : "var(--surface)", color: reportType === key ? "var(--accent)" : "var(--text-secondary)", transition: "all 120ms" }}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 14, marginBottom: 20 }}>
        {/* Period */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {PERIOD_OPTS.map((p) => (
            <button key={p.key} type="button" onClick={() => applyFilters({ ...filters, period: p.key })}
              style={{ padding: "4px 11px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: filters.period === p.key ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)", background: filters.period === p.key ? "var(--accent-dim)" : "transparent", color: filters.period === p.key ? "var(--accent)" : "var(--text-secondary)", fontWeight: filters.period === p.key ? 600 : 400 }}>
              {p.label}
            </button>
          ))}
        </div>

        {filters.period === "custom" && (
          <>
            <input type="date" className="ps-input" value={filters.customStart} onChange={(e) => setFilters((f) => ({ ...f, customStart: e.target.value }))}
              style={{ height: 34, fontSize: 13, width: 136, colorScheme: "light" }} />
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>→</span>
            <input type="date" className="ps-input" value={filters.customEnd} onChange={(e) => {
              const nf = { ...filters, customEnd: e.target.value };
              setFilters(nf);
              if (nf.customStart && nf.customEnd) applyFilters(nf);
            }} style={{ height: 34, fontSize: 13, width: 136, colorScheme: "light" }} />
          </>
        )}

        <div style={{ height: 20, width: 1, background: "var(--separator)" }} />

        <select className="ps-input" value={filters.planId} onChange={(e) => applyFilters({ ...filters, planId: e.target.value })} style={{ height: 34, fontSize: 13, minWidth: 120 }}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select className="ps-input" value={filters.memberStatus} onChange={(e) => applyFilters({ ...filters, memberStatus: e.target.value as Filters["memberStatus"] })} style={{ height: 34, fontSize: 13, minWidth: 110 }}>
          <option value="all">All members</option>
          <option value="active">Active only</option>
          <option value="expired">Expired only</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={90} r={16} />)}
          </div>
          <Skeleton w="100%" h={280} r={16} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Skeleton w="100%" h={240} r={16} /><Skeleton w="100%" h={240} r={16} />
          </div>
        </div>
      ) : (<>

      {/* ===== OVERVIEW ===== */}
      {reportType === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            {visibleWidgets.map((w) => {
              const v = widgetValues[w.id];
              return <KpiCard key={w.id} label={w.label} value={v.value} sub={v.sub} tone={v.tone} icon={v.icon} />;
            })}
          </div>

          {/* Revenue + MRR trend side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Revenue over time" sub={useMonthly ? "Monthly" : "Daily"}>
              <ResponsiveContainer width="100%" height={200}>
                {useMonthly ? (
                  <BarChart data={revenueChart} barSize={24}>
                    <CartesianGrid {...gridStyle} vertical={false} />
                    <XAxis dataKey="label" tick={chartStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<RevTooltip />} />
                    <Bar dataKey="amount" fill={ACCENT} radius={[5, 5, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={revenueChart}>
                    <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT} stopOpacity={0.15} /><stop offset="95%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid {...gridStyle} vertical={false} />
                    <XAxis dataKey="label" tick={chartStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<RevTooltip />} />
                    <Area type="monotone" dataKey="amount" stroke={ACCENT} strokeWidth={2} fill="url(#rg)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="MRR trend" sub="Last 6 months">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mrrTrend}>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="month" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<RevTooltip />} />
                  <Line type="monotone" dataKey="amount" name="MRR" stroke={COLORS[1]} strokeWidth={2.5} dot={{ fill: COLORS[1], r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Member growth + plan pie */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Member growth" sub="New vs cumulative">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={memberGrowth}>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="month" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CntTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="new" name="New" fill={ACCENT} radius={[4, 4, 0, 0]} barSize={16} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={COLORS[1]} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Revenue by plan">
              {planRevChart.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No payments in period</div> : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={planRevChart} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={32} paddingAngle={3}>
                        {planRevChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatINR(v * 100)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                    {planRevChart.slice(0, 4).map((p, i) => (
                      <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ flex: 1, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatINR(p.value * 100)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
          </div>

          {/* Check-in heatmap + gender */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <ChartCard title="Peak hours" sub="Check-ins by time of day">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={checkinsByHour} barSize={18}>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="hour" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CntTooltip />} />
                  <Bar dataKey="checkins" name="Check-ins" fill={ACCENT} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Member mix">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sexDist} dataKey="value" cx="50%" cy="50%" outerRadius={68} paddingAngle={3}>
                    <Cell fill={ACCENT} /><Cell fill={COLORS[4]} />
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* ===== REVENUE ===== */}
      {reportType === "revenue" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Total revenue" value={formatINR(totalRevenue)} icon={<DollarSign size={16} />} />
            <KpiCard label="MRR" value={formatINR(mrr)} tone="blue" icon={<TrendingUp size={16} />} />
            <KpiCard label="ARR" value={formatINR(arr)} icon={<TrendingUp size={16} />} />
            <KpiCard label="Avg per payment" value={formatINR(payments.length > 0 ? totalRevenue / payments.length : 0)} icon={<DollarSign size={16} />} />
            <KpiCard label="Transactions" value={String(payments.length)} />
            <KpiCard label="30d forecast" value={formatINR(forecast)} tone="green" icon={<TrendingUp size={16} />} />
          </div>

          <ChartCard title="Revenue over time" sub={useMonthly ? "Monthly breakdown" : "Daily breakdown"}>
            <ResponsiveContainer width="100%" height={260}>
              {useMonthly ? (
                <BarChart data={revenueChart} barSize={32}>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="label" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<RevTooltip />} />
                  <Bar dataKey="amount" fill={ACCENT} radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : (
                <AreaChart data={revenueChart}>
                  <defs><linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT} stopOpacity={0.15} /><stop offset="95%" stopColor={ACCENT} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="label" tick={chartStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<RevTooltip />} />
                  <Area type="monotone" dataKey="amount" stroke={ACCENT} strokeWidth={2} fill="url(#rg2)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Revenue by plan">
              {planRevChart.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No data</div> : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={planRevChart} dataKey="value" cx="50%" cy="50%" outerRadius={72} innerRadius={36} paddingAngle={3}>
                        {planRevChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatINR(v * 100)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    {planRevChart.map((p, i) => (
                      <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ flex: 1, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatINR(p.value * 100)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <ChartCard title="Payment methods">
              {methodChart.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No data</div> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={methodChart} layout="vertical" barSize={22}>
                    <CartesianGrid {...gridStyle} horizontal={false} />
                    <XAxis type="number" tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} width={56} />
                    <Tooltip formatter={(v: number) => formatINR(v * 100)} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {methodChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="MRR trend" sub="Monthly recurring revenue over the last 6 months">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mrrTrend}>
                <CartesianGrid {...gridStyle} vertical={false} />
                <XAxis dataKey="month" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<RevTooltip />} />
                <Line type="monotone" dataKey="amount" name="MRR" stroke={COLORS[1]} strokeWidth={2.5} dot={{ fill: COLORS[1], r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* ===== MEMBERS ===== */}
      {reportType === "members" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Total members" value={String(totalMembers)} icon={<Users size={16} />} />
            <KpiCard label="Active" value={String(activeMembers)} tone="green" />
            <KpiCard label="No active plan" value={String(totalMembers - activeMembers)} tone={totalMembers - activeMembers > 0 ? "amber" : undefined} />
            <KpiCard label="New this period" value={String(newMembersCount)} tone={newMembersCount > 0 ? "green" : undefined} />
            <KpiCard label="Churn rate" value={`${churnRate.toFixed(1)}%`} tone={churnRate > 20 ? "red" : churnRate > 10 ? "amber" : "green"} />
            <KpiCard label="Avg LTV" value={formatINR(ltv)} icon={<DollarSign size={16} />} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <ChartCard title="Member growth" sub="New signups vs total members">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={memberGrowth}>
                  <CartesianGrid {...gridStyle} vertical={false} />
                  <XAxis dataKey="month" tick={chartStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={chartStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CntTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="new" name="New members" fill={ACCENT} radius={[4, 4, 0, 0]} barSize={18} />
                  <Line type="monotone" dataKey="total" name="Total" stroke={COLORS[1]} strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Member status">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={[{ name: "Active", value: activeMembers }, { name: "No plan", value: totalMembers - activeMembers }]} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={4}>
                    <Cell fill={COLORS[1]} /><Cell fill={COLORS[2]} />
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Goal distribution" sub="What members are training for">
              {goalDist.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No goal data</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={goalDist} dataKey="value" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {goalDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Member gender mix">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sexDist} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={4}>
                    <Cell fill={ACCENT} /><Cell fill={COLORS[4]} />
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}

      {/* ===== ATTENDANCE ===== */}
      {reportType === "attendance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Total check-ins" value={String(attendance.length)} icon={<Activity size={16} />} />
            <KpiCard label="Unique visitors" value={String(topVisitors.length)} />
            <KpiCard label="Avg per day" value={attendance.length > 0 ? (attendance.length / Math.max(1, Math.ceil((getPeriodDates(filters.period, filters.customStart, filters.customEnd).end.getTime() - getPeriodDates(filters.period, filters.customStart, filters.customEnd).start.getTime()) / 86400000))).toFixed(1) : "0"} />
            <KpiCard label="Drop-off risk" value={String(absentMembers.length)} tone={absentMembers.length > 0 ? "amber" : "green"} />
          </div>

          <ChartCard title="Peak hours" sub="When members visit most">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={checkinsByHour} barSize={18}>
                <CartesianGrid {...gridStyle} vertical={false} />
                <XAxis dataKey="hour" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CntTooltip />} />
                <Bar dataKey="checkins" name="Check-ins" fill={ACCENT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Most active members" sub="Top visitors in this period">
              {topVisitors.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "40px 0" }}>No check-ins</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topVisitors.slice(0, 8).map((v, i) => (
                    <div key={v.member_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", width: 16, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <Avatar name={v.name} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Last: {fmtDate(v.last)}</div>
                      </div>
                      <span style={{ background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 9px", borderRadius: 12, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>

            <ChartCard title="Not seen in 14+ days" sub={`${absentMembers.length} members at risk`}>
              {absentMembers.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "40px 0" }}>All members active 👍</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {absentMembers.slice(0, 8).map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={m.full_name} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.full_name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{m.last_seen ? `Last: ${fmtDate(m.last_seen)}` : "Never visited"}</div>
                      </div>
                      <span className={`ps-badge ${m.days_absent >= 30 ? "ps-badge--red" : "ps-badge--amber"}`} style={{ fontSize: 12, flexShrink: 0 }}>
                        {m.days_absent >= 999 ? "Never" : `${m.days_absent}d`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* ===== RETENTION ===== */}
      {reportType === "retention" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Pending renewals" value={String(pendingRenewals)} tone={pendingRenewals > 0 ? "amber" : "green"} />
            <KpiCard label="Active memberships" value={String(activeMembers)} tone="green" />
            <KpiCard label="Renewal rate" value={`${(activeMembers / Math.max(1, activeMembers + churnedIds.length) * 100).toFixed(0)}%`} tone={activeMembers / Math.max(1, activeMembers + churnedIds.length) > 0.7 ? "green" : "amber"} />
            <KpiCard label="Churn rate" value={`${churnRate.toFixed(1)}%`} tone={churnRate > 20 ? "red" : "amber"} />
          </div>

          <ChartCard title="Renewals vs Churn" sub="Active vs expired by month">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={renewalTrend} barSize={20} barGap={4}>
                <CartesianGrid {...gridStyle} vertical={false} />
                <XAxis dataKey="month" tick={chartStyle} axisLine={false} tickLine={false} />
                <YAxis tick={chartStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CntTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="renewed" name="Active / renewed" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="expired" name="Expired / churned" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Pending renewals" sub={`${pendingList.length} members with no active plan`}>
            {pendingList.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "32px 0" }}>All renewed 🎉</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {pendingList.map((m) => {
                  const daysAgo = Math.floor((Date.now() - new Date(m.end_date).getTime()) / 86400000);
                  return (
                    <div key={m.member_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                      <Avatar name={m.full_name} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.full_name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{m.plan_name ?? "—"} · {m.phone ?? "No phone"}</div>
                      </div>
                      <span className={`ps-badge ${daysAgo > 30 ? "ps-badge--red" : "ps-badge--amber"}`} style={{ fontSize: 12 }}>{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
                      <Link href={`/dashboard/members/${m.member_id}`} className="ps-btn ps-btn--tinted ps-btn--sm" style={{ flexShrink: 0 }}>Renew</Link>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {/* ===== GOALS ===== */}
      {reportType === "goals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Members with goals" value={String(goalStats.total)} icon={<Target size={16} />} />
            <KpiCard label="On track (within 5%)" value={String(goalStats.achieved)} tone="green" />
            <KpiCard label="Goal achievement rate" value={`${goalStats.rate.toFixed(0)}%`} tone={goalStats.rate > 70 ? "green" : goalStats.rate > 40 ? "amber" : "red"} />
            <KpiCard label="No goal set" value={String(members.filter((m) => !m.primary_goal).length)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title="Goal distribution" sub="What members want to achieve">
              {goalDist.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No goal data</div> : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={goalDist} dataKey="value" cx="50%" cy="50%" outerRadius={76} innerRadius={40} paddingAngle={3}>
                        {goalDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {goalDist.map((g, i) => (
                      <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <div style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ flex: 1, color: "var(--text-secondary)" }}>{g.name}</span>
                        <span style={{ fontWeight: 600 }}>{g.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>

            <ChartCard title="Weight progress" sub="Members by progress toward target">
              {members.filter((m) => m.weight_kg && m.target_weight_kg).length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No weight data recorded</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                  {members.filter((m) => m.weight_kg && m.target_weight_kg).map((m) => {
                    const progress = Math.min(100, Math.max(0, 100 - Math.abs((m.weight_kg! - m.target_weight_kg!) / m.target_weight_kg!) * 100));
                    const onTrack = progress >= 95;
                    return (
                      <div key={m.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{m.full_name}</span>
                          <span style={{ fontSize: 12, color: onTrack ? "var(--green)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                            {m.weight_kg}kg → {m.target_weight_kg}kg
                          </span>
                        </div>
                        <div style={{ height: 5, background: "var(--fill-2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${progress}%`, background: onTrack ? "var(--green-fill)" : ACCENT, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>
          </div>

          {/* Radar — goal breakdown by count */}
          {goalDist.length >= 3 && (
            <ChartCard title="Goal radar" sub="Distribution of member fitness goals">
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={goalDist}>
                  <PolarGrid stroke="var(--separator)" />
                  <PolarAngleAxis dataKey="name" tick={chartStyle} />
                  <Radar name="Members" dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.2} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {/* ===== CLASSES ===== */}
      {reportType === "classes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px,1fr))", gap: 10 }}>
            <KpiCard label="Active classes" value={String(classes.length)} icon={<Calendar size={16} />} />
            <KpiCard label="Total bookings" value={String(classBookings.length)} />
            <KpiCard label="Avg occupancy" value={classOccupancy.length > 0 ? `${Math.round(classOccupancy.reduce((s, c) => s + c.occupancy, 0) / classOccupancy.length)}%` : "0%"} tone="blue" />
            <KpiCard label="Full classes" value={String(classOccupancy.filter((c) => c.occupancy >= 90).length)} tone={classOccupancy.filter((c) => c.occupancy >= 90).length > 0 ? "green" : undefined} />
          </div>

          <ChartCard title="Class occupancy" sub="Bookings vs capacity per class">
            {classOccupancy.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "48px 0" }}>No classes yet</div> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={classOccupancy} layout="vertical" barSize={16} barGap={2}>
                  <CartesianGrid {...gridStyle} horizontal={false} />
                  <XAxis type="number" tick={chartStyle} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={chartStyle} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="occupancy" name="Occupancy %" radius={[0, 5, 5, 0]}>
                    {classOccupancy.map((c, i) => <Cell key={i} fill={c.occupancy >= 90 ? COLORS[1] : c.occupancy >= 60 ? ACCENT : COLORS[2]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Class details">
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {classOccupancy.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: "32px 0" }}>No classes</div> : classOccupancy.map((c) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--separator)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>{c.day} · {c.booked} of {c.capacity} booked</div>
                    <div style={{ height: 4, background: "var(--fill-2)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                      <div style={{ height: "100%", width: `${c.occupancy}%`, background: c.occupancy >= 90 ? "var(--green-fill)" : ACCENT, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span className={`ps-badge ${c.occupancy >= 90 ? "ps-badge--green" : c.occupancy >= 60 ? "" : "ps-badge--amber"}`} style={{ fontSize: 12, flexShrink: 0 }}>
                    {c.occupancy}%
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      )}

      </>)}

      {/* ===== Widget editor sheet ===== */}
      {showWidgetEditor && (
        <div className="ps-sheet-root" data-open="true" onClick={() => setShowWidgetEditor(false)}>
          <div className="ps-sheet-backdrop" />
          <div className="ps-sheet" style={{ "--sheet-w": "380px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
              <div className="ps-sheet-titlebar">
                <div>
                  <div className="ps-sheet-title">Customize dashboard</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Choose which KPIs to show on Overview</div>
                </div>
                <button className="ps-icon-btn" onClick={() => setShowWidgetEditor(false)}><X size={18} /></button>
              </div>
            </div>
            <div className="ps-sheet-body" style={{ padding: "12px 20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {widgets.map((w) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                    <GripVertical size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>{w.label}</span>
                    <button type="button" className="ps-icon-btn" onClick={() => toggleWidget(w.id)}
                      style={{ color: w.visible ? "var(--accent)" : "var(--text-tertiary)" }}
                      aria-label={w.visible ? "Hide" : "Show"}>
                      {w.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="ps-sheet-footer">
              <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setWidgets(DEFAULT_WIDGETS)}>Reset</button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={() => setShowWidgetEditor(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
