// ═══════════════════════════════════════════════════════════════
//  Unit tests for gridLab-ui.js (Step 3B — pure handlers)
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pushBoundsUndo,
  undoBounds,
  redoBounds,
  pushRedoFromCurrent,
  pushUndoFromCurrent,
  applyBoundsToPrefs,
  readGridLabInputs,
  getGridSelectorRows,
} from '../src/gridLab-ui.js';

// ── pushBoundsUndo ─────────────────────────────────────────────

test('pushBoundsUndo: empty modal → no push', () => {
  assert.equal(pushBoundsUndo(null, () => '100', () => '110'), false);
});

test('pushBoundsUndo: non-finite values → no push', () => {
  const m = {};
  assert.equal(pushBoundsUndo(m, () => 'abc', () => '110'), false);
  assert.equal(pushBoundsUndo(m, () => '', () => ''), false);
  assert.equal(m._gbBoundsUndo?.length || 0, 0);
});

test('pushBoundsUndo: identical to last → no push (dedup)', () => {
  const m = {};
  pushBoundsUndo(m, () => '100', () => '110');
  pushBoundsUndo(m, () => '100', () => '110');
  assert.equal(m._gbBoundsUndo.length, 1);
});

test('pushBoundsUndo: different values → push, redo cleared', () => {
  const m = { _gbBoundsRedo: [{ lo: 1, hi: 2 }] };
  pushBoundsUndo(m, () => '100', () => '110');
  assert.equal(m._gbBoundsUndo.length, 1);
  assert.equal(m._gbBoundsUndo[0].lo, 100);
  assert.equal(m._gbBoundsUndo[0].hi, 110);
  assert.equal(m._gbBoundsRedo.length, 0, 'redo stack should be cleared');
});

test('pushBoundsUndo: limit enforced via shift', () => {
  const m = {};
  for (let i = 0; i < 60; i++) pushBoundsUndo(m, () => String(100 + i), () => String(110 + i), { limit: 50 });
  assert.equal(m._gbBoundsUndo.length, 50);
  assert.equal(m._gbBoundsUndo[0].lo, 110, 'oldest should be shifted out');
  assert.equal(m._gbBoundsUndo[m._gbBoundsUndo.length - 1].lo, 159);
});

// ── undoBounds / redoBounds ────────────────────────────────────

test('undoBounds: empty stack → null', () => {
  assert.equal(undoBounds(null), null);
  assert.equal(undoBounds({}), null);
});

test('undoBounds: returns last entry', () => {
  const m = {};
  pushBoundsUndo(m, () => '100', () => '110');
  pushBoundsUndo(m, () => '90', () => '120');
  const r = undoBounds(m);
  assert.ok(r);
  assert.equal(r.prev.lo, 90);
  assert.equal(r.prev.hi, 120);
  assert.equal(m._gbBoundsUndo.length, 1);
});

test('redoBounds: empty redo stack → null', () => {
  assert.equal(redoBounds(null), null);
  assert.equal(redoBounds({}), null);
});

test('redoBounds: returns redo entry', () => {
  const m = {};
  pushBoundsUndo(m, () => '100', () => '110');
  pushBoundsUndo(m, () => '90', () => '120');
  undoBounds(m); // pops {90,120} from undo; caller must push current {90,120} to redo via pushRedoFromCurrent
  pushRedoFromCurrent(m, 90, 120);
  const r = redoBounds(m);
  assert.ok(r);
  assert.equal(r.next.lo, 90);
  assert.equal(r.next.hi, 120);
});

// ── pushRedoFromCurrent / pushUndoFromCurrent ──────────────────

test('pushRedoFromCurrent: finite values → push', () => {
  const m = {};
  assert.equal(pushRedoFromCurrent(m, 100, 110), true);
  assert.equal(m._gbBoundsRedo.length, 1);
});

test('pushRedoFromCurrent: NaN → no push', () => {
  const m = {};
  assert.equal(pushRedoFromCurrent(m, NaN, 110), false);
  assert.equal(m._gbBoundsRedo?.length || 0, 0);
});

test('pushUndoFromCurrent: honours MAX_UNDO (50) limit', () => {
  const m = {};
  for (let i = 0; i < 55; i++) pushUndoFromCurrent(m, i, i + 10);
  assert.equal(m._gbBoundsUndo.length, 50);
  assert.equal(m._gbBoundsUndo[0].lo, 5, 'oldest should be shifted out');
});

// ── applyBoundsToPrefs ─────────────────────────────────────────

test('applyBoundsToPrefs: empty sym → no-op', () => {
  const prefs = { symbolBounds: {} };
  applyBoundsToPrefs(prefs, '', 100, 110);
  assert.deepEqual(prefs.symbolBounds, {});
});

test('applyBoundsToPrefs: creates symbolBounds if missing', () => {
  const prefs = {};
  applyBoundsToPrefs(prefs, 'BTC', 100, 110);
  assert.deepEqual(prefs.symbolBounds.BTC, { lower: 100, upper: 110 });
});

test('applyBoundsToPrefs: preserves other props on existing entry', () => {
  const prefs = { symbolBounds: { BTC: { anchorPrice: 105, gridLevels: [1, 2, 3] } } };
  applyBoundsToPrefs(prefs, 'BTC', 100, 110);
  assert.deepEqual(prefs.symbolBounds.BTC, {
    anchorPrice: 105,
    gridLevels: [1, 2, 3],
    lower: 100,
    upper: 110,
  });
});

