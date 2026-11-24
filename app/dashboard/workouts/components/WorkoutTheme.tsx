"use client"
// app/dashboard/workouts/components/WorkoutTheme.tsx
// Shared look for every Workouts page: 18px gutter (same as Members, Leads, Classes), page header,
// KPI chips, toolbar, goal colours. Add className "wk" next to "ps-page" and render <WorkoutStyles />.

import type { WorkoutGoal, Difficulty, MuscleGroup } from "@/lib/workout/types"

/** One colour per goal, used on cards, heroes and chips. */
// Brand theme: every plan uses the app's blue (same as the member profile hero and the sidebar).
// Goals are told apart by their label, not by a different colour scheme.
const BRAND = { from: "#0a66d6", to: "#3c4fe0", soft: "#e8f1ff", text: "#0b4a99" }
export const GOAL_THEME: Record<WorkoutGoal, { from: string; to: string; soft: string; text: string }> = {
  fat_loss: BRAND, muscle_gain: BRAND, strength: BRAND, endurance: BRAND, general_fitness: BRAND,
}
export function goalTheme(g: string) { return GOAL_THEME[g as WorkoutGoal] ?? GOAL_THEME.general_fitness }

export const DIFFICULTY_LEVEL: Record<Difficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 }

export const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  chest: "#0a84ff", back: "#5e5ce6", shoulders: "#af52de", arms: "#ff375f",
  legs: "#ff9f0a", core: "#30b0c7", cardio: "#30d158", full_body: "#8e8e93",
}

/** Three bars, filled up to the level. */
export function DifficultyBars({ d }: { d: Difficulty }) {
  const n = DIFFICULTY_LEVEL[d] ?? 1
  return (
    <span className="wk-diff" data-level={n} aria-hidden>
      <i data-on={n >= 1} /><i data-on={n >= 2} /><i data-on={n >= 3} />
    </span>
  )
}

export function WorkoutStyles() {
  return <style>{WK_CSS}</style>
}

