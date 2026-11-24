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

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function toHex([r, g, b]: number[]) {
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
export const THEME_KEY = "psync.theme";
export const THEME_EVENT = "psync:theme";

export function getStoredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.theme = theme;
  if (theme === "dark") {
    el.classList.add("dark");
  } else {
    el.classList.remove("dark");
  }
  el.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  const b = readCachedBrand() || DEFAULT_BRAND;
  applyBrand(b);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function toggleTheme(): "light" | "dark" {
  const current = getStoredTheme();
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

export function applyBrand(b: Brand) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const isDark = el.dataset.theme === "dark" || el.classList.contains("dark");
  const effectiveAccent = isDark ? legibleOn(b.accent, "#14171f", 3.5) : b.accent;
  const [ar, ag, ab] = hexToRgb(effectiveAccent);
  const set = (k: string, v: string) => el.style.setProperty(k, v);

  // Accent family
  set("--accent", effectiveAccent);
  set("--accent-strong", isDark ? mix(effectiveAccent, "#ffffff", 0.15) : darken(effectiveAccent, 14));
  set("--accent-dim", isDark ? `rgba(${ar},${ag},${ab},0.20)` : `rgba(${ar},${ag},${ab},0.09)`);
  set("--accent-border", isDark ? `rgba(${ar},${ag},${ab},0.38)` : `rgba(${ar},${ag},${ab},0.28)`);
  set("--accent-fg", fgFor(effectiveAccent));
  set("--text-link", isDark ? "#4da2ff" : effectiveAccent);
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

  // Sidebar tokens: responsive to dark mode
  const bg = isDark ? "#12141a" : "#ffffff";
  const fg = isDark ? "#f4f5f8" : fgFor(bg);
  const [fr, fgc, fb] = hexToRgb(fg);
  const on = (a: number) => `rgba(${fr},${fgc},${fb},${a})`;
  const navAccent = isDark ? legibleOn(b.accent, bg, 3.5) : legibleOn(b.accent, bg, 3);
  const [nr, ng, nb] = hexToRgb(navAccent);

  set("--sidebar-bg", bg);
  set("--sidebar-fg", fg);
  set("--sidebar-muted", isDark ? "rgba(244, 245, 248, 0.70)" : on(0.72));
  set("--sidebar-faint", isDark ? "rgba(244, 245, 248, 0.45)" : on(0.55));
  set("--sidebar-border", isDark ? "rgba(255, 255, 255, 0.08)" : on(0.09));
  set("--sidebar-hover-bg", isDark ? "rgba(255, 255, 255, 0.06)" : on(0.05));
  set("--sidebar-active-bg", isDark ? `rgba(${nr},${ng},${nb},0.20)` : `rgba(${nr},${ng},${nb},0.12)`);
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

/**
 * Extracts dominant vibrant brand colors from an image source (File, Blob, or URL).
 * Uses an offscreen canvas to analyze pixel hues, filtering out transparent,
 * pure black, pure white, and dull gray pixels to find a vibrant primary accent
 * and a harmonious secondary color.
 */
export async function extractColorsFromImage(source: File | Blob | string): Promise<{ accent: string; secondary: string }> {
  if (typeof window === "undefined") {
    return { accent: DEFAULT_BRAND.accent, secondary: DEFAULT_BRAND.secondary };
  }

  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          cleanup();
          resolve({ accent: DEFAULT_BRAND.accent, secondary: DEFAULT_BRAND.secondary });
          return;
        }

        const size = 64;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;

        // Group pixels into 24 hue bins (15 degrees each)
        type Bin = {
          count: number;
          weightSum: number;
          rSum: number;
          gSum: number;
          bSum: number;
          hue: number;
        };
        const bins: Bin[] = Array.from({ length: 24 }, (_, idx) => ({
          count: 0,
          weightSum: 0,
          rSum: 0,
          gSum: 0,
          bSum: 0,
          hue: idx * 15 + 7.5,
        }));

        let vibrantPixelCount = 0;
        let fallbackR = 0, fallbackG = 0, fallbackB = 0, fallbackCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 80) continue; // Skip transparent or semi-transparent background

          const [h, s, l] = rgbToHsl(r, g, b);

          fallbackR += r;
          fallbackG += g;
          fallbackB += b;
          fallbackCount++;

          // Skip low-saturation neutrals and extreme luminance (pure white/black backgrounds)
          if (s < 0.18 || l > 0.90 || l < 0.10) continue;

          // Weight score: prefer saturated and balanced lightness colors
          const sScore = Math.min(1, s / 0.65);
          const lDist = Math.abs(l - 0.5);
          const lScore = Math.max(0.2, 1 - lDist * 1.8);
          const weight = sScore * lScore;

          const binIndex = Math.min(23, Math.floor(h / 15));
          const bin = bins[binIndex];
          bin.count++;
          bin.weightSum += weight;
          bin.rSum += r * weight;
          bin.gSum += g * weight;
          bin.bSum += b * weight;
          vibrantPixelCount++;
        }

        cleanup();

        if (vibrantPixelCount === 0) {
          // If the image is monochrome (e.g., pure black and white logo)
          if (fallbackCount > 0) {
            const avgL = (fallbackR + fallbackG + fallbackB) / (3 * fallbackCount);
            const monoHex = avgL < 128 ? "#0f172a" : "#0071e3";
            resolve({ accent: monoHex, secondary: "#1e293b" });
          } else {
            resolve({ accent: DEFAULT_BRAND.accent, secondary: DEFAULT_BRAND.secondary });
          }
          return;
        }

        // Sort bins by total weight
        const sortedBins = [...bins].filter((b) => b.count > 0).sort((a, b) => b.weightSum - a.weightSum);
        const primaryBin = sortedBins[0];

        const pr = Math.round(primaryBin.rSum / primaryBin.weightSum);
        const pg = Math.round(primaryBin.gSum / primaryBin.weightSum);
        const pb = Math.round(primaryBin.bSum / primaryBin.weightSum);
        const [ph, ps, pl] = rgbToHsl(pr, pg, pb);

        // Adjust lightness slightly if too extreme for clean UI contrast
        const adjustedL = Math.max(0.36, Math.min(0.62, pl));
        const adjustedS = Math.max(0.48, Math.min(0.95, ps));
        const [ar, ag, ab] = hslToRgb(ph, adjustedS, adjustedL);
        const accentHex = toHex([ar, ag, ab]);

        // Secondary color: find a bin with distinct hue difference (>= 35 deg)
        const secondaryBin = sortedBins.find((b) => {
          const diff = Math.abs(b.hue - primaryBin.hue);
          const minDiff = Math.min(diff, 360 - diff);
          return minDiff >= 35 && b.count >= Math.max(3, primaryBin.count * 0.08);
        });

        let secondaryHex = "#1d1d1f";
        if (secondaryBin) {
          const sr = Math.round(secondaryBin.rSum / secondaryBin.weightSum);
          const sg = Math.round(secondaryBin.gSum / secondaryBin.weightSum);
          const sb = Math.round(secondaryBin.bSum / secondaryBin.weightSum);
          const [sh, ss, sl] = rgbToHsl(sr, sg, sb);
          const [sAr, sAg, sAb] = hslToRgb(sh, Math.max(0.4, Math.min(0.9, ss)), Math.max(0.35, Math.min(0.65, sl)));
          secondaryHex = toHex([sAr, sAg, sAb]);
        } else {
          // Harmonious complementary/analogous secondary
          const [sAr, sAg, sAb] = hslToRgb((ph + 32) % 360, adjustedS * 0.75, 0.22);
          secondaryHex = toHex([sAr, sAg, sAb]);
        }

        resolve({ accent: accentHex, secondary: secondaryHex });
      } catch {
        cleanup();
        resolve({ accent: DEFAULT_BRAND.accent, secondary: DEFAULT_BRAND.secondary });
      }
    };

    img.onerror = () => {
      cleanup();
      resolve({ accent: DEFAULT_BRAND.accent, secondary: DEFAULT_BRAND.secondary });
    };

    if (typeof source === "string") {
      img.crossOrigin = "anonymous";
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}

/**
 * Creates a complete Brand theme out of a logo image, preserving existing radius and font.
 */
export async function createBrandFromLogo(
  source: File | Blob | string,
  currentBrand?: Partial<Brand>
): Promise<Brand> {
  const { accent, secondary } = await extractColorsFromImage(source);
  return {
    accent,
    secondary,
    radius: currentBrand?.radius ?? "soft",
    font: currentBrand?.font ?? "inter",
  };
}
