// ═══════════════════════════════════════════════════════════════
//  gridLab-ui.js — UI helpers for the Grid Lab modal (Step 3B)
//  Pure / parameterised helpers that can be tested without a real DOM.
//  No document.querySelector inside — callers pass refs and read fns.
// ═══════════════════════════════════════════════════════════════

import {
  gbDepositClamp,
  gridRiskAnchorIdx,
  buildGridRiskRows,
  buildGridFavorableRows,
  loadGridLabPrefs,
  saveGridLabPrefs,
  captureGbLabViewport,
  applyGbViewportFreeze,
  gridRiskMetaForPrice,
  fmtGridLineTitle,
  gbWantBarsFromVisible,
  compileGridLabState,
} from './gridLab.js';

const MAX_UNDO = 50;

/**
 * Snapshot current low/high bounds from a parsed object into the modal's
 * undo stack. Pure: caller provides `readLow()` / `readHigh()` callbacks.
 * Returns true if a snapshot was pushed.
 */
export function pushBoundsUndo(modal, readLow, readHigh, { limit = MAX_UNDO } = {}) {
  if (!modal) return false;
  const lo = parseFloat(readLow());
  const hi = parseFloat(readHigh());
  if (!isFinite(lo) || !isFinite(hi)) return false;
  if (!modal._gbBoundsUndo) modal._gbBoundsUndo = [];
  if (!modal._gbBoundsRedo) modal._gbBoundsRedo = [];
  const u = modal._gbBoundsUndo;
  const last = u.length ? u[u.length - 1] : null;
  if (last && last.lo === lo && last.hi === hi) return false;
  u.push({ lo, hi });
  modal._gbBoundsRedo.length = 0;
  if (u.length > limit) u.shift();
  return true;
}

/**
 * Pop one entry from the undo stack. Returns:
 *   { prev } — when an undo was applied. Caller writes `prev` to the form,
 *     then pushes the previously-shown value to the redo stack via
 *     pushRedoFromCurrent.
 *   null — when the undo stack is empty.
 *
 * Pure: never touches DOM. State lives on the modal object.
 */
export function undoBounds(modal) {
  if (!modal) return null;
  const u = modal._gbBoundsUndo || [];
  if (!u.length) return null;
  const prev = u.pop();
  return { prev };
}

/**
 * Pop one entry from the redo stack. Returns:
 *   { next } — when a redo was applied. Caller writes `next` to the form,
 *     then pushes the previously-shown value to the undo stack via
 *     pushUndoFromCurrent.
 *   null — when the redo stack is empty.
 */
export function redoBounds(modal) {
  if (!modal) return null;
  const r = modal._gbBoundsRedo || [];
  if (!r.length) return null;
  const next = r.pop();
  return { next };
}

/**
 * Capture the current low/high values into the redo stack. Used by undo()
 * right before applying the popped value.
 */
export function pushRedoFromCurrent(modal, currentLo, currentHi) {
  if (!modal) return false;
  if (!modal._gbBoundsRedo) modal._gbBoundsRedo = [];
  if (isFinite(currentLo) && isFinite(currentHi)) {
    modal._gbBoundsRedo.push({ lo: currentLo, hi: currentHi });
    return true;
  }
  return false;
}

/**
 * Capture the current low/high values into the undo stack. Used by redo()
 * right before applying the popped value.
 */
export function pushUndoFromCurrent(modal, currentLo, currentHi) {
  if (!modal) return false;
  if (!modal._gbBoundsUndo) modal._gbBoundsUndo = [];
  if (isFinite(currentLo) && isFinite(currentHi)) {
    modal._gbBoundsUndo.push({ lo: currentLo, hi: currentHi });
    if (modal._gbBoundsUndo.length > MAX_UNDO) modal._gbBoundsUndo.shift();
    return true;
  }
  return false;
}

/**
 * Update symbolBounds[sym].lower / .upper from an undo/redo action.
 * Mutates `gbPrefs` and returns it. Does NOT persist; caller decides when
 * to call saveGridLabPrefs.
 */
export function applyBoundsToPrefs(gbPrefs, sym, lo, hi) {
  if (!sym) return gbPrefs;
  if (!gbPrefs.symbolBounds || typeof gbPrefs.symbolBounds !== 'object') gbPrefs.symbolBounds = {};
  gbPrefs.symbolBounds[sym] = { ...(gbPrefs.symbolBounds[sym] || {}), lower: lo, upper: hi };
  return gbPrefs;
}

/**
 * Parse the current Grid Lab form into a config object for compileGridLabState.
 * `fields` is an object whose values are raw strings (or numbers) from the DOM:
 *   { sym, tf, levels, leverage, deposit, lower, upper, gridMode }
 *
 * `mergedCand` is reused between syncs to avoid re-fetching. `wantBars` is
 * the computed request size (see gbWantBarsFromVisible).
 *
 * Returns a pure cfg with clamped values. No DOM access.
 */
export function readGridLabInputs(fields, gbPrefs, wantBars, mergedCand) {
  const sym = String(fields.sym || '').toUpperCase().trim();
  const tf = String(fields.tf || '5m');
  const rawLo = parseFloat(fields.lower);
  const rawHi = parseFloat(fields.upper);
  const ap = gbPrefs?.symbolBounds?.[sym]?.anchorPrice;
  const anchor = isFinite(+ap) ? +ap : null;
  return {
    sym,
    tf,
    levels: Math.max(3, Math.min(60, +fields.levels || 12)),
    lower: isFinite(rawLo) ? rawLo : 0,
    upper: isFinite(rawHi) ? rawHi : 0,
    leverage: Math.max(1, Math.min(25, +fields.leverage || 3)),
    deposit: gbDepositClamp(fields.deposit, 500),
    gridMode: String(fields.gridMode || 'neutral'),
    wantBars: Math.max(120, Math.min(1400, wantBars | 0)),
    candles: mergedCand || [],
    anchorPrice: anchor,
    gridLevels: gbPrefs?.symbolBounds?.[sym]?.gridLevels || null,
  };
}

