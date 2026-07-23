/**
 * Grid Smart Screener вЂ” statistically-grounded mean-reversion / grid-fitness model.
 *
 * Public API:
 *   - Pure stats: ouHalfLife, garmanKlassVol, varianceRatio, adfTest,
 *                 linregSlope, vwapBias
 *   - Composition: scoreSmart, classifyDirection, ouGridBounds, computeSmartRow
 *   - Pure UI helpers: filterSmartRows, sortSmartRows, smartBandColor,
 *                      smartDirectionColor, smartEmptyMessage
 *   - Registration: registerGridSmartScreener(deps)  (mirrors registerGridBotScreeners)
 *
 * No DOM, no global state in pure functions вЂ” safe to unit-test in isolation.
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
import { hurstExponentRS } from './gridBotScreeners.js';

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  Pure stats вЂ” all inputs are plain arrays, outputs plain numbers
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

/** AR(1) on log-closes; returns half-life in bars, or null if Оё в‰Ґ 0 or too few bars. */
export function ouHalfLife(closes) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  // О”ln(p_t) = О± + ОёВ·(ln(p_{t-1}) в€’ Ој) + Оµ
  // Equivalently: regress О”ln(p_t) on ln(p_{t-1}) (intercept captures О± в€’ ОёВ·Ој).
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

/** Garman-Klass OHLC volatility estimator; returns Пѓ per bar. */
export function garmanKlassVol(klines) {
  if (!klines || klines.length < 5) return null;
  let sum = 0;
  let n = 0;
  for (const k of klines) {
    const o = +k.o, h = +k.h, l = +k.l, c = +k.c;
    if (!(isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c))) continue;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) continue;
    if (l > h) continue;
    // GK: 0.5В·ln(H/L)^2 в€’ (2В·ln(2)в€’1)В·ln(C/O)^2
    const hl = Math.log(h / l);
    const co = Math.log(c / o);
    const v = 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
    // Avoid negative contributions (can happen on noisy OHLC); clamp to 0.
    sum += Math.max(0, v);
    n++;
  }
  if (n < 5) return null;
  // Пѓ^2 per bar; sqrt to get Пѓ
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
  // Пѓ^2 of 1-bar returns
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
 *  Test regression: О”y_t = О± + ОіВ·y_{t-1} + ОґВ·О”y_{t-1} + Оµ
 *  t-stat on Оі is the ADF stat; Оі < 0 means mean-reverting. */
export function adfTest(closes) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  // О”y_t (depend), y_{t-1} and О”y_{t-1} (indep), plus intercept
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
  // ОІ = inv В· Xty
  const beta = [
    inv[0][0] * Xty[0] + inv[0][1] * Xty[1] + inv[0][2] * Xty[2],
    inv[1][0] * Xty[0] + inv[1][1] * Xty[1] + inv[1][2] * Xty[2],
    inv[2][0] * Xty[0] + inv[2][1] * Xty[1] + inv[2][2] * Xty[2],
  ];
  const gamma = beta[1]; // coefficient on y_{t-1}
  // t-stat: ОІ_j / sqrt(inv[j][j] В· Пѓ^2)
  // Пѓ^2 = SSR / (n - k)  (k = 3)
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

/** OLS slope of log-prices over the last `win` bars, normalised by Пѓ_y.
 *  Sign indicates direction; magnitude in Пѓ-units. */
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
  // Пѓ_y (sample stddev around mean)
  let varY = 0;
  for (let i = 0; i < n; i++) varY += (y[i] - mean) ** 2;
  const sigmaY = Math.sqrt(varY / Math.max(1, n - 1));
  if (sigmaY < 1e-12) return null;
  return slope / sigmaY;
}

/** (close в€’ VWAP) / Пѓ over the last `win` bars. Sign: positive above VWAP. */
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
  // Пѓ of close prices
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  let varC = 0;
  for (const c of closes) varC += (c - mean) ** 2;
  const sigmaC = Math.sqrt(varC / Math.max(1, closes.length - 1));
  if (sigmaC < 1e-12) return null;
  return (last - vwap) / sigmaC;
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  Composition: score, direction, grid bounds
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

