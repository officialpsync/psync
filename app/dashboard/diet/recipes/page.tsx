"use client";
// app/dashboard/diet/recipes/page.tsx
// Gym recipe library. The form links each ingredient to the ingredient database,
// so macros are calculated, not typed. The optional AI helper suggests the
// ingredient list; the trainer reviews everything before saving.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, Trash2, UtensilsCrossed, X, Sparkles, Carrot, Calculator, Flame, Beef, Clock, ChevronLeft, Copy,
} from "lucide-react";
import { formatDate, Skeleton, useToast } from "../../components/ui";
import { Sheet } from "../../components/Sheet";
import { DesignStyles } from "../../components/DesignSystem";
import { DietStyles, MacroSplit, MACRO_COLOR } from "../components/DietTheme"
import { useRole } from "../../components/useRole";
import { IngredientSheet } from "../components/IngredientSheet";
import { matchIngredient, perServing, type IngredientRow, type RecipeLine } from "@/lib/nutrition/recipeMath";

const supabase = createClient();

/** Stored shape in recipes.ingredients. Older rows may use `name` instead of `ingredient_name`. */
type StoredIngredient = { ingredient_id?: number | null; ingredient_name?: string; name?: string; quantity_grams: number; is_optional?: boolean };

type Recipe = {
  recipe_id: string; recipe_name: string; cuisine: string | null;
  meal_type: string[]; diet_type: string[]; serving_size_description: string | null;
  calories_kcal: number | null; protein_g: number | null; carbs_g: number | null;
  fat_g: number | null; fiber_g: number | null;
  ingredients: StoredIngredient[] | null;
  servings_per_batch: number | null;
  method: string | null;
  is_high_protein: boolean; is_low_gi: boolean; is_diabetic_friendly: boolean;
  is_gerd_safe: boolean; is_simple: boolean;
  prep_time_minutes: number | null; tags: string[] | null;
  created_at: string | null; is_active: boolean;
};

type AiEstimate = { kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number };
type Line = RecipeLine & { key: string; ai_estimate?: AiEstimate };

const MEAL_TYPES = ["early_morning", "breakfast", "lunch", "snack", "dinner", "post_workout"];
const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early morning", breakfast: "Breakfast", lunch: "Lunch",
  snack: "Snack", dinner: "Dinner", post_workout: "Post workout",
};
const DIET_TYPES = ["non_vegetarian", "eggetarian", "vegetarian", "vegan", "jain"];
const DIET_LABELS: Record<string, string> = {
  non_vegetarian: "Non-veg", eggetarian: "Eggetarian",
  vegetarian: "Vegetarian", vegan: "Vegan", jain: "Jain",
};
const GOALS = [
  { key: "fat_loss", label: "Fat loss" },
  { key: "muscle_gain", label: "Muscle gain" },
  { key: "maintenance", label: "Maintenance" },
  { key: "general_health", label: "General health" },
];

const r1 = (n: number) => Math.round((n || 0) * 10) / 10;
const lineKey = () => Math.random().toString(36).slice(2);
const storedName = (i: StoredIngredient) => i.ingredient_name ?? i.name ?? "";

// Calorie share of protein / carbs / fat for one serving (4 / 4 / 9 kcal per gram)
function macroBreakdown(r: Recipe) {
  const p = r.protein_g ?? 0, c = r.carbs_g ?? 0, f = r.fat_g ?? 0;
  const pK = p * 4, cK = c * 4, fK = f * 9;
  const total = pK + cK + fK;
  const share = (k: number) => (total > 0 ? k / total : 0);
  return {
    hasMacros: total > 0,
    rows: [
      { key: "p", cls: "db-mx-p", label: "Protein", grams: p, share: share(pK) },
      { key: "c", cls: "db-mx-c", label: "Carbs", grams: c, share: share(cK) },
      { key: "f", cls: "db-mx-f", label: "Fat", grams: f, share: share(fK) },
    ],
  };
}

function MultiChip({ options, selected, onChange, labels, label }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; labels: Record<string, string>; label: string;
}) {
  return (
    <div className="db-presets" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" className="db-preset" aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}>
            {labels[o] ?? o}
          </button>
        );
      })}
    </div>
  );
}

const FLAGS: { key: "is_high_protein" | "is_low_gi" | "is_diabetic_friendly" | "is_gerd_safe" | "is_simple"; label: string }[] = [
  { key: "is_high_protein", label: "High protein" },
  { key: "is_low_gi", label: "Low GI" },
  { key: "is_diabetic_friendly", label: "Diabetic friendly" },
  { key: "is_gerd_safe", label: "GERD safe" },
  { key: "is_simple", label: "Simple / quick" },
];

type Form = {
  recipe_name: string; cuisine: string; meal_type: string[]; diet_type: string[];
  serving_size_description: string;
  calories_kcal: string; protein_g: string; carbs_g: string; fat_g: string; fiber_g: string; prep_time_minutes: string;
  is_high_protein: boolean; is_low_gi: boolean; is_diabetic_friendly: boolean; is_gerd_safe: boolean; is_simple: boolean;
  servings: number; lines: Line[]; method: string;
};

const EMPTY: Form = {
  recipe_name: "", cuisine: "", meal_type: [], diet_type: [], serving_size_description: "",
  calories_kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "", prep_time_minutes: "",
  is_high_protein: false, is_low_gi: false, is_diabetic_friendly: false, is_gerd_safe: false, is_simple: false,
  servings: 1, lines: [], method: "",
};

