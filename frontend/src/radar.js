/**
 * Radar — pump/dump detector with measurable hit-rate.
 *
 * Pipeline (per symbol, 5m bars):
 *   1. Robust baseline over a lookback window: median + MAD of bar
 *      returns → z-score of the CURRENT bar return (outliers don't
 *      poison the baseline — the whole point of robust stats).
 *   2. Event: |z| ≥ threshold AND volume ratio ≥ minVolRatio
 *      (PUMP for +z, DUMP for −z).
 *   3. Confirmation: N following bars also |z| ≥ confZ — pumps that
 *      die in one bar are noise, not tradable events.
 *   4. Outcome measurement: forward returns at +15m / +1h / +4h from
 *      the detection bar — persisted, aggregated into hit-rates.
 *
 * All functions pure (arrays in, plain objects out). No DOM, no fetch,
 * no globals — unit-testable in isolation.
 */

/** Default z threshold for the detection bar (robust z). */
export const ROBUST_Z_THRESH = 6;

/** Confirmation z for the following bars (lower than detection). */
export const CONFIRM_Z = 3;

/** Default lookback for median/MAD baseline (bars). */
export const BASELINE_BARS = 240;

/** Forward horizons measured after a detection (bars of 5m). */
export const RADAR_OUTCOMES = ['+15m', '+1h', '+4h'];
const OUTCOME_BARS = { '+15m': 3, '+1h': 12, '+4h': 48 };

/**
 * Robust z-score of `x` against a baseline given by median + MAD.
 * MAD = 0 (degenerate/flat series) → null.
 */
export function robustZ(baseline, x, median) {
  if (!Array.isArray(baseline) || baseline.length < 30) return null;
  const med = median != null ? median : medianOf(baseline);
  if (med == null || !isFinite(med)) return null;
  let mad = 0;
  const devs = new Array(baseline.length);
  for (let i = 0; i < baseline.length; i++) {
    const d = Math.abs(baseline[i] - med);
    devs[i] = d;
  }
  mad = medianOf(devs);
  if (mad == null || !isFinite(mad) || mad < 1e-12) return null;
  return (x - med) / (1.4826 * mad);
}

