"use client";

import { useEffect, useState } from "react";
import {
  X,
  Check,
  AlertTriangle,
  FileText,
  Download,
  Sparkles,
  Loader2,
  Salad,
  Dumbbell,
  Clock,
  User,
  HeartPulse,
  Target,
  ExternalLink,
} from "lucide-react";
import { useToast } from "../../components/ui";

type Member = {
  id: string;
  org_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  primary_goal: string | null;
  diet_type: string | null;
  medical_conditions: string[] | null;
  notes: string | null;
};

type Props = {
  member: Member;
  onClose: () => void;
  onSynced?: () => void;
};

export function OnboardingReviewSheet({ member, onClose, onSynced }: Props) {
  const { toast, show } = useToast();
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<any>(null);
  const [approving, setApproving] = useState(false);
  const [trainerNotes, setTrainerNotes] = useState("");
  const [generateDiet, setGenerateDiet] = useState(true);
  const [generateWorkout, setGenerateWorkout] = useState(true);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);

  useEffect(() => {
    async function fetchForm() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portal/onboarding?m=${member.id}`);
        const data = await res.json();
        if (res.ok) {
          setFormData(data);
        }
      } catch (e) {
        console.error("Failed to load onboarding submission:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchForm();
  }, [member.id]);

  const sub = formData?.submittedData || formData?.draftData || {};
  const hasDoctorRestriction = !!sub.doctor_exercise_restriction;
  const isSubmitted = formData?.status === "submitted";
  const isSynced = formData?.status === "synced";

  async function handleApproveAndSync() {
    if (hasDoctorRestriction && !safetyAcknowledged) {
      show("Please review and acknowledge the doctor's restriction notice.", "error");
      return;
    }

    try {
      setApproving(true);
      const res = await fetch("/api/portal/onboarding/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: formData?.formId,
          memberId: member.id,
          approvedData: sub,
          generateAiDiet: generateDiet,
          generateAiWorkout: generateWorkout,
          trainerNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync profile");

      show("Member profile successfully approved and synced!", "success");
      if (onSynced) onSynced();
      setTimeout(onClose, 800);
    } catch (err: any) {
      show(err.message || "Failed to approve submission", "error");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true">
      <div className="ps-sheet-backdrop" onClick={onClose} />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "720px" } as React.CSSProperties}
        role="dialog"
        aria-modal
        aria-label="Review Onboarding Submission"
      >
        <div className="ps-sheet-header" style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Review Onboarding Submission
                </h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                    background: isSynced ? "rgba(16, 185, 129, 0.15)" : isSubmitted ? "rgba(245, 158, 11, 0.15)" : "var(--surface-sunken)",
                    color: isSynced ? "#10b981" : isSubmitted ? "#f59e0b" : "var(--text-tertiary)",
                  }}
                >
                  {isSynced ? "Synced & Approved" : isSubmitted ? "Submitted (Pending Review)" : "In Progress"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.825rem", color: "var(--text-tertiary)" }}>
                {member.full_name} • Trainer: {sub.assigned_trainer || formData?.assigned_trainer || formData?.prefilledData?.assigned_trainer || "Psync Staff"} • Review & Profile Sync
              </p>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
              <Loader2 size={24} className="ps-spin" style={{ margin: "0 auto 8px" }} />
              Loading submission details...
            </div>
          ) : !sub || Object.keys(sub).length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
              No onboarding response has been submitted yet by this member.
            </div>
          ) : (
            <>
              {/* Doctor's Restriction Alert Banner */}
              {hasDoctorRestriction && (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <AlertTriangle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ color: "#ef4444", fontSize: "0.9rem", display: "block", marginBottom: 4 }}>
                      MEDICAL RESTRICTION DECLARED
                    </strong>
                    <p style={{ margin: 0, fontSize: "0.825rem", color: "var(--text-primary)", lineHeight: 1.45 }}>
                      The member indicated a doctor has restricted their exercise. AI workout plan generation will automatically start with a low-intensity / rehabilitation protocol.
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: "0.825rem", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={safetyAcknowledged}
                        onChange={(e) => setSafetyAcknowledged(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "#ef4444" }}
                      />
                      I have reviewed this medical alert and authorize low-intensity plan generation.
                    </label>
                  </div>
                </div>
              )}

              {/* Side-by-Side Comparison Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
                  Profile Comparison (Current Profile vs Submitted Form)
                </span>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 10 }}>
                      CURRENT MEMBER RECORD
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.825rem" }}>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Gender:</span> {member.sex || "—"}</div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>DOB:</span> {member.date_of_birth || "—"}</div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Height:</span> {member.height_cm ? `${member.height_cm} cm` : "—"}</div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Weight:</span> {member.weight_kg ? `${member.weight_kg} kg` : "—"}</div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Goal:</span> {member.primary_goal || "—"}</div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Diet:</span> {member.diet_type || "—"}</div>
                      <div>
                        <span style={{ color: "var(--text-tertiary)" }}>Medical:</span>{" "}
                        {Array.isArray(member.medical_conditions) && member.medical_conditions.length
                          ? member.medical_conditions.join(", ")
                          : "None"}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.2)", padding: 14, borderRadius: 10 }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", marginBottom: 10 }}>
                      SUBMITTED ONBOARDING DATA
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.825rem" }}>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Gender:</span> <strong>{sub.gender || "—"}</strong></div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>DOB:</span> <strong>{sub.date_of_birth || "—"}</strong></div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Height:</span> <strong>{sub.height_cm ? `${sub.height_cm} cm` : "—"}</strong></div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Weight:</span> <strong>{sub.weight_kg ? `${sub.weight_kg} kg` : "—"}</strong></div>
                      <div><span style={{ color: "var(--text-tertiary)" }}>Goal:</span> <strong>{sub.primary_goal || "—"}</strong></div>
                      <div>
                        <span style={{ color: "var(--text-tertiary)" }}>Diet:</span>{" "}
                        <strong>{Array.isArray(sub.dietary_preference) ? sub.dietary_preference.join(", ") : sub.dietary_preference || "—"}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-tertiary)" }}>Medical:</span>{" "}
                        <strong>{Array.isArray(sub.medical_conditions) ? sub.medical_conditions.join(", ") : "None"}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custom Questions Breakdown */}
              {sub.custom_answers && typeof sub.custom_answers === "object" && Object.keys(sub.custom_answers).length > 0 && (
                <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)", fontWeight: 700 }}>
                      Custom Questions & Member Responses
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {Object.keys(sub.custom_answers).length} answered
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(sub.custom_answers).map(([question, answer], idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "var(--surface)",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.785rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                          {idx + 1}. {question}
                        </div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {String(answer) || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Submitted Answers Breakdown */}
              <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
                  Lifestyle & Diet Specifics (Feeds AI Planner)
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: "0.825rem" }}>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Occupation:</span> {sub.occupation || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>WhatsApp:</span> {sub.whatsapp_number || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Work Activity:</span> {sub.daily_activity_at_work || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Workout Days:</span> {sub.workout_days_per_week ? `${sub.workout_days_per_week} days/wk` : "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Preferred Time:</span> {sub.preferred_workout_time || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Experience:</span> {sub.training_experience || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Meals / Day:</span> {sub.meals_per_day || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Water Intake:</span> {sub.daily_water_intake || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Sleep / Night:</span> {sub.sleep_per_night || "—"}</div>
                  <div><span style={{ color: "var(--text-tertiary)" }}>Stress Level:</span> {sub.stress_level || "—"}</div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Injuries / Pain:</span>{" "}
                    {Array.isArray(sub.injuries_or_pain) ? sub.injuries_or_pain.join(", ") : "None"}
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Food Allergies:</span>{" "}
                    {Array.isArray(sub.food_allergies) ? sub.food_allergies.join(", ") : "None"}
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Foods Enjoyed:</span>{" "}
                    {Array.isArray(sub.foods_enjoyed) ? sub.foods_enjoyed.join(", ") : "—"}
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Foods Disliked:</span>{" "}
                    {Array.isArray(sub.foods_disliked) ? sub.foods_disliked.join(", ") : "—"}
                  </div>
                </div>
              </div>

              {/* Custom Questions Breakdown */}
              {sub.custom_answers && typeof sub.custom_answers === "object" && Object.keys(sub.custom_answers).length > 0 && (
                <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--primary)", fontWeight: 700 }}>
                      Custom Questions & Member Responses
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {Object.keys(sub.custom_answers).length} answered
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(sub.custom_answers).map(([question, answer], idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "var(--surface)",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "0.785rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                          {idx + 1}. {question}
                        </div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {String(answer) || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AWS S3 Medical Reports Section */}
              {Array.isArray(sub.medical_report_urls) && sub.medical_report_urls.length > 0 && (
                <div style={{ background: "var(--surface-sunken)", padding: 14, borderRadius: 10 }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700, display: "block", marginBottom: 8 }}>
                    Attached Medical Reports (AWS S3)
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sub.medical_report_urls.map((url: string, idx: number) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "var(--surface)",
                          color: "var(--primary)",
                          textDecoration: "none",
                          fontSize: "0.825rem",
                          fontWeight: 500,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <FileText size={16} />
                          <span>Medical Report Document #{idx + 1}</span>
                        </div>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Approval Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 700 }}>
                  Approval Actions
                </span>

                <div style={{ display: "flex", gap: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={generateDiet}
                      onChange={(e) => setGenerateDiet(e.target.checked)}
                      style={{ accentColor: "var(--primary)" }}
                    />
                    Generate AI Diet Plan on sync
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={generateWorkout}
                      onChange={(e) => setGenerateWorkout(e.target.checked)}
                      style={{ accentColor: "var(--primary)" }}
                    />
                    Generate AI Workout Plan on sync
                  </label>
                </div>

                <textarea
                  className="ps-input"
                  placeholder="Optional trainer review notes (e.g., approved with emphasis on knee mobility)..."
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  style={{ height: 60, fontSize: "0.825rem", resize: "none" }}
                />
              </div>
            </>
          )}
        </div>

        {toast}

        <div className="ps-sheet-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>
            Close
          </button>
          {isSubmitted && (
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={handleApproveAndSync}
              disabled={approving || (hasDoctorRestriction && !safetyAcknowledged)}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              {approving ? <Loader2 size={15} className="ps-spin" /> : <Check size={15} />}
              Approve & Sync Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
