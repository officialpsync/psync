"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  UserPlus, BarChart3, Settings, ShieldCheck, Download,
  ChevronRight, Calendar, Sparkles, Filter, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, MessageSquare, Target,
  TrendingUp, CheckCircle2, ShoppingBag, ArrowUpRight
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Avatar, Skeleton, useToast } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";

const supabase = createClient();

type LeadRow = {
  id: string;
  full_name: string | null;
  name?: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
};

type MarketingSettings = {
  autoAssignLeads: boolean;
  followUpReminderDays: number;
  autoSendWelcomeWhatsapp: boolean;
  welcomeTemplate: string;
  defaultTrialDays: number;
  enableReferralReward: boolean;
  referralRewardDays: number;
};

const DEFAULT_SETTINGS: MarketingSettings = {
  autoAssignLeads: true,
  followUpReminderDays: 2,
  autoSendWelcomeWhatsapp: true,
  welcomeTemplate: "Hi {name}! Welcome to Psync Fitness. We are excited to help you start your workout journey! Book your trial class with our team.",
  defaultTrialDays: 3,
  enableReferralReward: true,
  referralRewardDays: 15,
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function MarketingReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [avgPlanPrice, setAvgPlanPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<MarketingSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        // Query real leads and real plans from Supabase
        const [leadsRes, plansRes] = await Promise.all([
          supabase
            .from("leads")
            .select("id, full_name, phone, email, status, source, created_at")
            .eq("org_id", roleData.org_id)
            .order("created_at", { ascending: false }),
          supabase
            .from("membership_plans")
            .select("price_paise")
            .eq("org_id", roleData.org_id)
            .eq("is_active", true),
        ]);

        if (leadsRes.error) throw leadsRes.error;
        setLeads(leadsRes.data || []);

        const plans = plansRes.data || [];
        if (plans.length > 0) {
          const avg = Math.round(plans.reduce((acc, p) => acc + (p.price_paise || 0), 0) / plans.length / 100);
          setAvgPlanPrice(avg);
        }

        const savedSettings = localStorage.getItem(`psync_marketing_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
          } catch {}
        }
      } catch (err: any) {
        console.error("Marketing reports load error:", err);
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
      localStorage.setItem(`psync_marketing_settings_${roleData.org_id}`, JSON.stringify(settings));
      setTimeout(() => {
        setSavingSettings(false);
        show("Marketing automation & campaign rules saved!", "success");
      }, 300);
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // Real DB calculations
  const totalLeads = leads.length;
  const wonLeads = leads.filter((l) => {
    const st = (l.status || "").toLowerCase();
    return st === "won" || st === "converted";
  }).length;
  const conversionRate = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const activePipeline = leads.filter((l) => {
    const st = (l.status || "").toLowerCase();
    return st !== "lost" && st !== "won" && st !== "converted";
  }).length;
  const pipelineValue = activePipeline * (avgPlanPrice || 0);

  // Chart 1: Source Breakdown (Computed from actual leads)
  const sourceDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const src = l.source?.trim() || "Walk-in / Direct";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Chart 2: Funnel Status (Computed from actual leads)
  const funnelData = useMemo(() => {
    const statuses: Record<string, number> = {
      New: 0,
      Contacted: 0,
      "Trial / Tour": 0,
      Converted: 0,
      Lost: 0,
    };

    leads.forEach((l) => {
      const st = (l.status || "new").toLowerCase();
      if (st.includes("won") || st.includes("converted")) statuses["Converted"]++;
      else if (st.includes("trial") || st.includes("tour")) statuses["Trial / Tour"]++;
      else if (st.includes("contact")) statuses["Contacted"]++;
      else if (st.includes("lost")) statuses["Lost"]++;
      else statuses["New"]++;
    });

    return Object.entries(statuses).map(([status, count]) => ({ status, count }));
  }, [leads]);

  // Export
  const handleExport = () => {
    const headers = ["Lead Name", "Phone", "Email", "Status", "Source", "Created Date"];
    const rows = leads.map((l) => [
      `"${l.full_name || l.name || "--"}"`,
      `"${l.phone || "--"}"`,
      `"${l.email || "--"}"`,
      `"${l.status || "new"}"`,
      `"${l.source || "--"}"`,
      `"${new Date(l.created_at).toLocaleDateString()}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Marketing_Leads_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Leads report exported to CSV", "success");
  };

  return (
    <div className="ps-page mrk-page">
      <DesignStyles />
      <style>{MRK_CSS}</style>

      {/* Header */}
      <header className="mrk-head">
        <div>
          <div className="mrk-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/leads">Marketing</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Marketing Reports & Settings</h1>
          <p>Acquisition analytics, conversion funnels, lead channels, and campaign rules.</p>
        </div>

        <div className="mrk-head-actions">
          {activeTab === "reports" && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary ps-btn--sm"
              onClick={handleExport}
              disabled={leads.length === 0}
            >
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

          <Link href="/dashboard/leads" className="ps-btn ps-btn--secondary ps-btn--sm">
            <UserPlus size={14} />
            <span>Leads Pipeline</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="mrk-tabs-row">
        <div className="mrk-segmented">
          <button
            type="button"
            className={`mrk-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/marketing/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Marketing Reports</span>
          </button>
          <button
            type="button"
            className={`mrk-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/marketing/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Marketing Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="mrk-content">
          {/* KPIs */}
          <div className="mrk-kpis">
            <div className="mrk-kpi">
              <div className="mrk-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <Target size={18} />
              </div>
              <div>
                <div className="mrk-kpi-label">Total Leads</div>
                <div className="mrk-kpi-val">{totalLeads}</div>
                <div className="mrk-kpi-sub">Total inquiries recorded</div>
              </div>
            </div>

            <div className="mrk-kpi">
              <div className="mrk-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="mrk-kpi-label">Conversion Rate</div>
                <div className="mrk-kpi-val">{conversionRate}%</div>
                <div className="mrk-kpi-sub">{wonLeads} converted to members</div>
              </div>
            </div>

            <div className="mrk-kpi">
              <div className="mrk-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <Sparkles size={18} />
              </div>
              <div>
                <div className="mrk-kpi-label">Active In-Pipeline</div>
                <div className="mrk-kpi-val">{activePipeline}</div>
                <div className="mrk-kpi-sub">Trial & follow-up phase</div>
              </div>
            </div>

            <div className="mrk-kpi">
              <div className="mrk-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="mrk-kpi-label">Est. Pipeline Value</div>
                <div className="mrk-kpi-val">
                  {pipelineValue > 0 ? `₹${pipelineValue.toLocaleString()}` : "₹0"}
                </div>
                <div className="mrk-kpi-sub">Based on active plans</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="mrk-charts-grid">
            <div className="mrk-card">
              <div className="mrk-card-title">Lead Acquisition by Channel</div>
              {sourceDistribution.length === 0 ? (
                <div className="mrk-empty-box">
                  <p>No leads logged in database yet.</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {sourceDistribution.map((entry, index) => (
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

            <div className="mrk-card">
              <div className="mrk-card-title">Lead Conversion Funnel</div>
              {totalLeads === 0 ? (
                <div className="mrk-empty-box">
                  <p>No leads logged in database yet.</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="count" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="mrk-settings-grid">
          <div className="mrk-card">
            <div className="mrk-card-title">
              <Target size={16} /> Lead Routing & Assignments
            </div>
            <p className="mrk-card-sub">Distribute incoming leads evenly to sales reps and trainers.</p>

            <div className="mrk-toggle-row">
              <div>
                <strong>Auto-assign incoming leads</strong>
                <p>Round-robin distribution to on-duty staff</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoAssignLeads}
                onChange={(e) => setSettings({ ...settings, autoAssignLeads: e.target.checked })}
              />
            </div>

            <div className="mrk-form-row" style={{ marginTop: 14 }}>
              <label>Follow-up Reminder Interval</label>
              <select
                value={settings.followUpReminderDays}
                onChange={(e) => setSettings({ ...settings, followUpReminderDays: Number(e.target.value) })}
              >
                <option value={1}>Every 24 hours</option>
                <option value={2}>Every 2 days (Recommended)</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly</option>
              </select>
            </div>

            <div className="mrk-form-row">
              <label>Default Complimentary Trial Period</label>
              <select
                value={settings.defaultTrialDays}
                onChange={(e) => setSettings({ ...settings, defaultTrialDays: Number(e.target.value) })}
              >
                <option value={1}>1 Day Pass</option>
                <option value={3}>3 Days Trial (Standard)</option>
                <option value={7}>7 Days Trial</option>
              </select>
            </div>
          </div>

          <div className="mrk-card">
            <div className="mrk-card-title">
              <MessageSquare size={16} /> WhatsApp & Outreach Automation
            </div>
            <p className="mrk-card-sub">Instant welcome messages and referral incentives.</p>

            <div className="mrk-toggle-row">
              <div>
                <strong>Instant WhatsApp Greeting</strong>
                <p>Automatically message prospective member when inquiry is submitted</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSendWelcomeWhatsapp}
                onChange={(e) => setSettings({ ...settings, autoSendWelcomeWhatsapp: e.target.checked })}
              />
            </div>

            <div className="mrk-form-row" style={{ marginTop: 14 }}>
              <label>Welcome Template</label>
              <textarea
                className="ps-input"
                style={{ height: 80, resize: "vertical" }}
                value={settings.welcomeTemplate}
                onChange={(e) => setSettings({ ...settings, welcomeTemplate: e.target.value })}
              />
            </div>

            <div className="mrk-toggle-row">
              <div>
                <strong>Member Referral Rewards</strong>
                <p>Grant complimentary gym extension for verified referrals</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableReferralReward}
                onChange={(e) => setSettings({ ...settings, enableReferralReward: e.target.checked })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarketingReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <MarketingReportsAndSettingsContent />
    </Suspense>
  );
}

const MRK_CSS = `
.mrk-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.mrk-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.mrk-breadcrumb a { color: inherit; text-decoration: none; }
.mrk-breadcrumb a:hover { color: var(--text-primary); }
.mrk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.mrk-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.mrk-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.mrk-head-actions { display: flex; align-items: center; gap: 10px; }

.mrk-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.mrk-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.mrk-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.mrk-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.mrk-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.mrk-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.mrk-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.mrk-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.mrk-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.mrk-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.mrk-charts-grid, .mrk-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.mrk-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.mrk-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.mrk-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.mrk-empty-box { display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-tertiary); font-size: 13.5px; text-align: center; }

.mrk-form-row { margin-bottom: 14px; }
.mrk-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.mrk-form-row select { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }

.mrk-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.mrk-toggle-row:last-child { border-bottom: none; }
.mrk-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.mrk-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.mrk-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .mrk-charts-grid, .mrk-settings-grid { grid-template-columns: 1fr; }
}
`;
