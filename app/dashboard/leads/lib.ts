// app/dashboard/leads/lib.ts
// Shared by the leads list, the lead page and the lead sheets:
// types, the field registry (built-in fields + each gym's custom fields),
// the Zoho-style filter engine, sorting, and per-user prefs helpers.

import { createClient } from "@/lib/supabase";

export const supabase = createClient();

// ── Core types ───────────────────────────────────────────────────────────────

export type LeadStatus = "new" | "contacted" | "interested" | "trial" | "converted" | "lost";
export type LeadSource = "walk_in" | "instagram" | "facebook" | "referral" | "google" | "whatsapp" | "website" | "other";

export type Lead = {
  id: string; org_id: string; branch_id: string | null; assigned_to: string | null;
  full_name: string; phone: string | null; email: string | null;
  source: LeadSource | null; interested_plan: string | null;
  status: LeadStatus; follow_up_at: string | null; notes: string | null;
  converted_member_id: string | null; created_at: string; updated_at: string;
  custom: Record<string, unknown> | null;
  membership_plans?: { name: string } | null;
};

export type Plan = { id: string; name: string };
export type StaffMember = { id: string; user_id: string; name: string };

export type ActivityType = "note" | "call" | "whatsapp" | "email" | "meeting" | "status_change";
export type Activity = { id: string; lead_id: string; type: ActivityType; content: string; created_by: string | null; created_at: string };

export type TaskType = "call" | "visit" | "whatsapp" | "email" | "other";
export type TaskStatus = "pending" | "done" | "cancelled";
export type Task = {
  id: string; lead_id: string; assigned_to: string | null; type: TaskType;
  due_at: string; notes: string | null; status: TaskStatus; completed_at: string | null;
};

export const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "interested", "trial", "converted", "lost"];

export const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string; dot: string }> = {
  new:        { label: "New",        color: "var(--accent)",        bg: "var(--accent-dim)", dot: "#0A66D6" },
  contacted:  { label: "Contacted",  color: "var(--amber)",         bg: "var(--amber-dim)",  dot: "#ff9f0a" },
  interested: { label: "Interested", color: "var(--purple)",        bg: "var(--purple-dim)", dot: "#5856D6" },
  trial:      { label: "Trial",      color: "var(--teal)",          bg: "var(--teal-dim)",   dot: "#09AECF" },
  converted:  { label: "Converted",  color: "var(--green)",         bg: "var(--green-dim)",  dot: "#12B389" },
  lost:       { label: "Lost",       color: "var(--text-tertiary)", bg: "var(--fill)",       dot: "#8a8a8e" },
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walk-in", instagram: "Instagram", facebook: "Facebook", referral: "Referral",
  google: "Google", whatsapp: "WhatsApp", website: "Website", other: "Other",
};
export const SOURCE_EMOJI: Record<LeadSource, string> = {
  walk_in: "🚶", instagram: "📸", facebook: "👥", referral: "🤝",
  google: "🔍", whatsapp: "💬", website: "🌐", other: "📋",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Call", visit: "Visit", whatsapp: "WhatsApp", email: "Email", other: "Other",
};

export function isOpen(l: Lead) { return l.status !== "converted" && l.status !== "lost"; }
export function isOverdue(l: Lead) { return !!l.follow_up_at && isOpen(l) && new Date(l.follow_up_at) < new Date(); }
export function isDueToday(l: Lead) {
  return !!l.follow_up_at && isOpen(l) && new Date(l.follow_up_at).toDateString() === new Date().toDateString();
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
export function formatDay(value: string) {
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
export function relTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDay(iso);
}
export function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
}

// ── Field registry ───────────────────────────────────────────────────────────

export type CustomFieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
export const CUSTOM_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Single line", textarea: "Multi line", number: "Number", date: "Date", select: "Dropdown", checkbox: "Checkbox",
};

export type CustomFieldRow = {
  id: string; org_id: string; slug: string; label: string; type: CustomFieldType;
  options: string[] | null; section: string | null; sort_order: number; is_active: boolean;
};

export type FieldType = CustomFieldType | "name" | "phone" | "email" | "datetime" | "status" | "source" | "user" | "plan";
export type FieldDef = {
  key: string; label: string; type: FieldType; section: string; editable: boolean;
  custom?: boolean; options?: string[];
};

export const SECTION_MAIN = "Lead Information";
export const SECTION_DESC = "Description Information";
export const SECTION_CUSTOM_DEFAULT = "Additional Information";

