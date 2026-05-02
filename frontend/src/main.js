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
      <form id="authForm">
        <div class="auth-field"><label class="auth-label">EMAIL</label><input class="auth-input" id="authEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>
        <div class="auth-field"><label class="auth-label">ПАРОЛЬ</label><input class="auth-input" id="authPass" type="password" placeholder="••••••••" autocomplete="current-password"></div>
        <div class="auth-field" id="authPassConfirmField" style="display:none"><label class="auth-label">ПОДТВЕРДИТЕ ПАРОЛЬ</label><input class="auth-input" id="authPassConfirm" type="password" placeholder="••••••••"></div>
        <button class="auth-btn" id="authSubmit" type="submit">ВОЙТИ</button>
        <div class="auth-err" id="authErr"></div>
        <div class="auth-ok" id="authOk"></div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid #252530;text-align:center">
          <button class="auth-guest" id="authGuest" type="button">войти без регистрации →</button>
          <div style="font-size:9px;color:#454555;margin-top:5px">настройки не сохраняются</div>
        </div>
      </form>
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

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault()
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

  // Native form submit handles Enter key in inputs
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
const HIST_LIMIT = 500;    // свечей при подгрузке истории (листание влево)
const HIST_INITIAL = 1200; // свечей при первоначальной загрузке графика (чтобы реже ходить в API)
const HIST_CACHE_MAX = 2000;
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
  wsScreener:null, wsCharts:null, wsChartTrades:null,
  sortId:'vol24', sortDir:'desc', sortAlpha:false,
  tf:'5m', q:'', page:0, LC:null, bgDone:false,
  drawMode:null, drawIdCounter:0,
  symDrawings:{},      // drawings per symbol, shared between grid & FS
  drawUndo:{},         // sym -> [drawings snapshot...]
  drawRedo:{},         // sym -> [drawings snapshot...]
  minVol:0, minTrd:0, gridSize:9, upColor:'#1fa891', wmVisible:true, sortAbs:true,
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
  lastGroupUsed:1,    // last group assigned by user
  _savedCpW:'',_savedFsCaW:'',
  // Potential monitor — multi-preset system
  potentialPresets:[],
  _potFilterPreset:null, // id of preset being used as screener filter
  _potInterval:null,
  _potNextId:1,
  // EMA overlay settings
  emaSettings:[
    {period:9, color:'#f97316',visible:true},
    {period:21,color:'#3b82f6',visible:true},
    {period:50,color:'#a855f7',visible:false},
    {period:200,color:'#e04040',visible:false},
  ],
  emaVisible:false,
  emaCrossSound:true,
  emaSymOverrides:{},
  emaSymEnabled:{},
  emaAlertPairs:[],
  histCache:{}, // key: "${tf}:${sym}" -> candles[]
};
const DRAW_HISTORY_LIMIT=60;
let _lastDrawSym=null;

function mkChart(){
  return{lc:null,cs:null,vs:null,sym:null,candles:[],histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null};
}
function mkFsChart(tf){
  return{lc:null,cs:null,vs:null,candles:[],tf,histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null};
}

function activeCols(){
  return S.colOrder.filter(id=>S.colVisible.has(id))
    .map(id=>ALL_COLS.find(c=>c.id===id)).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
//  LOADING UI
// ═══════════════════════════════════════════════════════════════
function ldSet(t,p,d){
  const tEl=document.getElementById('ltxt');
  const pEl=document.getElementById('lfill');
  const dEl=document.getElementById('llog');
  if(t!=null&&tEl)tEl.textContent=t;
  if(p!=null&&pEl)pEl.style.width=p+'%';
  if(d!=null&&dEl)dEl.textContent=d;
}
function ldErr(m){const e=document.getElementById('lerr');if(!e)return;e.style.display='block';e.innerHTML='⚠ '+String(m).replace(/\n/g,'<br>');}
function ldHide(){
  const el=document.getElementById('ld');
  const appEl=document.getElementById('app');
  if(appEl)appEl.style.visibility='visible';
  if(!el)return;
  el.style.opacity='0';
  el.style.transition='opacity .3s';
  setTimeout(()=>el.remove(),320);
}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function setHtml(id,val){const el=document.getElementById(id);if(el)el.innerHTML=val;}

// ═══════════════════════════════════════════════════════════════
//  FETCH
// ═══════════════════════════════════════════════════════════════
// Global rate limiter — track if we're banned
let _bnBannedUntil = 0;
const _reqQueue = []; let _reqRunning = 0; const _reqMax = 3;

// ── Pan state tracking — skip heavy DOM work while user is dragging charts ──
let _anyChartPanning = false;
let _panEndTimer = null;
let _deferredRenderNeeded = false;
function _onPanStart() {
  _anyChartPanning = true;
  if (_panEndTimer) clearTimeout(_panEndTimer);
  _panEndTimer = setTimeout(() => {
    _anyChartPanning = false;
    _panEndTimer = null;
    if (_deferredRenderNeeded && !document.hidden) {
      _deferredRenderNeeded = false;
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => renderTable(), { timeout: 400 });
      } else {
        setTimeout(renderTable, 0);
      }
    }
  }, 180);
}
function _runQueue(){
  while(_reqRunning < _reqMax && _reqQueue.length){
    const {fn,res,rej} = _reqQueue.shift();
    _reqRunning++;
    fn().then(r=>{_reqRunning--;res(r);_runQueue();}).catch(e=>{_reqRunning--;rej(e);_runQueue();});
  }
}
function fj(url,timeout=15000,retries=2){
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
function parseKlines(raw){return raw.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5],tr:+k[8],qv:+k[7]}));}
async function batchKlines(syms,iv,lim,pFrom,pTo,bs=10){
  const out={};
  for(let i=0;i<syms.length;i+=bs){
    const batch=syms.slice(i,i+bs);
    const results=await Promise.allSettled(batch.map(s=>fj(`${API}/klines?symbol=${s}&interval=${iv}&limit=${lim}`).then(d=>[s,parseKlines(d)])));
    for(const r of results)if(r.status==='fulfilled')out[r.value[0]]=r.value[1];
    if(pFrom!=null)ldSet(null,pFrom+Math.round((i/syms.length)*(pTo-pFrom)),`${iv}: ${Math.min(i+bs,syms.length)}/${syms.length}`);
    if(i+bs<syms.length)await new Promise(r=>setTimeout(r,900+Math.random()*600));
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
function calcNATRFlexible(kl,n){
  if(!kl||kl.length<3)return null;
  const p=Math.min(n,Math.max(2,kl.length-1));
  return calcNATR(kl,p);
}
function calcRangeFlexible(kl,n){
  if(!kl||kl.length<2)return null;
  return calcRange(kl,Math.min(n,kl.length));
}
function calcRets(kl){if(!kl||kl.length<2)return[];const r=[];for(let i=1;i<kl.length;i++)r.push((kl[i].c-kl[i-1].c)/kl[i-1].c);return r;}
function calcCorr(a,b){if(!a||!b||a.length<5)return null;const n=Math.min(a.length,b.length);const x=a.slice(-n),y=b.slice(-n);let mx=0,my=0;for(let i=0;i<n;i++){mx+=x[i];my+=y[i];}mx/=n;my/=n;let num=0,sx=0,sy=0;for(let i=0;i<n;i++){const xa=x[i]-mx,ya=y[i]-my;num+=xa*ya;sx+=xa*xa;sy+=ya*ya;}const d=Math.sqrt(sx*sy);return d>0?num/d:null;}

function updateLiveKlineSeries(kl,intervalMs,price,nowMs){
  if(!kl||!kl.length||price==null||isNaN(price))return;
  const bucketTs=Math.floor(nowMs/intervalMs)*intervalMs;
  const last=kl[kl.length-1];
  if(!last)return;
  if(last.t===bucketTs){
    last.c=price;
    if(price>last.h)last.h=price;
    if(price<last.l)last.l=price;
    return;
  }
  if(bucketTs>last.t){
    let prev=last;
    for(let ts=last.t+intervalMs;ts<=bucketTs;ts+=intervalMs){
      const baseClose=prev.c;
      const isCurrent=ts===bucketTs;
      const next={
        t:ts,o:baseClose,h:isCurrent?Math.max(baseClose,price):baseClose,l:isCurrent?Math.min(baseClose,price):baseClose,
        c:isCurrent?price:baseClose,v:0,tr:0,qv:0
      };
      kl.push(next);
      prev=next;
    }
    const maxLen=intervalMs===60000?360:intervalMs===300000?300:170;
    if(kl.length>maxLen)kl.splice(0,kl.length-maxLen);
  }
}

function applyLiveKlineUpdate(sym,price,nowMs){
  updateLiveKlineSeries(S.k1m[sym],60000,price,nowMs);
  updateLiveKlineSeries(S.k5m[sym],300000,price,nowMs);
  updateLiveKlineSeries(S.k1h[sym],3600000,price,nowMs);
}

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
      na30:calcNATRFlexible(k1m,30),na14:calcNATRFlexible(k5,14),r1m5:calcRangeFlexible(k1m,5),
      tr5:calcRel(k5,14,'tr'),tr1h:calcRel(k1h,24,'tr'),
      vr5:calcRel(k5,14,'qv'),vr1h:calcRel(k1h,24,'qv'),
      ch7d:null,trd24:t.tr,vol24:t.qv,
      corr:S.btcR.length>10&&k5?calcCorr(calcRets(k5),S.btcR):null,
      corr14,
      v15m:k1m&&k1m.length>=2?k1m.slice(-Math.min(15,k1m.length)).reduce((a,k)=>a+k.qv,0):null,
      v60m:k1m&&k1m.length>=2?k1m.slice(-Math.min(60,k1m.length)).reduce((a,k)=>a+k.qv,0):null,
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
  let s='—';
  if(a<0.0001)s=p.toFixed(8);else if(a<0.001)s=p.toFixed(7);else if(a<0.01)s=p.toFixed(6);
  else if(a<0.1)s=p.toFixed(5);else if(a<1)s=p.toFixed(4);else if(a<100)s=p.toFixed(3);
  else if(a<10000)s=p.toFixed(2);else s=p.toFixed(0);
  return Number(s)===0?'0':s;
}
function getPriceMinMove(p){
  if(!p||p<=0)return 0.00001;if(p<0.0001)return 1e-8;if(p<0.001)return 1e-7;
  if(p<0.01)return 1e-6;if(p<0.1)return 1e-5;if(p<1)return 1e-4;
  if(p<10)return 0.001;if(p<1000)return 0.01;return 1;
}
function formatDuration(s){s=Math.abs(s);if(s<60)return Math.round(s)+'с';if(s<3600)return Math.floor(s/60)+'м '+Math.round(s%60)+'с';if(s<86400)return Math.floor(s/3600)+'ч '+Math.floor((s%3600)/60)+'м';return Math.floor(s/86400)+'д '+Math.floor((s%86400)/3600)+'ч';}

function copyTicker(sym){
  // Accept short name (ETH) or full (ETHUSDT) — always copy full USDT form
  if(!sym||sym==='—')return;
  const full=sym.endsWith('USDT')?sym:sym+'USDT';
  navigator.clipboard.writeText(full).then(()=>{
    // Brief visual toast
    let t=document.getElementById('copyToast');
    if(!t){t=document.createElement('div');t.id='copyToast';
      t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg4);border:1px solid var(--border2);color:var(--text);border-radius:4px;padding:5px 14px;font-size:10px;z-index:9999;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(t);}
    t.textContent=`📋 ${full} скопировано`;t.style.opacity='1';
    clearTimeout(t._to);t._to=setTimeout(()=>{t.style.opacity='0';},1200);
  }).catch(()=>{});
}

