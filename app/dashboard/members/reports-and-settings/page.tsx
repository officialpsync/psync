"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Users, BarChart3, Settings, ShieldCheck, AlertTriangle, Check, RefreshCw,
  Clock, IndianRupee, Download, ChevronRight, Phone, MessageSquare,
  TrendingUp, TrendingDown, Calendar, UserCheck, Flame, ArrowUpRight,
  Plus, Edit2, CheckCircle2, XCircle, SlidersHorizontal, Bell, FileText,
  Activity, Award, Zap, HelpCircle, Save, RotateCcw, Eye, EyeOff,
  Archive, ArchiveRestore, Upload, FileSpreadsheet, ArrowLeftRight, Search,
  Filter, CheckSquare
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase";
import { formatINR, Avatar, Skeleton, useToast } from "../../components/ui";
import { DesignStyles } from "../../components/DesignSystem";
import { ImportMembersSheet } from "../components/ImportMembersSheet";

const supabase = createClient();

/* ─── Types ─── */
type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
  primary_goal: string | null;
  created_at: string;
  status: string | null;
  outstanding_balance_paise: number | null;
  onboarding_status: string | null;
};

type MembershipRow = {
  id: string;
  member_id: string;
  plan_id: string | null;
  start_date: string | null;
  end_date: string;
  status: string;
  membership_plans: {
    id: string;
    name: string;
    duration_days: number | null;
    price_paise: number;
  } | null;
};

type AttendanceRow = {
  id: string;
  member_id: string;
  check_in_at: string;
  check_out_at: string | null;
  method: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  plan_type: string | null;
  duration_days: number;
  price_paise: number;
  is_active: boolean;
  created_at: string;
};

type MemberSettings = {
  expiryAlertDays: number;
  gracePeriodDays: number;
  maxOutstandingDuesPaise: number;
  autoArchiveMonths: number;
  allowedMethods: {
    qr: boolean;
    desk: boolean;
    phone: boolean;
  };
  allowMultipleDailyCheckins: boolean;
  blockExpiredCheckins: boolean;
  chimeOnCheckin: boolean;
  onboarding: {
    includeMedical: boolean;
    includeGoals: boolean;
    includeDiet: boolean;
    requireEmergency: boolean;
    expiryDays: number;
    autoAssignTrainer: boolean;
  };
  notifications: {
    autoRenewalWhatsapp: boolean;
    autoWelcomeWhatsapp: boolean;
    autoReceiptWhatsapp: boolean;
    renewalTemplate: string;
  };
  bulkTransfer: {
    defaultExportFormat: "csv" | "xlsx" | "pdf";
    defaultExportScope: "all" | "active" | "dues" | "inactive";
    includeMedicalInExport: boolean;
    includeEmergencyInExport: boolean;
    includeFinancesInExport: boolean;
    duplicateHandling: "skip" | "update" | "allow";
    defaultPlanId: string;
    autoWelcomeImportedMembers: boolean;
  };
};

const DEFAULT_SETTINGS: MemberSettings = {
  expiryAlertDays: 7,
  gracePeriodDays: 3,
  maxOutstandingDuesPaise: 100000, // ₹1,000
  autoArchiveMonths: 3,
  allowedMethods: {
    qr: true,
    desk: true,
    phone: true,
  },
  allowMultipleDailyCheckins: true,
  blockExpiredCheckins: true,
  chimeOnCheckin: true,
  onboarding: {
    includeMedical: true,
    includeGoals: true,
    includeDiet: true,
    requireEmergency: true,
    expiryDays: 14,
    autoAssignTrainer: true,
  },
  notifications: {
    autoRenewalWhatsapp: true,
    autoWelcomeWhatsapp: true,
    autoReceiptWhatsapp: true,
    renewalTemplate: "Hi {member_name}! Your {plan_name} at {gym_name} expires in {days_left} days ({expiry_date}). Renew early to keep your workout streak uninterrupted!",
  },
  bulkTransfer: {
    defaultExportFormat: "csv",
    defaultExportScope: "all",
    includeMedicalInExport: true,
    includeEmergencyInExport: true,
    includeFinancesInExport: true,
    duplicateHandling: "skip",
    defaultPlanId: "",
    autoWelcomeImportedMembers: true,
  },
};

const GOAL_LABELS: Record<string, string> = {
  fat_loss: "Fat Loss",
  muscle_gain: "Muscle Gain",
  weight_gain: "Weight Gain",
  maintenance: "Maintenance",
  general_fitness: "General Fitness",
  strength: "Strength",
  endurance: "Endurance",
  healthy_eating: "Healthy Eating",
};

const CHART_PALETTE = ["#0a84ff", "#30b0c7", "#34c759", "#ff9f0a", "#af52de", "#ff3b30", "#5856d6", "#64d2ff"];

function MemberReportsAndSettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "settings" ? "settings" : "reports";
  const [activeTab, setActiveTab] = useState<"reports" | "settings">(initialTab);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "mtd" | "all">("30d");

  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Your Gym");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [settings, setSettings] = useState<MemberSettings>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const { toast, show } = useToast();

  // Bulk Transfer tools state
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx" | "pdf">("csv");
  const [exportScope, setExportScope] = useState<"all" | "active" | "dues" | "inactive">("all");
  const [exportIncludeHealth, setExportIncludeHealth] = useState(true);
  const [exportIncludeEmergency, setExportIncludeEmergency] = useState(true);
  const [exportIncludeFinances, setExportIncludeFinances] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Keep active tab in sync with URL if changed
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "settings" || tabParam === "reports") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!roleData?.org_id) return;
      const oid = roleData.org_id;
      setOrgId(oid);

      // Fetch org details
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", oid)
        .single();
      if (orgData?.name) setOrgName(orgData.name);

      // Load saved settings from localStorage or fallback
      try {
        const saved = localStorage.getItem(`psync.member_settings.${oid}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...parsed,
            bulkTransfer: {
              ...DEFAULT_SETTINGS.bulkTransfer,
              ...(parsed.bulkTransfer || {}),
            },
          });
        }
      } catch {
        // use default
      }

      // Fetch members, memberships, attendance, plans in parallel
      const [mRes, msRes, aRes, pRes] = await Promise.all([
        supabase
          .from("members")
          .select("id, full_name, phone, email, sex, primary_goal, created_at, status, outstanding_balance_paise, onboarding_status")
          .eq("org_id", oid)
          .neq("status", "deleted")
          .order("created_at", { ascending: false }),
        supabase
          .from("memberships")
          .select("id, member_id, plan_id, start_date, end_date, status, membership_plans(id, name, duration_days, price_paise)")
          .eq("org_id", oid)
          .order("end_date", { ascending: false }),
        supabase
          .from("attendance_logs")
          .select("id, member_id, check_in_at, check_out_at, method")
          .eq("org_id", oid)
          .order("check_in_at", { ascending: false })
          .limit(1000),
        supabase
          .from("membership_plans")
          .select("id, name, description, plan_type, duration_days, price_paise, is_active, created_at")
          .eq("org_id", oid)
          .order("created_at", { ascending: false }),
      ]);

      if (mRes.data) setMembers(mRes.data as MemberRow[]);
      if (msRes.data) setMemberships(msRes.data as unknown as MembershipRow[]);
      if (aRes.data) setAttendance(aRes.data as AttendanceRow[]);
      if (pRes.data) setPlans(pRes.data as PlanRow[]);
    } catch (err: any) {
      console.error("Failed to load member reports data:", err);
      show(err.message || "Failed to load member reports", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Date threshold for period filter
  const periodStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (period === "7d") d.setDate(d.getDate() - 7);
    else if (period === "30d") d.setDate(d.getDate() - 30);
    else if (period === "90d") d.setDate(d.getDate() - 90);
    else if (period === "mtd") d.setDate(1);
    else if (period === "all") return new Date(2000, 0, 1);
    return d;
  }, [period]);

  // Filtered attendance in period
  const attendanceInPeriod = useMemo(() => {
    return attendance.filter((a) => new Date(a.check_in_at) >= periodStart);
  }, [attendance, periodStart]);

  // Filtered new members in period
  const newMembersInPeriod = useMemo(() => {
    return members.filter((m) => new Date(m.created_at) >= periodStart);
  }, [members, periodStart]);

  // Key KPI stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalCount = members.length;
    const activeCount = members.filter((m) => m.status === "active").length;
    const inactiveCount = totalCount - activeCount;

    // Total dues / pending balance
    const totalDuesPaise = members.reduce(
      (acc, m) => acc + Math.max(0, Number(m.outstanding_balance_paise || 0)),
      0
    );
    const membersWithDuesCount = members.filter(
      (m) => Number(m.outstanding_balance_paise || 0) > 0
    ).length;

    // Renewals due soon (next 30 days)
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const expiring30Count = memberships.filter((ms) => {
      if (!ms.end_date) return false;
      const end = new Date(ms.end_date);
      return end >= today && end <= in30Days;
    }).length;

    // Total check-ins in period
    const checkinCount = attendanceInPeriod.length;
    const uniqueAttendedMembers = new Set(attendanceInPeriod.map((a) => a.member_id)).size;
    const avgVisits = activeCount > 0 ? (checkinCount / activeCount).toFixed(1) : "0";

    // Retention rate estimate
    const expiredPastCount = memberships.filter((ms) => {
      if (!ms.end_date) return false;
      const end = new Date(ms.end_date);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return end < today && end >= thirtyDaysAgo;
    }).length;
    const retentionRate =
      totalCount > 0
        ? Math.round(
            (activeCount / Math.max(1, activeCount + expiredPastCount)) * 100
          )
        : 100;

    return {
      totalCount,
      activeCount,
      inactiveCount,
      newJoins: newMembersInPeriod.length,
      totalDuesPaise,
      membersWithDuesCount,
      expiring30Count,
      checkinCount,
      uniqueAttendedMembers,
      avgVisits,
      retentionRate,
    };
  }, [members, memberships, attendanceInPeriod, newMembersInPeriod]);

  // Chart 1: Plan Distribution Breakdown
  const planDistribution = useMemo(() => {
    const countMap: Record<string, number> = {};
    memberships.forEach((ms) => {
      const planName = ms.membership_plans?.name || "Standard Membership";
      countMap[planName] = (countMap[planName] || 0) + 1;
    });

    return Object.entries(countMap).map(([name, count]) => ({
      name,
      count,
    })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [memberships]);

  // Chart 2: Fitness Goals Breakdown
  const goalsDistribution = useMemo(() => {
    const countMap: Record<string, number> = {};
    members.forEach((m) => {
      const goalKey = m.primary_goal || "general_fitness";
      const label = GOAL_LABELS[goalKey] || goalKey.replace(/_/g, " ");
      countMap[label] = (countMap[label] || 0) + 1;
    });

    return Object.entries(countMap).map(([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value);
  }, [members]);

  // Chart 3: Gender / Demographic Breakdown
  const genderDistribution = useMemo(() => {
    let male = 0;
    let female = 0;
    let other = 0;
    members.forEach((m) => {
      const g = (m.sex || "").toLowerCase();
      if (g.startsWith("m")) male++;
      else if (g.startsWith("f")) female++;
      else other++;
    });

    return [
      { name: "Male", value: male },
      { name: "Female", value: female },
      ...(other > 0 ? [{ name: "Other / Unspecified", value: other }] : []),
    ];
  }, [members]);

  // Chart 4: Attendance by Day of Week
  const attendanceByDay = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    attendanceInPeriod.forEach((a) => {
      const d = new Date(a.check_in_at).getDay();
      counts[d]++;
    });
    return [
      { day: "Mon", checkins: counts[1] },
      { day: "Tue", checkins: counts[2] },
      { day: "Wed", checkins: counts[3] },
      { day: "Thu", checkins: counts[4] },
      { day: "Fri", checkins: counts[5] },
      { day: "Sat", checkins: counts[6] },
      { day: "Sun", checkins: counts[0] },
    ];
  }, [attendanceInPeriod]);

  // At-Risk Members (Inactive for 14+ days or expiring in <7 days)
  const atRiskMembers = useMemo(() => {
    const today = new Date();
    const lastCheckinMap = new Map<string, Date>();

    attendance.forEach((a) => {
      const cur = lastCheckinMap.get(a.member_id);
      const logDate = new Date(a.check_in_at);
      if (!cur || logDate > cur) {
        lastCheckinMap.set(a.member_id, logDate);
      }
    });

    return members
      .filter((m) => m.status === "active")
      .map((m) => {
        const lastDate = lastCheckinMap.get(m.id);
        const daysInactive = lastDate
          ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        return {
          member: m,
          lastDate,
          daysInactive,
          dues: Number(m.outstanding_balance_paise || 0),
        };
      })
      .filter((row) => row.daysInactive >= 14 || row.dues > 0)
      .sort((a, b) => b.daysInactive - a.daysInactive)
      .slice(0, 8);
  }, [members, attendance]);

  // Top Active Members (Leaderboard)
  const topActiveMembers = useMemo(() => {
    const counts = new Map<string, number>();
    attendanceInPeriod.forEach((a) => {
      counts.set(a.member_id, (counts.get(a.member_id) || 0) + 1);
    });

    const memMap = new Map(members.map((m) => [m.id, m]));

    return Array.from(counts.entries())
      .map(([member_id, count]) => ({
        member: memMap.get(member_id),
        count,
      }))
      .filter((r) => r.member)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [attendanceInPeriod, members]);

  // Save Member Settings
  const handleSaveSettings = async () => {
    if (!orgId) return;
    try {
      setSavingSettings(true);
      localStorage.setItem(`psync.member_settings.${orgId}`, JSON.stringify(settings));
      await new Promise((r) => setTimeout(r, 350));
      show("Member settings & bulk transfer preferences saved!");
    } catch (err: any) {
      show("Failed to save settings: " + err.message, "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Bulk Export Execution (CSV, Excel, PDF)
  const handleBulkExport = () => {
    try {
      setIsExporting(true);

      let targetMembers = members;
      if (exportScope === "active") {
        targetMembers = members.filter((m) => m.status === "active");
      } else if (exportScope === "dues") {
        targetMembers = members.filter((m) => Number(m.outstanding_balance_paise || 0) > 0);
      } else if (exportScope === "inactive") {
        targetMembers = members.filter((m) => m.status !== "active");
      }

      if (targetMembers.length === 0) {
        show("No members match the selected export scope", "error");
        setIsExporting(false);
        return;
      }

      // Member Plan Map for fast lookup
      const memberPlanMap = new Map<string, { planName: string; pricePaise: number; endDate: string }>();
      memberships.forEach((ms) => {
        if (!memberPlanMap.has(ms.member_id) || new Date(ms.end_date) > new Date(memberPlanMap.get(ms.member_id)!.endDate)) {
          memberPlanMap.set(ms.member_id, {
            planName: ms.membership_plans?.name || "Standard Plan",
            pricePaise: ms.membership_plans?.price_paise || 0,
            endDate: ms.end_date,
          });
        }
      });

      // Headers
      const headers = ["Member ID", "Full Name", "Phone", "Email", "Gender", "Status", "Joined"];
      if (exportIncludeFinances) {
        headers.push("Current Plan", "Plan Price (INR)", "Pending Dues (INR)", "Expires");
      }
      if (exportIncludeHealth) {
        headers.push("Primary Goal", "Onboarding Status");
      }

      // Rows
      const rows = targetMembers.map((m) => {
        const planInfo = memberPlanMap.get(m.id);
        const line: (string | number)[] = [
          m.id,
          m.full_name || "",
          m.phone || "",
          m.email || "",
          m.sex ? m.sex.charAt(0).toUpperCase() + m.sex.slice(1) : "",
          m.status || "active",
          m.created_at ? m.created_at.slice(0, 10) : "",
        ];
        if (exportIncludeFinances) {
          line.push(
            planInfo?.planName || "No Plan",
            planInfo ? (planInfo.pricePaise / 100).toFixed(0) : "0",
            (Number(m.outstanding_balance_paise || 0) / 100).toFixed(0),
            planInfo?.endDate ? planInfo.endDate.slice(0, 10) : ""
          );
        }
        if (exportIncludeHealth) {
          line.push(
            GOAL_LABELS[m.primary_goal || ""] || m.primary_goal?.replace(/_/g, " ") || "General Fitness",
            m.onboarding_status || "completed"
          );
        }
        return line;
      });

      const today = new Date().toISOString().slice(0, 10);
      const filename = `members-${exportScope}-${today}`;

      if (exportFormat === "csv") {
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.csv`;
        a.click();
        show(`Exported ${targetMembers.length} members to CSV`);
      } else if (exportFormat === "xlsx") {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const colWidths = headers.map((col, idx) => {
          let maxLen = col.length;
          for (let i = 0; i < Math.min(rows.length, 50); i++) {
            const val = String(rows[i][idx] || "");
            if (val.length > maxLen) maxLen = val.length;
          }
          return { wch: Math.min(Math.max(maxLen + 2, 10), 35) };
        });
        ws["!cols"] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Members");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.xlsx`;
        a.click();
        show(`Exported ${targetMembers.length} members to Excel (.xlsx)`);
      } else if (exportFormat === "pdf") {
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "pt",
          format: "a4",
        });

        doc.setFontSize(15);
        doc.setTextColor(30, 41, 59);
        doc.text(`${orgName} - Members Directory`, 36, 36);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Export Date: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })} · Scope: ${exportScope.toUpperCase()} (${targetMembers.length} members)`,
          36,
          52
        );

        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 65,
          margin: { left: 36, right: 36, bottom: 36 },
          theme: "grid",
          styles: { fontSize: 7.5, cellPadding: 3, valign: "middle" },
          headStyles: {
            fillColor: [10, 132, 255],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        doc.save(`${filename}.pdf`);
        show(`Exported ${targetMembers.length} members to PDF`);
      }
    } catch (err: any) {
      show("Export error: " + (err?.message || "Failed to generate file"), "error");
    } finally {
      setIsExporting(false);
    }
  };

  // WhatsApp quick follow-up link
  const getWaLink = (phone: string | null, name: string) => {
    if (!phone) return "#";
    const clean = phone.replace(/\D/g, "");
    const formatted = clean.length === 10 ? `91${clean}` : clean;
    const text = encodeURIComponent(`Hi ${name}, we noticed we haven't seen you at ${orgName} recently! Everything okay? Let us know how we can support your fitness goals.`);
    return `https://wa.me/${formatted}?text=${text}`;
  };

  return (
    <div className="ps-page mrs">
      <DesignStyles />
      <style>{CSS}</style>

      {/* ── Breadcrumb & Top Bar ── */}
      <header className="mrs-head">
        <div>
          <div className="mrs-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/members">Membership</Link>
            <ChevronRight size={13} />
            <span>Reports & Settings</span>
          </div>
          <h1>Member Reports & Settings</h1>
          <p>
            Comprehensive analytics, member metrics, plan archive management, bulk transfer, and operational rules.
          </p>
        </div>

        <div className="mrs-head-actions">
          {activeTab === "reports" && (
            <button
              type="button"
              className="ps-btn ps-btn--secondary ps-btn--sm"
              onClick={handleBulkExport}
              disabled={loading || members.length === 0}
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          )}

          {activeTab === "settings" && (
            <>
              <button
                type="button"
                className="ps-btn ps-btn--secondary ps-btn--sm"
                onClick={() => setImportSheetOpen(true)}
              >
                <Upload size={14} />
                <span>Import Members</span>
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary ps-btn--sm"
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                <Save size={14} />
                <span>{savingSettings ? "Saving..." : "Save Settings"}</span>
              </button>
            </>
          )}

          <Link href="/dashboard/members" className="ps-btn ps-btn--secondary ps-btn--sm">
            <Users size={14} />
            <span>Member Roster</span>
          </Link>
        </div>
      </header>

      {/* ── Tab Switcher ── */}
      <div className="mrs-tabs-row">
        <div className="mrs-segmented">
          <button
            type="button"
            className={`mrs-segmented-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("reports");
              router.replace("/dashboard/members/reports-and-settings?tab=reports");
            }}
          >
            <BarChart3 size={15} />
            <span>Member Reports</span>
          </button>
          <button
            type="button"
            className={`mrs-segmented-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("settings");
              router.replace("/dashboard/members/reports-and-settings?tab=settings");
            }}
          >
            <Settings size={15} />
            <span>Member Settings</span>
          </button>
        </div>

        {activeTab === "reports" && (
          <div className="mrs-period-selector">
            <span className="mrs-period-label">Period:</span>
            {(["7d", "30d", "90d", "mtd", "all"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={`mrs-period-pill ${period === p ? "active" : ""}`}
                onClick={() => setPeriod(p)}
              >
                {p === "7d"
                  ? "7D"
                  : p === "30d"
                  ? "30D"
                  : p === "90d"
                  ? "90D"
                  : p === "mtd"
                  ? "This Month"
                  : "All Time"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: MEMBER REPORTS
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "reports" && (
        <div className="mrs-content">
          {/* ── KPI Metric Cards ── */}
          <section className="mrs-metrics">
            <div className="mrs-metric-card mrs-metric-card--blue">
              <div className="mrs-metric-top">
                <span className="mrs-metric-label">Active Members</span>
                <span className="mrs-metric-badge mrs-metric-badge--blue">Roster</span>
              </div>
              <div className="mrs-metric-main">
                <div className="mrs-metric-val">
                  {loading ? <Skeleton w={50} h={26} /> : stats.activeCount}
                </div>
                <div className="mrs-metric-sub">
                  {loading ? <Skeleton w={70} h={16} /> : `${stats.totalCount} total registered`}
                </div>
              </div>
              <div className="mrs-metric-foot">{stats.inactiveCount} inactive / lapsed</div>
            </div>

            <div className="mrs-metric-card mrs-metric-card--green">
              <div className="mrs-metric-top">
                <span className="mrs-metric-label">New Joins</span>
                <span className="mrs-metric-badge mrs-metric-badge--green">Growth</span>
              </div>
              <div className="mrs-metric-main">
                <div className="mrs-metric-val">
                  {loading ? <Skeleton w={50} h={26} /> : stats.newJoins}
                </div>
                <div className="mrs-metric-sub">
                  In selected {period.toUpperCase()}
                </div>
              </div>
              <div className="mrs-metric-foot">New member acquisitions</div>
            </div>

            <div className="mrs-metric-card mrs-metric-card--amber">
              <div className="mrs-metric-top">
                <span className="mrs-metric-label">Pending Balance</span>
                <span className="mrs-metric-badge mrs-metric-badge--amber">Unpaid</span>
              </div>
              <div className="mrs-metric-main">
                <div className="mrs-metric-val">
                  {loading ? <Skeleton w={80} h={26} /> : formatINR(stats.totalDuesPaise)}
                </div>
                <div className="mrs-metric-sub">
                  Across {stats.membersWithDuesCount} members
                </div>
              </div>
              <div className="mrs-metric-foot">
                <Link href="/dashboard/renewals" className="mrs-link-inline">
                  View pending balance tracker →
                </Link>
              </div>
            </div>

            <div className="mrs-metric-card mrs-metric-card--purple">
              <div className="mrs-metric-top">
                <span className="mrs-metric-label">Attendance Velocity</span>
                <span className="mrs-metric-badge mrs-metric-badge--purple">Check-ins</span>
              </div>
              <div className="mrs-metric-main">
                <div className="mrs-metric-val">
                  {loading ? <Skeleton w={60} h={26} /> : stats.checkinCount}
                </div>
                <div className="mrs-metric-sub">
                  {stats.avgVisits} visits / active member
                </div>
              </div>
              <div className="mrs-metric-foot">{stats.uniqueAttendedMembers} unique members visited</div>
            </div>
          </section>

          {/* ── Charts Grid ── */}
          <div className="mrs-grid">
            {/* Chart 1: Plan Distribution */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">Membership Plan Mix</h3>
                  <p className="mrs-card-desc">Distribution of active members across gym plans</p>
                </div>
                <span className="mrs-chip">{planDistribution.length} Plans</span>
              </div>
              <div className="mrs-chart-wrap" style={{ height: 260 }}>
                {loading ? (
                  <div className="mrs-center-loading"><Skeleton w="100%" h={220} /></div>
                ) : planDistribution.length === 0 ? (
                  <div className="mrs-empty">No active memberships found</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={planDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mb-line, #e2e8f0)" />
                      <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                      <YAxis stroke="var(--text-tertiary)" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface, #fff)",
                          border: "1px solid var(--mb-line, #e2e8f0)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="#0a84ff" radius={[4, 4, 0, 0]} name="Members" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Member Goals Distribution */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">Member Fitness Goals</h3>
                  <p className="mrs-card-desc">Primary workout objectives indicated by members</p>
                </div>
              </div>
              <div className="mrs-chart-wrap" style={{ height: 260 }}>
                {loading ? (
                  <div className="mrs-center-loading"><Skeleton w="100%" h={220} /></div>
                ) : goalsDistribution.length === 0 ? (
                  <div className="mrs-empty">No goal data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={goalsDistribution} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--mb-line, #e2e8f0)" />
                      <XAxis type="number" stroke="var(--text-tertiary)" fontSize={11} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={11} width={85} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface, #fff)",
                          border: "1px solid var(--mb-line, #e2e8f0)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="value" fill="#30b0c7" radius={[0, 4, 4, 0]} name="Members" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: Weekly Attendance Check-ins */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">Attendance by Day of Week</h3>
                  <p className="mrs-card-desc">Check-in distribution across days to gauge peak rush</p>
                </div>
              </div>
              <div className="mrs-chart-wrap" style={{ height: 260 }}>
                {loading ? (
                  <div className="mrs-center-loading"><Skeleton w="100%" h={220} /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceByDay} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mb-line, #e2e8f0)" />
                      <XAxis dataKey="day" stroke="var(--text-tertiary)" fontSize={12} />
                      <YAxis stroke="var(--text-tertiary)" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface, #fff)",
                          border: "1px solid var(--mb-line, #e2e8f0)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="checkins" fill="#34c759" radius={[4, 4, 0, 0]} name="Check-ins" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 4: Gender Ratio */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">Member Demographics</h3>
                  <p className="mrs-card-desc">Gender ratio and member diversity profile</p>
                </div>
              </div>
              <div className="mrs-chart-wrap mrs-chart-flex" style={{ height: 260 }}>
                {loading ? (
                  <div className="mrs-center-loading"><Skeleton w={140} h={140} r={70} /></div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {genderDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--surface, #fff)",
                          border: "1px solid var(--mb-line, #e2e8f0)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* ── Sub-Reports: At-Risk Members & Leaderboard ── */}
          <div className="mrs-grid" style={{ marginTop: 20 }}>
            {/* At-Risk Members List */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">At-Risk Members</h3>
                  <p className="mrs-card-desc">
                    Members inactive for 14+ days or with pending balance
                  </p>
                </div>
                <span className="mrs-badge mrs-badge--amber">
                  <AlertTriangle size={12} />
                  <span>{atRiskMembers.length} Flagged</span>
                </span>
              </div>

              <div className="mrs-table-wrap">
                {loading ? (
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Skeleton w="100%" h={40} />
                    <Skeleton w="100%" h={40} />
                  </div>
                ) : atRiskMembers.length === 0 ? (
                  <div className="mrs-empty">Great news! No at-risk members detected.</div>
                ) : (
                  <table className="mrs-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Days Inactive</th>
                        <th>Dues</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atRiskMembers.map(({ member, daysInactive, dues }) => (
                        <tr key={member.id}>
                          <td>
                            <div className="mrs-user-cell">
                              <Avatar name={member.full_name} size={28} />
                              <div>
                                <Link href={`/dashboard/members/${member.id}`} className="mrs-user-name">
                                  {member.full_name}
                                </Link>
                                <span className="mrs-user-sub">{member.phone || "No phone"}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`mrs-tag ${daysInactive >= 30 ? "mrs-tag--red" : "mrs-tag--amber"}`}>
                              {daysInactive >= 999 ? "Never attended" : `${daysInactive}d ago`}
                            </span>
                          </td>
                          <td>
                            {dues > 0 ? (
                              <span style={{ color: "#e11d48", fontWeight: 600 }}>{formatINR(dues)}</span>
                            ) : (
                              <span style={{ color: "var(--text-tertiary)" }}>Cleared</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {member.phone && (
                              <a
                                href={getWaLink(member.phone, member.full_name)}
                                target="_blank"
                                rel="noreferrer"
                                className="mrs-btn-icon"
                                title="Send WhatsApp Message"
                              >
                                <MessageSquare size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Attendance Leaderboard */}
            <div className="mrs-card">
              <div className="mrs-card-head">
                <div>
                  <h3 className="mrs-card-title">Most Active Members</h3>
                  <p className="mrs-card-desc">Top gym check-ins in selected period</p>
                </div>
                <span className="mrs-badge mrs-badge--green">
                  <Flame size={12} />
                  <span>Leaderboard</span>
                </span>
              </div>

              <div className="mrs-table-wrap">
                {loading ? (
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Skeleton w="100%" h={40} />
                    <Skeleton w="100%" h={40} />
                  </div>
                ) : topActiveMembers.length === 0 ? (
                  <div className="mrs-empty">No check-ins logged in this period</div>
                ) : (
                  <table className="mrs-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Member</th>
                        <th>Goal</th>
                        <th style={{ textAlign: "right" }}>Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topActiveMembers.map(({ member, count }, idx) => (
                        <tr key={member!.id}>
                          <td>
                            <span className={`mrs-rank-badge ${idx === 0 ? "mrs-rank-badge--1" : idx === 1 ? "mrs-rank-badge--2" : idx === 2 ? "mrs-rank-badge--3" : ""}`}>
                              #{idx + 1}
                            </span>
                          </td>
                          <td>
                            <div className="mrs-user-cell">
                              <Avatar name={member!.full_name} size={28} />
                              <div>
                                <Link href={`/dashboard/members/${member!.id}`} className="mrs-user-name">
                                  {member!.full_name}
                                </Link>
                                <span className="mrs-user-sub">{member!.phone || "—"}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="mrs-chip">
                              {GOAL_LABELS[member!.primary_goal || ""] || "Fitness"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <span style={{ fontWeight: 700, color: "var(--accent, #0a84ff)" }}>
                              {count} check-ins
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: MEMBER SETTINGS
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="mrs-settings-content">
          {/* ── Section 1: Bulk Transfer Settings (Import & Export for Members) ── */}
          <div className="mrs-card mrs-settings-section">
            <div className="mrs-card-head">
              <div>
                <h3 className="mrs-card-title">Bulk Transfer Settings (Import & Export for Members)</h3>
                <p className="mrs-card-desc">
                  Batch transfer member directories, configure file import rules, and customize export formats.
                </p>
              </div>
              <span className="mrs-badge mrs-badge--blue">
                <ArrowLeftRight size={12} />
                <span>Bulk Transfer Hub</span>
              </span>
            </div>

            {/* Action Cards: Import & Export Operations */}
            <div className="mrs-transfer-cards">
              {/* Card A: Bulk Import */}
              <div className="mrs-transfer-card">
                <div className="mrs-transfer-card-header">
                  <div className="mrs-transfer-icon-wrap mrs-transfer-icon-wrap--import">
                    <Upload size={18} />
                  </div>
                  <div>
                    <h4>Bulk Import Members</h4>
                    <p>Upload member roster from CSV, Excel (.xlsx), or JSON file with auto-mapping.</p>
                  </div>
                </div>

                <div className="mrs-transfer-card-body">
                  <div className="mrs-transfer-feature-list">
                    <div><CheckCircle2 size={13} color="#16a34a" /> <span>Drag-and-drop file upload & schema auto-detect</span></div>
                    <div><CheckCircle2 size={13} color="#16a34a" /> <span>Auto-creates memberships with duration & pricing</span></div>
                    <div><CheckCircle2 size={13} color="#16a34a" /> <span>Validates phone numbers and prevents corrupt records</span></div>
                  </div>
                </div>

                <div className="mrs-transfer-card-footer">
                  <button
                    type="button"
                    className="ps-btn ps-btn--primary ps-btn--sm"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={() => setImportSheetOpen(true)}
                  >
                    <Upload size={14} />
                    <span>Launch Member Import Wizard</span>
                  </button>
                </div>
              </div>

              {/* Card B: Bulk Export */}
              <div className="mrs-transfer-card">
                <div className="mrs-transfer-card-header">
                  <div className="mrs-transfer-icon-wrap mrs-transfer-icon-wrap--export">
                    <Download size={18} />
                  </div>
                  <div>
                    <h4>Bulk Export Directory</h4>
                    <p>Generate downloadable member database in your chosen format and scope.</p>
                  </div>
                </div>

                <div className="mrs-transfer-card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Format pills */}
                    <div>
                      <span className="mrs-field-desc" style={{ display: "block", marginBottom: 4 }}>Export File Format:</span>
                      <div className="mrs-seg">
                        {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            className={exportFormat === fmt ? "active" : ""}
                            onClick={() => setExportFormat(fmt)}
                          >
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scope pills */}
                    <div>
                      <span className="mrs-field-desc" style={{ display: "block", marginBottom: 4 }}>Export Member Scope:</span>
                      <select
                        value={exportScope}
                        onChange={(e) => setExportScope(e.target.value as any)}
                        className="mrs-select"
                        style={{ height: 32, fontSize: 12 }}
                      >
                        <option value="all">All Members ({stats.totalCount})</option>
                        <option value="active">Active Members Only ({stats.activeCount})</option>
                        <option value="dues">Members with Pending Dues ({stats.membersWithDuesCount})</option>
                        <option value="inactive">Inactive / Lapsed ({stats.inactiveCount})</option>
                      </select>
                    </div>

                    {/* Toggles */}
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={exportIncludeFinances}
                          onChange={(e) => setExportIncludeFinances(e.target.checked)}
                        />
                        <span>Include Plan & Dues</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={exportIncludeHealth}
                          onChange={(e) => setExportIncludeHealth(e.target.checked)}
                        />
                        <span>Include Goals & Tags</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mrs-transfer-card-footer">
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    style={{ width: "100%", justifyContent: "center" }}
                    onClick={handleBulkExport}
                    disabled={isExporting || members.length === 0}
                  >
                    <Download size={14} />
                    <span>{isExporting ? "Generating..." : `Download ${exportFormat.toUpperCase()} Export`}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Default Settings & Transfer Rules */}
            <div style={{ marginTop: 22 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
                Bulk Transfer Automation & Conflict Preferences
              </h4>

              <div className="mrs-form-grid">
                <div className="mrs-form-field">
                  <label>Import Duplicate Resolution Policy</label>
                  <span className="mrs-field-desc">How to handle rows matching existing member phone/email</span>
                  <select
                    value={settings.bulkTransfer.duplicateHandling}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bulkTransfer: {
                          ...settings.bulkTransfer,
                          duplicateHandling: e.target.value as any,
                        },
                      })
                    }
                    className="mrs-select"
                  >
                    <option value="skip">Skip duplicates (Safe: Prevents duplicate accounts)</option>
                    <option value="update">Update existing member details with imported data</option>
                    <option value="allow">Allow duplicates (Creates separate member record)</option>
                  </select>
                </div>

                <div className="mrs-form-field">
                  <label>Default Plan for Unspecified Import Rows</label>
                  <span className="mrs-field-desc">Assign this plan when import row lacks an explicit plan name</span>
                  <select
                    value={settings.bulkTransfer.defaultPlanId}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bulkTransfer: {
                          ...settings.bulkTransfer,
                          defaultPlanId: e.target.value,
                        },
                      })
                    }
                    className="mrs-select"
                  >
                    <option value="">No plan assigned (Member profile only)</option>
                    {plans.filter((p) => p.is_active).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.duration_days}d - {formatINR(p.price_paise)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mrs-form-field">
                  <label>Default Export Format Preference</label>
                  <span className="mrs-field-desc">Pre-selected format for one-click reports export</span>
                  <select
                    value={settings.bulkTransfer.defaultExportFormat}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bulkTransfer: {
                          ...settings.bulkTransfer,
                          defaultExportFormat: e.target.value as any,
                        },
                      })
                    }
                    className="mrs-select"
                  >
                    <option value="csv">Comma-Separated Values (CSV)</option>
                    <option value="xlsx">Microsoft Excel (.xlsx)</option>
                    <option value="pdf">Printable PDF Document</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="mrs-toggle-item">
                  <input
                    type="checkbox"
                    checked={settings.bulkTransfer.autoWelcomeImportedMembers}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bulkTransfer: {
                          ...settings.bulkTransfer,
                          autoWelcomeImportedMembers: e.target.checked,
                        },
                      })
                    }
                  />
                  <div>
                    <span className="mrs-toggle-title">Welcome Messaging on Batch Import</span>
                    <span className="mrs-toggle-sub">
                      Enable queueing welcome greetings for newly imported members upon batch completion
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* ── Section 3: Expiry & Grace Periods ── */}
          <div className="mrs-card mrs-settings-section">
            <div className="mrs-card-head">
              <div>
                <h3 className="mrs-card-title">Membership Expiry & Grace Periods</h3>
                <p className="mrs-card-desc">Rules governing member renewal warnings and access lockout</p>
              </div>
            </div>

            <div className="mrs-form-grid">
              <div className="mrs-form-field">
                <label>Expiry Reminder Alert Threshold</label>
                <span className="mrs-field-desc">How many days prior to expiration to notify staff & member</span>
                <select
                  value={settings.expiryAlertDays}
                  onChange={(e) =>
                    setSettings({ ...settings, expiryAlertDays: Number(e.target.value) })
                  }
                  className="mrs-select"
                >
                  <option value={3}>3 Days Before Expiry</option>
                  <option value={5}>5 Days Before Expiry</option>
                  <option value={7}>7 Days Before Expiry (Recommended)</option>
                  <option value={14}>14 Days Before Expiry</option>
                </select>
              </div>

              <div className="mrs-form-field">
                <label>Check-in Grace Period</label>
                <span className="mrs-field-desc">Days a member may still enter the gym after their plan expires</span>
                <select
                  value={settings.gracePeriodDays}
                  onChange={(e) =>
                    setSettings({ ...settings, gracePeriodDays: Number(e.target.value) })
                  }
                  className="mrs-select"
                >
                  <option value={0}>0 Days (Strict: Lock immediately)</option>
                  <option value={3}>3 Days Grace Period</option>
                  <option value={5}>5 Days Grace Period</option>
                  <option value={7}>7 Days Grace Period</option>
                </select>
              </div>

              <div className="mrs-form-field">
                <label>Maximum Allowed Outstanding Balance (₹)</label>
                <span className="mrs-field-desc">Tolerance before member is flagged for pending dues at check-in</span>
                <input
                  type="number"
                  value={settings.maxOutstandingDuesPaise / 100}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxOutstandingDuesPaise: Math.max(0, Number(e.target.value)) * 100,
                    })
                  }
                  className="mrs-input"
                  placeholder="e.g. 1000"
                />
              </div>

              <div className="mrs-form-field">
                <label>Auto-archive Inactive Members</label>
                <span className="mrs-field-desc">Automatically move lapsed members from active roster to archive</span>
                <select
                  value={settings.autoArchiveMonths}
                  onChange={(e) =>
                    setSettings({ ...settings, autoArchiveMonths: Number(e.target.value) })
                  }
                  className="mrs-select"
                >
                  <option value={1}>After 1 Month</option>
                  <option value={3}>After 3 Months (Standard)</option>
                  <option value={6}>After 6 Months</option>
                  <option value={12}>After 1 Year</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 4: Attendance & Access Control Rules ── */}
          <div className="mrs-card mrs-settings-section">
            <div className="mrs-card-head">
              <div>
                <h3 className="mrs-card-title">Attendance & Check-in Settings</h3>
                <p className="mrs-card-desc">Configure valid check-in methods and verification behavior</p>
              </div>
            </div>

            <div className="mrs-toggles-list">
              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.allowedMethods.qr}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      allowedMethods: { ...settings.allowedMethods, qr: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Member QR Code Check-in</span>
                  <span className="mrs-toggle-sub">Allow members to scan gym QR code to verify attendance</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.allowedMethods.desk}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      allowedMethods: { ...settings.allowedMethods, desk: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Front Desk Manual Check-in</span>
                  <span className="mrs-toggle-sub">Allow receptionist/trainer to log member attendance at desk</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.allowedMethods.phone}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      allowedMethods: { ...settings.allowedMethods, phone: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Phone Number Lookup Check-in</span>
                  <span className="mrs-toggle-sub">Enable member check-in by entering the last 4 or 10 digits of phone</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.allowMultipleDailyCheckins}
                  onChange={(e) =>
                    setSettings({ ...settings, allowMultipleDailyCheckins: e.target.checked })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Allow Multiple Daily Check-ins</span>
                  <span className="mrs-toggle-sub">Permit members to check in more than once per calendar day</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.blockExpiredCheckins}
                  onChange={(e) =>
                    setSettings({ ...settings, blockExpiredCheckins: e.target.checked })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Enforce Active Plan Validity</span>
                  <span className="mrs-toggle-sub">Reject check-in and alert staff when a member's plan is expired</span>
                </div>
              </label>
            </div>
          </div>

          {/* ── Section 5: Onboarding Form Configuration ── */}
          <div className="mrs-card mrs-settings-section">
            <div className="mrs-card-head">
              <div>
                <h3 className="mrs-card-title">Member Onboarding Form Configuration</h3>
                <p className="mrs-card-desc">Control what sections are presented during member self-onboarding</p>
              </div>
            </div>

            <div className="mrs-toggles-list">
              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.onboarding.includeMedical}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      onboarding: { ...settings.onboarding, includeMedical: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Health, Injuries & Medical History</span>
                  <span className="mrs-toggle-sub">Collect doctor clearances, past injuries, and ongoing medications</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.onboarding.includeGoals}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      onboarding: { ...settings.onboarding, includeGoals: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Fitness Goals & Target Timelines</span>
                  <span className="mrs-toggle-sub">Collect member's target weight, training experience, and goal category</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.onboarding.includeDiet}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      onboarding: { ...settings.onboarding, includeDiet: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Dietary Habits & Lifestyle</span>
                  <span className="mrs-toggle-sub">Collect diet preferences, water intake, sleep patterns, and allergens</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.onboarding.requireEmergency}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      onboarding: { ...settings.onboarding, requireEmergency: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Require Emergency Contact Details</span>
                  <span className="mrs-toggle-sub">Mandate emergency contact name, relation, and phone number</span>
                </div>
              </label>
            </div>
          </div>

          {/* ── Section 6: Member Communications ── */}
          <div className="mrs-card mrs-settings-section">
            <div className="mrs-card-head">
              <div>
                <h3 className="mrs-card-title">Member Communications & WhatsApp Alerts</h3>
                <p className="mrs-card-desc">Automated message triggers and follow-up templates</p>
              </div>
            </div>

            <div className="mrs-toggles-list">
              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.notifications.autoRenewalWhatsapp}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, autoRenewalWhatsapp: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Upcoming Renewal Alerts</span>
                  <span className="mrs-toggle-sub">Prompt staff to send renewal reminders via WhatsApp</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.notifications.autoWelcomeWhatsapp}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, autoWelcomeWhatsapp: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Welcome Greeting for New Joins</span>
                  <span className="mrs-toggle-sub">Provide one-click WhatsApp welcome message on new member registration</span>
                </div>
              </label>

              <label className="mrs-toggle-item">
                <input
                  type="checkbox"
                  checked={settings.notifications.autoReceiptWhatsapp}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, autoReceiptWhatsapp: e.target.checked },
                    })
                  }
                />
                <div>
                  <span className="mrs-toggle-title">Payment Confirmation & Receipt</span>
                  <span className="mrs-toggle-sub">Generate WhatsApp invoice receipt link whenever payment is recorded</span>
                </div>
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Renewal Message Template
              </label>
              <textarea
                value={settings.notifications.renewalTemplate}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, renewalTemplate: e.target.value },
                  })
                }
                rows={3}
                className="mrs-textarea"
              />
              <span className="mrs-field-desc" style={{ marginTop: 4 }}>
                Available placeholders: <code>{"{member_name}"}</code>, <code>{"{plan_name}"}</code>, <code>{"{days_left}"}</code>, <code>{"{expiry_date}"}</code>, <code>{"{gym_name}"}</code>
              </span>
            </div>

            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                <Save size={15} />
                <span>{savingSettings ? "Saving Settings..." : "Save All Member Settings"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mount Import Members Sheet ── */}
      <ImportMembersSheet
        isOpen={importSheetOpen}
        orgId={orgId || ""}
        onClose={() => setImportSheetOpen(false)}
        onDone={(count) => {
          setImportSheetOpen(false);
          loadData();
          show(`Successfully imported ${count} member${count === 1 ? "" : "s"}!`);
        }}
        onError={(msg) => show(msg, "error")}
      />
    </div>
  );
}

export default function MemberReportsAndSettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading Member Reports & Settings...</div>}>
      <MemberReportsAndSettingsContent />
    </Suspense>
  );
}

