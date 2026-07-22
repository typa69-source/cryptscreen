/**
 * Grid Smart Screener — statistically-grounded mean-reversion / grid-fitness model.
 *
 * Public API:
 *   - Pure stats: ouHalfLife, garmanKlassVol, varianceRatio, adfTest,
 *                 linregSlope, vwapBias
 *   - Composition: scoreSmart, classifyDirection, ouGridBounds, computeSmartRow
 *   - Registration: registerGridSmartScreener(deps)  (mirrors registerGridBotScreeners)
 *
 * No DOM, no global state in pure functions — safe to unit-test in isolation.
 */

import {
  baseSymbol,
  escapeHtml,
  pruneLocalStoragePrefix,
  createKlineCache,
  createMcapProvider,
  selectUniverse,
  passesMinVol,
} from './grid-shared.js';

// ═══════════════════════════════════════════════════════════════
//  Pure stats — all inputs are plain arrays, outputs plain numbers
// ═══════════════════════════════════════════════════════════════

/** AR(1) on log-closes; returns half-life in bars, or null if θ ≥ 0 or too few bars. */
export function ouHalfLife(closes) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  // Δln(p_t) = α + θ·(ln(p_{t-1}) − μ) + ε
  // Equivalently: regress Δln(p_t) on ln(p_{t-1}) (intercept captures α − θ·μ).
  const ys = [];
  const xs = [];
  for (let i = 1; i < x.length; i++) {
    ys.push(Math.log(x[i]) - Math.log(x[i - 1]));
    xs.push(Math.log(x[i - 1]));
  }
  const n = ys.length;
  if (n < 20) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx < 1e-12) return null;
  const theta = sxy / sxx;
  if (theta >= 0) return null; // no mean reversion
  return Math.log(2) / -theta;
}

/** Garman-Klass OHLC volatility estimator; returns σ per bar. */
export function garmanKlassVol(klines) {
  if (!klines || klines.length < 5) return null;
  let sum = 0;
  let n = 0;
  for (const k of klines) {
    const o = +k.o, h = +k.h, l = +k.l, c = +k.c;
    if (!(isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c))) continue;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    if (l > h) continue;
    // GK: 0.5·ln(H/L)^2 − (2·ln(2)−1)·ln(C/O)^2
    const hl = Math.log(h / l);
    const co = Math.log(c / o);
    const v = 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
    // Avoid negative contributions (can happen on noisy OHLC); clamp to 0.
    sum += Math.max(0, v);
    n++;
  }
  if (n < 5) return null;
  // σ^2 per bar; sqrt to get σ
  const meanV = sum / n;
  return Math.sqrt(Math.max(0, meanV));
}

/** Lo-MacKinlay variance ratio. VR<1 mean-reverting, VR>1 trending. */
export function varianceRatio(closes, k = 4) {
  if (!closes || closes.length < k * 3) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < k * 3) return null;
  const n = x.length;
  // Simple returns
  const r = [];
  for (let i = 1; i < n; i++) r.push(Math.log(x[i] / x[i - 1]));
  const m = r.length;
  const meanR = r.reduce((a, b) => a + b, 0) / m;
  // σ^2 of 1-bar returns
  let v1 = 0;
  for (const ri of r) v1 += (ri - meanR) ** 2;
  v1 /= m;
  if (v1 < 1e-12) return null;
  // Variance of k-bar returns (sum of k consecutive 1-bar returns)
  const kR = [];
  for (let i = 0; i + k <= r.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += r[i + j];
    kR.push(s);
  }
  const meanK = kR.reduce((a, b) => a + b, 0) / kR.length;
  let vk = 0;
  for (const ri of kR) vk += (ri - meanK) ** 2;
  vk /= kR.length;
  return vk / (k * v1);
}

/** Augmented Dickey-Fuller with 1 lag. Returns {gamma, stat} or null.
 *  Test regression: Δy_t = α + γ·y_{t-1} + δ·Δy_{t-1} + ε
 *  t-stat on γ is the ADF stat; γ < 0 means mean-reverting. */
