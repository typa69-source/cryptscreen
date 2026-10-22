// ═══════════════════════════════════════════════════════════════
//  Unit tests for grid-lab-levels.js — «Подбор уровней» engine
//  Run with: npm test
// ═══════════════════════════.grid════════════════════════════════
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVELS_SCAN_MIN,
  LEVELS_SCAN_MAX,
  windowFromStart,
  countRoundTrips,
  levelsEconomics,
  scanLevels,
  pickOptimalLevels,
  pickOptimalByCapture,
  scanLevelsStability,
  levelsHeatFactor,
  stepPctFloorOk,
} from '../src/grid-lab-levels.js';
import { roundTripFeePct } from '../src/grid-economics.js';

// Детерминированный LCG для синтетических свечей
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function mkCandles(n, p0, amp, seed = 42) {
  const r = lcg(seed);
  const out = [];
  let p = p0;
  for (let i = 0; i < n; i++) {
    const phase = Math.sin(i / 6) * amp + (r() - 0.5) * amp * 0.5;
    const c = p + phase * 0.3;
    const h = Math.max(p, c) + r() * amp * 0.3;
    const l = Math.min(p, c) - r() * amp * 0.3;
    out.push({ t: 1700000000000 + i * 60000, o: p, h, l, c });
    p = c;
  }
  return out;
}

// ── windowFromStart ───────────────────────────────────────────

test('windowFromStart: filters bars strictly before start', () => {
  const cs = mkCandles(10, 100, 1);
  const w = windowFromStart(cs, cs[4].t);
  assert.equal(w.length, 6);
  assert.equal(w[0].t, cs[4].t);
});

test('windowFromStart: start in the future → empty', () => {
  const cs = mkCandles(5, 100, 1);
  assert.equal(windowFromStart(cs, cs[4].t + 60000).length, 0);
});

test('windowFromStart: no start → full copy', () => {
  const cs = mkCandles(5, 100, 1);
  const w = windowFromStart(cs, null);
  assert.equal(w.length, 5);
  assert.notEqual(w, cs); // копия, не ссылка
});

// ── countRoundTrips ───────────────────────────────────────────

test('countRoundTrips: single down-up through one level → 2 rt (grid semantics)', () => {
  // Цена 100 → 95 → 101 через уровни 95/98/101:
  // buy@98 (пересечение вниз) закрывается sell@101, buy@95 — sell@98.
  // Два честных цикла: именно так считает биржевой грид.
  const cs = [
    { t: 0, o: 100, h: 100, l: 100, c: 100 },
    { t: 1, o: 100, h: 100, l: 95, c: 96 },
    { t: 2, o: 96, h: 101, l: 96, c: 100 },
  ];
  const rt = countRoundTrips(cs, [95, 98, 101]);
  assert.equal(rt.rt, 2);
  assert.equal(rt.buys, 2);
  assert.equal(rt.sells, 2);
});

test('countRoundTrips: one level, pure touch and return → 2 rt', () => {
  // 100 → 96 → 100 на сетке [96,98,100]: спад покупает 98 и 96,
  // возврат продаёт 98 и 100 ⇒ buy96→sell98 + buy98→sell100 = 2 rt.
  const cs = [
    { t: 0, o: 100, h: 100, l: 100, c: 100 },
    { t: 1, o: 100, h: 100, l: 96, c: 96 },
    { t: 2, o: 96, h: 100, l: 96, c: 100 },
  ];
  const rt = countRoundTrips(cs, [96, 98, 100]);
  assert.equal(rt.rt, 2);
  assert.equal(rt.buys, 2);
  assert.equal(rt.sells, 2);
});

test('countRoundTrips: pure uptrend, no return → rt=0, buys kept open', () => {
  const cs = [
    { t: 0, o: 100, h: 100, l: 100, c: 100 },
    { t: 1, o: 100, h: 102, l: 100, c: 102 },
    { t: 2, o: 102, h: 104, l: 102, c: 104 },
  ];
  const rt = countRoundTrips(cs, [100, 101, 102, 103, 104]);
  // нет пересечений вниз → buys=0 (уровни в свечах закрываются вверх)
  assert.equal(rt.rt, 0);
});

