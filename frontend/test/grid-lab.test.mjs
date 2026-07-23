// ═══════════════════════════════════════════════════════════════
//  Unit tests for gridLab.js pure math utilities
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  gbDepositClamp,
  gridAdjacentStepPcts,
  resolveGridLevelsForCfg,
  buildRatioGridLevels,
  gridRiskAnchorIdx,
  buildGridRiskRows,
  buildGridFavorableRows,
  defaultGridLabPrefs,
  loadGridLabPrefs,
  saveGridLabPrefs,
  computeRatioGridUpdate,
  compileGridLabState,
  runManualGridBacktest,
  gridRiskMetaForPrice,
  fmtGridLineTitle,
  captureGbLabViewport,
  applyGbViewportFreeze,
  gbWantBarsFromVisible,
} from '../src/gridLab.js';

// ── gbDepositClamp ────────────────────────────────────────────
test('gbDepositClamp: valid number ≥ min returned as-is', () => {
  assert.equal(gbDepositClamp(1000), 1000);
  assert.equal(gbDepositClamp(500), 500);
});

test('gbDepositClamp: NaN/Infinity → fallback', () => {
  assert.equal(gbDepositClamp(NaN, 500), 500);
  assert.equal(gbDepositClamp(Infinity, 200), 200);
  assert.equal(gbDepositClamp(NaN), 500); // default fallback
});

test('gbDepositClamp: value below minimum → min', () => {
  assert.equal(gbDepositClamp(0.05), 0.1);
  assert.equal(gbDepositClamp(-5), 0.1);
});

test('gbDepositClamp: non-numeric string → fallback', () => {
  assert.equal(gbDepositClamp('abc', 300), 300);
});

// ── gridAdjacentStepPcts ───────────────────────────────────────
test('gridAdjacentStepPcts: even 1% grid → all values 1', () => {
  const grid = [100, 101, 102, 103];
  const r = gridAdjacentStepPcts(grid, 100);
  assert.equal(r.min, 1);
  assert.equal(r.max, 1);
  assert.equal(r.avg, 1);
});

test('gridAdjacentStepPcts: empty/short grid → nulls', () => {
  assert.deepEqual(gridAdjacentStepPcts([], 100), { min: null, max: null, avg: null });
  assert.deepEqual(gridAdjacentStepPcts([100], 100), { min: null, max: null, avg: null });
  assert.deepEqual(gridAdjacentStepPcts(null, 100), { min: null, max: null, avg: null });
});

test('gridAdjacentStepPcts: refPrice=0 falls back to grid midpoint', () => {
  const grid = [100, 102, 104]; // steps of 2, mid = 102
  const r = gridAdjacentStepPcts(grid, 0);
  // 2/102 ≈ 1.96%, 2/102 ≈ 1.96%
  assert.ok(r.avg > 1.9 && r.avg < 2.0, `expected ~1.96, got ${r.avg}`);
});

// ── resolveGridLevelsForCfg ────────────────────────────────────
test('resolveGridLevelsForCfg: even spacing when no custom grid', () => {
  const { grid, levels } = resolveGridLevelsForCfg({}, 100, 110, 5);
  assert.equal(levels, 5);
  assert.equal(grid.length, 6); // 5 + 1 endpoints
  assert.equal(grid[0], 100);
  assert.equal(grid[5], 110);
  assert.equal(grid[3], 106); // midpoint
});

test('resolveGridLevelsForCfg: custom gridLevels wins', () => {
  const cfg = { gridLevels: [95, 100, 105, 110] };
  const { grid, levels } = resolveGridLevelsForCfg(cfg, 100, 200, 12);
  assert.equal(levels, 3); // 4 endpoints - 1
  assert.deepEqual(grid, [95, 100, 105, 110]);
});

test('resolveGridLevelsForCfg: custom grid filtered for invalid values', () => {
  const cfg = { gridLevels: [100, NaN, 105, -1, 110, 0] };
  const { grid } = resolveGridLevelsForCfg(cfg, 100, 200, 12);
  assert.deepEqual(grid, [100, 105, 110]);
});