export const BUILTIN_FIELDS: FieldDef[] = [
  { key: "full_name",       label: "Lead Name",      type: "name",     section: SECTION_MAIN, editable: true },
  { key: "assigned_to",     label: "Lead Owner",     type: "user",     section: SECTION_MAIN, editable: true },
  { key: "phone",           label: "Phone",          type: "phone",    section: SECTION_MAIN, editable: true },
  { key: "email",           label: "Email",          type: "email",    section: SECTION_MAIN, editable: true },
  { key: "status",          label: "Lead Status",    type: "status",   section: SECTION_MAIN, editable: true },
  { key: "source",          label: "Lead Source",    type: "source",   section: SECTION_MAIN, editable: true },
  { key: "interested_plan", label: "Interested Plan", type: "plan",    section: SECTION_MAIN, editable: true },
  { key: "follow_up_at",    label: "Next Follow-up", type: "datetime", section: SECTION_MAIN, editable: true },
  { key: "created_at",      label: "Created Time",   type: "datetime", section: SECTION_MAIN, editable: false },
  { key: "updated_at",      label: "Modified Time",  type: "datetime", section: SECTION_MAIN, editable: false },
  { key: "notes",           label: "Description",    type: "textarea", section: SECTION_DESC, editable: true },
];

export function buildFields(rows: CustomFieldRow[]): FieldDef[] {
  const custom = rows
    .filter((r) => r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map<FieldDef>((r) => ({
      key: `cf_${r.slug}`, label: r.label, type: r.type,
      section: r.section?.trim() || SECTION_CUSTOM_DEFAULT,
      editable: true, custom: true, options: r.options ?? [],
    }));
  return [...BUILTIN_FIELDS, ...custom];
}

/** Section names in display order: Lead Information, custom sections, Description last. */
export function sectionsOf(fields: FieldDef[]): string[] {
  const out: string[] = [];
  fields.forEach((f) => { if (f.section && !out.includes(f.section)) out.push(f.section); });
  return [...out.filter((s) => s !== SECTION_DESC), ...(out.includes(SECTION_DESC) ? [SECTION_DESC] : [])];
}

export function rawValue(lead: Lead, f: FieldDef): unknown {
  if (f.custom) return (lead.custom ?? {})[f.key.slice(3)] ?? null;
  return (lead as unknown as Record<string, unknown>)[f.key] ?? null;
}

export type Ctx = { staff: StaffMember[]; plans: Plan[] };

export function optionsFor(f: FieldDef, ctx: Ctx): { value: string; label: string }[] {
  switch (f.type) {
    case "status": return STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }));
    case "source": return (Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => ({ value: s, label: `${SOURCE_EMOJI[s]} ${SOURCE_LABELS[s]}` }));
    case "user": return ctx.staff.map((s) => ({ value: s.user_id, label: s.name }));
    case "plan": return ctx.plans.map((p) => ({ value: p.id, label: p.name }));
    case "select": return (f.options ?? []).map((o) => ({ value: o, label: o }));
    default: return [];
  }
}

export function displayValue(lead: Lead, f: FieldDef, ctx: Ctx): string {
  const v = rawValue(lead, f);
  if (v === null || v === undefined || v === "") return "";
  switch (f.type) {
    case "status": return STATUS_META[v as LeadStatus]?.label ?? String(v);
    case "source": return SOURCE_LABELS[v as LeadSource] ? `${SOURCE_EMOJI[v as LeadSource]} ${SOURCE_LABELS[v as LeadSource]}` : String(v);
    case "user": return ctx.staff.find((s) => s.user_id === v)?.name ?? "Former staff";
    case "plan": return ctx.plans.find((p) => p.id === v)?.name ?? lead.membership_plans?.name ?? "";
    case "datetime": return formatDateTime(String(v));
    case "date": return formatDay(String(v));
    case "checkbox": return v === true ? "Yes" : "No";
    default: return String(v);
  }
}

export function sortValue(lead: Lead, f: FieldDef, ctx: Ctx, lastTouch: Record<string, string>): string | number | null {
  if (f.key === "__last_touch") return lastTouch[lead.id] ?? null;
  const v = rawValue(lead, f);
  if (v === null || v === undefined || v === "") return null;
  switch (f.type) {
    case "status": return STATUS_ORDER.indexOf(v as LeadStatus);
    case "number": return Number(v);
    case "checkbox": return v === true ? 1 : 0;
    case "date": case "datetime": return String(v);
    default: return displayValue(lead, f, ctx).toLowerCase();
  }
}

