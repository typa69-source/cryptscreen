// Lightweight runtime perf monitor for cryptscreen.
// Goal: identify what blocks scroll/UI on big universes WITHOUT changing
// existing behaviour. The output is a per-bucket summary printed to
// console every ~10s.
//
// Usage (from main.js, top-level imports only — no side effects on import):
//   import { markStart, markEnd, count, snapshot, installConsoleHook } from './perf-monitor.js'
//   markStart('renderTable')
//   ... do work ...
//   markEnd('renderTable')
//   count('updateScreenerRow.sigSkip')
//
// Or wrap a section:
//   perfMeasure('renderTable', () => doWork())
//
// The monitor keeps two views:
//   1. Cumulative: total count, total ms, max ms, last ms per bucket.
//   2. Windowed:   samples in the last `WINDOW_MS`, used for the summary.
//
// Designed to be cheap: the hot path is one performance.now() + map.set
// per mark. Summary print runs once every `PRINT_MS` and is itself
// O(buckets). No allocations on the mark path.

const WINDOW_MS = 10_000
const PRINT_MS = 10_000
const MAX_BUCKETS = 64

const buckets = new Map() // name → { count, total, max, last, winCount, winTotal, winMax }
let lastPrint = 0
let installed = false

function bucket(name) {
  let b = buckets.get(name)
  if (!b) {
    if (buckets.size >= MAX_BUCKETS) {
      // Drop unknown bucket silently — better than throwing in hot path.
      return null
    }
    b = { count: 0, total: 0, max: 0, last: 0, winCount: 0, winTotal: 0, winMax: 0 }
    buckets.set(name, b)
  }
  return b
}

export function markStart(name) {
  if (!buckets.has(name)) bucket(name)
  // Reuse the entry's own last field as the start time (avoids allocating
  // a parallel Map<string, number>).
  const b = buckets.get(name)
  if (!b) return
  b.last = performance.now()
  b._t0 = b.last
}

export function markEnd(name) {
  const b = buckets.get(name)
  if (!b || b._t0 == null) return
  const now = performance.now()
  const dt = now - b._t0
  b.count++
  b.total += dt
  if (dt > b.max) b.max = dt
  b.last = dt
  b.winCount++
  b.winTotal += dt
  if (dt > b.winMax) b.winMax = dt
  b._t0 = null
  maybePrint(now)
}

// Cheap counter for "we skipped a row because signature matched" etc.
// Aggregated into the same per-bucket stats so a single summary call
// covers both timing and skip counts.
export function count(name, n = 1) {
  let b = bucket(name)
  if (!b) return
  b.count += n
  b.last = n
  b.winCount += n
}

// Wraps a synchronous function so callers don't have to bracket it.
// Not used on the hottest paths (per-call overhead).
export function perfMeasure(name, fn) {
  markStart(name)
  try {
    return fn()
  } finally {
    markEnd(name)
  }
}

function maybePrint(now) {
  if (now - lastPrint < PRINT_MS) return
  lastPrint = now
  printSummary()
}

function printSummary() {
  if (buckets.size === 0) return
  const lines = ['[perf] last 10s — name: win_count / win_avg_ms / win_max_ms / cum_count / cum_avg_ms / cum_max_ms']
  const rows = [...buckets.entries()]
  rows.sort((a, b) => b[1].winTotal - a[1].winTotal)
  for (const [name, b] of rows) {
    if (b.count === 0 && b.winCount === 0) continue
    const wAvg = b.winCount ? (b.winTotal / b.winCount) : 0
    const cAvg = b.count ? (b.total / b.count) : 0
    lines.push(
      `  ${name.padEnd(28)} ${String(b.winCount).padStart(6)} / ${wAvg.toFixed(2).padStart(7)} / ${b.winMax.toFixed(2).padStart(7)}   ${String(b.count).padStart(6)} / ${cAvg.toFixed(2).padStart(7)} / ${b.max.toFixed(2).padStart(7)}`
    )
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
  // Reset windowed stats after printing.
  for (const b of buckets.values()) {
    b.winCount = 0
    b.winTotal = 0
    b.winMax = 0
  }
}

// Force-print on demand (for tests / manual probe).
export function snapshot() {
  printSummary()
}

// Expose a global hook so the user can run `perf.snapshot()` in DevTools
// at any time without re-importing.
export function installConsoleHook() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.__perf = { snapshot, buckets }
}

// Test-only accessor for the underlying Map. Not used at runtime.
export function _getBuckets() {
  return buckets
}

// Test-only: clear all stats. Not used at runtime.
export function _reset() {
  buckets.clear()
  lastPrint = 0
}
