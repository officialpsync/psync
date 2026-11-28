"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Salad, BarChart3, Settings, ShieldCheck, Download,
  ChevronRight, Calendar, Carrot, ChefHat, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, Flame, Apple,
  CheckCircle2, Sparkles, Utensils
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";

const supabase = createClient();

type NutritionSettings = {
  bmrFormula: "mifflin" | "harris_benedict";
  defaultCarbPct: number;
  defaultProteinPct: number;
  defaultFatPct: number;
  dailyWaterTargetLiters: number;
  aiRecipeCuisine: string;
  enableAllergenWarnings: boolean;
};

const DEFAULT_SETTINGS: NutritionSettings = {
  bmrFormula: "mifflin",
  defaultCarbPct: 40,
  defaultProteinPct: 30,
  defaultFatPct: 30,
  dailyWaterTargetLiters: 3.5,
  aiRecipeCuisine: "Indian & Continental",
  enableAllergenWarnings: true,
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function NutritionReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);

  const [recipesCount, setRecipesCount] = useState(0);
  const [plansCount, setPlansCount] = useState(0);
  const [avgCalories, setAvgCalories] = useState<number | null>(null);
  const [avgProtein, setAvgProtein] = useState<number | null>(null);
  const [goalsData, setGoalsData] = useState<{ name: string; value: number }[]>([]);
  const [calorieRangeData, setCalorieRangeData] = useState<{ range: string; members: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<NutritionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        const [
          { count: rCount },
          { data: dietPlans },
          { data: membersData }
        ] = await Promise.all([
          supabase.from("recipes").select("recipe_id", { count: "exact", head: true }).or(`org_id.eq.${roleData.org_id},org_id.is.null`),
          supabase.from("member_diet_plans").select("id, status, target_kcal, target_protein_g").eq("org_id", roleData.org_id),
          supabase.from("members").select("id, primary_goal").eq("org_id", roleData.org_id),
        ]);

        setRecipesCount(rCount || 0);

        const plans = dietPlans || [];
        const activePlans = plans.filter((p) => p.status === "active");
        setPlansCount(activePlans.length > 0 ? activePlans.length : plans.length);

        const plansWithKcal = plans.filter((p) => Number(p.target_kcal) > 0);
        if (plansWithKcal.length > 0) {
          const totalKcal = plansWithKcal.reduce((acc, p) => acc + Number(p.target_kcal), 0);
          setAvgCalories(Math.round(totalKcal / plansWithKcal.length));
        } else {
          setAvgCalories(null);
        }

        const plansWithProtein = plans.filter((p) => Number(p.target_protein_g) > 0);
        if (plansWithProtein.length > 0) {
          const totalProtein = plansWithProtein.reduce((acc, p) => acc + Number(p.target_protein_g), 0);
          setAvgProtein(Math.round(totalProtein / plansWithProtein.length));
        } else {
          setAvgProtein(null);
        }

        // Goals distribution from members table
        const goalCounts: Record<string, number> = {};
        const goalLabels: Record<string, string> = {
          fat_loss: "Fat Loss",
          muscle_gain: "Muscle Gain",
          general_fitness: "General Fitness",
          weight_loss: "Weight Loss",
          weight_gain: "Weight Gain",
          endurance: "Endurance",
          maintenance: "Maintenance",
        };

        (membersData || []).forEach((m) => {
          if (m.primary_goal) {
            const label = goalLabels[m.primary_goal] || m.primary_goal.replace(/_/g, " ");
            goalCounts[label] = (goalCounts[label] || 0) + 1;
          }
        });

        const formattedGoals = Object.entries(goalCounts).map(([name, value]) => ({ name, value }));
        setGoalsData(formattedGoals);

        // Calorie distribution buckets from actual member diet plans
        const ranges = [
          { range: "< 1600 kcal", min: 0, max: 1599, members: 0 },
          { range: "1600 - 2000", min: 1600, max: 2000, members: 0 },
          { range: "2000 - 2400", min: 2001, max: 2400, members: 0 },
          { range: "2400 - 2800", min: 2401, max: 2800, members: 0 },
          { range: "2800+ kcal", min: 2801, max: 99999, members: 0 },
        ];

        plansWithKcal.forEach((p) => {
          const kcal = Number(p.target_kcal);
          const bucket = ranges.find((r) => kcal >= r.min && kcal <= r.max);
          if (bucket) bucket.members++;
        });

        setCalorieRangeData(ranges.map((r) => ({ range: r.range, members: r.members })));

        const savedSettings = localStorage.getItem(`psync_nutrition_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
          } catch {}
        }
      } catch (err) {
        console.error("Nutrition reports load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [roleData.org_id]);

  const handleSaveSettings = () => {
    if (!roleData.org_id) return;
    setSavingSettings(true);
    try {
      localStorage.setItem(`psync_nutrition_settings_${roleData.org_id}`, JSON.stringify(settings));
      setTimeout(() => {
        setSavingSettings(false);
        show("Nutrition formulas & dietary preferences saved!", "success");
      }, 300);
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // Export CSV
  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Category,Count\nRecipes in Library," +
      recipesCount +
      "\nActive Diet Plans," +
      plansCount +
      "\nAverage Daily Calories," +
      (avgCalories ? `${avgCalories} kcal` : "N/A") +
      "\nAverage Protein," +
      (avgProtein ? `${avgProtein}g` : "N/A") +
      "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Nutrition_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Nutrition analytics exported to CSV", "success");
  };

  const hasCalorieData = calorieRangeData.some((c) => c.members > 0);

  return (
    <div className="ps-page nut-page">
      <DesignStyles />
      <style>{NUT_CSS}</style>

      {/* Header */}
      <header className="nut-head">
        <div>
          <div className="nut-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/diet">Nutrition</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Nutrition Reports & Settings</h1>
          <p>Meal plan utilization, macro distributions, calorie targets, and dietary guidelines.</p>
        </div>

        <div className="nut-head-actions">
          {activeTab === "reports" && (
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={handleExport}>
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          )}

          {activeTab === "settings" && (
            <button
              type="button"
              className="ps-btn ps-btn--primary ps-btn--sm"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              <Save size={14} />
              <span>{savingSettings ? "Saving..." : "Save Settings"}</span>
            </button>
          )}

          <Link href="/dashboard/diet" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Salad size={14} />
            <span>Diet Plans</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="nut-tabs-row">
        <div className="nut-segmented">
          <button
            type="button"
            className={`nut-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/diet/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Nutrition Reports</span>
          </button>
          <button
            type="button"
            className={`nut-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/diet/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Nutrition Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="nut-content">
          {/* KPIs */}
          <div className="nut-kpis">
            <div className="nut-kpi">
              <div className="nut-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <Salad size={18} />
              </div>
              <div>
                <div className="nut-kpi-label">Active Diet Plans</div>
                <div className="nut-kpi-val">{plansCount}</div>
                <div className="nut-kpi-sub">Prescribed to members</div>
              </div>
            </div>

            <div className="nut-kpi">
              <div className="nut-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <ChefHat size={18} />
              </div>
              <div>
                <div className="nut-kpi-label">Recipe Library</div>
                <div className="nut-kpi-val">{recipesCount}</div>
                <div className="nut-kpi-sub">Verified meal items</div>
              </div>
            </div>

            <div className="nut-kpi">
              <div className="nut-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <Flame size={18} />
              </div>
              <div>
                <div className="nut-kpi-label">Average Calories</div>
                <div className="nut-kpi-val">{avgCalories !== null ? `${avgCalories}` : "—"}</div>
                <div className="nut-kpi-sub">{avgCalories !== null ? "kcal / member / day" : "No calorie targets yet"}</div>
              </div>
            </div>

            <div className="nut-kpi">
              <div className="nut-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <Apple size={18} />
              </div>
              <div>
                <div className="nut-kpi-label">Avg Daily Protein</div>
                <div className="nut-kpi-val">{avgProtein !== null ? `${avgProtein}g` : "—"}</div>
                <div className="nut-kpi-sub">{avgProtein !== null ? "Target protein intake" : "No protein targets yet"}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="nut-charts-grid">
            <div className="nut-card">
              <div className="nut-card-title">Member Diet Goals Distribution</div>
              {goalsData.length === 0 ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <Salad size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No member goals recorded yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={goalsData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {goalsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="nut-card">
              <div className="nut-card-title">Daily Calorie Target Ranges</div>
              {!hasCalorieData ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <Flame size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No calorie targets set in diet plans yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={calorieRangeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="members" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="nut-settings-grid">
          <div className="nut-card">
            <div className="nut-card-title">
              <Flame size={16} /> Calorie & Macro Calculation Rules
            </div>
            <p className="nut-card-sub">Formulas used when dietitians generate plans for gym members.</p>

            <div className="nut-form-row">
              <label>BMR Calculation Formula</label>
              <select
                value={settings.bmrFormula}
                onChange={(e) => setSettings({ ...settings, bmrFormula: e.target.value as any })}
              >
                <option value="mifflin">Mifflin-St Jeor (Standard & Most Accurate)</option>
                <option value="harris_benedict">Revised Harris-Benedict</option>
              </select>
            </div>

            <div className="nut-form-row">
              <label>Default Macro Ratio (% Carbs / Protein / Fat)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <small style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Carbs %</small>
                  <input
                    type="number"
                    className="ps-input"
                    value={settings.defaultCarbPct}
                    onChange={(e) => setSettings({ ...settings, defaultCarbPct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <small style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Protein %</small>
                  <input
                    type="number"
                    className="ps-input"
                    value={settings.defaultProteinPct}
                    onChange={(e) => setSettings({ ...settings, defaultProteinPct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <small style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Fat %</small>
                  <input
                    type="number"
                    className="ps-input"
                    value={settings.defaultFatPct}
                    onChange={(e) => setSettings({ ...settings, defaultFatPct: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="nut-form-row" style={{ marginTop: 12 }}>
              <label>Daily Hydration Target</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  step="0.5"
                  className="ps-input"
                  style={{ width: 100 }}
                  value={settings.dailyWaterTargetLiters}
                  onChange={(e) => setSettings({ ...settings, dailyWaterTargetLiters: Number(e.target.value) })}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Litres / day</span>
              </div>
            </div>
          </div>

          <div className="nut-card">
            <div className="nut-card-title">
              <Sparkles size={16} /> AI Recipe Generator & Diet Defaults
            </div>
            <p className="nut-card-sub">Preferences for automated recipe & meal plan creation.</p>

            <div className="nut-form-row">
              <label>Preferred Cuisine for AI Suggestions</label>
              <select
                value={settings.aiRecipeCuisine}
                onChange={(e) => setSettings({ ...settings, aiRecipeCuisine: e.target.value })}
              >
                <option value="Indian & Continental">Indian & Continental (Balanced)</option>
                <option value="Traditional Indian">Traditional Indian (High Protein Roti & Dal)</option>
                <option value="Mediterranean">Mediterranean / Lean Meat & Salads</option>
                <option value="Vegetarian Only">Pure Vegetarian / Lacto-Ovo</option>
              </select>
            </div>

            <div className="nut-toggle-row" style={{ marginTop: 14 }}>
              <div>
                <strong>Automatic Allergen Warnings</strong>
                <p>Highlight gluten, lactose, peanut, and soy items in meal plans</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableAllergenWarnings}
                onChange={(e) => setSettings({ ...settings, enableAllergenWarnings: e.target.checked })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NutritionReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <NutritionReportsAndSettingsContent />
    </Suspense>
  );
}

const NUT_CSS = `
.nut-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.nut-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.nut-breadcrumb a { color: inherit; text-decoration: none; }
.nut-breadcrumb a:hover { color: var(--text-primary); }
.nut-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.nut-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.nut-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.nut-head-actions { display: flex; align-items: center; gap: 10px; }

.nut-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.nut-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.nut-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.nut-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.nut-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.nut-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.nut-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.nut-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.nut-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.nut-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.nut-charts-grid, .nut-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.nut-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.nut-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.nut-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.nut-form-row { margin-bottom: 14px; }
.nut-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.nut-form-row select { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }

.nut-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.nut-toggle-row:last-child { border-bottom: none; }
.nut-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.nut-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.nut-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .nut-charts-grid, .nut-settings-grid { grid-template-columns: 1fr; }
}
`;
