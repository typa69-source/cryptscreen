// ═══════════════════════════════════════════════════════════════
//  BINANCE API & NETWORK
// ═══════════════════════════════════════════════════════════════

import { API, HIST_LIMIT, HIST_INITIAL, HIST_CACHE_MAX, MIN_CHART_CANDLES } from './state.js';
import { BYBIT_API, parseBybitKlines, tfToBybitInterval } from './exchanges.js';

let _bnBannedUntil = 0;
const _reqQueue = [];
let _reqRunning = 0;
const _reqMax = 3;

function _runQueue(){
  while(_reqRunning < _reqMax && _reqQueue.length){
    const {fn,res,rej} = _reqQueue.shift();
    _reqRunning++;
    fn().then(r=>{_reqRunning--;res(r);_runQueue();}).catch(e=>{_reqRunning--;rej(e);_runQueue();});
  }
}

export function fj(url,timeout=15000,retries=2){
  return new Promise((res,rej)=>{
    const now=Date.now();
    if(_bnBannedUntil>now){
      const wait=_bnBannedUntil-now;
      console.warn(`Binance ban active, waiting ${Math.round(wait/1000)}s`);
      // Preserve the original retries budget; otherwise the recursive call
      // would always start with a fresh counter and could hammer the API
      // while the rate-limit ban is still active.
      setTimeout(()=>fj(url,timeout,Math.max(0,retries-1)).then(res).catch(rej), Math.min(wait,30000));
      return;
    }
    const doFetch=()=>new Promise((rs,rj)=>{
      const controller=new AbortController();
      const t=setTimeout(()=>{rj(new Error('Timeout'));controller.abort();},timeout);
      fetch(url,{signal:controller.signal}).then(async r=>{
        const text=await r.text();
        let data;
        try{data=JSON.parse(text);}catch(e){rj(new Error('JSON parse error'));return;}
        if(data?.code===-1003){
          const until=data.msg?.match(/banned until (\d+)/)?.[1];
          if(until){_bnBannedUntil=+until;console.warn('Binance ban until',new Date(_bnBannedUntil));}
          else _bnBannedUntil=Date.now()+60000;
          rj(new Error('RATE_LIMIT'));return;
        }
        if(!r.ok){rj(new Error('HTTP '+r.status));return;}
        rs(data);
      }).catch(e=>{rj(e);}).finally(()=>clearTimeout(t));
    });
    const attempt=(n)=>{
      _reqQueue.push({fn:doFetch,res:rs=>{res(rs);},rej:e=>{
        if(e.message==='RATE_LIMIT'&&n>0){
          setTimeout(()=>attempt(n-1), 5000+Math.random()*5000);
        } else { rej(e); }
      }});
      _runQueue();
    };
    attempt(retries);
  });
}

export function parseKlines(raw){
  const out=[];
  for(const k of(raw||[])){
    const t=+k[0],o=+k[1],h=+k[2],l=+k[3],c=+k[4],vol=+k[5],qv=+k[7],tr=+k[8];
    if(!isFinite(t)||!isFinite(o)||!isFinite(h)||!isFinite(l)||!isFinite(c))continue;
    const hh=Math.max(h,o,c);
    const ll=Math.min(l,o,c);
    out.push({t,o,h:hh,l:ll,c,v:isFinite(vol)?vol:0,tr:isFinite(tr)?tr:0,qv:isFinite(qv)?qv:0});
  }
  return out;
}

export function mergeKlineChunks(a,b){
  if(!a||!a.length)return b||[];
  if(!b||!b.length)return a;
  const byT=new Map();
  for(const k of a)byT.set(k.t,k);
  for(const k of b)if(!byT.has(k.t))byT.set(k.t,k);
  return Array.from(byT.values()).sort((x,y)=>x.t-y.t);
}

export async function batchKlines(syms,iv,lim,pFrom,pTo,bs=10){
  const out={};
  for(let i=0;i<syms.length;i+=bs){
    const batch=syms.slice(i,i+bs);
    const results=await Promise.allSettled(batch.map(s=>fj(`${API}/klines?symbol=${encodeURIComponent(s)}&interval=${encodeURIComponent(iv)}&limit=${encodeURIComponent(lim)}`).then(d=>[s,parseKlines(d)])));
    for(const r of results)if(r.status==='fulfilled')out[r.value[0]]=r.value[1];
    if(pFrom!=null && typeof ldSet==='function')ldSet(null,pFrom+Math.round((i/syms.length)*(pTo-pFrom)),`${iv}: ${Math.min(i+bs,syms.length)}/${syms.length}`);
    if(i+bs<syms.length)await new Promise(r=>setTimeout(r,120+Math.random()*120));
  }
  return out;
}

