"use client";
// app/dashboard/members/page.tsx
// Members list: status tabs with counts, search, sort, an advanced Filters popover with removable chips,
// and saved views (private per user, ps_layout_prefs "members_views").
// Copy plan flow lives in ./components/CopyPlanSheet (type → plan → member → review & edit).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, X, SlidersHorizontal, ChevronRight, ChevronLeft, ChevronDown, Check,
  Download, Trash2, ArrowUpDown, Users, Loader2, FileSpreadsheet, FileText, RefreshCw,
  Upload, Pin, Archive, ArchiveRestore,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase";
import { Avatar, Skeleton, useToast, formatDate, formatINR } from "../components/ui";
import { RenewalSheet } from "./components/RenewalSheet";
import { CreateMemberModal } from "./components/CreateMemberModal";
import { loadPref, savePref } from "../leads/lib";

const supabase = createClient();

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.05 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function waLink(phone: string | null, text?: string) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  const num = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function HighlightText({ text, highlight }: { text: string | null | undefined; highlight: string }) {
  if (!text) return null;
  if (!highlight || !highlight.trim()) return <>{text}</>;
  const h = highlight.trim();
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === h.toLowerCase() ? (
          <mark key={i} className="mb-search-mark">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

const TAG_GROUPS = [
  { group: "Blood sugar", key: "blood_sugar", items: ["Type 2 Diabetes", "Pre-Diabetes", "Insulin Resistance"] },
  { group: "Hormonal", key: "hormonal", items: ["PCOS", "Hypothyroidism", "Hyperthyroidism"] },
  { group: "Heart", key: "heart", items: ["Hypertension", "High Cholesterol", "Dyslipidemia"] },
  { group: "Digestive", key: "digestive", items: ["GERD", "Acid Reflux", "IBS", "Constipation"] },
  { group: "Liver", key: "liver", items: ["NAFLD", "Fatty Liver"] },
  { group: "Kidney", key: "kidney", items: ["Chronic Kidney Disease", "CKD"] },
  { group: "Other", key: "other", items: ["Celiac Disease"] },
  { group: "Gut symptoms", key: "gut_symptoms", items: ["Bloating", "Acidity", "Heartburn", "Constipation", "Gas"] },
  { group: "Food intolerances", key: "food_intolerances", items: ["Lactose", "Gluten", "Fructose", "Soy"] },
];

const asList = (v: string[] | string | null | undefined): string[] =>
  !v ? [] : Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean);

function memberAllTags(m: MemberRaw): string[] {
  const list: string[] = [
    ...asList(m.medical_conditions),
    ...asList(m.gut_symptoms),
    ...asList(m.food_intolerances),
  ];
  const seen = new Set<string>();
  const res: string[] = [];
  for (const item of list) {
    const k = item.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      res.push(item.trim());
    }
  }
  return res;
}

type Membership = {
  id?: string;
  status: string;
  end_date: string;
  membership_plans: {
    id?: string;
    name: string;
    duration_days?: number | null;
    price_paise?: number | null;
  } | null;
};
type MemberRaw = {
  id: string; full_name: string; phone: string | null; email: string | null; sex: string | null;
  date_of_birth: string | null; created_at: string;
  status?: string | null;
  outstanding_balance_paise?: number | null;
  medical_conditions?: string[] | string | null;
  gut_symptoms?: string[] | string | null;
  food_intolerances?: string[] | string | null;
  primary_goal?: string | null;
  diet_type?: string | null;
  memberships: Membership[];
};
type StatusKey = "active" | "expiring" | "expired" | "none";
type Member = MemberRaw & {
  status: StatusKey;
  memberStatus: "active" | "inactive";
  isArchived: boolean;
  plan: string | null;
  planId: string | null;
  planPricePaise: number | null;
  planDurationDays: number | null;
  endDate: string | null;
  daysLeft: number | null;
  age: number | null;
  duesPaise: number;
  hasDiet: boolean;
  hasWorkout: boolean;
  allTags: string[];
};

