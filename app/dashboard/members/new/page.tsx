"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { BackLink, formatINR, Segmented } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";

type Plan = { id: string; name: string; duration_days: number; price_paise: number; plan_type: string };
type Method = "cash" | "upi" | "card" | "online";

const supabase = createClient();

// Exact strings matched by clinicalFilters.ts — do not rename
const MEDICAL_CONDITIONS = [
  { group: "Blood sugar", items: ["Type 2 Diabetes", "Pre-Diabetes", "Insulin Resistance"] },
  { group: "Hormonal", items: ["PCOS", "Hypothyroidism", "Hyperthyroidism"] },
  { group: "Heart", items: ["Hypertension", "High Cholesterol", "Dyslipidemia"] },
  { group: "Digestive", items: ["GERD", "Acid Reflux", "IBS", "Constipation"] },
  { group: "Liver", items: ["NAFLD", "Fatty Liver"] },
  { group: "Kidney", items: ["Chronic Kidney Disease", "CKD"] },
  { group: "Other", items: ["Celiac Disease"] },
];
const GUT_SYMPTOMS = ["bloating", "acidity", "heartburn", "constipation", "gas"];
const INTOLERANCES = ["Lactose", "Gluten", "Fructose", "Soy"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ChipSet({ options, selected, onChange, label }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; label: string;
}) {
  return (
    <div className="ps-tags ps-tags--start" role="group" aria-label={label} style={{ gap: 8 }}>
      {options.map((item) => {
        const on = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            className="ps-chip"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== item) : [...selected, item])}
          >
            {on && <Check size={13} />}
            {cap(item)}
          </button>
        );
      })}
    </div>
  );
}

function Optional() {
  return <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}> (optional)</span>;
}

