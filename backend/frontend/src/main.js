import './style.css'

// API base - in dev points to local backend, in prod to your Railway URL
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Auth helpers
export function getToken() { return localStorage.getItem('cs_token') }
export function setToken(t) { localStorage.setItem('cs_token', t) }
export function removeToken() { localStorage.removeItem('cs_token') }

// Auth UI overlay
function buildAuthUI() {
  const el = document.createElement('div')
  el.id = 'authOverlay'
  el.innerHTML = `
    <style>
    #authOverlay{position:fixed;inset:0;background:#0a0a0b;z-index:9999;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;}
    .auth-box{background:#111113;border:1px solid #252530;border-radius:8px;padding:32px 28px;width:320px;}
    .auth-logo{font-size:18px;font-weight:600;color:#fff;letter-spacing:1px;margin-bottom:4px;}
    .auth-logo span{color:#e03030;}
    .auth-sub{font-size:10px;color:#80808f;margin-bottom:24px;}
    .auth-tabs{display:flex;gap:0;margin-bottom:20px;border-bottom:1px solid #252530;}
    .auth-tab{padding:6px 14px;font:inherit;font-size:11px;background:none;border:none;color:#80808f;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
    .auth-tab.on{color:#e03030;border-bottom-color:#e03030;}
    .auth-field{margin-bottom:12px;}
    .auth-label{font-size:9px;color:#454555;margin-bottom:4px;display:block;}
    .auth-input{width:100%;background:#161619;border:1px solid #252530;border-radius:4px;padding:8px 10px;color:#c0c0cc;font:inherit;font-size:11px;outline:none;}
    .auth-input:focus{border-color:#e03030;}
    .auth-btn{width:100%;padding:9px;background:#e03030;border:none;border-radius:4px;color:#fff;font:inherit;font-size:11px;font-weight:600;cursor:pointer;margin-top:4px;letter-spacing:.5px;}
    .auth-btn:hover{background:#c02020;}
    .auth-btn:disabled{opacity:.5;cursor:default;}
    .auth-err{font-size:10px;color:#e04040;margin-top:8px;min-height:14px;}
    .auth-ok{font-size:10px;color:#1fa891;margin-top:8px;min-height:14px;}
    </style>
    <div class="auth-box">
      <div class="auth-logo"><span>C</span>RYPT<span>S</span>CREEN</div>
      <div class="auth-sub">Crypto Futures Screener</div>
      <div class="auth-tabs">
        <button class="auth-tab on" data-tab="login">Войти</button>
        <button class="auth-tab" data-tab="register">Регистрация</button>
      </div>
      <div id="authForm">
        <div class="auth-field"><label class="auth-label">EMAIL</label><input class="auth-input" id="authEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>
        <div class="auth-field"><label class="auth-label">ПАРОЛЬ</label><input class="auth-input" id="authPass" type="password" placeholder="••••••••" autocomplete="current-password"></div>
        <div class="auth-field" id="authPassConfirmField" style="display:none"><label class="auth-label">ПОДТВЕРДИТЕ ПАРОЛЬ</label><input class="auth-input" id="authPassConfirm" type="password" placeholder="••••••••"></div>
        <button class="auth-btn" id="authSubmit">ВОЙТИ</button>
        <div class="auth-err" id="authErr"></div>
        <div class="auth-ok" id="authOk"></div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #252530;text-align:center">
          <button class="auth-guest" id="authGuest">войти без регистрации →</button>
          <div style="font-size:9px;color:#454555;margin-top:5px">настройки не сохраняются</div>
        </div>
      </div>
    </div>
    <style>
    .auth-guest{background:none;border:none;color:#454555;cursor:pointer;font:inherit;font-size:10px;transition:color .15s;padding:2px 0}
    .auth-guest:hover{color:#80808f}
    </style>
  `
  document.body.appendChild(el)

  let mode = 'login'
  el.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab
      el.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('on', t === tab))
      document.getElementById('authSubmit').textContent = mode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'
      document.getElementById('authPassConfirmField').style.display = mode === 'register' ? '' : 'none'
      document.getElementById('authErr').textContent = ''
      document.getElementById('authOk').textContent = ''
    })
  })

  document.getElementById('authSubmit').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim()
    const password = document.getElementById('authPass').value
    const errEl = document.getElementById('authErr')
    const okEl = document.getElementById('authOk')
    const btn = document.getElementById('authSubmit')
    errEl.textContent = ''; okEl.textContent = ''
    if (!email || !password) { errEl.textContent = 'Введите email и пароль'; return }
    if (mode === 'register') {
      const confirm = document.getElementById('authPassConfirm').value
      if (password !== confirm) { errEl.textContent = 'Пароли не совпадают'; return }
      if (password.length < 6) { errEl.textContent = 'Пароль минимум 6 символов'; return }
    }
    btn.disabled = true; btn.textContent = '...'
    try {
      const res = await fetch(`${BACKEND}/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) { errEl.textContent = data.error || 'Ошибка'; btn.disabled = false; btn.textContent = mode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'; return }
      if (mode === 'register') {
        okEl.textContent = 'Аккаунт создан! Входим…'
        // auto-login after register
        const loginRes = await fetch(`${BACKEND}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
        const loginData = await loginRes.json()
        if (loginData.token) { setToken(loginData.token); el.remove(); startApp() }
      } else {
        setToken(data.token); el.remove(); startApp()
      }
    } catch (e) {
      errEl.textContent = 'Нет соединения с сервером'
      btn.disabled = false; btn.textContent = mode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'
    }
  })

  // Guest mode
  document.getElementById('authGuest').addEventListener('click', () => {
    el.remove()
    startApp()
  })

  // Enter key support
  el.querySelectorAll('.auth-input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('authSubmit').click() })
  })
}

// Load user settings from backend
async function loadUserSettings() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${BACKEND}/api/user/settings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.status === 401) { removeToken(); return null }
    const data = await res.json()
    return data.settings || null
  } catch (e) { return null }
}

