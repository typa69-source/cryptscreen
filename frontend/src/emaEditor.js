// ═══════════════════════════════════════════════════════════════
//  emaEditor.js — pure helpers for the EMA editor modal.
//
//  All helpers here are stateless: they read EMA settings arrays /
//  simple state objects passed in, and return new values. They never
//  touch the DOM, never mutate S, never repaint charts.
//
//  Render and event handlers live in emaEditor-ui.js (deps-injected).
// ═══════════════════════════════════════════════════════════════

/** Palette used by the color picker in the EMA editor. First unused colour
 *  becomes the default for newly-added EMAs (see `nextAvailableColor`). */
export const EMA_COLORS = [
  '#f97316', '#3b82f6', '#a855f7', '#e04040',
  '#1fa891', '#eab308', '#ec4899', '#22c55e',
];

/** Validation: minimum allowed EMA period. */
export const EMA_MIN_PERIOD = 2;
/** Validation: maximum allowed EMA period. */
export const EMA_MAX_PERIOD = 500;
/** Default period assigned when adding a new EMA line. */
export const EMA_DEFAULT_PERIOD = 9;

/**
 * Validate a user-entered EMA period.
 * Returns { valid: boolean, value?: number } — value is a clean integer
 * when valid, or the original input clamped into the allowed range when
 * out-of-bounds, with valid=false so callers can show feedback.
 *
 *   ""        → invalid (empty)
 *   "abc"     → invalid (NaN)
 *   1         → invalid (below min, suggests 2)
 *   2         → valid (2)
 *   9.7       → valid (10 — rounded)
 *   999       → invalid (above max, suggests 500)
 */
export function validateEmaPeriod(raw) {
  if (raw === '' || raw == null) return { valid: false, reason: 'empty' };
  const n = Number(raw);
  if (!isFinite(n) || isNaN(n)) return { valid: false, reason: 'nan' };
  const i = Math.round(n);
  if (i < EMA_MIN_PERIOD) {
    return { valid: false, reason: 'below_min', suggested: EMA_MIN_PERIOD };
  }
  if (i > EMA_MAX_PERIOD) {
    return { valid: false, reason: 'above_max', suggested: EMA_MAX_PERIOD };
  }
  return { valid: true, value: i };
}

/**
 * Pick the first EMA_COLORS entry that's NOT already used by `settings`.
 * Falls back to the first colour when every colour is taken.
 */
export function nextAvailableColor(settings) {
  const used = new Set((settings || []).map(c => c.color));
  return EMA_COLORS.find(c => !used.has(c)) || EMA_COLORS[0];
}

/**
 * Build a fresh EMA config with the given period and an auto-picked colour.
 */
export function makeEmaConfig(settings, period = EMA_DEFAULT_PERIOD) {
  return {
    period,
    color: nextAvailableColor(settings),
    visible: true,
  };
}

/**
 * Extract the visible periods from a settings array, sorted ascending and
 * de-duplicated. Used to enumerate the (i, j) pair grid for cross-alerts.
 */
export function visiblePeriods(settings) {
  if (!Array.isArray(settings)) return [];
  const out = [...new Set(settings.filter(c => c.visible).map(c => c.period))];
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Generate the (i, j) EMA-cross-alert pair list for the given visible
 * periods. Reuses existing pair objects from `existingPairs` when they
 * match (so enabled state survives re-renders).
 *
 *   pairKey(a, b) = `${a}-${b}` with a < b — guaranteed by the caller.
 *
 * Returns the new pair list (does not mutate existingPairs).
 */
export function buildEmaAlertPairs(periods, existingPairs) {
  const byKey = new Map();
  for (const p of existingPairs || []) {
    const a = Math.min(p.a, p.b), b = Math.max(p.a, p.b);
    byKey.set(`${a}-${b}`, { ...p, a, b });
  }
  const out = [];
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i], b = periods[j];
      const key = `${a}-${b}`;
      if (byKey.has(key)) out.push(byKey.get(key));
      else out.push({ a, b, enabled: false });
    }
  }
  return out;
}

/**
 * Compute the EMA toolbar button state.
 *
 *   active = S.emaVisible (global toggle) OR any per-symbol toggle.
 *   hasSymEnabled = true if the current symbol has its own toggle on.
 *
 * Pure: returns the object, caller decides where to render it.
 */
export function emaButtonState({ emaVisible, emaSymEnabled, fsSym }) {
  const hasSymEnabled = fsSym ? !!emaSymEnabled[fsSym] : false;
  const active = !!emaVisible || hasSymEnabled;
  return { active, hasSymEnabled };
}

/**
 * Format a symbol for display: strips the trailing "USDT" suffix.
 */
export function fmtEmaSym(sym) {
  return (sym || '').replace(/USDT$/, '');
}

/**
 * Resolve the active symbol for the editor header. Prefers the per-symbol
 * edit target, falls back to the fullscreen symbol, then the first chart's
 * symbol, then null.
 */
export function resolveEmaActiveSym({ editSym, fsSym, charts }) {
  if (editSym) return editSym;
  if (fsSym) return fsSym;
  const c = (charts || []).find(x => x?.sym);
  return c?.sym || null;
}
