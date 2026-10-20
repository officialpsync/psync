"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { Search, LogIn, LogOut, UserCheck } from "lucide-react";
import { Avatar, cols, Skeleton, useToast } from "../components/ui";

type AttendanceLog = {
  id: string; member_id: string; check_in_at: string; check_out_at: string | null; method: string | null;
  members: { full_name: string; phone: string | null } | null;
};

type Member = { id: string; full_name: string; phone: string | null };

const supabase = createClient();

const LOG_ROW = cols("minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 120px", "minmax(0,1fr) auto");
const PICK_ROW = cols("minmax(0,1fr) auto", "minmax(0,1fr) auto");

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

function duration(inTime: string, outTime: string | null) {
  if (!outTime) return null;
  const mins = Math.round((new Date(outTime).getTime() - new Date(inTime).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function AttendancePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const { toast, show } = useToast();

  useEffect(() => {
    setToday(new Date().toISOString().split("T")[0]);
  }, []);

  const load = useCallback(async (oid: string, todayStr: string) => {
    const { data } = await supabase
      .from("attendance_logs")
      .select("id, member_id, check_in_at, check_out_at, method, members(full_name, phone)")
      .eq("org_id", oid)
      .gte("check_in_at", `${todayStr}T00:00:00`)
      .order("check_in_at", { ascending: false });
    setLogs((data as AttendanceLog[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!today) return;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const { data: memberData } = await supabase.from("members").select("id, full_name, phone").eq("org_id", roleData.org_id).order("full_name");
      setMembers((memberData as Member[]) || []);
      await load(roleData.org_id, today);
    }
    init();
  }, [today, load]);

  const insideIds = useMemo(
    () => new Set(logs.filter((l) => !l.check_out_at).map((l) => l.member_id)),
    [logs]
  );

  async function checkIn(member: Member) {
    if (!orgId || !today) return;
    setBusyId(member.id);
    const { error } = await supabase.from("attendance_logs").insert({
      org_id: orgId, member_id: member.id, method: "manual",
      check_in_at: new Date().toISOString(),
    });
    await load(orgId, today);
    setBusyId(null);
    if (!error) {
      setMemberSearch("");
      show(`${member.full_name.split(" ")[0]} checked in`);
    } else {
      show("Couldn't check in. Try again.", "error");
    }
  }

  async function checkOut(log: AttendanceLog) {
    if (!orgId || !today) return;
    setBusyId(log.id);
    await supabase.from("attendance_logs").update({ check_out_at: new Date().toISOString() }).eq("id", log.id);
    await load(orgId, today);
    setBusyId(null);
    show(`${(log.members?.full_name || "Member").split(" ")[0]} checked out`);
  }

  const mq = memberSearch.trim().toLowerCase();
  const matches = mq.length > 1
    ? members.filter((m) => m.full_name.toLowerCase().includes(mq) || (m.phone || "").includes(mq)).slice(0, 6)
    : [];

  const filteredLogs = logs.filter((l) => (l.members?.full_name || "").toLowerCase().includes(search.trim().toLowerCase()));
  const insideCount = insideIds.size;

  return (
    <div className="ps-page">
      <header className="ps-header">
        <div className="ps-header-text">
          <h1 className="ps-title">Attendance</h1>
          <p className="ps-subtitle">
            {loading ? "\u00a0" : `${logs.length} check-in${logs.length === 1 ? "" : "s"} today, ${insideCount} in the gym now`}
          </p>
        </div>
      </header>

      {/* Check-in */}
      <section className="ps-card">
        <div className="ps-card-body" style={{ paddingBottom: matches.length || mq.length > 1 ? 12 : undefined }}>
          <div className="ps-card-head" style={{ marginBottom: 14 }}>
            <div>
              <h2 className="ps-card-title">Check someone in</h2>
              <p className="ps-card-sub">Search by name or phone number.</p>
            </div>
          </div>
          <div className="ps-input-wrap">
            <span className="ps-input-icon"><Search size={16} /></span>
            <input
              className="ps-input ps-input--icon"
              type="search"
              enterKeyHint="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Start typing a name"
              aria-label="Find member to check in"
            />
          </div>
        </div>

        {mq.length > 1 && (
          <div style={{ borderTop: "1px solid var(--separator)" }}>
            {matches.length === 0 ? (
              <div className="ps-cell" style={{ padding: "16px 24px", color: "var(--text-tertiary)" }}>
                No members match “{memberSearch.trim()}”.
              </div>
            ) : (
              matches.map((m) => {
                const inside = insideIds.has(m.id);
                return (
                  <div key={m.id} className="ps-row" style={{ ...PICK_ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}>
                    <div className="ps-person">
                      <Avatar name={m.full_name} />
                      <div>
                        <div className="ps-cell-title">{m.full_name}</div>
                        <div className="ps-cell-sub">{m.phone || "No phone"}</div>
                      </div>
                    </div>
                    {inside ? (
                      <span className="ps-badge ps-badge--green"><span className="ps-dot" />In gym</span>
                    ) : (
                      <button
                        type="button"
                        className="ps-btn ps-btn--success ps-btn--sm"
                        onClick={() => checkIn(m)}
                        disabled={busyId === m.id}
                      >
                        <LogIn size={14} strokeWidth={2.4} /> {busyId === m.id ? "Checking in…" : "Check in"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* Today's log */}
      <section className="ps-section">
        <div className="ps-section-head" style={{ alignItems: "center" }}>
          <h2 className="ps-section-title">Today</h2>
          <div className="ps-input-wrap" style={{ width: 220, maxWidth: "50%" }}>
            <span className="ps-input-icon"><Search size={14} /></span>
            <input
              className="ps-input ps-input--icon"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter"
              aria-label="Filter today's log"
              style={{ height: 36 }}
            />
          </div>
        </div>

        <div className="ps-list">
          <div className="ps-list-head" style={LOG_ROW}>
            <span>Member</span><span>Checked in</span><span>Checked out</span><span>Duration</span><span />
          </div>

          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="ps-row" style={{ ...LOG_ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}>
                <div className="ps-person">
                  <Skeleton w={36} h={36} r={18} />
                  <Skeleton w={120} h={13} />
                </div>
                <span className="ps-hide-sm"><Skeleton w={60} h={12} /></span>
                <span className="ps-hide-sm"><Skeleton w={60} h={12} /></span>
                <span className="ps-hide-sm"><Skeleton w={40} h={12} /></span>
                <Skeleton w={80} h={28} r={14} />
              </div>
            ))
          ) : filteredLogs.length === 0 ? (
            <div className="ps-empty">
              <div className="ps-empty-icon"><UserCheck size={22} /></div>
              <div className="ps-empty-title">{logs.length === 0 ? "No check-ins yet today" : "No matches"}</div>
              <div className="ps-empty-text">
                {logs.length === 0 ? "Search for a member above to check them in." : "Try a different name."}
              </div>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isOpen = !log.check_out_at;
              const dur = duration(log.check_in_at, log.check_out_at);
              const name = log.members?.full_name || "Unknown member";
              return (
                <div
                  key={log.id}
                  className={`ps-row${isOpen ? " ps-row--live" : ""}`}
                  style={{ ...LOG_ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}
                >
                  <div className="ps-person">
                    <Avatar name={name} />
                    <div>
                      <div className="ps-cell-title">{name}</div>
                      <div className="ps-cell-sub ps-show-sm">
                        {isOpen
                          ? `In since ${formatTime(log.check_in_at)}`
                          : `${formatTime(log.check_in_at)} to ${formatTime(log.check_out_at!)}`}
                      </div>
                    </div>
                  </div>
                  <div className="ps-cell ps-hide-sm ps-num" style={{ color: "var(--text-primary)" }}>{formatTime(log.check_in_at)}</div>
                  <div className="ps-cell ps-hide-sm ps-num">
                    {log.check_out_at ? formatTime(log.check_out_at) : (
                      <span className="ps-badge ps-badge--green"><span className="ps-dot" />In gym</span>
                    )}
                  </div>
                  <div className="ps-cell ps-hide-sm ps-num">{dur || "—"}</div>
                  <div className="ps-cell-end">
                    {isOpen ? (
                      <button
                        type="button"
                        className="ps-btn ps-btn--secondary ps-btn--sm"
                        onClick={() => checkOut(log)}
                        disabled={busyId === log.id}
                      >
                        <LogOut size={13} strokeWidth={2.4} /> Check out
                      </button>
                    ) : (
                      <span className="ps-show-sm-inline ps-cell ps-num">{dur}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {toast}
    </div>
  );
}
