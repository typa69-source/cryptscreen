/**
 * Grid Lab — pure math utilities (no DOM, no global state).
 *
 * Step 1 of the main.js refactor: extract testable pure functions from the
 * Grid Lab section into a standalone module. main.js continues to expose its
 * own copies of these functions so the existing flow keeps working; future
 * steps will rewire the modal/render code to import from here instead.
 *
 * No behaviour changes — this is a copy-with-exports, not a refactor.
 */

export const GB_DEP_MIN = 0.1;

/** Clamp a deposit value to a sane minimum. */
export function gbDepositClamp(v, fallback = 500) {
  const x = +v;
  if (!isFinite(x)) return Math.max(GB_DEP_MIN, +fallback || 500);
  return Math.max(GB_DEP_MIN, x);
}

/** % between adjacent grid lines, expressed in percent of refPrice. */
export function gridAdjacentStepPcts(grid, refPrice) {
  if (!grid || grid.length < 2) return { min: null, max: null, avg: null };
  const ref = +refPrice > 0 ? +refPrice : (+grid[0] + +grid[grid.length - 1]) / 2;
  if (!(ref > 0)) return { min: null, max: null, avg: null };
  const pcts = [];
  for (let i = 1; i < grid.length; i++) {
    const d = Math.abs(grid[i] - grid[i - 1]);
    if (d > 0) pcts.push((d / ref) * 100);
  }
  if (!pcts.length) return { min: null, max: null, avg: null };
  const sum = pcts.reduce((a, b) => a + b, 0);
  return { min: Math.min(...pcts), max: Math.max(...pcts), avg: sum / pcts.length };
}

/** Resolve grid levels from either a custom array or even spacing between lo/hi. */
export function resolveGridLevelsForCfg(cfg, lo, hi, levels) {
  const custom = cfg?.gridLevels;
  if (Array.isArray(custom) && custom.length >= 2) {
    const grid = custom.map((x) => +x).filter((x) => isFinite(x) && x > 0).sort((a, b) => a - b);
    if (grid.length >= 2) return { grid, levels: grid.length - 1 };
  }
  const grids = Math.max(2, levels | 0);
  const step = (hi - lo) / grids;
  const grid = Array.from({ length: grids + 1 }, (_, i) => lo + step * i);
  return { grid, levels: grids };
}

/** Build an asymmetric grid around an anchor price.
 *  longRatio : shortRatio = number of steps up : down, avgStepPct = average spacing. */
export function buildRatioGridLevels(anchor, longRatio, shortRatio, avgStepPct, totalLevels) {
  const ax = +anchor;
  if (!(ax > 0)) return null;
  const lr = Math.max(0.1, +longRatio || 1);
  const sr = Math.max(0.1, +shortRatio || 1);
  const stepPct = Math.max(0.01, Math.min(50, +avgStepPct || 0.5));
  const stepFrac = stepPct / 100;
  const totalLv = Math.max(3, Math.min(60, totalLevels | 0));
  const sumR = lr + sr;
  const upSteps = Math.max(1, Math.round((totalLv * lr) / sumR));
  const downSteps = Math.max(1, Math.round((totalLv * sr) / sumR));
  const pts = new Set();
  pts.add(ax);
  for (let i = 1; i <= upSteps; i++) pts.add(ax * (1 + stepFrac * i));
  for (let i = 1; i <= downSteps; i++) {
    const p = ax * (1 - stepFrac * i);
    if (p > 0) pts.add(p);
  }
  const grid = [...pts].sort((a, b) => a - b);
  if (grid.length < 2) return null;
  return {
    gridLevels: grid,
    lower: grid[0],
    upper: grid[grid.length - 1],
    levels: grid.length - 1,
    upSteps,
    downSteps,
    stepPct,
  };
}

/** Risk-grid anchor index.
 *  long: last level ≤ price (you're entering above current).
 *  short / neutral: first level ≥ price (you're entering below current).
 *  anchorOverridePx: when set, snap to nearest grid line to that price. */
export function gridRiskAnchorIdx(grid, cur, step, mode, anchorOverridePx = null) {
  if (
    anchorOverridePx != null &&
    isFinite(+anchorOverridePx) &&
    Array.isArray(grid) &&
    grid.length
  ) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < grid.length; i++) {
      const d = Math.abs(grid[i] - +anchorOverridePx);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }
  const eps = Math.max(1e-10, (step || 0) * 1e-9);
  if (String(mode || 'neutral') === 'long') {
    let idx = -1;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] <= cur + eps) idx = i;
    }
    return idx < 0 ? 0 : idx;
  }
  const j = grid.findIndex((p) => p >= cur - eps);
  return j < 0 ? grid.length - 1 : j;
}

