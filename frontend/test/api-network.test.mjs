import test from 'node:test';
import assert from 'node:assert/strict';
import { fj } from '../src/api.js';

test('request timeout aborts the underlying fetch', async () => {
  const originalFetch = globalThis.fetch;
  let requestSignal;
  globalThis.fetch = (_url, options = {}) => {
    requestSignal = options.signal;
    return new Promise((_resolve, reject) => {
      requestSignal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  };
  try {
    await assert.rejects(fj('https://example.invalid/timeout-test', 20, 0), /Timeout/);
    assert.ok(requestSignal, 'fetch must receive an AbortSignal');
    assert.equal(requestSignal.aborted, true, 'timed-out network work must be cancelled');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
