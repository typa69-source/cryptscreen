// Тесты правил «график не скачет»: chart-view.js
// Детерминированно, без DOM и сети. Поведение LWC 4.1.3 зафиксировано
// замерами на полигоне (prepend → время сохраняется, append при правом
// крае → окно едет за последним баром, смена окна → индексы сохраняются).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  captureView,
  candleMeta,
  classifyDataChange,
  shiftOfFirstBar,
  clampTimeRangeToData,
  planViewRestore,
  applyViewPlan,
  applyViewPlanAsync,
  viewContextKey,
  rememberUserView,
  planUserViewRestore,
  withStableView,
} from '../src/chart-view.js';

const bar = (t, c = 100) => ({ t, o: c, h: c + 1, l: c - 1, c, qv: 1 });
const series = (n, t0 = 1700000000, step = 60) =>
  Array.from({ length: n }, (_, i) => bar(t0 + i * step, 100 + Math.sin(i / 4) * 3));

/** Фейковый TimeScaleApi: запоминает вызовы и умеет отдавать снимок. */
function fakeTs(log = { from: 40, to: 79 }, time = { from: 1700002400, to: 1700004740 }, opts = { barSpacing: 16.05 }) {
  const calls = [];
  return {
    calls,
    getVisibleLogicalRange: () => (log ? { ...log } : null),
    getVisibleRange: () => (time ? { ...time } : null),
    options: () => ({ ...opts }),
    setVisibleLogicalRange: (r) => calls.push({ kind: 'logical', r: { ...r } }),
    setVisibleRange: (r) => calls.push({ kind: 'time', r: { ...r } }),
  };
}

test('captureView: снимает логический диапазон, время и barSpacing', () => {
  const v = captureView(fakeTs());
  assert.deepEqual(v.log, { from: 40, to: 79 });
  assert.deepEqual(v.time, { from: 1700002400, to: 1700004740 });
  assert.equal(v.barSpacing, 16.05);
});

test('captureView: переживает отсутствие/поломку API', () => {
  assert.deepEqual(captureView(null), { log: null, time: null, barSpacing: null });
  const broken = {
    getVisibleLogicalRange() { throw new Error('boom'); },
    getVisibleRange() { throw new Error('boom'); },
    options() { throw new Error('boom'); },
  };
  assert.deepEqual(captureView(broken), { log: null, time: null, barSpacing: null });
  // вырожденные диапазоны не считаем валидными
  const degenerate = fakeTs({ from: 10, to: 10 }, { from: 5, to: NaN });
  const v = captureView(degenerate);
  assert.equal(v.log, null);
  assert.equal(v.time, null);
});

test('classifyDataChange: none / append / prepend / both / swap / unknown', () => {
  const s = series(100);
  const base = candleMeta(s);
  assert.equal(classifyDataChange(base, candleMeta(s)), 'none');
  assert.equal(classifyDataChange(base, candleMeta([...s, bar(1700000000 + 100 * 60)])), 'append');
  assert.equal(classifyDataChange(base, candleMeta([bar(1699990000), ...s])), 'prepend');
  assert.equal(classifyDataChange(base, candleMeta([bar(1699990000), ...s, bar(1700006000)])), 'both');
  // окно данных сдвинулось целиком
  assert.equal(classifyDataChange(base, candleMeta(series(100, 1700500000))), 'swap');
  // не с чем сравнивать
  assert.equal(classifyDataChange(null, base), 'unknown');
  assert.equal(classifyDataChange(base, { len: 0, firstT: null, lastT: null }), 'unknown');
});

test('shiftOfFirstBar: сдвиг считается по времени, а не по разнице длин', () => {
  const s = series(100);
  const firstT = s[0].t;
  assert.equal(shiftOfFirstBar(firstT, s), 0);
  assert.equal(shiftOfFirstBar(firstT, [...series(40, firstT - 40 * 60), ...s]), 40);
  // старый первый бар подрезан кэшем → сдвиг = число баров левее него
  const trimmed = [...series(10, firstT - 50 * 60), ...s.slice(5)];
  assert.equal(shiftOfFirstBar(firstT, trimmed), 10);
  assert.equal(shiftOfFirstBar(null, s), 0);
});

test('planViewRestore: append и none не трогают вьюпорт (LWC держит окно сам)', () => {
  const s = series(100);
  const view = captureView(fakeTs());
  assert.deepEqual(planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta([...s, bar(1700006000)]), candles: [...s, bar(1700006000)] }), { mode: 'keep' });
  assert.deepEqual(planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(s), candles: s }), { mode: 'keep' });
});

