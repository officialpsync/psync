"use client";

import { useState } from "react";
import {
  X,
  Send,
  Check,
  Copy,
  MessageCircle,
  Sparkles,
  ShieldAlert,
  Loader2,
  FileText,
  User,
  HeartPulse,
  Target,
  Salad,
  ExternalLink,
} from "lucide-react";

type Member = {
  id: string;
  org_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  member_code?: string | null;
  branches?: { name: string } | null;
};

type Props = {
  member: Member;
  trainerName?: string;
  onClose: () => void;
  onDispatched?: (form: any) => void;
};

export function SendOnboardingSheet({ member, trainerName = "Psync Trainer", onClose, onDispatched }: Props) {
  const [includePersonal, setIncludePersonal] = useState(true);
  const [includeHealth, setIncludeHealth] = useState(true);
  const [includeGoals, setIncludeGoals] = useState(true);
  const [includeDiet, setIncludeDiet] = useState(true);

  const [assignedTrainer, setAssignedTrainer] = useState(trainerName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dispatchedResult, setDispatchedResult] = useState<{
    formId: string;
    universalLink: string;
    deepLink: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const prefilled = {
    full_name: member.full_name,
    member_code: member.member_code || `MBR-${member.id.slice(0, 6).toUpperCase()}`,
    phone: member.phone || "",
    email: member.email || "",
    assigned_trainer: assignedTrainer,
  };

  async function handleDispatch() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          assigned_trainer_id: null,
          prefilled_data: prefilled,
          custom_config: {
            include_personal: includePersonal,
            include_health: includeHealth,
            include_goals: includeGoals,
            include_diet: includeDiet,
            excluded_fields: [],
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch onboarding form");

      setDispatchedResult({
        formId: data.formId,
        universalLink: data.universalLink,
        deepLink: data.deepLink,
      });

      if (onDispatched) onDispatched(data);
    } catch (err: any) {
      setError(err.message || "Failed to dispatch form");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!dispatchedResult) return;
    navigator.clipboard.writeText(dispatchedResult.universalLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  }

  function handleOpenWhatsApp() {
    if (!dispatchedResult || !member.phone) return;
    const cleanPhone = member.phone.replace(/\D/g, "");
    const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(
      `Hi ${member.full_name}, please complete your Psync gym onboarding & fitness questionnaire to receive your customized workout and diet plans:\n\n${dispatchedResult.universalLink}`
    );
    window.open(`https://api.whatsapp.com/send?phone=${formatted}&text=${msg}`, "_blank");
  }

  return (
    <div className="ps-sheet-root" data-open="true">
      <div className="ps-sheet-backdrop" onClick={onClose} />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "540px" } as React.CSSProperties}
        role="dialog"
        aria-modal
        aria-label="Send Member Onboarding Form"
      >
        <div className="ps-sheet-header" style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Send Onboarding Form
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.825rem", color: "var(--text-tertiary)" }}>
                Specification v1.0 • Form sent to member app to feed AI diet & workout generator
              </p>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {error && (
            <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.1)", borderRadius: 8, color: "#ef4444", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          {!dispatchedResult ? (
            <>
              {/* Category 1: Pre-filled Snapshot */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
                    1. Client Details (Pre-filled & Locked)
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", background: "var(--surface-sunken)", padding: "2px 6px", borderRadius: 4 }}>
                    Mandatory
                  </span>
                </div>
                <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.85rem" }}>
                  <div>
                    <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: "0.75rem" }}>Name</span>
                    <strong style={{ color: "var(--text-primary)" }}>{prefilled.full_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: "0.75rem" }}>Client Code</span>
                    <strong style={{ color: "var(--text-primary)" }}>{prefilled.member_code}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: "0.75rem" }}>Mobile</span>
                    <span style={{ color: "var(--text-secondary)" }}>{prefilled.phone || "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: "0.75rem" }}>Email</span>
                    <span style={{ color: "var(--text-secondary)" }}>{prefilled.email || "—"}</span>
                  </div>
                  <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                    <label style={{ color: "var(--text-tertiary)", display: "block", fontSize: "0.75rem", marginBottom: 4 }}>
                      Assigned Trainer
                    </label>
                    <input
                      type="text"
                      className="ps-input"
                      value={assignedTrainer}
                      onChange={(e) => setAssignedTrainer(e.target.value)}
                      placeholder="Trainer name..."
                      style={{ fontSize: "0.85rem", height: 34 }}
                    />
                  </div>
                </div>
              </div>

              {/* Sections Customizer Selection */}
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700, display: "block", marginBottom: 10 }}>
                  Customize Sections to Send
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      background: includePersonal ? "rgba(59, 130, 246, 0.05)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <User size={16} color="var(--primary)" />
                      <div>
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>2. Personal and Contact</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                          DOB, gender, height (cm/ft), weight (kg/lb), address, WhatsApp, emergency contact
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includePersonal}
                      onChange={(e) => setIncludePersonal(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      background: includeHealth ? "rgba(59, 130, 246, 0.05)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <HeartPulse size={16} color="#ef4444" />
                      <div>
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>3. Health and Medical</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                          Medical conditions, injuries, doctor restrictions, S3 medical report uploads
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeHealth}
                      onChange={(e) => setIncludeHealth(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      background: includeGoals ? "rgba(59, 130, 246, 0.05)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Target size={16} color="#10b981" />
                      <div>
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>4. Goals and Lifestyle</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                          Primary goal, training experience, workout days/week, sleep, stress, water intake
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeGoals}
                      onChange={(e) => setIncludeGoals(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                    />
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      background: includeDiet ? "rgba(59, 130, 246, 0.05)" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Salad size={16} color="#f59e0b" />
                      <div>
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>5. Food and Diet</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                          Dietary preference, allergies, meal frequency, Indian food staples enjoy/dislike
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={includeDiet}
                      onChange={(e) => setIncludeDiet(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "var(--primary)" }}
                    />
                  </label>
                </div>
              </div>
            </>
          ) : (
            /* Dispatched Confirmation Screen */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                    color: "#10b981",
                  }}
                >
                  <Check size={28} />
                </div>
                <h4 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700 }}>
                  Onboarding Form Dispatched!
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  The member will see this in their Psync App. You can also share the link directly.
                </p>
              </div>

              <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600 }}>
                  UNIVERSAL ONBOARDING LINK
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={dispatchedResult.universalLink}
                    className="ps-input"
                    style={{ fontSize: "0.825rem", background: "var(--surface)" }}
                  />
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary"
                    onClick={handleCopy}
                    style={{ flexShrink: 0 }}
                  >
                    {copiedLink ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    {copiedLink ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {member.phone && (
                <button
                  type="button"
                  className="ps-btn"
                  onClick={handleOpenWhatsApp}
                  style={{
                    background: "#25D366",
                    color: "#fff",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 18px",
                    borderRadius: 8,
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  <MessageCircle size={18} />
                  Send Directly on WhatsApp
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ps-sheet-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>
            {dispatchedResult ? "Done" : "Cancel"}
          </button>
          {!dispatchedResult && (
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={handleDispatch}
              disabled={loading || (!includePersonal && !includeHealth && !includeGoals && !includeDiet)}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              {loading ? <Loader2 size={15} className="ps-spin" /> : <Send size={15} />}
              Dispatch to Member
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
