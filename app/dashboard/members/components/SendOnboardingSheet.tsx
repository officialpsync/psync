"use client";

import { useEffect, useState } from "react";
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
  Plus,
  Trash2,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type Member = {
  id: string;
  org_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  member_code?: string | null;
  branches?: { name: string } | null;
};

export type CustomQuestion = {
  id: string;
  question: string;
  type: "text" | "yes_no" | "choice";
  options?: string[];
  required?: boolean;
};

type Props = {
  member: Member;
  trainerName?: string;
  onClose: () => void;
  onDispatched?: (form: any) => void;
};

const QUICK_QUESTION_TEMPLATES: { question: string; type: "text" | "yes_no" | "choice"; options?: string[] }[] = [
  { question: "Any previous gym injuries, fractures or surgeries?", type: "text" },
  { question: "Do you currently consume whey protein or other supplements?", type: "yes_no" },
  { question: "What is your target timeline for seeing fitness results?", type: "choice", options: ["1-3 Months", "3-6 Months", "6-12 Months", "Long term lifestyle"] },
  { question: "How many hours of cardio or sports do you do weekly?", type: "choice", options: ["None", "1-2 hours", "3-5 hours", "5+ hours"] },
  { question: "Any specific areas or muscle groups you want to focus on?", type: "text" },
];

