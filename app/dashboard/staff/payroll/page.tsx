"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight, Calendar, Wallet, CheckCircle2, Clock,
  Download, Search, Filter, ArrowUpRight, IndianRupee,
  FileText, Check, AlertCircle, Edit2, SlidersHorizontal, Users, Plus
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRole, type StaffRole } from "../../components/useRole";
import { Avatar, Skeleton, formatINR, useToast } from "../../components/ui";
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

type PayrollEntry = {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  month: string; // e.g. "2026-11"
  baseSalary: number; // in rupees
  sessionsCount: number;
  commissionPerSession: number; // in rupees
  incentives: number; // in rupees
  deductions: number; // in rupees
  netPay: number; // in rupees
  status: "paid" | "pending";
  paidAt?: string;
  paymentMethod?: string;
};

export default function StaffPayrollPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit salary sheet state
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [editBase, setEditBase] = useState(0);
  const [editSessions, setEditSessions] = useState(0);
  const [editCommission, setEditCommission] = useState(0);
  const [editIncentives, setEditIncentives] = useState(0);
  const [editDeductions, setEditDeductions] = useState(0);

  // Payslip view modal
  const [payslipEntry, setPayslipEntry] = useState<PayrollEntry | null>(null);

  const loadData = useCallback(async () => {
    if (!roleData.org_id) return;
    setLoading(true);

    try {
      // 1. Fetch real gym staff from Supabase
      const [staffRes, classesRes] = await Promise.all([
        supabase
          .from("staff")
          .select("id, name, role, phone, email, is_active")
          .eq("org_id", roleData.org_id)
          .order("name"),
        supabase
          .from("classes")
          .select("id, trainer_id, trainer_name")
          .eq("org_id", roleData.org_id)
          .eq("is_active", true),
      ]);

      if (staffRes.error) throw staffRes.error;
      const staff: StaffMember[] = staffRes.data || [];
      const classes = classesRes.data || [];

      setStaffList(staff);

      // Count actual classes/sessions conducted by staff in the DB
      const sessionsCountMap = new Map<string, number>();
      classes.forEach((c) => {
        if (c.trainer_id) {
          sessionsCountMap.set(c.trainer_id, (sessionsCountMap.get(c.trainer_id) || 0) + 1);
        }
        if (c.trainer_name) {
          const match = staff.find((s) => s.name.toLowerCase() === c.trainer_name?.toLowerCase());
          if (match && !sessionsCountMap.has(match.id)) {
            sessionsCountMap.set(match.id, (sessionsCountMap.get(match.id) || 0) + 1);
          }
        }
      });

      // Load saved payroll entries/config for this org & month
      const storageKey = `psync_staff_payroll_${roleData.org_id}_${selectedMonth}`;
      const saved = localStorage.getItem(storageKey);
      let savedMap = new Map<string, PayrollEntry>();

      if (saved) {
        try {
          const parsed: PayrollEntry[] = JSON.parse(saved);
          parsed.forEach((e) => savedMap.set(e.staffId, e));
        } catch {
          savedMap.clear();
        }
      }

      // Map each real staff member without any fake salaries
      const entries: PayrollEntry[] = staff.map((s) => {
        const existing = savedMap.get(s.id);
        const actualSessions = sessionsCountMap.get(s.id) || 0;

        if (existing) {
          return {
            ...existing,
            staffName: s.name,
            role: s.role,
            sessionsCount: existing.sessionsCount || actualSessions,
          };
        }

        const base = 0; // Starts at 0 until gym owner configures it
        const commission = s.role === "trainer" ? 250 : 0;
        const commTotal = actualSessions * commission;
        const net = base + commTotal;

        return {
          id: `pay_${s.id}_${selectedMonth}`,
          staffId: s.id,
          staffName: s.name,
          role: s.role,
          month: selectedMonth,
          baseSalary: base,
          sessionsCount: actualSessions,
          commissionPerSession: commission,
          incentives: 0,
          deductions: 0,
          netPay: net,
          status: "pending",
        };
      });

      setPayrollEntries(entries);
    } catch (err: any) {
      console.error("Staff payroll load error:", err);
      show("Failed to load staff payroll", "error");
    } finally {
      setLoading(false);
    }
  }, [roleData.org_id, selectedMonth, show]);

  useEffect(() => {
    if (!roleData.loading) {
      loadData();
    }
  }, [roleData.loading, selectedMonth, loadData]);

  const saveEntries = (updated: PayrollEntry[]) => {
    setPayrollEntries(updated);
    if (roleData.org_id) {
      localStorage.setItem(`psync_staff_payroll_${roleData.org_id}_${selectedMonth}`, JSON.stringify(updated));
    }
  };

  const handleMarkPaid = (entry: PayrollEntry) => {
    const updated = payrollEntries.map((e) => {
      if (e.id === entry.id) {
        return {
          ...e,
          status: "paid" as const,
          paidAt: new Date().toISOString().split("T")[0],
          paymentMethod: "Bank Transfer",
        };
      }
      return e;
    });
    saveEntries(updated);
    show(`Marked ${entry.staffName}'s salary (₹${entry.netPay.toLocaleString()}) as Paid`, "success");
  };

  const openEditSheet = (entry: PayrollEntry) => {
    setEditingEntry(entry);
    setEditBase(entry.baseSalary);
    setEditSessions(entry.sessionsCount);
    setEditCommission(entry.commissionPerSession);
    setEditIncentives(entry.incentives);
    setEditDeductions(entry.deductions);
  };

  const saveSalaryEdit = () => {
    if (!editingEntry) return;
    const commTotal = editSessions * editCommission;
    const net = Math.max(0, editBase + commTotal + editIncentives - editDeductions);

    const updated = payrollEntries.map((e) => {
      if (e.id === editingEntry.id) {
        return {
          ...e,
          baseSalary: editBase,
          sessionsCount: editSessions,
          commissionPerSession: editCommission,
          incentives: editIncentives,
          deductions: editDeductions,
          netPay: net,
        };
      }
      return e;
    });

    saveEntries(updated);
    show(`Saved salary structure for ${editingEntry.staffName}`, "success");
    setEditingEntry(null);
  };

  // Export CSV
  const handleExport = () => {
    const headers = [
      "Staff Name", "Role", "Month", "Base Salary", "Sessions", "Commission", "Incentives", "Deductions", "Net Pay", "Status", "Paid Date"
    ];
    const rows = payrollEntries.map((r) => [
      `"${r.staffName}"`,
      `"${r.role}"`,
      `"${r.month}"`,
      r.baseSalary,
      r.sessionsCount,
      r.sessionsCount * r.commissionPerSession,
      r.incentives,
      r.deductions,
      r.netPay,
      `"${r.status}"`,
      `"${r.paidAt || "--"}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Staff_Payroll_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Payroll report exported to CSV", "success");
  };

  // True DB totals
  const totalPayroll = useMemo(() => payrollEntries.reduce((s, e) => s + e.netPay, 0), [payrollEntries]);
  const totalPaid = useMemo(() => payrollEntries.filter((e) => e.status === "paid").reduce((s, e) => s + e.netPay, 0), [payrollEntries]);
  const totalPending = useMemo(() => payrollEntries.filter((e) => e.status !== "paid").reduce((s, e) => s + e.netPay, 0), [payrollEntries]);
  const totalCommissions = useMemo(() => payrollEntries.reduce((s, e) => s + (e.sessionsCount * e.commissionPerSession), 0), [payrollEntries]);

  const filteredEntries = useMemo(() => {
    return payrollEntries.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.staffName.toLowerCase().includes(q) && !e.role.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [payrollEntries, statusFilter, search]);

  return (
    <div className="ps-page sp-page">
      <DesignStyles />
      <style>{SP_CSS}</style>

      {/* Header */}
      <header className="sp-head">
        <div>
          <div className="sp-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/staff">Staff</Link>
            <ChevronRight size={13} />
            <span>Payroll</span>
          </div>
          <h1>Staff Payroll</h1>
          <p>Manage monthly base salaries, class commissions, deductions, and payouts for your team.</p>
        </div>

        <div className="sp-head-actions">
          <label className="sp-month-picker">
            <Calendar size={15} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ps-btn ps-btn--secondary ps-btn--sm"
            onClick={handleExport}
            disabled={payrollEntries.length === 0}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* KPI Cards (True calculated values) */}
      <div className="sp-kpis">
        <div className="sp-kpi">
          <div className="sp-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
            <Wallet size={18} />
          </div>
          <div>
            <div className="sp-kpi-label">Total Payroll</div>
            <div className="sp-kpi-val">₹{totalPayroll.toLocaleString()}</div>
          </div>
        </div>
        <div className="sp-kpi">
          <div className="sp-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="sp-kpi-label">Disbursed / Paid</div>
            <div className="sp-kpi-val">₹{totalPaid.toLocaleString()}</div>
          </div>
        </div>
        <div className="sp-kpi">
          <div className="sp-kpi-icon" style={{ background: "#fff1de", color: "#b45309" }}>
            <Clock size={18} />
          </div>
          <div>
            <div className="sp-kpi-label">Pending Payout</div>
            <div className="sp-kpi-val">₹{totalPending.toLocaleString()}</div>
          </div>
        </div>
        <div className="sp-kpi">
          <div className="sp-kpi-icon" style={{ background: "#f3e8ff", color: "#7e22ce" }}>
            <IndianRupee size={18} />
          </div>
          <div>
            <div className="sp-kpi-label">Total Commissions</div>
            <div className="sp-kpi-val">₹{totalCommissions.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sp-toolbar">
        <div className="sp-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search staff by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sp-filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="sp-card">
        <div className="sp-table-head">
          <div>Staff Member</div>
          <div>Base Salary</div>
          <div>Sessions & Comm.</div>
          <div>Deductions</div>
          <div>Net Payable</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            <Skeleton height={46} count={4} />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="sp-empty">
            <Wallet size={36} strokeWidth={1.5} color="var(--text-tertiary)" />
            <p>
              {staffList.length === 0
                ? "No staff members registered in database yet."
                : "No matching payroll entries for this filter."}
            </p>
            {staffList.length === 0 && (
              <Link href="/dashboard/staff" className="ps-btn ps-btn--primary ps-btn--sm" style={{ marginTop: 10 }}>
                <Plus size={14} /> Add Staff in Directory
              </Link>
            )}
          </div>
        ) : (
          filteredEntries.map((e) => (
            <div key={e.id} className="sp-row">
              <div className="sp-who">
                <Avatar name={e.staffName} size={36} />
                <div>
                  <div className="sp-name">{e.staffName}</div>
                  <div className="sp-role-badge">{e.role.replace(/_/g, " ")}</div>
                </div>
              </div>

              <div className="sp-amount">
                {e.baseSalary > 0 ? `₹${e.baseSalary.toLocaleString()}` : (
                  <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Not set</span>
                )}
              </div>

              <div className="sp-comm">
                {e.sessionsCount > 0 ? (
                  <>
                    <span className="sp-comm-val">
                      +₹{(e.sessionsCount * e.commissionPerSession).toLocaleString()}
                    </span>
                    <span className="sp-comm-sub">
                      ({e.sessionsCount} sessions @ ₹{e.commissionPerSession})
                    </span>
                  </>
                ) : (
                  <span className="sp-empty-text">0 sessions</span>
                )}
              </div>

              <div className="sp-deduct">
                {e.deductions > 0 ? `-₹${e.deductions.toLocaleString()}` : "₹0"}
              </div>

              <div className="sp-net">₹{e.netPay.toLocaleString()}</div>

              <div>
                {e.status === "paid" ? (
                  <span className="sp-badge sp-badge--paid">
                    <CheckCircle2 size={12} /> Paid
                  </span>
                ) : (
                  <span className="sp-badge sp-badge--pending">
                    <Clock size={12} /> Pending
                  </span>
                )}
              </div>

              <div className="sp-actions">
                {e.status !== "paid" ? (
                  <button
                    type="button"
                    className="ps-btn ps-btn--sm ps-btn--primary"
                    onClick={() => handleMarkPaid(e)}
                  >
                    <Check size={13} />
                    <span>Pay</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sp-slip-btn"
                    onClick={() => setPayslipEntry(e)}
                  >
                    <FileText size={13} />
                    <span>Slip</span>
                  </button>
                )}

                <button
                  type="button"
                  className="sp-icon-btn"
                  onClick={() => openEditSheet(e)}
                  title="Configure base salary & commissions"
                >
                  <Edit2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Salary Modal */}
      {editingEntry && (
        <div className="sp-modal-backdrop" onClick={() => setEditingEntry(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sp-modal-title">Configure Salary Details</div>
            <p className="sp-modal-sub">
              Set monthly base pay and commissions for <strong>{editingEntry.staffName}</strong> ({selectedMonth}).
            </p>

            <div className="sp-form-grid">
              <div>
                <label>Base Monthly Salary (₹)</label>
                <input
                  type="number"
                  className="ps-input"
                  value={editBase}
                  onChange={(e) => setEditBase(Number(e.target.value))}
                  placeholder="e.g. 25000"
                />
              </div>

              <div>
                <label>Sessions Conducted</label>
                <input
                  type="number"
                  className="ps-input"
                  value={editSessions}
                  onChange={(e) => setEditSessions(Number(e.target.value))}
                />
              </div>

              <div>
                <label>Commission Per Session (₹)</label>
                <input
                  type="number"
                  className="ps-input"
                  value={editCommission}
                  onChange={(e) => setEditCommission(Number(e.target.value))}
                  placeholder="e.g. 350"
                />
              </div>

              <div>
                <label>Incentives / Bonus (₹)</label>
                <input
                  type="number"
                  className="ps-input"
                  value={editIncentives}
                  onChange={(e) => setEditIncentives(Number(e.target.value))}
                />
              </div>

              <div style={{ gridColumn: "span 2" }}>
                <label>Deductions / Advances (₹)</label>
                <input
                  type="number"
                  className="ps-input"
                  value={editDeductions}
                  onChange={(e) => setEditDeductions(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="sp-modal-calc">
              <span>Estimated Net Payable:</span>
              <strong>
                ₹{Math.max(0, editBase + (editSessions * editCommission) + editIncentives - editDeductions).toLocaleString()}
              </strong>
            </div>

            <div className="sp-modal-actions">
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setEditingEntry(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={saveSalaryEdit}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {payslipEntry && (
        <div className="sp-modal-backdrop" onClick={() => setPayslipEntry(null)}>
          <div className="sp-payslip-card" onClick={(e) => e.stopPropagation()}>
            <div className="sp-payslip-head">
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>PSYNC SALARY SLIP</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Month: {payslipEntry.month}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="sp-badge sp-badge--paid">DISBURSED</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Date: {payslipEntry.paidAt || "Paid"}
                </div>
              </div>
            </div>

            <div className="sp-payslip-emp">
              <div><strong>Employee:</strong> {payslipEntry.staffName}</div>
              <div><strong>Designation:</strong> {payslipEntry.role.replace(/_/g, " ")}</div>
              <div><strong>Payment Mode:</strong> {payslipEntry.paymentMethod || "Bank Transfer"}</div>
            </div>

            <table className="sp-payslip-table">
              <thead>
                <tr>
                  <th>Earnings</th>
                  <th>Amount</th>
                  <th>Deductions</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Basic Salary</td>
                  <td>₹{payslipEntry.baseSalary.toLocaleString()}</td>
                  <td>Deductions</td>
                  <td>₹{payslipEntry.deductions.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>PT Sessions ({payslipEntry.sessionsCount})</td>
                  <td>₹{(payslipEntry.sessionsCount * payslipEntry.commissionPerSession).toLocaleString()}</td>
                  <td>Advances</td>
                  <td>₹0</td>
                </tr>
                {payslipEntry.incentives > 0 && (
                  <tr>
                    <td>Performance Incentive</td>
                    <td>₹{payslipEntry.incentives.toLocaleString()}</td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total Gross</th>
                  <th>
                    ₹{(payslipEntry.baseSalary + (payslipEntry.sessionsCount * payslipEntry.commissionPerSession) + payslipEntry.incentives).toLocaleString()}
                  </th>
                  <th>Total Deductions</th>
                  <th>₹{payslipEntry.deductions.toLocaleString()}</th>
                </tr>
              </tfoot>
            </table>

            <div className="sp-payslip-net">
              <span>Net Pay:</span>
              <strong>₹{payslipEntry.netPay.toLocaleString()}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="ps-btn ps-btn--secondary ps-btn--sm"
                onClick={() => setPayslipEntry(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary ps-btn--sm"
                onClick={() => {
                  window.print();
                }}
              >
                Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SP_CSS = `
.sp-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.sp-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.sp-breadcrumb a { color: inherit; text-decoration: none; }
.sp-breadcrumb a:hover { color: var(--text-primary); }
.sp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.sp-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.sp-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.sp-head-actions { display: flex; align-items: center; gap: 10px; }

.sp-month-picker { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.sp-month-picker input { border: none; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: inherit; outline: none; cursor: pointer; }

.sp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.sp-kpi { display: flex; align-items: center; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.sp-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.sp-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.sp-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }

.sp-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.sp-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 240px; height: 40px; padding: 0 14px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 12px; }
.sp-search input { border: none; background: transparent; width: 100%; outline: none; font-size: 13.5px; }
.sp-filters select { height: 40px; padding: 0 14px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 12px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; cursor: pointer; }

.sp-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; overflow: hidden; }
.sp-table-head { display: grid; grid-template-columns: minmax(220px, 1.8fr) 130px 170px 120px 140px 110px 150px; align-items: center; gap: 14px; padding: 12px 18px; background: #f8fafc; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); border-bottom: 1px solid var(--separator, #e5e7eb); }
.sp-row { display: grid; grid-template-columns: minmax(220px, 1.8fr) 130px 170px 120px 140px 110px 150px; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--separator, #f1f5f9); font-size: 13.5px; }
.sp-row:last-child { border-bottom: none; }
.sp-row:hover { background: #fafbfc; }

.sp-who { display: flex; align-items: center; gap: 12px; }
.sp-name { font-weight: 650; color: var(--text-primary); }
.sp-role-badge { display: inline-block; font-size: 11px; font-weight: 600; text-transform: capitalize; color: var(--text-tertiary); }

.sp-amount { font-weight: 600; color: var(--text-secondary); }
.sp-comm { display: flex; flex-direction: column; }
.sp-comm-val { font-weight: 650; color: #166534; font-size: 13px; }
.sp-comm-sub { font-size: 11px; color: var(--text-tertiary); }
.sp-deduct { color: #dc2626; font-weight: 600; }
.sp-net { font-weight: 750; color: var(--text-primary); font-size: 14.5px; }

.sp-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; }
.sp-badge--paid { background: #e8f5e9; color: #2e7d32; }
.sp-badge--pending { background: #fff8e1; color: #b45309; }

.sp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.sp-slip-btn { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border: 1px solid var(--separator, #e5e7eb); border-radius: 8px; background: #fff; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.sp-slip-btn:hover { background: #f8fafc; color: var(--text-primary); }
.sp-icon-btn { width: 30px; height: 30px; border: 1px solid var(--separator, #e5e7eb); border-radius: 8px; background: #fff; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; }
.sp-icon-btn:hover { color: var(--text-primary); background: #f8fafc; }

.sp-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px 20px; color: var(--text-tertiary); }

.sp-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 100; backdrop-filter: blur(4px); }
.sp-modal { background: #fff; width: 90%; max-width: 500px; border-radius: 20px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
.sp-modal-title { font-size: 18px; font-weight: 750; margin-bottom: 4px; }
.sp-modal-sub { font-size: 13px; color: var(--text-tertiary); margin: 0 0 16px; }
.sp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.sp-form-grid label { font-size: 12px; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px; }
.sp-modal-calc { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding: 12px 16px; background: #f8fafc; border-radius: 12px; font-size: 13.5px; }
.sp-modal-calc strong { font-size: 16px; color: #166534; }
.sp-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

.sp-payslip-card { background: #fff; width: 92%; max-width: 600px; border-radius: 20px; padding: 28px; box-shadow: 0 24px 48px rgba(0,0,0,0.2); }
.sp-payslip-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 1.5px dashed var(--separator, #e5e7eb); margin-bottom: 18px; }
.sp-payslip-emp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-bottom: 20px; }
.sp-payslip-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
.sp-payslip-table th, .sp-payslip-table td { padding: 8px 10px; text-align: left; border: 1px solid #e2e8f0; }
.sp-payslip-table th { background: #f8fafc; font-size: 12px; font-weight: 700; }
.sp-payslip-net { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: #e8f5e9; border-radius: 12px; font-size: 15px; font-weight: 700; color: #166534; }
.sp-payslip-net strong { font-size: 20px; }

@media (max-width: 1000px) {
  .sp-table-head, .sp-row { grid-template-columns: 1fr auto; }
  .sp-table-head > :not(:first-child):not(:last-child),
  .sp-row > :not(:first-child):not(:last-child) { display: none; }
}
`;
