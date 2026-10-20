"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  UserPlus, Wallet, UserCheck, BarChart2,
  ArrowUpRight, ArrowDownRight, Clock, Check, ChevronRight, Plus,
} from "lucide-react";
import { formatINR, Tile, Skeleton } from "./dashboard/components/ui";

type DashboardStats = {
  activeMembers: number;
  activeMembersChange: number;
  hadMembersLastMonth: boolean;
  revenueThisMonth: number;
  revenueChange: number;
  hadRevenueLastMonth: boolean;
  checkinsToday: number;
  expiringThisWeek: number;
};

const supabase = createClient();

const QUICK_ACTIONS = [
  { label: "Add member", sub: "Register someone new", href: "/dashboard/members/new", icon: UserPlus },
  { label: "Record payment", sub: "Cash, UPI or card", href: "/dashboard/payments", icon: Wallet },
  { label: "Check someone in", sub: "Manual attendance", href: "/dashboard/attendance", icon: UserCheck },
  { label: "View reports", sub: "Revenue and retention", href: "/dashboard/reports", icon: BarChart2 },
];

/* Apple Fitness–style ring: today's check-ins as a share of active members */
function TurnoutRing({ pct }: { pct: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  return (
    <div className="ps-ring" aria-hidden>
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <defs>
          <linearGradient id="ps-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5fe382" />
            <stop offset="100%" stopColor="#1fae4a" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(52,199,89,0.16)" strokeWidth="13" />
        <circle
          className="ps-ring-progress"
          cx="60" cy="60" r={r}
          fill="none" stroke="url(#ps-ring-grad)" strokeWidth="13" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ opacity: pct > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="ps-ring-center">
        <div>
          <div className="ps-ring-value">{Math.round(pct)}%</div>
          <div className="ps-ring-caption">turnout</div>
        </div>
      </div>
    </div>
  );
}

function Trend({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`ps-trend ${up ? "ps-trend--up" : "ps-trend--down"}`}>
      <Icon size={13} strokeWidth={2.6} />
      {Math.abs(value)}%
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orgName, setOrgName] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");
  const [dateLabel, setDateLabel] = useState("");
  const [checklist, setChecklist] = useState({ hasPlan: false, hasMember: false, hasBranch: false });

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
    setDateLabel(now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      const oid = roleData.org_id;

      const { data: orgData } = await supabase.from("organizations").select("name").eq("id", oid).single();
      if (orgData) setOrgName(orgData.name);

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      const todayStr = now.toISOString().split("T")[0];
      const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

      const [
        { count: activeMembers },
        { count: lastMonthActive },
        { data: revThis },
        { data: revLast },
        { count: checkinsToday },
        { count: expiringThisWeek },
        { count: plansCount },
        { count: membersCount },
        { count: branchCount },
      ] = await Promise.all([
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active"),
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active").lte("start_date", lastMonthEnd).gte("end_date", lastMonthStart),
        supabase.from("payments").select("total_paise").eq("org_id", oid).gte("paid_at", thisMonthStart),
        supabase.from("payments").select("total_paise").eq("org_id", oid).gte("paid_at", lastMonthStart).lte("paid_at", lastMonthEnd),
        supabase.from("attendance_logs").select("*", { count: "exact", head: true }).eq("org_id", oid).gte("check_in_at", `${todayStr}T00:00:00`),
        supabase.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("status", "active").lte("end_date", in7Days).gte("end_date", todayStr),
        supabase.from("membership_plans").select("*", { count: "exact", head: true }).eq("org_id", oid).eq("is_active", true),
        supabase.from("members").select("*", { count: "exact", head: true }).eq("org_id", oid),
        supabase.from("branches").select("*", { count: "exact", head: true }).eq("org_id", oid),
      ]);

      const sum = (d: { total_paise: number }[] | null) => (d || []).reduce((s, p) => s + p.total_paise, 0);
      const revenueThisMonth = sum(revThis);
      const revenueLastMonth = sum(revLast);
      const lastActive = lastMonthActive || 0;

      setStats({
        activeMembers: activeMembers || 0,
        activeMembersChange: lastActive > 0 ? Math.round((((activeMembers || 0) - lastActive) / lastActive) * 100) : 0,
        hadMembersLastMonth: lastActive > 0,
        revenueThisMonth,
        revenueChange: revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0,
        hadRevenueLastMonth: revenueLastMonth > 0,
        checkinsToday: checkinsToday || 0,
        expiringThisWeek: expiringThisWeek || 0,
      });
      setChecklist({ hasPlan: (plansCount || 0) > 0, hasMember: (membersCount || 0) > 0, hasBranch: (branchCount || 0) > 0 });
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
  const showSetup = stats !== null && doneCount < checklistItems.length;

  const turnout = stats && stats.activeMembers > 0 ? Math.min(100, (stats.checkinsToday / stats.activeMembers) * 100) : 0;

  return (
    <div className="ps-page">
      {/* Header */}
      <header className="ps-header">
        <div className="ps-header-text">
          <div className="ps-kicker">{dateLabel || "\u00a0"}</div>
          <h1 className="ps-title">{greeting}</h1>
          <p className="ps-subtitle ps-truncate">
            {orgName ? `Here's how ${orgName} is doing today.` : "Here's how your gym is doing today."}
          </p>
        </div>
        <div className="ps-header-actions ps-hide-sm">
          <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary">
            <Plus size={16} strokeWidth={2.4} /> Add member
          </Link>
        </div>
      </header>

      {/* Today + key numbers */}
      <div className="ps-dash-top">
        <section className="ps-card ps-today" aria-label="Today's check-ins">
          <TurnoutRing pct={turnout} />
          <div className="ps-today-body">
            <div className="ps-stat-label">Today&apos;s check-ins</div>
            <div className="ps-today-value">{stats ? stats.checkinsToday : <Skeleton w={56} h={40} r={10} />}</div>
            <div className="ps-today-sub">
              {!stats
                ? "\u00a0"
                : stats.activeMembers > 0
                  ? `of ${stats.activeMembers} active member${stats.activeMembers === 1 ? "" : "s"}`
                  : "No active members yet"}
            </div>
            <Link href="/dashboard/attendance" className="ps-btn ps-btn--tinted ps-btn--sm">
              <UserCheck size={14} strokeWidth={2.4} /> Check in
            </Link>
          </div>
        </section>

        <section className="ps-card ps-stat">
          <div className="ps-stat-head">
            <span className="ps-stat-label">Revenue this month</span>
          </div>
          <div className="ps-stat-value">{stats ? formatINR(stats.revenueThisMonth) : <Skeleton w={110} h={30} />}</div>
          <div className="ps-stat-foot">
            {stats?.hadRevenueLastMonth ? (
              <>
                <Trend value={stats.revenueChange} /> vs last month
              </>
            ) : (
              "Membership payments"
            )}
          </div>
        </section>

        <section className="ps-card ps-stat">
          <div className="ps-stat-head">
            <span className="ps-stat-label">Active members</span>
          </div>
          <div className="ps-stat-value">{stats ? stats.activeMembers : <Skeleton w={48} h={30} />}</div>
          <div className="ps-stat-foot">
            {stats?.hadMembersLastMonth ? (
              <>
                <Trend value={stats.activeMembersChange} /> vs last month
              </>
            ) : (
              "Across all branches"
            )}
          </div>
        </section>
      </div>

      {/* Quick actions + attention */}
      <div className="ps-dash-grid ps-section">
        <section>
          <div className="ps-section-head">
            <h2 className="ps-section-title">Quick actions</h2>
          </div>
          <div className="ps-actions">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.label} href={a.href} className="ps-action">
                <Tile icon={a.icon} size="lg" />
                <div className="ps-action-text">
                  <div className="ps-action-title">{a.label}</div>
                  <div className="ps-action-sub">{a.sub}</div>
                </div>
                <ChevronRight size={16} className="ps-chevron" />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="ps-section-head">
            <h2 className="ps-section-title">Needs attention</h2>
          </div>
          <div className="ps-card">
            {!stats ? (
              <div className="ps-attention">
                <Skeleton w={44} h={44} r={13} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton w="70%" h={14} />
                  <Skeleton w="50%" h={12} />
                </div>
              </div>
            ) : stats.expiringThisWeek > 0 ? (
              <Link href="/dashboard/members" className="ps-attention">
                <Tile icon={Clock} tone="amber" size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ps-action-title">
                    {stats.expiringThisWeek} membership{stats.expiringThisWeek === 1 ? "" : "s"} expiring this week
                  </div>
                  <div className="ps-action-sub">Remind them to renew before they lapse.</div>
                </div>
                <ChevronRight size={16} className="ps-chevron" />
              </Link>
            ) : (
              <div className="ps-attention">
                <Tile icon={Check} tone="green" size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ps-action-title">You&apos;re all caught up</div>
                  <div className="ps-action-sub">No memberships expire in the next 7 days.</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Setup checklist */}
      {showSetup && (
        <section className="ps-section">
          <div className="ps-section-head">
            <h2 className="ps-section-title">Finish setting up</h2>
            <span className="ps-section-meta">
              {doneCount} of {checklistItems.length} done
            </span>
          </div>
          <div className="ps-list">
            <div className="ps-progress" style={{ borderRadius: 0, height: 3 }}>
              <span style={{ transform: `scaleX(${doneCount / checklistItems.length})` }} />
            </div>
            {checklistItems.map((item) => {
              const content = (
                <>
                  <span
                    className="ps-checkdot"
                    style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      display: "grid", placeItems: "center",
                      background: item.done ? "var(--green-fill)" : "transparent",
                      boxShadow: item.done ? "none" : "inset 0 0 0 1.5px var(--border-strong)",
                      color: "#fff",
                    }}
                  >
                    {item.done && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span
                    className="ps-cell"
                    style={{
                      color: item.done ? "var(--text-tertiary)" : "var(--text-primary)",
                      fontWeight: item.done ? 400 : 500,
                      fontSize: 14.5,
                    }}
                  >
                    {item.label}
                  </span>
                  {item.done ? <span /> : <ChevronRight size={16} className="ps-chevron" />}
                </>
              );
              const style = { "--cols": "22px minmax(0,1fr) 16px", "--cols-sm": "22px minmax(0,1fr) 16px", "--inset": "58px", "--inset-sm": "54px", minHeight: 54 } as React.CSSProperties;
              return item.done ? (
                <div key={item.label} className="ps-row" style={style}>{content}</div>
              ) : (
                <Link key={item.label} href={item.href} className="ps-row ps-row--link" style={style}>
                  {content}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
