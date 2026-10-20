/**
 * Grid Lab — «Подбор уровней» engine (pure math, no DOM).
 *
 * Скан-оптимизация числа сеток N по 1-минутным свечам от точки старта:
 * границы lo/hi фиксированы юзером, для каждого N движок считает реальные
 * fill'ы лимитных ордеров (как биржевой грид-бот) и чистую прибыль в $.
 *
 * Модель исполнения (классический нейтральный грид, та же семантика
 * close-to-close, что у проверенного simulateGrid из grid-economics):
 *  - уровни grid[0..M-1] по возрастанию (grid[0]=lo, grid[M-1]=hi);
 *  - клетка цены cellOf(p) = индекс наибольшего уровня ≤ p (клампы по краям);
 *  - пересечение уровня k ВНИЗ (клетка k → k−1) = fill лимит-байя на grid[k];
 *    уровень можно купить не чаще 1 раза (один ордер на уровень, как у биржи);
 *    верхний уровень не покупается (нет цели продажи выше диапазона);
 *  - пересечение уровня k ВВЕРХ (клетка k−1 → k) = fill лимит-селла на grid[k],
 *    закрывающего позицию, купленную на grid[k−1];
 *  - round-trip = buy@grid[k] → sell@grid[k+1], прибыль = шаг пары,
 *    издержки = RT-комиссия (2 мейкера + slippage-guard).
 *
 * Граница свечи точно на уровне считается «касанием» = fill (как лимитник).
 * Внутрибарные хвосты (wicks) НЕ считаются отдельными свипами — модель
 * консервативна и одинаково смещает все N, что честно для их СРАВНЕНИЯ
 * (задача фичи — ранжировать плотности, а не обещать точный PnL).
 *
 * Все функции чистые и детерминированные → unit-тестируемые.
 */

import { roundTripFeePct } from './grid-economics.js';

/** Min/max для скана числа уровней (интервалов между уровнями). */
export const LEVELS_SCAN_MIN = 2;
export const LEVELS_SCAN_MAX = 60;

/**
 * Привести окно 1m-свечей к формату {t,o,h,l,c}: фильтр от startMs
 * (включительно) до последней свечи. Бары до старта отбрасываются —
 * точка старта задаёт левую границу «жизни бота».
 * @returns {Array} отфильтрованные свечи (может быть пусто)
 */
export function windowFromStart(candles1m, startMs) {
  if (!Array.isArray(candles1m) || candles1m.length === 0) return [];
  const s = +startMs;
  if (!isFinite(s) || s <= 0) return candles1m.slice();
  return candles1m.filter((k) => +k.t >= s);
}

/**
 * Счёт сделок грида на окне свечей (OHLC-path, один проход).
 *
 * Путь цены внутри свечи: prevClose → open → (high|low в порядке тренда)
 * → close: бычья свеча (c≥o) идёт o→l→h→c, медвежья o→h→l→c. Лимитные
 * ордера заполняются на КАСАНИИ уровня (как на бирже): buy@Lk — когда
 * цена пересекает Lk вниз (p2 ≤ L < p1), sell@Lk — при пересечении вверх
 * (p1 < L ≤ p2). Это принципиально для задачи: плотные сетки ловят
 * wick-свипы, которые close-to-close не видит — а именно «частые
 * срабатывания» и есть предмет оптимизации.
 *
 * Пары (как у биржевого грида): buy@Lk открывает позицию с целью
 * sell@L(k+1); sell@Lk закрывает позицию, купленную на L(k−1).
 * Один ордер на уровень (inv[k] ∈ 0/1), верхний уровень не покупается
 * (нет цели выше), нижний — покупается (цель — уровень выше).
 *
 * @param {Array} candles окно {t,o,h,l,c}, старейшая первой
 * @param {Array} grid уровни цен по возрастанию (включая lo и hi)
 * @returns {{rt:number, buys:number, sells:number}}
 *   rt — завершённые round-trip'ы (buy@k + sell@k+1)
 */
