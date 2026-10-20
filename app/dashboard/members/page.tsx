"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Plus, Search, ChevronRight, Users, Copy, UserCheck, Clock, UserX, Salad, Dumbbell, Check } from "lucide-react";
import { Avatar, Skeleton, useToast } from "../components/ui";
import { Sheet } from "../components/Sheet";
import { DesignStyles } from "../components/DesignSystem";

type Membership = { status: string; end_date: string; membership_plans: { name: string } | null };
type Member = {
  id: string; full_name: string; phone: string | null; email: string | null; sex: string | null;
  date_of_birth: string | null; created_at: string; memberships: Membership[];
};
type StatusKey = "active" | "expiring" | "expired" | "none";
type FilterKey = "all" | StatusKey;
type CopyKind = "diet" | "workout";

const supabase = createClient();

const FILTERS: { key: FilterKey; label: string; tone: string; icon: React.ElementType; hint: string }[] = [
  { key: "all", label: "All members", tone: "blue", icon: Users, hint: "Everyone in your gym" },
  { key: "active", label: "Active", tone: "green", icon: UserCheck, hint: "Paid and current" },
  { key: "expiring", label: "Expiring", tone: "amber", icon: Clock, hint: "Within 7 days" },
  { key: "expired", label: "Expired / none", tone: "purple", icon: UserX, hint: "Need a plan" },
];

// Desktop / mobile grid columns for the table
const COLS = "minmax(0,2.2fr) minmax(0,1.4fr) minmax(0,1.2fr) 120px 40px 16px";

function activeMembership(m: Member) {
  return m.memberships?.find((ms) => ms.status === "active");
}