export function adfTest(closes) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  // Δy_t (depend), y_{t-1} and Δy_{t-1} (indep), plus intercept
  // y is log-price
  const y = x.map((v) => Math.log(v));
  const n = y.length;
  // We need at least 30 obs for t-distribution to be ~normal-ish; we'll use 30 minimum
  const start = 2;
  const m = n - start;
  if (m < 20) return null;
  const dy = new Array(m);
  const yL = new Array(m);
  const dyL = new Array(m);
  for (let i = 0; i < m; i++) {
    const t = i + start;
    dy[i] = y[t] - y[t - 1];
    yL[i] = y[t - 1];
    dyL[i] = y[t - 1] - y[t - 2];
  }
  // OLS with 3 regressors: const, yL, dyL
  // Build X as [m x 3]: [1, yL, dyL]
  // (X'X)^-1 X'y
  const X = new Array(m);
  for (let i = 0; i < m; i++) X[i] = [1, yL[i], dyL[i]];
  // X'X 3x3
  const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < m; i++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) XtX[r][c] += X[i][r] * X[i][c];
    }
  }
  // X'y 3-vector
  const Xty = [0, 0, 0];
  for (let i = 0; i < m; i++) {
    for (let r = 0; r < 3; r++) Xty[r] += X[i][r] * dy[i];
  }
  // Invert 3x3 by cofactor (small enough for direct inverse)
  const inv = invert3x3(XtX);
  if (!inv) return null;
  // β = inv · Xty
  const beta = [
    inv[0][0] * Xty[0] + inv[0][1] * Xty[1] + inv[0][2] * Xty[2],
    inv[1][0] * Xty[0] + inv[1][1] * Xty[1] + inv[1][2] * Xty[2],
    inv[2][0] * Xty[0] + inv[2][1] * Xty[1] + inv[2][2] * Xty[2],
  ];
  const gamma = beta[1]; // coefficient on y_{t-1}
  // t-stat: β_j / sqrt(inv[j][j] · σ^2)
  // σ^2 = SSR / (n - k)  (k = 3)
  let ssr = 0;
  for (let i = 0; i < m; i++) {
    const yhat = beta[0] + beta[1] * yL[i] + beta[2] * dyL[i];
    ssr += (dy[i] - yhat) ** 2;
  }
  const sigma2 = ssr / Math.max(1, m - 3);
  const varGamma = inv[1][1] * sigma2;
  if (varGamma <= 0 || !isFinite(varGamma)) return null;
  const stat = gamma / Math.sqrt(varGamma);
  return { gamma, stat };
}

function invert3x3(M) {
  const a = M[0][0], b = M[0][1], c = M[0][2];
  const d = M[1][0], e = M[1][1], f = M[1][2];
  const g = M[2][0], h = M[2][1], i = M[2][2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-15) return null;
  const invDet = 1 / det;
  return [
    [
      (e * i - f * h) * invDet,
      (c * h - b * i) * invDet,
      (b * f - c * e) * invDet,
    ],
    [
      (f * g - d * i) * invDet,
      (a * i - c * g) * invDet,
      (c * d - a * f) * invDet,
    ],
    [
      (d * h - e * g) * invDet,
      (b * g - a * h) * invDet,
      (a * e - b * d) * invDet,
    ],
  ];
}

/** OLS slope of log-prices over the last `win` bars, normalised by σ_y.
 *  Sign indicates direction; magnitude in σ-units. */
export function linregSlope(closes, win = 30) {
  if (!closes || closes.length < win) return null;
  const x = closes.slice(-win).filter((c) => isFinite(c) && c > 0);
  if (x.length < win) return null;
  const y = x.map((v) => Math.log(v));
  const n = y.length;
  const mean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - (n - 1) / 2;
    num += dx * (y[i] - mean);
    den += dx * dx;
  }
  if (den < 1e-12) return null;
  const slope = num / den;
  // σ_y (sample stddev around mean)
  let varY = 0;
  for (let i = 0; i < n; i++) varY += (y[i] - mean) ** 2;
  const sigmaY = Math.sqrt(varY / Math.max(1, n - 1));
  if (sigmaY < 1e-12) return null;
  return slope / sigmaY;
}

/** (close − VWAP) / σ over the last `win` bars. Sign: positive above VWAP. */
export function vwapBias(klines, win = 20) {
  if (!klines || klines.length < win) return null;
  const slice = klines.slice(-win);
  let pv = 0;
  let vol = 0;
  const closes = [];
  for (const k of slice) {
    const tp = (+k.h + +k.l + +k.c) / 3;
    const v = +k.v || 0;
    pv += tp * v;
    vol += v;
    closes.push(+k.c);
  }
  if (vol < 1e-12) return null;
  const vwap = pv / vol;
  const last = closes[closes.length - 1];
  if (!isFinite(vwap) || !isFinite(last)) return null;
  // σ of close prices
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  let varC = 0;
  for (const c of closes) varC += (c - mean) ** 2;
  const sigmaC = Math.sqrt(varC / Math.max(1, closes.length - 1));
  if (sigmaC < 1e-12) return null;
  return (last - vwap) / sigmaC;
}