// Re-export hurstExponentRS under a shorter name for backward-compat with tests.
// (The actual implementation lives in gridBotScreeners.js вЂ” single source of truth.)
export { hurstExponentRS as hurstExponent };

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
  const hurst = hurstExponentRS(closes);
  const adf = adfTest(closes);
  const slope = linregSlope(closes, 30);
  const vw = vwapBias(klines, 20);

  // в”Ђв”Ђ Mean-reversion quality (max 5) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  let mr = 0;
  const mrComponents = {};
  if (hurst != null) {
    if (hurst >= 0.30 && hurst <= 0.50) { mr += 2; mrComponents.hurst = { pts: 2, label: hurst.toFixed(3) }; }
    else { mrComponents.hurst = { pts: 0, label: hurst.toFixed(3) }; }
  } else {
    mrComponents.hurst = { pts: 0, label: 'N/A' };
  }
  mrComponents.hurst.tip = 'Hurst в€€ [0.30, 0.50] в†’ С†РµРЅР° РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ Рє СЃСЂРµРґРЅРµР№ (mean-reverting). <0.30 вЂ” СЃР»РёС€РєРѕРј С€СѓРјРЅРѕ, >0.50 вЂ” С‚СЂРµРЅРґ.';
  if (vr != null) {
    if (vr < 0.7) { mr += 2; mrComponents.vr = { pts: 2, label: vr.toFixed(3) }; }
    else { mrComponents.vr = { pts: 0, label: vr.toFixed(3) }; }
  } else {
    mrComponents.vr = { pts: 0, label: 'N/A' };
  }
  mrComponents.vr.tip = 'Variance Ratio (Lo-MacKinlay): VR<1 вЂ” РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ, VR>1 вЂ” С‚СЂРµРЅРґ. РРґРµР°Р» <0.7.';
  if (hl != null) {
    if (hl >= 10 && hl <= 50) { mr += 1; mrComponents.halfLife = { pts: 1, label: hl.toFixed(1) + ' bars' }; }
    else { mrComponents.halfLife = { pts: 0, label: hl.toFixed(1) + ' bars' }; }
  } else {
    mrComponents.halfLife = { pts: 0, label: 'N/A (trending)' };
  }
  mrComponents.halfLife.tip = 'OU half-life вЂ” Р·Р° СЃРєРѕР»СЊРєРѕ Р±Р°СЂ С†РµРЅР° РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ Рє СЃСЂРµРґРЅРµР№ РЅР°РїРѕР»РѕРІРёРЅСѓ. РРґРµР°Р» 10вЂ“50 Р±Р°СЂ. >200 вЂ” СЃР»РёС€РєРѕРј РјРµРґР»РµРЅРЅРѕ РґР»СЏ СЃРµС‚РєРё.';

  // в”Ђв”Ђ Grid fitness (max 5) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  let fit = 0;
  const fitComponents = {};
  const gkPct = gk != null && price > 0 ? (gk / price) * 100 : null;
  if (gkPct != null) {
    if (gkPct >= 1 && gkPct <= 5) { fit += 2; fitComponents.gkVol = { pts: 2, label: gkPct.toFixed(2) + '%' }; }
    else { fitComponents.gkVol = { pts: 0, label: gkPct.toFixed(2) + '%' }; }
  } else {
    fitComponents.gkVol = { pts: 0, label: 'N/A' };
  }
  fitComponents.gkVol.tip = 'Garman-Klass РІРѕР»Р°С‚РёР»СЊРЅРѕСЃС‚СЊ (% РѕС‚ С†РµРЅС‹ Р·Р° Р±Р°СЂ). РРґРµР°Р» 1вЂ“5%: С‚РёС€Рµ вЂ” РјР°Р»Рѕ Р·Р°СЂР°Р±РѕС‚РѕРє, РіСЂРѕРјС‡Рµ вЂ” СЃРµС‚РєСѓ РІС‹Р±РёРІР°РµС‚.';
  const vol24 = vol24For(sym);
  const mcap = mcapMap ? mcapMap.get(baseSymbol(sym)) : undefined;
  if (vol24 != null && mcap != null && mcap > 0) {
    const vm = vol24 / mcap;
    if (vm > 0.05) { fit += 2; fitComponents.volMcap = { pts: 2, label: vm.toFixed(3) }; }
    else { fitComponents.volMcap = { pts: 0, label: vm.toFixed(3) }; }
  } else {
    fitComponents.volMcap = { pts: 0, label: 'N/A' };
  }
  fitComponents.volMcap.tip = 'РћР±СЉС‘Рј 24С‡ / РєР°РїРёС‚Р°Р»РёР·Р°С†РёСЏ: РѕР±РѕСЂРѕС‚ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ СЂР°Р·РјРµСЂР°. >0.05 вЂ” РІС‹СЃРѕРєРёР№ РѕР±РѕСЂРѕС‚, СЃРµС‚РєР° Р»РёРєРІРёРґРЅР°.';
  // Spread proxy: (H-L)/C on the last bar
  const last = klines[klines.length - 1];
  if (last && +last.c > 0 && +last.h >= +last.l) {
    const spreadPct = ((+last.h - +last.l) / +last.c) * 100;
    if (spreadPct < 2) { fit += 1; fitComponents.spread = { pts: 1, label: spreadPct.toFixed(2) + '%' }; }
    else { fitComponents.spread = { pts: 0, label: spreadPct.toFixed(2) + '%' }; }
  } else {
    fitComponents.spread = { pts: 0, label: 'N/A' };
  }
  fitComponents.spread.tip = '(Hв€’L)/C РїРѕСЃР»РµРґРЅРµРіРѕ Р±Р°СЂР° вЂ” РїСЂРѕРєСЃРё СЃРїСЂРµРґР°/РІРЅСѓС‚СЂРёР±Р°СЂРЅРѕРіРѕ С€СѓРјР°. <2% вЂ” СЃРµС‚РєР° РїРѕРїР°РґР°РµС‚ РІ СЃРїСЂРµРґ Р±РµР· РїРѕС‚РµСЂСЊ.';

  // в”Ђв”Ђ Directional confidence (max 3) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  let dir = 0;
  const dirComponents = {};
  const adfSign = adf ? Math.sign(adf.gamma) : 0;
  const slopeSign = slope != null ? Math.sign(slope) : 0;
  if (adfSign !== 0 && slopeSign !== 0 && adfSign === slopeSign) {
    dir += 2;
    dirComponents.adfSlope = { pts: 2, label: `ADF Оі=${adf.gamma.toFixed(3)}, slope=${slope.toFixed(2)}` };
  } else {
    dirComponents.adfSlope = { pts: 0, label: `ADF Оі=${adf?.gamma?.toFixed(3) ?? 'N/A'}, slope=${slope?.toFixed(2) ?? 'N/A'}` };
  }
  dirComponents.adfSlope.tip = 'ADF (СЃС‚Р°С†РёРѕРЅР°СЂРЅРѕСЃС‚СЊ) Рё slope (РЅР°РєР»РѕРЅ) СЃРѕРіР»Р°СЃРЅС‹ РїРѕ Р·РЅР°РєСѓ в†’ РЅР°РїСЂР°РІР»РµРЅРёРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРѕ РґРІСѓРјСЏ РЅРµР·Р°РІРёСЃРёРјС‹РјРё С‚РµСЃС‚Р°РјРё.';
  if (hurst != null && hurst > 0.55 && slopeSign !== 0) {
    dir += 1;
    dirComponents.hurstTrend = { pts: 1, label: `H=${hurst.toFixed(3)}>0.55, slopeв‰ 0` };
  } else {
    dirComponents.hurstTrend = { pts: 0, label: hurst != null ? `H=${hurst.toFixed(3)}` : 'N/A' };
  }
  dirComponents.hurstTrend.tip = 'Hurst > 0.55 + РЅРµРЅСѓР»РµРІРѕР№ slope в†’ РµСЃС‚СЊ С‚СЂРµРЅРґРѕРІР°СЏ СЃРѕСЃС‚Р°РІР»СЏСЋС‰Р°СЏ, РЅР°РїСЂР°РІР»РµРЅРёРµ РїРѕРґРєСЂРµРїР»РµРЅРѕ РёРЅРµСЂС†РёРµР№.';

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

  // Magnitude-weighting: small slopes (<0.5Пѓ) shouldn't dominate
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
 *  (trending series в†’ user should use Pick/Swing for those).
 *
 *  Levels: adaptive count based on half-life.
 *    - Short HL (< 20 bars): fast mean-reversion в†’ many levels (24) for fine grid.
 *    - Long HL (> 100 bars): slow reversion в†’ few levels (8) so each step survives.
 *    - Linear interpolation in between, clamped to [8, 24].
 *
 *  Step size: target = GK_vol В· в€љ(T / N), so the grid accumulates a full Пѓ_T move
 *  over the half-life, with N intervals catching the move progressively. */