function medianOf(arr) {
  if (!arr || !arr.length) return null;
  const s = arr.filter((v) => v != null && isFinite(v)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Detect an event on the LAST bar of the kline series.
 * Baseline = bar RETURNS over the previous `baselineBars` bars
 * (the current bar excluded — no self-inclusion).
 * Options: { thresh, minVolRatio, baselineBars }
 * Returns { kind:'PUMP'|'DUMP', idx, z, ret, volRatio, price } or null.
 */
export function detectRadarEvent(kl, opts = {}) {
  if (!Array.isArray(kl) || kl.length < 40) return null;
  const thresh = opts.thresh ?? ROBUST_Z_THRESH;
  // Volume acts as a soft gate: KNOWN low volume demotes the event
  // (noise), but missing/zero volume fields (thin coins, venue gaps)
  // must not block a price-based detection.
  const minVolRatio = opts.minVolRatio ?? 1.0;
  const baselineBars = opts.baselineBars ?? BASELINE_BARS;
  const i = kl.length - 1;
  const c = +kl[i].c;
  const prev = +kl[i - 1].c;
  if (!isFinite(c) || !isFinite(prev) || prev <= 0) return null;
  const ret = (c - prev) / prev * 100;
  // baseline returns, EXCLUDING the current bar
  const base = [];
  const start = Math.max(1, i - baselineBars);
  for (let j = start; j < i; j++) {
    const a = +kl[j].c, b = +kl[j - 1].c;
    if (isFinite(a) && isFinite(b) && b > 0) base.push((a - b) / b * 100);
  }
  const z = robustZ(base, ret);
  if (z == null || Math.abs(z) < thresh) return null;
  // Volume ratio vs the median recent volume (boost confidence, not a gate
  // by default — some venues/reporting gaps zero out volume).
  const vols = [];
  for (let j = start; j < i; j++) {
    const v = +(kl[j].qv ?? kl[j].v ?? 0);
    if (isFinite(v) && v > 0) vols.push(v);
  }
  const curV = +(kl[i].qv ?? kl[i].v ?? 0);
  let volRatio = null;
  if (vols.length >= 30 && curV > 0) {
    const medV = medianOf(vols);
    if (medV != null && medV > 0) volRatio = curV / medV;
  }
  if (volRatio != null && volRatio < minVolRatio) return null;
  return {
    kind: z > 0 ? 'PUMP' : 'DUMP',
    idx: i,
    z,
    ret,
    volRatio,
    price: c,
    t: kl[i].t,
  };
}

/**
 * Confirm an event: the move HOLDS. A real pump/dump is a level shift —
 * the price keeps at least (1 − retraceFrac) of the spike move for the
 * next `confirmBars` bars. A one-bar wick that retraces immediately is
 * noise and stays unconfirmed. Returns { confirmed, confirmCount }.
 */
export function confirmRadarEvent(kl, ev, opts = {}) {
  const confirmBars = opts.confirmBars ?? 3;
  const retraceFrac = opts.retraceFrac ?? 0.5;
  if (!ev || !Array.isArray(kl)) return { confirmed: false, confirmCount: 0 };
  const i = ev.idx;
  if (i == null || i < 1 || i >= kl.length - 1) return { confirmed: false, confirmCount: 0 };
  const c = +kl[i].c;
  const prev = +kl[i - 1].c;
  if (!isFinite(c) || !isFinite(prev)) return { confirmed: false, confirmCount: 0 };
  const move = c - prev;
  const tol = Math.abs(move) * retraceFrac;
  let count = 0;
  for (let k = i + 1; k <= Math.min(kl.length - 1, i + confirmBars); k++) {
    const f = +kl[k].c;
    if (!isFinite(f)) continue;
    const holds = move > 0 ? f >= c - tol : f <= c + tol;
    if (holds) count++;
  }
  return { confirmed: count >= confirmBars, confirmCount: count };
}

/**
 * Scan a full kline series historically: detection at every bar
 * (baseline strictly from the PAST), confirmation = the move HOLDS
 * (same semantics as confirmRadarEvent). Returns events sorted by idx.
 * Options: { thresh, confirmBars, retraceFrac, baselineBars }.
 */
export function radarEventsForSeries(kl, opts = {}) {
  const out = [];
  if (!Array.isArray(kl) || kl.length < 40) return out;
  const thresh = opts.thresh ?? ROBUST_Z_THRESH;
  const confirmBars = opts.confirmBars ?? 2;
  const retraceFrac = opts.retraceFrac ?? 0.5;
  const baselineBars = opts.baselineBars ?? BASELINE_BARS;
  // Precompute all returns once.
  const rets = new Array(kl.length).fill(null);
  for (let i = 1; i < kl.length; i++) {
    const a = +kl[i].c, b = +kl[i - 1].c;
    if (isFinite(a) && isFinite(b) && b > 0) rets[i] = (a - b) / b * 100;
  }
  // Rolling median/MAD recompute is O(n·w log w) — acceptable for 500 bars
  // in a diagnostic scan; the LIVE path uses detectRadarEvent (single bar).
  for (let i = 40; i < kl.length - confirmBars; i++) {
    const ret = rets[i];
    if (ret == null) continue;
    const base = [];
    for (let j = Math.max(1, i - baselineBars); j < i; j++) {
      if (rets[j] != null) base.push(rets[j]);
    }
    if (base.length < 30) continue;
    const z = robustZ(base, ret);
    if (z == null || Math.abs(z) < thresh) continue;
    // hold-confirmation: the level shift persists
    const c = +kl[i].c;
    const prev = +kl[i - 1].c;
    const move = c - prev;
    const tol = Math.abs(move) * retraceFrac;
    let cnt = 0;
    for (let k = i + 1; k <= Math.min(kl.length - 1, i + confirmBars); k++) {
      const f = +kl[k].c;
      if (!isFinite(f)) continue;
      if (move > 0 ? f >= c - tol : f <= c + tol) cnt++;
    }
    if (cnt < confirmBars) continue;
    out.push({
      kind: z > 0 ? 'PUMP' : 'DUMP',
      idx: i,
      z,
      ret,
      volRatio: null,
      price: c,
      t: kl[i].t,
    });
  }
  return out;
}

/**
 * Measure forward outcomes of a detected event: close-to-close returns
 * at +15m / +1h / +4h (3/12/48 bars of 5m) from the detection bar.
 * Returns { '+15m': pct|null, '+1h': pct|null, '+4h': pct|null }.
 */
export function measureRadarOutcome(kl, ev) {
  const out = { '+15m': null, '+1h': null, '+4h': null };
  if (!ev || !Array.isArray(kl) || ev.idx == null) return out;
  const i = ev.idx;
  const c = +kl[i]?.c;
  if (!isFinite(c) || c <= 0) return out;
  for (const [h, bars] of Object.entries(OUTCOME_BARS)) {
    const f = +kl[i + bars]?.c;
    if (isFinite(f) && f > 0) out[h] = (f - c) / c * 100;
  }
  return out;
}

/**
 * Aggregate outcomes into hit-rates per horizon.
 * `events` — array of { outcomes: { '+15m': number|null, ... } }.
 * Returns { '+15m': { n, wins, rate, median }, ... }.
 */
export function aggregateHitRates(events) {
  const agg = {};
  for (const h of RADAR_OUTCOMES) agg[h] = { n: 0, wins: 0, rate: 0, median: null };
  if (!Array.isArray(events)) return agg;
  const perH = { '+15m': [], '+1h': [], '+4h': [] };
  for (const ev of events) {
    const o = ev?.outcomes;
    if (!o) continue;
    for (const h of RADAR_OUTCOMES) {
      const v = o[h];
      if (v != null && isFinite(v)) perH[h].push(v);
    }
  }
  for (const h of RADAR_OUTCOMES) {
    const vals = perH[h].slice().sort((a, b) => a - b);
    agg[h].n = vals.length;
    agg[h].wins = vals.filter((v) => v > 0).length;
    agg[h].rate = vals.length ? agg[h].wins / vals.length : 0;
    agg[h].median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
  }
  return agg;
}
