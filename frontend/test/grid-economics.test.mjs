// ═══════════════════════════════════════════════════════════════
//  Unit tests for grid-economics.js — fees, grid sim, walk-forward
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAKER_FEE_PCT,
  roundTripFeePct,
  stepEconomics,
  clampLevels,
  atr14,
  pctile,
  swingBoundsFn,
  intraBoundsFn,
  simulateGrid,
  walkForwardGrid,
  swingPercentileComposite,
} from '../src/grid-economics.js';

// ── fees ───────────────────────────────────────────────────────
test('roundTripFeePct: 2×maker + slippage for binance/bybit', () => {
  const rt = roundTripFeePct('binance');
  assert.equal(rt, 2 * MAKER_FEE_PCT.binance + 0.01);
  assert.equal(roundTripFeePct('bybit'), 2 * MAKER_FEE_PCT.bybit + 0.01);
  // unknown exchange falls back to binance
  assert.equal(roundTripFeePct('kraken'), roundTripFeePct('binance'));
});

test('stepEconomics: ratio and verdict thresholds', () => {
  // fee = 0.05% → step 0.15% → ratio 3 → ok
  const ok = stepEconomics(0.15);
  assert.ok(Math.abs(ok.ratio - 3) < 1e-9);
  assert.equal(ok.ok, true);
  assert.equal(ok.verdict, '✓');
  assert.ok(Math.abs(ok.netPct - 0.10) < 1e-9);
  // step 0.08% → ratio 1.6 → bad
  const bad = stepEconomics(0.08);
  assert.equal(bad.ok, false);
  assert.equal(bad.verdict, '✗');
  // borderline 0.12% → ratio 2.4 → '~'
  const mid = stepEconomics(0.12);
  assert.equal(mid.verdict, '~');
  assert.equal(mid.ok, false);
  // garbage
  assert.equal(stepEconomics(null).ok, false);
  assert.equal(stepEconomics(NaN).netPct, null);
});

// ── levels clamp ───────────────────────────────────────────────
test('clampLevels: clamps to [6,32] and rounds', () => {
  assert.equal(clampLevels(40), 32);
  assert.equal(clampLevels(3), 6);
  assert.equal(clampLevels(10), 10);
  assert.equal(clampLevels(10.6), 11);
  assert.equal(clampLevels(NaN), 6);
});

// ── ATR / pctile ───────────────────────────────────────────────
test('atr14: constant-range bars → ATR = bar range', () => {
  const kl = Array.from({ length: 40 }, () => ({ h: 102, l: 98, c: 100 }));
  assert.ok(Math.abs(atr14(kl, 14) - 4) < 1e-6);
});

test('atr14: too-short input → null', () => {
  assert.equal(atr14([{ h: 1, l: 1, c: 1 }], 14), null);
});

test('pctile: linear interpolation like percentileCloses', () => {
  assert.equal(pctile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5.5);
  assert.equal(pctile([3, 1, 2], 0), 1);
  assert.equal(pctile([3, 1, 2], 100), 3);
});

// ── bounds builders ────────────────────────────────────────────
test('swingBoundsFn: p5..p95 of closes + wick pad, step = 0.5×ATR', () => {
  const train = [];
  for (let i = 0; i < 60; i++) {
    const c = 100 + Math.sin(i * 0.5) * 5; // 95..105 closes
    train.push({ h: c + 1, l: c - 1, c });
  }
  const b = swingBoundsFn(train);
  assert.ok(b, 'bounds should compute');
  const closes = train.slice(-30).map((k) => k.c);
  const p5 = pctile(closes, 5);
  const p95 = pctile(closes, 95);
  assert.ok(b.lower < p5, `lower ${b.lower} should pad below p5 ${p5}`);
  assert.ok(b.upper > p95, `upper ${b.upper} should pad above p95 ${p95}`);
  assert.ok(b.upper > b.lower);
  assert.ok(b.step > 0);
  assert.ok(b.levels >= 6 && b.levels <= 32);
  assert.equal(swingBoundsFn(null), null);
  assert.equal(swingBoundsFn(train.slice(0, 10)), null);
});

test('intraBoundsFn: symmetric around last close, 15m→ATR1h proxy', () => {
  const train = [];
  let p = 100;
  for (let i = 0; i < 60; i++) {
    const c = p + Math.sin(i * 1.7) * 0.5;
    train.push({ h: Math.max(p, c) + 0.2, l: Math.min(p, c) - 0.2, c });
    p = c;
  }
  const b = intraBoundsFn(train);
  assert.ok(b);
  const last = train[train.length - 1].c;
  assert.ok(Math.abs((b.upper + b.lower) / 2 - last) < 1e-6, 'centered on last close');
  const atr = atr14(train, 14);
  assert.ok(Math.abs((b.upper - b.lower) / 2 - 2.5 * atr) < 1e-9, `span = 2×2.5×ATR, got half-span ${ (b.upper - b.lower) / 2 } vs ${2.5 * atr}`);
  assert.ok(b.step > 0);
  assert.equal(intraBoundsFn(null), null);
});

// ── simulateGrid ───────────────────────────────────────────────
function klFromCloses(closes, wick = 0.5) {
  return closes.map((c) => ({ h: c + wick, l: c - wick, c }));
}

