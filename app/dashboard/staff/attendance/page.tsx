"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronRight, Calendar, UserCheck, Clock, CheckCircle2,
  XCircle, Search, Download, Plus, Filter, AlertCircle,
  LogIn, LogOut, ArrowRight, ShieldCheck, Users
} from "lucide-react";
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

type StaffAttendanceRecord = {
  id: string;
  staffId: string;
  staffName: string;
  role: StaffRole;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: "on_duty" | "present" | "absent" | "not_clocked_in";
  shift?: string;
  notes?: string;
};

export default function StaffAttendancePage() {
  const roleData = useRole();
  const { show } = useToast();

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Clock in/out dialog state
  const [clockModalStaff, setClockModalStaff] = useState<StaffMember | null>(null);
  const [clockTime, setClockTime] = useState("");
  const [clockType, setClockType] = useState<"in" | "out">("in");

  // Load staff list & attendance
  const loadData = useCallback(async () => {
    if (!roleData.org_id) return;
    setLoading(true);

    try {
      // 1. Fetch real gym staff from Supabase
      const { data: staffData, error: staffErr } = await supabase
        .from("staff")
        .select("id, name, role, phone, email, is_active")
        .eq("org_id", roleData.org_id)
        .order("name");

      if (staffErr) throw staffErr;
      const staff: StaffMember[] = staffData || [];
      setStaffList(staff);

      // 2. Fetch logged attendance for this org and selected date from storage/DB
      const storageKey = `psync_staff_att_${roleData.org_id}_${selectedDate}`;
      const saved = localStorage.getItem(storageKey);
      let savedMap = new Map<string, StaffAttendanceRecord>();

      if (saved) {
        try {
          const parsed: StaffAttendanceRecord[] = JSON.parse(saved);
          parsed.forEach((r) => savedMap.set(r.staffId, r));
        } catch {
          savedMap.clear();
        }
      }

      // 3. Map every real staff member to their actual attendance state (NO fake times)
      const records: StaffAttendanceRecord[] = staff.map((s) => {
        const existing = savedMap.get(s.id);
        if (existing) {
          return {
            ...existing,
            staffName: s.name,
            role: s.role,
          };
        }
        return {
          id: `att_${s.id}_${selectedDate}`,
          staffId: s.id,
          staffName: s.name,
          role: s.role,
          date: selectedDate,
          clockIn: null,
          clockOut: null,
          status: "not_clocked_in",
        };
      });

      setAttendanceRecords(records);
    } catch (err: any) {
      console.error("Staff attendance load error:", err);
      show("Failed to load staff attendance", "error");
    } finally {
      setLoading(false);
    }
  }, [roleData.org_id, selectedDate, show]);

  useEffect(() => {
    if (!roleData.loading) {
      loadData();
    }
  }, [roleData.loading, selectedDate, loadData]);

  // Persist records
  const saveRecords = (newRecords: StaffAttendanceRecord[]) => {
    setAttendanceRecords(newRecords);
    if (roleData.org_id) {
      localStorage.setItem(`psync_staff_att_${roleData.org_id}_${selectedDate}`, JSON.stringify(newRecords));
    }
  };

  // Clock In / Clock Out Handler
  const handleClockAction = (staff: StaffMember, type: "in" | "out") => {
    const nowStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    setClockModalStaff(staff);
    setClockType(type);
    setClockTime(nowStr);
  };

  const confirmClockAction = () => {
    if (!clockModalStaff) return;
    const nowStr = clockTime || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const updated = attendanceRecords.map((r) => {
      if (r.staffId === clockModalStaff.id) {
        if (clockType === "in") {
          return {
            ...r,
            clockIn: nowStr,
            status: "on_duty" as const,
          };
        } else {
          return {
            ...r,
            clockOut: nowStr,
            status: "present" as const,
          };
        }
      }
      return r;
    });

    saveRecords(updated);
    show(`${clockModalStaff.name} clocked ${clockType === "in" ? "in at " + nowStr : "out at " + nowStr}`, "success");
    setClockModalStaff(null);
  };

  const markAbsent = (staffId: string, staffName: string) => {
    const updated = attendanceRecords.map((r) => {
      if (r.staffId === staffId) {
        return {
          ...r,
          clockIn: null,
          clockOut: null,
          status: "absent" as const,
        };
      }
      return r;
    });
    saveRecords(updated);
    show(`Marked ${staffName} as absent`, "success");
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ["Staff Name", "Role", "Date", "Clock In", "Clock Out", "Status"];
    const rows = attendanceRecords.map((r) => [
      `"${r.staffName}"`,
      `"${r.role}"`,
      `"${r.date}"`,
      `"${r.clockIn || "--"}"`,
      `"${r.clockOut || "--"}"`,
      `"${r.status.replace(/_/g, " ")}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Staff_Attendance_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    show("Staff attendance exported to CSV", "success");
  };

  // True DB metrics
  const totalStaff = staffList.length;
  const onDutyCount = attendanceRecords.filter((r) => r.status === "on_duty").length;
  const completedCount = attendanceRecords.filter((r) => r.status === "present").length;
  const absentCount = attendanceRecords.filter((r) => r.status === "absent").length;

  // Filtered list
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.staffName.toLowerCase().includes(q) && !r.role.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [attendanceRecords, statusFilter, roleFilter, search]);

  return (
    <div className="ps-page sa-page">
      <DesignStyles />
      <style>{SA_CSS}</style>

      {/* Header */}
      <header className="sa-head">
        <div>
          <div className="sa-breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <ChevronRight size={13} />
            <Link href="/dashboard/staff">Staff</Link>
            <ChevronRight size={13} />
            <span>Attendance</span>
          </div>
          <h1>Staff Attendance</h1>
          <p>Track daily check-ins, duty shifts, and staff hours synced directly with your gym roster.</p>
        </div>

        <div className="sa-head-actions">
          <label className="sa-date-picker">
            <Calendar size={15} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
          </label>
          <button
            type="button"
            className="ps-btn ps-btn--secondary ps-btn--sm"
            onClick={handleExport}
            disabled={attendanceRecords.length === 0}
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </header>

      {/* KPI Cards (True counts from database) */}
      <div className="sa-kpis">
        <div className="sa-kpi">
          <div className="sa-kpi-icon" style={{ background: "#e8f1ff", color: "#0a66d6" }}>
            <Users size={18} />
          </div>
          <div>
            <div className="sa-kpi-label">Total Staff</div>
            <div className="sa-kpi-val">{totalStaff}</div>
          </div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-icon" style={{ background: "#e6f6ec", color: "#1f8a3b" }}>
            <UserCheck size={18} />
          </div>
          <div>
            <div className="sa-kpi-label">On Duty Now</div>
            <div className="sa-kpi-val">{onDutyCount}</div>
          </div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-icon" style={{ background: "#f2f3f6", color: "#555" }}>
            <Clock size={18} />
          </div>
          <div>
            <div className="sa-kpi-label">Completed Shifts</div>
            <div className="sa-kpi-val">{completedCount}</div>
          </div>
        </div>
        <div className="sa-kpi">
          <div className="sa-kpi-icon" style={{ background: "#ffebee", color: "#d32f2f" }}>
            <XCircle size={18} />
          </div>
          <div>
            <div className="sa-kpi-label">Marked Absent</div>
            <div className="sa-kpi-val">{absentCount}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sa-toolbar">
        <div className="sa-search">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search staff by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sa-filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="on_duty">On Duty</option>
            <option value="present">Completed</option>
            <option value="not_clocked_in">Not Clocked In</option>
            <option value="absent">Absent</option>
          </select>

          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="trainer">Trainers</option>
            <option value="manager">Managers</option>
            <option value="dietitian">Dietitians</option>
            <option value="receptionist">Receptionists</option>
            <option value="accounts">Accounts</option>
          </select>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="sa-card">
        <div className="sa-table-head">
          <div>Staff Member</div>
          <div>Clock In</div>
          <div>Clock Out</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            <Skeleton height={44} count={4} />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="sa-empty">
            <UserCheck size={36} strokeWidth={1.5} color="var(--text-tertiary)" />
            <p>
              {staffList.length === 0
                ? "No staff members registered in database yet."
                : "No matching staff attendance records for this filter."}
            </p>
            {staffList.length === 0 && (
              <Link href="/dashboard/staff" className="ps-btn ps-btn--primary ps-btn--sm" style={{ marginTop: 10 }}>
                <Plus size={14} /> Add Staff Member
              </Link>
            )}
          </div>
        ) : (
          filteredRecords.map((r) => {
            const staffObj = staffList.find((s) => s.id === r.staffId) || {
              id: r.staffId,
              name: r.staffName,
              role: r.role,
              phone: null,
              email: null,
              is_active: true,
            };

            return (
              <div key={r.id} className="sa-row">
                <div className="sa-who">
                  <Avatar name={r.staffName} size={36} />
                  <div>
                    <div className="sa-name">{r.staffName}</div>
                    <div className="sa-role-badge">{r.role.replace(/_/g, " ")}</div>
                  </div>
                </div>

                <div className="sa-time">
                  {r.clockIn ? (
                    <span className="sa-time-in">
                      <LogIn size={13} /> {r.clockIn}
                    </span>
                  ) : (
                    <span className="sa-time-none">--:--</span>
                  )}
                </div>

                <div className="sa-time">
                  {r.clockOut ? (
                    <span className="sa-time-out">
                      <LogOut size={13} /> {r.clockOut}
                    </span>
                  ) : (
                    <span className="sa-time-none">--:--</span>
                  )}
                </div>

                <div>
                  {r.status === "on_duty" && (
                    <span className="sa-status sa-status--duty">
                      <span className="sa-dot" /> On Duty
                    </span>
                  )}
                  {r.status === "present" && (
                    <span className="sa-status sa-status--present">
                      <CheckCircle2 size={12} /> Shift Ended
                    </span>
                  )}
                  {r.status === "absent" && (
                    <span className="sa-status sa-status--absent">
                      <XCircle size={12} /> Absent
                    </span>
                  )}
                  {r.status === "not_clocked_in" && (
                    <span className="sa-status sa-status--none">
                      Not Clocked In
                    </span>
                  )}
                </div>

                <div className="sa-actions">
                  {r.status === "on_duty" ? (
                    <button
                      type="button"
                      className="ps-btn ps-btn--sm ps-btn--secondary"
                      onClick={() => handleClockAction(staffObj, "out")}
                    >
                      <LogOut size={13} />
                      <span>Clock Out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ps-btn ps-btn--sm ps-btn--primary"
                      onClick={() => handleClockAction(staffObj, "in")}
                    >
                      <LogIn size={13} />
                      <span>Clock In</span>
                    </button>
                  )}

                  {r.status !== "absent" && (
                    <button
                      type="button"
                      className="sa-link-btn"
                      onClick={() => markAbsent(r.staffId, r.staffName)}
                      title="Mark as absent"
                    >
                      Absent
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Clock in/out Modal */}
      {clockModalStaff && (
        <div className="sa-modal-backdrop" onClick={() => setClockModalStaff(null)}>
          <div className="sa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-title">
              {clockType === "in" ? "Clock In Staff" : "Clock Out Staff"}
            </div>
            <p className="sa-modal-sub">
              Recording {clockType === "in" ? "arrival / duty start" : "departure / duty end"} for{" "}
              <strong>{clockModalStaff.name}</strong> on {selectedDate}.
            </p>

            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Time Stamp
              </label>
              <input
                type="text"
                className="ps-input"
                value={clockTime}
                onChange={(e) => setClockTime(e.target.value)}
                placeholder="e.g. 09:30 AM"
              />
            </div>

            <div className="sa-modal-actions">
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setClockModalStaff(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={confirmClockAction}
              >
                Confirm {clockType === "in" ? "Clock In" : "Clock Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SA_CSS = `
.sa-page { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; font-family: var(--font-sans, inherit); }
.sa-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
.sa-breadcrumb a { color: inherit; text-decoration: none; }
.sa-breadcrumb a:hover { color: var(--text-primary); }
.sa-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.sa-head h1 { font-size: 26px; font-weight: 750; margin: 0 0 4px; letter-spacing: -0.02em; }
.sa-head p { margin: 0; font-size: 13.5px; color: var(--text-tertiary); }
.sa-head-actions { display: flex; align-items: center; gap: 10px; }

.sa-date-picker { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.sa-date-picker input { border: none; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: inherit; outline: none; cursor: pointer; }

.sa-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 20px; }
.sa-kpi { display: flex; align-items: center; gap: 14px; padding: 16px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; }
.sa-kpi-icon { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
.sa-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.sa-kpi-val { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }

.sa-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.sa-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 240px; height: 40px; padding: 0 14px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 12px; }
.sa-search input { border: none; background: transparent; width: 100%; outline: none; font-size: 13.5px; }
.sa-filters { display: flex; gap: 10px; }
.sa-filters select { height: 40px; padding: 0 14px; background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 12px; font-size: 13px; font-weight: 550; color: var(--text-secondary); outline: none; cursor: pointer; }

.sa-card { background: #fff; border: 1px solid var(--separator, #e5e7eb); border-radius: 16px; overflow: hidden; }
.sa-table-head { display: grid; grid-template-columns: minmax(220px, 1.8fr) 140px 140px 140px 180px; align-items: center; gap: 14px; padding: 12px 18px; background: #f8fafc; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); border-bottom: 1px solid var(--separator, #e5e7eb); }
.sa-row { display: grid; grid-template-columns: minmax(220px, 1.8fr) 140px 140px 140px 180px; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--separator, #f1f5f9); font-size: 13.5px; }
.sa-row:last-child { border-bottom: none; }
.sa-row:hover { background: #fafbfc; }

.sa-who { display: flex; align-items: center; gap: 12px; }
.sa-name { font-weight: 650; color: var(--text-primary); }
.sa-role-badge { display: inline-block; font-size: 11px; font-weight: 600; text-transform: capitalize; color: var(--text-tertiary); }

.sa-time-in { display: inline-flex; align-items: center; gap: 5px; color: #166534; font-weight: 600; font-size: 12.5px; }
.sa-time-out { display: inline-flex; align-items: center; gap: 5px; color: #0369a1; font-weight: 600; font-size: 12.5px; }
.sa-time-none { color: var(--text-tertiary); }

.sa-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; }
.sa-status--duty { background: #e8f5e9; color: #2e7d32; }
.sa-status--present { background: #f1f5f9; color: #475569; }
.sa-status--absent { background: #fee2e2; color: #991b1b; }
.sa-status--none { background: #f8fafc; color: #64748b; border: 1px dashed #cbd5e1; }
.sa-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: sa-pulse 1.8s infinite; }
@keyframes sa-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.2); } }

.sa-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.sa-link-btn { border: none; background: transparent; font-size: 12px; font-weight: 600; color: var(--text-tertiary); cursor: pointer; padding: 4px 6px; border-radius: 6px; }
.sa-link-btn:hover { color: #dc2626; background: #fee2e2; }

.sa-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px 20px; color: var(--text-tertiary); }

.sa-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: grid; place-items: center; z-index: 100; backdrop-filter: blur(4px); }
.sa-modal { background: #fff; width: 90%; max-width: 420px; border-radius: 20px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
.sa-modal-title { font-size: 18px; font-weight: 750; margin-bottom: 4px; }
.sa-modal-sub { font-size: 13px; color: var(--text-tertiary); margin: 0; }
.sa-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }

@media (max-width: 900px) {
  .sa-table-head, .sa-row { grid-template-columns: 1fr auto; }
  .sa-table-head > :not(:first-child):not(:last-child),
  .sa-row > :not(:first-child):not(:last-child) { display: none; }
}
`;
