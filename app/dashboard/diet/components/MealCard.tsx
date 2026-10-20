"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, RefreshCw, Flame } from "lucide-react"
import type { Meal } from "@/lib/nutrition/types"

const slotLabels: Record<string, string> = {
  breakfast: "Breakfast",
  snack_am: "Morning snack",
  lunch: "Lunch",
  snack_pm: "Afternoon snack",
  dinner: "Dinner",
  snack_evening: "Evening snack",
}

interface MealCardProps {
  meal: Meal
  isProteinHeavy?: boolean
}

export default function MealCard({ meal, isProteinHeavy }: MealCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showSwap, setShowSwap] = useState<number | null>(null)

  const displayed = showSwap !== null && meal.swaps?.[showSwap] ? meal.swaps[showSwap] : meal

  return (
    <div className="db-card db-meal">
      {/* Header row */}
      <button onClick={() => setExpanded((e) => !e)} className="db-meal-head" type="button">
        <div className="db-meal-slot">{slotLabels[meal.slot] ?? meal.slot}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="db-meal-name">
            {displayed.label}
            {isProteinHeavy && <span className="db-pill db-pill--purple db-meal-tag">High protein</span>}
          </div>
        </div>

        <div className="db-meal-macros">
          <span className="db-meal-kcal"><Flame size={11} strokeWidth={2.4} /> {Math.round(displayed.total_kcal)} kcal</span>
          <span className="db-meal-macro db-hide-sm">P {Math.round(displayed.total_protein_g)}g</span>
          <span className="db-meal-macro db-hide-sm">C {Math.round(displayed.total_carbs_g)}g</span>
          <span className="db-meal-macro db-hide-sm">F {Math.round(displayed.total_fat_g)}g</span>
          {expanded ? <ChevronUp size={15} className="db-meal-chev" /> : <ChevronDown size={15} className="db-meal-chev" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="db-meal-body">
          <div className="db-rows" style={{ margin: "0 0 14px" }}>
            {displayed.items.map((item, i) => (
              <div key={i} className="db-meal-item">
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span className="db-meal-dot" />
                  <span className="db-row-title" style={{ fontWeight: 500 }}>{item.name}</span>
                  <span className="db-row-sub" style={{ flexShrink: 0 }}>{item.quantity_label}</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <span className="db-meal-kcal">{Math.round(item.kcal)} kcal</span>
                  <span className="db-meal-macro" style={{ color: "var(--accent)" }}>P {Math.round(item.protein_g)}g</span>
                </div>
              </div>
            ))}
          </div>

          {meal.swaps && meal.swaps.length > 0 && (
            <div>
              <div className="db-meal-swap-label"><RefreshCw size={12} /> Swap options</div>
              <div className="db-presets">
                <button type="button" className="db-preset" aria-pressed={showSwap === null} onClick={() => setShowSwap(null)}>
                  Original
                </button>
                {meal.swaps.map((swap, i) => (
                  <button key={i} type="button" className="db-preset" aria-pressed={showSwap === i} onClick={() => setShowSwap(i)}>
                    {swap.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
