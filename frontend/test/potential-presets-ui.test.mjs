import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Set up jsdom globals BEFORE importing the UI module
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;

const {
  togglePotentialPanelUi,
  renderPotentialPanelUi,
  openPotPresetEditorUi,
  togglePotPresetUi,
  deletePotPresetUi,
  addBuiltinSqueezePresetUi,
  clearPotentialMatchesUi,
  updatePotBadgeUi,
} = await import('../src/potentialPresets-ui.js');

const makeS = (presetCount = 1) => ({
  potentialPresets: Array.from({ length: presetCount }, (_, i) => ({
    id: `p${i}`,
    name: `Preset ${i}`,
    conditions: [{ field: 'ch24', min: 1, max: null }],
    matches: {},
    alerted: {},
    enabled: true,
    cooldown: 60,
  })),
  mx: { BTCUSDT: { ch24: 5, price: 100 } },
});

const makeDeps = (overrides = {}) => ({
  S: makeS(),
  activeTabRef: { current: null },
  setActiveTab: () => {},
  openPotPresetEditorUi: () => {},
  addBuiltinSqueezePreset: () => {},
  togglePotPresetUi: () => {},
  deletePotPresetUi: () => {},
  openFullscreenBySym: () => {},
  fmt: { fn: (v, d) => Number(v).toFixed(d), fk: (v) => String(v), fmtPrice: (v) => String(v) },
  groupColors: [],
  getSymGroup: () => 0,
  ...overrides,
});

// ─── togglePotentialPanelUi ─────────────────────────────────────
test('togglePotentialPanelUi: shows panel when hidden', () => {
  document.body.innerHTML = '<div id="potentialPanel" style="display:none"></div><button id="potBtn"></button>';
  const renderCalled = { v: 0 };
  togglePotentialPanelUi({
    S: makeS(),
    renderPotentialPanel: () => { renderCalled.v++; },
  });
  assert.equal(document.getElementById('potentialPanel').style.display, 'flex');
  assert.match(document.getElementById('potBtn').className, /on/);
  assert.equal(renderCalled.v, 1);
});

test('togglePotentialPanelUi: hides panel when visible', () => {
  document.body.innerHTML = '<div id="potentialPanel" style="display:flex"></div><button id="potBtn" class="on"></button>';
  togglePotentialPanelUi({
    S: makeS(),
    renderPotentialPanel: () => {},
  });
  assert.equal(document.getElementById('potentialPanel').style.display, 'none');
  assert.doesNotMatch(document.getElementById('potBtn').className, /on/);
});

test('togglePotentialPanelUi: tolerates missing elements', () => {
  document.body.innerHTML = '';
  // Should not throw
  togglePotentialPanelUi({ S: makeS(), renderPotentialPanel: () => {} });
});

// ─── renderPotentialPanelUi ─────────────────────────────────────
test('renderPotentialPanelUi: creates tab bar when missing', () => {
  document.body.innerHTML = `
    <div id="potentialPanel">
      <div class="pot-hdr">Header</div>
    </div>`;
  const deps = makeDeps();
  deps.S.potentialPresets[0].matches = { BTCUSDT: { ts: 1, price: 100, ch24: 5 } };
  renderPotentialPanelUi(deps);
  const panel = document.getElementById('potentialPanel');
  assert.ok(panel.querySelector('.pot-tab-bar'));
  assert.ok(panel.querySelector('.pot-body'));
});

test('renderPotentialPanelUi: shows empty state when no presets', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const deps = makeDeps({ S: { potentialPresets: [], mx: {} } });
  renderPotentialPanelUi(deps);
  const body = document.querySelector('.pot-body');
  assert.match(body.innerHTML, /Нажми/);
});

test('renderPotentialPanelUi: tab click switches active tab', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  const setActive = (v) => { tabRef.current = v; };
  const deps = makeDeps({ activeTabRef: tabRef, setActiveTab: setActive });
  deps.S.potentialPresets.push({ id: 'p1', name: 'Other', conditions: [], matches: {}, alerted: {}, enabled: true, cooldown: 60 });
  renderPotentialPanelUi(deps);
  const tabs = document.querySelectorAll('.pot-tab');
  // Two preset tabs + Squeeze + Add = 4
  assert.equal(tabs.length, 4);
  tabs[1].click();
  assert.equal(tabRef.current, 'p1');
});