function formFromRecipe(r: Recipe, catalog: IngredientRow[]): Form {
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    recipe_name: r.recipe_name, cuisine: r.cuisine ?? "", meal_type: r.meal_type ?? [], diet_type: r.diet_type ?? [],
    serving_size_description: r.serving_size_description ?? "",
    calories_kcal: s(r.calories_kcal), protein_g: s(r.protein_g), carbs_g: s(r.carbs_g), fat_g: s(r.fat_g),
    fiber_g: s(r.fiber_g), prep_time_minutes: s(r.prep_time_minutes),
    is_high_protein: !!r.is_high_protein, is_low_gi: !!r.is_low_gi, is_diabetic_friendly: !!r.is_diabetic_friendly,
    is_gerd_safe: !!r.is_gerd_safe, is_simple: !!r.is_simple,
    servings: Math.max(1, r.servings_per_batch ?? 1),
    method: r.method ?? "",
    lines: (r.ingredients ?? []).map((i) => {
      const name = storedName(i);
      const id = typeof i.ingredient_id === "number" ? i.ingredient_id : matchIngredient(name, catalog)?.id ?? null;
      return { key: lineKey(), ingredient_id: id, ingredient_name: name, quantity_grams: Number(i.quantity_grams) || 0, is_optional: !!i.is_optional };
    }),
  };
}

// ── AI helper ────────────────────────────────────────────────────────────────

type AISuggestion = {
  recipe: {
    recipe_name: string; cuisine: string; serving_description: string; meal_types: string[]; diet_types: string[];
    prep_time_minutes: number | null; servings: number; ingredients: (RecipeLine & { ai_estimate?: AiEstimate })[]; method: string[];
  };
  unmatched: number;
  remaining_today: number;
};

