import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

const S = {
  emaVisible: false, emaSymEnabled: {}, emaCrossSound: true,
  emaSettings: [
    { period: 9, color: '#f97316', visible: true },
    { period: 21, color: '#3b82f6', visible: true },
  ],
  emaAlertPairs: [], emaSymOverrides: {},
  charts: [{ sym: 'BTCUSDT' }], fsCharts: [], fsSym: null,
};

console.log('1. importing...');
const ui = await import('../src/emaEditor-ui.js');
console.log('2. imported, refreshEmaButtonState:', typeof ui.refreshEmaButtonState);

document.body.innerHTML = '<button id="emaBtn"></button>';
ui.refreshEmaButtonState({ S });
console.log('3. emaBtn:', document.getElementById('emaBtn')?.className);

console.log('4. opening modal...');
ui.openEmaEditorModal('auto', { S, rCanvas: () => {}, clearEmaCache: () => {} });
console.log('5. modal:', !!document.getElementById('emaEditorModal'));

console.log('DONE');
process.exit(0);
