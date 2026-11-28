"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Dumbbell,
  Salad,
  HeartPulse,
  User,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  Sparkles,
  HelpCircle,
  Clock,
  ShieldCheck,
  Building2,
  ExternalLink,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";

type CustomQuestion = {
  id: string;
  question: string;
  type: "text" | "yes_no" | "choice";
  options?: string[];
  required?: boolean;
};

export default function MemberOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
          <Loader2 size={32} className="ps-spin" style={{ color: "#0a66d6" }} />
        </div>
      }
    >
      <MemberOnboardingForm />
    </Suspense>
  );
}

function MemberOnboardingForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const memberId = searchParams.get("m") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form config & member data loaded from backend
  const [formData, setFormData] = useState<any>(null);

  // Form State
  const [gender, setGender] = useState<string>("male");
  const [dob, setDob] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [pincode, setPincode] = useState<string>("");
  const [emergencyName, setEmergencyName] = useState<string>("");
  const [emergencyPhone, setEmergencyPhone] = useState<string>("");

  // Health
  const [medicalConditions, setMedicalConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string>("");
  const [doctorRestriction, setDoctorRestriction] = useState<boolean>(false);
  const [medications, setMedications] = useState<string>("");

  // Goals
  const [primaryGoal, setPrimaryGoal] = useState<string>("general_fitness");
  const [targetWeight, setTargetWeight] = useState<string>("");
  const [trainingExperience, setTrainingExperience] = useState<string>("intermediate");
  const [workoutDays, setWorkoutDays] = useState<number>(4);
  const [waterIntake, setWaterIntake] = useState<string>("3-4 Litres");
  const [sleepHours, setSleepHours] = useState<string>("7-8 hours");

  // Diet
  const [dietaryPreference, setDietaryPreference] = useState<string>("vegetarian");
  const [mealsPerDay, setMealsPerDay] = useState<string>("3");
  const [allergies, setAllergies] = useState<string>("");
  const [dislikedFoods, setDislikedFoods] = useState<string>("");

  // Custom Questions & Answers
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  // Disclaimer
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // Fetch onboarding form details
  useEffect(() => {
    async function loadForm() {
      if (!token && !memberId) {
        setError("Invalid onboarding link. Missing member token.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const query = token ? `token=${encodeURIComponent(token)}` : `m=${encodeURIComponent(memberId)}`;
        const res = await fetch(`/api/portal/onboarding?${query}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load onboarding questionnaire");

        setFormData(data);

        // Populate prefilled or draft answers if available
        if (data.prefilledData) {
          if (data.prefilledData.phone) setWhatsapp(data.prefilledData.phone);
        }

        const draft = data.submittedData || data.draftData;
        if (draft) {
          if (draft.gender) setGender(draft.gender);
          if (draft.date_of_birth) setDob(draft.date_of_birth);
          if (draft.height_cm) setHeightCm(String(draft.height_cm));
          if (draft.weight_kg) setWeightKg(String(draft.weight_kg));
          if (draft.whatsapp_number) setWhatsapp(draft.whatsapp_number);
          if (draft.address) setAddress(draft.address);
          if (draft.city) setCity(draft.city);
          if (draft.pincode) setPincode(draft.pincode);
          if (draft.emergency_contact) {
            setEmergencyName(draft.emergency_contact.name || "");
            setEmergencyPhone(draft.emergency_contact.phone || "");
          }
          if (Array.isArray(draft.medical_conditions)) setMedicalConditions(draft.medical_conditions);
          if (draft.doctor_exercise_restriction !== undefined) setDoctorRestriction(draft.doctor_exercise_restriction);
          if (draft.primary_goal) setPrimaryGoal(draft.primary_goal);
          if (draft.dietary_preference) setDietaryPreference(draft.dietary_preference);
          if (draft.custom_answers) setCustomAnswers(draft.custom_answers);
        }

        if (data.status === "submitted" || data.status === "synced") {
          setSubmitted(true);
        }

        // Record audit view activity
        try {
          await fetch("/api/portal/onboarding/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              formId: data.formId,
              memberId: data.member?.id,
              eventType: "form_viewed",
              actorName: data.member?.full_name || "Member",
            }),
          });
        } catch {}
      } catch (err: any) {
        setError(err.message || "Failed to load form");
      } finally {
        setLoading(false);
      }
    }

    loadForm();
  }, [token, memberId]);

  const customQuestions: CustomQuestion[] = useMemo(() => {
    return formData?.customConfig?.custom_questions || [];
  }, [formData]);

  const assignedTrainer = formData?.prefilledData?.assigned_trainer || formData?.assigned_trainer || "Psync Fitness Staff";
  const gymName = formData?.member?.branch_name || "Psync Gym & Fitness";

  function toggleCondition(cond: string) {
    setMedicalConditions((prev) =>
      prev.includes(cond) ? prev.filter((c) => c !== cond) : [...prev, cond]
    );
  }

  function handleCustomAnswer(questionKey: string, val: string) {
    setCustomAnswers((prev) => ({ ...prev, [questionKey]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disclaimerAccepted) {
      alert("Please confirm the health disclaimer before submitting.");
      return;
    }

    // Verify required custom questions
    for (const q of customQuestions) {
      if (q.required && (!customAnswers[q.question] || !customAnswers[q.question].trim())) {
        alert(`Please answer mandatory question: "${q.question}"`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        formId: formData?.formId,
        memberId: formData?.member?.id,
        disclaimerAccepted: true,
        responses: {
          gender,
          date_of_birth: dob,
          height_cm: heightCm ? Number(heightCm) : null,
          weight_kg: weightKg ? Number(weightKg) : null,
          whatsapp_number: whatsapp,
          address,
          city,
          pincode,
          emergency_contact: { name: emergencyName, phone: emergencyPhone },
          medical_conditions: medicalConditions,
          injuries_or_pain: injuries ? [injuries] : [],
          doctor_exercise_restriction: doctorRestriction,
          current_medications: medications,
          primary_goal: primaryGoal,
          target_weight: targetWeight ? Number(targetWeight) : null,
          training_experience: trainingExperience,
          workout_days_per_week: workoutDays,
          daily_water_intake: waterIntake,
          sleep_per_night: sleepHours,
          dietary_preference: dietaryPreference,
          meals_per_day: mealsPerDay,
          food_allergies: allergies ? [allergies] : [],
          foods_disliked: dislikedFoods ? [dislikedFoods] : [],
          custom_answers: customAnswers,
          assigned_trainer: assignedTrainer,
        },
      };

      const res = await fetch("/api/portal/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit onboarding form");

      setSubmitted(true);
    } catch (err: any) {
      alert(err.message || "Failed to submit onboarding");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 20 }}>
        <Loader2 size={36} className="ps-spin" style={{ color: "#0a66d6", marginBottom: 12 }} />
        <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#1e293b" }}>Loading Onboarding Questionnaire...</h3>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>Syncing your gym pass profile</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 24 }}>
        <div style={{ maxWidth: 440, background: "#fff", padding: 24, borderRadius: 16, border: "1px solid #e2e8f0", textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.05)" }}>
          <AlertTriangle size={36} color="#ef4444" style={{ margin: "0 auto 12px" }} />
          <h2 style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "#0f172a" }}>Unable to Load Form</h2>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: "0.875rem" }}>{error}</p>
          <a href="/portal" style={{ display: "inline-block", background: "#0a66d6", color: "#fff", padding: "10px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
            Go to Member Pass
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 20 }}>
        <div style={{ maxWidth: 500, width: "100%", background: "#fff", padding: 32, borderRadius: 20, border: "1px solid #e2e8f0", textAlign: "center", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.06)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#10b981" }}>
            <Check size={36} strokeWidth={2.6} />
          </div>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.45rem", fontWeight: 700, color: "#0f172a" }}>
            Onboarding Submitted!
          </h2>
          <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
            Thank you, <b>{formData?.member?.full_name}</b>. Your health declarations, fitness targets, and custom question responses have been submitted to assigned trainer <b>{assignedTrainer}</b> at <b>{gymName}</b>.
          </p>

          <div style={{ background: "#f8fafc", padding: 16, borderRadius: 12, border: "1px solid #e2e8f0", marginBottom: 24, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Sparkles size={16} color="#0a66d6" />
              <strong style={{ fontSize: "0.85rem", color: "#0a66d6" }}>Next Steps</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.825rem", color: "#475569", lineHeight: 1.6 }}>
              <li>Trainer review and AI diet/workout protocol generation.</li>
              <li>Your custom workout plan will be available in the Psync member app.</li>
              <li>Show your digital pass QR code at the desk for check-ins.</li>
            </ul>
          </div>

          <a
            href={`/portal?m=${formData?.member?.id || ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "#0a66d6",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
              boxShadow: "0 4px 12px rgba(10, 102, 214, 0.25)",
            }}
          >
            <span>Open Gym Pass & App</span>
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  const cfg = formData?.customConfig || {};

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 16px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Gym & Trainer Header */}
        <div style={{ background: "linear-gradient(135deg, #0a66d6, #3c4fe0)", padding: "24px 20px", borderRadius: 18, color: "#fff", marginBottom: 20, boxShadow: "0 8px 24px -6px rgba(10,102,214,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Building2 size={18} color="#93c5fd" />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#e0e7ff" }}>
              {gymName}
            </span>
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Member Fitness Onboarding
          </h1>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#bfdbfe" }}>
            Complete your profile to generate your AI-powered personalized workout routines and nutrition plan.
          </p>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, background: "rgba(255,255,255,0.18)", padding: "6px 12px", borderRadius: 20, backdropFilter: "blur(8px)" }}>
            <User size={15} color="#fff" />
            <span style={{ fontSize: "0.825rem", fontWeight: 600 }}>Assigned Trainer: {assignedTrainer}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Card 1: Verified Client Info (Locked) */}
          <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", fontWeight: 700 }}>
                1. Verified Member Details
              </span>
              <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", color: "#64748b", fontWeight: 600 }}>
                Pre-filled
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.85rem" }}>
              <div>
                <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>Full Name</span>
                <strong style={{ color: "#0f172a" }}>{formData?.member?.full_name}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>Client Code</span>
                <strong style={{ color: "#0f172a" }}>{formData?.prefilledData?.member_code}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>Mobile</span>
                <span style={{ color: "#334155" }}>{formData?.member?.phone || "—"}</span>
              </div>
              <div>
                <span style={{ color: "#64748b", fontSize: "0.75rem", display: "block" }}>Email</span>
                <span style={{ color: "#334155" }}>{formData?.member?.email || "—"}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Personal Details */}
          {cfg.include_personal !== false && (
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <User size={18} color="#0a66d6" />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  2. Personal & Body Metrics
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Gender */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#475569", fontWeight: 600, marginBottom: 6 }}>Gender</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["male", "female", "other"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          borderRadius: 8,
                          border: gender === g ? "2px solid #0a66d6" : "1px solid #cbd5e1",
                          background: gender === g ? "rgba(10, 102, 214, 0.08)" : "#fff",
                          color: gender === g ? "#0a66d6" : "#334155",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          textTransform: "capitalize",
                          cursor: "pointer",
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DOB, Height, Weight */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Date of Birth</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Height (cm)</label>
                    <input
                      type="number"
                      placeholder="e.g. 175"
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Weight (kg)</label>
                    <input
                      type="number"
                      placeholder="e.g. 72"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>

                {/* City & Address */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>City</label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Pincode</label>
                    <input
                      type="text"
                      placeholder="e.g. 400001"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>

                {/* Emergency Contact */}
                <div style={{ background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", display: "block", marginBottom: 8 }}>
                    EMERGENCY CONTACT
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Contact person name"
                      value={emergencyName}
                      onChange={(e) => setEmergencyName(e.target.value)}
                      style={{ height: 34, padding: "0 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    />
                    <input
                      type="tel"
                      placeholder="Emergency phone"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      style={{ height: 34, padding: "0 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 3: Health & Medical */}
          {cfg.include_health !== false && (
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <HeartPulse size={18} color="#ef4444" />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  3. Health & Medical Declarations
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Doctor's Restriction Notice Toggle */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: doctorRestriction ? "rgba(239, 68, 68, 0.08)" : "#f8fafc",
                    border: doctorRestriction ? "1px solid #ef4444" : "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={doctorRestriction}
                    onChange={(e) => setDoctorRestriction(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#ef4444", marginTop: 2 }}
                  />
                  <div>
                    <strong style={{ fontSize: "0.875rem", color: doctorRestriction ? "#ef4444" : "#0f172a", display: "block" }}>
                      Doctor has advised exercise restrictions or rehabilitation
                    </strong>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      Check this if you have any physician-mandated limits. We will adjust workouts to low intensity / mobility.
                    </span>
                  </div>
                </label>

                {/* Medical Conditions Chips */}
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#475569", fontWeight: 600, marginBottom: 8 }}>
                    Existing Health Conditions (Select all that apply)
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {["Hypertension", "Diabetes (Type 1/2)", "Asthma / Respiratory", "Thyroid", "Lower Back Pain", "Knee Issues", "Heart Disease", "None"].map((cond) => {
                      const active = medicalConditions.includes(cond);
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => toggleCondition(cond)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 20,
                            border: active ? "1.5px solid #ef4444" : "1px solid #cbd5e1",
                            background: active ? "rgba(239, 68, 68, 0.1)" : "#fff",
                            color: active ? "#ef4444" : "#334155",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                            cursor: "pointer",
                          }}
                        >
                          {cond}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>
                    Current Medications (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Blood pressure medicine once daily"
                    value={medications}
                    onChange={(e) => setMedications(e.target.value)}
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Card 4: Goals & Lifestyle */}
          {cfg.include_goals !== false && (
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Target size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  4. Fitness Goals & Routine
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#475569", fontWeight: 600, marginBottom: 6 }}>Primary Goal</label>
                  <select
                    value={primaryGoal}
                    onChange={(e) => setPrimaryGoal(e.target.value)}
                    style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                  >
                    <option value="fat_loss">Fat Loss & Leaning</option>
                    <option value="muscle_gain">Muscle Hypertrophy & Strength</option>
                    <option value="weight_gain">Weight Gain</option>
                    <option value="general_fitness">General Health & Stamina</option>
                    <option value="athletic_performance">Athletic Performance</option>
                    <option value="rehabilitation">Joint Mobility & Rehab</option>
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Workout Days / Week</label>
                    <select
                      value={workoutDays}
                      onChange={(e) => setWorkoutDays(Number(e.target.value))}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    >
                      <option value={3}>3 Days (Full body split)</option>
                      <option value={4}>4 Days (Upper / Lower)</option>
                      <option value={5}>5 Days (Push Pull Legs split)</option>
                      <option value={6}>6 Days (Advanced athletic split)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Target Weight (kg)</label>
                    <input
                      type="number"
                      placeholder="e.g. 68"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 5: Diet & Food */}
          {cfg.include_diet !== false && (
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Salad size={18} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                  5. Food & Nutrition Preferences
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#475569", fontWeight: 600, marginBottom: 6 }}>Diet Type</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[
                      { key: "vegetarian", label: "Vegetarian" },
                      { key: "non_vegetarian", label: "Non-Veg" },
                      { key: "eggetarian", label: "Eggetarian" },
                      { key: "vegan", label: "Vegan" },
                      { key: "jain", label: "Jain" },
                    ].map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDietaryPreference(d.key)}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: dietaryPreference === d.key ? "2px solid #f59e0b" : "1px solid #cbd5e1",
                          background: dietaryPreference === d.key ? "rgba(245, 158, 11, 0.1)" : "#fff",
                          color: dietaryPreference === d.key ? "#b45309" : "#334155",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Food Allergies</label>
                    <input
                      type="text"
                      placeholder="e.g. Peanuts, Dairy, Gluten"
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "#475569", fontWeight: 600, marginBottom: 4 }}>Disliked Foods</label>
                    <input
                      type="text"
                      placeholder="e.g. Karela, Oats, Mushrooms"
                      value={dislikedFoods}
                      onChange={(e) => setDislikedFoods(e.target.value)}
                      style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 6: Custom Questions (Sent by Gym) */}
          {customQuestions.length > 0 && (
            <div style={{ background: "#fff", padding: 20, borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <HelpCircle size={18} color="#0a66d6" />
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" }}>
                    6. Questions from {gymName}
                  </h3>
                </div>
                <span style={{ fontSize: "0.75rem", color: "#0a66d6", fontWeight: 600 }}>
                  {customQuestions.length} Questions
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {customQuestions.map((q, idx) => {
                  const currentVal = customAnswers[q.question] || "";
                  return (
                    <div key={q.id || idx} style={{ background: "#f8fafc", padding: 14, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
                        <span>
                          {idx + 1}. {q.question}
                          {q.required && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
                        </span>
                      </label>

                      {/* Render based on question type */}
                      {q.type === "yes_no" ? (
                        <div style={{ display: "flex", gap: 10 }}>
                          {["Yes", "No"].map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => handleCustomAnswer(q.question, choice)}
                              style={{
                                flex: 1,
                                height: 38,
                                borderRadius: 8,
                                border: currentVal === choice ? "2px solid #0a66d6" : "1px solid #cbd5e1",
                                background: currentVal === choice ? "rgba(10, 102, 214, 0.1)" : "#fff",
                                color: currentVal === choice ? "#0a66d6" : "#334155",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                cursor: "pointer",
                              }}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      ) : q.type === "choice" && q.options && q.options.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleCustomAnswer(q.question, opt)}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                border: currentVal === opt ? "2px solid #0a66d6" : "1px solid #cbd5e1",
                                background: currentVal === opt ? "rgba(10, 102, 214, 0.1)" : "#fff",
                                color: currentVal === opt ? "#0a66d6" : "#334155",
                                fontWeight: 600,
                                fontSize: "0.825rem",
                                cursor: "pointer",
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          placeholder="Your answer..."
                          value={currentVal}
                          onChange={(e) => handleCustomAnswer(q.question, e.target.value)}
                          style={{
                            width: "100%",
                            minHeight: 65,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #cbd5e1",
                            fontSize: "0.85rem",
                            fontFamily: "inherit",
                            resize: "vertical",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirmation & Disclaimer */}
          <div style={{ background: "#fff", padding: 18, borderRadius: 16, border: "1px solid #e2e8f0" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#0a66d6", marginTop: 2 }}
              />
              <span style={{ fontSize: "0.825rem", color: "#475569", lineHeight: 1.45 }}>
                I certify that all health, personal, and fitness information provided is accurate. I understand that my workout routines and dietary protocols will be designed by Psync AI in coordination with trainer <b>{assignedTrainer}</b> based on these responses.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              background: "#0a66d6",
              color: "#fff",
              border: "none",
              fontSize: "1rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(10, 102, 214, 0.3)",
            }}
          >
            {submitting ? <Loader2 size={18} className="ps-spin" /> : <Send size={18} />}
            <span>Submit Onboarding to {assignedTrainer}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
