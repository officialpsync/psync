"use client";

import { useEffect, useState } from "react";
import { X, Calendar, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatINR, Segmented, Skeleton } from "../../components/ui";

const supabase = createClient();

type RenewalPlan = {
  id: string;
  name: string;
  duration_days: number | null;
  price_paise: number;
  plan_type: string;
};

type Method = "cash" | "upi" | "card" | "online";

export function RenewalSheet({
  member,
  orgId,
  currentPlanId,
  onClose,
  onDone,
  onError,
}: {
  member: {
    id: string;
    org_id?: string;
    full_name: string;
    phone?: string | null;
  } | null;
  orgId: string;
  currentPlanId?: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError?: (msg: string) => void;
}) {
  const [plans, setPlans] = useState<RenewalPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(currentPlanId ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("cash");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member || !orgId) return;
    setLoading(true);
    setStartDate(new Date().toISOString().slice(0, 10));

    async function load() {
      try {
        const { data, error } = await supabase
          .from("membership_plans")
          .select("id, name, duration_days, price_paise, plan_type")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("price_paise");

        if (error) throw error;
        const list = (data as RenewalPlan[]) || [];
        setPlans(list);
        if (list.length > 0) {
          if (!currentPlanId || !list.some((p) => p.id === currentPlanId)) {
            setSelectedPlanId(list[0].id);
          } else {
            setSelectedPlanId(currentPlanId);
          }
        }
      } catch (err: any) {
        console.error("Error loading plans for renewal:", err);
        onError?.(err?.message || "Failed to load membership plans");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [member, orgId, currentPlanId, onError]);

  if (!member) return null;

  const selected = plans.find((p) => p.id === selectedPlanId);

  async function handleRenew() {
    if (!selected || !member) return;
    setSaving(true);
    try {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + (selected.duration_days || 30));
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // 1. Expire any currently active membership
      await supabase
        .from("memberships")
        .update({ status: "expired" })
        .eq("member_id", member.id)
        .eq("status", "active");

      // 2. Insert new active membership
      const { data: newMembership, error: memErr } = await supabase
        .from("memberships")
        .insert({
          org_id: orgId,
          member_id: member.id,
          plan_id: selected.id,
          start_date: iso(start),
          end_date: iso(end),
          status: "active",
        })
        .select()
        .single();

      if (memErr) throw memErr;

      // 3. Record payment
      await supabase.from("payments").insert({
        org_id: orgId,
        member_id: member.id,
        membership_id: newMembership?.id ?? null,
        amount_paise: selected.price_paise,
        total_paise: selected.price_paise,
        method,
        status: "paid",
        notes: `${selected.name} renewal`,
      });

      // 4. Mark member as active
      await supabase.from("members").update({ status: "active" }).eq("id", member.id);

      onDone(`Renewed ${member.full_name}'s membership with ${selected.name}`);
      onClose();
    } catch (err: any) {
      console.error("Failed to renew membership:", err);
      onError?.(err?.message || "Renewal failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={`Renew membership for ${member.full_name}`}
      >
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Renew membership</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {member.full_name} · Pick a plan and record payment
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "12px 16px 0" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
                  <Skeleton w={36} h={36} r={10} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton w={160} h={13} />
                    <Skeleton w={100} h={11} />
                  </div>
                </div>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="ps-empty" style={{ padding: "32px 0" }}>
              <div className="ps-empty-title">No active plans</div>
              <div className="ps-empty-text">Create a membership plan first.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlanId(p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: 12,
                    width: "100%",
                    textAlign: "left",
                    border:
                      selectedPlanId === p.id
                        ? "2px solid var(--accent, #0a84ff)"
                        : "1.5px solid var(--border, rgba(0,0,0,0.08))",
                    background:
                      selectedPlanId === p.id
                        ? "var(--accent-dim, rgba(10,132,255,0.08))"
                        : "var(--surface, #ffffff)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="ps-cell-title"
                      style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}
                    >
                      {p.name}
                    </div>
                    <div
                      className="ps-cell-sub"
                      style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}
                    >
                      {p.duration_days ? `${p.duration_days} days` : "Session-based"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color:
                          selectedPlanId === p.id
                            ? "var(--accent, #0a84ff)"
                            : "var(--text-primary)",
                      }}
                    >
                      {formatINR(p.price_paise)}
                    </span>
                    {selectedPlanId === p.id && (
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "var(--accent, #0a84ff)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L4 7L9 1"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {plans.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
              <div className="ps-field">
                <label
                  className="ps-label"
                  htmlFor="renew-start"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}
                >
                  <Calendar size={13} />
                  Starts on
                </label>
                <input
                  id="renew-start"
                  type="date"
                  className="ps-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ height: 40, width: "100%", color: "var(--text-primary)", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", padding: "0 10px" }}
                />
              </div>
              <div className="ps-field">
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Paid by</span>
                <Segmented<Method>
                  block
                  label="Payment method"
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "upi", label: "UPI" },
                    { value: "card", label: "Card" },
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        {plans.length > 0 && (
          <div className="ps-sheet-footer" style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px", borderTop: "1px solid var(--border, rgba(0,0,0,0.08))", marginTop: 16 }}>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose} style={{ padding: "0 16px", height: 38, borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "transparent", cursor: "pointer" }}>
              Cancel
            </button>
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={handleRenew}
              disabled={!selectedPlanId || saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "0 20px",
                height: 38,
                borderRadius: 8,
                background: "var(--accent, #0a84ff)",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                cursor: !selectedPlanId || saving ? "not-allowed" : "pointer",
                opacity: !selectedPlanId || saving ? 0.6 : 1,
              }}
            >
              {saving && <Loader2 size={15} className="ps-spin" />}
              {saving ? "Renewing…" : selected ? `Renew — ${formatINR(selected.price_paise)}` : "Renew"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