/** Risk-profile rows: MTM of running grid positions at each step up/down.
 *  cfg = { lower, upper, currentPrice, levels, leverage, deposit, gridMode, anchorPrice, gridLevels? }. */
export function buildGridRiskRows(cfg) {
  const lo = +cfg.lower;
  const hi = +cfg.upper;
  const cur = +cfg.currentPrice;
  const grids = Math.max(2, +cfg.levels | 0);
  const lev = Math.max(1, +cfg.leverage || 1);
  const dep = gbDepositClamp(cfg.deposit, 1);
  if (!(hi > lo) || !(cur > 0)) return [];
  const resolved = resolveGridLevelsForCfg(cfg, lo, hi, grids);
  const grid = resolved.grid;
  const step = resolved.levels > 0 ? (grid[grid.length - 1] - grid[0]) / resolved.levels : 0;
  if (!(step > 0)) return [];
  const perStepNotional = (dep * lev) / Math.max(1, resolved.levels);
  const mode = String(cfg.gridMode || 'neutral');
  const anchorIdx = gridRiskAnchorIdx(grid, cur, step, mode, cfg.anchorPrice);
  const anchorPx = grid[anchorIdx];
  const upLevels = grid.slice(anchorIdx);
  const downPrices = grid.slice(0, anchorIdx).reverse();
  const maxDown = downPrices.length;
  const maxUp = upLevels.length;

  if (mode === 'long') {
    const rows = [];
    const openK = Math.max(0, maxUp - 1);
    if (openK <= 0) return rows;
    const qtyOpen = perStepNotional / Math.max(anchorPx, 1e-12);
    for (let n = 1; n <= maxDown; n++) {
      const pxNow = downPrices[n - 1];
      let downUsdt = openK * qtyOpen * (pxNow - anchorPx);
      for (let j = 1; j <= n; j++) {
        const ent = downPrices[j - 1];
        const q = perStepNotional / Math.max(ent, 1e-12);
        downUsdt += q * (pxNow - ent);
      }
      rows.push({
        step: n,
        downUsdt,
        upUsdt: 0,
        downPrice: pxNow,
        upPrice: null,
        downPct: (downUsdt / dep) * 100,
        upPct: 0,
      });
    }
    return rows;
  }

  if (mode === 'short') {
    const rows = [];
    if (maxUp <= 1) return rows;
    const openK = Math.max(0, maxDown);
    if (openK <= 0) return rows;
    const basePx = upLevels[0];
    const qtyOpen = perStepNotional / Math.max(basePx, 1e-12);
    for (let n = 1; n <= maxUp - 1; n++) {
      const pxNow = upLevels[n];
      let upUsdt = openK * qtyOpen * (basePx - pxNow);
      for (let j = 1; j <= n; j++) {
        const ent = upLevels[j];
        const q = perStepNotional / Math.max(ent, 1e-12);
        upUsdt += q * (ent - pxNow);
      }
      rows.push({
        step: n,
        downUsdt: 0,
        upUsdt,
        downPrice: null,
        upPrice: pxNow,
        downPct: 0,
        upPct: (upUsdt / dep) * 100,
      });
    }
    return rows;
  }

  // neutral
  const maxN = Math.max(maxDown, maxUp);
  const tol = Math.max(1e-10, (step || 0) * 1e-9);
  const rows = [];
  for (let n = 1; n <= maxN; n++) {
    let downUsdt = 0;
    let upUsdt = 0;
    let downPrice = null;
    let upPrice = null;
    if (n <= maxDown) {
      const pxNow = downPrices[n - 1];
      downPrice = pxNow;
      for (let i = 0; i < n - 1; i++) {
        const ent = downPrices[i];
        const qty = perStepNotional / Math.max(ent, 1e-12);
        downUsdt += qty * (pxNow - ent);
      }
    }
    if (n <= maxUp) {
      const pxNow = upLevels[n - 1];
      if (Math.abs(pxNow - anchorPx) <= tol) {
        upPrice = null;
        upUsdt = 0;
      } else {
        upPrice = pxNow;
        for (let j = 1; j < n - 1; j++) {
          const ent = upLevels[j];
          const qty = perStepNotional / Math.max(ent, 1e-12);
          upUsdt += qty * (ent - pxNow);
        }
      }
    }
    rows.push({
      step: n,
      downUsdt,
      upUsdt,
      downPrice,
      upPrice,
      downPct: (downUsdt / dep) * 100,
      upPct: (upUsdt / dep) * 100,
    });
  }
  return rows;
}

