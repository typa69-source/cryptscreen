import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DENSITY_SETTINGS,
  RELEVANT_PCT,
  CLUSTER_PCT,
  BUCKET_STEP_PCT,
  OB_CACHE_TTL_MS,
  OB_MAX_CONCURRENT,
  DENSITY_CACHE_TTL_MS,
  MIN_RELEVANT_LEVELS,
  getOrCreateDensitySettings,
  resetDensitySettings,
  setDensityThreshold,
  clusterOrderBook,
  volumeStats,
  classifyTier,
  buildDensityZones,
  priceBucket,
  levelsToUsd,
} from '../src/density.js';

// ─── Constants sanity ───────────────────────────────────────────
test('density constants: sane defaults', () => {
  assert.equal(DEFAULT_DENSITY_SETTINGS.largeMult, 3.5);
  assert.equal(DEFAULT_DENSITY_SETTINGS.medMult, 2.2);
  assert.equal(DEFAULT_DENSITY_SETTINGS.smallMult, 1.5);
  assert.equal(RELEVANT_PCT, 0.30);
  assert.equal(CLUSTER_PCT, 0.003);
  assert.equal(BUCKET_STEP_PCT, 0.0015);
  assert.equal(OB_CACHE_TTL_MS, 45000);
  assert.equal(OB_MAX_CONCURRENT, 3);
  assert.equal(DENSITY_CACHE_TTL_MS, 30000);
  assert.equal(MIN_RELEVANT_LEVELS, 3);
});

// ─── getOrCreateDensitySettings ─────────────────────────────────
test('getOrCreateDensitySettings: returns existing entry', () => {
  const store = { BTCUSDT: { largeMult: 5, medMult: 3, smallMult: 2 } };
  const ds = getOrCreateDensitySettings(store, 'BTCUSDT');
  assert.equal(ds.largeMult, 5);
  assert.equal(ds.medMult, 3);
  assert.equal(ds.smallMult, 2);
});

test('getOrCreateDensitySettings: creates defaults when missing', () => {
  const store = {};
  const ds = getOrCreateDensitySettings(store, 'ETHUSDT');
  assert.deepEqual(ds, DEFAULT_DENSITY_SETTINGS);
  assert.ok(store.ETHUSDT);
});

test('getOrCreateDensitySettings: empty sym → fresh defaults, no mutation', () => {
  const store = {};
  const ds = getOrCreateDensitySettings(store, '');
  assert.deepEqual(ds, DEFAULT_DENSITY_SETTINGS);
  assert.equal(Object.keys(store).length, 0);
});

// ─── resetDensitySettings ───────────────────────────────────────
test('resetDensitySettings: restores defaults', () => {
  const store = { BTCUSDT: { largeMult: 99, medMult: 99, smallMult: 99 } };
  resetDensitySettings(store, 'BTCUSDT');
  assert.deepEqual(store.BTCUSDT, DEFAULT_DENSITY_SETTINGS);
});

test('resetDensitySettings: no-op on empty sym', () => {
  const store = {};
  resetDensitySettings(store, '');
  assert.equal(Object.keys(store).length, 0);
});

// ─── setDensityThreshold ────────────────────────────────────────
test('setDensityThreshold: updates a single key', () => {
  const store = {};
  const ok = setDensityThreshold(store, 'BTCUSDT', 'largeMult', 4.5);
  assert.equal(ok, true);
  assert.equal(store.BTCUSDT.largeMult, 4.5);
});

test('setDensityThreshold: rejects invalid values', () => {
  const store = {};
  assert.equal(setDensityThreshold(store, 'BTCUSDT', 'largeMult', NaN), false);
  assert.equal(setDensityThreshold(store, 'BTCUSDT', 'largeMult', 'abc'), false);
  assert.equal(setDensityThreshold(store, 'BTCUSDT', 'largeMult', 0.05), false);
  assert.equal(setDensityThreshold(store, 'BTCUSDT', 'largeMult', -1), false);
  assert.equal(Object.keys(store).length, 0);
});

