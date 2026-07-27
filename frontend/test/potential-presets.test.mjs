import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POT_FIELDS,
  POT_FIELD_DESC,
  POT_ABS_FIELDS,
  clampEmaPeriod,
  evalEmaTouchSignal,
  evalCondition,
  evalPreset,
  makePreset,
  ensureBuiltinSqueezePreset,
  scanPresetMatches,
  selectAlertableSymbols,
  totalActiveMatches,
  fmtConditionTag,
  fmtConditionValue,
} from '../src/potentialPresets.js';

const fakeEma = (candles, period) => {
  if (!Array.isArray(candles) || candles.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let ema = candles.slice(0, period).reduce((s, c) => s + c.c, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].c * k + ema * (1 - k);
    out.push({ t: candles[i].t, val: ema });
  }
  return out;
};

const ohlcSeries = (n, base = 100, step = 1) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = base + i * step;
    out.push({ t: i + 1, o: c - 0.5, h: c + 1, l: c - 1, c });
  }
  return out;
};

// ─── POT_FIELDS / metadata ──────────────────────────────────────
test('POT_FIELDS: contains all expected fields', () => {
  const ids = POT_FIELDS.map(f => f.id);
  for (const exp of ['ch24', 'ch7d', 'cday', 'bbSqz', 'bbBreak', 'volImpulse',
    'emaTouch', 'vr5', 'vr1h', 'tr5', 'tr1h', 'na14', 'na30', 'trd24', 'vol24']) {
    assert.ok(ids.includes(exp), `missing field ${exp}`);
  }
  for (const f of POT_FIELDS) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.label, 'string');
    assert.equal(typeof f.unit, 'string');
    assert.equal(typeof f.step, 'number');
  }
});

test('POT_FIELD_DESC: description exists for every field', () => {
  for (const f of POT_FIELDS) {
    assert.ok(typeof POT_FIELD_DESC[f.id] === 'string' && POT_FIELD_DESC[f.id].length > 0,
      `missing description for ${f.id}`);
  }
});

test('POT_ABS_FIELDS: contains directional-only fields', () => {
  for (const f of ['ch24', 'ch7d', 'cday', 'bbBreak']) {
    assert.ok(POT_ABS_FIELDS.has(f));
  }
  assert.ok(!POT_ABS_FIELDS.has('vol24'));
});

// ─── clampEmaPeriod ─────────────────────────────────────────────
test('clampEmaPeriod: clamps to [2, 400]', () => {
  assert.equal(clampEmaPeriod(0), 2);
  assert.equal(clampEmaPeriod(1), 2);
  assert.equal(clampEmaPeriod(20), 20);
  assert.equal(clampEmaPeriod(500), 400);
  assert.equal(clampEmaPeriod(20.7), 20);
  assert.equal(clampEmaPeriod(NaN), 2);
  assert.equal(clampEmaPeriod(undefined), 2);
});

// ─── evalEmaTouchSignal ─────────────────────────────────────────
test('evalEmaTouchSignal: returns 0 for empty/short input', () => {
  assert.equal(evalEmaTouchSignal(null, fakeEma, 20), 0);
  assert.equal(evalEmaTouchSignal([], fakeEma, 20), 0);
  assert.equal(evalEmaTouchSignal(ohlcSeries(10), fakeEma, 20), 0);
});

test('evalEmaTouchSignal: returns 1 when last candle spans EMA', () => {
  // Use a series where EMA is at the midpoint and last candle has wide [l, h]
  const series = ohlcSeries(40, 100, 0); // flat series, EMA = 100
  const last = series[series.length - 1];
  last.l = 95; last.h = 105;
  assert.equal(evalEmaTouchSignal(series, fakeEma, 20), 1);
});

test('evalEmaTouchSignal: returns 0 when last candle is fully above EMA', () => {
  const series = ohlcSeries(40, 200, 0); // flat 200, EMA = 200
  const last = series[series.length - 1];
  last.l = 210; last.h = 220;
  assert.equal(evalEmaTouchSignal(series, fakeEma, 20), 0);
});