// ═══════════════════════════════════════════════════════════════
//  Composition: score, direction, grid bounds
// ═══════════════════════════════════════════════════════════════

/** Hurst exponent via simple R/S. (Same algorithm as grid-shared, duplicated here
 *  so gridSmart doesn't depend on grid-shared math, which keeps tests isolated.) */
export function hurstExponent(closes) {
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 60) return null;
  const lens = [10, 12, 15, 20, 25, 30, 40].filter((L) => L * 3 <= x.length);
  const pts = [];
  for (const L of lens) {
    let acc = 0;
    let cnt = 0;
    for (let start = 0; start + L <= x.length; start += L) {
      const seg = x.slice(start, start + L);
      const m = seg.reduce((a, b) => a + b, 0) / L;
      const y = seg.map((v) => v - m);
      let cum = 0;
      const w = y.map((d) => {
        cum += d;
        return cum;
      });
      const R = Math.max(...w) - Math.min(...w);
      const v = y.reduce((a, d) => a + d * d, 0) / L;
      const s = Math.sqrt(v);
      if (s > 1e-12) {
        acc += R / s;
        cnt++;
      }
    }
    if (cnt > 0) pts.push({ lx: Math.log(L), lry: Math.log(acc / cnt) });
  }
  if (pts.length < 2) return null;
  const nn = pts.length;
  const mx = pts.reduce((a, p) => a + p.lx, 0) / nn;
  const my = pts.reduce((a, p) => a + p.lry, 0) / nn;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.lx - mx) * (p.lry - my);
    den += (p.lx - mx) ** 2;
  }
  if (den < 1e-12) return null;
  return num / den;
}

/** Compute the score 0..13 + breakdown for one symbol's klines.
 *  `klCtx` is optional context klines (next-higher TF) for confluence (not used here,
 *  but kept in the signature to make computeSmartRow cleaner). */
export function scoreSmart(klines, mcapMap, sym, vol24For) {
  if (!klines || klines.length < 30) return null;
  const closes = klines.map((k) => +k.c).filter((c) => isFinite(c));
  if (closes.length < 30) return null;
  const price = closes[closes.length - 1];
  if (!isFinite(price) || price <= 0) return null;

  const hl = ouHalfLife(closes);
  const gk = garmanKlassVol(klines);
  const vr = varianceRatio(closes, 4);
  const hurst = hurstExponent(closes);
  const adf = adfTest(closes);
  const slope = linregSlope(closes, 30);
  const vw = vwapBias(klines, 20);

  // ── Mean-reversion quality (max 5) ────────────────────────
  let mr = 0;
  const mrComponents = {};
  if (hurst != null) {
    if (hurst >= 0.30 && hurst <= 0.50) { mr += 2; mrComponents.hurst = { pts: 2, label: hurst.toFixed(3) }; }
    else { mrComponents.hurst = { pts: 0, label: hurst.toFixed(3) }; }
  } else {
    mrComponents.hurst = { pts: 0, label: 'N/A' };
  }
  if (vr != null) {
    if (vr < 0.7) { mr += 2; mrComponents.vr = { pts: 2, label: vr.toFixed(3) }; }
    else { mrComponents.vr = { pts: 0, label: vr.toFixed(3) }; }
  } else {
    mrComponents.vr = { pts: 0, label: 'N/A' };
  }
  if (hl != null) {
    if (hl >= 10 && hl <= 50) { mr += 1; mrComponents.halfLife = { pts: 1, label: hl.toFixed(1) + ' bars' }; }
    else { mrComponents.halfLife = { pts: 0, label: hl.toFixed(1) + ' bars' }; }
  } else {
    mrComponents.halfLife = { pts: 0, label: 'N/A (trending)' };
  }

  // ── Grid fitness (max 5) ───────────────────────────────────
  let fit = 0;
  const fitComponents = {};
  const gkPct = gk != null && price > 0 ? (gk / price) * 100 : null;
  if (gkPct != null) {
    if (gkPct >= 1 && gkPct <= 5) { fit += 2; fitComponents.gkVol = { pts: 2, label: gkPct.toFixed(2) + '%' }; }
    else { fitComponents.gkVol = { pts: 0, label: gkPct.toFixed(2) + '%' }; }
  } else {
    fitComponents.gkVol = { pts: 0, label: 'N/A' };
  }
  const vol24 = vol24For(sym);
  const mcap = mcapMap ? mcapMap.get(baseSymbol(sym)) : undefined;
  if (vol24 != null && mcap != null && mcap > 0) {
    const vm = vol24 / mcap;
    if (vm > 0.05) { fit += 2; fitComponents.volMcap = { pts: 2, label: vm.toFixed(3) }; }
    else { fitComponents.volMcap = { pts: 0, label: vm.toFixed(3) }; }
  } else {
    fitComponents.volMcap = { pts: 0, label: 'N/A' };
  }
  // Spread proxy: (H-L)/C on the last bar
  const last = klines[klines.length - 1];
  if (last && +last.c > 0 && +last.h >= +last.l) {
    const spreadPct = ((+last.h - +last.l) / +last.c) * 100;
    if (spreadPct < 2) { fit += 1; fitComponents.spread = { pts: 1, label: spreadPct.toFixed(2) + '%' }; }
    else { fitComponents.spread = { pts: 0, label: spreadPct.toFixed(2) + '%' }; }
  } else {
    fitComponents.spread = { pts: 0, label: 'N/A' };
  }

  // ── Directional confidence (max 3) ─────────────────────────
  let dir = 0;
  const dirComponents = {};
  const adfSign = adf ? Math.sign(adf.gamma) : 0;
  const slopeSign = slope != null ? Math.sign(slope) : 0;
  if (adfSign !== 0 && slopeSign !== 0 && adfSign === slopeSign) {
    dir += 2;
    dirComponents.adfSlope = { pts: 2, label: `ADF γ=${adf.gamma.toFixed(3)}, slope=${slope.toFixed(2)}` };
  } else {
    dirComponents.adfSlope = { pts: 0, label: `ADF γ=${adf?.gamma?.toFixed(3) ?? 'N/A'}, slope=${slope?.toFixed(2) ?? 'N/A'}` };
  }
  if (hurst != null && hurst > 0.55 && slopeSign !== 0) {
    dir += 1;
    dirComponents.hurstTrend = { pts: 1, label: `H=${hurst.toFixed(3)}>0.55, slope≠0` };
  } else {
    dirComponents.hurstTrend = { pts: 0, label: hurst != null ? `H=${hurst.toFixed(3)}` : 'N/A' };
  }

  const total = mr + fit + dir;
  const band = total >= 10 ? 'green' : total >= 7 ? 'yellow' : 'red';

  return {
    score: total,
    band,
    mr,
    fit,
    dir,
    breakdown: { mr: mrComponents, fit: fitComponents, dir: dirComponents },
    raw: { hl, gk, gkPct, vr, hurst, adf, slope, vw, adfSign, slopeSign },
  };
}