function showConfirmModal(text,{title='Подтверждение',okText='Подтвердить',cancelText='Отмена',danger=false,onConfirm}={}){
  const old=document.getElementById('csConfirmModal');if(old)old.remove();
  const ov=document.createElement('div');ov.id='csConfirmModal';
  ov.style.cssText='position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;';
  const box=document.createElement('div');
  box.style.cssText='width:min(420px,92vw);background:var(--bg2);border:1px solid var(--border2);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.65);padding:12px;';
  const ttl=document.createElement('div');
  ttl.style.cssText='font-size:11px;color:#fff;font-weight:600;margin-bottom:8px;';
  ttl.textContent=title;
  const msg=document.createElement('div');
  msg.style.cssText='font-size:10px;color:var(--text2);line-height:1.45;margin-bottom:12px;';
  msg.textContent=text;
  const row=document.createElement('div');
  row.style.cssText='display:flex;justify-content:flex-end;gap:8px;';
  const cancel=document.createElement('button');
  cancel.style.cssText='background:transparent;border:1px solid var(--border2);border-radius:4px;color:var(--text2);font:inherit;font-size:10px;padding:4px 10px;cursor:pointer;';
  cancel.textContent=cancelText;
  const ok=document.createElement('button');
  ok.style.cssText=`background:${danger?'#b32d2d':'var(--accent)'};border:none;border-radius:4px;color:#fff;font:inherit;font-size:10px;padding:4px 10px;cursor:pointer;`;
  ok.textContent=okText;
  cancel.onclick=()=>ov.remove();
  ok.onclick=()=>{ov.remove();if(typeof onConfirm==='function')onConfirm();};
  row.append(cancel,ok);
  box.append(ttl,msg,row);
  ov.appendChild(box);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
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
          <span class="chart-cg-dot cg-dot" id="cgd${i}" title="Цветовая группа" onclick="showChartGroupPicker(S.charts[${i}].sym,this)"></span>
          <img class="coin-icon" id="ci${i}" src="" alt="" style="display:none;width:14px;height:14px;border-radius:50%;flex-shrink:0">
          <span class="csym" id="cs${i}" title="Нажмите для копирования" onclick="copyTicker(this.textContent)" style="cursor:pointer">—</span>
          <span class="cprc" id="cp${i}"></span>
          <span class="cchg" id="cg${i}"></span>
          <span class="cvol" id="cv${i}"></span>
          <span class="ctrd" id="ctd${i}"></span>
          <span class="ccorr" id="cco${i}"></span>
          <span class="chead-gap"></span>
          <button class="fs-open-btn" onclick="openFullscreen(${i})" title="На весь экран">⤡</button>
        </div>
        <div class="cbody" id="cb${i}">
          <div class="cph"><span class="cph-n">${i+1}</span><span style="font-size:9px;color:var(--text3)">ожидание</span></div>
        </div>
      </div>`);
  }
}

// Coin icon cache and loader — multi-CDN with fallback chain
const _iconCache={};
function setCoinIcon(elId,sym){
  const rawBase=sym.replace(/USDT$/,'').toUpperCase();
  // Handle 1000X prefix tokens (e.g. 1000SHIB→SHIB, 1000BONK→BONK)
  const base=rawBase.replace(/^1000(?=[A-Z])/,'').replace(/^100(?=[A-Z])/,'');
  const el=document.getElementById(elId);if(!el)return;
  if(_iconCache[base]===false){el.style.display='none';return;}
  if(_iconCache[base]){el.src=_iconCache[base];el.style.display='';return;}
  // CDN priority list — try each in order
  const cdns=[
    `https://bin.bnbstatic.com/static/assets/logos/${base}.png`,
    `https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${base.toLowerCase()}.png`,
    `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${base.toLowerCase()}.webp`,
    rawBase!==base?`https://assets.coincap.io/assets/icons/${rawBase.toLowerCase()}@2x.png`:null,
  ].filter(Boolean);
  let idx=0;
  const tryNext=()=>{
    if(idx>=cdns.length){_iconCache[base]=false;el.style.display='none';return;}
    const url=cdns[idx++];
    const img=new Image();
    img.onload=()=>{_iconCache[base]=url;el.src=url;el.style.display='';};
    img.onerror=tryNext;
    img.src=url;
  };
  tryNext();
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
  if(ch._ro){try{ch._ro.disconnect();}catch(e){}ch._ro=null;}
  if(ch.lc){try{ch.lc.remove();}catch(e){}ch.lc=null;ch.cs=null;ch.vs=null;ch.livePriceLine=null;}
  if(ch._ab)ch._ab.abort();
  container.innerHTML='';

  const lc=S.LC.createChart(container,{
    layout:{background:{color:'#0a0a0b'},textColor:'#404050'},
    grid:{vertLines:{color:'#141418'},horzLines:{color:'#141418'}},
    crosshair:{
      vertLine:{color:'transparent',width:0,style:0,labelBackgroundColor:'#1c1c22',labelVisible:false},
      horzLine:{color:'transparent',width:0,style:0,labelBackgroundColor:'#1c1c22',labelVisible:false}
    },
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
  cs.applyOptions({lastValueVisible:false,priceLineVisible:false});
  const pls=S.LC?.PriceLineSource?.LastBar;
  if(pls!=null)cs.applyOptions({priceLineSource:pls});
  const vs=lc.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol',color:'#1fa89120'});
  // Hide the volume "last value" indicator (bottom-right) on small charts.
  // We keep histogram bars but remove any corner/scale label.
  vs.applyOptions({lastValueVisible:false,priceLineVisible:false});
  lc.priceScale('vol').applyOptions({
    scaleMargins:{top:.82,bottom:0},
    drawTicks:false,
    borderVisible:false,
    visible:false,
  });

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
  // Brush: draw on mousedown+drag
  interact.addEventListener('mousedown',e=>{
    if(e.button!==0||S.drawMode!=='brush')return;
    e.preventDefault();
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const pt=pixelToPoint(ch,x,y);if(!pt)return;
    if(ch.sym)pushDrawUndo(ch.sym);
    const stroke={id:++S.drawIdCounter,type:'brush',pts:[pt],color:_brushColor,width:_brushWidth,opacity:0.85};
    ch.drawings.push(stroke);
    _lastDrawSym=ch.sym||_lastDrawSym;
    ch._brushStroke=stroke;
  });
  interact.addEventListener('mousemove',e=>{
    if(!ch._brushStroke||S.drawMode!=='brush')return;
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const pt=pixelToPoint(ch,x,y);if(!pt)return;
    ch._brushStroke.pts.push(pt);
    rCanvas(ch);
  });
  interact.addEventListener('mouseup',e=>{
    if(e.button!==0)return;
    const hadStroke=!!ch._brushStroke;
    ch._brushStroke=null;
    if(hadStroke&&S.drawMode==='brush')setDrawMode(null);
  });
  interact.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(S.drawMode){setDrawMode(null);return;} // #10: RMB exits draw mode
    removeDrawingAtCursor(ch);
  });
  container.appendChild(interact);ch.interact=interact;

  // Container-level listeners (always active regardless of draw mode)
  const ab=new AbortController();const sig=ab.signal;ch._ab=ab;
  // Track LMB press on the chart container to flag pan state immediately
  container.addEventListener('mousedown',e=>{
    if(e.button===0&&!S.drawMode&&!ch.draggingDraw)_onPanStart();
  },{signal:sig});
  container.addEventListener('mousemove',e=>{
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    ch.hoverX=x;ch.hoverY=y;
    // During pan, skip heavy hover/hit-test work to keep drag smooth.
    if(_anyChartPanning&&!ch.draggingDraw&&!ch.ruler?.active)return;
    // Hit-testing drawings is expensive (especially brush strokes), throttle to ~30 FPS.
    if(!_anyChartPanning&&!ch.draggingDraw){
      const now=performance.now();
      if(now-ch._lastHoverCheckTs>32){
        ch.hoveredIdx=findDrawingNear(ch,x,y);
        ch._lastHoverCheckTs=now;
      }
    }
    rCanvas(ch);
  },{signal:sig});
  container.addEventListener('mouseleave',()=>{
    ch.hoveredIdx=-1;
    ch.hoverX=0;ch.hoverY=0;
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

  // Drag drawing points — cursor mode
  // For long/short: drag entry, TP, or SL line independently
  container.addEventListener('mousedown',e=>{
    if(e.button!==0||S.drawMode)return;
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const drawW=Math.max(1,container.clientWidth-PRICE_AXIS_W);
    if(x>=drawW)return; // price scale has priority for its own drag/zoom
    // Check long/short drag handles
    for(let i=0;i<ch.drawings.length;i++){
      const d=ch.drawings[i];
      if(d.type!=='long'&&d.type!=='short')continue;
      if(!d.p1||!d.p2||!ch.cs)continue;
      const{isLong,entryPrice,tpPrice,slPrice}=getTradeParams(d);
      const x1=timeToCoordX(ch,d.p1.time),x2=timeToCoordX(ch,d.p2.time);
      if(x1==null||x2==null)continue;
      const lx=Math.min(x1,x2),rx=Math.max(x1,x2);
      if(x<lx-10||x>rx+10)continue;
      const yE=ch.cs.priceToCoordinate(entryPrice);
      const yT=ch.cs.priceToCoordinate(tpPrice);
      const yS=ch.cs.priceToCoordinate(slPrice);
      if(yE==null||yT==null||yS==null)continue;
      const hitEntry=Math.abs(y-yE)<DRAW_HIT*2.2;
      const hitTp=Math.abs(y-yT)<DRAW_HIT*2.2;
      const hitSl=Math.abs(y-yS)<DRAW_HIT*2.2;
      const yTop=Math.min(yT,yS)-12,yBot=Math.max(yT,yS)+12;
      const inBounds=y>=yTop&&y<=yBot;
      const hitLeft=Math.abs(x-lx)<12&&inBounds;
      const hitRight=Math.abs(x-rx)<12&&inBounds;
      const hitBody=inBounds&&x>lx+10&&x<rx-10&&!hitEntry&&!hitTp&&!hitSl;
      if(hitEntry||hitTp||hitSl||hitLeft||hitRight||hitBody){
        e.preventDefault();e.stopPropagation();
        let tradePart='body';
        if(hitEntry)tradePart='entry';
        else if(hitTp)tradePart='tp';
        else if(hitSl)tradePart='sl';
        else if(hitLeft)tradePart='left';
        else if(hitRight)tradePart='right';
        const startPrice=ch.cs.coordinateToPrice(y);
        ch.draggingDraw={drawIdx:i,pointKey:'trade',tradePart,
          dragStartX:x,dragStartY:y,startPrice,
          orig_p1_time:d.p1.time,orig_p2_time:d.p2.time,
          orig_entry:entryPrice,orig_tp:tpPrice,orig_sl:slPrice};
        ch.draggingDraw._undoPushed=false;
        if(ch.interact)ch.interact.style.pointerEvents='auto';
        return;
      }
    }
    // Standard point drag for other drawings
    for(let i=0;i<ch.drawings.length;i++){
      const d=ch.drawings[i];
      if(d.type==='long'||d.type==='short'||d.type==='brush')continue;
      const pts=d.type==='hray'||d.type==='aray'?{p1:d.p1}:{p1:d.p1,p2:d.p2};
      for(const[key,pt]of Object.entries(pts)){
        if(!pt)continue;
        const px=timeToCoordX(ch,pt.time);
        const py=ch.cs.priceToCoordinate(pt.price);
        if(px!=null&&py!=null&&Math.hypot(x-px,y-py)<10){
          e.preventDefault();e.stopPropagation();
          ch.draggingDraw={drawIdx:i,pointKey:key};
          ch.draggingDraw._undoPushed=false;
          if(ch.interact)ch.interact.style.pointerEvents='auto';
          return;
        }
      }
    }
  },{capture:true,signal:sig});
  container.addEventListener('mousemove',e=>{
    if(!ch.draggingDraw)return;
    if(!ch.draggingDraw._undoPushed&&ch.sym){
      pushDrawUndo(ch.sym);
      ch.draggingDraw._undoPushed=true;
      _lastDrawSym=ch.sym;
    }
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const d=ch.drawings[ch.draggingDraw.drawIdx];
    if(!d)return;
    if(ch.draggingDraw.pointKey==='trade'){
      const{isLong}=getTradeParams(d);
      const part=ch.draggingDraw.tradePart;
      // Horizontal drags — use raw X coordinate
      if(part==='left'||part==='right'||part==='body'){
        const timePerPx=getTimePerPx(ch);
        const dx=x-ch.draggingDraw.dragStartX;
        const dt=Math.round(dx*timePerPx);
        const curPrice=ch.cs.coordinateToPrice(y);
        const basePrice=ch.draggingDraw.startPrice;
        const dPrice=(curPrice!=null&&basePrice!=null)?(curPrice-basePrice):0;
        if(part==='left'){
          d.p1={...d.p1,time:ch.draggingDraw.orig_p1_time+dt};
        } else if(part==='right'){
          d.p2={...d.p2,time:ch.draggingDraw.orig_p2_time+dt};
        } else { // body — move whole rect horizontally
          d.p1={...d.p1,time:ch.draggingDraw.orig_p1_time+dt,price:ch.draggingDraw.orig_entry+dPrice};
          d.p2={...d.p2,time:ch.draggingDraw.orig_p2_time+dt};
          d.slPrice=ch.draggingDraw.orig_sl+dPrice;
          d.tpPrice=ch.draggingDraw.orig_tp+dPrice;
        }
        rCanvas(ch);return;
      }
      // Vertical drags — use price coordinate
      const pt=e.ctrlKey?snapPoint(ch,x,y,true):pixelToPoint(ch,x,y);
      if(!pt)return;
      if(part==='entry'){
        const slDist=Math.abs(ch.draggingDraw.orig_sl-ch.draggingDraw.orig_entry);
        const tpDist=Math.abs(ch.draggingDraw.orig_tp-ch.draggingDraw.orig_entry);
        d.p1={...d.p1,price:pt.price};
        d.slPrice=isLong?pt.price-slDist:pt.price+slDist;
        d.tpPrice=isLong?pt.price+tpDist:pt.price-tpDist;
      } else if(part==='sl'){
        d.slPrice=pt.price; // SL moves independently
      } else if(part==='tp'){
        d.tpPrice=pt.price; // TP moves independently
      }
    } else {
      const pt=e.ctrlKey?snapPoint(ch,x,y,true):pixelToPoint(ch,x,y);
      if(!pt)return;
      d[ch.draggingDraw.pointKey]=pt;checkAlerts(ch,d);
    }
    rCanvas(ch);
  },{capture:true,signal:sig});
  container.addEventListener('mouseup',e=>{
    if(e.button!==0||!ch.draggingDraw)return;
    ch.draggingDraw=null;
    if(ch.interact&&!S.drawMode)ch.interact.style.pointerEvents='';
  },{capture:true,signal:sig});

  // Store ro on ch so initLCChart can disconnect it before lc.remove()
  if(ch._ro){try{ch._ro.disconnect();}catch(e){}}
  const ro=new ResizeObserver(()=>{
    if(!ch.lc||!ch.cs)return; // guard: chart already disposed
    try{canvas.width=container.clientWidth;canvas.height=container.clientHeight;
      ch.lc.resize(container.clientWidth,container.clientHeight);rCanvas(ch);}catch(e){}
  });
  ro.observe(container);
  ch._ro=ro;

  lc.timeScale().subscribeVisibleLogicalRangeChange(range=>{
    if(range&&range.from<HIST_TRIGGER){
      if(isFs)loadMoreFsHistory(fsIdx);else loadMoreHistory(slot);
    }
    _onPanStart();
    rCanvas(ch);
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
function cloneDrawings(drawings){
  if(typeof structuredClone==='function')return structuredClone(drawings||[]);
  return JSON.parse(JSON.stringify(drawings||[]));
}
function _getDrawStack(map,sym){
  if(!map[sym])map[sym]=[];
  return map[sym];
}
function pushDrawUndo(sym){
  if(!sym)return;
  const st=_getDrawStack(S.drawUndo,sym);
  st.push(cloneDrawings(getSymDrawings(sym)));
  if(st.length>DRAW_HISTORY_LIMIT)st.shift();
  S.drawRedo[sym]=[];
}
function applySymDrawings(sym,drawings){
  if(!sym)return;
  S.symDrawings[sym]=cloneDrawings(drawings);
  [...S.charts,...S.fsCharts].forEach(ch=>{
    const chSym=ch.sym||S.fsSym;
    if(chSym===sym){
      ch.drawings=S.symDrawings[sym];
      ch.pendingP1=null;
      rCanvas(ch);
    }
  });
}
function undoDrawings(sym){
  const st=_getDrawStack(S.drawUndo,sym);if(!st.length)return false;
  _getDrawStack(S.drawRedo,sym).push(cloneDrawings(getSymDrawings(sym)));
  applySymDrawings(sym,st.pop());
  return true;
}
function redoDrawings(sym){
  const st=_getDrawStack(S.drawRedo,sym);if(!st.length)return false;
  _getDrawStack(S.drawUndo,sym).push(cloneDrawings(getSymDrawings(sym)));
  applySymDrawings(sym,st.pop());
  return true;
}
function resolveUndoSym(){
  if(_lastDrawSym)return _lastDrawSym;
  if(S.fsOpen&&S.fsSym)return S.fsSym;
  const hov=S.charts.find(ch=>ch.hoverX>0&&ch.hoverY>0&&ch.sym);
  return hov?.sym||S.charts.find(ch=>ch.sym)?.sym||null;
}
function resolveUndoCandidates(){
  const out=[];
  const push=sym=>{if(sym&&!out.includes(sym))out.push(sym);};
  push(_lastDrawSym);
  if(S.fsOpen)push(S.fsSym);
  const hov=S.charts.find(ch=>ch.hoverX>0&&ch.hoverY>0&&ch.sym);
  push(hov?.sym);
  S.charts.forEach(ch=>push(ch.sym));
  Object.keys(S.symDrawings||{}).forEach(push);
  return out;
}

async function loadChart(slot,sym){
  const ch=S.charts[slot];
  if(!sym){
    ch.sym=null;ch.candles=[];ch.drawings=[];
    setText(`cs${slot}`,'—');
    ['cp','cg','cv','ctd','cco'].forEach(p=>setText(`${p}${slot}`,''));
    const cb=document.getElementById(`cb${slot}`);
    if(cb)cb.innerHTML=`<div class="cph"><span class="cph-n">${slot+1}</span><span style="font-size:9px;color:var(--text3)">пусто</span></div>`;
    return;
  }
  ch.sym=sym;ch.candles=[];ch.histLoading=false;
  ch.drawings=getSymDrawings(sym); // shared reference
  setText(`cs${slot}`,sym.replace(/USDT$/,''));
  setCoinIcon(`ci${slot}`,sym);
  const cb=document.getElementById(`cb${slot}`);
  if(cb)cb.innerHTML='<div class="cloading"><span class="cloading-dot"></span><span class="cloading-dot"></span><span class="cloading-dot"></span></div>';
  initLCChart(slot);
  const wm=document.getElementById(`wm${slot}`);if(wm)wm.textContent=sym.replace(/USDT$/,'');
  const cacheKey=`${S.tf}:${sym}`;
  const cached=S.histCache[cacheKey];
  if(Array.isArray(cached)&&cached.length){
    ch.candles=cached.slice(-HIST_CACHE_MAX);
    paintSlotData(slot);
    if(S.showDensity)fetchOrderBook(sym);
    return;
  }
  try{
    const raw=await fj(`${API}/klines?symbol=${sym}&interval=${S.tf}&limit=${HIST_INITIAL}`);
    if(ch.sym!==sym)return;
    ch.candles=parseKlines(raw).slice(-HIST_CACHE_MAX);
    S.histCache[cacheKey]=ch.candles.slice();
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
    syncLivePriceLabel(ch,lp,ch.candles[ch.candles.length-1].o);
    ch.lc.timeScale().fitContent();
    updateChartHeader(slot,ch.sym);
    rCanvas(ch);
  }catch(e){console.warn('paintSlotData',e);}
}

function updateChartHeader(slot,sym){
  const t=S.tk[sym]||{};const m=S.mx[sym]||{};
  // price is hidden via CSS (.cprc{display:none}) - kept for compat
  if(t.p)setText(`cp${slot}`,fmtPrice(t.p));
  const cg=document.getElementById(`cg${slot}`);
  if(t.c24!=null&&cg){cg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';cg.className='cchg '+(t.c24>=0?'p':'n');}
  setHtml(`cv${slot}`,t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'');
  setHtml(`ctd${slot}`,t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'');
  const corVal=m.corr14??m.corr;
  setHtml(`cco${slot}`,corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'');
  // Update color dot
  const dot=document.getElementById(`cgd${slot}`);
  if(dot){const grp=getSymGroup(sym);const col=GROUP_COLORS[grp]||'';dot.style.background=col||'var(--bg4)';dot.style.borderColor=col?'rgba(255,255,255,.25)':'var(--border2)';dot.style.display=sym?'':'none';}
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
    ch.candles=[...nc,...ch.candles].slice(-HIST_CACHE_MAX);
    S.histCache[`${S.tf}:${ch.sym}`]=ch.candles.slice();
    // Schedule heavy setData on idle to avoid blocking pan interaction
    const merged=ch.candles;
    const doSet=()=>{
      if(!ch.cs||!ch.lc)return;
      try{
        ch.cs.setData(merged.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
        ch.vs.setData(merged.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
        if(vr)try{ch.lc.timeScale().setVisibleRange(vr);}catch(e){}
      }catch(e){}
    };
    // Wait for pan to finish before doing expensive setData so we don't freeze a drag in progress
    const scheduleSet=()=>{
      if(_anyChartPanning){setTimeout(scheduleSet,100);return;}
      if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(doSet,{timeout:2000});}
      else{setTimeout(doSet,0);}
    };
    scheduleSet();
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
  if(d.type==='brush'){
    // Check distance to any segment of the stroke
    if(!d.pts||d.pts.length<2)return Infinity;
    let best=Infinity;
    for(let i=1;i<d.pts.length;i++){
      const ax=timeToCoordX(ch,d.pts[i-1].time),ay=ch.cs.priceToCoordinate(d.pts[i-1].price);
      const bx=timeToCoordX(ch,d.pts[i].time),by=ch.cs.priceToCoordinate(d.pts[i].price);
      if(ax==null||ay==null||bx==null||by==null)continue;
      const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
      let dist;
      if(len2===0){dist=Math.hypot(px-ax,py-ay);}
      else{const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));dist=Math.hypot(px-(ax+t*dx),py-(ay+t*dy));}
      if(dist<best)best=dist;
    }
    return best;
  }
  if(d.type==='long'||d.type==='short'){
    if(!d.p1||!d.p2||!ch.cs||!ch.lc)return Infinity;
    const{entryPrice,tpPrice,slPrice}=getTradeParams(d);
    const lrx1=timeToCoordX(ch,d.p1.time),lrx2=timeToCoordX(ch,d.p2.time);
    if(lrx1==null||lrx2==null)return Infinity;
    const yE=ch.cs.priceToCoordinate(entryPrice);
    const yT=ch.cs.priceToCoordinate(tpPrice);
    const yS=ch.cs.priceToCoordinate(slPrice);
    if(yE==null||yT==null||yS==null)return Infinity;
    const lx=Math.min(lrx1,lrx2),rx=Math.max(lrx1,lrx2);
    if(px<lx-8||px>rx+8)return Infinity;
    return Math.min(Math.abs(py-yE),Math.abs(py-yT),Math.abs(py-yS));
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
  if(idx>=0&&idx<ch.drawings.length){
    if(ch.sym)pushDrawUndo(ch.sym);
    ch.drawings.splice(idx,1);ch.hoveredIdx=-1;
    _lastDrawSym=ch.sym||_lastDrawSym;
    rCanvas(ch);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DENSITY (ORDER BOOK CLUSTERS) — Fix #1: uses real depth API
// ═══════════════════════════════════════════════════════════════
const OB_CACHE={}; // sym → {bids:[[price,usdVal],...], asks:[[...]], ts}
const OB_TTL=45000; // refresh every 45s
const _densityFirstSeen=new Map(); // key: "sym:tier:bucket" -> first seen chart time (sec)

async function fetchOrderBook(sym){
  try{
    const data=await fj(`${API}/depth?symbol=${sym}&limit=1000`,10000);
    // Convert to [price, USDT value] — Fix #1: in dollars, not coin qty
    const toUsd=levels=>levels.map(([p,q])=>[+p,+p*+q]);
    OB_CACHE[sym]={bids:toUsd(data.bids),asks:toUsd(data.asks),ts:Date.now()};
    _densityCache.delete(sym); // invalidate density cache
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
  const all=[...ob.bids,...ob.asks].sort((a,b)=>a[0]-b[0]);
  if(all.length<5)return[];
  let pMin=Infinity,pMax=-Infinity;
  if(ch.candles.length>0){
    const cp=ch.candles[ch.candles.length-1].c;
    pMin=cp*0.7;pMax=cp*1.3; // ±30% from current price — narrower, more relevant
  }else{all.forEach(([p])=>{pMin=Math.min(pMin,p);pMax=Math.max(pMax,p);});}
  const relevant=all.filter(([p])=>p>=pMin&&p<=pMax);
  if(relevant.length<3)return[];
  // Cluster: 0.3% width — slightly larger clusters = fewer, more meaningful
  const CLUSTER_PCT=0.003;
  const clusters=[];let cur=null;
  for(const[price,usdVal]of relevant){
    if(!cur||price>cur.centerPrice*(1+CLUSTER_PCT)){
      if(cur)clusters.push(cur);
      cur={centerPrice:price,totalUsd:usdVal,count:1};
    }else{
      cur.totalUsd+=usdVal;cur.count++;
      cur.centerPrice=(cur.centerPrice*(cur.count-1)+price)/cur.count;
    }
  }
  if(cur)clusters.push(cur);
  if(!clusters.length)return[];
  const vols=clusters.map(c=>c.totalUsd).sort((a,b)=>a-b);
  const mean=vols.reduce((s,v)=>s+v,0)/vols.length;
  const std=Math.sqrt(vols.reduce((s,v)=>s+(v-mean)**2,0)/vols.length);
  // Use persisted settings if available
  const ds=getDensitySettings(sym);
  const largeMult=ds.largeMult,medMult=ds.medMult,smallMult=ds.smallMult;
  const seenAt=ch.candles.length?toChartTime(ch.candles[ch.candles.length-1].t):(Math.floor(Date.now()/1000)+TZ_OFFSET_S);
  const baseStep=Math.max(1e-8,(ch.candles[ch.candles.length-1]?.c||1)*0.0015); // 0.15% bucket
  const activeKeys=new Set();
  // Only show top-tier clusters to avoid noise
  const zones=clusters
    .filter(c=>c.totalUsd>=mean+std*smallMult)
    .map(c=>({
      _bucket:Math.round(c.centerPrice/baseStep),
      price:c.centerPrice,
      vol:c.totalUsd,
      tier:c.totalUsd>=mean+std*largeMult?'large':c.totalUsd>=mean+std*medMult?'medium':'small',
    }));
  for(const z of zones){
    const key=`${sym}:${z.tier}:${z._bucket}`;
    activeKeys.add(key);
    if(!_densityFirstSeen.has(key))_densityFirstSeen.set(key,seenAt);
    z.time=_densityFirstSeen.get(key);
  }
  // Trim stale keys for this symbol so map does not grow forever.
  for(const k of _densityFirstSeen.keys()){
    if(k.startsWith(sym+':')&&!activeKeys.has(k))_densityFirstSeen.delete(k);
  }
  return zones;
}

const _densityCache=new Map(); // sym → {ts, zones}
const _DENSITY_CACHE_TTL=30000; // recompute every 30s max

function drawDensities(ctx,ch,W,H){
  if(!ch.cs||!ch.lc)return;
  const sym=ch.sym||S.fsSym;if(!sym)return;
  // Use cached zones if fresh
  const now=Date.now();
  const cached=_densityCache.get(sym);
  let zones;
  if(cached&&now-cached.ts<_DENSITY_CACHE_TTL){zones=cached.zones;}
  else{zones=computeDensities(ch);_densityCache.set(sym,{ts:now,zones});}
  if(!zones.length)return;
  ctx.save();
  for(const z of zones){
    const y=ch.cs.priceToCoordinate(z.price);if(y===null||y<0||y>H-TIME_AXIS_H)continue;
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
const TIME_AXIS_H=22;

// ── Render canvas ──────────────────────────────────────────────
// Per-chart RAF guard: only one pending rCanvas per chart at a time
function rCanvas(ch){
  if(ch._rCanvasRaf)return; // already scheduled
  ch._rCanvasRaf=true;
  requestAnimationFrame(()=>{
    ch._rCanvasRaf=false;
    _rCanvasImmediate(ch);
  });
}

function _rCanvasImmediate(ch){
  const canvas=ch.canvas;if(!canvas||!ch.lc||!ch.cs||!ch.vs)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  // #3: clip drawing area so we don't overdraw the axes (price/time)
  const drawW=Math.max(1,W-PRICE_AXIS_W);
  const drawH=Math.max(1,H-TIME_AXIS_H);
  ctx.save();ctx.beginPath();ctx.rect(0,0,drawW,drawH);ctx.clip();
  // Densities (behind drawings)
  if(S.showDensity)drawDensities(ctx,ch,drawW,drawH);
  ch.drawings.forEach((d,i)=>{
    const hov=(i===ch.hoveredIdx||ch.draggingDraw?.drawIdx===i);
    if(d.type==='hray')drawHRay(ctx,ch,d,drawW,hov);
    else if(d.type==='tline')drawTLine(ctx,ch,d,hov);
    else if(d.type==='aray')drawAlertRay(ctx,ch,d,drawW,hov);
    else if(d.type==='atline')drawAlertTLine(ctx,ch,d,hov);
    else if(d.type==='brush')drawBrushStroke(ctx,ch,d,hov);
    else if(d.type==='long'||d.type==='short')drawTradeRect(ctx,ch,d,hov);
  });
  // Draw live preview of traderect/tline pendingP1
  if(ch.pendingP1&&(S.drawMode==='tline'||S.drawMode==='atline'||S.drawMode==='long'||S.drawMode==='short')){
    const x1=timeToCoordX(ch,ch.pendingP1.time);
    const y1=ch.cs.priceToCoordinate(ch.pendingP1.price);
    if(x1!==null&&y1!==null){
      if(S.drawMode==='long'||S.drawMode==='short'){
        // Live preview of trade rect
        const previewPt=pixelToPoint(ch,ch.hoverX,ch.hoverY);
        if(previewPt){
          const isLong=S.drawMode==='long';
          const entryPrice=ch.pendingP1.price;
          const slDist=Math.abs(entryPrice-previewPt.price);
          const rr=2;
          const previewD={type:S.drawMode,p1:ch.pendingP1,p2:previewPt,
            slPrice:isLong?entryPrice-slDist:entryPrice+slDist,
            tpPrice:isLong?entryPrice+slDist*rr:entryPrice-slDist*rr};
          drawTradeRect(ctx,ch,previewD,false,true);
        }
      } else {
        ctx.save();ctx.beginPath();ctx.strokeStyle='#3b82f680';ctx.lineWidth=1;ctx.setLineDash([4,3]);
        ctx.moveTo(x1,y1);ctx.lineTo(ch.hoverX,ch.hoverY);ctx.stroke();ctx.setLineDash([]);
        ctx.beginPath();ctx.fillStyle='#3b82f6';ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    }
  }
  // EMA overlay (drawn on top of candles, below crosshair)
  drawEMAs(ctx,ch,drawW,drawH);
  if(ch.ruler)drawRuler(ctx,ch);
  ctx.restore(); // end clip
  // Custom crosshair: always visible when cursor is on chart
  // In cursor mode: free (no snap). In draw mode or Ctrl: snap to candle OHLC
  if(ch.hoverX>0&&ch.hoverX<drawW&&ch.hoverY>0&&ch.hoverY<H){
    drawCustomCrosshair(ctx,ch,drawW,H);
  }
}

// Custom crosshair drawn on canvas
// - Cursor mode, no Ctrl: free (grey, no snap)
// - Ctrl held or draw mode: snap to candle OHLC (blue dot)
function drawCustomCrosshair(ctx,ch,W,H){
  const x=ch.hoverX,y=ch.hoverY;
  const shouldSnap=_ctrlHeld;
  const snapped=shouldSnap?snapPoint(ch,x,y,true):null;
  const dx=snapped?(timeToCoordX(ch,snapped.time)??x):x;
  const dy=snapped?(ch.cs.priceToCoordinate(snapped.price)??y):y;
  const col=snapped?'#3b82f6aa':'#60607088';
  ctx.save();
  ctx.setLineDash([3,3]);
  ctx.strokeStyle=col;
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,dy);ctx.lineTo(W,dy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(dx,0);ctx.lineTo(dx,H);ctx.stroke();
  ctx.setLineDash([]);
  // Price label
  const price=snapped?snapped.price:ch.cs?.coordinateToPrice(y);
  if(price!=null){
    const label=fmtPrice(price);
    ctx.font='9px JetBrains Mono,monospace';
    const tw=ctx.measureText(label).width+8;
    ctx.fillStyle=snapped?'#3b82f6':'#252530';
    ctx.fillRect(W-tw-2,dy-9,tw+2,14);
    ctx.fillStyle=snapped?'#fff':'#80809a';
    ctx.textAlign='right';ctx.fillText(label,W-4,dy+1);ctx.textAlign='left';
  }
  if(snapped){
    ctx.beginPath();ctx.fillStyle='#3b82f6';ctx.arc(dx,dy,4,0,Math.PI*2);ctx.fill();
  }
  // Time label on X axis
  if(ch.lc){
    let time=ch.lc.timeScale().coordinateToTime(dx);
    if(!time&&ch.candles.length>=2){
      const ts=ch.lc.timeScale();
      const last=ch.candles[ch.candles.length-1];
      const prev=ch.candles[ch.candles.length-2];
      const t1=toChartTime(prev.t),t2=toChartTime(last.t);
      const x1=ts.timeToCoordinate(t1),x2=ts.timeToCoordinate(t2);
      if(x1!=null&&x2!=null&&Math.abs(x2-x1)>0){const spp=(t2-t1)/(x2-x1);time=Math.round(t2+(dx-x2)*spp);}
    }
    if(time){
      // time is in "local chart seconds" (UTC + TZ_OFFSET_S). Convert to real UTC ms for Date constructor.
      const d=new Date((time-TZ_OFFSET_S)*1000);
      const pad=n=>n.toString().padStart(2,'0');
      // Use LOCAL timezone methods (getDate/getHours) — browser converts automatically
      const tStr=`${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      ctx.save();ctx.font='9px JetBrains Mono,monospace';
      const tw=ctx.measureText(tStr).width+8;
      const lx=Math.min(Math.max(dx-tw/2,0),W-tw);
      ctx.fillStyle=snapped?'#3b82f6':'#1c1c28';
      ctx.fillRect(lx,H-14,tw,14);
      ctx.fillStyle=snapped?'#fff':'#80809a';
      ctx.textAlign='left';ctx.fillText(tStr,lx+4,H-4);ctx.restore();
    }
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

// ── Brush stroke ──────────────────────────────────────────────
function drawBrushStroke(ctx,ch,d,hov){
  if(!d.pts||d.pts.length<2)return;
  if(!ch.cs||!ch.lc)return;
  ctx.save();
  ctx.strokeStyle=d.color||'#f97316';
  ctx.lineWidth=hov?d.width*1.5+1:d.width||2;
  ctx.lineCap='round';ctx.lineJoin='round';
  if(hov){ctx.shadowColor=d.color||'#f97316';ctx.shadowBlur=6;}
  ctx.globalAlpha=d.opacity||0.85;
  ctx.beginPath();
  let started=false;
  for(const p of d.pts){
    const px=timeToCoordX(ch,p.time);
    const py=ch.cs.priceToCoordinate(p.price);
    if(px==null||py==null)continue;
    if(!started){ctx.moveTo(px,py);started=true;}
    else ctx.lineTo(px,py);
  }
  ctx.stroke();
  ctx.restore();
}

// Current brush color (shared across charts)
let _brushColor='#f97316';
let _brushWidth=2;

// ── Trade helpers ──────────────────────────────────────────────
// Returns entry/tp/sl as absolute prices (migrates old rr-based format)
function getTradeParams(d){
  const isLong=d.type==='long';
  const entryPrice=d.p1.price;
  if(d.slPrice==null){
    const slDist=Math.abs(entryPrice-(d.p2?.price??entryPrice));
    const rr=d.rr??2;
    d.slPrice=isLong?entryPrice-slDist:entryPrice+slDist;
    d.tpPrice=isLong?entryPrice+slDist*rr:entryPrice-slDist*rr;
  }
  return{isLong,entryPrice,tpPrice:d.tpPrice,slPrice:d.slPrice};
}
// Seconds per canvas pixel (for horizontal time drag)
function getTimePerPx(ch){
  if(!ch.lc||ch.candles.length<2)return 60;
  const ts=ch.lc.timeScale();
  const last=ch.candles[ch.candles.length-1];
  const prev=ch.candles[ch.candles.length-2];
  const t1=toChartTime(prev.t),t2=toChartTime(last.t);
  const x1=ts.timeToCoordinate(t1),x2=ts.timeToCoordinate(t2);
  if(x1==null||x2==null||Math.abs(x2-x1)<0.1)return 60;
  return(t2-t1)/(x2-x1);
}

// ── Trade Rectangle (Long / Short simulation) ──────────────────
function drawTradeRect(ctx,ch,d,hov,preview=false){
  if(!d.p1||!d.p2||!ch.cs||!ch.lc)return;
  const{isLong,entryPrice,tpPrice,slPrice}=getTradeParams(d);
  const x1=timeToCoordX(ch,d.p1.time);
  const x2=timeToCoordX(ch,d.p2.time);
  if(x1==null||x2==null)return;

  const yEntry=ch.cs.priceToCoordinate(entryPrice);
  const yTp=ch.cs.priceToCoordinate(tpPrice);
  const ySl=ch.cs.priceToCoordinate(slPrice);
  if(yEntry==null||yTp==null||ySl==null)return;

  const lx=Math.min(x1,x2),rx=Math.max(x1,x2);
  const tpCol='#1fa891';
  const slCol='#e04040';
  const dirCol=isLong?'#1fa891':'#e04040';
  const alpha=preview?0.4:(hov?0.7:0.5);
  const rr=Math.abs(tpPrice-entryPrice)/Math.max(0.000001,Math.abs(slPrice-entryPrice));

  ctx.save();
  // TP zone
  ctx.fillStyle=tpCol;ctx.globalAlpha=alpha*0.3;
  ctx.fillRect(lx,Math.min(yEntry,yTp),rx-lx,Math.abs(yTp-yEntry));
  // SL zone
  ctx.fillStyle=slCol;ctx.globalAlpha=alpha*0.2;
  ctx.fillRect(lx,Math.min(yEntry,ySl),rx-lx,Math.abs(ySl-yEntry));
  ctx.globalAlpha=1;

  // Entry line
  ctx.beginPath();ctx.strokeStyle='#ffffffaa';ctx.lineWidth=hov?1.5:1;
  ctx.setLineDash([4,2]);ctx.moveTo(lx,yEntry);ctx.lineTo(rx,yEntry);ctx.stroke();ctx.setLineDash([]);
  // TP line (independent)
  ctx.beginPath();ctx.strokeStyle=tpCol+'cc';ctx.lineWidth=hov?2:1.3;
  ctx.moveTo(lx,yTp);ctx.lineTo(rx,yTp);ctx.stroke();
  // SL line (independent)
  ctx.beginPath();ctx.strokeStyle=slCol+'cc';ctx.lineWidth=hov?2:1.3;
  ctx.setLineDash([3,2]);ctx.moveTo(lx,ySl);ctx.lineTo(rx,ySl);ctx.stroke();ctx.setLineDash([]);
  // Outer border
  ctx.strokeStyle=dirCol+'44';ctx.lineWidth=1;
  ctx.strokeRect(lx,Math.min(yTp,ySl),rx-lx,Math.abs(yTp-ySl));

  // Horizontal resize/move handles (show on hover)
  if(hov&&!preview){
    const handleH=Math.abs(yTp-ySl);
    const handleY=Math.min(yTp,ySl)+handleH*0.35;
    const handleH2=handleH*0.3;
    ctx.fillStyle=dirCol;ctx.globalAlpha=0.7;
    // Left handle (resize left edge)
    ctx.fillRect(lx-4,handleY,7,handleH2);
    ctx.fillRect(rx-3,handleY,7,handleH2);
    // Move indicator in centre
    ctx.globalAlpha=0.4;
    ctx.font='10px JetBrains Mono,monospace';ctx.textAlign='center';
    ctx.fillStyle='#fff';
    ctx.fillText('⟺',(lx+rx)/2,Math.min(yTp,ySl)+handleH*0.75);
    ctx.globalAlpha=1;
  }

  // Labels
  ctx.font='bold 9px JetBrains Mono,monospace';
  const pctTp=((tpPrice-entryPrice)/entryPrice*100);
  const pctSl=((slPrice-entryPrice)/entryPrice*100);
  ctx.fillStyle=tpCol;ctx.globalAlpha=0.9;ctx.textAlign='left';
  ctx.fillText(`TP ${fmtPrice(tpPrice)} (${pctTp>=0?'+':''}${pctTp.toFixed(2)}%)`,rx+4,yTp+3);
  ctx.fillStyle=slCol;
  ctx.fillText(`SL ${fmtPrice(slPrice)} (${pctSl>=0?'+':''}${pctSl.toFixed(2)}%)`,rx+4,ySl+3);
  ctx.fillStyle='#ffffff88';ctx.font='9px JetBrains Mono,monospace';
  ctx.fillText(`Вход ${fmtPrice(entryPrice)} · R:R ${rr.toFixed(1)}:1`,lx+3,yEntry-4);
  ctx.fillStyle=dirCol;ctx.font='bold 10px JetBrains Mono,monospace';ctx.textAlign='center';
  ctx.fillText(isLong?'▲ ЛОНГ':'▼ ШОРТ',(lx+rx)/2,(yTp+yEntry)/2+3);
  ctx.globalAlpha=1;ctx.restore();
}

// ── EMA overlay ────────────────────────────────────────────────
// EMA settings per chart (shared via S.emaSettings)
const EMA_DEFAULTS=[
  {period:9, color:'#f97316',visible:true},
  {period:21,color:'#3b82f6',visible:true},
  {period:50,color:'#a855f7',visible:false},
  {period:200,color:'#e04040',visible:false},
];

function calcEMA(candles,period){
  if(!candles||candles.length<period)return[];
  const k=2/(period+1);
  const result=[];
  let ema=candles.slice(0,period).reduce((s,c)=>s+c.c,0)/period;
  for(let i=period;i<candles.length;i++){
    ema=candles[i].c*k+ema*(1-k);
    result.push({t:candles[i].t,v:ema});
  }
  return result;
}

// EMA cache: keyed by "lastCandleTime_period"
const _emaCache=new Map();
function calcEMACached(candles,period){
  if(!candles||!candles.length)return[];
  // Include candle identity to avoid cache collisions between different symbols/TFs.
  const first=candles[0],last=candles[candles.length-1];
  const key=[
    period,
    candles.length,
    first.t,first.c,
    last.t,last.c,
  ].join('_');
  if(_emaCache.has(key))return _emaCache.get(key);
  const result=calcEMA(candles,period);
  // Cap cache size
  if(_emaCache.size>200)_emaCache.clear();
  _emaCache.set(key,result);
  return result;
}

function drawEMAs(ctx,ch,W,H){
  if(!ch.cs||!ch.lc||!ch.candles.length)return;
  const sym=ch.sym||S.fsSym;
  const symEnabled=!!(sym&&S.emaSymEnabled[sym]);
  if(!S.emaVisible&&!symEnabled)return;
  const settings=(sym&&S.emaSymOverrides[sym])||S.emaSettings;
  const plotH=Math.max(0,H-TIME_AXIS_H);
  ctx.save();
  ctx.beginPath();ctx.rect(0,0,W,plotH);ctx.clip();

  // Get visible time range so we only draw visible EMA points
  const vr=ch.lc.timeScale().getVisibleLogicalRange();
  // Add generous padding (50 candles each side) so lines connect smoothly at edges
  const PAD=50;
  const fromIdx=vr?Math.max(0,Math.floor(vr.from)-PAD):0;
  const toIdx=vr?Math.min(ch.candles.length-1,Math.ceil(vr.to)+PAD):ch.candles.length-1;

  for(const cfg of settings){
    if(!cfg.visible)continue;
    const vals=calcEMACached(ch.candles,cfg.period);
    if(!vals.length)continue;
    // vals has (candles.length - period) entries starting at index=period
    const period=cfg.period;
    const startVal=Math.max(0,fromIdx-period);
    const endVal=Math.min(vals.length-1,toIdx-period+10);
    ctx.beginPath();ctx.strokeStyle=cfg.color;ctx.lineWidth=1.5;ctx.globalAlpha=0.9;
    let started=false;
    let lastPy=null;
    for(let i=startVal;i<=endVal;i++){
      if(i<0||i>=vals.length)continue;
      const{t,v}=vals[i];
      const px=timeToCoordX(ch,toChartTime(t));
      const py=ch.cs.priceToCoordinate(v);
      if(px==null||py==null){started=false;continue;}
      if(px<-W||px>W*2){started=false;continue;}
      if(!started){ctx.moveTo(px,py);started=true;}
      else ctx.lineTo(px,py);
      lastPy=py;
    }
    ctx.stroke();
    // Label near right edge
    if(lastPy!=null&&lastPy>5&&lastPy<plotH-5){
      ctx.font='bold 8px JetBrains Mono,monospace';ctx.fillStyle=cfg.color;
      ctx.globalAlpha=0.95;ctx.textAlign='left';
      ctx.fillText(`EMA${cfg.period}`,4,lastPy-3);
    }
  }
  ctx.globalAlpha=1;ctx.restore();
}

// ── EMA Crossover alerts ────────────────────────────────────────
// Check last 2 EMA values: if they cross, fire alert
let _emaCrossAlerted={}; // key="sym_aXb" → last alert ts
function checkEMACrossovers(ch){
  if(!ch.candles.length)return;
  const sym=ch.sym||S.fsSym;if(!sym)return;
  const symEnabled=!!S.emaSymEnabled[sym];
  if(!S.emaVisible&&!symEnabled)return;
  const settings=(sym&&S.emaSymOverrides[sym])||S.emaSettings;
  const visible=settings.filter(c=>c.visible);
  if(visible.length<2)return;
  const enabledPairs=(S.emaAlertPairs||[]).filter(p=>p.enabled!==false);
  if(enabledPairs.length===0)return;
  const now=Date.now();
  const tf=(ch.tf||S.tf||'');
  for(let i=0;i<visible.length;i++){
    for(let j=i+1;j<visible.length;j++){
      const a=visible[i],b=visible[j];
      const pa=Math.min(a.period,b.period),pb=Math.max(a.period,b.period);
      if(!enabledPairs.some(p=>p.a===pa&&p.b===pb))continue;
      const va=calcEMACached(ch.candles,a.period);
      const vb=calcEMACached(ch.candles,b.period);
      if(va.length<2||vb.length<2)continue;
      const a1=va[va.length-1].v,a2=va[va.length-2].v;
      const b1=vb[vb.length-1].v,b2=vb[vb.length-2].v;
      const waAbove=a2>b2,isAbove=a1>b1;
      if(waAbove===isAbove)continue; // no cross
      const key=`${sym}_${tf}_${a.period}x${b.period}`;
      const lastAlert=_emaCrossAlerted[key]||0;
      if(now-lastAlert<60000)continue; // 1 min cooldown
      _emaCrossAlerted[key]=now;
      const dir=isAbove?'↑':'↓';
      const label=isAbove?'Бычье пересечение':'Медвежье пересечение';
      if(S.emaCrossSound)playAlert(isAbove?880:440);
      S.alertLog.unshift({ts:now,sym,curPrice:a1,linePrice:b1,distPct:0,
        type:'ema_cross',alertPct:0,
        presetName:`[${tf}] EMA${a.period} ${dir} EMA${b.period} — ${label}`});
      if(S.alertLog.length>50)S.alertLog.pop();
      renderAlertLog();
      const badge=document.getElementById('alertBadge');
      if(badge){badge.textContent=S.alertLog.length;badge.style.display='inline';}
    }
  }
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
    const fsBadge=document.getElementById('fsAlertBadge');
    if(fsBadge){fsBadge.textContent=S.alertLog.length;fsBadge.style.display='inline';}
  }
}

function renderAlertLog(){
  const el=document.getElementById('alertLogList');if(!el)return;
  if(!S.alertLog.length){el.innerHTML='<div style="padding:12px;color:var(--text3);font-size:9px">Алертов пока не было</div>';return;}
  el.innerHTML=S.alertLog.map(a=>{
    const t=new Date(a.ts);const pad=n=>n.toString().padStart(2,'0');
    const tStr=`${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    const symShort=a.sym.replace(/USDT$/,'');
    if(a.type==='potential'){
      return`<div class="alert-log-row" onclick="openFullscreenBySym('${a.sym}')" title="Открыть ${symShort}">
        <span style="color:var(--text3);font-size:9px">${tStr}</span>
        <span style="color:#f97316;font-size:9px;margin:0 4px">⚡</span>
        <span style="color:#fff;font-weight:600;margin-right:5px">${symShort}</span>
        <span style="color:#f97316;font-size:9px">${a.presetName||'Потенциал'}</span>
        <span style="color:var(--text3);font-size:9px;margin-left:auto">${fmtPrice(a.curPrice)}</span>
      </div>`;
    }
    if(a.type==='ema_cross'){
      return`<div class="alert-log-row" onclick="openFullscreenBySym('${a.sym}')" title="Открыть ${symShort}">
        <span style="color:var(--text3);font-size:9px">${tStr}</span>
        <span style="color:#fff;font-weight:600;margin:0 5px">${symShort}</span>
        <span style="color:#f97316;font-size:9px">${a.presetName||'EMA cross'}</span>
        <span style="color:var(--text3);font-size:9px;margin-left:auto">${fmtPrice(a.curPrice)}</span>
      </div>`;
    }
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
  rCanvas(ch);
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
    if(ch.sym)pushDrawUndo(ch.sym);
    ch.drawings.push({id:++S.drawIdCounter,type:'hray',p1:pt,color:'#e8a020'});
    _lastDrawSym=ch.sym||_lastDrawSym;
    rCanvas(ch);
    setDrawMode(null);
  }else if(S.drawMode==='tline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      if(ch.sym)pushDrawUndo(ch.sym);
      ch.drawings.push({id:++S.drawIdCounter,type:'tline',p1:ch.pendingP1,p2:pt,color:'#3b82f6'});
      _lastDrawSym=ch.sym||_lastDrawSym;
      ch.pendingP1=null;rCanvas(ch);
      setDrawMode(null);
    }
  }else if(S.drawMode==='aray'){
    const d={id:++S.drawIdCounter,type:'aray',p1:pt,alertPct:null,_lastAlert:0};
    if(ch.sym)pushDrawUndo(ch.sym);
    ch.drawings.push(d);rCanvas(ch);
    _lastDrawSym=ch.sym||_lastDrawSym;
    showAlertPctInput(ch,d,container);
    setDrawMode(null);
  }else if(S.drawMode==='atline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      const d={id:++S.drawIdCounter,type:'atline',p1:ch.pendingP1,p2:pt,alertPct:null,_lastAlert:0};
      if(ch.sym)pushDrawUndo(ch.sym);
      ch.drawings.push(d);ch.pendingP1=null;rCanvas(ch);
      _lastDrawSym=ch.sym||_lastDrawSym;
      showAlertPctInput(ch,d,container);
      setDrawMode(null);
    }
  }else if(S.drawMode==='long'||S.drawMode==='short'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      const isLong=S.drawMode==='long';
      const entryPrice=ch.pendingP1.price;
      const slDist=Math.abs(entryPrice-pt.price);
      const rr=2;
      const slPrice=isLong?entryPrice-slDist:entryPrice+slDist;
      const tpPrice=isLong?entryPrice+slDist*rr:entryPrice-slDist*rr;
      const d={id:++S.drawIdCounter,type:S.drawMode,p1:ch.pendingP1,p2:pt,slPrice,tpPrice};
      if(ch.sym)pushDrawUndo(ch.sym);
      ch.drawings.push(d);ch.pendingP1=null;rCanvas(ch);
      _lastDrawSym=ch.sym||_lastDrawSym;
      setDrawMode(null);
    }
  }
}

function setDrawMode(mode){
  S.drawMode=mode;
  [['draw-none',null],['draw-hray','hray'],['draw-tline','tline'],['draw-brush','brush'],
   ['draw-long','long'],['draw-short','short'],
   ['draw-aray','aray'],['draw-atline','atline'],
   ['fs-draw-none',null],['fs-draw-hray','hray'],['fs-draw-tline','tline'],['fs-draw-brush','brush'],
   ['fs-draw-long','long'],['fs-draw-short','short'],
   ['fs-draw-aray','aray'],['fs-draw-atline','atline']].forEach(([id,m])=>{
    const el=document.getElementById(id);if(el)el.classList.toggle('on',m===mode);
  });
  // Show/hide brush palette (main and FS toolbars)
  const bp=document.getElementById('brushPalette');
  if(bp)bp.classList.toggle('visible',mode==='brush');
  const fbp=document.getElementById('fsBrushPalette');
  if(fbp){fbp.style.display=mode==='brush'?'flex':'none';}
  const allCharts=[...S.charts,...S.fsCharts];
  allCharts.forEach(ch=>{
    ch.pendingP1=null;
    if(ch.interact)ch.interact.className='chart-interact'+(mode?' draw':'');
  });
}

function refreshEMAButtonState(){
  const hasSymEnabled=S.fsSym?!!S.emaSymEnabled[S.fsSym]:false;
  const active=S.emaVisible||hasSymEnabled;
  const btn=document.getElementById('emaBtn');if(btn)btn.classList.toggle('on',active);
  const fsBtn=document.getElementById('fsEmaBtn');if(fsBtn)fsBtn.classList.toggle('on',active);
}

function toggleEMA(){
  S.emaVisible=!S.emaVisible;
  refreshEMAButtonState();
  _emaCache.clear();
  [...S.charts,...S.fsCharts].forEach(ch=>rCanvas(ch));
}

function openEMAEditor(mode='auto'){
  const old=document.getElementById('emaEditorModal');if(old)old.remove();
  const modal=document.createElement('div');modal.id='emaEditorModal';
  modal.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
  const box=document.createElement('div');
  box.style.cssText='background:var(--bg2);border:1px solid var(--border2);border-radius:8px;width:300px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.8)';

  const EMA_COLORS=['#f97316','#3b82f6','#a855f7','#e04040','#1fa891','#eab308','#ec4899','#22c55e'];
  let _editSym=(mode==='symbol'&&S.fsSym)?S.fsSym:null; // null=global, string=per-symbol

  const render=()=>{
    const activeSym=_editSym||(S.fsSym||S.charts.find(c=>c.sym)?.sym||null);
    const targetSymEnabled=activeSym?!!S.emaSymEnabled[activeSym]:false;
    box.innerHTML=`
      <div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <span style="font-size:11px;font-weight:600;color:#fff;flex:1">EMA линии и алерты</span>
        <button style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:15px" onclick="document.getElementById('emaEditorModal').remove()">✕</button>
      </div>
      <div id="emaList" style="flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:6px;min-height:0"></div>
      <div style="padding:6px 14px;border-top:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:9px;color:var(--text3)">Показывать EMA:</label>
        <button id="emaGlobalBtn" class="tbtn${S.emaVisible?' on':''}" title="Показывать EMA на всех монетах">Все</button>
        <button id="emaSymOnlyBtn" class="tbtn${targetSymEnabled?' on':''}" title="Показывать EMA только для выбранной монеты">Текущая монета</button>
        <label style="font-size:9px;color:var(--text3)">Звук при пересечении:</label>
        <button id="emaSoundBtn" class="tbtn${S.emaCrossSound?' on':''}">${S.emaCrossSound?'● Вкл':'○ Выкл'}</button>
        <span style="flex:1"></span>
        <label style="font-size:9px;color:var(--text3)" title="Задать отдельные EMA для текущей монеты">Режим:</label>
        <button id="emaSymBtn" class="tbtn${_editSym?' on':''}">${_editSym?'📌 '+_editSym.replace(/USDT$/,''):'🌍 Глобал'}</button>
      </div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
        <div style="font-size:9px;color:var(--text3)">Алерты пересечения EMA (добавляются в Алерты с ТФ):</div>
        <div id="emaPairsList" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:6px;flex-shrink:0">
        <button class="tbtn" style="flex:1" id="addEmaBtn">＋ Добавить EMA</button>
        <button class="tbtn on" style="flex:1" onclick="document.getElementById('emaEditorModal').remove();refreshEMAButtonState()">✓ Готово</button>
      </div>`;

    const list=box.querySelector('#emaList');
    if(_editSym&&!S.emaSymOverrides[_editSym])S.emaSymOverrides[_editSym]=[...S.emaSettings.map(c=>({...c}))];
    const _activeSettings=_editSym?S.emaSymOverrides[_editSym]:S.emaSettings;
    _activeSettings.forEach((cfg,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;background:var(--bg3);border-radius:4px;padding:5px 8px;';
      // Color picker dots
      const colorPicker=document.createElement('div');colorPicker.style.cssText='display:flex;gap:3px;flex-wrap:wrap;';
      EMA_COLORS.forEach(col=>{
        const dot=document.createElement('div');
        dot.style.cssText=`width:10px;height:10px;border-radius:50%;background:${col};cursor:pointer;border:2px solid ${cfg.color===col?'#fff':'transparent'};transition:transform .1s`;
        dot.onmouseenter=()=>dot.style.transform='scale(1.3)';
        dot.onmouseleave=()=>dot.style.transform='scale(1)';
        dot.onclick=()=>{cfg.color=col;_emaCache.clear();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));render();};
        colorPicker.appendChild(dot);
      });
      row.appendChild(colorPicker);
      // Period input
      const pInp=document.createElement('input');
      pInp.type='number';pInp.min='2';pInp.max='500';pInp.value=cfg.period;
      pInp.style.cssText='width:50px;background:var(--bg4);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:10px;padding:2px 4px;text-align:center';
      pInp.onchange=()=>{const v=parseInt(pInp.value);if(v>=2){cfg.period=v;_emaCache.clear();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));}};
      row.appendChild(pInp);
      // Visible toggle
      const visBtn=document.createElement('button');
      visBtn.style.cssText=`background:${cfg.visible?cfg.color+'22':'transparent'};border:1px solid ${cfg.visible?cfg.color:'var(--border2)'};border-radius:3px;color:${cfg.visible?cfg.color:'var(--text3)'};font:inherit;font-size:9px;padding:2px 5px;cursor:pointer`;
      visBtn.textContent=cfg.visible?'Вкл':'Выкл';
      visBtn.onclick=()=>{cfg.visible=!cfg.visible;_emaCache.clear();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));render();};
      row.appendChild(visBtn);
      // Delete
      const delBtn=document.createElement('button');
      delBtn.style.cssText='background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px;margin-left:auto';
      delBtn.textContent='✕';delBtn.title='Удалить';
      delBtn.onclick=()=>{_activeSettings.splice(i,1);_emaCache.clear();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));render();};
      row.appendChild(delBtn);
      list.appendChild(row);
    });

    if(!_activeSettings.length){
      list.innerHTML='<div style="font-size:9px;color:var(--text3);text-align:center;padding:12px">Нет EMA линий. Нажми ＋ чтобы добавить.</div>';
    }
    const pairsEl=box.querySelector('#emaPairsList');
    const visiblePeriods=[...new Set(_activeSettings.filter(c=>c.visible).map(c=>c.period))].sort((a,b)=>a-b);
    if(visiblePeriods.length<2){
      pairsEl.innerHTML='<span style="font-size:9px;color:var(--text3)">Нужно минимум 2 активные EMA линии</span>';
    }else{
      pairsEl.innerHTML='';
      for(let i=0;i<visiblePeriods.length;i++){
        for(let j=i+1;j<visiblePeriods.length;j++){
          const a=visiblePeriods[i],b=visiblePeriods[j];
          let pair=S.emaAlertPairs.find(p=>p.a===a&&p.b===b);
          if(!pair){pair={a,b,enabled:false};S.emaAlertPairs.push(pair);}
          const pbtn=document.createElement('button');
          pbtn.className='tbtn'+(pair.enabled?' on':'');
          pbtn.textContent=`EMA${a}×EMA${b}`;
          pbtn.onclick=()=>{pair.enabled=!pair.enabled;render();};
          pairsEl.appendChild(pbtn);
        }
      }
    }

    box.querySelector('#addEmaBtn').onclick=()=>{
      const used=_activeSettings.map(c=>c.color);
      const col=EMA_COLORS.find(c=>!used.includes(c))||'#f97316';
      _activeSettings.push({period:9,color:col,visible:true});
      _emaCache.clear();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));render();
    };
    // Fix: bind closures via addEventListener (inline onclick can't access local `render` / `_editSym`)
    const soundBtn=box.querySelector('#emaSoundBtn');
    if(soundBtn)soundBtn.onclick=()=>{S.emaCrossSound=!S.emaCrossSound;render();};
    const gBtn=box.querySelector('#emaGlobalBtn');
    if(gBtn)gBtn.onclick=()=>{S.emaVisible=!S.emaVisible;refreshEMAButtonState();[...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));render();};
    const symOnlyBtn=box.querySelector('#emaSymOnlyBtn');
    if(symOnlyBtn)symOnlyBtn.onclick=()=>{
      const sym=activeSym;
      if(!sym)return;
      S.emaSymEnabled[sym]=!S.emaSymEnabled[sym];
      refreshEMAButtonState();
      [...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));
      render();
    };
    const symBtn=box.querySelector('#emaSymBtn');
    if(symBtn)symBtn.onclick=()=>{
      _editSym=_editSym?null:activeSym;
      render();
    };
  };
  render();
  modal.appendChild(box);document.body.appendChild(modal);
  modal.addEventListener('mousedown',e=>{if(e.target===modal)modal.remove();});
}

