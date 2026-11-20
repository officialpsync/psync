"use client";

import { useState, useEffect } from "react";
import {
  Salad,
  Flame,
  Droplet,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Plus,
  Minus,
  Check,
  AlertCircle,
} from "lucide-react";
import type { PortalMember, PortalDietPlan, PortalDietMeal, PortalDietAlternate } from "../types";
import { getWaterGlasses, setWaterGlasses } from "../lib/portalState";

interface DietTabProps {
  member: PortalMember;
  diet: PortalDietPlan | null;
}

export function DietTab({ member, diet }: DietTabProps) {
  const [expandedMealIdx, setExpandedMealIdx] = useState<number | null>(0);
  const [waterCount, setWaterCount] = useState<number>(0);
  const [selectedAlternate, setSelectedAlternate] = useState<{ mealIdx: number; alternate: PortalDietAlternate } | null>(null);

  useEffect(() => {
    setWaterCount(getWaterGlasses(member.id));
  }, [member.id]);

  function handleWaterChange(delta: number) {
    const next = Math.max(0, waterCount + delta);
    setWaterCount(next);
    setWaterGlasses(member.id, next);
  }

  if (!diet) {
    return (
      <div className="portal-card" style={{ padding: "40px 20px", textAlign: "center", alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--green-dim)",
            color: "var(--green)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Salad size={28} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>No Active Meal Plan</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 280, marginTop: 4 }}>
          Your dietitian or trainer hasn&apos;t generated a meal plan yet. Ask your gym staff to assign one for you in Psync.
        </p>
      </div>
    );
  }

  const meals = diet.plan_json?.meals ?? [];
  const guidelines = diet.plan_json?.general_guidelines ?? [];
  const totals = diet.plan_json?.day_total || {
    calories: diet.target_kcal || 2000,
    protein_g: diet.target_protein_g || 140,
    carbs_g: diet.target_carbs_g || 220,
    fat_g: diet.target_fat_g || 60,
  };

  const cal = Math.round(totals.calories || diet.target_kcal || 0);
  const p = Math.round(totals.protein_g || diet.target_protein_g || 0);
  const c = Math.round(totals.carbs_g || diet.target_carbs_g || 0);
  const f = Math.round(totals.fat_g || diet.target_fat_g || 0);

  const waterTarget = 10; // 10 glasses = 2.5L
  const waterPct = Math.min(100, Math.round((waterCount / waterTarget) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── DAILY MACRO SUMMARY CARD ── */}
      <div className="portal-card" style={{ gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "var(--green)", letterSpacing: "0.05em" }}>
              Daily Nutrition Plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span>{cal.toLocaleString("en-IN")}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>kcal target</span>
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--surface-2)", padding: "4px 10px", borderRadius: 8 }}>
            v{diet.version_number || 1}
          </span>
        </div>

        {/* 3 Macro Bars */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ background: "rgba(0, 113, 227, 0.08)", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0, 113, 227, 0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 650, color: "var(--accent)" }}>PROTEIN</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{p}g</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{Math.round(p * 4)} kcal</div>
          </div>

          <div style={{ background: "rgba(255, 159, 10, 0.08)", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255, 159, 10, 0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 650, color: "var(--amber)" }}>CARBS</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{c}g</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{Math.round(c * 4)} kcal</div>
          </div>

          <div style={{ background: "rgba(175, 82, 222, 0.08)", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(175, 82, 222, 0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 650, color: "var(--purple)" }}>FATS</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{f}g</div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{Math.round(f * 9)} kcal</div>
          </div>
        </div>
      </div>

      {/* ── WATER HYDRATION COUNTER ── */}
      <div className="portal-card" style={{ gap: 10, background: "linear-gradient(180deg, #ffffff 0%, rgba(48, 176, 199, 0.06) 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(48, 176, 199, 0.15)", color: "var(--teal)", display: "grid", placeItems: "center" }}>
              <Droplet size={17} fill="currentColor" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 750 }}>Water Tracker</div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                {waterCount} of {waterTarget} glasses ({Math.round(waterCount * 0.25 * 10) / 10}L)
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => handleWaterChange(-1)}
              disabled={waterCount <= 0}
              className="ps-icon-btn"
              style={{ width: 32, height: 32, background: "var(--fill)", borderRadius: 10 }}
              aria-label="Decrease water"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleWaterChange(1)}
              className="ps-icon-btn"
              style={{ width: 32, height: 32, background: "var(--teal)", color: "#fff", borderRadius: 10 }}
              aria-label="Add glass of water"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Visual Progress bar */}
        <div style={{ height: 6, borderRadius: 999, background: "rgba(48, 176, 199, 0.15)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${waterPct}%`,
              background: "var(--teal)",
              borderRadius: 999,
              transition: "width 250ms ease",
            }}
          />
        </div>
      </div>

      {/* ── MEALS TIMELINE ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Today&apos;s Meals</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{meals.length} scheduled</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {meals.map((meal, idx) => {
          const isExpanded = expandedMealIdx === idx;
          const label = MEAL_LABELS[meal.meal_type] || capitalize(meal.meal_type);
          const ingredients = meal.ingredients || [];
          const alternates = meal.alternates || [];

          return (
            <div key={idx} className="portal-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
              <div
                onClick={() => setExpandedMealIdx(isExpanded ? null : idx)}
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  background: isExpanded ? "var(--surface-2)" : "var(--surface)",
                  transition: "background 150ms ease",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase" }}>
                      {label}
                    </span>
                    {meal.time && (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>• {meal.time}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                    {cleanMealName(meal.recipe_name || meal.meal_label)}
                  </div>
                  {meal.portion && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 1 }}>
                      {meal.portion}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 750, color: "var(--text-primary)" }}>
                      {Math.round(meal.calories)} kcal
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      P {Math.round(meal.protein_g)}g
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: "14px 16px", borderTop: "1px solid var(--separator)", display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Ingredients list */}
                  {ingredients.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)", marginBottom: 6 }}>
                        Ingredients & Portions:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {ingredients.map((ing, ingIdx) => (
                          <div
                            key={ingIdx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 12.5,
                              padding: "4px 8px",
                              background: "var(--surface-2)",
                              borderRadius: 8,
                            }}
                          >
                            <span>{ing.ingredient_name}</span>
                            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                              {ing.quantity_grams ? `${ing.quantity_grams}g` : "As required"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Food items list (if simple mode) */}
                  {meal.food_items && meal.food_items.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)", marginBottom: 6 }}>
                        Items:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {meal.food_items.map((fi, fiIdx) => (
                          <div
                            key={fiIdx}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 12.5,
                              padding: "4px 8px",
                              background: "var(--surface-2)",
                              borderRadius: 8,
                            }}
                          >
                            <span>{fi.food_name}</span>
                            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                              {fi.quantity_grams ? `${fi.quantity_grams}g` : fi.natural_quantity || ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alternates list */}
                  {alternates.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 650, color: "var(--accent)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                        <RefreshCw size={13} /> Approved Substitutes:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {alternates.map((alt, altIdx) => (
                          <div
                            key={altIdx}
                            style={{
                              border: "1px dashed var(--border-mid)",
                              borderRadius: 10,
                              padding: "8px 10px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>{cleanMealName(alt.recipe_name || alt.meal_label)}</div>
                              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{alt.portion || "Standard serving"}</div>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 650, color: "var(--text-secondary)" }}>
                              {Math.round(alt.calories)} kcal
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── COACH GUIDELINES ── */}
      {(guidelines.length > 0 || diet.coach_notes) && (
        <div className="portal-card" style={{ gap: 8, background: "var(--surface-2)" }}>
          <div className="portal-card-title" style={{ fontSize: 13.5 }}>
            <Sparkles size={15} style={{ color: "var(--accent)" }} />
            <span>Coach Guidelines</span>
          </div>

          {diet.coach_notes && (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", fontStyle: "italic" }}>
              &ldquo;{diet.coach_notes}&rdquo;
            </div>
          )}

          {guidelines.length > 0 && (
            <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
              {guidelines.map((g, gIdx) => (
                <li key={gIdx}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early Morning",
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  post_workout: "Post-Workout",
};

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanMealName(name?: string | null): string {
  if (!name) return "Healthy Meal";
  return name.replace(/\s*recipe$/i, "").replace(/^recipe\s*[-–]\s*/i, "").trim();
}
