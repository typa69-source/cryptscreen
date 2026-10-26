// ───────────────────────────────────────────────────────────────
//  CHART VIEW GUARD — «не скачи, не смещайся»
//
//  Единственная ответственность модуля: решить, надо ли вообще
//  трогать вьюпорт графика после замены данных, и если да — то
//  каким именно диапазоном. Правила выведены из фактического
//  поведения lightweight-charts 4.1.3 (замерено полигоном):
//
//   1. series.setData() САМ сохраняет видимое ВРЕМЯ: при догрузке
//      истории (prepend 40 баров) getVisibleRange() не меняется,
//      а getVisibleLogicalRange() сдвигается ровно на prepend.
//      → любая наша «компенсация» поверх этого = двойной сдвиг.
//   2. При append бара справа вьюпорт прокручивается вместе с
//      последним баром — это нормально и трогать нельзя.
//   3. При полной смене окна данных вьюпорт сохраняет ЛОГИЧЕСКИЕ
//      индексы → видимое время уезжает. Тут нужно восстановление
//      по времени (если новый набор покрывает старое окно).
//   4. В LWC 4.1.3 у IPriceScaleApi НЕТ getVisibleRange/
//      setVisibleRange — код «сохранения цены» физически не может
//      работать и только создаёт иллюзию защиты.
//
//  Поэтому: 'keep' по умолчанию, точечные вмешательства только там,
//  где LWC действительно ошибается.
// ───────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Минимум свечей в окне. Меньше — это не «вид», а артефакт: такой диапазон
 * рождается в гонке при инициализации (контейнер ещё нулевой ширины) или от
 * случайного оверзума колесом/трекпадом. Пользователь видит «2 огромные
 * свечи на весь график», причём состояние запоминается и возвращается после
 * каждой перезагрузки данных.
 */
export const MIN_VISIBLE_BARS = 6;

/**
 * Шаг баров в СЕКУНДАХ. Внимание на единицы: LWC отдаёт время в секундах
 * (UTCTimestamp), а бары в приложении — в миллисекундах. Без приведения
 * «23 свечи» считаются одной, и защита бьёт по нормальному зуму.
 */
function barStepSec(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const a = toSec(tOf(candles[0]));
  const b = toSec(tOf(candles[candles.length - 1]));
  if (!isNum(a) || !isNum(b) || b <= a) return 0;
  return (b - a) / (candles.length - 1);
}

/** Минимальная ШИРИНА окна по времени (в секундах LWC) для min баров. */
export function minTimeSpanSec(candles, min = MIN_VISIBLE_BARS) {
  const step = barStepSec(candles);
  return step > 0 ? step * (min - 1) : 0;
}

/** Миллисекунды → секунды, если значение явно в миллисекундах. */
function toSec(t) {
  if (!isNum(t)) return null;
  return t > 1e11 ? t / 1000 : t;
}

/**
 * Сколько СВЕЧЕЙ реально видно. Считаем по времени, а не по логическому
 * диапазону: логический включает пустоту справа (rightOffset), из-за чего
 * окно с одной свечой выглядит «широким».
 */
export function viewBarCount(view, candles) {
  if (!view) return 0;
  const step = barStepSec(candles);
  const from = view.time ? toSec(view.time.from) : null;
  const to = view.time ? toSec(view.time.to) : null;
  if (step > 0 && isNum(from) && isNum(to) && to >= from) {
    return Math.round((to - from) / step) + 1;
  }
  if (view.log) return Math.max(0, Math.round(view.log.to - view.log.from));
  return 0;
}

/** Диапазон вырожден: свечей меньше минимума (или свечей вообще нет в окне). */
export function isDegenerateView(view, candles, min = MIN_VISIBLE_BARS) {
  if (!view) return true;
  if (Array.isArray(candles) && candles.length > 0 && candles.length < min) return false;
  return viewBarCount(view, candles) < min;
}

/** Расширить логический диапазон до min баров, оставив правый край на месте. */
export function widenLogicalRange(range, min = MIN_VISIBLE_BARS) {
  if (!range || !isNum(range.from) || !isNum(range.to)) return null;
  const span = range.to - range.from;
  if (span >= min) return { from: range.from, to: range.to };
  return { from: range.to - min, to: range.to };
}

/**
 * Сколько ЛОГИЧЕСКИХ слотов нужно, чтобы в окне было min СВЕЧЕЙ.
 * Справа окно всегда содержит пустоту rightOffset, поэтому слотов нужно
 * больше: иначе окно из 6 слотов при отступе 5 показывает 1–2 свечи —
 * те самые «2 огромные свечи на весь график».
 */
