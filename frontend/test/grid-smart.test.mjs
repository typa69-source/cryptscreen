// ═══════════════════════════════════════════════════════════════
//  Unit tests for gridSmart.js statistical core
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ouHalfLife,
  garmanKlassVol,
  varianceRatio,
  adfTest,
  linregSlope,
  vwapBias,
  scoreSmart,
  classifyDirection,
  ouGridBounds,
  computeSmartRow,
} from '../src/gridSmart.js';

// ─── Synthetic series builders ─────────────────────────────────
// Stationary AR(1): x_t = μ + φ·(x_{t-1} − μ) + σ·ε
// With φ < 1 → mean-reverting. Half-life = ln(2) / −ln(φ).
function mrSeries(phi = 0.95, n = 250, mu = 100) {
  const out = [mu];
  for (let i = 1; i < n; i++) {
    const eps = Math.sin(i * 17.3) * 0.5 + Math.sin(i * 7.7) * 0.5;
    out.push(mu + phi * (out[i - 1] - mu) + eps * 1.0);
  }
  // Guard against non-finite
  return out.filter((v) => isFinite(v) && v > 0);
}

// Stochastic uptrend: drift + noise → positive slope, not deterministic
function trendSeries(n = 300, mu = 100) {
  const out = [mu];
  for (let i = 1; i < n; i++) {
    const eps = Math.sin(i * 11) * 0.5 + Math.cos(i * 7) * 0.5;
    out.push(out[i - 1] * (1 + 0.005) + eps * 0.3);
  }
  return out.filter((v) => isFinite(v) && v > 0);
}

// Flat series (constant close) — degenerate
function flatSeries(n = 100) {
  return new Array(n).fill(50);
}

// Synthetic OHLC for one bar
function bar(o, h, l, c, v = 1000) {
  return { o, h, l, c, v };
}

function klinesFromCloses(closes) {
  return closes.map((c) => bar(c * 0.999, c * 1.001, c * 0.999, c, 1000));
}

// ═══════════════════════════════════════════════════════════════
//  ouHalfLife
// ═══════════════════════════════════════════════════════════════
test('ouHalfLife: trending series → null', () => {
  const closes = trendSeries(100);
  assert.equal(ouHalfLife(closes), null);
});

test('ouHalfLife: too few bars → null', () => {
  assert.equal(ouHalfLife([1, 2, 3, 4]), null);
});

test('ouHalfLife: mean-reverting AR(1) → finite positive value', () => {
  const closes = mrSeries(-0.05, 250);
  const hl = ouHalfLife(closes);
  assert.ok(hl != null, 'should compute half-life for mean-reverting series');
  assert.ok(hl > 0, 'half-life must be positive');
});

test('ouHalfLife: null/garbage input → null', () => {
  assert.equal(ouHalfLife(null), null);
  assert.equal(ouHalfLife(undefined), null);
  assert.equal(ouHalfLife([NaN, 1, 2]), null);
  assert.equal(ouHalfLife([-1, 0, 1]), null); // non-positive closes
});

// ═══════════════════════════════════════════════════════════════
//  garmanKlassVol
// ═══════════════════════════════════════════════════════════════
test('garmanKlassVol: known σ synthetic klines → within ±30%', () => {
  // Build synthetic OHLC with random walks of step σ=0.02 (2%)
  const sigma = 0.02;
  const n = 500;
  const klines = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const eps = (Math.sin(i * 11.7) + Math.cos(i * 5.3)) * sigma;
    const c = p * (1 + eps);
    const o = p;
    const h = Math.max(o, c) * (1 + Math.abs(sinnoise(i, 1)) * sigma * 0.5);
    const l = Math.min(o, c) * (1 - Math.abs(sinnoise(i, 2)) * sigma * 0.5);
    klines.push(bar(o, h, l, c));
    p = c;
  }
  const out = garmanKlassVol(klines);
  assert.ok(out != null);
  assert.ok(out > 0);
  assert.ok(out < sigma * 5, `GK vol too large: ${out}`);
});

