// ═══════════════════════════════════════════════════════════════
//  INDICATORS & METRICS
// ═══════════════════════════════════════════════════════════════

export function calcATR(kl,n){
  if(!kl||kl.length<n+1)return null;
  let s=0;
  const f=kl.length-n;
  for(let i=f;i<kl.length;i++){
    const k=kl[i],p=kl[i-1];
    s+=Math.max(k.h-k.l,Math.abs(k.h-p.c),Math.abs(k.l-p.c));
  }
  return s/n;
}
export function calcNATR(kl,n){
  const a=calcATR(kl,n);
  return a&&kl?a/kl[kl.length-1].c*100:null;
}
export function calcNATRFlexible(kl,n){
  if(!kl||!kl.length)return null;
  const N=Math.min(n,kl.length-1);
  if(N<1)return null;
  return calcNATR(kl,N);
}
export function calcRange(kl,n){
  if(!kl||kl.length<n)return null;
  const sl=kl.slice(-n);
  const H=sl.reduce((m,k)=>Math.max(m,k.h),-Infinity);
  const L=sl.reduce((m,k)=>Math.min(m,k.l),Infinity);
  return L>0?(H-L)/L*100:null;
}
export function calcRangeFlexible(kl,n){
  if(!kl||!kl.length)return null;
  const N=Math.min(n,kl.length);
  if(N<2)return null;
  return calcRange(kl,N);
}
export function calcRel(kl,n,f){
  if(!kl||kl.length<n+1)return null;
  const sl=kl.slice(-n-1);
  const cur=sl[sl.length-1][f];
  let s=0;
  for(let i=0;i<n;i++)s+=sl[i][f];
  const avg=s/n;
  return avg>0?cur/avg:null;
}

export function calcSma(arr,n){
  if(!arr||arr.length<n)return null;
  let s=0;
  for(let i=arr.length-n;i<arr.length;i++)s+=arr[i];
  return s/n;
}
export function calcStd(arr,n,mean){
  if(!arr||arr.length<n)return null;
  let s=0;
  for(let i=arr.length-n;i<arr.length;i++){
    const d=arr[i]-mean;
    s+=d*d;
  }
  return Math.sqrt(s/n);
}

export function calcBollinger(kl,n=20,k=2){
  if(!kl||kl.length<n)return null;
  const closes=kl.map(x=>x.c);
  const ma=calcSma(closes,n);
  if(ma==null)return null;
  const sd=calcStd(closes,n,ma);
  if(sd==null)return null;
  return{width:(2*k*sd)/ma*100,upper:ma+k*sd,lower:ma-k*sd,middle:ma};
}

export function calcCorrelation(a,b){
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

export function calcSqueezePop(k5,vr5){
  const period=20,dev=2;
  if(!k5||k5.length<period+3||vr5==null||!isFinite(vr5))return 0;
  const bb=calcBollinger(k5.slice(-period-3),period,dev);
  if(!bb)return 0;
  const cur=k5[k5.length-1];
  const prev=k5[k5.length-2];
  const widthNow=bb.upper-bb.lower;
  let widthPrev=null;
  const bbPrev=calcBollinger(k5.slice(-period-4,-1),period,dev);
  if(bbPrev)widthPrev=bbPrev.upper-bbPrev.lower;
  const squeezed=widthPrev!=null&&widthNow<widthPrev*0.9&&widthNow>0;
  const breakout=cur.c>bb.upper||cur.c<bb.lower;
  return(squeezed&&vr5>=1.25&&breakout)?1:0;
}

export function calcBbSignals(k5,vr5){
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

export function sparkTrendSnapshot(kl,n=30){
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
  const min=Math.min(...closes),max=Math.max(...closes);
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

export function calcVolProfile(kl,bins=24){
  if(!kl||kl.length<5)return[];
  let H=-Infinity,L=Infinity;
  let totalVol=0;
  for(const k of kl){
    H=Math.max(H,k.h);
    L=Math.min(L,k.l);
    totalVol+=k.qv||0;
  }
  if(H<=L||totalVol<=0)return[];
  const bucketH=(H-L)/bins;
  const prof=new Array(bins).fill(0);
  for(const k of kl){
    const vol=k.qv||0;
    const bi=Math.min(bins-1,Math.max(0,Math.floor((k.c-L)/bucketH)));
    prof[bi]+=vol;
  }
  const maxV=Math.max(...prof);
  return prof.map((v,i)=>({price:L+(i+0.5)*bucketH,vol:v,pct:maxV?v/maxV:0}));
}

// Expose legacy globals temporarily for interop with main.js
if(typeof window!=='undefined'){
  window.calcATR = calcATR;
  window.calcNATR = calcNATR;
  window.calcNATRFlexible = calcNATRFlexible;
  window.calcRange = calcRange;
  window.calcRangeFlexible = calcRangeFlexible;
  window.calcRel = calcRel;
  window.calcSma = calcSma;
  window.calcStd = calcStd;
  window.calcBollinger = calcBollinger;
  window.calcCorrelation = calcCorrelation;
  window.calcSqueezePop = calcSqueezePop;
  window.calcBbSignals = calcBbSignals;
  window.sparkTrendSnapshot = sparkTrendSnapshot;
  window.calcVolProfile = calcVolProfile;
}
