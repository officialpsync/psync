"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users, BarChart3, Settings, ShieldCheck, Clock, Download,
  ChevronRight, Calendar, UserCheck, Flame, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, Wallet, IndianRupee,
  Briefcase, CheckCircle2, Award
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useRole, type StaffRole } from "../../components/useRole";
import { Avatar, Skeleton, useToast } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";

const supabase = createClient();

type StaffMember = {
  id: string;
  name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type ClassRecord = {
  id: string;
  trainer_id: string | null;
  trainer_name: string | null;
  name: string;
};

type StaffSettings = {
  morningShiftStart: string;
  morningShiftEnd: string;
  generalShiftStart: string;
  generalShiftEnd: string;
  eveningShiftStart: string;
  eveningShiftEnd: string;
  gracePeriodMinutes: number;
  autoMarkLate: boolean;
  allowQrCheckin: boolean;
  allowPhoneCheckin: boolean;
  requireLocation: boolean;
  payrollCycleDay: number;
  defaultTrainerCommissionPct: number;
  notifyManagerOnAbsent: boolean;
  managerAlertPhone: string;
};

const DEFAULT_SETTINGS: StaffSettings = {
  morningShiftStart: "06:00",
  morningShiftEnd: "14:00",
  generalShiftStart: "09:00",
  generalShiftEnd: "18:00",
  eveningShiftStart: "13:00",
  eveningShiftEnd: "22:00",
  gracePeriodMinutes: 15,
  autoMarkLate: true,
  allowQrCheckin: true,
  allowPhoneCheckin: true,
  requireLocation: false,
  payrollCycleDay: 5,
  defaultTrainerCommissionPct: 25,
  notifyManagerOnAbsent: true,
  managerAlertPhone: "",
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function StaffReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [classesList, setClassesList] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<StaffSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        const [staffRes, classesRes] = await Promise.all([
          supabase
            .from("staff")
            .select("id, name, role, phone, email, is_active")
            .eq("org_id", roleData.org_id)
            .order("name"),
          supabase
            .from("classes")
            .select("id, trainer_id, trainer_name, name")
            .eq("org_id", roleData.org_id)
            .eq("is_active", true),
        ]);

        if (staffRes.error) throw staffRes.error;
        setStaffList(staffRes.data || []);
        setClassesList(classesRes.data || []);

        const savedSettings = localStorage.getItem(`psync_staff_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
          } catch {}
        }
      } catch (err: any) {
        console.error("Staff reports error:", err);
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
      localStorage.setItem(`psync_staff_settings_${roleData.org_id}`, JSON.stringify(settings));
      setTimeout(() => {
        setSavingSettings(false);
        show("Staff operational policies & payroll settings saved!", "success");
      }, 300);
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // True DB metrics
  const totalStaff = staffList.length;
  const activeStaff = staffList.filter((s) => s.is_active).length;
  const activeRate = totalStaff ? Math.round((activeStaff / totalStaff) * 100) : 0;
  const totalTrainers = staffList.filter((s) => s.role === "trainer").length;

  // Chart 1: Role Breakdown (Pie) - 100% computed from real DB staff
  const roleDataDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    staffList.forEach((s) => {
      const r = s.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      counts[r] = (counts[r] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [staffList]);

  // Real Top Trainers from DB & actual classes assigned
  const topTrainers = useMemo(() => {
    const classCountMap = new Map<string, number>();
    classesList.forEach((c) => {
      if (c.trainer_id) {
        classCountMap.set(c.trainer_id, (classCountMap.get(c.trainer_id) || 0) + 1);
      } else if (c.trainer_name) {
        const match = staffList.find((s) => s.name.toLowerCase() === c.trainer_name?.toLowerCase());
        if (match) {
          classCountMap.set(match.id, (classCountMap.get(match.id) || 0) + 1);
        }
      }
    });

    return staffList
      .filter((s) => s.role === "trainer")
      .map((t) => ({
        id: t.id,
        name: t.name,
        sessions: classCountMap.get(t.id) || 0,
        phone: t.phone,
        email: t.email,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [staffList, classesList]);

  // Export Staff Report
  const handleExport = () => {
    const headers = ["Staff Name", "Role", "Email", "Phone", "Status"];
    const rows = staffList.map((s) => [
      `"${s.name}"`,
      `"${s.role}"`,
      `"${s.email || "--"}"`,
      `"${s.phone || "--"}"`,
      s.is_active ? "Active" : "Inactive",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Staff_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Staff report exported to CSV", "success");
  };

  return (
    <div className="ps-page srs-page">
      <DesignStyles />
      <style>{SRS_CSS}</style>

      {/* Breadcrumb & Header */}
      <header className="srs-head">
        <div>
          <div className="srs-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/staff">Staff</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Staff Reports & Settings</h1>
          <p>Workforce analytics, team composition, instructor classes, and operational policies.</p>
        </div>

        <div className="srs-head-actions">
          {activeTab === "reports" && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary ps-btn--sm"
              onClick={handleExport}
              disabled={staffList.length === 0}
            >
              <Download size={14} />
              <span>Export Report</span>
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

          <Link href="/dashboard/staff" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Users size={14} />
            <span>Staff Directory</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="srs-tabs-row">
        <div className="srs-segmented">
          <button
            type="button"
            className={`srs-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/staff/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Staff Reports</span>
          </button>
          <button
            type="button"
            className={`srs-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/staff/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Staff Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="srs-content">
          {/* Real KPIs */}
          <div className="srs-kpis">
            <div className="srs-kpi">
              <div className="srs-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <Users size={18} />
              </div>
              <div>
                <div className="srs-kpi-label">Total Staff</div>
                <div className="srs-kpi-val">{totalStaff}</div>
                <div className="srs-kpi-sub">{activeStaff} active team members</div>
              </div>
            </div>

            <div className="srs-kpi">
              <div className="srs-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="srs-kpi-label">Active Ratio</div>
                <div className="srs-kpi-val">{activeRate}%</div>
                <div className="srs-kpi-sub">On active duty roster</div>
              </div>
            </div>

            <div className="srs-kpi">
              <div className="srs-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <Award size={18} />
              </div>
              <div>
                <div className="srs-kpi-label">Trainers on Team</div>
                <div className="srs-kpi-val">{totalTrainers}</div>
                <div className="srs-kpi-sub">Instructors & PT coaches</div>
              </div>
            </div>

            <div className="srs-kpi">
              <div className="srs-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <Calendar size={18} />
              </div>
              <div>
                <div className="srs-kpi-label">Scheduled Classes</div>
                <div className="srs-kpi-val">{classesList.length}</div>
                <div className="srs-kpi-sub">Assigned to team</div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="srs-charts-grid">
            {/* Role Breakdown (100% true DB) */}
            <div className="srs-card">
              <div className="srs-card-title">Staff Role Distribution</div>
              {roleDataDistribution.length === 0 ? (
                <div className="srs-empty-box">
                  <p>No staff records in database yet.</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roleDataDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {roleDataDistribution.map((entry, index) => (
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

            {/* Top Trainers Leaderboard from DB */}
            <div className="srs-card">
              <div className="srs-card-title">Instructors & Assigned Studio Classes</div>
              <div className="srs-trainers-list">
                {topTrainers.length === 0 ? (
                  <div className="srs-empty-box">
                    <p>No trainers registered in staff directory yet.</p>
                  </div>
                ) : (
                  topTrainers.map((t, rank) => (
                    <div key={t.id} className="srs-trainer-row">
                      <div className="srs-rank">#{rank + 1}</div>
                      <Avatar name={t.name} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 650, fontSize: 13.5 }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                          {t.email || t.phone || "Trainer"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 750, color: "#0a84ff", fontSize: 14 }}>
                          {t.sessions} classes
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>in schedule</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="srs-settings-grid">
          {/* Shift Timings */}
          <div className="srs-card">
            <div className="srs-card-title">
              <Clock size={16} /> Shift Timings & Working Hours
            </div>
            <p className="srs-card-sub">Configure gym shifts for trainers, desk staff, and managers.</p>

            <div className="srs-form-row">
              <label>Morning Shift</label>
              <div className="srs-time-range">
                <input
                  type="time"
                  value={settings.morningShiftStart}
                  onChange={(e) => setSettings({ ...settings, morningShiftStart: e.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={settings.morningShiftEnd}
                  onChange={(e) => setSettings({ ...settings, morningShiftEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="srs-form-row">
              <label>General Shift</label>
              <div className="srs-time-range">
                <input
                  type="time"
                  value={settings.generalShiftStart}
                  onChange={(e) => setSettings({ ...settings, generalShiftStart: e.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={settings.generalShiftEnd}
                  onChange={(e) => setSettings({ ...settings, generalShiftEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="srs-form-row">
              <label>Evening Shift</label>
              <div className="srs-time-range">
                <input
                  type="time"
                  value={settings.eveningShiftStart}
                  onChange={(e) => setSettings({ ...settings, eveningShiftStart: e.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={settings.eveningShiftEnd}
                  onChange={(e) => setSettings({ ...settings, eveningShiftEnd: e.target.value })}
                />
              </div>
            </div>

            <div className="srs-form-row">
              <label>Grace Period for Late Mark</label>
              <select
                value={settings.gracePeriodMinutes}
                onChange={(e) => setSettings({ ...settings, gracePeriodMinutes: Number(e.target.value) })}
              >
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes (Standard)</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>
          </div>

          {/* Attendance & Verification Methods */}
          <div className="srs-card">
            <div className="srs-card-title">
              <ShieldCheck size={16} /> Attendance Modes & Geofencing
            </div>
            <p className="srs-card-sub">Choose how staff clock in and out on the Psync app.</p>

            <div className="srs-toggle-row">
              <div>
                <strong>QR Code Clock-In</strong>
                <p>Allow staff to scan front desk gym QR to verify arrival</p>
              </div>
              <input
                type="checkbox"
                checked={settings.allowQrCheckin}
                onChange={(e) => setSettings({ ...settings, allowQrCheckin: e.target.checked })}
              />
            </div>

            <div className="srs-toggle-row">
              <div>
                <strong>Mobile App Check-in</strong>
                <p>Enable check-in from staff member's Psync mobile app</p>
              </div>
              <input
                type="checkbox"
                checked={settings.allowPhoneCheckin}
                onChange={(e) => setSettings({ ...settings, allowPhoneCheckin: e.target.checked })}
              />
            </div>

            <div className="srs-toggle-row">
              <div>
                <strong>GPS Geofencing Requirement</strong>
                <p>Ensure staff is within gym vicinity coordinates</p>
              </div>
              <input
                type="checkbox"
                checked={settings.requireLocation}
                onChange={(e) => setSettings({ ...settings, requireLocation: e.target.checked })}
              />
            </div>
          </div>

          {/* Payroll Rules */}
          <div className="srs-card">
            <div className="srs-card-title">
              <Wallet size={16} /> Payroll & Incentive Defaults
            </div>
            <p className="srs-card-sub">Standardize payout calendar and commission shares.</p>

            <div className="srs-form-row">
              <label>Monthly Salary Payout Day</label>
              <select
                value={settings.payrollCycleDay}
                onChange={(e) => setSettings({ ...settings, payrollCycleDay: Number(e.target.value) })}
              >
                <option value={1}>1st of every month</option>
                <option value={5}>5th of every month (Recommended)</option>
                <option value={7}>7th of every month</option>
                <option value={10}>10th of every month</option>
              </select>
            </div>

            <div className="srs-form-row">
              <label>Default Personal Trainer Commission</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  className="ps-input"
                  style={{ width: 100 }}
                  value={settings.defaultTrainerCommissionPct}
                  onChange={(e) => setSettings({ ...settings, defaultTrainerCommissionPct: Number(e.target.value) })}
                  min={0}
                  max={100}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>% per PT package sold</span>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="srs-card">
            <div className="srs-card-title">
              <Bell size={16} /> Staff Alerts & Notifications
            </div>
            <p className="srs-card-sub">Instant notifications for unexcused absences and shift gaps.</p>

            <div className="srs-toggle-row">
              <div>
                <strong>Manager Absence Alerts</strong>
                <p>Send instant WhatsApp alert if staff is absent without notice</p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyManagerOnAbsent}
                onChange={(e) => setSettings({ ...settings, notifyManagerOnAbsent: e.target.checked })}
              />
            </div>

            <div className="srs-form-row" style={{ marginTop: 14 }}>
              <label>Manager Alert WhatsApp Number</label>
              <input
                type="tel"
                className="ps-input"
                placeholder="+91 98765 43210"
                value={settings.managerAlertPhone}
                onChange={(e) => setSettings({ ...settings, managerAlertPhone: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <StaffReportsAndSettingsContent />
    </Suspense>
  );
}

const SRS_CSS = `
.srs-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.srs-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.srs-breadcrumb a { color: inherit; text-decoration: none; }
.srs-breadcrumb a:hover { color: var(--text-primary); }
.srs-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.srs-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.srs-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.srs-head-actions { display: flex; align-items: center; gap: 10px; }

.srs-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.srs-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.srs-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.srs-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.srs-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.srs-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.srs-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.srs-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.srs-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.srs-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.srs-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.srs-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.srs-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.srs-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.srs-empty-box { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-tertiary); font-size: 13.5px; text-align: center; }

.srs-trainers-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.srs-trainer-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #f8fafc; border-radius: 12px; }
.srs-rank { font-size: 12px; font-weight: 800; color: var(--text-tertiary); width: 20px; }

.srs-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.srs-form-row { margin-bottom: 14px; }
.srs-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.srs-form-row select { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }
.srs-time-range { display: flex; align-items: center; gap: 8px; }
.srs-time-range input { height: 36px; padding: 0 10px; border: 1px solid var(--separator, #e5e7eb); border-radius: 8px; font-size: 13px; font-weight: 600; }
.srs-time-range span { font-size: 12px; color: var(--text-tertiary); }

.srs-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.srs-toggle-row:last-child { border-bottom: none; }
.srs-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.srs-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.srs-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .srs-charts-grid, .srs-settings-grid { grid-template-columns: 1fr; }
}
`;
