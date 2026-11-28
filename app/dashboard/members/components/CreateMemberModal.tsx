"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  X, UserPlus, Check, Copy, MessageCircle, Sparkles, Send,
  Calendar, CreditCard, ChevronRight, RefreshCw, ExternalLink,
  User, Smartphone, Mail, ShieldCheck, Dumbbell, Tag
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatINR } from "../../components/ui";

const supabase = createClient();

type Plan = {
  id: string;
  name: string;
  duration_days: number | null;
  price_paise: number;
  plan_type: string;
};

type Branch = {
  id: string;
  name: string;
};

type StaffMember = {
  id: string;
  name: string;
  role: string | null;
};

type PaymentMethod = "cash" | "upi" | "card" | "online";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  orgId: string;
};

export function CreateMemberModal({ open, onClose, onCreated, orgId }: Props) {
  // Option lists
  const [branches, setBranches] = useState<Branch[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [trainers, setTrainers] = useState<StaffMember[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female" | "other">("");
  const [dob, setDob] = useState("");
  const [branchId, setBranchId] = useState("");

  // Membership Setup
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  // Onboarding Form Toggle & Config
  const [sendOnboarding, setSendOnboarding] = useState(true);
  const [assignedTrainerId, setAssignedTrainerId] = useState("");
  const [includePersonal, setIncludePersonal] = useState(true);
  const [includeHealth, setIncludeHealth] = useState(true);
  const [includeGoals, setIncludeGoals] = useState(true);
  const [includeDiet, setIncludeDiet] = useState(true);

  // Execution & UI State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Success view state
  const [dispatchedData, setDispatchedData] = useState<{
    memberId: string;
    memberName: string;
    phone: string;
    planName?: string;
    universalLink?: string;
  } | null>(null);

  // Fetch branches, active plans, trainers
  useEffect(() => {
    if (!open || !orgId) return;

    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [
          { data: branchData },
          { data: planData },
          { data: staffData }
        ] = await Promise.all([
          supabase.from("branches").select("id, name").eq("org_id", orgId).order("name"),
          supabase.from("membership_plans").select("id, name, duration_days, price_paise, plan_type").eq("org_id", orgId).eq("is_active", true).order("name"),
          supabase.from("staff").select("id, name, role").eq("org_id", orgId).eq("is_active", true).order("name"),
        ]);

        if (branchData) {
          setBranches(branchData);
          if (branchData.length === 1 && !branchId) {
            setBranchId(branchData[0].id);
          }
        }
        if (planData) setPlans(planData);
        if (staffData) setTrainers(staffData);
      } catch (err) {
        console.error("Error loading modal options:", err);
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, [open, orgId]);

  // Reset form
  const handleResetForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setSex("");
    setDob("");
    setPlanId("");
    setStartDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("cash");
    setSendOnboarding(true);
    setAssignedTrainerId("");
    setError("");
    setDispatchedData(null);
  };

  if (!open) return null;

  const selectedPlan = plans.find((p) => p.id === planId);

  // Handle Save
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Please enter the member's full name");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter member's phone number for identification & onboarding");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // 1. Insert Member
      const { data: member, error: memberErr } = await supabase
        .from("members")
        .insert({
          org_id: orgId,
          branch_id: branchId || null,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          whatsapp_number: phone.trim() || null,
          email: email.trim() || null,
          sex: sex || null,
          date_of_birth: dob || null,
          status: selectedPlan ? "active" : "inactive",
        })
        .select()
        .single();

      if (memberErr || !member) {
        throw new Error(memberErr?.message || "Failed to create member");
      }

      // 2. Insert Membership & Payment (if plan was chosen)
      if (selectedPlan && startDate) {
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(start);
        end.setDate(end.getDate() + (selectedPlan.duration_days || 30));
        const iso = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const { data: membership } = await supabase
          .from("memberships")
          .insert({
            org_id: orgId,
            member_id: member.id,
            plan_id: selectedPlan.id,
            branch_id: branchId || null,
            start_date: iso(start),
            end_date: iso(end),
            status: "active",
          })
          .select()
          .single();

        await supabase.from("payments").insert({
          org_id: orgId,
          member_id: member.id,
          membership_id: membership?.id || null,
          branch_id: branchId || null,
          amount_paise: selectedPlan.price_paise,
          total_paise: selectedPlan.price_paise,
          method: paymentMethod,
          status: "paid",
          notes: `${selectedPlan.name} membership fee`,
        });
      }

      // 3. Generate & Dispatch Onboarding Form if enabled
      let formLink = "";
      if (sendOnboarding) {
        try {
          const res = await fetch("/api/portal/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              member_id: member.id,
              assigned_trainer_id: assignedTrainerId || null,
              prefilled_data: {
                full_name: member.full_name,
                phone: member.phone,
                email: member.email,
              },
              custom_config: {
                include_personal: includePersonal,
                include_health: includeHealth,
                include_goals: includeGoals,
                include_diet: includeDiet,
                excluded_fields: [],
                custom_questions: [],
              },
            }),
          });

          const onbData = await res.json();
          if (res.ok && onbData.universalLink) {
            formLink = onbData.universalLink;
          }
        } catch (onbErr) {
          console.warn("Onboarding form dispatch warning:", onbErr);
        }
      }

      // Trigger table refresh
      if (onCreated) onCreated();

      // Show success screen or close
      if (sendOnboarding && formLink) {
        setDispatchedData({
          memberId: member.id,
          memberName: member.full_name,
          phone: member.phone || "",
          planName: selectedPlan?.name,
          universalLink: formLink,
        });
      } else {
        handleResetForm();
        onClose();
      }
    } catch (err: any) {
      console.error("Error creating member:", err);
      setError(err?.message || "Failed to create member. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Copy link
  const handleCopyLink = () => {
    if (!dispatchedData?.universalLink) return;
    navigator.clipboard.writeText(dispatchedData.universalLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  // WhatsApp share
  const handleShareWhatsApp = () => {
    if (!dispatchedData?.universalLink) return;
    const clean = dispatchedData.phone.replace(/\D/g, "");
    const phoneWithCountry = clean.length === 10 ? `91${clean}` : clean;
    const msg = encodeURIComponent(
      `Hi ${dispatchedData.memberName}, welcome to the gym! Please complete your fitness onboarding questionnaire so we can prepare your workout & diet plans:\n\n${dispatchedData.universalLink}`
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, "_blank");
  };

  return (
    <div
      className="cm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <style>{`
        .cm-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.72);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .cm-modal {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          width: 100%;
          max-width: 620px;
          max-height: 92vh;
          overflow-y: auto;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
          position: relative;
          display: flex;
          flex-direction: column;
          color: var(--text-primary);
        }
        .cm-header {
          padding: 18px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          background-color: var(--surface);
          z-index: 10;
        }
        .cm-close-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 150ms ease, color 150ms ease;
        }
        .cm-close-btn:hover {
          background-color: var(--fill);
          color: var(--text-primary);
        }
        .cm-input, .cm-select {
          width: 100%;
          border-radius: 9px;
          border: 1px solid var(--border);
          background-color: var(--surface-2);
          color: var(--text-primary);
          font-size: 13.5px;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .cm-input:focus, .cm-select:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
        .cm-input::placeholder {
          color: var(--text-tertiary);
        }
        .cm-select option {
          background-color: var(--surface);
          color: var(--text-primary);
        }
        html.dark .cm-modal,
        html[data-theme="dark"] .cm-modal {
          color-scheme: dark;
          background-color: var(--surface);
          border-color: var(--border);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
        }
        html.dark .cm-input,
        html[data-theme="dark"] .cm-input,
        html.dark .cm-select,
        html[data-theme="dark"] .cm-select {
          color-scheme: dark;
          background-color: var(--surface-2);
          border-color: var(--border);
          color: var(--text-primary);
        }
        html.dark .cm-select option,
        html[data-theme="dark"] .cm-select option {
          background-color: #15171e;
          color: #f4f5f8;
        }
        html.dark input[type="date"].cm-input::-webkit-calendar-picker-indicator,
        html[data-theme="dark"] input[type="date"].cm-input::-webkit-calendar-picker-indicator {
          filter: invert(0.85);
        }
        .cm-box {
          background-color: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        .cm-chip {
          padding: 5px 12px;
          border-radius: 7px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 140ms ease;
          border: 1px solid var(--border);
          background-color: var(--surface);
          color: var(--text-secondary);
        }
        .cm-chip[data-active="true"] {
          border-color: #10b981;
          background-color: rgba(16, 185, 129, 0.16);
          color: #10b981;
        }
        .cm-footer {
          padding: 14px 24px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          background-color: var(--surface);
          position: sticky;
          bottom: 0;
          z-index: 5;
        }
        .cm-btn-secondary {
          padding: 9px 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background-color: transparent;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease;
        }
        .cm-btn-secondary:hover {
          background-color: var(--fill);
          color: var(--text-primary);
        }
      `}</style>

      <div className="cm-modal">
        {/* Modal Header */}
        <div className="cm-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: "rgba(16, 185, 129, 0.14)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UserPlus size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16.5, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                {dispatchedData ? "Member Enrolled Successfully" : "Add New Member"}
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, marginTop: 1 }}>
                {dispatchedData ? "Share digital onboarding form with the member" : "Quick enrollment with digital onboarding link"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="cm-close-btn"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* VIEW 1: SUCCESS & SHARE SCREEN */}
        {dispatchedData ? (
          <div style={{ padding: "26px 24px" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Check size={28} strokeWidth={2.5} />
              </div>
              <h4 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>
                {dispatchedData.memberName} Registered!
              </h4>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                {dispatchedData.planName ? `Subscribed to ${dispatchedData.planName}` : "Member profile created in gym database"}
              </p>
            </div>

            {/* Link Box */}
            <div
              className="cm-box"
              style={{
                padding: 16,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={14} color="#10b981" />
                  Digital Onboarding Questionnaire
                </span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Valid for 14 days</span>
              </div>

              <div
                style={{
                  fontSize: 12,
                  fontFamily: "monospace",
                  padding: "9px 12px",
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 12,
                }}
              >
                {dispatchedData.universalLink}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: "#25D366",
                    color: "#ffffff",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(37, 211, 102, 0.25)",
                  }}
                >
                  <MessageCircle size={16} />
                  <span>Send on WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: copiedLink ? "#10b981" : "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {copiedLink ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                  <span>{copiedLink ? "Link Copied!" : "Copy Link"}</span>
                </button>
              </div>
            </div>

            {/* Navigation buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleResetForm}
                className="cm-btn-secondary"
              >
                + Enroll Another Member
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href={`/dashboard/members/${dispatchedData.memberId}`}
                  onClick={onClose}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 8,
                    backgroundColor: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  <span>View Member Profile</span>
                  <ExternalLink size={14} />
                </Link>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* VIEW 2: REGISTRATION FORM */
          <form onSubmit={handleCreateMember} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px" }}>
              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.28)",
                    color: "#ef4444",
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  {error}
                </div>
              )}

              {/* 1. Basic Details */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Required Member Details
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                      Full Name <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <User size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rahul Sharma"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="cm-input"
                        style={{ padding: "8px 12px 8px 32px" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                      Phone / WhatsApp <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <Smartphone size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                      <input
                        type="tel"
                        required
                        placeholder="10-digit number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="cm-input"
                        style={{ padding: "8px 12px 8px 32px" }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                      Email <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-tertiary)" }}>(optional)</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <Mail size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                      <input
                        type="email"
                        placeholder="member@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="cm-input"
                        style={{ padding: "8px 12px 8px 32px" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                      Gender
                    </label>
                    <select
                      value={sex}
                      onChange={(e) => setSex(e.target.value as any)}
                      className="cm-select"
                      style={{ padding: "8px 10px" }}
                    >
                      <option value="">Select...</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {branches.length > 1 ? (
                    <div>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                        Branch
                      </label>
                      <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        className="cm-select"
                        style={{ padding: "8px 10px" }}
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="cm-input"
                        style={{ padding: "7px 10px", fontSize: 12.5 }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Membership Plan (Optional) */}
              <div
                className="cm-box"
                style={{
                  padding: "14px 16px",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                    <CreditCard size={14} color="#3b82f6" />
                    <span>Membership Plan & Payment</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Optional now</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: selectedPlan ? "1.4fr 1fr 1fr" : "1fr", gap: 10 }}>
                  <div>
                    <select
                      value={planId}
                      onChange={(e) => setPlanId(e.target.value)}
                      className="cm-select"
                      style={{
                        padding: "8px 10px",
                        backgroundColor: "var(--surface)",
                      }}
                    >
                      <option value="">-- No plan yet (Trial / Free) --</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {formatINR(p.price_paise)} ({p.duration_days ? `${p.duration_days} days` : "Monthly"})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPlan && (
                    <>
                      <div>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="cm-input"
                          style={{
                            padding: "7px 10px",
                            fontSize: 12.5,
                            backgroundColor: "var(--surface)",
                          }}
                        />
                      </div>

                      <div>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as any)}
                          className="cm-select"
                          style={{
                            padding: "8px 10px",
                            backgroundColor: "var(--surface)",
                          }}
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="card">Card</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Digital Onboarding Form Section */}
              <div
                style={{
                  border: sendOnboarding ? "1.5px solid #10b981" : "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  backgroundColor: sendOnboarding ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2)",
                  transition: "all 150ms ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={sendOnboarding}
                      onChange={(e) => setSendOnboarding(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
                    />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>Share Digital Onboarding Form</span>
                        <Sparkles size={14} color="#10b981" />
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        Generates secure link for member to complete health, diet & workout goals
                      </div>
                    </div>
                  </label>
                </div>

                {sendOnboarding && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--border)" }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 5 }}>
                        Assign Dedicated Trainer (Optional)
                      </label>
                      <select
                        value={assignedTrainerId}
                        onChange={(e) => setAssignedTrainerId(e.target.value)}
                        className="cm-select"
                        style={{
                          padding: "7px 10px",
                          fontSize: 12.5,
                          backgroundColor: "var(--surface)",
                        }}
                      >
                        <option value="">-- No specific trainer --</option>
                        {trainers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.role || "Trainer"})</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "Personal Info", state: includePersonal, set: setIncludePersonal },
                        { label: "Medical & Health", state: includeHealth, set: setIncludeHealth },
                        { label: "Fitness Goals", state: includeGoals, set: setIncludeGoals },
                        { label: "Diet & Nutrition", state: includeDiet, set: setIncludeDiet },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          data-active={item.state}
                          onClick={() => item.set(!item.state)}
                          className="cm-chip"
                        >
                          {item.state && <Check size={12} />}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="cm-footer">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="cm-btn-secondary"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 20px",
                  borderRadius: 8,
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
                }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Creating Member...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={15} />
                    <span>{sendOnboarding ? "Create & Share Form" : "Create Member"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
