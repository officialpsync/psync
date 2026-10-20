"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  Plus, Trash2, MapPin, Building2, Users, ShieldCheck, ShieldOff,
  MoreHorizontal, ImagePlus, X, Loader2,
} from "lucide-react";
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
type Tab = "gym" | "branches" | "staff";

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
    const { error } = await supabase.from("branches").insert({
      org_id: org.id, name: branchForm.name.trim(),
      address: branchForm.address || null, phone: branchForm.phone || null,
    });
    if (!error) {
      const { data } = await supabase.from("branches").select("*").eq("org_id", org.id).order("created_at");
      setBranches((data as Branch[]) || []);
      setBranchForm({ name: "", address: "", phone: "" });
      setShowBranchForm(false);
      show("Branch added");
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

  return (
    <div className="ps-page ps-page--narrow">
      <header className="ps-header" style={{ flexWrap: "wrap" }}>
        <div className="ps-header-text">
          <h1 className="ps-title">Settings</h1>
          <p className="ps-subtitle">Gym profile, branches and staff.</p>
        </div>
      </header>

      <div style={{ marginBottom: 20, maxWidth: 320 }}>
        <Segmented<Tab>
          block
          label="Settings section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "gym",      label: "Gym profile" },
            { value: "branches", label: "Branches" },
            { value: "staff",    label: "Staff" },
          ]}
        />
      </div>

      {/* ── GYM PROFILE TAB ───────────────────────────────────────────────── */}
      {tab === "gym" && (
        <section className="ps-card">
          {!org ? (
            <div className="ps-card-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Skeleton w={80} h={12} />
                  <Skeleton w="100%" h={42} r={12} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="ps-card-body">

                {/* Logo uploader */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "16px 0 20px", borderBottom: "1px solid var(--border)", marginBottom: 4,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 16, flexShrink: 0, overflow: "hidden",
                    background: "var(--fill)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {uploadingLogo ? (
                      <Loader2 size={22} style={{ color: "var(--text-tertiary)" }} className="ps-spin" />
                    ) : (logoPreview || org.logo_url) ? (
                      <img src={logoPreview || org.logo_url!} alt="Gym logo"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <ImagePlus size={22} style={{ color: "var(--text-tertiary)" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>Gym logo</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 10 }}>
                      PNG, JPG or WebP · max 2 MB · shown on receipts and invoices
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm"
                        onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                        <ImagePlus size={14} />
                        {org.logo_url ? "Change logo" : "Upload logo"}
                      </button>
                      {org.logo_url && (
                        <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm"
                          onClick={removeLogo} disabled={uploadingLogo}>
                          <X size={14} /> Remove
                        </button>
                      )}
                    </div>
                    <input ref={logoInputRef} type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { show("File too large. Max 2 MB.", "error"); return; }
                        uploadLogo(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>

                {/* ── BRANDING ───────────────────────────────────────────────── */}
                <div style={{ padding: "20px 0", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Branding</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 20 }}>
                    Controls colours, shape, and typography across the whole dashboard.
                  </div>

                  {/* Live preview strip */}
                  <BrandPreview brand={brand} />

                  {/* Accent colour */}
                  <BrandSection label="Accent colour" desc="Buttons, links, active states, and badges.">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {ACCENT_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          title={p.label}
                          aria-label={p.label}
                          aria-pressed={brand.accent === p.value}
                          onClick={() => { patchBrand({ accent: p.value }); setAccentHex(p.value); }}
                          style={{
                            width: 32, height: 32, borderRadius: "var(--radius-md)",
                            background: p.value, padding: 0, flexShrink: 0, cursor: "pointer",
                            border: brand.accent === p.value ? "3px solid var(--text-primary)" : "2px solid transparent",
                            boxShadow: brand.accent === p.value ? `0 0 0 1px ${p.value}` : "none",
                            transition: "border 120ms, box-shadow 120ms",
                          }}
                        />
                      ))}
                      <label title="Custom colour" aria-label="Custom colour" style={{
                        width: 32, height: 32, borderRadius: "var(--radius-md)", cursor: "pointer",
                        flexShrink: 0, border: "2px dashed var(--border-mid)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", position: "relative",
                        background: ACCENT_PRESETS.some((p) => p.value === brand.accent) ? "var(--fill)" : brand.accent,
                      }}>
                        <input type="color" value={brand.accent}
                          onChange={(e) => { patchBrand({ accent: e.target.value }); setAccentHex(e.target.value); }}
                          style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
                        />
                        <span style={{
                          fontSize: 16, pointerEvents: "none",
                          color: ACCENT_PRESETS.some((p) => p.value === brand.accent) ? "var(--text-tertiary)" : "#fff",
                        }}>+</span>
                      </label>
                    </div>
                    <div style={{ position: "relative", width: 140 }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        width: 16, height: 16, borderRadius: 4, background: brand.accent,
                        border: "1px solid var(--border-mid)", flexShrink: 0,
                      }} />
                      <input
                        className="ps-input"
                        value={accentHex}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAccentHex(v);
                          if (isValidHex(v)) patchBrand({ accent: v });
                        }}
                        onBlur={() => {
                          if (!isValidHex(accentHex)) setAccentHex(brand.accent);
                        }}
                        placeholder="#0071e3"
                        style={{ paddingLeft: 32, fontFamily: "monospace", fontSize: 13, height: 36 }}
                        maxLength={7}
                        spellCheck={false}
                        autoCorrect="off"
                      />
                    </div>
                  </BrandSection>

                  {/* Shape */}
                  <BrandSection label="Corner style" desc="Applies to buttons, inputs, cards, and badges.">
                    <div style={{ display: "flex", gap: 8 }}>
                      {RADIUS_OPTIONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => patchBrand({ radius: r.value })}
                          style={{
                            padding: "7px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                            background: brand.radius === r.value ? "var(--accent)" : "var(--fill)",
                            color: brand.radius === r.value ? fgFor(brand.accent) : "var(--text-primary)",
                            border: "1.5px solid",
                            borderColor: brand.radius === r.value ? "var(--accent)" : "var(--border-mid)",
                            borderRadius: r.px,
                            transition: "background 140ms, color 140ms, border-color 140ms",
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </BrandSection>

                  {/* Typography */}
                  <BrandSection label="Font" desc="Applied to all text in the dashboard.">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {FONT_OPTIONS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => patchBrand({ font: f.value })}
                          style={{
                            padding: "7px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
                            fontFamily: f.stack,
                            background: brand.font === f.value ? "var(--accent)" : "var(--fill)",
                            color: brand.font === f.value ? fgFor(brand.accent) : "var(--text-primary)",
                            border: "1.5px solid",
                            borderColor: brand.font === f.value ? "var(--accent)" : "var(--border-mid)",
                            borderRadius: "var(--radius-md)",
                            transition: "background 140ms, color 140ms, border-color 140ms",
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </BrandSection>

                  {/* Save row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 20 }}>
                    <button
                      type="button"
                      className="ps-btn ps-btn--primary ps-btn--sm"
                      onClick={saveBrand}
                      disabled={savingBrand || !brandDirty}
                    >
                      {savingBrand ? <><Loader2 size={14} className="ps-spin" /> Saving…</> : "Save branding"}
                    </button>
                    <button
                      type="button"
                      className="ps-btn ps-btn--secondary ps-btn--sm"
                      onClick={resetBrand}
                      disabled={savingBrand}
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>

                {/* Gym info form */}
                <div className="ps-form-grid">
                  <label className="ps-field ps-span-2">
                    <span className="ps-label">Gym name</span>
                    <input className="ps-input" value={org.name}
                      onChange={(e) => update({ name: e.target.value })} autoComplete="organization" />
                  </label>
                  <label className="ps-field">
                    <span className="ps-label">Email</span>
                    <input className="ps-input" type="email" inputMode="email" autoComplete="email"
                      value={org.email || ""} onChange={(e) => update({ email: e.target.value })}
                      placeholder="gym@example.com" />
                  </label>
                  <label className="ps-field">
                    <span className="ps-label">Phone</span>
                    <input className="ps-input" type="tel" inputMode="tel" autoComplete="tel"
                      value={org.phone || ""} onChange={(e) => update({ phone: e.target.value })}
                      placeholder="+91 98765 43210" />
                  </label>
                  <label className="ps-field ps-span-2">
                    <span className="ps-label">Address</span>
                    <textarea className="ps-input" value={org.address || ""}
                      onChange={(e) => update({ address: e.target.value })}
                      placeholder="Shop 4, Sector 10, Dwarka, Delhi" />
                  </label>
                  <label className="ps-field">
                    <span className="ps-label">GST number</span>
                    <input className="ps-input" value={org.gst_number || ""}
                      onChange={(e) => update({ gst_number: e.target.value.toUpperCase() })}
                      placeholder="22AAAAA0000A1Z5"
                      autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
                  </label>
                </div>

              </div>

              <div className="ps-card-foot">
                {dirty && <span className="ps-hint" style={{ marginRight: "auto" }}>Unsaved changes</span>}
                <button type="button" className="ps-btn ps-btn--primary"
                  onClick={saveOrg} disabled={saving || !dirty || !org.name.trim()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── BRANCHES TAB ──────────────────────────────────────────────────── */}
      {tab === "branches" && (
        <section>
          <div className="ps-section-head" style={{ alignItems: "center" }}>
            <span className="ps-section-meta">
              {branches.length} branch{branches.length === 1 ? "" : "es"}
            </span>
            <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm"
              onClick={() => setShowBranchForm(true)}>
              <Plus size={14} strokeWidth={2.4} /> Add branch
            </button>
          </div>
          <div className="ps-list">
            {branches.length === 0 ? (
              <div className="ps-empty">
                <div className="ps-empty-icon"><Building2 size={22} /></div>
                <div className="ps-empty-title">No branches yet</div>
                <div className="ps-empty-text">Add each location so you can track members and revenue by branch.</div>
                <button type="button" className="ps-btn ps-btn--primary"
                  onClick={() => setShowBranchForm(true)}>
                  <Plus size={16} strokeWidth={2.4} /> Add branch
                </button>
              </div>
            ) : (
              branches.map((b) => (
                <div key={b.id} className="ps-row"
                  style={{ ...BRANCH_ROW, "--inset": "68px", "--inset-sm": "64px" } as React.CSSProperties}>
                  <div className="ps-person">
                    <span className="ps-tile" aria-hidden><MapPin size={18} /></span>
                    <div>
                      <div className="ps-cell-title">{b.name}</div>
                      <div className="ps-cell-sub">{[b.address, b.phone].filter(Boolean).join(", ") || "No address added"}</div>
                    </div>
                  </div>
                  <button type="button" className="ps-icon-btn ps-icon-btn--danger"
                    onClick={() => deleteBranch(b)} aria-label={`Delete ${b.name}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* ── STAFF TAB ─────────────────────────────────────────────────────── */}
      {tab === "staff" && (
        <section>
          <div className="ps-section-head" style={{ alignItems: "center" }}>
            <span className="ps-section-meta">
              {staff.filter((s) => s.is_active).length} active · {staff.filter((s) => !s.is_active).length} inactive
            </span>
            <button type="button" className="ps-btn ps-btn--tinted ps-btn--sm"
              onClick={() => setShowStaffForm(true)}>
              <Plus size={14} strokeWidth={2.4} /> Add staff
            </button>
          </div>
          <div className="ps-list">
            {staff.length === 0 ? (
              <div className="ps-empty">
                <div className="ps-empty-icon"><Users size={22} /></div>
                <div className="ps-empty-title">No staff added yet</div>
                <div className="ps-empty-text">Add trainers and receptionists to track who works at your gym.</div>
                <button type="button" className="ps-btn ps-btn--primary"
                  onClick={() => setShowStaffForm(true)}>
                  <Plus size={16} strokeWidth={2.4} /> Add staff
                </button>
              </div>
            ) : (
              <>
                <div className="ps-list-head" style={STAFF_ROW}>
                  <span>Name</span>
                  <span className="ps-hide-sm">Role</span>
                  <span className="ps-hide-sm">Financials</span>
                  <span />
                </div>
                {staff.map((s) => (
                  <div key={s.id} className="ps-row"
                    style={{ ...STAFF_ROW, "--inset": "68px", "--inset-sm": "64px", opacity: s.is_active ? 1 : 0.5 } as React.CSSProperties}>
                    <div className="ps-person">
                      <span className="ps-tile"
                        style={{ background: s.is_active ? undefined : "var(--fill-strong)" }} aria-hidden>
                        <Users size={16} />
                      </span>
                      <div>
                        <div className="ps-cell-title">{s.full_name}</div>
                        <div className="ps-cell-sub">
                          {[s.specialization, s.phone].filter(Boolean).join(" · ") || s.email || "No contact added"}
                        </div>
                      </div>
                    </div>
                    <div className="ps-hide-sm">
                      {s.role ? (
                        <span className={`ps-badge ${ROLE_TONE[s.role] ?? ""}`}>
                          {ROLE_OPTIONS.find((r) => r.value === s.role)?.label ?? s.role}
                        </span>
                      ) : <span className="ps-cell" style={{ color: "var(--text-tertiary)" }}>—</span>}
                    </div>
                    <div className="ps-hide-sm">
                      <button type="button"
                        title={s.can_view_financials ? "Remove financial access" : "Grant financial access"}
                        onClick={() => toggleFinancials(s)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          display: "flex", alignItems: "center", gap: 5,
                          color: s.can_view_financials ? "var(--green-fill)" : "var(--text-tertiary)",
                        }}>
                        {s.can_view_financials
                          ? <><ShieldCheck size={15} /> <span style={{ fontSize: 13 }}>Yes</span></>
                          : <><ShieldOff size={15} /> <span style={{ fontSize: 13 }}>No</span></>}
                      </button>
                    </div>
                    <button type="button" className="ps-icon-btn"
                      title={s.is_active ? "Deactivate" : "Reactivate"}
                      onClick={() => toggleStaffActive(s)}
                      aria-label={s.is_active ? `Deactivate ${s.full_name}` : `Reactivate ${s.full_name}`}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
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

      <Sheet open={showBranchForm} onClose={() => setShowBranchForm(false)}
        title="New branch" description="Add another location for your gym."
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setShowBranchForm(false)}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={addBranch}
              disabled={!branchForm.name.trim() || savingBranch}>
              {savingBranch ? "Adding…" : "Add branch"}
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
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>{desc}</div>
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