export function ouGridBounds(closes, klines) {
  if (!closes || closes.length < 30) return null;
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 30) return null;
  const gk = garmanKlassVol(klines);
  if (gk == null) return null;
  const hlRaw = ouHalfLife(x);
  // For trending series (no HL) we still produce a fallback using Пѓ_T over a fixed
  // 50-bar window вЂ” this lets the screener return SOMETHING rather than null.
  const hlUsed = hlRaw != null ? Math.max(5, Math.min(200, hlRaw)) : 50;

  // Adaptive level count: short HL в†’ many levels, long HL в†’ few.
  const levels = hlRaw == null
    ? 12                                // trending fallback
    : optimalLevelsForHalfLife(hlRaw);

  // Ој = geometric mean of closes (= exp(mean(log(closes))))
  const logPrices = x.map((v) => Math.log(v));
  const logMu = logPrices.reduce((a, b) => a + b, 0) / logPrices.length;

  // Span: В±1.5 Пѓ_T (covers ~87% of expected distribution over one half-life)
  const sigmaT = gk * Math.sqrt(hlUsed);
  const lower = Math.exp(logMu - 1.5 * sigmaT);
  const upper = Math.exp(logMu + 1.5 * sigmaT);

  // Step: half-bar vol, but scaled so N steps roughly span the range.
  // Target spacing = Пѓ_T / N (one sigma-unit per step across the half-life).
  const step = (upper - lower) / Math.max(1, levels);

  return { lower, upper, step, levels, sigmaT, hl: hlRaw };
}

/** Optimal grid level count based on half-life.
 *  Empirical: HL 20 в†’ 24 levels; HL 100 в†’ 8 levels; linear in between.
 *  HL < 10 в†’ 24 (very fast reversion); HL > 200 в†’ 8 (very slow).
 *  null/NaN/non-positive в†’ 12 (safe middle default for trending series). */