function enrich(m: MemberRaw, diet: Set<string>, workout: Set<string>): Member {
  const isArchived = m.status === "archived" || m.status === "deleted";
  const list = m.memberships ?? [];
  const active = list.find((x) => x.status === "active");
  const latest = active ?? [...list].sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""))[0];
  let status: StatusKey = "none";
  let daysLeft: number | null = null;
  if (latest?.end_date) {
    daysLeft = Math.ceil((new Date(`${latest.end_date.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86400000);
    status = !active || daysLeft < 0 ? "expired" : daysLeft <= 7 ? "expiring" : "active";
  }
  const age = m.date_of_birth ? Math.floor((Date.now() - new Date(m.date_of_birth).getTime()) / 31557600000) : null;
  const memberStatus = (m.status === "inactive" ? "inactive" : "active") as "active" | "inactive";
  const duesPaise = Math.max(0, Number(m.outstanding_balance_paise || 0));

  return {
    ...m,
    status,
    memberStatus,
    isArchived,
    daysLeft,
    age,
    plan: latest?.membership_plans?.name ?? null,
    planId: latest?.membership_plans?.id ?? null,
    planPricePaise: latest?.membership_plans?.price_paise ?? null,
    planDurationDays: latest?.membership_plans?.duration_days ?? null,
    endDate: latest?.end_date ?? null,
    duesPaise,
    hasDiet: diet.has(m.id),
    hasWorkout: workout.has(m.id),
    allTags: memberAllTags(m),
  };
}

const STATUS: Record<StatusKey, { label: string; cls: string }> = {
  active: { label: "Active", cls: "mb-pill--green" },
  expiring: { label: "Expiring", cls: "mb-pill--amber" },
  expired: { label: "Expired", cls: "mb-pill--red" },
  none: { label: "No plan", cls: "mb-pill--grey" },
};

// ── Filters ──────────────────────────────────────────────────────────────────

type Tab = "all" | StatusKey | "archived";
type YesNo = "any" | "yes" | "no";
type Filters = {
  plans: string[]; gender: string[]; ageMin: string; ageMax: string;
  cycle: "any" | "monthly" | "yearly";
  joined: "any" | "7" | "30" | "90" | "month" | "year" | "custom"; joinedFrom: string; joinedTo: string;
  ends: "any" | "7" | "15" | "30" | "past";
  diet: YesNo; workout: YesNo; birthday: boolean; missing: boolean;
  tags: string[];
  tagMatch: "any" | "all";
};
const NO_FILTERS: Filters = {
  plans: [], gender: [], ageMin: "", ageMax: "", cycle: "any", joined: "any", joinedFrom: "", joinedTo: "",
  ends: "any", diet: "any", workout: "any", birthday: false, missing: false,
  tags: [], tagMatch: "any",
};
type View = { id: string; name: string; tab: Tab; filters: Filters; pinned?: boolean };
type SortKey = "newest" | "oldest" | "name" | "ending";

const JOINED_LABEL = { any: "Any time", "7": "Last 7 days", "30": "Last 30 days", "90": "Last 3 months", month: "This month", year: "This year", custom: "Custom" } as const;
const ENDS_LABEL = { any: "Any", "7": "Next 7 days", "15": "Next 15 days", "30": "Next 30 days", past: "Already ended" } as const;
const SORT_LABEL: Record<SortKey, string> = { newest: "Newest first", oldest: "Oldest first", name: "Name A–Z", ending: "Plan ending soonest" };

function day0(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function matches(m: Member, f: Filters): boolean {
  if (f.plans.length && !f.plans.includes(m.plan ?? "__none")) return false;
  if (f.gender.length) {
    const s = (m.sex ?? "").toLowerCase().trim();
    const gKey = (s === "male" || s === "m") ? "male" : (s === "female" || s === "f") ? "female" : "__none";
    if (!f.gender.includes(gKey)) return false;
  }
  if (f.cycle !== "any") {
    const d = m.planDurationDays;
    const n = (m.plan ?? "").toLowerCase();
    const isYearly = (d !== null && d >= 300) || n.includes("year") || n.includes("annual") || n.includes("12 month") || n.includes("12m") || n.includes("365");
    const isMonthly = (d !== null && d >= 20 && d <= 60) || n.includes("month") || n.includes("1m") || n.includes("30 day");
    if (f.cycle === "yearly" && !isYearly) return false;
    if (f.cycle === "monthly" && !isMonthly) return false;
  }
  if (f.ageMin && (m.age === null || m.age < Number(f.ageMin))) return false;
  if (f.ageMax && (m.age === null || m.age > Number(f.ageMax))) return false;
  if (f.joined !== "any") {
    const j = day0(new Date(m.created_at)); const t = day0();
    if (f.joined === "month" && (j.getMonth() !== t.getMonth() || j.getFullYear() !== t.getFullYear())) return false;
    if (f.joined === "year" && j.getFullYear() !== t.getFullYear()) return false;
    if (["7", "30", "90"].includes(f.joined) && j < new Date(t.getTime() - Number(f.joined) * 86400000)) return false;
    if (f.joined === "custom") {
      if (f.joinedFrom && j < day0(new Date(`${f.joinedFrom}T00:00:00`))) return false;
      if (f.joinedTo && j > day0(new Date(`${f.joinedTo}T00:00:00`))) return false;
    }
  }
  if (f.ends !== "any") {
    if (m.daysLeft === null) return false;
    if (f.ends === "past" ? m.daysLeft >= 0 : m.daysLeft < 0 || m.daysLeft > Number(f.ends)) return false;
  }
  if (f.diet !== "any" && m.hasDiet !== (f.diet === "yes")) return false;
  if (f.workout !== "any" && m.hasWorkout !== (f.workout === "yes")) return false;
  if (f.birthday && (!m.date_of_birth || new Date(m.date_of_birth).getMonth() !== new Date().getMonth())) return false;
  if (f.missing && m.phone && m.email) return false;
  if (f.tags && f.tags.length > 0) {
    const memberTagSet = new Set(m.allTags.map((t) => t.toLowerCase()));
    if (f.tagMatch === "all") {
      if (!f.tags.every((t) => memberTagSet.has(t.toLowerCase()))) return false;
    } else {
      if (!f.tags.some((t) => memberTagSet.has(t.toLowerCase()))) return false;
    }
  }
  return true;
}

function chipsOf(f: Filters): { key: string; label: string; clear: Partial<Filters> }[] {
  const c: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.plans.length) c.push({ key: "plans", label: `Plan: ${f.plans.map((p) => (p === "__none" ? "None" : p)).join(", ")}`, clear: { plans: [] } });
  if (f.cycle !== "any") c.push({ key: "cycle", label: `Duration: ${f.cycle === "monthly" ? "Monthly" : "Yearly"}`, clear: { cycle: "any" } });
  if (f.gender.length) c.push({
    key: "gender",
    label: `Gender: ${f.gender.map((g) => (g === "male" ? "Male" : g === "female" ? "Female" : "Not set")).join(", ")}`,
    clear: { gender: [] }
  });
  if (f.ageMin || f.ageMax) c.push({ key: "age", label: `Age: ${f.ageMin || "any"}–${f.ageMax || "any"}`, clear: { ageMin: "", ageMax: "" } });
  if (f.joined !== "any") c.push({
    key: "joined",
    label: `Joined: ${f.joined === "custom" ? `${f.joinedFrom ? formatDate(f.joinedFrom) : "start"} – ${f.joinedTo ? formatDate(f.joinedTo) : "today"}` : JOINED_LABEL[f.joined]}`,
    clear: { joined: "any", joinedFrom: "", joinedTo: "" },
  });
  if (f.ends !== "any") c.push({ key: "ends", label: `Plan ends: ${ENDS_LABEL[f.ends]}`, clear: { ends: "any" } });
  if (f.diet !== "any") c.push({ key: "diet", label: f.diet === "yes" ? "Has diet plan" : "No diet plan", clear: { diet: "any" } });
  if (f.workout !== "any") c.push({ key: "workout", label: f.workout === "yes" ? "Has workout" : "No workout", clear: { workout: "any" } });
  if (f.birthday) c.push({ key: "birthday", label: "Birthday this month", clear: { birthday: false } });
  if (f.missing) c.push({ key: "missing", label: "Missing phone or email", clear: { missing: false } });
  if (f.tags && f.tags.length > 0) {
    f.tags.forEach((tag) => {
      c.push({
        key: `tag-${tag}`,
        label: `Tag: ${tag}`,
        clear: { tags: f.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) },
      });
    });
  }
  return c;
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ── Filters popover ──────────────────────────────────────────────────────────

function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="mb-opt" data-on={on} onClick={onClick}>{on && <Check size={12} strokeWidth={3} />}{children}</button>;
}

function TagFilterCards({
  selected,
  onChange,
  searchQuery = "",
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  searchQuery?: string;
}) {
  const q = searchQuery.trim().toLowerCase();
  const toggle = (item: string) => {
    const norm = item.toLowerCase();
    const exists = selected.some((s) => s.toLowerCase() === norm);
    if (exists) {
      onChange(selected.filter((s) => s.toLowerCase() !== norm));
    } else {
      onChange([...selected, item]);
    }
  };

  const visibleGroups = useMemo(() => {
    if (!q) return TAG_GROUPS;
    return TAG_GROUPS.map((g) => {
      const matchGroup = g.group.toLowerCase().includes(q);
      const matchingItems = g.items.filter((item) => matchGroup || item.toLowerCase().includes(q));
      return matchingItems.length > 0 ? { ...g, items: matchingItems } : null;
    }).filter(Boolean) as typeof TAG_GROUPS;
  }, [q]);

  if (visibleGroups.length === 0) {
    return (
      <div className="mb-empty" style={{ padding: "30px 10px" }}>
        <p style={{ margin: 0, fontSize: 13 }}>No tags match &ldquo;{searchQuery}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="mb-tag-container">
      {selected.length > 0 && (
        <div className="mb-tag-selected-bar">
          <span className="mb-tag-selected-label">Selected ({selected.length}):</span>
          <div className="mb-tag-selected-chips">
            {selected.map((item) => (
              <button
                key={item}
                type="button"
                className="mb-tag-selected-chip"
                onClick={() => toggle(item)}
                title={`Remove ${item}`}
              >
                <span>{item}</span>
                <X size={11} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mb-tag-clear-btn"
            onClick={() => onChange([])}
            title="Deselect all tags"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mb-tag-list">
        {visibleGroups.map((g) => {
          const groupActiveCount = g.items.filter((item) =>
            selected.some((s) => s.toLowerCase() === item.toLowerCase())
          ).length;

          return (
            <div key={g.key} className="mb-tag-row" data-active={groupActiveCount > 0}>
              <div className="mb-tag-row-header">
                <span className="mb-tag-row-title">{g.group}</span>
                {groupActiveCount > 0 && (
                  <span className="mb-tag-row-badge">{groupActiveCount}</span>
                )}
              </div>
              <div className="mb-tag-row-chips">
                {g.items.map((item) => {
                  const on = selected.some((s) => s.toLowerCase() === item.toLowerCase());
                  return (
                    <button
                      key={item}
                      type="button"
                      className="mb-tag-pill"
                      data-selected={on}
                      onClick={() => toggle(item)}
                      aria-pressed={on}
                    >
                      {on && <Check size={11} strokeWidth={2.8} className="mb-tag-pill-check" />}
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ExportFormat = "csv" | "xlsx" | "pdf";

function FilterPanel({ f, set, plans, count, onClear, onClose, onExport }: {
  f: Filters; set: (p: Partial<Filters>) => void; plans: string[]; count: number; onClear: () => void; onClose: () => void; onExport: (format: ExportFormat) => void;
}) {
  const [filterTab, setFilterTab] = useState<"general" | "tags">("general");
  const [tagSearch, setTagSearch] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className={`mb-pop mb-pop--right ${filterTab === "tags" ? "mb-pop--wide" : ""}`} onClick={(e) => { e.stopPropagation(); setExportMenuOpen(false); }} role="dialog" aria-label="Filters">
      <div className="mb-pop-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong>Filters</strong>
          <div className="mb-seg mb-seg--sm" style={{ width: 170 }}>
            <button
              type="button"
              data-on={filterTab === "general"}
              onClick={() => setFilterTab("general")}
            >
              General
            </button>
            <button
              type="button"
              data-on={filterTab === "tags"}
              onClick={() => setFilterTab("tags")}
            >
              Tags {f.tags.length > 0 ? `(${f.tags.length})` : ""}
            </button>
          </div>
        </div>
        <button type="button" className="mb-icon" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>

      {filterTab === "general" ? (
        <div className="mb-pop-body">
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <h4>Health & Medical Tags</h4>
              <button
                type="button"
                className="mb-link"
                style={{ fontSize: 12, padding: 0 }}
                onClick={() => setFilterTab("tags")}
              >
                View all categories &rarr;
              </button>
            </div>
            <div className="mb-opts">
              {["PCOS", "Type 2 Diabetes", "Hypertension", "GERD", "Bloating", "Lactose"].map((t) => {
                const on = f.tags.some((x) => x.toLowerCase() === t.toLowerCase());
                return (
                  <Opt
                    key={t}
                    on={on}
                    onClick={() => {
                      const next = on
                        ? f.tags.filter((x) => x.toLowerCase() !== t.toLowerCase())
                        : [...f.tags, t];
                      set({ tags: next });
                    }}
                  >
                    {t}
                  </Opt>
                );
              })}
            </div>
          </section>

          <section>
            <h4>Membership plan</h4>
            <div className="mb-opts">
              {[...plans, "__none"].map((p) => <Opt key={p} on={f.plans.includes(p)} onClick={() => set({ plans: toggle(f.plans, p) })}>{p === "__none" ? "No plan" : p}</Opt>)}
            </div>
          </section>
          <section>
            <h4>Membership duration</h4>
            <div className="mb-seg">
              {(["any", "monthly", "yearly"] as const).map((c) => (
                <button key={c} type="button" data-on={f.cycle === c} onClick={() => set({ cycle: c })}>
                  {c === "any" ? "Any" : c === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Plan ends</h4>
            <div className="mb-opts">
              {(Object.keys(ENDS_LABEL) as Filters["ends"][]).map((k) => <Opt key={k} on={f.ends === k} onClick={() => set({ ends: k })}>{ENDS_LABEL[k]}</Opt>)}
            </div>
          </section>
          <section>
            <h4>Joined</h4>
            <div className="mb-opts">
              {(Object.keys(JOINED_LABEL) as Filters["joined"][]).map((k) => <Opt key={k} on={f.joined === k} onClick={() => set({ joined: k })}>{JOINED_LABEL[k]}</Opt>)}
            </div>
            {f.joined === "custom" && (
              <div className="mb-range">
                <input type="date" className="mb-input" value={f.joinedFrom} onChange={(e) => set({ joinedFrom: e.target.value })} aria-label="Joined from" />
                <span>to</span>
                <input type="date" className="mb-input" value={f.joinedTo} onChange={(e) => set({ joinedTo: e.target.value })} aria-label="Joined to" />
              </div>
            )}
          </section>
          <div className="mb-two">
            <section>
              <h4>Diet plan</h4>
              <div className="mb-seg">
                {(["any", "yes", "no"] as YesNo[]).map((v) => <button key={v} type="button" data-on={f.diet === v} onClick={() => set({ diet: v })}>{v === "any" ? "Any" : v === "yes" ? "Has" : "None"}</button>)}
              </div>
            </section>
            <section>
              <h4>Workout</h4>
              <div className="mb-seg">
                {(["any", "yes", "no"] as YesNo[]).map((v) => <button key={v} type="button" data-on={f.workout === v} onClick={() => set({ workout: v })}>{v === "any" ? "Any" : v === "yes" ? "Has" : "None"}</button>)}
              </div>
            </section>
          </div>
          <div className="mb-two">
            <section>
              <h4>Gender</h4>
              <div className="mb-opts">
                {[
                  { id: "male", label: "Male" },
                  { id: "female", label: "Female" },
                  { id: "__none", label: "Not set" },
                ].map((g) => (
                  <Opt key={g.id} on={f.gender.includes(g.id)} onClick={() => set({ gender: toggle(f.gender, g.id) })}>
                    {g.label}
                  </Opt>
                ))}
              </div>
            </section>
            <section>
              <h4>Age</h4>
              <div className="mb-range">
                <input type="number" min={0} className="mb-input" placeholder="Min" value={f.ageMin} onChange={(e) => set({ ageMin: e.target.value })} />
                <span>to</span>
                <input type="number" min={0} className="mb-input" placeholder="Max" value={f.ageMax} onChange={(e) => set({ ageMax: e.target.value })} />
              </div>
            </section>
          </div>
          <section>
            <h4>More</h4>
            <label className="mb-check"><input type="checkbox" checked={f.birthday} onChange={(e) => set({ birthday: e.target.checked })} /> Birthday this month</label>
            <label className="mb-check"><input type="checkbox" checked={f.missing} onChange={(e) => set({ missing: e.target.checked })} /> Missing phone or email</label>
          </section>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mb-search mb-search--block">
              <Search size={14} />
              <input
                type="search"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Search tags (e.g. PCOS, Diabetes, Bloating)..."
                aria-label="Search health tags"
              />
              {tagSearch && (
                <button type="button" className="mb-x" onClick={() => setTagSearch("")} aria-label="Clear tag search">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="mb-seg mb-seg--sm" style={{ width: 140, flexShrink: 0 }}>
              <button
                type="button"
                data-on={f.tagMatch === "any"}
                onClick={() => set({ tagMatch: "any" })}
                title="Match members having ANY of the selected tags"
              >
                Any tag
              </button>
              <button
                type="button"
                data-on={f.tagMatch === "all"}
                onClick={() => set({ tagMatch: "all" })}
                title="Match members having ALL selected tags"
              >
                All tags
              </button>
            </div>
          </div>
          <div className="mb-pop-body mb-pop-body--tags">
            <TagFilterCards
              selected={f.tags}
              onChange={(next) => set({ tags: next })}
              searchQuery={tagSearch}
            />
          </div>
        </div>
      )}

      <div className="mb-pop-foot">
        <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={onClear}>Reset</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="mb-anchor" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ps-btn ps-btn--secondary ps-btn--sm mb-export-btn"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={count === 0}
              aria-haspopup="true"
              aria-expanded={exportMenuOpen}
              title="Export filtered members (CSV, Excel, PDF)"
            >
              <Download size={14} />
              <span>Export ({count})</span>
              <ChevronDown size={12} className={`mb-export-caret ${exportMenuOpen ? "mb-export-caret--up" : ""}`} />
            </button>

            {exportMenuOpen && (
              <div
                className="mb-menu mb-menu--right"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  right: 0,
                  top: "auto",
                  minWidth: 210,
                  zIndex: 100,
                  padding: 4,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-tertiary)", padding: "4px 8px 6px" }}>
                  Export format
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExport("csv");
                    onClose();
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileText size={15} style={{ color: "var(--accent)" }} />
                    <span>CSV (.csv)</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExport("xlsx");
                    onClose();
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FileSpreadsheet size={15} style={{ color: "#10b981" }} />
                    <span>Excel (.xlsx)</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Workbook</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExport("pdf");
                    onClose();
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Download size={15} style={{ color: "#ef4444" }} />
                    <span>PDF document</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Table</span>
                </button>
              </div>
            )}
          </div>
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={onClose}>
            Show {count} member{count === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, show } = useToast();
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>(() => {
    const p = params.get("filter");
    return p === "active" || p === "expiring" || p === "expired" || p === "none" ? p : "all";
  });
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState<number>(-1);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("newest");
  const [panel, setPanel] = useState<"filters" | "sort" | "views" | null>(null);
  const [exportIncludeTags, setExportIncludeTags] = useState(true);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [views, setViews] = useState<View[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);

  // Only show up to 3 saved pins created by the user, nothing by default
  const savedPinsToDisplay = useMemo(() => views.slice(0, 3), [views]);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const [page, setPage] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [renewMember, setRenewMember] = useState<Member | null>(null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const PAGE = 25;

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
    if (!role) return;
    setOrgId(role.org_id); setUserId(user.id);
    const [mRes, dRes, wRes, v] = await Promise.all([
      supabase.from("members")
        .select("id, full_name, phone, email, sex, date_of_birth, created_at, status, outstanding_balance_paise, medical_conditions, gut_symptoms, food_intolerances, primary_goal, diet_type, memberships(id, status, end_date, membership_plans(id, name, duration_days, price_paise))")
        .eq("org_id", role.org_id).order("created_at", { ascending: false }),
      supabase.from("member_diet_plans").select("member_id").eq("org_id", role.org_id).eq("status", "active"),
      supabase.from("member_workout_programs").select("member_id").eq("org_id", role.org_id).eq("status", "active"),
      loadPref<View[]>(user.id, "members_views"),
    ]);
    const diet = new Set((dRes.data ?? []).map((r: { member_id: string }) => r.member_id));
    const wk = new Set((wRes.data ?? []).map((r: { member_id: string }) => r.member_id));
    setMembers(((mRes.data ?? []) as unknown as MemberRaw[]).map((m) => enrich(m, diet, wk)));
    if (Array.isArray(v)) setViews(v);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!statusMenuId) return;
    const close = () => setStatusMenuId(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setStatusMenuId(null); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", key);
    };
  }, [statusMenuId]);

  async function handleQuickStatusChange(m: Member, newStatus: "active" | "inactive") {
    setChangingStatusId(m.id);
    setStatusMenuId(null);
    try {
      if (newStatus === "inactive") {
        await Promise.all([
          supabase.from("members").update({ status: "inactive" }).eq("id", m.id),
          supabase.from("memberships").update({ status: "expired" }).eq("member_id", m.id).eq("status", "active"),
        ]);
        show(`${m.full_name} marked as Inactive`);
      } else {
        const list = m.memberships ?? [];
        const latest = list[0];
        if (latest?.id) {
          const today = new Date();
          const end = new Date(today);
          end.setDate(end.getDate() + (latest.membership_plans?.duration_days || 30));
          const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          await Promise.all([
            supabase.from("members").update({ status: "active" }).eq("id", m.id),
            supabase.from("memberships").update({ status: "active", end_date: iso(end) }).eq("id", latest.id),
          ]);
        } else {
          await supabase.from("members").update({ status: "active" }).eq("id", m.id);
        }
        show(`${m.full_name} marked as Active`);
      }
      await load();
    } catch {
      show("Could not update status. Please try again.", "error");
    } finally {
      setChangingStatusId(null);
    }
  }

  async function handleRestoreMember(m: Member) {
    setChangingStatusId(m.id);
    try {
      const { error } = await supabase.from("members").update({ status: "active" }).eq("id", m.id);
      if (error) throw error;
      show(`${m.full_name} restored to active members`);
      await load();
    } catch (err: any) {
      show("Could not restore member: " + (err?.message || "Unknown error"), "error");
    } finally {
      setChangingStatusId(null);
    }
  }

  async function handleArchiveMember(m: Member) {
    if (!confirm(`Are you sure you want to archive ${m.full_name}?`)) return;
    setChangingStatusId(m.id);
    try {
      const res = await supabase.from("members").update({ status: "archived" }).eq("id", m.id);
      if (res.error && res.error.code === "23514") {
        await supabase.from("members").update({ status: "deleted" }).eq("id", m.id);
      }
      show(`${m.full_name} archived`);
      await load();
    } catch (err: any) {
      show("Could not archive member: " + (err?.message || "Unknown error"), "error");
    } finally {
      setChangingStatusId(null);
    }
  }

  // Click outside to dismiss search suggestions
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSearchSelectedIndex(-1);
  }, [search]);

  // "/" focuses search, Esc closes popovers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setPanel(null); setSearchFocused(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];

    const scored = members
      .map((m) => {
        const name = (m.full_name || "").toLowerCase();
        const phone = (m.phone || "").toLowerCase();
        const email = (m.email || "").toLowerCase();

        let score = 0;
        if (name.startsWith(query)) score = 100;
        else if (name.split(/\s+/).some((w) => w.startsWith(query))) score = 80;
        else if (name.includes(query)) score = 60;
        else if (phone.startsWith(query) || phone.replace(/\D/g, "").startsWith(query.replace(/\D/g, ""))) score = 50;
        else if (phone.includes(query)) score = 40;
        else if (email.startsWith(query)) score = 30;
        else if (email.includes(query)) score = 20;

        return { member: m, score };
      })
      .filter((item) => item.score > 0);

    scored.sort((a, b) => b.score - a.score || a.member.full_name.localeCompare(b.member.full_name));
    return scored.slice(0, 6).map((item) => item.member);
  }, [members, search]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSearchFocused(false);
      return;
    }

    if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setSearchSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setSearchSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      return;
    }

    if (e.key === "Enter") {
      if (searchSelectedIndex >= 0 && searchSelectedIndex < suggestions.length) {
        e.preventDefault();
        const target = suggestions[searchSelectedIndex];
        setSearchFocused(false);
        router.push(`/dashboard/members/${target.id}`);
      } else {
        setSearchFocused(false);
      }
    }
  }

  const plans = useMemo(() => [...new Set(members.map((m) => m.plan).filter(Boolean) as string[])].sort(), [members]);
  const genders = useMemo(() => [...new Set(members.map((m) => (m.sex ?? "").toLowerCase()).filter(Boolean))].sort(), [members]);

  // Counts on tabs respect search + advanced filters, so they always add up to what you'd see.
  const q = search.trim().toLowerCase();
  const base = useMemo(() => members.filter((m) => matches(m, filters)
    && (!q || m.full_name.toLowerCase().includes(q) || (m.phone ?? "").includes(q) || (m.email ?? "").toLowerCase().includes(q))), [members, filters, q]);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, active: 0, expiring: 0, expired: 0, none: 0, archived: 0 };
    base.forEach((m) => {
      if (m.isArchived) {
        c.archived++;
      } else {
        c.all++;
        c[m.status]++;
      }
    });
    return c;
  }, [base]);
  const rows = useMemo(() => {
    const r = base.filter((m) => {
      if (tab === "archived") return m.isArchived;
      if (m.isArchived) return false;
      return tab === "all" || m.status === tab;
    });
    const by: Record<SortKey, (a: Member, b: Member) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.full_name.localeCompare(b.full_name),
      ending: (a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999),
    };
    return [...r].sort(by[sort]);
  }, [base, tab, sort]);
  useEffect(() => { setPage(0); }, [tab, filters, search, sort]);

  const chips = chipsOf(filters);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, (page + 1) * PAGE);

  function setF(p: Partial<Filters>) { setFilters((f) => ({ ...f, ...p })); setViewId(null); }
  function clearAll() { setFilters(NO_FILTERS); setTab("all"); setSearch(""); setViewId(null); }
  function persistViews(next: View[]) { setViews(next); if (orgId && userId) savePref(orgId, userId, "members_views", next); }
  function saveView() {
    const name = viewName.trim(); if (!name) return;
    const v: View = { id: crypto.randomUUID(), name, tab, filters, pinned: false };
    persistViews([...views, v]); setViewId(v.id); setNaming(false); setViewName(""); show("Pin saved");
  }

  function getExportDataset(target: "filtered" | "all" = "filtered", includeTags: boolean = true) {
    const dataRows = target === "all" ? members : rows;
    const head = ["Name", "Phone", "Email", "Gender", "Age", "Plan", "Price", "Dues", "Plan ends", "Status", "Diet plan", "Workout", "Joined"];
    if (includeTags) {
      head.push("Medical Conditions", "Gut Symptoms", "Food Intolerances", "All Tags", "Primary Goal", "Diet Type");
    }
    const rawRows = dataRows.map((m) => {
      const line: (string | number)[] = [
        m.full_name || "",
        m.phone || "",
        m.email || "",
        m.sex ? cap(m.sex) : "",
        m.age ?? "",
        m.plan || "",
        m.planPricePaise ? (m.planPricePaise / 100).toFixed(0) : "0",
        m.duesPaise ? (m.duesPaise / 100).toFixed(0) : "0",
        m.endDate?.slice(0, 10) || "",
        STATUS[m.status]?.label || m.status,
        m.hasDiet ? "Yes" : "No",
        m.hasWorkout ? "Yes" : "No",
        m.created_at ? m.created_at.slice(0, 10) : "",
      ];
      if (includeTags) {
        line.push(
          asList(m.medical_conditions).join("; "),
          asList(m.gut_symptoms).map(cap).join("; "),
          asList(m.food_intolerances).join("; "),
          m.allTags.join("; "),
          m.primary_goal ? m.primary_goal.replace(/_/g, " ") : "",
          m.diet_type ? m.diet_type.replace(/_/g, " ") : ""
        );
      }
      return line;
    });
    return { dataRows, head, rawRows };
  }

  function exportData(format: ExportFormat, target: "filtered" | "all" = "filtered", includeTags: boolean = true) {
    const { dataRows, head, rawRows } = getExportDataset(target, includeTags);
    if (dataRows.length === 0) {
      show("No members to export");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const filename = `members-${target}-${today}`;

    try {
      if (format === "csv") {
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [
          head.map(esc).join(","),
          ...rawRows.map((r) => r.map(esc).join(",")),
        ];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${filename}.csv`;
        a.click();
        show(`Exported ${dataRows.length} member${dataRows.length === 1 ? "" : "s"} to CSV`);
      } else if (format === "xlsx") {
        const ws = XLSX.utils.aoa_to_sheet([head, ...rawRows]);
        const colWidths = head.map((col, idx) => {
          let maxLen = col.length;
          for (let i = 0; i < Math.min(rawRows.length, 50); i++) {
            const val = String(rawRows[i][idx] || "");
            if (val.length > maxLen) maxLen = val.length;
          }
          return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
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
        show(`Exported ${dataRows.length} member${dataRows.length === 1 ? "" : "s"} to Excel (.xlsx)`);
      } else if (format === "pdf") {
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "pt",
          format: "a4",
        });

        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59);
        doc.text("Members Directory", 36, 36);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Exported on: ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} · Scope: ${target === "all" ? "All members" : "Filtered list"} (${dataRows.length} total)`,
          36,
          52
        );

        autoTable(doc, {
          head: [head],
          body: rawRows,
          startY: 65,
          margin: { left: 36, right: 36, bottom: 36 },
          theme: "grid",
          styles: {
            fontSize: includeTags ? 6.5 : 8,
            cellPadding: 3,
            overflow: "linebreak",
            valign: "middle",
          },
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: includeTags ? 7 : 8.5,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          didDrawPage: (data: any) => {
            const pageCount = (doc as any).internal?.getNumberOfPages ? (doc as any).internal.getNumberOfPages() : 1;
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Page ${data.pageNumber} of ${pageCount}`,
              doc.internal.pageSize.getWidth() - 80,
              doc.internal.pageSize.getHeight() - 18
            );
          },
        });

        doc.save(`${filename}.pdf`);
        show(`Exported ${dataRows.length} member${dataRows.length === 1 ? "" : "s"} to PDF`);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      show(`Export failed: ${err?.message || "Unknown error"}`);
    }
  }

  function exportCSV(target: "filtered" | "all" = "filtered", includeTags: boolean = true) {
    exportData("csv", target, includeTags);
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "expiring", label: "Expiring" },
    { key: "expired", label: "Expired" },
    { key: "none", label: "No plan" },
    { key: "archived", label: "Archived" },
  ];
  const dirty = tab !== "all" || chips.length > 0;

  return (
    <div className="ps-page mb" onClick={() => { setPanel(null); }}>
      <style>{CSS}</style>

      <header className="mb-head">
        <div className="mb-head-title">
          <div>
          <h1>Members</h1>
          <p>{loading ? "\u00a0" : `${members.length} member${members.length === 1 ? "" : "s"} · ${members.filter((m) => m.status === "active" || m.status === "expiring").length} active`}</p>
          </div>
        </div>
        <div className="mb-head-actions">
          <button type="button" onClick={() => setIsAddModalOpen(true)} className="ps-btn ps-btn--primary ps-btn--sm">
            <Plus size={16} strokeWidth={2.4} /> Add member
          </button>
        </div>
      </header>

      <div className="mb-card">
        {/* Status tabs & parallel tools bar */}
        <div className="mb-tabs-bar">
          <nav className="mb-tabs" role="tablist">
            {TABS.map((t) => {
              const isSelected = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  data-tone={t.key}
                  aria-selected={isSelected}
                  onClick={() => { setTab(t.key); setViewId(null); }}
                >
                  <span className={`mb-tab-radio ${isSelected ? "mb-tab-radio--checked" : ""}`} aria-hidden>
                    {isSelected && <span className="mb-tab-radio-dot" />}
                  </span>
                  <span>{t.label}</span>
                  <span className="mb-count">{loading ? "–" : counts[t.key]}</span>
                </button>
              );
            })}
          </nav>

          <div className="mb-tabs-tools">
            <div className="mb-anchor" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="mb-tool"
                data-on={panel === "filters" || chips.some((c) => !c.key.startsWith("tag-"))}
                onClick={() => setPanel((p) => (p === "filters" ? null : "filters"))}
              >
                <SlidersHorizontal size={15} /> Filters{chips.length > 0 && <span className="mb-badge">{chips.length}</span>}
              </button>
              {panel === "filters" && (
                <FilterPanel
                  f={filters}
                  set={setF}
                  plans={plans}
                  count={rows.length}
                  onClear={() => { setFilters(NO_FILTERS); setViewId(null); }}
                  onClose={() => setPanel(null)}
                  onExport={(fmt) => exportData(fmt, "filtered", exportIncludeTags)}
                />
              )}
            </div>

            <div className="mb-anchor" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="mb-tool"
                onClick={() => setPanel((p) => (p === "sort" ? null : "sort"))}
              >
                <ArrowUpDown size={15} /> {SORT_LABEL[sort]}
              </button>
              {panel === "sort" && (
                <div className="mb-menu mb-menu--right">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      data-on={sort === k}
                      onClick={() => { setSort(k); setPanel(null); }}
                    >
                      {SORT_LABEL[k]}{sort === k && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-anchor" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="mb-tool"
                data-on={!!viewId}
                onClick={() => setPanel((p) => (p === "views" ? null : "views"))}
              >
                <Pin size={15} />
                <span>{views.find((v) => v.id === viewId)?.name ?? "Saved pins"}</span>
                <span className="mb-badge">{views.length}</span>
              </button>
              {panel === "views" && (
                <div className="mb-menu mb-menu--right" style={{ width: 270 }}>
                  {views.length === 0 && !naming && (
                    <div className="mb-muted" style={{ padding: "8px 10px", fontSize: 12.5 }}>
                      Save a tab and filter combo you pin often, like “Expiring, no diet plan”.
                    </div>
                  )}
                  {views.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px 4px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      <span>Saved pins ({views.length})</span>
                    </div>
                  )}
                  {views.map((v) => {
                    const isCurrent = viewId === v.id;
                    return (
                      <div key={v.id} className="mb-view" data-on={isCurrent}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrent) {
                              setViewId(null);
                              setPanel(null);
                            } else {
                              setTab(v.tab);
                              setFilters(v.filters);
                              setViewId(v.id);
                              setPanel(null);
                            }
                          }}
                        >
                          <Pin size={12} style={{ color: isCurrent ? "var(--accent)" : "var(--text-tertiary)", flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                          {isCurrent && <Check size={13} style={{ color: "var(--accent)", marginLeft: "auto" }} />}
                        </button>
                        <button
                          type="button"
                          className="mb-icon"
                          aria-label={`Delete ${v.name}`}
                          title={`Delete pin "${v.name}"`}
                          onClick={() => {
                            persistViews(views.filter((x) => x.id !== v.id));
                            if (viewId === v.id) setViewId(null);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                  <div className="mb-menu-sep" />
                  {naming ? (
                    <div style={{ display: "flex", gap: 6, padding: 4 }}>
                      <input
                        className="mb-input"
                        autoFocus
                        placeholder="Pin name"
                        value={viewName}
                        maxLength={40}
                        onChange={(e) => setViewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveView();
                          if (e.key === "Escape") setNaming(false);
                        }}
                      />
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary ps-btn--sm"
                        disabled={!viewName.trim()}
                        onClick={saveView}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <button type="button" disabled={!dirty} onClick={() => setNaming(true)}>
                      <Plus size={14} /> Save current pin
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar (Search) */}
        <div className="mb-toolbar">
          <div className="mb-search-container" ref={searchContainerRef}>
            <label className="mb-search">
              <Search size={15} />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search name, phone or email"
                aria-label="Search members"
                autoComplete="off"
              />
              {search ? (
                <button
                  type="button"
                  className="mb-x"
                  onClick={() => {
                    setSearch("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </label>

            {/* Suggestions dropdown */}
            {searchFocused && search.trim().length > 0 && (
              <div className="mb-search-dropdown" role="listbox">
                <div className="mb-search-dropdown-head">
                  <span>Suggested members ({suggestions.length})</span>
                  <span className="mb-search-dropdown-hints">↑↓ to navigate · ↵ to open</span>
                </div>

                {suggestions.length > 0 ? (
                  <div className="mb-search-dropdown-list">
                    {suggestions.map((m, idx) => {
                      const isSelected = searchSelectedIndex === idx;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className="mb-search-sug-item"
                          data-selected={isSelected}
                          onMouseEnter={() => setSearchSelectedIndex(idx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchFocused(false);
                            router.push(`/dashboard/members/${m.id}`);
                          }}
                        >
                          <Avatar name={m.full_name} size={32} />
                          <div className="mb-search-sug-main">
                            <div className="mb-search-sug-row1">
                              <span className="mb-search-sug-name">
                                <HighlightText text={m.full_name} highlight={search} />
                              </span>
                              {m.plan && <span className="mb-search-sug-plan">{m.plan}</span>}
                              <span className={`mb-search-sug-status mb-search-sug-status--${m.memberStatus === "inactive" ? "inactive" : m.status}`}>
                                {m.memberStatus === "inactive" ? "Inactive" : m.status === "active" ? "Active" : m.status === "expiring" ? "Expiring" : m.status === "expired" ? "Expired" : "No plan"}
                              </span>
                            </div>
                            <div className="mb-search-sug-sub">
                              {m.phone && (
                                <span>
                                  <HighlightText text={m.phone} highlight={search} />
                                </span>
                              )}
                              {m.phone && m.email && <span>·</span>}
                              {m.email && (
                                <span>
                                  <HighlightText text={m.email} highlight={search} />
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={14} className="mb-search-sug-arrow" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mb-search-dropdown-empty">
                    <Users size={16} />
                    <span>No members found matching &quot;{search}&quot;</span>
                  </div>
                )}

                <button
                  type="button"
                  className="mb-search-dropdown-foot"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchFocused(false);
                  }}
                >
                  <span>Filter members table for &quot;{search}&quot;</span>
                  <span className="mb-count">{base.length} result{base.length === 1 ? "" : "s"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Saved pins right to left in pills in below lane (only if created by user) */}
          {savedPinsToDisplay.length > 0 && (
            <div className="mb-pinned-lane">
              <div className="mb-pinned-pills">
                {savedPinsToDisplay.map((v) => {
                  const isCurrent = viewId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className="mb-pinned-pill"
                      data-on={isCurrent}
                      title={`Saved pin: ${v.name}`}
                      onClick={() => {
                        if (isCurrent) {
                          setViewId(null);
                          setTab("all");
                          setFilters(NO_FILTERS);
                        } else {
                          setTab(v.tab);
                          setFilters(v.filters);
                          setViewId(v.id);
                        }
                      }}
                    >
                      <Pin size={11} className="mb-pinned-pin" />
                      <span>{v.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="mb-chips">
            {chips.map((c) => (
              <span key={c.key} className="mb-chip">{c.label}<button type="button" onClick={() => setF(c.clear)} aria-label={`Remove ${c.label}`}><X size={12} /></button></span>
            ))}
            <button type="button" className="mb-link" onClick={clearAll}>Clear all</button>
          </div>
        )}

        {/* Table */}
        <div className="mb-table" role="table">
          <div className="mb-tr mb-th" role="row">
            <span>Member</span>
            <span>Current Plan</span>
            <span>Status</span>
            <span>Amount</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>

          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-tr">
              <span className="mb-who">
                <Skeleton w={36} h={36} r={18} />
                <span style={{ display: "grid", gap: 6 }}>
                  <Skeleton w={140} h={13} />
                  <Skeleton w={90} h={11} />
                </span>
              </span>
              <div style={{ display: "grid", gap: 6 }}>
                <Skeleton w={110} h={13} />
                <Skeleton w={80} h={11} />
              </div>
              <Skeleton w={38} h={22} r={11} />
              <Skeleton w={65} h={14} />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Skeleton w={72} h={28} r={8} />
              </div>
            </div>
          )) : rows.length === 0 ? (
            <div className="mb-empty">
              <span className="mb-empty-icon">{tab === "archived" ? <Archive size={20} /> : <Users size={20} />}</span>
              <strong>{tab === "archived" ? "No archived members" : members.length === 0 ? "No members yet" : "No members match"}</strong>
              <p>
                {tab === "archived"
                  ? "Members that you archive from their profile will appear here."
                  : members.length === 0
                  ? "Add your first member to start tracking plans, payments and attendance."
                  : "Try a different search, or loosen the filters."}
              </p>
              {tab === "archived" ? null : members.length === 0 ? (
                <button type="button" onClick={() => setIsAddModalOpen(true)} className="ps-btn ps-btn--primary ps-btn--sm">
                  <Plus size={15} /> Add member
                </button>
              ) : (
                <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={clearAll}>Clear filters</button>
              )}
            </div>
          ) : pageRows.map((m) => {
            const isArchived = m.isArchived;
            const isActive = !isArchived && m.memberStatus !== "inactive" && (m.status === "active" || m.status === "expiring");
            const isBusy = changingStatusId === m.id;

            return (
              <Link
                key={m.id}
                href={`/dashboard/members/${m.id}`}
                className="mb-tr mb-row"
                role="row"
                data-status={isArchived ? "archived" : isActive ? "active" : "expired"}
                data-archived={isArchived}
              >
                {/* 1. Name | Age | Sex | WA icon */}
                <span className="mb-who">
                  <Avatar name={m.full_name} size={36} />
                  <span className="mb-text">
                    <div className="mb-name-row">
                      <strong>{m.full_name}</strong>
                      {m.phone ? (
                        <a
                          href={waLink(m.phone)!}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-wa-icon"
                          title={`Chat with ${m.full_name} on WhatsApp (${m.phone})`}
                          aria-label={`Chat with ${m.full_name} on WhatsApp`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <WhatsAppIcon size={14} />
                        </a>
                      ) : (
                        <span
                          className="mb-wa-icon mb-wa-icon--disabled"
                          title="No phone number"
                          aria-label="No phone number for WhatsApp"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          <WhatsAppIcon size={14} />
                        </span>
                      )}
                    </div>
                    <small className="mb-details-meta">
                      <span>{m.age !== null ? `${m.age} yrs` : "Age: —"}</span>
                      <span className="mb-details-sep">|</span>
                      <span>{m.sex ? cap(m.sex) : "Sex: —"}</span>
                    </small>
                    <small className="mb-show-sm">
                      {[m.plan, m.endDate && `Exp ${formatDate(m.endDate)}`, m.planPricePaise ? formatINR(m.planPricePaise) : null].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </span>

                {/* 2. current membership plan | Exp date */}
                <span className="mb-text mb-hide-sm">
                  <span>{m.plan ? <span className="mb-plan">{m.plan}</span> : <span className="mb-muted">No plan</span>}</span>
                  <small className="mb-exp-line">
                    {m.endDate ? (
                      <>
                        <span>Exp: {formatDate(m.endDate, { year: true })}</span>
                        {m.daysLeft !== null && (
                          <span className={`mb-exp-badge mb-exp-badge--${m.daysLeft < 0 ? "expired" : m.daysLeft <= 7 ? "warn" : "ok"}`}>
                            {m.daysLeft < 0 ? "Ended" : m.daysLeft === 0 ? "Today" : `${m.daysLeft}d left`}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="mb-muted">—</span>
                    )}
                  </small>
                </span>

                {/* 3. Status - active & inactive (toggle only) or Archived badge */}
                <div className="mb-status-cell" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  {isArchived ? (
                    <span
                      className="ps-badge"
                      style={{
                        background: "rgba(100, 116, 139, 0.12)",
                        color: "#64748b",
                        border: "1px solid rgba(100, 116, 139, 0.25)",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}
                    >
                      Archived
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      disabled={isBusy}
                      className={`mb-toggle ${isActive ? "mb-toggle--on" : "mb-toggle--off"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleQuickStatusChange(m, isActive ? "inactive" : "active");
                      }}
                      title={`Status: ${isActive ? "Active" : "Inactive"}. Click to toggle.`}
                      aria-label={`Toggle active status for ${m.full_name}`}
                    >
                      <span className="mb-toggle-thumb">
                        {isBusy && <Loader2 size={9} className="ps-spin" />}
                      </span>
                    </button>
                  )}
                </div>

                {/* 4. Amount */}
                <span className="mb-text mb-hide-sm">
                  <span className="mb-price-val">{m.planPricePaise ? formatINR(m.planPricePaise) : "—"}</span>
                </span>

                {/* 5. Action - Renew or Restore */}
                <span className="mb-actions" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                  {isArchived ? (
                    <button
                      type="button"
                      className="ps-btn ps-btn--secondary ps-btn--sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRestoreMember(m);
                      }}
                      title={`Restore ${m.full_name} to active members`}
                      disabled={isBusy}
                    >
                      {isBusy ? <Loader2 size={12} className="ps-spin" /> : <ArchiveRestore size={12} />}
                      <span>Restore</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ps-btn ps-btn--primary ps-btn--sm mb-renew-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenewMember(m);
                      }}
                      title={`Renew membership for ${m.full_name}`}
                    >
                      <RefreshCw size={12} />
                      <span>Renew</span>
                    </button>
                  )}
                </span>
              </Link>
            );
          })}
        </div>

        {!loading && rows.length > 0 && (
          <footer className="mb-foot">
            <span>Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, rows.length)} of {rows.length}</span>
            {pages > 1 && (
              <span className="mb-pager">
                <button type="button" className="mb-icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span>{page + 1} / {pages}</span>
                <button type="button" className="mb-icon" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
              </span>
            )}
          </footer>
        )}
      </div>

      <RenewalSheet
        member={renewMember}
        orgId={orgId}
        currentPlanId={renewMember?.planId}
        onClose={() => setRenewMember(null)}
        onDone={(msg) => {
          setRenewMember(null);
          show(msg);
          load();
        }}
        onError={(msg) => show(msg, "error")}
      />

      <CreateMemberModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={() => {
          show("Member enrolled successfully!");
          load();
        }}
        orgId={orgId}
      />

      {toast}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const CSS = `
.mb { --mb-line: var(--separator); --mb-soft: #f6f7f9; }
.mb-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin: 0 0 14px; flex-wrap: wrap; }
.mb-head h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
.mb-head p { font-size: 13.5px; color: var(--text-secondary); margin: 2px 0 0; }
.mb-head-actions { display: flex; gap: 8px; }
.mb-import-btn { display: inline-flex; align-items: center; gap: 6px; }
.mb-pinned-lane { margin-left: auto; display: flex; align-items: center; justify-content: flex-end; }
@media (max-width: 768px) {
  .mb-toolbar { flex-wrap: wrap; }
  .mb-pinned-lane { width: 100%; justify-content: flex-end; margin-top: 4px; }
}
.mb-pinned-pills { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.mb-pinned-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--mb-line);
  background: #ffffff;
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 140ms ease;
  white-space: nowrap;
}
.mb-pinned-pill:hover {
  border-color: #cbd5e1;
  color: var(--text-primary);
  background: var(--mb-soft);
}
.mb-pinned-pill[data-on="true"] {
  background: var(--accent-dim, rgba(10, 132, 255, 0.1));
  border-color: var(--accent, #0a84ff);
  color: var(--accent, #0a84ff);
  font-weight: 650;
}
.mb-pinned-pin {
  transform: rotate(45deg);
  opacity: 0.8;
}
.dark .mb-pinned-pill {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text-secondary);
}
.dark .mb-pinned-pill:hover {
  background: var(--surface-3);
  color: #ffffff;
}
.dark .mb-pinned-pill[data-on="true"] {
  background: rgba(10, 132, 255, 0.2);
  border-color: var(--accent);
  color: #58a6ff;
}

.mb-card { background: var(--surface, #fff); border: 1px solid var(--mb-line); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }

.mb-tabs-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 14px; border-bottom: 1px solid var(--mb-line); }
.mb-tabs { display: flex; align-items: center; gap: 6px; padding: 0; border: none !important; border-bottom: none !important; overflow-x: auto; scrollbar-width: none; background: transparent !important; flex: 1 1 auto; min-width: 0; }
.mb-tabs::-webkit-scrollbar { display: none; }
.mb-tabs button { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 10px; border: none !important; border-bottom: none !important; background: transparent !important; font: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; white-space: nowrap; border-radius: 8px !important; box-shadow: none !important; transition: all 150ms ease; }
.mb-tabs button:hover { color: var(--text-primary); background: var(--mb-soft, rgba(0,0,0,0.03)) !important; }
.mb-tabs button[aria-selected="true"] { color: var(--text-primary) !important; background: transparent !important; border: none !important; border-bottom: none !important; font-weight: 650; box-shadow: none !important; }
.mb-count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--mb-soft); color: var(--text-tertiary); font-size: 11.5px; font-weight: 600; display: inline-grid; place-items: center; font-variant-numeric: tabular-nums; transition: background 150ms, color 150ms; }
.mb-tabs button[aria-selected="true"] .mb-count { background: var(--accent-dim) !important; color: var(--accent) !important; }
.mb-tabs button[aria-selected="true"][data-tone="active"] .mb-count { background: rgba(52, 199, 89, 0.15) !important; color: #248a47 !important; }
.mb-tabs button[aria-selected="true"][data-tone="expiring"] .mb-count { background: rgba(255, 159, 10, 0.15) !important; color: #c46800 !important; }
.mb-tabs button[aria-selected="true"][data-tone="expired"] .mb-count { background: rgba(255, 59, 48, 0.15) !important; color: #c4001a !important; }
.mb-tabs button[aria-selected="true"][data-tone="archived"] .mb-count { background: rgba(100, 116, 139, 0.16) !important; color: #475569 !important; }

/* Radio button tab selection */
.mb-tab-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.8px solid #c7cad1; background: transparent; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 150ms ease; }
.mb-tabs button:hover .mb-tab-radio { border-color: #8e8e93; }
.mb-tab-radio--checked { border-color: var(--accent, #0a84ff) !important; background: transparent; }
.mb-tabs button[data-tone="active"] .mb-tab-radio--checked { border-color: #34c759 !important; }
.mb-tabs button[data-tone="expiring"] .mb-tab-radio--checked { border-color: #ff9f0a !important; }
.mb-tabs button[data-tone="expired"] .mb-tab-radio--checked { border-color: #ff3b30 !important; }
.mb-tabs button[data-tone="archived"] .mb-tab-radio--checked { border-color: #64748b !important; }
.mb-tab-radio-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #0a84ff); }
.mb-tabs button[data-tone="active"] .mb-tab-radio-dot { background: #34c759; }
.mb-tabs button[data-tone="expiring"] .mb-tab-radio-dot { background: #ff9f0a; }
.mb-tabs button[data-tone="expired"] .mb-tab-radio-dot { background: #ff3b30; }
.mb-tabs button[data-tone="archived"] .mb-tab-radio-dot { background: #64748b; }
.dark .mb-tab-radio { border-color: #52525b; }

.mb-tabs-tools { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: auto; }
.mb-pop--right { left: auto !important; right: 0 !important; }

.mb-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px 12px; }
.mb-search-container { position: relative; flex: 1 1 auto; max-width: 440px; width: 100%; min-width: 200px; }
.mb-search { position: relative; display: flex; align-items: center; width: 100%; }
.mb-search > svg { position: absolute; left: 11px; color: var(--text-tertiary); pointer-events: none; }
.mb-search input { width: 100%; height: 36px; padding: 0 34px 0 34px; border: 1px solid var(--mb-line); border-radius: 9px; background: #fff; font: inherit; font-size: 13.5px; color: var(--text-primary); outline: none; }
.mb-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.mb-search input::-webkit-search-cancel-button { display: none; }
.mb-search kbd { position: absolute; right: 9px; font: inherit; font-size: 11px; color: var(--text-tertiary); border: 1px solid var(--mb-line); border-radius: 4px; padding: 0 5px; line-height: 17px; }
.mb-search--block { max-width: none; flex: 1; }
.mb-x { position: absolute; right: 7px; width: 22px; height: 22px; border: none; border-radius: 50%; background: #eceef2; color: var(--text-secondary); display: grid; place-items: center; cursor: pointer; }

/* Suggestions dropdown */
.mb-search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  min-width: 320px;
  background: #ffffff;
  border: 1px solid var(--mb-line);
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04);
  z-index: 60;
  overflow: hidden;
  animation: mbSearchDropdownIn 120ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes mbSearchDropdownIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.99); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.mb-search-dropdown-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--mb-line);
}
.mb-search-dropdown-hints {
  font-size: 10.5px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text-tertiary);
}
.mb-search-dropdown-list {
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 330px;
  overflow-y: auto;
}
.mb-search-sug-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 100ms ease;
  font: inherit;
  color: var(--text-primary);
}
.mb-search-sug-item:hover,
.mb-search-sug-item[data-selected="true"] {
  background: var(--mb-soft);
}
.mb-search-sug-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mb-search-sug-row1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mb-search-sug-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mb-search-sug-plan {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--mb-soft);
  color: var(--text-secondary);
  border: 1px solid var(--mb-line);
  white-space: nowrap;
}
.mb-search-sug-status {
  font-size: 10px;
  font-weight: 650;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}
.mb-search-sug-status--active {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.mb-search-sug-status--expiring {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}
.mb-search-sug-status--expired {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}
.mb-search-sug-status--inactive {
  background: rgba(100, 116, 139, 0.14);
  color: #64748b;
}
.mb-search-sug-status--none {
  background: var(--mb-soft);
  color: var(--text-tertiary);
}
.mb-search-sug-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mb-search-sug-arrow {
  color: var(--text-tertiary);
  flex-shrink: 0;
  transition: transform 120ms ease;
}
.mb-search-sug-item:hover .mb-search-sug-arrow,
.mb-search-sug-item[data-selected="true"] .mb-search-sug-arrow {
  color: var(--accent, #4f46e5);
  transform: translateX(2px);
}
.mb-search-dropdown-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px;
  font-size: 13px;
  color: var(--text-tertiary);
  justify-content: center;
}
.mb-search-dropdown-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--mb-line);
  background: var(--mb-soft);
  font-size: 12px;
  font-weight: 550;
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  width: 100%;
  text-align: left;
  transition: background 100ms ease;
}
.mb-search-dropdown-foot:hover {
  color: var(--text-primary);
  background: var(--surface-2, #eceef2);
}
.mb-search-mark {
  background: rgba(79, 70, 229, 0.14);
  color: var(--accent, #4f46e5);
  font-weight: 700;
  padding: 0 1px;
  border-radius: 2px;
}

.mb-anchor { position: relative; }
.mb-tool { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border: 1px solid var(--mb-line); border-radius: 9px; background: #fff; font: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.mb-tool:hover { color: var(--text-primary); background: var(--mb-soft); }
.mb-tool[data-on="true"] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-dim); }
.mb-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: inline-grid; place-items: center; }

.mb-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; width: 440px; max-width: calc(100vw - 32px); background: #fff; border: 1px solid var(--mb-line); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.16); display: flex; flex-direction: column; max-height: min(640px, calc(100vh - 200px)); }
.mb-pop-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 8px; font-size: 15px; }
.mb-pop-body { overflow-y: auto; padding: 4px 14px 12px; display: flex; flex-direction: column; gap: 14px; }
.mb-pop-body h4 { font-size: 12px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 7px; }
.mb-pop-foot { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--mb-line); }
.mb-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.mb-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.mb-opt { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 15px; border: 1px solid var(--mb-line); background: #fff; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.mb-opt:hover { border-color: #c7cad1; color: var(--text-primary); }
.mb-opt[data-on="true"] { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); font-weight: 600; }
.mb-seg { display: flex; padding: 2px; border-radius: 9px; background: var(--mb-soft); }
.mb-seg button { flex: 1; height: 28px; border: none; border-radius: 7px; background: none; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.mb-seg button[data-on="true"] { background: #fff; color: var(--text-primary); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.mb-range { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12.5px; color: var(--text-tertiary); }
.mb-range:first-child, h4 + .mb-range { margin-top: 0; }
.mb-input { height: 32px; width: 100%; min-width: 0; padding: 0 9px; border: 1px solid var(--mb-line); border-radius: 8px; font: inherit; font-size: 13px; color: var(--text-primary); background: #fff; outline: none; }
.mb-input:focus { border-color: var(--accent); }
.mb-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 4px 0; cursor: pointer; }
.mb-check input { accent-color: var(--accent); width: 15px; height: 15px; }

.mb-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 40; min-width: 210px; background: #fff; border: 1px solid var(--mb-line); border-radius: 11px; box-shadow: 0 12px 32px rgba(0,0,0,0.14); padding: 4px; }
.mb-menu--right { left: auto; right: 0; }
.mb-menu > button, .mb-view > button:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 7px; font: inherit; font-size: 13.5px; color: var(--text-primary); cursor: pointer; text-align: left; }
.mb-menu > button:hover:not(:disabled), .mb-view > button:first-child:hover { background: var(--mb-soft); }
.mb-menu > button[data-on="true"] { color: var(--accent); font-weight: 600; }
.mb-menu > button:disabled { opacity: 0.45; cursor: default; }
.mb-menu-sep { height: 1px; background: var(--mb-line); margin: 4px 0; }
.mb-view { display: flex; align-items: center; }
.mb-view[data-on="true"] > button:first-child { color: var(--accent); font-weight: 600; }

.mb-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 12px 12px; }
.mb-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 4px 0 11px; border-radius: 14px; background: var(--mb-soft); border: 1px solid var(--mb-line); font-size: 12.5px; font-weight: 550; color: var(--text-primary); }
.mb-chip button { width: 20px; height: 20px; border: none; border-radius: 50%; background: none; color: var(--text-tertiary); display: grid; place-items: center; cursor: pointer; }
.mb-chip button:hover { background: #e4e6eb; color: var(--text-primary); }
.mb-link { border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); cursor: pointer; padding: 0 6px; }

.mb-table { border-top: 1px solid var(--mb-line); }
.mb-tr { display: grid; grid-template-columns: minmax(220px, 2.5fr) minmax(170px, 1.8fr) 76px minmax(120px, 1.2fr) 96px; align-items: center; gap: 16px; padding: 0 16px; min-height: 60px; border-bottom: 1px solid #eef0f3; }
.mb-th { min-height: 38px; background: var(--mb-soft); font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
.mb-row { color: inherit; text-decoration: none; transition: background 0.12s; }
.mb-row:hover { background: #f8faff; }
.mb-row:hover .mb-chev { color: var(--accent); transform: translateX(2px); }
.mb-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mb-name-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
.mb-name-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 14px; }
.mb-wa-icon { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(37, 211, 102, 0.12); color: #128c7e; transition: all 140ms ease; flex-shrink: 0; text-decoration: none; }
.mb-wa-icon:hover { background: #25d366; color: #ffffff; transform: scale(1.08); }
.mb-wa-icon--disabled { opacity: 0.35; background: var(--mb-soft); color: var(--text-tertiary); cursor: not-allowed; }
.mb-details-meta { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); margin-top: 1px; }
.mb-details-sep { color: #d1d5db; font-size: 11px; }
.mb-text { display: flex; flex-direction: column; min-width: 0; font-size: 13.5px; }
.mb-text > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mb-text strong { font-weight: 600; font-size: 14px; }
.mb-text small { font-size: 12.5px; color: var(--text-tertiary); margin-top: 1px; min-height: 1em; }
.mb-muted { color: var(--text-tertiary); }
.mb-pill { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.mb-pill--green { background: #e6f6ec; color: #1f8a3b; } .mb-pill--amber { background: #fff1de; color: #b45309; }
.mb-pill--red { background: #ffe9ec; color: #c4001a; } .mb-pill--grey { background: #f0f0f3; color: #6e6e73; }
.mb-exp-line { display: flex; align-items: center; gap: 6px; margin-top: 1px; font-size: 12px; }
.mb-exp-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 6px; font-size: 10.5px; font-weight: 600; }
.mb-exp-badge--ok { background: rgba(52, 199, 89, 0.12); color: #1f8a3b; }
.mb-exp-badge--warn { background: rgba(255, 159, 10, 0.12); color: #b45309; }
.mb-exp-badge--expired { background: rgba(255, 59, 48, 0.12); color: #c4001a; }
.mb-price-val { font-weight: 650; font-size: 13.5px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.mb-dues-val { margin-top: 1px; }
.mb-due-tag { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 5px; font-size: 11px; font-weight: 600; background: #fff1f2; color: #e11d48; }
.mb-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.mb-renew-btn { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 8px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.mb-chev { color: var(--text-tertiary); transition: transform 0.12s, color 0.12s; }
.mb-icon { width: 32px; height: 32px; border: none; border-radius: 8px; background: none; color: var(--text-tertiary); display: inline-grid; place-items: center; cursor: pointer; }
.mb-icon:hover:not(:disabled) { background: #eef0f4; color: var(--text-primary); }
.mb-icon:disabled { opacity: 0.35; cursor: default; }

.mb-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 56px 16px; text-align: center; }
.mb-empty-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--mb-soft); color: var(--text-tertiary); display: grid; place-items: center; margin-bottom: 4px; }
.mb-empty strong { font-size: 15px; }
.mb-empty p { font-size: 13.5px; color: var(--text-tertiary); margin: 0 0 8px; max-width: 340px; }
.mb-foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; font-size: 13px; color: var(--text-secondary); }
.mb-pager { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }

/* Copy sheet */
.mb-steps { display: flex; gap: 6px; margin-bottom: 16px; }
.mb-steps span { flex: 1; display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--text-tertiary); padding-top: 8px; border-top: 3px solid var(--mb-line); }
.mb-steps span[data-state="now"] { color: var(--text-primary); border-top-color: var(--accent); }
.mb-steps span[data-state="done"] { color: var(--accent); border-top-color: var(--accent); }
.mb-steps i { font-style: normal; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--mb-soft); }
.mb-steps span[data-state="now"] i { background: var(--accent); color: #fff; }
.mb-steps span[data-state="done"] i { background: var(--accent-dim); }
.mb-kinds { display: grid; gap: 10px; }
.mb-kind { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--mb-line); border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; color: var(--text-tertiary); transition: border-color 0.12s, box-shadow 0.12s; }
.mb-kind:hover:not(:disabled) { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.mb-kind:disabled { opacity: 0.55; cursor: default; }
.mb-kind-icon { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; }
.mb-kind[data-kind="diet"] .mb-kind-icon { background: #e6f6ec; color: #1f8a3b; }
.mb-kind[data-kind="workout"] .mb-kind-icon { background: #f3eafb; color: #8944ab; }
.mb-kind-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.mb-kind-text strong { font-size: 15px; color: var(--text-primary); }
.mb-kind-text small { font-size: 13px; }
.mb-list { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; }
.mb-choice { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border: 1px solid var(--mb-line); border-radius: 10px; background: #fff; font: inherit; text-align: left; cursor: pointer; }
.mb-choice:hover { border-color: #c7cad1; }
.mb-choice[data-on="true"] { border-color: var(--accent); background: var(--accent-dim); }
.mb-choice-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.mb-choice-text strong { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.mb-choice-text small { font-size: 12.5px; color: var(--text-tertiary); }
.mb-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #c7cad1; flex-shrink: 0; }
.mb-choice[data-on="true"] .mb-radio { border: 5px solid var(--accent); }
.mb-warn { margin-top: 10px; padding: 9px 12px; border-radius: 9px; background: #fff7ea; color: #9a4b00; font-size: 13px; }

@media (max-width: 1100px) {
  .mb-tr { grid-template-columns: minmax(180px, 2fr) minmax(150px, 1.5fr) 72px minmax(100px, 1fr) 90px; gap: 12px; }
}
@media (max-width: 960px) {
  .mb-tabs-bar { flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
  .mb-tabs-tools { width: 100%; justify-content: flex-end; }
}
@media (max-width: 760px) {
  .mb-tr { grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; padding: 10px 12px; min-height: 0; }
  .mb-hide-sm, .mb-th { display: none; }
  .mb-search-container, .mb-search { flex: 1 1 100%; width: 100%; }
  .mb-two { grid-template-columns: 1fr; }
  .mb-pop { position: fixed; left: 16px; right: 16px; top: 120px; width: auto; }
}
@media (max-width: 540px) {
  .mb-tabs-tools { width: 100%; }
  .mb-tabs-tools > .mb-anchor { flex: 1; }
  .mb-tabs-tools .mb-tool { width: 100%; justify-content: center; padding: 0 6px; font-size: 12px; }
}
/* Same gutter as Leads, regardless of any page width cap elsewhere. */
.ps-page.mb { max-width: none !important; margin: 0 !important; padding: 18px !important; }
@media (min-width: 1920px) {
  .ps-page.mb { max-width: 1680px !important; margin: 0 auto !important; }
}
.mb-head-title { display: flex; align-items: center; gap: 12px; }
.mb-card { position: relative; overflow: visible; }
.dark .mb { --mb-line: var(--border); --mb-soft: var(--surface-2); }
.dark .mb-card { background: var(--surface-2); border-color: var(--border); }
.dark .mb-search input { background: var(--surface-3); border-color: var(--border); color: #fff; }
.dark .mb-search-dropdown {
  background: var(--surface-2, #1c1c1e);
  border-color: var(--border, #3a3a3c);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
}
.dark .mb-search-dropdown-head {
  border-color: var(--border, #2c2c2e);
  color: var(--text-tertiary);
}
.dark .mb-search-sug-item:hover,
.dark .mb-search-sug-item[data-selected="true"] {
  background: var(--surface-3, #2c2c2e);
}
.dark .mb-search-sug-name {
  color: #ffffff;
}
.dark .mb-search-sug-plan {
  background: var(--surface-3, #242426);
  border-color: var(--border, #3a3a3c);
  color: var(--text-secondary);
}
.dark .mb-search-dropdown-foot {
  border-color: var(--border, #2c2c2e);
  background: var(--surface-2, #18181b);
  color: var(--text-secondary);
}
.dark .mb-search-dropdown-foot:hover {
  background: var(--surface-3, #27272a);
  color: #ffffff;
}
.dark .mb-search-mark {
  background: rgba(99, 102, 241, 0.32);
  color: #a5b4fc;
}
.dark .mb-tool { background: var(--surface-2); border-color: var(--border); color: var(--text-secondary); }
.dark .mb-tool:hover { background: var(--surface-3); color: #fff; }
.dark .mb-tool[data-on="true"] { background: rgba(10, 132, 255, 0.2); border-color: rgba(10, 132, 255, 0.4); color: #58a6ff; }
.dark .mb-pop { background: var(--surface-2); border-color: var(--border-mid); color: var(--text-primary); }
.dark .mb-pop-head { border-bottom: 1px solid var(--border); }
.dark .mb-pop-foot { border-top: 1px solid var(--border); }
.dark .mb-opt { background: var(--surface-3); border-color: var(--border); color: var(--text-secondary); }
.dark .mb-opt:hover { color: #fff; border-color: var(--border-mid); }
.dark .mb-opt[data-on="true"] { background: rgba(10, 132, 255, 0.2); border-color: var(--accent); color: #58a6ff; }
.dark .mb-seg { background: var(--surface-3); }
.dark .mb-seg button { color: var(--text-secondary); }
.dark .mb-seg button[data-on="true"] { background: var(--surface-2); color: #fff; }
.dark .mb-input { background: var(--surface-3); border-color: var(--border); color: #fff; }
.dark .mb-chip { background: var(--surface-3); border-color: var(--border); color: var(--text-primary); }
.dark .mb-th { background: var(--surface-3); color: var(--text-tertiary); }
.dark .mb-tr { border-bottom-color: var(--border); }
.dark .mb-row:hover { background: var(--surface-3); }
.dark .mb-plan { background: rgba(10, 132, 255, 0.18); color: #58a6ff; }
.dark .mb-tabs button[aria-selected="true"] { color: #ffffff !important; }
.dark .mb-tabs button[aria-selected="true"][data-tone="active"] .mb-count { background: rgba(52, 199, 89, 0.2) !important; color: #34c759 !important; }
.dark .mb-tabs button[aria-selected="true"][data-tone="expiring"] .mb-count { background: rgba(255, 159, 10, 0.2) !important; color: #ff9f0a !important; }
.dark .mb-tabs button[aria-selected="true"][data-tone="expired"] .mb-count { background: rgba(255, 69, 58, 0.2) !important; color: #ff6961 !important; }
.dark .mb-tabs button[aria-selected="true"][data-tone="archived"] .mb-count { background: rgba(148, 163, 184, 0.2) !important; color: #94a3b8 !important; }
.mb-th { background: linear-gradient(180deg, #f7f8fb, #f2f4f8); }
.mb-row { position: relative; }
.mb-row::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: transparent; }
.mb-row[data-status="active"]::before { background: #34c759; }
.mb-row[data-status="expiring"]::before { background: #ff9f0a; }
.mb-row[data-status="expired"]::before { background: #ff3b30; }
.mb-row[data-status="archived"]::before { background: #64748b; }
.mb-row[data-archived="true"] { opacity: 0.82; }
.mb-plan { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: 2px 9px; border-radius: 7px; background: #eef4ff; color: #0b5cc0; font-weight: 600; font-size: 12.5px; }
.mb-show-sm { display: none !important; }
@media (max-width: 760px) {
  .ps-page.mb { padding: 10px !important; }
  .mb-head { align-items: center; }
  .mb-head-actions { width: 100%; }
  .mb-head-actions > * { flex: 1; justify-content: center; }
  .mb-toolbar { gap: 6px; }
  .mb-anchor[style] { margin-left: 0 !important; }
  .mb-tool { height: 38px; padding: 0 10px; font-size: 13px; }
  .mb-tr { grid-template-columns: minmax(0, 1fr) auto auto; padding: 10px 12px; min-height: 0; }
  .mb-show-sm { display: block !important; }
  .mb-text small.mb-show-sm { white-space: normal; }
  .mb-actions .mb-chev { display: none; }
  .mb-pop { top: auto !important; bottom: calc(var(--tabbar-h, 56px) + var(--safe-bottom, 0px)); left: 0 !important; right: 0; max-width: none; width: auto; border-radius: 18px 18px 0 0; max-height: calc(85vh - var(--tabbar-h, 56px)); position: fixed; z-index: 60; }
  .mb-menu { position: fixed; left: 10px; right: 10px; top: auto; bottom: calc(var(--tabbar-h, 56px) + var(--safe-bottom, 0px) + 8px); width: auto !important; z-index: 60; }
  .mb-search input { font-size: 16px; }
}
@media (max-width: 380px) {
  .mb-tr { grid-template-columns: minmax(0, 1fr) auto; }
  .mb-tr > :nth-child(2) .mb-progs { display: none; }
  .mb-tabs button { padding: 0 8px; font-size: 12.5px; }
  .mb-tool { padding: 0 8px; font-size: 12px; }
}
/* Card fills the screen like Leads: footer sits at the bottom, rows scroll inside when there are many. */
@media (min-width: 900px) {
  .ps-page.mb { min-height: 100dvh; display: flex; flex-direction: column; }
  .mb-card { flex: 1; display: flex; flex-direction: column; }
}
@media (min-width: 761px) {
  .mb-table { flex: 1; display: flex; flex-direction: column; }
  .mb-empty { flex: 1; justify-content: center; }
  .mb-foot { border-top: 1px solid var(--mb-line); }
}
.mb-plan { line-height: 18px; margin-bottom: 1px; }

.mb-status-cell {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.mb-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: none;
  padding: 2px;
  cursor: pointer;
  background: #d1d5db;
  transition: background-color 180ms ease, opacity 150ms ease;
  flex-shrink: 0;
  outline: none;
}
.mb-toggle:hover:not(:disabled) {
  filter: brightness(0.96);
}
.mb-toggle:disabled {
  opacity: 0.6;
  cursor: wait;
}
.mb-toggle--on {
  background: #16a34a;
}
.dark .mb-toggle--off {
  background: #3f3f46;
}
.dark .mb-toggle--on {
  background: #16a34a;
}
.mb-toggle-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  transform: translateX(0);
}
.mb-toggle--on .mb-toggle-thumb {
  transform: translateX(16px);
}
.dark .mb-wa-icon { background: rgba(37, 211, 102, 0.2); color: #25d366; }
.dark .mb-details-sep { color: #52525b; }
.dark .mb-due-tag { background: rgba(225, 29, 72, 0.2); color: #fb7185; }
.dark .mb-status-menu button.active {
  background: rgba(10, 132, 255, 0.18);
  color: #58a6ff;
}
.mb-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mb-dot--green { background: #34c759; }
.mb-dot--grey { background: #8e8e93; }
.mb-check { margin-left: auto; color: var(--accent); }

.mb-pop--wide { width: 580px; max-width: calc(100vw - 32px); max-height: min(640px, calc(100vh - 140px)); }
.mb-pop-body--tags { padding: 0 14px 12px; max-height: 440px; overflow-y: auto; }
.mb-tag-container { display: flex; flex-direction: column; gap: 8px; }
.mb-tag-selected-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--mb-soft); border-radius: 8px; border: 1px solid var(--mb-line); flex-wrap: wrap; }
.mb-tag-selected-label { font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.mb-tag-selected-chips { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; flex: 1; }
.mb-tag-selected-chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #0f172a; color: #ffffff; border: none; cursor: pointer; transition: opacity 120ms ease; }
.mb-tag-selected-chip:hover { opacity: 0.85; }
.mb-tag-clear-btn { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--accent, #0a84ff); background: none; border: none; cursor: pointer; padding: 2px 4px; }
.mb-tag-clear-btn:hover { text-decoration: underline; }
.mb-tag-list { display: flex; flex-direction: column; border: 1px solid var(--mb-line, #e2e8f0); border-radius: 10px; background: #ffffff; overflow: hidden; }
.mb-tag-row { display: flex; align-items: flex-start; gap: 12px; padding: 7px 11px; border-bottom: 1px solid var(--mb-line, #f1f5f9); transition: background 120ms ease; }
.mb-tag-row:last-child { border-bottom: none; }
.mb-tag-row:hover { background: var(--mb-soft, #f8fafc); }
.mb-tag-row[data-active="true"] { background: rgba(10, 132, 255, 0.03); }
.mb-tag-row-header { width: 120px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 3px; }
.mb-tag-row-title { font-size: 11px; font-weight: 700; color: var(--text-tertiary, #64748b); letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.2; }
.mb-tag-row[data-active="true"] .mb-tag-row-title { color: var(--accent, #0a84ff); font-weight: 750; }
.mb-tag-row-badge { font-size: 9.5px; font-weight: 750; padding: 1px 5px; border-radius: 999px; background: var(--accent, #0a84ff); color: #ffffff; line-height: 1.2; flex-shrink: 0; }
.mb-tag-row-chips { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; min-width: 0; align-items: center; }
.mb-tag-pill { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 9px; border-radius: 9999px; font-size: 11.5px; font-weight: 500; border: 1px solid var(--mb-line, #e2e8f0); background: #ffffff; color: var(--text-primary, #334155); cursor: pointer; transition: all 120ms ease; user-select: none; white-space: nowrap; line-height: 1; }
.mb-tag-pill:hover { border-color: #cbd5e1; color: var(--text-primary, #0f172a); background: var(--mb-soft, #f8fafc); }
.mb-tag-pill[data-selected="true"] { background: #0f172a; border-color: #0f172a; color: #ffffff; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.mb-tag-pill-check { flex-shrink: 0; }
.dark .mb-tag-selected-bar { background: var(--surface-3); border-color: var(--border); }
.dark .mb-tag-selected-chip { background: #ffffff; color: #09090b; }
.dark .mb-tag-list { background: var(--surface-2, #1c1c1e); border-color: var(--border, #3a3a3c); }
.dark .mb-tag-row { border-color: var(--border, #2c2c2e); }
.dark .mb-tag-row:hover { background: var(--surface-3, #242426); }
.dark .mb-tag-row[data-active="true"] { background: rgba(10, 132, 255, 0.08); }
.dark .mb-tag-row-title { color: var(--text-tertiary); }
.dark .mb-tag-row[data-active="true"] .mb-tag-row-title { color: #58a6ff; }
.dark .mb-tag-pill { background: var(--surface-3, #242426); border-color: var(--border, #3a3a3c); color: var(--text-secondary); }
.dark .mb-tag-pill:hover { background: var(--surface-2); border-color: var(--border-mid); color: #ffffff; }
.dark .mb-tag-pill[data-selected="true"] { background: #ffffff; border-color: #ffffff; color: #09090b; font-weight: 600; }
@media (max-width: 620px) {
  .mb-pop--wide { width: auto !important; left: 10px !important; right: 10px !important; }
  .mb-tag-row { flex-direction: column; gap: 6px; padding: 9px 10px; }
  .mb-tag-row-header { width: 100%; }
}
.mb-filter-export-banner { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--mb-soft); border: 1px solid var(--mb-line); margin-bottom: 4px; }
.mb-bulk-btn { display: inline-flex; align-items: center; gap: 6px; }
.mb-bulk-menu { min-width: 270px; padding: 6px; }
.mb-bulk-menu-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); border-bottom: 1px solid var(--mb-line); margin-bottom: 4px; }
.mb-bulk-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 8px; font: inherit; text-align: left; cursor: pointer; color: var(--text-primary); transition: background 120ms ease; }
.mb-bulk-item:hover:not(:disabled) { background: var(--mb-soft); }
.mb-bulk-item:disabled { opacity: 0.45; cursor: default; }
.mb-bulk-item-icon { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; background: var(--mb-soft); color: var(--text-primary); border: 1px solid var(--mb-line); }
.mb-bulk-item-icon--import { background: rgba(10, 132, 255, 0.08); color: var(--accent, #0a84ff); border-color: rgba(10, 132, 255, 0.2); }
.mb-bulk-item-icon--export { background: rgba(16, 185, 129, 0.08); color: #059669; border-color: rgba(16, 185, 129, 0.2); }
.mb-bulk-item-text { flex: 1; min-width: 0; }
.mb-bulk-item-text strong { display: block; font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
.mb-bulk-item-text small { display: block; font-size: 11.5px; color: var(--text-tertiary); margin-top: 1px; }
.mb-bulk-arrow { color: var(--text-tertiary); flex-shrink: 0; }
.mb-bulk-back-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; padding: 2px 6px; border-radius: 5px; }
.mb-bulk-back-btn:hover { color: var(--text-primary); background: var(--mb-soft); }
.dark .mb-bulk-item-icon { background: var(--surface-3); border-color: var(--border); }
.dark .mb-bulk-item-icon--import { background: rgba(10, 132, 255, 0.18); border-color: rgba(10, 132, 255, 0.35); color: #58a6ff; }
.dark .mb-bulk-item-icon--export { background: rgba(16, 185, 129, 0.18); border-color: rgba(16, 185, 129, 0.35); color: #34d399; }
.mb-export-btn { display: inline-flex; align-items: center; gap: 6px; }
.mb-export-caret { transition: transform 140ms ease; opacity: 0.7; }
.mb-export-caret--up { transform: rotate(180deg); }
.mb-export-menu { min-width: 280px; padding: 6px; }
.mb-export-menu-head { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px 5px; font-size: 12.5px; color: var(--text-tertiary); }
.mb-export-format-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: var(--mb-soft); color: var(--accent); border: 1px solid var(--mb-line); }
.mb-export-format-box { padding: 4px 10px 8px; }
.mb-export-format-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); margin-bottom: 5px; }
.mb-export-format-pills { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; background: var(--mb-soft); padding: 3px; border-radius: 8px; border: 1px solid var(--mb-line); }
.mb-export-format-pill { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; border: none; background: transparent; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 120ms ease; }
.mb-export-format-pill:hover { color: var(--text-primary); }
.mb-export-format-pill.active { background: #ffffff; color: var(--accent, #4f46e5); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.dark .mb-export-format-pill.active { background: var(--surface-2, #2c2c2e); color: #ffffff; }
.mb-export-check { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; padding: 6px 10px; cursor: pointer; color: var(--text-primary); border-radius: 7px; margin-bottom: 2px; }
.mb-export-check:hover { background: var(--mb-soft); }
.mb-export-check input { accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; }
.mb-export-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 7px; font: inherit; text-align: left; cursor: pointer; color: var(--text-primary); transition: background 120ms ease; }
.mb-export-opt:hover:not(:disabled) { background: var(--mb-soft); }
.mb-export-opt:disabled { opacity: 0.45; cursor: default; }
.mb-export-opt-text strong { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.mb-export-opt-text small { display: block; font-size: 11.5px; color: var(--text-tertiary); margin-top: 1px; }
.mb-export-opt-icon { color: var(--text-tertiary); flex-shrink: 0; }
.mb-seg--sm { height: 28px; }
.mb-seg--sm button { height: 24px; font-size: 12px; }
.mb-row-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
.mb-mini-tag { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 9px; font-size: 10.5px; font-weight: 600; background: var(--mb-soft); color: var(--text-secondary); border: 1px solid var(--mb-line); }
.mb-mini-tag[data-match="true"] { background: #111827; color: #ffffff; border-color: #111827; }
.dark .mb-mini-tag[data-match="true"] { background: #ffffff; color: #111827; border-color: #ffffff; }
.mb-mini-tag-more { font-size: 10.5px; font-weight: 650; color: var(--text-tertiary); margin-left: 2px; }
`;