window.openEMAEditor=openEMAEditor;

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
  requestAnimationFrame(()=>{_rCanvasImmediate(ch);updateRulerTooltip(ch);});
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
  let bars=0,vol=0,sumTr=0;
  const rangeCl=[];
  for(const c of ch.candles)if(c.t>=tMin&&c.t<=tMax){bars++;vol+=c.qv;sumTr+=c.tr||0;rangeCl.push(c);}

  // NATR of the range
  let natrTxt='—';
  if(rangeCl.length>=2){
    const natr=calcNATR(rangeCl,rangeCl.length-1);
    if(natr!=null)natrTxt=fn(natr,2)+'%';
  }

  // Volume spike: avg vol of range candles vs avg of preceding N candles
  let vrTxt='—', trTxt='—';
  if(rangeCl.length>0&&ch.candles.length>bars){
    const idx0=ch.candles.findIndex(c=>c.t===rangeCl[0].t);
    if(idx0>0){
      const preN=Math.min(idx0,bars*3,50);
      const pre=ch.candles.slice(Math.max(0,idx0-preN),idx0);
      if(pre.length>0){
        const avgVol=pre.reduce((s,c)=>s+c.qv,0)/pre.length;
        const avgTr=pre.reduce((s,c)=>s+(c.tr||0),0)/pre.length;
        const rangeAvgVol=vol/rangeCl.length;
        const rangeAvgTr=sumTr/rangeCl.length;
        if(avgVol>0)vrTxt=fn(rangeAvgVol/avgVol,2)+'×';
        if(avgTr>0)trTxt=fn(rangeAvgTr/avgTr,2)+'×';
      }
    }
  }

  setText('rtPct',(isUp?'+':'')+pct.toFixed(3)+'%');
  document.getElementById('rtPct').style.color=col;
  setText('rtBars',`Баров: ${bars}`);
  setText('rtTime',`Время: ${formatDuration(Math.abs(r.p2.time-r.p1.time))}`);
  setText('rtVol',`Объём: ${fk(vol)} USDT`);
  // Candle-based change: open of first candle → close of last candle in range
  let cndPctTxt='—';
  if(rangeCl.length>=1){
    const openPrice=rangeCl[0].o;
    const closePrice=rangeCl[rangeCl.length-1].c;
    const cndPct=(closePrice-openPrice)/openPrice*100;
    const cndCol=cndPct>=0?'#1fa891':'#e04040';
    setText('rtNatr',`Свечи: ${cndPct>=0?'+':''}${cndPct.toFixed(3)}%`);
    document.getElementById('rtNatr').style.color=cndCol;
  } else {
    setText('rtNatr','Свечи: —');
    document.getElementById('rtNatr').style.color='';
  }
  setText('rtVr',`NATR: ${natrTxt}`);
  setText('rtTr',`ОБ*: ${vrTxt}  СД*: ${trTxt}`);
  const tw=175,th=120;
  tt.style.left=Math.min(r.mouseX+18,window.innerWidth-tw-8)+'px';
  tt.style.top=Math.max(r.mouseY-th-8,4)+'px';
  tt.style.display='block';
}