// ───────────────────────────────────────────────────────────────
//  BYBIT API & NETWORK
// ───────────────────────────────────────────────────────────────
// Own queue + own concurrency so a Binance rate-limit ban never
// delays Bybit traffic (and vice versa). No shared _bnBannedUntil.

const _byReqQueue = [];
let _byReqRunning = 0;
const _byReqMax = 4;

function _runBybitQueue(){
  while(_byReqRunning < _byReqMax && _byReqQueue.length){
    const {fn,res,rej} = _byReqQueue.shift();
    _byReqRunning++;
    fn().then(r=>{_byReqRunning--;res(r);_runBybitQueue();}).catch(e=>{_byReqRunning--;rej(e);_runBybitQueue();});
  }
}

export function fjBybit(url,timeout=15000,retries=1){
  return new Promise((res,rej)=>{
    const doFetch=()=>new Promise((rs,rj)=>{
      const controller=new AbortController();
      const t=setTimeout(()=>{rj(new Error('Timeout'));controller.abort();},timeout);
      fetch(url,{signal:controller.signal}).then(async r=>{
        const text=await r.text();
        let data;
        try{data=JSON.parse(text);}catch(e){rj(new Error('JSON parse error'));return;}
        if(!r.ok){rj(new Error('HTTP '+r.status));return;}
        if(data && typeof data.retCode==='number' && data.retCode!==0){
          rj(new Error('Bybit retCode '+data.retCode+(data.retMsg?': '+data.retMsg:'')));
          return;
        }
        rs(data);
      }).catch(e=>{rj(e);}).finally(()=>clearTimeout(t));
    });
    const attempt=(n)=>{
      _byReqQueue.push({fn:doFetch,res:rs=>{res(rs);},rej:e=>{
        const retriable=e&&/Timeout|HTTP 5|HTTP 429|retCode 1000[26]/.test(String(e.message||''));
        if(retriable&&n>0){
          setTimeout(()=>attempt(n-1), 900+Math.random()*700);
        } else { rej(e); }
      }});
      _runBybitQueue();
    };
    attempt(retries);
  });
}

/** All Bybit USDT-linear tickers, normalised: { SYM: commonTicker }.
 *  Single REST call covers the whole venue (~800 symbols). */
export async function fetchBybitTickers(){
  const d = await fjBybit(`${BYBIT_API}/tickers?category=linear`, 15000, 1);
  const list = d?.result?.list;
  if(!Array.isArray(list)) return {};
  // Local import to avoid a module cycle at load time.
  const { bybitTickerToCommon } = await import('./exchanges.js');
  const out = {};
  for(const t of list){
    const sym = t?.symbol;
    if(typeof sym !== 'string' || !sym.endsWith('USDT')) continue;
    out[sym] = bybitTickerToCommon(t);
  }
  return out;
}

/** Bybit klines for one symbol, in the internal candle format (oldest first).
 *  `endMs` (optional): exclusive upper time bound — Bybit v5 supports
 *  cursor-less pagination via the `end` query param, which the caller uses
 *  to fetch bars OLDER than the cached window. */
export async function fetchBybitKlines(sym, iv, limit, endMs){
  const ivCode = tfToBybitInterval(iv);
  const lim = Math.max(1, Math.min(1000, limit|0));
  let url = `${BYBIT_API}/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${ivCode}&limit=${lim}`;
  if (Number.isFinite(+endMs) && +endMs > 0) url += `&end=${Math.floor(+endMs)}`;
  const d = await fjBybit(url, 15000, 1);
  return parseBybitKlines(d?.result?.list);
}

/** Batch Bybit klines across symbols (per-symbol requests, queued, batched). */
export async function batchBybitKlines(syms, iv, lim, bs=5){
  const out={};
  for(let i=0;i<syms.length;i+=bs){
    const batch=syms.slice(i,i+bs);
    const results=await Promise.allSettled(batch.map(s=>fetchBybitKlines(s,iv,lim).then(c=>[s,c])));
    for(const r of results)if(r.status==='fulfilled')out[r.value[0]]=r.value[1];
    if(i+bs<syms.length)await new Promise(r=>setTimeout(r,80+Math.random()*80));
  }
  return out;
}

// Expose legacy globals temporarily for interop with main.js
if(typeof window!=='undefined'){
  window.fj = fj;
  window.parseKlines = parseKlines;
  window.mergeKlineChunks = mergeKlineChunks;
  window.batchKlines = batchKlines;
  window.fjBybit = fjBybit;
  window.fetchBybitTickers = fetchBybitTickers;
  window.fetchBybitKlines = fetchBybitKlines;
  window.batchBybitKlines = batchBybitKlines;
}