export function slotsForBars(tsApi, min = MIN_VISIBLE_BARS) {
  let ro = 0;
  try {
    if (tsApi && typeof tsApi.options === 'function') {
      const o = tsApi.options();
      if (o && isNum(o.rightOffset)) ro = Math.max(0, Math.min(36, o.rightOffset));
    }
  } catch (e) {}
  return Math.round(min + ro);
}

/**
 * Поставить нижнюю границу зума на живом графике: если видно меньше min
 * свечей — расширяем окно влево, оставляя правый край. Возвращает true,
 * если пришлось поправить. Считаем именно СВЕЧИ (по времени), а не слоты.
 */
export function enforceMinVisibleBars(tsApi, candles, min = MIN_VISIBLE_BARS) {
  if (!tsApi || (Array.isArray(candles) && candles.length > 0 && candles.length < min)) return false;
  const view = captureView(tsApi);
  if (!view.log) return false;
  const bars = viewBarCount(view, candles);
  if (bars >= min) return false;
  // Каждый добавленный слева слот даёт примерно одну свечу, поэтому дефицит
  // свечей = столько же добавленных слотов (+1 на округление). Так работает и
  // когда справа пустота отступа: она не «съедает» поправку.
  const span = view.log.to - view.log.from;
  const deficit = Math.max(0, min - bars);
  const need = Math.max(span + deficit + 1, Math.min(min, slotsForBars(tsApi, min)));
  const widened = widenLogicalRange(view.log, need);
  if (!widened) return false;
  if (typeof window !== 'undefined') window.__vtag = 'floor';
  try {
    if (typeof tsApi.setVisibleLogicalRange !== 'function') return false;
    tsApi.setVisibleLogicalRange(widened);
    return true;
  } catch (e) {
    return false;
  }
}

function tOf(k) {
  if (!k) return null;
  const v = isNum(k.t) ? k.t : k.time;
  return isNum(v) ? v : null;
}

/** Снимок текущего вьюпорта. Никогда не бросает. */
export function captureView(tsApi) {
  const out = { log: null, time: null, barSpacing: null };
  if (!tsApi) return out;
  try {
    if (typeof tsApi.getVisibleLogicalRange === 'function') {
      const r = tsApi.getVisibleLogicalRange();
      if (r && isNum(r.from) && isNum(r.to) && r.to > r.from) out.log = { from: r.from, to: r.to };
    }
  } catch (e) {}
  try {
    if (typeof tsApi.getVisibleRange === 'function') {
      const r = tsApi.getVisibleRange();
      if (r && isNum(r.from) && isNum(r.to) && r.to >= r.from) out.time = { from: r.from, to: r.to };
    }
  } catch (e) {}
  try {
    if (typeof tsApi.options === 'function') {
      const o = tsApi.options();
      if (o && isNum(o.barSpacing)) out.barSpacing = o.barSpacing;
    }
  } catch (e) {}
  return out;
}

/** Метаданные набора баров: длина + границы по времени. */
export function candleMeta(candles) {
  if (!Array.isArray(candles) || !candles.length) return { len: 0, firstT: null, lastT: null };
  // ВАЖНО: время отдаём в СЕКУНДАХ — в тех же единицах, что и LWC
  // (getVisibleRange/setVisibleRange). Бары приходят в миллисекундах, и
  // смешение единиц давало диапазоны «вне данных»: LWC прижимал окно к
  // последним 1–2 свечам — те самые «2 огромные свечи на весь график».
  const firstT = toSec(tOf(candles[0]));
  const lastT = toSec(tOf(candles[candles.length - 1]));
  return { len: candles.length, firstT, lastT };
}

/**
 * Что именно произошло с данными:
 * 'none'    — набор тот же (ни одного нового бара);
 * 'append'  — только добавились справа (реалтайм);
 * 'prepend' — добавились слева (догрузка истории);
 * 'both'    — и слева, и справа;
 * 'swap'    — окно данных другое (смена ТФ/символа/диапазона);
 * 'unknown' — не с чем сравнивать (первая отрисовка).
 */