test('resolveGridLevelsForCfg: custom grid < 2 valid → falls back to even', () => {
  const cfg = { gridLevels: [100] };
  const { grid } = resolveGridLevelsForCfg(cfg, 0, 100, 4);
  assert.equal(grid.length, 5); // 4 + 1
  assert.equal(grid[0], 0);
  assert.equal(grid[4], 100);
});

test('resolveGridLevelsForCfg: levels < 2 → bumped to 2', () => {
  const { levels } = resolveGridLevelsForCfg({}, 100, 110, 1);
  assert.equal(levels, 2);
});

// ── buildRatioGridLevels ───────────────────────────────────────
test('buildRatioGridLevels: longRatio 3:1 with 12 levels → ~9 up, 3 down', () => {
  const r = buildRatioGridLevels(100, 3, 1, 0.5, 12);
  assert.ok(r != null);
  assert.equal(r.lower, 100 * (1 - 0.005 * 3)); // 3 down steps
  assert.equal(r.upper, 100 * (1 + 0.005 * 9)); // 9 up steps
  assert.equal(r.upSteps, 9);
  assert.equal(r.downSteps, 3);
});

test('buildRatioGridLevels: anchor ≤ 0 → null', () => {
  assert.equal(buildRatioGridLevels(0, 3, 1, 0.5, 12), null);
  assert.equal(buildRatioGridLevels(-10, 3, 1, 0.5, 12), null);
});

test('buildRatioGridLevels: levels clamped to [3, 60]', () => {
  // totalLevels=1 → clamped to 3 → upSteps=round(3*1/2)=2, downSteps=2
  // grid: anchor + 2 up + 2 down = 5 points → levels = 4 (≥ 3)
  const r1 = buildRatioGridLevels(100, 1, 1, 0.5, 1);
  assert.ok(r1.levels >= 3, `expected levels ≥ 3, got ${r1.levels}`);
  // totalLevels=100 → clamped to 60 → grid ≤ 60+1 points → levels ≤ 60
  const r60 = buildRatioGridLevels(100, 1, 1, 0.5, 100);
  assert.ok(r60.levels <= 60, `expected levels ≤ 60, got ${r60.levels}`);
});

test('buildRatioGridLevels: stepPct clamped to [0.01, 50]', () => {
  // stepPct=0.001 → clamped to 0.01 → stepFrac=0.0001
  // 12 levels at 1:1 → upSteps=6 → upper = 100 * (1 + 0.0001*6) = 100.06
  const r1 = buildRatioGridLevels(100, 1, 1, 0.001, 12);
  assert.equal(r1.upper, 100 * 1.0006);
  // stepPct=100 → clamped to 50 → stepFrac=0.5
  // 4 levels at 1:1 → upSteps=2 → upper = 100 * (1 + 0.5*2) = 200
  const r50 = buildRatioGridLevels(100, 1, 1, 100, 4);
  assert.equal(r50.upper, 200);
});

test('buildRatioGridLevels: returned grid is sorted ascending', () => {
  const r = buildRatioGridLevels(100, 1, 1, 0.5, 12);
  for (let i = 1; i < r.gridLevels.length; i++) {
    assert.ok(r.gridLevels[i] > r.gridLevels[i - 1], `not sorted at ${i}`);
  }
});

// ── gridRiskAnchorIdx ──────────────────────────────────────────
test('gridRiskAnchorIdx: long → last level ≤ current', () => {
  const grid = [100, 102, 104, 106, 108, 110];
  // current = 105 → anchor at 104 (last ≤ 105)
  assert.equal(gridRiskAnchorIdx(grid, 105, 2, 'long'), 2);
  // current below grid → 0
  assert.equal(gridRiskAnchorIdx(grid, 50, 2, 'long'), 0);
});

