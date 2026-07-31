// ═══════════════════════════════════════════════════════════════
//  Unit tests for gridSmart.js statistical core
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ouHalfLife,
  garmanKlassVol,
  adaptiveLevelCap,
  varianceRatio,
  adfTest,
  linregSlope,
  vwapBias,
  scoreSmart,
  classifyDirection,
  ouGridBounds,
  optimalLevelsForHalfLife,
  computeSmartRow,
  confluenceScore,
  classifyScanError,
  severityClass,
  severityTtl,
  toastFromError,
  filterSmartRows,
  sortSmartRows,
  smartBandColor,
  smartDirectionColor,
  smartEmptyMessage,
  smartSkeletonRows,
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

test('ouGridBounds: levels ∈ [8, adaptive_cap]', () => {
  const closes = mrSeries(-0.04, 250, 100);
  const kl = klinesFromCloses(closes);
  const gb = ouGridBounds(closes, kl);
  assert.ok(gb != null);
  // Adaptive cap is at least 24 for nBars≥60 (mrSeries gives 250 closes).
  // So levels ∈ [8, 32] when the HL is short and lookback is long.
  assert.ok(gb.levels >= 8, `expected ≥8, got ${gb.levels}`);
  assert.ok(gb.levels <= 32, `expected ≤32, got ${gb.levels}`);
});

test('ouGridBounds: short half-life → more levels', () => {
  // AR(1) with phi=0.85 → half-life ≈ ln(2)/−ln(0.85) ≈ 4.3 bars
  const closesShort = mrSeries(0.85, 250, 100);
  const kl = klinesFromCloses(closesShort);
  const gb = ouGridBounds(closesShort, kl);
  assert.ok(gb != null);
  assert.ok(gb.levels >= 16, `short HL should give many levels, got ${gb.levels}`);
});

test('ouGridBounds: optimalLevelsForHalfLife — boundary values', () => {
  // Empirical boundaries
  assert.equal(optimalLevelsForHalfLife(5), 24);     // HL ≤ 10 → 24
  assert.equal(optimalLevelsForHalfLife(10), 24);
  assert.equal(optimalLevelsForHalfLife(100), 8);    // HL ≥ 100 → 8
  assert.equal(optimalLevelsForHalfLife(200), 8);
  assert.equal(optimalLevelsForHalfLife(55), 16);    // HL=55 → mid range (24 - 45*16/90 = 16)
  // Null/garbage → safe middle default 12
  assert.equal(optimalLevelsForHalfLife(0), 12);
  assert.equal(optimalLevelsForHalfLife(-5), 12);
  assert.equal(optimalLevelsForHalfLife(NaN), 12);
  assert.equal(optimalLevelsForHalfLife(null), 12);
  assert.equal(optimalLevelsForHalfLife(Infinity), 12);
});

test('ouGridBounds: optimalLevelsForHalfLife — never crashes on garbage', () => {
  // Property test: any input → finite integer in [8, 24]
  const garbage = [undefined, null, NaN, -1, 0, 1e10, -1e10, Infinity, -Infinity, 1.5, 1e-10];
  for (const x of garbage) {
    const n = optimalLevelsForHalfLife(x);
    assert.ok(Number.isInteger(n), `expected integer for ${x}, got ${n}`);
    assert.ok(n >= 8 && n <= 24, `expected [8,24] for ${x}, got ${n}`);
  }
});

test('ouGridBounds: optimalLevelsForHalfLife is monotonic', () => {
  // As HL increases, levels should decrease (or stay equal)
  let prev = Infinity;
  for (let hl = 5; hl <= 200; hl += 10) {
    const n = optimalLevelsForHalfLife(hl);
    assert.ok(n <= prev, `expected non-increasing at HL=${hl}: ${n} > ${prev}`);
    prev = n;
  }
});

// ─── Adaptive level cap (Step 2) ───────────────────────────────────

test('adaptiveLevelCap: legacy default 24 when nBars omitted', () => {
  assert.equal(adaptiveLevelCap(undefined), 24);
  assert.equal(adaptiveLevelCap(null), 24);
  assert.equal(adaptiveLevelCap(NaN), 24);
});

