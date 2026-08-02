// Tests for screener-virtual — the pure math behind virtual scrolling.
//
// Covers boundary conditions that matter for correctness:
//   - scrollTop exactly on a row boundary
//   - scrollTop past the end (clamped)
//   - viewport larger than total
//   - empty list
//   - overscan behaviour
//   - non-default row height
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleRange, visibleCount, scrollOffsetForRow, ROW_HEIGHT, DEFAULT_OVERSCAN } from '../src/screener-virtual.js'

test('visibleRange: empty list returns zero range', () => {
  const r = visibleRange(0, 500, 0)
  assert.equal(r.first, 0)
  // Empty list: last=-1 means "no rows". visibleCount returns 0.
  assert.equal(r.last, -1)
  assert.equal(r.spacerTop, 0)
  assert.equal(r.spacerBottom, 0)
  assert.equal(visibleCount(r), 0)
})

test('visibleRange: scrollTop at row 0 with full viewport fits all', () => {
  // 100 rows × 27 = 2700 px scrollable. Viewport 500 fits ~18 rows + overscan.
  const r = visibleRange(0, 500, 100)
  assert.equal(r.first, 0)
  assert.equal(r.last, 23) // ceil(500/27)-1 = 18, +5 overscan = 23
  assert.equal(r.spacerTop, 0)
  assert.equal(r.spacerBottom, (99 - 23) * 27)
})

test('visibleRange: scrolls at midpoint', () => {
  // Mid of 500 rows, viewport 500, rowHeight 27.
  // rawFirst = 13500/27 = 500 ... wait, scrollTop=13500. rawFirst=500. Too far.
  // Use scrollTop=1350 instead.
  const r = visibleRange(1350, 500, 500)
  assert.equal(r.first, 45)  // floor(1350/27)=50, -5 overscan = 45
  assert.equal(r.last, 73)   // ceil(1850/27)-1=68-1=67, +5 overscan = 72. Hmm let me check.
  // Actually: ceil(1850/27) = ceil(68.518) = 69, -1 = 68. +5 = 73.
  // But total=500, so last clamped to 499. With overscan 5 → 73 (well within).
  assert.equal(r.last, 73)
  assert.equal(r.spacerTop, 45 * 27)
  assert.equal(r.spacerBottom, (499 - 73) * 27)
})

test('visibleRange: clamp first to 0 when overscan pushes below', () => {
  // scrollTop=0, viewport=500, total=100, overscan=5 → first should be 0
  const r = visibleRange(0, 500, 100)
  assert.equal(r.first, 0)
})

test('visibleRange: clamp last to total-1 when overscan pushes past end', () => {
  // scrollTop=2650 (almost end of 100*27=2700), viewport=500
  // rawLast = ceil((2650+500)/27)-1 = ceil(116.67)-1 = 116-1 = 115
  // +5 overscan = 120, clamped to 99
  const r = visibleRange(2650, 500, 100)
  assert.equal(r.last, 99)
  assert.equal(r.spacerBottom, 0)
})

test('visibleRange: scrollTop past total is clamped', () => {
  // Past end of scrollable area — browser clamps scrollTop automatically,
  // but defensive math should also clamp.
  const r = visibleRange(10000, 500, 100)
  assert.ok(r.first <= 99)
  assert.equal(r.last, 99)
  assert.ok(r.spacerBottom >= 0)
})

test('visibleRange: viewport larger than total fits everything', () => {
  const r = visibleRange(0, 5000, 10)
  assert.equal(r.first, 0)
  assert.equal(r.last, 9)
  assert.equal(r.spacerTop, 0)
  assert.equal(r.spacerBottom, 0)
  assert.equal(visibleCount(r), 10)
})

test('visibleRange: custom rowHeight and overscan', () => {
  const r = visibleRange(100, 200, 50, 50, 0)
  // rawFirst = 100/50 = 2
  // rawLast = ceil(300/50)-1 = 6-1 = 5
  assert.equal(r.first, 2)
  assert.equal(r.last, 5)
  assert.equal(r.spacerTop, 100)
  assert.equal(r.spacerBottom, (49 - 5) * 50)
})

test('visibleRange: zero overscan returns exactly viewport', () => {
  const r = visibleRange(0, 270, 100, 27, 0)
  // rawFirst=0, rawLast=ceil(270/27)-1=10-1=9
  assert.equal(r.first, 0)
  assert.equal(r.last, 9)
  assert.equal(visibleCount(r), 10)
})

test('visibleRange: handles negative or NaN inputs gracefully', () => {
  const r1 = visibleRange(-50, 500, 100)
  assert.equal(r1.first, 0) // clamped to 0
  const r2 = visibleRange(NaN, 500, 100)
  assert.equal(r2.first, 0)
  const r3 = visibleRange(0, NaN, 100)
  // NaN viewportH → first=0 (rawFirst=0), last=5 (overscan only)
  assert.equal(r3.first, 0)
})

test('visibleRange: large overscan covers viewport in both directions', () => {
  const r = visibleRange(135, 270, 100, 27, 50)
  // rawFirst = 5, rawLast = ceil(405/27)-1 = 15-1 = 14
  // first = max(0, 5-50) = 0
  // last = min(99, 14+50) = 64
  assert.equal(r.first, 0)
  assert.equal(r.last, 64)
})

test('scrollOffsetForRow: returns row * height', () => {
  assert.equal(scrollOffsetForRow(0), 0)
  assert.equal(scrollOffsetForRow(10), 10 * ROW_HEIGHT)
  assert.equal(scrollOffsetForRow(99), 99 * ROW_HEIGHT)
})

test('scrollOffsetForRow: clamps negative to 0', () => {
  assert.equal(scrollOffsetForRow(-5), 0)
})

test('scrollOffsetForRow: respects custom height', () => {
  assert.equal(scrollOffsetForRow(3, 50), 150)
})

test('constants exported', () => {
  assert.equal(typeof ROW_HEIGHT, 'number')
  assert.equal(typeof DEFAULT_OVERSCAN, 'number')
  assert.ok(ROW_HEIGHT > 0)
  assert.ok(DEFAULT_OVERSCAN >= 0)
})
