"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw, Users, Search, Download, Calendar, Clock,
  MessageSquare, ChevronRight, ArrowUpDown, Check, AlertTriangle,
  IndianRupee, ArrowLeft, Filter, Phone, CheckCircle2, X, Plus, Loader2
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatINR, Avatar, Skeleton, useToast } from "../components/ui";
import { RenewalSheet } from "../members/components/RenewalSheet";

const supabase = createClient();

function WhatsAppIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.05 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

type MemberData = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
  outstanding_balance_paise: number | null;
  status: string | null;
};

type PlanData = {
  id: string;
  name: string;
  duration_days: number | null;
  price_paise: number;
  plan_type?: string;
};

type RenewalItem = {
  id: string; // membership id
  member_id: string;
  member: MemberData;
  plan_id: string | null;
  plan: PlanData | null;
  start_date: string | null;
  end_date: string;
  days_left: number;
  price_paise: number;
  dues_paise: number;
  status: string;
};

type RangeFilter = "7" | "15" | "30" | "expired" | "all";
type SortKey = "soonest" | "amount_desc" | "amount_asc" | "name";

export default function RenewalsPage() {
  const { toast, show } = useToast();
  const [orgId, setOrgId] = useState("");
  const [gymName, setGymName] = useState("Gym");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RenewalItem[]>([]);
  const [range, setRange] = useState<RangeFilter>("30");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("soonest");
  const [renewTarget, setRenewTarget] = useState<RenewalItem | null>(null);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  async function handleQuickStatusChange(item: RenewalItem, newStatus: "active" | "inactive") {
    setChangingStatusId(item.id);
    try {
      if (newStatus === "inactive") {
        await Promise.all([
          supabase.from("members").update({ status: "inactive" }).eq("id", item.member_id),
          supabase.from("memberships").update({ status: "expired" }).eq("id", item.id),
        ]);
        show(`${item.member.full_name} marked as Inactive`);
      } else {
        const today = new Date();
        const end = new Date(today);
        end.setDate(end.getDate() + (item.plan?.duration_days || 30));
        const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        await Promise.all([
          supabase.from("members").update({ status: "active" }).eq("id", item.member_id),
          supabase.from("memberships").update({ status: "active", end_date: iso(end) }).eq("id", item.id),
        ]);
        show(`${item.member.full_name} marked as Active`);
      }
      await loadData();
    } catch (err: any) {
      show("Could not update status: " + (err?.message || "Unknown error"), "error");
    } finally {
      setChangingStatusId(null);
    }
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: role } = await supabase
        .from("user_roles")
        .select("org_id, organizations(name)")
        .eq("user_id", user.id)
        .single();

      if (!role) return;
      const oid = role.org_id;
      setOrgId(oid);
      if ((role as any).organizations?.name) {
        setGymName((role as any).organizations.name);
      }

      // Query memberships with member & plan details
      const { data, error } = await supabase
        .from("memberships")
        .select(`
          id,
          start_date,
          end_date,
          status,
          member_id,
          plan_id,
          members (
            id,
            full_name,
            phone,
            email,
            sex,
            outstanding_balance_paise,
            status
          ),
          membership_plans (
            id,
            name,
            duration_days,
            price_paise,
            plan_type
          )
        `)
        .eq("org_id", oid)
        .not("end_date", "is", null)
        .order("end_date", { ascending: true });

      if (error) throw error;

      if (data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Keep the latest membership per member to avoid duplicates
        const latestByMember = new Map<string, any>();
        data.forEach((row: any) => {
          if (!row.members?.id || !row.end_date) return;
          const existing = latestByMember.get(row.members.id);
          if (!existing || new Date(row.end_date) > new Date(existing.end_date)) {
            latestByMember.set(row.members.id, row);
          }
        });

        const list: RenewalItem[] = Array.from(latestByMember.values()).map((row: any) => {
          const endDate = new Date(row.end_date);
          endDate.setHours(0, 0, 0, 0);
          const diffMs = endDate.getTime() - today.getTime();
          const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
          const pricePaise = Number(row.membership_plans?.price_paise || 0);
          const duesPaise = Math.max(0, Number(row.members?.outstanding_balance_paise || 0));

          return {
            id: row.id,
            member_id: row.members.id,
            member: row.members,
            plan_id: row.plan_id ?? row.membership_plans?.id ?? null,
            plan: row.membership_plans,
            start_date: row.start_date,
            end_date: row.end_date,
            days_left: daysLeft,
            price_paise: pricePaise,
            dues_paise: duesPaise,
            status: row.status,
          };
        });

        setItems(list);
      }
    } catch (err: any) {
      console.error("Failed to load renewals:", err);
      show(err.message || "Failed to load renewals data", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Distinct plans for filter dropdown
  const plans = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.plan?.name) set.add(item.plan.name);
    });
    return Array.from(set).sort();
  }, [items]);

  // Aggregate stats
  const stats = useMemo(() => {
    let due7Count = 0;
    let due7Amount = 0;

    let due30Count = 0;
    let due30Amount = 0;

    let expiredCount = 0;
    let expiredAmount = 0;

    items.forEach((item) => {
      // Due in 7 days
      if (item.days_left >= 0 && item.days_left <= 7) {
        due7Count++;
        due7Amount += item.price_paise;
      }
      // Due in 30 days
      if (item.days_left >= 0 && item.days_left <= 30) {
        due30Count++;
        due30Amount += item.price_paise;
      }
      // Expired in past 30 days
      if (item.days_left < 0 && item.days_left >= -30) {
        expiredCount++;
        expiredAmount += item.price_paise;
      }
    });

    return {
      due7Count,
      due7Amount,
      due30Count,
      due30Amount,
      expiredCount,
      expiredAmount,
    };
  }, [items]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return items.filter((item) => {
      // Range filter
      if (range === "7" && (item.days_left < 0 || item.days_left > 7)) return false;
      if (range === "15" && (item.days_left < 0 || item.days_left > 15)) return false;
      if (range === "30" && (item.days_left < 0 || item.days_left > 30)) return false;
      if (range === "expired" && (item.days_left >= 0 || item.days_left < -60)) return false;

      // Plan filter
      if (planFilter !== "all" && item.plan?.name !== planFilter) return false;

      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const nameMatch = item.member.full_name?.toLowerCase().includes(q);
        const phoneMatch = item.member.phone?.toLowerCase().includes(q);
        const emailMatch = item.member.email?.toLowerCase().includes(q);
        const planMatch = item.plan?.name?.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !emailMatch && !planMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sort === "soonest") return a.days_left - b.days_left;
      if (sort === "amount_desc") return b.price_paise - a.price_paise;
      if (sort === "amount_asc") return a.price_paise - b.price_paise;
      if (sort === "name") return (a.member.full_name || "").localeCompare(b.member.full_name || "");
      return 0;
    });
  }, [items, range, planFilter, search, sort]);

  function getWaLink(item: RenewalItem) {
    if (!item.member.phone) return null;
    const phoneDigits = item.member.phone.replace(/\D/g, "");
    const phone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
    const dateFormatted = new Date(item.end_date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const priceFormatted = formatINR(item.price_paise);
    const planName = item.plan?.name || "gym";

    const text = `Hi ${item.member.full_name}, this is a friendly reminder from ${gymName}. Your ${planName} membership is due for renewal on ${dateFormatted} (Renewal amount: ${priceFormatted}). Would you like to renew today so your workout access continues smoothly?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  function exportCSV() {
    if (filteredRows.length === 0) return;
    const headers = [
      "Member Name",
      "Phone",
      "Email",
      "Current Plan",
      "Renewal Amount (INR)",
      "Outstanding Dues (INR)",
      "Expiry Date",
      "Days Left",
      "Status",
    ];

    const lines = filteredRows.map((r) => [
      `"${r.member.full_name || ""}"`,
      `"${r.member.phone || ""}"`,
      `"${r.member.email || ""}"`,
      `"${r.plan?.name || ""}"`,
      (r.price_paise / 100).toFixed(2),
      (r.dues_paise / 100).toFixed(2),
      r.end_date,
      r.days_left,
      r.days_left < 0 ? "Expired" : "Expiring",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...lines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `member-renewals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show(`Exported ${filteredRows.length} renewals to CSV`);
  }

  return (
    <div className="ps-page rn">
      <style>{CSS}</style>

      {/* ── Page Header ── */}
      <header className="rn-head">
        <div className="rn-head-left">
          <div>
            <div className="rn-breadcrumb">
              <Link href="/dashboard">Dashboard</Link>
              <ChevronRight size={13} />
              <Link href="/dashboard/members">Members</Link>
              <ChevronRight size={13} />
              <span>Pending Balance & Renewals</span>
            </div>
            <h1>Member Renewals & Pending Balance</h1>
            <p>
              Track upcoming membership expirations, pending dues, forecast upcoming renewal revenue, and follow up with members.
            </p>
          </div>
        </div>

        <div className="rn-head-actions">
          <button
            type="button"
            className="ps-btn ps-btn--secondary ps-btn--sm"
            onClick={exportCSV}
            disabled={loading || filteredRows.length === 0}
            title="Export filtered renewals as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <Link href="/dashboard/members" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Users size={14} />
            <span>All Members</span>
          </Link>
        </div>
      </header>

      {/* ── Top Metric Cards with Amounts ── */}
      <section className="rn-metrics">
        {/* Due in 7 Days */}
        <div
          className={`rn-metric-card rn-metric-card--amber ${range === "7" ? "active" : ""}`}
          onClick={() => setRange("7")}
          role="button"
          tabIndex={0}
        >
          <div className="rn-metric-top">
            <span className="rn-metric-label">Due in 7 Days</span>
            <span className="rn-metric-badge rn-metric-badge--amber">Urgent</span>
          </div>
          <div className="rn-metric-main">
            <div className="rn-metric-val">{loading ? <Skeleton w={50} h={26} /> : stats.due7Count}</div>
            <div className="rn-metric-amount">
              {loading ? <Skeleton w={80} h={18} /> : formatINR(stats.due7Amount)}
            </div>
          </div>
          <div className="rn-metric-foot">Potential renewal revenue this week</div>
        </div>

        {/* Due in 30 Days */}
        <div
          className={`rn-metric-card rn-metric-card--blue ${range === "30" ? "active" : ""}`}
          onClick={() => setRange("30")}
          role="button"
          tabIndex={0}
        >
          <div className="rn-metric-top">
            <span className="rn-metric-label">Due in 30 Days</span>
            <span className="rn-metric-badge rn-metric-badge--blue">This Month</span>
          </div>
          <div className="rn-metric-main">
            <div className="rn-metric-val">{loading ? <Skeleton w={50} h={26} /> : stats.due30Count}</div>
            <div className="rn-metric-amount">
              {loading ? <Skeleton w={80} h={18} /> : formatINR(stats.due30Amount)}
            </div>
          </div>
          <div className="rn-metric-foot">Forecast revenue over next 30 days</div>
        </div>

        {/* Expired / Grace Period */}
        <div
          className={`rn-metric-card rn-metric-card--red ${range === "expired" ? "active" : ""}`}
          onClick={() => setRange("expired")}
          role="button"
          tabIndex={0}
        >
          <div className="rn-metric-top">
            <span className="rn-metric-label">Expired (Past 30d)</span>
            <span className="rn-metric-badge rn-metric-badge--red">Needs Action</span>
          </div>
          <div className="rn-metric-main">
            <div className="rn-metric-val">{loading ? <Skeleton w={50} h={26} /> : stats.expiredCount}</div>
            <div className="rn-metric-amount">
              {loading ? <Skeleton w={80} h={18} /> : formatINR(stats.expiredAmount)}
            </div>
          </div>
          <div className="rn-metric-foot">Lapsed memberships to re-engage</div>
        </div>

        {/* Total Pipeline */}
        <div
          className={`rn-metric-card rn-metric-card--green ${range === "all" ? "active" : ""}`}
          onClick={() => setRange("all")}
          role="button"
          tabIndex={0}
        >
          <div className="rn-metric-top">
            <span className="rn-metric-label">Total Pipeline</span>
            <span className="rn-metric-badge rn-metric-badge--green">Overview</span>
          </div>
          <div className="rn-metric-main">
            <div className="rn-metric-val">{loading ? <Skeleton w={50} h={26} /> : items.length}</div>
            <div className="rn-metric-amount">
              {loading ? (
                <Skeleton w={80} h={18} />
              ) : (
                formatINR(items.reduce((acc, i) => acc + i.price_paise, 0))
              )}
            </div>
          </div>
          <div className="rn-metric-foot">Total value across tracked members</div>
        </div>
      </section>

      {/* ── Main Data Card ── */}
      <div className="rn-card">
        {/* Toolbar */}
        <div className="rn-toolbar">
          {/* Time range pills */}
          <div className="rn-range-pills" role="group" aria-label="Timeframe">
            <button
              type="button"
              className={`rn-range-pill ${range === "7" ? "active" : ""}`}
              onClick={() => setRange("7")}
            >
              7 Days ({stats.due7Count})
            </button>
            <button
              type="button"
              className={`rn-range-pill ${range === "15" ? "active" : ""}`}
              onClick={() => setRange("15")}
            >
              15 Days
            </button>
            <button
              type="button"
              className={`rn-range-pill ${range === "30" ? "active" : ""}`}
              onClick={() => setRange("30")}
            >
              30 Days ({stats.due30Count})
            </button>
            <button
              type="button"
              className={`rn-range-pill ${range === "expired" ? "active" : ""}`}
              onClick={() => setRange("expired")}
            >
              Expired ({stats.expiredCount})
            </button>
            <button
              type="button"
              className={`rn-range-pill ${range === "all" ? "active" : ""}`}
              onClick={() => setRange("all")}
            >
              All Records
            </button>
          </div>

          <div className="rn-search-bar">
            <Search size={14} className="rn-search-icon" />
            <input
              type="search"
              placeholder="Search member, phone, plan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search renewals"
            />
            {search && (
              <button
                type="button"
                className="rn-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Plan filter dropdown */}
          {plans.length > 0 && (
            <select
              className="rn-select"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label="Filter by membership plan"
            >
              <option value="all">All Plans ({plans.length})</option>
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          {/* Sort dropdown */}
          <select
            className="rn-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort renewals"
          >
            <option value="soonest">Expiring Soonest</option>
            <option value="amount_desc">Highest Amount</option>
            <option value="amount_asc">Lowest Amount</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {/* Table */}
        <div className="rn-table-wrap">
          <table className="rn-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Current Plan</th>
                <th>Renewal Amount</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Skeleton w={34} h={34} r={17} />
                        <div style={{ display: "grid", gap: 5 }}>
                          <Skeleton w={120} h={13} />
                          <Skeleton w={80} h={11} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <Skeleton w={100} h={13} />
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <Skeleton w={70} h={14} />
                        <Skeleton w={45} h={10} />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <Skeleton w={90} h={13} />
                        <Skeleton w={60} h={18} r={4} />
                      </div>
                    </td>
                    <td>
                      <Skeleton w={38} h={22} r={11} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Skeleton w={70} h={28} r={6} />
                    </td>
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="rn-empty">
                      <CheckCircle2 size={38} className="rn-empty-icon" />
                      <h3>No renewal records match</h3>
                      <p>
                        {items.length === 0
                          ? "No member memberships are set up with expiry dates yet."
                          : "Try loosening your search or selecting a different timeframe filter above."}
                      </p>
                      {(search || planFilter !== "all" || range !== "30") && (
                        <button
                          type="button"
                          className="ps-btn ps-btn--secondary ps-btn--sm"
                          onClick={() => {
                            setSearch("");
                            setPlanFilter("all");
                            setRange("30");
                          }}
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => {
                  const waUrl = getWaLink(item);
                  const isExpired = item.days_left < 0;
                  const isBusy = changingStatusId === item.id;
                  const isActive = item.member.status !== "inactive" && item.status === "active";

                  return (
                    <tr key={item.id} className={isExpired ? "rn-row--expired" : ""}>
                      {/* 1. Member with WhatsApp logo beside name */}
                      <td>
                        <div className="rn-who">
                          <Avatar name={item.member.full_name} size={34} />
                          <div className="rn-who-meta">
                            <div className="rn-name-row">
                              <Link href={`/dashboard/members/${item.member_id}`} className="rn-name-link">
                                <strong>{item.member.full_name}</strong>
                              </Link>
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rn-wa-icon"
                                  title={`Send WhatsApp renewal reminder to ${item.member.full_name} (${item.member.phone})`}
                                  aria-label={`Send WhatsApp reminder to ${item.member.full_name}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <WhatsAppIcon size={13} />
                                </a>
                              ) : (
                                <span
                                  className="rn-wa-icon rn-wa-icon--disabled"
                                  title="No phone number for WhatsApp"
                                  aria-label="No phone number"
                                >
                                  <WhatsAppIcon size={13} />
                                </span>
                              )}
                            </div>
                            <small className="rn-phone">
                              {item.member.phone || "No phone"}
                            </small>
                          </div>
                        </div>
                      </td>

                      {/* 2. Current Plan (without duration days) */}
                      <td>
                        <div className="rn-plan-meta">
                          <span className="rn-plan-name">{item.plan?.name || "Standard Plan"}</span>
                        </div>
                      </td>

                      {/* 3. Renewal Amount & Dues */}
                      <td>
                        <div className="rn-price-block">
                          <strong className="rn-price-val">
                            {formatINR(item.price_paise)}
                          </strong>
                          {item.dues_paise > 0 ? (
                            <small className="rn-dues-tag">
                              Due: {formatINR(item.dues_paise)}
                            </small>
                          ) : (
                            <small className="rn-dues-zero">No dues</small>
                          )}
                        </div>
                      </td>

                      {/* 4. Expiry Date & Days Left at bottom (red if < 15 days left) */}
                      <td>
                        <div className="rn-date-block">
                          <span className="rn-date-text">
                            {new Date(item.end_date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          <span
                            className={`rn-exp-badge ${
                              item.days_left < 15
                                ? "rn-exp-badge--red"
                                : "rn-exp-badge--blue"
                            }`}
                          >
                            <Clock size={10} />
                            <span>
                              {item.days_left < 0
                                ? `Expired (${Math.abs(item.days_left)}d ago)`
                                : item.days_left === 0
                                ? "Expires Today"
                                : item.days_left === 1
                                ? "Tomorrow"
                                : `${item.days_left}d left`}
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* 5. Status Toggle (Active / Inactive, no text) */}
                      <td>
                        <div className="rn-status-cell">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isActive}
                            disabled={isBusy}
                            className={`rn-toggle ${isActive ? "rn-toggle--on" : "rn-toggle--off"}`}
                            onClick={() => handleQuickStatusChange(item, isActive ? "inactive" : "active")}
                            title={`Status: ${isActive ? "Active" : "Inactive"}. Click to toggle.`}
                            aria-label={`Toggle active status for ${item.member.full_name}`}
                          >
                            <span className="rn-toggle-thumb">
                              {isBusy && <Loader2 size={9} className="ps-spin" />}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* 6. Action */}
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="ps-btn ps-btn--primary ps-btn--sm"
                          onClick={() => setRenewTarget(item)}
                          title={`Renew membership for ${item.member.full_name}`}
                        >
                          <RefreshCw size={12} />
                          <span>Renew</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-over Sheet: Quick Member Renewal ── */}
      {renewTarget && (
        <RenewalSheet
          member={renewTarget.member}
          orgId={orgId}
          currentPlanId={renewTarget.plan_id}
          onClose={() => setRenewTarget(null)}
          onDone={(msg) => {
            setRenewTarget(null);
            show(msg || "Membership renewed successfully!");
            loadData();
          }}
          onError={(msg) => show(msg, "error")}
        />
      )}

      {toast}
    </div>
  );
}

const CSS = `
.ps-page.rn {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

/* Header */
.rn-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.rn-head-left {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.rn-head-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--accent-dim, rgba(10, 132, 255, 0.1));
  color: var(--accent, #0a84ff);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(10, 132, 255, 0.2);
}
.rn-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.rn-breadcrumb a {
  color: var(--text-secondary);
  text-decoration: none;
}
.rn-breadcrumb a:hover {
  color: var(--text-primary);
  text-decoration: underline;
}
.rn-head h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.rn-head p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
  max-width: 650px;
}
.rn-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Metrics */
.rn-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.rn-metric-card {
  background: var(--surface, #ffffff);
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 140ms ease;
  outline: none;
}
.rn-metric-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}
.rn-metric-card.active {
  border-color: var(--accent, #0a84ff);
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.15);
}
.rn-metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.rn-metric-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}
.rn-metric-badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rn-metric-badge--amber { background: #fef3c7; color: #b45309; }
.rn-metric-badge--blue { background: #e0f2fe; color: #0369a1; }
.rn-metric-badge--red { background: #fee2e2; color: #b91c1c; }
.rn-metric-badge--green { background: #dcfce7; color: #15803d; }
.rn-metric-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.rn-metric-val {
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.rn-metric-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent, #0a84ff);
}
.rn-metric-foot {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* Card */
.rn-card {
  background: var(--surface, #ffffff);
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  overflow: hidden;
}

/* Toolbar */
.rn-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mb-line, #e2e8f0);
  flex-wrap: wrap;
}
.rn-range-pills {
  display: inline-flex;
  background: var(--mb-soft, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}
.rn-range-pill {
  border: none;
  background: transparent;
  padding: 5px 11px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
  white-space: nowrap;
}
.rn-range-pill:hover {
  color: var(--text-primary);
}
.rn-range-pill.active {
  background: #ffffff;
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.rn-search-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 180px;
}
.rn-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.rn-search-bar input {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 30px;
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 8px;
  font-size: 12.5px;
  background: #ffffff;
  color: var(--text-primary);
  outline: none;
}
.rn-search-bar input:focus {
  border-color: var(--accent, #0a84ff);
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.12);
}
.rn-search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
}
.rn-select {
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-secondary);
  background: #ffffff;
  cursor: pointer;
  outline: none;
}

/* Table */
.rn-table-wrap {
  width: 100%;
  overflow-x: auto;
}
.rn-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}
.rn-table th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--mb-line, #e2e8f0);
  background: var(--mb-soft, #f8fafc);
  white-space: nowrap;
}
.rn-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--mb-line, #f1f5f9);
  color: var(--text-primary);
  vertical-align: middle;
}
.rn-table tbody tr:hover {
  background: var(--mb-soft, #f8fafc);
}
.rn-row--expired {
  background: rgba(239, 68, 68, 0.02);
}

/* Row cells */
.rn-who {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rn-who-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rn-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.rn-name-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: 13.5px;
}
.rn-name-link:hover {
  color: var(--accent, #0a84ff);
  text-decoration: underline;
}
.rn-wa-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(37, 211, 102, 0.12);
  color: #128c7e;
  transition: all 140ms ease;
  flex-shrink: 0;
  text-decoration: none;
}
.rn-wa-icon:hover {
  background: #25d366;
  color: #ffffff;
  transform: scale(1.08);
}
.rn-wa-icon--disabled {
  opacity: 0.35;
  background: var(--mb-soft, #f1f5f9);
  color: var(--text-tertiary);
  cursor: not-allowed;
}
.rn-phone {
  font-size: 11.5px;
  color: var(--text-tertiary);
}
.rn-plan-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rn-plan-name {
  font-weight: 600;
  font-size: 13px;
}
.rn-price-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rn-price-val {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
}
.rn-dues-tag {
  font-size: 11px;
  font-weight: 600;
  color: #dc2626;
}
.rn-dues-zero {
  font-size: 11px;
  color: var(--text-tertiary);
}
.rn-date-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rn-date-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.rn-exp-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 650;
  width: fit-content;
}
.rn-exp-badge--red {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.rn-exp-badge--blue {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid rgba(3, 105, 161, 0.2);
}

/* Status cell toggle switch */
.rn-status-cell {
  display: inline-flex;
  align-items: center;
}
.rn-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: none;
  padding: 2px;
  cursor: pointer;
  background: #d1d5db;
  transition: background-color 180ms ease, opacity 150ms ease;
  flex-shrink: 0;
  outline: none;
}
.rn-toggle:hover:not(:disabled) {
  filter: brightness(0.96);
}
.rn-toggle:disabled {
  opacity: 0.6;
  cursor: wait;
}
.rn-toggle--on {
  background: #16a34a;
}
.rn-toggle-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  transform: translateX(0);
}
.rn-toggle--on .rn-toggle-thumb {
  transform: translateX(16px);
}

/* Pills */
.rn-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}
.rn-pill--red {
  background: #fee2e2;
  color: #b91c1c;
}
.rn-pill--urgent {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  animation: rn-pulse 1.8s infinite;
}
.rn-pill--amber {
  background: #fef3c7;
  color: #b45309;
}
.rn-pill--blue {
  background: #e0f2fe;
  color: #0369a1;
}

@keyframes rn-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

/* WhatsApp Remind */
.rn-wa-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(37, 211, 102, 0.1);
  color: #128c7e;
  border: 1px solid rgba(37, 211, 102, 0.3);
  text-decoration: none;
  transition: all 120ms ease;
  white-space: nowrap;
}
.rn-wa-btn:hover {
  background: #25d366;
  color: #ffffff;
  border-color: #25d366;
}

/* Empty */
.rn-empty {
  padding: 48px 16px;
  text-align: center;
}
.rn-empty-icon {
  color: #10b981;
  margin-bottom: 12px;
}
.rn-empty h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 6px;
}
.rn-empty p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}
.rn-muted {
  color: var(--text-tertiary);
}

/* Dark Mode */
.dark .rn-metric-card {
  background: var(--surface-2);
  border-color: var(--border);
}
.dark .rn-metric-card:hover {
  background: var(--surface-3);
  border-color: var(--border-mid);
}
.dark .rn-card {
  background: var(--surface-2);
  border-color: var(--border);
}
.dark .rn-toolbar {
  border-color: var(--border);
}
.dark .rn-range-pills {
  background: var(--surface-3);
}
.dark .rn-range-pill.active {
  background: var(--surface-1, #18181b);
  color: #ffffff;
}
.dark .rn-search-bar input {
  background: var(--surface-3);
  border-color: var(--border);
  color: #ffffff;
}
.dark .rn-select {
  background: var(--surface-3);
  border-color: var(--border);
  color: var(--text-secondary);
}
.dark .rn-table th {
  background: var(--surface-3);
  border-color: var(--border);
}
.dark .rn-table td {
  border-color: var(--border);
}
.dark .rn-table tbody tr:hover {
  background: var(--surface-3);
}
.dark .rn-wa-icon {
  background: rgba(37, 211, 102, 0.2);
  color: #25d366;
}
.dark .rn-exp-badge--red {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}
.dark .rn-exp-badge--blue {
  background: rgba(14, 165, 233, 0.18);
  color: #7dd3fc;
  border-color: rgba(14, 165, 233, 0.3);
}
.dark .rn-toggle--off {
  background: #3f3f46;
}
.dark .rn-toggle--on {
  background: #16a34a;
}
.dark .rn-wa-btn {
  background: rgba(37, 211, 102, 0.15);
  color: #4ade80;
  border-color: rgba(37, 211, 102, 0.4);
}
.dark .rn-wa-btn:hover {
  background: #22c55e;
  color: #000000;
}

@media (max-width: 960px) {
  .rn-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 600px) {
  .rn-metrics {
    grid-template-columns: 1fr;
  }
  .rn-head {
    flex-direction: column;
  }
  .rn-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
