// Unit tests for the multi-exchange (Binance + Bybit) foundation layer.
// Pure functions only — no DOM, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXCHANGES,
  tfToBybitInterval,
  parseBybitKlines,
  bybitTickerToCommon,
  bybitBySymToList,
  buildUniverse,
  buildAvailability,
  resolveSymbolExchange,
  exchangeForKlines,
  exchangeMarkSvg,
  EXCHANGE_LABEL,
  isBybitSymbol,
} from '../src/exchanges.js';

// ─── Interval mapping ───────────────────────────────────────────
test('tfToBybitInterval maps Binance-style TFs to Bybit codes', () => {
  assert.equal(tfToBybitInterval('1m'), '1');
  assert.equal(tfToBybitInterval('3m'), '3');
  assert.equal(tfToBybitInterval('5m'), '5');
  assert.equal(tfToBybitInterval('15m'), '15');
  assert.equal(tfToBybitInterval('30m'), '30');
  assert.equal(tfToBybitInterval('1h'), '60');
  assert.equal(tfToBybitInterval('4h'), '240');
  assert.equal(tfToBybitInterval('1d'), 'D');
});

// ─── Bybit kline parsing ────────────────────────────────────────
test('parseBybitKlines converts Bybit rows into the internal candle format, oldest first', () => {
  // Bybit returns newest-first rows: [start, open, high, low, close, volume, turnover]
  const rows = [
    ['1791950100000', '83752.4', '83755.8', '83658', '83658.1', '112.619', '9426963.7097'],
    ['1791949800000', '83803.2', '83803.2', '83740.8', '83752.4', '86.403', '7237992.2036'],
  ];
  const out = parseBybitKlines(rows);
  assert.equal(out.length, 2);
  // oldest first
  assert.equal(out[0].t, 1791949800000);
  assert.equal(out[1].t, 1791950100000);
  assert.equal(out[1].o, 83752.4);
  assert.equal(out[1].h, 83755.8);
  assert.equal(out[1].l, 83658);
  assert.equal(out[1].c, 83658.1);
  // qv = turnover (quote volume in USDT), v = base volume
  assert.equal(out[1].qv, 9426963.7097);
  assert.equal(out[1].v, 112.619);
  // Bybit has no trade count → tr = 0
  assert.equal(out[1].tr, 0);
});

test('parseBybitKlines drops malformed rows and survives null input', () => {
  assert.deepEqual(parseBybitKlines(null), []);
  assert.deepEqual(parseBybitKlines(undefined), []);
  const bad = [
    ['not-a-ts', '1', '2', '0.5', '1', '0', '0'],
    ['1791950100000', '83752.4', '83755.8', '83658', '83658.1', '112.6', '9426963'],
    ['1791950400000', 'oops', '83755.8', '83658', '83658.1', '112.6', '9426963'],
  ];
  const out = parseBybitKlines(bad);
  assert.equal(out.length, 1);
  assert.equal(out[0].t, 1791950100000);
});

// ─── Bybit ticker → common shape { p, c24, h24, l24, qv, tr, fund, oi } ──
test('bybitTickerToCommon maps Bybit linear ticker fields to the app ticker shape', () => {
  const t = {
    symbol: 'PEPEUSDT',
    lastPrice: '0.0000125',
    price24hPcnt: '0.0521', // fraction, not percent
    highPrice24h: '0.0000140',
    lowPrice24h: '0.0000100',
    turnover24h: '12345678.9',   // quote volume USDT
    volume24h: '987654321',     // base volume
    fundingRate: '0.0001',
    openInterest: '555.5',
    openInterestValue: '7000000',
  };
  const c = bybitTickerToCommon(t);
  assert.equal(c.p, 0.0000125);
  assert.equal(c.c24, 5.21); // 0.0521 * 100
  assert.equal(c.h24, 0.0000140);
  assert.equal(c.l24, 0.0000100);
  assert.equal(c.qv, 12345678.9);
  assert.equal(c.tr, 0); // Bybit tickers carry no trade count
  assert.equal(c.fund, 0.0001);
  assert.equal(c.oi, 555.5);
  assert.equal(c.oiUsd, 7000000);
});

test('bybitTickerToCommon tolerates missing fields', () => {
  const c = bybitTickerToCommon({ symbol: 'XUSDT', lastPrice: '2' });
  assert.equal(c.p, 2);
  assert.equal(c.c24, 0);
  assert.equal(c.qv, 0);
  assert.equal(c.tr, 0);
});

// ─── Universe building (merge + dedupe by base coin) ────────────
test('buildUniverse merges both exchanges and dedupes by base symbol with priority', () => {
  const binance = { BTCUSDT: { qv: 1e9 }, DOGEUSDT: { qv: 5e8 }, ALPACAUSDT: { qv: 2e7 } };
  const bybit = { BTCUSDT: { qv: 8e8 }, SOLUSDT: { qv: 3e8 }, NOTONBINANCEUSDT: { qv: 1e7 } };
  // ALPACA exists on Binance only; NOTONBINANCE exists on Bybit only.
  const uni = buildUniverse(binance, bybit, 'binance');
  // All base coins present exactly once
  const syms = uni.map(u => u.sym);
  assert.ok(syms.includes('BTCUSDT'));
  assert.ok(syms.includes('DOGEUSDT'));
  assert.ok(syms.includes('SOLUSDT'));
  assert.ok(syms.includes('ALPACAUSDT'));
  assert.ok(syms.includes('NOTONBINANCEUSDT'));
  assert.equal(new Set(syms).size, syms.length);
  // Priority binance → BTC resolved to binance source, qv taken from there
  const btc = uni.find(u => u.sym === 'BTCUSDT');
  assert.equal(btc.ex, 'binance');
  assert.equal(btc.qv, 1e9);
  assert.deepEqual(btc.exchanges, ['binance', 'bybit']);
  // Bybit-only coin
  const nb = uni.find(u => u.sym === 'NOTONBINANCEUSDT');
  assert.equal(nb.ex, 'bybit');
  assert.deepEqual(nb.exchanges, ['bybit']);
  assert.equal(nb.qv, 1e7);
});

