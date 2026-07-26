// Unit tests for emaEditor.js — pure helpers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMA_COLORS,
  EMA_MIN_PERIOD,
  EMA_MAX_PERIOD,
  EMA_DEFAULT_PERIOD,
  validateEmaPeriod,
  nextAvailableColor,
  makeEmaConfig,
  visiblePeriods,
  buildEmaAlertPairs,
  emaButtonState,
  fmtEmaSym,
  resolveEmaActiveSym,
} from '../src/emaEditor.js';

// ─── validateEmaPeriod ──────────────────────────────────────────────────────

test('validateEmaPeriod: accepts valid integer', () => {
  assert.deepEqual(validateEmaPeriod(9),  { valid: true, value: 9 });
  assert.deepEqual(validateEmaPeriod(2),  { valid: true, value: 2 });
  assert.deepEqual(validateEmaPeriod(500), { valid: true, value: 500 });
});

test('validateEmaPeriod: rounds floats to nearest int', () => {
  assert.deepEqual(validateEmaPeriod(9.4),  { valid: true, value: 9 });
  assert.deepEqual(validateEmaPeriod(9.7),  { valid: true, value: 10 });
});

test('validateEmaPeriod: rejects empty and NaN', () => {
  assert.equal(validateEmaPeriod('').valid, false);
  assert.equal(validateEmaPeriod('').reason, 'empty');
  assert.equal(validateEmaPeriod(null).valid, false);
  assert.equal(validateEmaPeriod('abc').reason, 'nan');
  assert.equal(validateEmaPeriod(NaN).valid, false);
});

test('validateEmaPeriod: suggests min/max when out-of-range', () => {
  const r1 = validateEmaPeriod(1);
  assert.equal(r1.valid, false);
  assert.equal(r1.reason, 'below_min');
  assert.equal(r1.suggested, EMA_MIN_PERIOD);

  const r2 = validateEmaPeriod(999);
  assert.equal(r2.valid, false);
  assert.equal(r2.reason, 'above_max');
  assert.equal(r2.suggested, EMA_MAX_PERIOD);
});

test('validateEmaPeriod: accepts string numbers', () => {
  assert.deepEqual(validateEmaPeriod('20'), { valid: true, value: 20 });
  assert.deepEqual(validateEmaPeriod('20.5'), { valid: true, value: 21 });
});

// ─── nextAvailableColor ─────────────────────────────────────────────────────

test('nextAvailableColor: returns first unused colour', () => {
  const used = [{ color: EMA_COLORS[0] }, { color: EMA_COLORS[1] }];
  assert.equal(nextAvailableColor(used), EMA_COLORS[2]);
});

test('nextAvailableColor: skips over multiple used colours', () => {
  const used = EMA_COLORS.slice(0, 5).map(c => ({ color: c }));
  assert.equal(nextAvailableColor(used), EMA_COLORS[5]);
});

test('nextAvailableColor: returns first colour when all used', () => {
  const used = EMA_COLORS.map(c => ({ color: c }));
  assert.equal(nextAvailableColor(used), EMA_COLORS[0]);
});

test('nextAvailableColor: handles empty settings', () => {
  assert.equal(nextAvailableColor([]), EMA_COLORS[0]);
  assert.equal(nextAvailableColor(null), EMA_COLORS[0]);
});

// ─── makeEmaConfig ──────────────────────────────────────────────────────────

test('makeEmaConfig: default period + auto colour', () => {
  const cfg = makeEmaConfig([]);
  assert.equal(cfg.period, EMA_DEFAULT_PERIOD);
  assert.equal(cfg.color, EMA_COLORS[0]);
  assert.equal(cfg.visible, true);
});

test('makeEmaConfig: picks unused colour when settings non-empty', () => {
  const cfg = makeEmaConfig([{ color: EMA_COLORS[0] }], 14);
  assert.equal(cfg.period, 14);
  assert.equal(cfg.color, EMA_COLORS[1]);
});

// ─── visiblePeriods ─────────────────────────────────────────────────────────

test('visiblePeriods: dedupes and sorts', () => {
  const settings = [
    { period: 9,  visible: true },
    { period: 21, visible: true },
    { period: 9,  visible: true },     // duplicate
    { period: 50, visible: false },    // hidden
  ];
  assert.deepEqual(visiblePeriods(settings), [9, 21]);
});