/* ─── Styles ─── */
const CSS = `
.mrs {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 48px;
}
.mrs-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}
.mrs-head h1 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 4px 0 6px;
}
.mrs-head p {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0;
}
.mrs-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mrs-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.mrs-breadcrumb a {
  color: var(--text-secondary);
  text-decoration: none;
}
.mrs-breadcrumb a:hover {
  color: var(--text-primary);
}

/* Tabs & Segmented */
.mrs-tabs-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--mb-line, #e2e8f0);
  padding-bottom: 16px;
}
.mrs-segmented {
  display: inline-flex;
  background: var(--mb-soft, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}
.mrs-segmented-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.mrs-segmented-item.active {
  background: var(--surface, #ffffff);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.mrs-period-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mrs-period-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
}
.mrs-period-pill {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--mb-line, #e2e8f0);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.mrs-period-pill:hover {
  background: var(--mb-soft, #f1f5f9);
  color: var(--text-primary);
}
.mrs-period-pill.active {
  background: var(--accent-dim, rgba(10, 132, 255, 0.1));
  border-color: var(--accent, #0a84ff);
  color: var(--accent, #0a84ff);
  font-weight: 600;
}

/* Metric Cards */
.mrs-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.mrs-metric-card {
  background: var(--surface, #ffffff);
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.mrs-metric-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.mrs-metric-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}
.mrs-metric-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  text-transform: uppercase;
}
.mrs-metric-badge--blue { background: rgba(10, 132, 255, 0.12); color: #0a84ff; }
.mrs-metric-badge--green { background: rgba(52, 199, 89, 0.12); color: #28a745; }
.mrs-metric-badge--amber { background: rgba(255, 159, 10, 0.12); color: #d97706; }
.mrs-metric-badge--purple { background: rgba(175, 82, 222, 0.12); color: #af52de; }

.mrs-metric-main {
  margin-bottom: 8px;
}
.mrs-metric-val {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.mrs-metric-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.mrs-metric-foot {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: auto;
  border-top: 1px dashed var(--mb-line, #e2e8f0);
  padding-top: 8px;
}
.mrs-link-inline {
  color: var(--accent, #0a84ff);
  text-decoration: none;
  font-weight: 500;
}
.mrs-link-inline:hover {
  text-decoration: underline;
}

/* Grids & Cards */
.mrs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}
.mrs-card {
  background: var(--surface, #ffffff);
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}
.mrs-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.mrs-card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
}
.mrs-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}
.mrs-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--mb-soft, #f1f5f9);
  color: var(--text-secondary);
}
.mrs-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}
.mrs-badge--blue { background: rgba(10, 132, 255, 0.12); color: #0a84ff; }
.mrs-badge--amber { background: rgba(255, 159, 10, 0.12); color: #d97706; }
.mrs-badge--green { background: rgba(52, 199, 89, 0.12); color: #28a745; }

.mrs-chart-wrap {
  width: 100%;
}
.mrs-chart-flex {
  display: flex;
  align-items: center;
  justify-content: center;
}
.mrs-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 140px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
  padding: 16px;
}
.mrs-center-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  width: 100%;
}

/* Plan toolbar */
.mrs-plan-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.mrs-seg {
  display: inline-flex;
  background: var(--mb-soft, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  gap: 2px;
}
.mrs-seg button {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.mrs-seg button.active {
  background: var(--surface, #ffffff);
  color: var(--text-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

.mrs-search-box {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.mrs-search-icon {
  position: absolute;
  left: 9px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.mrs-search-input {
  padding: 6px 10px 6px 28px;
  font-size: 12px;
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: var(--text-primary);
  outline: none;
  width: 180px;
}
.mrs-search-input:focus {
  border-color: var(--accent, #0a84ff);
}

.mrs-info-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Bulk Transfer Cards */
.mrs-transfer-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin-top: 8px;
}
.mrs-transfer-card {
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 10px;
  padding: 18px;
  background: var(--mb-soft, #f8fafc);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.mrs-transfer-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}
.mrs-transfer-card-header h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 2px;
}
.mrs-transfer-card-header p {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.35;
}
.mrs-transfer-icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mrs-transfer-icon-wrap--import {
  background: rgba(10, 132, 255, 0.12);
  color: var(--accent, #0a84ff);
}
.mrs-transfer-icon-wrap--export {
  background: rgba(52, 199, 89, 0.12);
  color: #16a34a;
}
.mrs-transfer-feature-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.mrs-transfer-feature-list > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mrs-transfer-card-footer {
  margin-top: 18px;
}

/* Tables */
.mrs-table-wrap {
  overflow-x: auto;
  margin: 0 -20px -20px;
}
.mrs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.mrs-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--mb-line, #e2e8f0);
  background: var(--mb-soft, #f8fafc);
}
.mrs-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--mb-line, #e2e8f0);
  color: var(--text-primary);
  vertical-align: middle;
}
.mrs-table tr:last-child td {
  border-bottom: none;
}
.mrs-user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mrs-user-name {
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: none;
  display: block;
}
.mrs-user-name:hover {
  color: var(--accent, #0a84ff);
}
.mrs-user-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  display: block;
}

.mrs-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
}
.mrs-tag--red { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
.mrs-tag--amber { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.mrs-tag--green { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.mrs-tag--gray { background: rgba(100, 116, 139, 0.12); color: #64748b; }

.mrs-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--mb-soft, #f1f5f9);
  color: #16a34a;
  text-decoration: none;
  transition: all 0.15s ease;
}
.mrs-btn-icon:hover {
  background: #16a34a;
  color: #fff;
}

.mrs-rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  background: var(--mb-soft, #f1f5f9);
  color: var(--text-secondary);
}
.mrs-rank-badge--1 { background: #fef3c7; color: #b45309; }
.mrs-rank-badge--2 { background: #e2e8f0; color: #475569; }
.mrs-rank-badge--3 { background: #fed7aa; color: #c2410c; }

/* Settings Form Styles */
.mrs-settings-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.mrs-settings-section {
  padding: 24px;
}
.mrs-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}
.mrs-form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mrs-form-field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.mrs-field-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.mrs-select, .mrs-input, .mrs-textarea {
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 8px;
  background: var(--surface, #fff);
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}
.mrs-select:focus, .mrs-input:focus, .mrs-textarea:focus {
  border-color: var(--accent, #0a84ff);
}
.mrs-toggles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mrs-toggle-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--mb-soft, #f8fafc);
  border: 1px solid var(--mb-line, #e2e8f0);
  cursor: pointer;
}
.mrs-toggle-item input[type="checkbox"] {
  margin-top: 3px;
  cursor: pointer;
}
.mrs-toggle-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.mrs-toggle-sub {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 1px;
}
`;
