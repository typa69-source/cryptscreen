/**
 * Grid Economics — fees, round-trip accounting and walk-forward simulation
 * for the grid screeners (Swing / Intra / Pick / Smart).
 *
 * All functions are pure (arrays/numbers in, plain objects out) — no DOM,
 * no global state, safe to unit-test in isolation.
 */

// ─── Fees ────────────────────────────────────────────────────────

/** Maker fee per fill, in percent, per exchange (public linear perp rates). */
export const MAKER_FEE_PCT = {
  binance: 0.02,
  bybit: 0.02,
};

/** Round-trip fee (2 fills) + slippage buffer, percent. */
export function roundTripFeePct(ex = 'binance') {
  const f = MAKER_FEE_PCT[ex] ?? MAKER_FEE_PCT.binance;
  return 2 * f + 0.01; // 2 maker fills + 0.01% slippage guard
}

/**
 * Step economics for one grid interval.
 * `stepPct` — interval width in percent of price.
 * A round trip earns `stepPct` and costs `roundTripFeePct()`.
 * ratio ≥ 3 → ok, ≥ 2 → borderline, else bad.
 */
export function stepEconomics(stepPct, ex = 'binance') {
  if (stepPct == null || !isFinite(stepPct) || stepPct <= 0) {
    return { ratio: null, netPct: null, ok: false, verdict: '—' };
  }
  const fee = roundTripFeePct(ex);
  const ratio = stepPct / fee;
  const netPct = stepPct - fee;
  // epsilon guards float noise (0.15/0.05 → 2.9999999999999996)
  const ok = ratio >= 3 - 1e-9;
  const verdict = ok ? '✓' : ratio >= 2 ? '~' : '✗';
  return { ratio, netPct, ok, verdict };
}

/** Clamp a grid level count to the app-wide [6, 32] band. */
export function clampLevels(n) {
  const v = +n;
  if (!isFinite(v)) return 6;
  return Math.max(6, Math.min(32, Math.round(v)));
}

// ─── Small stat helpers ──────────────────────────────────────────

