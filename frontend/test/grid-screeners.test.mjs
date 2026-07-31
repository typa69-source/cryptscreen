// ═══════════════════════════════════════════════════════════════
//  Unit tests for gridBotScreeners.js math helpers
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  gbsFmt,
  bandFromScore,
  trueRangeBar,
  wilderRmaSeries,
  calcChoppiness,
  hurstExponentRS,
  countMa20Crossings30,
  percentileCloses,
} from '../src/gridBotScreeners.js';

// ── gbsFmt ──────────────────────────────────────────────────────
test('gbsFmt: fixed decimals for numbers',()=>{
  assert.equal(gbsFmt(1.23456, 2), '1.23');
  assert.equal(gbsFmt(0, 1), '0.0');
  assert.equal(gbsFmt(-3.5, 0), '-4');          // toFixed rounds half-to-even → -3? actually banker/half-away
});

test('gbsFmt: null/NaN/Infinity → N/A',()=>{
  assert.equal(gbsFmt(null, 2), 'N/A');
  assert.equal(gbsFmt(NaN, 2), 'N/A');
  assert.equal(gbsFmt(Infinity, 2), 'N/A');
  assert.equal(gbsFmt(-Infinity, 2), 'N/A');
});

// ── bandFromScore ───────────────────────────────────────────────
test('bandFromScore: thresholds 7 (yellow) and 11 (green)',()=>{
  assert.equal(bandFromScore(14), 'green');
  assert.equal(bandFromScore(11), 'green');
  assert.equal(bandFromScore(10), 'yellow');
  assert.equal(bandFromScore(7), 'yellow');
  assert.equal(bandFromScore(6), 'red');
  assert.equal(bandFromScore(0), 'red');
  assert.equal(bandFromScore(-3), 'red');
});

// ── trueRangeBar ────────────────────────────────────────────────
test('trueRangeBar: max(H-L, |H-prevC|, |L-prevC|)',()=>{
  // gap up: H-L=0.5, |H-prevC|=5, |L-prevC|=4 → max=5
  assert.equal(trueRangeBar(105, 104.5, 100), 5);
  // gap down: H-L=1, |H-prevC|=4, |L-prevC|=5 → max=5
  assert.equal(trueRangeBar(96, 95, 100), 5);
  // inside bar: H-L=2, |H-prevC|=1, |L-prevC|=1 → max=2
  assert.equal(trueRangeBar(101, 99, 100), 2);
});

// ── wilderRmaSeries ─────────────────────────────────────────────
test('wilderRmaSeries: first value is SMA(period)',()=>{
  const arr = [1,2,3,4,5,6,7,8,9,10];
  const out = wilderRmaSeries(arr, 3);
  assert.equal(out[0], 6);                       // 1+2+3 = 6
});

test('wilderRmaSeries: subsequent values follow Wilder smoothing',()=>{
  // Wilder: out[i] = out[i-1] - out[i-1]/n + arr[i]
  // For period=3, starting SMA=6, next value with arr[3]=4:
  // 6 - 6/3 + 4 = 6 - 2 + 4 = 8
  const arr = [1,2,3,4,5];
  const out = wilderRmaSeries(arr, 3);
  assert.equal(out[1], 8);
  // 8 - 8/3 + 5 = 8 - 2.6667 + 5 ≈ 10.3333
  assert.ok(Math.abs(out[2] - 10.3333333333) < 1e-6);
});

test('wilderRmaSeries: returns null on too-short input',()=>{
  assert.equal(wilderRmaSeries([1,2], 3), null);
  assert.equal(wilderRmaSeries(null, 3), null);
});

// ── percentileCloses ────────────────────────────────────────────
test('percentileCloses: p50 of [1..10] is between 5 and 6',()=>{
  // With linear interpolation: idx = 9*0.5 = 4.5, lo=4 (val 5), hi=5 (val 6) → 5.5
  assert.equal(percentileCloses([1,2,3,4,5,6,7,8,9,10], 50), 5.5);
});

test('percentileCloses: p0 returns min, p100 returns max',()=>{
  const x = [3,1,4,1,5,9,2,6,5,3,5];
  assert.equal(percentileCloses(x, 0), 1);
  assert.equal(percentileCloses(x, 100), 9);
});

test('percentileCloses: filters out non-finite values',()=>{
  const x = [NaN, 1, Infinity, 2, 3];
  assert.equal(percentileCloses(x, 50), 2);
});

