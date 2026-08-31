// Regression tests for sortRows — the pure comparator extracted from
// main.js sortedRows(). Locks the behaviour the user reported as broken:
// sorting must be deterministic, stable across ticks, and null-safe.
//
// RED phase: sortRows does not exist yet — these must fail first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortRows, SORT_ABS_IDS } from '../src/screener-virtual.js'

const row = (sym, ch24, vol24) => ({ sym, ch24, vol24 })

test('sortRows: desc numeric by key, nulls always last', () => {
  const rows = [row('B', 5), row('A', null), row('C', 10)]
  const out = sortRows(rows, { key: 'ch24', dir: 'desc' })
  assert.deepEqual(out.map(r => r.sym), ['C', 'B', 'A'])
})

test('sortRows: asc numeric, nulls still last', () => {
  const rows = [row('B', 5), row('A', null), row('C', 1)]
  const out = sortRows(rows, { key: 'ch24', dir: 'asc' })
  assert.deepEqual(out.map(r => r.sym), ['C', 'B', 'A'])
})

test('sortRows: abs mode ranks by magnitude regardless of sign', () => {
  const rows = [row('A', -9), row('B', 3), row('C', 7)]
  const out = sortRows(rows, { key: 'ch24', dir: 'desc', abs: true })
  assert.deepEqual(out.map(r => r.sym), ['A', 'C', 'B'])
})

test('sortRows: non-abs mode keeps signed order', () => {
  const rows = [row('A', -9), row('B', 3), row('C', 7)]
  const out = sortRows(rows, { key: 'ch24', dir: 'desc', abs: false })
  assert.deepEqual(out.map(r => r.sym), ['C', 'B', 'A'])
})

test('sortRows: NaN treated like null (last)', () => {
  const rows = [row('A', NaN), row('B', 2)]
  const out = sortRows(rows, { key: 'ch24', dir: 'desc' })
  assert.deepEqual(out.map(r => r.sym), ['B', 'A'])
})

test('sortRows: alpha mode sorts by sym with localeCompare', () => {
  const rows = [row('ZETH'), row('ABTC'), row('MADA')]
  const asc = sortRows(rows, { alpha: true, dir: 'asc' })
  assert.deepEqual(asc.map(r => r.sym), ['ABTC', 'MADA', 'ZETH'])
  const desc = sortRows(rows, { alpha: true, dir: 'desc' })
  assert.deepEqual(desc.map(r => r.sym), ['ZETH', 'MADA', 'ABTC'])
})

test('sortRows: sp5 key maps to spv alias for volume spark sort', () => {
  const rows = [{ sym: 'A', spv: 1 }, { sym: 'B', spv: 9 }]
  const out = sortRows(rows, { key: 'sp5', dir: 'desc' })
  assert.deepEqual(out.map(r => r.sym), ['B', 'A'])
})

test('sortRows: does not mutate the input array', () => {
  const rows = [row('B', 5), row('A', 1)]
  const copy = [...rows]
  sortRows(rows, { key: 'ch24', dir: 'asc' })
  assert.deepEqual(rows, copy)
})

test('SORT_ABS_IDS covers the signed-metric columns', () => {
  for (const id of ['ch24', 'ch7d', 'cday', 'sp5', 'spv', 'oi1h', 'oi4h']) {
    assert.ok(SORT_ABS_IDS.has(id), `${id} expected in SORT_ABS_IDS`)
  }
  assert.ok(!SORT_ABS_IDS.has('vol24'))
})
