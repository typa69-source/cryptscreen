// Grid Lab sync orchestration tests (Step 3B.4)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock DOM helpers — returns the same object for any selector
function mkBody(values) {
  return {
    querySelector(sel) {
      const id = sel.replace(/^#/, '');
      const v = values[id];
      if (v === undefined) return null;
      return { value: v };
    }
  };
}

import {
  collectGridLabFields,
  detectBoundsChanges,
} from '../src/gridLab-ui.js';

test('collectGridLabFields: extracts all form fields', () => {
  const body = mkBody({
    gbSym: 'BTCUSDT',
    gbTf: '15m',
    gbHigh: '70000',
    gbLow: '60000',
    gbLevels: '14',
    gbLev: '5',
    gbDep: '500',
    gbMode: 'long',
    gbAnchor: '65000',
  });
  const out = collectGridLabFields(body);
  assert.equal(out.sym, 'BTCUSDT');
  assert.equal(out.tf, '15m');
  assert.equal(out.upper, '70000');
  assert.equal(out.lower, '60000');
  assert.equal(out.levels, '14');
  assert.equal(out.leverage, '5');
  assert.equal(out.deposit, '500');
  assert.equal(out.gridMode, 'long');
  assert.equal(out.anchorPrice, '65000');
});

test('collectGridLabFields: handles missing fields gracefully', () => {
  const body = mkBody({}); // no fields
  const out = collectGridLabFields(body);
  assert.equal(out.sym, undefined);
  assert.equal(out.tf, undefined);
  assert.equal(out.upper, undefined);
  assert.equal(out.lower, undefined);
});

test('collectGridLabFields: handles null body', () => {
  const body = { querySelector: () => null };
  const out = collectGridLabFields(body);
  assert.equal(out.sym, undefined);
});

test('detectBoundsChanges: detects lower bound change', () => {
  const prev = { lower: 100, upper: 200, levels: 10 };
  const { loCh, hiCh, lvlCh } = detectBoundsChanges('105', '200', 10, prev);
  assert.equal(loCh, true);
  assert.equal(hiCh, false);
  assert.equal(lvlCh, false);
});

test('detectBoundsChanges: detects upper bound change', () => {
  const prev = { lower: 100, upper: 200, levels: 10 };
  const { loCh, hiCh, lvlCh } = detectBoundsChanges('100', '205', 10, prev);
  assert.equal(loCh, false);
  assert.equal(hiCh, true);
  assert.equal(lvlCh, false);
});

test('detectBoundsChanges: detects levels change', () => {
  const prev = { lower: 100, upper: 200, levels: 10 };
  const { loCh, hiCh, lvlCh } = detectBoundsChanges('100', '200', 12, prev);
  assert.equal(lvlCh, true);
});

test('detectBoundsChanges: empty form values are not changes', () => {
  const prev = { lower: 100, upper: 200, levels: 10 };
  const { loCh, hiCh } = detectBoundsChanges('', '', 10, prev);
  assert.equal(loCh, false);
  assert.equal(hiCh, false);
});

test('detectBoundsChanges: invalid number is not a change', () => {
  const prev = { lower: 100, upper: 200 };
  const { loCh, hiCh } = detectBoundsChanges('abc', 'xyz', null, prev);
  assert.equal(loCh, false);
  assert.equal(hiCh, false);
});

test('detectBoundsChanges: same value is not a change', () => {
  const prev = { lower: 100, upper: 200, levels: 10 };
  const { loCh, hiCh, lvlCh } = detectBoundsChanges('100', '200', 10, prev);
  assert.equal(loCh, false);
  assert.equal(hiCh, false);
  assert.equal(lvlCh, false);
});

test('detectBoundsChanges: null prevB is handled', () => {
  const { loCh, hiCh } = detectBoundsChanges('100', '200', 10, {});
  assert.equal(loCh, true);
  assert.equal(hiCh, true);
});

test('detectBoundsChanges: whitespace-only strings not changes', () => {
  const prev = { lower: 100, upper: 200 };
  const { loCh, hiCh } = detectBoundsChanges('   ', '  ', null, prev);
  assert.equal(loCh, false);
  assert.equal(hiCh, false);
});
