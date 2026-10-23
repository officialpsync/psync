"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Ticket, Eye, EyeOff, IndianRupee, Users, Pencil, CalendarClock, Repeat, Search, Copy, Award, Check } from "lucide-react";
import { formatINR, Segmented, Skeleton, useToast } from "../components/ui";
import { Sheet } from "../components/Sheet";
import { DesignStyles } from "../components/DesignSystem";

type PlanType = "duration" | "session";
type Plan = {
  id: string; name: string; description: string | null; plan_type: PlanType | null;
  duration_days: number; price_paise: number; is_active: boolean; created_at: string;
};

const supabase = createClient();

const PRESETS = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
];


const EMPTY = { name: "", description: "", duration_days: "30", price: "", plan_type: "duration" as PlanType };

function periodLabel(days: number) {
  const preset = PRESETS.find((p) => p.days === days);
  if (preset) return preset.label === "1 month" ? "month" : preset.label === "1 year" ? "year" : preset.label;
  return `${days} days`;
}

// Price per month, for comparing plans of different lengths
function perMonth(p: Plan) {
  return p.duration_days >= 60 ? Math.round((p.price_paise / p.duration_days) * 30 / 100) * 100 : null;
}

export default function MembershipPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast();
  const [view, setView] = useState<"all" | "active" | "hidden">("all");
  const [typeF, setTypeF] = useState<"" | PlanType>("");
  const [sort, setSort] = useState<"popular" | "price" | "length" | "new">("popular");
  const [q, setQ] = useState("");

  async function load(oid: string) {
    const [{ data }, { data: ms }] = await Promise.all([
      supabase.from("membership_plans").select("*").eq("org_id", oid).order("created_at", { ascending: false }),
      supabase.from("memberships").select("plan_id").eq("org_id", oid).eq("status", "active"),
    ]);
    const counts: Record<string, number> = {};
    (ms || []).forEach((m: { plan_id: string | null }) => { if (m.plan_id) counts[m.plan_id] = (counts[m.plan_id] || 0) + 1; });
    setMemberCounts(counts);
    setPlans((data as Plan[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      await load(roleData.org_id);
    }
    init();
  }, []);

  function openNew() {
    setEditPlan(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(p: Plan) {
    setEditPlan(p);
    setForm({
      name: p.name,
      description: p.description || "",
      duration_days: String(p.duration_days),
      price: String(p.price_paise / 100),
      plan_type: p.plan_type === "session" ? "session" : "duration",
    });
    setShowForm(true);
  }

  const days = parseInt(form.duration_days);
  const price = parseFloat(form.price);
  const canSave = !!form.name.trim() && days > 0 && price > 0 && !saving;

  async function handleSave() {
    if (!canSave || !orgId) return;
    setSaving(true);
    const payload = {
      org_id: orgId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      plan_type: form.plan_type,
      duration_days: days,
      price_paise: Math.round(price * 100),
    };
    const { error } = editPlan
      ? await supabase.from("membership_plans").update(payload).eq("id", editPlan.id)
      : await supabase.from("membership_plans").insert({ ...payload, is_active: true });
    setSaving(false);
    if (error) { show("Couldn't save the plan. Try again.", "error"); return; }
    await load(orgId);
    setShowForm(false);
    show(editPlan ? "Plan updated" : "Plan created");
  }

  function duplicate(p: Plan) {
    setEditPlan(null);
    setForm({ name: `${p.name} (copy)`, description: p.description || "", duration_days: String(p.duration_days), price: String(p.price_paise / 100), plan_type: p.plan_type === "session" ? "session" : "duration" });
    setShowForm(true);
  }

  async function toggleActive(p: Plan) {
    const next = !p.is_active;
    setPlans((prev) => prev.map((pl) => (pl.id === p.id ? { ...pl, is_active: next } : pl)));
    const { error } = await supabase.from("membership_plans").update({ is_active: next }).eq("id", p.id);
    if (error) {
      setPlans((prev) => prev.map((pl) => (pl.id === p.id ? { ...pl, is_active: !next } : pl)));
      show("Couldn't update the plan. Try again.", "error");
    }
  }

  const stats = useMemo(() => {
    const active = plans.filter((p) => p.is_active);
    const members = Object.values(memberCounts).reduce((s, n) => s + n, 0);
    const mrr = plans.reduce((s, p) => s + (memberCounts[p.id] || 0) * Math.round((p.price_paise / Math.max(1, p.duration_days)) * 30 / 100) * 100, 0);
    const top = [...plans].sort((a, b) => (memberCounts[b.id] || 0) - (memberCounts[a.id] || 0))[0];
    return { active: active.length, hidden: plans.length - active.length, members, mrr, top: top && memberCounts[top.id] ? top : null };
  }, [plans, memberCounts]);

  const term = q.trim().toLowerCase();
  const shown = plans.filter((p) =>
    (view === "all" || (view === "active" ? p.is_active : !p.is_active)) &&
    (!typeF || (p.plan_type ?? "duration") === typeF) &&
    (!term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term))
  ).sort((a, b) => sort === "popular" ? (memberCounts[b.id] || 0) - (memberCounts[a.id] || 0)
    : sort === "price" ? a.price_paise - b.price_paise : sort === "length" ? a.duration_days - b.duration_days : b.created_at.localeCompare(a.created_at));
  // Best value: lowest price per day among active, time-based plans
  const bestValue = plans.filter((p) => p.is_active && p.plan_type !== "session" && p.duration_days >= 60)
    .sort((a, b) => a.price_paise / a.duration_days - b.price_paise / b.duration_days)[0]?.id;
  const maxCount = Math.max(1, ...Object.values(memberCounts));

  return (
    <div className="ps-page db mpl">
      <DesignStyles />
      <style>{MPL_CSS}</style>

      <header className="mpl-head">
        <div className="mpl-title">
          <span className="mpl-title-icon"><Ticket size={21} /></span>
          <div>
            <h1>Membership plans</h1>
            <p>{loading ? "\u00a0" : `${stats.active} plan${stats.active === 1 ? "" : "s"} available to new members${stats.hidden ? ` · ${stats.hidden} hidden` : ""}`}</p>
          </div>
        </div>
        <div className="mpl-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={openNew}><Plus size={16} strokeWidth={2.4} /><span>New plan</span></button>
        </div>
        <div className="mpl-kpis">
          <div className="mpl-kpi"><span className="mpl-kpi-icon"><Eye size={15} /></span><div><small>Available</small><b>{loading ? "–" : stats.active}</b></div></div>
          <div className="mpl-kpi"><span className="mpl-kpi-icon"><Users size={15} /></span><div><small>Members on a plan</small><b>{loading ? "–" : stats.members}</b></div></div>
          <div className="mpl-kpi"><span className="mpl-kpi-icon"><IndianRupee size={15} /></span><div><small>Monthly value</small><b>{loading ? "–" : formatINR(stats.mrr)}</b></div></div>
          <div className="mpl-kpi"><span className="mpl-kpi-icon"><Award size={15} /></span><div><small>Most popular</small><b>{loading ? "–" : stats.top ? stats.top.name : "—"}</b></div></div>
        </div>
      </header>

      {!loading && plans.length > 0 && (
        <div className="mpl-toolbar">
          <div className="mpl-seg" role="tablist">
            {([["all", "All", plans.length], ["active", "Available", stats.active], ["hidden", "Hidden", stats.hidden]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l} <span>{n}</span></button>
            ))}
          </div>
          <div className="mpl-seg">
            {([["", "Any type"], ["duration", "Time based"], ["session", "Session based"]] as const).map(([k, l]) => (
              <button key={l} type="button" aria-selected={typeF === k} onClick={() => setTypeF(k)}>{l}</button>
            ))}
          </div>
          <label className="mpl-search"><Search size={16} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans" aria-label="Search plans" /></label>
          <select className="mpl-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="popular">Most members</option><option value="price">Price: low to high</option>
            <option value="length">Length: short to long</option><option value="new">Newest</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="mpl-grid">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={280} r={18} />)}</div>
      ) : plans.length === 0 ? (
        <div className="mpl-empty">
          <span className="mpl-empty-icon"><Ticket size={20} /></span>
          <strong>No plans yet</strong>
          <p>Create a plan like &ldquo;Monthly&rdquo; or &ldquo;Annual&rdquo; so you can assign it to members.</p>
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={openNew}><Plus size={14} /> New plan</button>
        </div>
      ) : (
        <div className="mpl-grid">
          {shown.map((p) => {
            const count = memberCounts[p.id] || 0;
            const monthly = perMonth(p);
            const share = stats.members ? Math.round((count / stats.members) * 100) : 0;
            return (
              <article key={p.id} className="mpl-card" data-off={!p.is_active}>
                <div className="mpl-band">
                  <span className="mpl-band-icon">{p.plan_type === "session" ? <Repeat size={17} /> : <CalendarClock size={17} />}</span>
                  <span className="mpl-band-kind">{p.plan_type === "session" ? "Session based" : "Time based"} · {p.duration_days} days</span>
                  {p.id === bestValue && <span className="mpl-badge"><Award size={11} />Best value</span>}
                  {!p.is_active && <span className="mpl-badge mpl-badge--off"><EyeOff size={11} />Hidden</span>}
                </div>
                <div className="mpl-body">
                  <h3>{p.name}</h3>
                  <div className="mpl-price">{formatINR(p.price_paise)}<span>/ {periodLabel(p.duration_days)}</span></div>
                  <div className="mpl-sub">{monthly !== null ? `≈ ${formatINR(monthly)} a month · ` : ""}{formatINR(Math.round(p.price_paise / Math.max(1, p.duration_days)))} a day</div>
                  {p.description && <p className="mpl-desc">{p.description}</p>}
                  <div className="mpl-members">
                    <div><Users size={13} /><b>{count}</b> active member{count === 1 ? "" : "s"}<em>{share}% of members</em></div>
                    <span className="mpl-bar"><i style={{ width: `${(count / maxCount) * 100}%` }} /></span>
                  </div>
                </div>
                <div className="mpl-foot">
                  <label className="mpl-toggle">
                    <input type="checkbox" className="db-switch" checked={p.is_active} onChange={() => toggleActive(p)} aria-label={`${p.name} available`} />
                    <span>{p.is_active ? "Available" : "Hidden"}</span>
                  </label>
                  <button type="button" className="mpl-icon" title="Duplicate" aria-label={`Duplicate ${p.name}`} onClick={() => duplicate(p)}><Copy size={15} /></button>
                  <button type="button" className="mpl-btn" onClick={() => openEdit(p)}><Pencil size={13} />Edit</button>
                </div>
              </article>
            );
          })}
          {view !== "hidden" && (
            <button type="button" className="mpl-add" onClick={openNew}>
              <span><Plus size={20} /></span><strong>New plan</strong><small>Monthly, annual, couple, student…</small>
            </button>
          )}
          {shown.length === 0 && <div className="mpl-empty" style={{ gridColumn: "1 / -1" }}><strong>No plans match</strong><p>Try another filter or search.</p></div>}
        </div>
      )}

      <Sheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editPlan ? "Edit plan" : "New plan"}
        description={editPlan ? "Changes apply to new memberships only." : "Members can be assigned this plan when they join or renew."}
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : editPlan ? "Save changes" : "Create plan"}
            </button>
          </>
        }
      >
        <div className="db ps-form-grid">
          <label className="ps-field ps-span-2">
            <span className="ps-label">Name</span>
            <input className="ps-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Monthly, Annual, Couple…" />
          </label>

          <div className="ps-field ps-span-2">
            <span className="ps-label">Type</span>
            <Segmented<PlanType>
              block
              label="Plan type"
              value={form.plan_type}
              onChange={(v) => setForm((f) => ({ ...f, plan_type: v }))}
              options={[{ value: "duration", label: "Time based" }, { value: "session", label: "Session based" }]}
            />
          </div>

          <div className="ps-field ps-span-2">
            <span className="ps-label">Length</span>
            <div className="db-presets">
              {PRESETS.map((pd) => (
                <button
                  key={pd.days}
                  type="button"
                  className="db-preset"
                  aria-pressed={form.duration_days === String(pd.days)}
                  onClick={() => setForm((f) => ({ ...f, duration_days: String(pd.days) }))}
                >
                  {form.duration_days === String(pd.days) && <Check size={12} strokeWidth={3} />}{pd.label}
                </button>
              ))}
            </div>
            <div className="ps-input-wrap" style={{ marginTop: 4 }}>
              <input
                className="ps-input ps-num"
                type="text"
                inputMode="numeric"
                value={form.duration_days}
                onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                aria-label="Length in days"
                style={{ paddingRight: 56 }}
              />
              <span className="ps-input-trailing ps-hint" style={{ right: 14, pointerEvents: "none" }}>days</span>
            </div>
          </div>

          <label className="ps-field ps-span-2">
            <span className="ps-label">Price</span>
            <div className="ps-input-wrap">
              <span className="ps-input-icon">₹</span>
              <input
                className="ps-input ps-input--icon ps-num"
                type="text"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(/[^\d.]/g, "") }))}
                placeholder="1500"
                style={{ fontSize: 17, fontWeight: 600 }}
              />
            </div>
            {days >= 60 && price > 0 && (
              <span className="db-card-sub">≈ {formatINR(Math.round((price / days) * 30) * 100)} a month</span>
            )}
          </label>

          <label className="ps-field ps-span-2">
            <span className="ps-label">Description <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></span>
            <input className="ps-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Gym access and locker" />
          </label>
        </div>
      </Sheet>

      {toast}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const MPL_CSS = `
.ps-page.mpl { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.mpl { max-width: none; }
.mpl { --mpl-line: var(--separator); }
.mpl-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; margin-bottom: 14px; }
.mpl-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mpl-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); flex-shrink: 0; }
.mpl-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.mpl-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.mpl-actions .ps-btn { height: 42px; border-radius: 12px; }
.mpl-kpis { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.mpl-kpi { display: flex; align-items: center; gap: 9px; height: 52px; padding: 0 12px 0 9px; border-radius: 12px; background: #fff; border: 1px solid var(--mpl-line); min-width: 0; }
.mpl-kpi-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); flex-shrink: 0; }
.mpl-kpi div { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.mpl-kpi small { font-size: 12px; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; }
.mpl-kpi b { font-size: 17px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mpl-toolbar { position: relative; overflow: hidden; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px; margin-bottom: 14px; border-radius: 16px; background: #fff; border: 1px solid var(--mpl-line); }
.mpl-toolbar::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.mpl-seg { display: flex; padding: 3px; border-radius: 11px; background: #f2f3f6; }
.mpl-seg button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.mpl-seg button span { font-size: 11.5px; font-weight: 700; color: var(--text-tertiary); }
.mpl-seg button[aria-selected="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.mpl-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 180px; }
.mpl-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.mpl-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--mpl-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; }
.mpl-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.mpl-select { height: 38px; padding: 0 30px 0 12px; border: 1px solid var(--mpl-line); border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600; background: #fff; }

.mpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; align-items: stretch; }
.mpl-card { display: flex; flex-direction: column; background: #fff; border: 1px solid var(--mpl-line); border-radius: 18px; overflow: hidden; transition: box-shadow 160ms, transform 160ms; }
.mpl-card:hover { box-shadow: 0 14px 30px -16px rgba(10,60,160,0.4); transform: translateY(-2px); }
.mpl-card[data-off="true"] { opacity: 0.65; }
.mpl-card[data-off="true"] .mpl-band { background: linear-gradient(120deg, #8e8e93, #aeaeb2); }
.mpl-band { display: flex; align-items: center; gap: 8px; height: 54px; padding: 0 14px; color: #fff; background: radial-gradient(160px 80px at 90% -20%, rgba(255,255,255,0.3), transparent 70%), linear-gradient(120deg, #0a66d6, #3c4fe0); }
.mpl-band-icon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); flex-shrink: 0; }
.mpl-band-kind { font-size: 12px; font-weight: 650; opacity: 0.92; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mpl-badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 11px; background: #fff; color: #0a66d6; font-size: 11px; font-weight: 750; white-space: nowrap; }
.mpl-badge--off { color: #6e6e73; }
.mpl-body { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; }
.mpl-body h3 { margin: 0; font-size: 16.5px; font-weight: 720; letter-spacing: -0.015em; }
.mpl-price { font-size: 28px; font-weight: 790; letter-spacing: -0.03em; color: var(--text-primary); }
.mpl-price span { font-size: 13.5px; font-weight: 600; color: var(--text-tertiary); margin-left: 4px; letter-spacing: 0; }
.mpl-sub { font-size: 12.5px; color: var(--accent); font-weight: 600; }
.mpl-desc { margin: 2px 0 0; font-size: 13px; line-height: 1.45; color: var(--text-secondary); }
.mpl-members { margin-top: auto; padding-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.mpl-members > div { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.mpl-members b { color: var(--text-primary); }
.mpl-members em { font-style: normal; margin-left: auto; font-size: 12px; color: var(--text-tertiary); }
.mpl-bar { height: 6px; border-radius: 4px; background: #eef2f8; overflow: hidden; }
.mpl-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.mpl-foot { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--mpl-line); background: #fbfbfd; }
.mpl-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; margin-right: auto; }
.mpl-icon { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; }
.mpl-icon:hover { background: #eef2f8; color: var(--accent); }
.mpl-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--mpl-line); background: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.mpl-btn:hover { border-color: var(--accent); color: var(--accent); }
.mpl-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 280px; border: 1.5px dashed #c9cfda; border-radius: 18px; background: #fafbff; font: inherit; color: var(--accent); cursor: pointer; }
.mpl-add:hover { border-color: var(--accent); }
.mpl-add span { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #0a66d6, #3c4fe0); color: #fff; margin-bottom: 4px; }
.mpl-add strong { font-size: 15px; } .mpl-add small { font-size: 12.5px; color: var(--text-tertiary); }
.mpl-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 48px 20px; background: #fff; border: 1px solid var(--mpl-line); border-radius: 18px; }
.mpl-empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); margin-bottom: 4px; }
.mpl-empty strong { font-size: 15.5px; } .mpl-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); }

@media (max-width: 1000px) { .mpl-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .ps-page.mpl { padding: 10px 10px 24px !important; }
  .mpl-head { grid-template-columns: minmax(0, 1fr); }
  .mpl-actions .ps-btn { width: 100%; justify-content: center; }
  .mpl-search { flex-basis: 100%; }
  .mpl-search input { font-size: 16px; }
  .mpl-seg { overflow-x: auto; max-width: 100%; }
  .mpl-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
}
`