export function classifyDataChange(prevMeta, nextMeta) {
  if (!prevMeta || !prevMeta.len || !nextMeta || !nextMeta.len) return 'unknown';
  if (prevMeta.firstT == null || prevMeta.lastT == null || nextMeta.firstT == null) return 'unknown';
  const sameLen = nextMeta.len === prevMeta.len;
  const sameFirst = nextMeta.firstT === prevMeta.firstT;
  const sameLast = nextMeta.lastT === prevMeta.lastT;
  if (sameLen && sameFirst && sameLast) return 'none';
  const left = nextMeta.firstT < prevMeta.firstT;
  const right = nextMeta.lastT > prevMeta.lastT;
  if (left && right) return 'both';
  if (left) return sameLast ? 'prepend' : 'swap';
  if (right) return sameFirst ? 'append' : 'swap';
  return 'swap';
}

/**
 * Индекс, на который сместились прежние бары после вставки слева.
 * Считается по ВРЕМЕНИ первого прежнего бара, а не по разнице длин:
 * разница длин врёт, если между fetch и setData прилетел реалтайм-бар
 * или если кэш подрезался по HIST_CACHE_MAX.
 */
export function shiftOfFirstBar(oldFirstT, candles) {
  if (!isNum(oldFirstT) || !Array.isArray(candles)) return 0;
  const limit = toSec(oldFirstT);
  let n = 0;
  for (let i = 0; i < candles.length; i++) {
    const t = toSec(tOf(candles[i]));
    if (t == null || t >= limit) break;
    n++;
  }
  return n;
}

/** Ограничить диапазон времени рамками данных, сохранив его ширину. */
export function clampTimeRangeToData(range, candles) {
  if (!range || !isNum(range.from) || !isNum(range.to)) return null;
  const m = candleMeta(candles);
  if (!m.len) return null;
  const span = range.to - range.from;
  let from = range.from;
  let to = range.to;
  if (from < m.firstT) {
    from = m.firstT;
    to = from + span;
  }
  if (to > m.lastT) {
    to = m.lastT;
    from = Math.max(m.firstT, to - span);
  }
  if (!(to > from)) return null;
  return { from, to };
}

/**
 * Решение по вьюпорту.
 * → { mode:'keep' }                      ничего не делать (по умолчанию)
 * → { mode:'logical', range:{from,to} }  сдвиг на число вставленных слева баров
 * → { mode:'time', range:{from,to} }     восстановление по времени (сменилось окно)
 */
export function planViewRestore({ view, prevMeta, nextMeta, candles } = {}) {
  const keep = { mode: 'keep' };
  if (!view) return keep;
  // Вырожденный текущий вид (гонка при инициализации / оверзум) не
  // восстанавливаем: иначе «2 огромные свечи» закрепляются навсегда.
  if (isDegenerateView(view, candles)) return keep;
  const kind = classifyDataChange(prevMeta, nextMeta);
  if (kind === 'unknown' || kind === 'none' || kind === 'append') return keep;

  if (kind === 'prepend' || kind === 'both') {
    // LWC и так сохраняет время при prepend, но: (а) не всегда (см. п.3
    // шапки — при подрезке кэша/смене окна он держит индексы), (б) при
    // пустоте слева (from<0) восстановление по времени обрезается к
    // первому бару и «схлопывает» зум. Логический сдвиг корректен в
    // обоих случаях и не зависит от разницы длин.
    if (view.log && isNum(prevMeta?.firstT)) {
      const shift = shiftOfFirstBar(prevMeta.firstT, candles);
      if (shift > 0) return { mode: 'logical', range: { from: view.log.from + shift, to: view.log.to + shift } };
    }
    if (view.time) {
      const r = clampTimeRangeToData(view.time, candles);
      if (r) return { mode: 'time', range: r };
    }
    return keep;
  }

  // kind === 'swap': индексы LWC сохраняет, а время уезжает — вернём время.
  if (view.time) {
    const r = clampTimeRangeToData(view.time, candles);
    if (r) return { mode: 'time', range: r };
  }
  return keep;
}