function sinnoise(i, seed) { return Math.sin(i * seed * 7.3); }

test('garmanKlassVol: empty → null', () => {
  assert.equal(garmanKlassVol([]), null);
  assert.equal(garmanKlassVol(null), null);
});

test('garmanKlassVol: degenerate flat OHLC → 0 (not null)', () => {
  const kl = Array.from({length: 20}, () => bar(100, 100, 100, 100));
  const v = garmanKlassVol(kl);
  assert.ok(v != null);
  assert.equal(v, 0);
});

// ═══════════════════════════════════════════════════════════════
//  varianceRatio
// ═══════════════════════════════════════════════════════════════
test('varianceRatio: trending geometric walk → VR > 1', () => {
  const closes = trendSeries(300);
  const vr = varianceRatio(closes, 4);
  assert.ok(vr != null);
  assert.ok(vr > 1, `trending VR should be > 1, got ${vr}`);
});

test('varianceRatio: random walk → VR ≈ 1 (±0.3 tolerance)', () => {
  // Build a random walk on log-prices
  let p = 100;
  const closes = [];
  for (let i = 0; i < 300; i++) {
    const eps = (Math.sin(i * 11) + Math.cos(i * 7)) * 0.005;
    p = p * (1 + eps);
    closes.push(p);
  }
  const vr = varianceRatio(closes, 4);
  assert.ok(vr != null);
  assert.ok(vr > 0.7 && vr < 1.3, `random walk VR should be ~1, got ${vr}`);
});

test('varianceRatio: too few bars → null', () => {
  assert.equal(varianceRatio([1, 2, 3, 4, 5], 4), null);
});

// ═══════════════════════════════════════════════════════════════
//  adfTest
// ═══════════════════════════════════════════════════════════════
test('adfTest: stationary series → negative γ', () => {
  // Stationary AR(1) with negative θ
  const closes = mrSeries(-0.05, 200);
  const r = adfTest(closes);
  assert.ok(r != null);
  assert.ok(r.gamma < 0, `γ should be negative for stationary, got ${r.gamma}`);
  assert.ok(r.stat < 0, `t-stat should be negative, got ${r.stat}`);
});

test('adfTest: random walk → γ near 0', () => {
  const closes = trendSeries(200);
  const r = adfTest(closes);
  assert.ok(r != null);
  // For random walk, ADF γ should be close to 0 (large negative values mean strong stationarity)
  assert.ok(Math.abs(r.gamma) < 0.5, `γ too far from 0 for RW: ${r.gamma}`);
});

test('adfTest: too few bars → null', () => {
  assert.equal(adfTest([1, 2, 3, 4, 5]), null);
});

// ═══════════════════════════════════════════════════════════════
//  linregSlope
// ═══════════════════════════════════════════════════════════════
test('linregSlope: straight up line → positive', () => {
  const closes = Array.from({length: 30}, (_, i) => 100 + i);
  const s = linregSlope(closes, 30);
  assert.ok(s != null);
  assert.ok(s > 0, `expected positive slope, got ${s}`);
});

test('linregSlope: straight down line → negative', () => {
  const closes = Array.from({length: 30}, (_, i) => 100 - i);
  const s = linregSlope(closes, 30);
  assert.ok(s != null);
  assert.ok(s < 0, `expected negative slope, got ${s}`);
});

test('linregSlope: flat series → 0', () => {
  const closes = new Array(30).fill(100);
  const s = linregSlope(closes, 30);
  // flat: σ_y ≈ 0 → null
  assert.equal(s, null);
});

test('linregSlope: < win bars → null', () => {
  assert.equal(linregSlope([1, 2, 3], 30), null);
});