export function optimalLevelsForHalfLife(hl) {
  if (hl == null || !isFinite(hl) || hl <= 0) return 12;
  if (hl <= 10) return 24;
  if (hl >= 100) return 8;
  // Linear interpolation: 24 - (hl - 10) * (24 - 8) / (100 - 10)
  const n = 24 - (hl - 10) * 16 / 90;
  return Math.max(8, Math.min(24, Math.round(n)));
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

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  Pure UI helpers вЂ” used by the screener modal. No DOM, no fetch.
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

/**
 * Apply the Smart screener filter set to a row array.
 * Filters (all optional):
 *   minScore       вЂ” minimum score (default 0)
 *   directions     вЂ” Set of allowed directions ('LONG' | 'SHORT' | 'NEUTRAL').
 *                    Empty / null / undefined means "all".
 *   minConfidence  вЂ” minimum confidence 0-100 (default 0). Rows with
 *                    null/undefined confidence are treated as 0.
 *
 * Returns a NEW array; original rows are not mutated.
 */
export function filterSmartRows(rows, filters = {}) {
  if (!Array.isArray(rows)) return [];
  const {
    minScore = 0,
    directions = null,
    minConfidence = 0,
  } = filters;
  const dirSet = directions && typeof directions[Symbol.iterator] === 'function' && !(directions instanceof Set)
    ? new Set(directions)
    : directions instanceof Set
      ? directions
      : null;
  const out = [];
  for (const r of rows) {
    if (!r || r.score == null) continue;
    if (r.score < minScore) continue;
    if (dirSet && !dirSet.has(r.direction)) continue;
    const conf = r.confidence == null ? 0 : r.confidence;
    if (conf < minConfidence) continue;
    out.push(r);
  }
  return out;
}

/**
 * Sort Smart screener rows by a key. Returns a NEW array.
 *
 * Keys: 'sym' | 'score' | 'mr' | 'fit' | 'dir' | 'conf' | 'gkh'
 *   - 'sym' / 'dir': localeCompare (string)
 *   - others: numeric; null/NaN are sorted to -Infinity so they
 *     appear at the bottom on desc and at the top on asc.
 *
 * dir: 'asc' | 'desc' (default 'desc').
 */
export function sortSmartRows(rows, key = 'score', dir = 'desc') {
  if (!Array.isArray(rows)) return [];
  const sign = dir === 'asc' ? 1 : -1;
  const valueOf = (r) => {
    if (key === 'sym') return r.sym || '';
    if (key === 'score') return r.score;
    if (key === 'mr') return r.mr;
    if (key === 'fit') return r.fit;
    if (key === 'dir') return r.direction || '';
    if (key === 'conf') return r.confidence == null ? -Infinity : r.confidence;
    if (key === 'gkh') return r.raw?.gkPct;
    return null;
  };
  return rows.slice().sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;       // nulls last
    if (vb == null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * sign;
    }
    const na = typeof va === 'number' && isFinite(va) ? va : -Infinity;
    const nb = typeof vb === 'number' && isFinite(vb) ? vb : -Infinity;
    return (na - nb) * sign;
  });
}

/** Band в†’ color used for the score badge. Pure. */
export function smartBandColor(band) {
  if (band === 'green') return '#22c55e';
  if (band === 'yellow') return '#eab308';
  if (band === 'red') return '#ef4444';
  return '#94a3b8';
}

/** Direction в†’ color used for the direction badge. Pure. */
export function smartDirectionColor(direction) {
  if (direction === 'LONG') return '#22c55e';
  if (direction === 'SHORT') return '#ef4444';
  return '#94a3b8';
}

/**
 * Build the user-visible empty-state message based on the screener state.
 * Pure: callers pass primitive state flags.
 */
export function smartEmptyMessage(state = {}) {
  const { loading = false, error = '', hasFilters = false } = state;
  if (loading) return 'Загрузка…';
  if (error) return String(error);
  return hasFilters
    ? 'Нет результатов (проверь фильтры).'
    : 'Нет результатов.';
}

/**
 * Build the HTML string for skeleton rows shown while a scan is in flight.
 * Returns N rows (default 8) of placeholder bars; relies on the
 * `.gbs-skeleton*` CSS classes defined in style.css.
 *
 * Pure: depends only on the rowCount parameter; uses inline className
 * strings (no dynamic data) so it's safe to interpolate directly into HTML.
 */
