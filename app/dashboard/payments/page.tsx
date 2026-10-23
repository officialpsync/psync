"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, Search, Banknote, Smartphone, CreditCard, Globe, Wallet, Download, FileText, TrendingUp, TrendingDown, CalendarDays, Receipt, MessageCircle, X, Check } from "lucide-react";
import { DesignStyles } from "../components/DesignSystem";
import { Avatar, formatINR, Skeleton, useToast } from "../components/ui";
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

type Period = "today" | "7d" | "month" | "last_month" | "all";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" }, { key: "7d", label: "7 days" }, { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" }, { key: "all", label: "All" },
];
const QUICK = [500, 1000, 1500, 2000, 3000, 5000];
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
  const [period, setPeriod] = useState<Period>("month");
  const [method, setMethod] = useState<string>("");
  const [sort, setSort] = useState<"new" | "old" | "high" | "low">("new");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [memberQ, setMemberQ] = useState("");
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
      .limit(1000);
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
  const now = new Date();
  const startOf = (p: Period) => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (p === "7d") d.setDate(d.getDate() - 6);
    if (p === "month") d.setDate(1);
    if (p === "last_month") return new Date(d.getFullYear(), d.getMonth() - 1, 1);
    if (p === "all") return new Date(0);
    return d;
  };
  const inPeriod = (iso: string) => {
    const t = new Date(iso);
    if (period === "last_month") return t >= startOf("last_month") && t < new Date(now.getFullYear(), now.getMonth(), 1);
    return t >= startOf(period);
  };
  const periodRows = payments.filter((p) => inPeriod(p.paid_at));
  const minP = parseFloat(minAmt) * 100, maxP = parseFloat(maxAmt) * 100;
  const filtered = periodRows.filter((p) =>
    (!method || (p.method || "other") === method) &&
    (!(minP > 0) || p.total_paise >= minP) && (!(maxP > 0) || p.total_paise <= maxP) &&
    (!q || (p.members?.full_name || "").toLowerCase().includes(q) || (p.members?.phone || "").includes(q) || (p.notes || "").toLowerCase().includes(q))
  ).sort((a, b) => sort === "new" ? b.paid_at.localeCompare(a.paid_at) : sort === "old" ? a.paid_at.localeCompare(b.paid_at) : sort === "high" ? b.total_paise - a.total_paise : a.total_paise - b.total_paise);
  const methodCounts = periodRows.reduce<Record<string, { n: number; v: number }>>((acc, p) => {
    const k = p.method || "other"; acc[k] = { n: (acc[k]?.n ?? 0) + 1, v: (acc[k]?.v ?? 0) + p.total_paise }; return acc;
  }, {});
  const anyFilter = !!(q || method || minAmt || maxAmt);

  const groups = useMemo(() => {
    if (sort === "high" || sort === "low") return [{ key: "all", label: sort === "high" ? "Highest first" : "Lowest first", total: filtered.reduce((s0, p) => s0 + p.total_paise, 0), items: filtered }];
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((p) => p.id).join(), sort]);

  const thisMonth = payments.filter((p) => {
    const d = new Date(p.paid_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalThisMonth = thisMonth.reduce((sum, p) => sum + p.total_paise, 0);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59);
  const lastMonthToDate = payments.filter((p) => { const d = new Date(p.paid_at); return d >= lastMonthStart && d <= lastMonthSameDay; }).reduce((s0, p) => s0 + p.total_paise, 0);
  const todayTotal = payments.filter((p) => new Date(p.paid_at).toDateString() === now.toDateString()).reduce((s0, p) => s0 + p.total_paise, 0);
  const periodTotal = periodRows.reduce((s0, p) => s0 + p.total_paise, 0);
  const avgPayment = periodRows.length ? periodTotal / periodRows.length : 0;
  const monthDelta = lastMonthToDate ? Math.round(((totalThisMonth - lastMonthToDate) / lastMonthToDate) * 100) : null;
  function receiptLink(p: Payment) {
    const ph = p.members?.phone; if (!ph) return null;
    const d = ph.replace(/\D/g, ""); const num = d.length === 10 ? `91${d}` : d;
    const first = (p.members?.full_name || "").split(" ")[0];
    const text = `Hi ${first}, we've received your payment of ${formatINR(p.total_paise)} on ${new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}${p.method ? ` via ${METHODS[p.method]?.label ?? p.method}` : ""}. Thank you! – ${orgName}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

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

  const mq = memberQ.trim().toLowerCase();
  const memberMatches = mq ? members.filter((m) => m.full_name.toLowerCase().includes(mq) || (m.phone || "").includes(mq)).slice(0, 8) : [];
  const chosen = members.find((m) => m.id === form.member_id);

  return (
    <div className="ps-page db py">
      <DesignStyles />
      <style>{PY_CSS}</style>

      <header className="py-head">
        <div className="py-title">
          <span className="py-title-icon"><Wallet size={21} /></span>
          <div>
            <h1>Payments</h1>
            <p>{loading ? "\u00a0" : `${formatINR(totalThisMonth)} collected this month from ${thisMonth.length} payment${thisMonth.length === 1 ? "" : "s"}`}</p>
          </div>
        </div>
        <div className="py-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={exportCSV} disabled={filtered.length === 0} title="Export the payments shown as CSV">
            <Download size={15} strokeWidth={2.2} /><span>Export</span>
          </button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => setShowForm(true)}>
            <Plus size={16} strokeWidth={2.4} /><span>Record payment</span>
          </button>
        </div>
        <div className="py-kpis">
          <div className="py-kpi py-kpi--hero"><span className="py-kpi-icon"><Wallet size={15} /></span><div><small>This month</small><b>{loading ? "–" : formatINR(totalThisMonth)}</b>
            {!loading && monthDelta !== null && <em className={monthDelta >= 0 ? "up" : "down"}>{monthDelta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(monthDelta)}% vs same days last month</em>}</div></div>
          <div className="py-kpi"><span className="py-kpi-icon"><CalendarDays size={15} /></span><div><small>Today</small><b>{loading ? "–" : formatINR(todayTotal)}</b></div></div>
          <div className="py-kpi"><span className="py-kpi-icon"><Receipt size={15} /></span><div><small>Payments ({PERIODS.find((p) => p.key === period)?.label.toLowerCase()})</small><b>{loading ? "–" : periodRows.length}</b></div></div>
          <div className="py-kpi"><span className="py-kpi-icon"><TrendingUp size={15} /></span><div><small>Avg. payment</small><b>{loading ? "–" : formatINR(Math.round(avgPayment))}</b></div></div>
        </div>
      </header>

      <div className="py-toolbar">
        <div className="py-row">
          <div className="py-seg" role="tablist" aria-label="Period">
            {PERIODS.map((p) => <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
          </div>
          <label className="py-search"><Search size={16} />
            <input type="search" enterKeyHint="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search member, phone or note" aria-label="Search payments" />
          </label>
          <span className="py-amt"><span>₹</span>
            <input inputMode="numeric" placeholder="Min" value={minAmt} onChange={(e) => setMinAmt(e.target.value.replace(/\D/g, ""))} aria-label="Minimum amount" />
            <span>to</span>
            <input inputMode="numeric" placeholder="Max" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value.replace(/\D/g, ""))} aria-label="Maximum amount" />
          </span>
          <select className="py-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="new">Newest first</option><option value="old">Oldest first</option>
            <option value="high">Highest amount</option><option value="low">Lowest amount</option>
          </select>
        </div>
        <div className="py-methods">
          <button type="button" className="py-method" aria-pressed={!method} onClick={() => setMethod("")}>
            <span className="py-method-icon"><Wallet size={14} /></span><span><b>All methods</b><small>{formatINR(periodTotal)}</small></span>
          </button>
          {(Object.entries(methodCounts) as [string, { n: number; v: number }][]).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => {
            const M = METHODS[k]; const Icon = M?.icon ?? Wallet;
            return (
              <button key={k} type="button" className="py-method" aria-pressed={method === k} onClick={() => setMethod(method === k ? "" : k)}>
                <span className="py-method-icon"><Icon size={14} /></span>
                <span><b>{M?.label ?? "Other"} · {v.n}</b><small>{formatINR(v.v)} · {Math.round((v.v / Math.max(1, periodTotal)) * 100)}%</small></span>
              </button>
            );
          })}
          {anyFilter && <button type="button" className="py-clear" onClick={() => { setSearch(""); setMethod(""); setMinAmt(""); setMaxAmt(""); }}><X size={13} />Clear filters</button>}
        </div>
      </div>

      {loading ? (
        <div className="py-card">{Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="py-tr"><span className="py-who"><Skeleton w={36} h={36} r={18} /><Skeleton w={140} h={13} /></span><Skeleton w={60} h={22} r={11} /><Skeleton w={70} h={14} /><span /></div>
        ))}</div>
      ) : groups.length === 0 ? (
        <div className="py-empty">
          <span className="py-empty-icon"><Wallet size={20} /></span>
          <strong>{payments.length === 0 ? "No payments yet" : "No payments match"}</strong>
          <p>{payments.length === 0 ? "Record a cash or UPI payment and it will show up here." : "Try another period, method or search."}</p>
          {payments.length === 0
            ? <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setShowForm(true)}><Plus size={14} /> Record payment</button>
            : <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => { setPeriod("all"); setSearch(""); setMethod(""); setMinAmt(""); setMaxAmt(""); }}>Show all payments</button>}
        </div>
      ) : (
        <div className="py-card">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="py-day"><span>{g.label}<em>{g.items.length} payment{g.items.length === 1 ? "" : "s"}</em></span><b>{formatINR(g.total)}</b></div>
              {g.items.map((p) => {
                const m = METHODS[p.method || ""];
                const Icon = m?.icon ?? Wallet;
                const wa = receiptLink(p);
                return (
                  <div key={p.id} className="py-tr">
                    <span className="py-who">
                      <Avatar name={p.members?.full_name || "?"} size={36} />
                      <span className="py-text"><b>{p.members?.full_name || "Unknown member"}</b><small>{p.notes || (sort === "high" || sort === "low" ? new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : timeLabel(p.paid_at))}</small></span>
                    </span>
                    <span className="py-hide-sm"><span className="py-pill"><Icon size={12} />{m?.label ?? "Other"}</span></span>
                    <span className="py-amount"><b>{formatINR(p.total_paise)}</b><small>{timeLabel(p.paid_at)}</small></span>
                    <span className="py-acts">
                      {wa && <a href={wa} target="_blank" rel="noreferrer" className="py-icon" title="Send receipt on WhatsApp" aria-label="Send receipt on WhatsApp"><MessageCircle size={15} /></a>}
                      <button type="button" className="py-icon" onClick={() => generateInvoice(p)} title="Download invoice" aria-label="Download invoice"><FileText size={15} /></button>
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
          <div className="py-foot">{filtered.length} payment{filtered.length === 1 ? "" : "s"} · {formatINR(filtered.reduce((s0, p) => s0 + p.total_paise, 0))}</div>
        </div>
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
        <div className="db py-form">
          <div className="py-field">
            <span className="py-label">Member</span>
            {chosen ? (
              <div className="py-chosen">
                <Avatar name={chosen.full_name} size={34} />
                <span className="py-text"><b>{chosen.full_name}</b><small>{chosen.phone || "No phone"}</small></span>
                <button type="button" className="py-icon" onClick={() => setForm((f) => ({ ...f, member_id: "" }))} aria-label="Change member"><X size={15} /></button>
              </div>
            ) : (
              <>
                <label className="py-search"><Search size={16} />
                  <input autoFocus value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Search by name or phone" />
                </label>
                {memberMatches.length > 0 && (
                  <div className="py-results">
                    {memberMatches.map((m) => (
                      <button key={m.id} type="button" onClick={() => { setForm((f) => ({ ...f, member_id: m.id })); setMemberQ(""); }}>
                        <Avatar name={m.full_name} size={28} /><span className="py-text"><b>{m.full_name}</b><small>{m.phone || "No phone"}</small></span>
                      </button>
                    ))}
                  </div>
                )}
                {mq && memberMatches.length === 0 && <small className="py-hint">No member matches &ldquo;{memberQ}&rdquo;</small>}
              </>
            )}
          </div>

          <div className="py-field">
            <span className="py-label">Amount</span>
            <div className="py-bigamt"><span>₹</span>
              <input type="text" inputMode="decimal" enterKeyHint="done" value={form.amount} placeholder="0"
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") }))} />
            </div>
            <div className="py-quick">
              {QUICK.map((n) => <button key={n} type="button" aria-pressed={form.amount === String(n)} onClick={() => setForm((f) => ({ ...f, amount: String(n) }))}>₹{n.toLocaleString("en-IN")}</button>)}
            </div>
          </div>

          <div className="py-field">
            <span className="py-label">Method</span>
            <div className="py-methodpick">
              {(Object.keys(METHODS) as Method[]).map((k) => {
                const Icon = METHODS[k].icon;
                return (
                  <button key={k} type="button" aria-pressed={form.method === k} onClick={() => setForm((f) => ({ ...f, method: k }))}>
                    <Icon size={18} />{METHODS[k].label}{form.method === k && <Check size={13} strokeWidth={3} className="py-tick" />}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="py-field">
            <span className="py-label">Note <em>(optional)</em></span>
            <input className="ps-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Monthly renewal, locker fee…" />
            <span className="py-quick">
              {["Monthly renewal", "Quarterly renewal", "Personal training", "Joining fee", "Locker"].map((n) => (
                <button key={n} type="button" aria-pressed={form.notes === n} onClick={() => setForm((f) => ({ ...f, notes: n }))}>{n}</button>
              ))}
            </span>
          </label>
        </div>
      </Sheet>

      {toast}
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const PY_CSS = `
.ps-page.py { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.py { max-width: none; }
.py { --py-line: var(--separator); }
.py-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; margin-bottom: 14px; }
.py-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.py-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); flex-shrink: 0; }
.py-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.py-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.py-actions { display: flex; gap: 8px; }
.py-actions .ps-btn { height: 42px; border-radius: 12px; }
.py-kpis { grid-column: 1 / -1; display: grid; grid-template-columns: 1.4fr repeat(3, minmax(0, 1fr)); gap: 8px; }
.py-kpi { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 12px 8px 10px; border-radius: 13px; background: #fff; border: 1px solid var(--py-line); min-width: 0; }
.py-kpi-icon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); flex-shrink: 0; }
.py-kpi div { display: flex; flex-direction: column; min-width: 0; }
.py-kpi small { font-size: 12px; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.py-kpi b { font-size: 18px; font-weight: 760; letter-spacing: -0.02em; }
.py-kpi em { display: inline-flex; align-items: center; gap: 3px; font-style: normal; font-size: 11.5px; font-weight: 650; }
.py-kpi em.up { color: #1f8a3b; } .py-kpi em.down { color: #c4001a; }
.py-kpi--hero { color: #fff; border: none; background: radial-gradient(220px 100px at 90% -20%, rgba(255,255,255,0.3), transparent 70%), linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 12px 26px -16px rgba(10,60,160,0.7); }
.py-kpi--hero .py-kpi-icon { background: rgba(255,255,255,0.2); color: #fff; }
.py-kpi--hero small { color: rgba(255,255,255,0.85); }
.py-kpi--hero b { font-size: 21px; }
.py-kpi--hero em.up, .py-kpi--hero em.down { color: #fff; opacity: 0.9; }

.py-toolbar { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 10px; margin-bottom: 14px; border-radius: 16px; background: #fff; border: 1px solid var(--py-line); }
.py-toolbar::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.py-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.py-seg { display: flex; padding: 3px; border-radius: 11px; background: #f2f3f6; overflow-x: auto; scrollbar-width: none; }
.py-seg button { flex: 0 0 auto; height: 32px; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.py-seg button[aria-selected="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.py-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 200px; }
.py-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.py-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--py-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; background: #fff; }
.py-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.py-amt { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-tertiary); }
.py-amt input { width: 74px; height: 38px; padding: 0 9px; border: 1px solid var(--py-line); border-radius: 10px; font: inherit; font-size: 13px; outline: none; }
.py-amt input:focus { border-color: var(--accent); }
.py-select { height: 38px; padding: 0 30px 0 12px; border: 1px solid var(--py-line); border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600; background: #fff; }
.py-methods { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; align-items: center; }
.py-method { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 12px; border: 1.5px solid var(--py-line); background: #fff; font: inherit; text-align: left; cursor: pointer; }
.py-method > span:last-child { display: flex; flex-direction: column; line-height: 1.2; }
.py-method b { font-size: 13px; font-weight: 650; white-space: nowrap; }
.py-method small { font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; }
.py-method-icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: #f2f4f8; color: var(--text-secondary); }
.py-method[aria-pressed="true"] { border-color: var(--accent); background: #f3f8ff; }
.py-method[aria-pressed="true"] .py-method-icon { background: var(--accent); color: #fff; }
.py-clear { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; }

.py-card { background: #fff; border: 1px solid var(--py-line); border-radius: 18px; overflow: hidden; }
.py-day { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 16px; height: 38px; background: #f6f8fb; border-bottom: 1px solid var(--py-line); position: sticky; top: 0; z-index: 2; }
.py-day span { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); }
.py-day em { font-style: normal; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--text-tertiary); margin-left: 8px; }
.py-day b { font-size: 14px; color: var(--accent); }
.py-tr { display: grid; grid-template-columns: minmax(0, 1fr) 120px 130px 80px; align-items: center; gap: 14px; padding: 0 16px; min-height: 58px; border-bottom: 1px solid #f0f2f5; }
.py-tr:hover { background: #f8fbff; }
.py-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.py-text { display: flex; flex-direction: column; min-width: 0; }
.py-text b { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.py-text small { font-size: 12.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.py-pill { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 12px; background: var(--accent-dim, #e8f1ff); color: var(--accent); font-size: 12px; font-weight: 650; }
.py-amount { display: flex; flex-direction: column; align-items: flex-end; }
.py-amount b { font-size: 15px; font-weight: 720; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.py-amount small { font-size: 12px; color: var(--text-tertiary); }
.py-acts { display: flex; justify-content: flex-end; gap: 2px; }
.py-icon { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.py-icon:hover { background: #eef2f8; color: var(--accent); }
.py-foot { padding: 10px 16px; font-size: 12.5px; color: var(--text-tertiary); }
.py-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 52px 20px; background: #fff; border: 1px solid var(--py-line); border-radius: 18px; }
.py-empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); margin-bottom: 4px; }
.py-empty strong { font-size: 15.5px; } .py-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); }

.py-form { display: flex; flex-direction: column; gap: 18px; }
.py-field { display: flex; flex-direction: column; gap: 8px; }
.py-label { font-size: 13px; font-weight: 650; color: var(--text-secondary); }
.py-label em { font-style: normal; font-weight: 500; color: var(--text-tertiary); }
.py-hint { font-size: 12.5px; color: var(--text-tertiary); }
.py-chosen { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1.5px solid var(--accent); background: #f3f8ff; }
.py-chosen .py-text { flex: 1; }
.py-results { display: flex; flex-direction: column; border: 1px solid var(--separator); border-radius: 12px; overflow: hidden; }
.py-results button { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: none; border-bottom: 1px solid #f0f2f5; background: #fff; font: inherit; text-align: left; cursor: pointer; }
.py-results button:hover { background: #f3f8ff; }
.py-bigamt { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 14px; border: 1.5px solid var(--separator); background: #fafbfd; }
.py-bigamt:focus-within { border-color: var(--accent); background: #fff; box-shadow: 0 0 0 3px var(--accent-dim); }
.py-bigamt span { font-size: 26px; font-weight: 700; color: var(--text-tertiary); }
.py-bigamt input { flex: 1; min-width: 0; border: none; background: transparent; outline: none; font: inherit; font-size: 30px; font-weight: 780; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.py-quick { display: flex; gap: 6px; flex-wrap: wrap; }
.py-quick button { height: 30px; padding: 0 11px; border-radius: 15px; border: 1px solid var(--separator); background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.py-quick button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.py-methodpick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.py-methodpick button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border-radius: 13px; border: 1.5px solid var(--separator); background: #fff; font: inherit; font-size: 13px; font-weight: 650; color: var(--text-secondary); cursor: pointer; }
.py-methodpick button svg:first-child { color: var(--text-tertiary); }
.py-methodpick button[aria-pressed="true"] { border-color: var(--accent); background: #f3f8ff; color: var(--accent); }
.py-methodpick button[aria-pressed="true"] svg:first-child { color: var(--accent); }
.py-tick { position: absolute; top: 6px; right: 6px; width: 16px; height: 16px; padding: 2px; border-radius: 50%; background: var(--accent); color: #fff; }

@media (max-width: 1000px) { .py-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .ps-page.py { padding: 10px 10px 24px !important; }
  .py-head { grid-template-columns: minmax(0, 1fr); }
  .py-actions { width: 100%; } .py-actions .ps-btn { flex: 1; justify-content: center; }
  .py-search { flex-basis: 100%; min-width: 0; }
  .py-search input, .py-amt input, .py-form .ps-input { font-size: 16px; }
  .py-tr { grid-template-columns: minmax(0, 1fr) auto auto; padding: 10px 12px; min-height: 0; }
  .py-hide-sm { display: none; }
  .py-methodpick { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`
