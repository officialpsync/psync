// app/dashboard/components/brand.ts
// Single source of truth for the org theme. Used by Sidebar (every page) and Settings (live preview).

export type Brand = {
  accent: string;
  secondary: string;
  radius: "sharp" | "soft" | "round";
  font: "inter" | "poppins" | "dm-sans" | "manrope";
};

export const DEFAULT_BRAND: Brand = {
  accent: "#0071e3",
  secondary: "#1d1d1f",
  radius: "soft",
  font: "inter",
};

export const FONT_OPTIONS: { value: Brand["font"]; label: string; stack: string }[] = [
  { value: "inter",   label: "Inter",   stack: "var(--font-inter), 'Inter', system-ui, sans-serif" },
  { value: "poppins", label: "Poppins", stack: "var(--font-poppins), 'Poppins', system-ui, sans-serif" },
  { value: "dm-sans", label: "DM Sans", stack: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif" },
  { value: "manrope", label: "Manrope", stack: "var(--font-manrope), 'Manrope', system-ui, sans-serif" },
];

const RADIUS = {
  sharp: { sm: "4px", md: "6px", lg: "8px", xl: "12px" },
  soft:  { sm: "8px", md: "12px", lg: "16px", xl: "22px" },
  round: { sm: "12px", md: "18px", lg: "24px", xl: "32px" },
} as const;

export function isValidHex(v: string) {
  return /^#[0-9a-f]{6}$/i.test(v);
}

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex([r, g, b]: number[]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function luminance(hex: string) {
  const ch = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function fgFor(bg: string) {
  return luminance(bg) > 0.179 ? "#1d1d1f" : "#ffffff";
}

export function darken(hex: string, amount: number) {
  return toHex(hexToRgb(hex).map((v) => v - amount));
}

function mix(hex: string, target: string, t: number) {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
}

/** Nudge `color` toward white/black until it has at least `min` contrast on `bg`. */
function legibleOn(color: string, bg: string, min = 3) {
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  let out = color;
  for (let i = 0; i < 12 && contrast(out, bg) < min; i++) out = mix(out, target, 0.15);
  return out;
}

const CACHE_KEY = "psync:brand";

export function applyBrand(b: Brand) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const [ar, ag, ab] = hexToRgb(b.accent);
  const set = (k: string, v: string) => el.style.setProperty(k, v);

  // Accent family
  set("--accent", b.accent);
  set("--accent-strong", darken(b.accent, 14));
  set("--accent-dim", `rgba(${ar},${ag},${ab},0.09)`);
  set("--accent-border", `rgba(${ar},${ag},${ab},0.28)`);
  set("--accent-fg", fgFor(b.accent));
  set("--text-link", b.accent);
  set("--brand-secondary", b.secondary);

  // Radius scale
  const r = RADIUS[b.radius] ?? RADIUS.soft;
  set("--radius-sm", r.sm);
  set("--radius-md", r.md);
  set("--radius-lg", r.lg);
  set("--radius-xl", r.xl);
  // Buttons, chips, badges and tags are pills by default; "sharp" squares them off.
  set("--radius-pill", b.radius === "sharp" ? "6px" : "999px");

  // Font (body must use var(--font-sans) for this to show)
  const font = FONT_OPTIONS.find((f) => f.value === b.font) ?? FONT_OPTIONS[0];
  set("--font-sans", font.stack);

  // Sidebar tokens. The sidebar is always white; only the accent is themed, and it is
  // nudged toward black if needed so it stays legible on white for any accent colour.
  const bg = "#ffffff";
  const fg = fgFor(bg);
  const [fr, fgc, fb] = hexToRgb(fg);
  const on = (a: number) => `rgba(${fr},${fgc},${fb},${a})`;
  const navAccent = legibleOn(b.accent, bg, 3);
  const [nr, ng, nb] = hexToRgb(navAccent);

  set("--sidebar-bg", bg);
  set("--sidebar-fg", fg);
  set("--sidebar-muted", on(0.72));
  set("--sidebar-faint", on(0.55));
  set("--sidebar-border", on(0.09));
  set("--sidebar-hover-bg", on(0.05));
  set("--sidebar-active-bg", `rgba(${nr},${ng},${nb},0.12)`);
  set("--sidebar-active-fg", navAccent);
  set("--sidebar-chip-bg", navAccent);
  set("--sidebar-chip-fg", fgFor(navAccent));
}

/** Merge a stored brand over defaults, honouring the legacy brand_color column. */
export function resolveBrand(stored: Partial<Brand> | null | undefined, legacyColor?: string | null): Brand {
  // Pick known keys only, so a retired setting (like the old sidebar style) is dropped on next save.
  const merged: Brand = {
    accent: stored?.accent ?? DEFAULT_BRAND.accent,
    secondary: stored?.secondary ?? DEFAULT_BRAND.secondary,
    radius: stored?.radius ?? DEFAULT_BRAND.radius,
    font: stored?.font ?? DEFAULT_BRAND.font,
  };
  merged.accent = stored?.accent ?? legacyColor ?? DEFAULT_BRAND.accent;
  if (!isValidHex(merged.accent)) merged.accent = DEFAULT_BRAND.accent;
  if (!isValidHex(merged.secondary)) merged.secondary = DEFAULT_BRAND.secondary;
  return merged;
}

export function readCachedBrand(): Brand | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? resolveBrand(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cacheBrand(b: Brand) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(b)); } catch { /* storage can be blocked */ }
}

/** Fired by Settings after a successful save so the sidebar re-syncs. */
export const BRAND_SAVED_EVENT = "psync:brand-saved";

/** Fired when org name or logo changes so the sidebar updates without a reload. */
export const ORG_UPDATED_EVENT = "psync:org-updated";
export type OrgUpdate = { name?: string; logo_url?: string | null };

export function emitBrandSaved(b: Brand) {
  cacheBrand(b);
  window.dispatchEvent(new CustomEvent<Brand>(BRAND_SAVED_EVENT, { detail: b }));
}

export function emitOrgUpdated(detail: OrgUpdate) {
  window.dispatchEvent(new CustomEvent<OrgUpdate>(ORG_UPDATED_EVENT, { detail }));
}
