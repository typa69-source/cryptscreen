// РЕГРЕССИИ КРАША Grid Lab: утечки слушателей и брошенные контексты чарта.
//
// Пользователь видел «вкладка вылетает с ошибкой» после работы в Grid Lab.
// Реальные причины (обе найдены в этом файле, обе воспроизводятся здесь):
//  1. ESC-обработчик висел на document НАВСЕГДА: `body._gbFormSig` никогда не
//     создавался, поэтому `{signal}` не работал, а сам модал удерживался
//     слушателем → чарт, свечи и линии оставались в памяти после закрытия.
//  2. При уходе с таба «Сетка» (tab === 'selector') innerHTML заменялся, но
//     чарт, ResizeObserver и таймер цены продолжали жить, а body._gbChartCtx
//     оставался мёртвым → LWC «Object is disposed» при возврате.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;

const { renderGridLabModal, cleanupGridLabContext } = await import('../src/gridLab-ui.js');

/** Считает слушателей конкретного типа на document. */
function docListenerCount(type) {
  const anyDoc = /** @type {any} */ (document);
  const listeners = anyDoc._listeners?.[type];
  if (Array.isArray(listeners)) return listeners.length;
  // jsdom держит их в EventTarget internals — считаем через addEventListener-шим.
  return globalThis.__docAdds?.filter((t) => t === type).length ?? 0;
}

function makeDeps() {
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
    },
    fn: (v, d = 0) => {
      if (v == null) return '—';
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(d) : String(v);
    },
    fk: (v) => v == null ? '—' : String(Math.round(Number(v))),
    scheduleGridLabSync: (body, prefs, opts) => calls.schedule.push({ body, opts }),
    applyGbRatioGrid: (body) => calls.applyRatio.push(body),
    gridLabBoundsUndo: (body) => calls.undo.push(body),
    gridLabBoundsRedo: (body) => calls.redo.push(body),
    openFullscreenBySym: (sym) => calls.open.push(sym),
    getGridSelectorRows: () => [
      { sym: 'ETHUSDT', score: 0.85, range24: 5.2, natr: 0.12, ch24: 1.5, vol24: 1e8, trd24: 50000 },
    ],
    _calls: calls,
  };
}

function clearDom() {
  document.body.innerHTML = '';
}

test('закрытие модала снимает ESC-обработчик с document (иначе утечка → краш)', () => {
  clearDom();
  let adds = 0;
  let removes = 0;
  const origAdd = dom.window.document.addEventListener.bind(document);
  const origRemove = dom.window.document.removeEventListener.bind(document);
  document.addEventListener = (t, f, o) => { if (t === 'keydown') adds++; return origAdd(t, f, o); };
  document.removeEventListener = (t, f, o) => { if (t === 'keydown') removes++; return origRemove(t, f, o); };

  renderGridLabModal('BTCUSDT', makeDeps());
  const body = document.getElementById('gridLabBody');
  assert.ok(body, 'тело модала создано');
  // В баге здесь было null — обработчик навсегда прилипал к document.
  assert.ok(body._gbEscHandler, 'ESC-обработчик сохранён в контексте для снятия');

  cleanupGridLabContext(body);

  assert.equal(removes, 1, 'ESC-обработчик снят ровно один раз');
  assert.equal(body._gbEscHandler, null, 'ссылка на обработчик очищена');
  document.addEventListener = origAdd;
  document.removeEventListener = origRemove;
});

test('повторный cleanup не падает и не оставляет висящих обработчиков', () => {
  clearDom();
  renderGridLabModal('BTCUSDT', makeDeps());
  const body = document.getElementById('gridLabBody');
  cleanupGridLabContext(body);
  cleanupGridLabContext(body); // второй раз — должен быть безопасным no-op
  assert.equal(body._gbEscHandler, null);
});

test('уход на таб «Сетка» сносит контекст чарта (LWC "Object is disposed")', () => {
  clearDom();
  renderGridLabModal('BTCUSDT', makeDeps());
  const body = document.getElementById('gridLabBody');
  // Эмулируем живой чарт: без сноса он пережил бы innerHTML-замену.
  const fakeChart = { lc: {}, cs: {}, ro: null, merged: [{ t: 1, o: 1, h: 1, l: 1, c: 1 }] };
  body._gbChartCtx = fakeChart;
  body._gbEscHandler = () => {};
  body._gbTimer = setTimeout(() => {}, 1000);

  document.querySelector('#gridTabSelector').click();

  assert.equal(body._gbChartCtx, null, 'контекст чарта обнулён при смене таба');
  assert.equal(body._gbEscHandler, null, 'обработчик снят');
});

test('семь открытий/закрытий подряд не накапливают контексты', () => {
  clearDom();
  for (let i = 0; i < 7; i++) {
    renderGridLabModal('BTCUSDT', makeDeps());
    const body = document.getElementById('gridLabBody');
    cleanupGridLabContext(body);
  }
  // В DOM не должно остаться ни одного модала — только последний, если не закрыт.
  assert.equal(document.querySelectorAll('#gridLabModal').length, 1);
});
test('модал снимается только через cleanup: голый remove() плодит утечки', () => {
  // renderGridLabModal сам чистит предыдущий модал — это единственный
  // безопасный путь. Проверяем, что при повторном открытии старый контекст
  // (чарт/наблюдатель/поллер) действительно снят, а не просто отвязан от DOM.
  clearDom();
  renderGridLabModal('BTCUSDT', makeDeps());
  const oldBody = document.getElementById('gridLabBody');
  const disposed = { lc: false, ro: false, poll: false };
  oldBody._gbChartCtx = {
    lc: { remove: () => { disposed.lc = true; } },
    cs: {},
    ro: { disconnect: () => { disposed.ro = true; } },
    _pollTimer: setInterval(() => {}, 1000),
    merged: [],
  };
  oldBody._gbEscHandler = () => {};

  renderGridLabModal('ETHUSDT', makeDeps());

  assert.equal(disposed.lc, true, 'чарт освобождён при переоткрытии');
  assert.equal(disposed.ro, true, 'ResizeObserver отключён');
  assert.equal(oldBody._gbEscHandler, null, 'ESC снят');
  assert.equal(document.querySelectorAll('#gridLabModal').length, 1, 'модал ровно один');
});
