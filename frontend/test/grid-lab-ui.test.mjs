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
  canReuseGridLabChart,
  levelsCacheKey,
  LEVELS_CACHE_TTL_MS,
  axisLabelIdx,
  PREVIEW_MAX_AXIS_LABELS,
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
    { sym: '  btc ', tf: '1h', levels: 999, leverage: 99, deposit: 0, lower: 'abc', upper: '110', gridMode: 'long' },
    {}, 900, [],
  );
  assert.equal(cfg.sym, 'BTC');
  assert.equal(cfg.tf, '1h');
  assert.equal(cfg.levels, 150, 'levels clamped to GB_LEVELS_MAX (150), а не 60');
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


// ═══════════════════════════════════════════════════════════════
//  График не должен менять масштаб/положение при правке уровней:
//  пересоздаём чарт ТОЛЬКО когда меняются данные, иначе — апдейт на месте.
// ═══════════════════════════════════════════════════════════════

const mkPrev = (samples, sym = 'BTCUSDT', tf = '5m') => ({
  lc: {}, cs: {}, gbCh: {},
  sym, tf,
  merged: samples,
});

const mkCandlesSig = (n, t0 = 1700000000000, lastClose = 100) =>
  Array.from({ length: n }, (_, i) => ({
    t: t0 + i * 60000, o: 100, h: 101, l: 99, c: i === n - 1 ? lastClose : 100,
  }));

test('canReuseGridLabChart: те же свечи + те же параметры → апдейт на месте', () => {
  const cs = mkCandlesSig(50);
  const prev = mkPrev(cs);
  const out = { ok: true, symbol: 'BTCUSDT', tf: '5m', candles: cs, levels: 12, lower: 95, upper: 105 };
  assert.equal(canReuseGridLabChart(prev, out, { reuseChart: true }), true);
  // смена только уровней/границ не должна требовать пересоздания
  assert.equal(canReuseGridLabChart(prev, { ...out, levels: 77, lower: 90, upper: 110 }, { reuseChart: true }), true);
});

test('canReuseGridLabChart: без флага reuseChart — всегда новый чарт', () => {
  const cs = mkCandlesSig(50);
  const prev = mkPrev(cs);
  const out = { ok: true, symbol: 'BTCUSDT', tf: '5m', candles: cs };
  assert.equal(canReuseGridLabChart(prev, out, {}), false);
  assert.equal(canReuseGridLabChart(prev, out, { keepViewport: true }), false);
});

test('canReuseGridLabChart: другой символ/ТФ/свечи/нет чарта → пересоздание', () => {
  const cs = mkCandlesSig(50);
  const out = { ok: true, symbol: 'BTCUSDT', tf: '5m', candles: cs };
  assert.equal(canReuseGridLabChart(mkPrev(cs, 'ETHUSDT'), out, { reuseChart: true }), false);
  assert.equal(canReuseGridLabChart(mkPrev(cs, 'BTCUSDT', '1h'), out, { reuseChart: true }), false);
  assert.equal(canReuseGridLabChart(mkPrev(null), out, { reuseChart: true }), false);
  assert.equal(canReuseGridLabChart({ lc: {}, cs: {} }, out, { reuseChart: true }), false);
  // свечи приросли (новый бар) → нужен setData, пересоздаём
  assert.equal(canReuseGridLabChart(mkPrev(mkCandlesSig(51)), out, { reuseChart: true }), false);
  // тот же размер, но обновился close последнего бара → пересоздаём
  assert.equal(canReuseGridLabChart(mkPrev(mkCandlesSig(50, 1700000000000, 777)), out, { reuseChart: true }), false);
  // провалидированный out не ok → пересоздание
  assert.equal(canReuseGridLabChart(mkPrev(cs), { ...out, ok: false }, { reuseChart: true }), false);
});

test('levelsCacheKey: не зависит от N, зависит от входов скана', () => {
  const c1m = mkCandlesSig(30);
  const base = { sym: 'BTCUSDT', lo: 95, hi: 105, startMs: 1700000000000, deposit: 500, ex: 'bybit', c1m };
  const k1 = levelsCacheKey(base);
  // тот же вход → тот же ключ (ползунок N не участвует в ключе вообще)
  assert.equal(levelsCacheKey({ ...base }), k1);
  // изменились границы / старт / депо / биржа → новый ключ → нужен пересчёт
  assert.notEqual(levelsCacheKey({ ...base, lo: 94 }), k1);
  assert.notEqual(levelsCacheKey({ ...base, hi: 106 }), k1);
  assert.notEqual(levelsCacheKey({ ...base, startMs: 1700000060000 }), k1);
  assert.notEqual(levelsCacheKey({ ...base, deposit: 1000 }), k1);
  assert.notEqual(levelsCacheKey({ ...base, ex: 'binance' }), k1);
  assert.notEqual(levelsCacheKey({ ...base, sym: 'ETHUSDT' }), k1);
  // пришёл новый 1m-бар → окно другое → пересчёт
  assert.notEqual(levelsCacheKey({ ...base, c1m: mkCandlesSig(31) }), k1);
});

test('levelsCacheKey: пустой/битый вход не бросает', () => {
  const k = levelsCacheKey({});
  assert.equal(typeof k, 'string');
  assert.ok(k.includes('|'));
  assert.equal(levelsCacheKey(null), levelsCacheKey({}));
  assert.equal(levelsCacheKey({ c1m: null }).split('|').pop(), '0');
  assert.ok(LEVELS_CACHE_TTL_MS > 0);
});

// ── сетка рисуется ЦЕЛИКОМ, разрежаются только подписи оси ──

test('axisLabelIdx: до лимита подписаны все линии, крайние — всегда', () => {
  const a = axisLabelIdx(5, 14);
  assert.deepEqual([...a].sort((x, y) => x - y), [0, 1, 2, 3, 4]);
  const b = axisLabelIdx(0, 14);
  assert.equal(b.size, 0);
  const c = axisLabelIdx(1, 14);
  assert.deepEqual([...c], [0]);
});

test('axisLabelIdx: 151 линия → подписей немного, крайние есть, шаг равномерный', () => {
  const a = axisLabelIdx(151, 14);
  const arr = [...a].sort((x, y) => x - y);
  assert.ok(arr.length <= 16, `подписей ${arr.length}, ожидалось <= 16`);
  assert.equal(arr[0], 0);
  assert.equal(arr[arr.length - 1], 150, 'подпись верхней границы обязательна');
  const steps = arr.slice(1).map((v, i) => v - arr[i]);
  assert.ok(Math.max(...steps) - Math.min(...steps) <= 1, `шаг подписей не должен «прыгать»: ${steps.join(',')}`);
});

test('axisLabelIdx: max меньше 2 всё равно даёт обе крайние подписи', () => {
  const a = axisLabelIdx(10, 1);
  assert.equal(a.has(0), true);
  assert.equal(a.has(9), true);
});