/**
 * Build the candidate list of symbols for the "open in Grid Lab" selector.
 * Pure: takes the sym list, metric store, and a scoring function.
 */
export function getGridSelectorRows(syms, mx, calcScore, { limit = 20 } = {}) {
  if (!Array.isArray(syms) || !mx || typeof calcScore !== 'function') return [];
  const rows = [];
  for (const sym of syms) {
    const m = mx[sym];
    if (!m) continue;
    const score = calcScore(m);
    if (score == null || !isFinite(score)) continue;
    rows.push({
      sym,
      score,
      range24: m.r24 || 0,
      natr: m.na14 || 0,
      ch24: m.ch24 || 0,
      vol24: m.vol24 || 0,
      trd24: m.trd24 || 0,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, Math.max(3, Math.min(60, limit | 0)));
}

// Re-exports for convenience — same behaviour as direct gridLab.js imports.
export { loadGridLabPrefs, saveGridLabPrefs };

// ═══════════════════════════════════════════════════════════════
//  Render helpers — thin wrappers that produce HTML for the modal.
//  These touch DOM nodes passed in by the caller (no document.querySelector),
//  so they can be exercised in JSDOM or with stubbed elements.
// ═══════════════════════════════════════════════════════════════

const TONE_LOSS_UP = { bg: 'rgba(239,68,68,.08)', bd: 'rgba(239,68,68,.2)', fill: 'rgba(239,68,68,.45)', tx: '#fca5a5' };
const TONE_LOSS_DN = { bg: 'rgba(34,197,94,.08)', bd: 'rgba(34,197,94,.2)', fill: 'rgba(34,197,94,.45)', tx: '#86efac' };
const TONE_FAV     = { bg: 'rgba(59,130,246,.1)', bd: 'rgba(59,130,246,.28)', fill: 'rgba(59,130,246,.5)', tx: '#93c5fd' };

/** Format signed USDT / pct values for the risk bars. */
function fmtSigned(v, fn) {
  return `${v >= 0 ? '+' : ''}${fn(v, 2)}`;
}

/** Render an array of risk rows (one bar each) into HTML. Pure. */
export function renderRiskBars(list, opts, ctx) {
  const { fieldUsdt, fieldPct, fieldPrice, tone, numRev = false } = opts;
  const { maxAbs, fn, fmtPrice } = ctx;
  if (!list || !list.length) {
    return '<div style="font-size:9px;color:var(--text3);padding:8px 0;text-align:center">Нет уровней</div>';
  }
  return list.map((r, idx) => {
    const val = r[fieldUsdt];
    const pct = r[fieldPct];
    const px = r[fieldPrice];
    const w = Math.max(2, Math.round((Math.abs(val) / maxAbs) * 100));
    const pxTxt = px != null && isFinite(px) ? fmtPrice(px) : '—';
    const num = numRev ? list.length - idx : idx + 1;
    return `<div style="display:flex;align-items:center;gap:6px;height:16px">
      <div style="width:26px;text-align:right;color:var(--text2);font-size:9px">#${num}</div>
      <div style="position:relative;flex:1;height:100%;background:${tone.bg};border:1px solid ${tone.bd};border-radius:4px;overflow:hidden">
        <span style="position:absolute;left:0;top:0;bottom:0;width:${w}%;background:${tone.fill}"></span>
        <span style="position:relative;z-index:1;padding-left:4px;font-size:8.5px;color:${tone.tx}">${fmtSigned(val, fn)} USDT · ${fmtSigned(pct, fn)}% · ${pxTxt}</span>
      </div>
    </div>`;
  }).join('');
}

/** Render favorable rows (different shape — uses r.usdt, r.pct, r.price). */
export function renderFavorableBars(list, opts, ctx) {
  const { numRev = false, tone } = opts;
  const { maxAbs, fn, fmtPrice } = ctx;
  if (!list || !list.length) {
    return '<div style="font-size:9px;color:var(--text3);padding:8px 0;text-align:center">Нет уровней</div>';
  }
  return list.map((r, idx) => {
    const val = r.usdt;
    const pct = r.pct;
    const px = r.price;
    const w = Math.max(2, Math.round((Math.abs(val) / maxAbs) * 100));
    const pxTxt = px != null && isFinite(px) ? fmtPrice(px) : '—';
    const num = numRev ? list.length - idx : idx + 1;
    return `<div style="display:flex;align-items:center;gap:6px;height:16px">
      <div style="width:26px;text-align:right;color:var(--text2);font-size:9px">#${num}</div>
      <div style="position:relative;flex:1;height:100%;background:${tone.bg};border:1px solid ${tone.bd};border-radius:4px;overflow:hidden">
        <span style="position:absolute;left:0;top:0;bottom:0;width:${w}%;background:${tone.fill}"></span>
        <span style="position:relative;z-index:1;padding-left:4px;font-size:8.5px;color:${tone.tx}">${fmtSigned(val, fn)} USDT · ${fmtSigned(pct, fn)}% · ${pxTxt}</span>
      </div>
    </div>`;
  }).join('');
}

/**
 * Render the risk-profile panel into `host`. Mutates host.innerHTML.
 *
 * `body` is the outer modal-body node (`#gridLabBody` in the live DOM) —
 * needed for the anchor-drag handler that mutates `body._gbSuppressChartSync`
 * and `body._gbChartCtx`.
 *
 * Required deps:
 *   - fn(v, dp)         — number formatter
 *   - fmtPrice(p)       — price formatter
 *   - scheduleGridLabSync(body, gbPrefs, opts) — called when anchor changes
 *   - captureGbLabViewport(lc, cs) — viewport snapshot helper
 *   - rCanvas(handle)   — chart redraw helper (for preview line)
 *
 * `host` and `body` are DOM nodes (any element exposing .innerHTML and
 * .querySelector).
 */
export function renderGridRiskProfile(host, body, out, gbPrefs, deps) {
  const { fn, fmtPrice, scheduleGridLabSync, captureGbLabViewport, rCanvas } = deps || {};
  if (!host) return;
  if (!out || !out.ok) {
    host.innerHTML = '';
    return;
  }
  const gm = String(out.gridRiskMode || 'neutral');
  const rows = buildGridRiskRows({
    lower: out.lower, upper: out.upper, currentPrice: out.candles?.[out.candles.length - 1]?.c,
    levels: out.levels, leverage: out.leverage, deposit: out.startEq,
    gridMode: gm,
    anchorPrice: out.anchorPrice,
    gridLevels: out.gridLevels,
  });
  if (!rows.length) {
    host.innerHTML = '<div style="padding:8px;font-size:9px;color:var(--text3)">Недостаточно данных для риск-профиля.</div>';
    return;
  }
  const lastC = +out.candles?.[out.candles.length - 1]?.c;
  const riskStep = (out.upper - out.lower) / Math.max(2, out.levels | 0);
  const riskGrid = (out.gridLevels && out.gridLevels.length >= 2)
    ? out.gridLevels.slice()
    : Array.from({ length: (out.levels | 0) + 1 }, (_, i) => out.lower + i * riskStep);
  const ai = gridRiskAnchorIdx(riskGrid, lastC, riskStep, gm, out.anchorPrice);
  const anchorLbl = fmtPrice(riskGrid[ai] ?? lastC);
  const anchorPxUi = riskGrid[ai] ?? lastC;
  const distUp = (r) => Math.abs((r.upPrice ?? 0) - anchorPxUi);
  const distDn = (r) => Math.abs((r.downPrice ?? 0) - anchorPxUi);
  const shortRows = rows
    .filter((r) => r.upPrice != null)
    .sort((a, b) => distUp(b) - distUp(a) || a.step - b.step);
  const longRows = rows
    .filter((r) => r.downPrice != null)
    .sort((a, b) => distDn(a) - distDn(b) || a.step - b.step);
  const favRows = buildGridFavorableRows({
    lower: out.lower, upper: out.upper, currentPrice: lastC,
    levels: out.levels, leverage: out.leverage, deposit: out.startEq,
    gridMode: gm, anchorPrice: out.anchorPrice,
    gridLevels: out.gridLevels,
  });
  const distFavPx = (r) => Math.abs((r.price ?? 0) - anchorPxUi);
  const favSortedAsc = favRows.slice().sort((a, b) => distFavPx(a) - distFavPx(b) || a.step - b.step);
  const favSortedDesc = favRows.slice().sort((a, b) => distFavPx(b) - distFavPx(a) || a.step - b.step);
  const maxLoss = Math.max(...rows.map((r) => Math.max(Math.abs(r.downUsdt), Math.abs(r.upUsdt))), 1e-9);
  const maxAbs = Math.max(maxLoss, ...favRows.map((r) => Math.abs(r.usdt)), 1e-9);
  const ctx = { maxAbs, fn, fmtPrice };

  const autoK = gm === 'long'
    ? Math.max(0, (out.levels | 0) - ai)
    : gm === 'short'
      ? Math.max(0, ai)
      : 0;
  const modeTitle = gm === 'long' ? 'Long grid' : gm === 'short' ? 'Short grid' : 'Neutral grid';
  const modeHint = gm === 'long'
    ? `Стартовая long-позиция считается автоматически по числу верхних сеток: ${autoK}. Цена #0: ${anchorLbl}. Сверху — прибыль при росте по сетке; снизу — просадка при доборе вниз.`
    : gm === 'short'
      ? `Стартовая short-позиция считается автоматически по числу нижних сеток: ${autoK}. Цена #0: ${anchorLbl}. Сверху — убыток при росте; снизу — прибыль при падении по сетке.`
      : '#0 = первый уровень ≥ цены в neutral; симметричные сценарии вверх/вниз (как в отлаженной модели).';
  let topBlock, bottomBlock;
  if (gm === 'long') {
    topBlock = renderFavorableBars(favSortedDesc, { numRev: true, tone: TONE_FAV }, ctx);
    bottomBlock = renderRiskBars(longRows, { fieldUsdt: 'downUsdt', fieldPct: 'downPct', fieldPrice: 'downPrice', tone: TONE_LOSS_DN, numRev: false }, ctx);
  } else if (gm === 'short') {
    topBlock = renderRiskBars(shortRows, { fieldUsdt: 'upUsdt', fieldPct: 'upPct', fieldPrice: 'upPrice', tone: TONE_LOSS_UP, numRev: true }, ctx);
    bottomBlock = renderFavorableBars(favSortedAsc, { numRev: false, tone: TONE_FAV }, ctx);
  } else {
    topBlock = renderRiskBars(shortRows, { fieldUsdt: 'upUsdt', fieldPct: 'upPct', fieldPrice: 'upPrice', tone: TONE_LOSS_UP, numRev: true }, ctx);
    bottomBlock = renderRiskBars(longRows, { fieldUsdt: 'downUsdt', fieldPct: 'downPct', fieldPrice: 'downPrice', tone: TONE_LOSS_DN, numRev: false }, ctx);
  }
  host.innerHTML = `
    <div style="font-size:10px;color:#fff;margin-bottom:6px">Риск-профиль · ${modeTitle}${gm !== 'neutral' ? ` · старт: ${fn(autoK, 0)} поз.` : ''}</div>
    <div style="font-size:9px;color:var(--text3);margin-bottom:6px;line-height:1.35">${modeHint}</div>
    <div style="display:flex;flex-direction:column;height:100%;min-height:0;justify-content:center;gap:5px">
      <div style="flex:0 0 auto;max-height:42%;overflow:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px">
        ${topBlock}
      </div>
      <div data-gb-anchor-drag="1" style="display:flex;align-items:center;gap:6px;height:16px;cursor:ns-resize;flex-shrink:0" title="Потяните вверх/вниз — сменить уровень якоря #0">
        <div style="width:26px;text-align:right;color:#fdba74;font-size:9px">#0</div>
        <div style="position:relative;flex:1;height:100%;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.24);border-radius:4px;overflow:hidden">
          <span style="position:absolute;left:0;top:0;bottom:0;width:2%;background:rgba(245,158,11,.55)"></span>
          <span style="position:relative;z-index:1;padding-left:4px;font-size:8.5px;color:#fdba74;display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px">${anchorLbl} · 0.00 USDT · 0.00%<span class="gb-anchor-hint" style="font-size:8px;color:var(--text3);font-weight:400"></span></span>
        </div>
      </div>
      <div style="flex:0 0 auto;max-height:42%;overflow:auto;display:flex;flex-direction:column;gap:4px;padding-right:2px">
        ${bottomBlock}
      </div>
    </div>
    <div style="font-size:8px;color:var(--text3);margin-top:8px;line-height:1.4">Neutral: на #0 позиции нет; <b>первая</b> строка с каждой стороны — цена только что коснулась первой линии сетки (MTM ≈ 0, комиссии в модели нет). Дальше — накопленный результат по уже набранным ордерам, когда цена на уровне строки.</div>`;

  // Anchor-drag handler: vertical drag on the #0 row → set anchorPrice.
  const zRow = host.querySelector('[data-gb-anchor-drag]');
  if (zRow && gbPrefs) {
    zRow.onmousedown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const sym = String(out.symbol || '').toUpperCase().trim();
      if (!sym || !riskGrid.length) return;
      if (!body) return;
      body._gbSuppressChartSync = true;
      const startY = e.clientY;
      const startAi = ai;
      let curAi = startAi;
      const hint = zRow.querySelector('.gb-anchor-hint');
      const gctx = body._gbChartCtx;
      if (gctx?.lc && gctx?.cs) body._gbPendingViewport = captureGbLabViewport(gctx.lc, gctx.cs);
      const setPreview = (ix) => {
        const p = riskGrid[ix];
        if (gctx && p != null && isFinite(p)) {
          gctx._gbAnchorPreviewPrice = p;
          if (gctx.gbCh && rCanvas) rCanvas(gctx.gbCh);
        }
      };
      setPreview(curAi);
      const onMove = (ev) => {
        const dIdx = Math.round((startY - ev.clientY) / 14);
        const ni = Math.max(0, Math.min(riskGrid.length - 1, startAi + dIdx));
        if (ni === curAi) return;
        curAi = ni;
        setPreview(ni);
        if (hint) hint.textContent = ni === startAi ? '' : `→ ${fmtPrice(riskGrid[ni])} (#${ni})`;
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        body._gbSuppressChartSync = false;
        if (gctx) {
          gctx._gbAnchorPreviewPrice = null;
          if (gctx.gbCh && rCanvas) rCanvas(gctx.gbCh);
        }
        if (hint) hint.textContent = '';
        if (curAi !== startAi) {
          if (!gbPrefs.symbolBounds) gbPrefs.symbolBounds = {};
          gbPrefs.symbolBounds[sym] = { ...gbPrefs.symbolBounds[sym], anchorPrice: riskGrid[curAi] };
          saveGridLabPrefs(gbPrefs);
          if (gctx?.lc && gctx?.cs) body._gbPendingViewport = captureGbLabViewport(gctx.lc, gctx.cs);
          if (scheduleGridLabSync) scheduleGridLabSync(body, gbPrefs, { reuseCandles: true });
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }
}



/* ═══════════════════════════════════════════════════════════════
 *  Grid Lab sync orchestration (Step 3B.4)
 *  Async flow: read inputs → fetch candles → compile → render.
 *  Re-exported at top to avoid circular deps in main.js.
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Debounced scheduler. Avoids spamming backtest runs while user drags inputs.
 * Honours body._gbSuppressChartSync (set during drag operations).
 */
export function scheduleGridLabSync(body, gbPrefs, opt = {}) {
  if (body._gbSuppressChartSync) return;
  if (body._gridLabUiTimer) clearTimeout(body._gridLabUiTimer);
  const delay = opt.immediate ? 0 : 95;
  body._gridLabUiTimer = setTimeout(() => { void runGridLabSync(body, gbPrefs, opt); }, delay);
}

/**
 * Async orchestrator for a single Grid Lab backtest cycle.
 * Dependencies are injected (runGridLabSync calls back into this module's
 * siblings via explicit deps, no self-import).
 */
export async function runGridLabSync(body, gbPrefs, opt = {}, deps = {}) {
  const reuse = !!opt.reuseCandles;
  const lcRef = body._gbChartCtx?.lc;
  const want = reuse && lcRef
    ? gbWantBarsFromVisible(lcRef, 940)
    : Math.max(400, Math.min(1200, +(gbPrefs.global?.bars || 940)));

  // Resolve deps: caller's injected fns > local fallbacks.
  const ensureBacktestCandles = deps.ensureBacktestCandles;
  if (typeof ensureBacktestCandles !== 'function') {
    // Defer to caller via global if not injected — for backward compat.
    throw new Error('runGridLabSync: deps.ensureBacktestCandles is required');
  }
  const readGridLabInputsFn = deps.readGridLabInputsFn || readGridLabInputsUi;
  const renderPreviewFn = deps.renderPreviewFn || renderManualBacktestPreviewUi;
  const renderRiskFn = deps.renderRiskFn || renderGridRiskProfileUi;
  const fn = deps.fn || ((v, d) => String(v));
  const fmtPrice = deps.fmtPrice || ((p) => String(p));

  const fields = collectGridLabFields(body);
  const cfg = readGridLabInputsFn(fields, gbPrefs, want,
    reuse && body._gbChartCtx?.merged?.length ? body._gbChartCtx.merged : []);
  cfg.sym = String(cfg.sym || '').trim();
  if (!cfg.sym) return;
  cfg.gridMode = ['neutral', 'long', 'short'].includes(cfg.gridMode) ? cfg.gridMode : 'neutral';

  let candles = [];
  if (reuse && body._gbChartCtx?.merged?.length) {
    candles = body._gbChartCtx.merged;
  } else {
    candles = await ensureBacktestCandles(cfg.sym, cfg.tf, want);
    if (candles.length > want) candles = candles.slice(-want);
  }
  cfg.candles = candles;

  // Persist resolved settings
  gbPrefs.global.tf = cfg.tf;
  gbPrefs.global.levels = cfg.levels;
  gbPrefs.global.leverage = cfg.leverage;
  gbPrefs.global.deposit = cfg.deposit;
  gbPrefs.global.gridMode = cfg.gridMode;

  const rL = parseFloat(body.querySelector('#gbRatioLong')?.value || '');
  const rS = parseFloat(body.querySelector('#gbRatioShort')?.value || '');
  const rP = parseFloat(body.querySelector('#gbRatioStep')?.value || '');
  if (isFinite(rL)) gbPrefs.global.ratioLong = rL;
  if (isFinite(rS)) gbPrefs.global.ratioShort = rS;
  if (isFinite(rP)) gbPrefs.global.ratioStepPct = rP;

  if (!gbPrefs.symbolBounds || typeof gbPrefs.symbolBounds !== 'object') {
    gbPrefs.symbolBounds = {};
  }
  const loP = body.querySelector('#gbLow')?.value;
  const hiP = body.querySelector('#gbHigh')?.value;
  const loNv = parseFloat(loP || '');
  const hiNv = parseFloat(hiP || '');
  const prevB = gbPrefs.symbolBounds[cfg.sym] || {};
  const loCh = loP != null && String(loP).trim() !== '' && isFinite(loNv) && prevB.lower !== loNv;
  const hiCh = hiP != null && String(hiP).trim() !== '' && isFinite(hiNv) && prevB.upper !== hiNv;
  const lvlCh = prevB.levels != null && prevB.levels !== cfg.levels;
  gbPrefs.symbolBounds[cfg.sym] = {
    ...prevB,
    lower: (loP != null && String(loP).trim() !== '' && isFinite(loNv)) ? loNv : null,
    upper: (hiP != null && String(hiP).trim() !== '' && isFinite(hiNv)) ? hiNv : null,
    levels: cfg.levels,
  };
  if (loCh || hiCh || lvlCh) delete gbPrefs.symbolBounds[cfg.sym].gridLevels;
  saveGridLabPrefs(gbPrefs);

  cfg.anchorPrice = gbPrefs.symbolBounds[cfg.sym]?.anchorPrice;
  cfg.gridLevels = gbPrefs.symbolBounds[cfg.sym]?.gridLevels || null;

  const out = compileGridLabState(cfg);
  out.gridRiskMode = cfg.gridMode;

  const el = body.querySelector('#gbOut');
  if (!out.ok) {
    if (el) el.innerHTML = `<span style="color:#ef4444">${out.msg}</span>`;
    renderManualBacktestPreviewUi(body, null, gbPrefs, {});
    renderGridRiskProfileUi(body, null, gbPrefs, null);
    return;
  }

  const sp = out.stepPcts || {};
  const pctTxt = (sp.min != null && sp.max != null)
    ? ` · между сетками: <b style="color:#e2e8f0">${fn(sp.min, 2)}%</b> — <b style="color:#e2e8f0">${fn(sp.max, 2)}%</b>${sp.avg != null ? ` (ср. ${fn(sp.avg, 2)}%)` : ''}`
    : '';
  if (el) {
    el.innerHTML = `<span style="color:var(--text3)">${out.symbol.replace(/USDT$/, '')} · ${out.tf} · ${out.candles.length} баров · шаг ${fmtPrice(out.step)}${pctTxt} • верх/низ: тянуть на графике · #0: тянуть в панели «Риск-профиль».</span>`;
  }

  const keepVp = !!(reuse && lcRef && body._gbChartCtx?.merged?.length);
  renderManualBacktestPreviewUi(body, out, gbPrefs, { keepViewport: keepVp });

  if (keepVp) {
    const lcA = body._gbChartCtx?.lc;
    const csA = body._gbChartCtx?.cs;
    if (lcA && csA && body._gbPendingViewport) {
      const snap = body._gbPendingViewport;
      requestAnimationFrame(() => {
        try { applyGbViewportFreeze(lcA, csA, snap); } catch (e) { /* ignore */ }
        requestAnimationFrame(() => {
          try { applyGbViewportFreeze(lcA, csA, snap); } catch (e) { /* ignore */ }
        });
      });
    }
  }

  renderGridRiskProfileUi(body, out, gbPrefs, null);
}

/**
 * Collect raw field values from the Grid Lab form into a plain object.
 * Pure-ish: reads DOM but returns plain values, no transformation.
 */
export function collectGridLabFields(body) {
  return {
    sym: body.querySelector('#gbSym')?.value,
    tf: body.querySelector('#gbTf')?.value,
    upper: body.querySelector('#gbHigh')?.value,
    lower: body.querySelector('#gbLow')?.value,
    levels: body.querySelector('#gbLevels')?.value,
    leverage: body.querySelector('#gbLev')?.value,
    deposit: body.querySelector('#gbDep')?.value,
    gridMode: body.querySelector('#gbMode')?.value,
    anchorPrice: body.querySelector('#gbAnchor')?.value,
  };
}

/**
 * Detect changes between current form values and previously-saved bounds.
 * Pure: returns {loCh, hiCh, lvlCh}.
 */
export function detectBoundsChanges(formLo, formHi, formLevels, prevB) {
  const loNv = parseFloat(formLo || '');
  const hiNv = parseFloat(formHi || '');
  const loCh = formLo != null && String(formLo).trim() !== '' && isFinite(loNv) && prevB.lower !== loNv;
  const hiCh = formHi != null && String(formHi).trim() !== '' && isFinite(hiNv) && prevB.upper !== hiNv;
  const lvlCh = prevB.levels != null && prevB.levels !== formLevels;
  return { loCh, hiCh, lvlCh };
}

// ═══════════════════════════════════════════════════════════════
//  Manual backtest preview helpers (Step 3B.3)
// ═══════════════════════════════════════════════════════════════

const PRICE_AXIS_W_DEFAULT = 65;
const DRAG_TOL_PX = 13;
const DRAG_TOL_PCT = 0.006;

const PREVIEW_LINE_COLORS = {
  anchor: '#f59e0b',
  long: '#22c55e',
  short: '#ef4444',
  'tp-up': '#64748b',
  'tp-down': '#64748b',
  neutral: '#60a5fa',
};

/**
 * Build price lines for the chart overlay (one per grid level).
 * Pure: depends only on input params and imported pure helpers.
 */
export function buildPreviewPriceLines(out, lastClose) {
  const gridMode = String(out.gridRiskMode || 'neutral');
  const step = out.step || 0;
  const gridLv = out.gridLevels || [];
  const riskRows = buildGridRiskRows({
    lower: out.lower,
    upper: out.upper,
    currentPrice: lastClose,
    levels: out.levels,
    leverage: out.leverage,
    deposit: out.startEq,
    gridMode,
    anchorPrice: out.anchorPrice,
    gridLevels: gridLv,
  });
  const anchorIdx = gridRiskAnchorIdx(gridLv, lastClose, step, gridMode, out.anchorPrice);
  const anchorPx = gridLv[anchorIdx] ?? lastClose;
  return gridLv.map((p, i) => {
    const meta = gridRiskMetaForPrice(p, anchorPx, step, riskRows, gridMode);
    const color = PREVIEW_LINE_COLORS[meta.side] || PREVIEW_LINE_COLORS.neutral;
    const title = fmtGridLineTitle(meta, (v) => v);
    return {
      price: p,
      color,
      lineWidth: i === 0 || i === gridLv.length - 1 ? 2 : 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title,
      meta,
    };
  });
}

/**
 * Decide whether the saved viewport from a previous render should be reused.
 * Pure — no DOM access.
 */
export function resolveSavedViewPlan(prev, viewOpts, pending) {
  if (pending) {
    return { savedView: pending, consumePending: true };
  }
  if (viewOpts && viewOpts.keepViewport && prev && prev.lc && prev.cs) {
    return { savedView: captureGbLabViewport(prev.lc, prev.cs), consumePending: false };
  }
  return { savedView: null, consumePending: false };
}

/**
 * Hit-test: is `touchPx` near `targetPx` on the price axis?
 */
export function isNearPriceAxis(cs, touchPx, targetPx) {
  if (targetPx == null || !isFinite(+targetPx)) return false;
  const yT = cs.priceToCoordinate(+targetPx);
  const yU = cs.priceToCoordinate(+touchPx);
  if (yT != null && yU != null) return Math.abs(yT - yU) < DRAG_TOL_PX;
  return Math.abs(+touchPx - targetPx) / Math.max(Math.abs(+targetPx), 1e-12) < DRAG_TOL_PCT;
}

/**
 * Wire mousedown/mousemove/mouseup handlers for dragging high/low bounds.
 * Reads DOM through the passed body; writes back to gbPrefs.symbolBounds.
 */
export function wireDragHandlers({
  wrap, host, lc, cs, body, out, gbPrefs, sig, deps,
}) {
  const {
    PRICE_AXIS_W = PRICE_AXIS_W_DEFAULT,
    getCoords,
    pushGridLabBoundsUndo,
    scheduleGridLabSync,
    saveGridLabPrefs,
    captureGbLabViewport,
    applyGbViewportFreeze,
    rCanvas,
  } = deps;

  const hitPrice = (clientY) => {
    const r = host.getBoundingClientRect();
    return cs.coordinateToPrice(clientY - r.top);
  };
  const gbInteractRestore = {
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  };
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const { x } = getCoords(wrap, e.clientX, e.clientY);
    if (x >= Math.max(1, wrap.clientWidth - PRICE_AXIS_W - 2)) return;
    const pr = hitPrice(e.clientY);
    if (pr == null) return;
    const hi = +out.upper, lo = +out.lower;
    const ctxB = body._gbChartCtx;
    let drag = null;
    if (isNearPriceAxis(cs, pr, hi)) drag = { kind: 'high', previewPrice: hi };
    else if (isNearPriceAxis(cs, pr, lo)) drag = { kind: 'low', previewPrice: lo };
    if (!drag) return;
    e.preventDefault(); e.stopPropagation();
    body._gbSuppressChartSync = true;
    pushGridLabBoundsUndo(body);
    body._gbPendingViewport = captureGbLabViewport(lc, cs);
    ctxB._gbDrag = drag;
    try {
      const snap = captureGbLabViewport(lc, cs);
      ctxB._gbDragFrozenVp = snap;
      if (typeof lc.timeScale().subscribeVisibleLogicalRangeChange === 'function') {
        if (ctxB._gbVpLockUnsub) { try { ctxB._gbVpLockUnsub(); } catch (e2) {} ctxB._gbVpLockUnsub = null; }
        ctxB._gbVpLockUnsub = lc.timeScale().subscribeVisibleLogicalRangeChange(() => {
          if (body._gbChartCtx?._gbDrag && body._gbChartCtx._gbDragFrozenVp)
            applyGbViewportFreeze(lc, cs, body._gbChartCtx._gbDragFrozenVp);
        });
      }
    } catch (e) {}
    try {
      lc.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
      });
    } catch (err) {}
    const onDocUp = () => {
      document.removeEventListener('mouseup', onDocUp, true);
      body._gbSuppressChartSync = false;
      const c2 = body._gbChartCtx;
      if (c2?._gbVpLockUnsub) { try { c2._gbVpLockUnsub(); } catch (e3) {} c2._gbVpLockUnsub = null; }
      if (c2) delete c2._gbDragFrozenVp;
      try { lc.applyOptions(gbInteractRestore); } catch (e) {}
    };
    document.addEventListener('mouseup', onDocUp, true);
  }, { signal: sig, capture: true });

  wrap.addEventListener('mousemove', (e) => {
    const ctxB = body._gbChartCtx; if (!ctxB?.gbCh) return;
    const pr = hitPrice(e.clientY);
    if (ctxB._gbDrag && pr != null) {
      ctxB._gbDrag.previewPrice = pr;
      if (ctxB._gbDrag.kind === 'high') body.querySelector('#gbHigh').value = String(+pr.toFixed(8));
      if (ctxB._gbDrag.kind === 'low') body.querySelector('#gbLow').value = String(+pr.toFixed(8));
      if (ctxB._gbDragFrozenVp) applyGbViewportFreeze(lc, cs, ctxB._gbDragFrozenVp);
      rCanvas(ctxB.gbCh);
      return;
    }
    const { x, y } = getCoords(wrap, e.clientX, e.clientY);
    ctxB.gbCh.hoverX = x; ctxB.gbCh.hoverY = y;
    rCanvas(ctxB.gbCh);
  }, { signal: sig, capture: true });

  wrap.addEventListener('mouseleave', () => {
    const ctxB = body._gbChartCtx; if (!ctxB?.gbCh) return;
    ctxB.gbCh.hoverX = 0; ctxB.gbCh.hoverY = 0; rCanvas(ctxB.gbCh);
  }, { signal: sig });

  wrap.addEventListener('mouseup', (e) => {
    const ctxB = body._gbChartCtx; const dg = ctxB._gbDrag;
    if (dg && e.button === 0) {
      if (ctxB._gbVpLockUnsub) { try { ctxB._gbVpLockUnsub(); } catch (err) {} ctxB._gbVpLockUnsub = null; }
      delete ctxB._gbDragFrozenVp;
      try { lc.applyOptions(gbInteractRestore); } catch (err) {}
      body._gbSuppressChartSync = false;
    }
    ctxB._gbDrag = null; if (!dg || e.button !== 0) return;
    if (ctxB.gbCh) rCanvas(ctxB.gbCh);
    const symI = body.querySelector('#gbSym');
    const sym = String(symI?.value || '').toUpperCase().trim();
    if (dg.kind === 'high' || dg.kind === 'low') {
      if (sym) {
        const lo = parseFloat(body.querySelector('#gbLow').value) || null;
        const hi = parseFloat(body.querySelector('#gbHigh').value) || null;
        if (!gbPrefs.symbolBounds) gbPrefs.symbolBounds = {};
        gbPrefs.symbolBounds[sym] = { ...gbPrefs.symbolBounds[sym], lower: lo, upper: hi };
        saveGridLabPrefs(gbPrefs);
      }
    }
    if (ctxB.lc && ctxB.cs) body._gbPendingViewport = captureGbLabViewport(ctxB.lc, ctxB.cs);
    scheduleGridLabSync(body, gbPrefs, { reuseCandles: true });
  }, { signal: sig, capture: true });
}