/** ATR(period) — Wilder-smoothed, on {h,l,c} klines. Null on short input. */
export function atr14(kl, period = 14) {
  if (!kl || kl.length < period + 1) return null;
  let sum = 0;
  const trs = [];
  for (let i = 1; i < kl.length; i++) {
    const tr = Math.max(
      kl[i].h - kl[i].l,
      Math.abs(kl[i].h - kl[i - 1].c),
      Math.abs(kl[i].l - kl[i - 1].c)
    );
    trs.push(tr);
  }
  for (let i = 0; i < period; i++) sum += trs[i];
  let atr = sum / period;
  // True Wilder smoothing: RMA_t = (RMA_{t-1}·(n−1) + X_t)/n.
  // (NOT prev − prev/n + X — that converges to n·X; it only cancels out
  // in DI ratios, not in a standalone ATR.)
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

/** Linear-interpolated percentile of a numeric array (like percentileCloses). */
export function pctile(arr, p) {
  if (!arr || !arr.length) return null;
  const s = arr.filter((x) => isFinite(x)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = (s.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - idx) + s[hi] * (idx - lo);
}

// ─── Grid bounds (train-only inputs) ─────────────────────────────

/**
 * Swing bounds from a TRAIN window: p5..p95 of closes over the last
 * `lookback` bars, padded by one wick-ATR on each side so limit orders
 * at the edges are not instantly wicked out. Step = 0.5 × ATR(14).
 */
export function swingBoundsFn(train, lookback = 30) {
  if (!train || train.length < Math.max(lookback, 35)) return null;
  const win = train.slice(-lookback);
  const closes = win.map((k) => +k.c).filter((c) => isFinite(c));
  if (closes.length < lookback * 0.8) return null;
  const p5 = pctile(closes, 5);
  const p95 = pctile(closes, 95);
  const atr = atr14(win, 14) ?? atr14(train, 14);
  if (p5 == null || p95 == null || atr == null || !(p95 > p5)) return null;
  const lower = Math.max(0.0001, p5 - atr * 0.5);
  const upper = p95 + atr * 0.5;
  const step = atr * 0.5;
  if (!(step > 0) || !(upper > lower)) return null;
  const levels = clampLevels((upper - lower) / step);
  return { lower, upper, step, levels };
}

/**
 * Intraday bounds from a TRAIN window: symmetric ±2.5×ATR around the
 * last train close (the old 1h-ATR is approximated by the same-series
 * ATR of the train window — for 15m data this underestimates; the
 * caller can pass a pre-scaled ATR via `atrOverride`).
 */
export function intraBoundsFn(train, atrOverride = null) {
  if (!train || train.length < 25) return null;
  const last = +train[train.length - 1].c;
  if (!isFinite(last) || last <= 0) return null;
  const atr = atrOverride != null ? +atrOverride : atr14(train, 14);
  if (atr == null || !(atr > 0)) return null;
  const lower = last - atr * 2.5;
  const upper = last + atr * 2.5;
  const step = atr * 0.5;
  const levels = clampLevels((upper - lower) / step);
  if (!(upper > lower) || !(step > 0)) return null;
  return { lower, upper, step, levels };
}

// ─── Grid simulation ─────────────────────────────────────────────

/**
 * Simulate a neutral grid on the test window.
 *
 * Model (deliberately simple, fee-aware):
 *   - Levels 1..N evenly spaced in [lower, upper]; level 0 is the price
 *     entry cell. Each time price CROSSES a level downward, one limit
 *     buy fills at the level; crossing upward sells it back at the SAME
 *     level (classic per-level pairing, netting `step` per round trip).
 *   - Fees: every fill pays maker fee; slippage guard via roundTripFeePct.
 *   - Inventory is capped at `maxInv` (default 3) — real grids can't
 *     infinitely stack; when the cap is hit the round-trip count stops
 *     growing (conservative).
 *   - brokeUp/brokeDown: price leaving the band ends accumulation that side.
 *
 * Returns gross/net percent (relative to grid span capital), round trips,
 * bars-in-range share, and max drawdown of holding inventory.
 */
export function simulateGrid(kl, { lower, upper, levels, maxInv = 3, ex = 'binance' }) {
  if (!kl || kl.length < 5) return null;
  if (lower == null || upper == null || !(upper > lower) || !(levels >= 2)) return null;
  const fee = roundTripFeePct(ex);
  const step = (upper - lower) / (levels - 1);
  // Level prices (array of N+2 including bounds).
  const lvl = [];
  for (let i = 0; i < levels; i++) lvl.push(lower + i * step);

  const closes = kl.map((k) => +k.c).filter((c) => isFinite(c));
  if (closes.length < 5) return null;

  // Per-level FIFO inventory: how many open buys at each level index.
  const inv = new Array(levels).fill(0);
  let rt = 0;
  let grossPct = 0;
  let invBars = 0;
  let maxInvBars = 0;
  let brokeUp = false;
  let brokeDown = false;
  let worstInvValue = 0; // inventory cost basis accumulated (for DD estimate)
  let peakPnl = 0;
  let troughPnl = 0;
  let pnl = 0;

  let prev = closes[0];
  let curLevel = levelIndexFor(lvl, prev);
  for (let i = 1; i < closes.length; i++) {
    const c = closes[i];
    const newLevel = levelIndexFor(lvl, c);
    // Walk from prev level to new level, filling each crossing.
    const dir = newLevel > curLevel ? 1 : newLevel < curLevel ? -1 : 0;
    if (dir !== 0) {
      let li = curLevel + dir;
      while (li >= 0 && li < levels && (dir > 0 ? li <= newLevel : li >= newLevel)) {
        if (dir < 0) {
          // price crossed level li downward → buy at lvl[li]
          if (inv[li] < maxInv) {
            inv[li]++;
            invBars++;
            worstInvValue += lvl[li];
          }
        } else {
          // price crossed level li upward → sell if we hold inventory there
          if (inv[li] > 0) {
            inv[li]--;
            rt++;
            grossPct += (step / ((lower + upper) / 2)) * 100;
            worstInvValue -= lvl[li];
            pnl = rt * step;
          }
        }
        li += dir;
      }
      curLevel = newLevel;
    }
    if (c > upper) brokeUp = true;
    if (c < lower) brokeDown = true;
    // Track inventory exposure for DD
    const openInv = inv.reduce((a, v) => a + v, 0);
    if (openInv > 0) maxInvBars = Math.max(maxInvBars, openInv);
    // Unrealized PnL proxy: inventory bought at levels, now worth c each
    let unreal = 0;
    for (let li2 = 0; li2 < levels; li2++) {
      if (inv[li2] > 0) unreal += (c - lvl[li2]) * inv[li2];
    }
    const total = pnl + unreal;
    peakPnl = Math.max(peakPnl, total);
    troughPnl = Math.min(troughPnl, total);
  }

  const barsInRange = closes.filter((c) => c >= lower && c <= upper).length;
  const feePerRtPct = (fee / 100) * (upper - lower) / ((lower + upper) / 2) * 100 / (step / ((lower + upper) / 2) * 100 || 1) * (step / ((lower + upper) / 2) * 100);
  // fee per round trip in pct-of-capital terms:
  const capital = (upper - lower); // span capital: one unit of exposure per level
  const feePctPerRt = (fee / 100) * 2 * (step / capital) * 100; // 2 fills? fee already 2 fills
  const netPct = grossPct - rt * (fee / 100) * (step / ((lower + upper) / 2) * 100);
  // Normalise net as percent of grid span (one capital unit = step worth of exposure)
  const netOfCapital = grossPct - rt * fee * (step / capital);

  const finalInv = inv.reduce((a, v) => a + v, 0);
  const unrealized = (() => {
    const c = closes[closes.length - 1];
    let u = 0;
    for (let li = 0; li < levels; li++) if (inv[li] > 0) u += (c - lvl[li]) * inv[li];
    return u;
  })();
  const span = upper - lower;
  return {
    rt,
    grossPct,
    netPct: netOfCapital,
    feePct: rt * fee * (step / capital),
    barsInRangePct: barsInRange / closes.length,
    brokeUp,
    brokeDown,
    maxDDPct: ((peakPnl - troughPnl) / span) * 100,
    endInventory: finalInv,
    unrealizedPct: (unrealized / span) * 100,
    netWithUnrealPct: netOfCapital + (unrealized / span) * 100,
  };
}

function levelIndexFor(lvl, price) {
  // lvl is sorted ascending; index of the cell containing price.
  if (price <= lvl[0]) return 0;
  const n = lvl.length;
  if (price >= lvl[n - 1]) return n - 1;
  // binary-ish linear scan (levels ≤ 32)
  for (let i = 1; i < n; i++) {
    if (price < lvl[i]) return i - 1;
  }
  return n - 1;
}

// ─── Walk-forward ────────────────────────────────────────────────

/**
 * Walk-forward validation of a grid strategy.
 *
 * Splits klines into `folds` contiguous segments. For each fold:
 *   train = the `trainBars` bars BEFORE the fold,
 *   test  = the fold itself.
 * Bounds are computed from train only (no lookahead), then simulated
 * on the test window. Metrics aggregated: hitRate (share of folds with
 * netWithUnrealPct > 0), medianNetPct, perBarPct, worstFold.
 *
 * `boundsFn(trainKlines) → {lower,upper,step,levels}|null`
 */
export function walkForwardGrid(kl, boundsFn, opts = {}) {
  const folds = Math.max(2, Math.min(6, opts.folds ?? 3));
  const trainBars = Math.max(20, opts.trainBars ?? Math.floor(kl.length / (folds + 1)));
  if (!kl || kl.length < trainBars + folds * 10) return null;

  const foldLen = Math.floor((kl.length - trainBars) / folds);
  if (foldLen < 10) return null;

  const out = [];
  for (let f = 0; f < folds; f++) {
    const train = kl.slice(f * foldLen, f * foldLen + trainBars);
    const test = kl.slice(f * foldLen + trainBars, (f + 1) * foldLen + trainBars);
    if (test.length < 10) continue;
    const b = boundsFn(train);
    if (!b || !(b.upper > b.lower)) continue;
    const sim = simulateGrid(test, b);
    if (!sim) continue;
    out.push({
      fold: f,
      train: [train[0].c, train[train.length - 1].c],
      test,
      bounds: b,
      sim,
      netPct: sim.netWithUnrealPct,
    });
  }
  if (!out.length) return null;

  const nets = out.map((x) => x.netPct).sort((a, b) => a - b);
  const median = nets[Math.floor(nets.length / 2)];
  const hits = nets.filter((v) => v > 0).length;
  const totalBars = out.reduce((a, x) => a + x.test.length, 0);
  return {
    folds: out,
    hitRate: hits / out.length,
    medianNetPct: median,
    perBarPct: nets.reduce((a, b) => a + b, 0) / totalBars,
    worstFold: nets[0],
    bestFold: nets[nets.length - 1],
  };
}

// ─── Percentile composite (Swing) ────────────────────────────────

/**
 * Cross-sectional percentile composite for Swing rows.
 * Ranks each metric across the scanned universe and averages the
 * percentile ranks (grid-friendly directions: low ADX, high chop,
 * low Hurst, many crossings, high vol/mcap, ATR% mid-band).
 * Returns 0..100 or null when too few metrics are available.
 */
export function swingPercentileComposite(row, allRows) {
  if (!row || !Array.isArray(allRows) || allRows.length < 3) return null;
  const dirs = {
    adx: -1,     // lower is better
    chop: +1,
    hurst: -1,
    maX: +1,
    vm: +1,
    atrp: 0,     // mid-band 2..8 is best — handled specially below
  };
  const vals = {};
  for (const k of Object.keys(dirs)) {
    vals[k] = allRows
      .map((r) => r?.raw?.[k])
      .filter((v) => v != null && isFinite(v));
  }
  const parts = [];
  for (const [k, sign] of Object.entries(dirs)) {
    const v = row?.raw?.[k];
    if (v == null || !isFinite(v) || vals[k].length < 3) continue;
    const sorted = vals[k].slice().sort((a, b) => a - b);
    // percentile rank of v
    let below = 0;
    for (const x of sorted) if (x < v) below++;
    const pr = (below / (sorted.length - 1)) * 100;
    parts.push(sign === 0 ? midBandScore(v, sorted) : sign > 0 ? pr : 100 - pr);
  }
  if (parts.length < 3) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function midBandScore(v, sorted) {
  // Distance-based mid-band score: 100 at the centre of [p25, p75],
  // falling to 0 at the extremes of the universe.
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (hi <= lo) return 50;
  const mid = (p25 + p75) / 2;
  const halfBand = Math.max(1e-9, (p75 - p25) / 2);
  const dist = Math.abs(v - mid);
  if (dist <= halfBand) return 100 - (dist / halfBand) * 20; // 80..100 inside band
  const outer = Math.max(1e-9, (hi - lo) / 2 - halfBand);
  return Math.max(0, 80 - ((dist - halfBand) / outer) * 80);
}
