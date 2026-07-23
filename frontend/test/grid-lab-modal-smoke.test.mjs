// Smoke tests for renderGridLabModal — verifies the modal opens, renders,
// tabs work, cleanup runs, and DOM event handlers are properly wired.
// Uses jsdom for a real DOM (since renderGridLabModal touches document).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up DOM globals BEFORE importing the module under test.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.CustomEvent = dom.window.CustomEvent;

// Now we can import the module under test.
const uiMod = await import('../src/gridLab-ui.js');
const {
  renderGridLabModal,
} = uiMod;

// ─── Test fixtures ──────────────────────────────────────────────────────────

function makeDeps(overrides = {}) {
  const calls = { schedule: [], applyRatio: [], undo: [], redo: [], open: [] };
  return {
    S: {
      fsSym: 'ETHUSDT',
      charts: [{ sym: 'ETHUSDT' }, { sym: 'BTCUSDT' }],
      syms: ['ETHUSDT', 'BTCUSDT'],
      gridLabPrefs: {
        global: { tf: '15m', levels: 12, leverage: 3, deposit: 1000,
          ratioLong: 3, ratioShort: 1, ratioStepPct: 0.6, gridMode: 'neutral' },
        symbolBounds: {},
      },
      ...overrides.S,
    },
    fn: (v, d = 0) => {
      if (v == null) return '—';
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(d) : String(v);
    },
    fk: (v) => v == null ? '—' : String(Math.round(Number(v))),
    scheduleGridLabSync: (body, prefs, opts) => calls.schedule.push({ body, opts }),
    applyGbRatioGrid: (body) => calls.applyRatio.push(body),
    gridLabBoundsUndo: (body, prefs) => calls.undo.push(body),
    gridLabBoundsRedo: (body, prefs) => calls.redo.push(body),
    openFullscreenBySym: (sym) => calls.open.push(sym),
    // Default selector: returns 3 sample rows so tab renders visibly
    getGridSelectorRows: (syms, mx, calcScore) => [
      { sym: 'ETHUSDT', score: 0.85, range24: 5.2, natr: 0.12, ch24: 1.5, vol24: 1e8, trd24: 50000 },
      { sym: 'BTCUSDT', score: 0.72, range24: 3.8, natr: 0.08, ch24: -0.4, vol24: 5e9, trd24: 200000 },
      { sym: 'SOLUSDT', score: 0.61, range24: 7.1, natr: 0.18, ch24: 2.3, vol24: 3e8, trd24: 80000 },
    ],
    ...overrides,
    _calls: calls,
  };
}

function clearDom() {
  document.body.innerHTML = '';
  // Remove all document-level listeners by replacing body
  const newBody = document.createElement('body');
  document.documentElement.replaceChild(newBody, document.body);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('smoke: modal opens with two tabs and closes via button', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);

  const modal = document.getElementById('gridLabModal');
  assert.ok(modal, 'modal element should exist');
  assert.equal(modal.style.position, 'fixed');
  assert.equal(modal.style.zIndex, '820');

  // Tabs
  const btnBt = modal.querySelector('#gridTabBacktest');
  const btnSel = modal.querySelector('#gridTabSelector');
  const btnClose = modal.querySelector('#gridCloseBtn');
  assert.ok(btnBt && btnSel && btnClose, 'all 3 buttons present');

  // Default tab is backtest → btnBt has 'on' class
  assert.ok(btnBt.classList.contains('on'), 'backtest tab active by default');
  assert.ok(!btnSel.classList.contains('on'));

  // Backtest inputs present
  for (const id of ['gbSym', 'gbTf', 'gbLevels', 'gbLow', 'gbHigh', 'gbOut', 'gbChart']) {
    assert.ok(modal.querySelector('#' + id), `missing #${id}`);
  }

  // scheduleGridLabSync called on default tab (immediate:true)
  assert.equal(deps._calls.schedule.length, 1);
  assert.deepEqual(deps._calls.schedule[0].opts, { immediate: true });

  // Close
  btnClose.click();
  assert.equal(document.getElementById('gridLabModal'), null, 'modal removed');
});