function AIHelper({ onApply }: { onApply: (s: AISuggestion) => void }) {
  const [dish, setDish] = useState("");
  const [servings, setServings] = useState(4);
  const [goal, setGoal] = useState("maintenance");
  const [diet, setDiet] = useState("any");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  // Today's allowance comes from the server (GET /api/ai/recipe-suggest), and is refreshed
  // from remaining_today after every suggestion. The last value is cached for an instant first paint.
  const [daily, setDaily] = useState(20);
  const DAILY = daily;
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("psync.ai.recipes") ?? "null") as { day: string; left: number } | null;
      if (saved && saved.day === today) setRemaining(saved.left);
    } catch { /* ignore */ }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/ai/recipe-suggest", { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      if (!res?.ok) return;
      const j = await res.json().catch(() => null) as { limit?: number; remaining_today?: number } | null;
      if (typeof j?.limit === "number") setDaily(j.limit);
      if (typeof j?.remaining_today === "number") rememberLeft(j.remaining_today);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function rememberLeft(left: number) {
    setRemaining(left);
    try { localStorage.setItem("psync.ai.recipes", JSON.stringify({ day: today, left })); } catch { /* ignore */ }
  }
  const used = remaining == null ? 0 : Math.max(0, DAILY - remaining);
  const outOfCredits = remaining === 0;

  async function suggest() {
    if (dish.trim().length < 2 || busy || outOfCredits) return;
    setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Your session expired. Refresh the page and log in again."); return; }
      const res = await fetch("/api/ai/recipe-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ dish: dish.trim(), servings, goal, diet }),
      });
      const json = await res.json().catch(() => ({}));
      if (typeof json.remaining_today === "number") rememberLeft(json.remaining_today);
      if (!res.ok) { setError(json.error ?? "The AI helper couldn't respond. Try again."); return; }
      onApply(json as AISuggestion);
    } catch {
      setError("Couldn't reach the AI helper. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="db-ai" aria-label="Build with AI">
      <div className="db-ai-head">
        <span className="db-ai-chip"><Sparkles size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="db-ai-title">Build with AI</div>
          <div className="db-ai-sub">Name a dish. AI suggests ingredients and quantities; calories and macros come from your ingredient database.</div>
        </div>
      </div>

      <div className="db-ai-grid">
        <input className="ps-input" value={dish} maxLength={60} placeholder="e.g. Dal Makhani, Paneer Bhurji"
          onChange={(e) => setDish(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); suggest(); } }}
          aria-label="Dish name" />
        <button type="button" className="ps-btn ps-btn--primary" onClick={suggest} disabled={busy || dish.trim().length < 2 || outOfCredits}>
          {busy ? <Loader2 size={15} className="ps-spin" /> : <Sparkles size={15} />}
          <span>{busy ? "Thinking…" : "Suggest recipe"}</span>
        </button>
      </div>

      <div className="ai-opts">
      <div className="ai-opt-row">
      <span className="ai-opt-label">Goal</span>
      <div className="db-presets" role="radiogroup" aria-label="Goal">
        {GOALS.map((g) => (
          <button key={g.key} type="button" className="db-preset" role="radio" aria-checked={goal === g.key} aria-pressed={goal === g.key} onClick={() => setGoal(g.key)}>{g.label}</button>
        ))}
      </div>
      </div>
      <div className="ai-opt-row">
      <span className="ai-opt-label">Diet</span>
      <div className="db-presets" role="radiogroup" aria-label="Diet">
        <button type="button" className="db-preset" role="radio" aria-checked={diet === "any"} aria-pressed={diet === "any"} onClick={() => setDiet("any")}>Any diet</button>
        {DIET_TYPES.map((d) => (
          <button key={d} type="button" className="db-preset" role="radio" aria-checked={diet === d} aria-pressed={diet === d} onClick={() => setDiet(d)}>{DIET_LABELS[d]}</button>
        ))}
      </div>
      </div>
      </div>

      <div className="db-ai-foot">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Servings
          <span className="db-stepper">
            <button type="button" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings((s) => s - 1)}>−</button>
            <output aria-live="polite">{servings}</output>
            <button type="button" aria-label="More servings" disabled={servings >= 12} onClick={() => setServings((s) => s + 1)}>+</button>
          </span>
        </span>
        {remaining != null && (
          <span className="ai-credits" data-low={remaining <= 3} title={`${used} of ${DAILY} AI suggestions used today`}>
            <Sparkles size={13} />
            <span className="ai-credits-text"><b>{remaining}</b> of {DAILY} left today · {used} used</span>
            <span className="ai-credits-bar"><i style={{ width: `${(remaining / DAILY) * 100}%` }} /></span>
          </span>
        )}
      </div>
      {outOfCredits && <div className="ai-out">You&apos;ve used all {DAILY} AI suggestions for today. They reset at midnight. You can still build the recipe by hand below.</div>}
      <style>{AI_CSS}</style>

      {error && <div className="ps-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}

// ── Recipe form ──────────────────────────────────────────────────────────────

function RecipeSheet({ orgId, recipe, catalog, canUseAI, onAddIngredient, onClose, onSaved }: {
  orgId: string;
  recipe: Recipe | null; // null = create
  catalog: IngredientRow[];
  canUseAI: boolean;
  onAddIngredient: (name: string, estimate?: AiEstimate) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(() => (recipe ? formFromRecipe(recipe, catalog) : { ...EMPTY }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newGrams, setNewGrams] = useState("");

  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const sortedCatalog = useMemo(() => [...catalog].filter((i) => i.is_active !== false).sort((a, b) => a.food_name.localeCompare(b.food_name)), [catalog]);
  const totals = useMemo(() => perServing(form.lines, byId, form.servings), [form.lines, byId, form.servings]);

  // When an ingredient is added to the library (e.g. via "Add it"), link matching unlinked lines
  useEffect(() => {
    setForm((f) => {
      let changed = false;
      const lines = f.lines.map((l) => {
        if (l.ingredient_id != null) return l;
        const m = matchIngredient(l.ingredient_name, catalog);
        if (!m) return l;
        changed = true;
        return { ...l, ingredient_id: m.id, ingredient_name: m.food_name };
      });
      return changed ? { ...f, lines } : f;
    });
  }, [catalog]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const updateLine = (key: string, patch: Partial<Line>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  function macrosFrom(t: ReturnType<typeof perServing>) {
    return {
      calories_kcal: String(t.kcal), protein_g: String(t.protein), carbs_g: String(t.carbs),
      fat_g: String(t.fat), fiber_g: t.fiber ? String(t.fiber) : "",
    };
  }

  function useCalculated() {
    setForm((f) => ({ ...f, ...macrosFrom(totals), is_high_protein: f.is_high_protein || totals.protein >= 20 }));
  }

  function applyAI(sugg: AISuggestion) {
    const r = sugg.recipe;
    const lines: Line[] = r.ingredients.map((l) => ({ ...l, key: lineKey() }));
    const t = perServing(lines, byId, r.servings);
    setForm((f) => ({
      ...f,
      recipe_name: r.recipe_name || f.recipe_name,
      cuisine: r.cuisine || f.cuisine,
      serving_size_description: r.serving_description || f.serving_size_description,
      meal_type: r.meal_types.length ? r.meal_types : f.meal_type,
      diet_type: r.diet_types.length ? r.diet_types : f.diet_type,
      prep_time_minutes: r.prep_time_minutes ? String(r.prep_time_minutes) : f.prep_time_minutes,
      servings: r.servings,
      lines,
      method: r.method.map((step, i) => `${i + 1}. ${step}`).join("\n"),
      ...macrosFrom(t),
      is_high_protein: t.protein >= 20,
    }));
    setAiNote(
      sugg.unmatched > 0
        ? `Suggested ${lines.length} ingredients for ${r.servings} servings. ${sugg.unmatched} aren't in your ingredient list yet. Each has an AI estimate you can use as a starting point — match to your catalog, or press "Add it" to save it with the estimate pre-filled.`
        : `Suggested ${lines.length} ingredients for ${r.servings} servings. Macros were calculated from your ingredient database. Review the quantities before saving.`
    );
  }

  function addLine() {
    const name = newName.trim();
    const grams = Number(newGrams);
    if (!name || !(grams > 0)) return;
    const m = matchIngredient(name, catalog);
    setForm((f) => ({ ...f, lines: [...f.lines, { key: lineKey(), ingredient_id: m?.id ?? null, ingredient_name: m?.food_name ?? name.slice(0, 60), quantity_grams: Math.min(5000, Math.round(grams)), is_optional: false }] }));
    setNewName(""); setNewGrams("");
  }

  async function handleSave() {
    if (!form.recipe_name.trim()) { setError("Recipe name is required"); return; }
    if (form.meal_type.length === 0) { setError("Select at least one meal type"); return; }

    // No calories typed but every ingredient is linked: calculate them
    let macros = { calories_kcal: form.calories_kcal, protein_g: form.protein_g, carbs_g: form.carbs_g, fat_g: form.fat_g, fiber_g: form.fiber_g };
    if (!form.calories_kcal && form.lines.length && totals.unmatched === 0) macros = macrosFrom(totals);
    if (!macros.calories_kcal) { setError("Calories are required. Link the ingredients and press “Use these macros”, or type them in."); return; }

    setSaving(true); setError("");
    const payload = {
      org_id: orgId,
      recipe_name: form.recipe_name.trim().slice(0, 80),
      cuisine: form.cuisine.trim() || null,
      meal_type: form.meal_type,
      diet_type: form.diet_type,
      serving_size_description: form.serving_size_description.trim() || null,
      calories_kcal: parseFloat(macros.calories_kcal) || 0,
      protein_g: parseFloat(macros.protein_g) || 0,
      carbs_g: parseFloat(macros.carbs_g) || 0,
      fat_g: parseFloat(macros.fat_g) || 0,
      fiber_g: parseFloat(macros.fiber_g) || null,
      prep_time_minutes: parseInt(form.prep_time_minutes) || null,
      is_high_protein: form.is_high_protein,
      is_low_gi: form.is_low_gi,
      is_diabetic_friendly: form.is_diabetic_friendly,
      is_gerd_safe: form.is_gerd_safe,
      is_simple: form.is_simple,
      servings_per_batch: form.servings,
      method: form.method.trim().slice(0, 3000) || null,
      // Same keys the diet engine already reads, plus ingredient_id for exact macros
      ingredients: form.lines.length ? form.lines.map((l) => ({
        ingredient_id: l.ingredient_id,
        ingredient_name: l.ingredient_name,
        quantity_grams: l.quantity_grams,
        is_optional: l.is_optional,
      })) : null,
      is_active: true,
    };

    const { error: err } = recipe
      ? await supabase.from("recipes").update(payload).eq("recipe_id", recipe.recipe_id).eq("org_id", orgId)
      : await supabase.from("recipes").insert({ ...payload, recipe_id: `gym_${orgId.slice(0, 8)}_${Date.now()}` });
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved();
  }

  const f = form;

  return (
    <Sheet
      open
      onClose={onClose}
      width={1040}
      title={recipe ? "Edit recipe" : "New recipe"}
      description={recipe ? "Update this recipe's details and macros" : "Add a custom recipe to your gym's library"}
      footer={
        <>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}><span>Cancel</span></button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            <span>{saving ? "Saving…" : recipe ? "Save changes" : "Create recipe"}</span>
          </button>
        </>
      }
    >
      <div className="db db-rs">
        {canUseAI && !recipe && <AIHelper onApply={applyAI} />}
        {aiNote && <div className="db-callout db-tone-blue" role="status"><Sparkles size={15} /><span>{aiNote}</span></div>}
        {error && <div className="ps-error" role="alert">{error}</div>}

        {/* Desktop: ingredients + method on the left, details + nutrition + tags on the right.
            Phones: one column, reordered with CSS `order` (wrappers become display: contents). */}
        <div className="db-rs-layout">
          <div className="db-rs-main">
            <section className="db-rs-section db-rs-o-ing" aria-label="Ingredients">
              <div className="db-rs-head">
                <h3>Ingredients {f.lines.length > 0 && <span className="db-rs-count">{f.lines.length}</span>}</h3>
                <span className="db-rs-servings">
                  Makes
                  <span className="db-stepper">
                    <button type="button" aria-label="Fewer servings" disabled={f.servings <= 1} onClick={() => set("servings", f.servings - 1)}>−</button>
                    <output aria-live="polite">{f.servings}</output>
                    <button type="button" aria-label="More servings" disabled={f.servings >= 50} onClick={() => set("servings", f.servings + 1)}>+</button>
                  </span>
                  serving{f.servings === 1 ? "" : "s"}
                </span>
              </div>

              {f.lines.length > 0 ? (
                <div className="db-inglist">
                  {f.lines.map((l) => {
                    const ing = l.ingredient_id != null ? byId.get(l.ingredient_id) : undefined;
                    return (
                      <div key={l.key} className={`db-ingline${ing ? "" : " db-ingline--unmatched"}`}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="db-ingline-name">{ing?.food_name ?? l.ingredient_name}</div>
                          <div className="db-ingline-sub">
                            {ing ? (
                              <span>{Math.round(Number(ing.energy_kcal) || 0)} kcal / 100 g</span>
                            ) : (
                              <>
                                <span className="db-pill db-pill--amber" style={{ padding: "1px 7px", fontSize: 11 }}>Not in your ingredients</span>
                                {l.ai_estimate && (
                                  <span className="db-ai-est" title="AI estimate, not from your ingredient database">
                                    <Sparkles size={10} strokeWidth={2.6} /> ~{Math.round(l.ai_estimate.kcal_100g)} kcal/100g
                                  </span>
                                )}
                                <select aria-label={`Match ${l.ingredient_name}`} value=""
                                  onChange={(e) => { const m = byId.get(Number(e.target.value)); if (m) updateLine(l.key, { ingredient_id: m.id, ingredient_name: m.food_name }); }}>
                                  <option value="">Match to…</option>
                                  {sortedCatalog.map((c) => <option key={c.id} value={c.id}>{c.food_name}</option>)}
                                </select>
                                <button type="button" className="db-linkbtn" onClick={() => onAddIngredient(l.ingredient_name, l.ai_estimate)}>Add it</button>
                              </>
                            )}
                            <button type="button" className="db-linkbtn" style={{ color: l.is_optional ? "var(--accent)" : "var(--text-tertiary)" }}
                              onClick={() => updateLine(l.key, { is_optional: !l.is_optional })}>
                              {l.is_optional ? "Optional" : "Mark optional"}
                            </button>
                          </div>
                        </div>
                        <label className="db-grams">
                          <input inputMode="numeric" aria-label={`Grams of ${l.ingredient_name}`} value={l.quantity_grams || ""}
                            onChange={(e) => updateLine(l.key, { quantity_grams: Math.min(5000, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                          <span>g</span>
                        </label>
                        <button type="button" className="db-icon-btn" aria-label={`Remove ${l.ingredient_name}`}
                          onClick={() => setForm((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}>
                          <X size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="db-rs-empty">
                  <Carrot size={18} />
                  <span>No ingredients yet. Search below{canUseAI && !recipe ? ", or let AI suggest them above" : ""}.</span>
                </div>
              )}

              <div className="db-ingadd">
                <div className="db-ingadd-search">
                  <Search size={15} aria-hidden />
                  <input list="recipe-ingredient-options" value={newName} maxLength={60}
                    onChange={(e) => setNewName(e.target.value)} placeholder="Search ingredients…" aria-label="Ingredient"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }} />
                </div>
                <label className="db-grams">
                  <input inputMode="numeric" value={newGrams} placeholder="100" aria-label="Grams"
                    onChange={(e) => setNewGrams(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLine(); } }} />
                  <span>g</span>
                </label>
                <button type="button" className="ps-btn ps-btn--secondary" onClick={addLine} disabled={!newName.trim() || !(Number(newGrams) > 0)}>
                  <Plus size={14} /><span>Add</span>
                </button>
                <datalist id="recipe-ingredient-options">
                  {sortedCatalog.map((c) => <option key={c.id} value={c.food_name}>{c.common_name ?? undefined}</option>)}
                </datalist>
              </div>
            </section>

            <section className="db-rs-section db-rs-o-method">
              <div className="db-rs-head"><h3><label htmlFor="r-method">Method</label> <span className="db-opt">optional</span></h3></div>
              <textarea id="r-method" className="ps-input" rows={6} maxLength={3000} value={f.method}
                onChange={(e) => set("method", e.target.value)} placeholder={"1. Soak the dal overnight\n2. Pressure cook…"} />
            </section>
          </div>

          <aside className="db-rs-side">
            <section className="db-rs-section db-rs-o-details" aria-label="Details">
              <div className="db-rs-head"><h3>Details</h3></div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="r-name">Recipe name *</label>
                <input id="r-name" className="ps-input" value={f.recipe_name} maxLength={80} onChange={(e) => set("recipe_name", e.target.value)} placeholder="Paneer Tikka, Dal Makhani…" />
              </div>
              <div className="db-field-row" style={{ marginTop: 12 }}>
                <div className="ps-field">
                  <label className="ps-label" htmlFor="r-cuisine">Cuisine</label>
                  <input id="r-cuisine" className="ps-input" value={f.cuisine} maxLength={30} onChange={(e) => set("cuisine", e.target.value)} placeholder="Indian" />
                </div>
                <div className="ps-field">
                  <label className="ps-label" htmlFor="r-serving">One serving is</label>
                  <input id="r-serving" className="ps-input" value={f.serving_size_description} maxLength={60} onChange={(e) => set("serving_size_description", e.target.value)} placeholder="1 bowl (200 g)" />
                </div>
              </div>
              <div className="db-rs-sub">Meal type *</div>
              <MultiChip label="Meal type" options={MEAL_TYPES} selected={f.meal_type} onChange={(v) => set("meal_type", v)} labels={MEAL_LABELS} />
              <div className="db-rs-sub">Suitable for</div>
              <MultiChip label="Suitable for" options={DIET_TYPES} selected={f.diet_type} onChange={(v) => set("diet_type", v)} labels={DIET_LABELS} />
            </section>

            <section className="db-rs-section db-rs-o-nutri" aria-label="Nutrition per serving">
              <div className="db-rs-head">
                <h3>Nutrition *</h3>
                <span className="db-fieldset-hint">per serving</span>
              </div>

              {f.lines.length > 0 && (
                <div className="db-rs-calc">
                  <div style={{ minWidth: 0 }}>
                    <div className="db-rs-calc-main">From ingredients: <strong>{totals.kcal} kcal</strong> · P {totals.protein} · C {totals.carbs} · F {totals.fat}</div>
                    <div className="db-rs-calc-sub">
                      {totals.matched} linked{totals.unmatched > 0 && <> · <strong style={{ color: "var(--amber)" }}>{totals.unmatched} not counted</strong></>}
                    </div>
                  </div>
                  <button type="button" className="db-rs-use" onClick={useCalculated} disabled={totals.matched === 0}>
                    <Calculator size={14} /><span>Use</span>
                  </button>
                </div>
              )}

              <div className="db-nutri">
                <label className="db-nutri-kcal" htmlFor="r-calories_kcal">
                  <span className="db-nutri-kcal-label">Calories</span>
                  <span className="db-nutri-kcal-field">
                    <input id="r-calories_kcal" inputMode="decimal" placeholder="0" value={f.calories_kcal} aria-label="Calories per serving"
                      onChange={(e) => set("calories_kcal", e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} />
                    <em>kcal</em>
                  </span>
                </label>
                <div className="db-nutri-grid">
                  {([["protein_g", "Protein", "p"], ["carbs_g", "Carbs", "c"], ["fat_g", "Fat", "f"], ["fiber_g", "Fiber", "x"]] as const).map(([key, label, tone]) => (
                    <label key={key} className={`db-nutri-cell db-nutri-${tone}`} htmlFor={`r-${key}`}>
                      <span className="db-nutri-cell-label"><i aria-hidden />{label}</span>
                      <span className="db-nutri-cell-field">
                        <input id={`r-${key}`} inputMode="decimal" placeholder="0" value={f[key]} aria-label={`${label} grams per serving`}
                          onChange={(e) => set(key, e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} />
                        <em>g</em>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="db-rs-prep">
                <label className="ps-label" htmlFor="r-prep_time_minutes">Prep time</label>
                <label className="db-grams">
                  <input id="r-prep_time_minutes" inputMode="numeric" placeholder="20" value={f.prep_time_minutes}
                    onChange={(e) => set("prep_time_minutes", e.target.value.replace(/\D/g, "").slice(0, 3))} />
                  <span>min</span>
                </label>
              </div>
            </section>

            <section className="db-rs-section db-rs-o-tags" aria-label="Dietary flags">
              <div className="db-rs-head"><h3>Dietary flags</h3></div>
              <div className="db-presets" role="group" aria-label="Dietary flags">
                {FLAGS.map(({ key, label }) => (
                  <button key={key} type="button" className="db-preset" aria-pressed={f[key]} onClick={() => set(key, !f[key])}>{label}</button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Sheet>
  );
}

export default function GymRecipesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mealFilter, setMealFilter] = useState<string>("all");
  const [dietFilter, setDietFilter] = useState<string>("");
  const [flagFilter, setFlagFilter] = useState<string[]>([]);
  const [sort, setSort] = useState<"new" | "name" | "kcal_lo" | "kcal_hi" | "protein">("new");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast, show } = useToast();
  const [catalog, setCatalog] = useState<IngredientRow[]>([]);
  const [userId, setUserId] = useState("");
  const [ingSheet, setIngSheet] = useState<{ open: boolean; name: string; estimate?: AiEstimate }>({ open: false, name: "" });
  const role = useRole();
  const canUseAI = !role.loading && role.permissions.recipes && role.permissions.ai_recipes;

  const loadRecipes = useCallback(async (oid: string) => {
    const { data } = await supabase
      .from("recipes")
      .select("*")
      .eq("org_id", oid)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setRecipes((data as Recipe[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // Built-ins + this gym's ingredients (RLS), for linking recipe lines
      const { data: ing } = await supabase.from("ingredients").select("*").eq("is_active", true).order("food_name").limit(5000);
      setCatalog((ing as IngredientRow[]) ?? []);
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      await loadRecipes(roleData.org_id);
    }
    init();
  }, [loadRecipes]);

  async function deleteRecipe(recipeId: string) {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    setDeleting(recipeId);
    await supabase.from("recipes").update({ is_active: false }).eq("recipe_id", recipeId).eq("org_id", orgId ?? "");
    setRecipes((prev) => prev.filter((r) => r.recipe_id !== recipeId));
    show("Recipe deleted");
    setDeleting(null);
  }

  const q = search.trim().toLowerCase();
  const filtered = recipes.filter((r) => {
    if (mealFilter !== "all" && !r.meal_type?.includes(mealFilter)) return false;
    if (dietFilter && !r.diet_type?.includes(dietFilter)) return false;
    if (flagFilter.some((f) => !r[f as keyof Recipe])) return false;
    if (q) return r.recipe_name.toLowerCase().includes(q) || (r.cuisine || "").toLowerCase().includes(q)
      || (r.ingredients ?? []).some((i) => storedName(i).toLowerCase().includes(q));
    return true;
  }).sort((a, b) => sort === "name" ? a.recipe_name.localeCompare(b.recipe_name)
    : sort === "kcal_lo" ? (a.calories_kcal ?? 0) - (b.calories_kcal ?? 0)
    : sort === "kcal_hi" ? (b.calories_kcal ?? 0) - (a.calories_kcal ?? 0)
    : sort === "protein" ? (b.protein_g ?? 0) - (a.protein_g ?? 0)
    : (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const avg = (k: "calories_kcal" | "protein_g") => recipes.length ? Math.round(recipes.reduce((s0, r) => s0 + (r[k] ?? 0), 0) / recipes.length) : 0;
  const mealCount = (mt: string) => recipes.filter((r) => r.meal_type?.includes(mt)).length;

  const openNew = () => { setEditRecipe(null); setSheetOpen(true); };
  const hasFilters = mealFilter !== "all" || q !== "" || !!dietFilter || flagFilter.length > 0;
  const clearAll = () => { setSearch(""); setMealFilter("all"); setDietFilter(""); setFlagFilter([]); };

  return (
    <div className="ps-page db dt rl">
      <DesignStyles /><DietStyles />
      <style>{RL_CSS}</style>

      <div className="dt-crumbs"><Link href="/dashboard/diet"><ChevronLeft size={16} /> Diet plans</Link><span>/</span><b>Recipes</b></div>

      <header className="dt-head">
        <div className="dt-title">
          <span className="dt-title-icon"><UtensilsCrossed size={21} /></span>
          <div>
            <h1>Recipe library</h1>
            <p>{loading ? "\u00a0" : `${recipes.length} custom recipe${recipes.length === 1 ? "" : "s"} · used as swap options in diet plans`}</p>
          </div>
        </div>
        <div className="dt-actions">
          <Link href="/dashboard/diet/ingredients" className="ps-btn ps-btn--secondary"><Carrot size={16} /><span>Ingredients</span></Link>
          {orgId && <button type="button" className="ps-btn ps-btn--primary" onClick={openNew}><Plus size={16} strokeWidth={2.4} /><span>New recipe</span></button>}
        </div>
        <div className="dt-kpis">
          <div className="dt-kpi"><span className="dt-kpi-icon"><UtensilsCrossed size={15} /></span><div><small>Recipes</small><b>{loading ? "–" : recipes.length}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Beef size={15} /></span><div><small>High protein</small><b>{loading ? "–" : recipes.filter((r) => r.is_high_protein).length}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Flame size={15} /></span><div><small>Avg. calories</small><b>{loading ? "–" : `${avg("calories_kcal")} kcal`}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Beef size={15} /></span><div><small>Avg. protein</small><b>{loading ? "–" : `${avg("protein_g")} g`}</b></div></div>
        </div>
      </header>

      <div className="dt-toolbar">
        <div className="dt-row">
          <label className="dt-search"><Search size={16} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, cuisine or ingredient" aria-label="Search recipes" />
          </label>
          <select className="dt-select" value={dietFilter} onChange={(e) => setDietFilter(e.target.value)} aria-label="Diet">
            <option value="">All diets</option>
            {DIET_TYPES.map((d) => <option key={d} value={d}>{DIET_LABELS[d]}</option>)}
          </select>
          <select className="dt-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="new">Newest</option><option value="name">Name A–Z</option>
            <option value="kcal_lo">Fewest calories</option><option value="kcal_hi">Most calories</option><option value="protein">Most protein</option>
          </select>
        </div>
        <div className="dt-chips" role="group" aria-label="Meal">
          <button type="button" className="dt-chip" aria-pressed={mealFilter === "all"} onClick={() => setMealFilter("all")}>All meals <em>{recipes.length}</em></button>
          {MEAL_TYPES.map((mt) => (
            <button key={mt} type="button" className="dt-chip" aria-pressed={mealFilter === mt} onClick={() => setMealFilter(mealFilter === mt ? "all" : mt)}>{MEAL_LABELS[mt]} <em>{mealCount(mt)}</em></button>
          ))}
        </div>
        <div className="dt-chips" role="group" aria-label="Suitable for">
          {FLAGS.map((f) => (
            <button key={f.key} type="button" className="dt-chip" aria-pressed={flagFilter.includes(f.key)}
              onClick={() => setFlagFilter((p) => p.includes(f.key) ? p.filter((x) => x !== f.key) : [...p, f.key])}>{f.label}</button>
          ))}
          {hasFilters && <button type="button" className="dt-link" onClick={clearAll}>Clear filters</button>}
          <span className="dt-count" style={{ marginLeft: "auto" }}>{filtered.length} of {recipes.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="rl-grid">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={190} r={16} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="dt-empty">
          <span className="dt-empty-icon"><UtensilsCrossed size={20} /></span>
          <strong>{recipes.length === 0 ? "No custom recipes yet" : "No recipes match"}</strong>
          <p>{recipes.length === 0 ? "Add your gym's own recipes and they'll appear as swap options in diet plans." : "Try a different name, meal or filter."}</p>
          {recipes.length === 0 && orgId
            ? <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={openNew}><Plus size={14} /> New recipe</button>
            : <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={clearAll}>Clear filters</button>}
        </div>
      ) : (
        <div className="rl-grid">
          {filtered.map((r) => {
            const open = expandedId === r.recipe_id;
            const { hasMacros, rows } = macroBreakdown(r);
            const flags = [r.is_high_protein && "High protein", r.is_low_gi && "Low GI", r.is_diabetic_friendly && "Diabetic friendly", r.is_gerd_safe && "GERD safe", r.is_simple && "Quick"].filter(Boolean) as string[];
            const diets = (r.diet_type ?? []).map((d) => DIET_LABELS[d] ?? d);
            return (
              <article key={r.recipe_id} className="rl-card" data-open={open}>
                <button type="button" className="rl-main" aria-expanded={open} onClick={() => setExpandedId(open ? null : r.recipe_id)}>
                  <span className="rl-meals">{(r.meal_type ?? []).map((mt) => <i key={mt}>{MEAL_LABELS[mt] ?? mt}</i>)}</span>
                  <span className="rl-name">{r.recipe_name}</span>
                  <span className="rl-meta">{[r.cuisine, r.serving_size_description, r.prep_time_minutes ? `${r.prep_time_minutes} min` : null].filter(Boolean).join(" · ") || "\u00a0"}</span>
                  <span className="rl-kcal"><Flame size={14} /><b>{r.calories_kcal ? Math.round(r.calories_kcal) : "—"}</b> kcal
                    <span className="rl-mac">P {r1(r.protein_g ?? 0)} · C {r1(r.carbs_g ?? 0)} · F {r1(r.fat_g ?? 0)}</span></span>
                  <MacroSplit p={r.protein_g ?? 0} c={r.carbs_g ?? 0} f={r.fat_g ?? 0} height={6} />
                  {(flags.length > 0 || diets.length > 0) && (
                    <span className="rl-tags">{flags.slice(0, 3).map((x) => <i key={x}>{x}</i>)}{diets.slice(0, 1).map((x) => <i key={x} className="rl-diet">{x}</i>)}</span>
                  )}
                  <span className="rl-chev">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                </button>

                {open && (
                  <div className="rl-detail">
                    {hasMacros && (
                      <div className="rl-macros">
                        {rows.map((m) => (
                          <div key={m.key} style={{ ["--mc" as string]: m.key === "p" ? MACRO_COLOR.p : m.key === "c" ? MACRO_COLOR.c : MACRO_COLOR.f } as React.CSSProperties}>
                            <small><i />{m.label}</small><b>{r1(m.grams)}<em>g</em></b><span>{Math.round(m.share * 100)}% of kcal</span>
                          </div>
                        ))}
                        {r.fiber_g ? <div style={{ ["--mc" as string]: "#8e8e93" } as React.CSSProperties}><small><i />Fibre</small><b>{r1(r.fiber_g)}<em>g</em></b><span>per serving</span></div> : null}
                      </div>
                    )}
                    {r.ingredients && r.ingredients.length > 0 && (
                      <div className="rl-sec">
                        <h4>Ingredients{(r.servings_per_batch ?? 1) > 1 ? ` · makes ${r.servings_per_batch} servings` : ""}</h4>
                        <div className="rl-ings">
                          {r.ingredients.map((ing, i) => (
                            <span key={i}><b>{storedName(ing)}</b>{ing.is_optional && <em>optional</em>}<small>{ing.quantity_grams} g</small></span>
                          ))}
                        </div>
                      </div>
                    )}
                    {r.method && <div className="rl-sec"><h4>Method</h4><p>{r.method}</p></div>}
                    {diets.length > 0 && <div className="rl-tags">{diets.map((x) => <i key={x} className="rl-diet">{x}</i>)}</div>}
                    <div className="rl-actions">
                      <span>Added {r.created_at ? formatDate(r.created_at) : "—"}</span>
                      <button type="button" className="rl-btn rl-btn--danger" onClick={() => deleteRecipe(r.recipe_id)} disabled={deleting === r.recipe_id}>
                        {deleting === r.recipe_id ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}Delete
                      </button>
                      <button type="button" className="rl-btn rl-btn--primary" onClick={() => { setEditRecipe(r); setSheetOpen(true); }}><Pencil size={14} />Edit recipe</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {sheetOpen && orgId && (
        <RecipeSheet
          orgId={orgId}
          recipe={editRecipe}
          catalog={catalog}
          canUseAI={canUseAI}
          onAddIngredient={(name, estimate) => setIngSheet({ open: true, name, estimate })}
          onClose={() => { setSheetOpen(false); setEditRecipe(null); }}
          onSaved={async () => {
            setSheetOpen(false);
            setEditRecipe(null);
            if (orgId) await loadRecipes(orgId);
            show(editRecipe ? "Recipe updated" : "Recipe added to your library");
          }}
        />
      )}

      {orgId && userId && (
        <IngredientSheet
          open={ingSheet.open}
          onClose={() => setIngSheet((s) => ({ ...s, open: false }))}
          orgId={orgId}
          userId={userId}
          initialName={ingSheet.name}
          initialEstimate={ingSheet.estimate}
          onSaved={(row) => {
            setCatalog((prev) => [...prev.filter((x) => x.id !== row.id), row]);
            setIngSheet((s) => ({ ...s, open: false }));
            show(`${row.food_name} added to your ingredients`);
          }}
        />
      )}

      {toast}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const RL_CSS = `
.rl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; align-items: start; grid-auto-flow: dense; }
.rl-card { background: #fff; border: 1px solid var(--dt-line); border-radius: 16px; overflow: hidden; transition: box-shadow 160ms, border-color 160ms; }
.rl-card:hover { border-color: #c9d8f0; box-shadow: 0 12px 28px -18px rgba(10,60,160,0.45); }
.rl-card[data-open="true"] { grid-column: 1 / -1; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.rl-main { position: relative; display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 14px 16px; border: none; background: none; font: inherit; text-align: left; cursor: pointer; color: inherit; }
.rl-card[data-open="true"] .rl-main { border-bottom: 1px solid var(--dt-line); background: #fafcff; }
.rl-meals { display: flex; gap: 4px; flex-wrap: wrap; padding-right: 26px; min-height: 18px; }
.rl-meals i { font-style: normal; font-size: 10.5px; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
.rl-meals i + i::before { content: "· "; color: var(--text-tertiary); }
.rl-name { font-size: 15.5px; font-weight: 720; letter-spacing: -0.015em; line-height: 1.25; }
.rl-meta { font-size: 12.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl-kcal { display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 13px; color: var(--text-tertiary); }
.rl-kcal svg { color: var(--accent); }
.rl-kcal b { font-size: 19px; font-weight: 780; color: var(--text-primary); }
.rl-mac { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.rl-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.rl-tags i { font-style: normal; height: 20px; padding: 0 8px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 650; background: #e8f1ff; color: #0a66d6; }
.rl-tags i.rl-diet { background: #f0f2f5; color: var(--text-secondary); }
.rl-chev { position: absolute; top: 12px; right: 12px; color: var(--text-tertiary); }

.rl-detail { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px 16px; }
.rl-macros { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.rl-macros > div { display: flex; flex-direction: column; gap: 1px; padding: 10px 12px; border-radius: 12px; background: #f6f8fc; }
.rl-macros small { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); }
.rl-macros small i { width: 8px; height: 8px; border-radius: 2px; background: var(--mc); }
.rl-macros b { font-size: 22px; font-weight: 780; }
.rl-macros b em { font-style: normal; font-size: 13px; color: var(--text-tertiary); margin-left: 2px; }
.rl-macros span { font-size: 12px; color: var(--text-tertiary); }
.rl-sec h4 { margin: 0 0 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); }
.rl-sec p { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; }
.rl-ings { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px; }
.rl-ings span { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--dt-line); font-size: 13px; }
.rl-ings b { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-ings em { font-style: normal; font-size: 11px; color: var(--text-tertiary); }
.rl-ings small { font-size: 12.5px; font-weight: 650; color: var(--accent); font-variant-numeric: tabular-nums; }
.rl-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--dt-line); }
.rl-actions > span { margin-right: auto; font-size: 12.5px; color: var(--text-tertiary); }
.rl-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 13px; border-radius: 10px; border: 1px solid var(--dt-line); background: #fff; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.rl-btn--danger { color: #c4001a; }
.rl-btn--danger:hover { background: #fff0f1; border-color: #ffd0d6; }
.rl-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
@media (max-width: 760px) {
  .rl-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .rl-actions .rl-btn { flex: 1; justify-content: center; }
}
`;

// NOTE: no backticks inside this CSS.
const AI_CSS = `
.ai-opts { display: flex; flex-direction: column; gap: 10px; margin: 12px 0 4px; }
.ai-opt-row { display: flex; align-items: flex-start; gap: 10px; }
.ai-opt-label { flex: 0 0 38px; padding-top: 8px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
.ai-opt-row .db-presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.db-ai-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.ai-credits { display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 10px; background: #eef4ff; color: #0b4e98; font-size: 12.5px; }
.ai-credits b { font-weight: 780; }
.ai-credits-bar { width: 70px; height: 6px; border-radius: 4px; background: #d6e3f8; overflow: hidden; }
.ai-credits-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.ai-credits[data-low="true"] { background: #fff4e5; color: #8a4500; }
.ai-credits[data-low="true"] .ai-credits-bar i { background: #ff9f0a; }
.ai-out { margin-top: 10px; padding: 9px 12px; border-radius: 10px; background: #fff4e5; color: #8a4500; font-size: 13px; }
@media (max-width: 640px) {
  .ai-opt-row { flex-direction: column; gap: 6px; }
  .ai-opt-label { padding-top: 0; }
  .ai-credits { width: 100%; }
  .ai-credits-bar { flex: 1; }
}
`;
