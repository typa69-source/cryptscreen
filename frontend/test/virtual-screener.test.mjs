// Tests for the virtualized screener list. Uses jsdom for a real DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { ensureVirtualScreener } from '../src/virtual-screener.js';

function setupDom() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
       <div id="sbody" style="height:400px;overflow-y:scroll;display:flex;flex-direction:column"></div>
     </body></html>`,
    { url: 'http://localhost/' }
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  return dom.window.document.getElementById('sbody');
}

function makeBuild() {
  return (m, cols) => {
    const row = document.createElement('div');
    row.className = 'srow';
    row._sym = m.sym;
    row.dataset.idx = m.idx;
    row.textContent = m.sym;
    row.style.height = '26px';
    return row;
  };
}
function makeUpdate() {
  return (row, m, cols, inChart) => {
    row._sym = m.sym;
    row.dataset.idx = m.idx;
    if (row.textContent !== m.sym) row.textContent = m.sym;
  };
}
function makeRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ sym: 'SYM' + i, idx: i });
  return rows;
}

test('ensureVirtualScreener creates a wrapper inside the body', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  assert.ok(body._vs === vs);
  const wrap = body.firstChild;
  assert.equal(wrap.children.length, 2, 'wrap should have top + bottom spacers');
});

test('setData renders only viewport+buffer rows, not all rows', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData(makeRows(500), [], new Set());
  const wrap = body.firstChild;
  const visibleNodes = wrap.children.length - 2;
  assert.ok(visibleNodes < 60, `expected <60 visible, got ${visibleNodes}`);
  assert.ok(visibleNodes >= 30);
});

test('setData with same first/last sym does NOT rebuild the pool', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows1 = makeRows(500);
  vs.setData(rows1, [], new Set());
  const wrap = body.firstChild;
  const initialPoolLen = wrap.children.length - 2;
  const firstNode = wrap.children[1];
  const rows2 = rows1.map((r) => ({ ...r, val: Math.random() }));
  vs.setData(rows2, [], new Set());
  const afterPoolLen = wrap.children.length - 2;
  assert.equal(initialPoolLen, afterPoolLen);
  assert.equal(wrap.children[1], firstNode);
});

test('regression: shrinking dataset below current scrollTop does not infinite-loop', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData(makeRows(500), [], new Set());
  // User scrolled to row 200 (scrollTop = 200*26 = 5200).
  body.scrollTop = 200 * 26;
  // User then applies a filter that keeps only 30 rows. New dataset
  // has 30 items — drastically shorter than scrollTop implies.
  const tiny = makeRows(30);
  // This call MUST return quickly without entering an infinite loop.
  const start = Date.now();
  vs.setData(tiny, [], new Set());
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `setData took ${elapsed}ms — likely an infinite loop`);
  // Either the virtualizer clamped scrollTop, or the next render pass
  // should. Either way the visible pool should be at most viewport-sized.
  const wrap = body.firstChild;
  const visibleNodes = wrap.children.length - 2;
  assert.ok(visibleNodes >= 0 && visibleNodes <= 60, `pool size: ${visibleNodes}`);
});

test('regression: shrinking dataset must not leave an empty top spacer', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData(makeRows(500), [], new Set());
  body.scrollTop = 200 * 26;
  vs.setData(makeRows(30), [], new Set());
  // After the fix, the top spacer must reflect a valid position
  // (either 0 or a real data offset), not a giant blank.
  const wrap = body.firstChild;
  const topSpacer = wrap.children[0];
  const topH = parseInt(topSpacer.style.height, 10) || 0;
  // Should be at most (dataset_len - 1) * ROW_HEIGHT. If it equals
  // ~5000px the bug is back.
  assert.ok(topH < 30 * 26, `topSpacer is ${topH}px — empty space at top is back`);
});

test('regression: scroll event after shrink does not infinite-loop', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData(makeRows(500), [], new Set());
  vs.setData(makeRows(30), [], new Set());
  // Simulate the user attempting to scroll. The scroll handler must
  // be defensive about scrollTop values that exceed dataset size.
  body.scrollTop = 99999;
  const start = Date.now();
  body.dispatchEvent(new window.Event('scroll'));
  // Wait for rAF (synchronous via setTimeout 0 in our test setup).
  setTimeout(() => {
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `scroll handler took ${elapsed}ms`);
  }, 50);
});

test('updateVisibleRows mutates pool in place without rebuilding', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows = makeRows(500);
  vs.setData(rows, [], new Set());
  const wrap = body.firstChild;
  const poolLenBefore = wrap.children.length - 2;
  const firstPoolNode = wrap.children[1];
  vs.updateVisibleRows(rows.map((r, i) => ({ ...r, tick: i })), new Set());
  const poolLenAfter = wrap.children.length - 2;
  assert.equal(poolLenBefore, poolLenAfter);
  assert.equal(wrap.children[1], firstPoolNode);
});

test('rowMap reflects only currently visible rows', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData(makeRows(500), [], new Set());
  const rowMap = vs.getRowMap();
  assert.ok(rowMap.size < 60, `expected <60 entries, got ${rowMap.size}`);
  assert.ok(rowMap.size >= 30);
});

test('throws if build/update not provided', () => {
  const body = setupDom();
  assert.throws(
    () => ensureVirtualScreener(body),
    /opts\.build and opts\.update must be functions/
  );
});

test('empty dataset produces no pool rows but valid structure', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  vs.setData([], [], new Set());
  const wrap = body.firstChild;
  assert.equal(wrap.children.length, 2);
  assert.equal(vs.getRowMap().size, 0);
});

test('second ensureVirtualScreener call returns the cached instance', () => {
  const body = setupDom();
  const vs1 = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const vs2 = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  assert.equal(vs1, vs2);
});
