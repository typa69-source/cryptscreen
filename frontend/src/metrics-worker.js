// ═══════════════════════════════════════════════════════════════
//  Metrics Web Worker
// ═══════════════════════════════════════════════════════════════
//
// Runs the heavy per-symbol metric computation (calcAll) off the main
// thread so the UI stays responsive when there are 300+ symbols.
//
// Protocol:
//   in:  { id, syms, k5m, k1h, k1m, tk, fundRates, oiDelta, prevMx, dayStartMs }
//   out: { id, btcR, mx }
//
//   - btcR is the BTC 5m return series (needed by the screener for
//     sorting & correlation columns).
//   - mx is the per-symbol metric map that becomes S.mx on the main
//     thread.
//
// The worker is fully self-contained: it imports nothing from the
// project tree, only uses pure local helpers. The main thread sends
// JSON-serialisable objects only (no functions / DOM / circular refs).

// ─── Local helpers (mirror of metrics.js + calcRets from main.js) ─
// We re-declare them here instead of importing metrics.js so the worker
// bundle is small and free of any DOM-touching code from elsewhere.
// Inlined, but kept byte-for-byte compatible with metrics.js.

function calcRangeFromCandles(candles){
  if(!candles||!candles.length)return null;
  let H=-Infinity,L=Infinity;
  for(const k of candles){
    if(k.h>H)H=k.h;
    if(k.l<L)L=k.l;
  }
  return L>0?(H-L)/L*100:null;
}
function calcRets(kl){
  if(!kl||kl.length<2)return[];
  const r=[];
  for(let i=1;i<kl.length;i++)r.push((kl[i].c-kl[i-1].c)/kl[i-1].c);
  return r;
}
function calcCorr(a,b){
  if(!a||!b||a.length<2||a.length!==b.length)return null;
  const n=a.length;
  let sa=0,sb=0,saa=0,sbb=0,sab=0;
  for(let i=0;i<n;i++){
    const x=a[i],y=b[i];
    if(!isFinite(x)||!isFinite(y))return null;
    sa+=x;sb+=y;saa+=x*x;sbb+=y*y;sab+=x*y;
  }
  const num=n*sab-sa*sb;
  const den=Math.sqrt((n*saa-sa*sa)*(n*sbb-sb*sb));
  return den?num/den:null;
}
function calcNATRFlexible(kl,n){
  if(!kl||!kl.length)return null;
  const N=Math.min(n,kl.length-1);
  if(N<1)return null;
  let s=0;
  const f=kl.length-N;
  for(let i=f;i<kl.length;i++){
    const k=kl[i],p=kl[i-1];
    s+=Math.max(k.h-k.l,Math.abs(k.h-p.c),Math.abs(k.l-p.c));
  }
  const a=s/N;
  return a/kl[kl.length-1].c*100;
}
function calcRange(kl,n){
  if(!kl||kl.length<n)return null;
  const sl=kl.slice(-n);
  let H=-Infinity,L=Infinity;
  for(const k of sl){if(k.h>H)H=k.h;if(k.l<L)L=k.l;}
  return L>0?(H-L)/L*100:null;
}
function calcRangeFlexible(kl,n){
  if(!kl||!kl.length)return null;
  const N=Math.min(n,kl.length);
  if(N<2)return null;
  return calcRange(kl,N);
}
function calcRel(kl,n,f){
  if(!kl||kl.length<n+1)return null;
  const cur=kl[kl.length-1][f];
  let s=0;
  for(let i=kl.length-n;i<kl.length;i++)s+=kl[i][f];
  const avg=s/n;
  return avg>0?cur/avg:null;
}
function calcSma(arr,n){
  if(!arr||arr.length<n)return null;
  let s=0;
  for(let i=arr.length-n;i<arr.length;i++)s+=arr[i];
  return s/n;
}
function calcStd(arr,n,mean){
  if(!arr||arr.length<n)return null;
  let s=0;
  for(let i=arr.length-n;i<arr.length;i++){
    const d=arr[i]-mean;
    s+=d*d;
  }
  return Math.sqrt(s/n);
}
function calcBollinger(kl,n=20,k=2){
  if(!kl||kl.length<n)return null;
  const closes=new Array(kl.length);
  for(let i=0;i<kl.length;i++)closes[i]=kl[i].c;
  const ma=calcSma(closes,n);
  if(ma==null)return null;
  const sd=calcStd(closes,n,ma);
  if(sd==null)return null;
  return{width:(2*k*sd)/ma*100,upper:ma+k*sd,lower:ma-k*sd,middle:ma};
}
function calcSqueezePop(k5,vr5){
  const period=20,dev=2;
  if(!k5||k5.length<period+3||vr5==null||!isFinite(vr5))return 0;
  const bb=calcBollinger(k5.slice(-period-3),period,dev);
  if(!bb)return 0;
  const cur=k5[k5.length-1];
  const widthNow=bb.upper-bb.lower;
  let widthPrev=null;
  const bbPrev=calcBollinger(k5.slice(-period-4,-1),period,dev);
  if(bbPrev)widthPrev=bbPrev.upper-bbPrev.lower;
  const squeezed=widthPrev!=null&&widthNow<widthPrev*0.9&&widthNow>0;
  const breakout=cur.c>bb.upper||cur.c<bb.lower;
  return(squeezed&&vr5>=1.25&&breakout)?1:0;
}
function calcBbSignals(k5,vr5){
  const period=20,dev=2;
  let bbSqz=0,bbBreak=0;
  let width=null,upper=null,lower=null;
  if(k5&&k5.length>=period+3){
    const cur=k5[k5.length-1];
    const bb=calcBollinger(k5.slice(-period-3),period,dev);
    const bbPrev=calcBollinger(k5.slice(-period-4,-1),period,dev);
    if(bb){
      width=bb.width;upper=bb.upper;lower=bb.lower;
      if(bbPrev){
        const wNow=bb.upper-bb.lower;
        const wPrev=bbPrev.upper-bbPrev.lower;
        if(wPrev>0&&wNow<wPrev*0.9)bbSqz=1;
      }
      if(cur.c>bb.upper||cur.c<bb.lower)bbBreak=1;
    }
  }
  return{bbSqz,bbBreak,bbWidth:width,bbUpper:upper,bbLower:lower,volImpulse:(vr5!=null&&vr5>=1.25)?1:0};
}
function sparkVolSnapshot(kl,n=30){
  if(!kl||kl.length<6)return{spVol:null,spVold:''};
  const sl=kl.slice(-Math.min(n,kl.length));
  const vols=[];
  for(const k of sl){
    const q=+k.qv;
    if(isFinite(q)&&q>=0)vols.push(q);
  }
  if(vols.length<6)return{spVol:null,spVold:''};
  const first=Math.max(vols[0],1e-9),last=vols[vols.length-1];
  const chg=(last/first-1)*100;
  let minV=vols[0],maxV=vols[0];
  for(const v of vols){if(v<minV)minV=v;if(v>maxV)maxV=v;}
  const logLo=Math.log(Math.max(minV,1e-9)+1);
  const logHi=Math.log(Math.max(maxV,1e-9)+1);
  const loR=logLo,hiR=logHi<=logLo?logLo+1e-6:logHi;
  const padY=5,padX=1;
  const W=100,H=40;
  const n1=vols.length-1||1;
  const pts=new Array(vols.length);
  for(let i=0;i<vols.length;i++){
    const x=padX+(i/n1)*(W-2*padX);
    const lv=Math.log(Math.max(vols[i],1e-9)+1);
    const y=padY+(1-(lv-loR)/(hiR-loR))*(H-2*padY);
    pts[i]=x.toFixed(2)+','+y.toFixed(2);
  }
  return{spVol:chg,spVold:'M'+pts.join(' L')};
}
function sparkTrendSnapshot(kl,n=30){
  if(!kl||kl.length<6)return{sp5:null,sp5d:''};
  const sl=kl.slice(-Math.min(n,kl.length));
  if(sl.length<6)return{sp5:null,sp5d:''};
  const closes=[];
  for(const k of sl){
    const c=+k.c;
    if(isFinite(c)&&c>0)closes.push(c);
  }
  if(closes.length<6)return{sp5:null,sp5d:''};
  const first=closes[0],last=closes[closes.length-1];
  const pct=(last-first)/first*100;
  let min=closes[0],max=closes[0];
  for(const c of closes){if(c<min)min=c;if(c>max)max=c;}
  if(max<=min)return{sp5:pct,sp5d:''};
  let d='';
  const W=100,H=40;
  for(let i=0;i<closes.length;i++){
    const x=(i/(closes.length-1))*W;
    const y=H-((closes[i]-min)/(max-min))*H;
    d+=(i===0?'M':'L')+`${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return{sp5:pct,sp5d:d};
}

// ─── Main computation (mirrors calcAll in main.js) ───────────────
function computeMetrics({ syms, k5m, k1h, k1m, tk, fundRates, oiDelta, prevMx, dayStartMs }) {
  const btc5 = k5m['BTCUSDT'];
  const btcR = btc5 ? calcRets(btc5) : [];
  const btcR14 = btc5 && btc5.length >= 15 ? calcRets(btc5.slice(-15)) : [];
  const mx = {};
  for (const sym of syms) {
    const t = tk[sym]; if (!t) continue;
    const k5 = k5m[sym], k1h_ = k1h[sym], k1m_ = k1m[sym];
    let cday = null;
    if (k1h_ && k1h_.length > 0) {
      const todayCandle = k1h_.find(c => c.t >= dayStartMs);
      if (todayCandle) cday = (t.p - todayCandle.o) / todayCandle.o * 100;
    }
    const corr14 = k5 && k5.length >= 15 && btcR14.length
      ? calcCorr(calcRets(k5.slice(-15)), btcR14)
      : null;
    const k5today = k5 && k5.length ? k5.filter(c => c.t >= dayStartMs) : [];
    const rtd = calcRangeFromCandles(k5today);
    const sp = sparkTrendSnapshot(k5, 30);
    const volSpark = sparkVolSnapshot(k5, 30);
    const vr5v = calcRel(k5, 14, 'qv');
    const oiE = oiDelta[sym];
    const bb = calcBbSignals(k5, vr5v);
    const m = {
      sym, price: t.p, ch24: t.c24, cday,
      sp5: sp.sp5, sp5d: sp.sp5d,
      spVol: volSpark.spVol, spVold: volSpark.spVold,
      spv: volSpark.spVol,
      rtd,
      r24: calcRange(k5, 288), r7d: calcRange(k1h_, 168),
      na30: calcNATRFlexible(k1m_, 30),
      na14: calcNATRFlexible(k5, 14),
      r1m5: calcRangeFlexible(k1m_, 5),
      tr5: calcRel(k5, 14, 'tr'),
      tr1h: calcRel(k1h_, 24, 'tr'),
      vr5: vr5v,
      vr1h: calcRel(k1h_, 24, 'qv'),
      sqzPop: calcSqueezePop(k5, vr5v),
      bbSqz: bb.bbSqz,
      bbBreak: bb.bbBreak,
      volImpulse: bb.volImpulse ?? 0,
      fund: fundRates[sym] ?? prevMx[sym]?.fund ?? null,
      oi1h: oiE?.oi1h ?? prevMx[sym]?.oi1h ?? null,
      oi4h: oiE?.oi4h ?? prevMx[sym]?.oi4h ?? null,
      ch7d: null,
      trd24: t.tr,
      vol24: t.qv,
      corr: btcR.length > 10 && k5 ? calcCorr(calcRets(k5), btcR) : null,
      corr14,
      v15m: k1m_ && k1m_.length >= 2
        ? k1m_.slice(-Math.min(15, k1m_.length)).reduce((a, k) => a + k.qv, 0)
        : null,
      v60m: k1m_ && k1m_.length >= 2
        ? k1m_.slice(-Math.min(60, k1m_.length)).reduce((a, k) => a + k.qv, 0)
        : null,
    };
    if (k1h_ && k1h_.length >= 168) {
      const old = k1h_[k1h_.length - 168];
      m.ch7d = (t.p - old.c) / old.c * 100;
    }
    mx[sym] = m;
  }
  return { btcR, mx };
}

self.onmessage = (e) => {
  const { id } = e.data;
  try {
    const result = computeMetrics(e.data);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err && err.message ? err.message : String(err) });
  }
};
