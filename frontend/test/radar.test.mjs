// ═══════════════════════════════════════════════════════════════
//  Unit tests for radar.js — pump/dump detector core
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  robustZ,
  ROBUST_Z_THRESH,
  detectRadarEvent,
  confirmRadarEvent,
  radarEventsForSeries,
  measureRadarOutcome,
  aggregateHitRates,
  RADAR_OUTCOMES,
} from '../src/radar.js';

// ── helpers ────────────────────────────────────────────────────
// Deterministic PRNG (fixed seed) — tests must not flicker on
// random draws: a fragile threshold + random noise = flaky suite.
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}
function makeGauss(rand) {
  return () => {
    const u1 = Math.max(rand(), 1e-12), u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}
function kl(closes, wick = 0.3) {
  return closes.map((c) => ({ t: 0, o: c, h: c + wick, l: c - wick, c, v: 100, qv: 100 }));
}
function quietSeries(n = 300, base = 100, seed = 42) {
  const g = makeGauss(makeLcg(seed));
  const out = [];
  let p = base;
  for (let i = 0; i < n; i++) {
    p = p * (1 + g() * 0.004);
    out.push(Math.max(0.01, p));
  }
  return out;
}

// ── robustZ ────────────────────────────────────────────────────
test('robustZ: ~0 for inliers, large for outliers (median/MAD scale)', () => {
  const g = makeGauss(makeLcg(7));
  const xs = [];
  for (let i = 0; i < 200; i++) xs.push(g());
  const med = xs.slice().sort((a, b) => a - b)[100];
  const zIn = robustZ(xs, 0.5, med);
  assert.ok(Math.abs(zIn) < 4, `inlier z should be small, got ${zIn}`);
  const zOut = robustZ(xs, 5.0, med);
  assert.ok(zOut > 4, `outlier z should be large, got ${zOut}`);
});

test('robustZ: degenerate input → null', () => {
  assert.equal(robustZ([], 1, 0), null);
  assert.equal(robustZ(null, 1, 0), null);
  assert.equal(robustZ([5, 5, 5, 5], 5, 5), null); // MAD = 0 → degenerate
});

// ── detectRadarEvent ───────────────────────────────────────────
test('detectRadarEvent: pump spike after quiet → PUMP event', () => {
  const closes = quietSeries(240);
  const pump = closes[closes.length - 1] * 1.09; // +9% in one bar
  closes.push(pump);
  const ev = detectRadarEvent(kl(closes), { thresh: ROBUST_Z_THRESH });
  assert.ok(ev, 'event should fire');
  assert.equal(ev.kind, 'PUMP');
  assert.equal(ev.idx, closes.length - 1);
  assert.ok(ev.z > 6, `z should be high, got ${ev.z}`);
});

test('detectRadarEvent: dump spike after quiet → DUMP event', () => {
  const closes = quietSeries(240);
  closes.push(closes[closes.length - 1] * 0.91); // −9%
  const ev = detectRadarEvent(kl(closes), { thresh: ROBUST_Z_THRESH });
  assert.ok(ev);
  assert.equal(ev.kind, 'DUMP');
});

test('detectRadarEvent: quiet series → null', () => {
  const closes = quietSeries(240);
  assert.equal(detectRadarEvent(kl(closes), { thresh: ROBUST_Z_THRESH }), null);
});

test('detectRadarEvent: uses LAST bar only (idx = len−1)', () => {
  // A spike in the MIDDLE must not fire (caller advances the window).
  const closes = quietSeries(240);
  closes[120] = closes[119] * 1.09;
  // re-normalise the tail so the mid-spike is the only anomaly
  for (let i = 121; i < closes.length; i++) closes[i] = closes[i] * 1.0;
  const ev = detectRadarEvent(kl(closes), { thresh: ROBUST_Z_THRESH });
  assert.ok(ev == null || ev.idx === closes.length - 1, 'must only look at the last bar');
});

test('detectRadarEvent: volume surge multiplier recorded', () => {
  const closes = quietSeries(240);
  const k = kl(closes);
  k.push({ t: 0, o: closes[239], h: closes[239] * 1.09, l: closes[239], c: closes[239] * 1.09, v: 10000, qv: 10000 });
  const ev = detectRadarEvent(k, { thresh: ROBUST_Z_THRESH });
  assert.ok(ev);
  assert.ok(ev.volRatio > 3, `volume ratio should be high, got ${ev.volRatio}`);
});

// ── confirmRadarEvent ──────────────────────────────────────────
test('confirmRadarEvent: level shift holds for N bars → confirmed', () => {
  const closes = quietSeries(240);
  const base = closes[closes.length - 1];
  closes.push(base * 1.08); // spike bar
  for (let i = 0; i < 4; i++) closes.push(base * 1.08); // HOLDS at the new level
  const k = kl(closes);
  // detect on the spike bar: series truncated right after it
  const ev = detectRadarEvent(k.slice(0, 241), { thresh: 3 });
  assert.ok(ev);
  const conf = confirmRadarEvent(k, { ...ev, idx: 240 }, { confirmBars: 3 });
  assert.equal(conf.confirmed, true);
  assert.ok(conf.confirmCount >= 3);
});

test('confirmRadarEvent: single spike then full retrace → not confirmed', () => {
  const closes = quietSeries(240);
  const base = closes[closes.length - 1];
  closes.push(base * 1.08); // spike
  for (let i = 0; i < 4; i++) closes.push(base); // retrace to pre-spike level
  const k = kl(closes);
  const ev = detectRadarEvent(k.slice(0, 241), { thresh: 3 });
  assert.ok(ev);
  const conf = confirmRadarEvent(k, { ...ev, idx: 240 }, { confirmBars: 3 });
  assert.equal(conf.confirmed, false);
});

// ── radarEventsForSeries (historical scan) ─────────────────────
test('radarEventsForSeries: finds injected pumps across history, no lookahead', () => {
  const closes = quietSeries(500);
  // inject 3 SUSTAINED pumps: +8% bar, then the level holds
  const pumpIdx = [150, 300, 420];
  for (const i of pumpIdx) {
    const lift = 1.08;
    closes[i] = closes[i - 1] * lift;
    for (let j = i + 1; j < closes.length; j++) closes[j] *= lift;
  }
  const k = kl(closes);
  const evs = radarEventsForSeries(k, { thresh: 4, confirmBars: 2 });
  assert.ok(evs.length >= 3, `expected ≥3 events, got ${evs.length}`);
  const idxSet = new Set(evs.map((e) => e.idx));
  for (const i of pumpIdx) assert.ok(idxSet.has(i), `pump at ${i} not found; found ${[...idxSet]}`);
  // no events beyond the last bar
  for (const e of evs) assert.ok(e.idx < closes.length);
});

test('radarEventsForSeries: quiet series → few or zero events', () => {
  const closes = quietSeries(500);
  const evs = radarEventsForSeries(kl(closes), { thresh: 4, confirmBars: 2 });
  // gaussian noise can produce a few false hits, but not many
  assert.ok(evs.length <= 5, `too many false positives: ${evs.length}`);
});

// ── measureRadarOutcome ────────────────────────────────────────
test('measureRadarOutcome: PUMP followed by continued rise → positive returns', () => {
  const closes = quietSeries(240);
  const base = closes[closes.length - 1];
  closes.push(base * 1.08);
  // +15m (3 bars of 5m), +1h (12 bars), +4h (48 bars) all higher
  for (let i = 0; i < 50; i++) closes.push(base * 1.08 * (1 + 0.002 * i));
  const k = kl(closes);
  // detect on the SPIKE bar (idx 240), not the last bar
  const ev = detectRadarEvent(k.slice(0, 241), { thresh: 3 });
  assert.ok(ev);
  const out = measureRadarOutcome(k, { ...ev, idx: 240 });
  assert.ok(out, 'outcome computable');
  for (const key of RADAR_OUTCOMES) {
    assert.ok(out[key] != null && out[key] > 0, `${key} should be positive, got ${out[key]}`);
  }
});

test('measureRadarOutcome: PUMP followed by full retrace → negative far outcomes', () => {
  const closes = quietSeries(240);
  const base = closes[closes.length - 1];
  closes.push(base * 1.08);
  for (let i = 0; i < 50; i++) closes.push(base * (1 - 0.003 * i)); // retrace below
  const k = kl(closes);
  const ev = detectRadarEvent(k.slice(0, 241), { thresh: 3 });
  assert.ok(ev);
  const out = measureRadarOutcome(k, { ...ev, idx: 240 });
  assert.ok(out['+4h'] < 0, `+4h should be negative after retrace, got ${out['+4h']}`);
});

test('measureRadarOutcome: insufficient future bars → nulls', () => {
  const closes = quietSeries(240);
  const base = closes[closes.length - 1];
  closes.push(base * 1.08);
  closes.push(base * 1.09);
  const k = kl(closes);
  const ev = detectRadarEvent(k.slice(0, 241), { thresh: 3 });
  assert.ok(ev);
  const out = measureRadarOutcome(k, { ...ev, idx: 240 });
  assert.equal(out['+4h'], null);
});

// ── aggregateHitRates ──────────────────────────────────────────
test('aggregateHitRates: counts wins per horizon', () => {
  const events = [
    { sym: 'A', kind: 'PUMP', outcomes: { '+15m': 1.2, '+1h': 0.5, '+4h': -1.0 } },
    { sym: 'B', kind: 'PUMP', outcomes: { '+15m': 0.8, '+1h': 2.0, '+4h': 1.5 } },
    { sym: 'C', kind: 'PUMP', outcomes: { '+15m': null, '+1h': -0.5, '+4h': null } },
  ];
  const agg = aggregateHitRates(events);
  assert.equal(agg['+15m'].n, 2);
  assert.equal(agg['+15m'].wins, 2);
  assert.equal(agg['+1h'].n, 3);
  assert.equal(agg['+1h'].wins, 2);
  assert.equal(agg['+4h'].n, 2);
  assert.equal(agg['+4h'].wins, 1);
  assert.ok(Math.abs(agg['+1h'].rate - 2 / 3) < 1e-9);
});