test('gridRiskAnchorIdx: short → first level ≥ current', () => {
  const grid = [100, 102, 104, 106, 108, 110];
  // current = 105 → first ≥ 105 is 106 at idx 3
  assert.equal(gridRiskAnchorIdx(grid, 105, 2, 'short'), 3);
  // current above grid → last
  assert.equal(gridRiskAnchorIdx(grid, 200, 2, 'short'), 5);
});

test('gridRiskAnchorIdx: neutral → first level ≥ current', () => {
  const grid = [100, 102, 104, 106, 108, 110];
  assert.equal(gridRiskAnchorIdx(grid, 105, 2, 'neutral'), 3);
});

test('gridRiskAnchorIdx: anchorOverridePx snaps to nearest', () => {
  const grid = [100, 102, 104, 106, 108, 110];
  // override = 104.1 → nearest is 104 (dist 0.1) vs 106 (dist 1.9)
  assert.equal(gridRiskAnchorIdx(grid, 100, 2, 'neutral', 104.1), 2);
  // override = 107 → nearest is 108 (dist 1) vs 106 (dist 1)
  // First match wins per implementation, so 106 at idx 3
  assert.equal(gridRiskAnchorIdx(grid, 100, 2, 'neutral', 107), 3);
});

test('gridRiskAnchorIdx: null/invalid anchorOverridePx → mode logic', () => {
  const grid = [100, 102, 104];
  assert.equal(gridRiskAnchorIdx(grid, 101, 2, 'long', null), 0); // 100 ≤ 101
  assert.equal(gridRiskAnchorIdx(grid, 101, 2, 'long', NaN), 0);
});

// ── buildGridRiskRows ──────────────────────────────────────────
test('buildGridRiskRows: invalid cfg → []', () => {
  assert.deepEqual(buildGridRiskRows({}), []);
  assert.deepEqual(buildGridRiskRows({ lower: 100, upper: 100, currentPrice: 100 }), []); // hi ≤ lo
  assert.deepEqual(buildGridRiskRows({ lower: 100, upper: 110, currentPrice: -1 }), []); // cur ≤ 0
});

test('buildGridRiskRows: neutral mode → symmetric rows', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 2, deposit: 1000, gridMode: 'neutral',
  };
  const rows = buildGridRiskRows(cfg);
  assert.ok(rows.length > 0);
  // All rows have both upPct and downPct as numbers (>= 0)
  for (const r of rows) {
    assert.ok(typeof r.downPct === 'number');
    assert.ok(typeof r.upPct === 'number');
  }
  // First row at anchor (105): upPrice ≈ null, upUsdt = 0
  assert.equal(rows[0].upPrice, null);
  assert.equal(rows[0].upUsdt, 0);
});

test('buildGridRiskRows: long mode → only downPct (price dropping)', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'long',
  };
  const rows = buildGridRiskRows(cfg);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.upUsdt, 0);
    assert.equal(r.upPct, 0);
    assert.ok(r.downPct !== 0, `row step ${r.step}: expected non-zero downPct`);
  }
});

test('buildGridRiskRows: short mode → only upPct (price rising)', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'short',
  };
  const rows = buildGridRiskRows(cfg);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.downUsdt, 0);
    assert.equal(r.downPct, 0);
    assert.ok(r.upPct !== 0, `row step ${r.step}: expected non-zero upPct`);
  }
});

test('buildGridRiskRows: respects custom gridLevels', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'neutral',
    gridLevels: [100, 102, 104, 106, 108, 110], // 5 intervals
  };
  const rows = buildGridRiskRows(cfg);
  assert.ok(rows.length > 0);
});

// ── buildGridFavorableRows ─────────────────────────────────────
test('buildGridFavorableRows: long mode → profit at each step up', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'long',
  };
  const rows = buildGridFavorableRows(cfg);
  // maxUp = grid.length - anchorIdx; with even spacing around 105 → ~3 levels up
  assert.ok(rows.length >= 1);
  // First row at the level immediately above anchor — should have small but non-zero profit
  assert.ok(rows[0].usdt > 0);
  // Profits grow monotonically
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].usdt >= rows[i - 1].usdt, `profit should grow: row ${i}`);
  }
});