document.addEventListener('keydown',e=>{
  const tgt=e.target;
  const editable=tgt&&((tgt.tagName==='INPUT')||(tgt.tagName==='TEXTAREA')||tgt.isContentEditable);
  const mod=(e.ctrlKey||e.metaKey);
  const key=(e.key||'').toLowerCase();
  const code=(e.code||'').toLowerCase();
  const isZ=code==='keyz'||key==='z'||key==='я';
  const isY=code==='keyy'||key==='y'||key==='н';
  if(mod&&(isZ||isY)){
    const wantRedo=e.shiftKey||isY;
    const cand=resolveUndoCandidates();
    for(const sym of cand){
      const ok=wantRedo?redoDrawings(sym):undoDrawings(sym);
      if(ok){
        e.preventDefault();
        _lastDrawSym=sym;
        return;
      }
    }
  }
  if(e.key==='Escape'){
    // Fullscreen should feel like the same app: Esc closes fullscreen first
    // (but don't hijack Esc while user edits inputs or a modal is open)
    const settingsOpen=document.getElementById('settingsModal')?.classList.contains('open');
    const emaOpen=!!document.getElementById('emaEditorModal');
    if(S.fsOpen&&!editable&&!settingsOpen&&!emaOpen){
      closeFullscreen();
      e.preventDefault();
      return;
    }
    [...S.charts,...S.fsCharts].forEach((ch,i)=>{
      ch.pendingP1=null;
      if(ch.ruler){ch.ruler=null;document.getElementById('rulerTooltip').style.display='none';}
      rCanvas(ch);
    });
  }
});

