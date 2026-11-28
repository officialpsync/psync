"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Crown, ShieldCheck, CheckCircle2, AlertTriangle, Calendar, Clock,
  CreditCard, ArrowUpRight, Sparkles, Building2, Users, Dumbbell,
  Salad, MessageSquare, Receipt, Download, RefreshCw, Zap, Check,
  ChevronRight, Phone, Mail, HelpCircle, ExternalLink, X, QrCode,
  Copy, IndianRupee, Layers, FileText, CheckIcon, UserCheck, Flame
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { DesignStyles } from "../components/DesignSystem";
import { formatINR, useToast } from "../components/ui";

const supabase = createClient();

type Org = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gst_number: string | null;
  logo_url: string | null;
  created_at: string;
};

type RenewalPlan = {
  id: string;
  name: string;
  durationLabel: string;
  days: number;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  popular?: boolean;
  bestValue?: boolean;
  features: string[];
};

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  planName: string;
  date: string;
  amountPaise: number;
  gstPaise: number;
  totalPaise: number;
  paymentMethod: string;
  status: "paid" | "pending";
};

const RENEWAL_OPTIONS: RenewalPlan[] = [
  {
    id: "1yr",
    name: "Psync Pro · 1 Year",
    durationLabel: "12 Months (Recommended)",
    days: 365,
    originalPrice: 24000,
    discountedPrice: 19999,
    discountPercent: 17,
    popular: true,
    features: [
      "Unlimited active members & biometrics",
      "Unlimited AI workout & diet plan generator",
      "Digital WhatsApp member passes & alerts",
      "Member onboarding form + AWS S3 uploads",
      "Up to 10 staff accounts & branch controls",
      "Priority 24/7 WhatsApp & phone support",
    ],
  },
  {
    id: "2yr",
    name: "Psync Pro · 2 Years",
    durationLabel: "24 Months (Maximum Savings)",
    days: 730,
    originalPrice: 48000,
    discountedPrice: 34999,
    discountPercent: 27,
    bestValue: true,
    features: [
      "Everything in 1-Year Pro plan",
      "Guaranteed price freeze for 2 full years",
      "Free custom domain / branded portal setup",
      "Dedicated account manager & quarterly review",
      "Early access to new Psync AI agent features",
    ],
  },
  {
    id: "6mo",
    name: "Psync Pro · 6 Months",
    durationLabel: "6 Months",
    days: 180,
    originalPrice: 13000,
    discountedPrice: 11999,
    discountPercent: 8,
    features: [
      "Unlimited active members & check-ins",
      "AI diet & workout generators",
      "WhatsApp digital passes",
      "Full analytics & staff management",
    ],
  },
  {
    id: "1mo",
    name: "Psync Pro · 1 Month",
    durationLabel: "Monthly Flexibility",
    days: 30,
    originalPrice: 2499,
    discountedPrice: 2499,
    discountPercent: 0,
    features: [
      "Full access to Psync Pro suite",
      "Pay-as-you-go month-to-month",
      "Cancel or upgrade anytime",
    ],
  },
];

const INITIAL_INVOICES: InvoiceItem[] = [
  {
    id: "inv-2025-01",
    invoiceNumber: "INV-PSYNC-2025-0982",
    planName: "Psync Pro License (Annual)",
    date: "2025-12-30",
    amountPaise: 1999900,
    gstPaise: 359982,
    totalPaise: 2359882,
    paymentMethod: "UPI / Razorpay",
    status: "paid",
  },
  {
    id: "inv-2024-01",
    invoiceNumber: "INV-PSYNC-2024-0412",
    planName: "Psync Pro License (Annual)",
    date: "2024-12-30",
    amountPaise: 1799900,
    gstPaise: 323982,
    totalPaise: 2123882,
    paymentMethod: "Net Banking",
    status: "paid",
  },
];