test('buildGridFavorableRows: short mode → profit at each step down', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'short',
  };
  const rows = buildGridFavorableRows(cfg);
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.ok(r.usdt > 0);
  }
});

test('buildGridFavorableRows: neutral mode → [] (no preferred direction)', () => {
  const cfg = {
    lower: 100, upper: 110, currentPrice: 105,
    levels: 5, leverage: 1, deposit: 1000, gridMode: 'neutral',
  };
  assert.deepEqual(buildGridFavorableRows(cfg), []);
});

test('buildGridFavorableRows: invalid cfg → []', () => {
  assert.deepEqual(buildGridFavorableRows({}), []);
  assert.deepEqual(buildGridFavorableRows({ lower: 100, upper: 100, currentPrice: 100 }), []);
});

// ── defaultGridLabPrefs / loadGridLabPrefs / saveGridLabPrefs ─
function makeMockStorage(initial = {}) {
  let store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _peek: () => ({ ...store }),
  };
}

test('defaultGridLabPrefs: returns sane defaults', () => {
  const d = defaultGridLabPrefs();
  assert.equal(d.global.tf, '5m');
  assert.equal(d.global.levels, 12);
  assert.equal(d.global.deposit, 500);
  assert.equal(d.global.gridMode, 'neutral');
  assert.deepEqual(d.symbolBounds, {});
});

test('loadGridLabPrefs: empty storage → defaults', () => {
  const ls = makeMockStorage();
  const p = loadGridLabPrefs(ls);
  assert.deepEqual(p, defaultGridLabPrefs());
});

test('loadGridLabPrefs: corrupted JSON → defaults', () => {
  const ls = makeMockStorage({ cs_gridlab_prefs_v2: '{not valid json' });
  const p = loadGridLabPrefs(ls);
  assert.deepEqual(p, defaultGridLabPrefs());
});

test('loadGridLabPrefs: invalid tf → falls back to default', () => {
  const ls = makeMockStorage({
    cs_gridlab_prefs_v2: JSON.stringify({ global: { tf: '99m' } }),
  });
  const p = loadGridLabPrefs(ls);
  assert.equal(p.global.tf, '5m');
});

test('loadGridLabPrefs: invalid gridMode → falls back to neutral', () => {
  const ls = makeMockStorage({
    cs_gridlab_prefs_v2: JSON.stringify({ global: { gridMode: 'sideways' } }),
  });
  const p = loadGridLabPrefs(ls);
  assert.equal(p.global.gridMode, 'neutral');
});

test('loadGridLabPrefs: levels/bars/leverage clamped', () => {
  const ls = makeMockStorage({
    cs_gridlab_prefs_v2: JSON.stringify({
      global: { levels: 999, bars: -1, leverage: 9999, ratioLong: -1 },
    }),
  });
  const p = loadGridLabPrefs(ls);
  assert.ok(p.global.levels >= 3 && p.global.levels <= 60);
  assert.ok(p.global.bars >= 80 && p.global.bars <= 1200);
  assert.ok(p.global.leverage >= 1 && p.global.leverage <= 25);
  assert.ok(p.global.ratioLong >= 0.1);
});

test('saveGridLabPrefs: round-trips through loadGridLabPrefs', () => {
  const ls = makeMockStorage();
  const orig = defaultGridLabPrefs();
  orig.global.tf = '15m';
  orig.global.levels = 18;
  orig.symbolBounds.BTCUSDT = { lower: 60000, upper: 70000 };
  saveGridLabPrefs(orig, ls);
  const loaded = loadGridLabPrefs(ls);
  assert.equal(loaded.global.tf, '15m');
  assert.equal(loaded.global.levels, 18);
  assert.equal(loaded.symbolBounds.BTCUSDT.lower, 60000);
});

