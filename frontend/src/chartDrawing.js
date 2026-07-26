// ═══════════════════════════════════════════════════════════════
//  chartDrawing.js — pure coordinate / snap / hit-test helpers
//  for the price chart drawing tools (hray / tline / aray / atline
//  / brush / long / short) and auto-trendline detection.
//
//  All helpers here are state-free: they read `ch` (the chart object)
//  and an optional `ctx` for injected dependencies (live price source,
//  bar seconds, line colors). They never mutate `S` or `ch`.
//
//  Render functions (canvas drawing) and event handlers stay in
//  main.js because they need DOM and global state.
// ═══════════════════════════════════════════════════════════════

import { TZ_OFFSET_S, toChartTime } from './state.js';

// ─── Defaults ───────────────────────────────────────────────────────────────

/** Seconds per timeframe string. Used as fallback when chart has < 2 candles. */
const TF_SECONDS = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '1d': 86400, '3d': 259200, '1w': 604800,
};

const DEFAULT_LINE_COLORS = {
  hray:  '#f97316',
  tline: '#22c55e',
  aray:  '#ef4444',
  atline:'#3b82f6',
  autotl:'#38bdf8',
};

/**
 * Default ctx shape. Callers can override individual fields.
 *   tk:        ticker map {sym: {p, ...}}
 *   fsSym:     current fullscreen symbol
 *   fsCharts:  array of fs charts (for tf lookup)
 *   tf:        active tf for grid charts
 *   lineColors: {hray, tline, aray, atline, autotl}
 */
function makeCtx(over = {}) {
  return {
    tk: null,
    fsSym: null,
    fsCharts: [],
    tf: '15m',
    lineColors: { ...DEFAULT_LINE_COLORS },
    ...over,
  };
}

// ─── Generic ────────────────────────────────────────────────────────────────

/** Deep-clone an array of drawings. Uses structuredClone when available. */
export function cloneDrawings(drawings) {
  if (typeof structuredClone === 'function') return structuredClone(drawings || []);
  return JSON.parse(JSON.stringify(drawings || []));
}

/** Resolve the colour for a drawing. Honours per-drawing override first,
 *  then S.lineColors[type], then DEFAULT_LINE_COLORS[type]. */
export function drawingLineColor(d, ctx = makeCtx()) {
  if (d?.color && typeof d.color === 'string' && d.color.startsWith('#')) return d.color;
  const k = d?.type === 'hray' ? 'hray'
          : d?.type === 'tline' ? 'tline'
          : d?.type === 'aray' ? 'aray'
          : d?.type === 'atline' ? 'atline'
          : null;
  if (k) {
    const overrides = ctx.lineColors || {};
    const c = overrides[k] || DEFAULT_LINE_COLORS[k];
    if (typeof c === 'string' && c.startsWith('#')) return c;
  }
  return '#888888';
}

/** Compute entry/TP/SL prices for long/short trade drawings.
 *  Lazily fills slPrice/tpPrice from p2 distance if missing. Mutates d. */
export function getTradeParams(d) {
  const isLong = d.type === 'long';
  const entryPrice = d.p1.price;
  if (d.slPrice == null) {
    const slDist = Math.abs(entryPrice - (d.p2?.price ?? entryPrice));
    const rr = d.rr ?? 2;
    d.slPrice = isLong ? entryPrice - slDist : entryPrice + slDist;
    d.tpPrice = isLong ? entryPrice + slDist * rr : entryPrice - slDist * rr;
  }
  return { isLong, entryPrice, tpPrice: d.tpPrice, slPrice: d.slPrice };
}

// ─── Coordinate conversion ──────────────────────────────────────────────────

/** Chart time (seconds, TZ-shifted) → canvas X. Extrapolates beyond the
 *  last candle using spacing of the last two candles. Returns null when
 *  the chart has no timeScale or fewer than 2 candles. */
