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
  const firstT = tOf(candles[0]);
  const lastT = tOf(candles[candles.length - 1]);
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
  let n = 0;
  for (let i = 0; i < candles.length; i++) {
    const t = tOf(candles[i]);
    if (t == null || t >= oldFirstT) break;
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
 * Применить план ПОСЛЕ кадра (замерено полигоном LWC 4.1.3: сразу после setData
 * библиотека на следующем кадре делает собственный fit и гасит наш сеттер —
 * тогда восстановление окна «то срабатывает, то нет» = те самые скачки).
 * rAF в фоновой вкладке троттлится, поэтому страхуемся таймаутом: кто первый.
 */
export function applyViewPlanAsync(tsApi, plan, opts = {}) {
  if (!tsApi || !plan || plan.mode === 'keep' || !plan.range) return false;
  const delay = isNum(opts.delayMs) ? opts.delayMs : 0;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    applyViewPlan(tsApi, plan);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  }
  if (typeof setTimeout === 'function') setTimeout(run, Math.max(delay, 32));
  return true;
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
export function rememberUserView(ch, view, ctxKey) {
  if (!ch || !view || !view.log) return false;
  ch._userView = {
    log: { from: view.log.from, to: view.log.to },
    time: view.time ? { from: view.time.from, to: view.time.to } : null,
    ctx: ctxKey,
    at: Date.now(),
  };
  return true;
}

/**
 * План восстановления ПОЛЬЗОВАТЕЛЬСКОГО вида после перезагрузки данных.
 * Тот же контекст (символ+ТФ) → возвращаем его вид; другой контекст или
 * ничего не запомнено → 'keep' (вызывающий применит дефолтный вид).
 */
export function planUserViewRestore(ch, ctxKey, candles) {
  const uv = ch && ch._userView;
  if (!uv || uv.ctx !== ctxKey) return { mode: 'keep' };
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