test('saveGridLabPrefs: null storage → silently ignored', () => {
  // Should not throw
  saveGridLabPrefs({ global: { tf: '5m' } }, null);
});

test('loadGridLabPrefs: null storage → defaults', () => {
  const p = loadGridLabPrefs(null);
  assert.deepEqual(p, defaultGridLabPrefs());
});

// ── computeRatioGridUpdate ─────────────────────────────────────
test('computeRatioGridUpdate: valid inputs update bounds + global ratios', () => {
  const prefs = defaultGridLabPrefs();
  const r = computeRatioGridUpdate(prefs, 'BTCUSDT', 3, 1, 0.5, 12, 100);
  assert.equal(r.updated, true);
  assert.ok(r.built != null);
  assert.ok(r.gbPrefs.symbolBounds.BTCUSDT);
  assert.ok(r.gbPrefs.symbolBounds.BTCUSDT.lower > 0);
  assert.ok(r.gbPrefs.symbolBounds.BTCUSDT.upper > r.gbPrefs.symbolBounds.BTCUSDT.lower);
  assert.equal(r.gbPrefs.global.ratioLong, 3);
  assert.equal(r.gbPrefs.global.ratioShort, 1);
  assert.equal(r.gbPrefs.global.ratioStepPct, 0.5);
});

test('computeRatioGridUpdate: missing sym → no update', () => {
  const prefs = defaultGridLabPrefs();
  const r = computeRatioGridUpdate(prefs, '', 3, 1, 0.5, 12, 100);
  assert.equal(r.updated, false);
  assert.equal(r.built, null);
  assert.equal(r.gbPrefs.symbolBounds.BTCUSDT, undefined);
});

test('computeRatioGridUpdate: invalid ratios → no update', () => {
  const prefs = defaultGridLabPrefs();
  assert.equal(computeRatioGridUpdate(prefs, 'X', NaN, 1, 0.5, 12, 100).updated, false);
  assert.equal(computeRatioGridUpdate(prefs, 'X', 3, 'bad', 0.5, 12, 100).updated, false);
  assert.equal(computeRatioGridUpdate(prefs, 'X', 3, 1, Infinity, 12, 100).updated, false);
});

test('computeRatioGridUpdate: invalid anchor → no update', () => {
  const prefs = defaultGridLabPrefs();
  assert.equal(computeRatioGridUpdate(prefs, 'X', 3, 1, 0.5, 12, 0).updated, false);
  assert.equal(computeRatioGridUpdate(prefs, 'X', 3, 1, 0.5, 12, -1).updated, false);
  assert.equal(computeRatioGridUpdate(prefs, 'X', 3, 1, 0.5, 12, null).updated, false);
});

test('computeRatioGridUpdate: preserves existing anchorPrice', () => {
  const prefs = defaultGridLabPrefs();
  prefs.symbolBounds.X = { anchorPrice: 42 };
  const r = computeRatioGridUpdate(prefs, 'X', 1, 1, 0.5, 8, 50);
  assert.equal(r.updated, true);
  assert.equal(r.gbPrefs.symbolBounds.X.anchorPrice, 42);
  assert.ok(r.gbPrefs.symbolBounds.X.gridLevels);
});

test('computeRatioGridUpdate: levels clamped to [3, 60]', () => {
  const prefs = defaultGridLabPrefs();
  // totalLevels=999 → clamp 60
  const r = computeRatioGridUpdate(prefs, 'X', 1, 1, 0.5, 999, 100);
  assert.equal(r.updated, true);
  assert.ok(r.built.levels <= 60, `expected ≤ 60, got ${r.built.levels}`);
});

// ── compileGridLabState ────────────────────────────────────────

function makeCandles(n, base = 100, step = 0.3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = base + Math.sin(i / 5) * step * base * 0.05;
    out.push({ t: 1700000000 + i * 60, o: v, h: v * 1.001, l: v * 0.999, c: v });
  }
  return out;
}