// FIX 7: Reconnect WebSocket and refresh candles after tab was hidden (sleep/background)
let _lastHiddenAt=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){_lastHiddenAt=Date.now();return;}
  const hiddenMs=Date.now()-_lastHiddenAt;
  if(hiddenMs<10000)return; // ignore short switches
  console.log(`Tab back, was hidden ${Math.round(hiddenMs/1000)}s — reconnecting WS & refreshing candles`);
  // Reconnect all WS
  if(S.wsCharts){try{S.wsCharts.close();}catch(e){}}
  if(S.wsScreener){try{S.wsScreener.close();}catch(e){}}
  // Reload last candle for each visible chart to patch gap
  S.charts.forEach(async ch=>{
    if(!ch.sym||!ch.cs||!ch.candles.length)return;
    try{
      const raw=await fj(`${API}/klines?symbol=${ch.sym}&interval=${S.tf}&limit=10`);
      const nc=parseKlines(raw);
      if(!ch.cs||!ch.lc)return;
      // Append/update recent candles
      for(const c of nc){
        const last=ch.candles[ch.candles.length-1];
        if(c.t===last?.t)ch.candles[ch.candles.length-1]=c;
        else if(c.t>last?.t)ch.candles.push(c);
      }
      ch.cs.setData(ch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
      ch.vs.setData(ch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
      const lc=ch.candles[ch.candles.length-1];
      if(lc)syncLivePriceLabel(ch,lc.c,lc.o);
      rCanvas(ch);
    }catch(e){}
  });
  // Similarly for FS charts
  if(S.fsOpen)S.fsCharts.forEach(async(fch,idx)=>{
    if(!S.fsSym||!fch.cs||!fch.candles.length)return;
    try{
      const raw=await fj(`${API}/klines?symbol=${S.fsSym}&interval=${fch.tf}&limit=10`);
      const nc=parseKlines(raw);if(!fch.cs)return;
      for(const c of nc){const last=fch.candles[fch.candles.length-1];if(c.t===last?.t)fch.candles[fch.candles.length-1]=c;else if(c.t>last?.t)fch.candles.push(c);}
      fch.cs.setData(fch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
      fch.vs.setData(fch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
      const lc=fch.candles[fch.candles.length-1];
      if(lc)syncLivePriceLabel(fch,lc.c,lc.o);
      rCanvas(fch);
    }catch(e){}
  });
  setTimeout(()=>{restartChartStreams(0);startScreenerWS();},500);
});

// ═══════════════════════════════════════════════════════════════
//  WEBSOCKETS — generation counter pattern prevents reconnect storms
// ═══════════════════════════════════════════════════════════════
let _wsChartsGen=0; // increment on each start to invalidate old callbacks
let _wsScreenerGen=0;
let _wsChartsReconnectTimer=null;
let _wsScreenerReconnectTimer=null;
let _lastScreenerWsMsgAt=0;
let _lastChartWsMsgAt=0;
let _wsChartTradesGen=0;
let _wsChartTradesReconnectTimer=null;
let _chartWsRestartTimer=null;

function restartChartStreams(delayMs=350){
  if(_chartWsRestartTimer){clearTimeout(_chartWsRestartTimer);_chartWsRestartTimer=null;}
  _chartWsRestartTimer=setTimeout(()=>{
    _chartWsRestartTimer=null;
    startChartWS();
    startChartTradesWS();
  },Math.max(0,delayMs|0));
}

function startChartWS(){
  // Cancel any pending reconnect
  if(_wsChartsReconnectTimer){clearTimeout(_wsChartsReconnectTimer);_wsChartsReconnectTimer=null;}
  // Close old WS
  if(S.wsCharts){try{S.wsCharts.close();}catch(e){}S.wsCharts=null;}
  const syms=S.charts.map(c=>c.sym).filter(Boolean);if(!syms.length||!S.LC)return;
  const gen=++_wsChartsGen; // this generation's ID
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${syms.map(s=>`${s.toLowerCase()}@kline_${S.tf}`).join('/')}`);
  ws.onmessage=(evt)=>{
    _lastChartWsMsgAt=Date.now();
    if(gen!==_wsChartsGen)return; // stale, discard
    let k;
    try{k=JSON.parse(evt.data).data?.k;}catch(e){return;}
    if(!k)return;
    const symU=String(k.s||'').toUpperCase();
    const slot=S.charts.findIndex(c=>c.sym===symU);if(slot===-1)return;
    const ch=S.charts[slot];if(!ch.cs)return;
    const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q};
    if(ch.candles.length&&ch.candles[ch.candles.length-1].t===candle.t)ch.candles[ch.candles.length-1]=candle;
    else if(ch.candles.length&&candle.t>ch.candles[ch.candles.length-1].t)ch.candles.push(candle);
    ch._lastRtUpdateTs=Date.now();
    S.histCache[`${S.tf}:${symU}`]=ch.candles.slice(-HIST_CACHE_MAX);
    ch._pendingCandle=candle;
    if(!ch._rafPending){
      ch._rafPending=true;
      requestAnimationFrame(()=>{
        ch._rafPending=false;
        if(gen!==_wsChartsGen)return; // stale
        const c=ch._pendingCandle;if(!c||!ch.cs)return;
        try{
          ch.cs.update({time:toChartTime(c.t),open:c.o,high:c.h,low:c.l,close:c.c});
          ch.vs.update({time:toChartTime(c.t),value:c.qv,color:c.c>=c.o?'#1fa89122':'#e0404022'});
          syncLivePriceLabel(ch,c.c,c.o);
        }catch(e){}
        ch.drawings.forEach(d=>{if(d.type==='aray'||d.type==='atline')checkAlerts(ch,d);});
        if(S.emaVisible)checkEMACrossovers(ch);
        const cpEl=document.getElementById(`cp${slot}`);if(cpEl)cpEl.textContent=fmtPrice(c.c);
        const t=S.tk[symU];const cg=document.getElementById(`cg${slot}`);
        if(t?.c24!=null&&cg){cg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';cg.className='cchg '+(t.c24>=0?'p':'n');}
        rCanvas(ch);
      });
    }
  };
  const schedReconnect=()=>{
    if(gen!==_wsChartsGen)return; // stale, don't reconnect
    if(_wsChartsReconnectTimer)return;
    _wsChartsReconnectTimer=setTimeout(startChartWS,4000);
  };
  ws.onclose=()=>schedReconnect();
  ws.onerror=()=>{try{ws.close();}catch(e){}schedReconnect();};
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

/** Обновить текущую (формирующуюся) свечу по «живой» цене (book mid / last trade). */
function applyLivePriceToCandle(ch,tfStr,price,tsMs){
  if(!ch?.candles?.length)return false;
  if(price==null||!isFinite(price))return false;
  const ms=tfMs(tfStr);
  const ts=tsMs||Date.now();
  const bucketTs=Math.floor(ts/ms)*ms;
  let c=ch.candles[ch.candles.length-1];
  if(!c)return false;
  if(bucketTs===c.t){
    c.c=price;
    if(price>c.h)c.h=price;
    if(price<c.l)c.l=price;
  }else if(bucketTs>c.t){
    const nc={t:bucketTs,o:c.c,h:Math.max(c.c,price),l:Math.min(c.c,price),c:price,qv:c.qv||0,v:c.v||0,tr:c.tr||0};
    ch.candles.push(nc);
    if(ch.candles.length>HIST_CACHE_MAX)ch.candles.splice(0,ch.candles.length-HIST_CACHE_MAX);
  }else{
    return false;
  }
  return true;
}

function closeChartTradesSockets(){
  const cur=S.wsChartTrades;
  if(Array.isArray(cur)){
    for(const ws of cur){try{ws.close();}catch(e){}}
  }else if(cur){
    try{cur.close();}catch(e){}
  }
  S.wsChartTrades=null;
}

function syncLivePriceLabel(ch,price,openPrice=null){
  if(!ch?.cs||price==null||!isFinite(price))return;
  const isDown=(openPrice!=null&&isFinite(openPrice)&&price<openPrice);
  const lineColor=isDown?'#e04040':'#1fa891';
  // lineStyle: 2 = Dashed в LightweightCharts
  const opts={price,color:lineColor,lineVisible:true,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''};
  try{
    if(!ch.livePriceLine)ch.livePriceLine=ch.cs.createPriceLine(opts);
    else ch.livePriceLine.applyOptions(opts);
  }catch(e){}
}

function startChartTradesWS(){
  if(_wsChartTradesReconnectTimer){clearTimeout(_wsChartTradesReconnectTimer);_wsChartTradesReconnectTimer=null;}
  closeChartTradesSockets();
  const syms=S.charts.map(c=>c.sym).filter(Boolean);
  if(!syms.length||!S.LC)return;
  const gen=++_wsChartTradesGen;
  const onBookTicker=(d)=>{
    if(gen!==_wsChartTradesGen)return;
    if(!d||d.e!=='bookTicker')return;
    const symU=String(d.s||'').toUpperCase();
    if(!symU)return;
    const bid=+d.b,ask=+d.a;
    let price=null;
    if(isFinite(bid)&&isFinite(ask)&&bid>0&&ask>0)price=(bid+ask)/2;
    else if(isFinite(bid)&&bid>0)price=bid;
    else if(isFinite(ask)&&ask>0)price=ask;
    if(price==null)return;
    const slot=S.charts.findIndex(c=>c.sym===symU);
    if(slot===-1)return;
    const ch=S.charts[slot];
    if(!ch?.cs||!ch.candles?.length)return;
    const ts=+(d.T||d.E)||Date.now();
    if(!applyLivePriceToCandle(ch,S.tf,price,ts))return;
    ch._lastRtUpdateTs=Date.now();
    S.histCache[`${S.tf}:${symU}`]=ch.candles.slice(-HIST_CACHE_MAX);
    if(!ch._tradeRafPending){
      ch._tradeRafPending=true;
      requestAnimationFrame(()=>{
        ch._tradeRafPending=false;
        const lc=ch.candles[ch.candles.length-1];
        if(!lc||!ch.cs)return;
        try{
          ch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
          syncLivePriceLabel(ch,lc.c,lc.o);
          const cpEl=document.getElementById(`cp${slot}`);
          if(cpEl)cpEl.textContent=fmtPrice(lc.c);
          rCanvas(ch);
        }catch(e){}
      });
    }
  };
  const schedReconnect=()=>{
    if(gen!==_wsChartTradesGen||_wsChartTradesReconnectTimer)return;
    _wsChartTradesReconnectTimer=setTimeout(()=>{
      _wsChartTradesReconnectTimer=null;
      startChartTradesWS();
    },2500);
  };
  const streams=syms.map(sym=>`${sym.toLowerCase()}@bookTicker`).join('/');
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
  ws.onmessage=(evt)=>{
    _lastChartWsMsgAt=Date.now();
    let wrap;
    try{wrap=JSON.parse(evt.data);}catch(e){return;}
    const d=wrap?.data;
    if(!d)return;
    onBookTicker(d);
  };
  ws.onclose=()=>schedReconnect();
  ws.onerror=()=>{try{ws.close();}catch(e){}schedReconnect();};
  S.wsChartTrades=ws;
}

function startRealtimeWatchdog(){
  if(S._rtWatchdog)return;
  S._rtWatchdog=setInterval(()=>{
    const now=Date.now();
    if(!document.hidden){
      if(S.wsScreener&&_lastScreenerWsMsgAt&&now-_lastScreenerWsMsgAt>20000){
        console.warn('Screener WS stale, restarting');
        try{S.wsScreener.close();}catch(e){}
      }
      if(S.wsCharts&&_lastChartWsMsgAt&&now-_lastChartWsMsgAt>20000){
        console.warn('Chart WS stale, restarting');
        try{S.wsCharts.close();}catch(e){}
        closeChartTradesSockets();
      }
    }
    updTime();
  },1000);
  if(S._rtCandleFallback)return;
  S._rtCandleFallback=setInterval(()=>{
    if(document.hidden)return;
    const now=Date.now();
    S.charts.forEach(ch=>{
      if(!ch?.sym||!ch?.cs||!ch.candles?.length)return;
      const staleFor=now-(ch._lastRtUpdateTs||0);
      if(staleFor<5000)return;
      fj(`${API}/klines?symbol=${ch.sym}&interval=${S.tf}&limit=2`,6000,0).then(raw=>{
        if(!ch?.cs||!ch.candles?.length)return;
        const nc=parseKlines(raw);
        for(const c of nc){
          const last=ch.candles[ch.candles.length-1];
          if(c.t===last?.t)ch.candles[ch.candles.length-1]=c;
          else if(c.t>last?.t)ch.candles.push(c);
        }
        ch.candles=ch.candles.slice(-HIST_CACHE_MAX);
        const lc=ch.candles[ch.candles.length-1];
        if(!lc)return;
        ch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
        ch.vs.update({time:toChartTime(lc.t),value:lc.qv,color:lc.c>=lc.o?'#1fa89122':'#e0404022'});
        syncLivePriceLabel(ch,lc.c,lc.o);
        ch._lastRtUpdateTs=Date.now();
        S.histCache[`${S.tf}:${ch.sym}`]=ch.candles.slice();
      }).catch(()=>{});
    });
  },2500);
}

// ── Web Worker for heavy JSON parsing (Fix #7 #8: eliminates main thread freezes) ──
const _tickerWorkerCode=`
self.onmessage=function(e){
  try{
    const arr=JSON.parse(e.data);
    const out=[];
    for(let i=0;i<arr.length;i++){
      const t=arr[i];
      if(!t.s||t.s.charAt(t.s.length-4)!=='U'||t.s.charAt(t.s.length-3)!=='S'||t.s.charAt(t.s.length-2)!=='D'||t.s.charAt(t.s.length-1)!=='T')continue;
      out.push({s:t.s,c:+t.c,P:+t.P,q:+t.q,n:+t.n});
    }
    self.postMessage(out);
  }catch(err){self.postMessage([]);}
};
`;
let _tickerWorker=null;
function getTickerWorker(){
  if(_tickerWorker)return _tickerWorker;
  try{
    const blob=new Blob([_tickerWorkerCode],{type:'application/javascript'});
    const url=URL.createObjectURL(blob);
    _tickerWorker=new Worker(url);
  }catch(e){_tickerWorker=null;}
  return _tickerWorker;
}

// Throttle screener WS updates
let _wsBatchTimer=null;
let _metricsRecalcTimer=null;
const SCREENER_BATCH_MS=250;
const METRICS_RECALC_DEBOUNCE_MS=1000;

function scheduleRealtimeMetricRecalc(gen){
  if(_metricsRecalcTimer||!S.bgDone)return;
  _metricsRecalcTimer=setTimeout(()=>{
    _metricsRecalcTimer=null;
    if(gen!==_wsScreenerGen)return;
    const run=()=>{
      try{
        const nowMs=Date.now();
        for(const sym of S.syms){
          const tk=S.tk[sym];
          if(!tk||tk.p==null||isNaN(tk.p))continue;
          applyLiveKlineUpdate(sym,tk.p,nowMs);
        }
        calcAll();
        if(!document.hidden){
          if(_anyChartPanning||_scrolling)_deferredRenderNeeded=true;
          else scheduleRender();
        }
        if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
      }catch(e){
        console.warn('realtime metric recalc failed',e);
      }
    };
    if(typeof requestIdleCallback!=='undefined')requestIdleCallback(run,{timeout:1200});
    else setTimeout(run,0);
  },METRICS_RECALC_DEBOUNCE_MS);
}

function startScreenerWS(){
  if(_wsScreenerReconnectTimer){clearTimeout(_wsScreenerReconnectTimer);_wsScreenerReconnectTimer=null;}
  if(S.wsScreener){try{S.wsScreener.close();}catch(e){}S.wsScreener=null;}
  const gen=++_wsScreenerGen;
  const ws=new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
  const worker=getTickerWorker();
  let workerBusy=false;
  let queuedRaw=null;
  if(worker){
    worker.onmessage=(we)=>{
      if(gen!==_wsScreenerGen)return;
      workerBusy=false;
      _applyTickerUpdate(we.data,gen);
      if(queuedRaw!=null){
        const next=queuedRaw;
        queuedRaw=null;
        workerBusy=true;
        worker.postMessage(next);
      }
    };
    worker.onerror=()=>{
      workerBusy=false;
      queuedRaw=null;
    };
  }
  ws.onmessage=(evt)=>{
    _lastScreenerWsMsgAt=Date.now();
    if(gen!==_wsScreenerGen)return;
    const raw=evt.data;
    if(worker){
      // Keep only the newest payload while worker parses to reduce UI latency under load.
      if(workerBusy){
        queuedRaw=raw;
        return;
      }
      workerBusy=true;
      worker.postMessage(raw);
    } else {
      // Fallback: parse on next idle frame (no worker support)
      requestIdleCallback?.(()=>{
        if(gen!==_wsScreenerGen)return;
        try{_applyTickerUpdate(JSON.parse(raw).filter(t=>t.s?.endsWith('USDT')).map(t=>({s:t.s,c:+t.c,P:+t.P,q:+t.q,n:+t.n})),gen);}catch(e){}
      },{timeout:800});
    }
  };
  const schedReconnect=()=>{
    if(gen!==_wsScreenerGen)return;
    _wsScreenerReconnectTimer=setTimeout(startScreenerWS,4000);
  };
  ws.onclose=()=>schedReconnect();
  ws.onerror=()=>{try{ws.close();}catch(e){}schedReconnect();};
  S.wsScreener=ws;
}

function _applyTickerUpdate(arr,gen){
  let changed=false;
  const nowMs=Date.now();
  for(const t of arr){
    const tk=S.tk[t.s];const mx=S.mx[t.s];
    if(!tk)continue;
    if(tk.p!==t.c||tk.c24!==t.P){tk.p=t.c;tk.c24=t.P;tk.qv=t.q;tk.tr=t.n||tk.tr;changed=true;}
    if(mx){mx.price=t.c;mx.ch24=t.P;mx.vol24=t.q;mx.trd24=t.n||mx.trd24;}
    applyLiveKlineUpdate(t.s,t.c,nowMs);
  }
  if(!changed)return;
  scheduleRealtimeMetricRecalc(gen);
  if(!_wsBatchTimer){
    _wsBatchTimer=setTimeout(()=>{
      _wsBatchTimer=null;
      if(gen!==_wsScreenerGen)return;
      updTime();
      if(!document.hidden){
        if(_anyChartPanning||_scrolling){
          // User is dragging — defer heavy DOM work until after pan ends
          _deferredRenderNeeded=true;
        } else {
          // Use requestIdleCallback so table render never blocks click events
          if(typeof requestIdleCallback!=='undefined'){
            requestIdleCallback(()=>renderTable(),{timeout:400});
          } else {
            setTimeout(renderTable,0); // yield to event loop first
          }
        }
      }
      if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
      // Only run alert checks when not panning — they also touch DOM
      if(!_anyChartPanning)checkAllAlerts();
    },SCREENER_BATCH_MS);
  }
}

function updateFsHeaderValues(){
  const t=S.tk[S.fsSym];const m=S.mx[S.fsSym]||{};
  const fsp=document.getElementById('fsPrc');if(fsp)fsp.textContent=fmtPrice(t.p);
  const ce=document.getElementById('fsChg');if(ce){ce.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';ce.className='cchg '+(t.c24>=0?'p':'n');}
  const fv=document.getElementById('fsVol');if(fv)fv.innerHTML=t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'';
  const ft=document.getElementById('fsTrd');if(ft)ft.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const corVal=m.corr14??m.corr;const fc=document.getElementById('fsCorr');
  if(fc)fc.innerHTML=corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'';
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
  if(S.minVol>0)rows=rows.filter(r=>(r.vol24!=null&&r.vol24>=S.minVol*1e6)||getSymGroup(r.sym)>0);
  if(S.minTrd>0)rows=rows.filter(r=>(r.trd24!=null&&r.trd24>=S.minTrd)||getSymGroup(r.sym)>0);
  // Filters are exclusive: preset OR color group OR all
  if(S._potFilterPreset){
    const pr=S.potentialPresets.find(p=>p.id===S._potFilterPreset);
    if(pr&&Object.keys(pr.matches||{}).length>0)rows=rows.filter(r=>pr.matches[r.sym]);
    else S._potFilterPreset=null; // preset has no matches, clear filter
  }else if(S.activeGroupFilter>0){
    rows=rows.filter(r=>getSymGroup(r.sym)===S.activeGroupFilter);
  }
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
  if(!bodyEl)return;
  const inChart=new Set(S.charts.map(c=>c.sym).filter(Boolean));
  const start=S.page*S.charts.length;
  const cols=activeCols();
  const colsKey=cols.map(c=>c.id).join(',');
  if(bodyEl.dataset.colsKey!==colsKey){
    bodyEl.innerHTML='';
    bodyEl._rowMap=new Map();
    bodyEl.dataset.colsKey=colsKey;
  }
  if(!bodyEl._rowMap)bodyEl._rowMap=new Map();
  const rowMap=bodyEl._rowMap;
  const frag=document.createDocumentFragment();
  for(const m of rows){
    let row=rowMap.get(m.sym);
    if(!row){
      row=buildScreenerRow(m,cols);
      rowMap.set(m.sym,row);
    }
    updateScreenerRow(row,m,cols,inChart);
    frag.appendChild(row);
  }
  bodyEl.replaceChildren(frag);
  for(const sym of Array.from(rowMap.keys())){
    if(!(sym in S.mx))rowMap.delete(sym);
  }
}

function buildScreenerRow(m,cols){
  const row=document.createElement('div');
  row.className='srow';
  row.onclick=()=>openFullscreenBySym(m.sym);
  row._sym=m.sym;
  const rt=document.createElement('div');rt.className='rtick';
  const gdot=document.createElement('span');gdot.className='cg-dot';
  gdot.title='Цветовая группа';
  gdot.onclick=ev=>{ev.stopPropagation();showGroupPicker(m.sym,gdot);};
  rt.appendChild(gdot);
  const nameSpan=document.createElement('span');nameSpan.className='tname';nameSpan.textContent=m.sym.replace(/USDT$/,'');
  nameSpan.title='Нажмите для копирования';nameSpan.style.cursor='pointer';
  nameSpan.onclick=ev=>{ev.stopPropagation();copyTicker(m.sym.replace(/USDT$/,''));openFullscreenBySym(m.sym);};
  rt.appendChild(nameSpan);
  row._gdot=gdot;row._name=nameSpan;row.appendChild(rt);
  const rg=document.createElement('div');rg.className='rmgrid';
  const cellArr=[];
  for(const c of cols){
    const cell=document.createElement('div');
    cell.className='mc d';
    rg.appendChild(cell);cellArr.push(cell);
  }
  row._cells=cellArr;row._rg=rg;row.appendChild(rg);
  return row;
}

function updateScreenerRow(row,m,cols,inChart){
  const grp=getSymGroup(m.sym);
  const grpCol=GROUP_COLORS[grp]||'';
  const newCls='srow'+(inChart.has(m.sym)?' inchart':'')+(S.fsOpen&&S.fsSym===m.sym?' infullscreen':'');
  if(row.className!==newCls)row.className=newCls;
  row._sym=m.sym;
  const gdot=row._gdot;
  if(gdot){
    const nc=grpCol||'var(--bg4)';
    const nb=grpCol?'rgba(255,255,255,.2)':'var(--border2)';
    if(gdot.style.background!==nc)gdot.style.background=nc;
    if(gdot.style.borderColor!==nb)gdot.style.borderColor=nb;
    gdot.onclick=ev=>{ev.stopPropagation();showGroupPicker(m.sym,gdot);};
  }
  const nameTxt=m.sym.replace(/USDT$/,'');
  if(row._name&&row._name.textContent!==nameTxt)row._name.textContent=nameTxt;
  if(row._name){
    row._name.onclick=ev=>{ev.stopPropagation();copyTicker(nameTxt);openFullscreenBySym(m.sym);};
  }
  if(row._stripe){row._stripe.remove();row._stripe=null;}
  const rt=row.firstChild;
  if(rt)rt.style.paddingLeft='9px';
  if(row._cells.length!==cols.length){
    row._rg.innerHTML='';
    row._cells=[];
    for(const c of cols){
      const cell=document.createElement('div');
      cell.className='mc d';
      row._rg.appendChild(cell);
      row._cells.push(cell);
    }
  }
  cols.forEach((c,ci)=>{
    const cell=row._cells[ci];if(!cell)return;
    const v=m[c.id];
    const newTxt=fv(v,c.id);
    const newCls='mc '+fc(v,c.id)+' '+fh(v,c.id);
    if(cell.textContent!==newTxt)cell.textContent=newTxt;
    if(cell.className!==newCls)cell.className=newCls;
  });
}

let _rt=null;
// Throttle renders: use rAF-based idle scheduling instead of fixed timeout
const _schedFn = typeof requestIdleCallback !== 'undefined'
  ? (cb) => requestIdleCallback(cb, {timeout:400})
  : (cb) => requestAnimationFrame(cb);
let _renderScheduled=false;
function scheduleRender(){
  if(_renderScheduled)return;
  _renderScheduled=true;
  _schedFn(()=>{
    _renderScheduled=false;
    if(_anyChartPanning){_deferredRenderNeeded=true;return;} // defer until pan ends
    if(!_scrolling&&!document.hidden)renderTable();
  });
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
  setText('hcount',countTxt);
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
  setText('pgTotal',`(${total} монет)`);
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
  document.querySelectorAll('#toolbar .tbtn').forEach(b=>{
    if(['tf1m','tf5m','tf15m','tf1h','tf4h','tf1d'].includes(b.id)||b.dataset.tf)b.classList.remove('on');
  });
  document.getElementById(btnId)?.classList.add('on');
  document.querySelectorAll(`[data-tf="${tf}"]`).forEach(b=>b.classList.add('on'));
  const ctf=document.getElementById('ctf');if(ctf)ctf.textContent=tf;
  const syms=S.charts.map(c=>c.sym);
  S.charts.forEach(c=>{c.sym=null;c.candles=[];});
  syms.forEach((sym,i)=>{if(sym)loadChart(i,sym);});
  restartChartStreams(700);
}

function onSearch(q){S.q=q;S.page=0;updateCharts();renderTable();}

function onVolFilter(val){
  S.minVol=+val*10;
  const disp=S.minVol===0?'0':`${S.minVol}M`;
  ['volVal','fsVolVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=disp;});
  ['volSlider','fsVolSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=val;});
  S.page=0;updateCharts();renderTable();
}
function onTrdFilter(val){
  // 1 step = 50k trades/day. Range 0..2M by default.
  S.minTrd=+val*50000;
  const disp=S.minTrd===0?'0':(S.minTrd>=1e6?`${(S.minTrd/1e6).toFixed(1)}M`:`${Math.round(S.minTrd/1000)}K`);
  ['trdVal','fsTrdVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=disp;});
  ['trdSlider','fsTrdSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=val;});
  S.page=0;updateCharts();renderTable();
}

function updTime(){
  const d=new Date();const pad=n=>n.toString().padStart(2,'0');
  const timeStr=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ht=document.getElementById('htime');if(ht)ht.textContent=timeStr;
  const hs=document.getElementById('hstatus');if(hs)hs.textContent='Онлайн';
}

function updateToggleScrBtn(){
  const btn=document.getElementById('toggleScrBtn');
  if(!btn)return;
  const on=S.fsOpen?S.fsScreenerVisible:S.screenerVisible;
  btn.textContent=(on?'◀':'▶')+' Список';
  btn.classList.toggle('on',on);
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
  if(changed)restartChartStreams(600);
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
  if(!S.densitySettings[sym])S.densitySettings[sym]={largeMult:3.5,medMult:2.2,smallMult:1.5};
  return S.densitySettings[sym];
}

function renderSettingsDensity(body){
  const sym=S.fsSym||S.charts.find(c=>c.sym)?.sym||'';
  const ds=getDensitySettings(sym);
  body.dataset.densitySym=sym; // store so inputs always reference correct sym
  body.innerHTML=`
  <div style="font-size:9px;color:var(--text3);margin-bottom:8px;line-height:1.6">
    Плотности — горизонтальные лучи на уровнях с крупными стенками.<br>
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
    <span class="smodal-lbl">Крупная (×σ)</span>
    <input id="dLarge" type="number" step="0.1" min="0.5" max="20" value="${ds.largeMult}"
      oninput="setDensityMult(document.getElementById('smodal-body').dataset.densitySym,'largeMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Средняя (×σ)</span>
    <input id="dMed" type="number" step="0.1" min="0.5" max="20" value="${ds.medMult}"
      oninput="setDensityMult(document.getElementById('smodal-body').dataset.densitySym,'medMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Малая (×σ)</span>
    <input id="dSmall" type="number" step="0.1" min="0.1" max="20" value="${ds.smallMult}"
      oninput="setDensityMult(document.getElementById('smodal-body').dataset.densitySym,'smallMult',this.value)"
      style="width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:10px;padding:2px 5px;text-align:right">
  </div>
  <div style="margin-top:8px">
    <button class="tbtn" onclick="resetDensitySettings(document.getElementById('smodal-body').dataset.densitySym)">⟳ Сброс</button>
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
  const v=parseFloat(val);
  if(isNaN(v)||v<0.1)return; // ignore invalid
  getDensitySettings(sym)[key]=v;
  _densityCache.delete(sym); // MUST invalidate cache so new value takes effect
  [...S.charts,...S.fsCharts].forEach(ch=>{if((ch.sym||S.fsSym)===sym)rCanvas(ch);});
}

function resetDensitySettings(sym){
  S.densitySettings[sym]={largeMult:3.5,medMult:2.2,smallMult:1.5};
  _densityCache.delete(sym);
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
    if(ch.sym&&ch.drawings.length){
      pushDrawUndo(ch.sym);
      applySymDrawings(ch.sym,[]);
      _lastDrawSym=ch.sym;
    }
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
    if(S.fsSym&&getSymDrawings(S.fsSym).length){
      pushDrawUndo(S.fsSym);
      applySymDrawings(S.fsSym,[]);
      _lastDrawSym=S.fsSym;
    }
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
let _groupUiRaf=0;
function scheduleGroupUiRefresh(){
  if(_groupUiRaf)return;
  _groupUiRaf=requestAnimationFrame(()=>{
    _groupUiRaf=0;
    renderTable();
    updateCharts();
    buildGroupFilterBar();
  });
}
function setSymGroup(sym,g){
  if(g===0)delete S.symGroups[sym];
  else S.symGroups[sym]=g;
  // update color stripe in chart headers immediately
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
  scheduleGroupUiRefresh();
}

function buildGroupFilterBar(){
  // Add to screener panels (main + FS) above the table header
  ['shdr','fsShdr'].forEach(hdrId=>{
    const hdr=document.getElementById(hdrId);if(!hdr)return;
    let bar=hdr.parentElement.querySelector('.cg-filter-bar');
    if(!bar){bar=document.createElement('div');bar.className='cg-filter-bar';hdr.before(bar);}
    bar.innerHTML='';
    bar.style.display='flex';bar.style.alignItems='center';bar.style.gap='6px';bar.style.flexWrap='wrap';

    const grpSec=document.createElement('div');
    grpSec.style.cssText='display:flex;align-items:center;gap:4px;padding:3px 5px;border:1px solid var(--border2);border-radius:6px;background:rgba(255,255,255,.02);';
    const allBtn=document.createElement('button');
    allBtn.className='cg-filter-all'+(S.activeGroupFilter===0&&!S._potFilterPreset?' active':'');
    allBtn.textContent='Все';
    allBtn.onclick=()=>{S.activeGroupFilter=0;S._potFilterPreset=null;scheduleGroupUiRefresh();};
    grpSec.appendChild(allBtn);
    for(let g=1;g<=7;g++){
      const cnt=Object.values(S.symGroups).filter(v=>v===g).length;
      // Hide group button if no coins assigned AND it's not the active filter
      if(cnt===0&&S.activeGroupFilter!==g)continue;
      const wrap=document.createElement('div');wrap.style.cssText='position:relative;display:flex;align-items:center;';
      const btn=document.createElement('div');
      btn.className='cg-filter-btn'+(S.activeGroupFilter===g?' active':'');
      btn.style.background=GROUP_COLORS[g];
      btn.title=`Группа ${g} (${cnt} монет). ЛКМ — фильтр · ПКМ — очистить группу`;
      btn.onclick=()=>{
        const next=S.activeGroupFilter===g?0:g;
        S.activeGroupFilter=next;
        S._potFilterPreset=null;
        scheduleGroupUiRefresh();
      };
      btn.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();
        if(!cnt)return;
        showConfirmModal(`Очистить группу ${g} (${cnt} монет)?`,{
          title:'Очистка группы',
          okText:'Очистить',
          danger:true,
          onConfirm:()=>{
            Object.keys(S.symGroups).forEach(s=>{if(S.symGroups[s]===g)delete S.symGroups[s];});
            if(S.activeGroupFilter===g)S.activeGroupFilter=0;
            scheduleGroupUiRefresh();
          }
        });
      };
      wrap.appendChild(btn);
      // Small "+" button to manage this group
      const addBtn=document.createElement('button');
      addBtn.style.cssText='background:none;border:none;color:var(--text3);cursor:pointer;font:inherit;font-size:8px;padding:0 1px;line-height:1;margin-left:-1px;';
      addBtn.title=`Управление группой ${g}`;addBtn.textContent='＋';
      addBtn.onclick=ev=>{ev.stopPropagation();openGroupManager(g);};
      wrap.appendChild(addBtn);
      grpSec.appendChild(wrap);
    }
    bar.appendChild(grpSec);

    // Potential preset tabs — appear as filter tabs alongside color groups
    const potSec=document.createElement('div');
    potSec.style.cssText='display:flex;align-items:center;gap:4px;padding:3px 5px;border:1px solid #5a401f;border-radius:6px;background:rgba(249,115,22,.06);';
    const potLbl=document.createElement('span');
    potLbl.textContent='Потенциал';
    potLbl.style.cssText='font-size:9px;color:#f6b07d;padding:0 3px;';
    potSec.appendChild(potLbl);
    S.potentialPresets.forEach(pr=>{
      const cnt=Object.keys(pr.matches||{}).length;
      const tab=document.createElement('button');
      tab.style.cssText=`background:${pr.enabled?(cnt?'rgba(249,115,22,.18)':'rgba(255,255,255,.05)'):'transparent'};border:1px solid ${pr.enabled?'#f97316':'var(--border2)'};border-radius:4px;color:${pr.enabled?(cnt?'#f97316':'var(--text2)'):'var(--text3)'};cursor:pointer;font:inherit;font-size:9px;padding:2px 7px;transition:all .1s;white-space:nowrap;display:flex;align-items:center;gap:3px;`;
      tab.innerHTML=`⚡ ${pr.name}${cnt?` <span style="background:#f97316;color:#fff;border-radius:8px;padding:0 4px;font-size:8px;line-height:1.5">${cnt}</span>`:''}`;
      tab.title=`${pr.name}: ${cnt} монет. ЛКМ — фильтр, ПКМ — настройка`;
      tab.onclick=()=>{
        // Toggle filter: show only coins in this preset (exclusive)
        S.activeGroupFilter=0;
        S._potFilterPreset=(S._potFilterPreset===pr.id?null:pr.id);
        scheduleGroupUiRefresh();
      };
      tab.oncontextmenu=ev=>{ev.preventDefault();openPotPresetEditor(pr.id);};
      if(S._potFilterPreset===pr.id)tab.style.outline='1px solid #f97316';
      potSec.appendChild(tab);
    });
    // "+" to add new preset
    const addPotBtn=document.createElement('button');
    addPotBtn.style.cssText='background:none;border:1px dashed #a06a35;border-radius:4px;color:#f2bb88;cursor:pointer;font:inherit;font-size:10px;padding:2px 6px;';
    addPotBtn.textContent='＋ Пресет';addPotBtn.title='Добавить пресет Потенциала';
    addPotBtn.onclick=()=>openPotPresetEditor(null);
    potSec.appendChild(addPotBtn);
    bar.appendChild(potSec);
  });
}

function showGroupPicker(sym,anchorEl){
  // Auto-assign to last used group (or remove if already in that group)
  const cur=getSymGroup(sym);
  const target=S.lastGroupUsed||1;
  if(cur===target){setSymGroup(sym,0);}
  else{setSymGroup(sym,target);S.lastGroupUsed=target;}
  syncAllGroupDots(sym);
  // Show quick-change picker so user can pick a different color
  showQuickGroupChanger(sym,anchorEl);
}

function showChartGroupPicker(sym,anchorEl){
  if(!sym)return;
  showGroupPicker(sym,anchorEl);
}

function showQuickGroupChanger(sym,anchorEl){
  const old=document.getElementById('cgroupPicker');if(old)old.remove();
  const r=anchorEl.getBoundingClientRect();
  const pick=document.createElement('div');
  pick.id='cgroupPicker';
  pick.style.cssText=`position:fixed;z-index:600;left:${r.left}px;top:${r.bottom+4}px;
    background:var(--bg3);border:1px solid var(--border2);border-radius:6px;
    padding:6px 8px;display:flex;flex-direction:column;gap:5px;
    box-shadow:0 4px 16px rgba(0,0,0,.6)`;
  // Label
  const lbl=document.createElement('div');lbl.style.cssText='font-size:9px;color:var(--text3);padding-bottom:2px;border-bottom:1px solid var(--border);';
  lbl.textContent='Изменить группу:';pick.appendChild(lbl);
  // Color row
  const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;';
  // "none" option
  const none=document.createElement('div');
  none.className='cg-dot';none.style.background='var(--bg4)';none.style.borderColor='var(--border2)';
  none.title='Снять группу';
  if(getSymGroup(sym)===0)none.style.outline='2px solid #fff';
  none.onclick=()=>{setSymGroup(sym,0);pick.remove();syncAllGroupDots(sym);};
  row.appendChild(none);
  for(let g=1;g<=7;g++){
    const dot=document.createElement('div');dot.className='cg-dot';
    dot.style.background=GROUP_COLORS[g];
    if(getSymGroup(sym)===g)dot.style.outline='2px solid #fff';
    dot.title=`Группа ${g} · нажмите чтобы установить`;
    dot.onclick=()=>{S.lastGroupUsed=g;setSymGroup(sym,g);pick.remove();syncAllGroupDots(sym);};
    row.appendChild(dot);
  }
  pick.appendChild(row);
  document.body.appendChild(pick);
  setTimeout(()=>document.addEventListener('mousedown',function h(e){if(!pick.contains(e.target)){pick.remove();document.removeEventListener('mousedown',h);}},true),50);
}

// Sync all visible dots (chart headers + FS) after a group change
function syncAllGroupDots(sym){
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
  const fsCgDot=document.getElementById('fsCgDot');
  if(fsCgDot&&S.fsSym===sym){const grp=getSymGroup(sym);const col=GROUP_COLORS[grp]||'';fsCgDot.style.background=col||'var(--bg4)';fsCgDot.style.borderColor=col?'rgba(255,255,255,.25)':'var(--border2)';}
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
      row.onclick=()=>{setSymGroup(m.sym,inGrp?0:g);buildList(srch.value);};
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
  if(S.fsOpen){toggleFsScreener();return;}
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
  updateToggleScrBtn();
  setTimeout(()=>{S.charts.forEach((ch,i)=>{const cb=document.getElementById(`cb${i}`);if(cb&&ch.lc&&ch.cs){try{ch.lc.resize(cb.clientWidth,cb.clientHeight);ch.canvas.width=cb.clientWidth;ch.canvas.height=cb.clientHeight;rCanvas(ch);}catch(e){}}});},60);
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
  updateToggleScrBtn();
  setTimeout(()=>{S.fsCharts.forEach((fch,i)=>{const el=document.getElementById(`fsChartEl${i}`);if(el&&fch.lc&&fch.cs){try{fch.lc.resize(el.clientWidth,el.clientHeight);fch.canvas.width=el.clientWidth;fch.canvas.height=el.clientHeight;rCanvas(fch);}catch(e){}}});},60);
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
    // Keep the screener width consistent between main and fullscreen modes
    if(leftId==='cpanel'){
      const fsCA=document.getElementById('fsChartArea');
      if(fsCA){fsCA.style.flex='none';fsCA.style.width=pct+'%';}
      S._savedCpW=pct+'%';S._savedFsCaW=pct+'%';
    } else if(leftId==='fsChartArea'){
      const cp=document.getElementById('cpanel');
      if(cp){cp.style.flex='none';cp.style.width=pct+'%';}
      S._savedCpW=pct+'%';S._savedFsCaW=pct+'%';
    }
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
  const clamped=Math.max(minChartPct,Math.min(85,pct))+'%';
  cp.style.width=clamped;
  // Same pct for fullscreen chart area
  const fsCA=document.getElementById('fsChartArea');
  if(fsCA){fsCA.style.flex='none';fsCA.style.width=clamped;}
  S._savedCpW=clamped;S._savedFsCaW=clamped;
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
  S.page=0;updateCharts();restartChartStreams(0);
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
    const raw=await fj(`${API}/klines?symbol=${sym}&interval=${fch.tf}&limit=${HIST_INITIAL}`);
    if(S.fsSym!==sym)return;
    fch.candles=parseKlines(raw);
    if(fch.candles.length){
      const lp=fch.candles[fch.candles.length-1].c;
      fch.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lp)}});
    }
    fch.cs.setData(fch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    fch.vs.setData(fch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    const lastFsCandle=fch.candles[fch.candles.length-1];
    if(lastFsCandle)syncLivePriceLabel(fch,lastFsCandle.c,lastFsCandle.o);
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
    const merged=fch.candles;
    const doSet=()=>{
      if(!fch.cs||!fch.lc)return;
      try{
        fch.cs.setData(merged.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
        fch.vs.setData(merged.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
        if(vr)try{fch.lc.timeScale().setVisibleRange(vr);}catch(e){}
      }catch(e){}
    };
    if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(doSet,{timeout:2000});}
    else{setTimeout(doSet,0);}
  }catch(e){}finally{fch.histLoading=false;}
}

function openFullscreenBySym(sym){
  if(!sym)return;
  S.fsSym=sym;S.fsOpen=true;
  const body=document.getElementById('body');
  const fsBody=document.getElementById('fsBody');
  if(body)body.style.display='none';
  if(fsBody)fsBody.style.display='';
  const fsExtras=document.getElementById('fsExtras');
  if(fsExtras)fsExtras.style.display='flex';
  const tfGroup=document.getElementById('tfGroup');
  if(tfGroup)tfGroup.style.display='none';
  // Ensure shared chart area width is the same in both modes
  const cp=document.getElementById('cpanel');
  const fsCA=document.getElementById('fsChartArea');
  const sharedW=(cp&&cp.style.width)?cp.style.width:(S._savedCpW||'');
  if(sharedW&&fsCA){fsCA.style.flex='none';fsCA.style.width=sharedW;S._savedFsCaW=sharedW;}
  updateToggleScrBtn();
  const fsSymEl=document.getElementById('fsSym');if(fsSymEl)fsSymEl.textContent=sym;
  setCoinIcon('fsSymIcon',sym);
  // Update FS color dot
  const fsCgDot=document.getElementById('fsCgDot');
  if(fsCgDot){const grp=getSymGroup(sym);const col=GROUP_COLORS[grp]||'';fsCgDot.style.background=col||'var(--bg4)';fsCgDot.style.borderColor=col?'rgba(255,255,255,.25)':'var(--border2)';}
  const t=S.tk[sym]||{};const m=S.mx[sym]||{};
  const fsPrcEl=document.getElementById('fsPrc');if(fsPrcEl)fsPrcEl.textContent=fmtPrice(t.p);
  const ce=document.getElementById('fsChg');
  if(ce){
    ce.textContent=t.c24!=null?(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%':'';
    ce.className='cchg '+(t.c24>=0?'p':'n');
  }
  // Extra indicators
  const fsVolEl=document.getElementById('fsVol');if(fsVolEl)fsVolEl.innerHTML=t.qv?`<span style="opacity:.55">◈</span>${fk(t.qv)}`:'';
  const fsTrdEl=document.getElementById('fsTrd');if(fsTrdEl)fsTrdEl.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const corVal=m.corr14??m.corr;
  const fsCorrEl=document.getElementById('fsCorr');if(fsCorrEl)fsCorrEl.innerHTML=corVal!=null?`<span style="opacity:.55">∿</span>${fn(corVal,2)}`:'';
  // Build FS screener
  buildScreenerHeader(document.getElementById('fsShdr'));
  renderTable();
  // Build 3 FS charts
  for(let i=0;i<3;i++){buildFsTfBar(`fsTfBar${i}`,i);initFsChart(i);loadFsChart(i);}
  refreshEMAButtonState();
  startFsWs();
  setTimeout(autoResizeScreener,100);
}

function openFullscreen(slot){
  const sym=S.charts[slot]?.sym;if(!sym)return;
  openFullscreenBySym(sym);
}

function closeFullscreen(){
  S.fsOpen=false;
  const body=document.getElementById('body');
  const fsBody=document.getElementById('fsBody');
  if(fsBody)fsBody.style.display='none';
  if(body)body.style.display='';
  const fsExtras=document.getElementById('fsExtras');
  if(fsExtras)fsExtras.style.display='none';
  const tfGroup=document.getElementById('tfGroup');
  if(tfGroup)tfGroup.style.display='';
  // Keep shared width consistent when returning
  const cp=document.getElementById('cpanel');
  const fsCA=document.getElementById('fsChartArea');
  const sharedW=(fsCA&&fsCA.style.width)?fsCA.style.width:(S._savedFsCaW||'');
  if(sharedW&&cp){cp.style.flex='none';cp.style.width=sharedW;S._savedCpW=sharedW;}
  updateToggleScrBtn();
  if(S.fsWs){try{S.fsWs.close();}catch(e){}S.fsWs=null;}
  // Sync drawings back
  S.fsCharts.forEach(fch=>{rCanvas(fch);});
  // Refresh main grid drawings
  S.charts.forEach((ch,i)=>{if(ch.sym)ch.drawings=getSymDrawings(ch.sym);rCanvas(ch);});
  refreshEMAButtonState();
}

function goHome(){
  if(S.fsOpen)closeFullscreen();
}

async function setFsTf(idx,tf){
  S.fsCharts[idx].tf=tf;
  const bar=document.getElementById(`fsTfBar${idx}`);
  bar.querySelectorAll('.fs-tf-btn').forEach(b=>b.classList.toggle('on',b.textContent===tf));
  initFsChart(idx);await loadFsChart(idx);startFsWs();
}

let _wsFsGen=0;
let _wsFsReconnectTimer=null;
function startFsWs(){
  if(_wsFsReconnectTimer){clearTimeout(_wsFsReconnectTimer);_wsFsReconnectTimer=null;}
  if(S.fsWs){try{S.fsWs.close();}catch(e){}S.fsWs=null;}
  if(!S.fsSym||!S.fsOpen)return;
  const gen=++_wsFsGen;
  const tfs=[...new Set(S.fsCharts.map(c=>c.tf))];
  const symL=S.fsSym.toLowerCase();
  const klinePart=tfs.map(tf=>`${symL}@kline_${tf}`).join('/');
  const streams=`${klinePart}/${symL}@bookTicker`;
  const ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
  ws.onmessage=(evt)=>{
    if(gen!==_wsFsGen)return;
    let data;
    try{data=JSON.parse(evt.data).data;}catch(e){return;}
    if(!data)return;
    if(data.e==='bookTicker'){
      if(String(data.s||'').toUpperCase()!==String(S.fsSym||'').toUpperCase())return;
      const bid=+data.b,ask=+data.a;
      let price=null;
      if(isFinite(bid)&&isFinite(ask)&&bid>0&&ask>0)price=(bid+ask)/2;
      else if(isFinite(bid)&&bid>0)price=bid;
      else if(isFinite(ask)&&ask>0)price=ask;
      if(price==null)return;
      const ts=+(data.T||data.E)||Date.now();
      S.fsCharts.forEach(fch=>{
        if(!fch.cs||!fch.candles?.length)return;
        if(!applyLivePriceToCandle(fch,fch.tf,price,ts))return;
        fch._lastRtUpdateTs=Date.now();
        S.histCache[`${fch.tf}:${S.fsSym}`]=fch.candles.slice(-HIST_CACHE_MAX);
        try{
          const lc=fch.candles[fch.candles.length-1];
          fch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
          syncLivePriceLabel(fch,lc.c,lc.o);
        }catch(e){}
        rCanvas(fch);
      });
      return;
    }
    if(data.e!=='kline'||!data.k)return;
    const k=data.k;
    const tf=k.i;
    S.fsCharts.forEach(fch=>{
      if(fch.tf!==tf||!fch.cs)return;
      const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q};
      try{
        fch.cs.update({time:toChartTime(candle.t),open:candle.o,high:candle.h,low:candle.l,close:candle.c});
        fch.vs.update({time:toChartTime(candle.t),value:candle.qv,color:candle.c>=candle.o?'#1fa89122':'#e0404022'});
        syncLivePriceLabel(fch,candle.c,candle.o);
      }catch(e){}
      if(fch.candles.length&&fch.candles[fch.candles.length-1].t===candle.t)fch.candles[fch.candles.length-1]=candle;
      else if(fch.candles.length&&candle.t>fch.candles[fch.candles.length-1].t)fch.candles.push(candle);
      fch._lastRtUpdateTs=Date.now();
      S.histCache[`${fch.tf}:${S.fsSym}`]=fch.candles.slice(-HIST_CACHE_MAX);
      rCanvas(fch);
    });
  };
  const schedReconnect=()=>{
    if(gen!==_wsFsGen)return;
    if(S.fsOpen)_wsFsReconnectTimer=setTimeout(startFsWs,4000);
  };
  ws.onclose=()=>schedReconnect();
  ws.onerror=()=>{try{ws.close();}catch(e){}schedReconnect();};
  S.fsWs=ws;
}

// ═══════════════════════════════════════════════════════════════
//  BACKGROUND KLINES
// ═══════════════════════════════════════════════════════════════
async function loadKlinesBackground(){
  try{
    const top=Object.entries(S.tk).filter(([s])=>S.syms.includes(s)).sort((a,b)=>b[1].qv-a[1].qv).map(([s])=>s);
    const topFast=top.slice(0,120); // avoid Binance 429 flood
    const top1m=top.slice(0,80);
    Object.assign(S.k5m,await batchKlines(topFast,'5m',300,null,null,8));
    Object.assign(S.k1h,await batchKlines(topFast,'1h',170,null,null,8));
    // 1m is the heaviest endpoint; keep a narrower universe.
    Object.assign(S.k1m,await batchKlines(top1m,'1m',70,null,null,6));
    calcAll();renderTable();
  }catch(e){
    console.warn('bg klines',e);
  }finally{
    S.bgDone=true; // гарантируем true даже при ошибке
  }
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
    renderTable();updSortHdr();updTime();refreshEMAButtonState();
    setTimeout(ldHide,150);
    updateCharts();restartChartStreams(0);startScreenerWS();
    S.bgDone=true; // разрешить realtime-обновление метрик сразу, не ждать фоновой загрузки истории
    loadKlinesBackground();
    startRealtimeWatchdog();
    setTimeout(autoResizeScreener,300);
  }catch(err){
    console.error('Init error:',err);ldSet('Ошибка загрузки',100);ldErr(err.message||String(err));
  }
}

