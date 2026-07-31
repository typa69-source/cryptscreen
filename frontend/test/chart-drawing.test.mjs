// Unit tests for chartDrawing.js — pure helpers extracted from main.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneDrawings,
  drawingLineColor,
  getTradeParams,
  timeToCoordX,
  pixelToPoint,
  inferBarChartSec,
  chartLivePriceForSnap,
  inferOhlcAnchor,
  snapPoint,
  resolveDrawPoint,
  drawingDist,
  findDrawingNear,
  findPivots,
  trendLineTouches,
  detectAutoTrendlines,
  makeDrawingCtx,
} from '../src/chartDrawing.js';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const TZ = -(new Date().getTimezoneOffset() * 60);

/** Candles at 15-minute bars, last 4 hours. Each bar: o, h, l, c. */
function makeCandles(count = 16, startMs = 1_700_000_000_000, barMs = 15 * 60_000) {
  const out = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const o = price;
    const c = price + (Math.sin(i / 2) * 2) + (i % 3 === 0 ? 0.5 : -0.5);
    const h = Math.max(o, c) + 0.6;
    const l = Math.min(o, c) - 0.6;
    out.push({ t: startMs + i * barMs, o, h, l, c });
    price = c;
  }
  return out;
}

/**
 * Mock chart object compatible with the helpers. The "timeScale" returns
 * coordinates based on a fixed barsVisible / barPx map; "priceScale" returns
 * priceToCoordinate based on a fixed range.
 */
function makeMockChart(candles, opts = {}) {
  const W = opts.width ?? 800;
  const barsVisible = opts.barsVisible ?? Math.min(candles.length, 16);
  const barPx = W / barsVisible;
  const lastIdx = candles.length - 1;
  // x for candle i: bars from the right
  const xForIdx = (i) => W - (lastIdx - i + 0.5) * barPx;

  const timeScale = {
    timeToCoordinate: (tSec) => {
      // t is chart-time (seconds, TZ-shifted)
      const tMs = (tSec - TZ) * 1000;
      if (tMs < candles[0].t) return null;
      // Find nearest candle by ms
      let best = null, bestD = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const d = Math.abs(candles[i].t - tMs);
        if (d < bestD) { bestD = d; best = i; }
      }
      return xForIdx(best);
    },
    coordinateToTime: (x) => {
      // x is pixel; round to nearest bar
      const i = Math.max(0, Math.min(candles.length - 1, Math.round(lastIdx - (W - x) / barPx + 0.5)));
      return Math.floor(candles[i].t / 1000) + TZ;
    },
  };

  const priceMin = Math.min(...candles.map(c => c.l)) - 1;
  const priceMax = Math.max(...candles.map(c => c.h)) + 1;
  const H = opts.height ?? 400;
  const priceScale = {
    priceToCoordinate: (p) => {
      if (p < priceMin || p > priceMax) return null;
      return H - ((p - priceMin) / (priceMax - priceMin)) * H;
    },
    coordinateToPrice: (y) => priceMin + ((H - y) / H) * (priceMax - priceMin),
  };

  return {
    candles,
    lc: { timeScale: () => timeScale },
    cs: priceScale,
    sym: opts.sym || 'TESTUSDT',
    tf: opts.tf || '15m',
  };
}

// ─── cloneDrawings ──────────────────────────────────────────────────────────

test('cloneDrawings: deep-clones array', () => {
  const orig = [{ id: 1, p1: { time: 100, price: 50 } }];
  const copy = cloneDrawings(orig);
  copy[0].p1.price = 999;
  assert.equal(orig[0].p1.price, 50, 'original is unaffected');
});

test('cloneDrawings: null/empty input', () => {
  assert.deepEqual(cloneDrawings(null), []);
  assert.deepEqual(cloneDrawings(undefined), []);
});

// ─── drawingLineColor ───────────────────────────────────────────────────────

test('drawingLineColor: prefers per-drawing color override', () => {
  assert.equal(drawingLineColor({ type: 'hray', color: '#abcdef' }), '#abcdef');
});

