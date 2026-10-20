"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  UserPlus, Wallet, UserCheck, BarChart2, ArrowUpRight, ArrowDownRight, Clock, Check,
  ChevronRight, Plus, Users, IndianRupee, CalendarDays, SlidersHorizontal,
  Sparkles, Activity, RotateCcw, AlertTriangle,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { formatINR, Skeleton, Avatar } from "./components/ui";
import { Sheet } from "./components/Sheet";
import { DesignStyles } from "./components/DesignSystem";
import { useRole } from "./components/useRole";

/* ───────────────────────── Types ───────────────────────── */

type Stats = {
  activeMembers: number; activeChange: number | null;
  revenueThisMonth: number; revenueChange: number | null;
  checkinsToday: number; expiringThisWeek: number;
  newMembersThisMonth: number; openLeads: number;
};
type Point = { label: string; value: number };
type ExpiringRow = { id: string; end_date: string; members: { id: string; full_name: string } | null; membership_plans: { name: string } | null };
type PaymentRow = { id: string; total_paise: number; paid_at: string; method: string | null; members: { id: string; full_name: string } | null };
type VisitRow = { id: string; check_in_at: string; check_out_at: string | null; members: { id: string; full_name: string } | null };
type ClassRow = { id: string; name: string; trainer_name: string | null; start_time: string; duration_mins: number; color: string | null };

type WidgetId = "kpis" | "revenue" | "today" | "checkins" | "expiring" | "payments" | "classes" | "activity" | "actions" | "setup";

const WIDGETS: { id: WidgetId; label: string; sub: string }[] = [
  { id: "kpis", label: "Key metrics", sub: "Revenue, members, leads, renewals" },
  { id: "revenue", label: "Revenue trend", sub: "Last 6 months" },
  { id: "today", label: "Today's turnout", sub: "Check-ins vs active members" },
  { id: "checkins", label: "Weekly check-ins", sub: "Last 7 days" },
  { id: "expiring", label: "Expiring soon", sub: "Renewals due this week" },
  { id: "payments", label: "Recent payments", sub: "Latest 5 transactions" },
  { id: "classes", label: "Today's classes", sub: "Schedule for today" },
  { id: "activity", label: "Live activity", sub: "Recent check-ins" },
  { id: "actions", label: "Quick actions", sub: "Shortcuts to common tasks" },
  { id: "setup", label: "Setup checklist", sub: "Shown until setup is complete" },
];
const DEFAULT_LAYOUT: Record<WidgetId, boolean> = Object.fromEntries(WIDGETS.map((w) => [w.id, true])) as Record<WidgetId, boolean>;
const STORAGE_KEY = "psync.dashboard.widgets.v1";

const QUICK_ACTIONS = [
  { label: "Add member", sub: "Register someone new", href: "/dashboard/members/new", icon: UserPlus, tone: "blue" },
  { label: "Record payment", sub: "Cash, UPI or card", href: "/dashboard/payments", icon: Wallet, tone: "green" },
  { label: "Check in", sub: "Manual attendance", href: "/dashboard/attendance", icon: UserCheck, tone: "purple" },
  { label: "Reports", sub: "Revenue and retention", href: "/dashboard/reports", icon: BarChart2, tone: "amber" },
] as const;

const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", online: "Online" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const supabase = createClient();

/* ───────────────────────── Helpers ───────────────────────── */

