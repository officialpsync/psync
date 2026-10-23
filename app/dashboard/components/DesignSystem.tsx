"use client";

/**
 * Psync design system — "db" theme.
 * Render <DesignStyles /> once at the top of any page, and put className="ps-page db" on the root.
 * See DESIGN-RULES.md for how to use every class.
 */
export function DesignStyles() {
  return <style>{DB_CSS}</style>;
}

export const DB_CSS = `
/* Shared tokens. Sheets portal to <body>, outside .db, so they need the same tokens:
   one selector list keeps a single source of truth for the brand palette. */
.db, .ps-sheet-root {
  --db-ease: cubic-bezier(0.23, 1, 0.32, 1);
  --db-border: rgba(60,60,67,0.10);
  --db-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04);
  --db-shadow-hover: 0 2px 4px rgba(0,0,0,0.05), 0 12px 32px rgba(0,0,0,0.08);
  --db-r-card: calc(var(--radius-lg) + 4px);   /* 20px on Soft */
  --db-r-ctl:  var(--radius-md);               /* 12px on Soft: buttons, inputs, rows */
  --db-r-sm:   calc(var(--radius-md) - 2px);   /* 10px on Soft: chips, icon buttons */

  /* Brand palette — sampled from the Psync logo. Exactly two hues: */
  --accent: #0A66D6;              /* logo's deep blue */
  --brand-2: #09D3F5;             /* logo's light cyan */
  --accent-strong: #084FA6;       /* deep blue, darkened — gradients, hover depth */
  --accent-fg: #ffffff;
  --accent-dim: rgba(10,102,214,0.10);
  --brand-2-dim: rgba(9,211,245,0.14);
  --brand-grad: linear-gradient(135deg, var(--brand-2) 0%, var(--accent) 100%);

  /* Every tone that used to carry its own decorative hue now reuses the two brand
     colors at different mixes/tints, so "good", "money" and "growth" read as one
     palette, not four. Amber and red stay outside this — they are functional
     (warnings, errors, expiry), never decorative, so they keep their own hue. */
  --green: var(--accent);
  --green-dim: var(--accent-dim);
  --green-fill: var(--brand-2);
  --purple: var(--accent-strong);
  --purple-dim: var(--accent-dim);
  --purple-fill: var(--accent);
  --teal: var(--brand-2);
  --teal-dim: var(--brand-2-dim);
  --teal-fill: var(--brand-2);
}
.db { max-width: 1320px; }

/* Entrance — staggered, transform/opacity only */
@keyframes db-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.db > :is(header, section, div, a):not(.ps-sheet-root):not([role="status"]) { animation: db-in 360ms var(--db-ease) both; }
.db > *:nth-child(2) { animation-delay: 30ms; }
.db > *:nth-child(3) { animation-delay: 60ms; }
.db > *:nth-child(4) { animation-delay: 90ms; }
.db > *:nth-child(5) { animation-delay: 120ms; }
.db > *:nth-child(6) { animation-delay: 150ms; }
.db > *:nth-child(n+7) { animation-delay: 180ms; }

/* Header */
.db-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.db-kicker { font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin-bottom: 6px; }
.db-title { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; color: var(--text-primary); margin: 0; }
.db-subtitle { font-size: 15px; color: var(--text-secondary); margin: 6px 0 0; }
.db-subtitle strong { color: var(--text-primary); font-weight: 600; }
.db-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.db-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: var(--accent-fg, #fff); font-size: 11px; font-weight: 700; display: inline-grid; place-items: center; }

/* Banner */
.db-banner { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 20px; border-radius: 16px; text-decoration: none; color: var(--text-primary);
  background: linear-gradient(90deg, rgba(255,159,10,0.14), rgba(255,159,10,0.05)); border: 1px solid rgba(255,159,10,0.28); }
.db-banner-icon { width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #ffb340, #ff8a00); box-shadow: 0 4px 12px rgba(255,138,0,0.3); }
.db-banner-title { font-size: 14.5px; font-weight: 600; }
.db-banner-text { font-size: 13px; color: var(--text-secondary); margin-top: 1px; }
.db-banner-cta { display: inline-flex; align-items: center; gap: 2px; font-size: 13.5px; font-weight: 600; color: var(--amber); flex-shrink: 0; }

/* Cards */
.db-card { background: #fff; border: 1px solid var(--db-border); border-radius: var(--db-r-card, 20px); box-shadow: var(--db-shadow); min-width: 0; }
.db-pad { padding: 20px; }
.db-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.db-card-title { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; margin: 0; color: var(--text-primary); }
.db-card-sub { font-size: 12.5px; color: var(--text-tertiary); margin-top: 2px; }
.db-link { display: inline-flex; align-items: center; gap: 1px; font-size: 13px; font-weight: 550; color: var(--accent); text-decoration: none; flex-shrink: 0; padding: 4px 6px; margin: -4px -6px; border-radius: 8px; }
.db-section-title { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; margin: 4px 0 12px; color: var(--text-primary); }

/* Tones */
.db-tone-blue   { --t: var(--accent);        --t-dim: var(--accent-dim);   --t-grad: linear-gradient(135deg, var(--accent-strong), var(--accent)); }
.db-tone-green  { --t: var(--brand-2);       --t-dim: var(--brand-2-dim);   --t-grad: var(--brand-grad); }
.db-tone-purple { --t: var(--accent-strong); --t-dim: var(--accent-dim);    --t-grad: linear-gradient(135deg, var(--accent), var(--accent-strong)); }
.db-tone-amber  { --t: #b45309; --t-dim: rgba(255,159,10,0.14); --t-grad: linear-gradient(135deg,#ffb340,#ff8a00); } /* functional only — expiry/warnings */
.db-chip { width: 32px; height: 32px; border-radius: var(--db-r-sm, 10px); display: grid; place-items: center; color: #fff; background: var(--t-grad); flex-shrink: 0;
  box-shadow: 0 3px 10px -2px color-mix(in srgb, var(--t) 45%, transparent); }
.db-chip--lg { width: 40px; height: 40px; border-radius: var(--db-r-ctl, 12px); }

/* KPIs */
.db-kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; margin-bottom: 16px; }
.db-kpi { position: relative; overflow: hidden; padding: 18px 18px 16px; text-decoration: none; color: inherit; display: flex; flex-direction: column; min-height: 148px;
  transition: transform 200ms var(--db-ease), box-shadow 200ms ease; }
.db-kpi::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: var(--t-grad); }
.db-kpi-head { display: flex; align-items: center; gap: 10px; }
.db-kpi-label { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
.db-kpi-value { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; margin-top: 14px; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.1; position: relative; z-index: 1; }
.db-kpi-foot { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 10px; font-size: 12.5px; color: var(--text-tertiary); position: relative; z-index: 1; }
.db-spark { position: absolute; right: 0; bottom: 0; width: 55%; height: 56px; opacity: 0.9; pointer-events: none; }
.db-trend { display: inline-flex; align-items: center; gap: 1px; padding: 2px 7px 2px 5px; border-radius: var(--radius-pill, 999px); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
.db-trend--up { color: var(--green); background: var(--green-dim); }
.db-trend--down { color: var(--red); background: var(--red-dim); }
.db-trend--flat { color: var(--text-secondary); background: var(--fill); padding: 2px 8px; }

/* Grid */
.db-grid { display: grid; grid-template-columns: repeat(12, minmax(0,1fr)); gap: 16px; margin-bottom: 16px; }
.db-span-4 { grid-column: span 4; } .db-span-8 { grid-column: span 8; } .db-span-12 { grid-column: span 12; }
.db-chart { height: 240px; margin: 0 -4px; }
.db-chart--sm { height: 200px; }
.db-tip { background: rgba(29,29,31,0.92); backdrop-filter: blur(8px); color: #fff; padding: 8px 12px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
.db-tip-label { font-size: 11.5px; opacity: 0.65; }
.db-tip-value { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; }

/* Today hero */
.db-hero { position: relative; overflow: hidden; border-radius: var(--db-r-card, 20px); padding: 20px; color: #fff; display: flex; flex-direction: column; gap: 16px; min-width: 0;
  background: linear-gradient(145deg, var(--brand-2) 0%, var(--accent) 60%, var(--accent-strong) 100%); box-shadow: 0 10px 30px -10px rgba(10,102,214,0.5); }
.db-hero-glow { position: absolute; width: 240px; height: 240px; right: -80px; top: -90px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.28), transparent 70%); pointer-events: none; }
.db-hero-top { display: flex; justify-content: space-between; align-items: center; position: relative; }
.db-hero-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; opacity: 0.92; }
.db-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 650; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.18); }
.db-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: db-pulse 1.8s ease-in-out infinite; }
.db-live-dot--green { background: var(--green-fill); }
@keyframes db-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.db-hero-body { display: flex; align-items: center; gap: 18px; position: relative; flex: 1; }
.db-hero-value { font-size: 44px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.db-hero-sub { font-size: 13px; opacity: 0.85; margin-top: 6px; line-height: 1.35; }
.db-hero-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; border-radius: 12px; background: #fff; color: var(--accent-strong);
  font-size: 14px; font-weight: 650; text-decoration: none; transition: transform 140ms var(--db-ease); }
.db-ring { position: relative; width: 112px; height: 112px; flex-shrink: 0; }
.db-ring-arc { transition: stroke-dashoffset 900ms var(--db-ease); }
.db-ring-center { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; align-content: center; }
.db-ring-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.db-ring-caption { font-size: 11px; opacity: 0.8; margin-top: 3px; }

/* Rows */
.db-rows { display: flex; flex-direction: column; margin: 0 -8px; }
.db-row { display: flex; align-items: center; gap: 12px; padding: 9px 8px; border-radius: var(--db-r-ctl, 12px); text-decoration: none; color: inherit; min-height: 52px; }
.db-row-text { flex: 1; min-width: 0; }
.db-row-title { font-size: 14px; font-weight: 550; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-row-sub { font-size: 12.5px; color: var(--text-tertiary); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--radius-pill, 999px); font-size: 12px; font-weight: 600; flex-shrink: 0; white-space: nowrap; }
.db-pill--amber { color: var(--amber); background: var(--amber-dim); }
.db-pill--red { color: var(--red); background: var(--red-dim); }
.db-pill--green { color: var(--green); background: var(--green-dim); }
.db-pay-icon { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: var(--green); background: var(--green-dim); flex-shrink: 0; }
.db-amount { font-size: 14px; font-weight: 650; color: var(--green); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.db-class-bar { width: 4px; align-self: stretch; border-radius: 4px; flex-shrink: 0; margin: 2px 0; }
.db-time { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); font-variant-numeric: tabular-nums; flex-shrink: 0; padding: 3px 8px; border-radius: 8px; background: var(--fill); }

/* Empty */
.db-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 22px 8px 14px; }
.db-empty-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--fill); color: var(--text-tertiary); margin-bottom: 10px; }
.db-empty-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.db-empty-text { font-size: 12.5px; color: var(--text-tertiary); margin-top: 3px; max-width: 240px; }

/* Quick actions */
.db-actions-wrap { display: flex; flex-direction: column; min-width: 0; }
.db-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; }
.db-action { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 18px; background: #fff; border: 1px solid var(--db-border); box-shadow: var(--db-shadow);
  text-decoration: none; color: inherit; min-width: 0; transition: transform 200ms var(--db-ease), box-shadow 200ms ease; }
.db-action-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.db-action-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

/* Setup */
.db-setup { margin-bottom: 16px; }
.db-progress { height: 6px; border-radius: 3px; background: var(--fill); overflow: hidden; margin-bottom: 8px; }
.db-progress span { display: block; height: 100%; background: linear-gradient(90deg, var(--brand-2), var(--accent)); transform-origin: left; transition: transform 600ms var(--db-ease); }
.db-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin: 0 -8px; }
.db-check-row { display: flex; align-items: center; gap: 12px; padding: 11px 8px; border-radius: 12px; text-decoration: none; color: var(--text-primary); font-size: 14px; font-weight: 550; }
.db-check-row--done { color: var(--text-tertiary); font-weight: 400; }
.db-check-row--done .db-check-label { text-decoration: line-through; text-decoration-color: rgba(60,60,67,0.3); }
.db-check-label { flex: 1; min-width: 0; }
.db-check { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; box-shadow: inset 0 0 0 1.5px rgba(60,60,67,0.3); color: #fff; }
.db-check--done { background: var(--green-fill); box-shadow: none; }
.db-check-chev { color: var(--text-tertiary); flex-shrink: 0; }

/* Customize sheet */
.db-toggles { display: flex; flex-direction: column; }
.db-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--separator); cursor: pointer; }
.db-toggle:last-child { border-bottom: none; }
.db-toggle-title { font-size: 14.5px; font-weight: 550; color: var(--text-primary); }
.db-toggle-sub { font-size: 12.5px; color: var(--text-tertiary); margin-top: 1px; }
.db-switch { appearance: none; -webkit-appearance: none; width: 44px; height: 26px; border-radius: 13px; background: rgba(120,120,128,0.24); position: relative; cursor: pointer; flex-shrink: 0; margin: 0;
  transition: background-color 200ms ease; }
.db-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  transition: transform 220ms var(--db-ease); }
.db-switch:checked { background: var(--green-fill); }
.db-switch:checked::after { transform: translateX(18px); }
.db-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Press feedback (all devices) */
.db-kpi:active, .db-action:active, .db-hero-btn:active, .db-banner:active { transform: scale(0.98); }

/* Hover — only for real pointers */
@media (hover: hover) and (pointer: fine) {
  .db-kpi:hover, .db-action:hover { transform: translateY(-2px); box-shadow: var(--db-shadow-hover); }
  .db-row--link:hover, .db-check-row:not(.db-check-row--done):hover { background: var(--fill); }
  .db-link:hover { background: var(--accent-dim); }
  .db-banner:hover { border-color: rgba(255,159,10,0.45); }
}

/* Responsive */
@media (max-width: 1180px) {
  .db-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .db-grid .db-span-8 { grid-column: span 12; }
  .db-grid .db-span-4 { grid-column: span 6; }
  .db-hero.db-span-4 { grid-column: span 12; }
  .db-hero.db-span-4 .db-hero-body { justify-content: flex-start; }
  .db-actions-wrap.db-span-4 { grid-column: span 12; }
  .db-actions-wrap .db-actions { grid-template-columns: repeat(4, minmax(0,1fr)); }
}
@media (max-width: 760px) {
  .db-header { align-items: flex-start; margin-bottom: 18px; }
  .db-title { font-size: 28px; }
  .db-header-actions { width: 100%; }
  .db-header-actions > * { flex: 1; justify-content: center; }
  .db-kpis { gap: 10px; }
  .db-kpi { min-height: 132px; padding: 14px; }
  .db-kpi-value { font-size: 24px; margin-top: 12px; }
  .db-kpi-label { font-size: 12px; }
  .db-chip { width: 28px; height: 28px; border-radius: 9px; }
  .db-chip--lg { width: 36px; height: 36px; }
  .db-spark { height: 40px; }
  .db-grid { gap: 12px; margin-bottom: 12px; }
  .db-grid .db-span-4, .db-grid .db-span-8 { grid-column: span 12; }
  .db-actions-wrap .db-actions { grid-template-columns: 1fr 1fr; }
  .db-pad { padding: 16px; }
  .db-chart { height: 200px; }
  .db-checks { grid-template-columns: 1fr; }
  .db-banner-text, .db-banner-cta { display: none; }
}
@media (max-width: 380px) {
  .db-kpi-foot span:last-child { display: none; }
  .db-hero-value { font-size: 36px; }
  .db-ring { width: 96px; height: 96px; }
}

/* Reduced motion: keep fades, drop movement */
@media (prefers-reduced-motion: reduce) {
  .db > * { animation: none !important; }
  .db-ring-arc, .db-progress span { transition: none; }
  .db-live-dot { animation: none; }
  .db-kpi, .db-action { transition: box-shadow 200ms ease; }
  .db-kpi:hover, .db-action:hover, .db-kpi:active, .db-action:active { transform: none; }
}

/* ═════════ Shared page pieces (members etc.) ═════════ */
.db-back { display: inline-flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 550; color: var(--accent); text-decoration: none; margin-bottom: 14px; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
.db-filter { cursor: pointer; text-align: left; font-family: inherit; border: 1px solid var(--db-border); width: 100%; }
.db-filter[aria-pressed="true"] { border-color: var(--t); box-shadow: 0 0 0 3px var(--t-dim), var(--db-shadow); }
.db-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px; margin-bottom: 16px; }
.db-search { position: relative; flex: 1; min-width: 220px; }
.db-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); pointer-events: none; }
.db-search input { width: 100%; height: 40px; padding: 0 12px 0 36px; border-radius: var(--db-r-ctl, 12px); border: 1px solid transparent; background: var(--fill); font: inherit; font-size: 14.5px; color: var(--text-primary); outline: none; transition: border-color 150ms ease, background-color 150ms ease; }
.db-search input:focus { background: #fff; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.db-table-head { display: grid; gap: 12px; padding: 10px 20px; font-size: 11.5px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-tertiary); border-bottom: 1px solid var(--db-border); }
.db-trow { display: grid; gap: 12px; align-items: center; padding: 12px 20px; min-height: 64px; text-decoration: none; color: inherit; border-bottom: 1px solid var(--db-border); transition: background-color 150ms ease; }
.db-trow:last-child { border-bottom: none; }
.db-icon-btn { width: 32px; height: 32px; border-radius: var(--db-r-sm, 10px); display: grid; place-items: center; border: none; background: transparent; color: var(--text-tertiary); cursor: pointer; transition: background-color 150ms ease, color 150ms ease; }
.db-profile { position: relative; overflow: hidden; border-radius: calc(var(--db-r-card, 20px) + 4px); padding: 24px; margin-bottom: 16px; color: #fff;
  background: linear-gradient(135deg, var(--accent-strong) 0%, var(--accent) 55%, var(--brand-2) 100%); box-shadow: 0 14px 34px -14px color-mix(in srgb, var(--accent) 60%, transparent); }
.db-profile .db-hero-glow { right: -60px; top: -120px; width: 320px; height: 320px; }
.db-profile-top { position: relative; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.db-profile-name { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; margin: 0; }
.db-profile-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; font-size: 13.5px; }
.db-profile-meta a, .db-profile-meta span { color: rgba(255,255,255,0.9); text-decoration: none; display: inline-flex; align-items: center; gap: 5px; }
.db-profile-actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.db-glass-btn { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 14px; border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
  color: #fff; background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.22); backdrop-filter: blur(8px); transition: background-color 150ms ease, transform 140ms var(--db-ease); }
.db-glass-btn--solid { background: #fff; color: var(--accent-strong); border-color: #fff; }
.db-glass-btn:active { transform: scale(0.97); }
.db-glass-btn:disabled { opacity: 0.6; cursor: default; }
.db-profile-stats { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-top: 20px; }
.db-pstat { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.14); min-width: 0; }
.db-pstat-label { font-size: 11.5px; font-weight: 600; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.04em; }
.db-pstat-value { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-avatar-ring { border-radius: 50%; padding: 3px; background: rgba(255,255,255,0.35); flex-shrink: 0; }
.db-membership { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.db-membership-bar { flex: 1; min-width: 180px; }

/* ═════════ Upgrades for existing ps-* markup inside .db pages ═════════ */
.db .ps-card { background: #fff; border: 1px solid var(--db-border); border-radius: var(--db-r-card, 20px); box-shadow: var(--db-shadow); }
.db .ps-list { background: #fff; border: 1px solid var(--db-border); border-radius: var(--db-r-card, 20px); box-shadow: var(--db-shadow); overflow: hidden; }
.db .ps-list-head { font-size: 11.5px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-tertiary); }
.db .ps-card-title { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; display: flex; align-items: center; gap: 10px; }
.db .ps-card-title::before { content: ""; width: 4px; height: 16px; border-radius: 2px; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 70%, #fff), var(--accent)); flex-shrink: 0; }
.db .ps-btn { border-radius: var(--db-r-ctl, 12px); transition: transform 140ms var(--db-ease), background-color 150ms ease, box-shadow 150ms ease; }
.db .ps-btn:active:not(:disabled) { transform: scale(0.97); }
.db .ps-btn--primary { background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, #fff), var(--accent)); box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--accent) 55%, transparent); }
.db .ps-input, .db select.ps-input, .db textarea.ps-input { border-radius: var(--db-r-ctl, 12px); transition: border-color 150ms ease, box-shadow 150ms ease; }
.db .ps-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.db .ps-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.db .ps-badge { border-radius: var(--radius-pill, 999px); font-weight: 600; }
.db .ps-actionbar { border-radius: 18px; }
.db .ps-empty-icon { border-radius: 14px; background: var(--accent-dim); color: var(--accent); }

@media (hover: hover) and (pointer: fine) {
  .db-trow:hover { background: color-mix(in srgb, var(--accent) 3.5%, transparent); }
  .db-icon-btn:hover { background: var(--accent-dim); color: var(--accent); }
  .db-glass-btn:hover { background: rgba(255,255,255,0.26); }
  .db-glass-btn--solid:hover { background: #f2f7ff; }
  .db .ps-row--link:hover { background: color-mix(in srgb, var(--accent) 3.5%, transparent); }
}
@media (max-width: 760px) {
  .db-profile { padding: 18px; border-radius: var(--db-r-card, 20px); }
  .db-profile-name { font-size: 24px; }
  .db-profile-actions { margin-left: 0; width: 100%; }
  .db-profile-actions > * { flex: 1; justify-content: center; }
  .db-profile-stats { grid-template-columns: 1fr 1fr; }
  .db-table-head { display: none; }
  .db-trow { padding: 12px 16px; }
  .db-toolbar { padding: 10px; }
  .db-search { min-width: 100%; }
}
.db-pill--muted { color: var(--text-secondary); background: var(--fill); }
.db-pill--blue { color: var(--accent); background: var(--accent-dim); }
.db-pill--purple { color: var(--purple); background: var(--purple-dim); }
.db-show-sm { display: none; }
.db-copy-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 760px) {
  .db-hide-sm { display: none !important; }
  .db-show-sm { display: block; }
  .db-members-row { grid-template-columns: minmax(0,1fr) auto 32px 16px !important; }
}

/* ═════════ Plan / product cards (membership plans) ═════════ */
.db-plans { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.db-plan { position: relative; overflow: hidden; padding: 20px; display: flex; flex-direction: column; gap: 4px; transition: transform 200ms var(--db-ease), box-shadow 200ms ease, opacity 200ms ease; }
.db-plan::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: var(--t-grad); }
.db-plan[data-inactive="true"] { opacity: 0.62; }
.db-plan[data-inactive="true"]::before { background: var(--fill); }
.db-plan-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.db-plan-name { font-size: 16px; font-weight: 650; letter-spacing: -0.015em; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-plan-price { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.1; }
.db-plan-per { font-size: 14px; font-weight: 500; color: var(--text-tertiary); margin-left: 4px; letter-spacing: 0; }
.db-plan-desc { font-size: 13.5px; color: var(--text-secondary); margin: 10px 0 0; line-height: 1.45; }
.db-plan-members { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin-top: 14px; padding: 5px 10px; border-radius: var(--radius-pill, 999px); font-size: 12.5px; color: var(--t); background: var(--t-dim); }
.db-plan-members strong { font-weight: 700; }
.db-plan-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--db-border); margin-top: 16px; }
.db-plan-toggle { display: inline-flex; align-items: center; gap: 10px; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; }
.db-plan-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 220px; padding: 20px; border-radius: 20px; cursor: pointer; font: inherit;
  background: transparent; border: 1.5px dashed rgba(60,60,67,0.2); color: var(--text-secondary); transition: border-color 150ms ease, background-color 150ms ease, transform 140ms var(--db-ease); }
.db-plan-add .db-empty-icon { background: var(--accent-dim); color: var(--accent); margin-bottom: 6px; }
.db-plan-add:active { transform: scale(0.98); }
.db-plan-top { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 22px; }
.db-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.db-preset { height: 34px; padding: 0 14px; border-radius: var(--db-r-sm, 10px); font: inherit; font-size: 13.5px; font-weight: 550; cursor: pointer; color: var(--text-primary);
  background: var(--fill); border: 1px solid transparent; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.db-preset[aria-pressed="true"] { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
@media (hover: hover) and (pointer: fine) {
  .db-plan:hover { transform: translateY(-2px); box-shadow: var(--db-shadow-hover); }
  .db-plan-add:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 3%, transparent); color: var(--accent); }
  .db-preset:hover:not([aria-pressed="true"]) { background: rgba(118,118,128,0.14); }
}
@media (max-width: 760px) {
  .db-plans { grid-template-columns: 1fr; gap: 12px; }
  .db-plan-add { min-height: 120px; }
  .db-plan-price { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .db-plan:hover, .db-plan-add:active { transform: none; }
}

/* ═════════ Stat bar — compact summary above a grid of cards ═════════ */
.db-statbar { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); margin-bottom: 28px; padding: 6px; }
.db-stat { display: flex; align-items: center; gap: 12px; padding: 12px 14px; min-width: 0; position: relative; }
.db-stat + .db-stat::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 1px; background: var(--db-border); }
.db-stat .db-chip { width: 34px; height: 34px; border-radius: var(--db-r-sm, 10px); background: var(--t-dim); color: var(--t); box-shadow: none; }
.db-stat-label { font-size: 12px; font-weight: 550; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-stat-value { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.db-stat-note { font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-left: 6px; letter-spacing: 0; }
.db-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
@media (max-width: 1000px) {
  .db-statbar { grid-template-columns: 1fr 1fr; }
  .db-stat:nth-child(3)::before { display: none; }
  .db-stat:nth-child(n+3) { border-top: 1px solid var(--db-border); }
}
@media (max-width: 760px) {
  .db-statbar { margin-bottom: 20px; padding: 4px; }
  .db-stat { padding: 10px; gap: 10px; }
  .db-stat .db-chip { width: 30px; height: 30px; }
  .db-stat-value { font-size: 16px; }
  .db-stat-note { display: none; }
}

/* ═════════ Week-view calendar (classes) ═════════ */
.db-week-nav { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.db-week-arrow { width: 34px; height: 34px; border-radius: var(--db-r-sm, 10px); background: #fff; border: 1px solid var(--db-border); box-shadow: var(--db-shadow); }
.db-week-label { font-size: 14.5px; font-weight: 650; color: var(--text-primary); min-width: 150px; text-align: center; }
.db-calendar { overflow: hidden; padding: 0; }
.db-cal-head { display: grid; border-bottom: 1px solid var(--db-border); }
.db-cal-daycol { padding: 12px 8px; text-align: center; border-left: 1px solid var(--db-border); }
.db-cal-daycol--today { background: var(--accent-dim); }
.db-cal-dayname { font-size: 11px; font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-tertiary); }
.db-cal-daycol--today .db-cal-dayname { color: var(--accent); }
.db-cal-daynum { font-size: 17px; font-weight: 500; color: var(--text-primary); margin-top: 3px; }
.db-cal-today-badge { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg, #fff); font-weight: 700; font-size: 15px; }
.db-cal-daycount { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
.db-cal-timelabel { display: flex; align-items: flex-start; justify-content: flex-end; padding-right: 8px; padding-top: 4px; font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; border-top: 1px solid var(--db-border); }
.db-cal-col { position: relative; border-left: 1px solid var(--db-border); background: transparent; }
.db-cal-col--today { background: var(--accent-dim); opacity: 0.4; }
.db-cal-col--today::before { content: none; }
.db-cal-hourline { position: absolute; left: 0; right: 0; height: 1px; background: var(--db-border); }
.db-class-block { position: absolute; text-align: left; cursor: pointer; overflow: hidden; border-radius: 9px; transition: transform 140ms var(--db-ease), box-shadow 140ms ease, opacity 140ms ease; }
.db-class-block:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
  .db-class-block:hover { transform: translateY(-1px) scale(1.01); box-shadow: 0 4px 12px rgba(0,0,0,0.12); z-index: 2; }
}
@media (max-width: 760px) {
  .db-week-label { min-width: 110px; font-size: 13.5px; }
  .db-cal-dayname { font-size: 10px; }
  .db-cal-daynum { font-size: 15px; }
  .db-cal-daycount { display: none; }
}

/* ═════════ Macro cards (diet plan targets) ═════════ */
.db-macro { padding: 16px 18px; position: relative; overflow: hidden; }
.db-macro::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: var(--t-grad); }
.db-macro-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.db-macro-label { font-size: 11px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
.db-macro-value { font-size: 24px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.db-macro-unit { font-size: 13px; font-weight: 500; color: var(--text-tertiary); margin-left: 3px; }
.db-macro-target { font-size: 11.5px; color: var(--text-tertiary); margin-top: 4px; }

/* ═════════ Meal cards (diet plan builder/detail) ═════════ */
.db-meal { overflow: hidden; }
.db-meal-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 16px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; }
.db-meal-slot { font-size: 10px; font-weight: 700; color: var(--text-tertiary); letter-spacing: 0.08em; text-transform: uppercase; width: 104px; flex-shrink: 0; }
.db-meal-name { font-size: 13.5px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }
.db-meal-tag { margin-left: 8px; padding: 2px 7px; font-size: 10px; }
.db-meal-macros { display: flex; gap: 12px; flex-shrink: 0; align-items: center; }
.db-meal-kcal { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 650; color: var(--amber); white-space: nowrap; }
.db-meal-macro { font-size: 11.5px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.db-meal-chev { color: var(--text-tertiary); flex-shrink: 0; }
.db-meal-body { border-top: 1px solid var(--db-border); padding: 14px 16px; background: var(--fill); }
.db-meal-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
.db-meal-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--text-tertiary); opacity: 0.5; flex-shrink: 0; }
.db-meal-swap-label { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 11px; font-weight: 650; color: var(--text-tertiary); letter-spacing: 0.05em; text-transform: uppercase; }
@media (max-width: 760px) {
  .db-meal-slot { width: 76px; font-size: 9px; }
  .db-meal-macros { gap: 8px; }
}

/* ═════════ Selected-member summary (inside a form) ═════════ */
.db-picked-member { display: flex; align-items: flex-start; gap: 14px; padding: 4px; }

/* ═════════ Mode / type selector (radio cards) ═════════ */
.db-mode-grid { display: flex; flex-direction: column; gap: 10px; }
.db-mode-option { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px; text-align: left; cursor: pointer; font: inherit;
  background: var(--fill); border: 1.5px solid transparent; transition: background-color 150ms ease, border-color 150ms ease, transform 140ms var(--db-ease); }
.db-mode-option[data-active="true"] { background: var(--t-dim); border-color: var(--t); }
.db-mode-option[data-active="true"] .db-chip { box-shadow: 0 3px 10px -2px color-mix(in srgb, var(--t) 45%, transparent); }
.db-mode-option:not([data-active="true"]) .db-chip { background: rgba(120,120,128,0.16); box-shadow: none; color: var(--text-secondary); }
.db-mode-title { font-size: 14.5px; font-weight: 650; color: var(--text-primary); }
.db-mode-desc { font-size: 12.5px; color: var(--text-tertiary); margin-top: 2px; line-height: 1.4; }
.db-mode-check { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; color: #fff;
  box-shadow: inset 0 0 0 1.5px rgba(60,60,67,0.25); }
.db-mode-option[data-active="true"] .db-mode-check { background: var(--t); box-shadow: none; }
.db-mode-option:active { transform: scale(0.99); }

/* ═════════ Mobile-safe sticky action bar ═════════ */
.db-actionbar-spacer { height: 84px; } /* reserve room so content isn't hidden behind a fixed/sticky bar on mobile */
@media (hover: hover) and (pointer: fine) {
  .db-mode-option:not([data-active="true"]):hover { background: rgba(120,120,128,0.2); }
}
@media (max-width: 760px) {
  .db-mode-option { padding: 12px; gap: 12px; }
  .db-mode-desc { display: none; }
}

/* ═════════ db-span-6 (half-width in the 12-col grid) ═════════ */
.db-span-6 { grid-column: span 6; }
@media (max-width: 1000px) { .db-grid .db-span-6 { grid-column: span 12; } }

/* ═════════ Plan meta line (diet plan header) ═════════ */
.db-plan-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-size: 13.5px; color: var(--text-secondary); }
.db-plan-meta-num { color: var(--text-primary); font-weight: 650; font-variant-numeric: tabular-nums; }
.db-plan-meta-dim { color: var(--text-tertiary); }

/* ═════════ Day tabs (diet plan day switcher) ═════════ */
.db-day-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 16px; margin: 0 -2px 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.db-day-tabs::-webkit-scrollbar { display: none; }
.db-day-tab { position: relative; flex-shrink: 0; min-width: 56px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 14px; border-radius: 14px;
  background: #fff; border: 1px solid var(--db-border); box-shadow: var(--db-shadow); cursor: pointer; font: inherit; transition: background-color 150ms ease, border-color 150ms ease, transform 140ms var(--db-ease); }
.db-day-tab[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--accent) 50%, transparent); }
.db-day-tab-name { font-size: 10.5px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-tertiary); }
.db-day-tab[aria-pressed="true"] .db-day-tab-name { color: rgba(255,255,255,0.85); }
.db-day-tab-num { font-size: 16px; font-weight: 650; color: var(--text-primary); }
.db-day-tab[aria-pressed="true"] .db-day-tab-num { color: var(--accent-fg, #fff); }
.db-day-tab-flag { position: absolute; top: 6px; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: var(--amber-fill); }
.db-day-tab:active { transform: scale(0.96); }

/* ═════════ Callouts (info / warning banners) ═════════ */
.db-callout { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; color: var(--t); background: var(--t-dim); }
.db-callout svg { flex-shrink: 0; margin-top: 1px; }

/* ═════════ Plan-detail meal card (AI-generated plan view) ═════════ */
.db-planmeal-head { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: none; border: none; cursor: pointer; text-align: left; font: inherit; }
.db-planmeal-type { font-size: 11px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
.db-planmeal-name { font-size: 14.5px; font-weight: 600; color: var(--text-primary); margin-top: 2px; display: flex; align-items: center; flex-wrap: wrap; }

/* ═════════ Swap option row (engine alternates) ═════════ */
.db-swap-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; margin-bottom: 6px; background: var(--fill); border: 1.5px solid transparent; transition: background-color 150ms ease, border-color 150ms ease; }
.db-swap-row[data-applied="true"] { background: var(--accent-dim); border-color: var(--accent); }
.db-swap-row:last-child { margin-bottom: 0; }

/* ═════════ Guideline list (clinical rules) ═════════ */
.db-guidelines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.db-guidelines li { display: flex; align-items: flex-start; gap: 9px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.45; }
.db-guidelines-check { flex-shrink: 0; margin-top: 2px; color: var(--green); }

@media (max-width: 760px) {
  .db-day-tab { min-width: 50px; padding: 8px 11px; }
  .db-planmeal-head { padding: 12px 14px; }
}

/* ═════════ Macro colors (small marks only — dots, bars) ═════════ */
.db { --mx-p: #0071e3; --mx-c: #34c759; --mx-f: #af52de; }
.db-mx-p { --mx: var(--mx-p); } .db-mx-c { --mx: var(--mx-c); } .db-mx-f { --mx: var(--mx-f); }

/* ═════════ Day summary panel ═════════ */
.db-daysum { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); margin-bottom: 4px; }
.db-daysum-main { padding: 22px 24px; border-right: 1px solid var(--db-border); }
.db-daysum-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.db-daysum-value { font-size: 40px; font-weight: 700; letter-spacing: -0.035em; line-height: 1.05; margin-top: 6px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.db-daysum-value span { font-size: 15px; font-weight: 500; letter-spacing: 0; color: var(--text-tertiary); margin-left: 5px; }
.db-daysum-sub { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; color: var(--text-tertiary); }
.db-daysum-pct { font-weight: 650; font-variant-numeric: tabular-nums; }
.db-daysum-pct[data-band="on"] { color: var(--green); }
.db-daysum-pct[data-band="under"] { color: var(--amber); }
.db-daysum-pct[data-band="over"] { color: var(--red); }
.db-splitbar { display: flex; gap: 3px; height: 8px; margin-top: 20px; }
.db-splitbar span { flex-basis: 0; min-width: 4px; border-radius: 4px; background: var(--mx); }
.db-splitlegend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.db-splitlegend span, .db-mxrow-name { display: inline-flex; align-items: center; gap: 6px; }
.db-splitlegend i, .db-mxrow-name i { width: 7px; height: 7px; border-radius: 2px; background: var(--mx); flex-shrink: 0; }
.db-daysum-macros { padding: 18px 24px; display: flex; flex-direction: column; justify-content: center; gap: 16px; }
.db-mxrow-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.db-mxrow-name { font-size: 13.5px; font-weight: 550; color: var(--text-primary); }
.db-mxrow-val { font-size: 15px; font-weight: 650; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.db-mxrow-val small { font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-left: 1px; }
.db-mxrow-val em { font-style: normal; font-size: 12.5px; font-weight: 500; color: var(--text-tertiary); margin-left: 5px; }
.db-mxrow-track { height: 5px; border-radius: 3px; background: var(--fill); overflow: hidden; }
.db-mxrow-track span { display: block; height: 100%; border-radius: 3px; background: var(--mx); transform-origin: left; transition: transform 500ms var(--db-ease); }
.db-mxrow-track span[data-band="under"] { background: var(--amber-fill); }
.db-mxrow-track span[data-band="over"] { background: var(--red-fill); }

/* ═════════ Meal list (one card, dense rows) ═════════ */
.db-meallist { overflow: hidden; padding: 0; }
.db-mealrow, .db-mealrow-head { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 16px 22px; }
.db-mealrow + .db-mealrow, .db-mealrow-wrap + .db-mealrow-wrap { border-top: 1px solid var(--db-border); }
.db-mealrow-type { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); align-self: start; padding-top: 1px; }
.db-mealrow-eyebrow { font-size: 12px; font-weight: 600; color: var(--text-tertiary); margin-bottom: 2px; }
.db-mealrow-name { font-size: 15px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; display: flex; align-items: center; flex-wrap: wrap; }
.db-mealrow-sub { font-size: 12.5px; color: var(--text-tertiary); margin-top: 3px; font-variant-numeric: tabular-nums; }
.db-mealrow-note { font-size: 12.5px; color: var(--text-secondary); margin-top: 6px; padding-left: 10px; border-left: 2px solid var(--db-border); }
.db-mealrow-kcal { font-size: 16px; font-weight: 650; color: var(--text-primary); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.db-mealrow-kcal span { font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-left: 3px; }

/* expandable variant (AI plan) */
.db-mealrow-head { grid-template-columns: minmax(0, 1fr) auto 18px; width: 100%; background: none; border: none; text-align: left; font: inherit; cursor: pointer; min-height: 64px; transition: background-color 150ms ease; }
.db-mealrow-head .db-meal-chev { color: var(--text-tertiary); }
.db-mealrow-wrap[data-open="true"] .db-mealrow-head { background: var(--fill); }
.db-mealrow-wrap .db-meal-body { border-top: 1px solid var(--db-border); background: transparent; padding: 16px 22px 20px; }
@media (hover: hover) and (pointer: fine) {
  .db-mealrow-head:hover { background: var(--fill); }
}

@media (max-width: 760px) {
  .db-daysum { grid-template-columns: 1fr; }
  .db-daysum-main { border-right: none; border-bottom: 1px solid var(--db-border); padding: 18px; }
  .db-daysum-value { font-size: 34px; }
  .db-daysum-macros { padding: 16px 18px 18px; gap: 14px; }
  .db-mealrow { grid-template-columns: minmax(0, 1fr) auto; padding: 14px 16px; gap: 12px; }
  .db-mealrow-type { display: none; }
  .db-mealrow-head { padding: 14px 16px; gap: 12px; }
  .db-mealrow-wrap .db-meal-body { padding: 14px 16px 18px; }
  .db-mealrow-name { font-size: 14.5px; }
}
@media (prefers-reduced-motion: reduce) {
  .db-mxrow-track span { transition: none; }
}

/* ── Dashboard layout (dz-*) · 21 Oct 2026 ───────────────────────────────
   12-col widget grid, edit mode, Today/MTD strips, compact numbers, Customize sheet.
   Reuses --db-ease and --db-border. Hover gated, reduced motion handled. */
.dz-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; align-items: stretch; margin-bottom: 16px; }
.dz-span-4  { grid-column: span 4; }
.dz-span-6  { grid-column: span 6; }
.dz-span-8  { grid-column: span 8; }
.dz-span-12 { grid-column: span 12; }
.dz-item { position: relative; min-width: 0; }
.dz-body { height: 100%; }
.dz-body > * { height: 100%; }

/* Quick actions columns follow the widget's width, overriding the old fixed rules */
.db .dz-span-4 .db-actions, .db .dz-span-6 .db-actions { grid-template-columns: 1fr 1fr; }
.db .dz-span-8 .db-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.db .dz-span-12 .db-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }

/* Edit mode */
.dz-editing .dz-body { pointer-events: none; user-select: none; -webkit-user-select: none; }
.dz-editing .dz-item { outline: 1.5px dashed var(--db-border); outline-offset: 4px; border-radius: var(--db-r-card, 20px); }
.dz-item--dragging { z-index: 5; }
.dz-item--dragging .dz-body > * { box-shadow: 0 18px 40px rgba(0,0,0,0.14); }
.dz-editbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding: 10px 14px; border-radius: var(--radius-md); background: var(--accent-dim); color: var(--text-secondary); font-size: 13px; }
.dz-editbar span { flex: 1; min-width: 0; }
.dz-editbar .db-link { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; border: 0; background: none; padding: 0; font: inherit; cursor: pointer; }
.dz-tools { position: absolute; top: 10px; right: 10px; z-index: 3; display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 10px;
  background: rgba(255,255,255,0.86); -webkit-backdrop-filter: blur(16px) saturate(180%); backdrop-filter: blur(16px) saturate(180%);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.08); }

/* Small controls (also used inside the Customize sheet) */
.dz-tool { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); cursor: pointer;
  touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: transform 120ms var(--db-ease, ease-out), background-color 150ms ease, color 150ms ease; }
.dz-tool:active { transform: scale(0.94); }
.dz-tool:disabled { opacity: 0.35; cursor: default; }
.dz-grip { cursor: grab; touch-action: none; }
.dz-grip:active { cursor: grabbing; }
.dz-sizes { display: inline-flex; flex-shrink: 0; padding: 2px; border-radius: 8px; background: var(--fill); }
.dz-size { min-width: 30px; height: 24px; padding: 0 7px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer;
  touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: transform 120ms var(--db-ease, ease-out), background-color 150ms ease, color 150ms ease; }
.dz-size:active { transform: scale(0.95); }
.dz-size[aria-pressed="true"] { background: #fff; color: var(--text-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

/* Today / Month-to-date strips */
.dz-strip { padding: 4px 16px 16px; overflow: visible; background: transparent; border: 0; box-shadow: none; }
.dz-strip-head { display: flex; align-items: baseline; gap: 10px; padding: 10px 2px 12px; }
.dz-strip-title { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; letter-spacing: -0.005em; color: var(--text-primary); }
.dz-strip-title svg { align-self: center; color: var(--text-tertiary); }
.dz-strip-meta { flex: 1; min-width: 0; font-size: 12.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dz-strip-edit { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.dz-strip-empty { padding: 4px 18px 18px; font-size: 13px; color: var(--text-tertiary); }
/* Hairline dividers: 1px gap over a border-colored track */
.dz-cells { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; }
.dz-cell { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 12px 14px;
  background: #fff; border: 1px solid var(--db-border); border-radius: var(--db-r-ctl, 12px); box-shadow: var(--db-shadow);
  transition: box-shadow 150ms ease, border-color 150ms ease; }
.dz-cell-head { display: flex; align-items: center; gap: 7px; min-width: 0; text-decoration: none; touch-action: manipulation; transition: transform 120ms var(--db-ease); }
.dz-cell-head:active { transform: scale(0.98); }
.dz-cell-chip { flex-shrink: 0; width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; color: #fff; background: var(--t-grad); }
.dz-cell-label { min-width: 0; flex: 1; font-size: 12.5px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dz-cell-chev { flex-shrink: 0; color: var(--text-tertiary); opacity: 0; transform: translateX(-2px); transition: opacity 150ms ease, transform 150ms var(--db-ease, ease-out); }
.dz-cell-value { font-size: 21px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; color: var(--text-primary); font-variant-numeric: tabular-nums; margin-top: 2px; }
.dz-cell-foot { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dz-warn { color: var(--amber); font-weight: 600; }

/* Compact number: 4.6K, click for 4,590 */
.dz-num { font-variant-numeric: tabular-nums; }
.dz-num--toggle { padding: 0; margin: 0; border: 0; background: none; font: inherit; color: inherit; letter-spacing: inherit; cursor: pointer; border-radius: 4px;
  text-decoration: underline dotted transparent; text-underline-offset: 4px; touch-action: manipulation; transition: text-decoration-color 150ms ease; }
.dz-num--toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Quick actions header */
.dz-actions-wrap { display: flex; flex-direction: column; min-width: 0; }
.dz-actions-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.dz-actions-head .db-link { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; cursor: pointer; }

/* Customize sheet */
.dz-tabs { display: flex; gap: 2px; padding: 2px; margin-bottom: 14px; border-radius: 10px; background: var(--fill); overflow-x: auto; }
.dz-tab { flex: 1; min-width: max-content; height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer;
  touch-action: manipulation; user-select: none; -webkit-user-select: none; transition: background-color 150ms ease, color 150ms ease; }
.dz-tab[aria-selected="true"] { background: #fff; color: var(--text-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.dz-hint { margin: 0 0 12px; font-size: 13px; color: var(--text-tertiary); }
.dz-olist { display: flex; flex-direction: column; }
.dz-orow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--separator); }
.dz-orow:last-child { border-bottom: 0; }
.dz-orow-text { flex: 1; min-width: 0; }
.dz-orow-move { display: flex; gap: 2px; flex-shrink: 0; }
.dz-orow--off .db-toggle-title { color: var(--text-secondary); }
.dz-olist-sep { padding: 14px 0 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--text-tertiary); }

@media (hover: hover) and (pointer: fine) {
  .dz-tool:hover:not(:disabled) { background: var(--fill); color: var(--text-primary); }
  .dz-size:hover:not([aria-pressed="true"]) { color: var(--text-primary); }
  .dz-tab:hover:not([aria-selected="true"]) { color: var(--text-primary); }
  .dz-cell:hover { border-color: color-mix(in srgb, var(--t) 35%, var(--db-border)); box-shadow: var(--db-shadow-hover); }
  .dz-cell:hover .dz-cell-chev { opacity: 1; transform: translateX(0); }
  .dz-num--toggle:hover { text-decoration-color: currentColor; }
}
@media (max-width: 1180px) {
  .dz-span-4 { grid-column: span 6; }
  .dz-span-8 { grid-column: span 12; }
}
@media (max-width: 760px) {
  .dz-grid { gap: 12px; margin-bottom: 12px; }
  .dz-grid > * { grid-column: span 12; }
  .db .dz-grid .db-actions { grid-template-columns: 1fr 1fr; }
  .dz-strip-head { flex-wrap: wrap; }
  .dz-strip-meta { order: 3; flex-basis: 100%; }
  .dz-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .dz-cell { padding: 12px; }
  .dz-cell-value { font-size: 20px; }
  .dz-editbar { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .dz-tool, .dz-size, .dz-cell-chev { transition: background-color 150ms ease, color 150ms ease, opacity 150ms ease; }
  .dz-tool:active, .dz-size:active, .dz-cell-chev { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .dz-tools { background: #fff; -webkit-backdrop-filter: none; backdrop-filter: none; }
}

/* ── AI recipe helper + ingredient-line editor (db-ai-*, db-ingline-*, db-totals-*, db-stepper) ──
   These classes were used throughout the recipes page but had no rules anywhere — that was the
   actual cause of the plain/unstyled look, not a design choice. Added 22 Oct 2026. */

.db-ai {
  position: relative; padding: 18px; border-radius: var(--db-r-card, 20px);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, #fff) 0%, #fff 55%);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--db-border));
  box-shadow: var(--db-shadow); margin-bottom: 18px;
}
.db-ai-head { display: flex; gap: 12px; margin-bottom: 14px; }
.db-ai-chip {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
  color: #fff; background: var(--brand-grad); box-shadow: 0 4px 12px -2px color-mix(in srgb, var(--accent) 45%, transparent);
}
.db-ai-title { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; color: var(--text-primary); }
.db-ai-sub { margin-top: 2px; font-size: 13px; line-height: 1.4; color: var(--text-secondary); }
.db-ai-grid { display: flex; gap: 10px; margin-bottom: 14px; }
.db-ai-grid .ps-input { flex: 1; min-width: 0; }
.db-ai-grid .ps-btn { flex-shrink: 0; white-space: nowrap; }
.db-ai-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--db-border); font-size: 12.5px; color: var(--text-tertiary); }

.db-stepper {
  display: inline-flex; align-items: center; height: 30px; border-radius: 9px; background: var(--fill); overflow: hidden;
}
.db-stepper button {
  width: 30px; height: 30px; border: 0; background: transparent; font-size: 16px; line-height: 1; font-weight: 600;
  color: var(--text-primary); cursor: pointer; touch-action: manipulation; transition: background-color 150ms ease;
}
.db-stepper button:disabled { opacity: 0.35; cursor: default; }
.db-stepper output { min-width: 26px; text-align: center; font-size: 13.5px; font-weight: 650; font-variant-numeric: tabular-nums; }

.db-ai-est {
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; padding: 1px 7px 1px 6px; border-radius: 999px;
  font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-dim); white-space: nowrap;
}

.db-inglist { border-radius: var(--db-r-card, 20px); border: 1px solid var(--db-border); background: #fff; box-shadow: var(--db-shadow); overflow: hidden; }
.db-ingline {
  display: flex; align-items: center; gap: 12px; padding: 12px 2px; border-bottom: 1px solid var(--db-border);
}
.db-ingline:last-child { border-bottom: 0; }
.db-ingline-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.db-ingline-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 3px; font-size: 12.5px; color: var(--text-tertiary); }
.db-ingline-sub select {
  height: 26px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--db-border); background: #fff;
  font: inherit; font-size: 12px; color: var(--text-primary); cursor: pointer;
}
.db-ingline-sub select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.db-linkbtn {
  border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); cursor: pointer;
  touch-action: manipulation; transition: opacity 150ms ease;
}
.db-linkbtn:active { opacity: 0.6; }

.db-grams {
  display: inline-flex; align-items: center; flex-shrink: 0; gap: 3px; height: 36px; padding: 0 10px; border-radius: 10px;
  background: var(--fill); font-size: 13.5px; font-weight: 600; color: var(--text-primary);
}
.db-grams input {
  width: 42px; border: 0; background: transparent; font: inherit; font-weight: 650; color: var(--text-primary);
  text-align: right; font-variant-numeric: tabular-nums;
}
.db-grams input:focus-visible { outline: none; }
.db-grams span { color: var(--text-tertiary); font-weight: 500; }

.db-ingadd { display: flex; gap: 8px; margin: 12px 0; }
.db-ingadd .ps-input { flex: 1; min-width: 0; }

.db-totals {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px;
  border-radius: var(--db-r-card, 20px); background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
}
.db-totals-main { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.db-totals-sub { margin-top: 2px; font-size: 12.5px; color: var(--text-secondary); }

@media (hover: hover) and (pointer: fine) {
  .db-stepper button:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
  .db-linkbtn:hover { text-decoration: underline; }
  .db-ingline-sub select:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--db-border)); }
}
@media (max-width: 560px) {
  .db-ai-grid { flex-direction: column; }
  .db-ingline { flex-wrap: wrap; }
  .db-totals { flex-direction: column; align-items: flex-start; }
}

/* ── Form sections inside sheets (db-fieldset*) and the ingredient nutrition editor (db-nutri*) ──
   db-fieldset / db-field-row were used by the recipe and ingredient forms with no rules. 22 Oct 2026. */
.db-fieldset { margin-top: 20px; }
.db-fieldset:first-child { margin-top: 4px; }
.db-fieldset-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.db-fieldset-label { display: block; font-size: 12px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 10px; }
.db-fieldset-head .db-fieldset-label { margin-bottom: 0; }
.db-fieldset-hint { font-size: 12.5px; color: var(--text-tertiary); }
.db-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.db-opt { margin-left: 4px; font-size: 11.5px; font-weight: 500; color: var(--text-tertiary); text-transform: none; letter-spacing: 0; }

.db-ing-est {
  display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; margin: 4px 0 4px; border-radius: 14px;
  background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  font-size: 13px; line-height: 1.45; color: var(--text-secondary);
}
.db-ing-est strong { display: block; font-size: 13.5px; font-weight: 650; color: var(--text-primary); margin-bottom: 1px; }
.db-ing-est-icon { flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; background: var(--brand-grad); }

/* Nutrition panel: one calm card, calories as the headline number, macros as tiles */
.db-nutri { border-radius: 18px; border: 1px solid var(--db-border); background: #fff; overflow: hidden; }
.db-nutri-kcal { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--db-border); cursor: text; }
.db-nutri-kcal-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.db-nutri-kcal-field { display: inline-flex; align-items: baseline; gap: 6px; }
.db-nutri-kcal-field input {
  width: 110px; border: 0; background: transparent; padding: 0; text-align: right; outline: none;
  font: inherit; font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: var(--text-primary); font-variant-numeric: tabular-nums;
}
.db-nutri-kcal-field input::placeholder { color: rgba(60,60,67,0.25); }
.db-nutri-kcal-field em { font-style: normal; font-size: 13px; font-weight: 550; color: var(--text-tertiary); }
.db-nutri-kcal:focus-within { background: color-mix(in srgb, var(--accent) 4%, #fff); }

.db-nutri-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.db-nutri-cell { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; cursor: text; border-right: 1px solid var(--db-border); transition: background-color 150ms ease; }
.db-nutri-cell:last-child { border-right: 0; }
.db-nutri-cell:focus-within { background: color-mix(in srgb, var(--accent) 4%, #fff); }
.db-nutri-cell-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 550; color: var(--text-secondary); }
.db-nutri-cell-label i { width: 7px; height: 7px; border-radius: 2px; background: var(--nt); flex-shrink: 0; }
.db-nutri-cell-field { display: inline-flex; align-items: baseline; gap: 3px; }
.db-nutri-cell-field input {
  width: 100%; min-width: 0; border: 0; background: transparent; padding: 0; outline: none;
  font: inherit; font-size: 19px; font-weight: 650; letter-spacing: -0.02em; color: var(--text-primary); font-variant-numeric: tabular-nums;
}
.db-nutri-cell-field input::placeholder { color: rgba(60,60,67,0.25); }
.db-nutri-cell-field em { font-style: normal; font-size: 12.5px; color: var(--text-tertiary); }

/* Macro tones: the two brand hues plus the deep blue; fiber is neutral */
.db-nutri-p { --nt: var(--accent); }
.db-nutri-c { --nt: var(--brand-2); }
.db-nutri-f { --nt: var(--accent-strong); }
.db-nutri-x { --nt: rgba(60,60,67,0.35); }

.db-nutri-split { padding: 12px 16px 14px; border-top: 1px solid var(--db-border); background: rgba(118,118,128,0.04); }
.db-nutri-bar { display: flex; gap: 3px; height: 6px; }
.db-nutri-bar span { flex-basis: 0; min-width: 4px; border-radius: 3px; background: var(--nt); transition: flex-grow 300ms var(--db-ease); }
.db-nutri-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 9px; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.db-nutri-legend span { display: inline-flex; align-items: center; gap: 5px; }
.db-nutri-legend i { width: 7px; height: 7px; border-radius: 2px; background: var(--nt); }
.db-nutri-implied { margin-left: auto; color: var(--text-tertiary); }

.db-callout svg { color: currentColor; }

@media (max-width: 640px) {
  .db-field-row { grid-template-columns: 1fr; }
  .db-nutri-grid { grid-template-columns: 1fr 1fr; }
  .db-nutri-cell:nth-child(2) { border-right: 0; }
  .db-nutri-cell:nth-child(-n+2) { border-bottom: 1px solid var(--db-border); }
  .db-nutri-kcal-field input { font-size: 26px; width: 96px; }
  .db-nutri-implied { margin-left: 0; flex-basis: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .db-nutri-bar span { transition: none; }
}

/* ── Wide sheet layouts: recipe editor (db-rs-*) and ingredient editor (db-is-*) · 22 Oct 2026 ──
   Phones: one column, sections reordered with the order property (column wrappers become display: contents).
   Desktop (≥ 900px): two panels split by a hairline. */
.db-rs { display: flex; flex-direction: column; gap: 18px; }
.db-rs > .db-ai { margin-bottom: 0; }
.db-rs-layout, .db-is-layout { display: flex; flex-direction: column; gap: 26px; }
.db-rs-main, .db-rs-side, .db-is-main, .db-is-side { display: contents; }
.db-rs-o-details { order: 1; } .db-rs-o-ing { order: 2; } .db-rs-o-nutri { order: 3; } .db-rs-o-tags { order: 4; } .db-rs-o-method { order: 5; }
.db-is-o-name { order: 1; } .db-is-o-group { order: 2; } .db-is-o-nutri { order: 3; } .db-is-o-suit { order: 4; } .db-is-o-notes { order: 5; }
.db-is-layout > * > .db-fieldset { margin-top: 0; }

.db-rs-section { min-width: 0; }
.db-rs-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.db-rs-head h3 { margin: 0; display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 680; letter-spacing: -0.01em; color: var(--text-primary); }
.db-rs-head h3 label { cursor: pointer; }
.db-rs-count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 11.5px; font-weight: 650; color: var(--accent); background: var(--accent-dim); font-variant-numeric: tabular-nums; }
.db-rs-servings { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.db-rs-sub { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }

.db-rs-empty { display: flex; align-items: center; gap: 10px; padding: 18px 16px; border-radius: 16px; border: 1.5px dashed var(--db-border); color: var(--text-tertiary); font-size: 13.5px; }
.db-ingline--unmatched { background: color-mix(in srgb, var(--amber) 5%, transparent); }
.db-inglist .db-ingline { padding-left: 14px; padding-right: 8px; }

.db-ingadd-search { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; height: 40px; padding: 0 12px; gap: 8px; border-radius: 12px; background: var(--fill); color: var(--text-tertiary); transition: box-shadow 150ms ease, background-color 150ms ease; }
.db-ingadd-search input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; outline: none; font: inherit; font-size: 14px; color: var(--text-primary); }
.db-ingadd-search:focus-within { background: #fff; box-shadow: 0 0 0 2px var(--accent); }
.db-ingadd .db-grams { height: 40px; }
.db-ingadd .ps-btn { height: 40px; }

.db-rs-calc { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px 10px 14px; margin-bottom: 10px; border-radius: 14px; background: var(--accent-dim); }
.db-rs-calc-main { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.db-rs-calc-main strong { color: var(--text-primary); font-weight: 650; }
.db-rs-calc-sub { margin-top: 1px; font-size: 12px; color: var(--text-tertiary); }
.db-rs-use { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; height: 32px; padding: 0 12px; border: 0; border-radius: 9px; font: inherit; font-size: 13px; font-weight: 650; color: #fff; background: var(--accent); cursor: pointer; touch-action: manipulation; transition: transform 120ms var(--db-ease), background-color 150ms ease; }
.db-rs-use:active { transform: scale(0.97); }
.db-rs-use:disabled { opacity: 0.4; cursor: default; }
.db-rs-prep { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.db-rs-prep .ps-label { margin: 0; }

@media (hover: hover) and (pointer: fine) {
  .db-rs-use:hover:not(:disabled) { background: var(--accent-strong); }
}

@media (min-width: 900px) {
  .db-rs-layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 0; align-items: start; }
  .db-rs-main, .db-rs-side { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
  .db-rs-main { padding-right: 28px; }
  .db-rs-side { padding-left: 28px; border-left: 1px solid var(--db-border); }

  .db-is-layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); grid-template-areas: "a s" "b s"; gap: 0 28px; align-items: start; }
  .db-is-main, .db-is-side { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
  .db-is-main { grid-area: a; }
  .db-is-main--after { grid-area: b; margin-top: 22px; }
  .db-is-side { grid-area: s; padding-left: 28px; border-left: 1px solid var(--db-border); align-self: stretch; }
}
@media (max-width: 640px) {
  .db-rs-head { flex-wrap: wrap; }
  .db-ingadd { flex-wrap: wrap; }
  .db-ingadd-search { flex-basis: 100%; }
  .db-ingadd .ps-btn { flex: 1; }
}
`;

