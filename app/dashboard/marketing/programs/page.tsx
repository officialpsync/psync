"use client";
// app/dashboard/marketing/programs/page.tsx
// Marketing programs, transformation challenges, and promotional campaigns dashboard.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles, Plus, Search, Calendar, Users, Tag, ArrowUpRight,
  CheckCircle, Clock, Trash2, Edit3, X, ChevronRight, Copy, Check,
  Megaphone, Flame, Award, Percent, Layers
} from "lucide-react";
import { DesignStyles } from "../../components/DesignSystem";
import { useToast } from "../../components/ui";

interface MarketingProgram {
  id: string;
  name: string;
  category: "Transformation" | "Promotional" | "Referral" | "Seasonal" | "Corporate";
  offer: string;
  promoCode?: string;
  startDate: string;
  endDate: string;
  targetAudience: string;
  description: string;
  status: "active" | "scheduled" | "completed" | "draft";
  enrolledCount: number;
  goalCount: number;
}

const DEFAULT_PROGRAMS: MarketingProgram[] = [
  {
    id: "prog-1",
    name: "30-Day Summer Shred Challenge",
    category: "Transformation",
    offer: "Flat 25% OFF + Free Diet Plan",
    promoCode: "SHRED30",
    startDate: "2026-11-01",
    endDate: "2026-12-15",
    targetAudience: "Weight loss & body recomposition seekers",
    description: "High-intensity bootcamps combined with weekly nutrition tracking and cash prizes for top body fat reductions.",
    status: "active",
    enrolledCount: 42,
    goalCount: 50,
  },
  {
    id: "prog-2",
    name: "Member Referral Rewards",
    category: "Referral",
    offer: "Get 1 Month Free for Every Friend",
    promoCode: "BRINGAFRIEND",
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    targetAudience: "Existing active members",
    description: "Incentivize existing gym members to bring friends. Friends receive 10% off their first membership.",
    status: "active",
    enrolledCount: 28,
    goalCount: 40,
  },
  {
    id: "prog-3",
    name: "New Year 2027 Early Bird Kickstart",
    category: "Seasonal",
    offer: "Annual Plan @ ₹14,999 (Save ₹6,000)",
    promoCode: "EARLY2027",
    startDate: "2026-12-01",
    endDate: "2027-01-15",
    targetAudience: "Prospective leads & trial members",
    description: "Lock in fitness goals early before January rush. Includes personal training intro session and kit bag.",
    status: "scheduled",
    enrolledCount: 15,
    goalCount: 100,
  },
  {
    id: "prog-4",
    name: "Corporate Wellness Initiative",
    category: "Corporate",
    offer: "Group Discount 30% for 5+ Employees",
    promoCode: "CORPHEALTH",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    targetAudience: "Tech park & local corporate workers",
    description: "Partner with nearby corporate offices offering bulk wellness memberships and ergonomics workshops.",
    status: "active",
    enrolledCount: 65,
    goalCount: 80,
  },
];

const STORAGE_KEY = "psync.marketing.programs.v1";

