// ═══════════════════════════════════════════════════════════════
//  DENSITY — pure logic
// ═══════════════════════════════════════════════════════════════
//
// Order-book clustering + density zone computation. Drawing lives
// in density-ui.js.

import { TZ_OFFSET_S, toChartTime } from './state.js';

/** Default tier thresholds (in σ multiples). */
export const DEFAULT_DENSITY_SETTINGS = {
  largeMult: 3.5,
  medMult: 2.2,
  smallMult: 1.5,
};

/** Range around current price considered "relevant" (30% each side). */
export const RELEVANT_PCT = 0.30;

/** Width of each price cluster (0.3%). */
export const CLUSTER_PCT = 0.003;

/** Step used to derive stable bucket keys (0.15% of current price). */
export const BUCKET_STEP_PCT = 0.0015;

/** Threshold on minimum relevant levels to avoid noise. */
export const MIN_RELEVANT_LEVELS = 3;

/** Order book cache TTL in ms (refetch when stale). */
export const OB_CACHE_TTL_MS = 45000;

/** Order book max concurrent fetches. */
export const OB_MAX_CONCURRENT = 3;

/** Density zone cache TTL in ms (recompute when stale). */
export const DENSITY_CACHE_TTL_MS = 30000;

/**
 * Get (or lazily create) per-symbol density settings.
 *
 * @param {Record<string, {largeMult:number, medMult:number, smallMult:number}>} store
 * @param {string} sym
 * @returns {object}
 */
export function getOrCreateDensitySettings(store, sym) {
  if (!sym) return { ...DEFAULT_DENSITY_SETTINGS };
  if (!store[sym]) store[sym] = { ...DEFAULT_DENSITY_SETTINGS };
  return store[sym];
}

/**
 * Reset a symbol's density settings to defaults.
 */
export function resetDensitySettings(store, sym) {
  if (!sym) return;
  store[sym] = { ...DEFAULT_DENSITY_SETTINGS };
}

/**
 * Update a single threshold on a symbol's density settings.
 * Returns true on success, false if the input is invalid.
 */
export function setDensityThreshold(store, sym, key, val) {
  const v = parseFloat(val);
  if (isNaN(v) || v < 0.1) return false;
  const ds = getOrCreateDensitySettings(store, sym);
  ds[key] = v;
  return true;
}

/**
 * Cluster order-book levels by price proximity. Each cluster has
 * totalUsd (sum of USD values) and the volume-weighted centerPrice.
 *
 * @param {Array<[number, number]>} levels - [price, usdVal] pairs
 * @param {number} clusterPct
 * @returns {Array<{centerPrice:number, totalUsd:number, count:number}>}
 */
export function clusterOrderBook(levels, clusterPct = CLUSTER_PCT) {
  if (!Array.isArray(levels) || levels.length < 2) return [];
  const out = [];
  let cur = null;
  for (const [price, usdVal] of levels) {
    if (!cur || price > cur.centerPrice * (1 + clusterPct)) {
      if (cur) out.push(cur);
      cur = { centerPrice: price, totalUsd: usdVal, count: 1 };
    } else {
      cur.totalUsd += usdVal;
      cur.count++;
      cur.centerPrice = (cur.centerPrice * (cur.count - 1) + price) / cur.count;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Compute mean and std of cluster volumes.
 */
export function volumeStats(clusters) {
  if (!clusters.length) return { mean: 0, std: 0 };
  const vols = clusters.map(c => c.totalUsd);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  const std = Math.sqrt(vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length);
  return { mean, std };
}

/**
 * Classify a cluster's tier (large/medium/small) given volume stats
 * and density thresholds.
 */
export function classifyTier(volume, stats, thresholds) {
  const largeCutoff = stats.mean + stats.std * thresholds.largeMult;
  const medCutoff = stats.mean + stats.std * thresholds.medMult;
  if (volume >= largeCutoff) return 'large';
  if (volume >= medCutoff) return 'medium';
  return 'small';
}

/**
 * Build density zones from the order book + current price.
 *
 * @param {Array<[number, number]>} bids - [price, usdVal]
 * @param {Array<[number, number]>} asks - [price, usdVal]
 * @param {number} currentPrice
 * @param {object} thresholds - {largeMult, medMult, smallMult}
 * @param {object} firstSeenMap - shared map "sym:bucket" -> first seen chart-time
 * @param {string} sym - required for firstSeen keys
 * @returns {Array<{price:number, vol:number, tier:string, time:number}>}
 */
export function buildDensityZones(bids, asks, currentPrice, thresholds, firstSeenMap, sym) {
  const all = [...(bids || []), ...(asks || [])].sort((a, b) => a[0] - b[0]);
  if (all.length < 5) return [];

  let pMin, pMax;
  if (Number.isFinite(currentPrice) && currentPrice > 0) {
    pMin = currentPrice * (1 - RELEVANT_PCT);
    pMax = currentPrice * (1 + RELEVANT_PCT);
  } else {
    pMin = Infinity; pMax = -Infinity;
    for (const [p] of all) { if (p < pMin) pMin = p; if (p > pMax) pMax = p; }
  }

  const relevant = all.filter(([p]) => p >= pMin && p <= pMax);
  if (relevant.length < MIN_RELEVANT_LEVELS) return [];

  const clusters = clusterOrderBook(relevant);
  if (!clusters.length) return [];

  const stats = volumeStats(clusters);
  const baseStep = Math.max(1e-8, (currentPrice || 1) * BUCKET_STEP_PCT);

  // smallMult filters out noise below this threshold.
  const smallCutoff = stats.mean + stats.std * thresholds.smallMult;
  const activeKeys = new Set();
  const seenAt = Number.isFinite(currentPrice)
    ? Math.floor(Date.now() / 1000) + TZ_OFFSET_S
    : (Math.floor(Date.now() / 1000) + TZ_OFFSET_S);

  const zones = clusters
    .filter(c => c.totalUsd >= smallCutoff)
    .map(c => {
      const bucket = Math.round(c.centerPrice / baseStep);
      const tier = classifyTier(c.totalUsd, stats, thresholds);
      const key = `${sym}:${bucket}`;
      activeKeys.add(key);
      if (!firstSeenMap.has(key)) firstSeenMap.set(key, seenAt);
      return {
        price: c.centerPrice,
        vol: c.totalUsd,
        tier,
        time: firstSeenMap.get(key),
      };
    });

  // Trim stale keys for this sym so the map doesn't grow forever.
  for (const k of Array.from(firstSeenMap.keys())) {
    if (k.startsWith(sym + ':') && !activeKeys.has(k)) firstSeenMap.delete(k);
  }
  return zones;
}

/**
 * Find a stable price bucket (chart-time units) for a given price.
 * Used to derive a "first seen" key tied to a level, not a precise instant.
 */
export function priceBucket(price, baseStep) {
  return Math.round(price / Math.max(1e-8, baseStep));
}

/**
 * Convert raw order-book [price, qty] levels to [price, usdVal] pairs.
 */
export function levelsToUsd(levels) {
  if (!Array.isArray(levels)) return [];
  return levels.map(([p, q]) => [+p, +p * +q]);
}
