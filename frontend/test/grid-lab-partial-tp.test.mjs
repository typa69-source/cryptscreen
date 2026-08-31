// RED: favorable (profit) rows must model PARTIAL TAKE-PROFITS the way real
// directional grid bots close a position — in chunks, one per grid level.
// Long: position entered at anchor covers openK levels; at each level above
// the anchor the bot sells 1/openK of the position; realized profit
// accumulates: cum(k) = Σ_{i=1..k} q·(P_i − anchor), q = perStep/anchor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGridFavorableRows } from '../src/gridLab.js'

// 90..110, 10 levels, cur=100, dep=10, lev=1 → perStep=1$, anchor=100, openK=5, q=0.01
const longCfg = { lower: 90, upper: 110, currentPrice: 100, levels: 10, leverage: 1, deposit: 10, gridMode: 'long' }

test('long favorable: cumulative realized profit from partial closes', () => {
  const fav = buildGridFavorableRows(longCfg)
  // level 102: close 1 chunk: 0.01*(102-100) = 0.02
  assert.ok(Math.abs(fav[0].usdt - 0.02) < 1e-9, `got ${fav[0].usdt}`)
  // level 104: + chunk at 104: cum = 0.02 + 0.01*(104-100) = 0.06
  assert.ok(Math.abs(fav[1].usdt - 0.06) < 1e-9, `got ${fav[1].usdt}`)
  // level 110: all 5 chunks closed: 0.02+0.04+0.06+0.08+0.10 = 0.30
  const last = fav[fav.length - 1]
  assert.ok(Math.abs(last.usdt - 0.30) < 1e-9, `got ${last.usdt}`)
})

test('long favorable: fully closes after openK levels (no extra rows)', () => {
  const fav = buildGridFavorableRows(longCfg)
  assert.equal(fav.length, 5) // openK levels above anchor
})

test('short favorable: cumulative realized profit walking down', () => {
  const shortCfg = { ...longCfg, gridMode: 'short' }
  const fav = buildGridFavorableRows(shortCfg)
  // at 98: 0.01*(100-98) = 0.02 ; at 96: +0.04 → 0.06 ; at 90: 0.30
  assert.ok(Math.abs(fav[0].usdt - 0.02) < 1e-9, `got ${fav[0].usdt}`)
  assert.ok(Math.abs(fav[fav.length - 1].usdt - 0.30) < 1e-9, `got ${fav[fav.length - 1].usdt}`)
})
