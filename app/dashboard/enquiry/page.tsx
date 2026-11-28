"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  LifeBuoy, RefreshCw, Send, Upload, Image as ImageIcon, X,
  CheckCircle2, Clock, AlertTriangle, Search, Filter, Phone,
  MessageSquare, Mail, ExternalLink, FileText, Check, ZoomIn,
  Building2, Sparkles, Plus, ShieldCheck, HelpCircle, ArrowUpRight
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToCloudflareR2 } from "@/lib/r2-client";
import { useRole } from "../components/useRole";
import { Skeleton, useToast } from "../components/ui";

const supabase = createClient();

type TicketCategory = "tech_bug" | "biometric" | "billing" | "portal_app" | "features" | "other";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

type SupportTicket = {
  id: string;
  ticket_number: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  description: string;
  image_url?: string;
  image_name?: string;
  status: TicketStatus;
  created_at: string;
  author_name: string;
  author_email?: string;
};

type RenewalEnquiry = {
  id: string;
  request_number: string;
  enquiry_type: "plan_extension" | "branch_expansion" | "feature_upgrade" | "billing_support" | "hardware_sync";
  preferred_channel: "whatsapp" | "phone" | "email";
  contact_name: string;
  contact_phone: string;
  notes: string;
  status: "pending_callback" | "under_review" | "resolved";
  created_at: string;
};

const TICKET_CATEGORIES: Record<TicketCategory, string> = {
  tech_bug: "Technical Bug / Glitch",
  biometric: "Biometrics & Hardware Sync",
  billing: "Billing & Invoicing",
  portal_app: "Member Mobile Portal & App",
  features: "Feature Request",
  other: "General Support",
};

const ENQUIRY_TYPES = {
  plan_extension: "Plan Extension & Annual Renewal",
  branch_expansion: "Add New Branch / Location",
  feature_upgrade: "Feature Upgrade (Custom Brand / WhatsApp API)",
  billing_support: "Billing & GST Invoice Query",
  hardware_sync: "Biometric Hardware / Turnstile Support",
};