// Save user settings to backend
export async function saveUserSettings(settings) {
  const token = getToken()
  if (!token) return
  try {
    await fetch(`${BACKEND}/api/user/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ settings })
    })
  } catch (e) { console.warn('save settings error', e) }
}

// Add logout button to header
function addLogoutBtn() {
  const hright = document.querySelector('.hright')
  if (!hright) return
  const btn = document.createElement('button')
  btn.className = 'hbtn'
  btn.textContent = 'Выйти'
  btn.onclick = () => { removeToken(); location.reload() }
  hright.appendChild(btn)
}

function startApp() {
  addLogoutBtn()
  // Apply saved settings if any
  loadUserSettings().then(settings => {
    if (settings) applySettings(settings)
    main()
  })
}

function applySettings(settings) {
  // Apply saved user settings to S object before main() runs
  if (settings.gridLayout) window._savedGridLayout = settings.gridLayout
  if (settings.chartSymbols) window._savedChartSymbols = settings.chartSymbols
  if (settings.volMin) window._savedVolMin = settings.volMin
}

// Entry point
if (getToken()) {
  startApp()
} else {
  buildAuthUI()
}


// ═══════════════════════════════════════════════════════════
// ORIGINAL APP CODE
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════
const API = 'https://fapi.binance.com/fapi/v1';
// Timezone: offset candle times to device local time
const TZ_OFFSET_S = -(new Date().getTimezoneOffset() * 60); // seconds to add to UTC
function toChartTime(ms){ return Math.floor(ms/1000) + TZ_OFFSET_S; }
const HIST_LIMIT = 500;
const HIST_TRIGGER = 15;
const FS_TFS = ['1m','3m','5m','15m','30m','1h','4h','1d','3d','1w'];
const DRAW_HIT = 8; // px threshold for hover detection

const ALL_COLS = [
  {id:'ch24',   l:'ИЗМ',  s:'24ч',    tip:'Изменение цены за 24 часа (%)'},
  {id:'cday',   l:'ИЗМ',  s:'день%',  tip:'Изменение цены за текущий день (%)'},
  {id:'rtd',    l:'РЕНЖ', s:'день',   tip:'Дневной диапазон (High-Low)/Low%'},
  {id:'r24',    l:'РЕНЖ', s:'24ч',    tip:'Диапазон за 24ч по 5м свечам'},
  {id:'r7d',    l:'РЕНЖ', s:'7д',     tip:'Диапазон за 7 дней по 1ч свечам'},
  {id:'na30',   l:'NATR', s:'1м/30',  tip:'Нормализованный ATR(30) на 1м ТФ'},
  {id:'na14',   l:'NATR', s:'5м/14',  tip:'Нормализованный ATR(14) на 5м ТФ'},
  {id:'r1m5',   l:'РЕНЖ', s:'1м/5',   tip:'Диапазон последних 5 минутных свечей'},
  {id:'tr5',    l:'СД*',  s:'5м/14',  tip:'Сделки 5м свечи ÷ среднее(14)'},
  {id:'tr1h',   l:'СД*',  s:'1ч/24',  tip:'Сделки 1ч свечи ÷ среднее(24)'},
  {id:'vr5',    l:'ОБ*',  s:'5м/14',  tip:'Объём 5м свечи ÷ среднее(14)'},
  {id:'vr1h',   l:'ОБ*',  s:'1ч/24',  tip:'Объём 1ч свечи ÷ среднее(24)'},
  {id:'ch7d',   l:'ИЗМ',  s:'7д',     tip:'Изменение цены за 7 дней (%)'},
  {id:'trd24',  l:'СДЛК', s:'24ч',    tip:'Число сделок за 24 часа'},
  {id:'vol24',  l:'ОБЪЕМ',s:'24ч',    tip:'Объём торгов за 24ч (USDT)'},
  {id:'corr',   l:'КРЛЦ', s:'24ч',    tip:'Корреляция с BTC за 24ч'},
  {id:'corr14', l:'КРЛЦ', s:'5м/14',  tip:'Корреляция с BTC за последние 14 свечей 5м'},
  {id:'v15m',   l:'ОБ',   s:'1м/15',  tip:'Накопл. объём за 15 минут (USDT)'},
  {id:'v60m',   l:'ОБ',   s:'1м/60',  tip:'Накопл. объём за 60 минут (USDT)'},
];

const GROUP_COLORS=['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
// index 0=none, 1=red,2=orange,3=yellow,4=green,5=blue,6=violet,7=pink

const S = {
  syms:[], tk:{}, k5m:{}, k1h:{}, k1m:{}, mx:{}, btcR:[],
  charts: Array.from({length:9},()=>mkChart()),
  wsScreener:null, wsCharts:null,
  sortId:'vol24', sortDir:'desc', sortAlpha:false,
  tf:'5m', q:'', page:0, LC:null, bgDone:false,
  drawMode:null, drawIdCounter:0,
  symDrawings:{},      // drawings per symbol, shared between grid & FS
  minVol:0, gridSize:9, upColor:'#1fa891', wmVisible:true, sortAbs:true,
  screenerVisible:true, fsScreenerVisible:true,
  colOrder: ALL_COLS.map(c=>c.id),
  colVisible: new Set(ALL_COLS.map(c=>c.id)),
  fsSym:null, fsOpen:false, fsWs:null,
  fsCharts:[
    mkFsChart('5m'), mkFsChart('1h'), mkFsChart('4h'),
  ],
  settingsTab:'gen',
  showDensity:false,
  densitySettings:{}, // per symbol: {largeMult, medMult, smallMult}
  alertLog:[],
  alertSettings:{repeat:true, cooldown:5, sound:true},
  // #9: Color groups
  symGroups:{},       // sym → groupIdx (1-7), 0=none
  activeGroupFilter:0,// 0=all, 1-7=show only that group
  _savedCpW:'',_savedFsCaW:'',
};

function mkChart(){
  return{lc:null,cs:null,vs:null,sym:null,candles:[],histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null};
}
function mkFsChart(tf){
  return{lc:null,cs:null,vs:null,candles:[],tf,histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null};
}

function activeCols(){
  return S.colOrder.filter(id=>S.colVisible.has(id))
    .map(id=>ALL_COLS.find(c=>c.id===id)).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
//  LOADING UI
// ═══════════════════════════════════════════════════════════════
function ldSet(t,p,d){
  const ltxt=document.getElementById('ltxt');
  const lfill=document.getElementById('lfill');
  const llog=document.getElementById('llog');
  if(t!=null&&ltxt)ltxt.textContent=t;
  if(p!=null&&lfill)lfill.style.width=p+'%';
  if(d!=null&&llog)llog.textContent=d;
}
function ldErr(m){const e=document.getElementById('lerr');e.style.display='block';e.innerHTML='⚠ '+String(m).replace(/\n/g,'<br>');}
function ldHide(){const el=document.getElementById('ld');document.getElementById('app').style.visibility='visible';el.style.opacity='0';el.style.transition='opacity .3s';setTimeout(()=>el.remove(),320);}

// ═══════════════════════════════════════════════════════════════
//  FETCH
// ═══════════════════════════════════════════════════════════════
function fj(url,timeout=15000){
  return new Promise((res,rej)=>{
    const t=setTimeout(()=>rej(new Error('Timeout')),timeout);
    fetch(url).then(r=>{clearTimeout(t);if(!r.ok)rej(new Error('HTTP '+r.status));else r.json().then(res).catch(rej);}).catch(e=>{clearTimeout(t);rej(e);});
  });
}
function parseKlines(raw){return raw.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],tr:+k[8],qv:+k[7]}));}
async function batchKlines(syms,iv,lim,pFrom,pTo,bs=20){
  const out={};
  for(let i=0;i<syms.length;i+=bs){
    const batch=syms.slice(i,i+bs);
    const results=await Promise.allSettled(batch.map(s=>fj(`${API}/klines?symbol=${s}&interval=${iv}&limit=${lim}`).then(d=>[s,parseKlines(d)])));
    for(const r of results)if(r.status==='fulfilled')out[r.value[0]]=r.value[1];
    if(pFrom!=null)ldSet(null,pFrom+Math.round((i/syms.length)*(pTo-pFrom)),`${iv}: ${Math.min(i+bs,syms.length)}/${syms.length}`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  METRICS
// ═══════════════════════════════════════════════════════════════
function calcATR(kl,n){if(!kl||kl.length<n+1)return null;let s=0;const f=kl.length-n;for(let i=f;i<kl.length;i++){const k=kl[i],p=kl[i-1];s+=Math.max(k.h-k.l,Math.abs(k.h-p.c),Math.abs(k.l-p.c));}return s/n;}
function calcNATR(kl,n){const a=calcATR(kl,n);return a&&kl?a/kl[kl.length-1].c*100:null;}
function calcRange(kl,n){if(!kl||kl.length<n)return null;const sl=kl.slice(-n);const H=sl.reduce((m,k)=>Math.max(m,k.h),-Infinity);const L=sl.reduce((m,k)=>Math.min(m,k.l),Infinity);return L>0?(H-L)/L*100:null;}
function calcRel(kl,n,f){if(!kl||kl.length<n+1)return null;const sl=kl.slice(-n-1);const cur=sl[sl.length-1][f];let s=0;for(let i=0;i<n;i++)s+=sl[i][f];const avg=s/n;return avg>0?cur/avg:null;}
function calcRets(kl){if(!kl||kl.length<2)return[];const r=[];for(let i=1;i<kl.length;i++)r.push((kl[i].c-kl[i-1].c)/kl[i-1].c);return r;}
function calcCorr(a,b){if(!a||!b||a.length<5)return null;const n=Math.min(a.length,b.length);const x=a.slice(-n),y=b.slice(-n);let mx=0,my=0;for(let i=0;i<n;i++){mx+=x[i];my+=y[i];}mx/=n;my/=n;let num=0,sx=0,sy=0;for(let i=0;i<n;i++){const xa=x[i]-mx,ya=y[i]-my;num+=xa*ya;sx+=xa*xa;sy+=ya*ya;}const d=Math.sqrt(sx*sy);return d>0?num/d:null;}

function calcAll(){
  const btc5=S.k5m['BTCUSDT'];
  S.btcR=btc5?calcRets(btc5):[];
  const btcR14=btc5&&btc5.length>=15?calcRets(btc5.slice(-15)):[];
  S.mx={};
  const nowMs=Date.now();
  const dayStartMs=new Date(new Date().toDateString()).getTime();
  for(const sym of S.syms){
    const t=S.tk[sym];if(!t)continue;
    const k5=S.k5m[sym],k1h=S.k1h[sym],k1m=S.k1m[sym];
    // cday: change from first 1h candle of current UTC day
    let cday=null;
    if(k1h&&k1h.length>0){
      const todayCandle=k1h.find(c=>c.t>=dayStartMs);
      if(todayCandle)cday=(t.p-todayCandle.o)/todayCandle.o*100;
    }
    const corr14=k5&&k5.length>=15&&btcR14.length?calcCorr(calcRets(k5.slice(-15)),btcR14):null;
    const m={
      sym,price:t.p,ch24:t.c24,cday,
      rtd:(t.h24&&t.l24)?(t.h24-t.l24)/t.l24*100:null,
      r24:calcRange(k5,288),r7d:calcRange(k1h,168),
      na30:calcNATR(k1m,30),na14:calcNATR(k5,14),r1m5:calcRange(k1m,5),
      tr5:calcRel(k5,14,'tr'),tr1h:calcRel(k1h,24,'tr'),
      vr5:calcRel(k5,14,'qv'),vr1h:calcRel(k1h,24,'qv'),
      ch7d:null,trd24:t.tr,vol24:t.qv,
      corr:S.btcR.length>10&&k5?calcCorr(calcRets(k5),S.btcR):null,
      corr14,
      v15m:k1m&&k1m.length>=15?k1m.slice(-15).reduce((a,k)=>a+k.qv,0):null,
      v60m:k1m&&k1m.length>=60?k1m.slice(-60).reduce((a,k)=>a+k.qv,0):null,
    };
    if(k1h&&k1h.length>=168){const old=k1h[k1h.length-168];m.ch7d=(t.p-old.c)/old.c*100;}
    S.mx[sym]=m;
  }
}

// ═══════════════════════════════════════════════════════════════
//  FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════
function fn(v,d=1){return(v==null||isNaN(v))?'—':v.toFixed(d);}
function fk(v){if(v==null||isNaN(v))return'—';const a=Math.abs(v);if(a>=1e9)return(v/1e9).toFixed(1)+'B';if(a>=1e6)return(v/1e6).toFixed(1)+'M';if(a>=1e3)return(v/1e3).toFixed(0)+'K';return v.toFixed(0);}
function fv(v,id){
  if(v==null||isNaN(v))return'—';
  if(id==='ch24'||id==='ch7d'||id==='cday')return(v>0?'+':'')+fn(v,2)+'%';
  if(id==='rtd'||id==='r24'||id==='r7d'||id==='r1m5')return fn(v,1);
  if(id==='na30'||id==='na14')return fn(v,2);
  if(id==='tr5'||id==='tr1h'||id==='vr5'||id==='vr1h')return fn(v,1)+'×';
  if(id==='trd24')return fk(v);
  if(id==='vol24'||id==='v15m'||id==='v60m')return fk(v);
  if(id==='corr'||id==='corr14')return fn(v,2);
  return fn(v,1);
}
function fc(v,id){
  if(v==null||isNaN(v))return'd';
  if(id==='ch24'||id==='ch7d'||id==='cday')return v>0?'p':v<0?'n':'w';
  if(id==='rtd'||id==='r24'||id==='r7d'||id==='r1m5')return v>15?'y':'w';
  if(id==='na30'||id==='na14')return v>0.5?'y':'w';
  if(id==='corr'||id==='corr14')return v>0.75?'d':v<-0.2?'n':'w';
  return'w';
}
function fh(v,id){if(!['tr5','tr1h','vr5','vr1h'].includes(id)||v==null||isNaN(v))return'';if(v>4)return'hv3';if(v>2.5)return'hv2';if(v>1.5)return'hv1';if(v<0.3)return'hr3';if(v<0.5)return'hr2';if(v<0.7)return'hr1';return'';}

function fmtPrice(p){
  if(p==null||isNaN(p)||p===0)return'—';
  const a=Math.abs(p);
  if(a<0.0001)return p.toFixed(8);if(a<0.001)return p.toFixed(7);if(a<0.01)return p.toFixed(6);
  if(a<0.1)return p.toFixed(5);if(a<1)return p.toFixed(4);if(a<100)return p.toFixed(3);
  if(a<10000)return p.toFixed(2);return p.toFixed(0);
}
function getPriceMinMove(p){
  if(!p||p<=0)return 0.00001;if(p<0.0001)return 1e-8;if(p<0.001)return 1e-7;
  if(p<0.01)return 1e-6;if(p<0.1)return 1e-5;if(p<1)return 1e-4;
  if(p<10)return 0.001;if(p<1000)return 0.01;return 1;
}
function formatDuration(s){s=Math.abs(s);if(s<60)return Math.round(s)+'с';if(s<3600)return Math.floor(s/60)+'м '+Math.round(s%60)+'с';if(s<86400)return Math.floor(s/3600)+'ч '+Math.floor((s%3600)/60)+'м';return Math.floor(s/86400)+'д '+Math.floor((s%86400)/3600)+'ч';}

function copyTicker(sym){
  if(!sym||sym==='—')return;
  navigator.clipboard.writeText(sym).then(()=>{
    // Brief visual toast
    let t=document.getElementById('copyToast');
    if(!t){t=document.createElement('div');t.id='copyToast';
      t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg4);border:1px solid var(--border2);color:var(--text);border-radius:4px;padding:5px 14px;font-size:10px;z-index:9999;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(t);}
    t.textContent=`📋 ${sym} скопировано`;t.style.opacity='1';
    clearTimeout(t._to);t._to=setTimeout(()=>{t.style.opacity='0';},1200);
  }).catch(()=>{});
}

// ═══════════════════════════════════════════════════════════════
//  CHART GRID BUILD
// ═══════════════════════════════════════════════════════════════
function buildChartGrid(){
  const g=document.getElementById('cgrid');g.innerHTML='';
  const n=S.gridSize,cols=n===4?2:3;
  g.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  g.style.gridTemplateRows=`repeat(${cols},1fr)`;
  for(let i=0;i<n;i++){
    g.insertAdjacentHTML('beforeend',`
      <div class="ccell" id="cc${i}">
        <div class="chead">
          <span class="csym" id="cs${i}" title="Нажмите для копирования" onclick="copyTicker(this.textContent)" style="cursor:pointer">—</span>
          <span class="cprc" id="cp${i}"></span>
          <span class="cchg" id="cg${i}"></span>
          <span class="cvol" id="cv${i}"></span>
          <span class="ctrd" id="ctd${i}"></span>
          <span class="ccorr" id="cco${i}"></span>
          <span class="chead-gap"></span>
          <button class="clear-draw-btn" onclick="clearDrawingsSlot(${i})" title="Двойное нажатие — удалить все рисунки">✕✕</button>
          <button class="fs-open-btn" onclick="openFullscreen(${i})" title="На весь экран">⤡</button>
        </div>
        <div class="cbody" id="cb${i}">
          <div class="cph"><span class="cph-n">${i+1}</span><span style="font-size:9px;color:var(--text3)">ожидание</span></div>
        </div>
      </div>`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CHART INIT
// ═══════════════════════════════════════════════════════════════
function initLCChart(slot,isFs=false,fsIdx=null){
  if(!S.LC)return false;
  const ch=isFs?S.fsCharts[fsIdx]:S.charts[slot];
  const containerId=isFs?`fsChartEl${fsIdx}`:`cb${slot}`;
  const container=document.getElementById(containerId);
  if(!container)return false;
  if(ch.lc){try{ch.lc.remove();}catch(e){}}
  if(ch._ab)ch._ab.abort();
  container.innerHTML='';

  const lc=S.LC.createChart(container,{
    layout:{background:{color:'#0a0a0b'},textColor:'#404050'},
    grid:{vertLines:{color:'#141418'},horzLines:{color:'#141418'}},
    crosshair:{vertLine:{color:'#33333f',width:1,style:1,labelBackgroundColor:'#1c1c22'},horzLine:{color:'#33333f',width:1,style:1,labelBackgroundColor:'#1c1c22'}},
    rightPriceScale:{borderColor:'#252530',textColor:'#606070'},
    timeScale:{borderColor:'#252530',timeVisible:true,secondsVisible:false},
    handleScroll:{mouseWheel:true,pressedMouseMove:true},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},
    localization:{priceFormatter:p=>fmtPrice(p),timeFormatter:t=>{const d=new Date(t*1000);const pad=n=>n.toString().padStart(2,'0');return`${pad(d.getUTCFullYear())}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;}},
  });
  const cs=lc.addCandlestickSeries({
    upColor:S.upColor,downColor:'#e04040',borderUpColor:S.upColor,borderDownColor:'#e04040',
    wickUpColor:S.upColor,wickDownColor:'#e04040',
    priceFormat:{type:'custom',formatter:p=>fmtPrice(p),minMove:0.0000001},
  });
  const vs=lc.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol',color:'#1fa89120'});
  lc.priceScale('vol').applyOptions({scaleMargins:{top:.82,bottom:0},drawTicks:false,borderVisible:false});

  // Watermark
  const wm=document.createElement('div');wm.className='chart-wm';
  wm.id=isFs?`fswm${fsIdx}`:`wm${slot}`;wm.style.display=S.wmVisible?'flex':'none';
  container.appendChild(wm);

  // Canvas
  const canvas=document.createElement('canvas');canvas.className='chart-canvas';
  canvas.width=container.clientWidth||1;canvas.height=container.clientHeight||1;
  container.appendChild(canvas);ch.canvas=canvas;

  // Interact overlay (active only when draw mode)
  const interact=document.createElement('div');
  interact.className='chart-interact'+(S.drawMode?' draw':'');
  interact.addEventListener('mousemove',e=>onInteractMove(ch,e,container));
  interact.addEventListener('click',e=>onInteractClick(ch,e,container));
  interact.addEventListener('dblclick',e=>onInteractDblClick(ch,e,container));
  interact.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(S.drawMode){setDrawMode(null);return;} // #10: RMB exits draw mode
    removeDrawingAtCursor(ch);
  });
  container.appendChild(interact);ch.interact=interact;

  // Container-level listeners (always active regardless of draw mode)
  const ab=new AbortController();const sig=ab.signal;ch._ab=ab;
  container.addEventListener('mousemove',e=>{
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    ch.hoverX=x;ch.hoverY=y;
    const prev=ch.hoveredIdx;
    ch.hoveredIdx=findDrawingNear(ch,x,y);
    if(ch.hoveredIdx!==prev)rCanvas(ch);
  },{signal:sig});
  container.addEventListener('mouseleave',()=>{
    ch.hoveredIdx=-1;
    rCanvas(ch);
  },{signal:sig});
  container.addEventListener('mousedown',e=>{if(e.button===1){e.preventDefault();onRulerStart(ch,e,container);}},{capture:true,signal:sig});
  container.addEventListener('mousemove',e=>{if(ch.ruler?.active)onRulerMove(ch,e,container);},{capture:true,signal:sig});
  container.addEventListener('mouseup',e=>{if(e.button===1&&ch.ruler?.active)onRulerEnd(ch,e);},{capture:true,signal:sig});
  // #4: Container-level RMB (works in cursor mode when interact is non-interactive)
  container.addEventListener('contextmenu',e=>{
    if(S.drawMode)return; // already handled by interact
    e.preventDefault();
    // Check if RMB is near ruler — if so, remove ruler
    if(ch.ruler&&ch.ruler.p1&&ch.ruler.p2){
      const{x,y}=getCoords(container,e.clientX,e.clientY);
      if(isNearRuler(ch,x,y)){
        // Clear this chart AND all mirrored rulers (FS sibling charts)
        ch.ruler=null;
        // Clear ruler from ALL charts (not just mirrored)
        [...S.charts,...S.fsCharts].forEach(c=>{
          if(c!==ch&&c.ruler){c.ruler=null;requestAnimationFrame(()=>rCanvas(c));}
        });
        document.getElementById('rulerTooltip').style.display='none';
        rCanvas(ch);return;
      }
    }
    removeDrawingAtCursor(ch);
  },{signal:sig});

  // #6: dblclick in cursor mode → edit alert %
  container.addEventListener('dblclick',e=>{
    if(S.drawMode)return;
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const idx=findDrawingNear(ch,x,y);
    if(idx>=0){
      const d=ch.drawings[idx];
      if(d.type==='aray'||d.type==='atline')showAlertPctInput(ch,d,container);
    }
  },{signal:sig});

  // Drag drawing points (LMB, cursor mode) — Fix #2: use timeToCoordX for future points
  container.addEventListener('mousedown',e=>{
    if(e.button!==0||S.drawMode)return;
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    for(let i=0;i<ch.drawings.length;i++){
      const d=ch.drawings[i];
      const pts=d.type==='hray'||d.type==='aray'?{p1:d.p1}:{p1:d.p1,p2:d.p2};
      for(const[key,pt]of Object.entries(pts)){
        if(!pt)continue;
        const px=timeToCoordX(ch,pt.time); // Fix #2: was lc.timeScale().timeToCoordinate(pt.time)
        const py=ch.cs.priceToCoordinate(pt.price);
        if(px!=null&&py!=null&&Math.hypot(x-px,y-py)<10){
          e.preventDefault();e.stopPropagation();
          ch.draggingDraw={drawIdx:i,pointKey:key};
          if(ch.interact)ch.interact.style.pointerEvents='auto';
          return;
        }
      }
    }
  },{capture:true,signal:sig});
  container.addEventListener('mousemove',e=>{
    if(!ch.draggingDraw)return;
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    // Fix #5: Ctrl snaps during drag too
    const pt=e.ctrlKey?snapPoint(ch,x,y,true):pixelToPoint(ch,x,y);
    if(!pt)return;
    const d=ch.drawings[ch.draggingDraw.drawIdx];
    if(d){d[ch.draggingDraw.pointKey]=pt;checkAlerts(ch,d);}
    rCanvas(ch);
  },{capture:true,signal:sig});
  container.addEventListener('mouseup',e=>{
    if(e.button!==0||!ch.draggingDraw)return;
    ch.draggingDraw=null;
    if(ch.interact&&!S.drawMode)ch.interact.style.pointerEvents='';
  },{capture:true,signal:sig});

  const ro=new ResizeObserver(()=>{
    try{canvas.width=container.clientWidth;canvas.height=container.clientHeight;
      lc.resize(container.clientWidth,container.clientHeight);rCanvas(ch);}catch(e){}
  });
  ro.observe(container);

  lc.timeScale().subscribeVisibleLogicalRangeChange(range=>{
    if(range&&range.from<HIST_TRIGGER){
      if(isFs)loadMoreFsHistory(fsIdx);else loadMoreHistory(slot);
    }
    requestAnimationFrame(()=>rCanvas(ch));
  });

  ch.lc=lc;ch.cs=cs;ch.vs=vs;
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  CHART LOAD
// ═══════════════════════════════════════════════════════════════
function getSymDrawings(sym){
  if(!S.symDrawings[sym])S.symDrawings[sym]=[];
  return S.symDrawings[sym];
}