// ─── evalCondition ──────────────────────────────────────────────
test('evalCondition: passes when value within [min, max]', () => {
  const cond = { field: 'ch24', min: 1, max: 10 };
  const m = { ch24: 5 };
  assert.equal(evalCondition(cond, m, [], fakeEma), true);
});

test('evalCondition: fails when value below min', () => {
  const cond = { field: 'ch24', min: 1, max: 10 };
  assert.equal(evalCondition(cond, { ch24: 0 }, [], fakeEma), false);
});

test('evalCondition: fails when value above max', () => {
  const cond = { field: 'ch24', min: 1, max: 10 };
  assert.equal(evalCondition(cond, { ch24: 20 }, [], fakeEma), false);
});

test('evalCondition: handles null min/max boundaries', () => {
  assert.equal(evalCondition({ field: 'ch24', min: null, max: 10 }, { ch24: -50 }, [], fakeEma), true);
  assert.equal(evalCondition({ field: 'ch24', min: 1, max: null }, { ch24: 9999 }, [], fakeEma), true);
});

test('evalCondition: fails when metric missing', () => {
  assert.equal(evalCondition({ field: 'ch24', min: 1, max: 10 }, null, [], fakeEma), false);
});

test('evalCondition: returns false when value is NaN', () => {
  assert.equal(evalCondition({ field: 'ch24', min: 1, max: 10 }, { ch24: NaN }, [], fakeEma), false);
});

test('evalCondition: applies abs modifier to directional fields', () => {
  const cond = { field: 'ch24', min: 3, max: null, abs: true };
  assert.equal(evalCondition(cond, { ch24: -5 }, [], fakeEma), true);
  assert.equal(evalCondition(cond, { ch24: -1 }, [], fakeEma), false);
});

test('evalCondition: ignores abs modifier on non-directional fields', () => {
  const cond = { field: 'vol24', min: 3, max: null, abs: true };
  // abs is ignored; vol24=−5 with min=3 → 5 >= 3? In evalCondition, val=-5 → -5 < 3 → false
  assert.equal(evalCondition(cond, { vol24: -5 }, [], fakeEma), false);
});

test('evalCondition: converts vol24 from USDT to M$', () => {
  const cond = { field: 'vol24', min: 1, max: null };
  // 1_000_000 USDT = 1 M$
  assert.equal(evalCondition(cond, { vol24: 1_000_000 }, [], fakeEma), true);
  assert.equal(evalCondition(cond, { vol24: 500_000 }, [], fakeEma), false);
});

test('evalCondition: legacy sqzPop alias maps to bbSqz', () => {
  const cond = { field: 'sqzPop', min: 1, max: null };
  assert.equal(evalCondition(cond, { bbSqz: 1.5 }, [], fakeEma), true);
  assert.equal(evalCondition(cond, { bbSqz: 0.5 }, [], fakeEma), false);
});

test('evalCondition: emaTouch field reads from k5 array', () => {
  const cond = { field: 'emaTouch', min: 1, max: null, period: 20 };
  const series = ohlcSeries(40, 100, 0);
  series[series.length - 1].l = 95;
  series[series.length - 1].h = 105;
  assert.equal(evalCondition(cond, { ch24: 0 }, series, fakeEma), true);
});

// ─── evalPreset ─────────────────────────────────────────────────
test('evalPreset: requires at least one condition', () => {
  assert.equal(evalPreset({ conditions: [] }, { ch24: 5 }, [], fakeEma), false);
});

test('evalPreset: all conditions must hold', () => {
  const preset = {
    conditions: [
      { field: 'ch24', min: 1, max: null },
      { field: 'bbSqz', min: 1, max: null },
    ],
  };
  assert.equal(evalPreset(preset, { ch24: 5, bbSqz: 1.5 }, [], fakeEma), true);
  assert.equal(evalPreset(preset, { ch24: 5, bbSqz: 0.5 }, [], fakeEma), false);
  assert.equal(evalPreset(preset, { ch24: 0.1, bbSqz: 1.5 }, [], fakeEma), false);
});