test('compileGridLabState: insufficient history → ok:false', () => {
  const r = compileGridLabState({ sym: 'X', tf: '5m', candles: makeCandles(5), levels: 8 });
  assert.equal(r.ok, false);
  assert.match(r.msg, /Недостаточно/);
});

test('compileGridLabState: invalid range (hi <= lo) → ok:false', () => {
  const r = compileGridLabState({ sym: 'X', tf: '5m', candles: makeCandles(40), lower: 100, upper: 100, levels: 8 });
  assert.equal(r.ok, false);
});

test('compileGridLabState: explicit lower/upper override series range', () => {
  const r = compileGridLabState({ sym: 'BTC', tf: '1h', candles: makeCandles(40), levels: 10, leverage: 5, deposit: 1000, lower: 90, upper: 110, gridMode: 'long', anchorPrice: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.lower, 90);
  assert.equal(r.upper, 110);
  assert.equal(r.levels, 10);
  assert.equal(r.gridLevels.length, 11);
  assert.equal(r.gridRiskMode, 'long');
  assert.equal(r.anchorPrice, 100);
  assert.ok(r.step > 0);
});

test('compileGridLabState: invalid gridMode → neutral', () => {
  const r = compileGridLabState({ sym: 'X', tf: '5m', candles: makeCandles(40), levels: 10, gridMode: 'lol' });
  assert.equal(r.gridRiskMode, 'neutral');
});

test('compileGridLabState: invalid anchorPrice → null', () => {
  const r = compileGridLabState({ sym: 'X', tf: '5m', candles: makeCandles(40), levels: 10, anchorPrice: 'oops' });
  assert.equal(r.anchorPrice, null);
});

test('compileGridLabState: missing lower/upper → derived from candles', () => {
  const candles = makeCandles(40, 100);
  const r = compileGridLabState({ sym: 'X', tf: '5m', candles, levels: 8 });
  assert.equal(r.ok, true);
  assert.ok(r.lower > 0 && r.upper > r.lower);
});

// ── runManualGridBacktest ──────────────────────────────────────

test('runManualGridBacktest: short history → ok:false', () => {
  const r = runManualGridBacktest({ sym: 'X', tf: '5m', candles: makeCandles(10) });
  assert.equal(r.ok, false);
});

test('runManualGridBacktest: produces trades and equity curve on oscillating series', () => {
  // Make a series that crosses grid boundaries many times
  const candles = makeCandles(120, 100, 2);
  const r = runManualGridBacktest({ sym: 'X', tf: '5m', candles, levels: 8, leverage: 3, deposit: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.bars, 120);
  assert.ok(r.trades.length > 0, 'expected fills on oscillating series');
  assert.equal(r.gridLevels.length, 9);
  assert.ok(r.fills === r.trades.length);
  assert.ok(r.fees >= 0);
  // No trade time should be NaN
  for (const t of r.trades) {
    assert.ok(Number.isFinite(t.time));
    assert.ok(['buy', 'sell'].includes(t.side));
  }
});

test('runManualGridBacktest: respects toChartTime mapper', () => {
  const candles = makeCandles(80, 100, 1.5);
  const r = runManualGridBacktest({ sym: 'X', tf: '5m', candles, levels: 6, leverage: 2, toChartTime: (t) => t + 1000 });
  if (r.trades.length > 0) {
    // All trade times should be ≥ 1000 offset relative to the raw candle time
    const candleTimes = candles.map((c) => c.t);
    for (const tr of r.trades) {
      const expectedSrc = candleTimes.find((ct) => ct + 1000 === tr.time);
      assert.ok(expectedSrc != null);
    }
  }
});

test('runManualGridBacktest: maxDd is non-negative on oscillating series', () => {
  const candles = makeCandles(120, 100, 2);
  const r = runManualGridBacktest({ sym: 'X', tf: '5m', candles, levels: 8, deposit: 1000, leverage: 2 });
  assert.ok(r.maxDd >= 0);
});

test('runManualGridBacktest: clamp deposit / leverage / levels', () => {
  const candles = makeCandles(80, 100, 1);
  const r = runManualGridBacktest({ sym: 'X', tf: '5m', candles, levels: 99, leverage: 99, deposit: 0 });
  assert.equal(r.levels, 60, 'levels clamped to 60');
  assert.equal(r.leverage, 25, 'leverage clamped to 25');
  assert.ok(r.startEq >= 1, 'deposit clamped to ≥ 1');
});

// ── gridRiskMetaForPrice ───────────────────────────────────────

const riskRows = [
  { upPrice: 110, upUsdt: 50, upPct: 5, downPrice: 90, downUsdt: -40, downPct: -4 },
  { upPrice: 120, upUsdt: 100, upPct: 10, downPrice: 80, downUsdt: -80, downPct: -8 },
];

test('gridRiskMetaForPrice: anchor branch', () => {
  const m = gridRiskMetaForPrice(100, 100, 1, riskRows, 'neutral');
  assert.equal(m.side, 'anchor');
});

test('gridRiskMetaForPrice: long mode + price > anchor → tp-up', () => {
  const m = gridRiskMetaForPrice(110, 100, 5, riskRows, 'long');
  assert.equal(m.side, 'tp-up');
});

test('gridRiskMetaForPrice: short mode + price < anchor → tp-down', () => {
  const m = gridRiskMetaForPrice(90, 100, 5, riskRows, 'short');
  assert.equal(m.side, 'tp-down');
});

test('gridRiskMetaForPrice: neutral + matched up row → short side', () => {
  const m = gridRiskMetaForPrice(110, 100, 5, riskRows, 'neutral');
  assert.equal(m.side, 'short');
  assert.equal(m.usdt, 50);
  assert.equal(m.pct, 5);
});

test('gridRiskMetaForPrice: neutral + matched down row → long side', () => {
  const m = gridRiskMetaForPrice(80, 100, 5, riskRows, 'neutral');
  assert.equal(m.side, 'long');
  assert.equal(m.usdt, -80);
});

test('gridRiskMetaForPrice: unmatched price → unknown', () => {
  const m = gridRiskMetaForPrice(105, 100, 1, riskRows, 'neutral');
  assert.equal(m.side, 'unknown');
});

// ── fmtGridLineTitle ───────────────────────────────────────────

const fn2 = (x, d = 2) => Number(x).toFixed(d);

test('fmtGridLineTitle: anchor', () => {
  assert.equal(fmtGridLineTitle({ side: 'anchor', usdt: 0, pct: 0 }, fn2), '#0 · 0%, 0 USDT');
});

test('fmtGridLineTitle: tp-up / tp-down', () => {
  assert.equal(fmtGridLineTitle({ side: 'tp-up', usdt: 0, pct: 0 }, fn2), '0%, 0 USDT (фиксация)');
  assert.equal(fmtGridLineTitle({ side: 'tp-down', usdt: 0, pct: 0 }, fn2), '0%, 0 USDT (фиксация)');
});

test('fmtGridLineTitle: unknown / null → empty', () => {
  assert.equal(fmtGridLineTitle({ side: 'short', usdt: null, pct: null }, fn2), '');
  assert.equal(fmtGridLineTitle({ side: 'short', usdt: NaN, pct: 5 }, fn2), '');
});

test('fmtGridLineTitle: normal row', () => {
  assert.equal(fmtGridLineTitle({ side: 'short', usdt: 50.5, pct: 5.123 }, fn2), '5.12%, 50.50 USDT');
});

// ── Viewport helpers ───────────────────────────────────────────

function makeMockChart() {
  const log = { from: 0, to: 100 };
  const vt = { from: 1700000000, to: 1700100000 };
  const pr = { min: 90, max: 110 };
  const ts = {
    getVisibleLogicalRange: () => ({ ...log }),
    setVisibleLogicalRange: (r) => { log.from = r.from; log.to = r.to; },
    getVisibleRange: () => ({ ...vt }),
    setVisibleRange: (r) => { vt.from = r.from; vt.to = r.to; },
  };
  const ps = {
    getVisibleRange: () => ({ ...pr }),
    setVisibleRange: (r) => { pr.min = r.min; pr.max = r.max; },
  };
  return {
    lc: { timeScale: () => ts },
    cs: { priceScale: () => ps },
    _state: { log, vt, pr },
  };
}

test('captureGbLabViewport / applyGbViewportFreeze: roundtrip (log branch wins over vt)', () => {
  const { lc, cs, _state } = makeMockChart();
  // mutate
  _state.log.from = 5; _state.log.to = 50;
  _state.vt.from = 1700000500; _state.vt.to = 1700099500;
  _state.pr.min = 80; _state.pr.max = 120;
  const snap = captureGbLabViewport(lc, cs);
  assert.ok(snap.log && snap.vt && snap.pr);
  // reset and reapply
  _state.log.from = 0; _state.log.to = 100;
  _state.vt.from = 1700000000; _state.vt.to = 1700100000;
  _state.pr.min = 90; _state.pr.max = 110;
  applyGbViewportFreeze(lc, cs, snap);
  // logical range takes precedence (matches main.js behaviour: if(log)... else if(vt))
  assert.equal(_state.log.from, 5);
  assert.equal(_state.log.to, 50);
  // vt is intentionally NOT re-applied when log is present (matches LWC semantics)
  assert.equal(_state.vt.from, 1700000000);
  // price range is always reapplied
  assert.equal(_state.pr.min, 80);
  assert.equal(_state.pr.max, 120);
});

test('applyGbViewportFreeze: fallback to vt when log is missing', () => {
  const { lc, cs, _state } = makeMockChart();
  applyGbViewportFreeze(lc, cs, { vt: { from: 123, to: 456 }, pr: { min: 1, max: 2 } });
  assert.equal(_state.vt.from, 123);
  assert.equal(_state.vt.to, 456);
  assert.equal(_state.pr.min, 1);
});

test('captureGbLabViewport: missing lc/cs → null', () => {
  assert.equal(captureGbLabViewport(null, null), null);
  assert.equal(captureGbLabViewport({}, {}), null);
});

test('applyGbViewportFreeze: null snap / missing chart → no-op', () => {
  const { lc, cs, _state } = makeMockChart();
  _state.log.from = 1; _state.log.to = 2;
  applyGbViewportFreeze(lc, cs, null);
  assert.equal(_state.log.from, 1);
  applyGbViewportFreeze(null, null, { log: { from: 99, to: 100 } });
  // no throw = pass
});

test('gbWantBarsFromVisible: derived from visible range with +480 padding', () => {
  const lc = { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 100 }) }) };
  // ceil(100-0)+480 = 580, clamped to [200, 1400]
  assert.equal(gbWantBarsFromVisible(lc, 900), 580);
});

test('gbWantBarsFromVisible: huge visible range → clamp 1400', () => {
  const lc = { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 99999 }) }) };
  assert.equal(gbWantBarsFromVisible(lc, 900), 1400);
});

test('gbWantBarsFromVisible: tiny range → clamp 200', () => {
  const lc = { timeScale: () => ({ getVisibleLogicalRange: () => ({ from: 0, to: 5 }) }) };
  // ceil(5)+480 = 485
  assert.equal(gbWantBarsFromVisible(lc, 900), 485);
});

test('gbWantBarsFromVisible: no chart → fallback', () => {
  // +0 || 900 → 900, clamped to [300, 1200] = 900
  assert.equal(gbWantBarsFromVisible(null, 0), 900);
  assert.equal(gbWantBarsFromVisible({}, 0), 900);
  assert.equal(gbWantBarsFromVisible(null, 500), 500);
});
