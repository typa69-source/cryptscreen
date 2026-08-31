// Regression tests: Grid Lab risk/favorable math must match the real
// directional grid-bot model (Binance/Bybit):
//   LONG grid  → a position spanning all UP levels is open at the anchor;
//                down levels average it. Favorable (up) = openK*qty*(px-anchor).
//   SHORT grid → mirror.
//   NEUTRAL    → no pre-open; each crossed level fills one order (the level
//                you LEAVE counts as the fill), MTM at a level includes that fill.
// RED: favorable directional math is currently the per-level sum model — fails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGridRiskRows, buildGridFavorableRows, gridRiskAnchorIdx } from '../src/gridLab.js'

// long: 90..110, 10 levels, cur=100, dep=10, lev=1 → per-step notional 1$, anchor=100, openK=5
const longCfg = { lower: 90, upper: 110, currentPrice: 100, levels: 10, leverage: 1, deposit: 10, gridMode: 'long' }

test('long risk: pre-opened position spans maxUp-1 levels; down rows average', () => {
  const rows = buildGridRiskRows(longCfg)
  // at 98: open 5$*(-2/100) = -0.10; the order AT 98 just filled → 0 PnL from it
  assert.ok(Math.abs(rows[0].downUsdt - (-0.10)) < 1e-9, `got ${rows[0].downUsdt}`)
  // at 96: open 5$*(-4/100) = -0.2, fill@98: 1$*(96-98)/98 = -0.0204, fill@96 = 0 → -0.2204
  assert.ok(Math.abs(rows[1].downUsdt - (-0.220408)) < 1e-4, `got ${rows[1].downUsdt}`)
  // at 90: open -0.5 + fills at 98,96,94,92,90 (each vs pxNow) → -0.70842
  const last = rows[rows.length - 1]
  assert.ok(Math.abs(last.downUsdt - (-0.708425)) < 1e-4, `got ${last.downUsdt}`)
})

test('long favorable: profit = pre-opened position MTM, not per-level sum', () => {
  const fav = buildGridFavorableRows(longCfg)
  // at 102: 5$*(2/100) = +0.10
  assert.ok(Math.abs(fav[0].usdt - 0.10) < 1e-9, `got ${fav[0].usdt}`)
  // at 110: 5$*(10/100) = +0.50
  const last = fav[fav.length - 1]
  assert.ok(Math.abs(last.usdt - 0.5) < 1e-9, `got ${last.usdt}`)
})

test('short risk mirrors long risk', () => {
  const shortCfg = { ...longCfg, gridMode: 'short' }
  const rows = buildGridRiskRows(shortCfg)
  // at 102: openK=maxDown=5, entry=100: 5*(1/100)*(100-102) = -0.10
  assert.ok(Math.abs(rows[0].upUsdt - (-0.10)) < 1e-9, `got ${rows[0].upUsdt}`)
})

test('short favorable: open short MTM (5 levels down), not per-level sum', () => {
  const shortCfg = { ...longCfg, gridMode: 'short' }
  const fav = buildGridFavorableRows(shortCfg)
  // at 90: open short 5$*(10/100) = +0.50
  const last = fav[fav.length - 1]
  assert.ok(Math.abs(last.usdt - 0.5) < 1e-9, `got ${last.usdt}`)
})

test('neutral risk: first crossed level includes the anchor fill (off-by-one)', () => {
  const neutralCfg = { ...longCfg, gridMode: 'neutral' }
  const rows = buildGridRiskRows(neutralCfg)
  // at 98: one fill at 100 → MTM = 0.01*(98-100) = -0.02
  const r98 = rows.find(r => r.downPrice === 98)
  assert.ok(Math.abs(r98.downUsdt - (-0.02)) < 1e-9, `got ${r98.downUsdt}`)
  // at 102: one short fill at 100 → MTM = 0.01*(100-102) = -0.02
  const r102 = rows.find(r => r.upPrice === 102)
  assert.ok(Math.abs(r102.upUsdt - (-0.02)) < 1e-9, `got ${r102.upUsdt}`)
})