/** Adaptive direction classifier. `universeScores` is an array of dirScore values
 *  for the full universe (used to compute median threshold). */
export function classifyDirection(row, universeScores) {
  if (!row) return { dir: 'NEUTRAL', confidence: 0 };
  const { adfSign, slopeSign, hurst, vw } = row.raw || {};
  const slopeMag = row.raw?.slope != null ? Math.abs(row.raw.slope) : 0;
  // For non-trending (Hurst<0.5), drop the Hurst-trend component contribution
  const hurstTrend = hurst != null && hurst > 0.55 && slopeSign !== 0 ? slopeSign : 0;
  const dirScore =
    (adfSign || 0) +
    (slopeSign || 0) +
    hurstTrend +
    (vw != null ? Math.sign(vw) : 0);

  // Magnitude-weighting: small slopes (<0.5σ) shouldn't dominate
  const weighted = dirScore * (slopeMag >= 0.3 ? 1 : 0.5);

  // Adaptive threshold over universe
  const valid = (universeScores || []).filter((v) => isFinite(v));
  let threshold = 1;
  if (valid.length >= 4) {
    const sorted = valid.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    threshold = sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
    if (threshold < 0.5) threshold = 0.5;
  }

  let dir = 'NEUTRAL';
  if (Math.abs(weighted) >= threshold) {
    dir = weighted > 0 ? 'LONG' : 'SHORT';
  }
  const confidence = Math.round(Math.min(1, Math.abs(weighted) / 4) * 100);
  return { dir, confidence, dirScore: weighted, threshold };
}

/** OU-derived grid bounds. Returns null if half-life can't be computed
 *  (trending series → user should use Pick/Swing for those). */