/** "Favourable scenario" rows: pure profit when price moves to each grid level
 *  in the direction matching the grid mode. long = walks up; short = walks down;
 *  neutral = empty (neutral has no preferred direction). */
export function buildGridFavorableRows(cfg) {
  const lo = +cfg.lower;
  const hi = +cfg.upper;
  const cur = +cfg.currentPrice;
  const grids = Math.max(2, +cfg.levels | 0);
  const lev = Math.max(1, +cfg.leverage || 1);
  const dep = gbDepositClamp(cfg.deposit, 1);
  if (!(hi > lo) || !(cur > 0)) return [];
  const resolved = resolveGridLevelsForCfg(cfg, lo, hi, grids);
  const grid = resolved.grid;
  const step = resolved.levels > 0 ? (grid[grid.length - 1] - grid[0]) / resolved.levels : 0;
  if (!(step > 0)) return [];
  const perStepNotional = (dep * lev) / Math.max(1, resolved.levels);
  const mode = String(cfg.gridMode || 'neutral');
  const anchorIdx = gridRiskAnchorIdx(grid, cur, step, mode, cfg.anchorPrice);
  const anchorPx = grid[anchorIdx];
  const upLevels = grid.slice(anchorIdx);
  const downPrices = grid.slice(0, anchorIdx).reverse();
  const rows = [];

  if (mode === 'long') {
    const maxUp = upLevels.length;
    for (let n = 1; n < maxUp; n++) {
      const pxNow = upLevels[n];
      let pnl = 0;
      for (let i = 1; i <= n; i++) {
        const ent = upLevels[i - 1];
        const q = perStepNotional / Math.max(ent, 1e-12);
        pnl += q * (pxNow - ent);
      }
      rows.push({ step: n, price: pxNow, usdt: pnl, pct: (pnl / dep) * 100 });
    }
    return rows;
  }

  if (mode === 'short') {
    const maxDn = downPrices.length;
    for (let n = 1; n <= maxDn; n++) {
      const pxNow = downPrices[n - 1];
      let pnl = 0;
      for (let i = 1; i <= n; i++) {
        const ent = i === 1 ? anchorPx : downPrices[i - 2];
        const q = perStepNotional / Math.max(ent, 1e-12);
        pnl += q * (ent - pxNow);
      }
      rows.push({ step: n, price: pxNow, usdt: pnl, pct: (pnl / dep) * 100 });
    }
    return rows;
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════
//  Prefs I/O (Step 2 of the main.js refactor)
// ═══════════════════════════════════════════════════════════════

export const GRIDLAB_PREFS_KEY = 'cs_gridlab_prefs_v2';

/** Default global prefs (overwritten by anything saved in localStorage). */
export function defaultGridLabPrefs() {
  return {
    global: {
      tf: '5m',
      bars: 360,
      levels: 12,
      leverage: 3,
      deposit: 500,
      gridMode: 'neutral',
      ratioLong: 3,
      ratioShort: 1,
      ratioStepPct: 0.5,
    },
    symbolBounds: {},
  };
}

/** Load prefs from localStorage with full validation. */
export function loadGridLabPrefs(storage) {
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!ls) return defaultGridLabPrefs();
  try {
    const raw = ls.getItem(GRIDLAB_PREFS_KEY);
    if (!raw) return defaultGridLabPrefs();
    const j = JSON.parse(raw);
    const d = defaultGridLabPrefs();
    return {
      global: {
        tf: ['1m', '5m', '15m', '1h'].includes(j?.global?.tf) ? j.global.tf : d.global.tf,
        bars: Math.max(80, Math.min(1200, +(j?.global?.bars || d.global.bars))),
        levels: Math.max(3, Math.min(60, +(j?.global?.levels || d.global.levels))),
        leverage: Math.max(1, Math.min(25, +(j?.global?.leverage || d.global.leverage))),
        deposit: gbDepositClamp(j?.global?.deposit, d.global.deposit),
        gridMode: ['neutral', 'long', 'short'].includes(j?.global?.gridMode) ? j.global.gridMode : d.global.gridMode,
        ratioLong: Math.max(0.1, +(j?.global?.ratioLong ?? d.global.ratioLong)),
        ratioShort: Math.max(0.1, +(j?.global?.ratioShort ?? d.global.ratioShort)),
        ratioStepPct: Math.max(0.01, Math.min(50, +(j?.global?.ratioStepPct ?? d.global.ratioStepPct))),
      },
      symbolBounds: (j?.symbolBounds && typeof j.symbolBounds === 'object') ? j.symbolBounds : {},
    };
  } catch (e) {
    return defaultGridLabPrefs();
  }
}

/** Save prefs to localStorage. Silently swallows quota/permission errors. */
export function saveGridLabPrefs(prefs, storage) {
  const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!ls) return;
  try { ls.setItem(GRIDLAB_PREFS_KEY, JSON.stringify(prefs || {})); } catch (e) { /* ignore */ }
}

