"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Search, Banknote, Smartphone, CreditCard, Globe, Wallet, Download, FileText } from "lucide-react";
import { cols, formatINR, Segmented, Skeleton, useToast } from "../components/ui";
import { Sheet } from "../components/Sheet";

type Payment = {
  id: string; amount_paise: number; total_paise: number; paid_at: string;
  method: string | null; notes: string | null; status: string;
  members: { full_name: string; phone: string | null } | null;
};

type Member = { id: string; full_name: string; phone: string | null };
type Method = "cash" | "upi" | "card" | "online";

const supabase = createClient();

const METHODS: Record<string, { label: string; icon: React.ElementType; badge: string }> = {
  cash:   { label: "Cash",   icon: Banknote,   badge: "" },
  upi:    { label: "UPI",    icon: Smartphone, badge: "" },
  card:   { label: "Card",   icon: CreditCard, badge: "" },
  online: { label: "Online", icon: Globe,      badge: "" },
};

const ROW = cols("minmax(0,1fr) 110px 140px 36px", "minmax(0,1fr) auto 36px");
const EMPTY_FORM = { member_id: "", amount: "", method: "cash" as Method, notes: "" };

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Psync Gym");
  const [orgDetails, setOrgDetails] = useState({ phone: "", email: "", address: "", gst_number: "", logo_url: "" });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { toast, show } = useToast();

  async function load(oid: string) {
    const { data } = await supabase
      .from("payments")
      .select("*, members(full_name, phone)")
      .eq("org_id", oid)
      .order("paid_at", { ascending: false })
      .limit(100);
    setPayments((data as Payment[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const { data: orgData } = await supabase.from("organizations").select("name, phone, email, address, gst_number, logo_url").eq("id", roleData.org_id).single();
      if (orgData?.name) setOrgName(orgData.name);
      if (orgData) {
        setOrgDetails({
          phone: orgData.phone || "",
          email: orgData.email || "",
          address: orgData.address || "",
          gst_number: orgData.gst_number || "",
          logo_url: orgData.logo_url || "",
        });
      }
      const { data: memberData } = await supabase.from("members").select("id, full_name, phone").eq("org_id", roleData.org_id).order("full_name");
      setMembers((memberData as Member[]) || []);
      await load(roleData.org_id);
    }
    init();
  }, []);

  const amountValue = parseFloat(form.amount);
  const canSave = !!form.member_id && amountValue > 0 && !saving;

  async function handleSave() {
    if (!canSave || !orgId) return;
    setSaving(true);
    const amount_paise = Math.round(amountValue * 100);
    const { error } = await supabase.from("payments").insert({
      org_id: orgId,
      member_id: form.member_id,
      amount_paise,
      total_paise: amount_paise,
      method: form.method || null,
      notes: form.notes || null,
      status: "paid",
    });
    setSaving(false);
    if (error) {
      show("Couldn't save the payment. Try again.", "error");
      return;
    }
    await load(orgId);
    setShowForm(false);
    setForm(EMPTY_FORM);
    show(`${formatINR(amount_paise)} recorded`);
  }

  const q = search.trim().toLowerCase();
  const filtered = payments.filter((p) =>
    !q ||
    (p.members?.full_name || "").toLowerCase().includes(q) ||
    (p.notes || "").toLowerCase().includes(q) ||
    (p.method || "").includes(q)
  );

  const groups = useMemo(() => {
    const out: { key: string; label: string; total: number; items: Payment[] }[] = [];
    filtered.forEach((p) => {
      const key = dayKey(p.paid_at);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: dayLabel(p.paid_at), total: 0, items: [] };
        out.push(g);
      }
      g.items.push(p);
      g.total += p.total_paise;
    });
    return out;
  }, [filtered]);

  const thisMonth = payments.filter((p) => {
    const d = new Date(p.paid_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalThisMonth = thisMonth.reduce((sum, p) => sum + p.total_paise, 0);

  function exportCSV() {
    const rows = [
      ["Date", "Time", "Member", "Phone", "Amount (₹)", "Method", "Note", "Status"],
      ...filtered.map((p) => [
        new Date(p.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
        new Date(p.paid_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
        p.members?.full_name ?? "",
        p.members?.phone ?? "",
        (p.total_paise / 100).toFixed(2),
        p.method ?? "",
        p.notes ?? "",
        p.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateInvoice(p: Payment) {
    const total = p.total_paise / 100;
    // GST: treat total as inclusive of 18% GST
    // base = total / 1.18, gst = total - base
    const base = total / 1.18;
    const gstTotal = total - base;
    const cgst = gstTotal / 2;
    const sgst = gstTotal / 2;

    const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const date = new Date(p.paid_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const invoiceNo = `INV-${p.id.slice(0, 8).toUpperCase()}`;
    const memberName = p.members?.full_name || "Member";
    const memberPhone = p.members?.phone || "";
    const method = METHODS[p.method || ""]?.label || p.method || "—";
    const note = p.notes || "Membership fee";

    const logoBlock = orgDetails.logo_url
      ? `<img src="${orgDetails.logo_url}" alt="${orgName}" style="height:56px;width:56px;object-fit:contain;border-radius:10px;" />`
      : `<div style="width:56px;height:56px;background:#0071e3;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700;flex-shrink:0;">${orgName.charAt(0).toUpperCase()}</div>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Tax Invoice ${invoiceNo} — ${orgName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;color:#1d1d1f;background:#e8e8ec;min-height:100vh;display:flex;justify-content:center;align-items:flex-start;padding:32px 16px}
/* A4 page */
.page{
  background:#fff;
  width:210mm;
  min-height:297mm;
  padding:0;
  box-shadow:0 4px 32px rgba(0,0,0,0.18);
  display:flex;
  flex-direction:column;
}
/* Top accent bar */
.accent-bar{height:6px;background:linear-gradient(90deg,#0071e3,#34aadc)}
/* Header section */
.inv-header{padding:32px 40px 28px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e8e8ec}
.gym-block{display:flex;align-items:center;gap:16px}
.gym-info{display:flex;flex-direction:column;gap:3px}
.gym-name{font-size:20px;font-weight:700;color:#1d1d1f;letter-spacing:-0.02em}
.gym-contact{font-size:11.5px;color:#6e6e73;line-height:1.6}
.inv-right{text-align:right}
.inv-label{font-size:28px;font-weight:700;color:#0071e3;letter-spacing:-0.03em;text-transform:uppercase}
.inv-no{font-size:13px;color:#6e6e73;margin-top:4px;font-variant-numeric:tabular-nums}
.inv-date{font-size:13px;color:#1d1d1f;font-weight:500;margin-top:2px}
.paid-pill{display:inline-flex;align-items:center;gap:5px;background:rgba(52,199,89,0.12);color:#1f8a3b;border:1px solid rgba(52,199,89,0.28);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-top:8px}
.paid-dot{width:7px;height:7px;background:#34c759;border-radius:50%}
/* Bill to / invoice info row */
.inv-parties{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #e8e8ec}
.party-col{padding:20px 40px}
.party-col:not(:last-child){border-right:1px solid #e8e8ec}
.party-label{font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a8a8e;margin-bottom:6px}
.party-value{font-size:14px;font-weight:600;color:#1d1d1f}
.party-sub{font-size:12px;color:#6e6e73;margin-top:3px;line-height:1.5}
/* Table */
.inv-table{width:100%;border-collapse:collapse;margin-top:0}
.inv-table thead tr{background:#f5f5f7;border-top:1px solid #e8e8ec;border-bottom:1px solid #e8e8ec}
.inv-table th{padding:10px 40px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#6e6e73}
.inv-table th.r{text-align:right}
.inv-table td{padding:18px 40px;border-bottom:1px solid #f0f0f3;vertical-align:top;font-size:13px}
.inv-table td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.item-name{font-weight:600;font-size:14px;color:#1d1d1f}
.item-desc{font-size:12px;color:#6e6e73;margin-top:4px;line-height:1.5}
/* Totals */
.totals-section{margin-left:auto;width:280px;padding:0 40px 0 0;margin-top:8px}
.t-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#6e6e73;border-bottom:1px solid #f0f0f3}
.t-row.grand{font-size:16px;font-weight:700;color:#1d1d1f;border-bottom:none;padding-top:12px;border-top:2px solid #0071e3;margin-top:4px}
.t-row.grand span:last-child{color:#0071e3}
/* Notes */
.inv-notes{padding:24px 40px;border-top:1px solid #e8e8ec;margin-top:auto}
.notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.notes-label{font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#8a8a8e;margin-bottom:5px}
.notes-text{font-size:12px;color:#6e6e73;line-height:1.6}
/* Footer bar */
.inv-footer-bar{background:#f5f5f7;border-top:1px solid #e8e8ec;padding:14px 40px;display:flex;justify-content:space-between;align-items:center}
.footer-left{font-size:11.5px;color:#8a8a8e}
.footer-right{font-size:11.5px;color:#8a8a8e;text-align:right}
/* Print */
@media print{
  body{background:#fff;padding:0}
  .page{box-shadow:none;width:100%;min-height:auto}
}
</style>
</head>
<body>
<div class="page">

  <div class="accent-bar"></div>

  <!-- Header -->
  <div class="inv-header">
    <div class="gym-block">
      ${logoBlock}
      <div class="gym-info">
        <div class="gym-name">${orgName}</div>
        <div class="gym-contact">
          ${orgDetails.email ? orgDetails.email + "<br/>" : ""}
          ${orgDetails.phone ? orgDetails.phone + "<br/>" : ""}
          ${orgDetails.address ? orgDetails.address + "<br/>" : ""}
          ${orgDetails.gst_number ? "GSTIN: " + orgDetails.gst_number : ""}
        </div>
      </div>
    </div>
    <div class="inv-right">
      <div class="inv-label">Tax Invoice</div>
      <div class="inv-no">${invoiceNo}</div>
      <div class="inv-date">${date}</div>
      <div class="paid-pill"><span class="paid-dot"></span>PAID</div>
    </div>
  </div>

  <!-- Bill to / Invoice details -->
  <div class="inv-parties">
    <div class="party-col">
      <div class="party-label">Billed to</div>
      <div class="party-value">${memberName}</div>
      ${memberPhone ? `<div class="party-sub">${memberPhone}</div>` : ""}
    </div>
    <div class="party-col">
      <div class="party-label">Invoice no.</div>
      <div class="party-value" style="font-variant-numeric:tabular-nums">${invoiceNo}</div>
      <div class="party-sub">Date: ${date}</div>
    </div>
    <div class="party-col">
      <div class="party-label">Payment method</div>
      <div class="party-value">${method}</div>
      <div class="party-sub" style="color:#1f8a3b;font-weight:500">✓ Payment received</div>
    </div>
  </div>

  <!-- Line items table -->
  <table class="inv-table">
    <thead>
      <tr>
        <th style="width:40%">Description</th>
        <th class="r" style="width:12%">HSN/SAC</th>
        <th class="r" style="width:16%">Rate (excl. GST)</th>
        <th class="r" style="width:8%">Qty</th>
        <th class="r" style="width:12%">GST</th>
        <th class="r" style="width:12%">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="item-name">${note}</div>
          <div class="item-desc">${orgName} · Fitness &amp; wellness services</div>
        </td>
        <td class="r" style="color:#6e6e73">9995</td>
        <td class="r">${fmt(base)}</td>
        <td class="r">1</td>
        <td class="r">18%</td>
        <td class="r">${fmt(total)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Totals -->
  <div style="padding:16px 0 24px;border-bottom:1px solid #e8e8ec">
    <div class="totals-section">
      <div class="t-row"><span>Subtotal (excl. GST)</span><span>${fmt(base)}</span></div>
      <div class="t-row"><span>CGST @ 9%</span><span>${fmt(cgst)}</span></div>
      <div class="t-row"><span>SGST @ 9%</span><span>${fmt(sgst)}</span></div>
      <div class="t-row grand"><span>Total</span><span>${fmt(total)}</span></div>
    </div>
  </div>

  <!-- Notes -->
  <div class="inv-notes">
    <div class="notes-grid">
      <div>
        <div class="notes-label">Notes</div>
        <div class="notes-text">Thank you for being a valued member of ${orgName}. We look forward to seeing you at the gym.</div>
      </div>
      <div>
        <div class="notes-label">Terms</div>
        <div class="notes-text">This is a computer-generated invoice and does not require a physical signature. HSN/SAC 9995 — Fitness &amp; recreational sports services.</div>
      </div>
    </div>
  </div>

  <!-- Footer bar -->
  <div class="inv-footer-bar">
    <div class="footer-left">${orgName} · ${orgDetails.email || ""}</div>
    <div class="footer-right">
      ${orgDetails.gst_number ? "GSTIN: " + orgDetails.gst_number + " · " : ""}
      Page 1 of 1
    </div>
  </div>

</div>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="ps-page">
      <header className="ps-header">
        <div className="ps-header-text">
          <h1 className="ps-title">Payments</h1>
          <p className="ps-subtitle">
            {loading ? "\u00a0" : `${formatINR(totalThisMonth)} collected this month from ${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="ps-header-actions">
          <button
            type="button"
            className="ps-btn ps-btn--secondary"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            title="Export visible payments as CSV"
          >
            <Download size={15} strokeWidth={2.2} /> Export CSV
          </button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={2.4} /> Record payment
          </button>
        </div>
      </header>

      <div className="ps-toolbar">
        <div className="ps-input-wrap">
          <span className="ps-input-icon"><Search size={16} /></span>
          <input
            className="ps-input ps-input--icon"
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by member, note or method"
            aria-label="Search payments"
          />
        </div>
      </div>

      {loading ? (
        <div className="ps-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ps-row" style={{ ...ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}>
              <div className="ps-person">
                <Skeleton w={36} h={36} r={10} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton w={130} h={13} />
                  <Skeleton w={80} h={11} />
                </div>
              </div>
              <span className="ps-hide-sm"><Skeleton w={56} h={22} r={11} /></span>
              <Skeleton w={70} h={14} />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="ps-list">
          <div className="ps-empty">
            <div className="ps-empty-icon"><Wallet size={22} /></div>
            <div className="ps-empty-title">{payments.length === 0 ? "No payments yet" : "No matches"}</div>
            <div className="ps-empty-text">
              {payments.length === 0
                ? "Record a cash or UPI payment and it will show up here."
                : "Try a different member name or note."}
            </div>
            {payments.length === 0 && (
              <button type="button" className="ps-btn ps-btn--primary" onClick={() => setShowForm(true)}>
                <Plus size={16} strokeWidth={2.4} /> Record payment
              </button>
            )}
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <div className="ps-day-head">
              <span className="ps-day-label">{g.label}</span>
              <span className="ps-day-total">{formatINR(g.total)}</span>
            </div>
            <div className="ps-list">
              {g.items.map((p) => {
                const m = METHODS[p.method || ""];
                const Icon = m?.icon ?? Wallet;
                return (
                  <div key={p.id} className="ps-row" style={{ ...ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}>
                    <div className="ps-person">
                      <span className="ps-tile" aria-hidden><Icon size={18} /></span>
                      <div>
                        <div className="ps-cell-title">{p.members?.full_name || "Unknown member"}</div>
                        <div className="ps-cell-sub">
                          <span className="ps-show-sm-inline">{m?.label ?? "Payment"}{p.notes ? ", " : ""}</span>
                          {p.notes || <span className="ps-hide-sm">{m?.label ?? "Payment"}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="ps-hide-sm">
                      {m && <span className={`ps-badge ${m.badge}`}>{m.label}</span>}
                    </div>
                    <div className="ps-cell-end">
                      <div className="ps-num" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em" }}>
                        {formatINR(p.total_paise)}
                      </div>
                      <div className="ps-cell-sub">{timeLabel(p.paid_at)}</div>
                    </div>
                    <button
                      type="button"
                      className="ps-icon-btn"
                      style={{ width: 32, height: 32, flexShrink: 0 }}
                      onClick={(e) => { e.preventDefault(); generateInvoice(p); }}
                      title="Download invoice"
                      aria-label="Download invoice"
                    >
                      <FileText size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Sheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Record payment"
        description="Log a payment collected at the front desk."
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : "Save payment"}
            </button>
          </>
        }
      >
        <div className="ps-form-grid">
          <label className="ps-field ps-span-2">
            <span className="ps-label">Member</span>
            <select
              className="ps-input"
              value={form.member_id}
              onChange={(e) => setForm((f) => ({ ...f, member_id: e.target.value }))}
            >
              <option value="">Choose a member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}{m.phone ? ` (${m.phone})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="ps-field ps-span-2">
            <span className="ps-label">Amount</span>
            <div className="ps-input-wrap">
              <span className="ps-input-icon">₹</span>
              <input
                className="ps-input ps-input--icon ps-num"
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") }))}
                placeholder="1,500"
                style={{ fontSize: 17, fontWeight: 600 }}
              />
            </div>
          </label>

          <div className="ps-field ps-span-2">
            <span className="ps-label">Method</span>
            <Segmented<Method>
              block
              label="Payment method"
              value={form.method}
              onChange={(v) => setForm((f) => ({ ...f, method: v }))}
              options={(Object.keys(METHODS) as Method[]).map((k) => ({ value: k, label: METHODS[k].label }))}
            />
          </div>

          <label className="ps-field ps-span-2">
            <span className="ps-label">Note <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></span>
            <input
              className="ps-input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Monthly renewal, locker fee…"
            />
          </label>
        </div>
      </Sheet>

      {toast}
    </div>
  );
}
