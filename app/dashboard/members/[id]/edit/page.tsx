"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Check, Loader2, ChevronLeft, User, HeartPulse, ShieldAlert, StickyNote, Flame, Target, Salad, Ruler, Scale, AlertCircle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Avatar, BackLink, Segmented, Skeleton } from "../../../components/ui";
import { DesignStyles } from "../../../components/DesignSystem";

type Method = "cash" | "upi" | "card" | "online";

const supabase = createClient();

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

const asList = (v: string[] | string | null | undefined): string[] =>
  !v ? [] : Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean);

function ChipSet({ options, selected, onChange, label, tone = "blue" }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; label: string; tone?: "blue" | "amber" | "red" | "purple" | "green";
}) {
  return (
    <div className="me-chips" data-tone={tone} role="group" aria-label={label}>
      {options.map((item) => {
        const on = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            className="me-chip"
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

export default function EditMemberPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [triedSave, setTriedSave] = useState(false);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;

      const [{ data: m }, { data: branchData }] = await Promise.all([
        supabase.from("members").select("*").eq("id", id).single(),
        supabase.from("branches").select("id, name").eq("org_id", roleData.org_id),
      ]);

      if (!m) { setNotFound(true); setLoading(false); return; }

      // Pre-fill all fields
      setFullName(m.full_name ?? "");
      setPhone(m.phone ?? "");
      setEmail(m.email ?? "");
      setSex(m.sex ?? "");
      setDob(m.date_of_birth ?? "");
      setBranchId(m.branch_id ?? "");
      setHeight(m.height_cm != null ? String(m.height_cm) : "");
      setWeight(m.weight_kg != null ? String(m.weight_kg) : "");
      setPrimaryGoal(m.primary_goal ?? "");
      setDietType(m.diet_type ?? "");
      setJobActivity(m.job_activity ?? "");
      setExerciseDays(m.exercise_days_per_week != null ? String(m.exercise_days_per_week) : "");
      setSpiceTolerance(m.spice_tolerance ?? "");
      setMedicalConditions(asList(m.medical_conditions));
      setGutSymptoms(asList(m.gut_symptoms));
      setFoodIntolerances(asList(m.food_intolerances));
      setAllergies(asList(m.allergies).join(", "));
      setNotes(m.notes ?? "");

      setBranches(branchData || []);
      setLoading(false);
    }
    load();
  }, [id]);

  const nameMissing = !full_name.trim();

  async function handleSave() {
    setTriedSave(true);
    if (nameMissing) {
      setError("Full name is required.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    setError("");

    const { error: updateErr } = await supabase
      .from("members")
      .update({
        full_name: full_name.trim(),
        phone: phone || null,
        email: email || null,
        sex: sex || null,
        date_of_birth: date_of_birth || null,
        branch_id: branch_id || null,
        height_cm: height_cm ? parseFloat(height_cm) : null,
        weight_kg: weight_kg ? parseFloat(weight_kg) : null,
        primary_goal: primary_goal || null,
        diet_type: diet_type || null,
        job_activity: job_activity || null,
        exercise_days_per_week: exercise_days_per_week ? parseInt(exercise_days_per_week) : null,
        spice_tolerance: spice_tolerance || null,
        medical_conditions: medical_conditions.length > 0 ? medical_conditions : null,
        gut_symptoms: gut_symptoms.length > 0 ? gut_symptoms : null,
        food_intolerances: food_intolerances.length > 0 ? food_intolerances : null,
        allergies: allergies.trim()
          ? allergies.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        notes: notes || null,
      })
      .eq("id", id);

    if (updateErr) {
      setError(updateErr.message || "Couldn't save changes. Try again.");
      setSaving(false);
      return;
    }

    router.push(`/dashboard/members/${id}`);
  }

  if (loading) {
    return (
      <div className="ps-page db me">
        <DesignStyles /><style>{ME_CSS}</style>
        <Skeleton w={120} h={16} />
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton w="100%" h={150} r={22} />
          <Skeleton w="100%" h={300} r={18} />
          <Skeleton w="100%" h={300} r={18} />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="ps-page db me">
        <DesignStyles /><style>{ME_CSS}</style>
        <BackLink href="/dashboard/members" label="Members" />
        <div className="me-card" style={{ textAlign: "center", padding: 40 }}>
          <strong>Member not found</strong>
        </div>
      </div>
    );
  }

  // Live figures for the header and the summary panel
  const h = parseFloat(height_cm), w = parseFloat(weight_kg);
  const bmi = h > 0 && w > 0 ? w / Math.pow(h / 100, 2) : null;
  const bmiBand = bmi ? (bmi < 18.5 ? { label: "Underweight", tone: "amber" } : bmi < 25 ? { label: "Healthy", tone: "green" } : bmi < 30 ? { label: "Overweight", tone: "amber" } : { label: "Obese", tone: "red" }) : null;
  const age = date_of_birth ? Math.floor((Date.now() - new Date(date_of_birth).getTime()) / 31557600000) : null;
  const allergyList = asList(allergies);
  const healthCount = medical_conditions.length + gut_symptoms.length + food_intolerances.length + allergyList.length;

  const sections = [
    { id: "personal", label: "Personal", icon: User, done: [full_name.trim(), phone || email, sex, date_of_birth].filter(Boolean).length, total: 4 },
    { id: "body", label: "Body and goals", icon: Flame, done: [height_cm, weight_kg, primary_goal, diet_type, job_activity, exercise_days_per_week, spice_tolerance].filter(Boolean).length, total: 7 },
    { id: "health", label: "Health", icon: ShieldAlert, done: healthCount ? 1 : 0, total: 1 },
    { id: "notes", label: "Notes", icon: StickyNote, done: notes.trim() ? 1 : 0, total: 1 },
  ];
  const doneAll = sections.reduce((s, x) => s + x.done, 0), totalAll = sections.reduce((s, x) => s + x.total, 0);
  const pct = Math.round((doneAll / totalAll) * 100);

  const GOALS = [
    { v: "fat_loss", label: "Fat loss", tone: "amber" }, { v: "muscle_gain", label: "Muscle gain", tone: "purple" },
    { v: "weight_gain", label: "Weight gain", tone: "blue" }, { v: "maintenance", label: "Maintenance", tone: "green" },
    { v: "healthy_eating", label: "Healthy eating", tone: "teal" },
  ];
  const DIETS = [
    { v: "non_vegetarian", label: "Non-veg", dot: "#d70015" }, { v: "eggetarian", label: "Eggetarian", dot: "#ff9f0a" },
    { v: "vegetarian", label: "Vegetarian", dot: "#1f9d48" }, { v: "vegan", label: "Vegan", dot: "#30b0c7" }, { v: "jain", label: "Jain", dot: "#8944ab" },
  ];

  function jump(id: string) {
    document.getElementById(`me-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="ps-page db me">
      <DesignStyles />
      <style>{ME_CSS}</style>

      <div className="me-crumbs">
        <a href={`/dashboard/members/${id}`} onClick={(e) => { e.preventDefault(); router.push(`/dashboard/members/${id}`); }}><ChevronLeft size={16} /> {full_name || "Member"}</a>
        <span>/</span><b>Edit profile</b>
      </div>

      {/* Header */}
      <header className="me-hero">
        <div className="me-hero-bg" aria-hidden />
        <Avatar name={full_name || "?"} size={64} />
        <div className="me-hero-id">
          <span className="me-kicker">Editing profile</span>
          <h1>{full_name.trim() || "Unnamed member"}</h1>
          <div className="me-hero-meta">
            {sex && <span>{cap(sex)}</span>}
            {age !== null && <span>{age} yrs</span>}
            {bmi && <span>BMI {bmi.toFixed(1)}</span>}
            {primary_goal && <span>{GOALS.find((g) => g.v === primary_goal)?.label}</span>}
          </div>
        </div>
        <div className="me-progress" aria-label={`Profile ${pct}% complete`}>
          <span className="me-ring" style={{ "--p": pct } as React.CSSProperties}><b>{pct}%</b></span>
          <div><strong>Profile complete</strong><small>More detail gives better diet plans</small></div>
        </div>
      </header>

      {error && <div className="me-error" role="alert"><AlertCircle size={16} />{error}</div>}

      <div className="me-layout">
        {/* Section nav */}
        <aside className="me-nav">
          <div className="me-nav-inner">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => jump(s.id)} data-done={s.done === s.total}>
                <span className={`me-nav-icon me-tone-${s.id}`}><s.icon size={15} /></span>
                <span className="me-nav-text"><b>{s.label}</b><small>{s.id === "health" ? (healthCount ? `${healthCount} selected` : "Nothing selected") : s.id === "notes" ? (notes.trim() ? "Added" : "Empty") : `${s.done} of ${s.total}`}</small></span>
                {s.done === s.total && <Check size={14} className="me-nav-check" />}
              </button>
            ))}
            <div className="me-tip"><Sparkles size={14} /><span>Changes here update diet plan targets the next time a plan is generated.</span></div>
          </div>
        </aside>

        <div className="me-forms">
          {/* Personal */}
          <section id="me-personal" className="me-card me-card--blue">
            <div className="me-card-h"><span className="me-card-icon"><User size={17} /></span><div><h2>Personal details</h2><p>Who they are and how to reach them</p></div></div>
            <div className="me-grid">
              <label className="me-field me-span-2">
                <span className="me-label">Full name</span>
                <input className="ps-input" value={full_name} onChange={(e) => setFullName(e.target.value)} placeholder="Rahul Sharma"
                  autoComplete="off" autoCapitalize="words" aria-invalid={triedSave && nameMissing} data-invalid={triedSave && nameMissing} />
                {triedSave && nameMissing && <span className="me-err">Name is required</span>}
              </label>
              <label className="me-field">
                <span className="me-label">Phone<Optional /></span>
                <input className="ps-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
              </label>
              <label className="me-field">
                <span className="me-label">Email<Optional /></span>
                <input className="ps-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" />
              </label>
              <div className="me-field">
                <span className="me-label">Sex</span>
                <Segmented<"male" | "female"> block label="Sex" value={sex as "male" | "female"} onChange={setSex}
                  options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
              </div>
              <label className="me-field">
                <span className="me-label">Date of birth<Optional />{age !== null && <em className="me-inline">{age} years</em>}</span>
                <input className="ps-input" type="date" value={date_of_birth} onChange={(e) => setDob(e.target.value)} style={{ colorScheme: "light" }} />
              </label>
              {branches.length > 1 && (
                <label className="me-field me-span-2">
                  <span className="me-label">Branch</span>
                  <select className="ps-input" value={branch_id} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">No branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* Body and goals */}
          <section id="me-body" className="me-card me-card--orange">
            <div className="me-card-h"><span className="me-card-icon"><Flame size={17} /></span><div><h2>Body and goals</h2><p>Used to set calorie and macro targets</p></div></div>
            <div className="me-grid">
              <label className="me-field">
                <span className="me-label"><Ruler size={13} />Height<Optional /></span>
                <div className="me-unit">
                  <input className="ps-input ps-num" type="text" inputMode="decimal" value={height_cm} placeholder="170"
                    onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))} />
                  <em>cm</em>
                </div>
              </label>
              <label className="me-field">
                <span className="me-label"><Scale size={13} />Weight<Optional /></span>
                <div className="me-unit">
                  <input className="ps-input ps-num" type="text" inputMode="decimal" value={weight_kg} placeholder="70"
                    onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} />
                  <em>kg</em>
                </div>
              </label>

              {bmi && bmiBand && (
                <div className={`me-bmi me-span-2 me-bmi--${bmiBand.tone}`}>
                  <div><small>BMI</small><strong>{bmi.toFixed(1)}</strong></div>
                  <div className="me-bmi-scale" aria-hidden>
                    <span /><span /><span /><span />
                    <i style={{ left: `${Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100))}%` }} />
                  </div>
                  <span className="me-bmi-label">{bmiBand.label}</span>
                </div>
              )}

              <div className="me-field me-span-2">
                <span className="me-label"><Target size={13} />Goal<Optional /></span>
                <div className="me-options">
                  {GOALS.map((g) => (
                    <button key={g.v} type="button" className={`me-option me-option--${g.tone}`} aria-pressed={primary_goal === g.v}
                      onClick={() => setPrimaryGoal(primary_goal === g.v ? "" : g.v)}>{g.label}</button>
                  ))}
                </div>
              </div>
              <div className="me-field me-span-2">
                <span className="me-label"><Salad size={13} />Diet<Optional /></span>
                <div className="me-options">
                  {DIETS.map((d) => (
                    <button key={d.v} type="button" className="me-option me-option--diet" aria-pressed={diet_type === d.v}
                      onClick={() => setDietType(diet_type === d.v ? "" : d.v)}>
                      <i style={{ borderColor: d.dot, background: diet_type === d.v ? d.dot : "transparent" }} />{d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="me-field me-span-2">
                <span className="me-label">Work during the day<Optional /></span>
                <Segmented<"desk" | "on_feet" | "physical"> block label="Work activity" value={job_activity as "desk"} onChange={setJobActivity}
                  options={[{ value: "desk", label: "Desk" }, { value: "on_feet", label: "On their feet" }, { value: "physical", label: "Physical" }]} />
              </div>
              <div className="me-field">
                <span className="me-label">Training days a week<Optional /></span>
                <div className="me-days" role="group" aria-label="Training days a week">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button key={d} type="button" aria-pressed={exercise_days_per_week === String(d)}
                      onClick={() => setExerciseDays(exercise_days_per_week === String(d) ? "" : String(d))}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="me-field">
                <span className="me-label">Spice tolerance<Optional /></span>
                <Segmented<"none" | "mild" | "moderate" | "high"> block label="Spice tolerance" value={spice_tolerance as "none"} onChange={setSpiceTolerance}
                  options={[{ value: "none", label: "None" }, { value: "mild", label: "Mild" }, { value: "moderate", label: "Medium" }, { value: "high", label: "High" }]} />
              </div>
            </div>
          </section>

          {/* Health */}
          <section id="me-health" className="me-card me-card--red">
            <div className="me-card-h">
              <span className="me-card-icon"><HeartPulse size={17} /></span>
              <div><h2>Health</h2><p>The diet engine uses these to filter foods. Select everything that applies.</p></div>
              {healthCount > 0 && <span className="me-count">{healthCount} selected</span>}
            </div>
            <div className="me-health">
              {MEDICAL_CONDITIONS.map((g) => (
                <div key={g.group} className="me-hgroup">
                  <div className="me-hgroup-label">{g.group}</div>
                  <ChipSet label={g.group} options={g.items} selected={medical_conditions} onChange={setMedicalConditions} tone="amber" />
                </div>
              ))}
            </div>
            <div className="me-split">
              <div>
                <div className="me-hgroup-label">Gut symptoms</div>
                <ChipSet label="Gut symptoms" options={GUT_SYMPTOMS} selected={gut_symptoms} onChange={setGutSymptoms} tone="purple" />
              </div>
              <div>
                <div className="me-hgroup-label">Food intolerances</div>
                <ChipSet label="Food intolerances" options={INTOLERANCES} selected={food_intolerances} onChange={setFoodIntolerances} tone="blue" />
              </div>
            </div>
            <label className="me-field" style={{ marginTop: 14 }}>
              <span className="me-label">Other allergies<Optional /></span>
              <input className="ps-input" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Peanuts, shellfish" />
              {allergyList.length > 0
                ? <span className="me-chips" data-tone="red" style={{ marginTop: 4 }}>{allergyList.map((a) => <span key={a} className="me-chip" aria-pressed>{cap(a)}</span>)}</span>
                : <span className="me-hint">Separate with commas.</span>}
            </label>
          </section>

          {/* Notes */}
          <section id="me-notes" className="me-card me-card--grey">
            <div className="me-card-h"><span className="me-card-icon"><StickyNote size={17} /></span><div><h2>Notes<Optional /></h2><p>Injuries, preferences, anything the team should know</p></div></div>
            <textarea className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Old knee injury, prefers morning sessions…" rows={4} />
          </section>
        </div>
      </div>

      <div className="me-savebar">
        <span className="me-savebar-text">{triedSave && nameMissing ? <><AlertCircle size={15} /> Add a name to save</> : "Changes aren't saved until you press Save."}</span>
        <button type="button" className="ps-btn ps-btn--secondary" onClick={() => router.push(`/dashboard/members/${id}`)}>Cancel</button>
        <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving} style={{ minWidth: 150 }}>
          {saving ? <Loader2 size={15} className="ps-spin" /> : <Check size={15} />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const ME_CSS = `
.ps-page.me { max-width: none !important; margin: 0 !important; padding: 18px 18px 96px !important; }
.db.me { max-width: none; }
.me-crumbs { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-tertiary); margin-bottom: 14px; }
.me-crumbs a { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); font-weight: 550; text-decoration: none; }
.me-crumbs b { color: var(--text-primary); font-weight: 600; }

.me-hero { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 20px 22px; border-radius: 22px; color: #fff; box-shadow: 0 18px 40px -20px rgba(10,60,160,0.55); }
.me-hero-bg { position: absolute; inset: 0; z-index: -1; background:
  radial-gradient(520px 200px at 88% -20%, rgba(255,159,10,0.45), transparent 60%),
  radial-gradient(480px 240px at 0% 130%, rgba(48,176,199,0.55), transparent 60%),
  linear-gradient(120deg, #0a3d91 0%, #0a66d6 50%, #3c4fe0 100%); }
.me-hero .ps-avatar { box-shadow: 0 0 0 3px rgba(255,255,255,0.85), 0 0 0 7px rgba(255,255,255,0.18); flex-shrink: 0; }
.me-hero-id { flex: 1; min-width: 200px; }
.me-kicker { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.8; }
.me-hero-id h1 { margin: 2px 0 6px; font-size: 26px; font-weight: 750; letter-spacing: -0.025em; color: #fff; }
.me-hero-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.me-hero-meta span { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); }
.me-progress { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 16px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(10px); }
.me-progress > div { display: flex; flex-direction: column; }
.me-progress strong { font-size: 14px; } .me-progress small { font-size: 12px; opacity: 0.8; }
.me-ring { --p: 0; width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#4cd964 calc(var(--p) * 1%), rgba(255,255,255,0.22) 0); flex-shrink: 0; }
.me-ring b { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: #1d4fc4; font-size: 12.5px; }

.me-error { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 11px 14px; border-radius: 12px; background: #fff0f1; color: #a3001a; border: 1px solid #ffd0d6; font-size: 13.5px; font-weight: 550; }

.me-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: start; }
.me-nav { position: sticky; top: 16px; }
.me-nav-inner { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 18px; background: #fff; border: 1px solid var(--separator); }
.me-nav button { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; border-radius: 12px; background: none; font: inherit; text-align: left; cursor: pointer; }
.me-nav button:hover { background: #f5f6f9; }
.me-nav-icon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
.me-tone-personal { background: #e7f0ff; color: #0062c4; } .me-tone-body { background: #fff1de; color: #c25e00; }
.me-tone-health { background: #ffe9ec; color: #c4001a; } .me-tone-notes { background: #f0f0f3; color: #48484a; }
.me-nav-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.me-nav-text b { font-size: 13.5px; font-weight: 620; color: var(--text-primary); }
.me-nav-text small { font-size: 12px; color: var(--text-tertiary); }
.me-nav-check { color: #1f9d48; }
.me-tip { display: flex; gap: 8px; margin: 6px 4px 2px; padding: 10px; border-radius: 12px; background: linear-gradient(135deg, #eef4ff, #f6efff); color: #3a3f8f; font-size: 12.5px; line-height: 1.45; }
.me-tip svg { flex-shrink: 0; margin-top: 2px; }

.me-forms { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.me-card { position: relative; background: #fff; border: 1px solid var(--separator); border-radius: 18px; padding: 18px 20px 20px; scroll-margin-top: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
.me-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; }
.me-card--blue::before { background: linear-gradient(90deg, #0a84ff, #5e5ce6); }
.me-card--orange::before { background: linear-gradient(90deg, #ff9f0a, #ff6b35); }
.me-card--red::before { background: linear-gradient(90deg, #ff375f, #af52de); }
.me-card--grey::before { background: linear-gradient(90deg, #8e8e93, #c7c7cc); }
.me-card-h { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.me-card-h > div { flex: 1; min-width: 0; }
.me-card-h h2 { margin: 0; font-size: 16.5px; font-weight: 700; letter-spacing: -0.015em; }
.me-card-h p { margin: 2px 0 0; font-size: 13px; color: var(--text-tertiary); }
.me-card-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; color: #fff; }
.me-card--blue .me-card-icon { background: linear-gradient(135deg, #0a84ff, #5e5ce6); }
.me-card--orange .me-card-icon { background: linear-gradient(135deg, #ff9f0a, #ff6b35); }
.me-card--red .me-card-icon { background: linear-gradient(135deg, #ff375f, #af52de); }
.me-card--grey .me-card-icon { background: linear-gradient(135deg, #8e8e93, #636366); }
.me-count { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 650; background: #ffe9ec; color: #c4001a; white-space: nowrap; }

.me-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.me-span-2 { grid-column: 1 / -1; }
.me-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.me-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.me-label svg { color: var(--text-tertiary); }
.me-inline { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 650; color: var(--accent); }
.me-field .ps-input[data-invalid="true"] { border-color: var(--red); box-shadow: 0 0 0 3px rgba(255,59,48,0.12); }
.me-err { font-size: 12.5px; color: var(--red); font-weight: 550; }
.me-hint { font-size: 12.5px; color: var(--text-tertiary); }
.me-unit { position: relative; }
.me-unit .ps-input { padding-right: 44px; width: 100%; }
.me-unit em { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-style: normal; font-size: 13px; font-weight: 600; color: var(--text-tertiary); pointer-events: none; }

.me-bmi { display: flex; align-items: center; gap: 16px; padding: 12px 14px; border-radius: 14px; background: #f5f6f9; }
.me-bmi > div:first-child { display: flex; flex-direction: column; }
.me-bmi small { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; color: var(--text-tertiary); }
.me-bmi strong { font-size: 22px; font-weight: 760; }
.me-bmi-scale { position: relative; flex: 1; display: flex; gap: 3px; height: 8px; }
.me-bmi-scale span { flex: 1; border-radius: 4px; }
.me-bmi-scale span:nth-child(1) { background: #ffd28a; } .me-bmi-scale span:nth-child(2) { background: #7ed9a0; flex: 1.3; }
.me-bmi-scale span:nth-child(3) { background: #ffc069; } .me-bmi-scale span:nth-child(4) { background: #ff8a8a; flex: 1.6; }
.me-bmi-scale i { position: absolute; top: -4px; width: 4px; height: 16px; border-radius: 2px; background: #1c1c1e; transform: translateX(-50%); box-shadow: 0 0 0 2px #fff; }
.me-bmi-label { font-size: 12.5px; font-weight: 700; padding: 3px 10px; border-radius: 10px; white-space: nowrap; }
.me-bmi--green { background: #edf8f1; } .me-bmi--green .me-bmi-label { background: #d3f0dd; color: #1f8a3b; }
.me-bmi--amber { background: #fff6e8; } .me-bmi--amber .me-bmi-label { background: #ffe6bf; color: #a35200; }
.me-bmi--red { background: #fff0f1; } .me-bmi--red .me-bmi-label { background: #ffd5da; color: #b0001a; }

.me-options { display: flex; flex-wrap: wrap; gap: 8px; }
.me-option { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 18px; border: 1.5px solid var(--separator); background: #fff; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.me-option:hover { border-color: #c4c8d0; color: var(--text-primary); }
.me-option i { width: 11px; height: 11px; border-radius: 3px; border: 2px solid; }
.me-option--amber[aria-pressed="true"] { background: #fff1de; border-color: #ff9f0a; color: #a35200; }
.me-option--purple[aria-pressed="true"] { background: #f3eafb; border-color: #af52de; color: #7a2fa0; }
.me-option--blue[aria-pressed="true"] { background: #e7f0ff; border-color: #0a84ff; color: #0052a8; }
.me-option--green[aria-pressed="true"] { background: #e6f6ec; border-color: #34c759; color: #1a7a33; }
.me-option--teal[aria-pressed="true"] { background: #e3f6f8; border-color: #30b0c7; color: #0e6f80; }
.me-option--diet[aria-pressed="true"] { background: #f5f6f9; border-color: #1c1c1e; color: var(--text-primary); }
.me-days { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 11px; background: #f2f3f6; }
.me-days button { height: 34px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 14px; font-weight: 650; color: var(--text-secondary); cursor: pointer; font-variant-numeric: tabular-nums; }
.me-days button[aria-pressed="true"] { background: linear-gradient(135deg, #ff9f0a, #ff6b35); color: #fff; box-shadow: 0 4px 10px -4px rgba(255,107,53,0.7); }

.me-health { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.me-hgroup { padding: 12px; border-radius: 14px; background: #fafbfc; border: 1px solid #eef0f3; }
.me-hgroup-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }
.me-split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.me-split > div { padding: 12px; border-radius: 14px; background: #fafbfc; border: 1px solid #eef0f3; }
.me-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.me-chip { display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; border-radius: 16px; border: 1.5px solid var(--separator); background: #fff; font: inherit; font-size: 13px; font-weight: 550; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.me-chip:hover { border-color: #c4c8d0; color: var(--text-primary); }
.me-chips[data-tone="amber"] .me-chip[aria-pressed="true"] { background: #fff1de; border-color: #ff9f0a; color: #a35200; }
.me-chips[data-tone="purple"] .me-chip[aria-pressed="true"] { background: #f3eafb; border-color: #af52de; color: #7a2fa0; }
.me-chips[data-tone="blue"] .me-chip[aria-pressed="true"] { background: #e7f0ff; border-color: #0a84ff; color: #0052a8; }
.me-chips[data-tone="red"] .me-chip[aria-pressed="true"] { background: #ffe9ec; border-color: #ff375f; color: #b0001a; cursor: default; }

.me-card textarea.ps-input { width: 100%; resize: vertical; min-height: 96px; }

.me-savebar { position: fixed; left: var(--sb-w, 72px); right: 0; bottom: 0; z-index: 40; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 12px 18px; background: rgba(255,255,255,0.9); border-top: 1px solid var(--separator); backdrop-filter: blur(16px) saturate(180%); }
.me-savebar-text { margin-right: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-tertiary); }
.me-savebar .ps-btn { height: 42px; border-radius: 12px; }

@media (max-width: 1000px) {
  .me-layout { grid-template-columns: minmax(0, 1fr); }
  .me-nav { position: sticky; top: 0; z-index: 20; margin: 0 -18px; }
  .me-nav-inner { flex-direction: row; overflow-x: auto; border-radius: 0; border-left: none; border-right: none; padding: 6px 12px; background: rgba(255,255,255,0.92); backdrop-filter: blur(14px); scrollbar-width: none; }
  .me-nav-inner::-webkit-scrollbar { display: none; }
  .me-nav button { flex: 0 0 auto; padding: 6px 10px 6px 6px; }
  .me-nav-icon { width: 28px; height: 28px; }
  .me-tip { display: none; }
}
@media (max-width: 899px) {
  .me-savebar { left: 0; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 640px) {
  .ps-page.me { padding: 10px 10px calc(150px + env(safe-area-inset-bottom, 0px)) !important; }
  .me-nav { margin: 0 -10px; }
  .me-hero { padding: 16px; gap: 12px; }
  .me-hero-id h1 { font-size: 22px; }
  .me-progress { width: 100%; }
  .me-card { padding: 16px 14px 16px; border-radius: 16px; }
  .me-grid { grid-template-columns: minmax(0, 1fr); }
  .me-split { grid-template-columns: minmax(0, 1fr); }
  .me-health { grid-template-columns: minmax(0, 1fr); }
  .me-bmi { flex-wrap: wrap; }
  .me-bmi-scale { order: 3; flex-basis: 100%; }
  .me-savebar-text { display: none; }
  .me-savebar .ps-btn { flex: 1; height: 46px; justify-content: center; }
  .me-option, .me-chip { height: 38px; }
  .me .ps-input { font-size: 16px; }
}
`;
