"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  SlidersHorizontal, BarChart3, Settings, ShieldCheck, CheckCircle2,
  MessageSquare, Bell, Smartphone, Send, Save, RefreshCw, Sparkles,
  PieChart as PieChartIcon, ArrowUpRight, Zap
} from "lucide-react";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast } from "../../components/ui";

const supabase = createClient();

type GlobalNotificationSettings = {
  sender_name: string;
  default_country_code: string;
  auto_receipt_enabled: boolean;
  auto_due_reminder_enabled: boolean;
  auto_welcome_enabled: boolean;
  auto_class_reminder_enabled: boolean;
  in_app_popup_urgent: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};

const DEFAULT_GLOBAL_SETTINGS: GlobalNotificationSettings = {
  sender_name: "My Gym",
  default_country_code: "+91",
  auto_receipt_enabled: true,
  auto_due_reminder_enabled: true,
  auto_welcome_enabled: true,
  auto_class_reminder_enabled: false,
  in_app_popup_urgent: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

const CHART_COLORS = ["#25D366", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6"];

export default function NotificationsReportsAndSettingsPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [activeTab, setActiveTab] = useState<"reports" | "settings">("reports");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<GlobalNotificationSettings>(DEFAULT_GLOBAL_SETTINGS);

  // Real DB data
  const [totalMembers, setTotalMembers] = useState(0);
  const [reachableMembers, setReachableMembers] = useState(0);
  const [waLogsCount, setWaLogsCount] = useState(0);
  const [appNotifsCount, setAppNotifsCount] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: membersData },
          { data: waLogsPref },
          { data: appNotifsPref },
          { data: settingsPref },
        ] = await Promise.all([
          supabase.from("members").select("id, phone, whatsapp_number").eq("org_id", roleData.org_id),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "wa_notification_logs").maybeSingle(),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "app_notifications").maybeSingle(),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "notification_global_settings").maybeSingle(),
        ]);

        const mems = membersData || [];
        setTotalMembers(mems.length);
        const reachable = mems.filter((m) => !!(m.whatsapp_number || m.phone)).length;
        setReachableMembers(reachable);

        const waLogs: any[] = (waLogsPref?.value && Array.isArray(waLogsPref.value)) ? waLogsPref.value : [];
        const appNotifs: any[] = (appNotifsPref?.value && Array.isArray(appNotifsPref.value)) ? appNotifsPref.value : [];

        setWaLogsCount(waLogs.length);
        setAppNotifsCount(appNotifs.length);

        if (settingsPref?.value && typeof settingsPref.value === "object") {
          setSettings({ ...DEFAULT_GLOBAL_SETTINGS, ...settingsPref.value });
        }

        // Categorize logs
        const counts: Record<string, number> = {
          "WhatsApp Receipts": 0,
          "Due Reminders": 0,
          "Welcome Notes": 0,
          "App Announcements": appNotifs.length,
          "Custom Broadcasts": 0,
        };

        waLogs.forEach((l) => {
          if (l.template_type === "receipt") counts["WhatsApp Receipts"]++;
          else if (l.template_type === "due_reminder") counts["Due Reminders"]++;
          else if (l.template_type === "welcome") counts["Welcome Notes"]++;
          else counts["Custom Broadcasts"]++;
        });

        const breakdown = Object.entries(counts)
          .map(([name, value]) => ({ name, value }))
          .filter((item) => item.value > 0);

        setCategoryBreakdown(breakdown);
      } catch (err) {
        console.error("Error loading notification settings and reports:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [roleData.org_id]);

  // Save Settings
  const handleSaveSettings = async () => {
    if (!roleData.org_id) return;
    setSaving(true);
    try {
      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "notification_global_settings",
          value: settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope" }
      );
      show({ title: "Notification preferences saved successfully", type: "success" });
    } catch (err) {
      console.error("Error saving global notification settings:", err);
      show({ title: "Failed to save settings", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const totalVolume = waLogsCount + appNotifsCount;
  const coveragePercent = totalMembers > 0 ? Math.round((reachableMembers / totalMembers) * 100) : 0;

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6366f1", textTransform: "uppercase" }}>
              NOTIFICATIONS & CHANNELS
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            Reports & Settings
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Delivery performance analytics, WhatsApp gateway status, and automated trigger configurations.
          </p>
        </div>

        {activeTab === "settings" && (
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              backgroundColor: "#6366f1",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 600,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)",
            }}
          >
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{saving ? "Saving..." : "Save Preferences"}</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-color, #e5e7eb)", marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab("reports")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "reports" ? "var(--accent-color, #6366f1)" : "var(--text-secondary)",
            borderBottom: activeTab === "reports" ? "2px solid var(--accent-color, #6366f1)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Delivery Reports & Analytics
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "settings" ? "var(--accent-color, #6366f1)" : "var(--text-secondary)",
            borderBottom: activeTab === "settings" ? "2px solid var(--accent-color, #6366f1)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Channel & Gateway Settings
        </button>
      </div>

      {/* TAB: REPORTS */}
      {activeTab === "reports" && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Total Dispatches</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(99, 102, 241, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
                  <Send size={16} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
                {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : totalVolume}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                WhatsApp + App push combined
              </div>
            </div>

            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>WhatsApp Messages</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(37, 211, 102, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#25D366" }}>
                  <MessageSquare size={16} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
                {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : waLogsCount}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                Sent via automated & broadcast WA
              </div>
            </div>

            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>App Notices</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(59, 130, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}>
                  <Bell size={16} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
                {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : appNotifsCount}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                Member portal announcements
              </div>
            </div>

            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Reachable Coverage</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
                  <Smartphone size={16} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
                {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : `${coveragePercent}%`}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                {reachableMembers} of {totalMembers} members with phone
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20 }}>
            {/* Channel Distribution */}
            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "20px 24px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
                Channel Breakdown
              </h3>
              {categoryBreakdown.length === 0 ? (
                <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                  <MessageSquare size={32} style={{ color: "var(--text-tertiary)", marginBottom: 8 }} />
                  <span style={{ fontSize: 13 }}>No notification dispatches recorded yet</span>
                </div>
              ) : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Volume Breakdown */}
            <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "20px 24px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
                Dispatches by Channel
              </h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { channel: "WhatsApp", count: waLogsCount },
                    { channel: "App Push", count: appNotifsCount },
                  ]}>
                    <XAxis dataKey="channel" stroke="var(--text-tertiary)" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="var(--text-tertiary)" fontSize={12} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB: SETTINGS */}
      {activeTab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* WhatsApp Gateway Provider */}
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  WhatsApp Delivery Gateway
                </h4>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                  MSG91 enterprise gateway configuration for automated WhatsApp messages.
                </p>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981", fontSize: 12, fontWeight: 700 }}>
                <CheckCircle2 size={14} />
                GATEWAY READY
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Sender Display Name
                </label>
                <input
                  type="text"
                  value={settings.sender_name}
                  onChange={(e) => setSettings({ ...settings, sender_name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-color, #e5e7eb)",
                    backgroundColor: "var(--bg-secondary, #f9fafb)",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Default Country Dial Code
                </label>
                <input
                  type="text"
                  value={settings.default_country_code}
                  onChange={(e) => setSettings({ ...settings, default_country_code: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-color, #e5e7eb)",
                    backgroundColor: "var(--bg-secondary, #f9fafb)",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Automated Event Triggers */}
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 16px" }}>
              Automated Dispatch Rules
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                {
                  key: "auto_receipt_enabled" as const,
                  title: "Instant Payment Receipt",
                  desc: "Automatically send WhatsApp confirmation whenever a member pays dues at reception.",
                },
                {
                  key: "auto_due_reminder_enabled" as const,
                  title: "Fee Overdue & Expiry Alerts",
                  desc: "Send friendly automated reminders 3 days before renewal or when balance is outstanding.",
                },
                {
                  key: "auto_welcome_enabled" as const,
                  title: "New Member Welcome Greetings",
                  desc: "Dispatch app login credentials and onboarding greeting upon registering a new member.",
                },
                {
                  key: "auto_class_reminder_enabled" as const,
                  title: "Class Booking Reminders",
                  desc: "Notify members 2 hours prior to their booked yoga or strength training slot.",
                },
                {
                  key: "in_app_popup_urgent" as const,
                  title: "Pop-up Banners for Urgent In-App Alerts",
                  desc: "Display high-priority emergency alerts as modal popups when members launch portal.",
                },
              ].map((item) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-color, #f3f4f6)" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>{item.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings[item.key]}
                    onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: "#6366f1", cursor: "pointer" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