export function countRoundTrips(candles, grid) {
  const res = { rt: 0, buys: 0, sells: 0 };
  if (!Array.isArray(candles) || !Array.isArray(grid) || grid.length < 2) return res;
  const M = grid.length;
  // Индексы уровней в сегменте [a, b]: бинпоиск первой границы > a.
  const firstIdxAbove = (p) => {
    let lo = 0, hi = M;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (grid[mid] <= p) lo = mid + 1; else hi = mid;
    }
    return lo; // первый индекс с grid[idx] > p
  };
  const inv = new Array(M).fill(0); // куплено ли на уровне k (0/1)
  const fillUp = (p1, p2) => {
    // вверх: уровни p1 < L ≤ p2, по возрастанию → sell закрывает buy уровнем ниже
    let k = firstIdxAbove(p1);
    while (k < M && grid[k] <= p2) {
      if (inv[k - 1] > 0) { inv[k - 1] = 0; res.sells++; res.rt++; }
      k++;
    }
  };
  const fillDown = (p1, p2) => {
    // вниз: уровни p2 ≤ L < p1, по убыванию → buy открывает позицию
    let k = firstIdxAbove(p2) - 1; // последний индекс с grid[idx] ≤ p2... нет:
    // нужен диапазон p2 ≤ L < p1: старт с последнего уровня < p1 и вниз до ≥ p2
    k = firstIdxAbove(p1) - 1; // последний индекс с grid[idx] ≤ p1 — но L<p1 строго
    if (k >= 0 && grid[k] === p1) k--; // уровень ровно на старте уже обработан прошлым сегментом
    while (k >= 0 && grid[k] >= p2) {
      if (k < M - 1 && inv[k] === 0) { inv[k] = 1; res.buys++; } // верхний уровень не покупается
      k--;
    }
  };
  let prevC = +candles[0].c;
  for (let i = 1; i < candles.length; i++) {
    const bar = candles[i];
    const o = +bar.o, h = +bar.h, l = +bar.l, c = +bar.c;
    if (![o, h, l, c].every(isFinite)) continue;
    const path = c >= o ? [prevC, o, l, h, c] : [prevC, o, h, l, c];
    for (let s = 1; s < path.length; s++) {
      const p1 = path[s - 1], p2 = path[s];
      if (p2 > p1) fillUp(p1, p2);
      else if (p2 < p1) fillDown(p1, p2);
    }
    prevC = c;
  }
  return res;
}

/**
 * Экономика одной плотности сетки на окне (равномерная сетка).
 * @param {number} lo нижняя граница диапазона
 * @param {number} hi верхняя граница
 * @param {number} levels количество сеток (интервалов)
 * @param {object} rtInfo {rt, buys, sells} от countRoundTrips
 * @param {string} ex биржа (для комиссии)
 */
export function levelsEconomics(lo, hi, levels, rtInfo, ex = 'binance') {
  const rt = +rtInfo?.rt || 0;
  const buys = +rtInfo?.buys || 0;
  const sells = +rtInfo?.sells || 0;
  const span = +hi - +lo;
  const L = Math.max(2, Math.min(LEVELS_SCAN_MAX, levels | 0));
  const step = span / L;
  const fee = roundTripFeePct(ex); // % за round-trip (2 мейкера + slippage)
  const avg = (lo + hi) / 2;
  const grossCyclePct = (step / avg) * 100; // % между уровнями
  const netPerRt = grossCyclePct - fee;
  const gross = rt * grossCyclePct;
  const net = rt * netPerRt;
  const fees = rt * fee;
  const feeShare = gross > 0 ? fees / gross : 0;
  return {
    levels: L,
    step,
    stepPct: grossCyclePct,
    rt, buys, sells,
    gross, net, fees, feeShare,
    stepOk: stepPctFloorOk(grossCyclePct, fee),
  };
}

/** Шаг проходит комиссионный пол? step% ≥ 3×RT (комиссии ≤ ~30% грязной прибыли). */
export function stepPctFloorOk(stepPct, feePct) {
  return stepPct >= 3 * feePct - 1e-9;
}