// ─── clusterOrderBook ───────────────────────────────────────────
test('clusterOrderBook: empty input → []', () => {
  assert.deepEqual(clusterOrderBook([]), []);
  assert.deepEqual(clusterOrderBook(null), []);
  assert.deepEqual(clusterOrderBook(undefined), []);
  assert.deepEqual(clusterOrderBook([[100, 1]]), []);
});

test('clusterOrderBook: groups consecutive prices within clusterPct', () => {
  const levels = [
    [100, 1], [100.2, 2], [100.3, 3],         // cluster 1
    [101, 5], [101.1, 6],                     // cluster 2
    [105, 10],                                // cluster 3
  ];
  const out = clusterOrderBook(levels, 0.003);
  assert.equal(out.length, 3);
  assert.equal(out[0].count, 3);
  assert.equal(out[0].totalUsd, 6);
  assert.equal(out[1].count, 2);
  assert.equal(out[1].totalUsd, 11);
  assert.equal(out[2].count, 1);
  assert.equal(out[2].totalUsd, 10);
});

test('clusterOrderBook: weighted centerPrice', () => {
  // Original formula uses (centerPrice * (count - 1) + price) / count,
  // so for [100, 10] then [100.1, 20]: (100 * 1 + 100.1) / 2 = 100.05.
  const out = clusterOrderBook([[100, 10], [100.1, 20]], 0.003);
  assert.equal(out.length, 1);
  assert.equal(out[0].centerPrice.toFixed(2), '100.05');
});

// ─── volumeStats ─────────────────────────────────────────────────
test('volumeStats: empty → zeros', () => {
  const s = volumeStats([]);
  assert.equal(s.mean, 0);
  assert.equal(s.std, 0);
});

test('volumeStats: known sample', () => {
  const s = volumeStats([{ totalUsd: 10 }, { totalUsd: 20 }, { totalUsd: 30 }]);
  assert.equal(s.mean, 20);
  assert.equal(s.std.toFixed(2), '8.16'); // sqrt(200/3)
});

// ─── classifyTier ───────────────────────────────────────────────
test('classifyTier: large when above largeMult*std', () => {
  const stats = { mean: 100, std: 10 };
  const t = { largeMult: 3, medMult: 2, smallMult: 1 };
  // threshold = 100 + 10*3 = 130
  assert.equal(classifyTier(150, stats, t), 'large');
  assert.equal(classifyTier(120, stats, t), 'medium');
  assert.equal(classifyTier(105, stats, t), 'small');
});

test('classifyTier: smallMult acts as lower bound on tier ranking', () => {
  const stats = { mean: 100, std: 10 };
  const t = { largeMult: 5, medMult: 3, smallMult: 2 };
  // large cutoff = 150, med = 130, small = 120
  assert.equal(classifyTier(140, stats, t), 'medium');
  assert.equal(classifyTier(125, stats, t), 'small');
});

// ─── buildDensityZones ──────────────────────────────────────────
const sampleLevels = (currentPrice) => {
  // 100 bids around current price, 100 asks around current price
  const bids = [], asks = [];
  for (let i = 0; i < 100; i++) {
    bids.push([currentPrice - i * 5, (currentPrice - i * 5) * 10]);
    asks.push([currentPrice + i * 5, (currentPrice + i * 5) * 10]);
  }
  return { bids, asks };
};

test('buildDensityZones: empty book → []', () => {
  const out = buildDensityZones([], [], 100, DEFAULT_DENSITY_SETTINGS, new Map(), 'X');
  assert.deepEqual(out, []);
});

test('buildDensityZones: too few levels → []', () => {
  const out = buildDensityZones([[100, 1]], [[101, 1]], 100, DEFAULT_DENSITY_SETTINGS, new Map(), 'X');
  assert.deepEqual(out, []);
});

