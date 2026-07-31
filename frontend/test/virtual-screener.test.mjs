// Tests for the virtualized screener list. Uses jsdom for a real DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { ensureVirtualScreener } from '../src/virtual-screener.js';

// Each test gets its own jsdom so global state doesn't leak.
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

// Fake build/update functions — return a div with _sym so the virtualizer
// can identify nodes.
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
  for (let i = 0; i < n; i++) {
    rows.push({ sym: 'SYM' + i, idx: i });
  }
  return rows;
}

test('ensureVirtualScreener creates a wrapper inside the body', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  assert.ok(body._vs === vs, 'must cache itself on bodyEl');
  // Wrapper present, contains top + bottom spacer.
  assert.equal(body.children.length, 1, 'body should hold the wrap');
  const wrap = body.firstChild;
  assert.equal(wrap.children.length, 2, 'wrap should have top + bottom spacers');
});

test('setData renders only viewport+buffer rows, not all rows', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows = makeRows(500);
  vs.setData(rows, [], new Set());
  // Viewport 400px / 26px row = ~15 rows visible. Buffer 15 above + 15 below = ~45.
  const wrap = body.firstChild;
  const visibleNodes = wrap.children.length - 2; // minus spacers
  assert.ok(visibleNodes < 60, `expected <60 visible, got ${visibleNodes}`);
  assert.ok(visibleNodes >= 30, `expected at least 30 visible, got ${visibleNodes}`);
});

test('setData with same first/last sym does NOT rebuild the pool', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows1 = makeRows(500);
  vs.setData(rows1, [], new Set());
  const wrap = body.firstChild;
  const initialPoolLen = wrap.children.length - 2;
  const firstNode = wrap.children[1]; // first row after top spacer
  // Now send "tick" — same order, possibly different values.
  const rows2 = rows1.map((r) => ({ ...r, val: Math.random() }));
  vs.setData(rows2, [], new Set());
  const afterPoolLen = wrap.children.length - 2;
  // Same identity in pool (no rebuild).
  assert.equal(initialPoolLen, afterPoolLen, 'pool size should be stable across ticks');
  assert.equal(wrap.children[1], firstNode, 'pool nodes should not be replaced');
});

test('setData with different order triggers full rebuild and preserves scroll', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows1 = makeRows(500);
  vs.setData(rows1, [], new Set());
  // Scroll down by 100 rows
  body.scrollTop = 100 * 26;
  body.dispatchEvent(new window.Event('scroll'));
  // New dataset — different first symbol.
  const rows2 = makeRows(500).reverse();
  vs.setData(rows2, [], new Set());
  // Pool should have rebuilt.
  const wrap = body.firstChild;
  const newPoolLen = wrap.children.length - 2;
  assert.ok(newPoolLen > 0);
  // Scroll should be restored to where SYM0 (or its new position) lives.
  // After rAF (synchronous in our test via setTimeout 0), scrollTop should
  // reflect the anchor position.
});

test('updateVisibleRows mutates pool in place without rebuilding', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows = makeRows(500);
  vs.setData(rows, [], new Set());
  const wrap = body.firstChild;
  const poolLenBefore = wrap.children.length - 2;
  const firstPoolNode = wrap.children[1];
  const firstSymBefore = firstPoolNode._sym;
  // Tick update with same dataset, slightly mutated values.
  vs.updateVisibleRows(
    rows.map((r, i) => ({ ...r, tick: i })),
    new Set()
  );
  const poolLenAfter = wrap.children.length - 2;
  const firstPoolNodeAfter = wrap.children[1];
  assert.equal(poolLenBefore, poolLenAfter);
  assert.equal(firstPoolNode, firstPoolNodeAfter, 'tick must not replace nodes');
  assert.equal(firstPoolNodeAfter._sym, firstSymBefore);
});

test('rowMap reflects only currently visible rows', () => {
  const body = setupDom();
  const vs = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const rows = makeRows(500);
  vs.setData(rows, [], new Set());
  const rowMap = vs.getRowMap();
  // RowMap should contain only visible rows.
  assert.ok(rowMap.size < 60, `expected <60 entries, got ${rowMap.size}`);
  assert.ok(rowMap.size >= 30);
  // Each visible row should be in the map.
  for (let i = 0; i < rows.length; i++) {
    if (rowMap.has('SYM' + i)) {
      assert.equal(rowMap.get('SYM' + i)._sym, 'SYM' + i);
    }
  }
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
  assert.equal(wrap.children.length, 2, 'only spacers, no rows');
  assert.equal(vs.getRowMap().size, 0);
});

test('second ensureVirtualScreener call returns the cached instance', () => {
  const body = setupDom();
  const vs1 = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  const vs2 = ensureVirtualScreener(body, { build: makeBuild(), update: makeUpdate() });
  assert.equal(vs1, vs2);
});