/**
 * Полный скан плотностей N=min..max на одном окне свечей.
 * Сложность O(bars · levelsMax · log) — для 3000 баров × 59 вариантов
 * это сотни тысяч дешёвых операций, единицы миллисекунд.
 *
 * @param {Array} candles окно {t,o,h,l,c} от точки старта
 * @param {number} lo нижняя граница диапазона
 * @param {number} hi верхняя граница
 * @param {object} opt {ex, min, max, deposit}
 * @returns {Array} строки по N (по возрастанию N):
 *   {levels, step, stepPct, rt, buys, sells, gross, net, fees, feeShare,
 *    stepOk, netOfDeposit} — чистая прибыль в $ от депозита
 */
export function scanLevels(candles, lo, hi, opt = {}) {
  const out = [];
  if (!Array.isArray(candles) || candles.length < 5) return out;
  if (!(hi > lo)) return out;
  const ex = opt.ex || 'binance';
  const min = Math.max(LEVELS_SCAN_MIN, opt.min ?? LEVELS_SCAN_MIN);
  const max = Math.min(LEVELS_SCAN_MAX, opt.max ?? LEVELS_SCAN_MAX);
  const deposit = Math.max(1, +opt.deposit || 500);
  const span = hi - lo;
  for (let L = min; L <= max; L++) {
    const step = span / L;
    const grid = Array.from({ length: L + 1 }, (_, i) => lo + step * i);
    const rti = countRoundTrips(candles, grid);
    const e = levelsEconomics(lo, hi, L, rti, ex);
    // Нормировка на депо: ордер уровня = deposit/N (как у биржевого грида),
    // итог в $ — ЭТА величина является целевой при выборе N.
    e.netOfDeposit = (e.net / 100) * (deposit / L);
    out.push(e);
  }
  return out;
}

/** Целевая метрика строки (для ранжирования и heat): $-прибыль, fallback — %. */
export function rowValue(r) {
  if (r == null) return -Infinity;
  if (Number.isFinite(+r.netOfDeposit)) return +r.netOfDeposit;
  return Number.isFinite(+r.net) ? +r.net : -Infinity;
}

/**
 * Выбрать оптимальное N из результатов скана.
 *
 * Правило (обсуждено с владельцем):
 *  1. Кандидаты только со stepOk=true (шаг ≥ 3×RT: комиссии ≤ ~30% грязной
 *     прибыли). Если таких нет — наименее плохой по net.
 *  2. Максимум $-прибыли (netOfDeposit).
 *  3. При равной прибыли (±2%) — МЕНЬШЕЕ N: та же прибыль меньшим числом
 *     ордеров = не избыточная сетка (меньше комиссий на будущее).
 *
 * @param {Array} rows вывод scanLevels
 * @returns {object|null} лучший ряд или null (пустой скан)
 */
export function pickOptimalLevels(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const ok = rows.filter((r) => r.stepOk);
  const pool = ok.length ? ok : rows;
  let bestVal = -Infinity;
  for (const r of pool) bestVal = Math.max(bestVal, rowValue(r));
  if (!isFinite(bestVal)) return pool[0] || null;
  const tie = 0.02 * Math.max(Math.abs(bestVal), 1e-9);
  let best = null;
  for (const r of pool) {
    if (bestVal - rowValue(r) <= tie) {
      if (best == null || r.levels < best.levels) best = r;
    }
  }
  return best || pool[0];
}

/**
 * «Тепловая» метка для строки N: нормированный 0..1 фактор для раскраски.
 * Не отдельная метрика — тот же $-результат, приведённый к диапазону скана,
 * чтобы весь диапазон N был виден одним цветовым градиентом.
 */
export function levelsHeatFactor(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const v = rowValue(r);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const rng = max - min;
  return rows.map((r) => ({ levels: r.levels, heat: rng > 1e-12 ? (rowValue(r) - min) / rng : 0.5 }));
}