test('countRoundTrips: two round sweeps → 3 rt (incl. wick fills)', () => {
  // 100→90→110 → 90 → 110: каждый спад покупает 90 и 100, каждый подъём
  // продаёт 100 и 110. Первый спад: buy@100+buy@90; подъём: sell@100,sell@110
  // (rt=2: buy90→sell100 + buy100→sell110). Второй спад: buy@100+buy@90
  // (buy@100 закрывается sell@110? — путь 110→90 пересекает 100 вниз:
  // buy@100, и 90 вниз: buy@90). Финальный подъём 90→110: sell@100 закрывает
  // buy@90, sell@110 закрывает buy@100 ⇒ rt=3.
  const cs = [
    { t: 0, o: 100, h: 100, l: 100, c: 100 },
    { t: 1, o: 100, h: 100, l: 90, c: 91 },
    { t: 2, o: 91, h: 110, l: 91, c: 110 },
    { t: 3, o: 110, h: 110, l: 90, c: 91 },
    { t: 4, o: 91, h: 110, l: 91, c: 110 },
  ];
  const rt = countRoundTrips(cs, [90, 100, 110]);
  assert.equal(rt.rt, 3);
});

test('countRoundTrips: multi-level bar fills each level once (no double inv)', () => {
  // Медвежья свеча 95..105: путь 100→105→95→99. Спад 105→95 покупает
  // 6 уровней (95..104, верхний 105 не покупается), финальный подъём
  // 95→99 закрывает 2 пары (buy95→sell96, buy96→sell98).
  const cs = [
    { t: 0, o: 100, h: 100, l: 100, c: 100 },
    { t: 1, o: 100, h: 105, l: 95, c: 99 },
  ];
  const rt = countRoundTrips(cs, [95, 96, 98, 100, 102, 104, 105]);
  assert.equal(rt.buys, 6); // все уровни кроме верхнего, ровно по 1 разу
  assert.equal(rt.rt, 2);
});

// ── levelsEconomics ───────────────────────────────────────────

test('levelsEconomics: fee share rises as step shrinks', () => {
  const rt = { rt: 10, buys: 10, sells: 10 };
  const e8 = levelsEconomics(100, 108, 8, rt);
  const e32 = levelsEconomics(100, 108, 32, rt);
  assert.ok(e32.feeShare > e8.feeShare);
  assert.ok(e8.net > e32.net);
});

test('levelsEconomics: zero rt → zero everything, feeShare 0', () => {
  const e = levelsEconomics(100, 108, 8, { rt: 0, buys: 0, sells: 0 });
  assert.equal(e.net, 0);
  assert.equal(e.feeShare, 0);
});

// ── scanLevels ────────────────────────────────────────────────

test('scanLevels: shapes and monotone stepPct', () => {
  const cs = mkCandles(600, 100, 3);
  const rows = scanLevels(cs, 95, 105, { min: 2, max: 20 });
  assert.equal(rows.length, 19);
  assert.equal(rows[0].levels, 2);
  assert.ok(rows[0].stepPct > rows[18].stepPct);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.net));
    assert.ok(r.feeShare >= 0 && r.feeShare <= 1);
  }
});

test('scanLevels: empty window → empty scan', () => {
  assert.deepEqual(scanLevels([], 100, 110), []);
  assert.deepEqual(scanLevels(mkCandles(3, 100, 1), 100, 110), []);
});

test('scanLevels: sinusoid optimum is interior (not min/max N)', () => {
  // Синусоида периодом ~12 баров амплитудой 3: разумный шаг ~1.5-3
  // на диапазоне 95..105 ⇒ уровней 4..8, не 2 и не 60.
  const cs = mkCandles(900, 100, 3, 7);
  const rows = scanLevels(cs, 95, 105, { deposit: 500 });
  const best = pickOptimalLevels(rows);
  assert.ok(best);
  assert.ok(best.levels >= 3 && best.levels <= 12, `levels=${best.levels}`);
  assert.ok(best.stepOk, 'optimum must pass fee floor');
});