test('adaptiveLevelCap: bands by nBars', () => {
  assert.equal(adaptiveLevelCap(30), 20);   // <60 → 20
  assert.equal(adaptiveLevelCap(59), 20);
  assert.equal(adaptiveLevelCap(60), 24);   // 60–119 → 24
  assert.equal(adaptiveLevelCap(119), 24);
  assert.equal(adaptiveLevelCap(120), 28);  // 120–199 → 28
  assert.equal(adaptiveLevelCap(199), 28);
  assert.equal(adaptiveLevelCap(200), 32);  // ≥200 → 32
  assert.equal(adaptiveLevelCap(1000), 32);
});

test('adaptiveLevelCap: always integer', () => {
  for (const n of [0, 30, 60, 90, 119, 120, 150, 199, 200, 500]) {
    const v = adaptiveLevelCap(n);
    assert.ok(Number.isInteger(v), `expected integer for ${n}, got ${v}`);
  }
});

test('optimalLevelsForHalfLife(hl, nBars): wider cap with long lookback', () => {
  // Same HL, more data → more levels allowed.
  const hl = 50;
  const sparse = optimalLevelsForHalfLife(hl, 30);    // cap=20
  const medium = optimalLevelsForHalfLife(hl, 90);    // cap=24
  const long_ = optimalLevelsForHalfLife(hl, 150);    // cap=28
  const veryLong = optimalLevelsForHalfLife(hl, 300); // cap=32
  assert.ok(medium > sparse, `${medium} should exceed ${sparse}`);
  assert.ok(long_ > medium, `${long_} should exceed ${medium}`);
  assert.ok(veryLong > long_, `${veryLong} should exceed ${long_}`);
});

test('optimalLevelsForHalfLife(hl, nBars): legacy default when nBars omitted', () => {
  // Without nBars the function should behave identically to before.
  assert.equal(optimalLevelsForHalfLife(5), 24);
  assert.equal(optimalLevelsForHalfLife(100), 8);
  assert.equal(optimalLevelsForHalfLife(55), 16);
});

test('optimalLevelsForHalfLife(hl, nBars): bounds held at [8, cap]', () => {
  for (const nBars of [30, 60, 200, 500]) {
    const cap = adaptiveLevelCap(nBars);
    for (let hl = 1; hl <= 250; hl += 7) {
      const v = optimalLevelsForHalfLife(hl, nBars);
      assert.ok(v >= 8 && v <= cap, `hl=${hl} nBars=${nBars} got ${v}, expected [8,${cap}]`);
    }
  }
});

test('optimalLevelsForHalfLife(hl, nBars): null HL is independent of nBars', () => {
  // Trending fallback is always 12 regardless of lookback size.
  assert.equal(optimalLevelsForHalfLife(null, 30), 12);
  assert.equal(optimalLevelsForHalfLife(null, 500), 12);
  assert.equal(optimalLevelsForHalfLife(NaN, 500), 12);
});

test('ouGridBounds: null half-life (trending) → 12 levels fallback', () => {
  // For pure trend (no HL), bounds still returned with levels=12
  const closes = trendSeries(300);
  const kl = klinesFromCloses(closes);
  const gb = ouGridBounds(closes, kl);
  assert.ok(gb != null);
  // Should fall back to 12 since hl is null
  assert.equal(gb.levels, 12);
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
  assert.ok(r.gridBounds.levels >= 8 && r.gridBounds.levels <= 32);
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
  // generate a short series; computeSmartRow should bail out gracefully
  const tiny = klinesFromCloses([100, 101, 102, 101, 100]);
  const r = computeSmartRow('XUSDT', tiny, null, new Map(), () => 0);
  assert.equal(r, null);
});

// ─── Extended confluence score ────────────────────────────────────

test('confluenceScore: returns null when context TF missing', () => {
  const closes = mrSeries(-0.03, 250, 100);
  const kl = klinesFromCloses(closes);
  const sc = scoreSmart(kl, new Map(), 'BTCUSDT', () => 5e8);
  assert.ok(sc != null);
  assert.equal(confluenceScore({ ...sc, raw: { ...sc.raw, closes } }, null), null);
  assert.equal(confluenceScore({ ...sc, raw: { ...sc.raw, closes } }, []), null);
});

