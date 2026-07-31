// Grid Lab modal host tests (Step 3B.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGridLabBacktestMarkup,
  cleanupGridLabContext,
} from '../src/gridLab-ui.js';

const SAMPLE_PREFS = {
  global: {
    tf: '15m', levels: 12, leverage: 3, deposit: 1000,
    ratioLong: 3, ratioShort: 1, ratioStepPct: 0.6, gridMode: 'neutral',
  },
  symbolBounds: {
    BTCUSDT: { lower: 60000, upper: 70000, gridLevels: 14 },
  },
};

test('buildGridLabBacktestMarkup: contains all required input ids', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'BTCUSDT');
  for (const id of ['gbSym', 'gbTf', 'gbLevels', 'gbLow', 'gbHigh',
                    'gbLev', 'gbDep', 'gbRatioLong', 'gbRatioShort',
                    'gbRatioStep', 'gbRatioApply', 'gbGridMode',
                    'gbOut', 'gbChartWrap', 'gbChart', 'gbRulerCanvas', 'gbRisk']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('buildGridLabBacktestMarkup: prefills symbol from defSym', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'ETHUSDT');
  assert.ok(html.includes('value="ETHUSDT"'));
});

test('buildGridLabBacktestMarkup: prefills symbol bounds from prefs', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'BTCUSDT');
  assert.ok(html.includes('value="60000"'));
  assert.ok(html.includes('value="70000"'));
});

test('buildGridLabBacktestMarkup: prefills TF as selected option', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'BTCUSDT');
  assert.ok(html.includes('<option value="15m" selected'), '15m should be selected');
});

test('buildGridLabBacktestMarkup: empty bounds leave inputs blank with auto placeholder', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'NEWUSDT');
  assert.ok(html.includes('placeholder="auto"'));
  // Should NOT contain value= for those inputs (or should be empty)
  assert.ok(!html.includes('id="gbLow" type="number" step="any" value="60000"'));
});

test('buildGridLabBacktestMarkup: prefills gridMode correctly', () => {
  const longPrefs = { ...SAMPLE_PREFS, global: { ...SAMPLE_PREFS.global, gridMode: 'long' } };
  const html = buildGridLabBacktestMarkup(longPrefs, 'BTCUSDT');
  assert.ok(html.includes('<option value="long" selected'));
  assert.ok(!html.includes('<option value="neutral" selected'));
});

test('buildGridLabBacktestMarkup: defaults levels from global', () => {
  const html = buildGridLabBacktestMarkup(SAMPLE_PREFS, 'BTCUSDT');
  assert.ok(html.includes('value="12"'), 'levels=12 should appear in gbLevels input');
});

test('cleanupGridLabContext: clears timers, observers, and signal', () => {
  const body = {
    _gridLabUiTimer: setTimeout(() => {}, 1000),
    _gbPrepT: setTimeout(() => {}, 1000),
    _gbChartCtx: {
      _gbVpLockUnsub: () => { throw new Error('should not be called from this test'); },
      _pollTimer: setInterval(() => {}, 1000),
      gbLabSig: { abort: () => { body._abortCalled = true; } },
      ro: { disconnect: () => { body._roDisconnected = true; } },
      lc: { remove: () => { body._lcRemoved = true; } },
    },
  };
  // Override _gbVpLockUnsub to a noop for safety
  body._gbChartCtx._gbVpLockUnsub = () => { body._vpUnsub = true; };
  cleanupGridLabContext(body);
  assert.equal(body._vpUnsub, true);
  assert.equal(body._abortCalled, true);
  assert.equal(body._roDisconnected, true);
  assert.equal(body._lcRemoved, true);
});

test('cleanupGridLabContext: handles missing fields gracefully', () => {
  const body = {};
  // Should not throw
  cleanupGridLabContext(body);
  assert.equal(body._gridLabUiTimer, undefined);
});

test('cleanupGridLabContext: swallows errors from cleanup callbacks', () => {
  const body = {
    _gbChartCtx: {
      _gbVpLockUnsub: () => { throw new Error('boom1'); },
      _pollTimer: null,
      gbLabSig: { abort: () => { throw new Error('boom2'); } },
      ro: { disconnect: () => { throw new Error('boom3'); } },
      lc: { remove: () => { throw new Error('boom4'); } },
    },
  };
  // Should not throw despite all-callback errors
  cleanupGridLabContext(body);
  assert.ok(true, 'survived all throws');
});

test('cleanupGridLabContext: undefined body is a no-op', () => {
  cleanupGridLabContext(undefined);
  assert.ok(true);
});