// ── pickOptimalLevels ─────────────────────────────────────────

test('pickOptimalLevels: prefers lower N at equal net', () => {
  const rows = [
    { levels: 6, net: 10.0, stepOk: true },
    { levels: 8, net: 10.05, stepOk: true },
    { levels: 12, net: 9.9, stepOk: true },
  ];
  // 10.05 vs 10.0: разница 0.5% < 2% → tie → меньший N из близких
  const b = pickOptimalLevels(rows);
  assert.equal(b.levels, 6);
});

test('pickOptimalLevels: respects fee floor when profitable options exist', () => {
  const rows = [
    { levels: 40, net: 11, stepOk: false }, // перегрид
    { levels: 6, net: 10, stepOk: true },
  ];
  assert.equal(pickOptimalLevels(rows).levels, 6);
});

test('pickOptimalLevels: all unprofitable → still returns max net', () => {
  const rows = [
    { levels: 30, net: -5, stepOk: false },
    { levels: 10, net: -1, stepOk: false },
  ];
  assert.equal(pickOptimalLevels(rows).levels, 10);
});

test('pickOptimalLevels: empty → null', () => {
  assert.equal(pickOptimalLevels([]), null);
});

// ── levelsHeatFactor ──────────────────────────────────────────

test('levelsHeatFactor: normalized 0..1, best=1 worst=0', () => {
  const rows = [
    { levels: 2, net: 1 },
    { levels: 6, net: 5 },
    { levels: 10, net: 3 },
  ];
  const h = levelsHeatFactor(rows);
  const byL = Object.fromEntries(h.map((x) => [x.levels, x.heat]));
  assert.equal(byL[6], 1);
  assert.equal(byL[2], 0);
  assert.ok(byL[10] > 0 && byL[10] < 1);
});

test('levelsHeatFactor: flat net → 0.5 everywhere', () => {
  const h = levelsHeatFactor([{ levels: 2, net: 0 }, { levels: 3, net: 0 }]);
  assert.deepEqual(h.map((x) => x.heat), [0.5, 0.5]);
});

// ── fee floor interplay ───────────────────────────────────────

test('stepPctFloorOk: 3×RT boundary', () => {
  const fee = roundTripFeePct('binance'); // 0.05
  assert.ok(stepPctFloorOk(0.15, fee));
  assert.ok(!stepPctFloorOk(0.1, fee)); // ровно 2×RT — брак
  assert.ok(!stepPctFloorOk(0.05, fee));
});

test('scan constants sanity', () => {
  assert.ok(LEVELS_SCAN_MIN === 2 && LEVELS_SCAN_MAX === 150);
});

test('scanLevels доходит до N=150 (верх поднят с 60)', () => {
  const cs = mkCandles(600, 100, 3, 7);
  const rows = scanLevels(cs, 95, 105);
  assert.equal(rows.length, LEVELS_SCAN_MAX - LEVELS_SCAN_MIN + 1);
  assert.equal(rows[rows.length - 1].levels, 150);
  // плотные сетки не выбрасываются, а честно помечаются «шаг < 3×RT»
  assert.ok(rows.some((r) => r.levels > 60 && r.stepOk === false));
});

test('levelsEconomics клампит N сверху на 150, а не на 60', () => {
  const e = levelsEconomics(100, 110, 400, { rt: 10, buys: 5, sells: 5 }, 'bybit');
  assert.equal(e.levels, 150);
  assert.ok(Math.abs(e.step - 10 / 150) < 1e-9);
});

// ── integration: engine vs simulateGrid sanity ────────────────

test('scan+pick on deterministic wave: more bars → same optimum family', () => {
  const csA = mkCandles(400, 100, 3, 11);
  const csB = mkCandles(1200, 100, 3, 11);
  const a = pickOptimalLevels(scanLevels(csA, 95, 105));
  const b = pickOptimalLevels(scanLevels(csB, 95, 105));
  // оптимум стабилен по длине окна на стационарной волне
  assert.ok(a && b);
  assert.ok(Math.abs(a.levels - b.levels) <= 2, `a=${a.levels} b=${b.levels}`);
});