export function timeToCoordX(ch, time) {
  if (!ch?.lc) return null;
  const ts = ch.lc.timeScale();
  const x = ts.timeToCoordinate(time);
  if (x != null) return x;
  if (ch.candles?.length >= 2) {
    const last = ch.candles[ch.candles.length - 1];
    const prev = ch.candles[ch.candles.length - 2];
    const t2 = toChartTime(last.t), t1 = toChartTime(prev.t);
    const x2 = ts.timeToCoordinate(t2), x1 = ts.timeToCoordinate(t1);
    if (x2 != null && x1 != null && t2 !== t1) {
      return x2 + (time - t2) * (x2 - x1) / (t2 - t1);
    }
    if (x2 != null) return x2 + 50; // fallback
  }
  return null;
}

/** Canvas pixel (x, y) → {time, price}. Extrapolates time if x is to
 *  the right of the last candle. Returns null when cs/lc missing or
 *  x is out of view to the left with insufficient data. */
export function pixelToPoint(ch, x, y) {
  if (!ch?.lc || !ch?.cs) return null;
  let time = ch.lc.timeScale().coordinateToTime(x);
  const price = ch.cs.coordinateToPrice(y);
  if (price == null) return null;
  if (time == null && ch.candles?.length >= 2) {
    const ts = ch.lc.timeScale();
    const last = ch.candles[ch.candles.length - 1];
    const prev = ch.candles[ch.candles.length - 2];
    const t1 = toChartTime(prev.t), t2 = toChartTime(last.t);
    const x1 = ts.timeToCoordinate(t1), x2 = ts.timeToCoordinate(t2);
    if (x1 != null && x2 != null && Math.abs(x2 - x1) > 0) {
      const secPerPx = (t2 - t1) / (x2 - x1);
      time = Math.round(t2 + (x - x2) * secPerPx);
    }
  }
  if (time == null) return null;
  return { time, price };
}

// ─── Bar / candle helpers ───────────────────────────────────────────────────

/** Width of one bar in seconds (TZ-shifted). Falls back to the active tf
 *  from ctx when the chart has fewer than 2 candles. */
export function inferBarChartSec(ch, ctx = makeCtx()) {
  if (ch?.candles?.length >= 2) {
    const t1 = toChartTime(ch.candles[ch.candles.length - 2].t);
    const t2 = toChartTime(ch.candles[ch.candles.length - 1].t);
    return Math.max(1, t2 - t1);
  }
  const inFs = ctx.fsCharts?.includes(ch);
  const tf = inFs ? ch.tf : ctx.tf;
  return TF_SECONDS[tf] || 60;
}

/** Live ticker price for OHLC snap; falls back to last candle close. */
export function chartLivePriceForSnap(ch, ctx = makeCtx()) {
  const sym = ch?.sym || ctx.fsSym;
  if (sym && ctx.tk && ctx.tk[sym] != null && isFinite(+ctx.tk[sym].p)) {
    return +ctx.tk[sym].p;
  }
  if (ch?.candles?.length) return +ch.candles[ch.candles.length - 1].c;
  return null;
}

