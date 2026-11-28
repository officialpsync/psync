"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  CalendarDays, BarChart3, Settings, ShieldCheck, Download,
  ChevronRight, Calendar, Users, Ticket, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, Flame, Activity,
  CheckCircle2, Sparkles, Clock, Star, MapPin
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

type CoachingSettings = {
  defaultClassCapacity: number;
  cancellationWindowHours: number;
  allowWaitlist: boolean;
  autoDeductCreditsOnNoShow: boolean;
  maxAdvanceBookingDays: number;
};

const DEFAULT_SETTINGS: CoachingSettings = {
  defaultClassCapacity: 20,
  cancellationWindowHours: 2,
  allowWaitlist: true,
  autoDeductCreditsOnNoShow: true,
  maxAdvanceBookingDays: 7,
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function CoachingReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);

  const [classesCount, setClassesCount] = useState(0);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState<number | null>(null);
  const [cancellationRate, setCancellationRate] = useState<number | null>(null);
  const [dayOfWeekData, setDayOfWeekData] = useState<{ day: string; bookings: number }[]>([]);
  const [classTypesData, setClassTypesData] = useState<{ name: string; value: number }[]>([]);
  const [topInstructors, setTopInstructors] = useState<{ name: string; classesCount: number; bookingsCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<CoachingSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        const [
          { data: classesData },
          { data: bookingsData }
        ] = await Promise.all([
          supabase.from("classes").select("id, name, schedule_day, capacity, trainer_name, trainer_id, is_active").eq("org_id", roleData.org_id),
          supabase.from("class_bookings").select("id, class_id, status, booked_for, created_at").eq("org_id", roleData.org_id),
        ]);

        const classes = classesData || [];
        const bookings = bookingsData || [];

        setClassesCount(classes.length);
        setBookingsCount(bookings.length);

        const activeBookings = bookings.filter((b) => b.status === "booked");
        const cancelledBookings = bookings.filter((b) => b.status === "cancelled");

        // Cancellation rate
        if (bookings.length > 0) {
          setCancellationRate(Math.round((cancelledBookings.length / bookings.length) * 100));
        } else {
          setCancellationRate(null);
        }

        // Occupancy calculation based on total capacity vs active bookings
        const totalCapacity = classes.reduce((acc, c) => acc + (c.capacity || 20), 0);
        if (totalCapacity > 0 && activeBookings.length > 0) {
          setOccupancyRate(Math.min(100, Math.round((activeBookings.length / totalCapacity) * 100)));
        } else {
          setOccupancyRate(null);
        }

        // Day of Week attendance distribution
        const dayMap: Record<string, number> = {
          Mon: 0,
          Tue: 0,
          Wed: 0,
          Thu: 0,
          Fri: 0,
          Sat: 0,
          Sun: 0,
        };

        const shortDayMap: Record<string, string> = {
          Monday: "Mon",
          Tuesday: "Tue",
          Wednesday: "Wed",
          Thursday: "Thu",
          Friday: "Fri",
          Saturday: "Sat",
          Sunday: "Sun",
        };

        // Map class_id to schedule_day
        const classDayById: Record<string, string> = {};
        classes.forEach((c) => {
          if (c.schedule_day) {
            classDayById[c.id] = shortDayMap[c.schedule_day] || c.schedule_day.slice(0, 3);
          }
        });

        bookings.forEach((b) => {
          let dayKey: string | null = null;
          if (b.class_id && classDayById[b.class_id]) {
            dayKey = classDayById[b.class_id];
          } else if (b.booked_for) {
            const date = new Date(b.booked_for);
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            dayKey = days[date.getDay()];
          }
          if (dayKey && dayMap[dayKey] !== undefined) {
            dayMap[dayKey]++;
          }
        });

        const formattedDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
          day,
          bookings: dayMap[day] || 0,
        }));
        setDayOfWeekData(formattedDays);

        // Class Types distribution from classes and their bookings
        const typeCounts: Record<string, number> = {};
        classes.forEach((c) => {
          const name = c.name || "General Studio";
          typeCounts[name] = (typeCounts[name] || 0) + 1;
        });

        const formattedTypes = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
        setClassTypesData(formattedTypes);

        // Top Instructors leaderboard
        const trainerStats: Record<string, { classesCount: number; bookingsCount: number }> = {};
        const classTrainerMap: Record<string, string> = {};

        classes.forEach((c) => {
          const trainer = c.trainer_name || "Unassigned";
          classTrainerMap[c.id] = trainer;
          if (!trainerStats[trainer]) {
            trainerStats[trainer] = { classesCount: 0, bookingsCount: 0 };
          }
          trainerStats[trainer].classesCount++;
        });

        bookings.forEach((b) => {
          const trainer = classTrainerMap[b.class_id];
          if (trainer && trainerStats[trainer]) {
            trainerStats[trainer].bookingsCount++;
          }
        });

        const formattedInstructors = Object.entries(trainerStats)
          .filter(([name]) => name !== "Unassigned")
          .map(([name, stats]) => ({
            name,
            classesCount: stats.classesCount,
            bookingsCount: stats.bookingsCount,
          }))
          .sort((a, b) => b.bookingsCount - a.bookingsCount);

        setTopInstructors(formattedInstructors);

        const savedSettings = localStorage.getItem(`psync_coaching_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
          } catch {}
        }
      } catch (err) {
        console.error("Coaching reports load error:", err);
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
      localStorage.setItem(`psync_coaching_settings_${roleData.org_id}`, JSON.stringify(settings));
      setTimeout(() => {
        setSavingSettings(false);
        show("Class booking rules & studio capacity limits saved!", "success");
      }, 300);
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // Export CSV
  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Category,Count\nActive Studio Classes," +
      classesCount +
      "\nTotal Bookings," +
      bookingsCount +
      "\nOccupancy Rate," +
      (occupancyRate !== null ? `${occupancyRate}%` : "N/A") +
      "\nCancellation Rate," +
      (cancellationRate !== null ? `${cancellationRate}%` : "N/A") +
      "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Coaching_Classes_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Class analytics exported to CSV", "success");
  };

  const hasDayData = dayOfWeekData.some((d) => d.bookings > 0);

  return (
    <div className="ps-page coach-page">
      <DesignStyles />
      <style>{COACH_CSS}</style>

      {/* Header */}
      <header className="coach-head">
        <div>
          <div className="coach-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/classes">Coaching</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Coaching & Classes Reports & Settings</h1>
          <p>Class attendance, studio room capacity, peak booking days, and trainer session stats.</p>
        </div>

        <div className="coach-head-actions">
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

          <Link href="/dashboard/classes" className="ps-btn ps-btn--secondary ps-btn--sm">
            <CalendarDays size={14} />
            <span>Classes Calendar</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="coach-tabs-row">
        <div className="coach-segmented">
          <button
            type="button"
            className={`coach-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/classes/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Coaching Reports</span>
          </button>
          <button
            type="button"
            className={`coach-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/classes/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Coaching Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="coach-content">
          {/* KPIs */}
          <div className="coach-kpis">
            <div className="coach-kpi">
              <div className="coach-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <CalendarDays size={18} />
              </div>
              <div>
                <div className="coach-kpi-label">Active Studio Classes</div>
                <div className="coach-kpi-val">{classesCount}</div>
                <div className="coach-kpi-sub">On active schedule</div>
              </div>
            </div>

            <div className="coach-kpi">
              <div className="coach-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <Ticket size={18} />
              </div>
              <div>
                <div className="coach-kpi-label">Total Bookings</div>
                <div className="coach-kpi-val">{bookingsCount}</div>
                <div className="coach-kpi-sub">Recorded member spots</div>
              </div>
            </div>

            <div className="coach-kpi">
              <div className="coach-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <Activity size={18} />
              </div>
              <div>
                <div className="coach-kpi-label">Avg Occupancy</div>
                <div className="coach-kpi-val">{occupancyRate !== null ? `${occupancyRate}%` : "—"}</div>
                <div className="coach-kpi-sub">{occupancyRate !== null ? "Capacity booked" : "No bookings yet"}</div>
              </div>
            </div>

            <div className="coach-kpi">
              <div className="coach-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <Clock size={18} />
              </div>
              <div>
                <div className="coach-kpi-label">Cancellation Rate</div>
                <div className="coach-kpi-val">{cancellationRate !== null ? `${cancellationRate}%` : "—"}</div>
                <div className="coach-kpi-sub">{cancellationRate !== null ? "Cancelled by members" : "No cancellations"}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="coach-charts-grid">
            <div className="coach-card">
              <div className="coach-card-title">Bookings by Day of Week</div>
              {!hasDayData ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <CalendarDays size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No class bookings recorded yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayOfWeekData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="bookings" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="coach-card">
              <div className="coach-card-title">Class Formats Distribution</div>
              {classTypesData.length === 0 ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <Users size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No classes created yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={classTypesData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {classTypesData.map((entry, index) => (
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
          </div>

          {/* Top Instructors */}
          <div className="coach-card" style={{ marginTop: 20 }}>
            <div className="coach-card-title">Instructors & Conducted Sessions</div>
            {topInstructors.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>No trainer sessions assigned yet.</p>
            ) : (
              <>
                <div className="coach-table-head">
                  <div>Instructor</div>
                  <div>Scheduled Classes</div>
                  <div style={{ textAlign: "right" }}>Total Bookings Handled</div>
                </div>
                {topInstructors.map((ins, idx) => (
                  <div key={idx} className="coach-table-row">
                    <div style={{ fontWeight: 650 }}>{ins.name}</div>
                    <div style={{ fontWeight: 600 }}>{ins.classesCount} class(es)</div>
                    <div style={{ textAlign: "right", fontWeight: 700, color: "#0a84ff" }}>{ins.bookingsCount} member(s)</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="coach-settings-grid">
          <div className="coach-card">
            <div className="coach-card-title">
              <Calendar size={16} /> Booking & Studio Rules
            </div>
            <p className="coach-card-sub">Rules governing studio capacity and advance class scheduling.</p>

            <div className="nut-form-row">
              <label>Default Studio Capacity</label>
              <input
                type="number"
                className="ps-input"
                value={settings.defaultClassCapacity}
                onChange={(e) => setSettings({ ...settings, defaultClassCapacity: Number(e.target.value) })}
              />
            </div>

            <div className="nut-form-row">
              <label>Cancellation Window (Hours prior to class)</label>
              <input
                type="number"
                step="0.5"
                className="ps-input"
                value={settings.cancellationWindowHours}
                onChange={(e) => setSettings({ ...settings, cancellationWindowHours: Number(e.target.value) })}
              />
            </div>

            <div className="nut-form-row">
              <label>Max Advance Booking Window (Days)</label>
              <input
                type="number"
                className="ps-input"
                value={settings.maxAdvanceBookingDays}
                onChange={(e) => setSettings({ ...settings, maxAdvanceBookingDays: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="coach-card">
            <div className="coach-card-title">
              <Sparkles size={16} /> Waitlist & Attendance Policies
            </div>
            <p className="coach-card-sub">Automations when classes are full or members do not attend.</p>

            <div className="nut-toggle-row">
              <div>
                <strong>Enable Automatic Waitlist</strong>
                <p>When capacity is reached, allow members to queue and auto-promote if someone cancels</p>
              </div>
              <input
                type="checkbox"
                checked={settings.allowWaitlist}
                onChange={(e) => setSettings({ ...settings, allowWaitlist: e.target.checked })}
              />
            </div>

            <div className="nut-toggle-row" style={{ marginTop: 14 }}>
              <div>
                <strong>Auto-Deduct Credit on No-Show</strong>
                <p>Deduct class session credit if booked member fails to check in without cancelling</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoDeductCreditsOnNoShow}
                onChange={(e) => setSettings({ ...settings, autoDeductCreditsOnNoShow: e.target.checked })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoachingReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <CoachingReportsAndSettingsContent />
    </Suspense>
  );
}

const COACH_CSS = `
.coach-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.coach-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.coach-breadcrumb a { color: inherit; text-decoration: none; }
.coach-breadcrumb a:hover { color: var(--text-primary); }
.coach-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.coach-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.coach-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.coach-head-actions { display: flex; align-items: center; gap: 10px; }

.coach-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.coach-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.coach-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.coach-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.coach-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.coach-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.coach-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.coach-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.coach-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.coach-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.coach-charts-grid, .coach-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.coach-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.coach-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.coach-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.coach-table-head { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; padding: 12px 14px; background: #f8fafc; border-radius: 10px; font-size: 12px; font-weight: 650; color: var(--text-tertiary); margin-top: 14px; }
.coach-table-row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; align-items: center; font-size: 13.5px; }
.coach-table-row:last-child { border-bottom: none; }

.nut-form-row { margin-bottom: 14px; }
.nut-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.nut-form-row select { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }

.nut-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.nut-toggle-row:last-child { border-bottom: none; }
.nut-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.nut-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.nut-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .coach-charts-grid, .coach-settings-grid { grid-template-columns: 1fr; }
}
`;