test('buildDensityZones: returns zones with tier classification', () => {
  const { bids, asks } = sampleLevels(1000);
  // Add an extreme cluster so it definitely hits "large"
  bids.push([1000, 1e9]);
  asks.push([1000, 1e9]);
  const out = buildDensityZones(bids, asks, 1000, DEFAULT_DENSITY_SETTINGS, new Map(), 'X');
  assert.ok(out.length > 0);
  // Each zone has the expected shape
  for (const z of out) {
    assert.equal(typeof z.price, 'number');
    assert.equal(typeof z.vol, 'number');
    assert.ok(['large', 'medium', 'small'].includes(z.tier));
    assert.equal(typeof z.time, 'number');
  }
  // The huge spike must be 'large'
  const huge = out.find(z => z.vol > 1e8);
  assert.ok(huge);
  assert.equal(huge.tier, 'large');
});

test('buildDensityZones: filters out zones outside ±RELEVANT_PCT', () => {
  const bids = [];
  const asks = [];
  for (let i = 0; i < 50; i++) {
    bids.push([1000 - i * 5, 100]);
    asks.push([1000 + i * 5, 100]);
  }
  // Add an outlier way outside the relevant range
  bids.push([500, 1e9]);
  const out = buildDensityZones(bids, asks, 1000, DEFAULT_DENSITY_SETTINGS, new Map(), 'X');
  // Outlier at 500 must not appear (500 < 1000 * 0.7 = 700)
  assert.ok(out.every(z => z.price >= 700 && z.price <= 1300));
});

test('buildDensityZones: records first-seen chart time', () => {
  const { bids, asks } = sampleLevels(1000);
  bids.push([1000, 1e9]);
  asks.push([1000, 1e9]);
  const firstSeen = new Map();
  const out = buildDensityZones(bids, asks, 1000, DEFAULT_DENSITY_SETTINGS, firstSeen, 'BTCUSDT');
  assert.ok(firstSeen.size > 0);
  // All first-seen keys must be for this symbol and have a numeric time
  for (const [k, t] of firstSeen) {
    assert.ok(k.startsWith('BTCUSDT:'), `unexpected key prefix: ${k}`);
    assert.equal(typeof t, 'number');
    assert.ok(t > 0);
  }
  // Each zone's time must come from the first-seen map for this sym
  for (const z of out) {
    const seenTimes = Array.from(firstSeen.values());
    assert.ok(seenTimes.includes(z.time), `zone time ${z.time} not in first-seen map`);
  }
});

test('buildDensityZones: prunes stale first-seen keys', () => {
  const { bids, asks } = sampleLevels(1000);
  bids.push([1000, 1e9]);
  asks.push([1000, 1e9]);
  const firstSeen = new Map();
  // Pre-seed stale keys
  firstSeen.set('BTCUSDT:99999', 1);
  firstSeen.set('OTHER:1', 1);
  buildDensityZones(bids, asks, 1000, DEFAULT_DENSITY_SETTINGS, firstSeen, 'BTCUSDT');
  assert.ok(!firstSeen.has('BTCUSDT:99999'));
  assert.ok(firstSeen.has('OTHER:1'), 'unrelated symbol keys must not be touched');
});

// ─── priceBucket ────────────────────────────────────────────────
test('priceBucket: derived from current price', () => {
  // step = price * 0.0015
  // bucket(100, 0.15) = round(100 / 0.15) = 667
  assert.equal(priceBucket(100, 0.15), 667);
});

test('priceBucket: guards against zero step', () => {
  assert.equal(priceBucket(100, 0), 100 / 1e-8);
});

// ─── levelsToUsd ────────────────────────────────────────────────
test('levelsToUsd: converts qty to USD value', () => {
  const out = levelsToUsd([[100, 2], [50, 4]]);
  assert.deepEqual(out, [[100, 200], [50, 200]]);
});

test('levelsToUsd: handles empty / non-array', () => {
  assert.deepEqual(levelsToUsd([]), []);
  assert.deepEqual(levelsToUsd(null), []);
  assert.deepEqual(levelsToUsd(undefined), []);
});