/**
 * Pure part of applyGbRatioGrid: given inputs, compute the new bounds + levels,
 * and return updated prefs (without touching localStorage / DOM).
 *
 * Inputs:
 *   gbPrefs        - current prefs object (will be mutated-then-returned)
 *   sym            - symbol currently in the form
 *   ratioLong      - longRatio from #gbRatioLong
 *   ratioShort     - shortRatio from #gbRatioShort
 *   ratioStepPct   - stepPct from #gbRatioStep
 *   totalLevels    - levels from #gbLevels
 *   anchorOverride - anchor price (symbolBounds[sym].anchorPrice || last close)
 *
 * Returns: { updated: boolean, gbPrefs, built } where `built` is null when nothing
 * to apply (validation failure, no anchor, etc.). The caller is responsible for
 * writing the updated prefs to localStorage and rendering the form fields.
 */
export function computeRatioGridUpdate(gbPrefs, sym, ratioLong, ratioShort, ratioStepPct, totalLevels, anchorOverride) {
  const symOk = typeof sym === 'string' && sym.trim().length > 0;
  if (!symOk) return { updated: false, gbPrefs, built: null };

  const lr = parseFloat(ratioLong);
  const sr = parseFloat(ratioShort);
  const sp = parseFloat(ratioStepPct);
  if (!isFinite(lr) || !isFinite(sr) || !isFinite(sp)) return { updated: false, gbPrefs, built: null };

  const lvl = Math.max(3, Math.min(60, +totalLevels || 12));
  const anchor = +anchorOverride;
  if (!(anchor > 0)) return { updated: false, gbPrefs, built: null };

  const built = buildRatioGridLevels(anchor, lr, sr, sp, lvl);
  if (!built) return { updated: false, gbPrefs, built: null };

  if (!gbPrefs.symbolBounds || typeof gbPrefs.symbolBounds !== 'object') gbPrefs.symbolBounds = {};
  gbPrefs.symbolBounds[sym] = {
    ...(gbPrefs.symbolBounds[sym] || {}),
    lower: built.lower,
    upper: built.upper,
    gridLevels: built.gridLevels,
  };
  gbPrefs.global = gbPrefs.global || defaultGridLabPrefs().global;
  gbPrefs.global.ratioLong = lr;
  gbPrefs.global.ratioShort = sr;
  gbPrefs.global.ratioStepPct = sp;

  return { updated: true, gbPrefs, built };
}

// ═══════════════════════════════════════════════════════════════
//  Backtest / state compile (Step 3A of the main.js refactor)
// ═══════════════════════════════════════════════════════════════

/**
 * Compile grid state for the risk-profile panel and chart overlay.
 * Pure function: no DOM, no fetches. Caller provides candles + config.
 *
 * cfg = {
 *   sym, tf, candles[], levels, leverage, deposit, gridMode,
 *   lower, upper, anchorPrice?, gridLevels?
 * }
 */