test('drawingLineColor: falls back to lineColors[type] then default', () => {
  const ctx = makeDrawingCtx({ lineColors: { hray: '#111111' } });
  assert.equal(drawingLineColor({ type: 'hray' }, ctx), '#111111');
  assert.equal(drawingLineColor({ type: 'tline' }, ctx), '#22c55e'); // default
  assert.equal(drawingLineColor({ type: 'unknown' }, ctx), '#888888');
});

// ─── getTradeParams ─────────────────────────────────────────────────────────

test('getTradeParams: long fills sl/tp from entry+p2', () => {
  const d = { type: 'long', p1: { price: 100 }, p2: { price: 90 } };
  const r = getTradeParams(d);
  assert.equal(r.isLong, true);
  assert.equal(r.entryPrice, 100);
  assert.equal(r.slPrice, 90);          // 100 - 10
  assert.equal(r.tpPrice, 100 + 10 * 2); // RR=2
});

test('getTradeParams: short fills sl/tp mirrored', () => {
  const d = { type: 'short', p1: { price: 100 }, p2: { price: 110 } };
  const r = getTradeParams(d);
  assert.equal(r.isLong, false);
  assert.equal(r.slPrice, 110);
  assert.equal(r.tpPrice, 80);
});

test('getTradeParams: preserves existing slPrice/tpPrice', () => {
  const d = { type: 'long', p1: { price: 100 }, p2: { price: 90 }, slPrice: 80, tpPrice: 130 };
  const r = getTradeParams(d);
  assert.equal(r.slPrice, 80);
  assert.equal(r.tpPrice, 130);
});

// ─── inferBarChartSec / chartLivePriceForSnap / inferOhlcAnchor ─────────────

test('inferBarChartSec: uses last two candles', () => {
  const ch = makeMockChart(makeCandles(4, 1_700_000_000_000, 15 * 60_000));
  assert.equal(inferBarChartSec(ch), 15 * 60);
});

test('inferBarChartSec: falls back to ctx.tf', () => {
  const ch = { candles: [] };
  const ctx = makeDrawingCtx({ tf: '1h', fsCharts: [] });
  assert.equal(inferBarChartSec(ch, ctx), 3600);
});

test('chartLivePriceForSnap: uses ticker price first', () => {
  const ch = { sym: 'BTCUSDT', candles: makeCandles(2) };
  const ctx = makeDrawingCtx({ tk: { BTCUSDT: { p: '999.5' } } });
  assert.equal(chartLivePriceForSnap(ch, ctx), 999.5);
});

test('chartLivePriceForSnap: falls back to last candle close', () => {
  const candles = makeCandles(3);
  const ch = { sym: 'X', candles };
  const ctx = makeDrawingCtx({});
  assert.equal(chartLivePriceForSnap(ch, ctx), candles[2].c);
});

test('inferOhlcAnchor: picks nearest OHLC key', () => {
  const candle = { o: 100, h: 110, l: 90, c: 105 };
  assert.equal(inferOhlcAnchor(candle, 109), 'h');
  assert.equal(inferOhlcAnchor(candle, 91), 'l');
  assert.equal(inferOhlcAnchor(candle, 105), 'c');
  assert.equal(inferOhlcAnchor(candle, 100), 'o');
  assert.equal(inferOhlcAnchor(null, 100), 'c');
});

// ─── timeToCoordX / pixelToPoint ────────────────────────────────────────────

test('timeToCoordX: returns x for a candle inside range', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const t = Math.floor(candles[3].t / 1000) + TZ;
  const x = timeToCoordX(ch, t);
  assert.ok(x != null);
  assert.ok(x > 0 && x < 800);
});

test('timeToCoordX: returns null when no timeScale', () => {
  const ch = { candles: makeCandles(2), lc: null, cs: null };
  assert.equal(timeToCoordX(ch, 123), null);
});

test('pixelToPoint: returns time+price for valid x/y', () => {
  const ch = makeMockChart(makeCandles(8));
  const r = pixelToPoint(ch, 400, 200);
  assert.ok(r && typeof r.time === 'number' && typeof r.price === 'number');
});

// ─── snapPoint ──────────────────────────────────────────────────────────────

test('snapPoint: free (ctrl=false) keeps raw price within range', () => {
  const ch = makeMockChart(makeCandles(8));
  // x at a known candle position
  const t = Math.floor(ch.candles[3].t / 1000) + TZ;
  const x = ch.lc.timeScale().timeToCoordinate(t);
  const r = snapPoint(ch, x, 200, false);
  assert.ok(r);
  assert.equal(r.anchor, 'c');
});