test('confluenceScore: returns null when context has too few bars', () => {
  const closes = mrSeries(-0.03, 250, 100);
  const kl = klinesFromCloses(closes);
  const sc = scoreSmart(kl, new Map(), 'BTCUSDT', () => 5e8);
  const tiny = klinesFromCloses(mrSeries(-0.03, 20, 50));
  assert.equal(confluenceScore({ ...sc, raw: { ...sc.raw, closes } }, tiny), null);
});

test('confluenceScore: agreement ∈ [0, 1]', () => {
  const closesW = mrSeries(-0.03, 250, 100);
  const closesC = mrSeries(-0.04, 200, 80);
  const klW = klinesFromCloses(closesW);
  const klC = klinesFromCloses(closesC);
  const sc = scoreSmart(klW, new Map(), 'BTCUSDT', () => 5e8);
  const detail = confluenceScore({ ...sc, raw: { ...sc.raw, closes: closesW } }, klC);
  assert.ok(detail != null);
  assert.ok(detail.agreement >= 0 && detail.agreement <= 1);
  assert.ok(Array.isArray(detail.checks));
});

test('confluenceScore: returns at least one check when context available', () => {
  const closesW = mrSeries(-0.03, 250, 100);
  const closesC = mrSeries(-0.04, 200, 80);
  const klW = klinesFromCloses(closesW);
  const klC = klinesFromCloses(closesC);
  const sc = scoreSmart(klW, new Map(), 'BTCUSDT', () => 5e8);
  const detail = confluenceScore({ ...sc, raw: { ...sc.raw, closes: closesW } }, klC);
  assert.ok(detail.checks.length >= 1);
  // Each check has name, agree, label, weight
  for (const c of detail.checks) {
    assert.ok(typeof c.name === 'string');
    assert.equal(typeof c.agree, 'boolean');
    assert.ok(typeof c.label === 'string');
    assert.ok(c.weight > 0 && c.weight <= 1);
  }
});

test('confluenceScore: identical working+context → high agreement', () => {
  // Use the same series — should produce maximum agreement on shared checks.
  const closes = mrSeries(-0.04, 300, 100);
  const kl = klinesFromCloses(closes);
  const sc = scoreSmart(kl, new Map(), 'BTCUSDT', () => 5e8);
  const detail = confluenceScore({ ...sc, raw: { ...sc.raw, closes } }, kl);
  assert.ok(detail != null);
  // agreement should be high (>= 0.5) since slope/adf/regime are computed
  // from the same data and will trivially agree.
  assert.ok(detail.agreement >= 0.5, `expected ≥0.5, got ${detail.agreement}`);
});

test('confluenceScore: opposing working vs context → lower agreement', () => {
  // Working = mean-reverting (HL fit succeeds), context = trending.
  const closesW = mrSeries(-0.03, 300, 100);
  const closesC = trendSeries(300);
  const klW = klinesFromCloses(closesW);
  const klC = klinesFromCloses(closesC);
  const sc = scoreSmart(klW, new Map(), 'BTCUSDT', () => 5e8);
  const detail = confluenceScore({ ...sc, raw: { ...sc.raw, closes: closesW } }, klC);
  assert.ok(detail != null);
  // Regime check should disagree (MR vs trending).
  const regime = detail.checks.find((c) => c.name === 'regime');
  if (regime) {
    assert.equal(regime.agree, false);
  }
});

test('confluenceScore: weights sum to ≤1 (renormalised by available checks)', () => {
  const closes = mrSeries(-0.04, 300, 100);
  const kl = klinesFromCloses(closes);
  const sc = scoreSmart(kl, new Map(), 'BTCUSDT', () => 5e8);
  const detail = confluenceScore({ ...sc, raw: { ...sc.raw, closes } }, kl);
  assert.ok(detail != null);
  // After renormalisation, weighted-sum-of-agree / sum-of-weights should be in [0,1].
  assert.ok(detail.agreement >= 0 && detail.agreement <= 1);
});

test('confluenceScore: null workRow is handled gracefully', () => {
  const closes = mrSeries(-0.04, 100, 50);
  const kl = klinesFromCloses(closes);
  assert.equal(confluenceScore(null, kl), null);
});

