// Regression tests for effLiquidity/liquidityPasses — the venue-pinned
// liquidity filter semantics. Locks the reported bug: pinning Bybit with
// minTrd > 0 must NOT empty the list, because Bybit reports no trade
// count (tr=0 in the common shape) — 0 is UNKNOWN for trade counts, not
// a real zero. Unknown values pass the threshold and display '•'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effLiquidity, liquidityPasses } from '../src/screener-virtual.js'

const ctx = (over = {}) => ({
  listVenue: null,
  symEx: {},
  tkOther: {},
  byVolFactor: 1,
  ...over,
})

test('effLiquidity: binance row, no pin → own vol/trd, no factor', () => {
  const c = ctx({ symEx: { BTCUSDT: 'binance' } })
  const r = { sym: 'BTCUSDT', vol24: 5e6, trd24: 123456 }
  assert.equal(effLiquidity(r, c, 'vol'), 5e6)
  assert.equal(effLiquidity(r, c, 'trd'), 123456)
})

test('effLiquidity: bybit-resolved row applies the coefficient', () => {
  const c = ctx({ symEx: { XUSDT: 'bybit' }, byVolFactor: 10 })
  const r = { sym: 'XUSDT', vol24: 2e6, trd24: 500 }
  assert.equal(effLiquidity(r, c, 'vol'), 2e7)
  assert.equal(effLiquidity(r, c, 'trd'), 5000)
})

test('BUG: bybit tr=0 is UNKNOWN for trade counts, not a real zero', () => {
  const c = ctx({ symEx: { XUSDT: 'bybit' } })
  const r = { sym: 'XUSDT', vol24: 2e6, trd24: 0 } // Bybit: no trade count
  // volume 0 stays a real value (thin symbol) — but trd 0 → null (unknown)
  assert.equal(effLiquidity(r, c, 'trd'), null)
  assert.equal(effLiquidity({ sym: 'XUSDT', vol24: 0, trd24: 7 }, c, 'vol'), 0)
})

test('liquidityPasses: UNKNOWN trade count passes a minTrd threshold', () => {
  // THE bug: Bybit pin + minTrd 150K emptied the whole list.
  const c = ctx({ listVenue: 'bybit', symEx: { XUSDT: 'bybit' } })
  const bybitOnly = { sym: 'XUSDT', vol24: 2e6, trd24: 0 }
  assert.equal(liquidityPasses(bybitOnly, c, 'trd', 150000), true)
})

test('liquidityPasses: real binance trade counts are still filtered', () => {
  const c = ctx({ symEx: { AUSDT: 'binance', BUSDT: 'binance' } })
  const thin = { sym: 'AUSDT', vol24: 9e6, trd24: 999 }
  const fat = { sym: 'BUSDT', vol24: 9e6, trd24: 999999 }
  assert.equal(liquidityPasses(thin, c, 'trd', 150000), false)
  assert.equal(liquidityPasses(fat, c, 'trd', 150000), true)
})

test('liquidityPasses: threshold 0 passes everything', () => {
  const c = ctx()
  assert.equal(liquidityPasses({ sym: 'A', vol24: null, trd24: null }, c, 'trd', 0), true)
})

test('liquidityPasses: venue pin uses the pinned venue via tkOther', () => {
  // Pin bybit on a binance-resolved dual listing: filter must read the
  // BYBIT side (tkOther) with the coefficient, not the binance side.
  const c = ctx({
    listVenue: 'bybit',
    symEx: { BTCUSDT: 'binance' },
    tkOther: { BTCUSDT: { qv: 1e6, tr: 0 } }, // bybit side, no trade count
    byVolFactor: 10,
  })
  const r = { sym: 'BTCUSDT', vol24: 17e9, trd24: 4279515 }
  // vol: bybit side 1e6 × 10 = 1e7
  assert.equal(effLiquidity(r, c, 'vol'), 1e7)
  assert.equal(liquidityPasses(r, c, 'vol', 5e6), true)
  assert.equal(liquidityPasses(r, c, 'vol', 5e8), false)
  // trd: bybit side tr=0 → unknown → passes
  assert.equal(liquidityPasses(r, c, 'trd', 150000), true)
})

test('liquidityPasses: pin matching resolved venue uses the row numbers', () => {
  // Pin binance on a binance-resolved coin: tkOther (bybit) must NOT be
  // read — the row's own numbers are already binance-native.
  const c = ctx({
    listVenue: 'binance',
    symEx: { BTCUSDT: 'binance' },
    tkOther: { BTCUSDT: { qv: 1e6, tr: 0 } },
    byVolFactor: 10,
  })
  const r = { sym: 'BTCUSDT', vol24: 17e9, trd24: 4279515 }
  assert.equal(effLiquidity(r, c, 'vol'), 17e9)
  assert.equal(effLiquidity(r, c, 'trd'), 4279515)
  assert.equal(liquidityPasses(r, c, 'trd', 150000), true)
})

test('effLiquidity: missing/null values are unknown, never 0', () => {
  const c = ctx()
  assert.equal(effLiquidity({ sym: 'A', vol24: null }, c, 'vol'), null)
  assert.equal(effLiquidity({ sym: 'A', trd24: null }, c, 'trd'), null)
  assert.equal(effLiquidity(null, c, 'vol'), null)
})