test('simulateGrid: oscillation → profitable round trips after fees', () => {
  // Zigzag 92↔108 with 2-step granularity, 120 bars
  const closes = [];
  for (let i = 0; i < 120; i++) closes.push(i % 20 < 10 ? 92 + (i % 10) * 1.8 : 108 - (i % 10) * 1.8);
  const kl = klFromCloses(closes);
  const sim = simulateGrid(kl, { lower: 90, upper: 110, levels: 10 });
  assert.ok(sim, 'sim should run');
  assert.ok(sim.rt > 10, `expected many round trips, got ${sim.rt}`);
  assert.ok(sim.netPct > 0, `oscillation should net positive, got ${sim.netPct}`);
  assert.ok(sim.netPct < sim.grossPct, 'fees must reduce net vs gross');
  assert.ok(sim.barsInRangePct > 0.9, 'price stays in range');
  assert.ok(sim.maxDDPct >= 0);
});

test('simulateGrid: monotonic uptrend → breaks range, few round trips', () => {
  const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 2);
  const sim = simulateGrid(klFromCloses(closes), { lower: 90, upper: 130, levels: 10 });
  assert.ok(sim);
  assert.equal(sim.brokeUp, true);
  assert.ok(sim.rt <= 11, `trend should give ≤ level-count round trips, got ${sim.rt}`);
  assert.ok(sim.barsInRangePct < 1);
});

test('simulateGrid: flat inside one cell → zero round trips, no break', () => {
  const closes = new Array(60).fill(100);
  const sim = simulateGrid(klFromCloses(closes), { lower: 90, upper: 110, levels: 10 });
  assert.ok(sim);
  assert.equal(sim.rt, 0);
  assert.equal(sim.brokeUp, false);
  assert.equal(sim.brokeDown, false);
  assert.equal(sim.netPct, 0);
});

test('simulateGrid: garbage input → null', () => {
  assert.equal(simulateGrid(null, {}), null);
  assert.equal(simulateGrid(klFromCloses([1, 2, 3]), { lower: 0, upper: 10, levels: 5 }), null);
  assert.equal(simulateGrid(klFromCloses([1, 2, 3, 4, 5]), { lower: 10, upper: 0, levels: 5 }), null);
});

// ── walkForwardGrid ────────────────────────────────────────────
test('walkForwardGrid: oscillating series + matching bounds → hitRate 1', () => {
  const closes = [];
  for (let i = 0; i < 300; i++) closes.push(100 + Math.sin(i * 0.4) * 8);
  const kl = klFromCloses(closes);
  const wf = walkForwardGrid(kl, () => ({ lower: 90, upper: 110, levels: 10 }), { folds: 3 });
  assert.ok(wf, 'wf should run');
  assert.equal(wf.folds.length, 3);
  assert.equal(wf.hitRate, 1, `all folds profitable, got ${wf.hitRate}`);
  assert.ok(wf.medianNetPct > 0);
  assert.ok(wf.perBarPct > 0);
});

test('walkForwardGrid: monotonic trend → hitRate 0 / negative', () => {
  const closes = Array.from({ length: 200 }, (_, i) => 100 + i * 1.5);
  const kl = klFromCloses(closes);
  const wf = walkForwardGrid(kl, () => ({ lower: 95, upper: 135, levels: 10 }), { folds: 3 });
  assert.ok(wf);
  assert.ok(wf.hitRate < 1 && wf.medianNetPct <= 0.5, `trend should not be profitable everywhere: ${wf.medianNetPct} hr ${wf.hitRate}`);
});

test('walkForwardGrid: short history → null', () => {
  assert.equal(walkForwardGrid(klFromCloses([1, 2, 3, 4]), () => ({ lower: 0, upper: 10, levels: 5 })), null);
});

test('walkForwardGrid: boundsFn null on train → fold skipped, others kept', () => {
  const closes = [];
  for (let i = 0; i < 300; i++) closes.push(100 + Math.sin(i * 0.4) * 8);
  const kl = klFromCloses(closes);
  let call = 0;
  const wf = walkForwardGrid(
    kl,
    () => (call++ === 0 ? null : { lower: 90, upper: 110, levels: 10 }),
    { folds: 3 }
  );
  assert.ok(wf);
  assert.equal(wf.folds.length, 2);
});

// ── percentile composite ───────────────────────────────────────
function fakeRow(sym, adx, chop, hurst, maX, vm, atrp) {
  return { sym, raw: { adx, chop, hurst, maX, vm, atrp, rcov: 25 } };
}

test('swingPercentileComposite: best grid row ranks highest, ~50 for middle', () => {
  const rows = [
    fakeRow('A', 15, 65, 0.40, 10, 0.10, 4),  // ideal
    fakeRow('B', 22, 58, 0.47, 6, 0.06, 5),   // middle
    fakeRow('C', 35, 45, 0.62, 2, 0.02, 12),  // worst
  ];
  const pcs = rows.map((r) => swingPercentileComposite(r, rows));
  assert.ok(pcs[0] > pcs[1] && pcs[1] > pcs[2], `ordering broken: ${pcs}`);
  assert.ok(pcs[1] > 20 && pcs[1] < 80, `middle row should sit mid, got ${pcs[1]}`);
  assert.ok(pcs[0] <= 100 && pcs[2] >= 0);
});

test('swingPercentileComposite: missing metrics tolerated', () => {
  const rows = [fakeRow('A', 15, 65, 0.40, 10, 0.10, 4), { sym: 'X', raw: {} }];
  const pc = swingPercentileComposite(rows[1], rows);
  assert.ok(pc == null || (pc >= 0 && pc <= 100));
});
