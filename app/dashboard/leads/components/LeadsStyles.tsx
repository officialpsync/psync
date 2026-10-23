"use client";
// app/dashboard/leads/components/LeadsStyles.tsx
// Styles for the Zoho-style leads list (zl-*) and lead page (zd-*).
// NOTE: never put a backtick inside CSS below, not even in a comment. It ends the string.

import { STATUS_META, type LeadStatus } from "../lib";

export function StatusPill({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className="zl-pill" style={{ background: m.bg, color: m.color }}>
      <span className="zl-dot" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

export function LeadsStyles() {
  return <style>{CSS}</style>;
}

const CSS = `
/* Full width: the dashboard layout caps page width; lift that cap on the ancestors of these two pages only. */
:has(> .zl-page), :has(> .zd-page), :has(> * > .zl-page), :has(> * > .zd-page) { max-width: none !important; }
.zl-page, .zd-page { width: 100%; }
.zl-page { padding: 14px 18px 24px; min-width: 0; font-size: 13px; color: var(--text-primary); }
.zl-muted { color: var(--text-tertiary); }

/* Top bar */
.zl-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.zl-title { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.zl-title h1 { font-size: 18px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
.zl-title span { font-size: 12.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zl-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

/* Buttons */
.zl-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 7px; border: 1px solid var(--separator); background: #fff; font: inherit; font-size: 13px; font-weight: 550; color: var(--text-primary); cursor: pointer; white-space: nowrap; text-decoration: none; }
.zl-btn:hover { background: #f6f7f9; }
.zl-btn:disabled { opacity: 0.5; cursor: default; }
.zl-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.zl-btn--primary:hover { background: var(--accent-strong, var(--accent)); }
.zl-btn--danger { color: var(--red); }
.zl-btn--sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.zl-tbtn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 7px; border: 1px solid transparent; background: transparent; font: inherit; font-size: 13px; font-weight: 550; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.zl-tbtn:hover { background: #f1f2f5; color: var(--text-primary); }
.zl-tbtn[data-on="true"] { background: var(--accent-dim); color: var(--accent); }
.zl-ibtn { width: 28px; height: 28px; display: inline-grid; place-items: center; border-radius: 6px; border: none; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.zl-ibtn:hover { background: #f1f2f5; color: var(--text-primary); }
.zl-ibtn:disabled { opacity: 0.35; cursor: default; }

/* Inputs */
.zl-in { height: 30px; width: 100%; padding: 0 8px; border: 1px solid var(--separator); border-radius: 6px; background: #fff; font: inherit; font-size: 12.5px; color: var(--text-primary); outline: none; }
.zl-in:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
textarea.zl-in { height: auto; padding: 6px 8px; resize: vertical; }
.zl-search { position: relative; display: flex; align-items: center; }
.zl-search > svg { position: absolute; left: 9px; color: var(--text-tertiary); pointer-events: none; }
.zl-search input { height: 30px; width: 240px; padding: 0 28px 0 30px; border: 1px solid var(--separator); border-radius: 7px; background: #fff; font: inherit; font-size: 13px; color: var(--text-primary); outline: none; }
.zl-search input:focus { border-color: var(--accent); }
.zl-search--block input { width: 100%; }
.zl-search-x { position: absolute; right: 4px; width: 22px; height: 22px; display: grid; place-items: center; border: none; border-radius: 50%; background: #eceef2; color: var(--text-secondary); cursor: pointer; }

/* Toolbar + body frame */
.zl-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; background: #fff; border: 1px solid var(--separator); border-bottom: none; border-radius: 10px 10px 0 0; min-height: 44px; }
.zl-toolbar-sep { width: 1px; height: 20px; background: var(--separator); margin: 0 4px; }
.zl-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 6px 0 10px; border-radius: 13px; background: var(--accent-dim); color: var(--accent); font-size: 12.5px; font-weight: 600; }
.zl-chip button { border: none; background: none; color: inherit; cursor: pointer; display: grid; place-items: center; padding: 2px; }
.zl-bulk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.zl-bulk strong { font-size: 13px; }
.zl-bulk select { height: 28px; border: 1px solid var(--separator); border-radius: 6px; background: #fff; font: inherit; font-size: 12.5px; padding: 0 6px; }

.zl-body { display: grid; grid-template-columns: 252px minmax(0, 1fr); border: 1px solid var(--separator); border-radius: 0 0 10px 10px; background: #fff; height: calc(100vh - 168px); min-height: 440px; overflow: hidden; }
.zl-body[data-panel="false"] { grid-template-columns: minmax(0, 1fr); }
.zl-body[data-panel="false"] .zl-panel { display: none; }

/* Filter panel */
.zl-panel { border-right: 1px solid var(--separator); display: flex; flex-direction: column; min-height: 0; background: #fbfbfc; }
.zl-panel-scroll { flex: 1; overflow-y: auto; padding: 8px 0 12px; }
.zl-psec { padding: 2px 12px 8px; }
.zl-psec + .zl-psec { border-top: 1px solid var(--separator); padding-top: 8px; }
.zl-psec-h { display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--text-primary); padding: 6px 0; cursor: pointer; text-align: left; }
.zl-psec-label { font-size: 13px; font-weight: 650; padding: 6px 0 8px; }
.zl-badge { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 5px; border: 1px solid var(--separator); background: #fff; color: var(--text-tertiary); font-variant-numeric: tabular-nums; font-weight: 600; }
.zl-sf { display: flex; align-items: center; gap: 6px; padding: 5px 6px 5px 8px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); }
.zl-sf:hover { background: #f0f2f6; }
.zl-sf[data-on="true"] { background: var(--accent-dim); color: var(--accent); font-weight: 600; }
.zl-sf-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zl-sf-x { width: 20px; height: 20px; border: none; background: none; border-radius: 4px; color: var(--text-tertiary); cursor: pointer; display: grid; place-items: center; opacity: 0; }
.zl-sf:hover .zl-sf-x { opacity: 1; }
.zl-sf-x:hover { background: #e6e8ee; color: var(--red); }
.zl-hint { font-size: 12px; color: var(--text-tertiary); padding: 2px 8px 6px; line-height: 1.45; }
.zl-nomatch { font-size: 12px; color: var(--text-tertiary); text-align: center; padding: 6px 0; }
.zl-check { display: flex; align-items: center; gap: 8px; padding: 4px 2px; cursor: pointer; color: var(--text-secondary); font-size: 13px; }
.zl-check:hover { color: var(--text-primary); }
.zl-check input { accent-color: var(--accent); width: 14px; height: 14px; flex-shrink: 0; }
.zl-cond { margin: 2px 0 10px 22px; display: flex; flex-direction: column; gap: 6px; }
.zl-cond select.zl-in { padding: 0 6px; }
.zl-opts { display: flex; flex-direction: column; gap: 1px; max-height: 156px; overflow-y: auto; border: 1px solid var(--separator); border-radius: 6px; padding: 4px 6px; background: #fff; }
.zl-opts .zl-check { padding: 3px 0; font-size: 12.5px; }
.zl-row2 { display: flex; gap: 6px; align-items: center; }
.zl-pfoot { border-top: 1px solid var(--separator); padding: 10px 12px; display: flex; gap: 6px; flex-wrap: wrap; background: #fff; }
.zl-pfoot .zl-in { flex: 1 1 100%; }

/* Table */
.zl-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
.zl-tablewrap { flex: 1; overflow: auto; min-height: 0; }
table.zl-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 13px; }
.zl-table th { position: sticky; top: 0; z-index: 2; background: #f6f7f9; text-align: left; font-weight: 600; color: var(--text-secondary); padding: 0 12px; height: 36px; border-bottom: 1px solid var(--separator); border-right: 1px solid #eceef2; white-space: nowrap; }
.zl-table td { padding: 0 12px; height: 38px; border-bottom: 1px solid #eef0f3; white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); background: #fff; }
.zl-table tbody tr { cursor: pointer; }
.zl-table tbody tr:hover td { background: #f5f8ff; }
.zl-table tbody tr[data-sel="true"] td { background: var(--accent-dim); }
.zl-table .zl-cbcell { width: 40px; min-width: 40px; padding: 0; text-align: center; }
.zl-table .zl-cbcell input { accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; vertical-align: middle; }
.zl-table .zl-setcell { width: 44px; min-width: 44px; padding: 0 6px; text-align: center; border-right: none; }
.zl-th-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; font: inherit; color: inherit; cursor: pointer; padding: 0; }
.zl-th-btn:hover { color: var(--text-primary); }
.zl-name { color: var(--accent); font-weight: 550; }
.zl-table tbody tr:hover .zl-name { text-decoration: underline; }
.zl-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.zl-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.zl-empty { padding: 60px 20px; text-align: center; color: var(--text-tertiary); }
.zl-empty strong { display: block; color: var(--text-primary); font-size: 14px; margin-bottom: 4px; }
.zl-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--separator); font-size: 12.5px; color: var(--text-secondary); background: #fff; flex-wrap: wrap; }
.zl-foot select { height: 26px; border: 1px solid var(--separator); border-radius: 6px; background: #fff; font: inherit; font-size: 12.5px; padding: 0 4px; }
.zl-pager { display: flex; align-items: center; gap: 6px; }

/* Popovers */
.zl-pop { position: absolute; z-index: 30; width: 280px; background: #fff; border: 1px solid var(--separator); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.14); padding: 10px; }
.zl-pop-title { font-size: 11.5px; font-weight: 650; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.4px; padding: 2px 4px 8px; }
.zl-pop-list { display: flex; flex-direction: column; gap: 1px; max-height: 340px; overflow-y: auto; margin-top: 6px; }
.zl-pop-row { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; }
.zl-pop-row[data-on="true"] { background: #f4f6fa; }
.zl-pop-row label { flex: 1; display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; min-width: 0; }
.zl-pop-row input { accent-color: var(--accent); }
.zl-pop-foot { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--separator); }

/* ── Lead page ── */
.zd-page { padding: 14px 18px 24px; min-width: 0; font-size: 13px; color: var(--text-primary); }
.zd-shell { background: #fff; border: 1px solid var(--separator); border-radius: 10px; overflow: clip; }
.zd-head { border-radius: 10px 10px 0 0; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--separator); flex-wrap: wrap; background: #fff; }
.zd-avatar { width: 44px; height: 44px; border-radius: 8px; background: #eef0f4; display: grid; place-items: center; font-size: 18px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0; }
.zd-name { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.2; }
.zd-meta { display: flex; align-items: center; gap: 10px; margin-top: 4px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-secondary); }
.zd-overdue { display: inline-flex; padding: 2px 8px; border-radius: 10px; background: var(--red-dim); color: var(--red); font-size: 12px; font-weight: 600; }
.zd-actions { margin-left: auto; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; position: relative; }
.zd-layout { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: calc(100vh - 170px); }
.zd-rel { border-right: 1px solid var(--separator); padding: 14px 10px; background: #fff; }
.zd-rel-inner { position: sticky; top: 12px; }
.zd-rel h3 { font-size: 13px; font-weight: 650; margin: 0 0 6px 8px; }
.zd-rel-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 8px; border: none; background: none; border-radius: 6px; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; text-align: left; }
.zd-rel-item:hover { background: #f1f3f7; color: var(--text-primary); }
.zd-rel-link { color: var(--accent); }
.zd-main { background: #f3f4f7; padding: 12px 16px 48px; min-width: 0; }
.zd-tabs { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--separator); border-radius: 20px; background: #fff; margin-bottom: 12px; }
.zd-tab { padding: 5px 18px; border-radius: 16px; border: none; background: none; font: inherit; font-size: 13px; font-weight: 550; color: var(--text-secondary); cursor: pointer; }
.zd-tab[data-on="true"] { background: var(--accent-dim); color: var(--accent); font-weight: 650; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent); }
.zd-card { background: #fff; border: 1px solid var(--separator); border-radius: 8px; margin-bottom: 12px; position: relative; scroll-margin-top: 12px; }
.zd-card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--separator); font-size: 14px; font-weight: 650; }
.zd-card-h small { font-size: 12px; font-weight: 500; color: var(--text-tertiary); margin-left: 6px; }
.zd-card-b { padding: 12px 16px; }
.zd-toggle { background: none; border: none; font: inherit; font-size: 14px; font-weight: 650; color: var(--text-primary); cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 4px; }
.zd-sec-title { font-size: 13.5px; font-weight: 650; margin: 8px 0 6px; }
.zd-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); column-gap: 32px; }
.zd-grid--one { grid-template-columns: minmax(0, 620px); }
.zd-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 14px; align-items: start; padding: 3px 0; }
.zd-row--wide { grid-column: 1 / -1; }
.zd-label { color: var(--text-tertiary); text-align: right; padding-top: 8px; line-height: 1.3; }
.zd-val { min-height: 32px; display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; border: 1px solid transparent; color: var(--text-primary); word-break: break-word; white-space: pre-line; line-height: 1.45; }
.zd-val[data-editable="true"] { cursor: pointer; }
.zd-val[data-editable="true"]:hover { border-color: var(--separator); background: #fafbfc; }
.zd-pen { margin-left: auto; color: var(--text-tertiary); opacity: 0; flex-shrink: 0; }
.zd-val:hover .zd-pen { opacity: 1; }
.zd-empty { color: var(--text-tertiary); }
.zd-link { color: var(--accent); text-decoration: none; }
.zd-link:hover { text-decoration: underline; }
.zd-call { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #1fa855; color: #fff; }
.zd-edit { display: flex; gap: 6px; align-items: flex-start; width: 100%; padding: 2px 0; }
.zd-edit .zl-in { height: 32px; font-size: 13px; }
.zd-edit textarea.zl-in { height: auto; }
.zd-ibtn { width: 32px; height: 32px; flex-shrink: 0; display: grid; place-items: center; border-radius: 6px; border: 1px solid var(--separator); background: #fff; color: var(--text-secondary); cursor: pointer; }
.zd-ibtn--ok { background: var(--accent); border-color: var(--accent); color: #fff; }
.zd-err { color: var(--red); font-size: 12px; margin-top: 4px; }
.zd-gear { position: absolute; top: 8px; right: 8px; }
.zd-li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #eef0f3; }
.zd-li:last-child { border-bottom: none; }
.zd-li-main { flex: 1; min-width: 0; }
.zd-li-title { font-size: 13.5px; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.zd-li-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; display: flex; gap: 10px; flex-wrap: wrap; }
.zd-li-text { font-size: 13px; color: var(--text-secondary); margin-top: 3px; white-space: pre-line; }
.zd-circle { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--text-tertiary); background: #fff; cursor: pointer; flex-shrink: 0; margin-top: 1px; }
.zd-circle:hover { border-color: var(--green); background: var(--green-dim); }
.zd-tag-red { background: var(--red-dim); color: var(--red); padding: 1px 8px; border-radius: 10px; font-size: 11.5px; font-weight: 600; }
.zd-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.zd-chip { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 11px; border-radius: 14px; border: 1px solid var(--separator); background: #fff; font: inherit; font-size: 12.5px; color: var(--text-secondary); cursor: pointer; }
.zd-chip[data-on="true"] { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); font-weight: 600; }
.zd-none { padding: 18px 0; text-align: center; color: var(--text-tertiary); font-size: 12.5px; }
.zd-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; min-width: 170px; background: #fff; border: 1px solid var(--separator); border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.14); padding: 4px; }
.zd-menu button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text-primary); text-align: left; }
.zd-menu button:hover { background: #f3f4f7; }

/* Timeline */
.zd-tl-day { display: inline-block; font-size: 12px; padding: 3px 14px; border: 1px solid var(--separator); border-radius: 4px; background: #f6f7f9; margin: 14px 0 6px 40px; position: relative; z-index: 1; }
.zd-tl { position: relative; }
.zd-tl::before { content: ""; position: absolute; left: 97px; top: 10px; bottom: 10px; width: 1px; background: var(--separator); }
.zd-tl-item { display: grid; grid-template-columns: 72px 34px minmax(0, 1fr); gap: 10px; align-items: start; padding: 6px 0; }
.zd-tl-time { font-size: 12px; color: var(--text-tertiary); text-align: right; padding-top: 8px; white-space: nowrap; }
.zd-tl-icon { width: 32px; height: 32px; border-radius: 50%; border: 1px solid #c9d6f2; background: #fff; display: grid; place-items: center; color: var(--accent); position: relative; z-index: 1; }
.zd-tl-text { font-size: 13px; padding-top: 4px; line-height: 1.45; word-break: break-word; }
.zd-tl-by { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

@media (max-width: 1000px) {
  .zl-body { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 0; }
  .zl-body[data-panel="true"] .zl-panel { border-right: none; border-bottom: 1px solid var(--separator); max-height: 60vh; }
  .zl-body[data-panel="true"] { grid-template-rows: auto minmax(0, 1fr); }
  .zl-tablewrap { max-height: 70vh; }
  .zl-search input { width: 180px; }
  .zd-layout { grid-template-columns: minmax(0, 1fr); }
  .zd-rel { display: none; }
  .zd-grid { grid-template-columns: minmax(0, 1fr); }
  .zd-row { grid-template-columns: 110px minmax(0, 1fr); }
  .zd-main { padding: 10px 10px 40px; }
  .zd-page { padding: 10px 10px 20px; }
}
@media (max-width: 640px) { .zl-page, .zd-page { padding: 10px 10px 20px; } }
/* Equal 18px gutter on all four sides (shared with Members). On desktop the list fills the screen exactly. */
.zl-page, .zd-page { padding: 18px !important; }
@media (min-width: 900px) {
  .zl-page { height: 100dvh; display: flex; flex-direction: column; }
  .zl-page > .zl-body { flex: 1; height: auto; min-height: 0; }
}
@media (max-width: 640px) { .zl-page, .zd-page { padding: 10px !important; } }
`;
