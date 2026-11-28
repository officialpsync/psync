"use client";
// app/dashboard/marketing/follow-ups/page.tsx
// Dedicated leads follow-up management: overdue alerts, daily tasks, quick communications, and rescheduling.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock, Search, Phone, MessageSquare, Mail, Calendar,
  Clock, CheckCircle, AlertCircle, ArrowUpRight, Filter, ChevronRight,
  RefreshCw, Check, UserCheck, Sparkles, X, ChevronLeft
} from "lucide-react";
import { DesignStyles } from "../../components/DesignSystem";
import { Skeleton, useToast } from "../../components/ui";
import { createClient } from "@/lib/supabase";
import {
  isOpen, isOverdue, isDueToday, formatDateTime, formatDay, relTime,
  STATUS_META, SOURCE_LABELS, type Lead, type LeadStatus, type StaffMember
} from "../../leads/lib";

const supabase = createClient();

type TabType = "all" | "overdue" | "today" | "upcoming" | "unscheduled";

export default function LeadsFollowUpsPage() {
  const { toast, show } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabType>("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Reschedule modal state
  const [rescheduleLead, setRescheduleLead] = useState<Lead | null>(null);
  const [newFollowUpDate, setNewFollowUpDate] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData?.org_id) return;

      const [leadsRes, staffRes] = await Promise.all([
        supabase
          .from("leads")
          .select("*, membership_plans(name)")
          .eq("org_id", roleData.org_id)
          .order("follow_up_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("gym_staff")
          .select("id, user_id, name")
          .eq("org_id", roleData.org_id),
      ]);

      if (leadsRes.data) setLeads(leadsRes.data as unknown as Lead[]);
      if (staffRes.data) setStaff(staffRes.data as StaffMember[]);
    } catch (err) {
      console.error("Error loading follow-ups:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Status counts
  const counts = useMemo(() => {
    const overdue = leads.filter((l) => isOverdue(l)).length;
    const today = leads.filter((l) => isDueToday(l)).length;
    const upcoming = leads.filter((l) => isOpen(l) && !!l.follow_up_at && !isOverdue(l) && !isDueToday(l)).length;
    const unscheduled = leads.filter((l) => isOpen(l) && !l.follow_up_at).length;
    return { all: leads.length, overdue, today, upcoming, unscheduled };
  }, [leads]);

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      // Tab filter
      if (tab === "overdue" && !isOverdue(l)) return false;
      if (tab === "today" && !isDueToday(l)) return false;
      if (tab === "upcoming" && (!isOpen(l) || !l.follow_up_at || isOverdue(l) || isDueToday(l))) return false;
      if (tab === "unscheduled" && (!isOpen(l) || !!l.follow_up_at)) return false;

      // Staff filter
      if (staffFilter !== "all" && l.assigned_to !== staffFilter) return false;

      // Status filter
      if (statusFilter !== "all" && l.status !== statusFilter) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = l.full_name?.toLowerCase().includes(q);
        const phoneMatch = l.phone?.toLowerCase().includes(q);
        const emailMatch = l.email?.toLowerCase().includes(q);
        const notesMatch = l.notes?.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !emailMatch && !notesMatch) return false;
      }

      return true;
    });
  }, [leads, tab, staffFilter, statusFilter, search]);

  // Handle Quick Status Change
  async function handleStatusChange(leadId: string, newStatus: LeadStatus) {
    setUpdatingId(leadId);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (error) throw error;
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      show(`Status updated to ${STATUS_META[newStatus]?.label ?? newStatus}`);
    } catch (err: unknown) {
      show("Failed to update status: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setUpdatingId(null);
    }
  }

  // Handle Reschedule Follow Up
  async function handleSaveReschedule() {
    if (!rescheduleLead) return;
    try {
      const followUpIso = newFollowUpDate ? new Date(newFollowUpDate).toISOString() : null;
      const { error } = await supabase
        .from("leads")
        .update({ follow_up_at: followUpIso, updated_at: new Date().toISOString() })
        .eq("id", rescheduleLead.id);
      if (error) throw error;
      setLeads((prev) =>
        prev.map((l) => (l.id === rescheduleLead.id ? { ...l, follow_up_at: followUpIso } : l))
      );
      show("Follow-up rescheduled successfully");
      setRescheduleLead(null);
      setNewFollowUpDate("");
    } catch (err: unknown) {
      show("Failed to reschedule: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  }

  return (
    <div className="ps-page db">
      <DesignStyles />
      {toast}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/dashboard/leads" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none" }}>
              <ChevronLeft size={14} /> Back to Leads
            </Link>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Leads Follow Ups
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Track scheduled follow-ups, overdue callbacks, and stay on top of prospective members.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={loadData}>
            <RefreshCw size={15} /> <span>Refresh</span>
          </button>
          <Link href="/dashboard/leads" className="ps-btn ps-btn--primary">
            <span>View All Leads</span> <ChevronRight size={15} />
          </Link>
        </div>
      </header>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div
          onClick={() => setTab("overdue")}
          style={{
            background: "var(--surface)",
            border: tab === "overdue" ? "2px solid var(--red)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Overdue Follow-ups</span>
            <AlertCircle size={18} style={{ color: "var(--red)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: counts.overdue > 0 ? "var(--red)" : "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.overdue}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Immediate attention required</div>
        </div>

        <div
          onClick={() => setTab("today")}
          style={{
            background: "var(--surface)",
            border: tab === "today" ? "2px solid var(--amber)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Due Today</span>
            <CalendarClock size={18} style={{ color: "var(--amber)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: counts.today > 0 ? "var(--amber)" : "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.today}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Scheduled for today</div>
        </div>

        <div
          onClick={() => setTab("upcoming")}
          style={{
            background: "var(--surface)",
            border: tab === "upcoming" ? "2px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Upcoming</span>
            <Clock size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.upcoming}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Scheduled future calls</div>
        </div>

        <div
          onClick={() => setTab("unscheduled")}
          style={{
            background: "var(--surface)",
            border: tab === "unscheduled" ? "2px solid var(--purple)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Unscheduled</span>
            <Calendar size={18} style={{ color: "var(--purple)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.unscheduled}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Open leads needing date</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
          background: "var(--surface)",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 9 }}>
          {(["all", "overdue", "today", "upcoming", "unscheduled"] as TabType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                border: "none",
                background: tab === t ? "var(--surface)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: tab === t ? 650 : 500,
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 7,
                cursor: "pointer",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                textTransform: "capitalize",
              }}
            >
              {t === "all" ? `All (${leads.length})` : `${t} (${counts[t]})`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads by name, phone, or notes..."
            className="ps-input"
            style={{ width: "100%", paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>

        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All assigned staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="trial">Trial</option>
          <option value="converted">Converted</option>
          <option value="lost">Lost</option>
        </select>
      </div>

      {/* Follow-up List / Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <Skeleton width={160} height={18} />
                <Skeleton width={100} height={16} />
                <Skeleton width={120} height={16} />
                <div style={{ marginLeft: "auto" }}><Skeleton width={80} height={28} /></div>
              </div>
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px" }}>
            <CheckCircle size={36} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>No follow-ups matching this view</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: 0 }}>
              {tab === "overdue" ? "Great job! You have no overdue follow-ups." : "Adjust filters or schedule follow-ups for open leads."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 650 }}>
                  <th style={{ padding: "12px 16px" }}>Lead</th>
                  <th style={{ padding: "12px 14px" }}>Scheduled Time</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 14px" }}>Assigned To</th>
                  <th style={{ padding: "12px 14px" }}>Contact</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const overdue = isOverdue(lead);
                  const dueToday = isDueToday(lead);
                  const assignedStaff = staff.find((s) => s.id === lead.assigned_to);

                  return (
                    <tr
                      key={lead.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: overdue ? "rgba(220, 38, 38, 0.03)" : undefined,
                      }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          style={{ fontWeight: 650, color: "var(--text-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          {lead.full_name}
                          <ArrowUpRight size={13} style={{ color: "var(--text-tertiary)" }} />
                        </Link>
                        {lead.interested_plan && lead.membership_plans?.name && (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Plan: {lead.membership_plans.name}
                          </div>
                        )}
                        {lead.notes && (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {lead.notes}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        {lead.follow_up_at ? (
                          <div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                fontWeight: overdue || dueToday ? 650 : 500,
                                color: overdue ? "var(--red)" : dueToday ? "var(--amber)" : "var(--text-primary)",
                              }}
                            >
                              <CalendarClock size={14} />
                              <span>{formatDateTime(lead.follow_up_at)}</span>
                            </div>
                            <div style={{ fontSize: 11.5, color: overdue ? "var(--red)" : "var(--text-tertiary)", marginTop: 2 }}>
                              {overdue ? "Overdue" : dueToday ? "Today" : relTime(lead.follow_up_at)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Unscheduled</span>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <select
                          value={lead.status}
                          disabled={updatingId === lead.id}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            border: "1px solid var(--border)",
                            background: STATUS_META[lead.status]?.bg || "var(--surface-2)",
                            color: STATUS_META[lead.status]?.color || "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="interested">Interested</option>
                          <option value="trial">Trial</option>
                          <option value="converted">Converted</option>
                          <option value="lost">Lost</option>
                        </select>
                      </td>

                      <td style={{ padding: "14px 14px", color: "var(--text-secondary)", fontSize: 13 }}>
                        {assignedStaff?.name || "Unassigned"}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {lead.phone ? (
                            <>
                              <a
                                href={`tel:${lead.phone}`}
                                title={`Call ${lead.phone}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  display: "grid",
                                  placeItems: "center",
                                  background: "var(--surface-2)",
                                  color: "var(--text-primary)",
                                  textDecoration: "none",
                                }}
                              >
                                <Phone size={13} />
                              </a>
                              <a
                                href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  display: "grid",
                                  placeItems: "center",
                                  background: "rgba(34, 197, 94, 0.12)",
                                  color: "var(--green)",
                                  textDecoration: "none",
                                }}
                              >
                                <MessageSquare size={13} />
                              </a>
                            </>
                          ) : null}
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              title={`Email ${lead.email}`}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                display: "grid",
                                placeItems: "center",
                                background: "var(--surface-2)",
                                color: "var(--text-primary)",
                                textDecoration: "none",
                              }}
                            >
                              <Mail size={13} />
                            </a>
                          ) : null}
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            className="ps-btn ps-btn--secondary"
                            style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                            onClick={() => {
                              setRescheduleLead(lead);
                              setNewFollowUpDate(
                                lead.follow_up_at
                                  ? new Date(lead.follow_up_at).toISOString().slice(0, 16)
                                  : new Date().toISOString().slice(0, 16)
                              );
                            }}
                          >
                            <CalendarClock size={13} />
                            <span>Reschedule</span>
                          </button>
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="ps-btn ps-btn--secondary"
                            style={{ height: 28, padding: "0 8px" }}
                            title="Open lead details"
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {rescheduleLead && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setRescheduleLead(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              maxWidth: 420,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Reschedule Follow-up</h3>
              <button
                type="button"
                onClick={() => setRescheduleLead(null)}
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 16px" }}>
              Set next follow-up date and time for <b>{rescheduleLead.full_name}</b>.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
                Next Follow-up Date & Time
              </label>
              <input
                type="datetime-local"
                value={newFollowUpDate}
                onChange={(e) => setNewFollowUpDate(e.target.value)}
                className="ps-input"
                style={{ width: "100%", height: 38 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setRescheduleLead(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={handleSaveReschedule}
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