// NOTE: no backticks inside this CSS.
const WK_CSS = `
.ps-page.wk { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.wk { max-width: none; }
@media (min-width: 1920px) {
  .ps-page.wk { max-width: 1680px !important; margin: 0 auto !important; }
}
.wk { --wk-line: var(--separator); --wk-soft: #f5f6f9; }

/* Breadcrumb */
.wk-crumbs { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-tertiary); margin-bottom: 14px; min-width: 0; }
.wk-crumbs a { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); text-decoration: none; font-weight: 550; }
.wk-crumbs b { color: var(--text-primary); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Header */
.wk-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
.wk-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.wk-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; flex-shrink: 0; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); }
.wk-title-icon--ex { }
.wk-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.wk-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.wk-kpis { display: flex; gap: 8px; flex: 1; justify-content: flex-end; flex-wrap: wrap; }
.wk-kpi { display: flex; align-items: center; gap: 9px; height: 46px; padding: 0 12px 0 8px; border-radius: 12px; background: var(--surface, #fff); border: 1px solid var(--wk-line); color: var(--text-primary); }
.wk-kpi-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
.wk-kpi div { display: flex; flex-direction: column; line-height: 1.15; }
.wk-kpi small { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); white-space: nowrap; }
.wk-kpi b { font-size: 16px; font-weight: 740; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.wk-tone-purple, .wk-tone-green, .wk-tone-blue, .wk-tone-amber, .wk-tone-teal, .wk-tone-red { background: var(--accent-dim, #e8f1ff); color: var(--accent, #0a66d6); }
.wk-actions { display: flex; gap: 8px; }
.wk-actions .ps-btn { height: 42px; border-radius: 12px; }

/* Toolbar */
.wk-toolbar { background: var(--surface, #fff); border: 1px solid var(--wk-line); border-radius: 16px; padding: 10px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px; position: relative; overflow: hidden; color: var(--text-primary); }
.wk-toolbar::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.wk-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wk-seg { display: flex; padding: 3px; border-radius: 11px; background: var(--surface-2, #f2f3f6); border: 1px solid var(--wk-line); }
.wk-seg button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.wk-seg button span { font-size: 11.5px; font-weight: 700; color: var(--text-tertiary); }
.wk-seg button[aria-selected="true"], .wk-seg button[aria-pressed="true"] { background: var(--surface, #fff); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.wk-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 200px; }
.wk-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.wk-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--wk-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; background: var(--surface-2, #fff); color: var(--text-primary); }
.wk-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.wk-select { height: 38px; padding: 0 30px 0 12px; border: 1px solid var(--wk-line); border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600; background: var(--surface-2, #fff); color: var(--text-primary); }
.wk-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 1px; }
.wk-chips::-webkit-scrollbar { display: none; }
.wk-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; border: 1.5px solid var(--wk-line); background: var(--surface-2, #fff); font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; transition: all 130ms ease; }
.wk-chip:hover { border-color: var(--border-mid, #c4c8d0); color: var(--text-primary); }
.wk-chip i { width: 8px; height: 8px; border-radius: 50%; }
.wk-chip em { font-style: normal; font-size: 11.5px; font-weight: 700; opacity: 0.6; }
.wk-chip[aria-pressed="true"] { color: #fff; border-color: transparent; background: var(--accent, #0a66d6); }
.wk-chip[aria-pressed="true"] i { background: #fff !important; }
.wk-chip[aria-pressed="true"] em { opacity: 0.85; }

/* Difficulty bars */
.wk-diff { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
.wk-diff i { width: 4px; border-radius: 2px; background: currentColor; opacity: 0.25; }
.wk-diff i:nth-child(1) { height: 5px; } .wk-diff i:nth-child(2) { height: 8px; } .wk-diff i:nth-child(3) { height: 12px; }
.wk-diff i[data-on="true"] { opacity: 1; }

/* Empty */
.wk-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 52px 20px; background: var(--surface, #fff); border: 1px solid var(--wk-line); border-radius: 18px; color: var(--text-primary); }
.wk-empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--wk-soft); color: var(--text-tertiary); margin-bottom: 4px; }
.wk-empty strong { font-size: 15.5px; }
.wk-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); max-width: 340px; }

@media (max-width: 1100px) {
  .wk-kpis { order: 3; flex-basis: 100%; justify-content: flex-start; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
  .wk-kpi { flex: 0 0 auto; }
  .wk-actions { margin-left: auto; }
}
@media (max-width: 760px) {
  .ps-page.wk { padding: 10px 10px 24px !important; }
  .wk-head { gap: 10px; }
  .wk-title h1 { font-size: 22px; }
  .wk-actions { width: 100%; order: 4; }
  .wk-actions .ps-btn { flex: 1; justify-content: center; }
  .wk-search { min-width: 0; flex-basis: 100%; }
  .wk-search input { font-size: 16px; }
  .wk-toolbar { border-radius: 14px; }
}
/* Exercise thumbnails: always a small square, never the full-size photo */
.wk .db-exrow-thumb { width: 44px !important; height: 44px !important; flex: 0 0 44px; border-radius: 11px; overflow: hidden; display: grid; place-items: center; background: var(--wk-soft); color: var(--text-tertiary); }
.wk .db-exrow-thumb img { width: 100% !important; height: 100% !important; object-fit: cover; display: block; }
.wk .db-mealrow-head { align-items: center; }
/* Expanded exercise media stays a sensible size */
.wk .db-meal-body img, .wk .db-meal-body video { max-height: 260px; object-fit: cover; }
.wk .db-meal-body > div:first-child { max-width: 640px; }

/* Workout day tabs: proper sizing, styling and complete dark mode support */
.wk .db-day-tabs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 16px;
  margin: 0 -2px 6px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.wk .db-day-tabs::-webkit-scrollbar { display: none; }

.wk .db-day-tab {
  position: relative;
  flex-shrink: 0;
  min-width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 10px 16px;
  border-radius: 14px;
  background: var(--surface, #fff);
  border: 1px solid var(--wk-line, var(--separator));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  font: inherit;
  text-align: center;
  transition: all 160ms ease;
}
.wk .db-day-tab:hover {
  background: var(--surface-2, #f5f6f9);
  border-color: var(--border-mid, #cbd0d8);
  transform: translateY(-1px);
}
.wk .db-day-tab:active {
  transform: scale(0.97);
}
.wk .db-day-tab .db-day-tab-name {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  transition: color 150ms ease;
}
.wk .db-day-tab .db-day-tab-label {
  font-size: 14px;
  font-weight: 650;
  color: var(--text-primary);
  white-space: nowrap;
  transition: color 150ms ease;
}

/* Selected day tab */
.wk .db-day-tab[aria-pressed="true"] {
  background: var(--accent, #0a66d6) !important;
  border-color: var(--accent, #0a66d6) !important;
  box-shadow: 0 4px 14px -3px rgba(10, 102, 214, 0.45) !important;
}
.wk .db-day-tab[aria-pressed="true"] .db-day-tab-name {
  color: rgba(255, 255, 255, 0.85) !important;
  opacity: 1;
}
.wk .db-day-tab[aria-pressed="true"] .db-day-tab-label {
  color: #ffffff !important;
  font-weight: 700;
}

/* Header: title and buttons on one row, stat chips as an even row underneath */
.wk-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; }
.wk-kpis { grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; justify-content: stretch; overflow: visible; }
.wk-kpi { min-width: 0; }
.wk-actions { grid-column: 2; grid-row: 1; justify-content: flex-end; margin-left: 0; }
@media (max-width: 760px) {
  .wk-head { grid-template-columns: minmax(0, 1fr); }
  .wk-actions { grid-column: 1; grid-row: 3; width: 100%; }
  .wk-kpis { display: flex; overflow-x: auto; scrollbar-width: none; }
  .wk-kpi { flex: 0 0 auto; }
}

html[data-theme="dark"] .wk, html.dark .wk {
  --wk-soft: var(--surface-2);
}
html[data-theme="dark"] .wk-toolbar, html.dark .wk-toolbar {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wk-kpi, html.dark .wk-kpi {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wk-empty, html.dark .wk-empty {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wk-seg, html.dark .wk-seg {
  background: var(--surface-2) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wk-seg button[aria-selected="true"],
html[data-theme="dark"] .wk-seg button[aria-pressed="true"],
html.dark .wk-seg button[aria-selected="true"],
html.dark .wk-seg button[aria-pressed="true"] {
  background: var(--surface-3) !important;
  color: #fff !important;
}
html[data-theme="dark"] .wk .db-day-tab,
html.dark .wk .db-day-tab {
  background: var(--surface) !important;
  border-color: var(--border) !important;
  color: var(--text-secondary) !important;
  box-shadow: none !important;
}
html[data-theme="dark"] .wk .db-day-tab:hover,
html.dark .wk .db-day-tab:hover {
  background: var(--surface-2) !important;
  border-color: var(--border-mid, rgba(255, 255, 255, 0.2)) !important;
}
html[data-theme="dark"] .wk .db-day-tab .db-day-tab-name,
html.dark .wk .db-day-tab .db-day-tab-name {
  color: var(--text-tertiary) !important;
}
html[data-theme="dark"] .wk .db-day-tab .db-day-tab-label,
html.dark .wk .db-day-tab .db-day-tab-label {
  color: var(--text-primary) !important;
}
html[data-theme="dark"] .wk .db-day-tab[aria-pressed="true"],
html.dark .wk .db-day-tab[aria-pressed="true"] {
  background: var(--accent, #0a84ff) !important;
  border-color: var(--accent, #0a84ff) !important;
  box-shadow: 0 4px 16px -2px rgba(10, 132, 255, 0.55) !important;
}
html[data-theme="dark"] .wk .db-day-tab[aria-pressed="true"] .db-day-tab-name,
html.dark .wk .db-day-tab[aria-pressed="true"] .db-day-tab-name {
  color: rgba(255, 255, 255, 0.85) !important;
}
html[data-theme="dark"] .wk .db-day-tab[aria-pressed="true"] .db-day-tab-label,
html.dark .wk .db-day-tab[aria-pressed="true"] .db-day-tab-label {
  color: #ffffff !important;
}
html[data-theme="dark"] .wk-search input,
html[data-theme="dark"] .wk-select,
html.dark .wk-search input,
html.dark .wk-select {
  background: var(--surface-2) !important;
  border-color: var(--border) !important;
  color: var(--text-primary) !important;
}
`;
