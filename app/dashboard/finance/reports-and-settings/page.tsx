"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Wallet, BarChart3, Settings, ShieldCheck, Download,
  ChevronRight, Calendar, IndianRupee, FileText, Plus, Save,
  RotateCcw, SlidersHorizontal, Bell, CreditCard, Receipt,
  CheckCircle2, Sparkles, TrendingUp, DollarSign
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast, formatINR } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";

const supabase = createClient();

type FinanceSettings = {
  enableGst: boolean;
  gstRatePct: number;
  gymGstin: string;
  invoicePrefix: string;
  autoSendReceiptWhatsapp: boolean;
  autoSendInvoiceEmail: boolean;
  overdueGraceDays: number;
  allowCashPayments: boolean;
  allowUpiPayments: boolean;
};

const DEFAULT_SETTINGS: FinanceSettings = {
  enableGst: true,
  gstRatePct: 18,
  gymGstin: "",
  invoicePrefix: "PSYNC-INV-",
  autoSendReceiptWhatsapp: true,
  autoSendInvoiceEmail: true,
  overdueGraceDays: 3,
  allowCashPayments: true,
  allowUpiPayments: true,
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function FinanceReportsAndSettingsContent() {
  const roleData = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { show } = useToast();

  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);

  const [totalCollectedPaise, setTotalCollectedPaise] = useState(0);
  const [pendingPaise, setPendingPaise] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<{ month: string; collected: number }[]>([]);
  const [paymentMethodsData, setPaymentMethodsData] = useState<{ name: string; value: number }[]>([]);
  const [planTiersData, setPlanTiersData] = useState<{ tier: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!roleData.org_id) return;

    async function load() {
      setLoading(true);
      try {
        const [
          { data: paymentsData },
          { data: membersData },
          { data: orgData }
        ] = await Promise.all([
          supabase
            .from("payments")
            .select("id, amount_paise, total_paise, method, status, paid_at, created_at, memberships(membership_plans(name))")
            .eq("org_id", roleData.org_id),
          supabase
            .from("members")
            .select("id, outstanding_balance_paise")
            .eq("org_id", roleData.org_id),
          supabase
            .from("organizations")
            .select("gst_number, gst_rate")
            .eq("id", roleData.org_id)
            .single(),
        ]);

        const payments = paymentsData || [];
        const members = membersData || [];

        const paidPayments = payments.filter((p) => p.status === "paid" || !p.status);
        const collectedSum = paidPayments.reduce((acc, p) => acc + (p.total_paise || p.amount_paise || 0), 0);
        setTotalCollectedPaise(collectedSum);
        setPaymentsCount(paidPayments.length);

        const totalDues = members.reduce((acc, m) => acc + (m.outstanding_balance_paise || 0), 0);
        setPendingPaise(totalDues);

        // Calculate dynamic last 6 months collection buckets
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const now = new Date();
        const sixMonths: { month: string; year: number; monthIdx: number; collected: number }[] = [];

        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          sixMonths.push({
            month: monthsNames[d.getMonth()],
            year: d.getFullYear(),
            monthIdx: d.getMonth(),
            collected: 0,
          });
        }

        paidPayments.forEach((p) => {
          const dateStr = p.paid_at || p.created_at;
          if (!dateStr) return;
          const pDate = new Date(dateStr);
          const pMonth = pDate.getMonth();
          const pYear = pDate.getFullYear();
          const bucket = sixMonths.find((m) => m.monthIdx === pMonth && m.year === pYear);
          if (bucket) {
            bucket.collected += Math.round((p.total_paise || p.amount_paise || 0) / 100);
          }
        });

        setMonthlyRevenueData(sixMonths.map((m) => ({ month: m.month, collected: m.collected })));

        // Payment Methods distribution
        const methodCounts: Record<string, number> = {};
        const methodDisplay: Record<string, string> = {
          upi: "UPI (GPay / PhonePe / Paytm)",
          card: "Credit / Debit Card",
          cash: "Cash / Front Desk",
          netbanking: "Net Banking / Transfer",
          cheque: "Cheque",
          other: "Other",
        };

        paidPayments.forEach((p) => {
          const mKey = (p.method || "other").toLowerCase();
          const label = methodDisplay[mKey] || mKey.toUpperCase();
          methodCounts[label] = (methodCounts[label] || 0) + 1;
        });

        const formattedMethods = Object.entries(methodCounts).map(([name, value]) => ({ name, value }));
        setPaymentMethodsData(formattedMethods);

        // Plan Tier Revenue breakdown
        const planRevenue: Record<string, number> = {};
        paidPayments.forEach((p) => {
          const planName = (p.memberships as any)?.membership_plans?.name || "General Collection";
          const amtRupees = Math.round((p.total_paise || p.amount_paise || 0) / 100);
          planRevenue[planName] = (planRevenue[planName] || 0) + amtRupees;
        });

        const formattedPlans = Object.entries(planRevenue).map(([tier, revenue]) => ({ tier, revenue }));
        setPlanTiersData(formattedPlans);

        // Load settings
        const initialGst = orgData?.gst_number || "";
        const initialGstRate = orgData?.gst_rate || 18;
        const savedSettings = localStorage.getItem(`psync_finance_settings_${roleData.org_id}`);
        if (savedSettings) {
          try {
            setSettings({
              ...DEFAULT_SETTINGS,
              gymGstin: initialGst,
              gstRatePct: initialGstRate,
              ...JSON.parse(savedSettings),
            });
          } catch {}
        } else if (orgData) {
          setSettings((prev) => ({
            ...prev,
            gymGstin: initialGst,
            gstRatePct: initialGstRate,
          }));
        }
      } catch (err) {
        console.error("Finance reports load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [roleData.org_id]);

  const handleSaveSettings = async () => {
    if (!roleData.org_id) return;
    setSavingSettings(true);
    try {
      localStorage.setItem(`psync_finance_settings_${roleData.org_id}`, JSON.stringify(settings));

      // Also persist GST details to organizations table
      if (settings.gymGstin !== undefined || settings.gstRatePct !== undefined) {
        await supabase
          .from("organizations")
          .update({
            gst_number: settings.gymGstin,
            gst_rate: settings.gstRatePct,
          })
          .eq("id", roleData.org_id);
      }

      setSavingSettings(false);
      show("Tax, GST, and invoice settings successfully updated!", "success");
    } catch {
      setSavingSettings(false);
      show("Failed to save settings", "error");
    }
  };

  // Export CSV
  const handleExport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8,Category,Amount\nTotal Collected,₹" +
      (totalCollectedPaise / 100).toLocaleString("en-IN") +
      "\nPending Member Dues,₹" +
      (pendingPaise / 100).toLocaleString("en-IN") +
      "\nCompleted Payments," +
      paymentsCount +
      "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Finance_Revenue_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Finance analytics exported to CSV", "success");
  };

  const hasMonthlyData = monthlyRevenueData.some((m) => m.collected > 0);

  return (
    <div className="ps-page fin-page">
      <DesignStyles />
      <style>{FIN_CSS}</style>

      {/* Header */}
      <header className="fin-head">
        <div>
          <div className="fin-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/payments">Finance</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Finance Reports & Settings</h1>
          <p>Revenue collections, member dues, payment gateway channels, GST and automated invoicing.</p>
        </div>

        <div className="fin-head-actions">
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

          <Link href="/dashboard/payments" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Wallet size={14} />
            <span>Payments</span>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="fin-tabs-row">
        <div className="fin-segmented">
          <button
            type="button"
            className={`fin-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/finance/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Finance Reports</span>
          </button>
          <button
            type="button"
            className={`fin-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/finance/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Finance Settings</span>
          </button>
        </div>
      </div>

      {activeTab === "reports" ? (
        <div className="fin-content">
          {/* KPIs */}
          <div className="fin-kpis">
            <div className="fin-kpi">
              <div className="fin-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
                <IndianRupee size={18} />
              </div>
              <div>
                <div className="fin-kpi-label">Total Collected</div>
                <div className="fin-kpi-val">{formatINR(totalCollectedPaise)}</div>
                <div className="fin-kpi-sub">Total revenue realized</div>
              </div>
            </div>

            <div className="fin-kpi">
              <div className="fin-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
                <CreditCard size={18} />
              </div>
              <div>
                <div className="fin-kpi-label">Pending Dues</div>
                <div className="fin-kpi-val" style={{ color: pendingPaise > 0 ? "#d70015" : "var(--text-primary)" }}>
                  {formatINR(pendingPaise)}
                </div>
                <div className="fin-kpi-sub">{pendingPaise > 0 ? "Outstanding member balances" : "All member balances clear"}</div>
              </div>
            </div>

            <div className="fin-kpi">
              <div className="fin-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
                <Receipt size={18} />
              </div>
              <div>
                <div className="fin-kpi-label">Completed Transactions</div>
                <div className="fin-kpi-val">{paymentsCount}</div>
                <div className="fin-kpi-sub">Invoices & receipts generated</div>
              </div>
            </div>

            <div className="fin-kpi">
              <div className="fin-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
                <FileText size={18} />
              </div>
              <div>
                <div className="fin-kpi-label">Avg Transaction</div>
                <div className="fin-kpi-val">
                  {paymentsCount > 0 ? formatINR(Math.round(totalCollectedPaise / paymentsCount)) : "—"}
                </div>
                <div className="fin-kpi-sub">{paymentsCount > 0 ? "Per completed receipt" : "No transactions"}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="fin-charts-grid">
            <div className="fin-card">
              <div className="fin-card-title">Monthly Collections (Last 6 Months)</div>
              {!hasMonthlyData ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <IndianRupee size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No collections recorded in the last 6 months</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRevenueData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`} />
                      <Bar dataKey="collected" name="Collected" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="fin-card">
              <div className="fin-card-title">Payment Method Share</div>
              {paymentMethodsData.length === 0 ? (
                <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)" }}>
                  <CreditCard size={32} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No payment transactions recorded yet</p>
                </div>
              ) : (
                <div style={{ height: 260, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodsData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={45}
                        paddingAngle={4}
                      >
                        {paymentMethodsData.map((entry, index) => (
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

          {/* Revenue by Plan Tier */}
          <div className="fin-card" style={{ marginTop: 20 }}>
            <div className="fin-card-title">Revenue by Membership Plan</div>
            {planTiersData.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 12 }}>No plan revenue recorded yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 14 }}>
                {planTiersData.map((pt, idx) => (
                  <div key={idx} style={{ padding: 14, background: "#f8fafc", borderRadius: 12, border: "1px solid #edf2f7" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{pt.tier}</div>
                    <div style={{ fontSize: 20, fontWeight: 750, color: "var(--text-primary)", marginTop: 4 }}>
                      ₹{pt.revenue.toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="fin-settings-grid">
          <div className="fin-card">
            <div className="fin-card-title">
              <Receipt size={16} /> GST & Invoicing Profile
            </div>
            <p className="fin-card-sub">Tax invoice configuration compliant with Indian GST rules.</p>

            <div className="nut-toggle-row">
              <div>
                <strong>Enable GST on Receipts</strong>
                <p>Include GST breakdown and GSTIN on customer tax invoices</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableGst}
                onChange={(e) => setSettings({ ...settings, enableGst: e.target.checked })}
              />
            </div>

            <div className="nut-form-row" style={{ marginTop: 14 }}>
              <label>Gym GSTIN Number</label>
              <input
                type="text"
                className="ps-input"
                placeholder="e.g. 07AAAAA0000A1Z5"
                value={settings.gymGstin}
                onChange={(e) => setSettings({ ...settings, gymGstin: e.target.value })}
              />
            </div>

            <div className="nut-form-row">
              <label>Default GST Rate (%)</label>
              <select
                value={settings.gstRatePct}
                onChange={(e) => setSettings({ ...settings, gstRatePct: Number(e.target.value) })}
              >
                <option value={18}>18% (Standard Fitness & Gym Services)</option>
                <option value={12}>12%</option>
                <option value={5}>5%</option>
                <option value={0}>0% (Exempt)</option>
              </select>
            </div>

            <div className="nut-form-row">
              <label>Invoice Prefix</label>
              <input
                type="text"
                className="ps-input"
                placeholder="e.g. GYM-2026-"
                value={settings.invoicePrefix}
                onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })}
              />
            </div>
          </div>

          <div className="fin-card">
            <div className="fin-card-title">
              <ShieldCheck size={16} /> Payment Gateways & Dues Policy
            </div>
            <p className="fin-card-sub">Automations for member receipts and payment reminders.</p>

            <div className="nut-toggle-row">
              <div>
                <strong>Auto-Send Receipt on WhatsApp</strong>
                <p>Deliver payment receipt link to member WhatsApp upon successful payment</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSendReceiptWhatsapp}
                onChange={(e) => setSettings({ ...settings, autoSendReceiptWhatsapp: e.target.checked })}
              />
            </div>

            <div className="nut-toggle-row" style={{ marginTop: 14 }}>
              <div>
                <strong>Auto-Send Invoice via Email</strong>
                <p>Send itemized PDF invoice to member email address</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSendInvoiceEmail}
                onChange={(e) => setSettings({ ...settings, autoSendInvoiceEmail: e.target.checked })}
              />
            </div>

            <div className="nut-form-row" style={{ marginTop: 14 }}>
              <label>Grace Period for Overdue Renewals (Days)</label>
              <input
                type="number"
                className="ps-input"
                value={settings.overdueGraceDays}
                onChange={(e) => setSettings({ ...settings, overdueGraceDays: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinanceReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}><Skeleton height={60} count={3} /></div>}>
      <FinanceReportsAndSettingsContent />
    </Suspense>
  );
}

const FIN_CSS = `
.fin-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.fin-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.fin-breadcrumb a { color: inherit; text-decoration: none; }
.fin-breadcrumb a:hover { color: var(--text-primary); }
.fin-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.fin-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.fin-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.fin-head-actions { display: flex; align-items: center; gap: 10px; }

.fin-tabs-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.fin-segmented { display: inline-flex; padding: 4px; background: #f1f3f7; border-radius: 12px; gap: 4px; }
.fin-segmented-item { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border: none; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 140ms ease; }
.fin-segmented-item.active { background: #fff; color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

.fin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.fin-kpi { display: flex; align-items: flex-start; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.fin-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.fin-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.fin-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.fin-kpi-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }

.fin-charts-grid, .fin-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.fin-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; padding: 20px; }
.fin-card-title { font-size: 15px; font-weight: 750; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
.fin-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin: 4px 0 16px; }

.nut-form-row { margin-bottom: 14px; }
.nut-form-row label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 6px; }
.nut-form-row select, .nut-form-row input { width: 100%; height: 38px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; }

.nut-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9; gap: 16px; }
.nut-toggle-row:last-child { border-bottom: none; }
.nut-toggle-row strong { font-size: 13.5px; display: block; color: var(--text-primary); }
.nut-toggle-row p { font-size: 12px; color: var(--text-tertiary); margin: 2px 0 0; }
.nut-toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #0a84ff; cursor: pointer; }

@media (max-width: 960px) {
  .fin-charts-grid, .fin-settings-grid { grid-template-columns: 1fr; }
}
`;