export function ouGridBounds(closes, klines) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  const gk = garmanKlassVol(klines);
  if (gk == null) return null;
  const hl = ouHalfLife(x);
  // For trending series (no HL) we still produce a fallback using σ_T over a fixed
  // 50-bar window — this lets the screener return SOMETHING rather than null.
  const T = hl != null ? Math.max(5, Math.min(200, hl)) : 50;
  const logReturns = [];
  for (let i = 1; i < x.length; i++) logReturns.push(Math.log(x[i] / x[i - 1]));
  const meanLog = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  // μ = exp(Σ ln(r_t)) — geometric mean price level
  const mu = Math.exp(meanLog * x.length); // = x[0] · exp(meanLog · n) ; simpler: take exp of mean of log prices
  // Cleaner: μ = exp(mean(log(x)))
  const logPrices = x.map((v) => Math.log(v));
  const mu2 = Math.exp(logPrices.reduce((a, b) => a + b, 0) / logPrices.length);
  const sigmaT = gk * Math.sqrt(T);
  const lower = Math.exp(Math.log(mu2) - 1.5 * sigmaT);
  const upper = Math.exp(Math.log(mu2) + 1.5 * sigmaT);
  const step = gk * 0.5;
  const span = upper - lower;
  const rawLevels = step > 0 ? span / step : 0;
  const levels = Math.max(8, Math.min(30, Math.round(rawLevels)));
  return { lower, upper, step, levels, sigmaT, hl: hl };
}

/** Compute the full row for one symbol. `kl` is the working-TF klines,
 *  `klCtx` is optional context-TF klines (next-higher TF). */