async function loadChart(slot,sym){
  const ch=S.charts[slot];
  if(!sym){
    ch.sym=null;ch.candles=[];ch.drawings=[];
    document.getElementById(`cs${slot}`).textContent='—';
    ['cp','cg','cv','ctd','cco'].forEach(p=>document.getElementById(`${p}${slot}`).textContent='');
    const cb=document.getElementById(`cb${slot}`);
    if(cb)cb.innerHTML=`<div class="cph"><span class="cph-n">${slot+1}</span><span style="font-size:9px;color:var(--text3)">пусто</span></div>`;
    return;
  }
  ch.sym=sym;ch.candles=[];ch.histLoading=false;
  ch.drawings=getSymDrawings(sym); // shared reference
  document.getElementById(`cs${slot}`).textContent=sym.replace(/USDT$/,'');
  const cb=document.getElementById(`cb${slot}`);
  if(cb)cb.innerHTML='<div class="cloading"><span class="cloading-dot"></span><span class="cloading-dot"></span><span class="cloading-dot"></span></div>';
  initLCChart(slot);
  const wm=document.getElementById(`wm${slot}`);if(wm)wm.textContent=sym.replace(/USDT$/,'');
  try{
    const raw=await fj(`${API}/klines?symbol=${sym}&interval=${S.tf}&limit=${HIST_LIMIT}`);
    if(ch.sym!==sym)return;
    ch.candles=parseKlines(raw);
    paintSlotData(slot);
    if(S.showDensity)fetchOrderBook(sym); // #1: pre-fetch OB for density
  }catch(e){
    if(cb&&ch.sym===sym)cb.innerHTML=`<div class="cph"><span style="color:var(--red);font-size:10px">Ошибка загрузки</span></div>`;
  }
}

function paintSlotData(slot){
  const ch=S.charts[slot];
  if(!ch.candles.length||!ch.cs)return;
  try{
    const lp=ch.candles[ch.candles.length-1].c;
    ch.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lp)}});
    ch.cs.setData(ch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    ch.vs.setData(ch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    ch.lc.timeScale().fitContent();
    updateChartHeader(slot,ch.sym);
    rCanvas(ch);
  }catch(e){console.warn('paintSlotData',e);}
}

function updateChartHeader(slot,sym){
  const t=S.tk[sym]||{};const m=S.mx[sym]||{};
  // price is hidden via CSS (.cprc{display:none}) - kept for compat
  if(t.p)document.getElementById(`cp${slot}`).textContent=fmtPrice(t.p);
  const cg=document.getElementById(`cg${slot}`);
  if(t.c24!=null){cg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';cg.className='cchg '+(t.c24>=0?'p':'n');}
  document.getElementById(`cv${slot}`).innerHTML=t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'';
  document.getElementById(`ctd${slot}`).innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const corVal=m.corr14??m.corr;
  document.getElementById(`cco${slot}`).innerHTML=corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'';
}

async function loadMoreHistory(slot){
  const ch=S.charts[slot];
  if(!ch.sym||ch.histLoading||!ch.candles.length||!ch.lc)return;
  ch.histLoading=true;
  try{
    const raw=await fj(`${API}/klines?symbol=${ch.sym}&interval=${S.tf}&limit=${HIST_LIMIT}&endTime=${ch.candles[0].t-1}`);
    if(!raw||!raw.length){ch.histLoading=false;return;}
    const nc=parseKlines(raw);if(!ch.cs||!ch.lc)return;
    const vr=ch.lc.timeScale().getVisibleRange();
    ch.candles=[...nc,...ch.candles];
    ch.cs.setData(ch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    ch.vs.setData(ch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    if(vr)try{ch.lc.timeScale().setVisibleRange(vr);}catch(e){}
  }catch(e){}finally{ch.histLoading=false;}
}

// ═══════════════════════════════════════════════════════════════
//  CANVAS DRAWING SYSTEM
// ═══════════════════════════════════════════════════════════════
function getCoords(container,cx,cy){const r=container.getBoundingClientRect();return{x:cx-r.left,y:cy-r.top};}

// Convert chart time → canvas X, extrapolating beyond last candle
function timeToCoordX(ch,time){
  if(!ch.lc)return null;
  const ts=ch.lc.timeScale();
  const x=ts.timeToCoordinate(time);
  if(x!=null)return x;
  // Extrapolate using spacing between last two candles
  if(ch.candles.length>=2){
    const last=ch.candles[ch.candles.length-1];
    const prev=ch.candles[ch.candles.length-2];
    const t2=toChartTime(last.t),t1=toChartTime(prev.t);
    const x2=ts.timeToCoordinate(t2),x1=ts.timeToCoordinate(t1);
    if(x2!=null&&x1!=null&&t2!==t1){
      return x2+(time-t2)*(x2-x1)/(t2-t1);
    }
    // fallback: use last known x
    if(x2!=null)return x2+50;
  }
  return null;
}

function pixelToPoint(ch,x,y){
  if(!ch.lc||!ch.cs)return null;
  let time=ch.lc.timeScale().coordinateToTime(x);
  const price=ch.cs.coordinateToPrice(y);
  if(price==null)return null;
  // Extrapolate time if cursor is to the right of the last candle
  if(time==null&&ch.candles.length>=2){
    const ts=ch.lc.timeScale();
    const last=ch.candles[ch.candles.length-1];
    const prev=ch.candles[ch.candles.length-2];
    const t1=toChartTime(prev.t),t2=toChartTime(last.t);
    const x1=ts.timeToCoordinate(t1),x2=ts.timeToCoordinate(t2);
    if(x1!=null&&x2!=null&&Math.abs(x2-x1)>0){
      const secPerPx=(t2-t1)/(x2-x1);
      time=Math.round(t2+(x-x2)*secPerPx);
    }
  }
  if(time==null)return null;
  return{time,price};
}

function snapPoint(ch,x,y,ctrl){
  const raw=pixelToPoint(ch,x,y);if(!raw)return null;
  if(!ctrl)return raw;
  const tMs=raw.time;let best=null,bd=Infinity;
  for(const c of ch.candles){const d=Math.abs(toChartTime(c.t)-tMs);if(d<bd){bd=d;best=c;}}
  if(!best)return raw;
  const ohlc=[best.o,best.h,best.l,best.c];let sp=ohlc[0],sd=Infinity;
  for(const p of ohlc){const d=Math.abs(p-raw.price);if(d<sd){sd=d;sp=p;}}
  return{time:toChartTime(best.t),price:sp};
}

// Distance from point to drawing (screen pixels)
function drawingDist(ch,d,px,py){
  if(!ch.cs||!ch.lc)return Infinity;
  if(d.type==='hray'||d.type==='aray'){
    const y=ch.cs.priceToCoordinate(d.p1.price);
    if(y===null)return Infinity;
    const x0=timeToCoordX(ch,d.p1.time)??0;
    if(px<x0-4)return Infinity;
    return Math.abs(py-y);
  }
  if(d.type==='tline'||d.type==='atline'){
    const x1=timeToCoordX(ch,d.p1.time);
    const y1=ch.cs.priceToCoordinate(d.p1.price);
    const x2=timeToCoordX(ch,d.p2.time);
    const y2=ch.cs.priceToCoordinate(d.p2.price);
    if(x1===null||y1===null||x2===null||y2===null)return Infinity;
    const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;
    if(len2===0)return Math.hypot(px-x1,py-y1);
    const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));
    return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
  }
  return Infinity;
}

function findDrawingNear(ch,px,py){
  let bestIdx=-1,bestDist=DRAW_HIT;
  for(let i=0;i<ch.drawings.length;i++){
    const d=drawingDist(ch,ch.drawings[i],px,py);
    if(d<bestDist){bestDist=d;bestIdx=i;}
  }
  return bestIdx;
}

function isNearRuler(ch,px,py){
  const r=ch.ruler;if(!r?.p1||!r?.p2||!ch.cs||!ch.lc)return false;
  const x1=timeToCoordX(ch,r.p1.time),y1=ch.cs.priceToCoordinate(r.p1.price);
  const x2=timeToCoordX(ch,r.p2.time),y2=ch.cs.priceToCoordinate(r.p2.price);
  if(x1==null||y1==null||x2==null||y2==null)return false;
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;
  if(len2===0)return Math.hypot(px-x1,py-y1)<DRAW_HIT*1.5;
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))<DRAW_HIT*1.5;
}

function removeDrawingAtCursor(ch){
  if(ch.pendingP1){ch.pendingP1=null;rCanvas(ch);return;}
  const idx=ch.hoveredIdx;
  if(idx>=0&&idx<ch.drawings.length){ch.drawings.splice(idx,1);ch.hoveredIdx=-1;rCanvas(ch);}
}

// ═══════════════════════════════════════════════════════════════
//  DENSITY (ORDER BOOK CLUSTERS) — Fix #1: uses real depth API
// ═══════════════════════════════════════════════════════════════
const OB_CACHE={}; // sym → {bids:[[price,usdVal],...], asks:[[...]], ts}
const OB_TTL=45000; // refresh every 45s

async function fetchOrderBook(sym){
  try{
    const data=await fj(`${API}/depth?symbol=${sym}&limit=1000`,10000);
    // Convert to [price, USDT value] — Fix #1: in dollars, not coin qty
    const toUsd=levels=>levels.map(([p,q])=>[+p,+p*+q]);
    OB_CACHE[sym]={bids:toUsd(data.bids),asks:toUsd(data.asks),ts:Date.now()};
    if(S.showDensity)[...S.charts,...S.fsCharts].forEach(ch=>{if((ch.sym||S.fsSym)===sym)rCanvas(ch);});
  }catch(e){console.warn('OB fetch',sym,e);}
}

function getOrFetchOB(sym){
  const cached=OB_CACHE[sym];
  if(!cached||Date.now()-cached.ts>OB_TTL)fetchOrderBook(sym); // background refresh
  return cached||null;
}

function computeDensities(ch){
  const sym=ch.sym||S.fsSym;if(!sym)return[];
  const ob=getOrFetchOB(sym);if(!ob)return[];
  // Merge bids+asks, sort by price
  const all=[...ob.bids,...ob.asks].sort((a,b)=>a[0]-b[0]);
  if(all.length<5)return[];
  // Find current price range from candles (or use all OB range)
  let pMin=Infinity,pMax=-Infinity;
  if(ch.candles.length>0){pMin=ch.candles[ch.candles.length-1].c*0.5;pMax=ch.candles[ch.candles.length-1].c*1.5;}
  else{all.forEach(([p])=>{pMin=Math.min(pMin,p);pMax=Math.max(pMax,p);});}
  // Filter to relevant range
  const relevant=all.filter(([p])=>p>=pMin&&p<=pMax);
  if(relevant.length<3)return[];
  // Cluster: group levels within 0.2% of each other (fixed, not zoom-dependent — Fix #1 merging)
  const CLUSTER_PCT=0.002;
  const clusters=[];let cur=null;
  for(const[price,usdVal]of relevant){
    if(!cur||price>cur.centerPrice*(1+CLUSTER_PCT)){
      if(cur)clusters.push(cur);
      cur={centerPrice:price,totalUsd:usdVal,count:1,minPrice:price};
    }else{
      cur.totalUsd+=usdVal;cur.count++;
      cur.centerPrice=(cur.centerPrice*(cur.count-1)+price)/cur.count;
    }
  }
  if(cur)clusters.push(cur);
  if(!clusters.length)return[];
  // Statistics for tier classification
  const vols=clusters.map(c=>c.totalUsd).sort((a,b)=>a-b);
  const mean=vols.reduce((s,v)=>s+v,0)/vols.length;
  const std=Math.sqrt(vols.reduce((s,v)=>s+(v-mean)**2,0)/vols.length);
  const ds=S.densitySettings[sym]||{};
  const largeMult=ds.largeMult??2.5,medMult=ds.medMult??1.6,smallMult=ds.smallMult??1.0;
  // Return only significant clusters
  const startTime=ch.candles.length?Math.floor(ch.candles[0].t/1000):Math.floor(Date.now()/1000)-86400;
  return clusters
    .filter(c=>c.totalUsd>=mean+std*smallMult)
    .map(c=>({
      price:c.centerPrice,
      vol:c.totalUsd, // USDT — Fix #1
      tier:c.totalUsd>=mean+std*largeMult?'large':c.totalUsd>=mean+std*medMult?'medium':'small',
      time:startTime, // draw from chart start
    }));
}

