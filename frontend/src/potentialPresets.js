// ═══════════════════════════════════════════════════════════════
//  POTENTIAL PRESETS — pure logic
// ═══════════════════════════════════════════════════════════════
//
// Constants and pure evaluation helpers for the "Potential" preset
// monitor. UI lives in potentialPresets-ui.js.

/** Step / label / unit metadata for each condition field. */
export const POT_FIELDS = [
  { id: 'ch24',       label: 'ИЗМ 24ч %',  unit: '%',  step: 0.5 },
  { id: 'ch7d',       label: 'ИЗМ 7д %',   unit: '%',  step: 0.5 },
  { id: 'cday',       label: 'ИЗМ день %', unit: '%',  step: 0.5 },
  { id: 'bbSqz',      label: 'BB Squeeze', unit: '',   step: 1 },
  { id: 'bbBreak',    label: 'BB Breakout',unit: '',   step: 1 },
  { id: 'volImpulse', label: 'Volume impulse', unit: '', step: 1 },
  { id: 'emaTouch',   label: 'EMA touch',  unit: '',   step: 1 },
  { id: 'vr5',        label: 'ОБ* 5м',     unit: '×',  step: 0.1 },
  { id: 'vr1h',       label: 'ОБ* 1ч',     unit: '×',  step: 0.1 },
  { id: 'tr5',        label: 'СД* 5м',     unit: '×',  step: 0.1 },
  { id: 'tr1h',       label: 'СД* 1ч',     unit: '×',  step: 0.1 },
  { id: 'na14',       label: 'NATR 5м',    unit: '%',  step: 0.01 },
  { id: 'na30',       label: 'NATR 1м',    unit: '%',  step: 0.01 },
  { id: 'trd24',      label: 'Сделки 24ч', unit: '',   step: 50 },
  { id: 'vol24',      label: 'Объём 24ч',  unit: 'M$', step: 10 },
];

/** Long description per field — used in editor and panel. */
export const POT_FIELD_DESC = {
  ch24: 'Изменение цены за 24 часа в процентах.',
  ch7d: 'Изменение цены за 7 дней в процентах.',
  cday: 'Изменение цены с начала текущего дня в процентах.',
  bbSqz: 'Полосы Боллинджера сжались относительно прошлого бара (узкий диапазон).',
  bbBreak: 'Цена вышла за верхнюю/нижнюю полосу Боллинджера на последней свече.',
  volImpulse: 'Есть всплеск объёма: ОБ* 5м >= 1.25 относительно последних 14 свечей.',
  emaTouch: 'Касание EMA выбранного периода последней свечой (high/low пересекает EMA).',
  vr5: 'Объём последней 5м свечи к среднему объёму за 14 свечей.',
  vr1h: 'Объём последней 1ч свечи к среднему за 24 часа.',
  tr5: 'Сделки последней 5м свечи к среднему за 14 свечей.',
  tr1h: 'Сделки последней 1ч свечи к среднему за 24 часа.',
  na14: 'NATR на 5м (волатильность относительно цены).',
  na30: 'NATR на 1м (волатильность относительно цены).',
  trd24: 'Количество сделок за 24 часа.',
  vol24: 'Торговый объём за 24 часа в миллионах USDT.',
};

/** Fields that accept |.| (absolute value) modifier. */
export const POT_ABS_FIELDS = new Set(['ch24', 'ch7d', 'cday', 'bbBreak']);

/** Clamp EMA period into a sane range. */
export function clampEmaPeriod(p) {
  return Math.max(2, Math.min(400, p | 0));
}

/**
 * Compute the EMA-touch signal for a symbol:
 *   1 if last candle's [low, high] contains the EMA(period),
 *   0 otherwise.
 *
 * @param {Array<{h:number,l:number,c:number,t:number}>} k5
 * @param {Function} calcEMA - injected to avoid module cycles
 * @param {number} period
 * @returns {0|1}
 */
export function evalEmaTouchSignal(k5, calcEMA, period) {
  const p = clampEmaPeriod(period);
  if (!Array.isArray(k5) || k5.length < p + 1) return 0;
  const vals = calcEMA(k5, p);
  if (!vals || !vals.length) return 0;
  const last = k5[k5.length - 1];
  const ema = vals[vals.length - 1].val;
  if (!last || !isFinite(ema)) return 0;
  return (last.l <= ema && last.h >= ema) ? 1 : 0;
}

/**
 * Read the raw value for a condition, normalising field name and unit.
 *
 * @param {object} cond - {field, min, max, abs, period?}
 * @param {object} m - metric snapshot S.mx[sym]
 * @param {Array} k5 - 5m candles S.k5m[sym]
 * @param {Function} calcEMA - EMA calculator
 * @returns {number|null}
 */
export function readConditionValue(cond, m, k5, calcEMA) {
  let field = cond.field;
  // Legacy alias
  if (field === 'sqzPop') field = 'bbSqz';
  let val = (field === 'emaTouch')
    ? evalEmaTouchSignal(k5, calcEMA, cond.period || 20)
    : m ? m[field] : null;
  // vol24 in USDT → M$ in editor
  if (field === 'vol24' && val != null) val = val / 1e6;
  if (cond.abs && POT_ABS_FIELDS.has(field) && val != null) val = Math.abs(val);
  return val;
}

/**
 * Evaluate a single condition against a metric snapshot.
 *
 * @returns {boolean} true if the metric satisfies the condition
 */