test('renderPotentialPanelUi: right-click opens editor for that preset', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  let openedWith = null;
  const deps = makeDeps({ openPotPresetEditorUi: (id) => { openedWith = id; } });
  renderPotentialPanelUi(deps);
  const tab = document.querySelector('.pot-tab');
  const ev = new dom.window.MouseEvent('contextmenu', { bubbles: true });
  tab.dispatchEvent(ev);
  assert.equal(openedWith, 'p0');
});

test('renderPotentialPanelUi: Squeeze button calls addBuiltinSqueezePreset', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  let called = 0;
  const deps = makeDeps({ addBuiltinSqueezePreset: () => called++ });
  renderPotentialPanelUi(deps);
  document.querySelectorAll('.pot-tab')[1].click(); // Squeeze button
  assert.equal(called, 1);
});

test('renderPotentialPanelUi: Add button opens editor with null', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  let openedWith = 'unset';
  const deps = makeDeps({ openPotPresetEditorUi: (id) => { openedWith = id; } });
  renderPotentialPanelUi(deps);
  const tabs = document.querySelectorAll('.pot-tab');
  tabs[tabs.length - 1].click(); // last tab = Add
  assert.equal(openedWith, null);
});

test('renderPotentialPanelUi: empty state when no active tab', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const deps = makeDeps();
  // activeTabRef.current is null, no preset matches
  renderPotentialPanelUi(deps);
  const body = document.querySelector('.pot-body');
  assert.match(body.innerHTML, /Нажми ＋/);
});

test('renderPotentialPanelUi: shows match list with enabled preset', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  const deps = makeDeps({ activeTabRef: tabRef, setActiveTab: () => {} });
  deps.S.potentialPresets[0].matches = { BTCUSDT: { ts: 1, price: 100, ch24: 5, emaTouch: { 20: 1 } } };
  renderPotentialPanelUi(deps);
  const items = document.querySelectorAll('.pot-item');
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, /BTC/);
});

test('renderPotentialPanelUi: shows "monitoring off" when disabled', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  const deps = makeDeps({ activeTabRef: tabRef, setActiveTab: () => {} });
  deps.S.potentialPresets[0].enabled = false;
  renderPotentialPanelUi(deps);
  const body = document.querySelector('.pot-body');
  assert.match(body.innerHTML, /Мониторинг выключен/);
});

test('renderPotentialPanelUi: shows "no matches" when enabled but empty', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  const deps = makeDeps({ activeTabRef: tabRef, setActiveTab: () => {} });
  renderPotentialPanelUi(deps);
  const body = document.querySelector('.pot-body');
  assert.match(body.innerHTML, /Совпадений нет/);
});

test('renderPotentialPanelUi: ctrl buttons call correct handlers', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  let toggled = false, edited = false, deleted = false;
  const deps = makeDeps({
    activeTabRef: tabRef,
    setActiveTab: () => {},
    togglePotPresetUi: () => { toggled = true; },
    openPotPresetEditorUi: () => { edited = true; },
    deletePotPresetUi: () => { deleted = true; },
  });
  renderPotentialPanelUi(deps);
  document.querySelector('[data-act="toggle"]').click();
  document.querySelector('[data-act="edit"]').click();
  document.querySelector('[data-act="delete"]').click();
  assert.equal(toggled, true);
  assert.equal(edited, true);
  assert.equal(deleted, true);
});

test('renderPotentialPanelUi: click on match item opens fullscreen', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  let openedSym = null;
  const deps = makeDeps({
    activeTabRef: tabRef,
    setActiveTab: () => {},
    openFullscreenBySym: (sym) => { openedSym = sym; },
  });
  deps.S.potentialPresets[0].matches = { BTCUSDT: { ts: 1, price: 100, ch24: 5, emaTouch: {} } };
  renderPotentialPanelUi(deps);
  document.querySelector('.pot-item').click();
  assert.equal(openedSym, 'BTCUSDT');
});