/** Pick the OHLC anchor key closest to `price`. */
export function inferOhlcAnchor(candle, price) {
  if (!candle || price == null || !isFinite(price)) return 'c';
  const map = { o: candle.o, h: candle.h, l: candle.l, c: candle.c };
  let best = 'c', bestD = Infinity;
  for (const [k, v] of Object.entries(map)) {
    if (v == null || !isFinite(v)) continue;
    const d = Math.abs(v - price);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// ─── Snap ───────────────────────────────────────────────────────────────────

/**
 * Convert a pixel position to a drawing point, with optional OHLC magnet.
 *
 *   ctrl = false (default): free placement — keeps the raw pixel price,
 *     snaps only time to the virtual bar grid for projections beyond the
 *     last candle.
 *   ctrl = true: magnet to nearest candle and OHLC level (or live price).
 *
 * Returns { time, price, tMs?, anchor? } or null.
 */
export function snapPoint(ch, x, y, ctrl = false, ctx = makeCtx()) {
  const raw = pixelToPoint(ch, x, y);
  if (!raw) return null;
  if (!ch?.candles?.length || !ch.cs || !ch.lc) return raw;
  const ts = ch.lc.timeScale();
  const barSec = inferBarChartSec(ch, ctx);
  const last = ch.candles[ch.candles.length - 1];
  const tLast = toChartTime(last.t);
  let tSnapped;
  if (raw.time > tLast) {
    const k = Math.round((raw.time - tLast) / barSec);
    tSnapped = tLast + k * barSec;
  } else {
    if (!ctrl) {
      // Free placement within data range
      return {
        time: raw.time, price: raw.price,
        tMs: (raw.time - TZ_OFFSET_S) * 1000,
        anchor: 'c',
      };
    }
    let bestC = null, bestDx = Infinity;
    for (const c of ch.candles) {
      const bx = ts.timeToCoordinate(toChartTime(c.t));
      if (bx == null) continue;
      const d = Math.abs(bx - x);
      if (d < bestDx) { bestDx = d; bestC = c; }
    }
    if (!bestC) return raw;
    tSnapped = toChartTime(bestC.t);
  }
  if (!ctrl) {
    // Free placement beyond last candle: keep raw price, snap only time.
    return {
      time: tSnapped, price: raw.price,
      tMs: (tSnapped - TZ_OFFSET_S) * 1000,
      anchor: 'c',
    };
  }
  let ohlcCandle = last;
  if (!(raw.time > tLast)) {
    let bestC = null, bestDx = Infinity;
    for (const c of ch.candles) {
      const bx = ts.timeToCoordinate(toChartTime(c.t));
      if (bx == null) continue;
      const d = Math.abs(bx - x);
      if (d < bestDx) { bestDx = d; bestC = c; }
    }
    if (!bestC) return { time: tSnapped, price: raw.price };
    ohlcCandle = bestC;
  }
  const ohlc = [ohlcCandle.o, ohlcCandle.h, ohlcCandle.l, ohlcCandle.c];
  const live = chartLivePriceForSnap(ch, ctx);
  const candidates = live != null && isFinite(live) ? [...ohlc, live] : ohlc;
  const anchors = ['o', 'h', 'l', 'c'];
  if (live != null && isFinite(live)) anchors.push('live');
  let bestP = candidates[0], bestDist = Infinity, anchor = 'c';
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    if (p == null || !isFinite(p)) continue;
    const d = Math.abs(p - raw.price);
    if (d < bestDist) { bestDist = d; bestP = p; anchor = anchors[i] || 'c'; }
  }
  const anchorCandle = ohlcCandle || last;
  if (anchor === 'live') anchor = 'c';
  return { time: tSnapped, price: bestP, tMs: anchorCandle.t, anchor };
}

/**
 * Snap a freshly-created drawing point to the current TF's candle grid.
 * Points OUTSIDE the data range (right of last candle or left of first)
 * keep their extrapolated time — otherwise the user couldn't draw a
 * projection past the right edge.
 *
 * anchor='c' (freehand / free snap) preserves the original price;
 * otherwise OHLC anchor prices are taken from the nearest candle.
 */
export function resolveDrawPoint(ch, pt) {
  if (!pt || !ch?.candles?.length) return pt;
  let tMs = pt.tMs;
  if (tMs == null && pt.time != null && isFinite(pt.time)) {
    tMs = (pt.time - TZ_OFFSET_S) * 1000;
  }
  if (tMs == null) return pt;
  let best = ch.candles[0], bestD = Infinity;
  for (const c of ch.candles) {
    const d = Math.abs(c.t - tMs);
    if (d < bestD) { bestD = d; best = c; }
  }
  const lastC = ch.candles[ch.candles.length - 1];
  const firstC = ch.candles[0];
  let time = toChartTime(best.t);
  if (pt.time != null && isFinite(pt.time)) {
    const tLast = toChartTime(lastC.t), tFirst = toChartTime(firstC.t);
    if (pt.time > tLast || pt.time < tFirst) time = pt.time;
  }
  const anchor = pt.anchor || 'c';
  if (anchor === 'c') {
    return { time, price: pt.price, tMs: best.t, anchor: 'c' };
  }
  const byAnchor = { o: best.o, h: best.h, l: best.l, c: best.c };
  let price = byAnchor[anchor];
  if (price == null || !isFinite(price)) price = pt.price;
  return { time, price, tMs: best.t, anchor };
}

// ─── Hit testing ────────────────────────────────────────────────────────────

/** Distance in screen pixels from (px, py) to drawing `d`.
 *  Returns Infinity when the chart is uninitialised or the drawing is
 *  entirely off-screen. */
export function drawingDist(ch, d, px, py) {
  if (!ch?.cs || !ch?.lc) return Infinity;
  if (d.type === 'hray' || d.type === 'aray') {
    const p1 = resolveDrawPoint(ch, d.p1);
    const y = ch.cs.priceToCoordinate(p1.price);
    if (y === null) return Infinity;
    const x0 = timeToCoordX(ch, p1.time) ?? 0;
    if (px < x0 - 4) return Infinity;
    if (d.type === 'aray' && d.alertPct != null && d.alertPct > 0) {
      const bandH = Math.abs((ch.cs.priceToCoordinate(p1.price * (1 - d.alertPct / 100)) ?? y) - y);
      return Math.max(Math.abs(py - y) - bandH, 0);
    }
    return Math.abs(py - y);
  }
  if (d.type === 'tline' || d.type === 'atline') {
    const p1 = resolveDrawPoint(ch, d.p1), p2 = resolveDrawPoint(ch, d.p2);
    const x1 = timeToCoordX(ch, p1.time);
    const y1 = ch.cs.priceToCoordinate(p1.price);
    const x2 = timeToCoordX(ch, p2.time);
    const y2 = ch.cs.priceToCoordinate(p2.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return Infinity;
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    // For atline: extend hit-test beyond segment so RMB deletion works reliably
    const t = d.type === 'atline'
      ? ((px - x1) * dx + (py - y1) * dy) / len2
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  if (d.type === 'brush') {
    if (!d.pts || d.pts.length < 2) return Infinity;
    let best = Infinity;
    for (let i = 1; i < d.pts.length; i++) {
      const ax = timeToCoordX(ch, d.pts[i - 1].time), ay = ch.cs.priceToCoordinate(d.pts[i - 1].price);
      const bx = timeToCoordX(ch, d.pts[i].time),     by = ch.cs.priceToCoordinate(d.pts[i].price);
      if (ax == null || ay == null || bx == null || by == null) continue;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      let dist;
      if (len2 === 0) dist = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist < best) best = dist;
    }
    return best;
  }
  if (d.type === 'long' || d.type === 'short') {
    if (!d.p1 || !d.p2 || !ch.cs || !ch.lc) return Infinity;
    const { entryPrice, tpPrice, slPrice } = getTradeParams(d);
    const lrx1 = timeToCoordX(ch, d.p1.time), lrx2 = timeToCoordX(ch, d.p2.time);
    if (lrx1 == null || lrx2 == null) return Infinity;
    const yE = ch.cs.priceToCoordinate(entryPrice);
    const yT = ch.cs.priceToCoordinate(tpPrice);
    const yS = ch.cs.priceToCoordinate(slPrice);
    if (yE == null || yT == null || yS == null) return Infinity;
    const lx = Math.min(lrx1, lrx2), rx = Math.max(lrx1, lrx2);
    if (px < lx - 8 || px > rx + 8) return Infinity;
    return Math.min(Math.abs(py - yE), Math.abs(py - yT), Math.abs(py - yS));
  }
  return Infinity;
}

/** Find the index of the nearest drawing within `hitPx`. -1 if none. */
export function findDrawingNear(ch, px, py, hitPx = 8) {
  let bestIdx = -1, bestDist = hitPx;
  for (let i = 0; i < ch.drawings.length; i++) {
    const d = drawingDist(ch, ch.drawings[i], px, py);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

// ─── Auto-trendline detection ──────────────────────────────────────────────

/** Find local highs/lows in candles with given pivot lookback. */
export function findPivots(candles, lb) {
  const highs = [], lows = [];
  for (let i = lb; i < candles.length - lb; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= lb; j++) {
      if (candles[i - j].h >= candles[i].h || candles[i + j].h > candles[i].h) isH = false;
      if (candles[i - j].l <= candles[i].l || candles[i + j].l < candles[i].l) isL = false;
    }
    if (isH) highs.push({ i, t: candles[i].t, p: candles[i].h });
    if (isL) lows.push({ i, t: candles[i].t, p: candles[i].l });
  }
  return { highs, lows };
}

/** Count touches of a line segment [i0,i1] within `touchPct` of lows (support)
 *  or highs (resistance). Returns 0 when the segment is shorter than 4 bars. */
export function trendLineTouches(candles, i0, p0, i1, p1, touchPct, side) {
  const a = Math.min(i0, i1), b = Math.max(i0, i1);
  if (b - a < 4) return 0;
  let touches = 0;
  for (let i = a; i <= b; i++) {
    const expected = p0 + (p1 - p0) * (i - i0) / (i1 - i0);
    const tol = Math.max(Math.abs(expected) * touchPct / 100, 1e-12);
    const c = candles[i];
    if (side === 'support') {
      if (Math.abs(c.l - expected) <= tol) touches++;
    } else if (Math.abs(c.h - expected) <= tol) touches++;
  }
  return touches;
}

const AUTO_TREND_DEFAULTS = {
  pivotBars: 4,
  lookback: 200,
  touchPct: 0.6,
  minTouches: 3,
  maxLines: 6,
  extendBars: 12,
};

/** Detect auto-trendlines on `candles`. Returns array of
 *  { side: 'support'|'resistance', p1, p2 } (p1/p2 in chart-time space).
 *  Pure except for reading the option defaults. */
export function detectAutoTrendlines(candles, opt = {}) {
  if (!candles || candles.length < 20) return [];
  const o = { ...AUTO_TREND_DEFAULTS, ...opt };
  const lb = Math.max(2, Math.min(8, o.pivotBars | 0));
  const look = Math.max(40, Math.min(candles.length, o.lookback | 0));
  const slice = candles.slice(-look);
  const off = candles.length - slice.length;
  const { highs, lows } = findPivots(slice, lb);
  const raw = [];
  const tryPairs = (pts, side) => {
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const i0 = pts[a].i + off, i1 = pts[b].i + off;
        const touches = trendLineTouches(candles, i0, pts[a].p, i1, pts[b].p, o.touchPct, side);
        if (touches < (o.minTouches | 0)) continue;
        const span = i1 - i0;
        const slope = (pts[b].p - pts[a].p) / span;
        if (side === 'support' && slope < -1e-12) continue;
        if (side === 'resistance' && slope > 1e-12) continue;
        raw.push({ side, i0, i1, p0: pts[a].p, p1: pts[b].p, touches, score: touches * 12 + span });
      }
    }
  };
  tryPairs(lows, 'support');
  tryPairs(highs, 'resistance');
  raw.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const ln of raw) {
    if (picked.some(p => Math.abs(p.i0 - ln.i0) <= lb * 2 && Math.abs(p.i1 - ln.i1) <= lb * 3)) continue;
    picked.push(ln);
    if (picked.length >= (o.maxLines | 0)) break;
  }
  const ext = Math.max(0, o.extendBars | 0);
  const lastI = candles.length - 1;
  return picked.map(ln => {
    const iEnd = Math.min(lastI, ln.i1 + ext);
    const iStart = Math.max(0, ln.i0 - Math.floor(ext * 0.35));
    const pEnd = ln.p0 + (ln.p1 - ln.p0) * (iEnd - ln.i0) / (ln.i1 - ln.i0);
    const pStart = ln.p0 + (ln.p1 - ln.p0) * (iStart - ln.i0) / (ln.i1 - ln.i0);
    return {
      side: ln.side,
      p1: { time: toChartTime(candles[iStart].t), price: pStart, tMs: candles[iStart].t },
      p2: { time: toChartTime(candles[iEnd].t),   price: pEnd,   tMs: candles[iEnd].t },
    };
  });
}

// Re-export the makeCtx helper for callers that want to construct a ctx
// without depending on global `S`.
export { makeCtx as makeDrawingCtx, TF_SECONDS as TF_SECONDS_TABLE };
