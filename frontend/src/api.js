// ═══════════════════════════════════════════════════════════════
//  BINANCE API & NETWORK
// ═══════════════════════════════════════════════════════════════

import { API, HIST_LIMIT, HIST_INITIAL, HIST_CACHE_MAX, MIN_CHART_CANDLES } from './state.js';

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
      setTimeout(()=>fj(url,timeout,retries).then(res).catch(rej), Math.min(wait,30000));
      return;
    }
    const doFetch=()=>new Promise((rs,rj)=>{
      const t=setTimeout(()=>rj(new Error('Timeout')),timeout);
      fetch(url).then(async r=>{
        clearTimeout(t);
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
      }).catch(e=>{clearTimeout(t);rj(e);});
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

// Expose legacy globals temporarily for interop with main.js
if(typeof window!=='undefined'){
  window.fj = fj;
  window.parseKlines = parseKlines;
  window.mergeKlineChunks = mergeKlineChunks;
  window.batchKlines = batchKlines;
}
