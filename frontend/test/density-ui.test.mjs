import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

const {
  TIER_STYLE,
  computeZonesForChart,
  fetchOrderBook,
  prefetchAllOrderBooks,
  drawZonesUi,
  renderSettingsDensityUi,
  toggleDensityUi,
  setDensityVisibleUi,
  setDensityMultUi,
  resetDensitySettingsUi,
} = await import('../src/density-ui.js');

const makeS = (opts = {}) => ({
  densitySettings: {},
  showDensity: false,
  charts: [],
  fsCharts: [],
  fsSym: null,
  _obCache: {},
  _obPending: 0,
  _obQueue: [],
  consoleWarn: () => {},
  ...opts,
});

const sampleChart = (sym, candles) => ({
  sym,
  candles,
  cs: { priceToCoordinate: () => 100 },
  lc: { timeScale: () => ({ timeToCoordinate: () => 200 }) },
});

const tbtnHtml = (id, label, fn, on) =>
  `<button id="${id}" class="tbtn${on ? ' on' : ''}" onclick="${fn}">${label}</button>`;

// ─── TIER_STYLE ─────────────────────────────────────────────────
test('TIER_STYLE: all three tiers defined', () => {
  for (const t of ['large', 'medium', 'small']) {
    assert.ok(TIER_STYLE[t]);
    assert.equal(typeof TIER_STYLE[t].color, 'string');
    assert.equal(typeof TIER_STYLE[t].alpha, 'number');
    assert.equal(typeof TIER_STYLE[t].lineWidth, 'number');
    assert.ok(Array.isArray(TIER_STYLE[t].dash));
  }
  assert.equal(TIER_STYLE.large.color, '#e04040');
  assert.equal(TIER_STYLE.small.dash.length, 2); // [3, 4]
});

// ─── computeZonesForChart ───────────────────────────────────────
test('computeZonesForChart: no sym → []', () => {
  const ch = sampleChart(null, [{ c: 100 }]);
  const S = makeS();
  const out = computeZonesForChart(ch, { S, fetchJSON: async () => ({}) });
  assert.deepEqual(out, []);
});

test('computeZonesForChart: no order book cached → []', () => {
  const ch = sampleChart('BTCUSDT', [{ c: 100 }]);
  const S = makeS();
  const out = computeZonesForChart(ch, { S, fetchJSON: async () => ({}), _densityFirstSeen: new Map() });
  assert.deepEqual(out, []);
});

test('computeZonesForChart: uses cached OB if present', () => {
  const ch = sampleChart('BTCUSDT', [{ c: 1000 }]);
  const S = makeS({
    _obCache: { BTCUSDT: { bids: [[1000, 1e9]], asks: [[1000, 1e9]], ts: Date.now() } },
  });
  const firstSeen = new Map();
  const out = computeZonesForChart(ch, { S, fetchJSON: async () => ({}), _densityFirstSeen: firstSeen });
  // Only 2 levels so should return [] (too few)
  assert.deepEqual(out, []);
});

// ─── fetchOrderBook ─────────────────────────────────────────────
test('fetchOrderBook: caches result and invalidates density cache', async () => {
  const S = makeS();
  const densityCache = new Map();
  densityCache.set('BTCUSDT', { ts: 1, zones: [{ price: 100 }] });
  const fetchJSON = async (url) => ({
    bids: [[100, 1], [101, 1]], asks: [[102, 1], [103, 1]],
  });
  await fetchOrderBook('BTCUSDT', { S, fetchJSON, API: 'https://example.com', densityCache, rCanvas: () => {} });
  assert.ok(S._obCache.BTCUSDT);
  assert.equal(S._obCache.BTCUSDT.bids.length, 2);
  assert.equal(S._obCache.BTCUSDT.asks.length, 2);
  assert.ok(!densityCache.has('BTCUSDT'));
});

test('fetchOrderBook: handles fetch failure silently', async () => {
  const S = makeS();
  const fetchJSON = async () => { throw new Error('network'); };
  // Should not throw
  await fetchOrderBook('BTCUSDT', { S, fetchJSON, API: 'https://x', densityCache: new Map(), rCanvas: () => {} });
});

// ─── prefetchAllOrderBooks ──────────────────────────────────────
test('prefetchAllOrderBooks: triggers fetch for every visible chart', async () => {
  const S = makeS({
    charts: [sampleChart('BTCUSDT', []), sampleChart('ETHUSDT', [])],
    fsCharts: [sampleChart('SOLUSDT', [])],
    fsSym: null,
  });
  const fetched = [];
  const fetchJSON = async (url) => { fetched.push(url); return { bids: [], asks: [] }; };
  prefetchAllOrderBooks({ S, fetchJSON, API: 'https://x', densityCache: new Map(), rCanvas: () => {} });
  // Wait one microtask for promises
  await new Promise(r => setTimeout(r, 50));
  // Should have triggered fetches (note: rsCache not pre-populated so they will all trigger)
  assert.ok(fetched.length >= 1);
});