test('buildUniverse with bybit priority resolves duplicate symbols to bybit', () => {
  const binance = { BTCUSDT: { qv: 1e9 } };
  const bybit = { BTCUSDT: { qv: 8e8 } };
  const uni = buildUniverse(binance, bybit, 'bybit');
  const btc = uni.find(u => u.sym === 'BTCUSDT');
  assert.equal(btc.ex, 'bybit');
  assert.equal(btc.qv, 8e8);
  assert.deepEqual(btc.exchanges, ['binance', 'bybit']);
});

test('buildUniverse ignores non-USDT and non-trading junk', () => {
  const binance = { BTCUSDT: { qv: 1 }, 'BTCUSDC': { qv: 1 }, WEIRD: { qv: 1 } };
  const bybit = { '1000SATSUSDT': { qv: 5 }, SOLUSDA: { qv: 5 } };
  const uni = buildUniverse(binance, bybit, 'binance');
  const syms = uni.map(u => u.sym);
  assert.ok(!syms.includes('BTCUSDC'));
  assert.ok(!syms.includes('WEIRD'));
  assert.ok(!syms.includes('SOLUSDA'));
  assert.ok(syms.includes('1000SATSUSDT'));
});

// ─── Symbol exchange resolution ─────────────────────────────────
test('resolveSymbolExchange honours explicit per-symbol override over global priority', () => {
  const availability = { BTCUSDT: ['binance', 'bybit'], DOGEUSDT: ['bybit'] };
  // Global priority binance, but user pinned DOGE→? (only bybit available) and BTC→bybit
  assert.equal(resolveSymbolExchange('BTCUSDT', availability, 'binance', { BTCUSDT: 'bybit' }), 'bybit');
  assert.equal(resolveSymbolExchange('BTCUSDT', availability, 'binance', null), 'binance');
  // Not available on priority exchange → fall back to the one it exists on
  assert.equal(resolveSymbolExchange('DOGEUSDT', availability, 'binance', null), 'bybit');
  // Unknown symbol → priority exchange
  assert.equal(resolveSymbolExchange('NOPEUSDT', availability, 'binance', null), 'binance');
});

// ─── Routing helpers ────────────────────────────────────────────
test('exchangeForKlines picks the right fetcher by exchange id', () => {
  const fetchers = {
    binance: { label: 'B' },
    bybit: { label: 'Y' },
  };
  assert.equal(exchangeForKlines(fetchers, 'binance'), fetchers.binance);
  assert.equal(exchangeForKlines(fetchers, 'bybit'), fetchers.bybit);
  // Unknown → binance fallback
  assert.equal(exchangeForKlines(fetchers, 'kraken'), fetchers.binance);
});

test('isBybitSymbol and EXCHANGE_LABEL basics', () => {
  assert.equal(isBybitSymbol('BTCUSDT'), false);
  assert.equal(isBybitSymbol('BY:BTCUSDT'), true);
  assert.equal(EXCHANGE_LABEL.binance, 'Binance');
  assert.equal(EXCHANGE_LABEL.bybit, 'Bybit');
  assert.ok(EXCHANGES.includes('binance'));
  assert.ok(EXCHANGES.includes('bybit'));
});

// ─── Brand marks ────────────────────────────────────────────────
test('exchangeMarkSvg renders distinct brand shapes per venue', () => {
  const b = exchangeMarkSvg('binance');
  const y = exchangeMarkSvg('bybit');
  assert.ok(b.startsWith('<svg') && b.endsWith('</svg>'));
  assert.ok(y.startsWith('<svg') && y.endsWith('</svg>'));
  // Binance: rotated diamond, #f0b90b
  assert.ok(b.includes('rotate(45'));
  assert.ok(b.includes('#f0b90b'));
  // Bybit: dark square with orange stroke
  assert.ok(y.includes('#f7ab00'));
  assert.ok(y.includes('#101114'));
  assert.ok(!b.includes('#101114'));
  // sizes clamp
  assert.ok(exchangeMarkSvg('binance', 2).includes('width="8"'));
  assert.ok(exchangeMarkSvg('binance', 99).includes('width="24"'));
});

// ─── Availability map ───────────────────────────────────────────
test('buildAvailability derives listing purely from symbol arrays, not from the merged ticker map', () => {
  const av = buildAvailability(['BTCUSDT', 'DOGEUSDT'], ['BTCUSDT', 'STONKUSDT']);
  assert.deepEqual(av.BTCUSDT, ['binance', 'bybit']);
  assert.deepEqual(av.DOGEUSDT, ['binance']);
  assert.deepEqual(av.STONKUSDT, ['bybit']);
  // junk filtered
  const av2 = buildAvailability(['BTCUSDC', 'X'], ['SOLUSDA']);
  assert.equal(Object.keys(av2).length, 0);
  assert.deepEqual(buildAvailability(null, null), {});
});

// ─── REST path builders (pure string functions) ─────────────────
test('bybitBySymToList groups symbols into subscribe-style arg lists', () => {
  const syms = ['AUSDT', 'BUSDT', 'CUSDT', 'DUSDT', 'EUSDT'];
  const groups = bybitBySymToList(syms, 2);
  assert.deepEqual(groups, [['AUSDT', 'BUSDT'], ['CUSDT', 'DUSDT'], ['EUSDT']]);
  assert.deepEqual(bybitBySymToList([], 2), []);
});
