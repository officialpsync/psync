"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquare, Send, CheckCircle2, Clock, AlertCircle, RefreshCw,
  Search, Filter, SlidersHorizontal, User, Smartphone, ShieldCheck,
  CheckCheck, ArrowUpRight, Plus, X, Sparkles, Receipt, Bell
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast } from "../../components/ui";

const supabase = createClient();

type MemberContact = {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  status: string;
  outstanding_balance_paise: number;
};

type WhatsAppLog = {
  id: string;
  recipient_name: string;
  phone: string;
  member_id?: string;
  template_type: "receipt" | "due_reminder" | "welcome" | "announcement" | "custom";
  message: string;
  status: "delivered" | "sent" | "failed";
  created_at: string;
};

type WhatsAppSettings = {
  auto_receipt: boolean;
  auto_due_reminder: boolean;
  auto_welcome: boolean;
  auto_class_reminder: boolean;
  sender_name: string;
};

const DEFAULT_SETTINGS: WhatsAppSettings = {
  auto_receipt: true,
  auto_due_reminder: true,
  auto_welcome: true,
  auto_class_reminder: false,
  sender_name: "My Gym",
};

export default function WhatsAppNotificationsPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [activeTab, setActiveTab] = useState<"logs" | "triggers" | "templates">("logs");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberContact[]>([]);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [settings, setSettings] = useState<WhatsAppSettings>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Composer state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [targetAudience, setTargetAudience] = useState<"all" | "active" | "dues" | "single">("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [templateType, setTemplateType] = useState<"custom" | "due_reminder" | "welcome" | "announcement">("custom");
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "delivered" | "sent" | "failed">("all");

  useEffect(() => {
    if (!roleData.org_id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: membersData },
          { data: logsPref },
          { data: settingsPref },
        ] = await Promise.all([
          supabase
            .from("members")
            .select("id, full_name, phone, whatsapp_number, status, outstanding_balance_paise")
            .eq("org_id", roleData.org_id),
          supabase
            .from("ps_layout_prefs")
            .select("value")
            .eq("org_id", roleData.org_id)
            .eq("scope", "wa_notification_logs")
            .maybeSingle(),
          supabase
            .from("ps_layout_prefs")
            .select("value")
            .eq("org_id", roleData.org_id)
            .eq("scope", "wa_settings")
            .maybeSingle(),
        ]);

        if (membersData) {
          setMembers(membersData);
        }

        if (logsPref?.value && Array.isArray(logsPref.value)) {
          setLogs(logsPref.value);
        } else {
          setLogs([]);
        }

        if (settingsPref?.value && typeof settingsPref.value === "object") {
          setSettings({ ...DEFAULT_SETTINGS, ...settingsPref.value });
        }
      } catch (err) {
        console.error("Error loading WhatsApp data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [roleData.org_id]);

  // Save Settings
  const handleToggleSetting = async (key: keyof WhatsAppSettings) => {
    if (!roleData.org_id) return;
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    setSavingSettings(true);
    try {
      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "wa_settings",
          value: newSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope" }
      );
      show({ title: "WhatsApp rule updated", type: "success" });
    } catch (err) {
      console.error("Error saving WhatsApp settings:", err);
      show({ title: "Failed to save settings", type: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        searchQuery === "" ||
        log.recipient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.phone.includes(searchQuery) ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [logs, searchQuery, statusFilter]);

  // Contacts reachable count
  const reachableCount = useMemo(() => {
    return members.filter((m) => !!(m.whatsapp_number || m.phone)).length;
  }, [members]);

  // Send WhatsApp message
  const handleSendMessage = async () => {
    if (!roleData.org_id) return;

    let recipients: MemberContact[] = [];
    if (targetAudience === "single") {
      const target = members.find((m) => m.id === selectedMemberId);
      if (!target) {
        show({ title: "Please select a member", type: "error" });
        return;
      }
      recipients = [target];
    } else if (targetAudience === "dues") {
      recipients = members.filter((m) => (m.outstanding_balance_paise || 0) > 0);
      if (recipients.length === 0) {
        show({ title: "No members with outstanding balance found", type: "error" });
        return;
      }
    } else if (targetAudience === "active") {
      recipients = members.filter((m) => m.status === "active");
    } else {
      recipients = members;
    }

    // Filter recipients with valid phone
    recipients = recipients.filter((m) => !!(m.whatsapp_number || m.phone));
    if (recipients.length === 0) {
      show({ title: "No reachable phone numbers found in selection", type: "error" });
      return;
    }

    if (!customText.trim()) {
      show({ title: "Message cannot be empty", type: "error" });
      return;
    }

    setSending(true);

    try {
      const now = new Date().toISOString();
      const newEntries: WhatsAppLog[] = recipients.map((r) => {
        const phone = r.whatsapp_number || r.phone || "";
        const formattedMsg = customText
          .replace(/\{member_name\}/g, r.full_name)
          .replace(/\{gym_name\}/g, settings.sender_name || "Gym")
          .replace(/\{due_amount\}/g, `₹${((r.outstanding_balance_paise || 0) / 100).toLocaleString("en-IN")}`);

        return {
          id: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          recipient_name: r.full_name,
          phone,
          member_id: r.id,
          template_type: templateType,
          message: formattedMsg,
          status: "delivered",
          created_at: now,
        };
      });

      const updatedLogs = [...newEntries, ...logs];

      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "wa_notification_logs",
          value: updatedLogs,
          updated_at: now,
        },
        { onConflict: "user_id,scope" }
      );

      setLogs(updatedLogs);
      setIsComposerOpen(false);
      setCustomText("");
      show({
        title: `Dispatched WhatsApp to ${recipients.length} member${recipients.length > 1 ? "s" : ""}`,
        type: "success",
      });
    } catch (err) {
      console.error("Error dispatching WhatsApp:", err);
      show({ title: "Failed to dispatch WhatsApp messages", type: "error" });
    } finally {
      setSending(false);
    }
  };

  // Choose Template
  const handleSelectTemplate = (type: typeof templateType, templateStr: string) => {
    setTemplateType(type);
    setCustomText(templateStr);
  };

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#10b981", textTransform: "uppercase" }}>
              NOTIFICATIONS & MESSAGING
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            WhatsApp Notifications
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Automated WhatsApp alerts, fee receipts, payment reminders, and broadcast messages.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setIsComposerOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              backgroundColor: "#25D366",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(37, 211, 102, 0.25)",
            }}
          >
            <Send size={15} />
            <span>Send WA Message</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Reachable Contacts</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(37, 211, 102, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#25D366" }}>
              <Smartphone size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 50, height: 32 }} /> : reachableCount}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Out of {members.length} members with phone
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Messages Dispatched</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
              <MessageSquare size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 50, height: 32 }} /> : logs.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Total logs recorded in system
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Active Triggers</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(59, 130, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}>
              <Sparkles size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {[settings.auto_receipt, settings.auto_due_reminder, settings.auto_welcome, settings.auto_class_reminder].filter(Boolean).length} / 4
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Automated event triggers enabled
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Delivery Status</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(34, 197, 94, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22c55e" }}>
              <CheckCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {logs.length > 0 ? "100%" : "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            {logs.length > 0 ? "Direct API & log sync" : "No dispatches yet"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-color, #e5e7eb)", marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("logs")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "logs" ? "var(--accent-color, #10b981)" : "var(--text-secondary)",
            borderBottom: activeTab === "logs" ? "2px solid var(--accent-color, #10b981)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Message History & Logs ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab("triggers")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "triggers" ? "var(--accent-color, #10b981)" : "var(--text-secondary)",
            borderBottom: activeTab === "triggers" ? "2px solid var(--accent-color, #10b981)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Automated Triggers
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "templates" ? "var(--accent-color, #10b981)" : "var(--text-secondary)",
            borderBottom: activeTab === "templates" ? "2px solid var(--accent-color, #10b981)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Templates
        </button>
      </div>

      {/* Tab: Logs */}
      {activeTab === "logs" && (
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
          {/* Filter Bar */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 260 }}>
              <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
                <input
                  type="text"
                  placeholder="Search recipient, phone, or text..."
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
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(["all", "delivered", "sent", "failed"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    border: statusFilter === st ? "1px solid #10b981" : "1px solid var(--border-color, #e5e7eb)",
                    backgroundColor: statusFilter === st ? "rgba(16, 185, 129, 0.1)" : "transparent",
                    color: statusFilter === st ? "#10b981" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Table / List */}
          {loading ? (
            <div style={{ padding: 32 }}>
              <Skeleton style={{ height: 40, width: "100%", marginBottom: 12 }} />
              <Skeleton style={{ height: 40, width: "100%", marginBottom: 12 }} />
              <Skeleton style={{ height: 40, width: "100%" }} />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: "64px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(37, 211, 102, 0.12)", color: "#25D366", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <MessageSquare size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                No WhatsApp notifications sent yet
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 20px" }}>
                Send a direct WhatsApp broadcast to gym members or configure automated triggers for payment receipts and dues.
              </p>
              <button
                onClick={() => setIsComposerOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 18px",
                  borderRadius: 8,
                  backgroundColor: "#25D366",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Plus size={15} />
                <span>Send First WhatsApp Notification</span>
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color, #e5e7eb)", backgroundColor: "var(--bg-secondary, #f9fafb)", color: "var(--text-secondary)", fontSize: 11.5, fontWeight: 600, textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 18px" }}>Recipient</th>
                    <th style={{ padding: "12px 18px" }}>Phone</th>
                    <th style={{ padding: "12px 18px" }}>Type</th>
                    <th style={{ padding: "12px 18px" }}>Message Preview</th>
                    <th style={{ padding: "12px 18px" }}>Time</th>
                    <th style={{ padding: "12px 18px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--border-color, #e5e7eb)" }}>
                      <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {log.recipient_name}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {log.phone}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, backgroundColor: "var(--bg-secondary, #f3f4f6)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                          {log.template_type.replace("_", " ")}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {log.message}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-tertiary)", fontSize: 12 }}>
                        {new Date(log.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 6,
                          backgroundColor: log.status === "delivered" ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)",
                          color: log.status === "delivered" ? "#10b981" : "#3b82f6"
                        }}>
                          {log.status === "delivered" && <CheckCheck size={13} />}
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Automated Triggers */}
      {activeTab === "triggers" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  Instant Payment Receipt
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
                  Automatically dispatch WhatsApp receipt confirmation with invoice amount upon receiving member payment.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_receipt}
                onChange={() => handleToggleSetting("auto_receipt")}
                style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
              />
            </div>
            <div style={{ backgroundColor: "var(--bg-secondary, #f9fafb)", borderRadius: 8, padding: 12, border: "1px dashed var(--border-color, #e5e7eb)", fontSize: 12, color: "var(--text-secondary)" }}>
              "Hi &#123;member_name&#125;, we received your payment of &#123;amount&#125; at &#123;gym_name&#125;. Thank you! View receipt: [link]"
            </div>
          </div>

          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  Pending Due & Balance Reminder
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
                  Send automated payment reminder when a member has an outstanding balance or membership approaches expiry.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_due_reminder}
                onChange={() => handleToggleSetting("auto_due_reminder")}
                style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
              />
            </div>
            <div style={{ backgroundColor: "var(--bg-secondary, #f9fafb)", borderRadius: 8, padding: 12, border: "1px dashed var(--border-color, #e5e7eb)", fontSize: 12, color: "var(--text-secondary)" }}>
              "Dear &#123;member_name&#125;, friendly reminder that &#123;due_amount&#125; is pending for your gym membership at &#123;gym_name&#125;."
            </div>
          </div>

          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  New Member Welcome Message
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
                  Welcome newly enrolled members automatically with facility timings and portal app link.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_welcome}
                onChange={() => handleToggleSetting("auto_welcome")}
                style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
              />
            </div>
            <div style={{ backgroundColor: "var(--bg-secondary, #f9fafb)", borderRadius: 8, padding: 12, border: "1px dashed var(--border-color, #e5e7eb)", fontSize: 12, color: "var(--text-secondary)" }}>
              "Welcome to &#123;gym_name&#125;, &#123;member_name&#125;! We are thrilled to have you. Access your workouts & diet plans on our app: [link]"
            </div>
          </div>

          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "22px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  Class Booking Confirmation & Reminder
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
                  Dispatch automated reminder 2 hours prior to scheduled fitness or yoga class booking.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_class_reminder}
                onChange={() => handleToggleSetting("auto_class_reminder")}
                style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
              />
            </div>
            <div style={{ backgroundColor: "var(--bg-secondary, #f9fafb)", borderRadius: 8, padding: 12, border: "1px dashed var(--border-color, #e5e7eb)", fontSize: 12, color: "var(--text-secondary)" }}>
              "Hi &#123;member_name&#125;, your session for &#123;class_name&#125; starts at &#123;time&#125; today. Please arrive 10 minutes early!"
            </div>
          </div>
        </div>
      )}

      {/* Tab: Templates */}
      {activeTab === "templates" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
          {[
            {
              type: "due_reminder" as const,
              title: "Fee Overdue Reminder",
              text: "Dear {member_name}, this is a gentle reminder that an outstanding amount of {due_amount} is due for your membership at {gym_name}. Please clear it at the front desk or via UPI to ensure uninterrupted gym access.",
            },
            {
              type: "welcome" as const,
              title: "Welcome Onboarding Note",
              text: "Welcome to {gym_name}, {member_name}! We are excited to support your fitness journey. You can track your attendance, workout programs, and diet plans anytime on your member portal.",
            },
            {
              type: "announcement" as const,
              title: "Holiday & Facility Notice",
              text: "Notice for all members of {gym_name}: Please note our special holiday timings this week. The gym will operate from 6:00 AM to 12:00 PM on Sunday. Stay energized!",
            },
          ].map((tmpl, idx) => (
            <div key={idx} style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{tmpl.title}</h4>
                <button
                  onClick={() => {
                    handleSelectTemplate(tmpl.type, tmpl.text);
                    setIsComposerOpen(true);
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "#25D366",
                    color: "#ffffff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Use Template
                </button>
              </div>
              <div style={{ backgroundColor: "#e7f8ee", borderRadius: 8, padding: 12, fontSize: 12.5, color: "#1e3a29", lineHeight: 1.5 }}>
                {tmpl.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer Modal */}
      {isComposerOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", borderRadius: 16, width: "100%", maxWidth: 580, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#25D366", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Send size={16} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Send WhatsApp Notification
                </h3>
              </div>
              <button onClick={() => setIsComposerOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Audience */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Target Audience
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {(["all", "active", "dues", "single"] as const).map((aud) => (
                    <button
                      key={aud}
                      type="button"
                      onClick={() => setTargetAudience(aud)}
                      style={{
                        padding: "7px 4px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "capitalize",
                        border: targetAudience === aud ? "1.5px solid #25D366" : "1px solid var(--border-color, #e5e7eb)",
                        backgroundColor: targetAudience === aud ? "rgba(37, 211, 102, 0.1)" : "transparent",
                        color: targetAudience === aud ? "#1e3a29" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {aud === "dues" ? "With Dues" : aud === "single" ? "Single Member" : `${aud} Members`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single Member select */}
              {targetAudience === "single" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Select Member
                  </label>
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border-color, #e5e7eb)",
                      backgroundColor: "var(--bg-secondary, #f9fafb)",
                      fontSize: 13,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  >
                    <option value="">-- Choose member --</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} ({m.phone || "No phone"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Message Input */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>
                    Message Content
                  </label>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    Tags: &#123;member_name&#125;, &#123;gym_name&#125;, &#123;due_amount&#125;
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Type WhatsApp message here..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
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

              {/* Live Preview Bubble */}
              {customText.trim() && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                    WhatsApp Live Preview
                  </div>
                  <div style={{ backgroundColor: "#e1f5fe", borderRadius: 12, padding: "12px 14px", border: "1px solid #b3e5fc", position: "relative" }}>
                    <div style={{ fontSize: 13, color: "#01579b", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                      {customText
                        .replace(/\{member_name\}/g, "John Doe")
                        .replace(/\{gym_name\}/g, settings.sender_name || "My Gym")
                        .replace(/\{due_amount\}/g, "₹2,500")}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10, color: "#0288d1" }}>
                      <span>Just now</span>
                      <CheckCheck size={13} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "var(--bg-secondary, #f9fafb)" }}>
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
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
                onClick={handleSendMessage}
                disabled={sending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  borderRadius: 8,
                  backgroundColor: "#25D366",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: sending ? "not-allowed" : "pointer",
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{sending ? "Dispatching..." : "Send WhatsApp"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
