"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquareHeart, Star, Plus, Search, Filter, CheckCircle2,
  Clock, AlertCircle, User, RefreshCw, X, ThumbsUp, ThumbsDown,
  Sparkles, Check, ChevronDown, ShieldCheck
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRole } from "../components/useRole";
import { Skeleton, useToast } from "../components/ui";

const supabase = createClient();

type MemberOption = {
  id: string;
  full_name: string;
  phone: string | null;
};

type FeedbackEntry = {
  id: string;
  member_id: string;
  member_name: string;
  rating: number; // 1 to 5
  category: "facility" | "equipment" | "trainers" | "classes" | "billing" | "general";
  comments: string;
  status: "open" | "under_review" | "resolved";
  created_at: string;
  resolved_at?: string;
  resolution_note?: string;
};

const CATEGORIES: Record<FeedbackEntry["category"], string> = {
  facility: "Facility & Cleanliness",
  equipment: "Gym Equipment",
  trainers: "Trainers & Coaching",
  classes: "Group Classes",
  billing: "Billing & Reception",
  general: "General Atmosphere",
};

export default function MemberFeedbackPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState<FeedbackEntry["category"]>("facility");
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState<FeedbackEntry["status"]>("open");
  const [saving, setSaving] = useState(false);

  // Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    if (!roleData.org_id) return;

    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: membersData },
          { data: feedbackPref },
        ] = await Promise.all([
          supabase.from("members").select("id, full_name, phone").eq("org_id", roleData.org_id),
          supabase.from("ps_layout_prefs").select("value").eq("org_id", roleData.org_id).eq("scope", "member_feedback").maybeSingle(),
        ]);

        if (membersData) {
          setMembers(membersData);
        }

        if (feedbackPref?.value && Array.isArray(feedbackPref.value)) {
          setFeedbackList(feedbackPref.value);
        } else {
          setFeedbackList([]);
        }
      } catch (err) {
        console.error("Error loading feedback:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [roleData.org_id]);

  // Save new feedback
  const handleSaveFeedback = async () => {
    if (!roleData.org_id) return;

    const targetMember = members.find((m) => m.id === selectedMemberId);
    if (!targetMember) {
      show({ title: "Please choose a member", type: "error" });
      return;
    }

    if (!comments.trim()) {
      show({ title: "Please enter feedback comments", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const newEntry: FeedbackEntry = {
        id: `fb-${Date.now()}`,
        member_id: targetMember.id,
        member_name: targetMember.full_name,
        rating,
        category,
        comments: comments.trim(),
        status,
        created_at: now,
      };

      const updated = [newEntry, ...feedbackList];

      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "member_feedback",
          value: updated,
          updated_at: now,
        },
        { onConflict: "user_id,scope" }
      );

      setFeedbackList(updated);
      setIsModalOpen(false);
      setSelectedMemberId("");
      setComments("");
      setRating(5);
      show({ title: "Member feedback recorded successfully", type: "success" });
    } catch (err) {
      console.error("Error saving feedback:", err);
      show({ title: "Failed to save feedback", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Toggle Status (Resolved / Open)
  const handleToggleStatus = async (id: string, newStatus: FeedbackEntry["status"]) => {
    if (!roleData.org_id) return;

    const updated = feedbackList.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status: newStatus,
          resolved_at: newStatus === "resolved" ? new Date().toISOString() : undefined,
        };
      }
      return item;
    });

    setFeedbackList(updated);

    try {
      await supabase.from("ps_layout_prefs").upsert(
        {
          org_id: roleData.org_id,
          user_id: roleData.user_id,
          scope: "member_feedback",
          value: updated,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scope" }
      );
      show({ title: `Feedback status updated to ${newStatus}`, type: "success" });
    } catch (err) {
      console.error("Error updating feedback status:", err);
      show({ title: "Failed to update status", type: "error" });
    }
  };

  // Calculated Metrics
  const metrics = useMemo(() => {
    if (feedbackList.length === 0) {
      return { avgRating: null, total: 0, satisfactionPct: null, pending: 0 };
    }

    const sum = feedbackList.reduce((acc, f) => acc + f.rating, 0);
    const avg = Number((sum / feedbackList.length).toFixed(1));

    const positive = feedbackList.filter((f) => f.rating >= 4).length;
    const satPct = Math.round((positive / feedbackList.length) * 100);

    const pendingCount = feedbackList.filter((f) => f.status !== "resolved").length;

    return { avgRating: avg, total: feedbackList.length, satisfactionPct: satPct, pending: pendingCount };
  }, [feedbackList]);

  // Filtered List
  const filteredList = useMemo(() => {
    return feedbackList.filter((f) => {
      // Rating filter
      if (ratingFilter !== "all") {
        if (ratingFilter === "5" && f.rating !== 5) return false;
        if (ratingFilter === "4" && f.rating !== 4) return false;
        if (ratingFilter === "low" && f.rating > 3) return false;
      }

      // Status filter
      if (statusFilter !== "all" && f.status !== statusFilter) return false;

      // Category filter
      if (categoryFilter !== "all" && f.category !== categoryFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          f.member_name.toLowerCase().includes(q) ||
          f.comments.toLowerCase().includes(q) ||
          CATEGORIES[f.category]?.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [feedbackList, ratingFilter, statusFilter, categoryFilter, searchQuery]);

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#f59e0b", textTransform: "uppercase" }}>
              MEMBER RETENTION & SATISFACTION
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            Member Feedback & Reviews
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Collect in-person ratings, reviews, suggestions, and member satisfaction logs.
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
            backgroundColor: "#f59e0b",
            color: "#ffffff",
            fontSize: 13.5,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(245, 158, 11, 0.25)",
          }}
        >
          <Plus size={16} />
          <span>Log Member Feedback</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Average Gym Rating</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(245, 158, 11, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b" }}>
              <Star size={16} fill="#f59e0b" />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 50, height: 32 }} /> : metrics.avgRating ? `${metrics.avgRating} / 5.0` : "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            {metrics.total > 0 ? `Based on ${metrics.total} recorded review${metrics.total > 1 ? "s" : ""}` : "No reviews recorded yet"}
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Total Feedback Entries</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(99, 102, 241, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
              <MessageSquareHeart size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : metrics.total}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Logged member responses
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Member Satisfaction</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
              <ThumbsUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 50, height: 32 }} /> : metrics.satisfactionPct !== null ? `${metrics.satisfactionPct}%` : "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Rated 4 or 5 stars
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Open Follow-ups</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
              <Clock size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : metrics.pending}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Pending staff attention
          </div>
        </div>
      </div>

      {/* Main Table / Container */}
      <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
        {/* Filter bar */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 340 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search member, comments, or category..."
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
            {/* Rating Filter */}
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
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
              <option value="all">All Ratings</option>
              <option value="5">5 Stars only</option>
              <option value="4">4 Stars only</option>
              <option value="low">1-3 Stars (Attention)</option>
            </select>

            {/* Status Filter */}
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
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
              <option value="all">All Categories</option>
              {Object.entries(CATEGORIES).map(([catKey, label]) => (
                <option key={catKey} value={catKey}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: 32 }}>
            <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 60, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 60, width: "100%" }} />
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "64px 20px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <MessageSquareHeart size={26} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
              No member feedback recorded yet
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto 20px" }}>
              Keep pulse on member satisfaction. Log in-person reviews, suggestions on gym equipment, or facility cleanliness.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 8,
                backgroundColor: "#f59e0b",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              <Plus size={15} />
              <span>Log First Feedback Entry</span>
            </button>
          </div>
        ) : (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {filteredList.map((entry) => (
              <div
                key={entry.id}
                style={{
                  border: "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: 12,
                  padding: "18px 20px",
                  backgroundColor: "var(--card-bg, #ffffff)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
                      {entry.member_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {entry.member_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                        {new Date(entry.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Star Rating display */}
                    <div style={{ display: "flex", gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={15}
                          fill={s <= entry.rating ? "#f59e0b" : "none"}
                          color={s <= entry.rating ? "#f59e0b" : "#d1d5db"}
                        />
                      ))}
                    </div>

                    {/* Category pill */}
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, backgroundColor: "var(--bg-secondary, #f3f4f6)", color: "var(--text-secondary)" }}>
                      {CATEGORIES[entry.category]}
                    </span>

                    {/* Status pill */}
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 6,
                      backgroundColor: entry.status === "resolved" ? "rgba(16, 185, 129, 0.12)" : entry.status === "under_review" ? "rgba(59, 130, 246, 0.12)" : "rgba(239, 68, 68, 0.12)",
                      color: entry.status === "resolved" ? "#10b981" : entry.status === "under_review" ? "#3b82f6" : "#ef4444",
                      textTransform: "capitalize",
                    }}>
                      {entry.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  "{entry.comments}"
                </p>

                {/* Status Toggle Action */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {entry.status !== "resolved" ? (
                    <button
                      onClick={() => handleToggleStatus(entry.id, "resolved")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1px solid #10b981",
                        backgroundColor: "rgba(16, 185, 129, 0.08)",
                        color: "#10b981",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      <Check size={13} />
                      <span>Mark Resolved</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleStatus(entry.id, "open")}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--border-color, #e5e7eb)",
                        backgroundColor: "transparent",
                        color: "var(--text-tertiary)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Log Member Feedback */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ backgroundColor: "var(--card-bg, #ffffff)", borderRadius: 16, width: "100%", maxWidth: 540, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#f59e0b", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={16} fill="#ffffff" />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Log Member Feedback
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Member Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Select Member
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
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
                  <option value="">-- Choose member --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone || "No phone"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Star Rating Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Rating (1 to 5 Stars)
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      <Star
                        size={28}
                        fill={s <= rating ? "#f59e0b" : "none"}
                        color={s <= rating ? "#f59e0b" : "#d1d5db"}
                      />
                    </button>
                  ))}
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", marginLeft: 8 }}>
                    {rating} Star{rating > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Category & Status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
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
                    {Object.entries(CATEGORIES).map(([catKey, label]) => (
                      <option key={catKey} value={catKey}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    Follow-up Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
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
                    <option value="open">Open (Needs Attention)</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved Immediately</option>
                  </select>
                </div>
              </div>

              {/* Comments */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Feedback Comments / Member Voice
                </label>
                <textarea
                  rows={4}
                  placeholder="Record member's thoughts, suggestions, or praise..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
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
                onClick={handleSaveFeedback}
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  borderRadius: 8,
                  backgroundColor: "#f59e0b",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>{saving ? "Saving..." : "Record Feedback"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