// ═══════════════════════════════════════════════════════════════
//  POTENTIAL MONITOR — multi-preset tabbed system
// ═══════════════════════════════════════════════════════════════
const POT_FIELDS=[
  {id:'ch24',   label:'ИЗМ 24ч %',  unit:'%',  step:0.5},
  {id:'cday',   label:'ИЗМ день %', unit:'%',  step:0.5},
  {id:'vr5',    label:'ОБ* 5м',     unit:'×',  step:0.1},
  {id:'vr1h',   label:'ОБ* 1ч',     unit:'×',  step:0.1},
  {id:'tr5',    label:'СД* 5м',     unit:'×',  step:0.1},
  {id:'tr1h',   label:'СД* 1ч',     unit:'×',  step:0.1},
  {id:'na14',   label:'NATR 5м',    unit:'%',  step:0.01},
  {id:'na30',   label:'NATR 1м',    unit:'%',  step:0.01},
  {id:'vol24',  label:'Объём 24ч',  unit:'M$', step:10},
];

let _potActiveTab=null; // preset id

function togglePotentialPanel(){
  const p=document.getElementById('potentialPanel');
  if(!p)return;
  const vis=p.style.display==='none'||p.style.display==='';
  p.style.display=vis?'flex':'none';
  const btn=document.getElementById('potBtn');if(btn)btn.classList.toggle('on',vis);
  if(vis)renderPotentialPanel();
}

