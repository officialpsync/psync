"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Ticket, Eye, EyeOff, IndianRupee, Users, Pencil, CalendarClock, Repeat } from "lucide-react";
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

const TONES = ["blue", "green", "purple", "amber"] as const;

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

  return (
    <div className="ps-page db">
      <DesignStyles />

      {/* Header */}
      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Business</div>
          <h1 className="db-title">Membership plans</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{stats.active}</strong> plan{stats.active === 1 ? "" : "s"} available to new members</>}
          </p>
        </div>
        <div className="db-header-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={openNew}>
            <Plus size={16} strokeWidth={2.4} /> <span>New plan</span>
          </button>
        </div>
      </header>

      {/* Summary — one compact bar, so it doesn't compete with the plan cards */}
      <div className="db-card db-statbar">
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Eye size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Available</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : <>{stats.active}<span className="db-stat-note">{stats.hidden} hidden</span></>}</div>
          </div>
        </div>
        <div className="db-stat db-tone-green">
          <span className="db-chip"><Users size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Members on a plan</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : stats.members}</div>
          </div>
        </div>
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><IndianRupee size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Monthly value</div>
            <div className="db-stat-value">{loading ? <Skeleton w={70} h={20} /> : formatINR(stats.mrr)}</div>
          </div>
        </div>
        <div className="db-stat db-tone-amber">
          <span className="db-chip"><Ticket size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Most popular</div>
            <div className="db-stat-value">{loading ? <Skeleton w={70} h={20} /> : stats.top ? stats.top.name : "—"}</div>
          </div>
        </div>
      </div>

      {!loading && plans.length > 0 && (
        <div className="db-section-head">
          <h2 className="db-section-title" style={{ margin: 0 }}>Your plans</h2>
          <span className="db-card-sub" style={{ marginTop: 0 }}>{plans.length} total</span>
        </div>
      )}

      {/* Plans */}
      {loading ? (
        <div className="db-plans">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} w="100%" h={220} r={20} />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty" style={{ padding: "40px 16px" }}>
            <span className="db-empty-icon"><Ticket size={18} /></span>
            <div className="db-empty-title">No plans yet</div>
            <div className="db-empty-text">Create a plan like “Monthly” or “Annual” so you can assign it to members.</div>
            <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={openNew}>
              <Plus size={16} /> New plan
            </button>
          </div>
        </div>
      ) : (
        <div className="db-plans">
          {plans.map((p, i) => {
            const tone = TONES[i % TONES.length];
            const count = memberCounts[p.id] || 0;
            const monthly = perMonth(p);
            return (
              <article key={p.id} className={`db-card db-plan db-tone-${tone}`} data-inactive={!p.is_active}>
                <div className="db-plan-head">
                  <span className="db-chip db-chip--lg">
                    {p.plan_type === "session" ? <Repeat size={18} /> : <CalendarClock size={18} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="db-plan-name">{p.name}</div>
                    <div className="db-card-sub">{p.plan_type === "session" ? "Session based" : "Time based"} · {p.duration_days} days</div>
                  </div>
                  {!p.is_active && <span className="db-pill db-pill--muted"><EyeOff size={11} /> Hidden</span>}
                </div>

                <div className="db-plan-price">
                  {formatINR(p.price_paise)}
                  <span className="db-plan-per">/ {periodLabel(p.duration_days)}</span>
                </div>
                {monthly !== null && <div className="db-card-sub">≈ {formatINR(monthly)} a month</div>}

                {p.description && <p className="db-plan-desc">{p.description}</p>}

                <div className="db-plan-members">
                  <Users size={14} />
                  <span><strong>{count}</strong> active member{count === 1 ? "" : "s"}</span>
                </div>

                <div className="db-plan-foot">
                  <label className="db-plan-toggle">
                    <input type="checkbox" className="db-switch" checked={p.is_active} onChange={() => toggleActive(p)} aria-label={`${p.name} available`} />
                    <span>{p.is_active ? "Available" : "Hidden"}</span>
                  </label>
                  <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => openEdit(p)}>
                    <Pencil size={13} /> Edit
                  </button>
                </div>
              </article>
            );
          })}

          <button type="button" className="db-plan-add" onClick={openNew}>
            <span className="db-empty-icon"><Plus size={18} /></span>
            <span className="db-plan-name">New plan</span>
            <span className="db-card-sub">Monthly, annual, couple, student…</span>
          </button>
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
                  {pd.label}
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