test('visiblePeriods: empty input', () => {
  assert.deepEqual(visiblePeriods([]), []);
  assert.deepEqual(visiblePeriods(null), []);
  assert.deepEqual(visiblePeriods(undefined), []);
});

// ─── buildEmaAlertPairs ─────────────────────────────────────────────────────

test('buildEmaAlertPairs: empty periods → empty list', () => {
  assert.deepEqual(buildEmaAlertPairs([], []), []);
  assert.deepEqual(buildEmaAlertPairs([9], []), []);
});

test('buildEmaAlertPairs: generates all (i, j) pairs sorted ascending', () => {
  const pairs = buildEmaAlertPairs([9, 21, 50], []);
  assert.deepEqual(pairs.map(p => [p.a, p.b]), [
    [9, 21], [9, 50], [21, 50],
  ]);
  // All start disabled
  assert.ok(pairs.every(p => p.enabled === false));
});

test('buildEmaAlertPairs: preserves existing pair enabled state', () => {
  const existing = [
    { a: 9, b: 21, enabled: true },
    { a: 9, b: 50, enabled: false },
    // Stale entry that should be dropped (period no longer visible)
    { a: 9, b: 100, enabled: true },
  ];
  const pairs = buildEmaAlertPairs([9, 21, 50], existing);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].enabled, true);    // 9/21 carried over
  assert.equal(pairs[1].enabled, false);   // 9/50 carried over
  assert.equal(pairs[2].enabled, false);   // 21/50 new
});

test('buildEmaAlertPairs: normalises pair order (a < b)', () => {
  const existing = [{ a: 50, b: 9, enabled: true }];
  const pairs = buildEmaAlertPairs([9, 50], existing);
  assert.deepEqual([pairs[0].a, pairs[0].b], [9, 50]);
  assert.equal(pairs[0].enabled, true);
});

// ─── emaButtonState ─────────────────────────────────────────────────────────

test('emaButtonState: global on wins over per-symbol', () => {
  const r = emaButtonState({ emaVisible: true, emaSymEnabled: { BTCUSDT: false }, fsSym: 'BTCUSDT' });
  assert.deepEqual(r, { active: true, hasSymEnabled: false });
});

test('emaButtonState: per-symbol on when global off', () => {
  const r = emaButtonState({ emaVisible: false, emaSymEnabled: { BTCUSDT: true }, fsSym: 'BTCUSDT' });
  assert.deepEqual(r, { active: true, hasSymEnabled: true });
});

test('emaButtonState: both off', () => {
  const r = emaButtonState({ emaVisible: false, emaSymEnabled: {}, fsSym: 'BTCUSDT' });
  assert.deepEqual(r, { active: false, hasSymEnabled: false });
});

test('emaButtonState: handles no fsSym', () => {
  const r = emaButtonState({ emaVisible: false, emaSymEnabled: {}, fsSym: null });
  assert.equal(r.active, false);
  assert.equal(r.hasSymEnabled, false);
});

// ─── fmtEmaSym ──────────────────────────────────────────────────────────────

test('fmtEmaSym: strips USDT suffix', () => {
  assert.equal(fmtEmaSym('BTCUSDT'), 'BTC');
  assert.equal(fmtEmaSym('ETHUSDT'), 'ETH');
});

test('fmtEmaSym: passes through non-USDT symbols', () => {
  assert.equal(fmtEmaSym('EUR'), 'EUR');
});

test('fmtEmaSym: handles null/empty', () => {
  assert.equal(fmtEmaSym(null), '');
  assert.equal(fmtEmaSym(''), '');
});

// ─── resolveEmaActiveSym ────────────────────────────────────────────────────

test('resolveEmaActiveSym: editSym wins', () => {
  assert.equal(resolveEmaActiveSym({ editSym: 'XRPUSDT', fsSym: 'BTCUSDT', charts: [] }), 'XRPUSDT');
});

test('resolveEmaActiveSym: falls back to fsSym', () => {
  assert.equal(resolveEmaActiveSym({ editSym: null, fsSym: 'BTCUSDT', charts: [] }), 'BTCUSDT');
});

test('resolveEmaActiveSym: falls back to first chart', () => {
  assert.equal(resolveEmaActiveSym({
    editSym: null, fsSym: null,
    charts: [{ sym: null }, { sym: 'ETHUSDT' }],
  }), 'ETHUSDT');
});

test('resolveEmaActiveSym: returns null when nothing available', () => {
  assert.equal(resolveEmaActiveSym({ editSym: null, fsSym: null, charts: [] }), null);
});