function statusOf(m: Member): { key: StatusKey; label: string; pill: string } {
  const ms = activeMembership(m);
  if (!ms) return { key: "none", label: "No plan", pill: "db-pill--muted" };
  const daysLeft = Math.ceil((new Date(ms.end_date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { key: "expired", label: "Expired", pill: "db-pill--red" };
  if (daysLeft <= 7) return { key: "expiring", label: daysLeft === 0 ? "Ends today" : `${daysLeft}d left`, pill: "db-pill--amber" };
  return { key: "active", label: "Active", pill: "db-pill--green" };
}

function metaOf(m: Member) {
  const parts: string[] = [];
  if (m.sex) parts.push(m.sex.charAt(0).toUpperCase() + m.sex.slice(1));
  if (m.date_of_birth) parts.push(`${new Date().getFullYear() - new Date(m.date_of_birth).getFullYear()} yrs`);
  return parts.join(" · ");
}

export default function MembersPage() {
  const searchParams = useSearchParams();
  const { toast, show } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>(() => {
    const p = searchParams.get("filter");
    return (["all", "active", "expiring", "expired", "none"] as const).includes(p as FilterKey) ? (p as FilterKey) : "all";
  });

  // Copy sheet
  const [source, setSource] = useState<Member | null>(null);
  const [kind, setKind] = useState<CopyKind>("diet");
  const [target, setTarget] = useState<Member | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const { data } = await supabase
        .from("members")
        .select(`id, full_name, phone, email, sex, date_of_birth, created_at, memberships(status, end_date, membership_plans(name))`)
        .eq("org_id", roleData.org_id)
        .order("created_at", { ascending: false });
      setMembers((data as Member[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const withStatus = useMemo(() => members.map((m) => ({ m, status: statusOf(m) })), [members]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: withStatus.length, active: 0, expiring: 0, expired: 0, none: 0 };
    withStatus.forEach(({ status }) => { c[status.key]++; });
    return c;
  }, [withStatus]);

  const q = search.trim().toLowerCase();
  const filtered = withStatus.filter(({ m, status }) => {
    if (filter === "expired" ? !(status.key === "expired" || status.key === "none") : filter !== "all" && status.key !== filter) return false;
    if (!q) return true;
    return m.full_name.toLowerCase().includes(q) || (m.phone || "").includes(q) || (m.email || "").toLowerCase().includes(q);
  });

  const tq = targetQuery.trim().toLowerCase();
  const targetOptions = members.filter((m) => m.id !== source?.id && (!tq || m.full_name.toLowerCase().includes(tq) || (m.phone || "").includes(tq)));

  function openCopy(m: Member, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSource(m);
    setKind("diet");
    setTarget(null);
    setTargetQuery("");
  }

  async function handleCopy() {
    if (!source || !target) return;
    setCopying(true);
    try {
      if (kind === "diet") {
        // Same logic as the member profile's CopyPlanSheet
        const { data: plan } = await supabase
          .from("member_diet_plans")
          .select("plan_mode, plan_days, target_kcal, target_protein_g, target_carbs_g, target_fat_g, plan_json, coach_notes")
          .eq("member_id", source.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!plan) { show(`${source.full_name.split(" ")[0]} has no diet plan to copy`, "error"); return; }
        await supabase.from("member_diet_plans").update({ status: "superseded" }).eq("member_id", target.id).eq("status", "active");
        const { error } = await supabase.from("member_diet_plans").insert({
          ...plan, org_id: orgId, member_id: target.id, start_date: new Date().toISOString().slice(0, 10), status: "active", version_number: 1,
        });
        if (error) throw error;
      } else {
        // Same logic as the member profile's CopyWorkoutSheet
        const { data: prog } = await supabase
          .from("member_workout_programs")
          .select("program_id")
          .eq("member_id", source.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!prog) { show(`${source.full_name.split(" ")[0]} has no workout program to copy`, "error"); return; }
        await supabase.from("member_workout_programs").update({ status: "cancelled" }).eq("member_id", target.id).eq("status", "active");
        const { error } = await supabase.from("member_workout_programs").insert({
          org_id: orgId, member_id: target.id, program_id: prog.program_id, valid_from: new Date().toISOString().slice(0, 10), status: "active",
        });
        if (error) throw error;
      }
      show(`${kind === "diet" ? "Diet plan" : "Workout program"} copied to ${target.full_name}`);
      setSource(null);
    } catch (err) {
      console.error(err);
      show("Couldn't copy. Please try again.", "error");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="ps-page db">
      <DesignStyles />

      {/* Header */}
      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">People</div>
          <h1 className="db-title">Members</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{members.length}</strong> member{members.length === 1 ? "" : "s"} in your gym</>}
          </p>
        </div>
        <div className="db-header-actions">
          <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary">
            <Plus size={16} strokeWidth={2.4} /> <span>Add member</span>
          </Link>
        </div>
      </header>

      {/* KPI filters */}
      <div className="db-kpis">
        {FILTERS.map((f) => {
          const value = f.key === "expired" ? counts.expired + counts.none : counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              className={`db-card db-kpi db-filter db-tone-${f.tone}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              style={{ minHeight: 120 }}
            >
              <div className="db-kpi-head">
                <span className="db-chip"><f.icon size={16} strokeWidth={2.3} /></span>
                <span className="db-kpi-label">{f.label}</span>
              </div>
              <div className="db-kpi-value">{loading ? <Skeleton w={44} h={28} /> : value}</div>
              <div className="db-kpi-foot"><span>{f.hint}</span></div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="db-card db-toolbar">
        <label className="db-search">
          <Search size={16} />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email"
            aria-label="Search members"
          />
        </label>
        {filter !== "all" && (
          <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" onClick={() => setFilter("all")}>Clear filter</button>
        )}
      </div>

      {/* Table */}
      <div className="db-card" style={{ overflow: "hidden" }}>
        <div className="db-table-head" style={{ gridTemplateColumns: COLS }}>
          <span>Member</span><span>Contact</span><span>Plan</span><span>Status</span><span /><span />
        </div>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="db-trow db-members-row" style={{ gridTemplateColumns: COLS }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Skeleton w={38} h={38} r={19} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><Skeleton w={140} h={13} /><Skeleton w={80} h={11} /></div>
              </div>
              <span className="db-hide-sm"><Skeleton w={110} h={12} /></span>
              <span className="db-hide-sm"><Skeleton w={90} h={12} /></span>
              <Skeleton w={64} h={22} r={11} />
              <span /><span />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="db-empty" style={{ padding: "48px 16px" }}>
            <span className="db-empty-icon"><Users size={18} /></span>
            <div className="db-empty-title">{members.length === 0 ? "No members yet" : "No matches"}</div>
            <div className="db-empty-text">
              {members.length === 0 ? "Add your first member to start tracking plans, payments and attendance." : "Try a different name or phone number, or change the filter."}
            </div>
            {members.length === 0 && (
              <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }}>
                <Plus size={16} strokeWidth={2.4} /> Add member
              </Link>
            )}
          </div>
        ) : (
          filtered.map(({ m, status }) => {
            const plan = activeMembership(m)?.membership_plans?.name;
            const meta = metaOf(m);
            return (
              <Link key={m.id} href={`/dashboard/members/${m.id}`} className="db-trow db-members-row" style={{ gridTemplateColumns: COLS }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar name={m.full_name} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div className="db-row-title">{m.full_name}</div>
                    <div className="db-row-sub db-hide-sm">{meta || "\u00a0"}</div>
                    <div className="db-row-sub db-show-sm">{plan || m.phone || "No plan"}</div>
                  </div>
                </div>
                <div className="db-hide-sm" style={{ minWidth: 0 }}>
                  <div className="db-row-title" style={{ fontWeight: 500 }}>{m.phone || "—"}</div>
                  {m.email && <div className="db-row-sub">{m.email}</div>}
                </div>
                <div className="db-hide-sm db-row-sub" style={{ color: "var(--text-secondary)", fontSize: 13.5 }}>{plan || "—"}</div>
                <div><span className={`db-pill ${status.pill}`}>{status.label}</span></div>
                <button type="button" className="db-icon-btn" title="Copy diet or workout plan" aria-label={`Copy plan from ${m.full_name}`} onClick={(e) => openCopy(m, e)}>
                  <Copy size={15} />
                </button>
                <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
              </Link>
            );
          })
        )}
      </div>

      {toast}

      {/* Copy sheet */}
      <Sheet
        open={!!source}
        onClose={() => setSource(null)}
        title="Copy plan"
        description={source ? `Copy ${source.full_name.split(" ")[0]}'s latest plan to another member. It becomes their active plan.` : undefined}
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setSource(null)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" disabled={!target || copying} onClick={handleCopy}>
              {copying ? "Copying…" : target ? `Copy to ${target.full_name.split(" ")[0]}` : "Copy plan"}
            </button>
          </>
        }
      >
        <div className="db" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="db-copy-kinds">
            {([["diet", "Diet plan", Salad, "green"], ["workout", "Workout program", Dumbbell, "purple"]] as const).map(([k, label, Icon, tone]) => (
              <button key={k} type="button" className={`db-card db-kpi db-filter db-tone-${tone}`} aria-pressed={kind === k} onClick={() => setKind(k)} style={{ minHeight: 0, padding: 14 }}>
                <div className="db-kpi-head"><span className="db-chip"><Icon size={16} /></span><span className="db-kpi-label" style={{ color: "var(--text-primary)" }}>{label}</span></div>
              </button>
            ))}
          </div>

          <div>
            <div className="db-card-sub" style={{ marginBottom: 8, fontWeight: 600 }}>Copy to</div>
            <label className="db-search">
              <Search size={15} />
              <input type="search" placeholder="Search members…" value={targetQuery} onChange={(e) => setTargetQuery(e.target.value)} />
            </label>
            <div className="db-rows" style={{ margin: "8px -8px 0", maxHeight: 300, overflowY: "auto" }}>
              {targetOptions.length === 0 ? (
                <div className="db-empty"><div className="db-empty-text">No members found</div></div>
              ) : targetOptions.slice(0, 30).map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  className="db-row db-row--link"
                  onClick={() => setTarget(tm)}
                  style={{ border: "none", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer", background: target?.id === tm.id ? "var(--accent-dim)" : "transparent" }}
                >
                  <Avatar name={tm.full_name} size={32} />
                  <div className="db-row-text">
                    <div className="db-row-title" style={{ color: target?.id === tm.id ? "var(--accent)" : undefined }}>{tm.full_name}</div>
                    {tm.phone && <div className="db-row-sub">{tm.phone}</div>}
                  </div>
                  {target?.id === tm.id && <span className="db-check db-check--done" style={{ background: "var(--accent)" }}><Check size={12} strokeWidth={3} /></span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