export function compileGridLabState(cfg) {
  const tf = String(cfg.tf || '5m');
  const candles = cfg.candles || [];
  if (candles.length < 12) return { ok: false, msg: `Недостаточно ${tf} истории для сетки (нужно ≥12 баров)` };
  const lowSeries = candles.map((c) => c.l);
  const highSeries = candles.map((c) => c.h);
  const lo = cfg.lower > 0 ? cfg.lower : Math.min(...lowSeries);
  const hi = cfg.upper > 0 ? cfg.upper : Math.max(...highSeries);
  if (!(hi > lo)) return { ok: false, msg: 'Неверный диапазон сетки' };
  const levelsIn = Math.max(2, Math.min(60, cfg.levels | 0));
  const lev = Math.max(1, Math.min(25, cfg.leverage || 1));
  const dep = gbDepositClamp(cfg.deposit, 500);
  const resolved = resolveGridLevelsForCfg(cfg, lo, hi, levelsIn);
  const grid = resolved.grid;
  const levels = resolved.levels;
  const step = levels > 0 ? (grid[grid.length - 1] - grid[0]) / levels : 0;
  const lastC = +candles[candles.length - 1]?.c || null;
  const stepPcts = gridAdjacentStepPcts(grid, lastC);
  let anchorPrice = cfg.anchorPrice;
  if (anchorPrice != null && !isFinite(+anchorPrice)) anchorPrice = null;
  const gm = String(cfg.gridMode || 'neutral');
  return {
    ok: true,
    symbol: cfg.sym,
    tf,
    candles,
    gridLevels: grid,
    levels,
    step,
    stepPcts,
    leverage: lev,
    lower: lo,
    upper: hi,
    startEq: dep,
    gridRiskMode: ['neutral', 'long', 'short'].includes(gm) ? gm : 'neutral',
    anchorPrice: anchorPrice != null ? +anchorPrice : null,
    maxOneSideRun: 0,
  };
}

/**
 * Run a manual grid backtest on historical candles. Pure — no DOM, no fetches.
 *
 * cfg = {
 *   sym, tf, candles[], levels, leverage, deposit, fee?, bars?,
 *   toChartTime?(t) -> number   // optional; defaults to identity.
 *                                 // The render layer passes its own mapper so
 *                                 // the same `trades[i].time` field works
 *                                 // with LightweightCharts.
 * }
 *
 * Returns { ok, msg?, symbol, tf, bars, candles, gridLevels, trades[], levels,
 *   step, maxOneSideRun, leverage, lower, upper, fills, fees, startEq, finalEq,
 *   pnl, roi, maxDd }.
 */
export function runManualGridBacktest(cfg) {
  const tf = String(cfg.tf || '5m');
  const candles = (cfg.candles || []).slice(-Math.max(80, Math.min(1200, cfg.bars || 360)));
  if (candles.length < 30) return { ok: false, msg: `Недостаточно ${tf} истории для теста` };
  const closes = candles.map((c) => c.c);
  const lowSeries = candles.map((c) => c.l);
  const highSeries = candles.map((c) => c.h);
  const lo = cfg.lower > 0 ? cfg.lower : Math.min(...lowSeries);
  const hi = cfg.upper > 0 ? cfg.upper : Math.max(...highSeries);
  if (!(hi > lo)) return { ok: false, msg: 'Неверный диапазон сетки' };
  const levels = Math.max(2, Math.min(60, cfg.levels | 0));
  const lev = Math.max(1, Math.min(25, cfg.leverage || 1));
  const fee = Math.max(0, Math.min(0.01, cfg.fee || 0.00055));
  const dep = Math.max(1, cfg.deposit || 500);
  const step = (hi - lo) / levels;
  const grid = Array.from({ length: levels + 1 }, (_, i) => lo + step * i);
  const tct = typeof cfg.toChartTime === 'function' ? cfg.toChartTime : (x) => x;
  let cash = dep * 0.5;
  let asset = (dep * 0.5) / closes[0];
  const orderNotional = (dep * lev) / Math.max(8, levels);
  let fees = 0;
  let fills = 0;
  const trades = [];
  let buyRun = 0;
  let sellRun = 0;
  let maxOneSideRun = 0;
  const eq = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    for (const px of grid) {
      if (c.l <= px && c.h >= px) {
        const qty = orderNotional / Math.max(px, 1e-8);
        const buyCost = qty * px * (1 + fee);
        if (c.o >= px && cash >= buyCost) {
          cash -= buyCost;
          asset += qty;
          fees += qty * px * fee;
          fills++;
          trades.push({ time: tct(c.t), price: px, side: 'buy' });
          buyRun++; sellRun = 0;
          maxOneSideRun = Math.max(maxOneSideRun, buyRun);
        } else if (asset >= qty) {
          const gain = qty * px * (1 - fee);
          asset -= qty;
          cash += gain;
          fees += qty * px * fee;
          fills++;
          trades.push({ time: tct(c.t), price: px, side: 'sell' });
          sellRun++; buyRun = 0;
          maxOneSideRun = Math.max(maxOneSideRun, sellRun);
        }
      }
    }
    eq.push(cash + asset * c.c);
  }
  const last = closes[closes.length - 1];
  const finalEq = cash + asset * last;
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of eq) {
    if (v > peak) peak = v;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - v) / peak) * 100);
  }
  return {
    ok: true,
    symbol: cfg.sym,
    tf,
    bars: candles.length,
    candles,
    gridLevels: grid,
    trades,
    levels,
    step,
    maxOneSideRun,
    leverage: lev,
    lower: lo,
    upper: hi,
    fills,
    fees,
    startEq: dep,
    finalEq,
    pnl: finalEq - dep,
    roi: (finalEq / dep - 1) * 100,
    maxDd,
  };
}

