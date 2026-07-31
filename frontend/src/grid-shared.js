// ═══════════════════════════════════════════════════════════════
//  GRID BOT SCREENERS — shared helpers
//  Pure helpers shared by Swing / Intraday / Pick screeners.
//  No DOM, no global state — safe to unit-test in isolation.
// ═══════════════════════════════════════════════════════════════

/** Strip USDT/USD/BUSD suffix and uppercase the result.
 *  Used to map a Binance pair (e.g. BTCUSDT) to a CoinGecko symbol (BTC). */
export function baseSymbol(sym){
  return sym.replace(/USDT$/i,'').replace(/USD$/i,'').replace(/BUSD$/i,'').toUpperCase();
}

/** HTML-escape user-supplied strings before interpolation. */
export function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/** Prune oldest localStorage keys with a given prefix, keeping at most `maxKeep`. */
export function pruneLocalStoragePrefix(prefix, maxKeep){
  if(typeof localStorage==='undefined')return;
  const keys=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).sort().reverse();
  for(let i=maxKeep;i<keys.length;i++){
    try{localStorage.removeItem(keys[i]);}catch{/* ignore */}
  }
}

/** Per-pair klines cache factory (avoids re-fetching the same Binance batches).
 *  Bind `batchKlines` once at factory time, so call sites stay terse:
 *    const cache = createKlineCache(batchKlines);
 *    const data = await cache.batchCached(syms, '1d', 100, null, null, 10);
 */
export function createKlineCache(batchKlinesFn, ttlMs = 2 * 60 * 1000){
  const _cache = new Map();
  const key = (iv, lim) => `${iv}:${lim}`;
  return {
    async batchCached(syms, iv, lim, pFrom, pTo, bs = 10){
      const k = key(iv, lim);
      const now = Date.now();
      const cached = _cache.get(k);
      const bySym = cached && now - cached.ts < ttlMs ? cached.bySym : new Map();
      const missing = [];
      for (const s of syms) if (!bySym.has(s)) missing.push(s);
      if (missing.length){
        const fresh = await batchKlinesFn(missing, iv, lim, pFrom, pTo, bs);
        for (const [sym, kl] of Object.entries(fresh || {})) bySym.set(sym, kl);
        _cache.set(k, { ts: now, bySym });
      }
      const out = {};
      for (const s of syms) if (bySym.has(s)) out[s] = bySym.get(s);
      return out;
    },
    clear(){ _cache.clear(); },
  };
}

/** Fetch CoinGecko market caps via backend proxy (if available) or direct.
 *  Pages 1..3 = up to 750 symbols. Cache TTL = 1h.
 *  Returns Map<baseSymbol, marketCapUsd>. */
export async function fetchCoinGeckoMcapMap(fj, backendBase){
  const map = new Map();
  for (let page = 1; page <= 3; page++){
    try{
      const url = backendBase
        ? `${backendBase.replace(/\/$/, '')}/api/proxy/coingecko/markets?page=${page}`
        : `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`;
      const rows = await fj(url, 20000, 1);
      if (!Array.isArray(rows)) break;
      for (const row of rows){
        const sym = String(row.symbol || '').toUpperCase();
        if (sym && row.market_cap && !map.has(sym)) map.set(sym, row.market_cap);
      }
      await new Promise((r) => setTimeout(r, 1100));
    } catch {
      // Market cap is an optional enhancement. If it fails, continue with what we have.
      break;
    }
  }
  return map;
}

/** Cached mcap map wrapper (1h TTL). */
export function createMcapProvider(fj, backendBase){
  let _map = null;
  let _at = 0;
  return async function getMcapMap(){
    if (_map && Date.now() - _at < 3600000) return _map;
    _map = await fetchCoinGeckoMcapMap(fj, backendBase);
    _at = Date.now();
    return _map;
  };
}

/** Pick the top-N symbols by 24h quote volume. Falls back to first N if volumes not ready. */
export function selectUniverse(allSyms, vol24For, maxN){
  const max = Math.max(20, Math.min(400, maxN | 0));
  const withVol = allSyms
    .map((sym) => ({ sym, v: vol24For(sym) }))
    .filter((x) => x.v != null && isFinite(x.v) && x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, max)
    .map((x) => x.sym);
  if (withVol.length >= 20) return withVol;
  return allSyms.slice(0, max);
}

/** Test whether a symbol passes the global minVol filter (in millions of USDT). */
export function passesMinVol(sym, vol24For, minVolMillions){
  if ((minVolMillions | 0) <= 0) return true;
  const v = vol24For(sym);
  return v != null && v >= minVolMillions * 1e6;
}