// ─── drawZonesUi ────────────────────────────────────────────────
test('drawZonesUi: no-op without sym', () => {
  const ch = sampleChart(null, []);
  const calls = [];
  const ctx = {
    save: () => calls.push('save'), restore: () => calls.push('restore'),
  };
  drawZonesUi(ctx, ch, 800, 400, { S: makeS(), fmtPrice: (v) => String(v), fk: (v) => String(v), rCanvas: () => {}, timeToCoordX: () => 100 });
  assert.deepEqual(calls, []);
});

test('drawZonesUi: skips when showDensity is false', () => {
  const S = makeS({ showDensity: false });
  const ch = sampleChart('BTCUSDT', [{ c: 100 }]);
  const calls = [];
  const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore') };
  drawZonesUi(ctx, ch, 800, 400, { S, fmtPrice: (v) => String(v), fk: (v) => String(v), rCanvas: () => {}, timeToCoordX: () => 100 });
  assert.deepEqual(calls, []);
});

test('drawZonesUi: does not crash on missing chart series', () => {
  const S = makeS({ showDensity: true });
  const ch = sampleChart('BTCUSDT', [{ c: 100 }]);
  S._obCache.BTCUSDT = { bids: [], asks: [], ts: Date.now() };
  // Empty OB → empty zones → early return, no ctx calls expected.
  const calls = [];
  const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore') };
  // Should not throw
  drawZonesUi(ctx, ch, 800, 400, { S, fmtPrice: (v) => String(v), fk: (v) => String(v), rCanvas: () => {}, timeToCoordX: () => 100 });
  assert.deepEqual(calls, []);
});

// ─── renderSettingsDensityUi ────────────────────────────────────
test('renderSettingsDensityUi: shows symbol threshold controls', () => {
  document.body.innerHTML = '<div id="smodal-body"></div>';
  const S = makeS({
    fsSym: 'BTCUSDT',
    densitySettings: { BTCUSDT: { largeMult: 4, medMult: 2.5, smallMult: 1.8 } },
  });
  renderSettingsDensityUi(document.getElementById('smodal-body'), { S, tbtnHtml });
  const body = document.getElementById('smodal-body');
  assert.equal(body.dataset.densitySym, 'BTCUSDT');
  assert.ok(body.querySelector('#dLarge'));
  assert.ok(body.querySelector('#dMed'));
  assert.ok(body.querySelector('#dSmall'));
  assert.equal(body.querySelector('#dLarge').value, '4');
  assert.equal(body.querySelector('#dMed').value, '2.5');
  assert.equal(body.querySelector('#dSmall').value, '1.8');
});

test('renderSettingsDensityUi: shows empty-state hint when no sym', () => {
  document.body.innerHTML = '<div id="smodal-body"></div>';
  const S = makeS();
  renderSettingsDensityUi(document.getElementById('smodal-body'), { S, tbtnHtml });
  const body = document.getElementById('smodal-body');
  assert.match(body.innerHTML, /Откройте монету/);
});

test('renderSettingsDensityUi: highlights correct density toggle', () => {
  document.body.innerHTML = '<div id="smodal-body"></div>';
  const S = makeS({ fsSym: 'BTCUSDT', showDensity: true });
  renderSettingsDensityUi(document.getElementById('smodal-body'), { S, tbtnHtml });
  const onBtn = document.getElementById('dOn');
  const offBtn = document.getElementById('dOff');
  assert.match(onBtn.className, /on/);
  assert.doesNotMatch(offBtn.className, /on/);
});

// ─── toggleDensityUi ────────────────────────────────────────────
test('toggleDensityUi: flips showDensity', () => {
  document.body.innerHTML = '<button id="densityBtn"></button>';
  const S = makeS({ showDensity: false });
  let rendered = 0;
  toggleDensityUi({ S, rCanvas: () => {}, renderSettingsDensity: () => rendered++ });
  assert.equal(S.showDensity, true);
  assert.match(document.getElementById('densityBtn').className, /on/);
  assert.equal(rendered, 1);
});

test('toggleDensityUi: prefetches order books when enabling', async () => {
  document.body.innerHTML = '<button id="densityBtn"></button>';
  const S = makeS({ showDensity: false });
  S.charts = [sampleChart('BTCUSDT', [])];
  S.fsCharts = [];
  let fetchCalls = 0;
  const fetchJSON = async () => { fetchCalls++; return { bids: [], asks: [] }; };
  toggleDensityUi({ S, rCanvas: () => {}, renderSettingsDensity: () => {}, fetchJSON, API: 'https://x' });
  await new Promise(r => setTimeout(r, 30));
  assert.ok(fetchCalls >= 1);
});