export default function EnquiryPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [activeTab, setActiveTab] = useState<"tickets" | "renewals">("tickets");
  const [loading, setLoading] = useState(true);

  // Real Organization Data
  const [orgData, setOrgData] = useState<{
    name: string;
    email: string;
    phone: string;
    plan_tier: string;
  } | null>(null);

  // Tickets & Renewals State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [renewals, setRenewals] = useState<RenewalEnquiry[]>([]);

  // Raise Ticket Modal State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>("tech_bug");
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>("medium");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketImage, setTicketImage] = useState<File | null>(null);
  const [ticketImagePreview, setTicketImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Renewal Support Modal State
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [enquiryType, setEnquiryType] = useState<RenewalEnquiry["enquiry_type"]>("plan_extension");
  const [preferredChannel, setPreferredChannel] = useState<RenewalEnquiry["preferred_channel"]>("whatsapp");
  const [contactName, setContactName] = useState("Test Boaz");
  const [contactPhone, setContactPhone] = useState("");
  const [renewalNotes, setRenewalNotes] = useState("");
  const [submittingRenewal, setSubmittingRenewal] = useState(false);

  // Image Lightbox Viewer
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    if (!roleData.org_id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: org },
          { data: ticketsPref },
          { data: renewalsPref },
        ] = await Promise.all([
          supabase.from("organizations").select("name, email, phone, plan_tier").eq("id", roleData.org_id).single(),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "support_tickets").maybeSingle(),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "renewal_enquiries").maybeSingle(),
        ]);

        if (org) {
          setOrgData({
            name: org.name || "My Gym",
            email: org.email || "",
            phone: org.phone || "",
            plan_tier: org.plan_tier || "Pro Tier",
          });
          if (org.phone) setContactPhone(org.phone);
        }

        if (ticketsPref?.value && Array.isArray(ticketsPref.value)) {
          setTickets(ticketsPref.value);
        } else {
          setTickets([]);
        }

        if (renewalsPref?.value && Array.isArray(renewalsPref.value)) {
          setRenewals(renewalsPref.value);
        } else {
          setRenewals([]);
        }
      } catch (err) {
        console.error("Error loading enquiry and ticket data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [roleData.org_id]);

  // Handle Image Selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      show({ title: "Please choose an image file (PNG, JPG, WebP)", type: "error" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      show({ title: "Image size must be under 10 MB", type: "error" });
      return;
    }

    setTicketImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      setTicketImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Upload image to Cloudflare R2 or fallback
  const uploadAttachment = async (file: File): Promise<string> => {
    try {
      return await uploadToCloudflareR2(file, "tickets");
    } catch (err) {
      console.warn("R2 upload fallback to data URL:", err);
      // Fallback: return base64 preview so attachment is never lost
      return ticketImagePreview || "";
    }
  };

  // Submit Support Ticket
  const handleSubmitTicket = async () => {
    if (!roleData.org_id) return;
    if (!ticketTitle.trim() || !ticketDesc.trim()) {
      show({ title: "Please provide both subject and description", type: "error" });
      return;
    }

    setSubmittingTicket(true);
    try {
      let attachmentUrl = "";
      if (ticketImage) {
        setUploadingImage(true);
        attachmentUrl = await uploadAttachment(ticketImage);
        setUploadingImage(false);
      }

      const now = new Date().toISOString();
      const ticketNum = `#TKT-${Math.floor(1000 + Math.random() * 9000)}`;

      const newTicket: SupportTicket = {
        id: `tkt-${Date.now()}`,
        ticket_number: ticketNum,
        title: ticketTitle.trim(),
        category: ticketCategory,
        priority: ticketPriority,
        description: ticketDesc.trim(),
        image_url: attachmentUrl || undefined,
        image_name: ticketImage?.name,
        status: "open",
        created_at: now,
        author_name: contactName || "Staff",
        author_email: orgData?.email,
      };

      const updated = [newTicket, ...tickets];

      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "support_tickets",
          value: updated,
          updated_at: now,
        },
        { onConflict: "user_id,scope" }
      );

      setTickets(updated);
      setIsTicketModalOpen(false);
      setTicketTitle("");
      setTicketDesc("");
      setTicketImage(null);
      setTicketImagePreview(null);
      show({ title: `Support ticket ${ticketNum} raised successfully!`, type: "success" });
    } catch (err) {
      console.error("Error creating support ticket:", err);
      show({ title: "Failed to raise support ticket", type: "error" });
    } finally {
      setSubmittingTicket(false);
      setUploadingImage(false);
    }
  };

  // Submit Renewal Request
  const handleSubmitRenewal = async () => {
    if (!roleData.org_id) return;
    if (!contactPhone.trim()) {
      show({ title: "Please provide a contact phone number", type: "error" });
      return;
    }

    setSubmittingRenewal(true);
    try {
      const now = new Date().toISOString();
      const reqNum = `#REN-${Math.floor(1000 + Math.random() * 9000)}`;

      const newEnquiry: RenewalEnquiry = {
        id: `ren-${Date.now()}`,
        request_number: reqNum,
        enquiry_type: enquiryType,
        preferred_channel: preferredChannel,
        contact_name: contactName.trim() || "Staff",
        contact_phone: contactPhone.trim(),
        notes: renewalNotes.trim(),
        status: "pending_callback",
        created_at: now,
      };

      const updated = [newEnquiry, ...renewals];

      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "renewal_enquiries",
          value: updated,
          updated_at: now,
        },
        { onConflict: "user_id,scope" }
      );

      setRenewals(updated);
      setIsRenewalModalOpen(false);
      setRenewalNotes("");
      show({ title: `Renewal assistance request ${reqNum} logged! Our team will reach out.`, type: "success" });
    } catch (err) {
      console.error("Error logging renewal enquiry:", err);
      show({ title: "Failed to submit renewal request", type: "error" });
    } finally {
      setSubmittingRenewal(false);
    }
  };

  // Status updates
  const handleToggleTicketStatus = async (ticketId: string, newStatus: TicketStatus) => {
    if (!roleData.org_id) return;
    const updated = tickets.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t));
    setTickets(updated);

    try {
      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "support_tickets",
          value: updated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope" }
      );
      show({ title: `Ticket status set to ${newStatus}`, type: "success" });
    } catch (err) {
      console.error("Error updating ticket status:", err);
      show({ title: "Failed to update ticket", type: "error" });
    }
  };

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesSearch =
        searchQuery === "" ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, searchQuery, statusFilter, priorityFilter]);

  // Priority Styles
  const priorityBadges: Record<TicketPriority, { bg: string; color: string; label: string }> = {
    urgent: { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", label: "Urgent" },
    high: { bg: "rgba(249, 115, 22, 0.12)", color: "#ea580c", label: "High" },
    medium: { bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", label: "Medium" },
    low: { bg: "rgba(107, 114, 128, 0.12)", color: "#4b5563", label: "Low" },
  };

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#3b82f6", textTransform: "uppercase" }}>
              HELP & CUSTOMER SUCCESS
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            Enquiry & Support Desk
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Request subscription renewal assistance, expand your gym locations, or raise a support ticket with screenshot attachments.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setIsRenewalModalOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              backgroundColor: "rgba(99, 102, 241, 0.1)",
              border: "1.5px solid #6366f1",
              color: "#6366f1",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={15} />
            <span>Need Renewal Support</span>
          </button>

          <button
            onClick={() => setIsTicketModalOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 10,
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)",
            }}
          >
            <Plus size={16} />
            <span>Raise a Ticket</span>
          </button>
        </div>
      </div>

      {/* Hero Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 28 }}>
        {/* Renewal & Plan Card */}
        <div style={{
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: 14,
          padding: "20px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          position: "relative",
          overflow: "hidden",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(99, 102, 241, 0.12)", color: "#6366f1", textTransform: "uppercase" }}>
                Current Subscription
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
              {orgData?.name || "My Gym"} · {orgData?.plan_tier || "Pro Tier"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Active license with 24/7 priority support & automatic updates.
            </div>
          </div>
          <button
            onClick={() => setIsRenewalModalOpen(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              backgroundColor: "#6366f1",
              color: "#ffffff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Extend Plan
          </button>
        </div>

        {/* Support Hotline / WhatsApp Card */}
        <div style={{
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: 14,
          padding: "20px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(37, 211, 102, 0.12)", color: "#25D366", textTransform: "uppercase" }}>
                Direct Hotline
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
              Instant Concierge
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Mon – Sat: 9:00 AM – 9:00 PM IST
            </div>
          </div>
          <a
            href="https://wa.me/919999999999?text=Hello%20Support%2C%20I%20need%20assistance%20for%20my%20gym"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              backgroundColor: "#25D366",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <MessageSquare size={14} />
            <span>Chat WA</span>
          </a>
        </div>

        {/* Tickets Stats Card */}
        <div style={{
          backgroundColor: "var(--card-bg, #ffffff)",
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: 14,
          padding: "20px 22px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Support Tickets</span>
            <LifeBuoy size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)" }}>
            {tickets.filter((t) => t.status === "open" || t.status === "in_progress").length} Open
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            {tickets.length} total tickets logged in database
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-color, #e5e7eb)", marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("tickets")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "tickets" ? "var(--accent-color, #3b82f6)" : "var(--text-secondary)",
            borderBottom: activeTab === "tickets" ? "2px solid var(--accent-color, #3b82f6)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Support Tickets ({tickets.length})
        </button>
        <button
          onClick={() => setActiveTab("renewals")}
          style={{
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 600,
            color: activeTab === "renewals" ? "var(--accent-color, #3b82f6)" : "var(--text-secondary)",
            borderBottom: activeTab === "renewals" ? "2px solid var(--accent-color, #3b82f6)" : "2px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          Renewal Support Requests ({renewals.length})
        </button>
      </div>

      {/* TAB 1: SUPPORT TICKETS */}
      {activeTab === "tickets" && (
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
          {/* Filter Bar */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
              <input
                type="text"
                placeholder="Search ticket number, subject, or issue..."
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

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color, #e5e7eb)",
                  backgroundColor: "var(--bg-secondary, #f9fafb)",
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  outline: "none",
                }}
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color, #e5e7eb)",
                  backgroundColor: "var(--bg-secondary, #f9fafb)",
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  outline: "none",
                }}
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Ticket List Content */}
          {loading ? (
            <div style={{ padding: 32 }}>
              <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
              <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
              <Skeleton style={{ height: 60, width: "100%" }} />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div style={{ padding: "64px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#3b82f6", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <LifeBuoy size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                No support tickets raised yet
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 460, margin: "0 auto 20px" }}>
                Everything running smoothly! If you ever experience any software glitch, biometric sync issue, or have a question, raise a ticket with screenshot attachments.
              </p>
              <button
                onClick={() => setIsTicketModalOpen(true)}
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
                <span>Raise a Support Ticket</span>
              </button>
            </div>
          ) : (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {filteredTickets.map((ticket) => {
                const pBadge = priorityBadges[ticket.priority] || priorityBadges.medium;
                return (
                  <div
                    key={ticket.id}
                    style={{
                      border: "1px solid var(--border-color, #e5e7eb)",
                      borderRadius: 12,
                      padding: "18px 20px",
                      backgroundColor: "var(--card-bg, #ffffff)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#3b82f6", letterSpacing: "0.02em" }}>
                            {ticket.ticket_number}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, backgroundColor: pBadge.bg, color: pBadge.color, textTransform: "uppercase" }}>
                            {pBadge.label}
                          </span>
                          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                            {TICKET_CATEGORIES[ticket.category]}
                          </span>
                        </div>
                        <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                          {ticket.title}
                        </h4>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 6,
                          backgroundColor: ticket.status === "resolved" ? "rgba(16, 185, 129, 0.12)" : ticket.status === "in_progress" ? "rgba(59, 130, 246, 0.12)" : "rgba(245, 158, 11, 0.12)",
                          color: ticket.status === "resolved" ? "#10b981" : ticket.status === "in_progress" ? "#3b82f6" : "#f59e0b",
                          textTransform: "capitalize",
                        }}>
                          {ticket.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {ticket.description}
                    </p>

                    {/* Screenshot Attachment */}
                    {ticket.image_url && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6, textTransform: "uppercase" }}>
                          Attached Screenshot
                        </div>
                        <div
                          onClick={() => setPreviewLightboxUrl(ticket.image_url!)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border-color, #e5e7eb)",
                            backgroundColor: "var(--bg-secondary, #f9fafb)",
                            cursor: "pointer",
                          }}
                        >
                          <img
                            src={ticket.image_url}
                            alt="Screenshot"
                            style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }}
                          />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                              <span>{ticket.image_name || "Attachment"}</span>
                              <ZoomIn size={13} color="var(--text-tertiary)" />
                            </div>
                            <div style={{ fontSize: 11, color: "#3b82f6" }}>Click to view full image</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Footer Info & Actions */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--border-color, #f3f4f6)", fontSize: 12, color: "var(--text-tertiary)" }}>
                      <div>
                        Logged by {ticket.author_name} · {new Date(ticket.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {ticket.status !== "resolved" ? (
                          <button
                            onClick={() => handleToggleTicketStatus(ticket.id, "resolved")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid #10b981",
                              backgroundColor: "rgba(16, 185, 129, 0.08)",
                              color: "#10b981",
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            <Check size={13} />
                            <span>Mark Resolved</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleTicketStatus(ticket.id, "open")}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid var(--border-color, #e5e7eb)",
                              backgroundColor: "transparent",
                              color: "var(--text-tertiary)",
                              fontSize: 11.5,
                              cursor: "pointer",
                            }}
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RENEWAL SUPPORT REQUESTS */}
      {activeTab === "renewals" && (
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32 }}>
              <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
              <Skeleton style={{ height: 60, width: "100%" }} />
            </div>
          ) : renewals.length === 0 ? (
            <div style={{ padding: "64px 20px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(99, 102, 241, 0.12)", color: "#6366f1", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <RefreshCw size={26} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
                No renewal requests submitted yet
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 20px" }}>
                Need to extend your annual subscription, add more gym branches, or upgrade features? Request a callback from your account manager.
              </p>
              <button
                onClick={() => setIsRenewalModalOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 18px",
                  borderRadius: 8,
                  backgroundColor: "#6366f1",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Plus size={15} />
                <span>Submit Renewal Inquiry</span>
              </button>
            </div>
          ) : (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {renewals.map((ren) => (
                <div
                  key={ren.id}
                  style={{
                    border: "1px solid var(--border-color, #e5e7eb)",
                    borderRadius: 12,
                    padding: "18px 20px",
                    backgroundColor: "var(--card-bg, #ffffff)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#6366f1" }}>
                          {ren.request_number}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, backgroundColor: "var(--bg-secondary, #f3f4f6)", color: "var(--text-secondary)" }}>
                          Preferred: {ren.preferred_channel.toUpperCase()}
                        </span>
                      </div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                        {ENQUIRY_TYPES[ren.enquiry_type]}
                      </h4>
                    </div>

                    <span style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: 6,
                      backgroundColor: ren.status === "resolved" ? "rgba(16, 185, 129, 0.12)" : "rgba(99, 102, 241, 0.12)",
                      color: ren.status === "resolved" ? "#10b981" : "#6366f1",
                      textTransform: "capitalize",
                    }}>
                      {ren.status.replace("_", " ")}
                    </span>
                  </div>

                  {ren.notes && (
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                      "{ren.notes}"
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border-color, #f3f4f6)", fontSize: 12, color: "var(--text-tertiary)" }}>
                    <div>
                      Contact: <strong>{ren.contact_name}</strong> ({ren.contact_phone})
                    </div>
                    <div>
                      {new Date(ren.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: RAISE A TICKET (WITH IMAGE UPLOAD) */}
      {isTicketModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, backgroundColor: "var(--card-bg, #ffffff)", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#3b82f6", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LifeBuoy size={16} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Raise a Support Ticket
                </h3>
              </div>
              <button onClick={() => setIsTicketModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Ticket Subject / Summary
                </label>
                <input
                  type="text"
                  placeholder="e.g. Turnstile attendance not syncing with reception PC"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
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

              {/* Category & Priority Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as any)}
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
                    {Object.entries(TICKET_CATEGORIES).map(([catKey, label]) => (
                      <option key={catKey} value={catKey}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Priority
                  </label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value as any)}
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
                    <option value="low">Low (General Query)</option>
                    <option value="medium">Medium (Standard)</option>
                    <option value="high">High (Impacting Gym Members)</option>
                    <option value="urgent">Urgent (System Down / Critical)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Issue Description & Steps to Reproduce
                </label>
                <textarea
                  rows={4}
                  placeholder="Please describe what happened, any error messages shown, or what assistance is needed..."
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
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

              {/* Image Upload Attachment */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Attach Screenshot / Error Photo (Optional)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageSelect}
                  style={{ display: "none" }}
                />

                {!ticketImagePreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: "100%",
                      padding: "20px 16px",
                      borderRadius: 8,
                      border: "1.5px dashed var(--border-color, #e5e7eb)",
                      backgroundColor: "var(--bg-secondary, #f9fafb)",
                      color: "var(--text-secondary)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <Upload size={20} color="#3b82f6" />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Click to upload screenshot</span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>PNG, JPG or WebP up to 10MB</span>
                  </button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 8, border: "1px solid var(--border-color, #e5e7eb)", backgroundColor: "var(--bg-secondary, #f9fafb)" }}>
                    <img
                      src={ticketImagePreview}
                      alt="Selected"
                      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {ticketImage?.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {ticketImage ? `${(ticketImage.size / (1024 * 1024)).toFixed(2)} MB` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTicketImage(null);
                        setTicketImagePreview(null);
                      }}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 6 }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "var(--bg-secondary, #f9fafb)" }}>
              <button
                type="button"
                onClick={() => setIsTicketModalOpen(false)}
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
                onClick={handleSubmitTicket}
                disabled={submittingTicket}
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
                  cursor: submittingTicket ? "not-allowed" : "pointer",
                  opacity: submittingTicket ? 0.7 : 1,
                }}
              >
                {submittingTicket ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{submittingTicket ? (uploadingImage ? "Uploading Image..." : "Submitting...") : "Submit Ticket"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NEED RENEWAL SUPPORT */}
      {isRenewalModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", borderRadius: 16, width: "100%", maxWidth: 540, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#6366f1", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RefreshCw size={16} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Need Renewal Support
                </h3>
              </div>
              <button onClick={() => setIsRenewalModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Type of Renewal Enquiry */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Inquiry / Assistance Type
                </label>
                <select
                  value={enquiryType}
                  onChange={(e) => setEnquiryType(e.target.value as any)}
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
                >
                  {Object.entries(ENQUIRY_TYPES).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Preferred Channel */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Preferred Callback Method
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {(["whatsapp", "phone", "email"] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setPreferredChannel(ch)}
                      style={{
                        padding: "8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "capitalize",
                        border: preferredChannel === ch ? "1.5px solid #6366f1" : "1px solid var(--border-color, #e5e7eb)",
                        backgroundColor: preferredChannel === ch ? "rgba(99, 102, 241, 0.1)" : "transparent",
                        color: preferredChannel === ch ? "#6366f1" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {ch === "whatsapp" ? "WhatsApp" : ch === "phone" ? "Phone Call" : "Email"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
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
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91..."
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
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
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Additional Details / Query
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. We wish to renew for 2 years and add biometric access for our second branch..."
                  value={renewalNotes}
                  onChange={(e) => setRenewalNotes(e.target.value)}
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
            </div>

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 10, backgroundColor: "var(--bg-secondary, #f9fafb)" }}>
              <button
                type="button"
                onClick={() => setIsRenewalModalOpen(false)}
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
                onClick={handleSubmitRenewal}
                disabled={submittingRenewal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  borderRadius: 8,
                  backgroundColor: "#6366f1",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: submittingRenewal ? "not-allowed" : "pointer",
                  opacity: submittingRenewal ? 0.7 : 1,
                }}
              >
                {submittingRenewal ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{submittingRenewal ? "Submitting..." : "Request Renewal Callback"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR SCREENSHOT VIEWING */}
      {previewLightboxUrl && (
        <div
          onClick={() => setPreviewLightboxUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            cursor: "zoom-out",
          }}
        >
          <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
            <img
              src={previewLightboxUrl}
              alt="Full size screenshot"
              style={{
                maxWidth: "100%",
                maxHeight: "90vh",
                borderRadius: 8,
                boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
              }}
            />
            <button
              onClick={() => setPreviewLightboxUrl(null)}
              style={{
                position: "absolute",
                top: -12,
                right: -12,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#ffffff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#111827",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
