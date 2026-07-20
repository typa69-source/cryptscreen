// ═══════════════════════════════════════════════════════════════
//  FORMATTING HELPERS (shared)
// ═══════════════════════════════════════════════════════════════

export function fn(v,n){
  if(v==null||!isFinite(v))return'—';
  return v.toFixed(n);
}
export function fk(v){
  if(v==null||!isFinite(v))return'—';
  const a=Math.abs(v);
  if(a>=1e9)return(v/1e9).toFixed(2)+'B';
  if(a>=1e6)return(v/1e6).toFixed(2)+'M';
  if(a>=1e3)return(v/1e3).toFixed(2)+'K';
  return v.toFixed(a<1?4:2);
}
export function fmtPrice(p){
  if(p==null||!isFinite(p))return'—';
  const a=Math.abs(p);
  if(a>=1000)return p.toFixed(2);
  if(a>=100)return p.toFixed(2);
  if(a>=10)return p.toFixed(3);
  if(a>=1)return p.toFixed(4);
  if(a>=0.1)return p.toFixed(5);
  if(a>=0.01)return p.toFixed(6);
  if(a>=0.001)return p.toFixed(7);
  return p.toFixed(8);
}
export function getPriceMinMove(p){
  if(p==null||!isFinite(p)||p<=0)return 0.01;
  const a=Math.abs(p);
  if(a>=1000)return 0.01;
  if(a>=100)return 0.01;
  if(a>=10)return 0.001;
  if(a>=1)return 0.0001;
  if(a>=0.1)return 0.00001;
  if(a>=0.01)return 0.000001;
  if(a>=0.001)return 0.0000001;
  return 0.00000001;
}
export function formatDuration(sec){
  if(!isFinite(sec)||sec<0)return'0с';
  const d=Math.floor(sec/86400);
  const h=Math.floor((sec%86400)/3600);
  const m=Math.floor((sec%3600)/60);
  const s=Math.floor(sec%60);
  if(d>0)return`${d}д ${h}ч`;
  if(h>0)return`${h}ч ${m}м`;
  if(m>0)return`${m}м ${s}с`;
  return`${s}с`;
}
