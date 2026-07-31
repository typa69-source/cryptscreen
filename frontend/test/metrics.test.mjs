// ═══════════════════════════════════════════════════════════════
//  Unit tests for metrics.js + format.js (pure functions)
//  Run with: npm test
// ═══════════════════════════════════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

// Use the in-process module loader to avoid import.meta issues with vite
import {
  calcATR, calcNATR, calcRange, calcRel, calcSma, calcStd,
  calcBollinger, calcCorrelation, calcSqueezePop, calcBbSignals,
  sparkTrendSnapshot, calcVolProfile,
} from '../src/metrics.js';

import { fn, fk, fmtPrice, getPriceMinMove, formatDuration } from '../src/format.js';

// ── helpers ────────────────────────────────────────────────────
const candle=(t,o,h,l,c,qv=0,tr=0)=>({t,o,h,l,c,qv,tr});
const series=(startT,...rows)=>rows.map((r,i)=>candle(startT+i*60000,...r));
// TR formula reference:
//   TR = max(H-L, |H-prevC|, |L-prevC|)

// ── calcATR ────────────────────────────────────────────────────
test('calcATR: returns null when not enough history',()=>{
  assert.equal(calcATR([],14),null);
  assert.equal(calcATR([candle(0,1,2,1,1.5)],14),null);
});

test('calcATR: known value on a small series',()=>{
  // Build a 4-candle series where every TR is exactly 1.0
  // prev C = 1.0 always (constant close), H-L=1, |H-prevC|=|2-1|=1, |L-prevC|=|1-1|=0
  // → TR = 1, ATR(3) over last 3 = 1
  const kl=series(0,
    [1,2,1,1],   // prev C = 1 (implicit, but we set c=1)
    [1,2,1,1],
    [1,2,1,1],
    [1,2,1,1]
  );
  // Note: ATR uses prev *candle*.c, so if every close is 1, then |H-prevC|=|2-1|=1.
  // TR = max(1, 1, 0) = 1; ATR(3) = mean over last 3 = 1.
  assert.equal(calcATR(kl,3),1);
});

test('calcATR: returns average TR over the window',()=>{
  // Simple deterministic series: every TR = 2 (H-L=2, H=2 L=0 prevC=1).
  const kl=series(0,
    [1,2,0,1],
    [1,2,0,1],
    [1,2,0,1],
    [1,2,0,1],
    [1,2,0,1]
  );
  // TR = max(2, |2-1|=1, |0-1|=1) = 2; ATR(3) = 2
  assert.equal(calcATR(kl,3),2);
});

// ── calcNATR ───────────────────────────────────────────────────
test('calcNATR: ATR divided by last close × 100',()=>{
  const kl=series(0,[1,2,0,1],[1,2,0,1],[1,2,0,1]);
  // ATR(2) over the last 2 = 2; last close = 1; NATR = 2/1*100 = 200
  assert.equal(calcNATR(kl,2),200);
});

test('calcNATR: null on insufficient data',()=>{
  assert.equal(calcNATR([],14),null);
});

// ── calcRange ──────────────────────────────────────────────────
test('calcRange: (high-low)/low × 100 over window',()=>{
  const kl=[
    candle(0,1,1,1,1),  // H=1 L=1
    candle(1,1,5,1,1),  // H=5 L=1
    candle(2,1,5,1,1),
    candle(3,1,5,1,1)
  ];
  // last 3: H=5 L=1 → (5-1)/1*100 = 400
  assert.equal(calcRange(kl,3),400);
});

// ── calcRel ────────────────────────────────────────────────────
test('calcRel: ratio of last f vs avg of previous n',()=>{
  const kl=series(0,[1,1,1,1],[2,2,2,2],[3,3,3,3],[4,4,4,4]);
  // last f='c' = 4; avg of previous 3 closes (n=3) = (1+2+3)/3 = 2; ratio = 2
  assert.equal(calcRel(kl,3,'c'),2);
});

// ── calcSma / calcStd ──────────────────────────────────────────
test('calcSma: arithmetic mean over window',()=>{
  assert.equal(calcSma([1,2,3,4,5],3),4);   // (3+4+5)/3
  assert.equal(calcSma([1,2,3,4,5],5),3);
  assert.equal(calcSma([1,2],5),null);
});

test('calcStd: standard deviation (population)',()=>{
  // mean=3, [1,2,3,4,5] → variance = ((1-3)² + (2-3)² + (3-3)² + (4-3)² + (5-3)²)/5 = 10/5 = 2
  // std = sqrt(2) ≈ 1.4142
  const sd=calcStd([1,2,3,4,5],5,3);
  assert.ok(Math.abs(sd-Math.sqrt(2))<1e-9);
});

// ── calcBollinger ──────────────────────────────────────────────
test('calcBollinger: bands are mean ± k*std',()=>{
  const kl=Array.from({length:20},(_,i)=>candle(i,1,1,1,1));
  // constant close=1 → mean=1, std=0 → upper=lower=middle=1
  const bb=calcBollinger(kl,20,2);
  assert.equal(bb.middle,1);
  assert.equal(bb.upper,1);
  assert.equal(bb.lower,1);
});

test('calcBollinger: bands are mean ± k*std (cross-check)',()=>{
  // 10 closes of 1, then 10 closes of 2 → mean = 1.5, variance = 0.25, std = 0.5
  const cl=Array.from({length:20},(_,i)=>i<10?1:2);
  const kl=cl.map((c,i)=>candle(i,c,c,c,c));
  const bb=calcBollinger(kl,20,2);
  assert.equal(bb.middle,1.5);
  assert.equal(bb.upper,2.5);
  assert.equal(bb.lower,0.5);
  // width = (2*k*sd)/mean*100 = 2/1.5*100 = 133.333...
  assert.ok(Math.abs(bb.width - 133.333333)<0.001);
});

