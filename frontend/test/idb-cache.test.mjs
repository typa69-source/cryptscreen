// Unit tests for the small IndexedDB wrapper.
// We can't test IDB itself (jsdom doesn't fully implement it), so we
// exercise the public surface and confirm that:
//   - cacheHasIDB() returns a boolean
//   - cacheGet/set/getFresh resolve to null in environments without IDB
//   - the helpers don't throw when called concurrently
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cacheHasIDB, cacheGet, cacheSet, cacheGetFresh } from '../src/idb-cache.js';

test('cacheHasIDB returns a boolean', () => {
  assert.equal(typeof cacheHasIDB(), 'boolean');
});

test('cacheGet resolves to null in environments without IDB', async () => {
  const v = await cacheGet('does_not_exist');
  assert.equal(v, null);
});

test('cacheGetFresh resolves to null in environments without IDB', async () => {
  const v = await cacheGetFresh('does_not_exist', 1000);
  assert.equal(v, null);
});

test('cacheSet is best-effort and never throws', async () => {
  await cacheSet('k', { x: 1 }, 1000);
  // No assertion on result; must simply not throw.
  assert.ok(true);
});

test('concurrent cacheGet/cacheSet calls do not throw', async () => {
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(cacheSet(`k${i}`, { i }, 1000));
    promises.push(cacheGet(`k${i}`));
    promises.push(cacheGetFresh(`k${i}`, 1000));
  }
  await Promise.all(promises);
  assert.ok(true);
});