export default function MarketingProgramsPage() {
  const { toast, show } = useToast();
  const [programs, setPrograms] = useState<MarketingProgram[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<MarketingProgram | null>(null);
  const [form, setForm] = useState<Partial<MarketingProgram>>({
    category: "Promotional",
    status: "active",
  });

  // Load programs from localStorage or default
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setPrograms(JSON.parse(saved));
      } else {
        setPrograms(DEFAULT_PROGRAMS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROGRAMS));
      }
    } catch {
      setPrograms(DEFAULT_PROGRAMS);
    }
  }, []);

  function savePrograms(list: MarketingProgram[]) {
    setPrograms(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  // Open modal for new
  function handleOpenCreate() {
    setEditingProgram(null);
    setForm({
      name: "",
      category: "Transformation",
      offer: "",
      promoCode: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      targetAudience: "",
      description: "",
      status: "active",
      enrolledCount: 0,
      goalCount: 50,
    });
    setIsModalOpen(true);
  }

  // Open modal for edit
  function handleOpenEdit(prog: MarketingProgram) {
    setEditingProgram(prog);
    setForm({ ...prog });
    setIsModalOpen(true);
  }

  // Handle Save
  function handleSave() {
    if (!form.name?.trim()) {
      show("Program name is required", "error");
      return;
    }
    if (!form.offer?.trim()) {
      show("Offer / discount details are required", "error");
      return;
    }

    if (editingProgram) {
      const updated = programs.map((p) =>
        p.id === editingProgram.id ? ({ ...p, ...form } as MarketingProgram) : p
      );
      savePrograms(updated);
      show(`Updated "${form.name}"`);
    } else {
      const newProgram: MarketingProgram = {
        id: "prog-" + Date.now(),
        name: form.name.trim(),
        category: form.category || "Promotional",
        offer: form.offer.trim(),
        promoCode: form.promoCode?.trim().toUpperCase(),
        startDate: form.startDate || new Date().toISOString().slice(0, 10),
        endDate: form.endDate || "",
        targetAudience: form.targetAudience?.trim() || "All members",
        description: form.description?.trim() || "",
        status: form.status || "active",
        enrolledCount: Number(form.enrolledCount) || 0,
        goalCount: Number(form.goalCount) || 50,
      };
      savePrograms([newProgram, ...programs]);
      show(`Created program "${newProgram.name}"`);
    }
    setIsModalOpen(false);
  }

  // Delete
  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete program "${name}"?`)) return;
    const remaining = programs.filter((p) => p.id !== id);
    savePrograms(remaining);
    show(`Deleted "${name}"`);
  }

  // Copy Promo Code
  function handleCopyCode(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    show(`Copied promo code "${code}"`);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Filtered Programs
  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchOffer = p.offer.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchCode = p.promoCode?.toLowerCase().includes(q);
        if (!matchName && !matchOffer && !matchDesc && !matchCode) return false;
      }
      return true;
    });
  }, [programs, statusFilter, categoryFilter, search]);

  // Stats
  const activeCount = programs.filter((p) => p.status === "active").length;
  const totalEnrolled = programs.reduce((acc, p) => acc + (p.enrolledCount || 0), 0);

  return (
    <div className="ps-page db">
      <DesignStyles />
      {toast}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Marketing</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Marketing Programs
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Campaigns, seasonal challenges, and promotional packages designed to attract and retain members.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleOpenCreate}>
            <Plus size={16} strokeWidth={2.4} /> <span>Create Program</span>
          </button>
        </div>
      </header>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Active Campaigns</span>
            <Megaphone size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>{activeCount}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Live marketing drives</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Total Enrolled</span>
            <Users size={18} style={{ color: "var(--green)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>{totalEnrolled}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Participants across programs</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Total Programs</span>
            <Layers size={18} style={{ color: "var(--purple)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>{programs.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Created in catalog</div>
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
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programs by name, offer, or description..."
            className="ps-input"
            style={{ width: "100%", paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="draft">Draft</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All categories</option>
          <option value="Transformation">Transformation</option>
          <option value="Promotional">Promotional</option>
          <option value="Referral">Referral</option>
          <option value="Seasonal">Seasonal</option>
          <option value="Corporate">Corporate</option>
        </select>
      </div>

      {/* Programs Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
          <Sparkles size={36} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>No marketing programs found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: "0 0 16px" }}>
            Create campaigns and transformation challenges to attract prospective members.
          </p>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleOpenCreate}>
            <Plus size={15} /> Create your first program
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((p) => {
            const isCompleted = p.status === "completed";
            const isScheduled = p.status === "scheduled";
            const progress = p.goalCount > 0 ? Math.min(100, Math.round((p.enrolledCount / p.goalCount) * 100)) : 0;

            return (
              <div
                key={p.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  transition: "box-shadow 160ms, transform 160ms",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--surface-2)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {p.category}
                  </span>

                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: "capitalize",
                      padding: "3px 8px",
                      borderRadius: 12,
                      background:
                        p.status === "active"
                          ? "rgba(34, 197, 94, 0.12)"
                          : isScheduled
                          ? "var(--accent-dim)"
                          : "var(--surface-2)",
                      color:
                        p.status === "active"
                          ? "var(--green)"
                          : isScheduled
                          ? "var(--accent)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    {p.status}
                  </span>
                </div>

                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "var(--text-primary)" }}>
                  {p.name}
                </h3>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--accent)", fontWeight: 650, fontSize: 13.5, marginBottom: 8 }}>
                  <Tag size={14} />
                  <span>{p.offer}</span>
                </div>

                {p.description && (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.45, flex: 1 }}>
                    {p.description}
                  </p>
                )}

                {/* Progress towards enrollment goal */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    <span>Enrolled: <b>{p.enrolledCount}</b> / {p.goalCount}</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 3 }} />
                  </div>
                </div>

                {/* Date & Promo Code Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-tertiary)", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={13} />
                    <span>{p.startDate} {p.endDate ? `→ ${p.endDate}` : ""}</span>
                  </div>

                  {p.promoCode && (
                    <button
                      type="button"
                      onClick={() => handleCopyCode(p.promoCode!, p.id)}
                      style={{
                        background: "var(--surface-2)",
                        border: "1px dashed var(--border)",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Click to copy code"
                    >
                      {copiedId === p.id ? <Check size={11} style={{ color: "var(--green)" }} /> : <Copy size={11} />}
                      {p.promoCode}
                    </button>
                  )}
                </div>

                {/* Foot Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary"
                    style={{ height: 30, padding: "0 10px", fontSize: 12.5 }}
                    onClick={() => handleOpenEdit(p)}
                  >
                    <Edit3 size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary"
                    style={{ height: 30, padding: "0 8px", color: "var(--red)" }}
                    onClick={() => handleDelete(p.id, p.name)}
                    title="Delete program"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Create / Edit */}
      {isModalOpen && (
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
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              maxWidth: 500,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {editingProgram ? "Edit Marketing Program" : "Create Marketing Program"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Program Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6-Week Transformation Bootcamp"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ps-input"
                  style={{ width: "100%", height: 38 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Category
                  </label>
                  <select
                    value={form.category || "Transformation"}
                    onChange={(e) => setForm({ ...form, category: e.target.value as MarketingProgram["category"] })}
                    className="ps-select"
                    style={{ width: "100%", height: 38 }}
                  >
                    <option value="Transformation">Transformation</option>
                    <option value="Promotional">Promotional</option>
                    <option value="Referral">Referral</option>
                    <option value="Seasonal">Seasonal</option>
                    <option value="Corporate">Corporate</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Status
                  </label>
                  <select
                    value={form.status || "active"}
                    onChange={(e) => setForm({ ...form, status: e.target.value as MarketingProgram["status"] })}
                    className="ps-select"
                    style={{ width: "100%", height: 38 }}
                  >
                    <option value="active">Active</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Offer / Incentive *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 20% OFF or Buy 2 Months Get 1 Free"
                  value={form.offer || ""}
                  onChange={(e) => setForm({ ...form, offer: e.target.value })}
                  className="ps-input"
                  style={{ width: "100%", height: 38 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Promo Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FIT2026"
                  value={form.promoCode || ""}
                  onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
                  className="ps-input"
                  style={{ width: "100%", height: 38, textTransform: "uppercase" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.startDate || ""}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate || ""}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Enrolled Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.enrolledCount ?? 0}
                    onChange={(e) => setForm({ ...form, enrolledCount: Number(e.target.value) })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Enrollment Target
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.goalCount ?? 50}
                    onChange={(e) => setForm({ ...form, goalCount: Number(e.target.value) })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Description / Pitch
                </label>
                <textarea
                  placeholder="Explain what the program provides and why members should join..."
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="ps-input"
                  style={{ width: "100%", minHeight: 70, paddingTop: 8 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  className="ps-btn ps-btn--secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn--primary"
                  onClick={handleSave}
                >
                  {editingProgram ? "Save Changes" : "Create Program"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
