"use client";
// app/dashboard/members/page.tsx
// Members list: status tabs with counts, search, sort, an advanced Filters popover with removable chips,
// and saved views (private per user, ps_layout_prefs "members_views").
// Copy plan flow lives in ./components/CopyPlanSheet (type → plan → member → review & edit).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus, Search, X, SlidersHorizontal, ChevronRight, ChevronLeft, Copy, Check, Salad, Dumbbell,
  Download, Bookmark, Trash2, ArrowUpDown, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Avatar, Skeleton, useToast, formatDate } from "../components/ui";
import { CopyPlanSheet } from "./components/CopyPlanSheet";
import { loadPref, savePref } from "../leads/lib";

const supabase = createClient();

// ── Data ─────────────────────────────────────────────────────────────────────

type Membership = { status: string; end_date: string; membership_plans: { name: string } | null };
type MemberRaw = {
  id: string; full_name: string; phone: string | null; email: string | null; sex: string | null;
  date_of_birth: string | null; created_at: string; memberships: Membership[];
};
type StatusKey = "active" | "expiring" | "expired" | "none";
type Member = MemberRaw & {
  status: StatusKey; plan: string | null; endDate: string | null; daysLeft: number | null; age: number | null;
  hasDiet: boolean; hasWorkout: boolean;
};

