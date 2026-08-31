// RED: collectGridLabFields must read the grid-mode select by its real id
// (#gbGridMode). It previously read '#gbMode' which doesn't exist, so the
// risk profile was permanently stuck on Neutral regardless of user choice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectGridLabFields } from '../src/gridLab-ui.js'
import { JSDOM } from 'jsdom'

test('collectGridLabFields reads #gbGridMode select value', () => {
  const dom = new JSDOM(`<!DOCTYPE html><div id="body">
    <input id="gbSym" value="BTCUSDT">
    <select id="gbTf"><option value="5m" selected></option></select>
    <input id="gbHigh" value="110">
    <input id="gbLow" value="90">
    <input id="gbLevels" value="10">
    <input id="gbLev" value="3">
    <input id="gbDep" value="500">
    <select id="gbGridMode"><option value="neutral"></option><option value="long" selected></option><option value="short"></option></select>
  </div></div>`)
  const body = dom.window.document.getElementById('body')
  const fields = collectGridLabFields(body)
  assert.equal(fields.gridMode, 'long')
})