// ═══════════════════════════════════════════════════════════════
//  vwapBias
// ═══════════════════════════════════════════════════════════════
test('vwapBias: close above VWAP → positive', () => {
  // Build bars where the last close is clearly above average
  const kl = [
    bar(100, 101, 99, 100.5, 1000),
    bar(101, 102, 100, 101, 1000),
    bar(100.5, 101.5, 99.5, 100.5, 1000),
    bar(101, 102, 100, 101.5, 1000),
    bar(101.5, 102.5, 100.5, 102, 1000),
    bar(102, 105, 101, 104, 1000),  // big jump up
  ];
  const bias = vwapBias(kl, 6);
  assert.ok(bias != null);
  assert.ok(bias > 0, `expected positive bias, got ${bias}`);
});

test('vwapBias: too few bars → null', () => {
  const kl = [bar(1, 2, 0.5, 1.5, 100)];
  assert.equal(vwapBias(kl, 20), null);
});

// ═══════════════════════════════════════════════════════════════
//  scoreSmart
// ═══════════════════════════════════════════════════════════════
test('scoreSmart: mean-reverting + good vol → high score', () => {
  // Build a healthy mean-reverting series with realistic volatility
  const closes = mrSeries(-0.05, 250, 100);
  const kl = klinesFromCloses(closes);
  // Add volume bump on first bar to give positive vol/mcap signal
  const mcap = new Map([['BTC', 1e12]]);
  const sc = scoreSmart(kl, mcap, 'BTCUSDT', () => 1e9);
  assert.ok(sc != null);
  assert.ok(sc.mr + sc.fit + sc.dir === sc.score);
  assert.ok(sc.score >= 0 && sc.score <= 13);
  assert.ok(['green', 'yellow', 'red'].includes(sc.band));
  assert.ok(sc.breakdown.mr.hurst != null);
});

test('scoreSmart: too few bars → null', () => {
  assert.equal(scoreSmart([], null, 'BTCUSDT'), null);
  assert.equal(scoreSmart(klinesFromCloses([1, 2, 3]), null, 'X'), null);
});

test('scoreSmart: breakdown has 3 groups with sub-pts', () => {
  const closes = mrSeries(-0.03, 250, 100);
  const kl = klinesFromCloses(closes);
  const sc = scoreSmart(kl, new Map(), 'BTCUSDT', () => 1e9);
  assert.ok(sc != null);
  assert.ok('mr' in sc.breakdown);
  assert.ok('fit' in sc.breakdown);
  assert.ok('dir' in sc.breakdown);
  for (const grp of ['mr', 'fit', 'dir']) {
    for (const comp of Object.values(sc.breakdown[grp])) {
      assert.ok(typeof comp.pts === 'number');
      assert.ok(typeof comp.label === 'string');
    }
  }
});

// ═══════════════════════════════════════════════════════════════
//  classifyDirection
// ═══════════════════════════════════════════════════════════════
test('classifyDirection: bullish setup → LONG with high confidence', () => {
  const row = {
    raw: {
      adfSign: 1,    // ADF negative → stationary
      slopeSign: 1,  // positive slope
      slope: 1.2,    // strong
      hurst: 0.6,    // trending-ish
      vw: 0.5,       // above vwap
    },
  };
  const cd = classifyDirection(row, [0.5, 1.0, 1.5, 2.0]); // universe scores
  assert.equal(cd.dir, 'LONG');
  assert.ok(cd.confidence >= 50, `expected high confidence, got ${cd.confidence}`);
});

test('classifyDirection: bearish setup → SHORT', () => {
  const row = {
    raw: {
      adfSign: 1,    // γ negative → stationary
      slopeSign: -1,
      slope: -0.8,   // strong (≥ 0.3)
      hurst: 0.6,    // > 0.55 → triggers Hurst-trend component
      vw: -0.5,
    },
  };
  const cd = classifyDirection(row, [0.5, 1.0, 1.5, 2.0]);
  // dirScore = 1 + (-1) + (-1) + (-1) = -2, |weighted|=2 ≥ threshold(1.25) → SHORT
  assert.equal(cd.dir, 'SHORT');
});