export function computeSmartRow(sym, kl, klCtx, mcapMap, vol24For) {
  if (!kl || kl.length < 30) return null;
  const sc = scoreSmart(kl, mcapMap, sym, vol24For);
  if (!sc) return null;
  const closes = kl.map((k) => +k.c).filter((c) => isFinite(c));
  const gb = ouGridBounds(closes, kl);
  if (!gb) return null;
  // Confluence: compare slope signs between working and context TF
  let confluence = null; // null | 'agree' | 'disagree' | 'na'
  if (klCtx && klCtx.length >= 30) {
    const closesCtx = klCtx.map((k) => +k.c).filter((c) => isFinite(c));
    const slopeCtx = linregSlope(closesCtx, 30);
    const slopeWork = sc.raw.slope;
    if (slopeCtx != null && slopeWork != null) {
      confluence = Math.sign(slopeCtx) === Math.sign(slopeWork) && slopeWork !== 0
        ? 'agree' : 'disagree';
    } else {
      confluence = 'na';
    }
  } else {
    confluence = 'na';
  }
  return {
    sym,
    score: sc.score,
    band: sc.band,
    mr: sc.mr,
    fit: sc.fit,
    dirScoreRaw: sc.dir,
    breakdown: sc.breakdown,
    raw: sc.raw,
    gridBounds: gb,
    confluence,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Screener registration (modal + scan + render)
// ═══════════════════════════════════════════════════════════════

const SUPPORTED_TFS = ['5m', '15m', '1h', '4h', '1d'];
const CONTEXT_TF = { '5m': '15m', '15m': '1h', '1h': '4h', '4h': '1d', '1d': '1d' };
const TF_BARS = { '5m': 300, '15m': 200, '1h': 200, '4h': 200, '1d': 120 };

export function registerGridSmartScreener(deps) {
  const {
    S,
    fj,
    batchKlines,
    fn,
    fmtPrice,
    openFullscreenBySym,
    openGridLabFromRow,
    BACKEND,
    GROUP_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'],
    tagScreenerGroup,
  } = deps || {};

  const klineCache = createKlineCache(batchKlines, 5 * 60 * 1000);
  const getMcapMap = createMcapProvider(fj, BACKEND);

  function vol24For(sym) {
    return S?.mx?.[sym]?.vol24 ?? S?.tk?.[sym]?.qv ?? null;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openGridSmartScreener() {
    const old = document.getElementById('gridSmartModal');
    if (old) {
      old.remove();
      return;
    }
    const modal = document.createElement('div');
    modal.id = 'gridSmartModal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:823;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText =
      'width:min(1100px,98vw);height:min(88vh,900px);background:var(--bg2);border:1px solid var(--border2);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;';

    const cacheKey = '__gbs_smart_v1';
    const cachedUi = typeof window !== 'undefined' ? window[cacheKey] : null;
    const ui = cachedUi || {
      tf: '15m',
      minScore: 7,
      showLong: true,
      showShort: true,
      showNeutral: true,
      showLowConf: false,
      showConfluence: true,
      sortKey: 'score',
      sortDir: 'desc',
      lastRows: [],
      error: '',
      diag: '',
      loading: false,
      lastRun: 0,
      timer: null,
      listGroup: 0,
    };
    if (typeof window !== 'undefined') window[cacheKey] = ui;
    if (ui.listGroup == null) ui.listGroup = 0;

    function renderMeta() {
      const lu = box.querySelector('#gbsSmartLu');
      if (lu) lu.textContent = ui.lastRun ? new Date(ui.lastRun).toLocaleTimeString() : '—';
      const sk = box.querySelector('#gbsSmartSk');
      if (sk) sk.style.display = ui.loading ? '' : 'none';
      const dg = box.querySelector('#gbsSmartDiag');
      if (dg) dg.textContent = ui.diag || '';
    }

    function applyFiltersAndRender() {
      let rows = ui.lastRows.slice();
      rows = rows.filter((r) => r.score != null && r.score >= ui.minScore);
      // Direction classification needs the universe's dirScore thresholds;
      // we already classified in runSmartScan and stored r.direction / r.confidence.
      if (!ui.showLong) rows = rows.filter((r) => r.direction !== 'LONG');
      if (!ui.showShort) rows = rows.filter((r) => r.direction !== 'SHORT');
      if (!ui.showNeutral) rows = rows.filter((r) => r.direction !== 'NEUTRAL');
      if (!ui.showLowConf) rows = rows.filter((r) => (r.confidence ?? 0) >= 60);

      const dir = ui.sortDir === 'asc' ? 1 : -1;
      const key = ui.sortKey;
      const val = (r) => {
        if (key === 'sym') return r.sym;
        if (key === 'score') return r.score;
        if (key === 'mr') return r.mr;
        if (key === 'fit') return r.fit;
        if (key === 'dir') return r.direction;
        if (key === 'conf') return r.confidence;
        if (key === 'gkh') return r.raw?.gkPct;
        return null;
      };
      rows.sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (key === 'sym') return va.localeCompare(vb) * dir;
        if (key === 'dir') return va.localeCompare(vb) * dir;
        const na = va == null || isNaN(va) ? -Infinity : va;
        const nb = vb == null || isNaN(vb) ? -Infinity : vb;
        return (na - nb) * dir;
      });

      const tb = box.querySelector('#gbsSmartBody');
      if (!tb) return;
      if (!rows.length) {
        const msg = ui.error || (ui.loading ? 'Загрузка…' : 'Нет результатов (проверь фильтры).');
        tb.innerHTML = `<tr><td colspan="9" style="padding:10px 8px;color:var(--text3);font-size:10px">${escHtml(msg)}</td></tr>`;
        renderMeta();
        return;
      }
      const frag = document.createDocumentFragment();
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.dataset.sym = r.sym;
        const badge = r.band === 'green' ? '#22c55e' : r.band === 'yellow' ? '#eab308' : '#ef4444';
        const dirCol = r.direction === 'LONG' ? '#22c55e' : r.direction === 'SHORT' ? '#ef4444' : '#94a3b8';
        const conf = r.confluence;
        const confMark = conf == null ? '—' : conf === 'agree' ? '✓' : conf === 'disagree' ? '⚠' : '—';
        const confTitle = conf == null
          ? 'нет данных старшего TF'
          : conf === 'agree' ? 'старший TF согласен по направлению'
          : conf === 'disagree' ? 'старший TF против рабочего'
          : 'недостаточно данных';
        const bd = Object.entries(r.breakdown || {})
          .map(([group, comps]) =>
            Object.entries(comps)
              .map(([k, v]) => `<span class="gbs-tag" title="${escHtml(k)}">${escHtml(k)}: ${escHtml(v.label)} → +${escHtml(v.pts)}</span>`)
              .join(' ')
          )
          .join(' ');
        tr.innerHTML = `
          <td><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><b style="cursor:pointer;color:#7dd3fc" class="gbs-open">${escHtml(r.sym.replace(/USDT$/, ''))}</b><button class="gbs-lab-open" title="Открыть в Grid Lab с предложенными границами" style="cursor:pointer;background:transparent;border:0;color:#a78bfa;font-size:11px;padding:0 2px;line-height:1">📊</button></div></td>
          <td><span style="background:${badge};color:#0a0a0b;padding:2px 6px;border-radius:4px;font-weight:700">${escHtml(r.score)}</span></td>
          <td><span style="background:${dirCol};color:#0a0a0b;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">${escHtml(r.direction)}</span></td>
          <td>${escHtml(r.confidence ?? 0)}%</td>
          <td>${escHtml(r.mr)}/5</td>
          <td>${escHtml(r.fit)}/5</td>
          <td>${r.raw?.gkPct != null ? escHtml(r.raw.gkPct.toFixed(2)) + '%' : '—'}</td>
          <td title="${escHtml(confTitle)}" style="text-align:center;font-size:11px">${ui.showConfluence ? confMark : '—'}</td>
          <td style="font-size:9px;color:var(--text3)">${bd}</td>`;
        frag.appendChild(tr);
      }
      tb.replaceChildren(frag);
      tb.querySelectorAll('.gbs-open').forEach((el) => {
        el.onclick = () => {
          if (ui.timer) clearInterval(ui.timer);
          modal.remove();
          openFullscreenBySym(el.closest('tr').dataset.sym);
        };
      });
      tb.querySelectorAll('.gbs-lab-open').forEach((el) => {
        el.onclick = (e) => {
          e.stopPropagation();
          const tr = el.closest('tr');
          const r = rows.find((x) => x.sym === tr.dataset.sym);
          if (r && typeof openGridLabFromRow === 'function') {
            if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
            openGridLabFromRow(r, 'smart', () => modal.remove());
          }
        };
      });
      renderMeta();
      if (tagScreenerGroup && ui.listGroup > 0) {
        for (const r of rows) tagScreenerGroup(r.sym, ui.listGroup);
      }
    }

    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:#fff;flex:1">Grid Smart · OU-фильтр</span>
        <span id="gbsSmartSk" style="font-size:10px;color:var(--text3);display:none">Обновление…</span>
        <span id="gbsSmartDiag" style="font-size:9px;color:var(--text3)"></span>
        <button class="tbtn" id="gbsSmartRf">Обновить</button>
        <button class="tbtn" id="gbsSmartX">Закрыть</button>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:10px">
        <label>TF
          <select id="gbsSmartTf" style="margin-left:4px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font:inherit;font-size:10px;padding:3px 6px">
            ${SUPPORTED_TFS.map(t => `<option value="${t}"${ui.tf === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label>Мин. score <input type="range" id="gbsSmartMinSc" min="0" max="13" value="${ui.minScore}" style="width:100px;vertical-align:middle"></label>
        <span id="gbsSmartMinScV">${ui.minScore}</span>
        <label><input type="checkbox" id="gbsSmartLong"${ui.showLong ? ' checked' : ''}> LONG</label>
        <label><input type="checkbox" id="gbsSmartShort"${ui.showShort ? ' checked' : ''}> SHORT</label>
        <label><input type="checkbox" id="gbsSmartNeutral"${ui.showNeutral ? ' checked' : ''}> NEUTRAL</label>
        <label><input type="checkbox" id="gbsSmartLowConf"${ui.showLowConf ? ' checked' : ''}> Low conf (&lt;60%)</label>
        <label><input type="checkbox" id="gbsSmartConf"${ui.showConfluence ? ' checked' : ''}> Конфлюэнс</label>
        <span style="margin-left:auto;color:var(--text3)">Обновлено: <span id="gbsSmartLu">—</span></span>
      </div>
      <div style="padding:4px 12px;border-bottom:1px solid var(--border);font-size:9px;color:var(--text3);line-height:1.4">
        Score: mean-reversion (0–5) + grid fitness (0–5) + directional confidence (0–3). Направление адаптивное: порог = медиана |dirScore| по выборке. Границы: μ ± 1.5σ_T, где σ_T = GK·√(half-life).
      </div>
      <div style="flex:1;min-height:0;overflow:auto">
        <table class="gbs-table" style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr>
            <th class="gbs-th" data-k="sym">Тикер</th>
            <th class="gbs-th" data-k="score">Score</th>
            <th class="gbs-th" data-k="dir">Dir</th>
            <th class="gbs-th" data-k="conf">Конф</th>
            <th class="gbs-th" data-k="mr" title="Mean-reversion quality: Hurst+VR+OU half-life">MR</th>
            <th class="gbs-th" data-k="fit" title="Grid fitness: GK vol, vol/mcap, spread">fit</th>
            <th class="gbs-th" data-k="gkh" title="GK vol / price, in %">ΔH/L</th>
            <th title="Конфлюэнс со старшим TF">${ui.showConfluence ? 'старш.' : '—'}</th>
            <th title="Наведи на теги — пояснения">Метрики</th>
          </tr></thead>
          <tbody id="gbsSmartBody"></tbody>
        </table>
      </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const onHdr = (e) => {
      const th = e.target.closest('.gbs-th');
      if (!th || !th.dataset.k) return;
      const k = th.dataset.k;
      if (ui.sortKey === k) ui.sortDir = ui.sortDir === 'desc' ? 'asc' : 'desc';
      else { ui.sortKey = k; ui.sortDir = 'desc'; }
      applyFiltersAndRender();
    };
    box.querySelector('thead').addEventListener('click', onHdr);

    box.querySelector('#gbsSmartTf').onchange = (e) => {
      ui.tf = e.target.value;
      runSmartScan(ui);
    };
    box.querySelector('#gbsSmartMinSc').oninput = (e) => {
      ui.minScore = +e.target.value;
      box.querySelector('#gbsSmartMinScV').textContent = String(ui.minScore);
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartLong').onchange = (e) => {
      ui.showLong = e.target.checked;
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartShort').onchange = (e) => {
      ui.showShort = e.target.checked;
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartNeutral').onchange = (e) => {
      ui.showNeutral = e.target.checked;
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartLowConf').onchange = (e) => {
      ui.showLowConf = e.target.checked;
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartConf').onchange = (e) => {
      ui.showConfluence = e.target.checked;
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSmartRf').onclick = () => runSmartScan(ui);
    box.querySelector('#gbsSmartX').onclick = () => {
      if (ui.timer) clearInterval(ui.timer);
      modal.remove();
    };
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        if (ui.timer) clearInterval(ui.timer);
        modal.remove();
      }
    });

    async function runSmartScan(uiRef) {
      uiRef.loading = true;
      uiRef.error = '';
      uiRef.diag = 'universe…';
      if (uiRef.renderMeta) uiRef.renderMeta();
      try {
        const baseAll = (S?.syms || []).slice();
        // Universe: top 200 by volume (no hard minVol — Smart penalises thin coins).
        const syms = selectUniverse(baseAll, vol24For, 200);
        uiRef.diag = `universe ${syms.length}/${baseAll.length || 0} · mcap…`;
        if (uiRef.renderMeta) uiRef.renderMeta();
        const mcapMap = await getMcapMap();
        const tf = uiRef.tf;
        const tfCtx = CONTEXT_TF[tf] || tf;
        const bars = TF_BARS[tf] || 200;
        const barsCtx = tfCtx === tf ? 0 : (TF_BARS[tfCtx] || 100);
        uiRef.diag = `universe ${syms.length} · mcap ${mcapMap?.size || 0} · ${tf}…`;
        if (uiRef.renderMeta) uiRef.renderMeta();
        const kl = await klineCache.batchCached(syms, tf, bars, null, null, 8);
        let klCtx = null;
        if (barsCtx > 0) {
          uiRef.diag = `universe ${syms.length} · mcap ${mcapMap?.size || 0} · ${tf} ${Object.keys(kl || {}).length} · ${tfCtx}…`;
          if (uiRef.renderMeta) uiRef.renderMeta();
          klCtx = await klineCache.batchCached(syms, tfCtx, barsCtx, null, null, 8);
        }
        uiRef.diag = `universe ${syms.length} · ${tf} ${Object.keys(kl || {}).length} · ${tfCtx} ${Object.keys(klCtx || {}).length} · scoring…`;
        if (uiRef.renderMeta) uiRef.renderMeta();

        // First pass: compute rows
        const rawRows = [];
        for (const sym of syms) {
          try {
            const r = computeSmartRow(sym, kl?.[sym], klCtx?.[sym], mcapMap, vol24For);
            if (r) rawRows.push(r);
          } catch (e) {
            /* skip individual failures */
          }
        }

        // Compute direction over the universe (adaptive threshold)
        const universeDirScores = rawRows
          .map((r) => r.raw?.slope != null ? r.raw.slope * (Math.abs(r.raw.slope) >= 0.3 ? 1 : 0.5) : 0)
          .filter((v) => isFinite(v));
        for (const r of rawRows) {
          const cd = classifyDirection(r, universeDirScores);
          r.direction = cd.dir;
          r.confidence = cd.confidence;
          r.dirScore = cd.dirScore;
        }

        uiRef.lastRows = rawRows;
        uiRef.lastRun = Date.now();
        uiRef.diag = `rows ${rawRows.length}/${syms.length} · last ${new Date(uiRef.lastRun).toLocaleTimeString()}`;
        if (!rawRows.length) {
          uiRef.error = 'Список пуст: не удалось получить klines. Возможен rate-limit Binance.';
        }
      } catch (e) {
        uiRef.lastRows = [];
        uiRef.error = `Ошибка скана: ${e?.message || String(e)}`;
        uiRef.diag = 'error';
      } finally {
        uiRef.loading = false;
        if (uiRef.applyFiltersAndRender) uiRef.applyFiltersAndRender();
      }
    }

    ui.renderMeta = renderMeta;
    ui.applyFiltersAndRender = applyFiltersAndRender;
    if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
    ui.timer = setInterval(() => runSmartScan(ui), 300000); // 5 min
    if (ui.lastRows?.length) ui.applyFiltersAndRender();
    runSmartScan(ui);
  }

  if (typeof window !== 'undefined') {
    window.openGridSmartScreener = openGridSmartScreener;
  }
  return { openGridSmartScreener };
}
