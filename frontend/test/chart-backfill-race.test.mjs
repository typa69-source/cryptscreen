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