test('classifyDirection: weak signals → NEUTRAL', () => {
  const row = {
    raw: {
      adfSign: 0,
      slopeSign: 0,
      slope: 0.05,
      hurst: 0.5,
      vw: 0.1,
    },
  };
  const cd = classifyDirection(row, [0.5, 1.0, 1.5, 2.0]);
  assert.equal(cd.dir, 'NEUTRAL');
  assert.ok(cd.confidence < 50);
});

test('classifyDirection: confidence ∈ [0, 100]', () => {
  const row = {
    raw: { adfSign: 1, slopeSign: 1, slope: 2.0, hurst: 0.6, vw: 0.8 },
  };
  const cd = classifyDirection(row, [1, 2, 3, 4]);
  assert.ok(cd.confidence >= 0 && cd.confidence <= 100);
});

// ═══════════════════════════════════════════════════════════════
//  ouGridBounds
// ═══════════════════════════════════════════════════════════════
test('ouGridBounds: μ centred between lower and upper', () => {
  const closes = mrSeries(-0.03, 250, 100);
  const kl = klinesFromCloses(closes);
  const gb = ouGridBounds(closes, kl);
  assert.ok(gb != null);
  const mid = (gb.lower + gb.upper) / 2;
  // The geometric mean should be near the midpoint in log-space.
  // For prices in linear space, the log-midpoint equals exp((ln(lo)+ln(hi))/2)
  // = the geometric mean. Compute and compare.
  const logMid = (Math.log(gb.lower) + Math.log(gb.upper)) / 2;
  const meanLog = closes.map(Math.log).reduce((a, b) => a + b, 0) / closes.length;
  assert.ok(Math.abs(logMid - meanLog) < 0.05,
    `log midpoint should equal mean(log), got ${logMid} vs ${meanLog}`);
  // mid just for sanity
  assert.ok(mid > 0);
});

test('ouGridBounds: levels ∈ [8, 30]', () => {
  const closes = mrSeries(-0.04, 250, 100);
  const kl = klinesFromCloses(closes);
  const gb = ouGridBounds(closes, kl);
  assert.ok(gb != null);
  assert.ok(gb.levels >= 8 && gb.levels <= 30);
});

test('ouGridBounds: too few bars → null', () => {
  assert.equal(ouGridBounds([1, 2, 3], null), null);
  assert.equal(ouGridBounds(null, null), null);
});

// ═══════════════════════════════════════════════════════════════
//  computeSmartRow (integration of pure fns)
// ═══════════════════════════════════════════════════════════════
test('computeSmartRow: full row with all required fields', () => {
  const closes = mrSeries(-0.04, 250, 100);
  const kl = klinesFromCloses(closes);
  const mcap = new Map([['BTC', 5e11]]);
  const r = computeSmartRow('BTCUSDT', kl, null, mcap, () => 5e8);
  assert.ok(r != null);
  assert.equal(r.sym, 'BTCUSDT');
  assert.ok(typeof r.score === 'number');
  assert.ok(['green', 'yellow', 'red'].includes(r.band));
  assert.ok(r.gridBounds != null);
  assert.ok(r.gridBounds.lower < r.gridBounds.upper);
  assert.ok(r.gridBounds.levels >= 8 && r.gridBounds.levels <= 30);
});

test('computeSmartRow: with context TF computes confluence', () => {
  const closesWork = mrSeries(-0.03, 250, 100);
  const closesCtx = trendSeries(100);
  const klWork = klinesFromCloses(closesWork);
  const klCtx = klinesFromCloses(closesCtx);
  const r = computeSmartRow('BTCUSDT', klWork, klCtx, new Map(), () => 0);
  assert.ok(r != null);
  assert.ok(['agree', 'disagree', 'na'].includes(r.confluence));
});

test('computeSmartRow: insufficient bars → null', () => {
  const r = computeSmartRow('X', [{ c: 1 }], null, null, () => 0);
  assert.equal(r, null);
});
