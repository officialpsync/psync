"use client"
// app/dashboard/diet/components/IngredientSheet.tsx
// Add / edit a gym ingredient, or view a built-in one (read-only, with "make my own copy").
// Used by the Ingredients page and by the recipe form ("Add to ingredients").

import { useEffect, useState } from "react"
import { Loader2, Copy, Archive, ArchiveRestore, Sparkles, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Sheet } from "../../components/Sheet"
import { INGREDIENT_GROUPS, ingredientGroup, type IngredientGroup, type IngredientRow } from "@/lib/nutrition/recipeMath"

const supabase = createClient()

type Form = {
  food_name: string; common_name: string; group: IngredientGroup
  energy_kcal: string; protein_g: string; carbs_g: string; fat_g: string; fiber_g: string
  is_low_gi: boolean; is_low_sodium: boolean; is_gerd_safe: boolean; notes: string
}

const EMPTY: Form = {
  food_name: "", common_name: "", group: "vegetable",
  energy_kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "",
  is_low_gi: false, is_low_sodium: false, is_gerd_safe: false, notes: "",
}

/** AI per-100g estimate passed in from the recipe helper when an ingredient isn't in the catalog. */
export type IngredientEstimate = { kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number }

const MACROS: { key: "protein_g" | "carbs_g" | "fat_g" | "fiber_g"; label: string; tone: string }[] = [
  { key: "protein_g", label: "Protein", tone: "p" },
  { key: "carbs_g", label: "Carbs", tone: "c" },
  { key: "fat_g", label: "Fat", tone: "f" },
  { key: "fiber_g", label: "Fiber", tone: "x" },
]

const NUM_FIELDS: { key: "energy_kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g"; label: string; max: number }[] = [
  { key: "energy_kcal", label: "Calories (kcal)", max: 950 },
  { key: "protein_g", label: "Protein (g)", max: 100 },
  { key: "carbs_g", label: "Carbs (g)", max: 100 },
  { key: "fat_g", label: "Fat (g)", max: 100 },
  { key: "fiber_g", label: "Fiber (g)", max: 100 },
]

function fromRow(r: IngredientRow): Form {
  const s = (v: number | null | undefined) => (v == null ? "" : String(Number(v)))
  return {
    food_name: r.food_name, common_name: r.common_name ?? "", group: ingredientGroup(r.category),
    energy_kcal: s(r.energy_kcal), protein_g: s(r.protein_g), carbs_g: s(r.carbs_g), fat_g: s(r.fat_g), fiber_g: s(r.fiber_g),
    is_low_gi: !!r.is_low_gi, is_low_sodium: !!r.is_low_sodium, is_gerd_safe: !!r.is_gerd_safe, notes: r.notes ?? "",
  }
}