export function evalCondition(cond, m, k5, calcEMA) {
  const val = readConditionValue(cond, m, k5, calcEMA);
  if (val == null || isNaN(val)) return false;
  if (cond.min != null && val < cond.min) return false;
  if (cond.max != null && val > cond.max) return false;
  return true;
}

/**
 * Evaluate a preset against a metric snapshot.
 * Returns true only if ALL conditions are met.
 */
export function evalPreset(preset, m, k5, calcEMA) {
  if (!preset?.conditions?.length) return false;
  return preset.conditions.every(c => evalCondition(c, m, k5, calcEMA));
}

/**
 * Build a fresh preset record.
 */
export function makePreset(name, conditions, opts = {}) {
  return {
    id: opts.id || `pot${Date.now()}`,
    name,
    conditions: conditions.map(c => ({ ...c })),
    matches: {},
    alerted: {},
    enabled: opts.enabled !== false,
    cooldown: opts.cooldown || 60,
  };
}

/**
 * Add (or return existing) builtin squeeze preset.
 * Idempotent: if a preset with the same name exists, returns it.
 */
export function ensureBuiltinSqueezePreset(presets) {
  const existing = presets.find(p => p.name === 'BB squeeze + Volume impulse + Breakout');
  if (existing) return existing;
  const pr = {
    id: `pot_sqz_${Date.now()}`,
    name: 'BB squeeze + Volume impulse + Breakout',
    conditions: [
      { field: 'bbSqz',      min: 0.99, max: null, abs: false },
      { field: 'volImpulse', min: 0.99, max: null, abs: false },
      { field: 'bbBreak',    min: 0.99, max: null, abs: true },
    ],
    matches: {},
    alerted: {},
    enabled: false,
    cooldown: 120,
  };
  presets.push(pr);
  return pr;
}

/**
 * Run a scan over `symbols` for a given preset, returning new matches.
 *
 * @param {object} preset
 * @param {string[]} symbols - S.syms
 * @param {Function} getMetric - (sym) => S.mx[sym]
 * @param {Function} getK5 - (sym) => S.k5m[sym]
 * @param {Function} calcEMA
 * @returns {{matched: string[], details: Record<string, {ts:number, price:number, ch24:number}>}}
 */
export function scanPresetMatches(preset, symbols, getMetric, getK5, calcEMA) {
  const matched = [];
  const details = {};
  for (const sym of symbols) {
    const m = getMetric(sym);
    if (!m) continue;
    if (!evalPreset(preset, m, getK5(sym), calcEMA)) continue;
    matched.push(sym);
    details[sym] = {
      ts: preset.matches?.[sym]?.ts || Date.now(),
      price: m.price,
      ch24: m.ch24,
    };
  }
  return { matched, details };
}

/**
 * Determine which matches are new (not present in the previous frame)
 * and which have left. Returns a stable list of newly matched symbols
 * that should be alerted (respecting cooldown).
 *
 * @param {string[]} newlyMatched
 * @param {object} preset
 * @param {number} now - Date.now()
 * @returns {string[]} symbols to alert
 */
export function selectAlertableSymbols(newlyMatched, preset, now) {
  const coolMs = (preset.cooldown || 60) * 1000;
  const out = [];
  for (const sym of newlyMatched) {
    const last = preset.alerted?.[sym] || 0;
    if (now - last > coolMs) out.push(sym);
  }
  return out;
}

/**
 * Count total matches across all enabled presets.
 */
export function totalActiveMatches(presets) {
  let n = 0;
  for (const p of presets) {
    if (!p.enabled) continue;
    n += Object.keys(p.matches || {}).length;
  }
  return n;
}

/**
 * Pretty-print a single condition for the panel summary.
 *
 * @returns {string}
 */
export function fmtConditionTag(cond) {
  const f = POT_FIELDS.find(x => x.id === cond.field);
  const parts = [];
  if (cond.field === 'emaTouch') {
    parts.push(`period=${clampEmaPeriod(cond.period || 20)}`);
  } else {
    if (cond.min != null) parts.push(`≥${cond.min}${f?.unit || ''}`);
    if (cond.max != null) parts.push(`≤${cond.max}${f?.unit || ''}`);
  }
  const absTxt = cond.abs && POT_ABS_FIELDS.has(cond.field) ? '|.| ' : '';
  return `${absTxt}${f?.label || cond.field} ${parts.join(' ')}`.trim();
}

/**
 * Format the per-symbol value cell inside a match list row.
 *
 * @param {*} val - numeric value (may be 0, 1, etc.)
 * @param {object} cond
 * @returns {string}
 */
export function fmtConditionValue(val, cond, fmtHelpers = {}) {
  const { fn = (v, d) => Number(v).toFixed(d), fk = (v) => String(v) } = fmtHelpers;
  if (cond.field === 'vol24' || cond.field === 'trd24') return fk(val);
  if (cond.field === 'bbSqz' || cond.field === 'volImpulse') return (val != null && +val >= 1) ? '✓' : '·';
  if (cond.field === 'bbBreak') return val > 0 ? '↑' : val < 0 ? '↓' : '·';
  if (cond.field === 'emaTouch') {
    const p = clampEmaPeriod(cond.period || 20);
    return val >= 1 ? `✓(${p})` : `·(${p})`;
  }
  return val != null ? fn(val, 2) : '•';
}