function renderPotentialPanel(){
  const panel=document.getElementById('potentialPanel');if(!panel)return;
  // Tabs bar
  let tabBar=panel.querySelector('.pot-tab-bar');
  if(!tabBar){tabBar=document.createElement('div');tabBar.className='pot-tab-bar';panel.querySelector('.pot-hdr').after(tabBar);}
  tabBar.innerHTML='';
  S.potentialPresets.forEach(pr=>{
    const tab=document.createElement('button');
    tab.className='pot-tab'+(pr.id===_potActiveTab?' active':'');
    const cnt=Object.keys(pr.matches||{}).length;
    tab.innerHTML=`<span>${pr.name}</span>${cnt?`<span class="pot-tab-cnt">${cnt}</span>`:''}`;
    tab.onclick=()=>{_potActiveTab=pr.id;renderPotentialPanel();};
    tab.oncontextmenu=ev=>{ev.preventDefault();openPotPresetEditor(pr.id);};
    tabBar.appendChild(tab);
  });
  // Add button
  const addBtn=document.createElement('button');
  addBtn.className='pot-tab pot-tab-add';addBtn.title='Добавить пресет';addBtn.textContent='＋';
  addBtn.onclick=()=>openPotPresetEditor(null);
  tabBar.appendChild(addBtn);

  // Body area
  let body=panel.querySelector('.pot-body');
  if(!body){body=document.createElement('div');body.className='pot-body';panel.appendChild(body);}
  body.innerHTML='';

  const pr=S.potentialPresets.find(p=>p.id===_potActiveTab);
  if(!pr){
    body.innerHTML='<div class="pot-empty">Нажми ＋ чтобы добавить пресет с условиями</div>';
    return;
  }

  // Preset controls
  const ctrl=document.createElement('div');ctrl.className='pot-preset-ctrl';
  ctrl.innerHTML=`
    <span style="font-size:9px;color:var(--text3);flex:1">${pr.conditions.length} условий</span>
    <button class="tbtn${pr.enabled?' on':''}" onclick="togglePotPreset('${pr.id}')">${pr.enabled?'● Вкл':'○ Выкл'}</button>
    <button class="tbtn" onclick="openPotPresetEditor('${pr.id}')" title="Редактировать">✎</button>
    <button class="tbtn" onclick="deletePotPreset('${pr.id}')" style="color:var(--red)" title="Удалить">✕</button>`;
  body.appendChild(ctrl);

  // Conditions summary
  if(pr.conditions.length){
    const cond=document.createElement('div');cond.className='pot-cond-summary';
    cond.innerHTML=pr.conditions.map(c=>{
      const f=POT_FIELDS.find(x=>x.id===c.field);
      const parts=[];
      if(c.min!=null)parts.push(`≥${c.min}${f?.unit||''}`);
      if(c.max!=null)parts.push(`≤${c.max}${f?.unit||''}`);
      const absTxt=c.abs&&['ch24','cday'].includes(c.field)?'|.| ':'';
      return`<span class="pot-cond-tag">${absTxt}${f?.label||c.field} ${parts.join(' ')}</span>`;
    }).join('');
    body.appendChild(cond);
  }

  // Matches list
  const listEl=document.createElement('div');listEl.className='pot-list';
  const matches=Object.entries(pr.matches||{}).sort((a,b)=>b[1].ts-a[1].ts);
  if(!matches.length){
    listEl.innerHTML=`<div class="pot-empty">${pr.enabled?'Совпадений нет — ждём…':'Мониторинг выключен'}</div>`;
  } else {
    matches.forEach(([sym,d])=>{
      const sn=sym.replace(/USDT$/,'');
      const m=S.mx[sym]||{};
      const col=(m.ch24??0)>=0?'#1fa891':'#e04040';
      const grp=getSymGroup(sym);const grpCol=GROUP_COLORS[grp]||'';
      const item=document.createElement('div');item.className='pot-item';
      item.onclick=()=>openFullscreenBySym(sym);
      const tags=pr.conditions.map(c=>{
        const f=POT_FIELDS.find(x=>x.id===c.field);
        const val=m[c.field];
        const fmt=c.field==='vol24'?fk(val):(val!=null?fn(val,2):'—');
        const absTxt=c.abs&&['ch24','cday'].includes(c.field)?'|.| ':'';
        return`<span class="pot-tag">${absTxt}${f?.label?.split(' ')[0]||c.field} ${fmt}${f?.unit||''}</span>`;
      }).join('');
      item.innerHTML=`
        ${grpCol?`<span style="width:3px;align-self:stretch;background:${grpCol};border-radius:2px;flex-shrink:0"></span>`:''}
        <span class="pot-sym">${sn}</span>
        <span style="color:${col};font-weight:600;font-size:10px">${(m.ch24??0)>=0?'+':''}${fn(m.ch24,2)}%</span>
        ${tags}
        <span style="color:var(--text3);font-size:9px;margin-left:auto">${fmtPrice(m.price)}</span>`;
      listEl.appendChild(item);
    });
  }
  body.appendChild(listEl);
}