test('renderPotentialPanelUi: renderPotentialPanel handler called on tab click', () => {
  document.body.innerHTML = '<div id="potentialPanel"><div class="pot-hdr"></div></div>';
  const tabRef = { current: 'p0' };
  let newTab = null;
  const deps = makeDeps({
    activeTabRef: tabRef,
    setActiveTab: (v) => { newTab = v; tabRef.current = v; },
    renderPotentialPanel: () => {},
  });
  renderPotentialPanelUi(deps);
  // Clicking a preset tab should update the active tab ref via setActiveTab
  // (re-render happens via renderPotentialPanelUi itself, not the renderPotentialPanel callback).
  document.querySelector('.pot-tab').click();
  assert.equal(newTab, 'p0');
  assert.equal(tabRef.current, 'p0');
});

// ─── openPotPresetEditorUi ──────────────────────────────────────
test('openPotPresetEditorUi: creates modal for new preset', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  const setActive = () => {};
  const deps = {
    S, setActiveTab: setActive,
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  const modal = document.getElementById('potPresetModal');
  assert.ok(modal);
  assert.match(modal.textContent, /Новый пресет/);
  // Modal should have name input, add condition button, save button
  assert.ok(modal.querySelector('#potPresetName'));
  assert.ok(modal.querySelector('#potAddCond'));
  assert.ok(modal.querySelector('#potSaveBtn'));
});

test('openPotPresetEditorUi: title shows "Редактировать" for existing preset', () => {
  document.body.innerHTML = '';
  const S = makeS(1);
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi('p0', deps);
  const modal = document.getElementById('potPresetModal');
  assert.match(modal.textContent, /Редактировать/);
  // Existing preset has delete + toggle buttons
  assert.ok(modal.querySelector('#potDeleteBtn'));
  assert.ok(modal.querySelector('#potToggleBtn'));
});

test('openPotPresetEditorUi: save new preset pushes to S.potentialPresets', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  let activeTabId = null;
  const deps = {
    S, setActiveTab: (id) => { activeTabId = id; },
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  const modal = document.getElementById('potPresetModal');
  modal.querySelector('#potPresetName').value = 'My new preset';
  modal.querySelector('#potSaveBtn').click();
  assert.equal(S.potentialPresets.length, 1);
  assert.equal(S.potentialPresets[0].name, 'My new preset');
  assert.equal(activeTabId, S.potentialPresets[0].id);
  assert.equal(document.getElementById('potPresetModal'), null); // modal removed
});

test('openPotPresetEditorUi: save updates existing preset in place', () => {
  document.body.innerHTML = '';
  const S = makeS(1);
  S.potentialPresets[0].name = 'Original';
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi('p0', deps);
  const modal = document.getElementById('potPresetModal');
  modal.querySelector('#potPresetName').value = 'Renamed';
  modal.querySelector('#potSaveBtn').click();
  assert.equal(S.potentialPresets.length, 1);
  assert.equal(S.potentialPresets[0].name, 'Renamed');
});

test('openPotPresetEditorUi: empty name falls back to "Пресет"', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  const modal = document.getElementById('potPresetModal');
  modal.querySelector('#potPresetName').value = '   ';
  modal.querySelector('#potSaveBtn').click();
  assert.equal(S.potentialPresets[0].name, 'Пресет');
});

test('openPotPresetEditorUi: add condition appends row', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  document.getElementById('potPresetModal').querySelector('#potAddCond').click();
  // After add, re-rendered; the new modal has one condition row
  const rows = document.getElementById('potPresetModal').querySelectorAll('#potCondList > div');
  assert.ok(rows.length >= 1);
});

test('openPotPresetEditorUi: cancel removes modal without saving', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  document.getElementById('potPresetModal').querySelector('#potCancelBtn').click();
  assert.equal(document.getElementById('potPresetModal'), null);
  assert.equal(S.potentialPresets.length, 0);
});

