// ═══════════════════════════════════════════════════════════════
//  MULTI-EXCHANGE FOUNDATION (Binance + Bybit)
// ═══════════════════════════════════════════════════════════════
// Pure helpers for merging two venues into one screener universe:
// interval mapping, kline/ticker normalisation, universe building,
// per-symbol exchange resolution and routing.
// No DOM, no network — safe to unit-test in isolation.
//
// Wire protocol notes (validated against live API on 2026-10):
//   REST  https://api.bybit.com/v5/market/tickers?category=linear
//   REST  https://api.bybit.com/v5/market/kline?category=linear&symbol=…&interval=…&limit=…
//   WS    wss://stream.bybit.com/v5/public/linear  (ping every 20s)
//   CORS  open (reflects Origin) → direct browser access, no proxy needed.
// Bybit kline row: [start, open, high, low, close, volume(base), turnover(USDT)]
//   → NEWEST FIRST (reverse of Binance), no trade count.
// Bybit ticker: price24hPcnt is a FRACTION (0.0521 = +5.21%),
//   turnover24h is quote volume, volume24h is base volume,
//   fundingRate / openInterest / openInterestValue come in the SAME
//   payload (Binance needs three separate endpoints for those).

export const EXCHANGES = ['binance', 'bybit'];

export const EXCHANGE_LABEL = { binance: 'Binance', bybit: 'Bybit' };

/** Short badge text for headers: B / Y. */
export const EXCHANGE_BADGE = { binance: 'B', bybit: 'Y' };

export const BYBIT_API = 'https://api.bybit.com/v5/market';
export const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear';

/** Map a Binance-style TF string to the Bybit v5 interval code. */
export function tfToBybitInterval(tf) {
  const m = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '60m': '60',
    '1h': '60', '4h': '240', '1d': 'D', '1w': 'W', '3d': 'D',
  };
  return m[tf] || '5';
}

/**
 * Convert Bybit kline rows into the internal candle format
 * ({t,o,h,l,c,v,qv,tr}), oldest → newest.
 * Skips malformed rows; empty/absent input → [].
 */
export function parseBybitKlines(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 7) continue;
    const t = +r[0], o = +r[1], h = +r[2], l = +r[3], c = +r[4];
    if (!isFinite(t) || !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
    const v = +r[5], qv = +r[6];
    out.push({
      t, o, h, l, c,
      v: isFinite(v) ? v : 0,
      qv: isFinite(qv) ? qv : 0,
      tr: 0, // Bybit klines carry no trade count
    });
  }
  out.sort((a, b) => a.t - b.t); // Bybit is newest-first
  return out;
}

/**
 * Normalise a Bybit linear ticker into the app's common ticker shape
 * plus exchange extras (fund, oi) that Binance fetches separately.
 */
export function bybitTickerToCommon(t) {
  const num = (x) => (x == null || x === '' ? 0 : (isFinite(+x) ? +x : 0));
  return {
    p: num(t?.lastPrice),
    c24: num(t?.price24hPcnt) * 100, // fraction → percent
    h24: num(t?.highPrice24h),
    l24: num(t?.lowPrice24h),
    qv: num(t?.turnover24h),        // quote volume (USDT)
    v: num(t?.volume24h),           // base volume
    tr: 0,                           // Bybit tickers carry no trade count
    fund: num(t?.fundingRate),
    oi: num(t?.openInterest),
    oiUsd: num(t?.openInterestValue),
  };
}

/**
 * Build the merged screener universe from both exchanges' symbol maps.
 *
 * @param {Object} binance  { SYM: { qv, ... } } — Binance symbols (USDT perps)
 * @param {Object} bybit    { SYM: { qv, ... } } — Bybit symbols (USDT linear)
 * @param {'binance'|'bybit'} priority — preferred exchange for duplicates
 * @returns {Array<{sym,ex,qv,exchanges}>} one entry per base symbol, sorted by qv desc
 */
export function buildUniverse(binance, bybit, priority = 'binance') {
  const clean = (map) => {
    const out = {};
    if (!map || typeof map !== 'object') return out;
    for (const [sym, val] of Object.entries(map)) {
      if (typeof sym !== 'string' || !sym.endsWith('USDT') || sym.length <= 4) continue;
      out[sym] = val || {};
    }
    return out;
  };
  const b = clean(binance);
  const y = clean(bybit);
  const all = [...new Set([...Object.keys(b), ...Object.keys(y)])];
  const uni = [];
  for (const sym of all) {
    const onB = sym in b;
    const onY = sym in y;
    const exchanges = [onB ? 'binance' : null, onY ? 'bybit' : null].filter(Boolean);
    let ex;
    if (onB && onY) ex = priority === 'bybit' ? 'bybit' : 'binance';
    else ex = onB ? 'binance' : 'bybit';
    const qv = ex === 'binance' ? (b[sym].qv ?? 0) : (y[sym].qv ?? 0);
    uni.push({ sym, ex, qv, exchanges });
  }
  uni.sort((a, c) => (c.qv || 0) - (a.qv || 0));
  return uni;
}

/**
 * Decide which exchange a symbol should be sourced from right now.
 * Order: valid explicit override → priority exchange if available →
 * the only exchange it exists on → priority (unknown symbol).
 */
export function resolveSymbolExchange(sym, availability, priority, overrides) {
  const ov = overrides?.[sym];
  const avail = availability?.[sym];
  if (Array.isArray(avail) && avail.includes(ov)) return ov;
  if (ov && !avail) return ov; // override wins even when availability unknown
  if (Array.isArray(avail) && avail.length) {
    if (avail.includes(priority)) return priority;
    return avail[0];
  }
  return priority;
}

/** Pick the fetcher object for an exchange id, falling back to Binance. */
export function exchangeForKlines(fetchers, ex) {
  return (fetchers && fetchers[ex]) || fetchers?.binance;
}

/** True when a symbol string is marked with the Bybit prefix. */
export function isBybitSymbol(sym) {
  return typeof sym === 'string' && sym.startsWith('BY:');
}

/**
 * Group symbols into chunks of N (used for WS subscribe batches).
 * Pure: returns a new array of arrays.
 */
export function bybitBySymToList(syms, chunk = 10) {
  if (!Array.isArray(syms)) return [];
  const out = [];
  for (let i = 0; i < syms.length; i += chunk) out.push(syms.slice(i, i + chunk));
  return out;
}
