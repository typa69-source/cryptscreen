// RED: TP-level labels on the profit side must show the cumulative realized
// profit at that grid level, not hardcoded zeros.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gridRiskMetaForPrice, buildGridFavorableRows, buildGridRiskRows, fmtGridLineTitle } from '../src/gridLab.js'

const longCfg = { lower: 90, upper: 110, currentPrice: 100, levels: 10, leverage: 1, deposit: 10, gridMode: 'long' }

test('gridRiskMetaForPrice: long TP levels carry cumulative realized profit', () => {
  const riskRows = buildGridRiskRows(longCfg)
  const favRows = buildGridFavorableRows(longCfg) // 102:0.02 104:0.06 106:0.12 108:0.20 110:0.30
  const meta = gridRiskMetaForPrice(102, 100, 2, riskRows, 'long', favRows)
  assert.equal(meta.side, 'tp-up')
  assert.ok(Math.abs(meta.usdt - 0.02) < 1e-9, `got ${meta.usdt}`)
  const meta2 = gridRiskMetaForPrice(110, 100, 2, riskRows, 'long', favRows)
  assert.ok(Math.abs(meta2.usdt - 0.30) < 1e-9, `got ${meta2.usdt}`)
  assert.ok(Math.abs(meta2.pct - 3) < 1e-9, `got ${meta2.pct}`) // 0.30/10*100
})

test('fmtGridLineTitle renders tp values, not zeros', () => {
  const s = fmtGridLineTitle({ side: 'tp-up', usdt: 0.3, pct: 3 }, (v) => v)
  assert.ok(s.includes('3%') && s.includes('0.3 USDT') && s.includes('фиксация'), s)
})
