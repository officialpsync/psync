"use client";
// app/dashboard/diet/recipes/page.tsx

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  ChevronDown, ChevronUp, Loader2, Pencil, Plus, Search, Trash2, UtensilsCrossed, X,
} from "lucide-react";
import { formatDate, Skeleton, useToast } from "../../components/ui";
import { Sheet } from "../../components/Sheet";
import { DesignStyles } from "../../components/DesignSystem";

const supabase = createClient();

type Ingredient = { name: string; quantity_grams: number; is_optional: boolean };

type Recipe = {
  recipe_id: string; recipe_name: string; cuisine: string | null;
  meal_type: string[]; diet_type: string[]; serving_size_description: string | null;
  calories_kcal: number | null; protein_g: number | null; carbs_g: number | null;
  fat_g: number | null; fiber_g: number | null;
  ingredients: Ingredient[] | null;
  is_high_protein: boolean; is_low_gi: boolean; is_diabetic_friendly: boolean;
  is_gerd_safe: boolean; is_simple: boolean;
  prep_time_minutes: number | null; tags: string[] | null;
  created_at: string | null; is_active: boolean;
};

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

const EMPTY_RECIPE = {
  recipe_name: "",
  cuisine: "",
  meal_type: [] as string[],
  diet_type: [] as string[],
  serving_size_description: "",
  calories_kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  fiber_g: "",
  prep_time_minutes: "",
  is_high_protein: false,
  is_low_gi: false,
  is_diabetic_friendly: false,
  is_gerd_safe: false,
  is_simple: false,
  ingredients: [] as Ingredient[],
};

const r1 = (n: number) => Math.round((n || 0) * 10) / 10;

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