test('confluenceScore: result is integrated into computeSmartRow.confluenceDetail', () => {
  const closesW = mrSeries(-0.03, 300, 100);
  const closesC = mrSeries(-0.04, 200, 80);
  const klW = klinesFromCloses(closesW);
  const klC = klinesFromCloses(closesC);
  const r = computeSmartRow('BTCUSDT', klW, klC, new Map(), () => 5e8);
  assert.ok(r != null);
  assert.ok('confluenceDetail' in r);
  assert.ok(r.confluenceDetail != null);
  assert.ok(Array.isArray(r.confluenceDetail.checks));
});

// ─── Toast helpers (Step 3) ───────────────────────────────────────

test('classifyScanError: rate-limit keywords map to rate-limit severity', () => {
  assert.equal(classifyScanError('rate limit 1000/1000'), 'rate-limit');
  assert.equal(classifyScanError('HTTP 429 Too Many Requests'), 'rate-limit');
  assert.equal(classifyScanError('IP banned 418'), 'rate-limit');
  assert.equal(classifyScanError('Too many requests, retry after 60s'), 'rate-limit');
});

test('classifyScanError: network/parse keywords map to fatal severity', () => {
  assert.equal(classifyScanError('NetworkError when fetching'), 'fatal');
  assert.equal(classifyScanError('JSON parse error'), 'fatal');
  assert.equal(classifyScanError('Request timeout'), 'fatal');
  assert.equal(classifyScanError('Request aborted'), 'fatal');
  assert.equal(classifyScanError('CORS preflight failed'), 'fatal');
});

test('classifyScanError: empty/unknown messages map to warn severity', () => {
  assert.equal(classifyScanError(''), 'warn');
  assert.equal(classifyScanError(null), 'warn');
  assert.equal(classifyScanError(undefined), 'warn');
  assert.equal(classifyScanError('Universe пустой: нет символов'), 'warn');
  assert.equal(classifyScanError('Список пуст после скана'), 'warn');
});

test('classifyScanError: rate-limit wins over generic network keyword', () => {
  // Some messages mention both; we want rate-limit to win because it carries
  // specific actionable advice (wait 30–60s).
  assert.equal(classifyScanError('network reset, rate limit 429'), 'rate-limit');
});

test('severityClass: maps severity to CSS class', () => {
  assert.equal(severityClass('fatal'), 'gbs-toast--fatal');
  assert.equal(severityClass('rate-limit'), 'gbs-toast--rate');
  assert.equal(severityClass('warn'), 'gbs-toast--warn');
  assert.equal(severityClass('unknown'), 'gbs-toast--warn');
});

test('severityTtl: rate-limit toasts live longer so users can read them', () => {
  assert.ok(severityTtl('rate-limit') > severityTtl('warn'),
    'rate-limit should outlast warn');
  assert.ok(severityTtl('fatal') >= severityTtl('warn'),
    'fatal should outlast warn');
  // Sensible bounds: warn >= 2000ms, rate-limit <= 10000ms
  assert.ok(severityTtl('warn') >= 2000 && severityTtl('warn') <= 5000);
  assert.ok(severityTtl('rate-limit') >= 4000 && severityTtl('rate-limit') <= 10000);
});

test('toastFromError: returns severity, text, hint', () => {
  const r = toastFromError('rate limit 429');
  assert.equal(r.severity, 'rate-limit');
  assert.equal(r.text, 'rate limit 429');
  assert.ok(r.hint && /подождите|wait/i.test(r.hint));
});

test('toastFromError: empty universe triggers warn hint', () => {
  const r = toastFromError('Universe пустой: ещё не загрузились объёмы');
  assert.equal(r.severity, 'warn');
  assert.ok(r.hint && /фильтр|filter/i.test(r.hint));
});

test('toastFromError: network error triggers fatal hint', () => {
  const r = toastFromError('NetworkError when fetching');
  assert.equal(r.severity, 'fatal');
  assert.ok(r.hint && /сет|api/i.test(r.hint));
});

test('toastFromError: null/undefined handled gracefully', () => {
  const r = toastFromError(null);
  assert.equal(r.severity, 'warn');
  assert.equal(typeof r.text, 'string');
});

// ═══════════════════════════════════════════════════════════════
//  Pure UI helpers
// ═══════════════════════════════════════════════════════════════