// ── calcCorrelation ────────────────────────────────────────────
test('calcCorrelation: perfectly correlated series → 1',()=>{
  const a=[1,2,3,4,5];
  const b=[2,4,6,8,10];
  assert.equal(calcCorrelation(a,b),1);
});

test('calcCorrelation: perfectly anti-correlated → -1',()=>{
  const a=[1,2,3,4,5];
  const b=[5,4,3,2,1];
  assert.equal(calcCorrelation(a,b),-1);
});

test('calcCorrelation: zero variance series → null',()=>{
  // a is constant, denom is 0 → null
  assert.equal(calcCorrelation([1,1,1,1],[1,2,3,4]),null);
});

test('calcCorrelation: length mismatch → null',()=>{
  assert.equal(calcCorrelation([1,2,3],[1,2]),null);
});

// ── calcSqueezePop / calcBbSignals ─────────────────────────────
test('calcSqueezePop: returns 0 on insufficient data',()=>{
  assert.equal(calcSqueezePop([],null),0);
  assert.equal(calcSqueezePop([candle(0,1,1,1,1)],null),0);
});

test('calcBbSignals: bbSqz/bbBreak are 0 on null',()=>{
  const r=calcBbSignals(null,null);
  assert.equal(r.bbSqz,0);
  assert.equal(r.bbBreak,0);
});

// ── sparkTrendSnapshot ─────────────────────────────────────────
test('sparkTrendSnapshot: % change and SVG path',()=>{
  const kl=[];
  for(let i=0;i<10;i++)kl.push(candle(i,100,100,100,100+i*5));
  // closes = 100,105,110,115,120,125,130,135,140,145
  const s=sparkTrendSnapshot(kl,30);
  // (145-100)/100*100 = 45
  assert.equal(s.sp5,45);
  assert.ok(s.sp5d.startsWith('M'));
  assert.ok(s.sp5d.includes('L'));
});

test('sparkTrendSnapshot: returns null on flat/bad data',()=>{
  const s=sparkTrendSnapshot([],30);
  assert.equal(s.sp5,null);
  assert.equal(s.sp5d,'');
});

// ── calcVolProfile ─────────────────────────────────────────────
test('calcVolProfile: distributes quote volume into buckets',()=>{
  // 5 candles across a price range so each of the 3 buckets gets some volume
  const kl=[
    candle(0, 0.5, 0.6, 0.4, 0.5, 100),  // c=0.5 → bucket 0
    candle(1, 0.9, 1.0, 0.8, 0.9, 200),  // c=0.9 → bucket 0
    candle(2, 1.2, 1.3, 1.1, 1.2, 300),  // c=1.2 → bucket 1
    candle(3, 1.6, 1.7, 1.5, 1.6, 400),  // c=1.6 → bucket 2
    candle(4, 1.9, 2.0, 1.8, 1.9, 500),  // c=1.9 → bucket 2
  ];
  const prof=calcVolProfile(kl,3);
  assert.equal(prof.length,3);
  // Some volume in every bucket
  assert.ok(prof.every(b=>b.vol>0), 'every bucket should receive some qv');
  // Max bucket (with 900 USDT) should have pct=1
  assert.equal(Math.max(...prof.map(b=>b.pct)),1);
  // Total qv = 100+200+300+400+500 = 1500
  const total=prof.reduce((s,b)=>s+b.vol,0);
  assert.equal(total,1500);
});

// ── format.js ──────────────────────────────────────────────────
test('fn: fixed decimal places',()=>{
  assert.equal(fn(1.2345,2),'1.23');
  assert.equal(fn(null,2),'—');
  assert.equal(fn(NaN,2),'—');
  assert.equal(fn(Infinity,2),'—');
});

test('fk: thousands/millions/billions suffix',()=>{
  assert.equal(fk(1500),'1.50K');
  assert.equal(fk(2_500_000),'2.50M');
  assert.equal(fk(1_500_000_000),'1.50B');
  assert.equal(fk(0.5),'0.5000');
  assert.equal(fk(null),'—');
});

test('fmtPrice: precision scales with magnitude',()=>{
  assert.equal(fmtPrice(1234.56),'1234.56');
  assert.equal(fmtPrice(12.345),'12.345');
  assert.equal(fmtPrice(1.2345),'1.2345');
  assert.equal(fmtPrice(0.123456),'0.12346');
  // 0.000123 → uses 8 decimals: trailing zeros are NOT trimmed by Number.toFixed
  assert.equal(fmtPrice(0.000123),'0.00012300');
  assert.equal(fmtPrice(null),'—');
});

test('getPriceMinMove: step matches magnitude',()=>{
  assert.equal(getPriceMinMove(2000),0.01);
  assert.equal(getPriceMinMove(50),0.001);
  assert.equal(getPriceMinMove(0.5),0.00001);
  // 0.005 → a >= 0.001 bucket → 1e-7
  assert.equal(getPriceMinMove(0.005),1e-7);
  // 0.0005 → a >= 0.0001 bucket → 1e-8
  assert.equal(getPriceMinMove(0.0005),1e-8);
  assert.equal(getPriceMinMove(0),0.01);
  assert.equal(getPriceMinMove(null),0.01);
});

test('formatDuration: human readable',()=>{
  assert.equal(formatDuration(30),'30с');
  assert.equal(formatDuration(90),'1м 30с');
  assert.equal(formatDuration(3600),'1ч 0м');
  assert.equal(formatDuration(3660),'1ч 1м');
  assert.equal(formatDuration(86400*2+3600),'2д 1ч');
  assert.equal(formatDuration(NaN),'0с');
});