// Same pill-button pattern as the filters; used for multi-select fields in the form
function MultiChip({ options, selected, onChange, labels, label }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; labels: Record<string, string>; label: string;
}) {
  return (
    <div className="db-presets" role="group" aria-label={label}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            className="db-preset"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
          >
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

const MACRO_FIELDS = [
  { key: "calories_kcal", label: "Calories (kcal)", placeholder: "350" },
  { key: "protein_g", label: "Protein (g)", placeholder: "28" },
  { key: "carbs_g", label: "Carbs (g)", placeholder: "40" },
  { key: "fat_g", label: "Fat (g)", placeholder: "12" },
  { key: "fiber_g", label: "Fiber (g)", placeholder: "5" },
  { key: "prep_time_minutes", label: "Prep time (min)", placeholder: "20" },
];

function RecipeSheet({ orgId, recipe, onClose, onSaved }: {
  orgId: string;
  recipe: Recipe | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(recipe ? {
    recipe_name: recipe.recipe_name,
    cuisine: recipe.cuisine ?? "",
    meal_type: recipe.meal_type ?? [],
    diet_type: recipe.diet_type ?? [],
    serving_size_description: recipe.serving_size_description ?? "",
    calories_kcal: String(recipe.calories_kcal ?? ""),
    protein_g: String(recipe.protein_g ?? ""),
    carbs_g: String(recipe.carbs_g ?? ""),
    fat_g: String(recipe.fat_g ?? ""),
    fiber_g: String(recipe.fiber_g ?? ""),
    prep_time_minutes: String(recipe.prep_time_minutes ?? ""),
    is_high_protein: recipe.is_high_protein ?? false,
    is_low_gi: recipe.is_low_gi ?? false,
    is_diabetic_friendly: recipe.is_diabetic_friendly ?? false,
    is_gerd_safe: recipe.is_gerd_safe ?? false,
    is_simple: recipe.is_simple ?? false,
    ingredients: (recipe.ingredients ?? []) as Ingredient[],
  } : { ...EMPTY_RECIPE });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ingName, setIngName] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [ingOpt, setIngOpt] = useState(false);

  function addIngredient() {
    if (!ingName.trim() || !ingQty) return;
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, { name: ingName.trim(), quantity_grams: parseFloat(ingQty), is_optional: ingOpt }] }));
    setIngName(""); setIngQty(""); setIngOpt(false);
  }

  function removeIngredient(i: number) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    if (!form.recipe_name.trim()) { setError("Recipe name is required"); return; }
    if (form.meal_type.length === 0) { setError("Select at least one meal type"); return; }
    if (!form.calories_kcal) { setError("Calories are required"); return; }
    setSaving(true); setError("");

    const payload = {
      org_id: orgId,
      recipe_name: form.recipe_name.trim(),
      cuisine: form.cuisine.trim() || null,
      meal_type: form.meal_type,
      diet_type: form.diet_type,
      serving_size_description: form.serving_size_description.trim() || null,
      calories_kcal: parseFloat(form.calories_kcal) || 0,
      protein_g: parseFloat(form.protein_g) || 0,
      carbs_g: parseFloat(form.carbs_g) || 0,
      fat_g: parseFloat(form.fat_g) || 0,
      fiber_g: parseFloat(form.fiber_g) || null,
      prep_time_minutes: parseInt(form.prep_time_minutes) || null,
      is_high_protein: form.is_high_protein,
      is_low_gi: form.is_low_gi,
      is_diabetic_friendly: form.is_diabetic_friendly,
      is_gerd_safe: form.is_gerd_safe,
      is_simple: form.is_simple,
      ingredients: form.ingredients.length > 0 ? form.ingredients.map((ing) => ({
        ingredient_name: ing.name,
        quantity_grams: ing.quantity_grams,
        is_optional: ing.is_optional,
      })) : null,
      is_active: true,
    };

    if (recipe) {
      // Update
      const { error: err } = await supabase.from("recipes").update(payload).eq("recipe_id", recipe.recipe_id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      // Insert — generate a recipe_id
      const recipeId = `gym_${orgId.slice(0, 8)}_${Date.now()}`;
      const { error: err } = await supabase.from("recipes").insert({ ...payload, recipe_id: recipeId });
      if (err) { setError(err.message); setSaving(false); return; }
    }
    onSaved();
  }

  const f = form;

  return (
    <Sheet
      open
      onClose={onClose}
      title={recipe ? "Edit recipe" : "New recipe"}
      description={recipe ? "Update this recipe's details and macros" : "Add a custom recipe to your gym's library"}
    >
      <div className="db" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {error && <div className="ps-error" role="alert">{error}</div>}

        {/* Basic info */}
        <div className="ps-form-grid">
          <div className="ps-field ps-span-2">
            <label className="ps-label">Recipe name *</label>
            <input className="ps-input" value={f.recipe_name} onChange={(e) => setForm((x) => ({ ...x, recipe_name: e.target.value }))} placeholder="Paneer Tikka, Dal Makhani…" autoFocus />
          </div>
          <div className="ps-field">
            <label className="ps-label">Cuisine</label>
            <input className="ps-input" value={f.cuisine} onChange={(e) => setForm((x) => ({ ...x, cuisine: e.target.value }))} placeholder="Indian, Continental…" />
          </div>
          <div className="ps-field">
            <label className="ps-label">Serving description</label>
            <input className="ps-input" value={f.serving_size_description} onChange={(e) => setForm((x) => ({ ...x, serving_size_description: e.target.value }))} placeholder="1 bowl (200g), 2 rotis…" />
          </div>
        </div>

        {/* Meal type */}
        <div className="ps-field">
          <span className="ps-label" style={{ display: "block", marginBottom: 8 }}>Meal type *</span>
          <MultiChip label="Meal type" options={MEAL_TYPES} selected={f.meal_type} onChange={(v) => setForm((x) => ({ ...x, meal_type: v }))} labels={MEAL_LABELS} />
        </div>

        {/* Diet type */}
        <div className="ps-field">
          <span className="ps-label" style={{ display: "block", marginBottom: 8 }}>Suitable for</span>
          <MultiChip label="Suitable for" options={DIET_TYPES} selected={f.diet_type} onChange={(v) => setForm((x) => ({ ...x, diet_type: v }))} labels={DIET_LABELS} />
        </div>

        {/* Macros */}
        <div>
          <div className="ps-label" style={{ marginBottom: 10 }}>Macros per serving *</div>
          <div className="ps-form-grid">
            {MACRO_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="ps-field">
                <label className="ps-label">{label}</label>
                <input
                  className="ps-input"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                  type="text"
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={(f as Record<string, unknown>)[key] as string}
                  onChange={(e) => setForm((x) => ({ ...x, [key]: e.target.value.replace(/[^\d.]/g, "") }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Flags */}
        <div>
          <div className="ps-label" style={{ marginBottom: 10 }}>Dietary flags</div>
          <div className="db-presets" role="group" aria-label="Dietary flags">
            {FLAGS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className="db-preset"
                aria-pressed={f[key]}
                onClick={() => setForm((x) => ({ ...x, [key]: !x[key] }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="ps-label" style={{ marginBottom: 10 }}>Ingredients</div>
          {f.ingredients.length > 0 && (
            <div className="db-card" style={{ marginBottom: 12 }}>
              <div className="db-rows" style={{ margin: 0, padding: "2px 12px" }}>
                {f.ingredients.map((ing, i) => (
                  <div
                    key={i}
                    className="db-row"
                    style={{ minHeight: 46, borderRadius: 0, borderTop: i === 0 ? "none" : "1px solid var(--db-border)" }}
                  >
                    <div className="db-row-text"><div className="db-row-title">{ing.name}</div></div>
                    {ing.is_optional && <span className="db-pill db-pill--muted">Optional</span>}
                    <span className="db-row-sub" style={{ margin: 0, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "right" }}>
                      {ing.quantity_grams} g
                    </span>
                    <button type="button" className="db-icon-btn" style={{ color: "var(--red)" }} aria-label={`Remove ${ing.name}`} onClick={() => removeIngredient(i)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 8 }}>
            <div className="ps-field">
              <label className="ps-label">Ingredient name</label>
              <input className="ps-input" value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="Chicken breast, Rice…" onKeyDown={(e) => e.key === "Enter" && addIngredient()} />
            </div>
            <div className="ps-field">
              <label className="ps-label">Grams</label>
              <input className="ps-input" style={{ fontVariantNumeric: "tabular-nums" }} type="text" inputMode="decimal" value={ingQty} onChange={(e) => setIngQty(e.target.value.replace(/[^\d.]/g, ""))} placeholder="100" onKeyDown={(e) => e.key === "Enter" && addIngredient()} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
            <button type="button" className="db-preset" aria-pressed={ingOpt} onClick={() => setIngOpt((v) => !v)}>
              Optional ingredient
            </button>
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={addIngredient} disabled={!ingName.trim() || !ingQty}>
              <Plus size={14} /> <span>Add ingredient</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, paddingTop: 16, borderTop: "1px solid var(--db-border)" }}>
          <button type="button" className="ps-btn ps-btn--secondary" style={{ flex: 1 }} onClick={onClose}><span>Cancel</span></button>
          <button type="button" className="ps-btn ps-btn--primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            <span>{saving ? "Saving…" : recipe ? "Save changes" : "Create recipe"}</span>
          </button>
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast, show } = useToast();

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
    await supabase.from("recipes").update({ is_active: false }).eq("recipe_id", recipeId);
    setRecipes((prev) => prev.filter((r) => r.recipe_id !== recipeId));
    show("Recipe deleted");
    setDeleting(null);
  }

  const q = search.trim().toLowerCase();
  const filtered = recipes.filter((r) => {
    if (mealFilter !== "all" && !r.meal_type?.includes(mealFilter)) return false;
    if (q) return r.recipe_name.toLowerCase().includes(q) || (r.cuisine || "").toLowerCase().includes(q);
    return true;
  });

  const openNew = () => { setEditRecipe(null); setSheetOpen(true); };
  const hasFilters = mealFilter !== "all" || q !== "";

  return (
    <div className="ps-page db">
      <DesignStyles />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Recipe library</h1>
          <p className="db-subtitle">
            {loading
              ? "\u00a0"
              : <><strong>{recipes.length}</strong> custom recipe{recipes.length === 1 ? "" : "s"} in your gym&apos;s library</>}
          </p>
        </div>
        <div className="db-header-actions">
          {orgId && (
            <button type="button" className="ps-btn ps-btn--primary" onClick={openNew}>
              <Plus size={16} strokeWidth={2.4} /> <span>New recipe</span>
            </button>
          )}
        </div>
      </header>

      <div className="db-card db-toolbar">
        <label className="db-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or cuisine"
            aria-label="Search recipes"
          />
        </label>
        <div className="db-presets" role="group" aria-label="Filter by meal type" style={{ flexBasis: "100%" }}>
          <button type="button" className="db-preset" aria-pressed={mealFilter === "all"} onClick={() => setMealFilter("all")}>All meals</button>
          {MEAL_TYPES.map((mt) => (
            <button key={mt} type="button" className="db-preset" aria-pressed={mealFilter === mt} onClick={() => setMealFilter(mealFilter === mt ? "all" : mt)}>
              {MEAL_LABELS[mt]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="db-card db-meallist">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="db-mealrow-wrap">
              <div className="db-mealrow-head" style={{ cursor: "default" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <Skeleton w={90} h={10} />
                  <Skeleton w={200} h={14} />
                  <Skeleton w={140} h={11} />
                </div>
                <Skeleton w={56} h={16} />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><UtensilsCrossed size={18} /></span>
            <div className="db-empty-title">{recipes.length === 0 ? "No custom recipes yet" : "No recipes match"}</div>
            <div className="db-empty-text">
              {recipes.length === 0
                ? "Add your gym's own recipes and they'll appear as swap options in diet plans."
                : "Try a different name or meal type."}
            </div>
            {recipes.length === 0 && orgId && (
              <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={openNew}>
                <Plus size={16} strokeWidth={2.4} /> <span>New recipe</span>
              </button>
            )}
            {recipes.length > 0 && hasFilters && (
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ marginTop: 14 }} onClick={() => { setSearch(""); setMealFilter("all"); }}>
                <span>Clear filters</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="db-card db-meallist">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.recipe_id;
            const eyebrow = (r.meal_type ?? []).map((mt) => MEAL_LABELS[mt] ?? mt).join(" · ");
            const { hasMacros, rows } = macroBreakdown(r);
            const sub = [
              r.cuisine,
              hasMacros ? `P ${r1(r.protein_g ?? 0)}g · C ${r1(r.carbs_g ?? 0)}g · F ${r1(r.fat_g ?? 0)}g` : null,
            ].filter(Boolean).join(" · ");
            const meta = [
              r.fiber_g ? `${r1(r.fiber_g)} g fiber` : null,
              r.prep_time_minutes ? `${r.prep_time_minutes} min prep` : null,
            ].filter(Boolean).join(" · ");
            const flags = [
              r.is_high_protein && "High protein",
              r.is_low_gi && "Low GI",
              r.is_diabetic_friendly && "Diabetic friendly",
              r.is_gerd_safe && "GERD safe",
              r.is_simple && "Simple / quick",
            ].filter(Boolean) as string[];
            const diets = (r.diet_type ?? []).map((d) => DIET_LABELS[d] ?? d);

            return (
              <div key={r.recipe_id} className="db-mealrow-wrap" data-open={isExpanded}>
                <button
                  type="button"
                  className="db-mealrow-head"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : r.recipe_id)}
                >
                  <div style={{ minWidth: 0 }}>
                    {eyebrow && <div className="db-mealrow-eyebrow">{eyebrow}</div>}
                    <div className="db-mealrow-name">{r.recipe_name}</div>
                    {sub && <div className="db-mealrow-sub">{sub}</div>}
                  </div>
                  <div className="db-mealrow-kcal">
                    {r.calories_kcal ? <>{Math.round(r.calories_kcal)}<span>kcal</span></> : "—"}
                  </div>
                  <span className="db-meal-chev">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                </button>

                {isExpanded && (
                  <div className="db-meal-body">
                    <div className="db-card db-daysum" style={{ marginBottom: 16 }}>
                      <div className="db-daysum-main">
                        <div className="db-daysum-label">
                          Per serving{r.serving_size_description ? ` · ${r.serving_size_description}` : ""}
                        </div>
                        <div className="db-daysum-value">
                          {r.calories_kcal ? Math.round(r.calories_kcal) : "—"}<span>kcal</span>
                        </div>
                        {meta && <div className="db-daysum-sub">{meta}</div>}
                        {hasMacros && (
                          <>
                            <div className="db-splitbar" aria-hidden="true">
                              {rows.map((m) => (
                                <span key={m.key} className={m.cls} style={{ flexGrow: Math.max(m.share, 0.001) }} />
                              ))}
                            </div>
                            <div className="db-splitlegend">
                              {rows.map((m) => (
                                <span key={m.key} className={m.cls}><i />{m.label} {Math.round(m.share * 100)}%</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="db-daysum-macros">
                        {rows.map((m) => (
                          <div key={m.key} className={m.cls}>
                            <div className="db-mxrow-top">
                              <span className="db-mxrow-name"><i />{m.label}</span>
                              <span className="db-mxrow-val">{r1(m.grams)}<small>g</small></span>
                            </div>
                            <div className="db-mxrow-track"><span style={{ transform: `scaleX(${m.share})` }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(flags.length > 0 || diets.length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                        {flags.map((x) => <span key={x} className="db-pill db-pill--green">{x}</span>)}
                        {diets.map((x) => <span key={x} className="db-pill db-pill--muted">{x}</span>)}
                      </div>
                    )}

                    {r.ingredients && r.ingredients.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div className="db-planmeal-type" style={{ marginBottom: 6 }}>Ingredients</div>
                        {r.ingredients.map((ing, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                              padding: "8px 0", fontSize: 13.5,
                              borderTop: i === 0 ? "none" : "1px solid var(--db-border)",
                            }}
                          >
                            <span style={{ minWidth: 0, color: "var(--text-primary)" }}>
                              {(ing as unknown as Record<string, string>).ingredient_name || ing.name}
                              {ing.is_optional && <span className="db-pill db-pill--muted" style={{ marginLeft: 8 }}>Optional</span>}
                            </span>
                            <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                              {(ing as unknown as Record<string, number>).quantity_grams} g
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <span className="db-card-sub" style={{ marginTop: 0 }}>
                        Added {r.created_at ? formatDate(r.created_at) : "—"}
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="ps-btn ps-btn--secondary ps-btn--sm"
                          style={{ color: "var(--red)" }}
                          onClick={() => deleteRecipe(r.recipe_id)}
                          disabled={deleting === r.recipe_id}
                        >
                          {deleting === r.recipe_id ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          className="ps-btn ps-btn--secondary ps-btn--sm"
                          onClick={() => { setEditRecipe(r); setSheetOpen(true); }}
                        >
                          <Pencil size={14} /> <span>Edit recipe</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sheetOpen && orgId && (
        <RecipeSheet
          orgId={orgId}
          recipe={editRecipe}
          onClose={() => { setSheetOpen(false); setEditRecipe(null); }}
          onSaved={async () => {
            setSheetOpen(false);
            setEditRecipe(null);
            if (orgId) await loadRecipes(orgId);
            show(editRecipe ? "Recipe updated" : "Recipe added to your library");
          }}
        />
      )}

      {toast}
    </div>
  );
}