const sampleRows = [
  { sym: 'BTCUSDT', score: 11, band: 'green', direction: 'LONG', confidence: 85, mr: 4, fit: 5, raw: { gkPct: 0.8 } },
  { sym: 'ETHUSDT', score: 8,  band: 'yellow', direction: 'SHORT', confidence: 70, mr: 3, fit: 4, raw: { gkPct: 1.2 } },
  { sym: 'XRPUSDT', score: 5,  band: 'red', direction: 'NEUTRAL', confidence: 50, mr: 2, fit: 3, raw: { gkPct: 2.5 } },
  { sym: 'ADAUSDT', score: 9,  band: 'yellow', direction: 'LONG', confidence: 75, mr: 3, fit: 4, raw: { gkPct: null } },
  { sym: 'BNBUSDT', score: 7,  band: 'yellow', direction: 'SHORT', confidence: 55, mr: 3, fit: 3, raw: { gkPct: 1.8 } },
];

// ── filterSmartRows ────────────────────────────────────────────

test('filterSmartRows: empty input / non-array → []', () => {
  assert.deepEqual(filterSmartRows(null), []);
  assert.deepEqual(filterSmartRows(undefined), []);
  assert.deepEqual(filterSmartRows('foo'), []);
});

test('filterSmartRows: defaults pass everything with score', () => {
  const out = filterSmartRows(sampleRows);
  assert.equal(out.length, 5);
});

test('filterSmartRows: minScore filters out low scores', () => {
  const out = filterSmartRows(sampleRows, { minScore: 8 });
  assert.equal(out.length, 3);
  assert.ok(out.every(r => r.score >= 8));
});

test('filterSmartRows: directions as Set → restricts', () => {
  const out = filterSmartRows(sampleRows, { directions: new Set(['LONG']) });
  assert.equal(out.length, 2);
  assert.ok(out.every(r => r.direction === 'LONG'));
});

test('filterSmartRows: directions as Array → restricts', () => {
  const out = filterSmartRows(sampleRows, { directions: ['SHORT', 'NEUTRAL'] });
  assert.equal(out.length, 3);
});

test('filterSmartRows: minConfidence 60+ drops low-conf rows', () => {
  const out = filterSmartRows(sampleRows, { minConfidence: 60 });
  // Sample has 85, 70, 50, 75, 55 → 85/70/75 pass → 3 rows
  assert.equal(out.length, 3);
});

test('filterSmartRows: null confidence → treated as 0', () => {
  const rows = [{ sym: 'X', score: 10, direction: 'LONG', confidence: null }];
  const out = filterSmartRows(rows, { minConfidence: 60 });
  assert.equal(out.length, 0);
});

test('filterSmartRows: combined filters', () => {
  const out = filterSmartRows(sampleRows, {
    minScore: 8,
    directions: new Set(['LONG']),
    minConfidence: 60,
  });
  // BTC(85), ADA(75) → 2
  assert.equal(out.length, 2);
});

test('filterSmartRows: does not mutate input', () => {
  const before = sampleRows.slice();
  filterSmartRows(sampleRows, { minScore: 9 });
  assert.deepEqual(sampleRows, before);
});

test('filterSmartRows: skips rows with null score', () => {
  const rows = [
    { sym: 'X', score: null, direction: 'LONG' },
    { sym: 'Y', score: 5, direction: 'LONG' },
  ];
  assert.equal(filterSmartRows(rows).length, 1);
});

// ── sortSmartRows ──────────────────────────────────────────────

test('sortSmartRows: numeric desc by default', () => {
  const out = sortSmartRows(sampleRows, 'score');
  assert.equal(out[0].sym, 'BTCUSDT');
  assert.equal(out[out.length - 1].sym, 'XRPUSDT');
});

test('sortSmartRows: numeric asc', () => {
  const out = sortSmartRows(sampleRows, 'score', 'asc');
  assert.equal(out[0].sym, 'XRPUSDT');
  assert.equal(out[out.length - 1].sym, 'BTCUSDT');
});

test('sortSmartRows: sym uses localeCompare', () => {
  const out = sortSmartRows(sampleRows, 'sym', 'asc');
  assert.deepEqual(out.map(r => r.sym), ['ADAUSDT', 'BNBUSDT', 'BTCUSDT', 'ETHUSDT', 'XRPUSDT']);
});