export function IngredientSheet({ open, onClose, orgId, userId, ingredient, initialName, initialEstimate, onSaved }: {
  open: boolean
  onClose: () => void
  orgId: string
  userId: string
  ingredient?: IngredientRow | null   // null/undefined = create
  initialName?: string                // prefill when adding from a recipe
  initialEstimate?: IngredientEstimate // AI per-100g guess, prefilled for the trainer to verify
  onSaved: (row: IngredientRow) => void
}) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [mode, setMode] = useState<"create" | "edit" | "view">("create")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [fromEstimate, setFromEstimate] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(""); setSaving(false)
    if (ingredient) {
      setForm(fromRow(ingredient))
      setMode(ingredient.org_id ? "edit" : "view")
    } else {
      const est = initialEstimate
      const r1 = (v: number) => String(Math.round(v * 10) / 10)
      setForm({
        ...EMPTY,
        food_name: (initialName ?? "").slice(0, 60),
        ...(est ? {
          energy_kcal: String(Math.round(est.kcal_100g)),
          protein_g: r1(est.protein_100g), carbs_g: r1(est.carbs_100g),
          fat_g: r1(est.fat_100g), fiber_g: r1(est.fiber_100g),
        } : {}),
      })
      setFromEstimate(!!est)
      setMode("create")
    }
    if (ingredient) setFromEstimate(false)
  }, [open, ingredient, initialName, initialEstimate])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (v: string) => (v.trim() === "" ? null : Number(v))
  const readOnly = mode === "view"

  // Sanity hint: calories implied by the macros (4/4/9). Warns, doesn't block.
  const p = num(form.protein_g) ?? 0, c = num(form.carbs_g) ?? 0, fat = num(form.fat_g) ?? 0
  const implied = Math.round(p * 4 + c * 4 + fat * 9)
  const kcal = num(form.energy_kcal)
  const kcalOff = kcal != null && implied > 20 && Math.abs(kcal - implied) / implied > 0.25
  const split = implied > 0
    ? { p: Math.round((p * 4 / implied) * 100), c: Math.round((c * 4 / implied) * 100), f: Math.round((fat * 9 / implied) * 100) }
    : null

  function validate(): string | null {
    const name = form.food_name.trim()
    if (!name) return "Give the ingredient a name"
    if (name.length > 60) return "Name is too long (60 characters max)"
    if (kcal == null) return "Calories per 100 g are required"
    for (const f of NUM_FIELDS) {
      const v = num(form[f.key])
      if (v != null && (!Number.isFinite(v) || v < 0 || v > f.max)) return `${f.label} must be between 0 and ${f.max} per 100 g`
    }
    if (p + c + fat > 100.5) return "Protein + carbs + fat can't be more than 100 g per 100 g"
    return null
  }

  async function save() {
    const msg = validate()
    if (msg) { setError(msg); return }
    setSaving(true); setError("")
    const payload = {
      food_name: form.food_name.trim(),
      common_name: form.common_name.trim() || null,
      category: form.group,
      energy_kcal: kcal,
      protein_g: num(form.protein_g) ?? 0,
      carbs_g: num(form.carbs_g) ?? 0,
      fat_g: num(form.fat_g) ?? 0,
      fiber_g: num(form.fiber_g),
      is_low_gi: form.is_low_gi,
      is_low_sodium: form.is_low_sodium,
      is_gerd_safe: form.is_gerd_safe,
      notes: form.notes.trim().slice(0, 300) || null,
    }
    const q = mode === "edit" && ingredient
      ? supabase.from("ingredients").update(payload).eq("id", ingredient.id).eq("org_id", orgId)
      : supabase.from("ingredients").insert({ ...payload, org_id: orgId, created_by: userId, source: "Gym", is_active: true })
    const { data, error: err } = await q.select("*").single()
    setSaving(false)
    if (err || !data) {
      setError(err?.code === "23505" ? "You already have an ingredient with this name." : err?.message ?? "Couldn't save")
      return
    }
    onSaved(data as IngredientRow)
  }

  async function toggleArchive() {
    if (!ingredient) return
    setSaving(true)
    const next = ingredient.is_active === false
    const { data, error: err } = await supabase.from("ingredients").update({ is_active: next })
      .eq("id", ingredient.id).eq("org_id", orgId).select("*").single()
    setSaving(false)
    if (err || !data) { setError(err?.message ?? "Couldn't update"); return }
    onSaved(data as IngredientRow)
  }

  function makeCopy() {
    setForm((f) => ({ ...f, food_name: `${f.food_name} (gym)`.slice(0, 60) }))
    setMode("create")
  }

  const title = mode === "view" ? form.food_name : mode === "edit" ? "Edit ingredient" : "New ingredient"
  const description = mode === "view"
    ? "Built-in ingredient. Values are per 100 g, raw."
    : "Values per 100 g, raw weight. Only your gym can see ingredients you add."

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={880}
      title={title}
      description={description}
      footer={
        mode === "view" ? (
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Close</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={makeCopy}><Copy size={15} /><span>Make my own copy</span></button>
          </>
        ) : (
          <>
            {mode === "edit" && ingredient ? (
              <button type="button" className="ps-btn ps-btn--secondary" onClick={toggleArchive} disabled={saving}>
                {ingredient.is_active === false ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                <span>{ingredient.is_active === false ? "Restore" : "Archive"}</span>
              </button>
            ) : (
              <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
            )}
            <button type="button" className="ps-btn ps-btn--primary" onClick={save} disabled={saving}>
              {saving && <Loader2 size={15} className="ps-spin" />}
              <span>{mode === "edit" ? "Save changes" : "Add ingredient"}</span>
            </button>
          </>
        )
      }
    >
      <div className="db">
        {error && <div className="ps-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

        {fromEstimate && mode === "create" && (
          <div className="db-ing-est" role="note">
            <span className="db-ing-est-icon"><Sparkles size={14} strokeWidth={2.4} /></span>
            <div>
              <strong>Pre-filled from an AI estimate</strong>
              <span>Check these against a pack label or IFCT before saving. Every recipe using this ingredient will rely on them.</span>
            </div>
          </div>
        )}

        <div className="db-is-layout">
        <div className="db-is-main">
        <div className="db-fieldset db-field-row db-is-o-name">
          <div className="ps-field">
            <label className="ps-label" htmlFor="ing-name">Name</label>
            <input id="ing-name" className="ps-input" value={form.food_name} maxLength={60} disabled={readOnly}
              onChange={(e) => set("food_name", e.target.value)} placeholder="e.g. Whole urad dal" />
          </div>
          <div className="ps-field">
            <label className="ps-label" htmlFor="ing-common">Also called <span className="db-opt">optional</span></label>
            <input id="ing-common" className="ps-input" value={form.common_name} maxLength={60} disabled={readOnly}
              onChange={(e) => set("common_name", e.target.value)} placeholder="e.g. Sabut urad" />
          </div>
        </div>

        <div className="db-fieldset db-is-o-group">
          <span className="db-fieldset-label">Group</span>
          <div className="db-presets" role="radiogroup" aria-label="Group">
            {INGREDIENT_GROUPS.map((g) => (
              <button key={g.key} type="button" className="db-preset" role="radio" disabled={readOnly}
                aria-checked={form.group === g.key} aria-pressed={form.group === g.key} onClick={() => set("group", g.key)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        </div>
        <div className="db-is-side">
        <div className="db-fieldset db-is-o-nutri">
          <div className="db-fieldset-head">
            <span className="db-fieldset-label">Nutrition</span>
            <span className="db-fieldset-hint">per 100 g, raw</span>
          </div>

          <div className="db-nutri">
            <label className="db-nutri-kcal" htmlFor="ing-energy_kcal">
              <span className="db-nutri-kcal-label">Calories</span>
              <span className="db-nutri-kcal-field">
                <input id="ing-energy_kcal" inputMode="decimal" disabled={readOnly} placeholder="0"
                  value={form.energy_kcal} aria-label="Calories per 100 g"
                  onChange={(e) => set("energy_kcal", e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
                <em>kcal</em>
              </span>
            </label>

            <div className="db-nutri-grid">
              {MACROS.map((m) => (
                <label key={m.key} className={`db-nutri-cell db-nutri-${m.tone}`} htmlFor={`ing-${m.key}`}>
                  <span className="db-nutri-cell-label"><i aria-hidden />{m.label}</span>
                  <span className="db-nutri-cell-field">
                    <input id={`ing-${m.key}`} inputMode="decimal" disabled={readOnly} placeholder="0"
                      value={form[m.key]} aria-label={`${m.label} grams per 100 g`}
                      onChange={(e) => set(m.key, e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
                    <em>g</em>
                  </span>
                </label>
              ))}
            </div>

            {split && (
              <div className="db-nutri-split" aria-label="Where the calories come from">
                <div className="db-nutri-bar">
                  {split.p > 0 && <span className="db-nutri-p" style={{ flexGrow: split.p }} />}
                  {split.c > 0 && <span className="db-nutri-c" style={{ flexGrow: split.c }} />}
                  {split.f > 0 && <span className="db-nutri-f" style={{ flexGrow: split.f }} />}
                </div>
                <div className="db-nutri-legend">
                  <span><i className="db-nutri-p" />Protein {split.p}%</span>
                  <span><i className="db-nutri-c" />Carbs {split.c}%</span>
                  <span><i className="db-nutri-f" />Fat {split.f}%</span>
                  <span className="db-nutri-implied">≈ {implied} kcal from macros</span>
                </div>
              </div>
            )}
          </div>

          {kcalOff && !readOnly && (
            <div className="db-callout db-tone-amber" style={{ marginTop: 10 }}>
              <AlertTriangle size={15} />
              <span>These macros add up to about {implied} kcal, but calories say {kcal}. Double-check the label.</span>
            </div>
          )}
        </div>

        </div>
        <div className="db-is-main db-is-main--after">
        <div className="db-fieldset db-is-o-suit">
          <span className="db-fieldset-label">Suitable for</span>
          <div className="db-presets">
            {([["is_low_gi", "Low GI"], ["is_low_sodium", "Low sodium"], ["is_gerd_safe", "GERD safe"]] as const).map(([k, label]) => (
              <button key={k} type="button" className="db-preset" disabled={readOnly} aria-pressed={form[k]} onClick={() => set(k, !form[k])}>{label}</button>
            ))}
          </div>
        </div>

        {(!readOnly || form.notes) && (
          <div className="db-fieldset db-is-o-notes">
            <label className="db-fieldset-label" htmlFor="ing-notes">Notes <span className="db-opt">optional</span></label>
            <textarea id="ing-notes" className="ps-input" rows={2} maxLength={300} disabled={readOnly}
              value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Brand, source, or how it's usually cooked" />
          </div>
        )}
        </div>
        </div>
      </div>
    </Sheet>
  )
}