export default function MembershipPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysLeft, setDaysLeft] = useState(35);
  const [selectedPlan, setSelectedPlan] = useState<RenewalPlan>(RENEWAL_OPTIONS[0]);
  const [renewSheetOpen, setRenewSheetOpen] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"upi" | "card" | "bank">("upi");
  const [processing, setProcessing] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(INITIAL_INVOICES);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Gym Operational stats
  const [activeMembersCount, setActiveMembersCount] = useState<number>(0);
  const [staffCount, setStaffCount] = useState<number>(0);
  const [branchesCount, setBranchesCount] = useState<number>(1);
  const { toast, show } = useToast();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("org_id")
          .eq("user_id", user.id)
          .single();

        if (!roleData?.org_id) return;
        const oid = roleData.org_id;

        // Fetch Org details
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", oid)
          .single();
        if (orgData) setOrg(orgData as Org);

        // Fetch member counts
        const { count: memberCount } = await supabase
          .from("members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", oid);
        setActiveMembersCount(memberCount || 0);

        // Fetch staff counts
        const { count: sCount } = await supabase
          .from("staff")
          .select("*", { count: "exact", head: true })
          .eq("org_id", oid)
          .eq("is_active", true);
        setStaffCount(sCount || 0);

        // Fetch branches count
        const { count: bCount } = await supabase
          .from("branches")
          .select("*", { count: "exact", head: true })
          .eq("org_id", oid);
        setBranchesCount(bCount || 1);
      } catch (err) {
        console.error("Error loading membership page data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Compute expiry date from daysLeft
  const expiryDateString = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + daysLeft);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, [daysLeft]);

  function copyUpi() {
    navigator.clipboard.writeText("psync.billing@icici");
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
    show("UPI ID copied to clipboard!");
  }

  async function handleConfirmRenewal() {
    setProcessing(true);
    // Simulate payment transaction
    setTimeout(() => {
      const addedDays = selectedPlan.days;
      const newDays = daysLeft + addedDays;
      setDaysLeft(newDays);

      const gst = Math.round(selectedPlan.discountedPrice * 0.18 * 100);
      const total = selectedPlan.discountedPrice * 100 + gst;
      const now = new Date().toISOString().slice(0, 10);
      const newInvoice: InvoiceItem = {
        id: `inv-${Date.now()}`,
        invoiceNumber: `INV-PSYNC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        planName: selectedPlan.name,
        date: now,
        amountPaise: selectedPlan.discountedPrice * 100,
        gstPaise: gst,
        totalPaise: total,
        paymentMethod: paymentMode === "upi" ? "UPI (Instant)" : paymentMode === "card" ? "Credit / Debit Card" : "Direct Bank Transfer",
        status: "paid",
      };

      setInvoices((prev) => [newInvoice, ...prev]);
      setProcessing(false);
      setRenewSheetOpen(false);
      show(`🎉 Renewed successfully! Added ${addedDays} days to your Psync subscription.`);
    }, 1200);
  }

  return (
    <div className="ps-page db ms">
      <DesignStyles />
      <style>{MS_CSS}</style>

      <header className="ms-header">
        <div>
          <h1 className="ms-title">Gym Membership & Subscription</h1>
        </div>

        <div className="ms-header-actions">
          <button
            type="button"
            className="ps-btn ps-btn--primary ms-renew-btn"
            onClick={() => setRenewSheetOpen(true)}
          >
            <RefreshCw size={15} />
            <span>Renew Membership</span>
          </button>
        </div>
      </header>
          {/* ── Main Hero Subscription Card ── */}
          <section className="ms-hero">
            <div className="ms-hero-bg" aria-hidden />
            <div className="ms-hero-content">
              <div className="ms-hero-left">
                <div className="ms-hero-tier">
                  <div className="ms-tier-icon">
                    <Crown size={22} />
                  </div>
                  <div>
                    <span className="ms-tier-sub">Current Plan</span>
                    <h2 className="ms-tier-title">Psync Pro (Annual)</h2>
                  </div>
                </div>

                <div className="ms-hero-meta">
                  <div className="ms-meta-item">
                    <Building2 size={15} />
                    <span><b>Gym:</b> {org?.name ?? "Loading..."}</span>
                  </div>
                  {org?.gst_number && (
                    <div className="ms-meta-item">
                      <Receipt size={15} />
                      <span><b>GSTIN:</b> {org.gst_number}</span>
                    </div>
                  )}
                  {org?.email && (
                    <div className="ms-meta-item">
                      <Mail size={15} />
                      <span>{org.email}</span>
                    </div>
                  )}
                  {org?.phone && (
                    <div className="ms-meta-item">
                      <Phone size={15} />
                      <span>{org.phone}</span>
                    </div>
                  )}
                </div>

                <div className="ms-dates-strip">
                  <div className="ms-date-block">
                    <small>Subscription Status</small>
                    <span className="ms-status-chip">
                      <span className="ms-live-dot" />
                      Active & Healthy
                    </span>
                  </div>
                  <div className="ms-date-block">
                    <small>Valid Until</small>
                    <strong>{expiryDateString}</strong>
                  </div>
                  <div className="ms-date-block">
                    <small>Billing Cycle</small>
                    <strong>Annual (Billed Yearly)</strong>
                  </div>
                </div>
              </div>

              {/* Right Hero: Countdown Box */}
              <div className="ms-hero-right">
                <div className="ms-countdown-box">
                  <div className="ms-ring-wrapper">
                    <span
                      className="ms-ring"
                      style={{ "--pct": `${Math.min(100, Math.round((daysLeft / 365) * 100))}%` } as any}
                    >
                      <div className="ms-ring-inner">
                        <span className="ms-countdown-num">{daysLeft}</span>
                        <small className="ms-countdown-lbl">Days Left</small>
                      </div>
                    </span>
                  </div>

                  <p className="ms-ring-text">
                    {daysLeft <= 15 ? (
                      <span style={{ color: "#f87171", fontWeight: 600 }}>
                        <AlertTriangle size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                        Renewal recommended soon!
                      </span>
                    ) : (
                      "Your software license is fully active with zero restrictions."
                    )}
                  </p>

                  <button
                    type="button"
                    className="ms-hero-cta"
                    onClick={() => {
                      setSelectedPlan(RENEWAL_OPTIONS[0]);
                      setRenewSheetOpen(true);
                    }}
                  >
                    <Zap size={15} />
                    <span>Extend Plan (+365 Days)</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Renewal Packages Section ── */}
          <section className="ms-plans-section">
            <div className="ms-section-header">
              <div>
                <h2>Renew or Upgrade Your Psync License</h2>
              </div>
            </div>

            <div className="ms-plans-grid">
              {RENEWAL_OPTIONS.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`ms-plan-card ${plan.popular ? "ms-plan-card--popular" : ""} ${isSelected ? "ms-plan-card--selected" : ""}`}
                  >
                    {plan.popular && <span className="ms-badge-top">Most Popular</span>}
                    {plan.bestValue && <span className="ms-badge-top ms-badge-top--gold">Best Value</span>}

                    <div className="ms-plan-header">
                      <h3>{plan.name}</h3>
                      <div className="ms-plan-duration">{plan.durationLabel}</div>
                    </div>

                    <div className="ms-plan-pricing">
                      <div className="ms-price-main">
                        <span className="ms-curr">₹</span>
                        <span className="ms-amount">{plan.discountedPrice.toLocaleString("en-IN")}</span>
                        <span className="ms-period">/ duration</span>
                      </div>
                      {plan.originalPrice > plan.discountedPrice && (
                        <div className="ms-price-strike">
                          <span className="ms-old">₹{plan.originalPrice.toLocaleString("en-IN")}</span>
                          <span className="ms-save-tag">Save {plan.discountPercent}%</span>
                        </div>
                      )}
                    </div>

                    <ul className="ms-features-list">
                      {plan.features.map((f, i) => (
                        <li key={i}>
                          <CheckCircle2 size={15} className="ms-feat-check" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      type="button"
                      className={`ms-plan-btn ${plan.popular ? "ms-plan-btn--primary" : "ms-plan-btn--secondary"}`}
                      onClick={() => {
                        setSelectedPlan(plan);
                        setRenewSheetOpen(true);
                      }}
                    >
                      <span>Renew for {plan.durationLabel.split(" ")[0]}</span>
                      <ChevronRight size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Invoices & Billing History ── */}
          <section className="ms-invoices-section">
            <div className="ms-section-header">
              <div>
                <h2>Billing & Invoices History</h2>
                <p>Receipts, tax invoices, and renewal transactions for your gym account.</p>
              </div>
            </div>

            <div className="ms-table-wrap">
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Plan / License</th>
                    <th>Date</th>
                    <th>Payment Method</th>
                    <th>Amount (incl. GST)</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <span className="ms-inv-num">
                          <Receipt size={14} />
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td><b>{inv.planName}</b></td>
                      <td>{new Date(inv.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td>{inv.paymentMethod}</td>
                      <td><strong>₹{(inv.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
                      <td>
                        <span className="ms-inv-status ms-inv-status--paid">
                          <CheckIcon size={12} strokeWidth={2.5} />
                          Paid
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="ms-view-btn"
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          <FileText size={13} />
                          <span>View Invoice</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

      {/* ── Slide-in Sheet: Renew Psync Subscription ── */}
      {renewSheetOpen && (
        <div className="ps-sheet-root" data-open="true" onClick={() => setRenewSheetOpen(false)}>
          <div className="ps-sheet-backdrop" />
          <div
            className="ps-sheet"
            style={{ "--sheet-w": "520px" } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
            aria-label="Renew Psync Subscription"
          >
            <div className="ps-sheet-header">
              <div className="ps-sheet-titlebar">
                <div>
                  <div className="ps-sheet-title">Renew Psync Subscription</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                    Extend license for <b>{org?.name || "your gym"}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="ps-icon-btn"
                  onClick={() => setRenewSheetOpen(false)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="ps-sheet-body" style={{ padding: "16px 20px" }}>
              {/* Duration choice */}
              <div className="ms-field-group">
                <label className="ms-label">Select Plan Duration</label>
                <div className="ms-subplan-selector">
                  {RENEWAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ms-subplan-opt ${selectedPlan.id === opt.id ? "ms-subplan-opt--active" : ""}`}
                      onClick={() => setSelectedPlan(opt)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600 }}>{opt.name}</span>
                        <strong>₹{opt.discountedPrice.toLocaleString("en-IN")}</strong>
                      </div>
                      <small style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                        {opt.durationLabel} {opt.discountPercent > 0 && `(Save ${opt.discountPercent}%)`}
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="ms-summary-card">
                <div className="ms-summary-line">
                  <span>Base Plan Fee</span>
                  <span>₹{selectedPlan.discountedPrice.toLocaleString("en-IN")}</span>
                </div>
                <div className="ms-summary-line">
                  <span>GST (18%)</span>
                  <span>₹{(selectedPlan.discountedPrice * 0.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="ms-summary-line ms-summary-line--total">
                  <span>Total Payable Amount</span>
                  <span>₹{(selectedPlan.discountedPrice * 1.18).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="ms-new-date-notice">
                  <Calendar size={14} />
                  <span>New validity will be extended to: <b>{new Date(Date.now() + (daysLeft + selectedPlan.days) * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b></span>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="ms-field-group" style={{ marginTop: 18 }}>
                <label className="ms-label">Select Payment Method</label>
                <div className="ms-paymode-grid">
                  <button
                    type="button"
                    className={`ms-paymode-btn ${paymentMode === "upi" ? "ms-paymode-btn--active" : ""}`}
                    onClick={() => setPaymentMode("upi")}
                  >
                    <QrCode size={18} />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    className={`ms-paymode-btn ${paymentMode === "card" ? "ms-paymode-btn--active" : ""}`}
                    onClick={() => setPaymentMode("card")}
                  >
                    <CreditCard size={18} />
                    <span>Card / NetBanking</span>
                  </button>
                  <button
                    type="button"
                    className={`ms-paymode-btn ${paymentMode === "bank" ? "ms-paymode-btn--active" : ""}`}
                    onClick={() => setPaymentMode("bank")}
                  >
                    <Building2 size={18} />
                    <span>Bank Transfer</span>
                  </button>
                </div>
              </div>

              {/* Payment details block */}
              {paymentMode === "upi" && (
                <div className="ms-upi-box">
                  <div className="ms-qr-sim">
                    <QrCode size={72} style={{ color: "#0a66d6" }} />
                    <small>Scan with GPay, PhonePe, Paytm</small>
                  </div>
                  <div className="ms-upi-id-row">
                    <span>UPI ID: <b>psync.billing@icici</b></span>
                    <button type="button" className="ms-copy-btn" onClick={copyUpi}>
                      {copiedUpi ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedUpi ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {paymentMode === "bank" && (
                <div className="ms-bank-box">
                  <div><b>Account Name:</b> Psync Technologies Private Limited</div>
                  <div><b>Account No:</b> 50200088921841</div>
                  <div><b>IFSC Code:</b> HDFC0000128</div>
                  <div><b>Branch:</b> Indiranagar, Bengaluru</div>
                </div>
              )}

              {paymentMode === "card" && (
                <div className="ms-card-box">
                  <p>All major Indian cards, Net Banking portals & RuPay supported via secure gateway.</p>
                </div>
              )}
            </div>

            <div className="ps-sheet-footer" style={{ padding: "14px 20px" }}>
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => setRenewSheetOpen(false)}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={handleConfirmRenewal}
                disabled={processing}
                style={{ minWidth: 160 }}
              >
                {processing ? (
                  <>
                    <RefreshCw size={14} className="ps-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Pay & Extend (+{selectedPlan.days}d)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: View Invoice Receipt ── */}
      {selectedInvoice && (
        <div className="ps-sheet-root" data-open="true" onClick={() => setSelectedInvoice(null)}>
          <div className="ps-sheet-backdrop" />
          <div
            className="ms-invoice-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal
          >
            <div className="ms-inv-top">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="ms-brand-badge">PSYNC</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Tax Invoice & Receipt</h3>
                  <small style={{ color: "var(--text-secondary)" }}>{selectedInvoice.invoiceNumber}</small>
                </div>
              </div>
              <button type="button" className="ps-icon-btn" onClick={() => setSelectedInvoice(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="ms-inv-body">
              <div className="ms-inv-grid">
                <div>
                  <small>BILLED TO</small>
                  <strong>{org?.name || "Gym Partner"}</strong>
                  <div>{org?.address || "Address on file"}</div>
                  {org?.gst_number && <div>GSTIN: {org.gst_number}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <small>ISSUED BY</small>
                  <strong>Psync Technologies Pvt Ltd</strong>
                  <div>GSTIN: 29AAACP9012K1Z8</div>
                  <div>Bengaluru, Karnataka, 560038</div>
                </div>
              </div>

              <div className="ms-inv-item-row">
                <div>
                  <strong>{selectedInvoice.planName}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Software License Subscription</div>
                </div>
                <strong>₹{(selectedInvoice.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
              </div>

              <div className="ms-inv-item-row">
                <span>Integrated GST (IGST 18%)</span>
                <span>₹{(selectedInvoice.gstPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="ms-inv-total-row">
                <span>Grand Total Paid</span>
                <span>₹{(selectedInvoice.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="ms-inv-meta-line">
                <span>Payment Mode: <b>{selectedInvoice.paymentMethod}</b></span>
                <span>Date: <b>{selectedInvoice.date}</b></span>
                <span className="ms-inv-status ms-inv-status--paid">PAID & SETTLED</span>
              </div>
            </div>

            <div className="ms-inv-foot">
              <button
                type="button"
                className="ps-btn ps-btn--secondary"
                onClick={() => {
                  window.print();
                }}
              >
                <Download size={14} />
                <span>Print / Save PDF</span>
              </button>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MS_CSS = `
.ps-page.ms {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 28px 80px;
}
@media (max-width: 768px) {
  .ps-page.ms {
    padding: 16px 14px 60px;
  }
}

.ms-crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 14px;
}
.ms-crumbs a {
  color: var(--text-secondary);
  text-decoration: none;
}
.ms-crumbs a:hover {
  color: var(--text-primary);
}
.ms-crumbs b {
  color: var(--text-primary);
  font-weight: 600;
}

.ms-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.ms-badge-group {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.ms-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
}
.ms-pill--purple {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.25);
}
.ms-pill--green {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
.ms-pill--amber {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}
.ms-pill--red {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.ms-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
}

.ms-title {
  font-size: 28px;
  font-weight: 750;
  letter-spacing: -0.025em;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.ms-sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  max-width: 680px;
}

.ms-renew-btn {
  height: 42px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 650;
  box-shadow: 0 4px 14px rgba(10, 102, 214, 0.3);
}

/* Renewal Banner */
.ms-renewal-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--mb-soft, #f8fafc);
  border: 1px solid var(--mb-line, #e2e8f0);
  border-radius: 10px;
  margin-bottom: 22px;
}
.ms-renewal-banner-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 550;
}
.ms-renewal-banner-icon {
  color: var(--accent, #0a84ff);
}
.ms-renewal-banner-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #0a84ff);
  text-decoration: none;
}
.ms-renewal-banner-link:hover {
  text-decoration: underline;
}
.dark .ms-renewal-banner {
  background: var(--surface-2);
  border-color: var(--border);
}

/* Tabs */
.ms-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
.ms-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 140ms ease;
}
.ms-tab:hover {
  background: var(--surface-2, rgba(0,0,0,0.04));
  color: var(--text-primary);
}
.ms-tab--active {
  background: var(--accent-dim, rgba(10, 102, 214, 0.1));
  color: var(--accent, #0a66d6);
}
.ms-tab-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  background: #10b981;
  color: #fff;
  font-weight: 700;
}
.ms-tab-count {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  background: #ef4444;
  color: #fff;
  font-weight: 700;
}

/* Hero Section */
.ms-hero {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  color: #fff;
  padding: 28px 32px;
  margin-bottom: 24px;
  box-shadow: 0 20px 48px -18px rgba(10, 60, 160, 0.45);
}
.ms-hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(600px 240px at 85% -10%, rgba(139, 92, 246, 0.75), transparent 60%),
    radial-gradient(500px 260px at 10% 120%, rgba(48, 176, 199, 0.55), transparent 60%),
    linear-gradient(130deg, #093278 0%, #0a52b8 45%, #2a3bd6 100%);
}
.ms-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
}
.ms-hero-left {
  flex: 1;
  min-width: 300px;
}
.ms-hero-tier {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.ms-tier-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  display: grid;
  place-items: center;
  color: #ffd60a;
  backdrop-filter: blur(10px);
}
.ms-tier-sub {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}
.ms-tier-title {
  font-size: 24px;
  font-weight: 750;
  margin: 0;
  letter-spacing: -0.02em;
}
.ms-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.88);
  margin-bottom: 20px;
}
.ms-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ms-dates-strip {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}
.ms-date-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ms-date-block small {
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.72);
}
.ms-date-block strong {
  font-size: 15px;
  font-weight: 650;
}
.ms-status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 650;
  color: #34d399;
}

/* Right Hero: Countdown box */
.ms-hero-right {
  display: flex;
  justify-content: center;
}
.ms-countdown-box {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(14px);
  border-radius: 18px;
  padding: 20px 24px;
  text-align: center;
  width: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ms-ring-wrapper {
  margin-bottom: 12px;
}
.ms-ring {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(#34d399 var(--pct, 50%), rgba(255,255,255,0.2) 0);
  box-shadow: 0 0 16px rgba(52, 211, 153, 0.35);
}
.ms-ring-inner {
  width: 82px;
  height: 82px;
  border-radius: 50%;
  background: #0f3d8f;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ms-countdown-num {
  font-size: 28px;
  font-weight: 850;
  line-height: 1;
}
.ms-countdown-lbl {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}
.ms-ring-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 14px;
  line-height: 1.35;
}
.ms-hero-cta {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: none;
  background: #ffffff;
  color: #0a4fb0;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 140ms ease;
}
.ms-hero-cta:hover {
  background: #f0f5ff;
  transform: translateY(-1px);
}

/* Quotas */
.ms-quotas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-bottom: 30px;
}
.ms-quota-card {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}
.ms-qc-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ms-qc-body small {
  font-size: 11.5px;
  font-weight: 650;
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.ms-qc-body strong {
  display: block;
  font-size: 18px;
  font-weight: 750;
  color: var(--text-primary);
  margin: 2px 0;
}
.ms-qc-cap {
  font-size: 13px;
  font-weight: 550;
  color: var(--text-secondary);
}
.ms-qc-body p {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

/* Plans Section */
.ms-plans-section {
  margin-bottom: 36px;
}
.ms-section-header {
  margin-bottom: 18px;
}
.ms-section-header h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.ms-section-header p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
}

.ms-plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.ms-plan-card {
  position: relative;
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: all 180ms ease;
}
.ms-plan-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-mid);
  box-shadow: var(--shadow-md);
}
.ms-plan-card--popular {
  border: 2px solid var(--accent, #0a66d6);
  background: linear-gradient(180deg, var(--accent-dim, rgba(10, 102, 214, 0.04)) 0%, var(--surface, #fff) 40%);
}
.ms-badge-top {
  position: absolute;
  top: -11px;
  left: 20px;
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--accent, #0a66d6);
  color: #fff;
  padding: 3px 10px;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(10, 102, 214, 0.35);
}
.ms-badge-top--gold {
  background: #f59e0b;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
}

.ms-plan-header h3 {
  font-size: 18px;
  font-weight: 750;
  margin: 0 0 2px;
  color: var(--text-primary);
}
.ms-plan-duration {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.ms-plan-pricing {
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.ms-price-main {
  display: flex;
  align-items: baseline;
  gap: 2px;
}
.ms-curr {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}
.ms-amount {
  font-size: 30px;
  font-weight: 850;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.ms-period {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-left: 4px;
}
.ms-price-strike {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.ms-old {
  font-size: 13px;
  color: var(--text-tertiary);
  text-decoration: line-through;
}
.ms-save-tag {
  font-size: 11px;
  font-weight: 750;
  color: #059669;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 6px;
  border-radius: 6px;
}

.ms-features-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ms-features-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.ms-feat-check {
  color: #10b981;
  flex-shrink: 0;
  margin-top: 2px;
}

.ms-plan-btn {
  width: 100%;
  height: 40px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 140ms ease;
}
.ms-plan-btn--primary {
  background: var(--accent, #0a66d6);
  color: #fff;
}
.ms-plan-btn--primary:hover {
  background: var(--accent-hover, #0856b5);
}
.ms-plan-btn--secondary {
  background: var(--surface-2, rgba(0,0,0,0.05));
  color: var(--text-primary);
  border-color: var(--border);
}
.ms-plan-btn--secondary:hover {
  background: var(--surface-3, rgba(0,0,0,0.08));
}

/* Invoices table */
.ms-invoices-section {
  margin-bottom: 40px;
}
.ms-table-wrap {
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}
.ms-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  text-align: left;
}
.ms-table th {
  background: var(--surface-2, #f9fafb);
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border);
}
.ms-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}
.ms-table tr:last-child td {
  border-bottom: none;
}
.ms-inv-num {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 650;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 12.5px;
}
.ms-inv-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 8px;
}
.ms-inv-status--paid {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.ms-view-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: var(--surface-2, rgba(0,0,0,0.05));
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}
.ms-view-btn:hover {
  color: var(--text-primary);
  background: var(--surface-3, rgba(0,0,0,0.08));
}

/* Member renewals tab */
.ms-member-renewals {
  background: var(--surface, #fff);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}
.ms-card-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.ms-card-h h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 2px;
  color: var(--text-primary);
}
.ms-card-h p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}
.ms-empty {
  text-align: center;
  padding: 48px 20px;
}
.ms-empty h3 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.ms-empty p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
}
.ms-member-link {
  color: var(--text-primary);
  text-decoration: none;
}
.ms-member-link:hover {
  color: var(--accent);
  text-decoration: underline;
}
.ms-wa-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #16a34a;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(22, 163, 74, 0.08);
}
.ms-wa-btn:hover {
  background: rgba(22, 163, 74, 0.16);
}

/* Modal & Sheet UI */
.ms-field-group {
  margin-bottom: 14px;
}
.ms-label {
  display: block;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.ms-subplan-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ms-subplan-opt {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface, #fff);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 120ms ease;
}
.ms-subplan-opt:hover {
  border-color: var(--border-mid);
}
.ms-subplan-opt--active {
  border: 2px solid var(--accent, #0a66d6);
  background: var(--accent-dim, rgba(10, 102, 214, 0.08));
}

.ms-summary-card {
  background: var(--surface-2, rgba(0,0,0,0.03));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  margin-top: 14px;
}
.ms-summary-line {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 4px 0;
}
.ms-summary-line--total {
  border-top: 1px solid var(--border);
  margin-top: 6px;
  padding-top: 8px;
  font-size: 15px;
  font-weight: 750;
  color: var(--text-primary);
}
.ms-new-date-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: #059669;
}

.ms-paymode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ms-paymode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface, #fff);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
}
.ms-paymode-btn:hover {
  color: var(--text-primary);
}
.ms-paymode-btn--active {
  border-color: var(--accent, #0a66d6);
  color: var(--accent, #0a66d6);
  background: var(--accent-dim, rgba(10, 102, 214, 0.08));
}

.ms-upi-box, .ms-bank-box, .ms-card-box {
  background: var(--surface-2, rgba(0,0,0,0.02));
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  margin-top: 12px;
}
.ms-qr-sim {
  text-align: center;
  margin-bottom: 10px;
}
.ms-qr-sim small {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
.ms-upi-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface, #fff);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid var(--border);
}
.ms-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
}
.ms-bank-box div {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 2px 0;
}
.ms-card-box p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* Invoice Modal */
.ms-invoice-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 560px;
  background: var(--surface, #fff);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28);
  border: 1px solid var(--border);
  z-index: 1000;
  overflow: hidden;
}
.ms-inv-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.ms-brand-badge {
  background: #0a66d6;
  color: #fff;
  font-weight: 850;
  font-size: 12px;
  letter-spacing: 0.08em;
  padding: 4px 8px;
  border-radius: 6px;
}
.ms-inv-body {
  padding: 20px;
  font-size: 13.5px;
}
.ms-inv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--border);
}
.ms-inv-grid small {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}
.ms-inv-grid strong {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
}
.ms-inv-item-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  color: var(--text-primary);
}
.ms-inv-total-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0 8px;
  margin-top: 8px;
  border-top: 2px solid var(--border);
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
.ms-inv-meta-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  margin-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  color: var(--text-secondary);
  flex-wrap: wrap;
  gap: 8px;
}
.ms-inv-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  background: var(--surface-2, rgba(0,0,0,0.02));
  border-top: 1px solid var(--border);
}

/* Dark mode adjustments */
.dark .ms-hero-bg {
  background:
    radial-gradient(600px 240px at 85% -10%, rgba(124, 58, 237, 0.6), transparent 60%),
    radial-gradient(500px 260px at 10% 120%, rgba(14, 116, 144, 0.45), transparent 60%),
    linear-gradient(130deg, #091a3e 0%, #0d2f66 45%, #182373 100%);
}
.dark .ms-plan-card--popular {
  background: linear-gradient(180deg, rgba(10, 102, 214, 0.12) 0%, var(--surface) 40%);
}
.dark .ms-inv-num {
  color: #fff;
}
.dark .ms-hero-cta {
  background: #ffffff;
  color: #093278;
}
`;