const pct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortINR = (paise: number) => {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(r >= 1e4 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
};
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

function Spark({ data, color, id }: { data: Point[]; color: string; id: string }) {
  if (!data.length) return null;
  return (
    <div className="db-spark" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#sp-${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Kpi({ tone, icon: Icon, label, value, foot, spark, href }: {
  tone: string; icon: React.ElementType; label: string; value: React.ReactNode; foot: React.ReactNode;
  spark?: { data: Point[]; color: string }; href: string;
}) {
  return (
    <Link href={href} className={`db-card db-kpi db-tone-${tone}`}>
      <div className="db-kpi-head">
        <span className="db-chip"><Icon size={16} strokeWidth={2.3} /></span>
        <span className="db-kpi-label">{label}</span>
      </div>
      <div className="db-kpi-value">{value}</div>
      <div className="db-kpi-foot">{foot}</div>
      {spark && <Spark data={spark.data} color={spark.color} id={tone} />}
    </Link>
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
  return (
    <div className="db-tip">
      <div className="db-tip-label">{label}</div>
      <div className="db-tip-value">{money ? formatINR(payload[0].value) : `${payload[0].value} check-ins`}</div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function DashboardPage() {
  const roleData = useRole();
  // Default to "nothing visible" while role is still resolving, so a staff
  // member never sees a flash of owner-level widgets before permissions load.
  const perm = roleData.loading ? null : roleData.permissions;
  const isManager = !roleData.loading && (roleData.staff_role === "owner" || roleData.staff_role === "manager");

  const [stats, setStats] = useState<Stats | null>(null);
  const [revenue, setRevenue] = useState<Point[]>([]);
  const [week, setWeek] = useState<Point[]>([]);
  const [expiring, setExpiring] = useState<ExpiringRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [visits, setVisits] = useState<VisitRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [checklist, setChecklist] = useState({ hasPlan: false, hasMember: false, hasBranch: false });
  const [orgName, setOrgName] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");
  const [dateLabel, setDateLabel] = useState("");
  const [todayName, setTodayName] = useState("");
  const [layout, setLayout] = useState<Record<WidgetId, boolean>>(DEFAULT_LAYOUT);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Greeting + saved layout (client only)
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setDateLabel(now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }));
    setTodayName(DAYS[now.getDay()]);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLayout({ ...DEFAULT_LAYOUT, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  }, []);

  function toggleWidget(id: WidgetId) {
    setLayout((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  function resetLayout() {
    setLayout(DEFAULT_LAYOUT);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      const oid = roleData.org_id;

      const now = new Date();
      const today = isoDay(now);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const in7 = isoDay(new Date(Date.now() + 7 * 86400000));
      const dayName = DAYS[now.getDay()];

      const [
        org, active, lastActive, pay6m, visits7d, expCount, newMembers, newMembersLast, leads,
        plans, membersAll, branches, expList, payList, visitList, classList,
      ] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", oid).single(),
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active"),
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid)
          .lte("start_date", isoDay(lastMonthEnd)).gte("end_date", isoDay(lastMonthStart)),
        supabase.from("payments").select("total_paise, paid_at").eq("org_id", oid).gte("paid_at", sixMonthsStart.toISOString()),
        supabase.from("attendance_logs").select("check_in_at").eq("org_id", oid).gte("check_in_at", weekStart.toISOString()),
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active").gte("end_date", today).lte("end_date", in7),
        supabase.from("members").select("*", { count: "exact", head: true }).eq("org_id", oid).gte("created_at", thisMonthStart.toISOString()),
        supabase.from("members").select("*", { count: "exact", head: true }).eq("org_id", oid).gte("created_at", lastMonthStart.toISOString()).lt("created_at", thisMonthStart.toISOString()),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", oid).not("status", "in", "(converted,lost)"),
        supabase.from("membership_plans").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("is_active", true),
        supabase.from("members").select("*", { count: "exact", head: true }).eq("org_id", oid),
        supabase.from("branches").select("*", { count: "exact", head: true }).eq("org_id", oid),
        supabase.from("memberships").select("id, end_date, members(id, full_name), membership_plans(name)")
          .eq("org_id", oid).eq("status", "active").gte("end_date", today).lte("end_date", in7).order("end_date").limit(5),
        supabase.from("payments").select("id, total_paise, paid_at, method, members(id, full_name)")
          .eq("org_id", oid).order("paid_at", { ascending: false }).limit(5),
        supabase.from("attendance_logs").select("id, check_in_at, check_out_at, members(id, full_name)")
          .eq("org_id", oid).order("check_in_at", { ascending: false }).limit(6),
        supabase.from("classes").select("id, name, trainer_name, start_time, duration_mins, color")
          .eq("org_id", oid).eq("is_active", true).eq("schedule_day", dayName).order("start_time"),
      ]);

      if (org.data) setOrgName(org.data.name);

      // Revenue: bucket into last 6 months
      const months: Point[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), value: 0 });
      }
      (pay6m.data || []).forEach((p: { total_paise: number; paid_at: string }) => {
        const d = new Date(p.paid_at);
        const idx = 5 - ((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
        if (idx >= 0 && idx < 6) months[idx].value += p.total_paise;
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

      const revThis = months[5].value, revLast = months[4].value;
      setStats({
        activeMembers: active.count || 0,
        activeChange: pct(active.count || 0, lastActive.count || 0),
        revenueThisMonth: revThis,
        revenueChange: pct(revThis, revLast),
        checkinsToday: days[6].value,
        expiringThisWeek: expCount.count || 0,
        newMembersThisMonth: newMembers.count || 0,
        openLeads: leads.count || 0,
      });
      void newMembersLast;

      setExpiring((expList.data as unknown as ExpiringRow[]) || []);
      setPayments((payList.data as unknown as PaymentRow[]) || []);
      setVisits((visitList.data as unknown as VisitRow[]) || []);
      setClasses((classList.data as ClassRow[]) || []);
      setChecklist({ hasPlan: (plans.count || 0) > 0, hasMember: (membersAll.count || 0) > 0, hasBranch: (branches.count || 0) > 0 });
    }
    load();
  }, []);

  const checklistItems = [
    { label: "Create your first membership plan", done: checklist.hasPlan, href: "/dashboard/membership-plans" },
    { label: "Add your first member", done: checklist.hasMember, href: "/dashboard/members/new" },
    { label: "Set up a branch", done: checklist.hasBranch, href: "/dashboard/settings" },
    { label: "Connect Razorpay for online payments", done: false, href: "/dashboard/settings" },
  ];
  const doneCount = checklistItems.filter((c) => c.done).length;
  // Setup checklist is an owner/manager concern (Razorpay, branches, plans) — never shown to other roles.
  const showSetup = isManager && layout.setup && stats !== null && doneCount < checklistItems.length;

  const turnout = stats && stats.activeMembers > 0 ? Math.min(100, (stats.checkinsToday / stats.activeMembers) * 100) : 0;
  const revenueTotal6m = useMemo(() => revenue.reduce((s, p) => s + p.value, 0), [revenue]);
  const weekTotal = useMemo(() => week.reduce((s, p) => s + p.value, 0), [week]);

  // Each widget's permission requirement. true = every role may see it (classes has no dedicated gate here beyond its own permission).
  const canSee: Record<WidgetId, boolean> = {
    kpis: true, // the row itself is a container; individual cards below gate themselves
    revenue: !!perm?.reports,
    today: !!perm?.attendance,
    checkins: !!perm?.attendance,
    expiring: !!perm?.membership_plans,
    payments: !!perm?.payments,
    classes: !!perm?.classes,
    activity: !!perm?.attendance,
    actions: true, // filtered item-by-item below
    setup: isManager,
  };

  const effective: Record<WidgetId, boolean> = Object.fromEntries(
    WIDGETS.map((w) => [w.id, layout[w.id] && canSee[w.id]])
  ) as Record<WidgetId, boolean>;

  const FLOW: React.CSSProperties = { gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" };
  const hiddenCount = WIDGETS.filter((w) => !effective[w.id]).length;

  const showRow2 = effective.revenue;
  const todayInRow3 = !effective.revenue && effective.today;
  const showRow3 = todayInRow3 || effective.checkins || effective.expiring || effective.payments;
  const visibleActions = QUICK_ACTIONS.filter((a) => {
    if (a.href.includes("/members")) return !!perm?.members;
    if (a.href.includes("/payments")) return !!perm?.payments;
    if (a.href.includes("/attendance")) return !!perm?.attendance;
    if (a.href.includes("/reports")) return !!perm?.reports;
    return true;
  });
  const showRow4 = effective.actions && visibleActions.length > 0 || effective.classes || effective.activity;


  const renderToday = (cls: string) => (
    <section className={`db-hero ${cls}`} aria-label="Today's check-ins"
            >
              <div className="db-hero-glow" aria-hidden />
              <div className="db-hero-top">
                <span className="db-hero-label"><Activity size={14} /> Today</span>
                <span className="db-live"><span className="db-live-dot" />Live</span>
              </div>
              <div className="db-hero-body">
                <Ring pct={turnout} />
                <div style={{ minWidth: 0 }}>
                  <div className="db-hero-value">{stats ? stats.checkinsToday : "–"}</div>
                  <div className="db-hero-sub">
                    {!stats ? "\u00a0" : stats.activeMembers > 0
                      ? `check-ins of ${stats.activeMembers} active member${stats.activeMembers === 1 ? "" : "s"}`
                      : "No active members yet"}
                  </div>
                </div>
              </div>
              <Link href="/dashboard/attendance" className="db-hero-btn">
                <UserCheck size={15} strokeWidth={2.4} /> Check someone in
              </Link>
            </section>
  );

  return (
    <div className="ps-page db">
      <DesignStyles />

      {/* Header */}
      <header className="db-header db-in">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">{dateLabel || "\u00a0"}</div>
          <h1 className="db-title">{greeting}</h1>
          <p className="db-subtitle">
            {orgName ? <>Here&apos;s how <strong>{orgName}</strong> is doing today.</> : "Here's how your gym is doing today."}
          </p>
        </div>
        <div className="db-header-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setCustomizeOpen(true)}>
            <SlidersHorizontal size={15} /> <span>Customize</span>
            {hiddenCount > 0 && <span className="db-count">{hiddenCount}</span>}
          </button>
          <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary">
            <Plus size={16} strokeWidth={2.4} /> <span>Add member</span>
          </Link>
        </div>
      </header>

      {/* Expiring banner (urgent, always on top when relevant) */}
      {stats && stats.expiringThisWeek > 0 && canSee.expiring && (
        <Link href="/dashboard/members?filter=expiring" className="db-banner db-in">
          <span className="db-banner-icon"><AlertTriangle size={17} strokeWidth={2.3} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="db-banner-title">{stats.expiringThisWeek} membership{stats.expiringThisWeek === 1 ? "" : "s"} expiring this week</div>
            <div className="db-banner-text">Reach out now — renewals are easiest before the plan lapses.</div>
          </div>
          <span className="db-banner-cta">Review <ChevronRight size={14} /></span>
        </Link>
      )}

      {/* KPI row — each card gated by the permission it actually exposes */}
      {effective.kpis && (!!perm?.reports || !!perm?.members || !!perm?.membership_plans) && (
        <div className="db-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {perm?.reports && (
            <Kpi
              tone="blue" icon={IndianRupee} label="Revenue this month" href="/dashboard/payments"
              value={stats ? formatINR(stats.revenueThisMonth) : <Skeleton w={110} h={30} />}
              foot={stats ? <><Trend value={stats.revenueChange} /> <span>vs last month</span></> : "\u00a0"}
              spark={{ data: revenue, color: "#0071e3" }}
            />
          )}
          {perm?.members && (
            <Kpi
              tone="green" icon={Users} label="Active members" href="/dashboard/members?filter=active"
              value={stats ? stats.activeMembers : <Skeleton w={50} h={30} />}
              foot={stats ? <><Trend value={stats.activeChange} /> <span>vs last month</span></> : "\u00a0"}
            />
          )}
          {perm?.members && (
            <Kpi
              tone="purple" icon={UserPlus} label="New this month" href="/dashboard/members"
              value={stats ? stats.newMembersThisMonth : <Skeleton w={50} h={30} />}
              foot={stats ? <span>{stats.openLeads} open lead{stats.openLeads === 1 ? "" : "s"} in pipeline</span> : "\u00a0"}
            />
          )}
          {perm?.membership_plans && (
            <Kpi
              tone="amber" icon={Clock} label="Renewals due" href="/dashboard/members?filter=expiring"
              value={stats ? stats.expiringThisWeek : <Skeleton w={50} h={30} />}
              foot={<span>Next 7 days</span>}
            />
          )}
        </div>
      )}

      {/* Revenue chart + Today */}
      {showRow2 && (
        <div className="db-grid">
          {effective.revenue && (
            <section className={`db-card db-pad ${effective.today ? "db-span-8" : "db-span-12"}`}>
              <CardHead title="Revenue" sub={revenue.length ? `${formatINR(revenueTotal6m)} collected in the last 6 months` : "Last 6 months"} href="/dashboard/reports" cta="Reports" />
              <div className="db-chart">
                {revenue.length === 0 ? <Skeleton w="100%" h={220} r={12} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenue} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="db-rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0071e3" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#0071e3" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.08)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#8a8a8e" }} />
                      <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 12, fill: "#8a8a8e" }} tickFormatter={shortINR} />
                      <Tooltip content={<ChartTip money />} cursor={{ stroke: "rgba(0,113,227,0.25)", strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="value" stroke="#0071e3" strokeWidth={2.5} fill="url(#db-rev)"
                        activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} animationDuration={600} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          )}

          {effective.today && renderToday("db-span-4")}
        </div>
      )}

      {/* Weekly check-ins + expiring + payments */}
      {showRow3 && (
        <div className="db-grid" style={FLOW}>
          {todayInRow3 && renderToday("")}
          {effective.checkins && (
            <section className="db-card db-pad">
              <CardHead title="Check-ins" sub={week.length ? `${weekTotal} visits in the last 7 days` : "Last 7 days"} href="/dashboard/attendance" />
              <div className="db-chart db-chart--sm">
                {week.length === 0 ? <Skeleton w="100%" h={180} r={12} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={week} margin={{ top: 10, right: 0, left: -24, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(60,60,67,0.08)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8a8a8e" }} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(137,68,171,0.06)" }} />
                      <Bar dataKey="value" radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={500}>
                        {week.map((_, i) => <Cell key={i} fill={i === week.length - 1 ? "#af52de" : "rgba(175,82,222,0.35)"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          )}

          {effective.expiring && (
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
          )}

          {effective.payments && (
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
                      <span className="db-amount">+{formatINR(p.total_paise)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Quick actions + classes + activity */}
      {showRow4 && (
        <div className="db-grid" style={FLOW}>
          {effective.actions && visibleActions.length > 0 && (
            <section className="db-actions-wrap">
              <h2 className="db-section-title">Quick actions</h2>
              <div className="db-actions">
                {visibleActions.map((a) => (
                  <Link key={a.label} href={a.href} className={`db-action db-tone-${a.tone}`}>
                    <span className="db-chip db-chip--lg"><a.icon size={18} strokeWidth={2.2} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="db-action-title">{a.label}</div>
                      <div className="db-action-sub">{a.sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {effective.classes && (
            <section className="db-card db-pad">
              <CardHead title="Today's classes" sub={todayName || "\u00a0"} href="/dashboard/classes" />
              {classes === null ? <RowsSkeleton n={3} /> : classes.length === 0 ? (
                <Empty icon={CalendarDays} title="No classes today" text="Scheduled classes for today will appear here." />
              ) : (
                <div className="db-rows">
                  {classes.slice(0, 5).map((c) => (
                    <div key={c.id} className="db-row">
                      <span className="db-class-bar" style={{ background: c.color || "#0071e3" }} />
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
          )}

          {effective.activity && (
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
          )}
        </div>
      )}

      {/* Setup checklist */}
      {showSetup && (
        <section className="db-card db-pad db-setup">
          <div className="db-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span className="db-chip db-tone-blue db-chip--lg"><Sparkles size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <h2 className="db-card-title">Finish setting up</h2>
                <div className="db-card-sub">{doneCount} of {checklistItems.length} done — you&apos;re almost there</div>
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
      )}

      {/* Empty state when everything is hidden */}
      {hiddenCount === WIDGETS.filter((w) => canSee[w.id]).length && (
        <div className="db-card db-pad">
          <Empty icon={SlidersHorizontal} title="Your dashboard is empty" text="Turn widgets back on from Customize." />
        </div>
      )}

      {/* Customize sheet */}
      <Sheet
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize dashboard"
        description="Choose which widgets appear. Saved on this device."
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--plain" onClick={resetLayout}><RotateCcw size={14} /> Reset</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={() => setCustomizeOpen(false)}>Done</button>
          </>
        }
      >
        <div className="db-toggles">
          {WIDGETS.filter((w) => canSee[w.id]).map((w) => (
            <label key={w.id} className="db-toggle">
              <div style={{ minWidth: 0 }}>
                <div className="db-toggle-title">{w.label}</div>
                <div className="db-toggle-sub">{w.sub}</div>
              </div>
              <input type="checkbox" className="db-switch" checked={layout[w.id]} onChange={() => toggleWidget(w.id)} />
            </label>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
