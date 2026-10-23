"use client"
// app/dashboard/diet/components/DietTheme.tsx
// Shared look for every Diet page: brand blue, 18px gutter (same as Members, Leads, Classes, Workouts).
// Put className "ps-page db dt" on the page root and render <DietStyles /> after <DesignStyles />.
// Older pages that still use db-header / db-statbar / db-toolbar are restyled here too, so they match.

export const MACRO_COLOR = { kcal: "#0a66d6", p: "#0a84ff", c: "#30b0c7", f: "#5e5ce6" }

export function MacroSplit({ p, c, f, height = 6 }: { p: number; c: number; f: number; height?: number }) {
  const total = p * 4 + c * 4 + f * 9
  if (!total) return <span className="dt-split" style={{ height }} />
  return (
    <span className="dt-split" style={{ height }} aria-hidden>
      <i style={{ flexGrow: p * 4, background: MACRO_COLOR.p }} />
      <i style={{ flexGrow: c * 4, background: MACRO_COLOR.c }} />
      <i style={{ flexGrow: f * 9, background: MACRO_COLOR.f }} />
    </span>
  )
}

export function DietStyles() {
  return <style>{DT_CSS}</style>
}

// NOTE: no backticks inside this CSS.
const DT_CSS = `
.ps-page.dt { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.dt { max-width: none; }
.dt { --dt-line: var(--separator); --dt-soft: #f5f6f9; --dt-g1: #0a66d6; --dt-g2: #3c4fe0; }

/* Breadcrumb */
.dt-crumbs { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-tertiary); margin-bottom: 14px; min-width: 0; }
.dt-crumbs a, .dt-crumbs button { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); text-decoration: none; font: inherit; font-weight: 550; border: none; background: none; padding: 0; cursor: pointer; }
.dt-crumbs b { color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Header */
.dt-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.dt-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dt-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; flex-shrink: 0; background: linear-gradient(135deg, var(--dt-g1), var(--dt-g2)); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); }
.dt-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.dt-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.dt-kpis { display: flex; gap: 8px; flex: 1; justify-content: flex-end; flex-wrap: wrap; }
.dt-kpi { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 12px 0 8px; border-radius: 12px; background: #fff; border: 1px solid var(--dt-line); }
.dt-kpi-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; background: var(--accent-dim, #e8f1ff); color: var(--accent, #0a66d6); }
.dt-kpi div { display: flex; flex-direction: column; line-height: 1.15; }
.dt-kpi small { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); white-space: nowrap; }
.dt-kpi b { font-size: 16px; font-weight: 740; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dt-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dt-actions .ps-btn { height: 42px; border-radius: 12px; }

/* Toolbar */
.dt-toolbar { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 10px; margin-bottom: 14px; border-radius: 16px; background: #fff; border: 1px solid var(--dt-line); }
.dt-toolbar::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, var(--dt-g1), var(--dt-g2)); }
.dt-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dt-seg { display: flex; padding: 3px; border-radius: 11px; background: #f2f3f6; }
.dt-seg button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.dt-seg button span { font-size: 11.5px; font-weight: 700; color: var(--text-tertiary); }
.dt-seg button[aria-selected="true"], .dt-seg button[aria-pressed="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.dt-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 200px; }
.dt-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.dt-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--dt-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; background: #fff; color: var(--text-primary); }
.dt-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.dt-select { height: 38px; padding: 0 30px 0 12px; border: 1px solid var(--dt-line); border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600; background: #fff; color: var(--text-primary); }
.dt-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 1px; align-items: center; }
.dt-chips::-webkit-scrollbar { display: none; }
.dt-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; border: 1.5px solid var(--dt-line); background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; transition: all 130ms ease; }
.dt-chip:hover { border-color: #b9c7e0; color: var(--text-primary); }
.dt-chip em { font-style: normal; font-size: 11.5px; font-weight: 700; opacity: 0.6; }
.dt-chip[aria-pressed="true"] { color: #fff; border-color: transparent; background: var(--accent, #0a66d6); }
.dt-chip[aria-pressed="true"] em { opacity: 0.85; }
.dt-link { border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; padding: 0 6px; white-space: nowrap; }
.dt-count { font-size: 12.5px; color: var(--text-tertiary); }

/* Macro split bar */
.dt-split { display: flex; gap: 2px; width: 100%; border-radius: 4px; overflow: hidden; background: #eef0f4; }
.dt-split i { display: block; height: 100%; }
.dt-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--text-tertiary); }
.dt-legend span { display: inline-flex; align-items: center; gap: 5px; }
.dt-legend i { width: 8px; height: 8px; border-radius: 2px; }

/* Empty */
.dt-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 52px 20px; background: #fff; border: 1px solid var(--dt-line); border-radius: 18px; }
.dt-empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); margin-bottom: 4px; }
.dt-empty strong { font-size: 15.5px; }
.dt-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); max-width: 360px; }

/* Older diet pages (build, view, new, recipes, templates): compact header in the shared style */
.dt .db-header { align-items: center; margin-bottom: 14px; gap: 12px; }
.dt .db-kicker { font-size: 11.5px; margin-bottom: 2px; }
.dt .db-title { font-size: 24px; }
.dt .db-subtitle { font-size: 13.5px; margin-top: 2px; }
.dt .db-header-actions .ps-btn { height: 42px; border-radius: 12px; }
.dt .db-statbar { margin-bottom: 14px; }
.dt .db-toolbar { margin-bottom: 14px; }
.dt .db-card { border-radius: 16px; }

@media (max-width: 1100px) {
  .dt-kpis { order: 3; flex-basis: 100%; justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
  .dt-kpi { flex: 0 0 auto; }
  .dt-actions { margin-left: auto; }
}
@media (max-width: 760px) {
  .ps-page.dt { padding: 10px 10px 24px !important; }
  .dt-title h1, .dt .db-title { font-size: 22px; }
  .dt-actions { width: 100%; order: 4; }
  .dt-actions .ps-btn { flex: 1; justify-content: center; }
  .dt-search { min-width: 0; flex-basis: 100%; }
  .dt-search input, .dt .ps-input { font-size: 16px; }
}

/* Header: title and buttons on one row, stat chips as an even row underneath */
.dt-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; }
.dt-kpis { grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; justify-content: stretch; overflow: visible; }
.dt-kpi { min-width: 0; }
.dt-actions { grid-column: 2; grid-row: 1; justify-content: flex-end; margin-left: 0; }
@media (max-width: 760px) {
  .dt-head { grid-template-columns: minmax(0, 1fr); }
  .dt-actions { grid-column: 1; grid-row: 3; width: 100%; }
  .dt-kpis { display: flex; overflow-x: auto; scrollbar-width: none; }
  .dt-kpi { flex: 0 0 auto; }
}

/* Card grids (templates, plans): equal-height cards, footer always at the bottom */
.dt .db-plans { align-items: stretch; }
.dt .db-plans > .db-card, .dt .db-plans > article { display: flex; flex-direction: column; height: 100%; }
.dt .db-plan-foot { margin-top: auto; }

`