export default function AddMemberPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [triedSave, setTriedSave] = useState(false);

  // Personal
  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState<"" | "male" | "female">("");
  const [date_of_birth, setDob] = useState("");
  const [branch_id, setBranchId] = useState("");

  // Body, goals, activity
  const [height_cm, setHeight] = useState("");
  const [weight_kg, setWeight] = useState("");
  const [primary_goal, setPrimaryGoal] = useState("");
  const [diet_type, setDietType] = useState("");
  const [job_activity, setJobActivity] = useState<"" | "desk" | "on_feet" | "physical">("");
  const [exercise_days_per_week, setExerciseDays] = useState("");
  const [spice_tolerance, setSpiceTolerance] = useState<"" | "none" | "mild" | "moderate" | "high">("");

  // Health
  const [medical_conditions, setMedicalConditions] = useState<string[]>([]);
  const [gut_symptoms, setGutSymptoms] = useState<string[]>([]);
  const [food_intolerances, setFoodIntolerances] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [notes, setNotes] = useState("");

  // Membership
  const [plan_id, setPlanId] = useState("");
  // Pre-fill today so the date input never renders as an empty greyed-out placeholder
  const [start_date, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState<Method>("cash");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const [{ data: branchData }, { data: planData }] = await Promise.all([
        supabase.from("branches").select("id, name").eq("org_id", roleData.org_id),
        supabase.from("membership_plans").select("id, name, duration_days, price_paise, plan_type").eq("org_id", roleData.org_id).eq("is_active", true),
      ]);
      setBranches(branchData || []);
      setPlans(planData || []);
      if (branchData && branchData.length === 1) setBranchId(branchData[0].id);
    }
    load();
  }, []);

  const selectedPlan = plans.find((p) => p.id === plan_id);
  const nameMissing = !full_name.trim();

  async function handleSave() {
    setTriedSave(true);
    if (nameMissing) { setError("Add the member's full name."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!orgId) { setError("Your session has expired. Refresh the page and try again."); return; }
    setSaving(true);
    setError("");

    const { data: member, error: memberErr } = await supabase.from("members").insert({
      org_id: orgId,
      branch_id: branch_id || null,
      full_name: full_name.trim(),
      phone: phone || null,
      email: email || null,
      sex: sex || null,
      date_of_birth: date_of_birth || null,
      height_cm: height_cm ? parseFloat(height_cm) : null,
      weight_kg: weight_kg ? parseFloat(weight_kg) : null,
      primary_goal: primary_goal || null,
      diet_type: diet_type || null,
      job_activity: job_activity || null,
      exercise_days_per_week: exercise_days_per_week ? parseInt(exercise_days_per_week) : null,
      spice_tolerance: spice_tolerance || null,
      medical_conditions: medical_conditions.length > 0 ? medical_conditions : null,
      gut_symptoms: gut_symptoms.length > 0 ? gut_symptoms : null,
      // text[] columns: send arrays, never comma strings
      food_intolerances: food_intolerances.length > 0 ? food_intolerances : null,
      allergies: allergies.trim() ? allergies.split(",").map((s) => s.trim()).filter(Boolean) : null,
      notes: notes || null,
    }).select().single();

    if (memberErr || !member) {
      setError(memberErr?.message || "The member couldn't be saved. Try again.");
      setSaving(false);
      return;
    }

    if (selectedPlan && start_date) {
      const start = new Date(start_date + "T00:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + (selectedPlan.duration_days || 30));
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const { data: membership } = await supabase.from("memberships").insert({
        org_id: orgId, member_id: member.id, plan_id: selectedPlan.id,
        branch_id: branch_id || null,
        start_date: iso(start),
        end_date: iso(end),
        status: "active",
      }).select().single();
      await supabase.from("payments").insert({
        org_id: orgId, member_id: member.id,
        membership_id: membership?.id || null,
        branch_id: branch_id || null,
        amount_paise: selectedPlan.price_paise, total_paise: selectedPlan.price_paise,
        method, status: "paid",
        notes: `${selectedPlan.name} membership`,
      });
    }

    router.push(`/dashboard/members/${member.id}`);
  }

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />
      <BackLink onClick={() => router.back()} label="Members" />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Members</div>
          <h1 className="db-title">New member</h1>
          <p className="db-subtitle">Only the name is required. Health details power their diet plan.</p>
        </div>
      </header>

      {error && <div className="ps-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="ps-stack">
        {/* Personal */}
        <section className="ps-card ps-card-body">
          <h2 className="ps-card-title" style={{ marginBottom: 18 }}>Personal details</h2>
          <div className="ps-form-grid">
            <label className="ps-field ps-span-2">
              <span className="ps-label">Full name</span>
              <input
                className="ps-input"
                value={full_name}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Rahul Sharma"
                autoComplete="off"
                autoCapitalize="words"
                aria-invalid={triedSave && nameMissing}
                style={triedSave && nameMissing ? { borderColor: "var(--red)" } : undefined}
              />
            </label>
            <label className="ps-field">
              <span className="ps-label">Phone<Optional /></span>
              <input className="ps-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </label>
            <label className="ps-field">
              <span className="ps-label">Email<Optional /></span>
              <input className="ps-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" />
            </label>
            <div className="ps-field">
              <span className="ps-label">Sex</span>
              <Segmented<"male" | "female">
                block
                label="Sex"
                value={sex as "male" | "female"}
                onChange={setSex}
                options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
              />
            </div>
            <label className="ps-field">
              <span className="ps-label">Date of birth</span>
              <input className="ps-input" type="date" value={date_of_birth} onChange={(e) => setDob(e.target.value)} />
            </label>
            {branches.length > 1 && (
              <label className="ps-field ps-span-2">
                <span className="ps-label">Branch</span>
                <select className="ps-input" value={branch_id} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Choose a branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </section>

        {/* Body + goals */}
        <section className="ps-card ps-card-body">
          <h2 className="ps-card-title" style={{ marginBottom: 18 }}>Body and goals</h2>
          <div className="ps-form-grid">
            <label className="ps-field">
              <span className="ps-label">Height</span>
              <div className="ps-input-wrap">
                <input className="ps-input ps-num" type="text" inputMode="decimal" value={height_cm} onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="170" style={{ paddingRight: 44 }} />
                <span className="ps-input-trailing ps-hint" style={{ right: 14, pointerEvents: "none" }}>cm</span>
              </div>
            </label>
            <label className="ps-field">
              <span className="ps-label">Weight</span>
              <div className="ps-input-wrap">
                <input className="ps-input ps-num" type="text" inputMode="decimal" value={weight_kg} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="70" style={{ paddingRight: 44 }} />
                <span className="ps-input-trailing ps-hint" style={{ right: 14, pointerEvents: "none" }}>kg</span>
              </div>
            </label>
            <label className="ps-field">
              <span className="ps-label">Goal</span>
              <select className="ps-input" value={primary_goal} onChange={(e) => setPrimaryGoal(e.target.value)}>
                <option value="">Choose a goal</option>
                <option value="fat_loss">Fat loss</option>
                <option value="muscle_gain">Muscle gain</option>
                <option value="weight_gain">Weight gain</option>
                <option value="maintenance">Maintenance</option>
                <option value="healthy_eating">Healthy eating</option>
              </select>
            </label>
            <label className="ps-field">
              <span className="ps-label">Diet</span>
              <select className="ps-input" value={diet_type} onChange={(e) => setDietType(e.target.value)}>
                <option value="">Choose a diet</option>
                <option value="non_vegetarian">Non-vegetarian</option>
                <option value="eggetarian">Eggetarian</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="jain">Jain</option>
              </select>
            </label>
            <div className="ps-field ps-span-2">
              <span className="ps-label">Work during the day</span>
              <Segmented<"desk" | "on_feet" | "physical">
                block
                label="Work activity"
                value={job_activity as "desk"}
                onChange={setJobActivity}
                options={[{ value: "desk", label: "Desk" }, { value: "on_feet", label: "On their feet" }, { value: "physical", label: "Physical" }]}
              />
            </div>
            <label className="ps-field">
              <span className="ps-label">Training days a week</span>
              <select className="ps-input" value={exercise_days_per_week} onChange={(e) => setExerciseDays(e.target.value)}>
                <option value="">Choose</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>)}
              </select>
            </label>
            <div className="ps-field">
              <span className="ps-label">Spice tolerance</span>
              <Segmented<"none" | "mild" | "moderate" | "high">
                block
                label="Spice tolerance"
                value={spice_tolerance as "none"}
                onChange={setSpiceTolerance}
                options={[{ value: "none", label: "None" }, { value: "mild", label: "Mild" }, { value: "moderate", label: "Medium" }, { value: "high", label: "High" }]}
              />
            </div>
          </div>
        </section>

        {/* Health */}
        <section className="ps-card ps-card-body">
          <h2 className="ps-card-title">Health</h2>
          <p className="ps-card-sub" style={{ marginBottom: 18 }}>The diet engine uses these to filter foods. Select everything that applies.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {MEDICAL_CONDITIONS.map((g) => (
              <div key={g.group}>
                <div className="ps-label" style={{ marginBottom: 8 }}>{g.group}</div>
                <ChipSet label={g.group} options={g.items} selected={medical_conditions} onChange={setMedicalConditions} />
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--separator)", paddingTop: 18 }}>
              <div className="ps-label" style={{ marginBottom: 8 }}>Gut symptoms</div>
              <ChipSet label="Gut symptoms" options={GUT_SYMPTOMS} selected={gut_symptoms} onChange={setGutSymptoms} />
            </div>
            <div>
              <div className="ps-label" style={{ marginBottom: 8 }}>Food intolerances</div>
              <ChipSet label="Food intolerances" options={INTOLERANCES} selected={food_intolerances} onChange={setFoodIntolerances} />
            </div>
            <label className="ps-field">
              <span className="ps-label">Other allergies<Optional /></span>
              <input className="ps-input" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Peanuts, shellfish" />
              <span className="ps-hint">Separate with commas.</span>
            </label>
          </div>
        </section>

        {/* Membership */}
        <section className="ps-card ps-card-body">
          <h2 className="ps-card-title" style={{ marginBottom: 18 }}>Membership</h2>
          <div className="ps-form-grid">
            <label className="ps-field">
              <span className="ps-label">Plan</span>
              <select className="ps-input" value={plan_id} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Add later</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}, {formatINR(p.price_paise)}</option>)}
              </select>
            </label>
            <label className="ps-field">
              <span className="ps-label">Starts on</span>
              <input
                className="ps-input"
                type="date"
                value={start_date}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ colorScheme: "light", color: "var(--text-primary)" }}
              />
              <span className="ps-hint">Can be today or a future date.</span>
            </label>
            {selectedPlan && (
              <div className="ps-field ps-span-2">
                <span className="ps-label">Paid {formatINR(selectedPlan.price_paise)} by</span>
                <Segmented<Method>
                  block
                  label="Payment method"
                  value={method}
                  onChange={setMethod}
                  options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "online", label: "Online" }]}
                />
              </div>
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="ps-card ps-card-body">
          <label className="ps-field">
            <span className="ps-card-title">Notes<Optional /></span>
            <textarea className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Old knee injury, prefers morning sessions…" />
          </label>
        </section>
      </div>

      <div className="ps-actionbar">
        <button type="button" className="ps-btn ps-btn--secondary" onClick={() => router.back()}>Cancel</button>
        <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving} style={{ minWidth: 150 }}>
          {saving ? "Saving…" : "Save member"}
        </button>
      </div>
    </div>
  );
}
