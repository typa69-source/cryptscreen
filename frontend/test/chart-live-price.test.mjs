import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const appendBegin = source.indexOf('function appendCandleWithGaps(');
const appendEnd = source.indexOf('function calcAll(', appendBegin);
const liveBegin = source.indexOf('function tfMs(');
const liveEnd = source.indexOf('function closeChartTradesSockets(', liveBegin);
assert.ok(appendBegin >= 0 && appendEnd > appendBegin, 'candle append helper must be found');
assert.ok(liveBegin >= 0 && liveEnd > liveBegin, 'live-price helpers must be found');

const STEP = 900000;
function fixture(kind = 'main') {
  const candle = { t: STEP, o: 100, h: 102, l: 99, c: 101, qv: 20, v: 2, tr: 3 };
  const ch = { sym: 'BTCUSDT', tf: '15m', candles: [candle] };
  const repairs = [];
  const S = {
    charts: kind === 'main' ? [ch] : [],
    fsCharts: kind === 'fs' ? [ch] : [],
    fsSym: 'ETHUSDT',
  };
  const context = vm.createContext({
    S, HIST_CACHE_MAX: 2000,
    Date: { now: () => STEP + 1000 },
    requestChartGapRepair: (chart, sym, tf) => repairs.push({ chart, sym, tf }),
  });
  vm.runInContext(source.slice(appendBegin, appendEnd), context);
  vm.runInContext(source.slice(liveBegin, liveEnd), context);
  return { ch, candle, repairs, context };
}

test('bookTicker requests main-chart history after missed bars without changing candles', () => {
  const { ch, repairs, context } = fixture();
  const before = JSON.stringify(ch.candles);
  const result = context.applyLivePriceToCandle(ch, '15m', 120, STEP * 40 + 1000);
  assert.equal(result, false);
  assert.equal(JSON.stringify(ch.candles), before, 'a stale close must not become the current opening price');
  assert.equal(repairs.length, 1);
  assert.strictEqual(repairs[0].chart, ch);
  assert.equal(repairs[0].sym, 'BTCUSDT');
  assert.equal(repairs[0].tf, '15m');
});

test('bookTicker requests fullscreen history before the stale-price spike filter', () => {
  const { ch, repairs, context } = fixture('fs');
  const before = JSON.stringify(ch.candles);
  const result = context.applyLivePriceToCandle(ch, '15m', 160, STEP * 40 + 1000);
  assert.equal(result, false);
  assert.equal(JSON.stringify(ch.candles), before);
  assert.equal(repairs.length, 1, 'a large overnight move must still trigger history recovery');
  assert.strictEqual(repairs[0].chart, ch);
  assert.equal(repairs[0].sym, 'ETHUSDT');
  assert.equal(repairs[0].tf, '15m');
});

test('bookTicker updates the current candle without requesting history', () => {
  const { ch, candle, repairs, context } = fixture();
  assert.equal(context.applyLivePriceToCandle(ch, '15m', 103, STEP + 1000), true);
  assert.equal(ch.candles.length, 1);
  assert.strictEqual(ch.candles[0], candle);
  assert.equal(candle.o, 100);
  assert.equal(candle.c, 103);
  assert.equal(candle.h, 103);
  assert.equal(candle.l, 99);
  assert.equal(candle.qv, 20);
  assert.equal(repairs.length, 0);
});

test('bookTicker permits the ordinary transition to the next candle', () => {
  const { ch, candle, repairs, context } = fixture();
  assert.equal(context.applyLivePriceToCandle(ch, '15m', 103, STEP * 2 + 1000), true);
  assert.equal(ch.candles.length, 2);
  assert.strictEqual(ch.candles[0], candle);
  const next = ch.candles[1];
  assert.equal(next.t, STEP * 2);
  assert.equal(next.o, 101);
  assert.equal(next.h, 103);
  assert.equal(next.l, 101);
  assert.equal(next.c, 103);
  assert.equal(next.qv, 0);
  assert.equal(next._synthetic, true);
  assert.equal(repairs.length, 0);
});

test('bookTicker ignores older quotes without changing history', () => {
  const { ch, repairs, context } = fixture();
  const before = JSON.stringify(ch.candles);
  assert.equal(context.applyLivePriceToCandle(ch, '15m', 102, STEP - 1000), false);
  assert.equal(JSON.stringify(ch.candles), before);
  assert.equal(repairs.length, 0);
});

test('bookTicker still rejects a spike within the current candle', () => {
  const { ch, repairs, context } = fixture();
  const before = JSON.stringify(ch.candles);
  assert.equal(context.applyLivePriceToCandle(ch, '15m', 160, STEP + 1000), false);
  assert.equal(JSON.stringify(ch.candles), before);
  assert.equal(repairs.length, 0);
});
