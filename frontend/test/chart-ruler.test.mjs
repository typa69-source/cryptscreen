import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function section(beginMarker, endMarker) {
  const begin = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker, begin + beginMarker.length);
  assert.ok(begin >= 0 && end > begin, `missing source section: ${beginMarker}`);
  return source.slice(begin, end);
}
function canvasFixture() {
  let clears = 0;
  const ctx = new Proxy({}, {
    get: () => () => {},
    set: () => true,
  });
  ctx.clearRect = () => { clears++; };
  // Use a plain object for the clear counter: the proxy intentionally
  // supplies no-op methods for the remaining canvas operations.
  const context = {
    clearRect: () => { clears++; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
  };
  return {
    canvas: { width: 800, height: 400, getContext: () => context },
    get clears() { return clears; },
  };
}

test('normal chart painter refreshes the ruler layer without painting a second ruler', () => {
  const fixture = canvasFixture();
  let rulerDraws = 0;
  let layerRefreshes = 0;
  const context = vm.createContext({
    PRICE_AXIS_W: 65, TIME_AXIS_H: 22,
    S: { showDensity: false, drawMode: null },
    drawSessionZones() {}, drawEMAs() {},
    drawRuler: () => { rulerDraws++; },
    scheduleRulerRedraw: () => { layerRefreshes++; },
  });
  vm.runInContext(section('function _rCanvasImmediate(', 'function _rulerCanvasImmediate('), context);
  const ch = {
    canvas: fixture.canvas, lc: {}, cs: {}, vs: {},
    drawings: [], pendingP1: null, hoverX: 0, hoverY: 0,
    ruler: { p1: { time: 1, price: 100 }, p2: { time: 2, price: 102 } },
  };
  context._rCanvasImmediate(ch);
  context._rCanvasImmediate(ch);
  assert.equal(rulerDraws, 0, 'the main canvas must not duplicate the dedicated ruler layer');
  assert.equal(layerRefreshes, 2, 'viewport redraws must refresh the dedicated layer');
  assert.equal(fixture.clears, 2);
});

test('Grid Lab painter renders its ruler without a dedicated canvas', () => {
  const fixture = canvasFixture();
  let rulerDraws = 0;
  const context = vm.createContext({
    PRICE_AXIS_W: 65, TIME_AXIS_H: 22,
    document: { getElementById: () => null },
    drawRuler: () => { rulerDraws++; },
  });
  vm.runInContext(section('function _rCanvasGridLabImmediate(', 'function _rCanvasImmediate('), context);
  const ch = {
    canvas: fixture.canvas, lc: {}, cs: {},
    hoverX: 0, hoverY: 0,
    ruler: { p1: { time: 1, price: 100 }, p2: { time: 2, price: 102 } },
  };
  context._rCanvasGridLabImmediate(ch);
  assert.equal(rulerDraws, 1);
  ch.ruler = null;
  context._rCanvasGridLabImmediate(ch);
  assert.equal(rulerDraws, 1, 'a removed ruler must not be repainted');
  assert.equal(fixture.clears, 2);
});

test('shared ruler scheduler batches redraws and clears removed rulers', () => {
  const frames = [];
  const fixture = canvasFixture();
  const drawn = [];
  const gridDrawn = [];
  const context = vm.createContext({
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    _rulerCanvasImmediate: ch => drawn.push(ch),
    rCanvas: ch => gridDrawn.push(ch),
  });
  vm.runInContext(section('let _rulerRedrawSet', 'function onRulerEnd('), context);
  const active = { ruler: { p1: {} }, rulerCanvas: fixture.canvas };
  const removed = { ruler: null, rulerCanvas: fixture.canvas };
  const grid = { _gridLabChart: true, ruler: { p1: {} } };
  context.scheduleRulerRedraw(active);
  context.scheduleRulerRedraw(active);
  context.scheduleRulerRedraw(removed);
  context.scheduleRulerRedraw(grid);
  assert.equal(frames.length, 1, 'all pending charts should share one animation frame');
  frames.shift()();
  assert.deepEqual(drawn, [active]);
  assert.deepEqual(gridDrawn, [grid]);
  assert.equal(fixture.clears, 1, 'removed rulers must clear their dedicated canvas');
});

function tooltipFixture() {
  const frames = [];
  const tt = { style: {} };
  let now = 100;
  let statisticsUpdates = 0;
  const ch = {
    _rulerRect: { left: 0, top: 0 },
    ruler: { active: true, p1: { time: 1, price: 100 }, p2: { time: 1, price: 100 } },
  };
  const context = vm.createContext({
    S: { charts: [ch], fsCharts: [] },
    window: { innerWidth: 1200, innerHeight: 800 },
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.push(callback); return 1; },
    snapPoint: (chart, x, y) => ({ time: x, price: y }),
    scheduleRulerRedraw() {},
    _rtDom: () => ({ tt }),
    updateRulerTooltip: () => { statisticsUpdates++; },
  });
  vm.runInContext(section('function onRulerMove(', '// One shared RAF'), context);
  return {
    ch, tt, frames, context,
    setNow(value) { now = value; },
    get statisticsUpdates() { return statisticsUpdates; },
    move(x, y) {
      context.onRulerMove(ch, { clientX: x, clientY: y, ctrlKey: false }, {});
    },
  };
}

test('tooltip position updates each frame while statistics remain throttled', () => {
  const fixture = tooltipFixture();
  fixture.move(100, 200);
  fixture.move(120, 220);
  assert.equal(fixture.frames.length, 1, 'multiple mouse events should coalesce into one frame');
  fixture.frames.shift()();
  assert.equal(fixture.tt.style.transform, 'translate3d(138px, 92px, 0)');
  assert.equal(fixture.tt.style.display, 'block');
  assert.equal(fixture.statisticsUpdates, 1);

  fixture.setNow(110);
  fixture.move(150, 250);
  fixture.frames.shift()();
  assert.equal(fixture.tt.style.transform, 'translate3d(168px, 122px, 0)');
  assert.equal(fixture.statisticsUpdates, 1, 'movement must not wait for the statistics interval');

  fixture.setNow(200);
  fixture.move(180, 280);
  fixture.frames.shift()();
  assert.equal(fixture.statisticsUpdates, 2);
});

test('a queued tooltip frame cannot revive a removed ruler', () => {
  const fixture = tooltipFixture();
  fixture.move(100, 200);
  fixture.ch.ruler = null;
  fixture.tt.style.display = 'none';
  fixture.frames.shift()();
  assert.equal(fixture.tt.style.display, 'none');
  assert.equal(fixture.tt.style.transform, undefined);
  assert.equal(fixture.statisticsUpdates, 0);
});
