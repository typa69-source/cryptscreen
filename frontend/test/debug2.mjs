import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;

const { renderGridLabModal } = await import('../src/gridLab-ui.js');
const calls = { schedule: [], undo: [], redo: [], open: [] };
const deps = {
  S: {
    fsSym: 'ETHUSDT',
    charts: [{ sym: 'ETHUSDT' }],
    syms: ['ETHUSDT'],
    gridLabPrefs: {
      global: { tf: '15m', levels: 12 },
      symbolBounds: {},
    },
  },
  fn: () => '',
  fk: () => '',
  scheduleGridLabSync: () => calls.schedule.push(1),
  applyGbRatioGrid: () => {},
  gridLabBoundsUndo: () => { calls.undo.push(1); console.log('UNDO called'); },
  gridLabBoundsRedo: () => calls.redo.push(1),
  openFullscreenBySym: () => {},
};
renderGridLabModal('BTCUSDT', deps);
console.log('Active element after modal open:', document.activeElement?.tagName);
const body = document.querySelector('#gridLabBody');
console.log('Has #gbChartWrap?', !!body?.querySelector('#gbChartWrap'));

const ev = new dom.window.KeyboardEvent('keydown', {
  key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
});
const r = document.dispatchEvent(ev);
console.log('Dispatch result:', r, 'defaultPrevented?', ev.defaultPrevented);
console.log('Undo calls:', calls.undo.length);

// Try Ctrl+Shift+Z
const ev2 = new dom.window.KeyboardEvent('keydown', {
  key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
});
document.dispatchEvent(ev2);
console.log('Redo calls:', calls.redo.length);
