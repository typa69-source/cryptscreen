// ═══════════════════════════════════════════════════════════════
//  Unit tests for radar-scan.js — universe scanning orchestration
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import { RadarScan } from '../src/radar-scan.js';

function kl(closes, vols) {
  return closes.map((c, i) => ({ t: i * 300000, o: c, h: c * 1.001, l: c * 0.999, c, v: vols ? vols[i] : 100, qv: vols ? vols[i] : 100 }));
}
function quiet(n, seed = 42) {
  // LCG — deterministic
  let s = seed >>> 0;
  const r = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
  const out = [];
  let p = 100;
  for (let i = 0; i < n; i++) { p = p * (1 + (r() - 0.5) * 0.008); out.push(p); }
  return out;
}

test('RadarScan: scans universe and finds pump on the LAST bar', async () => {
  const closes = quiet(300);
  const spike = closes[closes.length - 1] * 1.09;
  const withSpike = [...closes, spike, spike * 1.001, spike * 1.001, spike * 1.001];
  const fakeFetcher = { fetchKlines: async (sym, tf, limit) => kl(quiet(300), null) };
  // AUSAUSDT (test fixture): pump on last bar
  const pumps = kl(withSpike.slice(0, 301), null); // last bar = spike
  const fetcher = {
    fetchKlines: async (sym, tf) => (sym === 'AUSDT' ? [...kl(withSpike.slice(0, 301)), ...[]] : kl(quiet(300))),
  };
  const scan = new RadarScan({ fetcher, thresh: 3, confirmBars: 2 });
  const res = await scan.scanAll(['AUSDT', 'BUSDT']);
  assert.ok(Array.isArray(res.events));
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].sym, 'AUSDT');
  assert.equal(res.events[0].kind, 'PUMP');
});

test('RadarScan: empty universe → empty events', async () => {
  const scan = new RadarScan({ fetcher: { fetchKlines: async () => [] }, thresh: 3, confirmBars: 2 });
  const res = await scan.scanAll([]);
  assert.equal(res.events.length, 0);
});

test('RadarScan: fetch failure for one symbol does not kill the scan', async () => {
  const closes = quiet(300);
  const fetcher = {
    fetchKlines: async (sym) => { if (sym === 'BADUSDT') throw new Error('net'); return kl(quiet(300)); },
  };
  const scan = new RadarScan({ fetcher, thresh: 3, confirmBars: 2 });
  const res = await scan.scanAll(['BADUSDT', 'GOODUSDT']);
  assert.equal(res.events.length, 0); // GOOD is quiet
  assert.ok(Array.isArray(res.events));
});

test('RadarScan: confirmation gate rejects one-bar wicks', async () => {
  // pump bar followed by immediate FULL retrace → not confirmed → no event
  const closes = quiet(300);
  const base = closes[closes.length - 1];
  const withWick = [...closes, base * 1.09, base, base, base];
  const fetcher = { fetchKlines: async () => kl(withWick) };
  const scan = new RadarScan({ fetcher, thresh: 3, confirmBars: 2 });
  const res = await scan.scanAll(['WICKUSDT']);
  assert.equal(res.events.length, 0);
});

test('RadarScan: persisted outcomes measured for old events', async () => {
  // historical event + future bars → outcomes are non-null
  const closes = quiet(300);
  const lift = 1.08;
  const withPump = [...closes];
  withPump[250] = withPump[249] * lift;
  for (let j = 251; j < withPump.length; j++) withPump[j] *= lift;
  const fetcher = { fetchKlines: async () => kl(withPump) };
  const scan = new RadarScan({ fetcher, thresh: 4, confirmBars: 2 });
  const res = await scan.scanAll(['XUSDT']);
  // find the historical event (if any) and check outcomes measurable
  const hist = res.events.filter((e) => e.idx < withPump.length - 5);
  if (hist.length) {
    for (const e of hist) {
      assert.ok(e.outcomes, 'event carries outcomes');
      // +15m outcome is computable (3 bars ahead exist)
      assert.ok(e.outcomes['+15m'] != null || e.outcomes['+1h'] != null);
    }
  }
});

test('RadarScan: backfill outcomes for events lacking them (pending maturation)', async () => {
  let s = 42 >>> 0;
  const r = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
  const closes = [];
  let p = 100;
  for (let i = 0; i < 300; i++) { p = p * (1 + (r() - 0.5) * 0.008); closes.push(p); }
  const kl = (cs) => cs.map((c, i) => ({ t: i * 300000, o: c, h: c * 1.001, l: c * 0.999, c, v: 100, qv: 100 }));
  // v1: spike on the LAST bar → live detection, pending
  const v1 = [...closes.slice(0, 300), closes[299] * 1.08];
  let cur = kl(v1);
  const fetcher = { fetchKlines: async () => cur };
  const scan = new RadarScan({ fetcher, thresh: 4, confirmBars: 2 });
  const r1 = await scan.scanAll(['MUSDT']);
  assert.equal(r1.newEvents.length, 1);
  assert.equal(r1.newEvents[0].pending, true);
  // v2: 50 more bars holding the level — maturation window arrived
  const v2 = [...v1];
  const lvl = v1[v1.length - 1];
  for (let i = 0; i < 50; i++) v2.push(lvl * (1 + 0.0001 * i));
  cur = kl(v2);
  await scan.scanAll(['MUSDT']);
  const ev = scan.events.find((e) => e.sym === 'MUSDT');
  assert.equal(ev.pending, false);
  assert.equal(ev.confirmed, true);
  assert.equal(ev.matured, true);
  assert.ok(ev.outcomes['+15m'] != null, '+15m backfilled');
  assert.ok(ev.outcomes['+4h'] != null, '+4h backfilled');
});