function enrich(m: MemberRaw, diet: Set<string>, workout: Set<string>): Member {
  const list = m.memberships ?? [];
  const active = list.find((x) => x.status === "active");
  const latest = active ?? [...list].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];
  let status: StatusKey = "none";
  let daysLeft: number | null = null;
  if (latest?.end_date) {
    daysLeft = Math.ceil((new Date(`${latest.end_date.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86400000);
    status = !active || daysLeft < 0 ? "expired" : daysLeft <= 7 ? "expiring" : "active";
  }
  const age = m.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth).getTime()) / 31557600000) : null;
  return {
    ...m, status, daysLeft, age, plan: latest?.membership_plans?.name ?? null, endDate: latest?.end_date ?? null,
    hasDiet: diet.has(m.id), hasWorkout: workout.has(m.id),
  };
}

const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  active: { label: "Active", cls: "mb-pill--green" },
  expiring: { label: "Expiring", cls: "mb-pill--amber" },
  expired: { label: "Expired", cls: "mb-pill--red" },
  none: { label: "No plan", cls: "mb-pill--grey" },
};

// ── Filters ──────────────────────────────────────────────────────────────────

type Tab = "all" | StatusKey;
type YesNo = "any" | "yes" | "no";
type Filters = {
  plans: string[]; gender: string[]; ageMin: string; ageMax: string;
  joined: "any" | "7" | "30" | "90" | "month" | "custom"; joinedFrom: string; joinedTo: string;
  ends: "any" | "7" | "15" | "30" | "past";
  diet: YesNo; workout: YesNo; birthday: boolean; missing: boolean;
};
const NO_FILTERS: Filters = {
  plans: [], gender: [], ageMin: "", ageMax: "", joined: "any", joinedFrom: "", joinedTo: "",
  ends: "any", diet: "any", workout: "any", birthday: false, missing: false,
};
type View = { id: string; name: string; tab: Tab; filters: Filters };
type SortKey = "newest" | "oldest" | "name" | "ending";

const JOINED_LABEL = { any: "Any time", "7": "Last 7 days", "30": "Last 30 days", "90": "Last 3 months", month: "This month", custom: "Custom" } as const;
const ENDS_LABEL = { any: "Any", "7": "Next 7 days", "15": "Next 15 days", "30": "Next 30 days", past: "Already ended" } as const;
const SORT_LABEL: Record<SortKey, string> = { newest: "Newest first", oldest: "Oldest first", name: "Name A–Z", ending: "Plan ending soonest" };

function day0(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function matches(m: Member, f: Filters): boolean {
  if (f.plans.length && !f.plans.includes(m.plan ?? "__none")) return false;
  if (f.gender.length && !f.gender.includes((m.sex ?? "").toLowerCase() || "__none")) return false;
  if (f.ageMin && (m.age === null || m.age < Number(f.ageMin))) return false;
  if (f.ageMax && (m.age === null || m.age > Number(f.ageMax))) return false;
  if (f.joined !== "any") {
    const j = day0(new Date(m.created_at)); const t = day0();
    if (f.joined === "month" && (j.getMonth() !== t.getMonth() || j.getFullYear() !== t.getFullYear())) return false;
    if (["7", "30", "90"].includes(f.joined) && j < new Date(t.getTime() - Number(f.joined) * 86400000)) return false;
    if (f.joined === "custom") {
      if (f.joinedFrom && j < day0(new Date(`${f.joinedFrom}T00:00:00`))) return false;
      if (f.joinedTo && j > day0(new Date(`${f.joinedTo}T00:00:00`))) return false;
    }
  }
  if (f.ends !== "any") {
    if (m.daysLeft === null) return false;
    if (f.ends === "past" ? m.daysLeft >= 0 : m.daysLeft < 0 || m.daysLeft > Number(f.ends)) return false;
  }
  if (f.diet !== "any" && m.hasDiet !== (f.diet === "yes")) return false;
  if (f.workout !== "any" && m.hasWorkout !== (f.workout === "yes")) return false;
  if (f.birthday && (!m.date_of_birth || new Date(m.date_of_birth).getMonth() !== new Date().getMonth())) return false;
  if (f.missing && m.phone && m.email) return false;
  return true;
}

function chipsOf(f: Filters): { key: string; label: string; clear: Partial<Filters> }[] {
  const c: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.plans.length) c.push({ key: "plans", label: `Plan: ${f.plans.map((p) => (p === "__none" ? "None" : p)).join(", ")}`, clear: { plans: [] } });
  if (f.gender.length) c.push({ key: "gender", label: `Gender: ${f.gender.map((g) => (g === "__none" ? "Not set" : cap(g))).join(", ")}`, clear: { gender: [] } });
  if (f.ageMin || f.ageMax) c.push({ key: "age", label: `Age: ${f.ageMin || "any"}–${f.ageMax || "any"}`, clear: { ageMin: "", ageMax: "" } });
  if (f.joined !== "any") c.push({
    key: "joined",
    label: `Joined: ${f.joined === "custom" ? `${f.joinedFrom ? formatDate(f.joinedFrom) : "start"} – ${f.joinedTo ? formatDate(f.joinedTo) : "today"}` : JOINED_LABEL[f.joined]}`,
    clear: { joined: "any", joinedFrom: "", joinedTo: "" },
  });
  if (f.ends !== "any") c.push({ key: "ends", label: `Plan ends: ${ENDS_LABEL[f.ends]}`, clear: { ends: "any" } });
  if (f.diet !== "any") c.push({ key: "diet", label: f.diet === "yes" ? "Has diet plan" : "No diet plan", clear: { diet: "any" } });
  if (f.workout !== "any") c.push({ key: "workout", label: f.workout === "yes" ? "Has workout" : "No workout", clear: { workout: "any" } });
  if (f.birthday) c.push({ key: "birthday", label: "Birthday this month", clear: { birthday: false } });
  if (f.missing) c.push({ key: "missing", label: "Missing phone or email", clear: { missing: false } });
  return c;
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ── Filters popover ──────────────────────────────────────────────────────────

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="mb-opt" data-on={on} onClick={onClick}>{on && <Check size={12} strokeWidth={3} />}{children}</button>;
}

function FilterPanel({ f, set, plans, genders, count, onClear, onClose }: {
  f: Filters; set: (p: Partial<Filters>) => void; plans: string[]; genders: string[]; count: number; onClear: () => void; onClose: () => void;
}) {
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="mb-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
      <div className="mb-pop-head">
        <strong>Filters</strong>
        <button type="button" className="mb-icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <div className="mb-pop-body">
        <section>
          <h4>Membership plan</h4>
          <div className="mb-opts">
            {[...plans, "__none"].map((p) => <Opt key={p} on={f.plans.includes(p)} onClick={() => set({ plans: toggle(f.plans, p) })}>{p === "__none" ? "No plan" : p}</Opt>)}
          </div>
        </section>
        <section>
          <h4>Plan ends</h4>
          <div className="mb-opts">
            {(Object.keys(ENDS_LABEL) as Filters["ends"][]).map((k) => <Opt key={k} on={f.ends === k} onClick={() => set({ ends: k })}>{ENDS_LABEL[k]}</Opt>)}
          </div>
        </section>
        <section>
          <h4>Joined</h4>
          <div className="mb-opts">
            {(Object.keys(JOINED_LABEL) as Filters["joined"][]).map((k) => <Opt key={k} on={f.joined === k} onClick={() => set({ joined: k })}>{JOINED_LABEL[k]}</Opt>)}
          </div>
          {f.joined === "custom" && (
            <div className="mb-range">
              <input type="date" className="mb-input" value={f.joinedFrom} onChange={(e) => set({ joinedFrom: e.target.value })} aria-label="Joined from" />
              <span>to</span>
              <input type="date" className="mb-input" value={f.joinedTo} onChange={(e) => set({ joinedTo: e.target.value })} aria-label="Joined to" />
            </div>
          )}
        </section>
        <div className="mb-two">
          <section>
            <h4>Diet plan</h4>
            <div className="mb-seg">
              {(["any", "yes", "no"] as YesNo[]).map((v) => <button key={v} type="button" data-on={f.diet === v} onClick={() => set({ diet: v })}>{v === "any" ? "Any" : v === "yes" ? "Has" : "None"}</button>)}
            </div>
          </section>
          <section>
            <h4>Workout</h4>
            <div className="mb-seg">
              {(["any", "yes", "no"] as YesNo[]).map((v) => <button key={v} type="button" data-on={f.workout === v} onClick={() => set({ workout: v })}>{v === "any" ? "Any" : v === "yes" ? "Has" : "None"}</button>)}
            </div>
          </section>
        </div>
        <div className="mb-two">
          <section>
            <h4>Gender</h4>
            <div className="mb-opts">
              {[...genders, "__none"].map((g) => <Opt key={g} on={f.gender.includes(g)} onClick={() => set({ gender: toggle(f.gender, g) })}>{g === "__none" ? "Not set" : cap(g)}</Opt>)}
            </div>
          </section>
          <section>
            <h4>Age</h4>
            <div className="mb-range">
              <input type="number" min={0} className="mb-input" placeholder="Min" value={f.ageMin} onChange={(e) => set({ ageMin: e.target.value })} />
              <span>to</span>
              <input type="number" min={0} className="mb-input" placeholder="Max" value={f.ageMax} onChange={(e) => set({ ageMax: e.target.value })} />
            </div>
          </section>
        </div>
        <section>
          <h4>More</h4>
          <label className="mb-check"><input type="checkbox" checked={f.birthday} onChange={(e) => set({ birthday: e.target.checked })} /> Birthday this month</label>
          <label className="mb-check"><input type="checkbox" checked={f.missing} onChange={(e) => set({ missing: e.target.checked })} /> Missing phone or email</label>
        </section>
      </div>
      <div className="mb-pop-foot">
        <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={onClear}>Reset</button>
        <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={onClose}>Show {count} member{count === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const params = useSearchParams();
  const { toast, show } = useToast();
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>(() => {
    const p = params.get("filter");
    return p === "active" || p === "expiring" || p === "expired" || p === "none" ? p : "all";
  });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("newest");
  const [panel, setPanel] = useState<"filters" | "sort" | "views" | null>(null);
  const [views, setViews] = useState<View[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [page, setPage] = useState(0);
  const [copySource, setCopySource] = useState<Member | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const PAGE = 25;

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
    if (!role) return;
    setOrgId(role.org_id); setUserId(user.id);
    const [mRes, dRes, wRes, v] = await Promise.all([
      supabase.from("members")
        .select("id, full_name, phone, email, sex, date_of_birth, created_at, memberships(status, end_date, membership_plans(name))")
        .eq("org_id", role.org_id).order("created_at", { ascending: false }),
      supabase.from("member_diet_plans").select("member_id").eq("org_id", role.org_id).eq("status", "active"),
      supabase.from("member_workout_programs").select("member_id").eq("org_id", role.org_id).eq("status", "active"),
      loadPref<View[]>(user.id, "members_views"),
    ]);
    const diet = new Set((dRes.data ?? []).map((r: { member_id: string }) => r.member_id));
    const wk = new Set((wRes.data ?? []).map((r: { member_id: string }) => r.member_id));
    setMembers(((mRes.data ?? []) as MemberRaw[]).map((m) => enrich(m, diet, wk)));
    if (Array.isArray(v)) setViews(v);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // "/" focuses search, Esc closes popovers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const plans = useMemo(() => [...new Set(members.map((m) => m.plan).filter(Boolean) as string[])].sort(), [members]);
  const genders = useMemo(() => [...new Set(members.map((m) => (m.sex ?? "").toLowerCase()).filter(Boolean))].sort(), [members]);

  // Counts on tabs respect search + advanced filters, so they always add up to what you'd see.
  const q = search.trim().toLowerCase();
  const base = useMemo(() => members.filter((m) => matches(m, filters)
    && (!q || m.full_name.toLowerCase().includes(q) || (m.phone ?? "").includes(q) || (m.email ?? "").toLowerCase().includes(q))), [members, filters, q]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: base.length, active: 0, expiring: 0, expired: 0, none: 0 };
    base.forEach((m) => { c[m.status]++; });
    return c;
  }, [base]);
  const rows = useMemo(() => {
    const r = base.filter((m) => tab === "all" || m.status === tab);
    const by: Record<SortKey, (a: Member, b: Member) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.full_name.localeCompare(b.full_name),
      ending: (a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999),
    };
    return [...r].sort(by[sort]);
  }, [base, tab, sort]);
  useEffect(() => { setPage(0); }, [tab, filters, search, sort]);

  const chips = chipsOf(filters);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, (page + 1) * PAGE);

  function setF(p: Partial<Filters>) { setFilters((f) => ({ ...f, ...p })); setViewId(null); }
  function clearAll() { setFilters(NO_FILTERS); setTab("all"); setSearch(""); setViewId(null); }
  function persistViews(next: View[]) { setViews(next); if (orgId && userId) savePref(orgId, userId, "members_views", next); }
  function saveView() {
    const name = viewName.trim(); if (!name) return;
    const v: View = { id: crypto.randomUUID(), name, tab, filters };
    persistViews([...views, v]); setViewId(v.id); setNaming(false); setViewName(""); show("View saved");
  }

  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Phone", "Email", "Gender", "Age", "Plan", "Plan ends", "Status", "Diet plan", "Workout", "Joined"];
    const lines = [head.map(esc).join(","), ...rows.map((m) => [
      m.full_name, m.phone, m.email, m.sex, m.age, m.plan, m.endDate?.slice(0, 10), STATUS[m.status].label,
      m.hasDiet ? "Yes" : "No", m.hasWorkout ? "Yes" : "No", m.created_at.slice(0, 10),
    ].map(esc).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "expiring", label: "Expiring" },
    { key: "expired", label: "Expired" }, { key: "none", label: "No plan" },
  ];
  const dirty = tab !== "all" || chips.length > 0;

  return (
    <div className="ps-page mb" onClick={() => setPanel(null)}>
      <style>{CSS}</style>

      <header className="mb-head">
        <div className="mb-head-title">
          <span className="mb-head-icon"><Users size={20} /></span>
          <div>
          <h1>Members</h1>
          <p>{loading ? "\u00a0" : `${members.length} member${members.length === 1 ? "" : "s"} · ${members.filter((m) => m.status === "active" || m.status === "expiring").length} active`}</p>
          </div>
        </div>
        <div className="mb-head-actions">
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={exportCSV} disabled={loading || rows.length === 0}><Download size={15} /> Export</button>
          <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary ps-btn--sm"><Plus size={16} strokeWidth={2.4} /> Add member</Link>
        </div>
      </header>

      <div className="mb-card">
        {/* Status tabs */}
        <nav className="mb-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" data-tone={t.key} aria-selected={tab === t.key} onClick={() => { setTab(t.key); setViewId(null); }}>
              {t.key !== "all" && <span className={`mb-dot mb-dot--${t.key}`} />}
              {t.label}
              <span className="mb-count">{loading ? "–" : counts[t.key]}</span>
            </button>
          ))}
        </nav>

        {/* Toolbar */}
        <div className="mb-toolbar">
          <label className="mb-search">
            <Search size={15} />
            <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email" aria-label="Search members" />
            {search ? <button type="button" className="mb-x" onClick={() => setSearch("")} aria-label="Clear search"><X size={12} /></button> : <kbd>/</kbd>}
          </label>

          <div className="mb-anchor" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mb-tool" data-on={panel === "filters" || chips.length > 0} onClick={() => setPanel((p) => (p === "filters" ? null : "filters"))}>
              <SlidersHorizontal size={15} /> Filters{chips.length > 0 && <span className="mb-badge">{chips.length}</span>}
            </button>
            {panel === "filters" && (
              <FilterPanel f={filters} set={setF} plans={plans} genders={genders} count={rows.length}
                onClear={() => { setFilters(NO_FILTERS); setViewId(null); }} onClose={() => setPanel(null)} />
            )}
          </div>

          <div className="mb-anchor" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mb-tool" onClick={() => setPanel((p) => (p === "sort" ? null : "sort"))}><ArrowUpDown size={15} /> {SORT_LABEL[sort]}</button>
            {panel === "sort" && (
              <div className="mb-menu">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <button key={k} type="button" data-on={sort === k} onClick={() => { setSort(k); setPanel(null); }}>{SORT_LABEL[k]}{sort === k && <Check size={14} />}</button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-anchor" style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="mb-tool" data-on={!!viewId} onClick={() => setPanel((p) => (p === "views" ? null : "views"))}>
              <Bookmark size={15} /> {views.find((v) => v.id === viewId)?.name ?? "Saved views"}
            </button>
            {panel === "views" && (
              <div className="mb-menu mb-menu--right" style={{ width: 260 }}>
                {views.length === 0 && !naming && <div className="mb-muted" style={{ padding: "8px 10px", fontSize: 12.5 }}>Save a tab and filter combo you use often, like “Expiring, no diet plan”.</div>}
                {views.map((v) => (
                  <div key={v.id} className="mb-view" data-on={viewId === v.id}>
                    <button type="button" onClick={() => { setTab(v.tab); setFilters(v.filters); setViewId(v.id); setPanel(null); }}>{v.name}</button>
                    <button type="button" className="mb-icon" aria-label={`Delete ${v.name}`} onClick={() => { persistViews(views.filter((x) => x.id !== v.id)); if (viewId === v.id) setViewId(null); }}><Trash2 size={13} /></button>
                  </div>
                ))}
                <div className="mb-menu-sep" />
                {naming ? (
                  <div style={{ display: "flex", gap: 6, padding: 4 }}>
                    <input className="mb-input" autoFocus placeholder="View name" value={viewName} maxLength={40}
                      onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setNaming(false); }} />
                    <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" disabled={!viewName.trim()} onClick={saveView}>Save</button>
                  </div>
                ) : (
                  <button type="button" disabled={!dirty} onClick={() => setNaming(true)}><Plus size={14} /> Save current view</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="mb-chips">
            {chips.map((c) => (
              <span key={c.key} className="mb-chip">{c.label}<button type="button" onClick={() => setF(c.clear)} aria-label={`Remove ${c.label}`}><X size={12} /></button></span>
            ))}
            <button type="button" className="mb-link" onClick={clearAll}>Clear all</button>
          </div>
        )}

        {/* Table */}
        <div className="mb-table" role="table">
          <div className="mb-tr mb-th" role="row">
            <span>Member</span><span>Contact</span><span>Membership</span><span>Status</span><span>Programs</span><span />
          </div>

          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-tr">
              <span className="mb-who"><Skeleton w={36} h={36} r={18} /><span style={{ display: "grid", gap: 6 }}><Skeleton w={140} h={13} /><Skeleton w={80} h={11} /></span></span>
              <Skeleton w={120} h={12} /><Skeleton w={90} h={12} /><Skeleton w={64} h={22} r={11} /><Skeleton w={50} h={22} r={11} /><span />
            </div>
          )) : rows.length === 0 ? (
            <div className="mb-empty">
              <span className="mb-empty-icon"><Users size={20} /></span>
              <strong>{members.length === 0 ? "No members yet" : "No members match"}</strong>
              <p>{members.length === 0 ? "Add your first member to start tracking plans, payments and attendance." : "Try a different search, or loosen the filters."}</p>
              {members.length === 0
                ? <Link href="/dashboard/members/new" className="ps-btn ps-btn--primary ps-btn--sm"><Plus size={15} /> Add member</Link>
                : <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={clearAll}>Clear filters</button>}
            </div>
          ) : pageRows.map((m) => {
            const meta = [m.sex && cap(m.sex), m.age !== null && `${m.age} yrs`].filter(Boolean).join(" · ");
            return (
              <Link key={m.id} href={`/dashboard/members/${m.id}`} className="mb-tr mb-row" role="row" data-status={m.status}>
                <span className="mb-who">
                  <Avatar name={m.full_name} size={36} />
                  <span className="mb-text">
                    <strong>{m.full_name}</strong>
                    <small>{meta || `Joined ${formatDate(m.created_at)}`}</small>
                    <small className="mb-show-sm">{[m.plan, m.endDate && `${m.daysLeft !== null && m.daysLeft < 0 ? "ended" : "ends"} ${formatDate(m.endDate)}`, m.phone].filter(Boolean).join(" · ")}</small>
                  </span>
                </span>
                <span className="mb-text mb-hide-sm">
                  <span>{m.phone ?? <span className="mb-muted">No phone</span>}</span>
                  <small>{m.email ?? ""}</small>
                </span>
                <span className="mb-text mb-hide-sm">
                  <span>{m.plan ? <span className="mb-plan">{m.plan}</span> : <span className="mb-muted">—</span>}</span>
                  <small>{m.endDate ? `${m.daysLeft !== null && m.daysLeft < 0 ? "Ended" : "Ends"} ${formatDate(m.endDate)}` : ""}</small>
                </span>
                <span>
                  <span className={`mb-pill ${STATUS[m.status].cls}`}>
                    {m.status === "expiring" && m.daysLeft !== null ? (m.daysLeft === 0 ? "Ends today" : `${m.daysLeft}d left`) : STATUS[m.status].label}
                  </span>
                </span>
                <span className="mb-progs mb-hide-sm">
                  <span title={m.hasDiet ? "Has an active diet plan" : "No diet plan"} data-on={m.hasDiet}><Salad size={14} /></span>
                  <span title={m.hasWorkout ? "Has an active workout" : "No workout"} data-on={m.hasWorkout}><Dumbbell size={14} /></span>
                </span>
                <span className="mb-actions">
                  <button type="button" className="mb-icon" title="Copy a plan to another member" aria-label={`Copy a plan from ${m.full_name}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCopySource(m); }}><Copy size={15} /></button>
                  <ChevronRight size={16} className="mb-chev" />
                </span>
              </Link>
            );
          })}
        </div>

        {!loading && rows.length > 0 && (
          <footer className="mb-foot">
            <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, rows.length)} of {rows.length}</span>
            {pages > 1 && (
              <span className="mb-pager">
                <button type="button" className="mb-icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span>{page + 1} / {pages}</span>
                <button type="button" className="mb-icon" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
              </span>
            )}
          </footer>
        )}
      </div>

      <CopyPlanSheet source={copySource} members={members} orgId={orgId}
        onClose={() => setCopySource(null)}
        onDone={(msg) => { setCopySource(null); show(msg); load(); }}
        onError={(msg) => show(msg, "error")} />
      {toast}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const CSS = `
.mb { --mb-line: var(--separator); --mb-soft: #f6f7f9; }
.mb-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 0 0 14px; flex-wrap: wrap; }
.mb-head h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.mb-head p { font-size: 13.5px; color: var(--text-secondary); margin: 2px 0 0; }
.mb-head-actions { display: flex; gap: 8px; }

.mb-card { background: var(--surface, #fff); border: 1px solid var(--mb-line); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }

.mb-tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--mb-line); overflow-x: auto; scrollbar-width: none; }
.mb-tabs button { display: inline-flex; align-items: center; gap: 7px; height: 46px; padding: 0 12px; border: none; background: none; font: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.mb-tabs button:hover { color: var(--text-primary); }
.mb-tabs button[aria-selected="true"] { color: var(--text-primary); border-bottom-color: var(--accent); }
.mb-count { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--mb-soft); color: var(--text-tertiary); font-size: 12px; font-weight: 600; display: inline-grid; place-items: center; font-variant-numeric: tabular-nums; }
.mb-tabs button[aria-selected="true"] .mb-count { background: var(--accent-dim); color: var(--accent); }
.mb-dot { width: 7px; height: 7px; border-radius: 50%; }
.mb-dot--active { background: #34c759; } .mb-dot--expiring { background: #ff9f0a; } .mb-dot--expired { background: #ff3b30; } .mb-dot--none { background: #aeaeb2; }

.mb-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px; flex-wrap: wrap; }
.mb-search { position: relative; display: flex; align-items: center; flex: 0 1 340px; min-width: 200px; }
.mb-search > svg { position: absolute; left: 11px; color: var(--text-tertiary); pointer-events: none; }
.mb-search input { width: 100%; height: 36px; padding: 0 34px 0 34px; border: 1px solid var(--mb-line); border-radius: 9px; background: #fff; font: inherit; font-size: 13.5px; color: var(--text-primary); outline: none; }
.mb-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.mb-search input::-webkit-search-cancel-button { display: none; }
.mb-search kbd { position: absolute; right: 9px; font: inherit; font-size: 11px; color: var(--text-tertiary); border: 1px solid var(--mb-line); border-radius: 4px; padding: 0 5px; line-height: 17px; }
.mb-search--block { max-width: none; flex: 1; }
.mb-x { position: absolute; right: 7px; width: 22px; height: 22px; border: none; border-radius: 50%; background: #eceef2; color: var(--text-secondary); display: grid; place-items: center; cursor: pointer; }

.mb-anchor { position: relative; }
.mb-tool { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border: 1px solid var(--mb-line); border-radius: 9px; background: #fff; font: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.mb-tool:hover { color: var(--text-primary); background: var(--mb-soft); }
.mb-tool[data-on="true"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-dim); }
.mb-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: inline-grid; place-items: center; }

.mb-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; width: 440px; max-width: calc(100vw - 32px); background: #fff; border: 1px solid var(--mb-line); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.16); display: flex; flex-direction: column; max-height: min(640px, calc(100vh - 200px)); }
.mb-pop-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 8px; font-size: 15px; }
.mb-pop-body { overflow-y: auto; padding: 4px 14px 12px; display: flex; flex-direction: column; gap: 14px; }
.mb-pop-body h4 { font-size: 12px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 7px; }
.mb-pop-foot { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--mb-line); }
.mb-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mb-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.mb-opt { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 15px; border: 1px solid var(--mb-line); background: #fff; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.mb-opt:hover { border-color: #c7cad1; color: var(--text-primary); }
.mb-opt[data-on="true"] { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); font-weight: 600; }
.mb-seg { display: flex; padding: 2px; border-radius: 9px; background: var(--mb-soft); }
.mb-seg button { flex: 1; height: 28px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.mb-seg button[data-on="true"] { background: #fff; color: var(--text-primary); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.mb-range { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12.5px; color: var(--text-tertiary); }
.mb-range:first-child, h4 + .mb-range { margin-top: 0; }
.mb-input { height: 32px; width: 100%; min-width: 0; padding: 0 9px; border: 1px solid var(--mb-line); border-radius: 8px; font: inherit; font-size: 13px; color: var(--text-primary); background: #fff; outline: none; }
.mb-input:focus { border-color: var(--accent); }
.mb-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 4px 0; cursor: pointer; }
.mb-check input { accent-color: var(--accent); width: 15px; height: 15px; }

.mb-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; min-width: 210px; background: #fff; border: 1px solid var(--mb-line); border-radius: 11px; box-shadow: 0 12px 32px rgba(0,0,0,0.14); padding: 4px; }
.mb-menu--right { left: auto; right: 0; }
.mb-menu > button, .mb-view > button:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 7px; font: inherit; font-size: 13.5px; color: var(--text-primary); cursor: pointer; text-align: left; }
.mb-menu > button:hover:not(:disabled), .mb-view > button:first-child:hover { background: var(--mb-soft); }
.mb-menu > button[data-on="true"] { color: var(--accent); font-weight: 600; }
.mb-menu > button:disabled { opacity: 0.45; cursor: default; }
.mb-menu-sep { height: 1px; background: var(--mb-line); margin: 4px 0; }
.mb-view { display: flex; align-items: center; }
.mb-view[data-on="true"] > button:first-child { color: var(--accent); font-weight: 600; }

.mb-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 12px 12px; }
.mb-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 11px; border-radius: 14px; background: var(--mb-soft); border: 1px solid var(--mb-line); font-size: 12.5px; font-weight: 550; color: var(--text-primary); }
.mb-chip button { width: 20px; height: 20px; border: none; border-radius: 50%; background: none; color: var(--text-tertiary); display: grid; place-items: center; cursor: pointer; }
.mb-chip button:hover { background: #e4e6eb; color: var(--text-primary); }
.mb-link { border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); cursor: pointer; padding: 0 6px; }

.mb-table { border-top: 1px solid var(--mb-line); }
.mb-tr { display: grid; grid-template-columns: minmax(200px, 2.2fr) minmax(160px, 1.6fr) minmax(130px, 1.3fr) 110px 80px 64px; align-items: center; gap: 16px; padding: 0 16px; min-height: 60px; border-bottom: 1px solid #eef0f3; }
.mb-th { min-height: 38px; background: var(--mb-soft); font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
.mb-row { color: inherit; text-decoration: none; transition: background 0.12s; }
.mb-row:hover { background: #f8faff; }
.mb-row:hover .mb-chev { color: var(--accent); transform: translateX(2px); }
.mb-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mb-text { display: flex; flex-direction: column; min-width: 0; font-size: 13.5px; }
.mb-text > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-text strong { font-weight: 600; font-size: 14px; }
.mb-text small { font-size: 12.5px; color: var(--text-tertiary); margin-top: 1px; min-height: 1em; }
.mb-muted { color: var(--text-tertiary); }
.mb-pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.mb-pill--green { background: #e6f6ec; color: #1f8a3b; } .mb-pill--amber { background: #fff1de; color: #b45309; }
.mb-pill--red { background: #ffe9ec; color: #c4001a; } .mb-pill--grey { background: #f0f0f3; color: #6e6e73; }
.mb-progs { display: flex; gap: 6px; }
.mb-progs span { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: var(--mb-soft); color: #c4c6cc; }
.mb-progs span[data-on="true"]:first-child { background: #e6f6ec; color: #1f8a3b; }
.mb-progs span[data-on="true"]:last-child { background: #f3eafb; color: #8944ab; }
.mb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.mb-chev { color: var(--text-tertiary); transition: transform 0.12s, color 0.12s; }
.mb-icon { width: 32px; height: 32px; border: none; border-radius: 8px; background: none; color: var(--text-tertiary); display: inline-grid; place-items: center; cursor: pointer; }
.mb-icon:hover:not(:disabled) { background: #eef0f4; color: var(--text-primary); }
.mb-icon:disabled { opacity: 0.35; cursor: default; }

.mb-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 16px; text-align: center; }
.mb-empty-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--mb-soft); color: var(--text-tertiary); display: grid; place-items: center; margin-bottom: 4px; }
.mb-empty strong { font-size: 15px; }
.mb-empty p { font-size: 13.5px; color: var(--text-tertiary); margin: 0 0 8px; max-width: 340px; }
.mb-foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; font-size: 13px; color: var(--text-secondary); }
.mb-pager { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }

/* Copy sheet */
.mb-steps { display: flex; gap: 6px; margin-bottom: 16px; }
.mb-steps span { flex: 1; display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--text-tertiary); padding-top: 8px; border-top: 3px solid var(--mb-line); }
.mb-steps span[data-state="now"] { color: var(--text-primary); border-top-color: var(--accent); }
.mb-steps span[data-state="done"] { color: var(--accent); border-top-color: var(--accent); }
.mb-steps i { font-style: normal; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--mb-soft); }
.mb-steps span[data-state="now"] i { background: var(--accent); color: #fff; }
.mb-steps span[data-state="done"] i { background: var(--accent-dim); }
.mb-kinds { display: grid; gap: 10px; }
.mb-kind { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--mb-line); border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; color: var(--text-tertiary); transition: border-color 0.12s, box-shadow 0.12s; }
.mb-kind:hover:not(:disabled) { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.mb-kind:disabled { opacity: 0.55; cursor: default; }
.mb-kind-icon { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }
.mb-kind[data-kind="diet"] .mb-kind-icon { background: #e6f6ec; color: #1f8a3b; }
.mb-kind[data-kind="workout"] .mb-kind-icon { background: #f3eafb; color: #8944ab; }
.mb-kind-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.mb-kind-text strong { font-size: 15px; color: var(--text-primary); }
.mb-kind-text small { font-size: 13px; }
.mb-list { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
.mb-choice { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border: 1px solid var(--mb-line); border-radius: 10px; background: #fff; font: inherit; text-align: left; cursor: pointer; }
.mb-choice:hover { border-color: #c7cad1; }
.mb-choice[data-on="true"] { border-color: var(--accent); background: var(--accent-dim); }
.mb-choice-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mb-choice-text strong { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.mb-choice-text small { font-size: 12.5px; color: var(--text-tertiary); }
.mb-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #c7cad1; flex-shrink: 0; }
.mb-choice[data-on="true"] .mb-radio { border: 5px solid var(--accent); }
.mb-warn { margin-top: 10px; padding: 9px 12px; border-radius: 9px; background: #fff7ea; color: #9a4b00; font-size: 13px; }

@media (max-width: 1100px) {
  .mb-tr { grid-template-columns: minmax(180px, 2fr) minmax(140px, 1.4fr) minmax(120px, 1.2fr) 104px 64px; }
  .mb-tr > :nth-child(5) { display: none; }
}
@media (max-width: 760px) {
  .mb-tr { grid-template-columns: minmax(0, 1fr) auto 56px; gap: 10px; padding: 0 12px; }
  .mb-hide-sm, .mb-th { display: none; }
  .mb-search { flex: 1 1 100%; }
  .mb-two { grid-template-columns: 1fr; }
  .mb-pop { position: fixed; left: 16px; right: 16px; top: 120px; width: auto; }
}
/* Same gutter as Leads, regardless of any page width cap elsewhere. */
.ps-page.mb { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.mb-head-title { display: flex; align-items: center; gap: 12px; }
.mb-head-icon { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a84ff, #5e5ce6); box-shadow: 0 6px 16px rgba(10,132,255,0.28); flex-shrink: 0; }
.mb-card { position: relative; overflow: visible; }
.mb-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; border-radius: 14px 14px 0 0; background: linear-gradient(90deg, #0a84ff, #5e5ce6 40%, #af52de 70%, #ff9f0a); }
.mb-tabs { gap: 6px; padding: 10px 12px; }
.mb-tabs button { height: 34px; border-radius: 10px; border-bottom: none; margin-bottom: 0; }
.mb-tabs button:hover { background: #f4f5f8; }
.mb-tabs button[aria-selected="true"] { color: #fff; background: var(--accent); }
.mb-tabs button[aria-selected="true"][data-tone="active"] { background: #1f9d48; }
.mb-tabs button[aria-selected="true"][data-tone="expiring"] { background: #e88a00; }
.mb-tabs button[aria-selected="true"][data-tone="expired"] { background: #e0293a; }
.mb-tabs button[aria-selected="true"][data-tone="none"] { background: #6e6e73; }
.mb-tabs button[aria-selected="true"] .mb-count { background: rgba(255,255,255,0.22); color: #fff; }
.mb-tabs button[aria-selected="true"] .mb-dot { background: #fff; }
.mb-th { background: linear-gradient(180deg, #f7f8fb, #f2f4f8); }
.mb-row { position: relative; }
.mb-row::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: transparent; }
.mb-row[data-status="active"]::before { background: #34c759; }
.mb-row[data-status="expiring"]::before { background: #ff9f0a; }
.mb-row[data-status="expired"]::before { background: #ff3b30; }
.mb-plan { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: 2px 9px; border-radius: 7px; background: #eef4ff; color: #0b5cc0; font-weight: 600; font-size: 12.5px; }
.mb-show-sm { display: none !important; }
@media (max-width: 760px) {
  .ps-page.mb { padding: 10px !important; }
  .mb-head { align-items: center; }
  .mb-head-actions { width: 100%; }
  .mb-head-actions > * { flex: 1; justify-content: center; }
  .mb-toolbar { gap: 6px; }
  .mb-anchor[style] { margin-left: 0 !important; }
  .mb-tool { height: 38px; padding: 0 10px; font-size: 13px; }
  .mb-tr { grid-template-columns: minmax(0, 1fr) auto auto; padding: 10px 12px; min-height: 0; }
  .mb-show-sm { display: block !important; }
  .mb-text small.mb-show-sm { white-space: normal; }
  .mb-actions .mb-chev { display: none; }
  .mb-pop { top: auto !important; bottom: 0; left: 0 !important; right: 0; max-width: none; width: auto; border-radius: 18px 18px 0 0; max-height: 82vh; position: fixed; }
  .mb-menu { position: fixed; left: 10px; right: 10px; top: auto; bottom: 10px; width: auto !important; }
  .mb-search input { font-size: 16px; }
}
/* Card fills the screen like Leads: footer sits at the bottom, rows scroll inside when there are many. */
@media (min-width: 900px) {
  .ps-page.mb { min-height: 100dvh; display: flex; flex-direction: column; }
  .mb-card { flex: 1; display: flex; flex-direction: column; }
}
@media (min-width: 761px) {
  .mb-table { flex: 1; display: flex; flex-direction: column; }
  .mb-empty { flex: 1; justify-content: center; }
  .mb-foot { border-top: 1px solid var(--mb-line); }
}
.mb-plan { line-height: 18px; margin-bottom: 1px; }
`;