test('planViewRestore: prepend → логический сдвиг на число вставленных баров', () => {
  const s = series(100);
  const next = [...series(40, s[0].t - 40 * 60), ...s];
  const view = captureView(fakeTs({ from: 40, to: 79 }));
  const plan = planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(plan.mode, 'logical');
  assert.deepEqual(plan.range, { from: 80, to: 119 });
});

test('planViewRestore: prepend с пустотой слева сохраняет ширину окна', () => {
  const s = series(100);
  const next = [...series(20, s[0].t - 20 * 60), ...s];
  const view = captureView(fakeTs({ from: -12, to: 30 })); // зум «левее первого бара»
  const plan = planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(plan.mode, 'logical');
  assert.deepEqual(plan.range, { from: 8, to: 50 });
  const span = plan.range.to - plan.range.from;
  assert.equal(span, 42); // ширина не «схлопнулась»
});

test('planViewRestore: все прежние бары на месте + новые с двух сторон → логический сдвиг', () => {
  const s = series(100);
  const view = captureView(fakeTs({ from: 3, to: 99 }, { from: 1700000180, to: 1700005940 }));
  const next = series(200, s[0].t - 50 * 60);
  const plan = planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(plan.mode, 'logical');
  assert.deepEqual(plan.range, { from: 53, to: 149 });
});

test('planViewRestore: смена окна данных (голова ушла) → восстановление по времени', () => {
  const s = series(100);
  const view = captureView(fakeTs({ from: 3, to: 99 }, { from: 1700000180, to: 1700005940 }));
  // новое окно начинается позже → прежние индексы указывают на другие бары
  const next = series(300, s[0].t + 20 * 60);
  const plan = planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(plan.mode, 'time');
  // прежнее окно уже недоступно: ширина сохранена, диапазон прижат к данным
  assert.deepEqual(plan.range, { from: next[0].t, to: next[0].t + (1700005940 - 1700000180) });
});