function openPotPresetEditor(presetId){
  const existing=presetId?S.potentialPresets.find(p=>p.id===presetId):null;
  const old=document.getElementById('potPresetModal');if(old)old.remove();
  const modal=document.createElement('div');modal.id='potPresetModal';
  modal.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;';
  const box=document.createElement('div');
  box.style.cssText='background:var(--bg2);border:1px solid var(--border2);border-radius:8px;width:340px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.8)';

  // Working copy of conditions
  const wCond=(existing?.conditions||[]).map(c=>({...c,abs:!!c.abs}));

  const render=()=>{
    box.innerHTML=`
      <div style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0;gap:8px">
        <span style="font-size:11px;font-weight:600;color:#fff;flex:1">${existing?'Редактировать':'Новый'} пресет</span>
        <button style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:15px" onclick="document.getElementById('potPresetModal').remove()">✕</button>
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <label style="font-size:9px;color:var(--text3);display:block;margin-bottom:4px">НАЗВАНИЕ</label>
        <input id="potPresetName" value="${existing?.name||''}" placeholder="Например: Импульс роста"
          style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font:inherit;font-size:10px;padding:5px 8px;outline:none">
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:10px;color:var(--text2)">Условия (ВСЕ должны совпасть)</span>
        <button class="tbtn" id="potAddCond">＋ Условие</button>
      </div>
      <div id="potCondList" style="flex:1;overflow-y:auto;min-height:0;padding:6px 14px"></div>
      <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <button class="tbtn" style="flex:1;color:var(--text2)" onclick="document.getElementById('potPresetModal').remove()">Отмена</button>
        <button class="tbtn on" style="flex:2" id="potSaveBtn">✓ Сохранить</button>
      </div>
      ${existing?`<div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <button class="tbtn${existing.enabled?' on':''}" style="flex:1" id="potToggleBtn">${existing.enabled?'● Вкл':'○ Выкл'} алерты</button>
        <button class="tbtn" style="flex:1;color:var(--red)" id="potDeleteBtn">Удалить пресет</button>
      </div>`:''}`;

    // Render conditions
    const cl=box.querySelector('#potCondList');
    if(!wCond.length){cl.innerHTML='<div style="font-size:9px;color:var(--text3);padding:8px 0">Нет условий — нажми ＋ чтобы добавить</div>';}
    wCond.forEach((c,idx)=>{
      const f=POT_FIELDS.find(x=>x.id===c.field)||POT_FIELDS[0];
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(37,37,48,.5)';
      row.innerHTML=`
        <select style="flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:3px 4px">
          ${POT_FIELDS.map(x=>`<option value="${x.id}"${x.id===c.field?' selected':''}>${x.label}</option>`).join('')}
        </select>
        <label title="Игнорировать направление (+/-), использовать модуль" style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--text3);${['ch24','cday'].includes(c.field)?'':'visibility:hidden'}">
          |x|
          <input type="checkbox" ${c.abs?'checked':''}>
        </label>
        <span style="font-size:9px;color:var(--text3)">от</span>
        <input type="number" value="${c.min??''}" placeholder="—" step="${f.step}"
          style="width:52px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:2px 4px;text-align:right">
        <span style="font-size:9px;color:var(--text3)">до</span>
        <input type="number" value="${c.max??''}" placeholder="—" step="${f.step}"
          style="width:52px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:2px 4px;text-align:right">
        <button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:0 2px" data-del="${idx}">✕</button>`;
      const sel=row.querySelector('select');
      sel.onchange=()=>{wCond[idx].field=sel.value;render();};
      const absCb=row.querySelector('input[type=checkbox]');
      if(absCb)absCb.onchange=()=>{wCond[idx].abs=absCb.checked;};
      const[minI,maxI]=Array.from(row.querySelectorAll('input[type=number]'));
      minI.onchange=()=>{const v=parseFloat(minI.value);wCond[idx].min=isNaN(v)?null:v;};
      maxI.onchange=()=>{const v=parseFloat(maxI.value);wCond[idx].max=isNaN(v)?null:v;};
      row.querySelector('[data-del]').onclick=()=>{wCond.splice(idx,1);render();};
      cl.appendChild(row);
    });

    box.querySelector('#potAddCond').onclick=()=>{wCond.push({field:'ch24',min:null,max:null,abs:false});render();};
    box.querySelector('#potSaveBtn').onclick=()=>{
      const name=box.querySelector('#potPresetName').value.trim()||'Пресет';
      // read current input values
      box.querySelectorAll('#potCondList .pot-cond-row-data').forEach(()=>{});
      if(existing){
        existing.name=name;existing.conditions=[...wCond];
      } else {
        const id='pot'+Date.now();
        S.potentialPresets.push({id,name,conditions:[...wCond],matches:{},alerted:{},enabled:true,cooldown:60});
        _potActiveTab=id;
      }
      modal.remove();renderPotentialPanel();runPotentialCheck();buildGroupFilterBar();
    };
    const tg=box.querySelector('#potToggleBtn');
    if(tg&&existing){
      tg.onclick=()=>{
        existing.enabled=!existing.enabled;
        if(existing.enabled){
          if(!S._potInterval)S._potInterval=setInterval(runPotentialCheck,15000);
          runPotentialCheck();
        }else{
          existing.matches={};existing.alerted={};
          renderPotentialPanel();buildGroupFilterBar();
        }
        tg.classList.toggle('on',existing.enabled);
        tg.textContent=(existing.enabled?'● Вкл':'○ Выкл')+' алерты';
      };
    }
    const del=box.querySelector('#potDeleteBtn');
    if(del&&existing){
      del.onclick=()=>{
        showConfirmModal(`Удалить пресет "${existing.name}"?`,{
          title:'Удаление пресета',
          okText:'Удалить',
          danger:true,
          onConfirm:()=>{deletePotPreset(existing.id);modal.remove();}
        });
      };
    }
  };
  render();
  modal.appendChild(box);document.body.appendChild(modal);
  modal.addEventListener('mousedown',e=>{if(e.target===modal)modal.remove();});
}

function togglePotPreset(id){
  const pr=S.potentialPresets.find(p=>p.id===id);if(!pr)return;
  pr.enabled=!pr.enabled;
  if(pr.enabled){if(!S._potInterval)S._potInterval=setInterval(runPotentialCheck,15000);runPotentialCheck();}
  else{pr.matches={};pr.alerted={};}
  renderPotentialPanel();
  buildGroupFilterBar();
}

function deletePotPreset(id){
  const idx=S.potentialPresets.findIndex(p=>p.id===id);if(idx<0)return;
  S.potentialPresets.splice(idx,1);
  if(_potActiveTab===id)_potActiveTab=S.potentialPresets[0]?.id||null;
  renderPotentialPanel();
  buildGroupFilterBar();
}

function runPotentialCheck(){
  const now=Date.now();let anyEnabled=false;
  S.potentialPresets.forEach(pr=>{
    if(!pr.enabled)return;anyEnabled=true;
    const newMatches={};
    for(const sym of S.syms){
      const m=S.mx[sym];if(!m)continue;
      const ok=pr.conditions.every(c=>{
        let val=m[c.field];
        // vol24 is in USDT, convert condition to USDT (user enters in M$)
        if(c.field==='vol24')val=val/1e6;
        if(c.abs&&['ch24','cday'].includes(c.field))val=Math.abs(val);
        if(val==null||isNaN(val))return false;
        if(c.min!=null&&val<c.min)return false;
        if(c.max!=null&&val>c.max)return false;
        return true;
      });
      if(ok)newMatches[sym]={ts:pr.matches[sym]?.ts||now,price:m.price,ch24:m.ch24};
    }
    // Alert for newly appeared symbols
    for(const sym of Object.keys(newMatches)){
      if(!pr.matches[sym]){
        const lastAlert=pr.alerted[sym]||0;
        const coolMs=(pr.cooldown||60)*1000;
        if(now-lastAlert>coolMs){
          pr.alerted[sym]=now;
          playAlert(660);
          // Add to alert history log
          const m=S.mx[sym]||{};
          S.alertLog.unshift({ts:now,sym,curPrice:m.price,linePrice:m.price,distPct:0,type:'potential',alertPct:0,presetName:pr.name});
          if(S.alertLog.length>50)S.alertLog.pop();
          renderAlertLog();
          const badge=document.getElementById('alertBadge');
          if(badge){badge.textContent=S.alertLog.length;badge.style.display='inline';}
        }
      }
    }
    pr.matches=newMatches;
  });
  // Update badge
  const totalMatches=S.potentialPresets.reduce((s,p)=>s+Object.keys(p.matches||{}).length,0);
  const badge=document.getElementById('potBadge');
  if(badge){badge.textContent=totalMatches;badge.style.display=totalMatches?'inline':'none';}
  // Re-render panel if open
  const panel=document.getElementById('potentialPanel');
  if(panel&&panel.style.display!=='none')renderPotentialPanel();
  // Rebuild group/potential filter bar to show updated counts
  buildGroupFilterBar();
  if(!anyEnabled&&S._potInterval){clearInterval(S._potInterval);S._potInterval=null;}
}

function clearPotentialMatches(){
  S.potentialPresets.forEach(pr=>{pr.matches={};pr.alerted={};});
  renderPotentialPanel();
  const badge=document.getElementById('potBadge');if(badge)badge.style.display='none';
}

function startPotentialMonitor(){
  if(S._potInterval)clearInterval(S._potInterval);
  S._potInterval=setInterval(runPotentialCheck,15000);
  runPotentialCheck();
}
function stopPotentialMonitor(){
  if(S._potInterval){clearInterval(S._potInterval);S._potInterval=null;}
}

function setBrushColor(col,el){
  _brushColor=col;
  document.querySelectorAll('.brush-color').forEach(d=>d.classList.remove('active'));
  if(el)el.classList.add('active');
}
function setBrushWidth(w){_brushWidth=Math.max(1,Math.min(12,w||2));}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
window.rCanvas            = rCanvas;
window.setDensityMult     = setDensityMult;
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
window.goHome             = goHome;
window.onSearch           = onSearch;
window.onVolFilter        = onVolFilter;
window.onTrdFilter        = onTrdFilter;
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
window.showChartGroupPicker = showChartGroupPicker;
window.openGroupManager   = openGroupManager;
window.setSymGroup        = setSymGroup;
window.S                  = S;
window.setDensityVisible  = setDensityVisible;
window.setAlertSetting    = setAlertSetting;
window.copyTicker         = copyTicker;
window.clearDrawingsSlot  = clearDrawingsSlot;
window.doSort             = doSort;
window.togglePotentialPanel = togglePotentialPanel;
window.openPotPresetEditor  = openPotPresetEditor;
window.togglePotPreset      = togglePotPreset;
window.deletePotPreset      = deletePotPreset;
window.clearPotentialMatches= clearPotentialMatches;
window.setBrushColor        = setBrushColor;
window.setBrushWidth        = setBrushWidth;
window.toggleEMA            = toggleEMA;
window.openEMAEditor        = openEMAEditor;


main();