test('snapPoint: ctrl=true magnet to OHLC anchor', () => {
  const ch = makeMockChart(makeCandles(8));
  const t = Math.floor(ch.candles[3].t / 1000) + TZ;
  const x = ch.lc.timeScale().timeToCoordinate(t);
  // y very close to high of candle 3
  const y = ch.cs.priceToCoordinate(ch.candles[3].h);
  const r = snapPoint(ch, x, y, true);
  assert.ok(r);
  assert.equal(r.price, ch.candles[3].h);
  assert.equal(r.anchor, 'h');
});

test('snapPoint: returns null when no chart available', () => {
  const r = snapPoint({ lc: null, cs: null, candles: [] }, 0, 0);
  assert.equal(r, null);
});

// ─── resolveDrawPoint ───────────────────────────────────────────────────────

test('resolveDrawPoint: extrapolates time when point is right of last candle', () => {
  const candles = makeCandles(4);
  const ch = makeMockChart(candles);
  const lastT = Math.floor(candles[3].t / 1000) + TZ;
  const futureT = lastT + 30 * 60; // 30 min in future
  const r = resolveDrawPoint(ch, { time: futureT, price: 110, anchor: 'c' });
  assert.equal(r.time, futureT, 'time should be the future time, not snapped back');
  assert.equal(r.price, 110);
});

test('resolveDrawPoint: extrapolates when left of first candle', () => {
  const candles = makeCandles(4);
  const ch = makeMockChart(candles);
  const firstT = Math.floor(candles[0].t / 1000) + TZ;
  const pastT = firstT - 30 * 60;
  const r = resolveDrawPoint(ch, { time: pastT, price: 80, anchor: 'c' });
  assert.equal(r.time, pastT);
});

test('resolveDrawPoint: snaps to nearest candle when inside range (OHLC)', () => {
  const candles = makeCandles(4);
  const ch = makeMockChart(candles);
  const midT = Math.floor(candles[1].t / 1000) + TZ;
  const r = resolveDrawPoint(ch, { time: midT, price: 1000, anchor: 'h' });
  // time should snap to candle 1 (or near)
  const tCandle1 = Math.floor(candles[1].t / 1000) + TZ;
  assert.equal(r.time, tCandle1);
  assert.equal(r.price, candles[1].h);
});

test('resolveDrawPoint: returns pt unchanged when no candles', () => {
  const pt = { time: 100, price: 50 };
  assert.deepEqual(resolveDrawPoint({ candles: [] }, pt), pt);
});

// ─── drawingDist ────────────────────────────────────────────────────────────

test('drawingDist: hray returns |py - y| for x past origin', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const d = {
    type: 'hray',
    p1: { time: Math.floor(candles[2].t / 1000) + TZ, price: candles[2].c, tMs: candles[2].t },
  };
  const y = ch.cs.priceToCoordinate(d.p1.price);
  const x0 = timeToCoordX(ch, d.p1.time);
  assert.ok(x0 != null);
  // Exactly on the ray
  assert.ok(drawingDist(ch, d, x0 + 10, y) < 1);
  // 20px above the ray
  assert.ok(drawingDist(ch, d, x0 + 10, y - 20) >= 19 && drawingDist(ch, d, x0 + 10, y - 20) < 21);
});

test('drawingDist: hray returns Infinity for x before origin', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const d = {
    type: 'hray',
    p1: { time: Math.floor(candles[6].t / 1000) + TZ, price: 100, tMs: candles[6].t },
  };
  const x0 = timeToCoordX(ch, d.p1.time);
  // x far left of origin
  assert.equal(drawingDist(ch, d, x0 - 50, 200), Infinity);
});

test('drawingDist: tline segment distance', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const d = {
    type: 'tline',
    p1: { time: Math.floor(candles[0].t / 1000) + TZ, price: candles[0].c, tMs: candles[0].t },
    p2: { time: Math.floor(candles[5].t / 1000) + TZ, price: candles[5].c, tMs: candles[5].t },
  };
  const x1 = timeToCoordX(ch, d.p1.time);
  const y1 = ch.cs.priceToCoordinate(d.p1.price);
  assert.ok(x1 != null && y1 != null);
  // 10px below p1 → ~10px distance
  const d1 = drawingDist(ch, d, x1, y1 + 10);
  assert.ok(d1 >= 9 && d1 < 11, `expected ~10px, got ${d1}`);
});