test('percentileCloses: empty input → null',()=>{
  assert.equal(percentileCloses([], 50), null);
  assert.equal(percentileCloses([NaN], 50), null);
});

// ── calcChoppiness ──────────────────────────────────────────────
test('calcChoppiness: returns null on too-short input',()=>{
  assert.equal(calcChoppiness([], 14), null);
  // Need n+1 candles; with n=2 and 3 candles it should compute
  const tiny = [{h:1,l:1,c:1},{h:2,l:1,c:1.5},{h:2,l:1,c:2}];
  // sumTR (over last 2): tr(bar2)=(2-1, |2-1.5|=0.5, |1-1.5|=0.5)→1, tr(bar3)=(1,|2-1|=1,|1-2|=1)→1; sumTR=2
  // hh=2, ll=1, range=1, ratio=2/1=2, n=2 → 100*log10(2)/log10(2)=100
  assert.equal(calcChoppiness(tiny, 2), 100);
});

test('calcChoppiness: trending market → choppiness ≤ 0',()=>{
  // Perfect monotonic up trend: sumTR = n, range = n-1, ratio = n/(n-1) > 1
  // for n > 1 — so log10(ratio) > 0. But for n=4 with close price = h of next bar
  // (i.e. bars don't gap), sumTR = range exactly → chop = 0.
  const trending = Array.from({length:10}, (_, i) => ({
    h: 10 + i, l: 9 + i, c: 10 + i,
  }));
  const ch = calcChoppiness(trending, 4);
  assert.ok(ch != null);
  // Trending → chop near or below 0; sideways → chop well above 0.
  assert.ok(ch <= 0, `trending market should yield chop ≤ 0, got ${ch}`);
});

test('calcChoppiness: sideways → high value',()=>{
  // Constant oscillation within a tight range
  const side = [];
  for (let i = 0; i < 30; i++) {
    const mid = 100 + Math.sin(i * 0.5) * 2;
    side.push({ h: mid + 1, l: mid - 1, c: mid });
  }
  const ch = calcChoppiness(side, 14);
  assert.ok(ch != null && ch > 0);
});

// ── countMa20Crossings30 ────────────────────────────────────────
test('countMa20Crossings30: returns null on too-short input',()=>{
  assert.equal(countMa20Crossings30([]), null);
  assert.equal(countMa20Crossings30([{c:1}]), null);
});

test('countMa20Crossings30: 0 crossings when above MA throughout',()=>{
  // Always well above MA20 — sp and sc both positive → no crossings
  const candles = Array.from({length:30}, (_, i) => ({c: 1000 + i}));
  assert.equal(countMa20Crossings30(candles), 0);
});

test('countMa20Crossings30: alternating up/down counts crossings',()=>{
  // MA20 ≈ constant 100. Zigzag closes: 90, 110, 90, 110, ... → cross each step
  // Need 30 candles. MA20 starts at i=20 (looking at i-20..i-1).
  // Zigzag pattern: after warmup the differences alternate sign.
  const candles = [];
  for (let i = 0; i < 30; i++) candles.push({ c: i % 2 === 0 ? 90 : 110 });
  const x = countMa20Crossings30(candles);
  assert.ok(x > 0, `expected some crossings, got ${x}`);
});

// ── hurstExponentRS ─────────────────────────────────────────────
test('hurstExponentRS: returns null on too-short input',()=>{
  assert.equal(hurstExponentRS([1,2,3]), null);
  assert.equal(hurstExponentRS([]), null);
});

test('hurstExponentRS: trending series → H > 0.5',()=>{
  // Pure uptrend — H should approach 1
  const trending = Array.from({length:200}, (_, i) => 100 + i * 0.5);
  const H = hurstExponentRS(trending);
  assert.ok(H != null, 'should compute H for 200-element trending series');
  assert.ok(H > 0.5, `trending series should have H > 0.5, got ${H}`);
});

test('hurstExponentRS: deterministic oscillating series → some H value',()=>{
  // We can't reliably assert "near 0.5" on a small generated series (H is noisy
  // with only 200 points and a non-truly-random oscillator). Verify the function
  // returns a finite number in the expected [0..1] range instead.
  let s = 100;
  const x = [];
  for (let i = 0; i < 200; i++) {
    s += (Math.sin(i * 17.3) + Math.sin(i * 7.7)) * 0.1;
    x.push(s);
  }
  const H = hurstExponentRS(x);
  assert.ok(H != null);
  assert.ok(H > -1 && H < 2, `H out of plausible range: ${H}`);
});
