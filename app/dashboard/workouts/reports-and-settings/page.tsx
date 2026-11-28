"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Dumbbell, BarChart3, Settings, ShieldCheck, Download,
  ChevronRight, Calendar, Library, ClipboardList, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, Flame, Activity,
  CheckCircle2, Sparkles, Timer, Trophy
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

type WorkoutSettings = {
  defaultWeightUnit: "kg" | "lbs";
  defaultRestTimerSecs: number;
  oneRepMaxFormula: "epley" | "brzycki";
  autoProgressWeightKg: number;
  requireWarmupSets: boolean;
  allowMemberCustomExercises: boolean;
};

const DEFAULT_SETTINGS: WorkoutSettings = {
  defaultWeightUnit: "kg",
  defaultRestTimerSecs: 90,
  oneRepMaxFormula: "epley",
  autoProgressWeightKg: 2.5,
  requireWarmupSets: true,
  allowMemberCustomExercises: false,
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function WorkoutsReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);

  const [programsCount, setProgramsCount] = useState(0);
  const [exercisesCount, setExercisesCount] = useState(0);
  const [avgDaysPerWeek, setAvgDaysPerWeek] = useState<number | null>(null);
  const [muscleFocusData, setMuscleFocusData] = useState<{ name: string; value: number }[]>([]);
  const [splitsData, setSplitsData] = useState<{ split: string; percentage: number; count: number }[]>([]);
  const [exerciseList, setExerciseList] = useState<{ name: string; muscle: string; equipment: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<WorkoutSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        const [
          { data: programs },
          { data: exercises }
        ] = await Promise.all([
          supabase.from("workout_programs").select("id, name, goal, difficulty, days_per_week, status").eq("org_id", roleData.org_id),
          supabase.from("workout_exercises").select("id, name, muscle_group, equipment, category, movement_type").or(`org_id.eq.${roleData.org_id},org_id.is.null`),
        ]);

        const progs = programs || [];
        setProgramsCount(progs.length);

        const exList = exercises || [];
        setExercisesCount(exList.length);

        const progsWithDays = progs.filter((p) => Number(p.days_per_week) > 0);
        if (progsWithDays.length > 0) {
          const totalDays = progsWithDays.reduce((acc, p) => acc + Number(p.days_per_week), 0);
          setAvgDaysPerWeek(Number((totalDays / progsWithDays.length).toFixed(1)));
        } else {
          setAvgDaysPerWeek(null);
        }

        // Muscle focus distribution from actual exercises
        const muscleCounts: Record<string, number> = {};
        const muscleDisplay: Record<string, string> = {
          chest: "Chest",
          back: "Back",
          shoulders: "Shoulders",
          arms: "Arms",
          legs: "Legs",
          core: "Core & Abs",
          full_body: "Full Body",
          cardio: "Cardio",
        };

        exList.forEach((e) => {
          const m = e.muscle_group ? (muscleDisplay[e.muscle_group] || e.muscle_group) : "Other";
          muscleCounts[m] = (muscleCounts[m] || 0) + 1;
        });

        const formattedMuscles = Object.entries(muscleCounts).map(([name, value]) => ({ name, value }));
        setMuscleFocusData(formattedMuscles);

        // Program goals / splits distribution
        const goalCounts: Record<string, number> = {};
        const goalDisplay: Record<string, string> = {
          general_fitness: "General Fitness",
          strength: "Strength & Power",
          fat_loss: "Fat Loss & Conditioning",
          endurance: "Athletic Endurance",
          hypertrophy: "Muscle Hypertrophy",
        };

        progs.forEach((p) => {
          const g = p.goal ? (goalDisplay[p.goal] || p.goal) : "General Routine";
          goalCounts[g] = (goalCounts[g] || 0) + 1;
        });

        const totalProgs = progs.length || 1;
        const formattedSplits = Object.entries(goalCounts).map(([split, count]) => ({
          split,
          count,
          percentage: Math.round((count / totalProgs) * 100),
        }));
        setSplitsData(formattedSplits);

        // Real exercises list
        setExerciseList(
          exList.slice(0, 10).map((e) => ({
            name: e.name,
            muscle: e.muscle_group ? (muscleDisplay[e.muscle_group] || e.muscle_group) : "General",
            equipment: e.equipment ? e.equipment.replace(/_/g, " ") : "Bodyweight",
            category: e.category || "Strength",
          }))
        );

        const savedSettings = localStorage.getItem(`psync_workout_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
          } catch {}
        }
      } catch (err) {
        console.error("Workout reports load error:", err);
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
      localStorage.setItem(`psync_workout_settings_${roleData.org_id}`, JSON.stringify(settings));
      setTimeout(() => {
        setSavingSettings(false);
        show("Workout parameters & progression rules saved!", "success");
      }, 300);
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // Export CSV
  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Category,Count\nActive Programs," +
      programsCount +
      "\nExercise Library," +
      exercisesCount +
      "\nAverage Days Per Week," +
      (avgDaysPerWeek !== null ? `${avgDaysPerWeek} days` : "N/A") +
      "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Workout_Analytics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Workout analytics exported to CSV", "success");
  };

  return (
    <div className="ps-page wkt-page">
      <DesignStyles />
      <style>{WKT_CSS}</style>

      {/* Header */}
      <header className="wkt-head">
        <div>
          <div className="wkt-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/workouts">Workouts</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Workout Reports & Settings</h1>
          <p>Training program utilization, muscle targeting, routine splits, and workout builder parameters.</p>
        </div>

        <div className="wkt-head-actions">
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

          <Link href="/dashboard/workouts" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Dumbbell size={14} />
            <span>Workout Plans</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="wkt-tabs-row">
        <div className="wkt-segmented">
          <button
            type="button"
            className={`wkt-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/workouts/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Workout Reports</span>
          </button>
          <button
            type="button"
            className={`wkt-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/workouts/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Workout Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="wkt-content">
          {/* KPIs */}
          <div className="wkt-kpis">
            <div className="wkt-kpi">
              <div className="wkt-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <Dumbbell size={18} />
              </div>
              <div>
                <div className="wkt-kpi-label">Active Workout Plans</div>
                <div className="wkt-kpi-val">{programsCount}</div>
                <div className="wkt-kpi-sub">Custom gym programs</div>
              </div>
            </div>

            <div className="wkt-kpi">
              <div className="wkt-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <Library size={18} />
              </div>
              <div>
                <div className="wkt-kpi-label">Exercise Library</div>
                <div className="wkt-kpi-val">{exercisesCount}</div>
                <div className="wkt-kpi-sub">Exercises cataloged</div>
              </div>
            </div>

            <div className="wkt-kpi">
              <div className="wkt-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <Activity size={18} />
              </div>
              <div>
                <div className="wkt-kpi-label">Avg Frequency</div>
                <div className="wkt-kpi-val">{avgDaysPerWeek !== null ? `${avgDaysPerWeek}` : "—"}</div>
                <div className="wkt-kpi-sub">{avgDaysPerWeek !== null ? "days / week scheduled" : "No schedule set yet"}</div>
              </div>
            </div>

            <div className="wkt-kpi">
              <div className="wkt-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <Trophy size={18} />
              </div>
              <div>
                <div className="wkt-kpi-label">Focus Muscle Groups</div>
                <div className="wkt-kpi-val">{muscleFocusData.length}</div>
                <div className="wkt-kpi-sub">Covered in exercise base</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="wkt-charts-grid">
            <div className="wkt-card">
              <div className="wkt-card-title">Muscle Group Focus Distribution</div>
              {muscleFocusData.length === 0 ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <Dumbbell size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No exercises found</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={muscleFocusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {muscleFocusData.map((entry, index) => (
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

            <div className="wkt-card">
              <div className="wkt-card-title">Training Programs by Goal</div>
              {splitsData.length === 0 ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <ClipboardList size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No workout programs created yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={splitsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="split" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} formatter={(v: any) => `${v}%`} />
                      <Bar dataKey="percentage" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Exercise Library Sample */}
          <div className="wkt-card" style={{ marginTop: 20 }}>
            <div className="wkt-card-title">Exercise Library Catalog (Sample)</div>
            {exerciseList.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>No exercises found in library.</p>
            ) : (
              <>
                <div className="wkt-table-head">
                  <div>Exercise</div>
                  <div>Primary Muscle</div>
                  <div>Equipment</div>
                  <div style={{ textAlign: "right" }}>Category</div>
                </div>
                {exerciseList.map((e, idx) => (
                  <div key={idx} className="wkt-table-row">
                    <div style={{ fontWeight: 650 }}>{e.name}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>{e.muscle}</div>
                    <div style={{ fontWeight: 550, textTransform: "capitalize", fontSize: 13 }}>{e.equipment}</div>
                    <div style={{ textAlign: "right", fontWeight: 600, color: "#0a84ff", textTransform: "capitalize" }}>{e.category}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="wkt-settings-grid">
          <div className="wkt-card">
            <div className="wkt-card-title">
              <Timer size={16} /> Rest Timers & Units
            </div>
            <p className="wkt-card-sub">Preferences for exercise logging and rest countdowns.</p>

            <div className="nut-form-row">
              <label>Default Weight Unit</label>
              <select
                value={settings.defaultWeightUnit}
                onChange={(e) => setSettings({ ...settings, defaultWeightUnit: e.target.value as any })}
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="lbs">Pounds (lbs)</option>
              </select>
            </div>

            <div className="nut-form-row">
              <label>Default Rest Timer (seconds)</label>
              <input
                type="number"
                step="15"
                className="ps-input"
                value={settings.defaultRestTimerSecs}
                onChange={(e) => setSettings({ ...settings, defaultRestTimerSecs: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="wkt-card">
            <div className="wkt-card-title">
              <Sparkles size={16} /> Progression & Calculation Rules
            </div>
            <p className="wkt-card-sub">Formulas used for 1RM estimations and auto-progression.</p>

            <div className="nut-form-row">
              <label>1-Rep Max (1RM) Formula</label>
              <select
                value={settings.oneRepMaxFormula}
                onChange={(e) => setSettings({ ...settings, oneRepMaxFormula: e.target.value as any })}
              >
                <option value="epley">Epley Formula (Standard)</option>
                <option value="brzycki">Brzycki Formula</option>
              </select>
            </div>

            <div className="nut-toggle-row" style={{ marginTop: 14 }}>
              <div>
                <strong>Mandatory Warm-up Sets</strong>
                <p>Prompt trainers and members to complete warm-up sets on heavy compound movements</p>
              </div>
              <input
                type="checkbox"
                checked={settings.requireWarmupSets}
                onChange={(e) => setSettings({ ...settings, requireWarmupSets: e.target.checked })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkoutsReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <WorkoutsReportsAndSettingsContent />
    </Suspense>
  );
}

const WKT_CSS = `
.wkt-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.wkt-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.wkt-breadcrumb a { color: inherit; text-decoration: none; }
.wkt-breadcrumb a:hover { color: var(--text-primary); }
.wkt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.wkt-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.wkt-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.wkt-head-actions { display: flex; align-items: center; gap: 10px; }

.wkt-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.wkt-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.wkt-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.wkt-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.wkt-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.wkt-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.wkt-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.wkt-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.wkt-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.wkt-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.wkt-charts-grid, .wkt-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.wkt-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.wkt-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.wkt-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.wkt-table-head { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; padding: 12px 14px; background: #f8fafc; border-radius: 10px; font-size: 12px; font-weight: 650; color: var(--text-tertiary); margin-top: 14px; }
.wkt-table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; align-items: center; font-size: 13.5px; }
.wkt-table-row:last-child { border-bottom: none; }

.nut-form-row { margin-bottom: 14px; }
.nut-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.nut-form-row select { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }

.nut-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.nut-toggle-row:last-child { border-bottom: none; }
.nut-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.nut-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.nut-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .wkt-charts-grid, .wkt-settings-grid { grid-template-columns: 1fr; }
}
`;