export function SendOnboardingSheet({ member, trainerName = "Psync Trainer", onClose, onDispatched }: Props) {
  const [includePersonal, setIncludePersonal] = useState(true);
  const [includeHealth, setIncludeHealth] = useState(true);
  const [includeGoals, setIncludeGoals] = useState(true);
  const [includeDiet, setIncludeDiet] = useState(true);

  // Trainer selection state
  const [trainers, setTrainers] = useState<{ id: string; name: string; role: string; user_id?: string | null }[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(true);
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("");
  const [assignedTrainer, setAssignedTrainer] = useState(trainerName);

  // Custom questions state
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<"text" | "yes_no" | "choice">("text");
  const [newQuestionOptions, setNewQuestionOptions] = useState("");
  const [newQuestionRequired, setNewQuestionRequired] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dispatchedResult, setDispatchedResult] = useState<{
    formId: string;
    universalLink: string;
    deepLink: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load available gym trainers
  useEffect(() => {
    async function fetchTrainers() {
      try {
        setLoadingTrainers(true);
        const { data, error: staffErr } = await supabase
          .from("staff")
          .select("id, name, role, is_active, user_id")
          .eq("org_id", member.org_id)
          .eq("is_active", true)
          .order("name");

        if (!staffErr && data && data.length > 0) {
          setTrainers(data);
          // Find matching trainer or first staff
          const matched = data.find((s) => s.name.toLowerCase() === trainerName.toLowerCase()) ||
            data.find((s) => s.role === "trainer") ||
            data[0];
          if (matched) {
            setSelectedTrainerId(matched.id);
            setAssignedTrainer(matched.name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch trainers:", err);
      } finally {
        setLoadingTrainers(false);
      }
    }

    fetchTrainers();
  }, [member.org_id, trainerName]);

  const prefilled = {
    full_name: member.full_name,
    member_code: member.member_code || `MBR-${member.id.slice(0, 6).toUpperCase()}`,
    phone: member.phone || "",
    email: member.email || "",
    assigned_trainer: assignedTrainer,
    assigned_trainer_id: selectedTrainerId || null,
  };

  function handleAddCustomQuestion() {
    if (!newQuestionText.trim()) return;
    const opts = newQuestionType === "choice"
      ? newQuestionOptions.split(",").map((o) => o.trim()).filter(Boolean)
      : undefined;

    const newQ: CustomQuestion = {
      id: crypto.randomUUID(),
      question: newQuestionText.trim(),
      type: newQuestionType,
      options: opts && opts.length > 0 ? opts : undefined,
      required: newQuestionRequired,
    };

    setCustomQuestions((prev) => [...prev, newQ]);
    setNewQuestionText("");
    setNewQuestionOptions("");
    setNewQuestionType("text");
    setNewQuestionRequired(false);
    setShowAddQuestion(false);
  }

  function handleQuickAddQuestion(template: typeof QUICK_QUESTION_TEMPLATES[0]) {
    if (customQuestions.some((q) => q.question.toLowerCase() === template.question.toLowerCase())) return;
    const newQ: CustomQuestion = {
      id: crypto.randomUUID(),
      question: template.question,
      type: template.type,
      options: template.options,
      required: false,
    };
    setCustomQuestions((prev) => [...prev, newQ]);
  }

  function handleRemoveQuestion(id: string) {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function handleDispatch() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          assigned_trainer_id: selectedTrainerId || null,
          prefilled_data: prefilled,
          custom_config: {
            include_personal: includePersonal,
            include_health: includeHealth,
            include_goals: includeGoals,
            include_diet: includeDiet,
            excluded_fields: [],
            custom_questions: customQuestions,
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
        style={{ "--sheet-w": "580px" } as React.CSSProperties}
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
                Sent to member's Psync app & WhatsApp • Syncs with DB and AI workout/diet generators
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
              {/* Category 1: Pre-filled Snapshot & Trainer Selection */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
                    1. Client Details & Assigned Trainer
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

                  {/* Trainer Dropdown Selection */}
                  <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <label style={{ color: "var(--text-primary)", display: "block", fontSize: "0.785rem", fontWeight: 600 }}>
                        Select Assigned Trainer
                      </label>
                      <span style={{ fontSize: "0.7rem", color: "var(--primary)", fontWeight: 600 }}>
                        {trainers.length > 0 ? `${trainers.length} staff available` : "Default trainer"}
                      </span>
                    </div>

                    <select
                      className="ps-input"
                      value={selectedTrainerId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedTrainerId(val);
                        const found = trainers.find((t) => t.id === val);
                        if (found) {
                          setAssignedTrainer(found.name);
                        } else if (val === "__custom__") {
                          setAssignedTrainer("Psync Fitness Trainer");
                        }
                      }}
                      style={{ fontSize: "0.85rem", height: 38, width: "100%" }}
                    >
                      {trainers.length === 0 ? (
                        <option value="">{loadingTrainers ? "Loading gym trainers..." : "Psync Fitness Staff"}</option>
                      ) : (
                        trainers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.role ? t.role.charAt(0).toUpperCase() + t.role.slice(1) : "Staff"})
                          </option>
                        ))
                      )}
                      <option value="__custom__">Custom / General Psync Staff</option>
                    </select>

                    {selectedTrainerId === "__custom__" && (
                      <input
                        type="text"
                        className="ps-input"
                        value={assignedTrainer}
                        onChange={(e) => setAssignedTrainer(e.target.value)}
                        placeholder="Enter custom trainer name..."
                        style={{ fontSize: "0.85rem", height: 34, marginTop: 6 }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Sections Customizer Selection */}
              <div>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700, display: "block", marginBottom: 10 }}>
                  Customize Standard Sections to Send
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
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>Personal and Contact</strong>
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
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>Health and Medical</strong>
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
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>Goals and Lifestyle</strong>
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
                        <strong style={{ fontSize: "0.875rem", display: "block" }}>Food and Diet</strong>
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

              {/* Custom Questions Section */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <HelpCircle size={15} color="var(--primary)" />
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-primary)", fontWeight: 700 }}>
                      Custom Questions for Member
                    </span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600 }}>
                    {customQuestions.length} added
                  </span>
                </div>

                {/* List of current custom questions */}
                {customQuestions.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {customQuestions.map((q, idx) => (
                      <div
                        key={q.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "var(--surface-sunken)",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: "0.725rem", fontWeight: 700, color: "var(--text-tertiary)" }}>
                            Q{idx + 1}
                          </span>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {q.question}
                          </span>
                          <span
                            style={{
                              fontSize: "0.685rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgba(59, 130, 246, 0.12)",
                              color: "var(--primary)",
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {q.type === "yes_no" ? "Yes/No" : q.type === "choice" ? "Choice" : "Text"}
                          </span>
                          {q.required && (
                            <span style={{ fontSize: "0.685rem", color: "#ef4444", fontWeight: 700, flexShrink: 0 }}>
                              Required
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="ps-icon-btn"
                          onClick={() => handleRemoveQuestion(q.id)}
                          style={{ color: "#ef4444", padding: 4 }}
                          title="Remove question"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: "0 0 10px", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    Add gym-specific questionnaires (e.g. past surgeries, supplement brands, music preferences) to be sent directly to the member's app.
                  </p>
                )}

                {/* Quick Add Suggestions */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Quick Suggestions (Click to add):
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {QUICK_QUESTION_TEMPLATES.map((tmpl, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleQuickAddQuestion(tmpl)}
                        style={{
                          background: "var(--surface)",
                          border: "1px dashed var(--border-subtle)",
                          padding: "4px 9px",
                          borderRadius: 6,
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Plus size={11} color="var(--primary)" />
                        <span>{tmpl.question}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add Custom Question Form */}
                {showAddQuestion ? (
                  <div style={{ background: "var(--surface-sunken)", padding: 12, borderRadius: 8, border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                        Question Text
                      </label>
                      <input
                        type="text"
                        className="ps-input"
                        placeholder="e.g. Do you have any knee or lower back issues?"
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        style={{ height: 34, fontSize: "0.85rem" }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                          Answer Type
                        </label>
                        <select
                          className="ps-input"
                          value={newQuestionType}
                          onChange={(e: any) => setNewQuestionType(e.target.value)}
                          style={{ height: 34, fontSize: "0.85rem" }}
                        >
                          <option value="text">Free Text Input</option>
                          <option value="yes_no">Yes / No Switch</option>
                          <option value="choice">Multiple Choice</option>
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.825rem", cursor: "pointer", fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={newQuestionRequired}
                            onChange={(e) => setNewQuestionRequired(e.target.checked)}
                            style={{ accentColor: "var(--primary)" }}
                          />
                          Mandatory
                        </label>
                      </div>
                    </div>

                    {newQuestionType === "choice" && (
                      <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                          Options (comma separated)
                        </label>
                        <input
                          type="text"
                          className="ps-input"
                          placeholder="e.g. Morning, Afternoon, Evening"
                          value={newQuestionOptions}
                          onChange={(e) => setNewQuestionOptions(e.target.value)}
                          style={{ height: 34, fontSize: "0.85rem" }}
                        />
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        className="ps-btn ps-btn--secondary ps-btn--sm"
                        onClick={() => setShowAddQuestion(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary ps-btn--sm"
                        onClick={handleAddCustomQuestion}
                        disabled={!newQuestionText.trim()}
                      >
                        Save Question
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddQuestion(true)}
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    style={{ width: "100%", justifyContent: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Add New Custom Question
                  </button>
                )}
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
                  The member will see this in their Psync App with assigned trainer <b>{assignedTrainer}</b>. You can also share the link directly.
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
                    <span>{copiedLink ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {member.phone && (
                <button
                  type="button"
                  className="ps-btn ps-btn--primary"
                  onClick={handleOpenWhatsApp}
                  style={{ background: "#25D366", borderColor: "#25D366", color: "#ffffff", justifyContent: "center" }}
                >
                  <MessageCircle size={16} />
                  <span>Send Onboarding Link on WhatsApp</span>
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
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              {loading ? <Loader2 size={15} className="ps-spin" /> : <Send size={15} />}
              Send Onboarding Form
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