test('evalPreset: handles null preset', () => {
  assert.equal(evalPreset(null, {}, [], fakeEma), false);
  assert.equal(evalPreset(undefined, {}, [], fakeEma), false);
});

// ─── makePreset ─────────────────────────────────────────────────
test('makePreset: produces a valid preset record', () => {
  const p = makePreset('Test', [{ field: 'ch24', min: 1 }]);
  assert.ok(p.id.startsWith('pot'));
  assert.equal(p.name, 'Test');
  assert.equal(p.conditions.length, 1);
  assert.deepEqual(p.matches, {});
  assert.deepEqual(p.alerted, {});
  assert.equal(p.enabled, true);
  assert.equal(p.cooldown, 60);
});

test('makePreset: deep-copies conditions', () => {
  const src = [{ field: 'ch24', min: 1 }];
  const p = makePreset('Test', src);
  p.conditions[0].min = 99;
  assert.equal(src[0].min, 1);
});

test('makePreset: respects opts override', () => {
  const p = makePreset('Custom', [], { id: 'abc', enabled: false, cooldown: 300 });
  assert.equal(p.id, 'abc');
  assert.equal(p.enabled, false);
  assert.equal(p.cooldown, 300);
});

// ─── ensureBuiltinSqueezePreset ─────────────────────────────────
test('ensureBuiltinSqueezePreset: creates preset when missing', () => {
  const presets = [];
  const pr = ensureBuiltinSqueezePreset(presets);
  assert.ok(pr);
  assert.equal(presets.length, 1);
  assert.equal(pr.conditions.length, 3);
  assert.equal(pr.enabled, false);
  assert.equal(pr.cooldown, 120);
});

test('ensureBuiltinSqueezePreset: returns existing preset by name', () => {
  const presets = [];
  const a = ensureBuiltinSqueezePreset(presets);
  const b = ensureBuiltinSqueezePreset(presets);
  assert.equal(a, b);
  assert.equal(presets.length, 1);
});

// ─── scanPresetMatches ──────────────────────────────────────────
test('scanPresetMatches: returns matching symbols', () => {
  const preset = { conditions: [{ field: 'ch24', min: 1, max: null }], matches: {} };
  const symbols = ['A', 'B', 'C'];
  const getMetric = sym => ({ A: { ch24: 5 }, B: { ch24: -2 }, C: { ch24: 10 } }[sym]);
  const res = scanPresetMatches(preset, symbols, getMetric, () => [], fakeEma);
  assert.deepEqual(res.matched.sort(), ['A', 'C']);
  assert.equal(res.details.A.ch24, 5);
});

test('scanPresetMatches: preserves ts from previous matches', () => {
  const preset = {
    conditions: [{ field: 'ch24', min: 1 }],
    matches: { A: { ts: 12345, price: 100, ch24: 3 } },
  };
  const getMetric = sym => ({ A: { ch24: 5, price: 110 } }[sym]);
  const res = scanPresetMatches(preset, ['A'], getMetric, () => [], fakeEma);
  assert.equal(res.details.A.ts, 12345);
  assert.equal(res.details.A.price, 110);
});

test('scanPresetMatches: skips symbols without metrics', () => {
  const preset = { conditions: [{ field: 'ch24', min: 1 }], matches: {} };
  const getMetric = () => null;
  const res = scanPresetMatches(preset, ['A'], getMetric, () => [], fakeEma);
  assert.deepEqual(res.matched, []);
});

// ─── selectAlertableSymbols ─────────────────────────────────────
test('selectAlertableSymbols: returns new symbols not yet alerted', () => {
  const pr = { alerted: {}, cooldown: 60 };
  const out = selectAlertableSymbols(['A', 'B'], pr, 100000);
  assert.deepEqual(out.sort(), ['A', 'B']);
});

test('selectAlertableSymbols: respects cooldown', () => {
  const now = 100000;
  const pr = { alerted: { A: now - 30000 }, cooldown: 60 }; // A 30s ago, cooldown 60s
  const out = selectAlertableSymbols(['A', 'B'], pr, now);
  assert.deepEqual(out, ['B']);
});

