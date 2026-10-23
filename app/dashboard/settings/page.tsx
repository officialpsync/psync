"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  Plus, Trash2, MapPin, Building2, Users, ShieldCheck, ShieldOff,
  MoreHorizontal, ImagePlus, X, Loader2, Settings as SettingsIcon, Palette, Store, Pencil, Phone, Check,
  AlertTriangle, ChevronRight, Receipt, Mail, Copy,
} from "lucide-react";
import Link from "next/link";
import { DesignStyles } from "../components/DesignSystem";
import { cols, Segmented, Skeleton, useToast } from "../components/ui";
import { Sheet } from "../components/Sheet";
import {
  type Brand, DEFAULT_BRAND, FONT_OPTIONS, applyBrand, resolveBrand,
  readCachedBrand, fgFor, isValidHex, emitBrandSaved, emitOrgUpdated,
} from "../components/brand";

// ─── Types ────────────────────────────────────────────────────────────────────

type Org = {
  id: string; name: string; email: string | null; phone: string | null;
  address: string | null; gst_number: string | null; logo_url: string | null;
  brand_color: string | null; brand: Brand | null;
};

type Branch     = { id: string; name: string; address: string | null; phone: string | null };
type StaffMember = {
  id: string; full_name: string; phone: string | null; email: string | null;
  role: string | null; specialization: string | null; branch_id: string | null;
  can_view_financials: boolean | null; is_active: boolean | null; joined_at: string | null;
};
type Tab = "gym" | "brand" | "branches" | "staff";

// ─── Constants ────────────────────────────────────────────────────────────────

const supabase = createClient();
const BRANCH_ROW = cols("minmax(0,1fr) auto", "minmax(0,1fr) auto");
const STAFF_ROW  = cols("minmax(0,2fr) minmax(0,1.2fr) minmax(0,1fr) auto", "minmax(0,1fr) auto auto");

const ROLE_OPTIONS = [
  { value: "owner",        label: "Owner" },
  { value: "trainer",      label: "Trainer" },
  { value: "receptionist", label: "Receptionist" },
];
const ROLE_TONE: Record<string, string> = {
  owner: "ps-badge--blue", trainer: "ps-badge--green", receptionist: "ps-badge--amber",
};
const ROLE_DEFAULT_FINANCIALS: Record<string, boolean> = {
  owner: true, trainer: false, receptionist: false,
};

const ACCENT_PRESETS = [
  { label: "Psync Blue", value: "#0071e3" },
  { label: "Midnight",   value: "#1a1a2e" },
  { label: "Forest",     value: "#1f8a3b" },
  { label: "Crimson",    value: "#d70015" },
  { label: "Violet",     value: "#8944ab" },
  { label: "Teal",       value: "#0e7c8f" },
  { label: "Amber",      value: "#b45309" },
  { label: "Slate",      value: "#475569" },
];

