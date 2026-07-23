import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;

const uiMod = await import('../src/gridLab-ui.js');
const { renderGridLabModal } = uiMod;

const deps = {
  S: {
    fsSym: 'ETHUSDT',
    charts: [{ sym: 'ETHUSDT' }, { sym: 'BTCUSDT' }],
    syms: ['ETHUSDT', 'BTCUSDT'],
    gridLabPrefs: {
      global: { tf: '15m', levels: 12 },
      symbolBounds: {},
    },
  },
  fn: () => '',
  fk: () => '',
  scheduleGridLabSync: () => {},
  applyGbRatioGrid: () => {},
  gridLabBoundsUndo: () => console.log('undo called'),
  gridLabBoundsRedo: () => console.log('redo called'),
  openFullscreenBySym: () => {},
};
renderGridLabModal('BTCUSDT', deps);

// Check what's in body
const body = document.querySelector('#gridLabBody');
console.log('Body children:', body.innerHTML.length, 'chars');
console.log('Has #gbChartWrap?', !!body.querySelector('#gbChartWrap'));
console.log('Has #gbChart?', !!body.querySelector('#gbChart'));

// Active element
console.log('Active element:', document.activeElement?.tagName);

// Try dispatching Ctrl+Z
const ev = new dom.window.KeyboardEvent('keydown', {
  key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
});
const dispatched = document.dispatchEvent(ev);
console.log('Dispatched. defaultPrevented?', ev.defaultPrevented);

// Now switch tab and check
document.querySelector('#gridTabSelector').click();
const body2 = document.querySelector('#gridLabBody');
console.log('After tab switch, body HTML:', body2.innerHTML.slice(0, 200));
console.log('Selector rows:', body2.querySelectorAll('.gb-selector-row').length);
