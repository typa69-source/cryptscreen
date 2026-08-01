// Tests for perf-monitor — the lightweight runtime stats collector.
// Verifies basic bucketing, window reset, and snapshot output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markStart, markEnd, count, snapshot, _getBuckets, _reset } from '../src/perf-monitor.js'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

test('perf-monitor: markStart/markEnd accumulates count and total', async () => {
  _reset()
  markStart('foo')
  await sleep(5)
  markEnd('foo')
  markStart('foo')
  await sleep(5)
  markEnd('foo')
  const fb = _getBuckets().get('foo')
  assert.equal(fb.count, 2)
  assert.ok(fb.total >= 8, 'total covers both sleeps')
  assert.ok(fb.max >= 4)
})

test('perf-monitor: count() aggregates into same bucket', async () => {
  _reset()
  count('hits', 3)
  count('hits', 2)
  const b = _getBuckets().get('hits')
  assert.equal(b.count, 5)
  assert.equal(b.last, 2)
})

test('perf-monitor: skipped markEnd without start is a no-op', async () => {
  _reset()
  // markEnd on a never-started bucket must not throw.
  markEnd('never-started')
  const b = _getBuckets().get('never-started')
  assert.ok(!b || b.count === 0)
})

test('perf-monitor: MAX_BUCKETS caps unknown buckets', async () => {
  _reset()
  for (let i = 0; i < 100; i++) count(`u${i}`)
  // Caps at 64 distinct buckets.
  assert.ok(_getBuckets().size <= 64)
})

test('perf-monitor: snapshot() does not throw on empty state', () => {
  _reset()
  assert.doesNotThrow(() => snapshot())
})

test('perf-monitor: snapshot() does not throw with data', async () => {
  _reset()
  markStart('a')
  await sleep(2)
  markEnd('a')
  count('b', 1)
  assert.doesNotThrow(() => snapshot())
})

test('perf-monitor: window stats reset after snapshot', async () => {
  _reset()
  markStart('w')
  await sleep(2)
  markEnd('w')
  const b = _getBuckets().get('w')
  assert.equal(b.winCount, 1)
  snapshot()
  assert.equal(b.winCount, 0, 'win counters reset after snapshot')
  // cumulative remains
  assert.equal(b.count, 1)
})