// ─── setDensityVisibleUi ────────────────────────────────────────
test('setDensityVisibleUi: forces the value', () => {
  document.body.innerHTML = '<button id="densityBtn"></button>';
  const S = makeS({ showDensity: true });
  setDensityVisibleUi(false, { S, rCanvas: () => {}, renderSettingsDensity: () => {} });
  assert.equal(S.showDensity, false);
  assert.doesNotMatch(document.getElementById('densityBtn').className, /on/);
});

test('setDensityVisibleUi: no-op without button element', () => {
  document.body.innerHTML = '';
  const S = makeS();
  setDensityVisibleUi(true, { S, rCanvas: () => {}, renderSettingsDensity: () => {} });
  assert.equal(S.showDensity, true);
});

// ─── setDensityMultUi ───────────────────────────────────────────
test('setDensityMultUi: updates setting and invalidates cache', () => {
  const S = makeS({ densitySettings: { BTCUSDT: { largeMult: 3.5, medMult: 2.2, smallMult: 1.5 } } });
  const densityCache = new Map();
  densityCache.set('BTCUSDT', { ts: 1, zones: [] });
  setDensityMultUi('BTCUSDT', 'largeMult', 5.5, {
    S, rCanvas: () => {},
    setDensityThreshold: (store, sym, key, val) => {
      const v = parseFloat(val);
      if (isNaN(v) || v < 0.1) return false;
      store[sym][key] = v;
      return true;
    },
    densityCache,
  });
  assert.equal(S.densitySettings.BTCUSDT.largeMult, 5.5);
  assert.ok(!densityCache.has('BTCUSDT'));
});

test('setDensityMultUi: rejects invalid values', () => {
  const S = makeS({ densitySettings: {} });
  setDensityMultUi('BTCUSDT', 'largeMult', NaN, {
    S, rCanvas: () => {},
    setDensityThreshold: (store, sym, key, val) => {
      const v = parseFloat(val);
      if (isNaN(v) || v < 0.1) return false;
      store[sym] = store[sym] || { largeMult: 3.5, medMult: 2.2, smallMult: 1.5 };
      store[sym][key] = v;
      return true;
    },
  });
  assert.equal(S.densitySettings.BTCUSDT, undefined);
});

test('setDensityMultUi: triggers rCanvas only for matching sym charts', () => {
  const S = makeS();
  let canvasCalls = [];
  S.charts = [sampleChart('BTCUSDT', []), sampleChart('ETHUSDT', [])];
  S.fsSym = null;
  setDensityMultUi('BTCUSDT', 'largeMult', 4.0, {
    S, rCanvas: (ch) => canvasCalls.push(ch.sym),
    setDensityThreshold: (store, sym, key, val) => {
      store[sym] = store[sym] || { largeMult: 3.5, medMult: 2.2, smallMult: 1.5 };
      store[sym][key] = parseFloat(val);
      return true;
    },
  });
  assert.deepEqual(canvasCalls, ['BTCUSDT']);
});

// ─── resetDensitySettingsUi ─────────────────────────────────────
test('resetDensitySettingsUi: restores defaults and invalidates cache', () => {
  const S = makeS({ densitySettings: { BTCUSDT: { largeMult: 99, medMult: 99, smallMult: 99 } } });
  const densityCache = new Map();
  densityCache.set('BTCUSDT', { ts: 1, zones: [] });
  let rendered = 0;
  resetDensitySettingsUi('BTCUSDT', {
    S, rCanvas: () => {},
    resetDensitySettings: (store, sym) => { store[sym] = { largeMult: 3.5, medMult: 2.2, smallMult: 1.5 }; },
    renderSettingsDensity: () => rendered++,
    densityCache,
  });
  assert.equal(S.densitySettings.BTCUSDT.largeMult, 3.5);
  assert.ok(!densityCache.has('BTCUSDT'));
  assert.equal(rendered, 1);
});

test('resetDensitySettingsUi: creates entry for sym if missing', () => {
  const S = makeS({ densitySettings: { BTCUSDT: { largeMult: 99, medMult: 99, smallMult: 99 } } });
  resetDensitySettingsUi('ETHUSDT', {
    S, rCanvas: () => {},
    resetDensitySettings: (store, sym) => { store[sym] = { largeMult: 3.5, medMult: 2.2, smallMult: 1.5 }; },
  });
  // BTCUSDT untouched
  assert.equal(S.densitySettings.BTCUSDT.largeMult, 99);
  // ETHUSDT now has defaults
  assert.equal(S.densitySettings.ETHUSDT.largeMult, 3.5);
});