/**
 * Wire middle-click ruler drag, mousemove tracking and context-menu cancel.
 */
export function wireRulerHandlers({ wrap, gbCh, sig, deps }) {
  const { onRulerStart, onRulerMove, onRulerEnd, isNearRuler, getCoords, rCanvas } = deps;
  wrap.addEventListener('mousedown', (e) => {
    if (e.button === 1) { e.preventDefault(); onRulerStart(gbCh, e, wrap); }
  }, { capture: true, signal: sig });
  wrap.addEventListener('mousemove', (e) => {
    if (gbCh.ruler?.active) onRulerMove(gbCh, e, wrap);
  }, { capture: true, signal: sig });
  wrap.addEventListener('mouseup', (e) => {
    if (e.button === 1 && gbCh.ruler?.active) onRulerEnd(gbCh, e);
  }, { capture: true, signal: sig });
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (gbCh.ruler?.p1 && gbCh.ruler?.p2) {
      const { x, y } = getCoords(wrap, e.clientX, e.clientY);
      if (isNearRuler(gbCh, x, y)) {
        gbCh.ruler = null;
        const tt = document.getElementById('rulerTooltip');
        if (tt) tt.style.display = 'none';
        rCanvas(gbCh);
      }
    }
  }, { signal: sig });
}

/**
 * Full manual backtest preview render (Step 3B.3).
 * Equivalent to the inlined main.js version, but with all DOM-touching deps
 * injected so this function can be exercised with mocks.
 */