// ── Filters (Zoho style: system filters + per-field conditions) ──────────────

export type Op =
  | "contains" | "not_contains" | "eq" | "in" | "not_in" | "gt" | "lt" | "empty" | "not_empty"
  | "today" | "past" | "future" | "last_n_days" | "before" | "after" | "between" | "is_true" | "is_false";

export const OP_LABELS: Record<Op, string> = {
  contains: "contains", not_contains: "doesn't contain", eq: "is", in: "is", not_in: "isn't",
  gt: "greater than", lt: "less than", empty: "is empty", not_empty: "is not empty",
  today: "is today", past: "is in the past", future: "is in the future", last_n_days: "in the last N days",
  before: "is before", after: "is after", between: "is between", is_true: "is checked", is_false: "is not checked",
};

export function opsFor(t: FieldType): Op[] {
  switch (t) {
    case "name": case "text": case "textarea": case "phone": case "email":
      return ["contains", "not_contains", "eq", "empty", "not_empty"];
    case "status": case "source": case "user": case "plan": case "select":
      return ["in", "not_in", "empty", "not_empty"];
    case "number":
      return ["eq", "gt", "lt", "empty", "not_empty"];
    case "date": case "datetime":
      return ["today", "past", "future", "last_n_days", "before", "after", "between", "empty", "not_empty"];
    case "checkbox":
      return ["is_true", "is_false"];
  }
}

export type Condition = { field: string; op: Op; value: string | string[]; value2?: string };

export type SystemFilter =
  | "mine" | "unassigned" | "open" | "overdue" | "due_today" | "untouched" | "touched" | "new_week" | "converted" | "lost";

export const SYSTEM_FILTERS: { key: SystemFilter; label: string }[] = [
  { key: "mine", label: "My leads" },
  { key: "unassigned", label: "Unassigned leads" },
  { key: "open", label: "Open leads" },
  { key: "overdue", label: "Overdue follow-ups" },
  { key: "due_today", label: "Follow-up due today" },
  { key: "untouched", label: "Untouched leads" },
  { key: "touched", label: "Touched leads" },
  { key: "new_week", label: "Created this week" },
  { key: "converted", label: "Converted leads" },
  { key: "lost", label: "Lost leads" },
];

export type FilterState = { system: SystemFilter[]; conditions: Condition[] };
export const EMPTY_FILTER: FilterState = { system: [], conditions: [] };

/** Accepts anything stored in lead_saved_filters.filters (older shapes included). */
export function normalizeFilter(raw: unknown): FilterState {
  const r = (raw ?? {}) as Partial<FilterState>;
  return {
    system: Array.isArray(r.system) ? r.system : [],
    conditions: Array.isArray(r.conditions) ? r.conditions : [],
  };
}
export function filterCount(f: FilterState) { return f.system.length + f.conditions.length; }

export function defaultCondition(f: FieldDef): Condition {
  const op = opsFor(f.type)[0];
  return { field: f.key, op, value: op === "in" || op === "not_in" ? [] : "" };
}

export const NONE = "__none__";

function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function startOfDay(s: string) { return new Date(`${s}T00:00:00`); }