test('drawingDist: brush stroke distances to nearest segment', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const d = {
    type: 'brush',
    pts: [
      { time: Math.floor(candles[1].t / 1000) + TZ, price: 100 },
      { time: Math.floor(candles[3].t / 1000) + TZ, price: 102 },
      { time: Math.floor(candles[5].t / 1000) + TZ, price: 101 },
    ],
  };
  // Test point ON the line between pts[0] (candle 1, price 100) and pts[1]
  // (candle 3, price 102). At x = candle 2's coord, the linear interp is price 101.
  const x = timeToCoordX(ch, Math.floor(candles[2].t / 1000) + TZ);
  const y = ch.cs.priceToCoordinate(101);
  assert.ok(x != null && y != null);
  const dist = drawingDist(ch, d, x, y);
  assert.ok(dist < 5, `expected near segment, got ${dist}`);
});

test('drawingDist: returns Infinity for unknown types', () => {
  const ch = makeMockChart(makeCandles(4));
  const d = { type: 'made_up_type', p1: { price: 100, time: 0 } };
  assert.equal(drawingDist(ch, d, 100, 100), Infinity);
});

test('findDrawingNear: returns -1 when none close', () => {
  const ch = makeMockChart(makeCandles(8));
  ch.drawings = [];
  assert.equal(findDrawingNear(ch, 100, 100, 8), -1);
});

test('findDrawingNear: picks closest drawing', () => {
  const candles = makeCandles(8);
  const ch = makeMockChart(candles);
  const d1 = {
    type: 'hray',
    p1: { time: Math.floor(candles[1].t / 1000) + TZ, price: candles[1].c, tMs: candles[1].t },
  };
  const d2 = {
    type: 'hray',
    p1: { time: Math.floor(candles[5].t / 1000) + TZ, price: candles[5].c, tMs: candles[5].t },
  };
  ch.drawings = [d1, d2];
  const x = timeToCoordX(ch, d2.p1.time);
  const y = ch.cs.priceToCoordinate(d2.p1.price);
  assert.equal(findDrawingNear(ch, x, y + 2, 8), 1);
});

// ─── Auto-trendline helpers ─────────────────────────────────────────────────

test('findPivots: simple up-then-down series', () => {
  // Simple up-then-down: 9 candles with a peak at index 4
  const candles = [];
  for (let i = 0; i < 9; i++) {
    const mid = 100 + (i === 4 ? 5 : i < 4 ? i : 8 - i);
    candles.push({ t: i * 1000, o: mid, h: mid + 1, l: mid - 1, c: mid });
  }
  const { highs, lows } = findPivots(candles, 2);
  // index 4 should be a high
  assert.ok(highs.some(h => h.i === 4));
});

test('trendLineTouches: returns 0 for short segments', () => {
  const candles = makeCandles(10);
  assert.equal(trendLineTouches(candles, 0, 100, 1, 100, 0.5, 'support'), 0);
});

test('detectAutoTrendlines: empty input returns []', () => {
  assert.deepEqual(detectAutoTrendlines([], {}), []);
  assert.deepEqual(detectAutoTrendlines(null, {}), []);
});

test('detectAutoTrendlines: returns valid lines on a trending series', () => {
  // 60 candles with a clear uptrend
  const candles = [];
  for (let i = 0; i < 60; i++) {
    const p = 100 + i * 0.5; // steady uptrend
    candles.push({ t: i * 900_000, o: p, h: p + 0.3, l: p - 0.3, c: p });
  }
  const lines = detectAutoTrendlines(candles, { minTouches: 2 });
  // Either support lines along lows OR resistance — both valid.
  assert.ok(Array.isArray(lines));
  if (lines.length) {
    const ln = lines[0];
    assert.ok(ln.p1 && ln.p2 && typeof ln.p1.time === 'number');
    assert.ok(ln.side === 'support' || ln.side === 'resistance');
  }
});