export function renderManualBacktestPreviewUi(body, out, gbPrefs, viewOpts, deps) {
  viewOpts = viewOpts || {};
  const {
    S, toChartTime, fmtPrice, getPriceMinMove, rCanvas,
    getCoords, pushGridLabBoundsUndo, scheduleGridLabSync,
    saveGridLabPrefs, captureGbLabViewport, applyGbViewportFreeze,
    onRulerStart, onRulerMove, onRulerEnd, isNearRuler,
    PRICE_AXIS_W = PRICE_AXIS_W_DEFAULT,
    prependGridLabHistory, kickGridLabPricePoll,
  } = deps;

  const wrap = body.querySelector('#gbChartWrap');
  const host = body.querySelector('#gbChart');
  if (!wrap || !host) return;
  const prev = body._gbChartCtx;
  const plan = resolveSavedViewPlan(prev, viewOpts, body._gbPendingViewport);
  if (plan.consumePending) body._gbPendingViewport = null;
  const savedView = plan.savedView;

  if (prev?.gbLabSig) try { prev.gbLabSig.abort(); } catch (e) {}
  if (prev?._pollTimer) clearInterval(prev._pollTimer);
  if (prev?.ro) try { prev.ro.disconnect(); } catch (e) {}
  if (prev?.lc) try { prev.lc.remove(); } catch (e) {}
  body._gbChartCtx = {
    lc: null, cs: null, ro: null, gbCh: null, gbLabSig: null, merged: null,
    sym: null, tf: null, _gbManagedLines: [], _histLoading: false,
    _gbDrag: null, _gbVpLockUnsub: null,
  };
  host.innerHTML = '';
  let rulerCanvas = body.querySelector('#gbRulerCanvas');
  if (!rulerCanvas) {
    rulerCanvas = document.createElement('canvas');
    rulerCanvas.id = 'gbRulerCanvas';
    rulerCanvas.style.cssText = 'position:absolute;inset:0;z-index:12;pointer-events:none';
    wrap.appendChild(rulerCanvas);
  }
  if (!S.LC || !out?.ok || !Array.isArray(out.candles) || !out.candles.length) return;
  const merged = out.candles;
  body._gbChartCtx.sym = out.symbol; body._gbChartCtx.tf = out.tf; body._gbChartCtx.merged = merged;

  const syncCanvasSize = () => {
    const ctx = body._gbChartCtx; const lcA = ctx.lc; if (!lcA) return;
    const w = Math.max(1, wrap.clientWidth | 0), h = Math.max(1, wrap.clientHeight | 0);
    try { lcA.applyOptions({ width: w, height: h }); } catch (e) {}
    rulerCanvas.width = w; rulerCanvas.height = h;
    rulerCanvas.style.width = w + 'px'; rulerCanvas.style.height = h + 'px';
    if (ctx.gbCh) rCanvas(ctx.gbCh);
  };

  const lc = S.LC.createChart(host, {
    width: wrap.clientWidth || 400,
    height: wrap.clientHeight || 420,
    layout: { background: { color: '#0a0a0b' }, textColor: '#606070' },
    grid: { vertLines: { color: '#141418' }, horzLines: { color: '#141418' } },
    crosshair: {
      mode: 0,
      vertLine: { color: 'transparent', width: 0, style: 0, labelBackgroundColor: '#252530', labelVisible: false },
      horzLine: { color: 'transparent', width: 0, style: 0, labelBackgroundColor: '#252530', labelVisible: false },
    },
    rightPriceScale: { borderColor: '#252530' },
    timeScale: { borderColor: '#252530', timeVisible: true, secondsVisible: false, fixRightEdge: false },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  });
  const cs = lc.addCandlestickSeries({
    upColor: S.upColor, downColor: '#e04040', borderUpColor: S.upColor, borderDownColor: '#e04040',
    wickUpColor: S.upColor, wickDownColor: '#e04040',
    priceFormat: { type: 'custom', formatter: (p) => fmtPrice(p), minMove: 0.0000001 },
  });
  body._gbChartCtx.lc = lc; body._gbChartCtx.cs = cs;
  const lastCInit = +merged[merged.length - 1]?.c || 1;
  try { cs.applyOptions({ priceFormat: { type: 'custom', formatter: fmtPrice, minMove: getPriceMinMove(lastCInit) } }); } catch (e) {}
  cs.setData(merged.map((k) => ({ time: toChartTime(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
  if (savedView) {
    try {
      if (savedView.log && typeof savedView.log.from === 'number' && typeof savedView.log.to === 'number'
          && typeof lc.timeScale().setVisibleLogicalRange === 'function') {
        lc.timeScale().setVisibleLogicalRange(savedView.log);
      } else if (savedView.vt && savedView.vt.from != null && savedView.vt.to != null) {
        lc.timeScale().setVisibleRange(savedView.vt);
      }
    } catch (e) {}
    try {
      const ps = cs.priceScale();
      if (savedView.pr && ps && typeof ps.setVisibleRange === 'function') ps.setVisibleRange(savedView.pr);
    } catch (e) {}
    requestAnimationFrame(() => {
      try {
        if (!savedView) return;
        if (savedView.log && typeof savedView.log.from === 'number' && typeof savedView.log.to === 'number'
            && typeof lc.timeScale().setVisibleLogicalRange === 'function') {
          lc.timeScale().setVisibleLogicalRange(savedView.log);
        } else if (savedView.vt && savedView.vt.from != null && savedView.vt.to != null) {
          lc.timeScale().setVisibleRange(savedView.vt);
        }
        const ps = cs.priceScale();
        if (savedView.pr && ps && typeof ps.setVisibleRange === 'function') ps.setVisibleRange(savedView.pr);
      } catch (e) {}
    });
  } else { try { lc.timeScale().fitContent(); } catch (e) {} }

  const lastCForLines = +merged[merged.length - 1]?.c;
  const lines = buildPreviewPriceLines(out, lastCForLines);
  for (const ln of lines) {
    cs.createPriceLine({
      price: ln.price, color: ln.color, lineWidth: ln.lineWidth, lineStyle: ln.lineStyle,
      axisLabelVisible: ln.axisLabelVisible, title: ln.title,
    });
  }
  if (typeof cs.setMarkers === 'function') cs.setMarkers([]);

  const gbCh = {
    lc, cs, sym: out.symbol || null, candles: merged, ruler: null,
    canvas: rulerCanvas, _gridLabChart: true, drawings: [],
    hoveredIdx: -1, hoverX: 0, hoverY: 0,
  };
  const gbLabSig = new AbortController();
  const sig = gbLabSig.signal;

  wireDragHandlers({
    wrap, host, lc, cs, body, out, gbPrefs, sig,
    deps: { PRICE_AXIS_W, getCoords, pushGridLabBoundsUndo, scheduleGridLabSync,
            saveGridLabPrefs, captureGbLabViewport, applyGbViewportFreeze, rCanvas },
  });
  try {
    lc.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && typeof range.from === 'number' && range.from < 40) {
        clearTimeout(body._gbPrepT);
        body._gbPrepT = setTimeout(() => prependGridLabHistory(body, out.symbol, out.tf), 220);
      }
    });
  } catch (e) {}
  wireRulerHandlers({
    wrap, gbCh, sig,
    deps: { onRulerStart, onRulerMove, onRulerEnd, isNearRuler, getCoords, rCanvas },
  });

  const ro = new ResizeObserver(() => syncCanvasSize());
  ro.observe(wrap);
  requestAnimationFrame(syncCanvasSize);
  kickGridLabPricePoll(out.symbol);
  body._gbChartCtx = { ...body._gbChartCtx, ro, gbCh, gbLabSig };
}

