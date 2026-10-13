import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const begin = source.indexOf('async function backfillChartGap(');
const finish = source.indexOf('async function backfillVisibleCharts(', begin);
assert.ok(begin >= 0 && finish > begin, 'backfill function must be found');

 test('backfill discards a response after the chart symbol changes', async () => {
  let completeFetch;
  const context = vm.createContext({
    API: 'https://example.invalid', HIST_CACHE_MAX: 2000,
    S: { tf: '1m', fsSym: null },
    Date: { now: () => 180000 },
    tfMs: () => 60000,
    fj: () => new Promise(resolve => { completeFetch = resolve; }),
    parseKlines: raw => raw,
  });
  vm.runInContext(source.slice(begin, finish), context);
  const ch = { sym: 'BTCUSDT', _loadSeq: 1, candles: [{ t: 60000, c: 10 }] };
  const pending = context.backfillChartGap(ch, 'BTCUSDT', '1m', 30);
  assert.equal(typeof completeFetch, 'function');
  ch.sym = 'ETHUSDT';
  ch._loadSeq = 2;
  const replacement = [{ t: 60000, c: 200 }];
  ch.candles = replacement;
  completeFetch([{ t: 60000, c: 11 }, { t: 120000, c: 12 }]);
  await pending;
  assert.strictEqual(ch.candles, replacement, 'old-symbol history must not overwrite the new chart');
  assert.equal(ch.candles[0].c, 200);
});

function backfillContext(now, fetchKlines) {
  const context = vm.createContext({
    API: 'https://example.invalid', HIST_CACHE_MAX: 2000,
    S: { tf: '1m', fsSym: null, fsCharts: [] },
    Date: { now: () => now },
    tfMs: () => 60000,
    fj: fetchKlines,
    parseKlines: raw => raw,
  });
  vm.runInContext(source.slice(begin, finish), context);
  return context;
}

 test('backfill repairs an internal gap even when the last candle is current', async () => {
  let requests = 0;
  const history = Array.from({ length: 10 }, (_, i) => ({
    t: (i + 1) * 60000, c: 100 + i,
  }));
  const context = backfillContext(610000, async () => {
    requests++;
    return history;
  });
  const ch = {
    sym: 'BTCUSDT', _loadSeq: 1,
    candles: [history[0], history[1], history[9]],
  };
  await context.backfillChartGap(ch, 'BTCUSDT', '1m', 30);
  assert.equal(requests, 1, 'a fresh tail must not conceal missing older bars');
  assert.deepEqual(Array.from(ch.candles, candle => candle.t), history.map(candle => candle.t));
  assert.equal(ch.candles[5].c, history[5].c);
});

 test('backfill replaces synthetic candles in otherwise current continuous history', async () => {
  let requests = 0;
  const authoritative = [
    { t: 60000, c: 100, qv: 10 },
    { t: 120000, c: 102, qv: 25 },
    { t: 180000, c: 103, qv: 30 },
  ];
  const context = backfillContext(190000, async () => {
    requests++;
    return authoritative;
  });
  const ch = {
    sym: 'BTCUSDT', _loadSeq: 1,
    candles: [
      authoritative[0],
      { t: 120000, c: 100, qv: 0, _synthetic: true },
      authoritative[2],
    ],
  };
  await context.backfillChartGap(ch, 'BTCUSDT', '1m', 30);
  assert.equal(requests, 1);
  assert.equal(ch.candles[1].c, 102);
  assert.equal(ch.candles[1].qv, 25);
  assert.equal(ch.candles[1]._synthetic, undefined);
});

 test('backfill skips current continuous history without synthetic candles', async () => {
  let requests = 0;
  const context = backfillContext(130000, async () => {
    requests++;
    return [];
  });
  const candles = [{ t: 60000, c: 100 }, { t: 120000, c: 101 }];
  const ch = { sym: 'BTCUSDT', _loadSeq: 1, candles };
  await context.backfillChartGap(ch, 'BTCUSDT', '1m', 30);
  assert.equal(requests, 0);
  assert.strictEqual(ch.candles, candles);
});