test('smoke: switching tabs toggles active class and re-renders body', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);

  const btnSel = document.getElementById('gridLabModal').querySelector('#gridTabSelector');
  const btnBt = document.getElementById('gridLabModal').querySelector('#gridTabBacktest');

  btnSel.click();
  assert.ok(btnSel.classList.contains('on'));
  assert.ok(!btnBt.classList.contains('on'));

  // Selector tab renders rows
  const rows = document.querySelectorAll('.gb-selector-row');
  assert.ok(rows.length > 0, 'selector rows rendered');

  // Switch back
  btnBt.click();
  assert.ok(btnBt.classList.contains('on'));
  assert.ok(!btnSel.classList.contains('on'));
  // Now scheduleFn should have been called again (immediate)
  assert.ok(deps._calls.schedule.length >= 2);
});

test('smoke: pre-fills symbol from defSymOpt argument', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('SOLUSDT', deps);
  const symInput = document.querySelector('#gbSym');
  assert.ok(symInput, 'gbSym input present');
  assert.equal(symInput.value, 'SOLUSDT');
});

test('smoke: pre-fills symbol from S.fsSym when defSymOpt omitted', () => {
  clearDom();
  const deps = makeDeps({ S: { fsSym: 'AVAXUSDT', charts: [], syms: ['AVAXUSDT'] } });
  renderGridLabModal(undefined, deps);
  const symInput = document.querySelector('#gbSym');
  assert.equal(symInput.value, 'AVAXUSDT');
});

test('smoke: keydown Ctrl+Z triggers undo on backtest tab', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);

  // Confirm modal in DOM
  assert.ok(document.getElementById('gridLabModal'), 'modal exists before keydown');

  // Simulate Ctrl+Z
  const ev = new dom.window.KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
  });
  const dispatched = document.dispatchEvent(ev);
  console.log('  [debug] dispatched=', dispatched, 'defaultPrevented=', ev.defaultPrevented);
  console.log('  [debug] activeElement=', document.activeElement?.tagName, document.activeElement?.id);
  const body = document.querySelector('#gridLabBody');
  console.log('  [debug] body has #gbChartWrap?', !!body?.querySelector('#gbChartWrap'));

  assert.equal(deps._calls.undo.length, 1, `undoFn called (got ${deps._calls.undo.length})`);
  assert.equal(deps._calls.redo.length, 0);

  // Ctrl+Shift+Z → redo
  const ev2 = new dom.window.KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
  });
  document.dispatchEvent(ev2);
  assert.equal(deps._calls.redo.length, 1);
});

test('smoke: clicking outside modal (on overlay) closes it', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);
  const modal = document.getElementById('gridLabModal');
  assert.ok(modal);

  // Simulate mousedown on the overlay itself (not on inner box)
  const ev = new dom.window.MouseEvent('mousedown', { bubbles: true });
  Object.defineProperty(ev, 'target', { value: modal });
  modal.dispatchEvent(ev);

  assert.equal(document.getElementById('gridLabModal'), null);
});

test('smoke: clicking inside modal does NOT close it', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);
  const modal = document.getElementById('gridLabModal');
  const innerBox = modal.firstChild; // the box div

  const ev = new dom.window.MouseEvent('mousedown', { bubbles: true });
  Object.defineProperty(ev, 'target', { value: innerBox });
  modal.dispatchEvent(ev);

  assert.ok(document.getElementById('gridLabModal'), 'modal still open');
});

test('smoke: re-opening replaces old modal cleanly', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);
  const first = document.getElementById('gridLabModal');
  const firstBody = first.querySelector('#gridLabBody');

  renderGridLabModal('ETHUSDT', deps);
  const second = document.getElementById('gridLabModal');
  assert.notEqual(second, first, 'old modal replaced');
  // Old body should be detached (not in DOM anymore)
  assert.equal(firstBody.isConnected, false, 'old body detached');
  assert.equal(document.querySelectorAll('#gridLabModal').length, 1);
});

test('smoke: selector row click triggers openFullscreenBySym', () => {
  clearDom();
  const deps = makeDeps();
  renderGridLabModal('BTCUSDT', deps);

  // Switch to selector tab
  document.querySelector('#gridTabSelector').click();

  // Click first row
  const row = document.querySelector('.gb-selector-row');
  assert.ok(row, 'selector row exists');
  row.click();

  assert.equal(deps._calls.open.length, 1, 'openFullscreenBySym called');
  assert.equal(deps._calls.open[0], row.dataset.sym);
});