test('openPotPresetEditorUi: backdrop click closes modal', () => {
  document.body.innerHTML = '';
  const S = makeS(0);
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi(null, deps);
  const modal = document.getElementById('potPresetModal');
  // Dispatch mousedown on the backdrop itself
  const ev = new dom.window.MouseEvent('mousedown', { bubbles: true });
  modal.dispatchEvent(ev);
  assert.equal(document.getElementById('potPresetModal'), null);
});
test('openPotPresetEditorUi: delete uses showConfirmModal', () => {
  document.body.innerHTML = '';
  const S = makeS(1);
  let confirmOpts = null;
  // Wire up a real delete so we can verify the confirm flow actually removes the preset.
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {},
    deletePotPresetUi: (id) => {
      const i = S.potentialPresets.findIndex(p => p.id === id);
      if (i >= 0) S.potentialPresets.splice(i, 1);
    },
    showConfirmModal: (msg, opts) => { confirmOpts = { msg, opts }; },
  };
  openPotPresetEditorUi('p0', deps);
  document.getElementById('potPresetModal').querySelector('#potDeleteBtn').click();
  assert.ok(confirmOpts);
  assert.match(confirmOpts.msg, /Preset 0/);
  assert.equal(confirmOpts.opts.danger, true);
  // Execute confirm: should delete and remove modal
  confirmOpts.opts.onConfirm();
  assert.equal(S.potentialPresets.length, 0);
  assert.equal(document.getElementById('potPresetModal'), null);
});

test('openPotPresetEditorUi: toggle on existing preset flips enabled', () => {
  document.body.innerHTML = '';
  const S = makeS(1);
  S.potentialPresets[0].enabled = true;
  const deps = {
    S, setActiveTab: () => {},
    renderPotentialPanel: () => {}, runPotentialCheck: () => {}, buildGroupFilterBar: () => {},
    togglePotPresetUi: () => {}, deletePotPresetUi: () => {}, showConfirmModal: () => {},
  };
  openPotPresetEditorUi('p0', deps);
  document.getElementById('potPresetModal').querySelector('#potToggleBtn').click();
  assert.equal(S.potentialPresets[0].enabled, false);
});

