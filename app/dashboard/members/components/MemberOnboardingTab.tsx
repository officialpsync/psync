"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Eye,
  FileText,
  ExternalLink,
  RefreshCw,
  Loader2,
  Sparkles,
  Phone,
  MessageSquare,
  AlertCircle,
  Copy,
} from "lucide-react";
import { OnboardingActivityLog } from "./OnboardingActivityLog";

type Member = {
  id: string;
  org_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  primary_goal?: string | null;
  diet_type?: string | null;
  medical_conditions?: string[] | null;
  notes?: string | null;
  [key: string]: any;
};

type Props = {
  member: Member;
  onboardingStatus: string;
  onOpenReview: () => void;
  onOpenSend: () => void;
  onReload: () => void;
};

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat loss",
  muscle_gain: "Muscle gain",
  weight_gain: "Weight gain",
  maintenance: "Maintenance",
  general_fitness: "General fitness",
  athletic_performance: "Athletic performance",
  rehabilitation: "Rehabilitation",
};

const DIET_LABELS: Record<string, string> = {
  non_vegetarian: "Non-vegetarian",
  eggetarian: "Eggetarian",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  jain: "Jain",
};

export function MemberOnboardingTab({
  member,
  onboardingStatus,
  onOpenReview,
  onOpenSend,
  onReload,
}: Props) {
  const [formData, setFormData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    async function fetchOnboarding() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portal/onboarding?m=${member.id}`);
        const data = await res.json();
        if (res.ok) {
          setFormData(data);
        }
      } catch (err) {
        console.error("Failed to load onboarding details:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchOnboarding();
  }, [member.id]);

  const sub = useMemo(() => {
    return formData?.submittedData || formData?.draftData || {};
  }, [formData]);

  const status = formData?.status || onboardingStatus || "unassigned";

  // Helper to resolve fields between submitted form data and member profile record
  const getVal = (key: string) => {
    if (sub[key] !== undefined && sub[key] !== null && sub[key] !== "") return sub[key];
    if (member[key] !== undefined && member[key] !== null && member[key] !== "") return member[key];
    return null;
  };

  const getArray = (key: string): string[] => {
    const v = sub[key] ?? member[key];
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  };

  const hasSubmittedData = Boolean(
    (formData?.submittedData && Object.keys(formData.submittedData).length > 0) ||
    (formData?.draftData && Object.keys(formData.draftData).length > 0)
  );

  const hasAnyData = hasSubmittedData || Boolean(
    member.primary_goal || member.diet_type || member.medical_conditions?.length || member.height_cm || member.weight_kg
  );

  const height = Number(getVal("height_cm"));
  const weight = Number(getVal("weight_kg"));
  const bmi = height && weight ? (weight / Math.pow(height / 100, 2)).toFixed(1) : null;
  const bmiBand = bmi
    ? Number(bmi) < 18.5
      ? "Underweight"
      : Number(bmi) < 25
      ? "Healthy"
      : Number(bmi) < 30
      ? "Overweight"
      : "High"
    : null;

  const doctorRestriction = Boolean(
    sub.doctor_exercise_restriction || member.doctor_exercise_restriction
  );

  const medicalReports: string[] = getArray("medical_report_urls");

  const universalLink = formData?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/portal/onboarding?token=${formData.token}`
    : "";

  const handleCopyLink = () => {
    if (!universalLink) return;
    navigator.clipboard.writeText(universalLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="ob-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Status Banner ── */}
      <div
        className="ob-banner"
        style={{
          borderRadius: 16,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          border: "1px solid",
          background:
            status === "submitted"
              ? "rgba(245, 158, 11, 0.08)"
              : status === "synced"
              ? "rgba(16, 185, 129, 0.08)"
              : status === "sent" || status === "viewed" || status === "in_progress"
              ? "rgba(59, 130, 246, 0.08)"
              : "var(--surface-sunken, #f8fafc)",
          borderColor:
            status === "submitted"
              ? "rgba(245, 158, 11, 0.3)"
              : status === "synced"
              ? "rgba(16, 185, 129, 0.3)"
              : status === "sent" || status === "viewed" || status === "in_progress"
              ? "rgba(59, 130, 246, 0.25)"
              : "var(--border, rgba(60,60,67,0.12))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              background:
                status === "submitted"
                  ? "#f59e0b"
                  : status === "synced"
                  ? "#10b981"
                  : status === "sent" || status === "viewed" || status === "in_progress"
                  ? "#3b82f6"
                  : "var(--text-tertiary, #94a3b8)",
              color: "#ffffff",
            }}
          >
            {status === "submitted" ? (
              <Clock size={20} />
            ) : status === "synced" ? (
              <CheckCircle2 size={20} />
            ) : status === "sent" || status === "viewed" || status === "in_progress" ? (
              <Send size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>
                {status === "submitted"
                  ? "Onboarding Questionnaire Submitted"
                  : status === "synced"
                  ? "Onboarding Synced with Member Profile"
                  : status === "viewed"
                  ? "Member Viewed Onboarding Link"
                  : status === "in_progress"
                  ? "Member is Filling Out Questionnaire"
                  : status === "sent"
                  ? "Onboarding Form Link Dispatched"
                  : "No Onboarding Response Yet"}
              </strong>
              <span
                className="mp-pill"
                style={{
                  textTransform: "capitalize",
                  fontSize: 12,
                  fontWeight: 700,
                  background:
                    status === "submitted"
                      ? "rgba(245, 158, 11, 0.2)"
                      : status === "synced"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(59, 130, 246, 0.15)",
                  color:
                    status === "submitted"
                      ? "#b45309"
                      : status === "synced"
                      ? "#047857"
                      : "#1d4ed8",
                }}
              >
                {status.replace(/_/g, " ")}
              </span>
              {(sub.assigned_trainer || formData?.assigned_trainer || formData?.prefilledData?.assigned_trainer) && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    background: "var(--surface-sunken)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  Trainer: {sub.assigned_trainer || formData?.assigned_trainer || formData?.prefilledData?.assigned_trainer}
                </span>
              )}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {status === "submitted"
                ? "The member submitted their fitness & health questionnaire from the Psync member app. Review answers and sync to their profile."
                : status === "synced"
                ? "Member profile, medical precautions, and AI meal targets have been synchronized from their questionnaire."
                : status === "sent" || status === "viewed" || status === "in_progress"
                ? "The link has been sent to the member. Once submitted, their answers will appear here automatically."
                : "Send an onboarding questionnaire link to collect their diet preferences, workout history, and health declarations."}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {status === "submitted" && (
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              style={{ background: "#f59e0b", borderColor: "#f59e0b", color: "#ffffff" }}
              onClick={onOpenReview}
            >
              <Sparkles size={15} /> Review & Sync Submission
            </button>
          )}

          {status === "synced" && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary"
              onClick={onOpenReview}
            >
              <Eye size={15} /> View Review Details
            </button>
          )}

          <button
            type="button"
            className="ps-btn ps-btn--secondary"
            onClick={onOpenSend}
          >
            <Send size={14} /> {hasAnyData ? "Resend Form" : "Send Form"}
          </button>

          {universalLink && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary"
              onClick={handleCopyLink}
              title="Copy universal onboarding link"
            >
              <Copy size={14} /> {copiedLink ? "Copied Link!" : "Copy Link"}
            </button>
          )}
        </div>
      </div>

      {/* ── Doctor's Restriction Notice (if declared) ── */}
      {doctorRestriction && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 14,
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: "#ef4444", fontSize: "0.925rem", display: "block", marginBottom: 3 }}>
              Doctor Exercise Restriction Declared
            </strong>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
              The member declared in their onboarding form that a physician or doctor has restricted or modified their allowable exercise movements. Any generated workouts should follow low-intensity or rehabilitation guidelines.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mp-card" style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)" }}>
          <Loader2 size={24} className="ps-spin" style={{ margin: "0 auto 8px" }} />
          Loading onboarding submission data...
        </div>
      ) : !hasAnyData ? (
        <div className="mp-card mp-empty" style={{ padding: "40px 20px" }}>
          <span className="mp-empty-icon mp-empty-icon--blue">
            <FileText size={22} />
          </span>
          <strong style={{ fontSize: 16 }}>No onboarding responses received yet</strong>
          <p style={{ maxWidth: 460, margin: "6px auto 16px" }}>
            Send {member.full_name.split(" ")[0]} an onboarding link via WhatsApp or SMS to collect their fitness history, diet preferences, medical background, and target timeline.
          </p>
          <button type="button" className="ps-btn ps-btn--primary" onClick={onOpenSend}>
            <Send size={15} /> Send Onboarding Link
          </button>
        </div>
      ) : (
        <>
          {/* ── 2-Column Responsive Card Grid ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 16,
            }}
          >
            {/* Card 1: Personal & Contact Profile */}
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Personal & Contact Details</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Gender</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("gender") || getVal("sex") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Date of Birth</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("date_of_birth") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Marital Status</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("marital_status") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Occupation</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("occupation") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>WhatsApp Number</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("whatsapp_number") || getVal("phone") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Email</small>
                    <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>{getVal("email") || "—"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--mp-line)" }}>
                  <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Address & Location</small>
                  <div style={{ fontSize: 13.5, marginTop: 2 }}>
                    {[getVal("address"), getVal("city"), getVal("state"), getVal("pincode")].filter(Boolean).join(", ") || "No address provided"}
                  </div>
                </div>

                {getVal("emergency_contact") && (
                  <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid var(--mp-line)" }}>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Emergency Contact</small>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>
                      {typeof getVal("emergency_contact") === "object"
                        ? `${getVal("emergency_contact").name || ""} ${getVal("emergency_contact").relation ? `(${getVal("emergency_contact").relation})` : ""} · ${getVal("emergency_contact").phone || ""}`
                        : String(getVal("emergency_contact"))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Card 2: Fitness & Training Goals */}
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Fitness Profile & Goals</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Metrics */}
                <div className="mp-metrics" style={{ margin: "2px 0 6px" }}>
                  <div className="mp-metric">
                    <small>Height</small>
                    <strong>{height ? <>{height}<em>cm</em></> : "—"}</strong>
                  </div>
                  <div className="mp-metric">
                    <small>Weight</small>
                    <strong>{weight ? <>{weight}<em>kg</em></> : "—"}</strong>
                  </div>
                  <div className="mp-metric" data-band={bmiBand ?? undefined}>
                    <small>BMI</small>
                    <strong>{bmi || "—"}</strong>
                    {bmiBand && <span>{bmiBand}</span>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Primary Goal</small>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
                      {GOAL_LABELS[getVal("primary_goal")] || getVal("primary_goal") || "—"}
                    </div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Target Timeline</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("target_timeline") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Training Experience</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("training_experience") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Workout Schedule</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {getVal("workout_days_per_week") ? `${getVal("workout_days_per_week")} days/wk` : "—"}{" "}
                      {getVal("preferred_workout_time") ? `(${getVal("preferred_workout_time")})` : ""}
                    </div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Daily Work Activity</small>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{getVal("daily_activity_at_work") || getVal("job_activity") || "—"}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Card 3: Nutrition & Dietary Preferences */}
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Nutrition & Eating Habits</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Dietary Preference</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {DIET_LABELS[getVal("dietary_preference")] || DIET_LABELS[getVal("diet_type")] || getVal("dietary_preference") || getVal("diet_type") || "—"}
                    </div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Meals per Day</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("meals_per_day") ? `${getVal("meals_per_day")} meals` : "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Daily Water Intake</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("daily_water_intake") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Sleep per Night</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("sleep_per_night") || "—"}</div>
                  </div>
                </div>

                {getArray("foods_enjoyed").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Foods Enjoyed
                    </small>
                    <div className="ps-tags">
                      {getArray("foods_enjoyed").map((f) => (
                        <span key={f} className="ps-tag ps-tag--green">{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getArray("foods_disliked").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Foods Disliked
                    </small>
                    <div className="ps-tags">
                      {getArray("foods_disliked").map((f) => (
                        <span key={f} className="ps-tag ps-tag--grey">{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getArray("preferred_cuisines").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Preferred Cuisines
                    </small>
                    <div className="ps-tags">
                      {getArray("preferred_cuisines").map((c) => (
                        <span key={c} className="ps-tag ps-tag--blue">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getArray("current_supplements").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Current Supplements
                    </small>
                    <div className="ps-tags">
                      {getArray("current_supplements").map((s) => (
                        <span key={s} className="ps-tag ps-tag--purple">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getVal("snacks_and_other_meals") && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 2 }}>
                      Snacks & Other Meals
                    </small>
                    <p style={{ margin: 0, fontSize: 13.5 }}>{getVal("snacks_and_other_meals")}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Card 4: Health, Medical & Safety */}
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Health & Medical Details</h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {getArray("medical_conditions").length > 0 ? (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Medical Conditions
                    </small>
                    <div className="ps-tags">
                      {getArray("medical_conditions").map((m) => (
                        <span key={m} className="ps-tag ps-tag--amber">{m}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Medical Conditions</small>
                    <div style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>None reported</div>
                  </div>
                )}

                {getArray("injuries_or_pain").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Injuries or Joint Pain
                    </small>
                    <div className="ps-tags">
                      {getArray("injuries_or_pain").map((p) => (
                        <span key={p} className="ps-tag ps-tag--red">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getArray("food_allergies").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Food Allergies
                    </small>
                    <div className="ps-tags">
                      {getArray("food_allergies").map((a) => (
                        <span key={a} className="ps-tag ps-tag--red">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {getArray("food_intolerances").length > 0 && (
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
                      Food Intolerances
                    </small>
                    <div className="ps-tags">
                      {getArray("food_intolerances").map((i) => (
                        <span key={i} className="ps-tag ps-tag--blue">{i}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--mp-line)" }}>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Blood Group</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("blood_group") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Stress Level</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{getVal("stress_level") || "—"}</div>
                  </div>
                  <div>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Smoking / Alcohol</small>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {getArray("smoking_alcohol").join(", ") || getVal("smoking_alcohol") || "None"}
                    </div>
                  </div>
                  {getVal("menstrual_status") && (
                    <div>
                      <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>Menstrual Cycle</small>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {getVal("menstrual_status")} {getVal("menstrual_cycle_length") ? `(${getVal("menstrual_cycle_length")})` : ""}
                      </div>
                    </div>
                  )}
                </div>

                {getVal("current_medications") && (
                  <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--mp-line)" }}>
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 2 }}>
                      Current Medications
                    </small>
                    <p style={{ margin: 0, fontSize: 13.5 }}>{getVal("current_medications")}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Card 5: Attached Medical Reports (AWS S3) ── */}
          {medicalReports.length > 0 && (
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Attached Medical Reports & Documents</h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {medicalReports.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: 12,
                      background: "var(--surface-sunken, #f8fafc)",
                      border: "1px solid var(--mp-line)",
                      color: "var(--text-primary)",
                      textDecoration: "none",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      transition: "all 140ms ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <FileText size={18} color="var(--accent)" />
                      <span>Medical Document #{idx + 1}</span>
                    </div>
                    <ExternalLink size={15} color="var(--text-tertiary)" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ── Custom Questions & Responses ── */}
          {sub.custom_answers && typeof sub.custom_answers === "object" && Object.keys(sub.custom_answers).length > 0 && (
            <section className="mp-card">
              <div className="mp-card-h">
                <h2>Custom Questions & Member Responses</h2>
                <span className="mp-pill" style={{ background: "rgba(10, 102, 214, 0.12)", color: "var(--accent)", fontWeight: 700, fontSize: 11 }}>
                  {Object.keys(sub.custom_answers).length} Responses
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {Object.entries(sub.custom_answers).map(([question, answer], idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "var(--surface-sunken, #f8fafc)",
                      border: "1px solid var(--mp-line)",
                    }}
                  >
                    <small style={{ color: "var(--text-tertiary)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      {idx + 1}. {question}
                    </small>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {String(answer) || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Card 6: Activity History & Audit Trail ── */}
          <section className="mp-card">
            <div className="mp-card-h">
              <h2>Onboarding Activity Log</h2>
            </div>
            <OnboardingActivityLog memberId={member.id} />
          </section>
        </>
      )}
    </div>
  );
}