/** Look up risk-grid metadata for a given price level.
 *  Returns { side, usdt, pct } where side ∈ { 'anchor', 'tp-up', 'tp-down',
 *  'short', 'long', 'unknown' }. Pure function. */
export function gridRiskMetaForPrice(price, anchorPx, step, riskRows, gridMode) {
  const tol = Math.max(1e-10, (step || 0) * 1e-7);
  const gm = String(gridMode || 'neutral');
  if (Math.abs(price - anchorPx) <= tol) return { side: 'anchor', usdt: 0, pct: 0 };
  if (price > anchorPx + tol) {
    if (gm === 'long') return { side: 'tp-up', usdt: 0, pct: 0 };
    const r = riskRows.find((x) => x.upPrice != null && Math.abs(x.upPrice - price) <= tol);
    if (r) return { side: 'short', usdt: r.upUsdt, pct: r.upPct };
  } else {
    if (gm === 'short') return { side: 'tp-down', usdt: 0, pct: 0 };
    const r = riskRows.find((x) => x.downPrice != null && Math.abs(x.downPrice - price) <= tol);
    if (r) return { side: 'long', usdt: r.downUsdt, pct: r.downPct };
  }
  return { side: 'unknown', usdt: null, pct: null };
}

/** Format a label for a grid-line hover. `fn` is the number formatter (provided via deps). */
export function fmtGridLineTitle(meta, fn) {
  if (meta.side === 'anchor') return '#0 · 0%, 0 USDT';
  if (meta.side === 'tp-up' || meta.side === 'tp-down') return '0%, 0 USDT (фиксация)';
  if (meta.usdt == null || meta.pct == null || !isFinite(meta.usdt) || !isFinite(meta.pct)) return '';
  return `${fn(meta.pct, 2)}%, ${fn(meta.usdt, 2)} USDT`;
}

/** Capture viewport snapshot from a LightweightCharts instance. Returns null on failure. */
export function captureGbLabViewport(lc, cs) {
  if (!lc || !cs) return null;
  try {
    const ts = lc.timeScale();
    const ps = typeof cs.priceScale === 'function' ? cs.priceScale() : null;
    return {
      log: (typeof ts.getVisibleLogicalRange === 'function') ? ts.getVisibleLogicalRange() : null,
      vt: (typeof ts.getVisibleRange === 'function') ? ts.getVisibleRange() : null,
      pr: (ps && typeof ps.getVisibleRange === 'function') ? ps.getVisibleRange() : null,
    };
  } catch (e) { return null; }
}

/** Apply a viewport snapshot back to a chart. Silently ignores failures. */
export function applyGbViewportFreeze(lc, cs, snap) {
  if (!lc || !cs || !snap) return;
  try {
    const ts = lc.timeScale();
    if (snap.log && typeof snap.log.from === 'number' && typeof snap.log.to === 'number' && typeof ts.setVisibleLogicalRange === 'function')
      ts.setVisibleLogicalRange(snap.log);
    else if (snap.vt && snap.vt.from != null && snap.vt.to != null) ts.setVisibleRange(snap.vt);
    const ps = typeof cs.priceScale === 'function' ? cs.priceScale() : null;
    if (snap.pr && ps && typeof ps.setVisibleRange === 'function') ps.setVisibleRange(snap.pr);
  } catch (e) { /* ignore */ }
}

/** Decide how many candles to fetch, preferring what's visible on the chart.
 *  Returns a value clamped to [120, 1400]. */
export function gbWantBarsFromVisible(lc, fallback) {
  try {
    const r = lc?.timeScale?.()?.getVisibleLogicalRange?.();
    if (r && typeof r.from === 'number' && typeof r.to === 'number') {
      return Math.max(200, Math.min(1400, Math.ceil(r.to - r.from) + 480));
    }
  } catch (e) { /* fallthrough */ }
  return Math.max(300, Math.min(1200, +fallback || 900));
}