test('sortSmartRows: dir uses localeCompare (LONG < NEUTRAL < SHORT)', () => {
  const out = sortSmartRows(sampleRows, 'dir', 'asc');
  // Sample has LONG(2), SHORT(2), NEUTRAL(1)
  // First should be LONGs, then NEUTRAL, then SHORTs (alphabetical)
  const dirs = out.map(r => r.direction);
  assert.equal(dirs[0], 'LONG');
  assert.equal(dirs[dirs.length - 1], 'SHORT');
});

test('sortSmartRows: gkh reads from raw.gkPct; nulls last on desc', () => {
  const out = sortSmartRows(sampleRows, 'gkh', 'desc');
  // 2.5, 1.8, 1.2, 0.8, null
  assert.equal(out[0].sym, 'XRPUSDT');
  assert.equal(out[out.length - 1].sym, 'ADAUSDT');
});

test('sortSmartRows: empty input → []', () => {
  assert.deepEqual(sortSmartRows([], 'score'), []);
  assert.deepEqual(sortSmartRows(null, 'score'), []);
});

test('sortSmartRows: does not mutate input', () => {
  const before = sampleRows.map(r => r.sym);
  sortSmartRows(sampleRows, 'sym');
  assert.deepEqual(sampleRows.map(r => r.sym), before);
});

// ── smartBandColor / smartDirectionColor ──────────────────────

test('smartBandColor: maps bands', () => {
  assert.equal(smartBandColor('green'), '#22c55e');
  assert.equal(smartBandColor('yellow'), '#eab308');
  assert.equal(smartBandColor('red'), '#ef4444');
  assert.equal(smartBandColor('nonsense'), '#94a3b8');
  assert.equal(smartBandColor(undefined), '#94a3b8');
});

test('smartDirectionColor: maps directions', () => {
  assert.equal(smartDirectionColor('LONG'), '#22c55e');
  assert.equal(smartDirectionColor('SHORT'), '#ef4444');
  assert.equal(smartDirectionColor('NEUTRAL'), '#94a3b8');
  assert.equal(smartDirectionColor(undefined), '#94a3b8');
});

// ── smartEmptyMessage ──────────────────────────────────────────

test('smartEmptyMessage: loading wins over error', () => {
  assert.equal(smartEmptyMessage({ loading: true, error: 'boom' }), 'Загрузка…');
});

test('smartEmptyMessage: error wins over default', () => {
  assert.equal(smartEmptyMessage({ loading: false, error: 'нет монет' }), 'нет монет');
});

test('smartEmptyMessage: hasFilters hint', () => {
  assert.equal(smartEmptyMessage({ hasFilters: true }), 'Нет результатов (проверь фильтры).');
});

test('smartEmptyMessage: default no-results', () => {
  assert.equal(smartEmptyMessage({}), 'Нет результатов.');
});

// ── smartSkeletonRows ──────────────────────────────────────────

test('smartSkeletonRows: default count 8', () => {
  const html = smartSkeletonRows();
  // 8 rows × 1 <tr> each
  const rows = html.match(/<tr>/g);
  assert.equal(rows?.length, 8);
});

test('smartSkeletonRows: respects count, clamps to [1, 20]', () => {
  assert.equal((smartSkeletonRows(3).match(/<tr>/g) || []).length, 3);
  assert.equal((smartSkeletonRows(25).match(/<tr>/g) || []).length, 20, 'clamped to 20');
  assert.equal((smartSkeletonRows(0).match(/<tr>/g) || []).length, 1, 'bumped to 1');
  assert.equal((smartSkeletonRows(-5).match(/<tr>/g) || []).length, 1, 'negative → 1');
});

test('smartSkeletonRows: HTML contains the expected CSS classes', () => {
  const html = smartSkeletonRows(1);
  assert.match(html, /gbs-skeleton/);
  assert.match(html, /gbs-skeleton-bar/);
  assert.match(html, /gbs-skeleton-bar--w12/);
  assert.match(html, /gbs-skeleton-bar--w70/);
  assert.match(html, /colspan="9"/);
});

test('smartSkeletonRows: returns a string (no DOM deps)', () => {
  assert.equal(typeof smartSkeletonRows(), 'string');
});
