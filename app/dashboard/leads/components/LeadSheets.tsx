"use client";
// app/dashboard/leads/components/LeadSheets.tsx
// Create lead (core + custom fields), Convert to member, CSV import.
// Editing an existing lead happens inline on the lead page, so there is no edit sheet anymore.

import { useState } from "react";
import { X, Loader2, Upload, Download, CheckCircle2 } from "lucide-react";
import {
  supabase, STATUS_ORDER, STATUS_META, SOURCE_LABELS, SOURCE_EMOJI, SECTION_MAIN,
  type Lead, type LeadSource, type LeadStatus, type Plan, type StaffMember, type FieldDef,
} from "../lib";
import { FieldInput, fromDraft } from "./FieldInput";

// ── Create lead ──────────────────────────────────────────────────────────────

export function LeadSheet({ orgId, plans, staff, fields, defaultOwner, onClose, onSaved }: {
  orgId: string; plans: Plan[]; staff: StaffMember[]; fields: FieldDef[]; defaultOwner: string;
  onClose: () => void; onSaved: (l: Lead) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<LeadSource>("walk_in");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [planId, setPlanId] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultOwner);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const customFields = fields.filter((f) => f.custom);
  const ctx = { staff, plans };

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!phone.trim()) { setError("Phone is required"); return; }
    setSaving(true); setError("");
    const customValues: Record<string, unknown> = {};
    customFields.forEach((f) => {
      const v = fromDraft(f, custom[f.key] ?? (f.type === "checkbox" ? "false" : ""));
      if (v !== null) customValues[f.key.slice(3)] = v;
    });
    const now = new Date().toISOString();
    const { data, error: err } = await supabase.from("leads").insert({
      org_id: orgId, full_name: name.trim(), phone: phone.trim(), email: email.trim() || null,
      source, status, interested_plan: planId || null,
      follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      notes: notes.trim() || null, assigned_to: assignedTo || null,
      custom: customValues, created_at: now, updated_at: now,
    }).select("*, membership_plans(name)").single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSaved(data as Lead);
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "540px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Create lead</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>Everything else can be edited on the lead page later.</div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="ps-error">{error}</div>}
          <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{SECTION_MAIN}</div>
          <div className="ps-form-grid">
            <div className="ps-field ps-span-2"><label className="ps-label">Lead name *</label><input className="ps-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" autoFocus /></div>
            <div className="ps-field"><label className="ps-label">Phone *</label><input className="ps-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" /></div>
            <div className="ps-field"><label className="ps-label">Email</label><input className="ps-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="ps-field">
              <label className="ps-label">Lead source</label>
              <select className="ps-input" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
                {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => <option key={s} value={s}>{SOURCE_EMOJI[s]} {SOURCE_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label">Lead status</label>
              <select className="ps-input" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
                {STATUS_ORDER.filter((s) => s !== "converted").map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label">Lead owner</label>
              <select className="ps-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label">Interested plan</label>
              <select className="ps-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Not sure yet</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="ps-field ps-span-2"><label className="ps-label">Next follow-up</label><input className="ps-input" type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} style={{ colorScheme: "light" }} /></div>
          </div>

          {customFields.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px" }}>Your fields</div>
              <div className="ps-form-grid">
                {customFields.map((f) => (
                  <div key={f.key} className={`ps-field${f.type === "textarea" ? " ps-span-2" : ""}`}>
                    <label className="ps-label">{f.label}</label>
                    <FieldInput field={f} ctx={ctx} className="ps-input"
                      draft={custom[f.key] ?? (f.type === "checkbox" ? "false" : "")}
                      onChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="ps-field"><label className="ps-label">Description</label><textarea className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What are they looking for?" /></div>
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}{saving ? "Saving…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Convert to member (insert logic unchanged from the original leads page) ──

export function ConvertSheet({ lead, orgId, plans, onClose, onConverted }: {
  lead: Lead; orgId: string; plans: Plan[]; onClose: () => void; onConverted: (memberId: string) => void;
}) {
  const [planId, setPlanId] = useState(lead.interested_plan ?? "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "online">("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConvert() {
    if (!planId) { setError("Select a membership plan"); return; }
    setSaving(true); setError("");
    try {
      const { data: plan } = await supabase.from("membership_plans").select("price_paise, duration_days").eq("id", planId).single();
      if (!plan) throw new Error("Plan not found");
      const { data: branch } = await supabase.from("branches").select("id").eq("org_id", orgId).limit(1).single();
      const { data: member, error: memErr } = await supabase.from("members")
        .insert({ org_id: orgId, branch_id: branch?.id ?? null, full_name: lead.full_name, phone: lead.phone, email: lead.email, status: "active" })
        .select("id").single();
      if (memErr) throw memErr;
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start); end.setDate(end.getDate() + (plan.duration_days ?? 30));
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data: membership } = await supabase.from("memberships")
        .insert({ org_id: orgId, branch_id: branch?.id ?? null, member_id: member.id, plan_id: planId, start_date: iso(start), end_date: iso(end), status: "active" })
        .select("id").single();
      await supabase.from("payments").insert({
        org_id: orgId, branch_id: branch?.id ?? null, member_id: member.id, membership_id: membership?.id ?? null,
        amount_paise: plan.price_paise, total_paise: plan.price_paise, method, status: "paid",
        notes: `Converted from lead: ${lead.full_name}`,
      });
      await supabase.from("leads").update({ status: "converted", converted_member_id: member.id, updated_at: new Date().toISOString() }).eq("id", lead.id);
      onConverted(member.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "460px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Convert to member</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{lead.full_name} becomes an active member</div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="ps-error">{error}</div>}
          <div className="ps-field">
            <label className="ps-label">Membership plan *</label>
            <select className="ps-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Select a plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="ps-form-grid">
            <div className="ps-field"><label className="ps-label">Start date</label><input className="ps-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="ps-field">
              <label className="ps-label">Payment method</label>
              <select className="ps-input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online</option>
              </select>
            </div>
          </div>
        </div>
        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleConvert} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}{saving ? "Converting…" : "Convert"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV import ───────────────────────────────────────────────────────────────

const VALID_SOURCES = Object.keys(SOURCE_LABELS);
const VALID_STATUSES = ["new", "contacted", "interested", "trial", "lost"];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values: string[] = []; let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQuotes = !inQuotes;
      else if (line[i] === "," && !inQuotes) { values.push(cur.trim()); cur = ""; }
      else cur += line[i];
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

type ImportRow = { full_name: string; phone: string; email: string; source: string; status: string; notes: string; follow_up_at: string; valid: boolean; error: string };

export function ImportLeadsSheet({ orgId, onClose, onImported }: { orgId: string; onClose: () => void; onImported: (count: number) => void }) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function processFile(file: File) {
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target?.result as string);
      if (parsed.length === 0) { setError("CSV is empty or has no data rows"); return; }
      setRows(parsed.map((row) => {
        const name = row.full_name || row.name || "";
        const phone = row.phone || row.mobile || row.phone_number || "";
        const email = row.email || row.email_address || "";
        const source = (row.source || "other").toLowerCase().replace(/[^a-z_]/g, "_");
        const status = (row.status || "new").toLowerCase();
        let err = "";
        if (!name) err = "Name is required"; else if (!phone && !email) err = "Phone or email required";
        return {
          full_name: name, phone, email,
          source: VALID_SOURCES.includes(source) ? source : "other",
          status: VALID_STATUSES.includes(status) ? status : "new",
          notes: row.notes || row.note || "", follow_up_at: row.follow_up || row.follow_up_at || "",
          valid: !err, error: err,
        };
      }));
      setError(""); setStep("preview");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setStep("importing");
    const valid = rows.filter((r) => r.valid);
    let count = 0;
    for (let i = 0; i < valid.length; i += 20) {
      const now = new Date().toISOString();
      const batch = valid.slice(i, i + 20).map((r) => ({
        org_id: orgId, full_name: r.full_name, phone: r.phone || null, email: r.email || null,
        source: r.source, status: r.status, notes: r.notes || null,
        follow_up_at: r.follow_up_at ? new Date(r.follow_up_at).toISOString() : null,
        created_at: now, updated_at: now,
      }));
      const { error: err } = await supabase.from("leads").insert(batch);
      if (!err) count += batch.length;
    }
    setImported(count); setStep("done"); onImported(count);
  }

  function downloadTemplate() {
    const csv = ["full_name,phone,email,source,status,notes,follow_up", "Rahul Sharma,9876543210,rahul@email.com,instagram,new,Interested in monthly plan,2026-11-01"].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "leads-import-template.csv";
    a.click();
  }

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "560px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Import leads from CSV</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {step === "upload" && "Upload a CSV file to bulk-add leads"}
                {step === "preview" && `${rows.length} rows found, ${validCount} valid, ${invalidCount} with issues`}
                {step === "importing" && "Importing…"}
                {step === "done" && `${imported} leads imported`}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px" }}>
          {step === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                onClick={() => document.getElementById("csv-file-input")?.click()}
                style={{ border: `2px dashed ${dragOver ? "var(--accent)" : "var(--separator)"}`, borderRadius: 14, padding: "40px 20px", textAlign: "center", cursor: "pointer", background: dragOver ? "var(--accent-dim)" : "var(--fill)" }}>
                <Upload size={28} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Columns: full_name, phone, email, source, status, notes, follow_up</div>
                <input id="csv-file-input" type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>
              {error && <div className="ps-error">{error}</div>}
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ alignSelf: "flex-start" }} onClick={downloadTemplate}><Download size={13} /> Download template</button>
            </div>
          )}
          {step === "preview" && (
            <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid var(--separator)", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "var(--fill)" }}>{["Name", "Phone", "Source", "Status", ""].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11.5, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--separator)" }}>
                      <td style={{ padding: "8px 12px", color: r.valid ? undefined : "var(--red)" }}>{r.full_name || "missing"}</td>
                      <td style={{ padding: "8px 12px" }}>{r.phone || r.email}</td>
                      <td style={{ padding: "8px 12px" }}>{SOURCE_LABELS[r.source as LeadSource] ?? r.source}</td>
                      <td style={{ padding: "8px 12px" }}>{r.status}</td>
                      <td style={{ padding: "8px 12px", color: "var(--red)", fontSize: 12 }}>{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {step === "done" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <CheckCircle2 size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 16, fontWeight: 650 }}>{imported} leads imported</div>
            </div>
          )}
        </div>
        <div className="ps-sheet-footer">
          {step === "upload" && <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>}
          {step === "preview" && (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setStep("upload")}>Back</button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={handleImport} disabled={validCount === 0}>Import {validCount} lead{validCount === 1 ? "" : "s"}</button>
            </>
          )}
          {step === "done" && <button type="button" className="ps-btn ps-btn--primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}