// ── readGridLabInputs ──────────────────────────────────────────

test('readGridLabInputs: clamps and trims sym', () => {
  const cfg = readGridLabInputs(
    { sym: '  btc ', tf: '1h', levels: 99, leverage: 99, deposit: 0, lower: 'abc', upper: '110', gridMode: 'long' },
    {}, 900, [],
  );
  assert.equal(cfg.sym, 'BTC');
  assert.equal(cfg.tf, '1h');
  assert.equal(cfg.levels, 60, 'levels clamped to 60');
  assert.equal(cfg.leverage, 25, 'leverage clamped to 25');
  assert.ok(cfg.deposit >= 0.1, 'deposit clamped to GB_DEP_MIN (0.1)');
  assert.equal(cfg.lower, 0, 'invalid lower → 0');
  assert.equal(cfg.upper, 110);
  assert.equal(cfg.gridMode, 'long');
});

test('readGridLabInputs: pulls anchorPrice and gridLevels from prefs', () => {
  const prefs = { symbolBounds: { BTC: { anchorPrice: 105, gridLevels: [100, 105, 110] } } };
  const cfg = readGridLabInputs({ sym: 'btc', tf: '5m', levels: 12, leverage: 3, deposit: 500, lower: '90', upper: '120', gridMode: 'neutral' }, prefs, 800, []);
  assert.equal(cfg.anchorPrice, 105);
  assert.deepEqual(cfg.gridLevels, [100, 105, 110]);
});

test('readGridLabInputs: invalid anchorPrice in prefs → null', () => {
  const prefs = { symbolBounds: { BTC: { anchorPrice: 'oops' } } };
  const cfg = readGridLabInputs({ sym: 'btc', tf: '5m', levels: 12, leverage: 3, deposit: 500, lower: '90', upper: '120', gridMode: 'neutral' }, prefs, 800, []);
  assert.equal(cfg.anchorPrice, null);
});

test('readGridLabInputs: wantBars clamped to [120, 1400]', () => {
  const cfg = readGridLabInputs({ sym: 'x', tf: '5m', levels: 12, leverage: 3, deposit: 500, lower: '90', upper: '120', gridMode: 'neutral' }, {}, 9999, []);
  assert.equal(cfg.wantBars, 1400);
  const cfg2 = readGridLabInputs({ sym: 'x', tf: '5m', levels: 12, leverage: 3, deposit: 500, lower: '90', upper: '120', gridMode: 'neutral' }, {}, 1, []);
  assert.equal(cfg2.wantBars, 120);
});

test('readGridLabInputs: candles pass-through', () => {
  const candles = [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5 }];
  const cfg = readGridLabInputs({ sym: 'x', tf: '5m', levels: 12, leverage: 3, deposit: 500, lower: '0', upper: '2', gridMode: 'neutral' }, {}, 800, candles);
  assert.equal(cfg.candles, candles);
});

// ── getGridSelectorRows ────────────────────────────────────────

test('getGridSelectorRows: filters by calcScore (null/infinite skip)', () => {
  const syms = ['A', 'B', 'C', 'D'];
  const mx = {
    A: { r24: 1, na14: 0.1, ch24: 0.5, vol24: 1000, trd24: 100 },
    B: { r24: 2, na14: 0.2, ch24: 1, vol24: 2000, trd24: 200 },
    C: { r24: 3, na14: 0.3, ch24: 1.5, vol24: 3000, trd24: 300 },
    D: { r24: 4, na14: 0.4, ch24: 2, vol24: 4000, trd24: 400 },
  };
  const score = (m) => m.vol24;
  const rows = getGridSelectorRows(syms, mx, score);
  assert.equal(rows.length, 4);
  // sorted desc by score (vol24)
  assert.equal(rows[0].sym, 'D');
  assert.equal(rows[3].sym, 'A');
});

test('getGridSelectorRows: skips null/infinite scores', () => {
  const syms = ['A', 'B', 'C'];
  const mx = {
    A: { vol24: 100 },
    B: { vol24: 200 },
    C: { vol24: 0 },
  };
  const rows = getGridSelectorRows(syms, mx, (m) => (m.vol24 > 0 ? m.vol24 : null));
  assert.equal(rows.length, 2);
});

test('getGridSelectorRows: limit honoured and clamped [3, 60]', () => {
  const syms = Array.from({ length: 100 }, (_, i) => 'X' + i);
  const mx = Object.fromEntries(syms.map((s, i) => [s, { vol24: i }]));
  const rows = getGridSelectorRows(syms, mx, (m) => m.vol24, { limit: 5 });
  assert.equal(rows.length, 5);

  const big = getGridSelectorRows(syms, mx, (m) => m.vol24, { limit: 999 });
  assert.equal(big.length, 60, 'limit clamped to 60');

  const tiny = getGridSelectorRows(syms, mx, (m) => m.vol24, { limit: 0 });
  assert.equal(tiny.length, 3, 'limit clamped to 3 minimum');
});

test('getGridSelectorRows: missing metric for sym → skip', () => {
  const syms = ['A', 'B'];
  const mx = { A: { vol24: 100 } };
  const rows = getGridSelectorRows(syms, mx, (m) => m.vol24);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sym, 'A');
});

test('getGridSelectorRows: bad inputs → []', () => {
  assert.deepEqual(getGridSelectorRows(null, {}, () => 1), []);
  assert.deepEqual(getGridSelectorRows(['A'], null, () => 1), []);
  assert.deepEqual(getGridSelectorRows(['A'], {}, null), []);
});
