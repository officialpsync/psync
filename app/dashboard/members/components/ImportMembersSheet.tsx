"use client";

import { useEffect, useState, useRef } from "react";
import {
  X,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  FileText,
  FileCode,
  ArrowLeft,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

type ParsedMemberRow = {
  full_name: string;
  phone: string;
  email: string;
  sex: string;
  date_of_birth: string;
  plan: string;
  pricePaise: number;
  duesPaise: number;
  status: "active" | "inactive";
  valid: boolean;
  error?: string;
};

type MembershipPlanOption = {
  id: string;
  name: string;
  duration_days: number | null;
  price_paise: number;
};

const SAMPLE_MEMBERS = [
  {
    full_name: "Aarav Sharma",
    phone: "9876543210",
    email: "aarav@example.com",
    sex: "male",
    date_of_birth: "1998-05-14",
    plan: "Monthly",
    price: 2000,
    dues: 0,
    status: "active",
  },
  {
    full_name: "Priya Patel",
    phone: "9823456789",
    email: "priya@example.com",
    sex: "female",
    date_of_birth: "2001-11-20",
    plan: "Quarterly",
    price: 5000,
    dues: 500,
    status: "active",
  },
  {
    full_name: "Rohan Verma",
    phone: "9123456780",
    email: "rohan@example.com",
    sex: "male",
    date_of_birth: "1995-03-08",
    plan: "Annual",
    price: 18000,
    dues: 0,
    status: "inactive",
  },
];

export function ImportMembersSheet({
  isOpen,
  orgId,
  onClose,
  onDone,
  onError,
}: {
  isOpen: boolean;
  orgId: string;
  onClose: () => void;
  onDone: (count: number) => void;
  onError?: (msg: string) => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedMemberRow[]>([]);
  const [plans, setPlans] = useState<MembershipPlanOption[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !orgId) return;
    setStep("upload");
    setRows([]);
    setFileName("");
    setErrorMsg("");
    setImportedCount(0);

    async function loadPlans() {
      try {
        const { data } = await supabase
          .from("membership_plans")
          .select("id, name, duration_days, price_paise")
          .eq("org_id", orgId)
          .eq("is_active", true);
        setPlans((data as MembershipPlanOption[]) || []);
      } catch (e) {
        console.error("Failed to load plans for import:", e);
      }
    }
    loadPlans();
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  function downloadSampleCSV() {
    const head = ["full_name", "phone", "email", "sex", "date_of_birth", "plan", "price", "dues", "status"];
    const lines = [
      head.join(","),
      ...SAMPLE_MEMBERS.map((m) =>
        [
          `"${m.full_name}"`,
          `"${m.phone}"`,
          `"${m.email}"`,
          m.sex,
          m.date_of_birth,
          `"${m.plan}"`,
          m.price,
          m.dues,
          m.status,
        ].join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-members.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSampleXLSX() {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_MEMBERS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Members");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-members.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSampleJSON() {
    const blob = new Blob([JSON.stringify(SAMPLE_MEMBERS, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-members.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCSVLines(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    const records: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      if (vals.every((v) => !v)) continue;
      const rec: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rec[h] = vals[idx] ?? "";
      });
      records.push(rec);
    }
    return records;
  }

  function normalizeAndValidate(data: Record<string, any>[]): ParsedMemberRow[] {
    return data.map((raw) => {
      // Find key matching candidate
      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          const direct = raw[k];
          if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
            return String(direct).trim();
          }
          // Lowercase match
          const lk = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const rawKey of Object.keys(raw)) {
            if (rawKey.toLowerCase().replace(/[^a-z0-9]/g, "") === lk) {
              const val = raw[rawKey];
              if (val !== undefined && val !== null && String(val).trim() !== "") {
                return String(val).trim();
              }
            }
          }
        }
        return "";
      };

      const fullName = getVal("full_name", "name", "fullname", "member_name", "member");
      const phone = getVal("phone", "phone_number", "mobile", "contact", "mobile_number");
      const email = getVal("email", "email_address", "mail");
      const rawSex = getVal("sex", "gender").toLowerCase();
      const sex =
        rawSex === "m" || rawSex === "male"
          ? "male"
          : rawSex === "f" || rawSex === "female"
          ? "female"
          : "";

      let dob = getVal("date_of_birth", "dob", "birth_date", "birthday");
      if (dob) {
        // Handle common formats like DD/MM/YYYY or MM/DD/YYYY
        if (dob.includes("/") || dob.includes("-")) {
          const d = new Date(dob);
          if (!isNaN(d.getTime())) {
            dob = d.toISOString().slice(0, 10);
          }
        }
      }

      const planName = getVal("plan", "membership_plan", "membership", "plan_name");
      const priceRaw = parseFloat(getVal("price", "price_paise", "plan_price", "amount") || "0");
      const duesRaw = parseFloat(getVal("dues", "due", "balance", "outstanding_balance", "outstanding_balance_paise") || "0");
      const rawStatus = getVal("status").toLowerCase();
      const status: "active" | "inactive" = rawStatus === "inactive" ? "inactive" : "active";

      let valid = true;
      let error = "";

      if (!fullName) {
        valid = false;
        error = "Full name is required";
      }

      return {
        full_name: fullName,
        phone,
        email,
        sex,
        date_of_birth: dob,
        plan: planName,
        pricePaise: isNaN(priceRaw) ? 0 : Math.round(priceRaw > 1000 ? priceRaw * 100 : priceRaw),
        duesPaise: isNaN(duesRaw) ? 0 : Math.round(duesRaw > 1000 ? duesRaw * 100 : duesRaw * 100),
        status,
        valid,
        error,
      };
    });
  }

  function processFile(file: File) {
    setErrorMsg("");
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (!["csv", "xlsx", "xls", "json"].includes(ext || "")) {
      setErrorMsg("Please upload a .csv, .xlsx, or .json file");
      return;
    }

    if (ext === "json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const arrayData = Array.isArray(parsed)
            ? parsed
            : parsed.members || parsed.data || [];
          if (!Array.isArray(arrayData) || arrayData.length === 0) {
            setErrorMsg("No valid records found in JSON file");
            return;
          }
          const rowsValidated = normalizeAndValidate(arrayData);
          setRows(rowsValidated);
          setStep("preview");
        } catch (err: any) {
          setErrorMsg("Failed to parse JSON file: " + err.message);
        }
      };
      reader.readAsText(file);
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheet];
          const json = XLSX.utils.sheet_to_json(worksheet);
          if (!json || json.length === 0) {
            setErrorMsg("Excel sheet contains no rows");
            return;
          }
          const rowsValidated = normalizeAndValidate(json as Record<string, any>[]);
          setRows(rowsValidated);
          setStep("preview");
        } catch (err: any) {
          setErrorMsg("Failed to parse Excel file: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const records = parseCSVLines(text);
          if (records.length === 0) {
            setErrorMsg("No rows found in CSV file");
            return;
          }
          const rowsValidated = normalizeAndValidate(records);
          setRows(rowsValidated);
          setStep("preview");
        } catch (err: any) {
          setErrorMsg("Failed to parse CSV file: " + err.message);
        }
      };
      reader.readAsText(file);
    }
  }

  async function handleImport() {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) return;

    setStep("importing");
    let count = 0;

    try {
      const now = new Date().toISOString();
      const planLookup = new Map(plans.map((p) => [p.name.toLowerCase().trim(), p]));

      for (let i = 0; i < validRows.length; i += 25) {
        const batch = validRows.slice(i, i + 25);
        const memberInserts = batch.map((r) => ({
          org_id: orgId,
          full_name: r.full_name,
          phone: r.phone || null,
          email: r.email || null,
          sex: r.sex || null,
          date_of_birth: r.date_of_birth || null,
          status: r.status,
          outstanding_balance_paise: r.duesPaise || 0,
          created_at: now,
          updated_at: now,
        }));

        const { data: insertedMembers, error: memErr } = await supabase
          .from("members")
          .insert(memberInserts)
          .select("id, full_name");

        if (memErr) throw memErr;

        // If plans specified, create membership records
        if (insertedMembers && insertedMembers.length > 0) {
          const membershipInserts: any[] = [];
          insertedMembers.forEach((im, idx) => {
            const rowData = batch[idx];
            if (rowData?.plan) {
              const matchedPlan = planLookup.get(rowData.plan.toLowerCase().trim());
              if (matchedPlan) {
                const start = new Date();
                const end = new Date(start);
                end.setDate(end.getDate() + (matchedPlan.duration_days || 30));
                const iso = (d: Date) =>
                  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

                membershipInserts.push({
                  org_id: orgId,
                  member_id: im.id,
                  plan_id: matchedPlan.id,
                  start_date: iso(start),
                  end_date: iso(end),
                  status: rowData.status === "inactive" ? "expired" : "active",
                });
              }
            }
          });

          if (membershipInserts.length > 0) {
            await supabase.from("memberships").insert(membershipInserts);
          }
        }

        count += (insertedMembers?.length || 0);
      }

      setImportedCount(count);
      setStep("done");
      onDone(count);
    } catch (err: any) {
      console.error("Bulk member import error:", err);
      setErrorMsg(err?.message || "Failed to import members. Please check database constraints.");
      onError?.(err?.message || "Import failed");
      setStep("preview");
    }
  }

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div
        className="ps-sheet"
        style={{ "--sheet-w": "680px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Import members"
      >
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Import members</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {step === "upload" && "Download sample templates or upload your member file"}
                {step === "preview" &&
                  `${rows.length} row${rows.length === 1 ? "" : "s"} parsed (${validCount} valid${
                    invalidCount > 0 ? `, ${invalidCount} invalid` : ""
                  })`}
                {step === "importing" && "Importing members into your gym directory…"}
                {step === "done" && `${importedCount} member${importedCount === 1 ? "" : "s"} imported successfully!`}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px" }}>
          {step === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Sample files banner */}
              <div
                style={{
                  background: "var(--mb-soft, #f8fafc)",
                  border: "1px solid var(--mb-line, #e2e8f0)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <strong style={{ fontSize: 13.5 }}>Download sample format</strong>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      Use these templates to prepare your member data with columns matching the system.
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    onClick={downloadSampleCSV}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <FileText size={14} color="#0a84ff" />
                    <span>Sample CSV (.csv)</span>
                    <Download size={12} style={{ opacity: 0.7 }} />
                  </button>
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    onClick={downloadSampleXLSX}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <FileSpreadsheet size={14} color="#10b981" />
                    <span>Sample Excel (.xlsx)</span>
                    <Download size={12} style={{ opacity: 0.7 }} />
                  </button>
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    onClick={downloadSampleJSON}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <FileCode size={14} color="#8b5cf6" />
                    <span>Sample JSON (.json)</span>
                    <Download size={12} style={{ opacity: 0.7 }} />
                  </button>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) processFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent, #0a84ff)" : "var(--border, #cbd5e1)"}`,
                  borderRadius: 14,
                  padding: "44px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? "rgba(10,132,255,0.06)" : "var(--surface, #ffffff)",
                  transition: "all 140ms ease",
                }}
              >
                <Upload size={32} style={{ color: "var(--accent, #0a84ff)", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 4 }}>
                  Drop your file here, or click to browse
                </div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                  Supports CSV (.csv), Excel (.xlsx, .xls), or JSON (.json)
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls, .json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) processFile(f);
                  }}
                />
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>File: {fileName}</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "#dcfce7",
                      color: "#15803d",
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    {validCount} ready
                  </span>
                  {invalidCount > 0 && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: "#fee2e2",
                        color: "#b91c1c",
                        fontSize: 12,
                        fontWeight: 650,
                      }}
                    >
                      {invalidCount} invalid
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="ps-btn ps-btn--secondary ps-btn--sm"
                  onClick={() => setStep("upload")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <ArrowLeft size={13} /> Upload different file
                </button>
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: 13,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Preview table */}
              <div
                style={{
                  maxHeight: 380,
                  overflowY: "auto",
                  border: "1px solid var(--mb-line, #e2e8f0)",
                  borderRadius: 10,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--mb-soft, #f8fafc)", borderBottom: "1px solid var(--mb-line, #e2e8f0)" }}>
                      {["Name", "Contact", "Sex / DOB", "Plan / Price", "Status", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontSize: 11.5,
                            fontWeight: 650,
                            color: "var(--text-tertiary)",
                            textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--mb-line, #e2e8f0)",
                          background: r.valid ? undefined : "#fff1f2",
                        }}
                      >
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                          {r.full_name || <span style={{ color: "#e11d48" }}>Missing name</span>}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div>{r.phone || "—"}</div>
                          <small style={{ color: "var(--text-tertiary)" }}>{r.email}</small>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div>{r.sex ? r.sex[0].toUpperCase() + r.sex.slice(1) : "—"}</div>
                          <small style={{ color: "var(--text-tertiary)" }}>{r.date_of_birth || "—"}</small>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div>{r.plan || "—"}</div>
                          <small style={{ color: "var(--text-tertiary)" }}>
                            {r.pricePaise > 0 ? `₹${(r.pricePaise / 100).toLocaleString("en-IN")}` : "—"}
                          </small>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span
                            style={{
                              padding: "2px 7px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: r.status === "active" ? "#dcfce7" : "#f4f4f5",
                              color: r.status === "active" ? "#15803d" : "#71717a",
                            }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", color: "#b91c1c", fontSize: 11.5 }}>
                          {r.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Loader2 size={36} className="ps-spin" style={{ color: "var(--accent, #0a84ff)", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 16, fontWeight: 650 }}>Importing members…</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                Please keep this window open while members are created.
              </div>
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "36px 0" }}>
              <CheckCircle2 size={44} style={{ color: "#16a34a", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 18, fontWeight: 700 }}>Import Complete</div>
              <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
                Successfully added {importedCount} member{importedCount === 1 ? "" : "s"} to your gym directory.
              </div>
            </div>
          )}
        </div>

        <div className="ps-sheet-footer">
          {step === "upload" && (
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setStep("upload")}>
                Back
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={handleImport}
                disabled={validCount === 0}
              >
                Import {validCount} member{validCount === 1 ? "" : "s"}
              </button>
            </>
          )}

          {step === "done" && (
            <button type="button" className="ps-btn ps-btn--primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