test('selectAlertableSymbols: zero cooldown falls back to default (60s)', () => {
  // NOTE: original behaviour uses `pr.cooldown || 60`, so 0 is treated as missing.
  const now = 100000;
  const pr = { alerted: { A: now - 1 }, cooldown: 0 };
  const out = selectAlertableSymbols(['A'], pr, now);
  assert.deepEqual(out, []); // A was just alerted, default cooldown = 60s
});

// ─── totalActiveMatches ─────────────────────────────────────────
test('totalActiveMatches: sums matches across enabled presets only', () => {
  const presets = [
    { enabled: true, matches: { A: 1, B: 2 } },
    { enabled: false, matches: { C: 3 } },
    { enabled: true, matches: {} },
    { enabled: true, matches: { D: 4, E: 5, F: 6 } },
  ];
  assert.equal(totalActiveMatches(presets), 5);
});

test('totalActiveMatches: empty array → 0', () => {
  assert.equal(totalActiveMatches([]), 0);
});

// ─── fmtConditionTag ────────────────────────────────────────────
test('fmtConditionTag: min/max range', () => {
  const tag = fmtConditionTag({ field: 'ch24', min: 1, max: 10 });
  assert.match(tag, /ИЗМ 24ч %/);
  assert.match(tag, /≥1%/);
  assert.match(tag, /≤10%/);
});

test('fmtConditionTag: only min', () => {
  const tag = fmtConditionTag({ field: 'vol24', min: 5 });
  assert.match(tag, /Объём 24ч/);
  assert.match(tag, /≥5M\$/);
  assert.ok(!tag.includes('≤'));
});

test('fmtConditionTag: emaTouch field shows period', () => {
  const tag = fmtConditionTag({ field: 'emaTouch', period: 50 });
  assert.match(tag, /period=50/);
});

test('fmtConditionTag: abs modifier shown for directional fields', () => {
  const tag = fmtConditionTag({ field: 'ch24', min: 1, abs: true });
  assert.ok(tag.startsWith('|.|'));
});

test('fmtConditionTag: clamps ema period', () => {
  const tag = fmtConditionTag({ field: 'emaTouch', period: 1000 });
  assert.match(tag, /period=400/);
});

// ─── fmtConditionValue ──────────────────────────────────────────
test('fmtConditionValue: bbSqz returns ✓/·', () => {
  assert.equal(fmtConditionValue(1, { field: 'bbSqz' }), '✓');
  assert.equal(fmtConditionValue(0.5, { field: 'bbSqz' }), '·');
  assert.equal(fmtConditionValue(null, { field: 'bbSqz' }), '·');
});

test('fmtConditionValue: bbBreak returns ↑/↓/·', () => {
  assert.equal(fmtConditionValue(1, { field: 'bbBreak' }), '↑');
  assert.equal(fmtConditionValue(-1, { field: 'bbBreak' }), '↓');
  assert.equal(fmtConditionValue(0, { field: 'bbBreak' }), '·');
});

test('fmtConditionValue: emaTouch shows period in output', () => {
  assert.equal(fmtConditionValue(1, { field: 'emaTouch', period: 20 }), '✓(20)');
  assert.equal(fmtConditionValue(0, { field: 'emaTouch', period: 50 }), '·(50)');
});

test('fmtConditionValue: numeric fields use fn helper', () => {
  const fn = (v, d) => `${v.toFixed(d)}!`;
  assert.equal(fmtConditionValue(3.14, { field: 'ch24' }, { fn }), '3.14!');
});

test('fmtConditionValue: vol24/trd24 use fk helper', () => {
  const fk = (v) => `${v}M`;
  assert.equal(fmtConditionValue(42, { field: 'vol24' }, { fk }), '42M');
  assert.equal(fmtConditionValue(99, { field: 'trd24' }, { fk }), '99M');
});

test('fmtConditionValue: null returns •', () => {
  assert.equal(fmtConditionValue(null, { field: 'ch24' }), '•');
});