/* ==========================================================================
   Sidebar. Rendered by Sidebar.tsx itself (<SidebarStyles />) so it is styled on
   every dashboard page, including pages that do not render <DesignStyles /> yet.
   All colours come from tokens set by applyBrand() in brand.ts.
   ========================================================================== */
export const SIDEBAR_CSS = `
/* ── Layout tokens ───────────────────────────────────────────────────────
   --sb-w is the width the PAGE must reserve for the sidebar (rail, or full when pinned).
   Use it in globals.css:  .ps-main { margin-left: var(--sb-w, 72px) }
   Auto mode never reflows the page: the sidebar floats over it while hovered. */
:root{--sb-rail:72px;--sb-full:264px;--sb-w:var(--sb-rail);--sb-ease:cubic-bezier(.23,1,.32,1)}
:root[data-sb-pinned="true"]{--sb-w:var(--sb-full)}

/* ── Sidebar (desktop) ───────────────────────────────────────────────────
   The panel is ALWAYS laid out at full width. The rail is just a clip-path window onto
   its left 72px, so collapsing/expanding animates one compositor-friendly property and
   nothing inside ever reflows. Icons sit at x=36 (the rail's centre line) in both states. */
.ps-sidebar.db-sb{
  position:fixed;top:0;bottom:0;left:0;z-index:30;box-sizing:border-box;
  width:var(--sb-full);
  background:var(--sidebar-bg,#fff);
  color:var(--sidebar-fg,#1d1d1f);
  font-family:var(--font-sans,inherit);
  border:0;
  clip-path:inset(0 calc(var(--sb-full) - var(--sb-rail)) 0 0);
  transition:clip-path 180ms var(--sb-ease);
}
.ps-sidebar.db-sb[data-open="true"]{
  clip-path:inset(0 -56px 0 0);          /* negative inset lets the shadow escape the clip */
  transition-duration:220ms;
}
.ps-sidebar.db-sb[data-state="flyout"]{box-shadow:0 0 0 1px var(--sidebar-border,rgba(60,60,67,.12)),0 24px 56px rgba(0,0,0,.16)}
.ps-sidebar.db-sb[data-state="pinned"]{box-shadow:1px 0 0 var(--sidebar-border,rgba(60,60,67,.12))}
.db-sb-edge{position:absolute;top:0;bottom:0;left:calc(var(--sb-rail) - 1px);width:1px;background:var(--sidebar-border,rgba(60,60,67,.12));pointer-events:none;transition:opacity 120ms ease}
.db-sb[data-open="true"] .db-sb-edge{opacity:0}

.db-sb-inner{display:flex;flex-direction:column;height:100%;min-height:0;padding:12px 0}
.db-sb-truncate{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Anything that should vanish in the rail fades; icons and the logo never do. */
.db-sb-fade{transition:opacity 140ms ease 60ms}
.db-sb[data-open="false"] .db-sb-fade{opacity:0;pointer-events:none;transition-delay:0ms}

/* ── Header ──────────────────────────────────────────────────────────── */
.db-sb-head{display:flex;align-items:center;gap:4px;min-width:0;padding:4px 14px 6px}
.db-sb-brand{
  display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:6px 5px;
  border-radius:var(--radius-lg,16px);color:inherit;text-decoration:none;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;
  transition:transform 120ms var(--sb-ease);
}
.db-sb-brand:active{transform:scale(.98)}
.db-sb-mark{
  width:34px;height:34px;flex:none;display:grid;place-items:center;overflow:hidden;
  border-radius:var(--radius-md,12px);
  background:var(--sidebar-chip-bg,var(--accent));color:var(--sidebar-chip-fg,var(--accent-fg,#fff));
  font-size:15px;font-weight:700;line-height:1;
}
.db-sb-mark img{display:block;width:100%;height:100%;object-fit:cover}
.db-sb-id{display:block;min-width:0;flex:1}
.db-sb-name{font-size:14px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.db-sb-role{font-size:12px;line-height:1.3;color:var(--sidebar-muted)}
.db-sb-skel{display:block;height:13px;border-radius:6px;background:var(--sidebar-hover-bg)}

/* ── Nav ─────────────────────────────────────────────────────────────── */
.db-sb-nav{
  flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;
  display:flex;flex-direction:column;gap:6px;padding:8px 14px;scrollbar-width:thin;
}
.db-sb-group{display:flex;flex-direction:column;gap:2px}
.db-sb-label{position:relative;display:flex;align-items:center;height:24px;padding:0 13px;font-size:11.5px;font-weight:600;letter-spacing:.01em;color:var(--sidebar-faint)}
/* In the rail the section title becomes a short rule, so groups stay distinct. */
.db-sb-label::after{content:"";position:absolute;left:10px;width:24px;top:50%;height:1px;background:var(--sidebar-border,rgba(60,60,67,.12));opacity:0;transition:opacity 140ms ease}
.db-sb[data-open="false"] .db-sb-label::after{opacity:1}
.db-sb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}

/* Nav is used 100+ times a day: no slide, no fade. Instant state, press feedback only. */
.db-sb-item{
  position:relative;display:flex;align-items:center;gap:10px;width:100%;height:38px;padding:0 13px;min-width:0;
  border:0;background:transparent;font:inherit;text-align:left;cursor:pointer;
  border-radius:var(--radius-md,12px);
  font-size:13.5px;font-weight:500;color:var(--sidebar-muted);text-decoration:none;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;-webkit-user-select:none;
  transition:transform 120ms var(--sb-ease);
}
.db-sb-item svg{flex:none}
.db-sb-text{flex:1;min-width:0}
.db-sb-item:active{transform:scale(.98)}
.db-sb-item[aria-current="page"],
.db-sb-parent[data-has-active="true"][aria-expanded="false"],
.db-sb[data-open="false"] .db-sb-parent[data-has-active="true"]{
  background:var(--sidebar-active-bg);color:var(--sidebar-active-fg);font-weight:600;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sidebar-active-fg) 12%,transparent);
}
/* Accent tick on the sidebar's left edge: the "you are here" cue that survives the rail. */
.db-sb-item[aria-current="page"]:not(.db-sb-item--sub)::before,
.db-sb-parent[data-has-active="true"][aria-expanded="false"]::before,
.db-sb[data-open="false"] .db-sb-parent[data-has-active="true"]::before{
  content:"";position:absolute;left:-14px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--sidebar-active-fg);
}
.db-sb-parent[data-has-active="true"][aria-expanded="true"]{color:var(--sidebar-fg)}

.db-sb-caretwrap{flex:none;display:grid;place-items:center;color:var(--sidebar-faint)}
.db-sb-caret{transition:transform 200ms var(--sb-ease)}
.db-sb-parent[aria-expanded="true"] .db-sb-caret{transform:rotate(180deg)}

/* ── Submenu: an accordion, so height is the one layout property we allow ── */
.db-sb-sub{display:grid;grid-template-rows:0fr;transition:grid-template-rows 200ms var(--sb-ease)}
.db-sb-sub[data-open="true"]{grid-template-rows:1fr}
.db-sb[data-open="false"] .db-sb-sub{grid-template-rows:0fr}
.db-sb-sublist{
  position:relative;overflow:hidden;min-height:0;list-style:none;margin:0;padding:2px 0 0;
  display:flex;flex-direction:column;gap:2px;
  visibility:hidden;transition:visibility 0s linear 200ms;           /* closed rows can't take focus */
}
.db-sb-sub[data-open="true"] .db-sb-sublist{visibility:visible;transition-delay:0s}
.db-sb[data-open="false"] .db-sb-sublist{visibility:hidden}
.db-sb-sublist::before{content:"";position:absolute;left:22px;top:4px;bottom:4px;width:1px;background:var(--sidebar-border,rgba(60,60,67,.12))}
.db-sb-item--sub{height:34px;padding:0 10px 0 41px;font-size:13px}

.db-sb-item:focus-visible,.db-sb-brand:focus-visible,.db-sb-iconbtn:focus-visible{
  outline:2px solid var(--sidebar-active-fg,var(--accent));outline-offset:1px;
}

/* ── Footer ──────────────────────────────────────────────────────────── */
.db-sb-foot{margin:6px 14px 0;padding-top:10px;border-top:1px solid var(--sidebar-border)}
.db-sb-account{display:flex;align-items:center;gap:10px;padding:4px 5px;min-width:0}
.db-sb-avatar{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:50%;background:var(--sidebar-hover-bg);color:var(--sidebar-fg);font-size:13px;font-weight:650}
.db-sb-email{flex:1;min-width:0;font-size:12px;color:var(--sidebar-muted)}
.db-sb-iconbtn{
  flex:none;width:32px;height:32px;display:grid;place-items:center;border:0;padding:0;
  border-radius:var(--radius-sm,8px);background:transparent;color:var(--sidebar-muted);cursor:pointer;text-decoration:none;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;
  transition:transform 120ms var(--sb-ease);
}
.db-sb-iconbtn:active{transform:scale(.94)}

@media (hover:hover) and (pointer:fine){
  .db-sb-brand:hover{background:var(--sidebar-hover-bg)}
  .db-sb-item:not([aria-current="page"]):hover{background:var(--sidebar-hover-bg);color:var(--sidebar-fg)}
  .db-sb-parent[data-has-active="true"][aria-expanded="false"]:hover{background:var(--sidebar-active-bg);color:var(--sidebar-active-fg)}
  .db-sb-iconbtn:hover{background:var(--sidebar-hover-bg);color:var(--sidebar-fg)}
}

/* ── Top bar (phone / tablet): follows the sidebar style ─────────────── */
.ps-topbar.db-sb-top{
  background:var(--sidebar-bg,#fff);color:var(--sidebar-fg,#1d1d1f);
  font-family:var(--font-sans,inherit);
}
.ps-topbar.db-sb-top[data-scrolled]{background:var(--sidebar-bg,#fff);color:var(--sidebar-fg,#1d1d1f)}
.ps-topbar.db-sb-top[data-scrolled="true"]{box-shadow:0 .5px 0 var(--sidebar-border)}
.db-sb-top-brand{display:flex;align-items:center;gap:10px;min-width:0;color:inherit;text-decoration:none}
.db-sb-top-brand .db-sb-mark{width:30px;height:30px;border-radius:var(--radius-sm,8px);font-size:13px}
.db-sb-top-name{font-size:16px;font-weight:600;letter-spacing:-.01em}

/* ── Tab bar (phone / tablet): translucent, accent when active ───────── */
.ps-tabbar.db-sb-tabs{
  background:color-mix(in srgb,var(--surface,#fff) 80%,transparent);
  -webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
  font-family:var(--font-sans,inherit);
  /* Fill the row however many tabs the role allows (globals.css hard-codes 5 columns) */
  grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);
}
.db-sb-tab{
  min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  border:0;padding:0;background:none;font:inherit;font-size:10.5px;font-weight:600;
  color:var(--text-tertiary);text-decoration:none;cursor:pointer;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;-webkit-user-select:none;
  transition:transform 120ms var(--sb-ease);
}
.db-sb-tab:active{transform:scale(.97)}
.db-sb-tab[aria-current="page"]{color:var(--accent)}
.db-sb-tab:focus-visible{outline:2px solid var(--accent);outline-offset:-4px;border-radius:var(--radius-md,12px)}

/* ── "More" sheet ────────────────────────────────────────────────────── */
.db-sb-more{display:flex;flex-direction:column;gap:18px;padding-bottom:8px;font-family:var(--font-sans,inherit)}
.db-sb-group-title{padding:0 4px 6px;font-size:12px;font-weight:600;color:var(--text-tertiary)}
.db-sb-group-list{list-style:none;margin:0;padding:0;overflow:hidden;background:var(--fill);border-radius:var(--radius-lg,16px)}
.db-sb-group-list li + li{border-top:1px solid var(--separator,rgba(60,60,67,.12))}
.db-sb-row{
  display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:0 14px;
  border:0;background:transparent;font:inherit;font-size:15px;font-weight:500;text-align:left;
  color:var(--text-primary);text-decoration:none;cursor:pointer;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;
}
.db-sb-row:active{background:var(--fill-strong,rgba(118,118,128,.16))}
.db-sb-row-icon{flex:none;color:var(--accent)}
.db-sb-row-chev{flex:none;margin-left:auto;color:var(--text-tertiary)}
.db-sb-row--danger{color:var(--red,#d70015)}

/* ── Accessibility ───────────────────────────────────────────────────── */
@media (prefers-reduced-transparency:reduce){
  .ps-tabbar.db-sb-tabs{background:var(--surface,#fff);-webkit-backdrop-filter:none;backdrop-filter:none}
}
/* Reduced motion: no sliding or rotating. Opacity fades stay, they aid comprehension. */
@media (prefers-reduced-motion:reduce){
  .ps-sidebar.db-sb,.ps-sidebar.db-sb[data-open="true"]{transition:none}
  .db-sb-sub,.db-sb-caret,.db-sb-sublist{transition:none}
  .db-sb-brand:active,.db-sb-item:active,.db-sb-iconbtn:active,.db-sb-tab:active{transform:none}
}

/* ── Exercise grid & card (app/dashboard/workouts/exercises) ──────────────── */

.db-exgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
@media (max-width: 760px) {
  .db-exgrid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
}

.db-ex {
  display: flex;
  flex-direction: column;
  text-align: left;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  transition: transform 200ms var(--db-ease), box-shadow 200ms ease;
}
.db-ex[data-archived="true"] { opacity: 0.55; }
@media (hover: hover) and (pointer: fine) {
  .db-ex:hover { transform: translateY(-2px); box-shadow: var(--db-shadow-hover); }
}

.db-ex-cover {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  background: var(--fill);
  color: var(--text-tertiary);
  overflow: hidden;
}
.db-ex-cover img { width: 100%; height: 100%; object-fit: cover; }

.db-ex-flag {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 9px;
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
  font-weight: 650;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(6px);
}
.db-ex-flag--mine { color: var(--accent); background: rgba(255,255,255,0.92); }

.db-ex-video {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
}

.db-ex-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.db-ex-name { font-size: 14.5px; font-weight: 650; letter-spacing: -0.01em; color: var(--text-primary); line-height: 1.3; }
.db-ex-meta { font-size: 12.5px; color: var(--text-tertiary); }

/* ── Exercise detail sheet (key/value grid, media, prose) ──────────────────── */

.db-exdetail-media { border-radius: var(--db-r-ctl, 12px); overflow: hidden; margin-bottom: 16px; background: var(--fill); }
.db-exdetail-media img, .db-exdetail-media video { width: 100%; display: block; }

.db-kv-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-bottom: 16px; }
.db-kv { padding: 10px 12px; border-radius: var(--db-r-ctl, 12px); background: var(--fill); }
.db-kv-label { font-size: 11px; font-weight: 650; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-tertiary); }
.db-kv-value { font-size: 13.5px; font-weight: 600; color: var(--text-primary); margin-top: 3px; }

.db-prose { font-size: 14px; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; }

/* ── Category tags, pills, picker, swatches ─────────────────────────────────
   CategoryColor = blue | cyan | sky | teal | indigo | gray (lib/workout/types.ts) */

.db-c-blue   { --t: var(--accent);      --t-dim: var(--accent-dim); }
.db-c-cyan   { --t: #09AECF;            --t-dim: rgba(9,174,207,0.14); }
.db-c-sky    { --t: #2F9BE0;            --t-dim: rgba(47,155,224,0.14); }
.db-c-teal   { --t: #12B389;            --t-dim: rgba(18,179,137,0.14); }
.db-c-indigo { --t: #5856D6;            --t-dim: rgba(88,86,214,0.14); }
.db-c-gray   { --t: var(--text-secondary); --t-dim: var(--fill); }

.db-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.db-cat {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: var(--radius-pill, 999px);
  font-size: 11.5px; font-weight: 600;
  color: var(--t); background: var(--t-dim);
}
.db-cat--more { color: var(--text-tertiary); background: var(--fill); }

.db-catpick { display: flex; flex-wrap: wrap; gap: 8px; }
.db-catopt {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: var(--radius-pill, 999px);
  font-size: 13px; font-weight: 600;
  color: var(--t); background: var(--t-dim);
  border: 1.5px solid transparent;
  cursor: pointer; transition: border-color 150ms ease, transform 140ms var(--db-ease);
}
.db-catopt[aria-pressed="true"] { border-color: var(--t); }
.db-catopt--new { color: var(--text-secondary); background: var(--fill); }

.db-catnew { margin-top: 10px; padding: 12px; border-radius: var(--db-r-ctl, 12px); background: var(--fill); display: flex; flex-direction: column; gap: 10px; }
.db-catnew-row { display: flex; gap: 8px; }

.db-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.db-swatch {
  width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center;
  color: #fff; background: var(--t);
  border: none; cursor: pointer;
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px transparent;
  transition: box-shadow 150ms ease;
}
.db-swatch[aria-checked="true"] { box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--t); }

.db-catrow { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--db-border); }
.db-catrow:last-child { border-bottom: none; }
.db-catrow-name { flex: 1; }
.db-catrow-count { font-size: 12.5px; color: var(--text-tertiary); }

/* ── Media drop zones (ExerciseSheet image/video upload) ───────────────────── */

.db-media { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
@media (max-width: 420px) { .db-media { grid-template-columns: 1fr; } }

.db-drop {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; height: 120px; border-radius: var(--db-r-ctl, 12px);
  border: 1.5px dashed var(--db-border); background: var(--fill);
  color: var(--text-tertiary); cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.db-drop:hover { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
.db-drop strong { font-size: 13px; font-weight: 600; color: inherit; }
.db-drop span { font-size: 11.5px; }

.db-drop-preview { position: relative; height: 120px; border-radius: var(--db-r-ctl, 12px); overflow: hidden; background: var(--fill); }
.db-drop-preview img, .db-drop-preview video { width: 100%; height: 100%; object-fit: cover; }
.db-drop-remove {
  position: absolute; top: 6px; right: 6px; width: 24px; height: 24px;
  display: grid; place-items: center; border-radius: 50%;
  color: #fff; background: rgba(0,0,0,0.5); border: none; cursor: pointer;
}

/* ── Ingredient table row (app/dashboard/diet/ingredients) ─────────────────── */

.db-row-plain {
  width: 100%;
  border: none;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  margin: 0;
}
.db-ing-row { align-items: flex-start; }

.db-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13.5px;
  color: var(--text-primary);
  white-space: nowrap;
}
.db-num small { font-size: 11px; font-weight: 500; color: var(--text-tertiary); margin-left: 1px; }

/* ── Toolbar: segmented tabs, select (used by exercises + ingredients toolbars) ── */

.db-segtabs { display: inline-flex; padding: 3px; border-radius: var(--radius-pill, 999px); background: var(--fill); gap: 2px; }
.db-select {
  height: 40px; padding: 0 30px 0 14px; border-radius: var(--db-r-ctl, 12px);
  border: 1px solid transparent; background: var(--fill);
  font: inherit; font-size: 14px; font-weight: 550; color: var(--text-primary);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238E8E93' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  cursor: pointer;
}
`;

// Rendered by Sidebar itself so it is styled on every dashboard page,
// including ones that have not been migrated to <DesignStyles /> yet.
export function SidebarStyles() {
  return <style>{SIDEBAR_CSS}</style>;
}