export function matchCondition(lead: Lead, c: Condition, fields: FieldDef[]): boolean {
  const f = fields.find((x) => x.key === c.field);
  if (!f) return true;
  const v = rawValue(lead, f);
  const isEmpty = v === null || v === undefined || v === "";
  const sv = typeof c.value === "string" ? c.value.trim() : "";
  const arr = Array.isArray(c.value) ? c.value : [];

  switch (c.op) {
    case "empty": return isEmpty;
    case "not_empty": return !isEmpty;
    case "is_true": return v === true;
    case "is_false": return v !== true;
    case "in": return !arr.length || arr.includes(isEmpty ? NONE : String(v));
    case "not_in": return !arr.length || !arr.includes(isEmpty ? NONE : String(v));
    case "contains": return !sv || String(v ?? "").toLowerCase().includes(sv.toLowerCase());
    case "not_contains": return !sv || !String(v ?? "").toLowerCase().includes(sv.toLowerCase());
    case "eq":
      if (!sv) return true;
      return f.type === "number" ? Number(v) === Number(sv) : String(v ?? "").toLowerCase() === sv.toLowerCase();
    case "gt": return !sv || (!isEmpty && Number(v) > Number(sv));
    case "lt": return !sv || (!isEmpty && Number(v) < Number(sv));
  }

  // Date conditions. An incomplete condition (no date typed yet) doesn't filter anything out.
  if ((c.op === "before" || c.op === "after" || c.op === "last_n_days") && !sv) return true;
  if (c.op === "between" && !sv && !c.value2) return true;
  if (isEmpty) return false;

  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v));
  const now = new Date();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  switch (c.op) {
    case "today": return sameDay(d, now);
    case "past": return f.type === "date" ? d < todayStart : d < now;
    case "future": return f.type === "date" ? d > todayStart : d > now;
    case "last_n_days": {
      const n = Number(sv);
      return !n || (d.getTime() >= now.getTime() - n * 86400000 && d <= now);
    }
    case "before": return d < startOfDay(sv);
    case "after": { const next = startOfDay(sv); next.setDate(next.getDate() + 1); return d >= next; }
    case "between": {
      const from = sv ? startOfDay(sv) : null;
      const to = c.value2 ? startOfDay(c.value2) : null;
      if (to) to.setDate(to.getDate() + 1);
      return (!from || d >= from) && (!to || d < to);
    }
  }
  return true;
}

export type MatchCtx = { myUserId: string; lastTouch: Record<string, string>; fields: FieldDef[] };

export function matchSystem(lead: Lead, s: SystemFilter, m: MatchCtx): boolean {
  switch (s) {
    case "mine": return lead.assigned_to === m.myUserId;
    case "unassigned": return !lead.assigned_to;
    case "open": return isOpen(lead);
    case "overdue": return isOverdue(lead);
    case "due_today": return isDueToday(lead);
    case "untouched": return !m.lastTouch[lead.id];
    case "touched": return !!m.lastTouch[lead.id];
    case "new_week": return Date.now() - new Date(lead.created_at).getTime() <= 7 * 86400000;
    case "converted": return lead.status === "converted";
    case "lost": return lead.status === "lost";
  }
}

export function matchLead(lead: Lead, f: FilterState, m: MatchCtx): boolean {
  return f.system.every((s) => matchSystem(lead, s, m)) && f.conditions.every((c) => matchCondition(lead, c, m.fields));
}

// ── Loading + prefs ──────────────────────────────────────────────────────────

export type LeadContext = {
  userId: string; orgId: string; canManageFields: boolean;
  staff: StaffMember[]; plans: Plan[]; customRows: CustomFieldRow[];
};

/** Signed-in user, their gym, staff list, plans and the gym's custom fields. */
export async function loadLeadContext(): Promise<LeadContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: role } = await supabase.from("user_roles").select("org_id, staff_role").eq("user_id", user.id).single();
  if (!role?.org_id) return null;

  const [{ data: staffData }, { data: planData }, { data: cfData }] = await Promise.all([
    supabase.from("staff").select("id, user_id, name").eq("org_id", role.org_id).eq("is_active", true).order("name"),
    supabase.from("membership_plans").select("id, name").eq("org_id", role.org_id),
    supabase.from("lead_custom_fields").select("*").eq("org_id", role.org_id).order("sort_order"),
  ]);

  const staff = ((staffData as StaffMember[]) ?? []).filter((s) => !!s.user_id);
  if (!staff.some((s) => s.user_id === user.id)) {
    staff.unshift({ id: "self", user_id: user.id, name: user.email ? `You (${user.email.split("@")[0]})` : "You" });
  }

  return {
    userId: user.id,
    orgId: role.org_id as string,
    canManageFields: !role.staff_role || ["owner", "manager"].includes(role.staff_role as string),
    staff,
    plans: (planData as Plan[]) ?? [],
    customRows: (cfData as CustomFieldRow[]) ?? [],
  };
}

export async function loadPref<T>(userId: string, scope: string): Promise<T | null> {
  const { data } = await supabase.from("ps_layout_prefs").select("value").eq("user_id", userId).eq("scope", scope).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function savePref(orgId: string, userId: string, scope: string, value: unknown) {
  await supabase.from("ps_layout_prefs").upsert(
    { org_id: orgId, user_id: userId, scope, value, updated_at: new Date().toISOString() },
    { onConflict: "user_id,scope" },
  );
}

/** The list page stores the current result order here so the lead page can offer previous / next. */
export const NAV_KEY = "psync.leads.nav";
