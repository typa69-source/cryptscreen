// Smoke tests for the metrics worker wrapper.
// We can't actually spawn a Worker in node:test/jsdom easily, but we
// can verify the API surface and the 'worker_unavailable' contract
// that main.js relies on for its fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMetrics, workerAvailable } from '../src/metrics-worker-runtime.js';

test('workerAvailable is a function and returns a boolean', () => {
  assert.equal(typeof workerAvailable, 'function');
  // In a node test environment (no Worker global) we expect false.
  assert.equal(typeof workerAvailable(), 'boolean');
});

test('runMetrics rejects with worker_unavailable when no Worker support', async () => {
  // node's globalThis has no `Worker`; the wrapper must surface that
  // as a clean error so main.js can fall back to its sync path.
  await assert.rejects(
    () => runMetrics({ syms: [], k5m: {}, k1h: {}, k1m: {}, tk: {}, fundRates: {}, oiDelta: {}, prevMx: {}, dayStartMs: 0 }),
    (err) => err.message === 'worker_unavailable'
  );
});