// ── pickOptimalByCapture (оптимум по сделкам) ─────────────────

test('pickOptimalByCapture: max rt within profit floor, not max N', () => {
  // N=6: \$9.5 rt=40; N=10: \$9.0 rt=90 (95% прибыли, вдвое больше сделок) → выбираем 10.
  const rows = [
    { levels: 3, net: 10.0, rt: 10, feeShare: 0.05, stepOk: true, netOfDeposit: 10.0 },
    { levels: 6, net: 9.5, rt: 40, feeShare: 0.10, stepOk: true, netOfDeposit: 9.5 },
    { levels: 10, net: 9.0, rt: 90, feeShare: 0.15, stepOk: true, netOfDeposit: 9.0 },
    { levels: 40, net: 3.0, rt: 500, feeShare: 0.60, stepOk: false, netOfDeposit: 3.0 },
  ];
  const b = pickOptimalByCapture(rows, { deposit: 500 });
  assert.equal(b.levels, 10);
});

test('pickOptimalByCapture: feeShare cap excludes fee-heavy N', () => {
  const rows = [
    { levels: 4, net: 10.0, rt: 20, feeShare: 0.12, stepOk: true, netOfDeposit: 10.0 },
    { levels: 8, net: 9.8, rt: 60, feeShare: 0.35, stepOk: true, netOfDeposit: 9.8 }, // комиссии 35%
  ];
  assert.equal(pickOptimalByCapture(rows).levels, 4);
});

test('pickOptimalByCapture: no candidate keeps profit floor → $-optimum fallback', () => {
  // Всё, кроме минимального N, за пределами пола прибыли (тренд сжирает $).
  const rows = [
    { levels: 2, net: 10, rt: 4, feeShare: 0.02, stepOk: true, netOfDeposit: 10 },
    { levels: 20, net: 1, rt: 400, feeShare: 0.5, stepOk: true, netOfDeposit: 1 },
  ];
  assert.equal(pickOptimalByCapture(rows).levels, 2);
});

test('pickOptimalByCapture: tie in rt → smaller N', () => {
  const rows = [
    { levels: 6, net: 9.9, rt: 50, feeShare: 0.1, stepOk: true, netOfDeposit: 9.9 },
    { levels: 9, net: 9.9, rt: 50, feeShare: 0.1, stepOk: true, netOfDeposit: 9.9 },
  ];
  assert.equal(pickOptimalByCapture(rows).levels, 6);
});

test('pickOptimalByCapture: real-wave curve prefers more deals than $-optimum', () => {
  // Синусоида: $-максимум в минимуме N, но capture берёт больше сделок в поло прибыли.
  const cs = mkCandles(900, 100, 3, 7);
  const rows = scanLevels(cs, 95, 105);
  const usd = pickOptimalLevels(rows);
  const cap = pickOptimalByCapture(rows);
  assert.ok(cap.rt >= usd.rt, 'capture должен ловить не меньше сделок');
});

// ── scanLevelsStability ───────────────────────────────────────

test('scanLevelsStability: stationary wave → high agreement', () => {
  const cs = mkCandles(1200, 100, 3, 11);
  const st = scanLevelsStability(cs, 95, 105, { deposit: 500 });
  assert.ok(st, 'stability object');
  assert.equal(st.folds, 3);
  assert.ok(st.agree >= 2, `agree=${st.agree}`);
  assert.ok(st.median >= 2 && st.median <= 12);
});

test('scanLevelsStability: short window → null', () => {
  assert.equal(scanLevelsStability(mkCandles(60, 100, 3), 95, 105), null);
});

test('scanLevelsStability: opt NaN-safe (deposit only)', () => {
  // регрессия: +opt.folds ?? 3 давал NaN (?? не ловит NaN) → null. Теперь работает.
  const cs = mkCandles(1200, 100, 3, 11);
  const st = scanLevelsStability(cs, 95, 105, { deposit: 500 });
  assert.ok(st);
});
