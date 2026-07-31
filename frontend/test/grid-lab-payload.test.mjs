// ═══════════════════════════════════════════════════════════════
//  Unit tests for buildGridLabPayload
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGridLabPayload } from '../src/gridBotScreeners.js';

// ── Swing shape: bounds directly on the row ────────────────────
test('buildGridLabPayload: swing row → 15m tf, direct bounds', () => {
  const swingRow = {
    sym: 'BTCUSDT',
    score: 11,
    gridLo: 60000,
    gridHi: 70000,
    stepAbs: 250,
    stepPct: 0.38,
  };
  const p = buildGridLabPayload(swingRow, 'swing');
  assert.equal(p.sym, 'BTCUSDT');
  assert.equal(p.tf, '15m');
  assert.equal(p.lower, 60000);
  assert.equal(p.upper, 70000);
  assert.equal(p.stepAbs, 250);
  assert.equal(p.stepPct, 0.38);
  assert.equal(p.source, 'swing');
  assert.equal(p.score, 11);
});

// ── Pick: same shape as Swing, but 5m tf ──────────────────────
test('buildGridLabPayload: pick row → 5m tf, direct bounds', () => {
  const pickRow = {
    sym: 'ETHUSDT',
    score: 9,
    gridLo: 3000,
    gridHi: 3500,
    stepAbs: 10,
    stepPct: 0.31,
  };
  const p = buildGridLabPayload(pickRow, 'pick');
  assert.equal(p.sym, 'ETHUSDT');
  assert.equal(p.tf, '5m');
  assert.equal(p.lower, 3000);
  assert.equal(p.upper, 3500);
});

// ── Intraday: bounds nested under row.grid ─────────────────────
test('buildGridLabPayload: intra row → 5m tf, nested bounds', () => {
  const intraRow = {
    sym: 'SOLUSDT',
    score: 8,
    grid: {
      gLo: 130,
      gHi: 145,
      stepAbs: 0.4,
      stepPct: 0.29,
      nLev: 18,
    },
  };
  const p = buildGridLabPayload(intraRow, 'intra');
  assert.equal(p.sym, 'SOLUSDT');
  assert.equal(p.tf, '5m');
  assert.equal(p.lower, 130);
  assert.equal(p.upper, 145);
  assert.equal(p.stepAbs, 0.4);
  assert.equal(p.stepPct, 0.29);
  assert.equal(p.levels, 18);
  // Intraday step/levels come from grid, not from row directly
  assert.notEqual(p.stepAbs, intraRow.stepAbs); // undefined on parent
});

// ── null/garbage row guards ────────────────────────────────────
test('buildGridLabPayload: null row → null', () => {
  assert.equal(buildGridLabPayload(null, 'swing'), null);
  assert.equal(buildGridLabPayload(undefined, 'intra'), null);
});

test('buildGridLabPayload: row without sym → null', () => {
  assert.equal(buildGridLabPayload({ score: 5 }, 'swing'), null);
});

test('buildGridLabPayload: row with missing bounds → null fields', () => {
  const p = buildGridLabPayload({ sym: 'XRPUSDT', score: 4 }, 'swing');
  assert.equal(p.sym, 'XRPUSDT');
  assert.equal(p.lower, null);
  assert.equal(p.upper, null);
  assert.equal(p.stepAbs, null);
  assert.equal(p.stepPct, null);
  assert.equal(p.score, 4);
});

// ── NaN / Infinity guards ──────────────────────────────────────
test('buildGridLabPayload: NaN bounds → null', () => {
  const row = { sym: 'XRPUSDT', score: 5, gridLo: NaN, gridHi: Infinity };
  const p = buildGridLabPayload(row, 'swing');
  assert.equal(p.lower, null);
  assert.equal(p.upper, null);
});

// ── source param shapes the result ─────────────────────────────
test('buildGridLabPayload: source defaults bounds-source when ambiguous', () => {
  // Same row, two different sources → Swing reads from row.gridLo, Intra from row.grid.gLo
  const row = {
    sym: 'BNBUSDT',
    score: 6,
    gridLo: 500,
    gridHi: 600,
    grid: { gLo: 510, gHi: 590, stepAbs: 5, stepPct: 0.9, nLev: 12 },
  };
  assert.equal(buildGridLabPayload(row, 'swing').lower, 500);
  assert.equal(buildGridLabPayload(row, 'intra').lower, 510);
  assert.equal(buildGridLabPayload(row, 'intra').upper, 590);
  // Swing has no gridLevels source
  assert.equal(buildGridLabPayload(row, 'swing').levels, null);
  assert.equal(buildGridLabPayload(row, 'intra').levels, 12);
});

// ── Smart source: bounds in row.gridBounds, direction carried through ──
test('buildGridLabPayload: smart row → reads from gridBounds, includes direction', () => {
  const smartRow = {
    sym: 'BTCUSDT',
    score: 12,
    gridBounds: { lower: 60000, upper: 70000, step: 250, levels: 18 },
    direction: 'LONG',
  };
  const p = buildGridLabPayload(smartRow, 'smart');
  assert.equal(p.sym, 'BTCUSDT');
  assert.equal(p.tf, '15m');
  assert.equal(p.lower, 60000);
  assert.equal(p.upper, 70000);
  assert.equal(p.stepAbs, 250);
  assert.equal(p.levels, 18);
  assert.equal(p.direction, 'LONG');
  assert.equal(p.source, 'smart');
});

test('buildGridLabPayload: smart SHORT direction', () => {
  const p = buildGridLabPayload({
    sym: 'XRPUSDT',
    score: 10,
    gridBounds: { lower: 0.4, upper: 0.6, step: 0.005, levels: 16 },
    direction: 'SHORT',
  }, 'smart');
  assert.equal(p.direction, 'SHORT');
});

test('buildGridLabPayload: smart NEUTRAL direction', () => {
  const p = buildGridLabPayload({
    sym: 'ETHUSDT',
    score: 9,
    gridBounds: { lower: 3000, upper: 3500, step: 10, levels: 20 },
    direction: 'NEUTRAL',
  }, 'smart');
  assert.equal(p.direction, 'NEUTRAL');
});

test('buildGridLabPayload: smart without direction → null', () => {
  const p = buildGridLabPayload({
    sym: 'ADAUSDT',
    score: 8,
    gridBounds: { lower: 0.3, upper: 0.4, step: 0.001, levels: 12 },
  }, 'smart');
  assert.equal(p.direction, null);
});

test('buildGridLabPayload: non-smart sources ignore direction', () => {
  const row = { sym: 'BTCUSDT', score: 5, gridLo: 1, gridHi: 2, direction: 'LONG' };
  assert.equal(buildGridLabPayload(row, 'swing').direction, null);
  assert.equal(buildGridLabPayload(row, 'pick').direction, null);
});