test('planViewRestore: время вне новых данных обрезается с сохранением ширины', () => {
  const s = series(100);
  const view = captureView(fakeTs({ from: 3, to: 99 }, { from: 1700000180, to: 1700005940 }));
  const next = series(100, 1700900000); // совсем другое окно
  const plan = planViewRestore({ view, prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(plan.mode, 'time');
  const span = plan.range.to - plan.range.from;
  assert.equal(span, 1700005940 - 1700000180);
  assert.ok(plan.range.from >= next[0].t);
  assert.ok(plan.range.to <= next[next.length - 1].t);
});

test('applyViewPlan: применяет только осмысленный план', () => {
  const tsApi = fakeTs();
  assert.equal(applyViewPlan(tsApi, { mode: 'keep' }), false);
  assert.equal(applyViewPlan(tsApi, null), false);
  assert.equal(applyViewPlan(tsApi, { mode: 'logical', range: { from: NaN, to: 1 } }), false);
  assert.equal(applyViewPlan(tsApi, { mode: 'logical', range: { from: 5, to: 9 } }), true);
  assert.deepEqual(tsApi.calls.at(-1), { kind: 'logical', r: { from: 5, to: 9 } });
  assert.equal(applyViewPlan(tsApi, { mode: 'time', range: { from: 1700000000, to: 1700000600 } }), true);
  assert.deepEqual(tsApi.calls.at(-1), { kind: 'time', r: { from: 1700000000, to: 1700000600 } });
  // сломанный API не роняет
  assert.equal(applyViewPlan({ setVisibleLogicalRange() { throw new Error('x'); } }, { mode: 'logical', range: { from: 1, to: 2 } }), false);
  assert.equal(applyViewPlan({}, { mode: 'logical', range: { from: 1, to: 2 } }), false);
});

test('withStableView: данные заменились, окно при append не тронуто', () => {
  const s = series(100);
  const tsApi = fakeTs();
  const next = [...s, bar(1700006000)];
  let painted = 0;
  const res = withStableView(tsApi, () => { painted++; }, { prevMeta: candleMeta(s), nextMeta: candleMeta(next), candles: next });
  assert.equal(painted, 1);
  assert.equal(res.plan.mode, 'keep');
  assert.equal(res.applied, false);
  assert.equal(tsApi.calls.length, 0);
});

test('rememberUserView / planUserViewRestore: вид переживает перезагрузку данных', () => {
  const ch = {};
  const s = series(120);
  assert.equal(rememberUserView(ch, captureView(fakeTs()), viewContextKey('BTCUSDT', '15')), true);
  // тот же контекст → возвращаем вид пользователя
  const same = planUserViewRestore(ch, viewContextKey('BTCUSDT', '15'), s);
  assert.equal(same.mode, 'time');
  assert.deepEqual(same.range, { from: 1700002400, to: 1700004740 });
  // другой контекст → не вмешиваемся (применится дефолтный вид)
  assert.deepEqual(planUserViewRestore(ch, viewContextKey('ETHUSDT', '15'), s), { mode: 'keep' });
  assert.deepEqual(planUserViewRestore(ch, viewContextKey('BTCUSDT', '60'), s), { mode: 'keep' });
  // без запомненного вида → keep
  assert.deepEqual(planUserViewRestore({}, viewContextKey('BTCUSDT', '15'), s), { mode: 'keep' });
  // данные не покрывают — план всё равно валиден и внутри рамок
  const shifted = series(120, 1700900000);
  const p = planUserViewRestore(ch, viewContextKey('BTCUSDT', '15'), shifted);
  assert.ok(p.range.from >= shifted[0].t && p.range.to <= shifted.at(-1).t);
});

test('rememberUserView: без логического диапазона не запоминает', () => {
  const ch = {};
  assert.equal(rememberUserView(ch, captureView(fakeTs(null, null)), viewContextKey('A', '1')), false);
  assert.equal(ch._userView, undefined);
});

test('clampTimeRangeToData: внутри данных не меняет, снаружи сдвигает целиком', () => {
  const s = series(100);
  const inside = { from: s[10].t, to: s[20].t };
  assert.deepEqual(clampTimeRangeToData(inside, s), inside);
  const left = { from: s[0].t - 1200, to: s[10].t };
  const cl = clampTimeRangeToData(left, s);
  assert.equal(cl.from, s[0].t);
  assert.equal(cl.to - cl.from, left.to - left.from);
  const right = { from: s[90].t, to: s.at(-1).t + 600 };
  const cr = clampTimeRangeToData(right, s);
  assert.equal(cr.to, s.at(-1).t);
  assert.equal(cr.to - cr.from, right.to - right.from);
  assert.equal(clampTimeRangeToData(null, s), null);
  assert.equal(clampTimeRangeToData({ from: 1, to: 2 }, []), null);
});
// ── applyViewPlanAsync: восстановление окна ПОСЛЕ кадра ──────────────
// Замерено на полигоне LWC 4.1.3: сразу после setData библиотека на
// следующем кадре делает свой fit и гасит наш сеттер. Поэтому план
// применяется отложенно; в node rAF нет — работает таймаутная ветка.
test('applyViewPlanAsync: keep и пустой план не трогают вьюпорт', () => {
  const calls = [];
  const ts = { setVisibleLogicalRange: (r) => calls.push(['log', r]), setVisibleRange: (r) => calls.push(['time', r]) };
  assert.equal(applyViewPlanAsync(ts, { mode: 'keep' }), false);
  assert.equal(applyViewPlanAsync(ts, null), false);
  assert.equal(applyViewPlanAsync(null, { mode: 'logical', range: { from: 1, to: 2 } }), false);
  assert.deepEqual(calls, []);
});

test('applyViewPlanAsync: применяет план отложенно и ровно один раз', async () => {
  const calls = [];
  const ts = { setVisibleLogicalRange: (r) => calls.push(['log', r]), setVisibleRange: (r) => calls.push(['time', r]) };
  assert.equal(applyViewPlanAsync(ts, { mode: 'logical', range: { from: 10, to: 20 } }), true);
  assert.deepEqual(calls, [], 'синхронно применять нельзя — перебьёт fit');
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, [['log', { from: 10, to: 20 }]]);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls.length, 1, 'повторного применения быть не должно');
});

test('applyViewPlanAsync: план по времени идёт через setVisibleRange', async () => {
  const calls = [];
  const ts = { setVisibleLogicalRange: (r) => calls.push(['log', r]), setVisibleRange: (r) => calls.push(['time', r]) };
  applyViewPlanAsync(ts, { mode: 'time', range: { from: 100, to: 200 } });
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls, [['time', { from: 100, to: 200 }]]);
});