function drawDensities(ctx,ch,W,H){
  if(!ch.cs||!ch.lc)return;
  const sym=ch.sym||S.fsSym;if(!sym)return;
  const zones=computeDensities(ch);
  if(!zones.length)return;
  ctx.save();
  for(const z of zones){
    const y=ch.cs.priceToCoordinate(z.price);if(y===null||y<0||y>H)continue;
    const x0=Math.max(0,timeToCoordX(ch,z.time)??0);
    let col,alpha;
    if(z.tier==='large'){col='#e04040';alpha=0.75;}
    else if(z.tier==='medium'){col='#e8a020';alpha=0.55;}
    else{col='#606080';alpha=0.35;}
    ctx.beginPath();ctx.strokeStyle=col;ctx.globalAlpha=alpha;
    ctx.lineWidth=z.tier==='large'?1.8:z.tier==='medium'?1.3:0.9;
    ctx.setLineDash(z.tier==='small'?[3,4]:[]);
    ctx.moveTo(x0,y);ctx.lineTo(W,y);ctx.stroke();
    ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.fillStyle=col;ctx.globalAlpha=alpha+0.2;
    ctx.font=`${z.tier==='large'?9:8}px JetBrains Mono,monospace`;
    ctx.textAlign='right';
    // Fix #1: show in USDT (fk already formats)
    ctx.fillText(`${fmtPrice(z.price)}  ${fk(z.vol)}$`,W-3,y-(z.tier==='large'?4:3));
    ctx.textAlign='left';ctx.globalAlpha=1;
    ctx.beginPath();ctx.fillStyle=col;ctx.globalAlpha=alpha+0.1;
    ctx.arc(x0,y,z.tier==='large'?3.5:2.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  ctx.restore();
}

// Track Ctrl key globally — Fix #5
let _ctrlHeld=false;
document.addEventListener('keydown',e=>{if(e.key==='Control'||e.key==='Meta')_ctrlHeld=true;});
document.addEventListener('keyup',e=>{if(e.key==='Control'||e.key==='Meta')_ctrlHeld=false;});

// Price axis width estimate (LW Charts right scale ~= 65px)
const PRICE_AXIS_W=65;

// ── Render canvas ──────────────────────────────────────────────
function rCanvas(ch){
  const canvas=ch.canvas;if(!canvas||!ch.lc||!ch.cs)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  // #3: clip drawing area so we don't overdraw the price axis
  const drawW=Math.max(1,W-PRICE_AXIS_W);
  ctx.save();ctx.beginPath();ctx.rect(0,0,drawW,H);ctx.clip();
  // Densities (behind drawings)
  if(S.showDensity)drawDensities(ctx,ch,drawW,H);
  ch.drawings.forEach((d,i)=>{
    const hov=(i===ch.hoveredIdx||ch.draggingDraw?.drawIdx===i);
    if(d.type==='hray')drawHRay(ctx,ch,d,drawW,hov);
    else if(d.type==='tline')drawTLine(ctx,ch,d,hov);
    else if(d.type==='aray')drawAlertRay(ctx,ch,d,drawW,hov);
    else if(d.type==='atline')drawAlertTLine(ctx,ch,d,hov);
  });
  if(ch.pendingP1&&(S.drawMode==='tline'||S.drawMode==='atline')){
    const x1=timeToCoordX(ch,ch.pendingP1.time);
    const y1=ch.cs.priceToCoordinate(ch.pendingP1.price);
    if(x1!==null&&y1!==null){
      ctx.save();ctx.beginPath();ctx.strokeStyle='#3b82f680';ctx.lineWidth=1;ctx.setLineDash([4,3]);
      ctx.moveTo(x1,y1);ctx.lineTo(ch.hoverX,ch.hoverY);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.fillStyle='#3b82f6';ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
  if(ch.ruler)drawRuler(ctx,ch);
  ctx.restore(); // end clip
  // #5: custom crosshair (shown in draw mode or when Ctrl held, outside price axis)
  if((S.drawMode||_ctrlHeld)&&ch.hoverX>0&&ch.hoverX<drawW){
    drawCustomCrosshair(ctx,ch,drawW,H);
  }
}

// #5: Custom crosshair drawn on canvas (shown in draw mode / Ctrl)
function drawCustomCrosshair(ctx,ch,W,H){
  const x=ch.hoverX,y=ch.hoverY;
  const snapped=_ctrlHeld?snapPoint(ch,x,y,true):null;
  const dx=snapped?(timeToCoordX(ch,snapped.time)??x):x;
  const dy=snapped?(ch.cs.priceToCoordinate(snapped.price)??y):y;
  ctx.save();
  ctx.setLineDash([3,3]);
  ctx.strokeStyle=snapped?'#3b82f6aa':'#60607080';
  ctx.lineWidth=1;
  // Horizontal
  ctx.beginPath();ctx.moveTo(0,dy);ctx.lineTo(W,dy);ctx.stroke();
  // Vertical
  ctx.beginPath();ctx.moveTo(dx,0);ctx.lineTo(dx,H);ctx.stroke();
  ctx.setLineDash([]);
  if(snapped){
    ctx.beginPath();ctx.fillStyle='#3b82f6';ctx.arc(dx,dy,4,0,Math.PI*2);ctx.fill();
    ctx.font='9px JetBrains Mono,monospace';ctx.fillStyle='#3b82f6cc';
    ctx.textAlign='right';ctx.fillText(fmtPrice(snapped.price),W-2,dy-4);ctx.textAlign='left';
  }
  ctx.restore();
}

function drawHRay(ctx,ch,d,W,hov){
  const y=ch.cs.priceToCoordinate(d.p1.price);if(y===null)return;
  const x0=timeToCoordX(ch,d.p1.time)??0;
  // Clamp x0 so ray always starts left-of or at current position, draws rightward
  const xs=Math.max(0,x0);
  ctx.save();
  if(hov){ctx.shadowColor=d.color;ctx.shadowBlur=6;}
  ctx.beginPath();ctx.strokeStyle=d.color;ctx.lineWidth=hov?2:1;ctx.setLineDash([5,3]);
  ctx.moveTo(xs,y);ctx.lineTo(W,y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=d.color;ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='right';
  ctx.fillText(fmtPrice(d.p1.price),W-3,y-3);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(xs,y,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawTLine(ctx,ch,d,hov){
  const x1=timeToCoordX(ch,d.p1.time);
  const y1=ch.cs.priceToCoordinate(d.p1.price);
  const x2=timeToCoordX(ch,d.p2.time);
  const y2=ch.cs.priceToCoordinate(d.p2.price);
  if(x1===null||y1===null||x2===null||y2===null)return;
  ctx.save();
  if(hov){ctx.shadowColor=d.color;ctx.shadowBlur=6;}
  ctx.beginPath();ctx.strokeStyle=d.color;ctx.lineWidth=hov?2.5:1.2;
  ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.beginPath();ctx.fillStyle=d.color;ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(x2,y2,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawRuler(ctx,ch){
  const r=ch.ruler;if(!r?.p1||!r?.p2)return;
  const x1=timeToCoordX(ch,r.p1.time);
  const y1=ch.cs.priceToCoordinate(r.p1.price);
  const x2=timeToCoordX(ch,r.p2.time);
  const y2=ch.cs.priceToCoordinate(r.p2.price);
  if(x1===null||y1===null||x2===null||y2===null)return;
  const isUp=r.p2.price>=r.p1.price;const col=isUp?'#1fa891':'#e04040';
  ctx.save();
  ctx.fillStyle=isUp?'rgba(31,168,145,0.08)':'rgba(224,64,64,0.08)';
  ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
  ctx.beginPath();ctx.strokeStyle=col+'50';ctx.lineWidth=1;ctx.setLineDash([3,3]);
  ctx.moveTo(x1,y1);ctx.lineTo(x2,y1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x2,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.beginPath();ctx.fillStyle=col;ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(x2,y2,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ── Alert Ray ─────────────────────────────────────────────────
function drawAlertRay(ctx,ch,d,W,hov){
  const y=ch.cs.priceToCoordinate(d.p1.price);if(y===null)return;
  const x0=timeToCoordX(ch,d.p1.time)??0;
  const xs=Math.max(0,x0);
  const col='#a855f7';
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  if(d.alertPct!=null&&d.alertPct>0){
    const bandH=Math.abs((ch.cs.priceToCoordinate(d.p1.price*(1-d.alertPct/100))??y)-y);
    ctx.fillStyle='rgba(168,85,247,0.06)';
    ctx.fillRect(xs,y-bandH,W-xs,bandH*2);
  }
  ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=hov?2:1.2;ctx.setLineDash([6,3]);
  ctx.moveTo(xs,y);ctx.lineTo(W,y);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=col;ctx.font='9px JetBrains Mono,monospace';
  ctx.textAlign='right';
  const pctLabel=d.alertPct!=null?` ±${d.alertPct}%`:'';
  ctx.fillText(fmtPrice(d.p1.price)+pctLabel,W-3,y-3);
  ctx.textAlign='left';
  ctx.beginPath();ctx.arc(xs,y,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawAlertTLine(ctx,ch,d,hov){
  const x1=timeToCoordX(ch,d.p1.time);
  const y1=ch.cs.priceToCoordinate(d.p1.price);
  const x2=timeToCoordX(ch,d.p2.time);
  const y2=ch.cs.priceToCoordinate(d.p2.price);
  if(x1===null||y1===null||x2===null||y2===null)return;
  const col='#a855f7';
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  // #7: Draw ±alertPct% band
  if(d.alertPct!=null&&d.alertPct>0){
    const factor=d.alertPct/100;
    // Upper band points (prices * (1+factor))
    const y1u=ch.cs.priceToCoordinate(d.p1.price*(1+factor));
    const y2u=ch.cs.priceToCoordinate(d.p2.price*(1+factor));
    const y1l=ch.cs.priceToCoordinate(d.p1.price*(1-factor));
    const y2l=ch.cs.priceToCoordinate(d.p2.price*(1-factor));
    if(y1u!=null&&y2u!=null&&y1l!=null&&y2l!=null){
      // Filled polygon
      ctx.beginPath();
      ctx.moveTo(x1,y1u);ctx.lineTo(x2,y2u);
      ctx.lineTo(x2,y2l);ctx.lineTo(x1,y1l);ctx.closePath();
      ctx.fillStyle='rgba(168,85,247,0.06)';ctx.fill();
      // Upper & lower dashed lines
      ctx.beginPath();ctx.strokeStyle='rgba(168,85,247,0.35)';ctx.lineWidth=0.8;ctx.setLineDash([4,4]);
      ctx.moveTo(x1,y1u);ctx.lineTo(x2,y2u);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x1,y1l);ctx.lineTo(x2,y2l);ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=hov?2.5:1.4;ctx.setLineDash([6,3]);
  ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=col;
  ctx.beginPath();ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(x2,y2,3,0,Math.PI*2);ctx.fill();
  if(d.alertPct!=null){
    const mx=(x1+x2)/2,my=(y1+y2)/2;
    ctx.font='bold 9px JetBrains Mono,monospace';ctx.fillStyle=col;ctx.textAlign='center';
    ctx.fillText(`±${d.alertPct}%`,mx,my-6);
  }
  ctx.restore();
}

// ── Alert Sound ────────────────────────────────────────────────
let _alertCtx=null;
function playAlert(freq=880){
  try{
    if(!_alertCtx)_alertCtx=new AudioContext();
    const ctx=_alertCtx;const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=freq;osc.type='sine';
    gain.gain.setValueAtTime(0.25,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.7);
    osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.7);
  }catch(e){}
}

function checkAlerts(ch,drawing){
  if(!ch.cs)return;
  const curPrice=ch.candles.length?ch.candles[ch.candles.length-1].c:null;
  if(curPrice==null)return;
  const now=Date.now();
  if(!drawing._lastAlert)drawing._lastAlert=0;
  const cooldownMs=(S.alertSettings.cooldown||5)*1000;
  if(!S.alertSettings.repeat&&drawing._fired)return;
  if(now-drawing._lastAlert<cooldownMs)return;
  if(drawing.alertPct==null||drawing.alertPct<=0)return;
  let linePrice=null;
  if(drawing.type==='aray')linePrice=drawing.p1.price;
  else if(drawing.type==='atline'&&drawing.p1&&drawing.p2){
    const t=now/1000+TZ_OFFSET_S;const t1=drawing.p1.time,t2=drawing.p2.time;
    if(t2!==t1)linePrice=drawing.p1.price+(drawing.p2.price-drawing.p1.price)*(t-t1)/(t2-t1);
    else linePrice=(drawing.p1.price+drawing.p2.price)/2;
  }
  if(linePrice==null)return;
  const distPct=Math.abs(curPrice-linePrice)/linePrice*100;
  if(distPct<=drawing.alertPct){
    drawing._lastAlert=now;
    drawing._fired=true;
    if(S.alertSettings.sound)playAlert();
    // Log
    const sym=ch.sym||S.fsSym||'?';
    S.alertLog.unshift({ts:now,sym,curPrice,linePrice,distPct,type:drawing.type,alertPct:drawing.alertPct});
    if(S.alertLog.length>50)S.alertLog.pop();
    renderAlertLog();
    // Flash alert badge
    const badge=document.getElementById('alertBadge');
    if(badge){badge.textContent=S.alertLog.length;badge.style.display='inline';}
  }
}

function renderAlertLog(){
  const el=document.getElementById('alertLogList');if(!el)return;
  if(!S.alertLog.length){el.innerHTML='<div style="padding:12px;color:var(--text3);font-size:9px">Алертов пока не было</div>';return;}
  el.innerHTML=S.alertLog.map(a=>{
    const t=new Date(a.ts);const pad=n=>n.toString().padStart(2,'0');
    const tStr=`${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    const symShort=a.sym.replace(/USDT$/,'');
    const dir=a.curPrice>=a.linePrice?'↑':'↓';
    return`<div class="alert-log-row" onclick="openFullscreenBySym('${a.sym}')" title="Открыть ${symShort}">
      <span style="color:var(--text3);font-size:9px">${tStr}</span>
      <span style="color:#fff;font-weight:600;margin:0 5px">${symShort}</span>
      <span style="color:#a855f7">${dir} ${fmtPrice(a.curPrice)}</span>
      <span style="color:var(--text3);font-size:9px;margin-left:auto">≈уровень ${fmtPrice(a.linePrice)}</span>
    </div>`;
  }).join('');
}

function toggleAlertLog(){
  const panel=document.getElementById('alertLogPanel');
  if(!panel)return;
  const vis=panel.style.display!=='flex';
  panel.style.display=vis?'flex':'none';
  if(vis){renderAlertLog();document.getElementById('alertBadge').style.display='none';}
}

function checkAllAlerts(){
  [...S.charts,...S.fsCharts].forEach(ch=>{
    if(!ch.candles.length)return;
    ch.drawings.forEach(d=>{if(d.type==='aray'||d.type==='atline')checkAlerts(ch,d);});
  });
}

// Alert % input overlay
function showAlertPctInput(ch,drawing,container){
  const old=document.getElementById('alertPctOverlay');if(old)old.remove();
  if(!ch.cs||!ch.lc)return;
  let px,py;
  if(drawing.type==='aray'){
    px=(ch.lc.timeScale().timeToCoordinate(drawing.p1.time)??50)+20;
    py=ch.cs.priceToCoordinate(drawing.p1.price)??50;
  }else{
    px=ch.lc.timeScale().timeToCoordinate(drawing.p2.time)??50;
    py=ch.cs.priceToCoordinate(drawing.p2.price)??50;
  }
  const wrap=document.createElement('div');
  wrap.id='alertPctOverlay';
  const r=container.getBoundingClientRect();
  wrap.style.cssText=`position:fixed;z-index:500;left:${r.left+px}px;top:${r.top+py-14}px;
    background:var(--bg3);border:1px solid #a855f7;border-radius:4px;padding:3px 6px;
    display:flex;align-items:center;gap:4px;font-size:10px;color:#a855f7;font-family:inherit;`;
  wrap.innerHTML=`<span>±</span>
    <input id="alertPctInp" type="number" min="0.01" max="99" step="0.1" placeholder="0.5"
      style="width:46px;background:transparent;border:none;outline:none;color:#a855f7;font:inherit;font-size:10px">
    <span>%</span>`;
  document.body.appendChild(wrap);
  const inp=document.getElementById('alertPctInp');
  if(drawing.alertPct)inp.value=drawing.alertPct;
  inp.focus();inp.select();
  const confirm=()=>{
    const v=parseFloat(inp.value);
    drawing.alertPct=isNaN(v)||v<=0?null:v;
    wrap.remove();
    [...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));
  };
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')confirm();if(e.key==='Escape')wrap.remove();});
  setTimeout(()=>document.addEventListener('mousedown',function h(e){if(!wrap.contains(e.target)){confirm();document.removeEventListener('mousedown',h);}},true),100);
}

// ── Interact events ────────────────────────────────────────────
function onInteractMove(ch,e,container){
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  ch.hoverX=x;ch.hoverY=y;
  if(S.drawMode||_ctrlHeld)requestAnimationFrame(()=>rCanvas(ch));
}

// #6: dblclick in draw mode on an existing alert → edit %
function onInteractDblClick(ch,e,container){
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  const idx=findDrawingNear(ch,x,y);
  if(idx>=0){
    const d=ch.drawings[idx];
    if(d.type==='aray'||d.type==='atline')showAlertPctInput(ch,d,container);
  }
}

function onInteractClick(ch,e,container){
  if(!S.drawMode)return;
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  const pt=snapPoint(ch,x,y,e.ctrlKey);if(!pt)return;
  if(S.drawMode==='hray'){
    ch.drawings.push({id:++S.drawIdCounter,type:'hray',p1:pt,color:'#e8a020'});
    rCanvas(ch);
  }else if(S.drawMode==='tline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      ch.drawings.push({id:++S.drawIdCounter,type:'tline',p1:ch.pendingP1,p2:pt,color:'#3b82f6'});
      ch.pendingP1=null;rCanvas(ch);
    }
  }else if(S.drawMode==='aray'){
    const d={id:++S.drawIdCounter,type:'aray',p1:pt,alertPct:null,_lastAlert:0};
    ch.drawings.push(d);rCanvas(ch);
    showAlertPctInput(ch,d,container);
  }else if(S.drawMode==='atline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      const d={id:++S.drawIdCounter,type:'atline',p1:ch.pendingP1,p2:pt,alertPct:null,_lastAlert:0};
      ch.drawings.push(d);ch.pendingP1=null;rCanvas(ch);
      showAlertPctInput(ch,d,container);
    }
  }
}

function setDrawMode(mode){
  S.drawMode=mode;
  [['draw-none',null],['draw-hray','hray'],['draw-tline','tline'],['draw-aray','aray'],['draw-atline','atline'],
   ['fs-draw-none',null],['fs-draw-hray','hray'],['fs-draw-tline','tline'],['fs-draw-aray','aray'],['fs-draw-atline','atline']].forEach(([id,m])=>{
    const el=document.getElementById(id);if(el)el.classList.toggle('on',m===mode);
  });
  const allCharts=[...S.charts,...S.fsCharts];
  allCharts.forEach(ch=>{
    ch.pendingP1=null;
    if(ch.interact)ch.interact.className='chart-interact'+(mode?' draw':'');
  });
  const hint=document.getElementById('ctopHint');
  if(hint){
    const h={
      null:'Топ-9 · колёсико=линейка · ПКМ=удалить нарисованное · Ctrl=магнит · ЛКМ на точке=перетащить · ДблКлик=редактировать%',
      hray:'Горизонтальный луч: клик · ПКМ=выйти в курсор · Ctrl+клик=магнит · ДблКлик на линии=% алерта',
      tline:'Трендовая линия: 2 клика · ПКМ=выйти в курсор · Ctrl+клик=магнит',
      aray:'Алерт-луч: клик → введите % · ПКМ=выйти в курсор · ДблКлик на линии=изменить%',
      atline:'Алерт-линия: 2 клика → введите % · ПКМ=выйти в курсор'
    };
    hint.textContent=h[mode]??h[null];
  }
}

// ── Ruler ──────────────────────────────────────────────────────
function onRulerStart(ch,e,container){
  if(!ch.lc||!ch.cs)return;
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  const pt=snapPoint(ch,x,y,e.ctrlKey)||pixelToPoint(ch,x,y);if(!pt)return;
  // Clear rulers on charts from opposite context
  [...S.charts,...S.fsCharts].forEach((c,i)=>{if(c!==ch&&c.ruler){c.ruler=null;rCanvas(c);}});
  ch.ruler={active:true,p1:pt,p2:pt,mouseX:e.clientX,mouseY:e.clientY};
  ch._rulerIsFsChart=S.fsCharts.includes(ch);
  rCanvas(ch);
}
function onRulerMove(ch,e,container){
  if(!ch.ruler?.active)return;
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  const pt=snapPoint(ch,x,y,e.ctrlKey)||pixelToPoint(ch,x,y);if(!pt)return;
  ch.ruler.p2=pt;ch.ruler.mouseX=e.clientX;ch.ruler.mouseY=e.clientY;
  // Sync ruler to all sibling FS charts (different TFs, same symbol)
  if(ch._rulerIsFsChart){
    S.fsCharts.forEach(fc=>{
      if(fc===ch)return;
      if(!fc.lc||!fc.cs)return;
      fc.ruler={active:true,p1:{...ch.ruler.p1},p2:{...ch.ruler.p2},mouseX:e.clientX,mouseY:e.clientY,_mirror:true};
      requestAnimationFrame(()=>rCanvas(fc));
    });
  }
  requestAnimationFrame(()=>{rCanvas(ch);updateRulerTooltip(ch);});
}
function onRulerEnd(ch){
  if(!ch.ruler)return;
  ch.ruler.active=false;
  if(ch._rulerIsFsChart){
    S.fsCharts.forEach(fc=>{
      if(fc===ch||!fc.ruler)return;
      fc.ruler.active=false;
      rCanvas(fc);
    });
  }
  updateRulerTooltip(ch);
}

function updateRulerTooltip(ch){
  const tt=document.getElementById('rulerTooltip');
  if(!ch.ruler?.p1||!ch.ruler?.p2){tt.style.display='none';return;}
  const r=ch.ruler;
  const pct=(r.p2.price-r.p1.price)/r.p1.price*100;
  const isUp=pct>=0;const col=isUp?'#1fa891':'#e04040';
  const tMin=(Math.min(r.p1.time,r.p2.time)-TZ_OFFSET_S)*1000,tMax=(Math.max(r.p1.time,r.p2.time)-TZ_OFFSET_S)*1000;
  let bars=0,vol=0;
  for(const c of ch.candles)if(c.t>=tMin&&c.t<=tMax){bars++;vol+=c.qv;}
  document.getElementById('rtPct').textContent=(isUp?'+':'')+pct.toFixed(3)+'%';
  document.getElementById('rtPct').style.color=col;
  document.getElementById('rtBars').textContent=`Баров: ${bars}`;
  document.getElementById('rtTime').textContent=`Время: ${formatDuration(Math.abs(r.p2.time-r.p1.time))}`;
  document.getElementById('rtVol').textContent=`Объём: ${fk(vol)} USDT`;
  const tw=165,th=80;
  tt.style.left=Math.min(r.mouseX+18,window.innerWidth-tw-8)+'px';
  tt.style.top=Math.max(r.mouseY-th-8,4)+'px';
  tt.style.display='block';
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    [...S.charts,...S.fsCharts].forEach((ch,i)=>{
      ch.pendingP1=null;
      if(ch.ruler){ch.ruler=null;document.getElementById('rulerTooltip').style.display='none';}
      rCanvas(ch);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
//  WEBSOCKETS
// ═══════════════════════════════════════════════════════════════
function startChartWS(){
  if(S.wsCharts){try{S.wsCharts.close();}catch(e){}S.wsCharts=null;}
  const syms=S.charts.map(c=>c.sym).filter(Boolean);if(!syms.length||!S.LC)return;
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${syms.map(s=>`${s.toLowerCase()}@kline_${S.tf}`).join('/')}`);
  let closed=false;
  ws.onmessage=(evt)=>{
    let k;
    try{k=JSON.parse(evt.data).data?.k;}catch(e){return;}
    if(!k)return;
    const slot=S.charts.findIndex(c=>c.sym===k.s);if(slot===-1)return;
    const ch=S.charts[slot];if(!ch.cs)return;
    const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q};
    if(ch.candles.length&&ch.candles[ch.candles.length-1].t===candle.t)ch.candles[ch.candles.length-1]=candle;
    else if(ch.candles.length&&candle.t>ch.candles[ch.candles.length-1].t)ch.candles.push(candle);
    // Batch updates in RAF to avoid blocking main thread mid-paint
    ch._pendingCandle=candle;
    if(!ch._rafPending){
      ch._rafPending=true;
      requestAnimationFrame(()=>{
        ch._rafPending=false;
        const c=ch._pendingCandle;if(!c||!ch.cs)return;
        try{
          ch.cs.update({time:toChartTime(c.t),open:c.o,high:c.h,low:c.l,close:c.c});
          ch.vs.update({time:toChartTime(c.t),value:c.qv,color:c.c>=c.o?'#1fa89122':'#e0404022'});
        }catch(e){}
        ch.drawings.forEach(d=>{if(d.type==='aray'||d.type==='atline')checkAlerts(ch,d);});
        const cpEl=document.getElementById(`cp${slot}`);if(cpEl)cpEl.textContent=fmtPrice(c.c);
        const t=S.tk[k.s];const cg=document.getElementById(`cg${slot}`);
        if(t?.c24!=null&&cg){cg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';cg.className='cchg '+(t.c24>=0?'p':'n');}
        rCanvas(ch);
      });
    }
  };
  ws.onclose=()=>{if(!closed)setTimeout(startChartWS,3000);};
  ws.onerror=()=>{closed=true;ws.close();setTimeout(startChartWS,3000);};
  S.wsCharts=ws;
}

function tfMs(tf){
  if(tf==='1m')return 60000;
  if(tf==='3m')return 180000;
  if(tf==='5m')return 300000;
  if(tf==='15m')return 900000;
  if(tf==='30m')return 1800000;
  if(tf==='1h')return 3600000;
  if(tf==='4h')return 14400000;
  if(tf==='1d')return 86400000;
  return 300000;
}

let _wsChartTrades=null;
let _wsChartTradesReconnectTimer=null;
function startChartTradesWS(){
  if(_wsChartTradesReconnectTimer){clearTimeout(_wsChartTradesReconnectTimer);_wsChartTradesReconnectTimer=null;}
  if(_wsChartTrades){try{_wsChartTrades.close();}catch(e){}_wsChartTrades=null;}
  const syms=S.charts.map(c=>c.sym).filter(Boolean);if(!syms.length||!S.LC)return;
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${syms.map(s=>`${s.toLowerCase()}@aggTrade`).join('/')}`);
  let closed=false;
  ws.onmessage=(evt)=>{
    let d;
    try{d=JSON.parse(evt.data).data;}catch(e){return;}
    if(!d?.s||d.p==null)return;
    const slot=S.charts.findIndex(c=>c.sym===d.s);if(slot===-1)return;
    const ch=S.charts[slot];if(!ch?.cs||!ch.candles?.length)return;
    const price=+d.p;if(!isFinite(price))return;
    const ms=tfMs(S.tf);
    const ts=(+d.T||Date.now());
    const bucketTs=Math.floor(ts/ms)*ms;
    let c=ch.candles[ch.candles.length-1];
    if(bucketTs===c.t){
      c.c=price;
      if(price>c.h)c.h=price;
      if(price<c.l)c.l=price;
    }else if(bucketTs>c.t){
      c={t:bucketTs,o:c.c,h:Math.max(c.c,price),l:Math.min(c.c,price),c:price,qv:c.qv||0,v:c.v||0,tr:c.tr||0};
      ch.candles.push(c);
      if(ch.candles.length>1500)ch.candles.splice(0,ch.candles.length-1500);
    }else return;
    if(!ch._tradeRafPending){
      ch._tradeRafPending=true;
      requestAnimationFrame(()=>{
        ch._tradeRafPending=false;
        const lc=ch.candles[ch.candles.length-1];
        if(!lc||!ch.cs)return;
        try{
          ch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
          const cpEl=document.getElementById(`cp${slot}`);if(cpEl)cpEl.textContent=fmtPrice(lc.c);
          rCanvas(ch);
        }catch(e){}
      });
    }
  };
  ws.onclose=()=>{if(!closed)_wsChartTradesReconnectTimer=setTimeout(startChartTradesWS,3000);};
  ws.onerror=()=>{closed=true;try{ws.close();}catch(e){}_wsChartTradesReconnectTimer=setTimeout(startChartTradesWS,3000);};
  _wsChartTrades=ws;
}

let _wsTickerRawLatest='';
let _wsTickerFlushTimer=null;
let _lastAlertCheckTs=0;
function startScreenerWS(){
  if(S.wsScreener){try{S.wsScreener.close();}catch(e){}}
  const ws=new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
  ws.onmessage=(evt)=>{
    _wsTickerRawLatest=evt.data;
    if(_wsTickerFlushTimer)return;
    _wsTickerFlushTimer=setTimeout(()=>{
      _wsTickerFlushTimer=null;
      const raw=_wsTickerRawLatest;_wsTickerRawLatest='';
      let arr;
      try{arr=JSON.parse(raw);}catch(e){return;}
      for(const t of arr){
        if(!t?.s?.endsWith('USDT'))continue;
        if(S.tk[t.s]){S.tk[t.s].p=+t.c;S.tk[t.s].c24=+t.P;S.tk[t.s].qv=+t.q;S.tk[t.s].tr=+t.n||S.tk[t.s].tr;}
        if(S.mx[t.s]){S.mx[t.s].price=+t.c;S.mx[t.s].ch24=+t.P;S.mx[t.s].vol24=+t.q;S.mx[t.s].trd24=+t.n||S.mx[t.s].trd24;}
      }
      scheduleRender();updTime();
      if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym]){
        const t=S.tk[S.fsSym];const m=S.mx[S.fsSym]||{};
        const fsp=document.getElementById('fsPrc');if(fsp)fsp.textContent=fmtPrice(t.p);
        const ce=document.getElementById('fsChg');if(ce){ce.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';ce.className='cchg '+(t.c24>=0?'p':'n');}
        const fv=document.getElementById('fsVol');if(fv)fv.innerHTML=t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'';
        const ft=document.getElementById('fsTrd');if(ft)ft.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
        const corVal=m.corr14??m.corr;const fc=document.getElementById('fsCorr');
        if(fc)fc.innerHTML=corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'';
        const fhc=document.getElementById('fsHcount');
        const hc=document.getElementById('hcount');
        if(fhc&&hc)fhc.textContent=hc.textContent||'';
      }
      if(Date.now()-_lastAlertCheckTs>2000){
        _lastAlertCheckTs=Date.now();
        checkAllAlerts();
      }
    },350);
  };
  ws.onclose=()=>setTimeout(startScreenerWS,3000);
  S.wsScreener=ws;
}

// ═══════════════════════════════════════════════════════════════
//  SCREENER TABLE (shared for main & FS)
// ═══════════════════════════════════════════════════════════════
function buildScreenerHeader(hdrEl){
  hdrEl.innerHTML='';
  const tickCol=document.createElement('div');
  tickCol.className='tick-col';tickCol.title='Сортировать по тикеру';
  tickCol.innerHTML='<span class="tick-lbl">ТИКЕР '+(S.sortAlpha?(S.sortDir==='asc'?'▲':'▼'):'')+' </span>';
  tickCol.onclick=()=>doSort('sym');
  hdrEl.appendChild(tickCol);
  const ms=document.createElement('div');ms.className='mscroll';
  const mg=document.createElement('div');mg.style.display='flex';mg.style.height='100%';
  const cols=activeCols();
  cols.forEach(c=>{
    const d=document.createElement('div');
    d.className='mhcol';d.id=`hc-${c.id}`;d.title=c.tip;d.style.flex='1';d.style.minWidth='32px';
    d.innerHTML=`<div class="ht">${c.l}</div><div class="hb">${c.s}</div>`;
    d.onclick=()=>doSort(c.id);mg.appendChild(d);
  });
  ms.appendChild(mg);hdrEl.appendChild(ms);
  updSortHdr();
  setTimeout(buildGroupFilterBar,0);
}

function sortedRows(){
  let rows=Object.values(S.mx);
  if(S.q){const q=S.q.toUpperCase();rows=rows.filter(r=>r.sym.includes(q));}
  if(S.minVol>0)rows=rows.filter(r=>r.vol24!=null&&r.vol24>=S.minVol*1e6);
  // #9: group filter
  if(S.activeGroupFilter>0)rows=rows.filter(r=>getSymGroup(r.sym)===S.activeGroupFilter);
  rows.sort((a,b)=>{
    if(S.sortAlpha){
      const r=a.sym.localeCompare(b.sym);return S.sortDir==='asc'?r:-r;
    }
    let va=a[S.sortId],vb=b[S.sortId];
    if(S.sortAbs&&(S.sortId==='ch24'||S.sortId==='ch7d'||S.sortId==='cday')){
      va=va!=null&&!isNaN(va)?Math.abs(va):va;vb=vb!=null&&!isNaN(vb)?Math.abs(vb):vb;
    }
    if(va==null||isNaN(va))return 1;if(vb==null||isNaN(vb))return-1;
    return S.sortDir==='desc'?vb-va:va-vb;
  });
  return rows;
}

function renderScreenerInto(bodyEl,rows){
  const inChart=new Set(S.charts.map(c=>c.sym).filter(Boolean));
  const start=S.page*S.charts.length;
  const pageSyms=new Set(rows.slice(start,start+S.charts.length).map(r=>r.sym));
  const cols=activeCols();

  // Fast-path: if rows & cols match, update cells in-place (no DOM rebuild)
  const existingRows=bodyEl.querySelectorAll('.srow');
  const colsKey=cols.map(c=>c.id).join(',');
  if(existingRows.length===rows.length && bodyEl.dataset.colsKey===colsKey){
    rows.forEach((m,idx)=>{
      const row=existingRows[idx];
      if(!row)return;
      const grp=getSymGroup(m.sym);
      const grpCol=GROUP_COLORS[grp]||'';
      // Update row class
      const newCls='srow'+(inChart.has(m.sym)?' inchart':'')+(S.fsOpen&&S.fsSym===m.sym?' infullscreen':'');
      if(row.className!==newCls)row.className=newCls;
      // Update metric cells
      const cells=row.querySelectorAll('.mc');
      cols.forEach((c,ci)=>{
        const cell=cells[ci];if(!cell)return;
        const v=m[c.id];
        const newTxt=fv(v,c.id);
        const newCls='mc '+fc(v,c.id)+' '+fh(v,c.id);
        if(cell.textContent!==newTxt)cell.textContent=newTxt;
        if(cell.className!==newCls)cell.className=newCls;
      });
    });
    return;
  }

  // Full rebuild (first load, column change, or row count change)
  bodyEl.dataset.colsKey=colsKey;
  const frag=document.createDocumentFragment();
  for(const m of rows){
    const grp=getSymGroup(m.sym);
    const grpCol=GROUP_COLORS[grp]||'';
    const row=document.createElement('div');
    row.className='srow'+(inChart.has(m.sym)?' inchart':'')+(S.fsOpen&&S.fsSym===m.sym?' infullscreen':'');
    row.onclick=()=>openFullscreenBySym(m.sym);
    if(grpCol){
      const stripe=document.createElement('div');
      stripe.className='cg-badge';stripe.style.background=grpCol;stripe.style.opacity='0.7';
      row.appendChild(stripe);
    }
    const rt=document.createElement('div');rt.className='rtick';
    if(!grpCol)rt.style.paddingLeft='9px';
    const pgNum=pageSyms.has(m.sym)?`<span class="tpg">·${S.page+1}</span>`:'';
    const gdot=document.createElement('span');gdot.className='cg-dot';
    gdot.style.background=grpCol||'var(--bg4)';gdot.style.borderColor=grpCol?'rgba(255,255,255,.2)':'var(--border2)';
    gdot.title='Цветовая группа';
    gdot.onclick=ev=>{ev.stopPropagation();showGroupPicker(m.sym,gdot);};
    rt.appendChild(gdot);
    const nameSpan=document.createElement('span');nameSpan.className='tname';nameSpan.textContent=m.sym.replace(/USDT$/,'');
    nameSpan.title='Нажмите для копирования';nameSpan.style.cursor='pointer';
    nameSpan.onclick=ev=>{ev.stopPropagation();copyTicker(m.sym.replace(/USDT$/,''));openFullscreenBySym(m.sym);};
    rt.appendChild(nameSpan);
    if(pgNum){const pg=document.createElement('span');pg.className='tpg';pg.textContent=`·${S.page+1}`;rt.appendChild(pg);}
    row.appendChild(rt);
    const rg=document.createElement('div');rg.className='rmgrid';
    for(const c of cols){
      const v=m[c.id];const cell=document.createElement('div');
      cell.className=`mc ${fc(v,c.id)} ${fh(v,c.id)}`;cell.textContent=fv(v,c.id);rg.appendChild(cell);
    }
    row.appendChild(rg);frag.appendChild(row);
  }
  bodyEl.innerHTML='';bodyEl.appendChild(frag);
}

let _rt=null;
// Use requestIdleCallback if available — browser picks a free moment between frames
const _schedFn = typeof requestIdleCallback !== 'undefined'
  ? (cb) => requestIdleCallback(cb, {timeout:600})
  : (cb) => setTimeout(cb, 500);
function scheduleRender(){
  if(_rt)return;
  _rt=_schedFn(()=>{_rt=null;if(!_scrolling)renderTable();});
}
// Skip DOM rebuild while user is scrolling the screener
let _scrolling=false,_scrollEnd=null;
document.addEventListener('DOMContentLoaded',()=>{
  const sb=document.getElementById('sbody');
  if(sb){sb.addEventListener('scroll',()=>{_scrolling=true;clearTimeout(_scrollEnd);_scrollEnd=setTimeout(()=>{_scrolling=false;renderTable();},150);});}
});

function renderTable(){
  const rows=sortedRows();
  const countTxt=rows.length+' монет';
  document.getElementById('hcount').textContent=countTxt;
  const fshc=document.getElementById('fsHcount');if(fshc)fshc.textContent=countTxt;
  renderScreenerInto(document.getElementById('sbody'),rows);
  if(S.fsOpen&&S.fsScreenerVisible){
    renderScreenerInto(document.getElementById('fsSbody'),rows);
  }
  updatePagination(rows.length);
}

function updatePagination(total){
  const n=S.charts.length;
  const tp=Math.max(1,Math.ceil(total/n));
  if(S.page>=tp)S.page=tp-1;
  ['pgInfo','fsPgInfo'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=`${S.page+1} / ${tp}`;});
  ['pgPrev','fsPgPrev'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=S.page===0;});
  ['pgNext','fsPgNext'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=S.page>=tp-1;});
  document.getElementById('pgTotal').textContent=`(${total} монет)`;
}

function updSortHdr(){
  document.querySelectorAll('.mhcol').forEach(e=>e.classList.remove('sa','sd'));
  document.querySelectorAll(`#hc-${S.sortId}`).forEach(el=>el.classList.add(S.sortDir==='desc'?'sd':'sa'));
  const c=ALL_COLS.find(x=>x.id===S.sortId);
  const si=document.getElementById('sinfo');
  if(si)si.textContent=S.sortAlpha?`Тикер ${S.sortDir==='asc'?'▲':'▼'}`:(c?`Сорт: ${c.l} ${c.s} ${S.sortDir==='desc'?'↓':'↑'}`:'');
}

// ═══════════════════════════════════════════════════════════════
//  CONTROLS
// ═══════════════════════════════════════════════════════════════
function doSort(id){
  if(id==='sym'){
    S.sortAlpha=true;S.sortId='sym';
    S.sortDir=(S.sortDir==='asc')?'desc':'asc';
  }else{
    S.sortAlpha=false;
    if(S.sortId===id)S.sortDir=S.sortDir==='desc'?'asc':'desc';
    else{S.sortId=id;S.sortDir='desc';}
  }
  S.page=0;updSortHdr();
  // Rebuild both headers to refresh tick-col arrow
  buildScreenerHeader(document.getElementById('shdr'));
  if(document.getElementById('fsShdr'))buildScreenerHeader(document.getElementById('fsShdr'));
  updateCharts();renderTable();
}

function changePage(delta){
  const rows=sortedRows();
  const tp=Math.max(1,Math.ceil(rows.length/S.charts.length));
  S.page=Math.max(0,Math.min(tp-1,S.page+delta));
  updateCharts();renderTable();
}

function setTf(tf,btnId){
  S.tf=tf;
  document.querySelectorAll('#toolbar .tbtn,#fsTfBtns .tbtn').forEach(b=>{
    if(['tf1m','tf5m','tf15m','tf1h','tf4h','tf1d'].includes(b.id)||b.dataset.tf)b.classList.remove('on');
  });
  document.getElementById(btnId)?.classList.add('on');
  document.querySelectorAll(`[data-tf="${tf}"]`).forEach(b=>b.classList.add('on'));
  const ctf=document.getElementById('ctf');if(ctf)ctf.textContent=tf;
  const syms=S.charts.map(c=>c.sym);
  S.charts.forEach(c=>{c.sym=null;c.candles=[];});
  syms.forEach((sym,i)=>{if(sym)loadChart(i,sym);});
  setTimeout(()=>{startChartWS();startChartTradesWS();},700);
}

function onSearch(q){S.q=q;S.page=0;updateCharts();renderTable();}

function onVolFilter(val){
  S.minVol=+val*10;
  const disp=S.minVol===0?'0':`${S.minVol}M`;
  ['volVal','fsVolVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=disp;});
  ['volSlider','fsVolSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=val;});
  S.page=0;updateCharts();renderTable();
}

function updTime(){
  const d=new Date();const pad=n=>n.toString().padStart(2,'0');
  const timeStr=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ht=document.getElementById('htime');if(ht)ht.textContent=timeStr;
  const hs=document.getElementById('hstatus');if(hs)hs.textContent='Онлайн';
  // Sync to FS header if open
  if(S.fsOpen){
    const fshtime=document.getElementById('fsHtime');if(fshtime)fshtime.textContent=timeStr;
    const fshstatus=document.getElementById('fsHstatus');if(fshstatus)fshstatus.textContent='Онлайн';
  }
}

// ═══════════════════════════════════════════════════════════════
//  AUTO CHART UPDATE
// ═══════════════════════════════════════════════════════════════
function updateCharts(){
  const rows=sortedRows();
  const start=S.page*S.charts.length;
  const pageSyms=rows.slice(start,start+S.charts.length).map(r=>r.sym);
  let changed=false;
  for(let i=0;i<S.charts.length;i++){
    const ns=pageSyms[i]||null;
    if(S.charts[i].sym!==ns){changed=true;loadChart(i,ns);}
  }
  if(changed)setTimeout(()=>{startChartWS();startChartTradesWS();},600);
  updatePagination(rows.length);
}

// ═══════════════════════════════════════════════════════════════
//  TOGGLE SCREENER
// ═══════════════════════════════════════════════════════════════
function toggleDensity(){
  S.showDensity=!S.showDensity;
  const btn=document.getElementById('densityBtn');
  if(btn)btn.classList.toggle('on',S.showDensity);
  if(S.showDensity){
    // Pre-fetch order books for all visible charts
    [...S.charts,...S.fsCharts].forEach(ch=>{const s=ch.sym||S.fsSym;if(s)fetchOrderBook(s);});
  }
  [...S.charts,...S.fsCharts].forEach(ch=>rCanvas(ch));
}

function getDensitySettings(sym){
  if(!S.densitySettings[sym])S.densitySettings[sym]={largeMult:2.5,medMult:1.6,smallMult:1.1};
  return S.densitySettings[sym];
}

function renderSettingsDensity(body){
  const sym=S.fsSym||S.charts.find(c=>c.sym)?.sym||'';
  const ds=getDensitySettings(sym);
  body.innerHTML=`
  <div style="font-size:9px;color:var(--text3);margin-bottom:8px;line-height:1.6">
    Плотности — горизонтальные лучи на уровнях, где накоплен значимый объём.<br>
    Луч начинается с момента первого появления плотности.<br>
    <span style="color:#e04040">█</span> крупная &nbsp;<span style="color:#e8a020">█</span> средняя &nbsp;<span style="color:#606080">█</span> малая
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Отображение плотностей</span>
    <div class="smodal-btns">
      ${tbtnHtml('dOn','Вкл',"setDensityVisible(true)",S.showDensity)}
      ${tbtnHtml('dOff','Выкл',"setDensityVisible(false)",!S.showDensity)}
    </div>
  </div>
  ${sym?`
  <div style="font-size:9px;color:var(--text2);margin:10px 0 4px">Пороги для: <b style="color:#fff">${sym.replace(/USDT$/,'')}</b></div>
  <div class="smodal-row">
    <span class="smodal-lbl">Крупная (×σ от среднего)</span>
    <input id="dLarge" type="number" step="0.1" min="1" max="10" value="${ds.largeMult}"
      onchange="setDensityMult('${sym}','largeMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;
             color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Средняя (×σ)</span>
    <input id="dMed" type="number" step="0.1" min="0.5" max="10" value="${ds.medMult}"
      onchange="setDensityMult('${sym}','medMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;
             color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Малая (×σ)</span>
    <input id="dSmall" type="number" step="0.1" min="0.1" max="10" value="${ds.smallMult}"
      onchange="setDensityMult('${sym}','smallMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;
             color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div style="margin-top:8px">
    <button class="tbtn" onclick="resetDensitySettings('${sym}')">⟳ Авто-калибровка</button>
  </div>`:'<div style="font-size:9px;color:var(--text3);margin-top:8px">Откройте монету для настройки порогов</div>'}
  `;
}

function setDensityVisible(on){
  S.showDensity=on;
  const btn=document.getElementById('densityBtn');if(btn)btn.classList.toggle('on',on);
  [...S.charts,...S.fsCharts].forEach(ch=>rCanvas(ch));
  renderSettingsDensity(document.getElementById('smodal-body'));
}

function setDensityMult(sym,key,val){
  getDensitySettings(sym)[key]=Math.max(0.1,parseFloat(val)||1);
  [...S.charts,...S.fsCharts].forEach(ch=>{if((ch.sym||S.fsSym)===sym)rCanvas(ch);});
}

function resetDensitySettings(sym){
  delete S.densitySettings[sym];
  renderSettingsDensity(document.getElementById('smodal-body'));
  [...S.charts,...S.fsCharts].forEach(ch=>{if((ch.sym||S.fsSym)===sym)rCanvas(ch);});
}

function renderSettingsAlerts(body){
  const a=S.alertSettings;
  body.innerHTML=`
  <div style="font-size:9px;color:var(--text3);margin-bottom:10px;line-height:1.6">
    Настройки звуковых алертов (🔔─ луч и 🔔╱ линия).<br>
    Алерт срабатывает когда цена приближается к линии на заданный %.
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Режим срабатывания</span>
    <div class="smodal-btns">
      ${tbtnHtml('arRep','Повтор',"setAlertSetting('repeat',true)",a.repeat)}
      ${tbtnHtml('arOne','1 раз',"setAlertSetting('repeat',false)",!a.repeat)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Кулдаун (сек)</span>
    <div style="display:flex;align-items:center;gap:6px">
      ${[5,15,30,60].map(s=>`<button class="tbtn${a.cooldown===s?' on':''}" onclick="setAlertSetting('cooldown',${s})">${s}с</button>`).join('')}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Звук</span>
    <div class="smodal-btns">
      ${tbtnHtml('asOn','Вкл',"setAlertSetting('sound',true)",a.sound)}
      ${tbtnHtml('asOff','Выкл',"setAlertSetting('sound',false)",!a.sound)}
    </div>
  </div>
  <div class="smodal-row" style="border-bottom:none;padding-top:12px">
    <span class="smodal-lbl" style="color:var(--text2)">История алертов</span>
    <button class="tbtn" onclick="toggleAlertLog();closeSettings()">🔔 Открыть лог</button>
  </div>
  <div class="smodal-row" style="border-bottom:none">
    <span class="smodal-lbl" style="color:var(--text2)">Сброс всех алертов</span>
    <button class="tbtn" onclick="resetAllAlerts()">⟳ Сброс fired</button>
  </div>`;
}

function setAlertSetting(key,val){
  S.alertSettings[key]=val;
  renderSettingsAlerts(document.getElementById('smodal-body'));
}

function resetAllAlerts(){
  [...S.charts,...S.fsCharts].forEach(ch=>{
    ch.drawings.forEach(d=>{d._fired=false;d._lastAlert=0;});
  });
}

// ═══════════════════════════════════════════════════════════════
//  #11: CLEAR DRAWINGS (double-click button in chart header)
// ═══════════════════════════════════════════════════════════════
const _clearClickTs={};
function clearDrawingsSlot(slot){
  const now=Date.now();
  const last=_clearClickTs[slot]||0;
  if(now-last<600){
    const ch=S.charts[slot];
    if(ch.sym){S.symDrawings[ch.sym]=[];ch.drawings=S.symDrawings[ch.sym];}
    ch.pendingP1=null;
    rCanvas(ch);
    delete _clearClickTs[slot];
  }else{
    _clearClickTs[slot]=now;
    const btn=document.querySelectorAll('.clear-draw-btn')[slot];
    if(btn){btn.style.color='var(--yellow)';setTimeout(()=>{btn.style.color='';},500);}
  }
}

let _fsClearTs=0;
function clearFsDrawings(){
  const now=Date.now();
  if(now-_fsClearTs<600){
    // Double-click confirmed
    if(S.fsSym){S.symDrawings[S.fsSym]=[];S.fsCharts.forEach(fch=>{fch.drawings=S.symDrawings[S.fsSym];fch.pendingP1=null;rCanvas(fch);});}
    _fsClearTs=0;
    const btn=document.getElementById('fsClearDrawBtn');
    if(btn){btn.style.color='var(--red)';setTimeout(()=>{btn.style.color='';},600);}
  }else{
    _fsClearTs=now;
    const btn=document.getElementById('fsClearDrawBtn');
    if(btn){btn.style.color='var(--yellow)';setTimeout(()=>{if(Date.now()-_fsClearTs>=580)btn.style.color='';},600);}
  }
}

// ═══════════════════════════════════════════════════════════════
//  #9: COLOR GROUPS
// ═══════════════════════════════════════════════════════════════
function getSymGroup(sym){return S.symGroups[sym]||0;}
function setSymGroup(sym,g){
  if(g===0)delete S.symGroups[sym];
  else S.symGroups[sym]=g;
  renderTable();
  // update color stripe in chart headers
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
}

function buildGroupFilterBar(){
  // Add to screener panels (main + FS) above the table header
  ['shdr','fsShdr'].forEach(hdrId=>{
    const hdr=document.getElementById(hdrId);if(!hdr)return;
    let bar=hdr.parentElement.querySelector('.cg-filter-bar');
    if(!bar){bar=document.createElement('div');bar.className='cg-filter-bar';hdr.before(bar);}
    bar.innerHTML='';
    const allBtn=document.createElement('button');
    allBtn.className='cg-filter-all'+(S.activeGroupFilter===0?' active':'');
    allBtn.textContent='Все';allBtn.onclick=()=>{S.activeGroupFilter=0;renderTable();updateCharts();buildGroupFilterBar();};
    bar.appendChild(allBtn);
    for(let g=1;g<=7;g++){
      const wrap=document.createElement('div');wrap.style.cssText='position:relative;display:flex;align-items:center;';
      const btn=document.createElement('div');
      btn.className='cg-filter-btn'+(S.activeGroupFilter===g?' active':'');
      btn.style.background=GROUP_COLORS[g];
      const cnt=Object.values(S.symGroups).filter(v=>v===g).length;
      btn.title=`Группа ${g} (${cnt} монет). ЛКМ — фильтр · ПКМ — очистить группу`;
      btn.onclick=()=>{S.activeGroupFilter=S.activeGroupFilter===g?0:g;renderTable();updateCharts();buildGroupFilterBar();};
      btn.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();
        if(!cnt)return;
        if(confirm(`Очистить группу ${g} (${cnt} монет)?`)){
          Object.keys(S.symGroups).forEach(s=>{if(S.symGroups[s]===g)delete S.symGroups[s];});
          if(S.activeGroupFilter===g)S.activeGroupFilter=0;
          renderTable();updateCharts();buildGroupFilterBar();
        }
      };
      wrap.appendChild(btn);
      // Small "+" button to manage this group
      const addBtn=document.createElement('button');
      addBtn.style.cssText='background:none;border:none;color:var(--text3);cursor:pointer;font:inherit;font-size:8px;padding:0 1px;line-height:1;margin-left:-1px;';
      addBtn.title=`Управление группой ${g}`;addBtn.textContent='＋';
      addBtn.onclick=ev=>{ev.stopPropagation();openGroupManager(g);};
      wrap.appendChild(addBtn);
      bar.appendChild(wrap);
    }
    // Delete-all button
    const delAll=document.createElement('button');
    delAll.style.cssText='background:none;border:1px solid var(--border2);border-radius:3px;color:var(--text3);cursor:pointer;font:inherit;font-size:9px;padding:2px 6px;margin-left:4px;transition:all .1s;';
    delAll.textContent='✕ Все';delAll.title='Удалить все цветовые категории';
    delAll.onmouseenter=()=>delAll.style.color='var(--red)';
    delAll.onmouseleave=()=>delAll.style.color='';
    delAll.onclick=()=>{
      const total=Object.keys(S.symGroups).length;
      if(!total)return;
      if(confirm(`Удалить все цветовые категории (${total} монет)?`)){
        S.symGroups={};S.activeGroupFilter=0;
        renderTable();updateCharts();buildGroupFilterBar();
      }
    };
    bar.appendChild(delAll);
  });
}

function showGroupPicker(sym,anchorEl){
  const old=document.getElementById('cgroupPicker');if(old)old.remove();
  const r=anchorEl.getBoundingClientRect();
  const pick=document.createElement('div');
  pick.id='cgroupPicker';
  pick.style.cssText=`position:fixed;z-index:600;left:${r.left}px;top:${r.bottom+4}px;
    background:var(--bg3);border:1px solid var(--border2);border-radius:5px;
    padding:6px 8px;display:flex;gap:6px;align-items:center;
    box-shadow:0 4px 16px rgba(0,0,0,.6)`;
  // "none" option
  const none=document.createElement('div');
  none.className='cg-dot';none.style.background='var(--bg4)';none.style.borderColor='var(--border2)';
  none.title='Снять группу';none.onclick=()=>{setSymGroup(sym,0);pick.remove();};
  pick.appendChild(none);
  for(let g=1;g<=7;g++){
    const dot=document.createElement('div');dot.className='cg-dot';
    dot.style.background=GROUP_COLORS[g];
    const cur=getSymGroup(sym);
    if(cur===g)dot.style.outline='2px solid #fff';
    dot.title=`Группа ${g}`;dot.onclick=()=>{setSymGroup(sym,g);pick.remove();};
    pick.appendChild(dot);
  }
  document.body.appendChild(pick);
  setTimeout(()=>document.addEventListener('mousedown',function h(e){if(!pick.contains(e.target)){pick.remove();document.removeEventListener('mousedown',h);}},true),50);
}

function openGroupManager(g){
  const old=document.getElementById('groupMgrModal');if(old)old.remove();
  const col=GROUP_COLORS[g];
  const modal=document.createElement('div');modal.id='groupMgrModal';
  modal.style.cssText='position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
  const box=document.createElement('div');
  box.style.cssText=`background:var(--bg2);border:1px solid ${col};border-radius:6px;width:320px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.7);`;
  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);gap:8px;flex-shrink:0';
  hdr.innerHTML=`<span style="width:12px;height:12px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span>
    <span style="font-size:11px;font-weight:600;color:#fff;flex:1">Группа ${g}</span>
    <span style="font-size:9px;color:var(--text3)">Нажмите монету чтобы добавить/убрать</span>
    <button style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:0 3px" onclick="document.getElementById('groupMgrModal').remove()">✕</button>`;
  box.appendChild(hdr);
  // Search
  const srch=document.createElement('input');
  srch.placeholder='Поиск...';srch.autocomplete='off';
  srch.style.cssText='background:var(--bg3);border:none;border-bottom:1px solid var(--border);color:var(--text);font:inherit;font-size:10px;padding:6px 12px;outline:none;flex-shrink:0';
  box.appendChild(srch);
  // List
  const list=document.createElement('div');list.style.cssText='flex:1;overflow-y:auto;min-height:0;';
  const buildList=(q='')=>{
    list.innerHTML='';
    const rows=Object.values(S.mx).filter(m=>!q||m.sym.includes(q.toUpperCase())).sort((a,b)=>{
      const ag=getSymGroup(a.sym)===g?0:1,bg=getSymGroup(b.sym)===g?0:1;
      if(ag!==bg)return ag-bg;return a.sym.localeCompare(b.sym);
    });
    const frag=document.createDocumentFragment();
    for(const m of rows){
      const inGrp=getSymGroup(m.sym)===g;
      const row=document.createElement('div');
      row.style.cssText=`display:flex;align-items:center;padding:5px 12px;cursor:pointer;gap:8px;border-bottom:1px solid rgba(37,37,48,.4);transition:background .06s;${inGrp?'background:rgba(255,255,255,.04)':''}`;
      row.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${inGrp?col:'var(--bg4)'};border:1px solid ${inGrp?col:'var(--border2)'};flex-shrink:0"></span>
        <span style="font-size:10px;font-weight:500;color:${inGrp?'#fff':'var(--text2)'};flex:1">${m.sym.replace(/USDT$/,'')}</span>
        ${inGrp?`<span style="font-size:9px;color:${col}">✓ в группе</span>`:''}`;
      row.onmouseenter=()=>row.style.background=inGrp?'rgba(255,255,255,.07)':'rgba(255,255,255,.025)';
      row.onmouseleave=()=>row.style.background=inGrp?'rgba(255,255,255,.04)':'';
      row.onclick=()=>{setSymGroup(m.sym,inGrp?0:g);buildList(srch.value);buildGroupFilterBar();};
      frag.appendChild(row);
    }
    list.appendChild(frag);
  };
  buildList();
  srch.oninput=()=>buildList(srch.value);
  box.appendChild(list);modal.appendChild(box);document.body.appendChild(modal);
  modal.addEventListener('mousedown',e=>{if(e.target===modal)modal.remove();});
  srch.focus();
}

function toggleScreener(){
  S.screenerVisible=!S.screenerVisible;
  const spl=document.getElementById('spl');
  const sp=document.getElementById('spanel');
  const cp=document.getElementById('cpanel');
  if(!S.screenerVisible){
    S._savedCpW=cp.style.width||'';
    cp.style.width=''; cp.style.flex='1';
    spl.style.display='none'; sp.style.display='none';
  }else{
    cp.style.flex=''; cp.style.width=S._savedCpW||'64%';
    spl.style.display=''; sp.style.display='';
  }
  const btn=document.getElementById('toggleScrBtn');
  if(btn){btn.textContent=(S.screenerVisible?'◀':'▶')+' Список';btn.classList.toggle('on',S.screenerVisible);}
  setTimeout(()=>{S.charts.forEach((ch,i)=>{const cb=document.getElementById(`cb${i}`);if(cb&&ch.lc){try{ch.lc.resize(cb.clientWidth,cb.clientHeight);ch.canvas.width=cb.clientWidth;ch.canvas.height=cb.clientHeight;rCanvas(ch);}catch(e){}}});},60);
  if(S.screenerVisible)renderTable();
}

function toggleFsScreener(){
  S.fsScreenerVisible=!S.fsScreenerVisible;
  const spl=document.getElementById('fsSpl');
  const sp=document.getElementById('fsSpanel');
  const ca=document.getElementById('fsChartArea');
  if(!S.fsScreenerVisible){
    S._savedFsCaW=ca.style.width||'';
    ca.style.flex='1'; ca.style.width='';
    spl.style.display='none'; sp.style.display='none';
  }else{
    ca.style.flex=''; ca.style.width=S._savedFsCaW||'';
    spl.style.display=''; sp.style.display='';
  }
  const btn=document.getElementById('fsToggleScrBtn');
  if(btn){btn.textContent=(S.fsScreenerVisible?'◀':'▶')+' Список';btn.classList.toggle('on',S.fsScreenerVisible);}
  setTimeout(()=>{S.fsCharts.forEach((fch,i)=>{const el=document.getElementById(`fsChartEl${i}`);if(el&&fch.lc){try{fch.lc.resize(el.clientWidth,el.clientHeight);fch.canvas.width=el.clientWidth;fch.canvas.height=el.clientHeight;rCanvas(fch);}catch(e){}}});},60);
  if(S.fsScreenerVisible)renderTable();
}

// ═══════════════════════════════════════════════════════════════
//  SPLITTER (generic)
// ═══════════════════════════════════════════════════════════════
function dragSpl(e,splId,leftId,bodyId){
  e.preventDefault();
  const spl=document.getElementById(splId);spl.classList.add('drag');
  const left=document.getElementById(leftId);
  const body=document.getElementById(bodyId);
  const onM=(ev)=>{
    const r=body.getBoundingClientRect();
    const pct=Math.max(20,Math.min(85,((ev.clientX-r.left)/r.width)*100));
    left.style.width=pct+'%';
    [...S.charts,...S.fsCharts].forEach(ch=>{if(ch.lc)try{ch.lc.resize(ch.canvas?.width||1,ch.canvas?.height||1);}catch(er){}});
  };
  const onU=()=>{spl.classList.remove('drag');window.removeEventListener('mousemove',onM);window.removeEventListener('mouseup',onU);};
  window.addEventListener('mousemove',onM);window.addEventListener('mouseup',onU);
}

// ═══════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════
function openSettings(){
  switchSettingsTab(S.settingsTab);
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings(){document.getElementById('settingsModal').classList.remove('open');}

function switchSettingsTab(tab){
  S.settingsTab=tab;
  ['gen','ind','density','alerts'].forEach(t=>{
    const el=document.getElementById(`stab-${t}`);if(el)el.classList.toggle('on',t===tab);
  });
  const body=document.getElementById('smodal-body');
  if(tab==='gen')renderSettingsGen(body);
  else if(tab==='ind')renderSettingsInd(body);
  else if(tab==='density')renderSettingsDensity(body);
  else renderSettingsAlerts(body);
}

function tbtnHtml(id,label,onclick,active){return`<button class="tbtn${active?' on':''}" id="${id}" onclick="${onclick}">${label}</button>`;}

function renderSettingsGen(body){
  body.innerHTML=`
  <div class="smodal-row">
    <span class="smodal-lbl">Графиков на странице</span>
    <div class="smodal-btns">
      ${tbtnHtml('sg4','2×2',"setGridSize(4)",S.gridSize===4)}
      ${tbtnHtml('sg9','3×3',"setGridSize(9)",S.gridSize===9)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Цвет роста свечей</span>
    <div class="smodal-btns">
      ${tbtnHtml('scGreen','Зелёный',"setUpColor('green')",S.upColor==='#1fa891')}
      ${tbtnHtml('scWhite','Белый',"setUpColor('white')",S.upColor==='#cccccc')}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Водяной знак на графиках</span>
    <div class="smodal-btns">
      ${tbtnHtml('swOn','Вкл',"setWatermark(true)",S.wmVisible)}
      ${tbtnHtml('swOff','Выкл',"setWatermark(false)",!S.wmVisible)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Сортировка изм. по модулю</span>
    <div class="smodal-btns">
      ${tbtnHtml('sabsOn','Вкл',"setSortAbs(true)",S.sortAbs)}
      ${tbtnHtml('sabsOff','Выкл',"setSortAbs(false)",!S.sortAbs)}
    </div>
  </div>
  <div class="smodal-ver">CryptScreen v1.4 · Binance Futures</div>`;
}

function renderSettingsInd(body){
  body.innerHTML='<div style="font-size:9px;color:var(--text3);margin-bottom:8px">Перетащите для изменения порядка. Нажмите ✓ для показа/скрытия.</div>';
  const list=document.createElement('div');list.className='ind-list';list.id='indList';
  S.colOrder.forEach(id=>{
    const col=ALL_COLS.find(c=>c.id===id);if(!col)return;
    const item=document.createElement('div');
    item.className='ind-item';item.dataset.id=id;item.draggable=true;
    const visible=S.colVisible.has(id);
    item.innerHTML=`<span class="ind-handle" title="Перетащить">⣿</span>
      <span class="ind-check${visible?' checked':''}" onclick="toggleCol('${id}',this)">✓</span>
      <span class="ind-name">${col.l}</span>
      <span class="ind-sub">${col.s}</span>`;
    // Drag-and-drop
    item.addEventListener('dragstart',e=>{e.dataTransfer.setData('text',id);item.style.opacity='0.4';});
    item.addEventListener('dragend',()=>{item.style.opacity='';document.querySelectorAll('.ind-item').forEach(i=>i.classList.remove('drag-over'));});
    item.addEventListener('dragover',e=>{e.preventDefault();item.classList.add('drag-over');});
    item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
    item.addEventListener('drop',e=>{
      e.preventDefault();item.classList.remove('drag-over');
      const fromId=e.dataTransfer.getData('text');const toId=id;
      if(fromId===toId)return;
      const fi=S.colOrder.indexOf(fromId);const ti=S.colOrder.indexOf(toId);
      if(fi<0||ti<0)return;
      S.colOrder.splice(fi,1);S.colOrder.splice(ti,0,fromId);
      renderSettingsInd(body);
      rebuildScreenerHeaders();renderTable();
    });
    list.appendChild(item);
  });
  body.appendChild(list);
}

function toggleCol(id,el){
  if(S.colVisible.has(id)){if(S.colVisible.size>1)S.colVisible.delete(id);}
  else S.colVisible.add(id);
  el.classList.toggle('checked',S.colVisible.has(id));
  rebuildScreenerHeaders();renderTable();
}

function autoResizeScreener(){
  // Auto-fit screener width based on number of active columns
  const n=activeCols().length;
  const colW=54, tickW=71, splW=3, minChartPct=30;
  const idealScrW=tickW+n*colW;
  const body=document.getElementById('body');
  const cp=document.getElementById('cpanel');
  if(!body||!cp)return;
  const totalW=body.clientWidth;
  if(totalW<1)return;
  const chartW=Math.max(totalW*minChartPct/100, totalW-idealScrW-splW);
  const pct=Math.round(chartW/totalW*100);
  cp.style.width=Math.max(minChartPct,Math.min(85,pct))+'%';
  // Same for FS
  const fsMain=document.getElementById('fsMain');
  const fsCA=document.getElementById('fsChartArea');
  if(fsMain&&fsCA){
    const fw=fsMain.clientWidth;
    if(fw>1){
      const fChartW=Math.max(fw*minChartPct/100,fw-idealScrW-splW);
      const fp=Math.round(fChartW/fw*100);
      fsCA.style.flex='none';
      fsCA.style.width=Math.max(minChartPct,Math.min(85,fp))+'%';
    }
  }
}

function rebuildScreenerHeaders(){
  buildScreenerHeader(document.getElementById('shdr'));
  const fsh=document.getElementById('fsShdr');if(fsh)buildScreenerHeader(fsh);
  autoResizeScreener();
}

function setGridSize(n){
  if(S.gridSize===n)return;S.gridSize=n;
  S.charts=Array.from({length:n},()=>mkChart());
  buildChartGrid();if(S.LC)for(let i=0;i<n;i++)initLCChart(i);
  S.page=0;updateCharts();startChartWS();startChartTradesWS();
  renderSettingsGen(document.getElementById('smodal-body'));
}

function setUpColor(color){
  const upC=color==='white'?'#cccccc':'#1fa891';S.upColor=upC;
  [...S.charts,...S.fsCharts].forEach(ch=>{if(ch.cs)try{ch.cs.applyOptions({upColor:upC,borderUpColor:upC,wickUpColor:upC});}catch(e){}});
  renderSettingsGen(document.getElementById('smodal-body'));
}

function setWatermark(on){
  S.wmVisible=on;document.querySelectorAll('.chart-wm').forEach(el=>el.style.display=on?'flex':'none');
  renderSettingsGen(document.getElementById('smodal-body'));
}

function setSortAbs(on){
  S.sortAbs=on;updSortHdr();updateCharts();renderTable();
  renderSettingsGen(document.getElementById('smodal-body'));
}

// ═══════════════════════════════════════════════════════════════
//  FULLSCREEN ANALYSIS
// ═══════════════════════════════════════════════════════════════
function buildFsTfBar(barId,idx){
  const bar=document.getElementById(barId);
  Array.from(bar.children).forEach(c=>{if(!c.classList.contains('fs-label'))c.remove();});
  const activeTf=S.fsCharts[idx].tf;
  FS_TFS.forEach(tf=>{
    const b=document.createElement('button');b.className='fs-tf-btn'+(tf===activeTf?' on':'');
    b.textContent=tf;b.onclick=()=>setFsTf(idx,tf);bar.appendChild(b);
  });
}

function buildFsTfButtons(){
  const c=document.getElementById('fsTfBtns');if(!c)return;c.innerHTML='';
  ['1m','5m','15m','1h','4h','1d'].forEach(tf=>{
    const b=document.createElement('button');b.className='tbtn'+(tf===S.tf?' on':'');
    b.textContent=tf;b.dataset.tf=tf;b.onclick=()=>setTf(tf,b.id||'');c.appendChild(b);
  });
}

function initFsChart(idx){
  if(!S.LC)return;
  const fch=S.fsCharts[idx];
  fch.drawings=S.fsSym?getSymDrawings(S.fsSym):[];
  initLCChart(null,true,idx);
  const wm=document.getElementById(`fswm${idx}`);
  if(wm&&S.fsSym)wm.textContent=S.fsSym.replace(/USDT$/,'');
}

async function loadFsChart(idx){
  const fch=S.fsCharts[idx];const sym=S.fsSym;
  if(!sym||!fch.cs||!fch.lc)return;
  try{
    const raw=await fj(`${API}/klines?symbol=${sym}&interval=${fch.tf}&limit=${HIST_LIMIT}`);
    if(S.fsSym!==sym)return;
    fch.candles=parseKlines(raw);
    if(fch.candles.length){
      const lp=fch.candles[fch.candles.length-1].c;
      fch.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lp)}});
    }
    fch.cs.setData(fch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    fch.vs.setData(fch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    fch.lc.timeScale().fitContent();
    rCanvas(fch);
  }catch(e){console.warn('loadFsChart',e);}
}

async function loadMoreFsHistory(idx){
  const fch=S.fsCharts[idx];
  if(!S.fsSym||fch.histLoading||!fch.candles.length||!fch.lc)return;
  fch.histLoading=true;
  try{
    const raw=await fj(`${API}/klines?symbol=${S.fsSym}&interval=${fch.tf}&limit=${HIST_LIMIT}&endTime=${fch.candles[0].t-1}`);
    if(!raw?.length){fch.histLoading=false;return;}
    const nc=parseKlines(raw);if(!fch.cs||!fch.lc)return;
    const vr=fch.lc.timeScale().getVisibleRange();
    fch.candles=[...nc,...fch.candles];
    fch.cs.setData(fch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    fch.vs.setData(fch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    if(vr)try{fch.lc.timeScale().setVisibleRange(vr);}catch(e){}
  }catch(e){}finally{fch.histLoading=false;}
}

function openFullscreenBySym(sym){
  if(!sym)return;
  S.fsSym=sym;S.fsOpen=true;
  const fsView=document.getElementById('fsView');if(fsView)fsView.classList.add('open');
  const fsSymEl=document.getElementById('fsSym');if(fsSymEl)fsSymEl.textContent=sym.replace(/USDT$/,'');
  const t=S.tk[sym]||{};const m=S.mx[sym]||{};
  const fsPrc=document.getElementById('fsPrc');if(fsPrc)fsPrc.textContent=fmtPrice(t.p);
  const ce=document.getElementById('fsChg');
  if(ce){
    ce.textContent=t.c24!=null?(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%':'';
    ce.className='cchg '+(t.c24>=0?'p':'n');
  }
  // Extra indicators
  const fsVol=document.getElementById('fsVol');if(fsVol)fsVol.innerHTML=t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'';
  const fsTrd=document.getElementById('fsTrd');if(fsTrd)fsTrd.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const corVal=m.corr14??m.corr;
  const fsCorr=document.getElementById('fsCorr');if(fsCorr)fsCorr.innerHTML=corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'';
  // Sync top-bar status info
  const htime=document.getElementById('htime');
  const fshtime=document.getElementById('fsHtime');
  if(htime&&fshtime)fshtime.textContent=htime.textContent;
  const hstatus=document.getElementById('hstatus');
  const fshstatus=document.getElementById('fsHstatus');
  if(hstatus&&fshstatus)fshstatus.textContent=hstatus.textContent;
  const hcount=document.getElementById('hcount');
  const fshcount=document.getElementById('fsHcount');
  if(hcount&&fshcount)fshcount.textContent=hcount.textContent;
  // Build FS screener
  buildScreenerHeader(document.getElementById('fsShdr'));
  renderTable();
  // Build TF buttons
  buildFsTfButtons();
  // Build 3 FS charts
  for(let i=0;i<3;i++){buildFsTfBar(`fsTfBar${i}`,i);initFsChart(i);loadFsChart(i);}
  startFsWs();
  setTimeout(autoResizeScreener,100);
}

function openFullscreen(slot){
  const sym=S.charts[slot]?.sym;if(!sym)return;
  openFullscreenBySym(sym);
}

function closeFullscreen(){
  document.getElementById('fsView').classList.remove('open');
  S.fsOpen=false;
  if(S.fsWs){try{S.fsWs.close();}catch(e){}S.fsWs=null;}
  // Sync drawings back
  S.fsCharts.forEach(fch=>{rCanvas(fch);});
  // Refresh main grid drawings
  S.charts.forEach((ch,i)=>{if(ch.sym)ch.drawings=getSymDrawings(ch.sym);rCanvas(ch);});
}

async function setFsTf(idx,tf){
  S.fsCharts[idx].tf=tf;
  const bar=document.getElementById(`fsTfBar${idx}`);
  bar.querySelectorAll('.fs-tf-btn').forEach(b=>b.classList.toggle('on',b.textContent===tf));
  initFsChart(idx);await loadFsChart(idx);startFsWs();
}

function startFsWs(){
  if(S.fsWs){try{S.fsWs.close();}catch(e){}S.fsWs=null;}
  if(!S.fsSym||!S.fsOpen)return;
  const tfs=[...new Set(S.fsCharts.map(c=>c.tf))];
  const streams=tfs.map(tf=>`${S.fsSym.toLowerCase()}@kline_${tf}`).join('/');
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
  ws.onmessage=(evt)=>{
    const k=JSON.parse(evt.data).data?.k;if(!k)return;
    const tf=k.i;
    S.fsCharts.forEach(fch=>{
      if(fch.tf!==tf||!fch.cs)return;
      const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q};
      try{
        fch.cs.update({time:toChartTime(candle.t),open:candle.o,high:candle.h,low:candle.l,close:candle.c});
        fch.vs.update({time:toChartTime(candle.t),value:candle.qv,color:candle.c>=candle.o?'#1fa89122':'#e0404022'});
      }catch(e){}
      if(fch.candles.length&&fch.candles[fch.candles.length-1].t===candle.t)fch.candles[fch.candles.length-1]=candle;
      else if(fch.candles.length&&candle.t>fch.candles[fch.candles.length-1].t)fch.candles.push(candle);
      rCanvas(fch);
    });
  };
  ws.onclose=()=>{if(S.fsOpen)setTimeout(startFsWs,3000);};
  ws.onerror=()=>{ws.close();};
  S.fsWs=ws;
}

// ═══════════════════════════════════════════════════════════════
//  BACKGROUND KLINES
// ═══════════════════════════════════════════════════════════════
async function loadKlinesBackground(){
  try{
    const top=Object.entries(S.tk).filter(([s])=>S.syms.includes(s)).sort((a,b)=>b[1].qv-a[1].qv).map(([s])=>s);
    Object.assign(S.k5m,await batchKlines(top,'5m',300,null,null,20));
    Object.assign(S.k1h,await batchKlines(top,'1h',170,null,null,20));
    Object.assign(S.k1m,await batchKlines(top.slice(0,60),'1m',70,null,null,20));
    calcAll();renderTable();S.bgDone=true;
  }catch(e){console.warn('bg klines',e);}
}

function loadScript(url){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main(){
  try{
    ldSet('Загрузка библиотеки графиков…',5);
    for(const url of['https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js','https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js']){
      try{await loadScript(url);if(typeof LightweightCharts!=='undefined'){S.LC=LightweightCharts;break;}}catch(e){}
    }

    ldSet('Построение интерфейса…',12);
    buildChartGrid();
    buildScreenerHeader(document.getElementById('shdr'));
    updSortHdr();
    if(S.LC)for(let i=0;i<S.gridSize;i++)initLCChart(i);

    ldSet('Получение списка фьючерсов Binance…',18);
    let info;
    try{info=await fj(`${API}/exchangeInfo`);}
    catch(e){throw new Error(`Не удалось подключиться к Binance API.\n${e.message}\n\nПричины: нет интернета, Binance заблокирован, CORS.`);}
    S.syms=info.symbols.filter(s=>s.contractType==='PERPETUAL'&&s.quoteAsset==='USDT'&&s.status==='TRADING').map(s=>s.symbol).sort();

    ldSet('Загрузка 24-часовых данных…',45);
    const rawTk=await fj(`${API}/ticker/24hr`);
    for(const t of rawTk)if(t.symbol.endsWith('USDT'))
      S.tk[t.symbol]={p:+t.lastPrice,c24:+t.priceChangePercent,h24:+t.highPrice,l24:+t.lowPrice,qv:+t.quoteVolume,tr:+t.count};

    ldSet('Вычисление метрик…',70);calcAll();
    ldSet('Готово!',100);
    renderTable();updSortHdr();updTime();
    setTimeout(ldHide,150);
    updateCharts();startChartTradesWS();startScreenerWS();loadKlinesBackground();
    if(!S._timeTick)S._timeTick=setInterval(updTime,1000);
    setTimeout(autoResizeScreener,300);
  }catch(err){
    console.error('Init error:',err);ldSet('Ошибка загрузки',100);ldErr(err.message||String(err));
  }
}

// ═══════════════════════════════════════════════════════════════
//  EXPOSE GLOBALS (required for onclick= in HTML with ES modules)
// ═══════════════════════════════════════════════════════════════
window.setTf              = setTf;
window.changePage         = changePage;
window.setDrawMode        = setDrawMode;
window.toggleScreener     = toggleScreener;
window.toggleFsScreener   = toggleFsScreener;
window.openSettings       = openSettings;
window.closeSettings      = closeSettings;
window.switchSettingsTab  = switchSettingsTab;
window.toggleAlertLog     = toggleAlertLog;
window.clearFsDrawings    = clearFsDrawings;
window.closeFullscreen    = closeFullscreen;
window.openFullscreen     = openFullscreen;
window.openFullscreenBySym= openFullscreenBySym;
window.onSearch           = onSearch;
window.onVolFilter        = onVolFilter;
window.toggleDensity      = toggleDensity;
window.renderAlertLog     = renderAlertLog;
window.dragSpl            = dragSpl;
window.setGridSize        = setGridSize;
window.setUpColor         = setUpColor;
window.setWatermark       = setWatermark;
window.setSortAbs         = setSortAbs;
window.toggleCol          = toggleCol;
window.resetDensitySettings = resetDensitySettings;
window.showGroupPicker    = showGroupPicker;
window.openGroupManager   = openGroupManager;
window.setSymGroup        = setSymGroup;
window.S                  = S;
window.setDensityVisible  = setDensityVisible;
window.setAlertSetting    = setAlertSetting;
window.copyTicker         = copyTicker;
window.clearDrawingsSlot  = clearDrawingsSlot;
window.doSort             = doSort;


main();