export function smartSkeletonRows(rowCount = 8) {
  const n = Math.max(1, Math.min(20, rowCount | 0));
  let html = '';
  for (let i = 0; i < n; i++) {
    html += `<tr><td colspan="9" style="padding:0 8px">
      <div class="gbs-skeleton">
        <span class="gbs-skeleton-bar gbs-skeleton-bar--w12"></span>
        <span class="gbs-skeleton-bar gbs-skeleton-bar--w70"></span>
      </div>
    </td></tr>`;
  }
  return html;
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  Screener registration (modal + scan + render)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

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

  function openGridSmartScreener() {
    const old = document.getElementById('gridSmartModal');
    if (old) {
      old.remove();
      return;
    }
    const modal = document.createElement('div');
    modal.id = 'gridSmartModal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:818;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';

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
      if (lu) lu.textContent = ui.lastRun ? new Date(ui.lastRun).toLocaleTimeString() : 'вЂ”';
      const sk = box.querySelector('#gbsSmartSk');
      if (sk) sk.style.display = ui.loading ? '' : 'none';
      const dg = box.querySelector('#gbsSmartDiag');
      if (dg) dg.textContent = ui.diag || '';
    }

    function applyFiltersAndRender() {
      // Build the direction set from ui flags.
      const allowedDirs = new Set();
      if (ui.showLong) allowedDirs.add('LONG');
      if (ui.showShort) allowedDirs.add('SHORT');
      if (ui.showNeutral) allowedDirs.add('NEUTRAL');
      const minConf = ui.showLowConf ? 0 : 60;

      let rows = filterSmartRows(ui.lastRows, {
        minScore: ui.minScore,
        directions: allowedDirs,
        minConfidence: minConf,
      });
      rows = sortSmartRows(rows, ui.sortKey, ui.sortDir);

      const tb = box.querySelector('#gbsSmartBody');
      if (!tb) return;
      if (!rows.length) {
        // Skeleton during the initial scan; simple "Загрузка…" cell thereafter.
        if (ui.loading && !ui.lastRun) {
          tb.innerHTML = smartSkeletonRows(8);
          renderMeta();
          return;
        }
        const msg = smartEmptyMessage({
          loading: ui.loading,
          error: ui.error,
          hasFilters: ui.minScore > 0 || !ui.showLong || !ui.showShort || !ui.showNeutral,
        });
        tb.innerHTML = `<tr><td colspan="9" style="padding:10px 8px;color:var(--text3);font-size:10px">${escapeHtml(msg)}</td></tr>`;
        renderMeta();
        return;
      }
      const frag = document.createDocumentFragment();
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.dataset.sym = r.sym;
        const badgeCls = `gbs-badge gbs-badge--${r.band === 'green' ? 'green' : r.band === 'yellow' ? 'yellow' : 'red'}`;
        const dirCls = `gbs-badge gbs-badge--${r.direction === 'LONG' ? 'long' : r.direction === 'SHORT' ? 'short' : 'neutral'}`;
        const conf = r.confluence;
        const confMark = conf == null ? 'вЂ”' : conf === 'agree' ? 'вњ“' : conf === 'disagree' ? 'вљ ' : 'вЂ”';
        const confTitle = conf == null
          ? 'РЅРµС‚ РґР°РЅРЅС‹С… СЃС‚Р°СЂС€РµРіРѕ TF'
          : conf === 'agree' ? 'СЃС‚Р°СЂС€РёР№ TF СЃРѕРіР»Р°СЃРµРЅ РїРѕ РЅР°РїСЂР°РІР»РµРЅРёСЋ'
          : conf === 'disagree' ? 'СЃС‚Р°СЂС€РёР№ TF РїСЂРѕС‚РёРІ СЂР°Р±РѕС‡РµРіРѕ'
          : 'РЅРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР°РЅРЅС‹С…';
        const bd = Object.entries(r.breakdown || {})
          .map(([group, comps]) =>
            Object.entries(comps)
              .map(([k, v]) => `<span class="gbs-tag" title="${escapeHtml(v.tip || k)}" style="cursor:help;border-bottom:1px dotted #a78bfa">${escapeHtml(k)}: ${escapeHtml(v.label)} в†’ +${escapeHtml(v.pts)}</span>`)
              .join(' ')
          )
          .join(' ');
        tr.innerHTML = `
          <td><div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><b style="cursor:pointer;color:#7dd3fc" class="gbs-open">${escapeHtml(r.sym.replace(/USDT$/, ''))}</b><button class="gbs-lab-open" title="РћС‚РєСЂС‹С‚СЊ РІ Grid Lab СЃ РїСЂРµРґР»РѕР¶РµРЅРЅС‹РјРё РіСЂР°РЅРёС†Р°РјРё" style="cursor:pointer;background:transparent;border:0;color:#a78bfa;font-size:11px;padding:0 2px;line-height:1">рџ“Љ</button></div></td>
          <td><span class="${escapeHtml(badgeCls)}">${escapeHtml(r.score)}</span></td>
          <td><span class="${escapeHtml(dirCls)}">${escapeHtml(r.direction)}</span></td>
          <td>${escapeHtml(r.confidence ?? 0)}%</td>
          <td>${escapeHtml(r.mr)}/5</td>
          <td>${escapeHtml(r.fit)}/5</td>
          <td>${r.raw?.gkPct != null ? escapeHtml(r.raw.gkPct.toFixed(2)) + '%' : 'вЂ”'}</td>
          <td title="${escapeHtml(confTitle)}" style="text-align:center;font-size:11px">${ui.showConfluence ? confMark : 'вЂ”'}</td>
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
            // Smart stays open behind Grid Lab вЂ” no closeSelf callback.
            // The 5-min refresh timer keeps running; on next tick it'll re-render.
            openGridLabFromRow(r, 'smart');
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
        <span style="font-size:12px;font-weight:600;color:#fff;flex:1">Grid Smart В· OU-С„РёР»СЊС‚СЂ</span>
        <span id="gbsSmartSk" style="font-size:10px;color:var(--text3);display:none">РћР±РЅРѕРІР»РµРЅРёРµвЂ¦</span>
        <span id="gbsSmartDiag" style="font-size:9px;color:var(--text3)"></span>
        <button class="tbtn" id="gbsSmartRf">РћР±РЅРѕРІРёС‚СЊ</button>
        <button class="tbtn" id="gbsSmartX">Р—Р°РєСЂС‹С‚СЊ</button>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:10px">
        <label title="Р Р°Р±РѕС‡РёР№ С‚Р°Р№РјС„СЂРµР№Рј: РІСЃРµ РјРµС‚СЂРёРєРё (half-life, GK, ADF, slope) СЃС‡РёС‚Р°СЋС‚СЃСЏ РїРѕ РЅРµРјСѓ. РљРѕРЅС‚РµРєСЃС‚РЅС‹Р№ TF РїРѕРґС‚СЏРіРёРІР°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РґР»СЏ РєРѕР»РѕРЅРєРё вЂРљРѕРЅС„Р»СЋСЌРЅСЃвЂ™." style="cursor:help;border-bottom:1px dotted var(--text3)">TF
          <select id="gbsSmartTf" style="margin-left:4px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font:inherit;font-size:10px;padding:3px 6px">
            ${SUPPORTED_TFS.map(t => `<option value="${t}"${ui.tf === t ? ' selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label title="РњРёРЅРёРјР°Р»СЊРЅС‹Р№ РёС‚РѕРіРѕРІС‹Р№ score (0вЂ“13). Р‘Р°РЅРґ: в‰Ґ10 Р·РµР»С‘РЅС‹Р№, в‰Ґ7 Р¶С‘Р»С‚С‹Р№, <7 РєСЂР°СЃРЅС‹Р№." style="cursor:help;border-bottom:1px dotted var(--text3)">РњРёРЅ. score <input type="range" id="gbsSmartMinSc" min="0" max="13" value="${ui.minScore}" style="width:100px;vertical-align:middle"></label>
        <span id="gbsSmartMinScV">${ui.minScore}</span>
        <label title="РџРѕРєР°Р·С‹РІР°С‚СЊ С‚РѕР»СЊРєРѕ СЂСЏРґС‹ СЃ РЅР°РїСЂР°РІР»РµРЅРёРµРј LONG (slope РІРІРµСЂС… + ADF/slope СЃРѕРіР»Р°СЃРѕРІР°РЅС‹)" style="cursor:help"><input type="checkbox" id="gbsSmartLong"${ui.showLong ? ' checked' : ''}> LONG</label>
        <label title="РџРѕРєР°Р·С‹РІР°С‚СЊ С‚РѕР»СЊРєРѕ СЂСЏРґС‹ СЃ РЅР°РїСЂР°РІР»РµРЅРёРµРј SHORT (slope РІРЅРёР· + ADF/slope СЃРѕРіР»Р°СЃРѕРІР°РЅС‹)" style="cursor:help"><input type="checkbox" id="gbsSmartShort"${ui.showShort ? ' checked' : ''}> SHORT</label>
        <label title="РџРѕРєР°Р·С‹РІР°С‚СЊ СЂСЏРґС‹ Р±РµР· РІС‹СЂР°Р¶РµРЅРЅРѕРіРѕ РЅР°РїСЂР°РІР»РµРЅРёСЏ (adaptive threshold РЅРµ РїСЂРѕР±РёС‚) вЂ” РґР»СЏ РЅРµР№С‚СЂР°Р»СЊРЅС‹С… СЃРµС‚РѕРє" style="cursor:help"><input type="checkbox" id="gbsSmartNeutral"${ui.showNeutral ? ' checked' : ''}> NEUTRAL</label>
        <label title="Р•СЃР»Рё РІРєР»СЋС‡РµРЅРѕ вЂ” РґРѕР±Р°РІР»СЏРµС‚ СЂСЏРґС‹ СЃ confidence &lt; 60% (СЃР»Р°Р±РѕРµ СЃРѕРіР»Р°СЃРёРµ С‚РµСЃС‚РѕРІ, РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ СЃ РѕСЃС‚РѕСЂРѕР¶РЅРѕСЃС‚СЊСЋ)" style="cursor:help;border-bottom:1px dotted #f59e0b"><input type="checkbox" id="gbsSmartLowConf"${ui.showLowConf ? ' checked' : ''}> Low conf (&lt;60%)</label>
        <label title="РџРѕРєР°Р·С‹РІР°С‚СЊ РєРѕР»РѕРЅРєСѓ вЂРљРѕРЅС„Р»СЋСЌРЅСЃвЂ™: СЃСЂР°РІРЅРµРЅРёРµ РЅР°РєР»РѕРЅР° СЂР°Р±РѕС‡РµРіРѕ TF (РЅР°РїСЂ. 15m) СЃРѕ СЃС‚Р°СЂС€РёРј TF (РЅР°РїСЂ. 1h). вњ“ вЂ” РѕР±Р° СЃРѕРіР»Р°СЃРЅС‹ РїРѕ РЅР°РїСЂР°РІР»РµРЅРёСЋ, вљ  вЂ” СЂР°СЃС…РѕРґСЏС‚СЃСЏ, вЂ” вЂ” РґР°РЅРЅС‹С… РЅРµС‚" style="cursor:help;border-bottom:1px dotted #a78bfa"><input type="checkbox" id="gbsSmartConf"${ui.showConfluence ? ' checked' : ''}> РљРѕРЅС„Р»СЋСЌРЅСЃ</label>
        <span style="margin-left:auto;color:var(--text3)">РћР±РЅРѕРІР»РµРЅРѕ: <span id="gbsSmartLu">вЂ”</span></span>
      </div>
      <div style="padding:4px 12px;border-bottom:1px solid var(--border);font-size:9px;color:var(--text3);line-height:1.4">
        Score: mean-reversion (0вЂ“5) + grid fitness (0вЂ“5) + directional confidence (0вЂ“3). РќР°РїСЂР°РІР»РµРЅРёРµ Р°РґР°РїС‚РёРІРЅРѕРµ: РїРѕСЂРѕРі = РјРµРґРёР°РЅР° |dirScore| РїРѕ РІС‹Р±РѕСЂРєРµ. Р“СЂР°РЅРёС†С‹: Ој В± 1.5Пѓ_T, РіРґРµ Пѓ_T = GKВ·в€љ(half-life). РЈСЂРѕРІРЅРё: 8вЂ“24, Р±РѕР»СЊС€Рµ вЂ” РїСЂРё РєРѕСЂРѕС‚РєРѕРј half-life.
      </div>
      <div style="flex:1;min-height:0;overflow:auto">
        <table class="gbs-table" style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr>
            <th class="gbs-th" data-k="sym" title="РЎРёРјРІРѕР» Binance. РљР»РёРє вЂ” РѕС‚РєСЂС‹С‚СЊ РіСЂР°С„РёРє; рџ“Љ вЂ” РѕС‚РєСЂС‹С‚СЊ РІ Grid Lab СЃ РїСЂРµРґР»РѕР¶РµРЅРЅС‹РјРё РіСЂР°РЅРёС†Р°РјРё">РўРёРєРµСЂ</th>
            <th class="gbs-th" data-k="score" title="РС‚РѕРіРѕРІС‹Р№ score 0вЂ“13: 5 вЂ” mean-reversion, 5 вЂ” grid fitness, 3 вЂ” directional confidence. в‰Ґ10 Р·РµР»С‘РЅС‹Р№, в‰Ґ7 Р¶С‘Р»С‚С‹Р№, <7 РєСЂР°СЃРЅС‹Р№">Score</th>
            <th class="gbs-th" data-k="dir" title="РќР°РїСЂР°РІР»РµРЅРёРµ СЃРµС‚РєРё: LONG (slope РІРІРµСЂС…), SHORT (slope РІРЅРёР·), NEUTRAL (Р±РµР· РЅР°РїСЂР°РІР»РµРЅРёСЏ). РџРѕСЂРѕРі Р°РґР°РїС‚РёРІРЅС‹Р№ РїРѕ РІС‹Р±РѕСЂРєРµ">Dir</th>
            <th class="gbs-th" data-k="conf" title="РЈРІРµСЂРµРЅРЅРѕСЃС‚СЊ РЅР°РїСЂР°РІР»РµРЅРёСЏ: РЅР°СЃРєРѕР»СЊРєРѕ РµРґРёРЅРѕРіР»Р°СЃРЅС‹ С‚РµСЃС‚С‹ ADF + slope + Hurst + VWAP. 0вЂ“100%">РљРѕРЅС„</th>
            <th class="gbs-th" data-k="mr" title="Mean-reversion quality: Hurst в€€ [0.30,0.50], VR <0.7, OU half-life в€€ [10,50]. Р§РµРј РІС‹С€Рµ вЂ” С‚РµРј РЅР°РґС‘Р¶РЅРµРµ РІРѕР·РІСЂР°С‚ Рє СЃСЂРµРґРЅРµР№">MR</th>
            <th class="gbs-th" data-k="fit" title="Grid fitness: GK vol 1вЂ“5%, vol/mcap >0.05, СЃРїСЂРµРґ <2%. Р§РµРј РІС‹С€Рµ вЂ” С‚РµРј РїСЂРёРіРѕРґРЅРµРµ РґР»СЏ СЃРµС‚РєРё">fit</th>
            <th class="gbs-th" data-k="gkh" title="GK vol / price Р·Р° РѕРґРёРЅ Р±Р°СЂ, РІ %. РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ РѕС†РµРЅРєРё РїР»РѕС‚РЅРѕСЃС‚Рё СЃРµС‚РєРё">О”H/L</th>
            <th title="РљРѕРЅС„Р»СЋСЌРЅСЃ СЃРѕ СЃС‚Р°СЂС€РёРј TF: вњ“ вЂ” РЅР°РєР»РѕРЅ СЃРѕРіР»Р°СЃРµРЅ РїРѕ Р·РЅР°РєСѓ, вљ  вЂ” РїСЂРѕС‚РёРІ, вЂ” вЂ” РґР°РЅРЅС‹С… РЅРµС‚">${ui.showConfluence ? 'СЃС‚Р°СЂС€.' : 'вЂ”'}</th>
            <th title="РќР°РІРµРґРё РЅР° С„РёРѕР»РµС‚РѕРІС‹Рµ С‚РµРіРё вЂ” С‚Р°Рј С‡РµР»РѕРІРµС‡РµСЃРєРёРј СЏР·С‹РєРѕРј РѕР±СЉСЏСЃРЅСЏРµС‚СЃСЏ РєР°Р¶РґР°СЏ РјРµС‚СЂРёРєР°">РњРµС‚СЂРёРєРё</th>
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
      // Stale-scan guard: increment uiRef.scanId so any in-flight scan from a previous
      // TF switch won't overwrite newer results. Each await checks uiRef.scanId vs its
      // captured myId and aborts if it's stale.
      uiRef.scanId = (uiRef.scanId || 0) + 1;
      const myId = uiRef.scanId;
      const isStale = () => myId !== uiRef.scanId;

      uiRef.loading = true;
      uiRef.error = '';
      uiRef.diag = 'universeвЂ¦';
      if (uiRef.renderMeta) uiRef.renderMeta();
      try {
        const baseAll = (S?.syms || []).slice();
        // Universe: top 200 by volume (no hard minVol вЂ” Smart penalises thin coins).
        const syms = selectUniverse(baseAll, vol24For, 200);
        if (isStale()) return;
        if (!syms.length) {
          uiRef.lastRows = [];
          uiRef.lastRun = Date.now();
          uiRef.error = 'Universe РїСѓСЃС‚РѕР№: РµС‰С‘ РЅРµ Р·Р°РіСЂСѓР·РёР»РёСЃСЊ РѕР±СЉС‘РјС‹ (S.mx / S.tk). РџРѕРґРѕР¶РґРё Р·Р°РіСЂСѓР·РєРё СЃРїРёСЃРєР° СЃРёРјРІРѕР»РѕРІ Рё РїРѕРїСЂРѕР±СѓР№ СЃРЅРѕРІР°.';
          uiRef.diag = 'universe=0';
          uiRef.loading = false;
          if (uiRef.applyFiltersAndRender) uiRef.applyFiltersAndRender();
          return;
        }
        uiRef.diag = `universe ${syms.length}/${baseAll.length || 0} В· mcapвЂ¦`;
        if (uiRef.renderMeta) uiRef.renderMeta();
        const mcapMap = await getMcapMap();
        if (isStale()) return;
        const tf = uiRef.tf;
        const tfCtx = CONTEXT_TF[tf] || tf;
        const bars = TF_BARS[tf] || 200;
        const barsCtx = tfCtx === tf ? 0 : (TF_BARS[tfCtx] || 100);
        uiRef.diag = `universe ${syms.length} В· mcap ${mcapMap?.size || 0} В· ${tf}вЂ¦`;
        if (uiRef.renderMeta) uiRef.renderMeta();
        const kl = await klineCache.batchCached(syms, tf, bars, null, null, 8);
        if (isStale()) return;
        let klCtx = null;
        if (barsCtx > 0) {
          uiRef.diag = `universe ${syms.length} В· mcap ${mcapMap?.size || 0} В· ${tf} ${Object.keys(kl || {}).length} В· ${tfCtx}вЂ¦`;
          if (uiRef.renderMeta) uiRef.renderMeta();
          klCtx = await klineCache.batchCached(syms, tfCtx, barsCtx, null, null, 8);
          if (isStale()) return;
        }
        uiRef.diag = `universe ${syms.length} В· ${tf} ${Object.keys(kl || {}).length} В· ${tfCtx} ${Object.keys(klCtx || {}).length} В· scoringвЂ¦`;
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
        if (isStale()) return;

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
        if (isStale()) return;

        uiRef.lastRows = rawRows;
        uiRef.lastRun = Date.now();
        uiRef.diag = `rows ${rawRows.length}/${syms.length} В· last ${new Date(uiRef.lastRun).toLocaleTimeString()}`;
        if (!rawRows.length) {
          uiRef.error = 'РЎРїРёСЃРѕРє РїСѓСЃС‚: РЅРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ klines. Р’РѕР·РјРѕР¶РµРЅ rate-limit Binance.';
        }
      } catch (e) {
        if (isStale()) return;
        uiRef.lastRows = [];
        uiRef.error = `РћС€РёР±РєР° СЃРєР°РЅР°: ${e?.message || String(e)}`;
        uiRef.diag = 'error';
      } finally {
        if (myId === uiRef.scanId) {
          uiRef.loading = false;
          if (uiRef.applyFiltersAndRender) uiRef.applyFiltersAndRender();
        }
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