// ─── togglePotPresetUi ──────────────────────────────────────────
test('togglePotPresetUi: flips enabled state and calls start', () => {
  const S = makeS(1);
  S.potentialPresets[0].enabled = false;
  let started = 0;
  const deps = {
    S,
    setActiveTab: () => {},
    startPotentialMonitor: () => started++,
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  togglePotPresetUi('p0', deps);
  assert.equal(S.potentialPresets[0].enabled, true);
  assert.equal(started, 1);
});

test('togglePotPresetUi: clearing matches when disabling', () => {
  // Start disabled so the first call ENABLES (no clear), the second call DISABLES (clears).
  const S = makeS(1);
  S.potentialPresets[0].enabled = false;
  S.potentialPresets[0].matches = { A: 1 };
  S.potentialPresets[0].alerted = { A: 1 };
  const deps = {
    S,
    setActiveTab: () => {},
    startPotentialMonitor: () => {},
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  togglePotPresetUi('p0', deps); // enables, no clear
  assert.equal(S.potentialPresets[0].enabled, true);
  assert.deepEqual(S.potentialPresets[0].matches, { A: 1 });
  togglePotPresetUi('p0', deps); // disables, clears
  assert.deepEqual(S.potentialPresets[0].matches, {});
  assert.deepEqual(S.potentialPresets[0].alerted, {});
});

test('togglePotPresetUi: no-op on missing id', () => {
  const S = makeS(1);
  const deps = {
    S,
    setActiveTab: () => {},
    startPotentialMonitor: () => {},
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  togglePotPresetUi('nope', deps);
  assert.equal(S.potentialPresets[0].enabled, true); // unchanged
});

// ─── deletePotPresetUi ──────────────────────────────────────────
test('deletePotPresetUi: removes preset and updates active tab', () => {
  const S = makeS(2);
  S.potentialPresets[0].id = 'first';
  S.potentialPresets[1].id = 'second';
  const tabRef = { current: 'first' };
  let nextTab = null;
  const deps = {
    S,
    activeTabRef: tabRef,
    setActiveTab: (v) => { nextTab = v; tabRef.current = v; },
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  deletePotPresetUi('first', deps);
  assert.equal(S.potentialPresets.length, 1);
  assert.equal(S.potentialPresets[0].id, 'second');
  assert.equal(nextTab, 'second');
});

test('deletePotPresetUi: clears active tab when deleting the last preset', () => {
  const S = makeS(1);
  const tabRef = { current: 'p0' };
  let nextTab = 'unset';
  const deps = {
    S,
    activeTabRef: tabRef,
    setActiveTab: (v) => { nextTab = v; tabRef.current = v; },
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  deletePotPresetUi('p0', deps);
  assert.equal(S.potentialPresets.length, 0);
  assert.equal(nextTab, null);
});

test('deletePotPresetUi: no-op on missing id', () => {
  const S = makeS(1);
  const deps = {
    S,
    activeTabRef: { current: 'p0' },
    setActiveTab: () => {},
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  deletePotPresetUi('nope', deps);
  assert.equal(S.potentialPresets.length, 1);
});

test('deletePotPresetUi: does not change tab when deleting a non-active preset', () => {
  const S = makeS(2);
  S.potentialPresets[0].id = 'a';
  S.potentialPresets[1].id = 'b';
  const tabRef = { current: 'a' };
  let setCalls = 0;
  const deps = {
    S,
    activeTabRef: tabRef,
    setActiveTab: () => { setCalls++; },
    renderPotentialPanel: () => {},
    buildGroupFilterBar: () => {},
  };
  deletePotPresetUi('b', deps);
  assert.equal(setCalls, 0);
  assert.equal(tabRef.current, 'a');
});

// ─── addBuiltinSqueezePresetUi ──────────────────────────────────
test('addBuiltinSqueezePresetUi: adds preset and sets as active', () => {
  const S = makeS(0);
  let newActive = null;
  addBuiltinSqueezePresetUi({ S, setActiveTab: (id) => { newActive = id; } });
  assert.equal(S.potentialPresets.length, 1);
  assert.equal(newActive, S.potentialPresets[0].id);
});

test('addBuiltinSqueezePresetUi: returns existing if same name', () => {
  const S = makeS(0);
  addBuiltinSqueezePresetUi({ S, setActiveTab: () => {} });
  addBuiltinSqueezePresetUi({ S, setActiveTab: () => {} });
  assert.equal(S.potentialPresets.length, 1);
});

// ─── clearPotentialMatchesUi ────────────────────────────────────
test('clearPotentialMatchesUi: clears matches and alerted for all', () => {
  document.body.innerHTML = '<span id="potBadge">5</span>';
  const S = makeS(2);
  S.potentialPresets[0].matches = { A: 1 };
  S.potentialPresets[0].alerted = { A: 1 };
  S.potentialPresets[1].matches = { B: 2 };
  let rendered = 0;
  clearPotentialMatchesUi({ S, renderPotentialPanel: () => rendered++ });
  for (const pr of S.potentialPresets) {
    assert.deepEqual(pr.matches, {});
    assert.deepEqual(pr.alerted, {});
  }
  assert.equal(rendered, 1);
  assert.equal(document.getElementById('potBadge').style.display, 'none');
});

// ─── updatePotBadgeUi ───────────────────────────────────────────
test('updatePotBadgeUi: shows count when matches exist', () => {
  document.body.innerHTML = '<span id="potBadge"></span>';
  const S = makeS(2);
  S.potentialPresets[0].matches = { A: 1, B: 2 };
  S.potentialPresets[0].enabled = true;
  S.potentialPresets[1].matches = { C: 3 };
  S.potentialPresets[1].enabled = true;
  updatePotBadgeUi(S);
  const badge = document.getElementById('potBadge');
  assert.equal(badge.textContent, '3');
  assert.equal(badge.style.display, 'inline');
});

test('updatePotBadgeUi: hides badge when no matches', () => {
  document.body.innerHTML = '<span id="potBadge">5</span>';
  const badge = document.getElementById('potBadge');
  badge.style.display = 'inline';
  const S = makeS(1);
  updatePotBadgeUi(S);
  assert.equal(badge.textContent, '0');
  assert.equal(badge.style.display, 'none');
});

test('updatePotBadgeUi: only counts enabled presets', () => {
  document.body.innerHTML = '<span id="potBadge"></span>';
  const S = makeS(2);
  S.potentialPresets[0].matches = { A: 1 };
  S.potentialPresets[0].enabled = true;
  S.potentialPresets[1].matches = { B: 2 };
  S.potentialPresets[1].enabled = false;
  updatePotBadgeUi(S);
  const badge = document.getElementById('potBadge');
  assert.equal(badge.textContent, '1');
});

test('updatePotBadgeUi: no-op when badge element missing', () => {
  document.body.innerHTML = '';
  const S = makeS(1);
  // Should not throw
  updatePotBadgeUi(S);
});