/** Применить решение. Никогда не бросает; возвращает true, если тронули вьюпорт. */
export function applyViewPlan(tsApi, plan) {
  if (!tsApi || !plan || plan.mode === 'keep' || !plan.range) return false;
  if (typeof window !== 'undefined') window.__vtag = 'plan:' + plan.mode;
  const { from, to } = plan.range;
  if (!isNum(from) || !isNum(to)) return false;
  try {
    if (plan.mode === 'time') {
      if (typeof tsApi.setVisibleRange !== 'function') return false;
      tsApi.setVisibleRange({ from, to });
      return true;
    }
    if (typeof tsApi.setVisibleLogicalRange !== 'function') return false;
    tsApi.setVisibleLogicalRange({ from, to });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Применить план так, чтобы НЕ было видимого скачка.
 * Замерено по кадрам на полигоне LWC 4.1.3: синхронный вызов сразу после
 * setData попадает в ту же очередь инвалидаций, что и данные/дефолтный вид,
 * и побеждает — окно правильное уже на ПЕРВОМ нарисованном кадре. Отложенное
 * применение (только rAF) даёт 2-3 кадра чужого окна, если перед ним успел
 * примениться дефолтный вид — это и есть «дёрнулся на долю секунды».
 * Поэтому: сначала синхронно, затем повторы на следующих кадрах как страховка
 * (rAF в фоновой вкладке троттлится → таймаут; план идемпотентен).
 */
export function applyViewPlanAsync(tsApi, plan, opts = {}) {
  if (!tsApi || !plan || plan.mode === 'keep' || !plan.range) return false;
  const applied = applyViewPlan(tsApi, plan);
  const delay = isNum(opts.delayMs) ? opts.delayMs : 0;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    // Отложенная страховка нужна только если пользователь не занял график
    // сам: иначе его перетаскивание/зум отменяется через 48 мс после начала.
    if (typeof opts.shouldRetry === 'function' && !opts.shouldRetry()) return;
    applyViewPlan(tsApi, plan);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  }
  if (typeof setTimeout === 'function') setTimeout(run, Math.max(delay, 48));
  return applied;
}

/** Ключ контекста графика: вид запоминается отдельно для каждого символа/ТФ. */
export function viewContextKey(sym, tf) {
  return `${sym || ''}|${tf || ''}`;
}

/**
 * Запомнить «вид пользователя» — то, что он сам поставил мышью.
 * Именно этот вид восстанавливается после перезагрузки данных/self-heal,
 * вместо дефолтного «последние N баров».
 */
export function rememberUserView(ch, view, ctxKey, candles) {
  if (!ch || !view || !view.log) return false;
  // Вырожденный вид не запоминаем — сохраняем последний нормальный.
  if (isDegenerateView(view, candles)) {
    // А если вырожденным оказался уже запомненный вид (так бывает, когда
    // чарт создаётся нулевой ширины), — выбрасываем его совсем, чтобы
    // применился дефолтный вид, а не «6 свечей на весь график».
    if (ch._userView && isDegenerateView({ log: ch._userView.log, time: ch._userView.time }, candles)) {
      ch._userView = null;
    }
    return false;
  }
  ch._userView = {
    log: { from: view.log.from, to: view.log.to },
    time: view.time ? { from: view.time.from, to: view.time.to } : null,
    bars: viewBarCount(view, candles),
    ctx: ctxKey,
    at: Date.now(),
  };
  return true;
}

/**
 * План восстановления ПОЛЬЗОВАТЕЛЬСКОГО вида после перезагрузки данных.
 * Тот же контекст (символ+ТФ) → возвращаем его вид; другой контекст или
 * ничего не запомнено → 'keep' (вызывающий применит дефолтный вид).
 * Вырожденный запомненный вид расширяем до MIN_VISIBLE_BARS, а не
 * воспроизводим как есть.
 */
export function planUserViewRestore(ch, ctxKey, candles) {
  const uv = ch && ch._userView;
  if (!uv || uv.ctx !== ctxKey) return { mode: 'keep' };
  const degenerate = isDegenerateView({ log: uv.log, time: uv.time }, candles);
  if (degenerate) {
    const widened = widenLogicalRange(uv.log, MIN_VISIBLE_BARS + 4);
    if (widened) return { mode: 'logical', range: widened };
    return { mode: 'keep' };
  }
  if (uv.time) {
    const r = clampTimeRangeToData(uv.time, candles);
    if (r) return { mode: 'time', range: r };
  }
  if (uv.log) return { mode: 'logical', range: { from: uv.log.from, to: uv.log.to } };
  return { mode: 'keep' };
}

/**
 * Полный цикл: снимок → paint (замена данных) → восстановление по правилам.
 * Возвращает { plan, applied, view } — удобно и для вызовов, и для тестов.
 */
export function withStableView(tsApi, paint, opts = {}) {
  const view = captureView(tsApi);
  if (typeof paint === 'function') paint();
  const plan = planViewRestore({
    view,
    prevMeta: opts.prevMeta || null,
    nextMeta: opts.nextMeta || null,
    candles: opts.candles,
  });
  const applied = applyViewPlan(tsApi, plan);
  return { plan, applied, view };
}