const RADIUS_OPTIONS: { value: Brand["radius"]; label: string; px: string }[] = [
  { value: "sharp", label: "Sharp",  px: "4px"  },
  { value: "soft",  label: "Soft",   px: "12px" },
  { value: "round", label: "Round",  px: "20px" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [org,            setOrg]            = useState<Org | null>(null);
  const [branches,       setBranches]       = useState<Branch[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [dirty,          setDirty]          = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [savingBranch,   setSavingBranch]   = useState(false);
  const [branchForm,     setBranchForm]     = useState({ name: "", address: "", phone: "" });
  const [editBranch,     setEditBranch]     = useState<Branch | null>(null);
  const [tab,            setTab]            = useState<Tab>("gym");
  const [uploadingLogo,  setUploadingLogo]  = useState(false);
  const [logoPreview,    setLogoPreview]    = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [staff,          setStaff]          = useState<StaffMember[]>([]);
  const [showStaffForm,  setShowStaffForm]  = useState(false);
  const [savingStaff,    setSavingStaff]    = useState(false);
  const [staffForm,      setStaffForm]      = useState({
    full_name: "", phone: "", email: "", role: "trainer",
    specialization: "", branch_id: "", can_view_financials: false,
  });
  const [orgId, setOrgId] = useState<string | null>(null);

  // Branding state
  const [brand,        setBrand]        = useState<Brand>(DEFAULT_BRAND);
  const [accentHex,    setAccentHex]    = useState(DEFAULT_BRAND.accent);
  const [savingBrand,  setSavingBrand]  = useState(false);
  const [brandDirty,   setBrandDirty]   = useState(false);

  const { toast, show } = useToast();

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase
        .from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      const oid = roleData.org_id;
      setOrgId(oid);
      const { data: orgData } = await supabase
        .from("organizations").select("*").eq("id", oid).single();
      const od = orgData as Org;
      setOrg(od);

      // Merge saved brand over defaults (honours the legacy brand_color column)
      const saved = resolveBrand(od.brand, od.brand_color);
      setBrand(saved);
      setAccentHex(saved.accent);
      applyBrand(saved);

      const { data: branchData } = await supabase
        .from("branches").select("*").eq("org_id", oid).order("created_at");
      setBranches((branchData as Branch[]) || []);
      const { data: staffData } = await supabase
        .from("staff").select("*").eq("org_id", oid).order("created_at");
      setStaff((staffData as StaffMember[]) || []);
    }
    load();
  }, []);

  // Settings previews theme changes live. Leaving without saving must not leave the preview behind.
  useEffect(() => {
    return () => { applyBrand(readCachedBrand() ?? DEFAULT_BRAND); };
  }, []);

  // ── Org form ──────────────────────────────────────────────────────────────

  function update(patch: Partial<Org>) {
    if (!org) return;
    setOrg({ ...org, ...patch });
    setDirty(true);
  }

  async function saveOrg() {
    if (!org || !org.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("organizations").update({
      name: org.name.trim(), email: org.email, phone: org.phone,
      address: org.address, gst_number: org.gst_number,
    }).eq("id", org.id);
    setSaving(false);
    if (error) { show("Couldn't save changes. Try again.", "error"); return; }
    setDirty(false);
    emitOrgUpdated({ name: org.name.trim() });
    show("Changes saved");
  }

  // ── Logo ──────────────────────────────────────────────────────────────────

  async function uploadLogo(file: File) {
    if (!org) return;
    setUploadingLogo(true);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${org.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("org-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("org-assets").getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      await supabase.from("organizations").update({ logo_url: urlWithBust }).eq("id", org.id);
      setOrg((o) => o ? { ...o, logo_url: urlWithBust } : o);
      emitOrgUpdated({ logo_url: urlWithBust });
      setLogoPreview(null);
      show("Logo updated");
    } catch {
      setLogoPreview(null);
      show("Upload failed. Try again.", "error");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    if (!org?.logo_url) return;
    setUploadingLogo(true);
    try {
      const match = org.logo_url.match(/org-assets\/(.+?)(\?|$)/);
      if (match) await supabase.storage.from("org-assets").remove([match[1]]);
      await supabase.from("organizations").update({ logo_url: null }).eq("id", org.id);
      setOrg((o) => o ? { ...o, logo_url: null } : o);
      emitOrgUpdated({ logo_url: null });
      show("Logo removed");
    } catch {
      show("Couldn't remove logo. Try again.", "error");
    } finally {
      setUploadingLogo(false);
    }
  }

  // ── Brand ─────────────────────────────────────────────────────────────────

  function patchBrand(patch: Partial<Brand>) {
    setBrand((b) => {
      const next = { ...b, ...patch };
      applyBrand(next);
      setBrandDirty(true);
      return next;
    });
  }

  async function saveBrand() {
    if (!org) return;
    setSavingBrand(true);
    const { error } = await supabase.from("organizations")
      .update({ brand, brand_color: brand.accent })
      .eq("id", org.id);
    setSavingBrand(false);
    if (error) { show("Couldn't save branding. Try again.", "error"); return; }
    setOrg((o) => o ? { ...o, brand } : o);
    setBrandDirty(false);
    emitBrandSaved(brand);
    show("Branding saved");
  }

  function resetBrand() {
    setBrand(DEFAULT_BRAND);
    setAccentHex(DEFAULT_BRAND.accent);
    applyBrand(DEFAULT_BRAND);
    setBrandDirty(true);
  }

  // ── Branch / staff helpers (unchanged) ───────────────────────────────────

  async function addBranch() {
    if (!org || !branchForm.name.trim()) return;
    setSavingBranch(true);
    const payload = { name: branchForm.name.trim(), address: branchForm.address || null, phone: branchForm.phone || null };
    const { error } = editBranch
      ? await supabase.from("branches").update(payload).eq("id", editBranch.id).eq("org_id", org.id)
      : await supabase.from("branches").insert({ org_id: org.id, ...payload });
    if (!error) {
      const { data } = await supabase.from("branches").select("*").eq("org_id", org.id).order("created_at");
      setBranches((data as Branch[]) || []);
      setBranchForm({ name: "", address: "", phone: "" });
      setShowBranchForm(false);
      show(editBranch ? "Branch updated" : "Branch added");
      setEditBranch(null);
    } else {
      show("Couldn't add the branch. Try again.", "error");
    }
    setSavingBranch(false);
  }

  async function deleteBranch(b: Branch) {
    if (!confirm(`Delete "${b.name}"? Members linked to it will not be deleted.`)) return;
    await supabase.from("branches").delete().eq("id", b.id);
    setBranches((list) => list.filter((br) => br.id !== b.id));
    show("Branch deleted");
  }

  async function reloadStaff() {
    if (!orgId) return;
    const { data } = await supabase.from("staff").select("*").eq("org_id", orgId).order("created_at");
    setStaff((data as StaffMember[]) || []);
  }

  async function addStaff() {
    if (!orgId || !staffForm.full_name.trim()) return;
    setSavingStaff(true);
    const { error } = await supabase.from("staff").insert({
      org_id: orgId, full_name: staffForm.full_name.trim(),
      phone: staffForm.phone || null, email: staffForm.email || null,
      role: staffForm.role, specialization: staffForm.specialization || null,
      branch_id: staffForm.branch_id || null,
      can_view_financials: staffForm.can_view_financials, is_active: true,
    });
    setSavingStaff(false);
    if (error) { show("Couldn't add staff. Try again.", "error"); return; }
    setStaffForm({ full_name: "", phone: "", email: "", role: "trainer", specialization: "", branch_id: "", can_view_financials: false });
    setShowStaffForm(false);
    await reloadStaff();
    show("Staff member added");
  }

  async function toggleStaffActive(s: StaffMember) {
    const next = !s.is_active;
    await supabase.from("staff").update({ is_active: next }).eq("id", s.id);
    setStaff((list) => list.map((m) => m.id === s.id ? { ...m, is_active: next } : m));
    show(next ? s.full_name.split(" ")[0] + " reactivated" : s.full_name.split(" ")[0] + " deactivated");
  }

  async function toggleFinancials(s: StaffMember) {
    const next = !s.can_view_financials;
    await supabase.from("staff").update({ can_view_financials: next }).eq("id", s.id);
    setStaff((list) => list.map((m) => m.id === s.id ? { ...m, can_view_financials: next } : m));
    show(next ? "Financial access granted" : "Financial access removed");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const gstOk = !org?.gst_number || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(org.gst_number);
  const profileChecks = org ? [
    { ok: !!org.logo_url, label: "Logo" }, { ok: !!org.phone, label: "Phone" }, { ok: !!org.email, label: "Email" },
    { ok: !!org.address, label: "Address" }, { ok: !!org.gst_number && gstOk, label: "GST number" }, { ok: branches.length > 0, label: "A branch" },
  ] : [];
  const done = profileChecks.filter((c) => c.ok).length;
  const pct = profileChecks.length ? Math.round((done / profileChecks.length) * 100) : 0;
  const activeStaff = staff.filter((x) => x.is_active).length;
  const NAV: { key: Tab; label: string; sub: string; icon: React.ElementType; badge?: string }[] = [
    { key: "gym", label: "Gym profile", sub: "Name, contact, GST, logo", icon: Store, badge: dirty ? "Unsaved" : undefined },
    { key: "brand", label: "Branding", sub: "Colour, corners, font", icon: Palette, badge: brandDirty ? "Unsaved" : undefined },
    { key: "branches", label: "Branches", sub: `${branches.length} location${branches.length === 1 ? "" : "s"}`, icon: Building2 },
    { key: "staff", label: "Team access", sub: `${activeStaff} active`, icon: Users },
  ];
  function openBranch(b: Branch | null) {
    setEditBranch(b);
    setBranchForm(b ? { name: b.name, address: b.address ?? "", phone: b.phone ?? "" } : { name: "", address: "", phone: "" });
    setShowBranchForm(true);
  }

  return (
    <div className="ps-page db st">
      <DesignStyles />
      <style>{ST_CSS}</style>

      <header className="st-head">
        <div className="st-title">
          <span className="st-title-icon"><SettingsIcon size={21} /></span>
          <div><h1>Settings</h1><p>Your gym&apos;s profile, branding, branches and team access.</p></div>
        </div>
        {org && (
          <div className="st-progress" title={profileChecks.filter((c) => !c.ok).map((c) => c.label).join(", ") || "All set"}>
            <span className="st-ring" style={{ ["--p" as string]: pct } as React.CSSProperties}><b>{pct}%</b></span>
            <div><strong>Profile {pct === 100 ? "complete" : "setup"}</strong><small>{pct === 100 ? "Receipts and invoices have everything" : `Add ${profileChecks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(", ")}`}</small></div>
          </div>
        )}
      </header>

      <div className="st-layout">
        <nav className="st-nav" aria-label="Settings sections">
          {NAV.map((n) => (
            <button key={n.key} type="button" aria-current={tab === n.key} onClick={() => setTab(n.key)}>
              <span className="st-nav-icon"><n.icon size={16} /></span>
              <span className="st-nav-text"><b>{n.label}</b><small>{n.sub}</small></span>
              {n.badge && <em>{n.badge}</em>}
            </button>
          ))}
        </nav>

        <div className="st-main">
          {/* ── GYM PROFILE ── */}
          {tab === "gym" && (!org ? (
            <section className="st-card">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={42} r={12} />)}</section>
          ) : (
            <>
              <section className="st-card">
                <div className="st-card-h"><span className="st-card-icon"><ImagePlus size={16} /></span><div><h2>Logo</h2><p>Shown on receipts, invoices and the sidebar. PNG, JPG or WebP, up to 2 MB.</p></div></div>
                <div className="st-logo">
                  <div className="st-logo-box">
                    {uploadingLogo ? <Loader2 size={22} className="ps-spin" />
                      : (logoPreview || org.logo_url) ? <img src={logoPreview || org.logo_url!} alt="Gym logo" />
                      : <ImagePlus size={24} />}
                  </div>
                  <div className="st-logo-acts">
                    <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                      <ImagePlus size={14} />{org.logo_url ? "Change logo" : "Upload logo"}
                    </button>
                    {org.logo_url && <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={removeLogo} disabled={uploadingLogo}><X size={14} /> Remove</button>}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { show("File too large. Max 2 MB.", "error"); return; }
                      uploadLogo(file); e.target.value = "";
                    }} />
                </div>
              </section>

              <section className="st-card">
                <div className="st-card-h"><span className="st-card-icon"><Store size={16} /></span><div><h2>Gym details</h2><p>Used on receipts, invoices, WhatsApp messages and member-facing pages.</p></div></div>
                <div className="st-grid">
                  <label className="st-field st-span-2"><span>Gym name</span>
                    <input className="ps-input" value={org.name} onChange={(e) => update({ name: e.target.value })} autoComplete="organization" data-invalid={!org.name.trim()} />
                    {!org.name.trim() && <small className="st-err">Gym name is required</small>}
                  </label>
                  <label className="st-field"><span><Mail size={13} />Email</span>
                    <input className="ps-input" type="email" inputMode="email" value={org.email || ""} onChange={(e) => update({ email: e.target.value })} placeholder="gym@example.com" />
                  </label>
                  <label className="st-field"><span><Phone size={13} />Phone</span>
                    <input className="ps-input" type="tel" inputMode="tel" value={org.phone || ""} onChange={(e) => update({ phone: e.target.value })} placeholder="+91 98765 43210" />
                  </label>
                  <label className="st-field st-span-2"><span><MapPin size={13} />Address</span>
                    <textarea className="ps-input" rows={2} value={org.address || ""} onChange={(e) => update({ address: e.target.value })} placeholder="Shop 4, Sector 10, Dwarka, Delhi" />
                  </label>
                  <label className="st-field"><span><Receipt size={13} />GST number</span>
                    <input className="ps-input" value={org.gst_number || ""} maxLength={15} onChange={(e) => update({ gst_number: e.target.value.toUpperCase().replace(/\s/g, "") })}
                      placeholder="22AAAAA0000A1Z5" autoCapitalize="characters" autoCorrect="off" spellCheck={false} data-invalid={!gstOk} />
                    {!gstOk ? <small className="st-err"><AlertTriangle size={12} />This doesn&apos;t look like a valid 15-character GSTIN</small>
                      : org.gst_number ? <small className="st-ok"><Check size={12} />Valid format · state code {org.gst_number.slice(0, 2)}</small> : <small>Optional. Adds GST to invoices.</small>}
                  </label>
                </div>
              </section>

              <section className="st-card">
                <div className="st-card-h"><span className="st-card-icon"><Receipt size={16} /></span><div><h2>Receipt preview</h2><p>How your details appear at the top of invoices.</p></div></div>
                <div className="st-receipt">
                  <div className="st-receipt-logo">{org.logo_url ? <img src={org.logo_url} alt="" /> : <Store size={20} />}</div>
                  <div className="st-receipt-text">
                    <b>{org.name || "Your gym"}</b>
                    <small>{org.address || "Address not added"}</small>
                    <small>{[org.phone, org.email].filter(Boolean).join(" · ") || "Contact not added"}</small>
                    {org.gst_number && <small>GSTIN: {org.gst_number}</small>}
                  </div>
                  <span className="st-receipt-tag">TAX INVOICE</span>
                </div>
              </section>
            </>
          ))}

          {/* ── BRANDING ── */}
          {tab === "brand" && org && (
            <section className="st-card">
              <div className="st-card-h"><span className="st-card-icon"><Palette size={16} /></span><div><h2>Branding</h2><p>Colours, shape and typography across the whole dashboard. Changes preview live.</p></div></div>
              <BrandPreview brand={brand} />
              <BrandSection label="Accent colour" desc="Buttons, links, active states and badges.">
                <div className="st-swatches">
                  {ACCENT_PRESETS.map((p) => (
                    <button key={p.value} type="button" title={p.label} aria-label={p.label} aria-pressed={brand.accent === p.value}
                      onClick={() => { patchBrand({ accent: p.value }); setAccentHex(p.value); }} style={{ background: p.value }}>
                      {brand.accent === p.value && <Check size={14} strokeWidth={3} color={fgFor(p.value)} />}
                    </button>
                  ))}
                  <label className="st-swatch-custom" title="Custom colour" style={{ background: ACCENT_PRESETS.some((p) => p.value === brand.accent) ? undefined : brand.accent }}>
                    <input type="color" value={brand.accent} onChange={(e) => { patchBrand({ accent: e.target.value }); setAccentHex(e.target.value); }} />
                    <Plus size={14} />
                  </label>
                  <span className="st-hex"><i style={{ background: brand.accent }} />
                    <input value={accentHex} maxLength={7} spellCheck={false} autoCorrect="off" placeholder="#0071e3"
                      onChange={(e) => { const v = e.target.value; setAccentHex(v); if (isValidHex(v)) patchBrand({ accent: v }); }}
                      onBlur={() => { if (!isValidHex(accentHex)) setAccentHex(brand.accent); }} />
                  </span>
                </div>
              </BrandSection>
              <BrandSection label="Corner style" desc="Buttons, inputs, cards and badges.">
                <div className="st-opts">
                  {RADIUS_OPTIONS.map((r) => (
                    <button key={r.value} type="button" aria-pressed={brand.radius === r.value} onClick={() => patchBrand({ radius: r.value })} style={{ borderRadius: r.px }}>{r.label}</button>
                  ))}
                </div>
              </BrandSection>
              <BrandSection label="Font" desc="All text in the dashboard.">
                <div className="st-opts">
                  {FONT_OPTIONS.map((f) => (
                    <button key={f.value} type="button" aria-pressed={brand.font === f.value} onClick={() => patchBrand({ font: f.value })} style={{ fontFamily: f.stack }}>{f.label}</button>
                  ))}
                </div>
              </BrandSection>
              <div className="st-actions">
                {brandDirty && <span className="st-unsaved">Unsaved changes</span>}
                <button type="button" className="ps-btn ps-btn--secondary" onClick={resetBrand} disabled={savingBrand}>Reset to defaults</button>
                <button type="button" className="ps-btn ps-btn--primary" onClick={saveBrand} disabled={savingBrand || !brandDirty}>
                  {savingBrand ? <><Loader2 size={14} className="ps-spin" /> Saving…</> : <><Check size={15} /> Save branding</>}
                </button>
              </div>
            </section>
          )}

          {/* ── BRANCHES ── */}
          {tab === "branches" && (
            <section className="st-card">
              <div className="st-card-h"><span className="st-card-icon"><Building2 size={16} /></span>
                <div><h2>Branches</h2><p>Each location, so members, staff and revenue can be tracked by branch.</p></div>
                <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => openBranch(null)}><Plus size={14} strokeWidth={2.4} /> Add branch</button>
              </div>
              {branches.length === 0 ? (
                <div className="st-empty"><span><Building2 size={20} /></span><strong>No branches yet</strong><p>Add each location so you can track members and revenue by branch.</p></div>
              ) : (
                <div className="st-branches">
                  {branches.map((b, i) => (
                    <div key={b.id} className="st-branch">
                      <span className="st-branch-num">{i + 1}</span>
                      <div className="st-branch-text">
                        <b>{b.name}</b>
                        <small><MapPin size={12} />{b.address || "No address added"}</small>
                        {b.phone && <small><Phone size={12} />{b.phone}</small>}
                      </div>
                      <div className="st-branch-acts">
                        {b.address && <a className="st-icon" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open in Google Maps"><MapPin size={15} /></a>}
                        {b.address && <button type="button" className="st-icon" title="Copy address" aria-label="Copy address" onClick={() => { navigator.clipboard?.writeText(b.address!); show("Address copied"); }}><Copy size={15} /></button>}
                        <button type="button" className="st-icon" title="Edit" aria-label={`Edit ${b.name}`} onClick={() => openBranch(b)}><Pencil size={15} /></button>
                        <button type="button" className="st-icon st-icon--danger" title="Delete" aria-label={`Delete ${b.name}`} onClick={() => deleteBranch(b)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── TEAM ACCESS ── */}
          {tab === "staff" && (
            <>
              <section className="st-card st-team">
                <div className="st-card-h"><span className="st-card-icon"><Users size={16} /></span><div><h2>Team access</h2><p>Logins, roles and which modules each person can open are managed on the Staff page.</p></div></div>
                <div className="st-team-stats">
                  <div><small>Active</small><b>{activeStaff}</b></div>
                  <div><small>Inactive</small><b>{staff.length - activeStaff}</b></div>
                  <div><small>Can see financials</small><b>{staff.filter((x) => x.can_view_financials).length}</b></div>
                </div>
                <Link href="/dashboard/staff" className="st-team-link">
                  <span><b>Open the Staff page</b><small>Add people, send invites, set module access</small></span><ChevronRight size={18} />
                </Link>
              </section>
              {staff.length > 0 && (
                <section className="st-card">
                  <div className="st-card-h"><span className="st-card-icon"><ShieldCheck size={16} /></span><div><h2>Quick controls</h2><p>Financial access and active status.</p></div>
                    <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setShowStaffForm(true)}><Plus size={14} /> Quick add</button>
                  </div>
                  <div className="st-branches">
                    {staff.map((x) => (
                      <div key={x.id} className="st-branch" data-off={!x.is_active}>
                        <span className="st-branch-num"><Users size={14} /></span>
                        <div className="st-branch-text">
                          <b>{x.full_name}</b>
                          <small>{[ROLE_OPTIONS.find((r) => r.value === x.role)?.label ?? x.role, x.specialization, x.phone].filter(Boolean).join(" · ") || "No details"}</small>
                        </div>
                        <div className="st-branch-acts">
                          <button type="button" className="st-pill" data-on={!!x.can_view_financials} onClick={() => toggleFinancials(x)} title="Toggle financial access">
                            {x.can_view_financials ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}Financials
                          </button>
                          <button type="button" className="st-pill" data-on={!!x.is_active} onClick={() => toggleStaffActive(x)}>
                            {x.is_active ? "Active" : "Inactive"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {tab === "gym" && org && dirty && (
        <div className="st-savebar">
          <span>You have unsaved changes to your gym details.</span>
          <button type="button" className="ps-btn ps-btn--primary" onClick={saveOrg} disabled={saving || !org.name.trim() || !gstOk}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      {/* ── Sheets ────────────────────────────────────────────────────────── */}

      <Sheet open={showStaffForm} onClose={() => setShowStaffForm(false)}
        title="Add staff member" description="Trainers, receptionists and other team members."
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setShowStaffForm(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={addStaff}
              disabled={!staffForm.full_name.trim() || savingStaff}>
              {savingStaff ? "Adding…" : "Add staff"}
            </button>
          </>
        }
      >
        <div className="ps-form-grid">
          <label className="ps-field ps-span-2">
            <span className="ps-label">Full name</span>
            <input className="ps-input" value={staffForm.full_name}
              onChange={(e) => setStaffForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Ravi Kumar" autoComplete="name" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Phone</span>
            <input className="ps-input" type="tel" inputMode="tel" value={staffForm.phone}
              onChange={(e) => setStaffForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 98765 43210" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Email</span>
            <input className="ps-input" type="email" inputMode="email" value={staffForm.email}
              onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="ravi@gym.com" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Role</span>
            <select className="ps-input" value={staffForm.role}
              onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value, can_view_financials: ROLE_DEFAULT_FINANCIALS[e.target.value] ?? false }))}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="ps-field">
            <span className="ps-label">Specialization</span>
            <input className="ps-input" value={staffForm.specialization}
              onChange={(e) => setStaffForm((f) => ({ ...f, specialization: e.target.value }))}
              placeholder="Weight training, Zumba…" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Branch</span>
            <select className="ps-input" value={staffForm.branch_id}
              onChange={(e) => setStaffForm((f) => ({ ...f, branch_id: e.target.value }))}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="ps-field ps-span-2"
            style={{ flexDirection: "row", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={staffForm.can_view_financials}
              onChange={(e) => setStaffForm((f) => ({ ...f, can_view_financials: e.target.checked }))}
              style={{ width: 16, height: 16, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Can view financial data</div>
              <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2 }}>Revenue, payments and reports</div>
            </div>
          </label>
        </div>
      </Sheet>

      <Sheet open={showBranchForm} onClose={() => { setShowBranchForm(false); setEditBranch(null); }}
        title={editBranch ? "Edit branch" : "New branch"} description={editBranch ? "Update this location's details." : "Add another location for your gym."}
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setShowBranchForm(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={addBranch}
              disabled={!branchForm.name.trim() || savingBranch}>
              {savingBranch ? "Saving…" : editBranch ? "Save changes" : "Add branch"}
            </button>
          </>
        }
      >
        <div className="ps-form-grid">
          <label className="ps-field ps-span-2">
            <span className="ps-label">Branch name</span>
            <input className="ps-input" value={branchForm.name}
              onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Sector 10" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Phone</span>
            <input className="ps-input" type="tel" inputMode="tel" value={branchForm.phone}
              onChange={(e) => setBranchForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+91 98765 43210" />
          </label>
          <label className="ps-field">
            <span className="ps-label">Address</span>
            <input className="ps-input" value={branchForm.address}
              onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, area, city" />
          </label>
        </div>
      </Sheet>

      {toast}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandSection({
  label, desc, children,
}: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="st-bsec">
      <div className="st-bsec-h"><b>{label}</b><small>{desc}</small></div>
      {children}
    </div>
  );
}

function BrandPreview({ brand }: { brand: Brand }) {
  const fg = fgFor(brand.accent);
  const font = FONT_OPTIONS.find((f) => f.value === brand.font)?.stack ?? "inherit";
  const r = brand.radius === "sharp" ? "6px" : "999px"; // matches --radius-pill

  return (
    <div style={{
      background: "var(--fill)", borderRadius: 12, padding: 16,
      marginBottom: 24, border: "1px solid var(--border)",
      display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      fontFamily: font,
    }}>
      {/* Primary button */}
      <div style={{
        padding: "8px 18px", borderRadius: r, fontSize: 13, fontWeight: 600,
        background: brand.accent, color: fg, userSelect: "none",
      }}>
        Save changes
      </div>
      {/* Secondary button */}
      <div style={{
        padding: "8px 16px", borderRadius: r, fontSize: 13, fontWeight: 500,
        background: "var(--surface)", color: "var(--text-primary)",
        border: "1.5px solid var(--border-mid)", userSelect: "none",
      }}>
        Cancel
      </div>
      {/* Badge */}
      <div style={{
        padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
        background: `${brand.accent}1a`, color: brand.accent, userSelect: "none",
      }}>
        Active
      </div>
      {/* Link */}
      <div style={{ fontSize: 13, color: brand.accent, fontWeight: 500, userSelect: "none" }}>
        View details
      </div>
      {/* Mini card */}
      <div style={{
        marginLeft: "auto", background: "var(--surface)",
        borderRadius: r, padding: "8px 14px",
        border: "1px solid var(--border)", fontSize: 12,
        color: "var(--text-secondary)", userSelect: "none",
        boxShadow: "var(--shadow-sm)",
      }}>
        {FONT_OPTIONS.find((f) => f.value === brand.font)?.label ?? "Inter"} · {brand.radius}
      </div>
    </div>
  );
}

// NOTE: no backticks inside this CSS.
const ST_CSS = `
.ps-page.st { max-width: none !important; margin: 0 !important; padding: 18px 18px 96px !important; }
.db.st { max-width: none; }
.st { --st-line: var(--separator); }
.st-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.st-title { display: flex; align-items: center; gap: 12px; }
.st-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); }
.st-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.st-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.st-progress { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 8px; border-radius: 14px; background: #fff; border: 1px solid var(--st-line); max-width: 420px; }
.st-progress div { display: flex; flex-direction: column; min-width: 0; }
.st-progress strong { font-size: 13.5px; } .st-progress small { font-size: 12px; color: var(--text-tertiary); }
.st-ring { --p: 0; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; background: conic-gradient(var(--accent) calc(var(--p) * 1%), #e8eef8 0); }
.st-ring b { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #fff; font-size: 11.5px; }

.st-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
.st-nav { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 18px; background: #fff; border: 1px solid var(--st-line); }
.st-nav button { display: flex; align-items: center; gap: 10px; padding: 10px; border: none; border-radius: 12px; background: none; font: inherit; text-align: left; cursor: pointer; }
.st-nav button:hover { background: #f4f7fc; }
.st-nav button[aria-current="true"] { background: #eef4ff; }
.st-nav-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #f2f4f8; color: var(--text-secondary); flex-shrink: 0; }
.st-nav button[aria-current="true"] .st-nav-icon { background: linear-gradient(135deg, #0a66d6, #3c4fe0); color: #fff; }
.st-nav-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.st-nav-text b { font-size: 14px; font-weight: 650; color: var(--text-primary); }
.st-nav button[aria-current="true"] .st-nav-text b { color: var(--accent); }
.st-nav-text small { font-size: 12px; color: var(--text-tertiary); }
.st-nav em { font-style: normal; font-size: 10.5px; font-weight: 750; padding: 2px 7px; border-radius: 8px; background: #fff1de; color: #b45309; }

.st-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.st-card { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; background: #fff; border: 1px solid var(--st-line); border-radius: 18px; padding: 18px 20px; }
.st-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.st-card-h { display: flex; align-items: flex-start; gap: 12px; }
.st-card-h > div { flex: 1; min-width: 0; }
.st-card-h h2 { margin: 0; font-size: 16px; font-weight: 700; }
.st-card-h p { margin: 2px 0 0; font-size: 13px; color: var(--text-tertiary); }
.st-card-icon { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); }

.st-logo { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.st-logo-box { width: 84px; height: 84px; border-radius: 18px; overflow: hidden; display: grid; place-items: center; background: #f4f7fc; border: 1.5px dashed #c9d6f2; color: var(--text-tertiary); }
.st-logo-box img { width: 100%; height: 100%; object-fit: cover; }
.st-logo-acts { display: flex; gap: 8px; flex-wrap: wrap; }

.st-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.st-span-2 { grid-column: 1 / -1; }
.st-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.st-field > span { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.st-field > span svg { color: var(--text-tertiary); }
.st-field small { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-tertiary); }
.st-field .st-err { color: #c4001a; font-weight: 600; } .st-field .st-ok { color: #1f8a3b; font-weight: 600; }
.st-field .ps-input[data-invalid="true"] { border-color: #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,0.12); }
.st-field textarea { resize: vertical; }

.st-receipt { position: relative; display: flex; align-items: flex-start; gap: 14px; padding: 16px; border-radius: 14px; border: 1px solid var(--st-line); background: linear-gradient(180deg, #fbfcff, #fff); }
.st-receipt-logo { width: 52px; height: 52px; border-radius: 12px; overflow: hidden; display: grid; place-items: center; background: #eef4ff; color: var(--accent); flex-shrink: 0; }
.st-receipt-logo img { width: 100%; height: 100%; object-fit: cover; }
.st-receipt-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-receipt-text b { font-size: 16px; } .st-receipt-text small { font-size: 12.5px; color: var(--text-tertiary); }
.st-receipt-tag { margin-left: auto; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: var(--accent); }

.st-bsec { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid #f0f2f5; }
.st-bsec-h { display: flex; flex-direction: column; }
.st-bsec-h b { font-size: 14px; } .st-bsec-h small { font-size: 12.5px; color: var(--text-tertiary); }
.st-swatches { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-swatches > button { width: 36px; height: 36px; border-radius: 11px; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--st-line); display: grid; place-items: center; cursor: pointer; }
.st-swatches > button[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--text-primary); }
.st-swatch-custom { position: relative; width: 36px; height: 36px; border-radius: 11px; border: 2px dashed #c4c8d0; display: grid; place-items: center; cursor: pointer; color: var(--text-tertiary); overflow: hidden; }
.st-swatch-custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.st-hex { position: relative; display: inline-flex; align-items: center; margin-left: 4px; }
.st-hex i { position: absolute; left: 10px; width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--st-line); }
.st-hex input { width: 120px; height: 36px; padding: 0 10px 0 32px; border: 1px solid var(--st-line); border-radius: 10px; font-family: monospace; font-size: 13px; outline: none; }
.st-hex input:focus { border-color: var(--accent); }
.st-opts { display: flex; gap: 8px; flex-wrap: wrap; }
.st-opts button { height: 36px; padding: 0 16px; border: 1.5px solid var(--st-line); background: #fff; font-size: 13.5px; font-weight: 600; color: var(--text-primary); cursor: pointer; border-radius: 10px; }
.st-opts button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.st-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid #f0f2f5; flex-wrap: wrap; }
.st-unsaved { margin-right: auto; font-size: 12.5px; font-weight: 650; color: #b45309; }

.st-branches { display: flex; flex-direction: column; gap: 8px; }
.st-branch { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--st-line); }
.st-branch:hover { border-color: #c9d6f2; background: #fafcff; }
.st-branch[data-off="true"] { opacity: 0.6; }
.st-branch-num { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #eef4ff; color: var(--accent); font-weight: 750; font-size: 13px; flex-shrink: 0; }
.st-branch-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.st-branch-text b { font-size: 14.5px; }
.st-branch-text small { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-branch-acts { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.st-icon { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.st-icon:hover { background: #eef2f8; color: var(--accent); }
.st-icon--danger:hover { background: #fff0f1; color: #c4001a; }
.st-pill { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--st-line); background: #fff; font: inherit; font-size: 12px; font-weight: 650; color: var(--text-tertiary); cursor: pointer; }
.st-pill[data-on="true"] { background: #e6f6ec; border-color: transparent; color: #1f8a3b; }
.st-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 30px 10px; }
.st-empty > span { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: #eef4ff; color: var(--accent); }
.st-empty p { margin: 0; font-size: 13px; color: var(--text-tertiary); }
.st-team-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.st-team-stats div { padding: 10px 12px; border-radius: 12px; background: #f4f7fc; display: flex; flex-direction: column; }
.st-team-stats small { font-size: 12px; color: var(--text-tertiary); } .st-team-stats b { font-size: 20px; }
.st-team-link { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 14px; color: #fff; text-decoration: none; background: linear-gradient(135deg, #0a66d6, #3c4fe0); }
.st-team-link span { flex: 1; display: flex; flex-direction: column; }
.st-team-link small { opacity: 0.85; font-size: 12.5px; }

.st-savebar { position: fixed; left: var(--sb-w, 72px); right: 0; bottom: 0; z-index: 40; display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 12px 18px; background: rgba(255,255,255,0.94); border-top: 1px solid var(--st-line); backdrop-filter: blur(16px); }
.st-savebar span { margin-right: auto; font-size: 13px; font-weight: 600; color: #b45309; }
.st-savebar .ps-btn { height: 42px; border-radius: 12px; }

@media (max-width: 1000px) {
  .st-layout { grid-template-columns: minmax(0, 1fr); }
  .st-nav { position: static; flex-direction: row; overflow-x: auto; scrollbar-width: none; }
  .st-nav button { flex: 0 0 auto; }
  .st-nav-text small { display: none; }
}
@media (max-width: 899px) { .st-savebar { left: 0; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px)); } }
@media (max-width: 760px) {
  .ps-page.st { padding: 10px 10px 150px !important; }
  .st-card { padding: 16px 14px; }
  .st-grid { grid-template-columns: minmax(0, 1fr); }
  .st-progress { max-width: none; width: 100%; }
  .st-savebar span { display: none; }
  .st-savebar .ps-btn { flex: 1; justify-content: center; }
  .st .ps-input, .st-hex input { font-size: 16px; }
}
`;
