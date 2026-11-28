"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Bell, Plus, Send, Trash2, Search, Filter, AlertTriangle,
  Info, Sparkles, CheckCircle2, Megaphone, Users, Clock, X,
  RefreshCw, ShieldAlert, Tag
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast } from "../../components/ui";

const supabase = createClient();

type AppNotificationItem = {
  id: string;
  title: string;
  message: string;
  priority: "info" | "urgent" | "event" | "promo";
  target_audience: "all" | "active" | "trainers";
  created_at: string;
  author_name: string;
  is_active: boolean;
};

export default function AppNotificationsPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [activeMembersCount, setActiveMembersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Composer Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<AppNotificationItem["priority"]>("info");
  const [targetAudience, setTargetAudience] = useState<AppNotificationItem["target_audience"]>("all");
  const [publishing, setPublishing] = useState(false);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    if (!roleData.org_id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: membersData },
          { data: notifsPref }
        ] = await Promise.all([
          supabase
            .from("members")
            .select("id, status")
            .eq("org_id", roleData.org_id),
          supabase
            .from("ps_layout_prefs")
            .select("value")
            .eq("org_id", roleData.org_id)
            .eq("scope", "app_notifications")
            .maybeSingle(),
        ]);

        if (membersData) {
          const activeOnes = membersData.filter((m) => m.status === "active").length;
          setActiveMembersCount(activeOnes || membersData.length);
        }

        if (notifsPref?.value && Array.isArray(notifsPref.value)) {
          setNotifications(notifsPref.value);
        } else {
          setNotifications([]);
        }
      } catch (err) {
        console.error("Error loading app notifications:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [roleData.org_id]);

  // Publish Notification
  const handlePublish = async () => {
    if (!roleData.org_id) return;
    if (!title.trim() || !message.trim()) {
      show({ title: "Please fill in title and message", type: "error" });
      return;
    }

    setPublishing(true);
    try {
      const now = new Date().toISOString();
      const newItem: AppNotificationItem = {
        id: `app-notif-${Date.now()}`,
        title: title.trim(),
        message: message.trim(),
        priority,
        target_audience: targetAudience,
        created_at: now,
        author_name: "Staff",
        is_active: true,
      };

      const updated = [newItem, ...notifications];

      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "app_notifications",
          value: updated,
          updated_at: now,
        },
        { onConflict: "user_id,scope" }
      );

      setNotifications(updated);
      setIsModalOpen(false);
      setTitle("");
      setMessage("");
      setPriority("info");
      show({ title: "App notification published to members!", type: "success" });
    } catch (err) {
      console.error("Failed to publish app notification:", err);
      show({ title: "Failed to publish announcement", type: "error" });
    } finally {
      setPublishing(false);
    }
  };

  // Delete notification
  const handleDelete = async (id: string) => {
    if (!roleData.org_id) return;
    const updated = notifications.filter((n) => n.id !== id);
    setNotifications(updated);

    try {
      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "app_notifications",
          value: updated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope" }
      );
      show({ title: "Notification removed", type: "success" });
    } catch (err) {
      console.error("Error deleting notification:", err);
      show({ title: "Failed to delete notification", type: "error" });
    }
  };

  // Filtered list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.message.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [notifications, searchQuery, priorityFilter]);

  const priorityStyles = {
    info: { bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "rgba(59, 130, 246, 0.25)", label: "Info / Notice" },
    urgent: { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", border: "rgba(239, 68, 68, 0.25)", label: "Urgent Alert" },
    event: { bg: "rgba(168, 85, 247, 0.12)", color: "#9333ea", border: "rgba(168, 85, 247, 0.25)", label: "Class / Event" },
    promo: { bg: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "rgba(16, 185, 129, 0.25)", label: "Offer / Promo" },
  };

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#3b82f6", textTransform: "uppercase" }}>
              NOTIFICATIONS & MESSAGING
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            In-App Notifications & Alerts
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Broadcast gym announcements, holiday hours, trainer updates, and in-app alerts directly to members.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 10,
            backgroundColor: "#3b82f6",
            color: "#ffffff",
            fontSize: 13.5,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)",
          }}
        >
          <Plus size={16} />
          <span>New In-App Announcement</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Active Announcements</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(59, 130, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}>
              <Megaphone size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : notifications.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Broadcast notices visible in portal
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Member Audience Reach</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : activeMembersCount}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Active members registered in gym DB
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Urgent Alerts</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
              <ShieldAlert size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : notifications.filter((n) => n.priority === "urgent").length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            High-priority banners active
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Push Delivery Status</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(34, 197, 94, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22c55e" }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            Active
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Real-time sync to member portal
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
        {/* Filter bar */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                borderRadius: 8,
                border: "1px solid var(--border-color, #e5e7eb)",
                backgroundColor: "var(--bg-secondary, #f9fafb)",
                fontSize: 13,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {[
              { id: "all", label: "All" },
              { id: "info", label: "Notices" },
              { id: "urgent", label: "Urgent" },
              { id: "event", label: "Events" },
              { id: "promo", label: "Offers" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPriorityFilter(p.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: priorityFilter === p.id ? "1px solid #3b82f6" : "1px solid var(--border-color, #e5e7eb)",
                  backgroundColor: priorityFilter === p.id ? "rgba(59, 130, 246, 0.1)" : "transparent",
                  color: priorityFilter === p.id ? "#3b82f6" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: 32 }}>
            <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 60, width: "100%" }} />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: "64px 20px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Bell size={26} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
              No app notifications published yet
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 20px" }}>
              Keep your members informed about gym updates, special classes, schedule modifications, or promotional challenges.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 8,
                backgroundColor: "#3b82f6",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <Plus size={15} />
              <span>Create First App Announcement</span>
            </button>
          </div>
        ) : (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {filteredNotifications.map((notif) => {
              const pStyle = priorityStyles[notif.priority] || priorityStyles.info;
              return (
                <div
                  key={notif.id}
                  style={{
                    border: `1px solid ${pStyle.border}`,
                    borderRadius: 12,
                    padding: "16px 20px",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        backgroundColor: pStyle.bg,
                        color: pStyle.color,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}>
                        {pStyle.label}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Users size={12} />
                        Audience: <strong style={{ textTransform: "capitalize", color: "var(--text-secondary)" }}>{notif.target_audience} members</strong>
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} />
                        {new Date(notif.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                      {notif.title}
                    </h4>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {notif.message}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDelete(notif.id)}
                    title="Delete notification"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer Modal */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#3b82f6", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Megaphone size={16} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Publish In-App Notification
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Title */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Notification Headline / Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Special Holiday Hours This Weekend"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

              {/* Message */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Message Content
                </label>
                <textarea
                  rows={4}
                  placeholder="Write the detailed announcement for your gym members..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-color, #e5e7eb)",
                    backgroundColor: "var(--bg-secondary, #f9fafb)",
                    fontSize: 13,
                    color: "var(--text-primary)",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Category & Audience Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Category / Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border-color, #e5e7eb)",
                      backgroundColor: "var(--bg-secondary, #f9fafb)",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="info">General Notice</option>
                    <option value="urgent">Urgent Alert</option>
                    <option value="event">Class / Event</option>
                    <option value="promo">Special Offer</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Target Audience
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border-color, #e5e7eb)",
                      backgroundColor: "var(--bg-secondary, #f9fafb)",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="all">All Members ({activeMembersCount})</option>
                    <option value="active">Active Members Only</option>
                    <option value="trainers">Trainers & Staff</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "var(--bg-secondary, #f9fafb)" }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color, #e5e7eb)",
                  backgroundColor: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  borderRadius: 8,
                  backgroundColor: "#3b82f6",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: publishing ? "not-allowed" : "pointer",
                  opacity: publishing ? 0.7 : 1,
                }}
              >
                {publishing ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{publishing ? "Publishing..." : "Broadcast Notice"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
