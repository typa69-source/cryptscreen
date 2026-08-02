import './style.css'
import { registerGridBotScreeners, buildGridLabPayload } from './gridBotScreeners.js'
import { registerGridSmartScreener } from './gridSmart.js'
import {
  openEmaEditorModal,
  refreshEmaButtonState as refreshEmaButtonStateUi,
  toggleEma as toggleEmaUi,
} from './emaEditor-ui.js'
import { cacheGetFresh, cacheSet, cacheHasIDB } from './idb-cache.js'
import { runMetrics, workerAvailable } from './metrics-worker-runtime.js'
import {
  cloneDrawings as cloneDrawingsUi,
  drawingLineColor as drawingLineColorUi,
  getTradeParams as getTradeParamsUi,
  timeToCoordX as timeToCoordXUi,
  pixelToPoint as pixelToPointUi,
  inferBarChartSec as inferBarChartSecUi,
  chartLivePriceForSnap as chartLivePriceForSnapUi,
  inferOhlcAnchor as inferOhlcAnchorUi,
  snapPoint as snapPointUi,
  resolveDrawPoint as resolveDrawPointUi,
  drawingDist as drawingDistUi,
  findDrawingNear as findDrawingNearUi,
  findPivots as findPivotsUi,
  trendLineTouches as trendLineTouchesUi,
  detectAutoTrendlines as detectAutoTrendlinesUi,
  makeDrawingCtx,
} from './chartDrawing.js'
import {
  gbDepositClamp,
  gridAdjacentStepPcts,
  resolveGridLevelsForCfg,
  buildRatioGridLevels,
  gridRiskAnchorIdx,
  buildGridRiskRows,
  buildGridFavorableRows,
  defaultGridLabPrefs,
  loadGridLabPrefs,
  saveGridLabPrefs,
  computeRatioGridUpdate,
  compileGridLabState,
  runManualGridBacktest,
  gridRiskMetaForPrice,
  fmtGridLineTitle as fmtGridLineTitleLab,
  captureGbLabViewport,
  applyGbViewportFreeze,
  gbWantBarsFromVisible,
  GRIDLAB_PREFS_KEY,
} from './gridLab.js'
import {
  pushBoundsUndo,
  undoBounds,
  redoBounds,
  pushRedoFromCurrent,
  pushUndoFromCurrent,
  applyBoundsToPrefs,
  readGridLabInputs as readGridLabInputsUi,
  getGridSelectorRows as getGridSelectorRowsUi,
  renderGridRiskProfile as renderGridRiskProfileUi,
  renderManualBacktestPreviewUi,
  scheduleGridLabSync as scheduleGridLabSyncUi,
  runGridLabSync as runGridLabSyncUi,
  collectGridLabFields,
  detectBoundsChanges,
  renderGridLabModal as renderGridLabModalUi,
} from './gridLab-ui.js'
import { API, API_FDATA, TZ_OFFSET_S, toChartTime, HIST_LIMIT, HIST_INITIAL, HIST_CACHE_MAX, MIN_CHART_CANDLES, HIST_TRIGGER, FS_TFS, DRAW_HIT, DRAW_HISTORY_LIMIT, hexToRgbA, ALL_COLS, COLS_HIDDEN_BY_DEFAULT, CHART_HEAD_DEFS, CHART_HEAD_IDS, GROUP_COLORS, FAVORITE_GROUP_ID, FAVORITE_GROUP_COLOR, trendColShortLabel, trendKlineFetchLimit, tfToolbarBtnId, S, _lastDrawSym, _undoSymOrder, _redoSymOrder, setLastDrawSym, pushUndoSym, pushRedoSym, resetUndoRedo, _anyChartPanning, _panEndTimer, _deferredRenderNeeded, _panOverlayRaf, setAnyChartPanning, setPanEndTimer, setDeferredRenderNeeded, setPanOverlayRaf } from './state.js'
import { fn, fk, fmtPrice, getPriceMinMove, formatDuration } from './format.js'
import { fj, parseKlines, mergeKlineChunks, batchKlines } from './api.js'
import { calcATR, calcNATR, calcNATRFlexible, calcRange, calcRangeFlexible, calcRel, calcSma, calcStd, calcBollinger, calcCorrelation, calcSqueezePop, calcBbSignals, sparkTrendSnapshot, calcVolProfile, calcRangeFromCandles, calcRets, sparkVolSnapshot, sparkHeatBackground } from './metrics.js'
import {
  DEFAULT_DENSITY_SETTINGS,
  getOrCreateDensitySettings,
  resetDensitySettings as resetDensitySettingsMod,
  setDensityThreshold as setDensityThresholdMod,
  clusterOrderBook,
  volumeStats,
  classifyTier,
  buildDensityZones,
  priceBucket,
  levelsToUsd,
} from './density.js'
import {
  TIER_STYLE,
  computeZonesForChart,
  fetchOrderBook as fetchOrderBookUi,
  prefetchAllOrderBooks,
  drawZonesUi,
  renderSettingsDensityUi,
  toggleDensityUi,
  setDensityVisibleUi,
  setDensityMultUi,
  resetDensitySettingsUi,
} from './density-ui.js'
import {
  POT_FIELDS,
  POT_FIELD_DESC,
  POT_ABS_FIELDS,
  clampEmaPeriod as clampEmaPeriodPp,
  evalEmaTouchSignal,
  evalCondition,
  evalPreset,
  makePreset,
  ensureBuiltinSqueezePreset,
  scanPresetMatches,
  selectAlertableSymbols,
  totalActiveMatches,
  fmtConditionTag,
  fmtConditionValue,
} from './potentialPresets.js'
import {
  togglePotentialPanelUi,
  renderPotentialPanelUi,
  openPotPresetEditorUi,
  togglePotPresetUi,
  deletePotPresetUi,
  addBuiltinSqueezePresetUi,
  clearPotentialMatchesUi,
  updatePotBadgeUi,
} from './potentialPresets-ui.js'

// API base - in dev points to local backend, in prod to your Railway URL
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// IMPORTANT: declare state-bearing `let` bindings that are accessed from
// `calcAll()` (and other early functions) BEFORE that function is defined.
// Otherwise terser's `mangle: { toplevel: true }` + inline/hoist rewrites can
// turn access of these into a TDZ ReferenceError ("Cannot access 'k1' before
// initialization") in the production build.
/** lastFundingRate (доля, не %) по символу */
let _fundRates = {}
/** {oi1h, oi4h} в % от openInterestHist 1h */
let _oiDelta = {}
let _fundOiSymIdx = 0
let _fundOiBusy = false
let _fundOiInterval = null

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
        <div class="auth-field" id="authPassConfirmField" style="display:none"><label class="auth-label">ПОДТВЕРДИТЕ ПАРОЛЬ</label><input class="auth-input" id="authPassConfirm" type="password" placeholder="••••••••" autocomplete="new-password"></div>
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
    let s = data.settings
    if (s != null && typeof s === 'string') {
      try { s = JSON.parse(s) } catch { s = null }
    }
    return s && typeof s === 'object' ? s : null
  } catch (e) { return null }
}

async function loadUserDrawingsMap() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${BACKEND}/api/user/drawings`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.status === 401) { removeToken(); return null }
    if (!res.ok) return null
    const data = await res.json()
    return data.drawings && typeof data.drawings === 'object' ? data.drawings : null
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
  Promise.all([loadUserSettings(), loadUserDrawingsMap()]).then(([settings, drawings]) => {
    applySettings(settings)
    window.__pendingDrawings = drawings
    main()
  })
}

function applySettings(settings) {
  window.__pendingUserSettings = settings && typeof settings === 'object' ? settings : null
}

// Entry point
if (getToken()) {
  startApp()
} else {
  buildAuthUI()
}


// ───────────────────────────────────────────────────────────
// ORIGINAL APP CODE
// ───────────────────────────────────────────────────────────
// State, constants, formatting and network helpers are imported from modules.

function loadChartViewPrefs(){
  try{
    const raw=localStorage.getItem('cs_chartView');
    if(!raw)return;
    const j=JSON.parse(raw);
    if(j.chartRightOffset!=null)S.chartRightOffset=Math.max(0,Math.min(40,+j.chartRightOffset));
    if(j.chartVisibleBars!=null)S.chartVisibleBars=Math.max(40,Math.min(220,+j.chartVisibleBars));
  }catch(e){}
}
function saveChartViewPrefs(){
  try{
    localStorage.setItem('cs_chartView',JSON.stringify({
      chartRightOffset:S.chartRightOffset,
      chartVisibleBars:S.chartVisibleBars,
    }));
  }catch(e){}
}

function loadChartHeadPrefs(){
  try{
    const raw=localStorage.getItem('cs_chartHead');
    if(!raw)return;
    const j=JSON.parse(raw);
    if(Array.isArray(j.order)){
      const seen=new Set();
      const ord=[];
      for(const id of j.order)if(CHART_HEAD_IDS.includes(id)&&!seen.has(id)){seen.add(id);ord.push(id);}
      for(const id of CHART_HEAD_IDS)if(!seen.has(id))ord.push(id);
      if(ord.length)S.chartHeadOrder=ord;
    }
    if(Array.isArray(j.visible)){
      const nv=new Set(j.visible.filter(id=>CHART_HEAD_IDS.includes(id)));
      if(nv.size)S.chartHeadVisible=nv;
    }
    const seen=new Set(S.chartHeadOrder);
    for(const id of CHART_HEAD_IDS){if(!seen.has(id)){S.chartHeadOrder.push(id);seen.add(id);}}
  }catch(e){}
}
function saveChartHeadPrefs(){
  try{
    localStorage.setItem('cs_chartHead',JSON.stringify({
      order:S.chartHeadOrder,
      visible:[...S.chartHeadVisible],
    }));
  }catch(e){}
}

function loadLineColorPrefs(){
  try{
    const raw=localStorage.getItem('cs_lineColors');
    if(!raw)return;
    const j=JSON.parse(raw);
    for(const k of['hray','tline','aray','atline'])if(typeof j[k]==='string'&&j[k].startsWith('#'))S.lineColors[k]=j[k];
  }catch(e){}
}
function saveLineColorPrefs(){
  try{localStorage.setItem('cs_lineColors',JSON.stringify(S.lineColors));}catch(e){}
}

function loadUiPrefs(){
  try{
    const cs=localStorage.getItem('cs_chart_autosync');
    if(cs!=null)S.chartAutoSync=cs==='1';
    const sx=localStorage.getItem('cs_sess_fx');
    if(sx){
      const j=JSON.parse(sx);
      if(typeof j.enabled==='boolean')S.sessionFx.enabled=j.enabled;
      if(typeof j.asia==='boolean')S.sessionFx.asia=j.asia;
      if(typeof j.london==='boolean')S.sessionFx.london=j.london;
      if(typeof j.ny==='boolean')S.sessionFx.ny=j.ny;
    }
    const oiOn=localStorage.getItem('cs_oi_chart');
    if(oiOn!=null)S.showOiOnChart=oiOn==='1';
    const bbOn=localStorage.getItem('cs_bb_overlay');
    if(bbOn!=null)S.showBbOverlay=bbOn==='1';
  }catch(e){}
}
function saveChartAutoSyncPref(){try{localStorage.setItem('cs_chart_autosync',S.chartAutoSync?'1':'0');}catch(e){}}
function saveSessionFxPref(){try{localStorage.setItem('cs_sess_fx',JSON.stringify(S.sessionFx));}catch(e){}}
function saveOiChartPref(){try{localStorage.setItem('cs_oi_chart',S.showOiOnChart?'1':'0');}catch(e){}}
function saveBbOverlayPref(){try{localStorage.setItem('cs_bb_overlay',S.showBbOverlay?'1':'0');}catch(e){}}

function lineColorForType(type){
  const c=S.lineColors?.[type];
  return(typeof c==='string'&&c.startsWith('#'))?c:null;
}

/** После setData: отступ справа + «зум» по числу видимых свечей */
function applyDefaultChartView(ch){
  if(!ch?.lc||!ch.candles?.length)return;
  const len=ch.candles.length;
  // Мало баров • только fit, без «логического зума» на 32+ пустых слотов
  if(len<MIN_CHART_CANDLES){
    try{ch.lc.timeScale().fitContent();}catch(e){}
    return;
  }
  const isFs=S.fsCharts&&S.fsCharts.includes(ch);
  const plotW=ch.canvas?.clientWidth||ch.canvas?.width||400;
  const refW=300;
  const fsBoost=isFs?Math.min(2.15,Math.sqrt(Math.max(1,plotW/refW))):1;
  let want=Math.round((S.chartVisibleBars|0)*fsBoost);
  want=Math.max(12,Math.min(want,len));
  const targetBars=Math.min(len,Math.max(want,MIN_CHART_CANDLES));
  const from=Math.max(0,len-targetBars);
  let ro=Math.max(0,Math.min(36,S.chartRightOffset|0));
  if(isFs){
    const roShrink=Math.max(0.5,Math.min(1,refW/Math.max(plotW*0.48,refW)));
    ro=Math.max(0,Math.min(36,Math.round(ro*roShrink)));
  }
  try{
    // Apply view only once per data load to avoid periodic rescaling flicker
    if(ch._lastAppliedRangeFrom===from&&ch._lastAppliedRangeTo===len-1&&ch._lastAppliedRo===ro)return;
    ch._lastAppliedRangeFrom=from;ch._lastAppliedRangeTo=len-1;ch._lastAppliedRo=ro;
    ch.lc.timeScale().applyOptions({rightOffset:ro,fixRightEdge:false});
    ch.lc.timeScale().setVisibleLogicalRange({from,to:len-1});
    ch.lc.timeScale().applyOptions({rightOffset:ro});
  }catch(e){}
}

function applyDefaultChartViewAll(){
  S.charts.forEach(ch=>{if(ch.lc&&ch.candles?.length)applyDefaultChartView(ch);});
  if(S.fsOpen)S.fsCharts.forEach(ch=>{if(ch.lc&&ch.candles?.length)applyDefaultChartView(ch);});
}

function mkChart(){
  return{lc:null,cs:null,vs:null,sym:null,candles:[],histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null,oiLine:null,bbUpperLine:null,bbLowerLine:null,
    _oiHist:[],_oiRaw:[],_oiLastFetchTs:0,_histBootstrapDone:false};
}
function mkFsChart(tf){
  return{lc:null,cs:null,vs:null,candles:[],tf,histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null,oiLine:null,bbUpperLine:null,bbLowerLine:null,
    _oiHist:[],_oiRaw:[],_oiLastFetchTs:0,_histBootstrapDone:false};
}
function getChartSym(ch){
  if(ch?.sym)return ch.sym;
  if(S.fsCharts.includes(ch))return S.fsSym||null;
  return null;
}

function activeCols(){
  return S.colOrder.filter(id=>S.colVisible.has(id))
    .map(id=>ALL_COLS.find(c=>c.id===id)).filter(Boolean);
}

// ───────────────────────────────────────────────────────────────
//  LOADING UI
// ───────────────────────────────────────────────────────────────
function ldSet(t,p,d){
  const tEl=document.getElementById('ltxt');
  const pEl=document.getElementById('lfill');
  const dEl=document.getElementById('llog');
  if(t!=null&&tEl)tEl.textContent=t;
  if(p!=null&&pEl)pEl.style.width=p+'%';
  if(d!=null&&dEl)dEl.textContent=d;
}
function ldErr(m){const e=document.getElementById('lerr');if(!e)return;e.style.display='block';e.innerHTML='вљ  '+String(m).replace(/\n/g,'<br>');}
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

// Network helpers (fj, parseKlines, batchKlines) and metrics are imported from modules.

// Local pan-state helpers that coordinate with state.js variables.
function _panOverlayTick() {
  if (!_anyChartPanning) {
    setPanOverlayRaf(null);
    return;
  }
  for (const ch of [...S.charts, ...S.fsCharts]) {
    if (ch?.lc && ch.canvas) try { _rCanvasImmediate(ch); } catch (e) {}
  }
  setPanOverlayRaf(requestAnimationFrame(_panOverlayTick));
}
function _onPanStart() {
  setAnyChartPanning(true);
  if (!_panOverlayRaf) setPanOverlayRaf(requestAnimationFrame(_panOverlayTick));
  if (_panEndTimer) clearTimeout(_panEndTimer);
  setPanEndTimer(setTimeout(() => {
    setAnyChartPanning(false);
    setPanEndTimer(null);
    if (_panOverlayRaf) {
      cancelAnimationFrame(_panOverlayRaf);
      setPanOverlayRaf(null);
    }
    for (const ch of [...S.charts, ...S.fsCharts]) {
      if (ch?.lc && ch.canvas) try { _rCanvasImmediate(ch); } catch (e) {}
    }
    if (_deferredRenderNeeded && !document.hidden) {
      setDeferredRenderNeeded(false);
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => renderTable(), { timeout: 400 });
      } else {
        setTimeout(renderTable, 0);
      }
    }
  }, 180));
}

/** Последние period закрытий на k5 → SMA, полосы Боллинджера, относительная ширина полос. */
function bollingerOnTail(k5,period=20,mult=2){
  if(!k5||k5.length<period)return null;
  const w=k5.slice(-period);
  const closes=w.map(x=>+x.c).filter(c=>isFinite(c)&&c>0);
  if(closes.length<period)return null;
  const sma=closes.reduce((a,b)=>a+b,0)/period;
  let variance=0;for(const x of closes)variance+=(x-sma)*(x-sma);
  const sd=Math.sqrt(variance/period);
  const upper=sma+mult*sd,lower=sma-mult*sd;
  if(!isFinite(sma)||sma<=0)return null;
  return{sma,upper,lower,width:(upper-lower)/sma,lastC:closes[closes.length-1]};
}
/** Узкая полоса vs предыдущий бар + всплеск vr5 + выход за полосу на последней свече. */

function buildBbSeries(candles,period=20,mult=2){
  if(!Array.isArray(candles)||candles.length<period)return{upper:[],lower:[]};
  const upper=[],lower=[];
  for(let i=period-1;i<candles.length;i++){
    const slice=candles.slice(i-period+1,i+1);
    const bb=bollingerOnTail(slice,period,mult);
    if(!bb)continue;
    upper.push({time:toChartTime(candles[i].t),value:bb.upper});
    lower.push({time:toChartTime(candles[i].t),value:bb.lower});
  }
  return{upper,lower};
}
function oiPeriodForTf(tf){
  if(tf==='1m'||tf==='3m')return'5m';
  if(tf==='5m')return'5m';
  if(tf==='15m')return'15m';
  if(tf==='30m')return'30m';
  if(tf==='1h')return'1h';
  if(tf==='4h')return'4h';
  return'1h';
}
async function fetchOiHistoryForChart(sym,tf,firstCandleMs=null){
  const period=oiPeriodForTf(tf);
  const targetT=firstCandleMs!=null&&isFinite(+firstCandleMs)?toChartTime(+firstCandleMs):null;
  const merged=[];
  const seen=new Set();
  let endTime=null;
  for(let page=0;page<14;page++){
    let url=`${API_FDATA}/openInterestHist?symbol=${encodeURIComponent(sym)}&period=${period}&limit=500`;
    if(endTime!=null)url+=`&endTime=${endTime}`;
    const raw=await fj(url,12000,0);
    if(!Array.isArray(raw)||raw.length<2)break;
    for(const row of raw){
      const oi=+row.sumOpenInterest;
      const ts=+row.timestamp;
      if(!isFinite(oi)||!isFinite(ts)||ts<=0)continue;
      const tim=toChartTime(ts);
      if(seen.has(tim))continue;
      seen.add(tim);
      merged.push({time:tim,oi});
    }
    merged.sort((a,b)=>a.time-b.time);
    if(raw.length<500)break;
    if(targetT==null)break;
    const oldest=merged[0]?.time;
    if(oldest!=null&&oldest<=targetT)break;
    const batchOldest=+raw[0]?.timestamp;
    if(!isFinite(batchOldest))break;
    endTime=batchOldest-1;
    await new Promise(r=>setTimeout(r,35+Math.random()*45));
  }
  if(merged.length<2)return[];
  return merged;
}
/** Линейная интерполяция OI по времени под каждую свечу; % изменения относительно OI на первом баре окна. */
function alignOiToCandles(candles,oiRaw){
  if(!Array.isArray(candles)||!candles.length||!Array.isArray(oiRaw)||!oiRaw.length)return[];
  const pts=oiRaw.slice().filter(p=>p&&isFinite(p.oi)&&p.time!=null).sort((a,b)=>a.time-b.time);
  if(pts.length<2)return[];
  function oiAtChartTime(tv){
    if(tv<=pts[0].time)return pts[0].oi;
    const last=pts[pts.length-1];if(tv>=last.time)return last.oi;
    let lo=0,hi=pts.length-1;
    while(lo+1<hi){
      const mid=(lo+hi)>>1;
      if(pts[mid].time<=tv)lo=mid;else hi=mid;
    }
    const a=pts[lo],b=pts[lo+1];
    const w=(tv-a.time)/Math.max(1,(b.time-a.time));
    return a.oi+w*(b.oi-a.oi);
  }
  const base=Math.max(1e-12,oiAtChartTime(toChartTime(candles[0].t)));
  const out=[];
  for(const c of candles){
    const t=toChartTime(c.t);
    const oi=oiAtChartTime(t);
    out.push({time:t,value:(oi/base-1)*100});
  }
  return out;
}
function repaintOiSeries(ch){
  if(!ch?.oiLine)return;
  ch.oiLine.applyOptions({visible:!!S.showOiOnChart});
  if(!S.showOiOnChart){ch.oiLine.setData([]);return;}
  if(Array.isArray(ch._oiRaw)&&Array.isArray(ch.candles)&&ch.candles.length){
    ch._oiHist=alignOiToCandles(ch.candles,ch._oiRaw);
  }
  ch.oiLine.setData(Array.isArray(ch._oiHist)?ch._oiHist:[]);
}
function repaintBbSeries(ch){
  if(!ch?.bbUpperLine||!ch?.bbLowerLine)return;
  ch.bbUpperLine.applyOptions({visible:!!S.showBbOverlay});
  ch.bbLowerLine.applyOptions({visible:!!S.showBbOverlay});
  if(!S.showBbOverlay||!Array.isArray(ch.candles)||!ch.candles.length){
    ch.bbUpperLine.setData([]);ch.bbLowerLine.setData([]);return;
  }
  const bb=buildBbSeries(ch.candles,20,2);
  ch.bbUpperLine.setData(bb.upper);
  ch.bbLowerLine.setData(bb.lower);
}
async function refreshChartOiSeries(ch,tf,sym){
  if(!ch?.oiLine||!sym)return;
  const now=Date.now();
  if(ch._oiFetching&&now-(ch._oiFetchStartedAt||0)<12000)return;
  ch._oiFetching=true;ch._oiFetchStartedAt=now;
  try{
    const anchorMs=ch.candles?.length?ch.candles[0].t:null;
    const raw=await fetchOiHistoryForChart(sym,tf,anchorMs);
    ch._oiRaw=raw;
    ch._oiHist=alignOiToCandles(ch.candles,raw);
    ch._oiLastFetchTs=Date.now();
    repaintOiSeries(ch);
  }catch(e){
  }finally{
    ch._oiFetching=false;
  }
}
function getSessionKindByUtcHour(h){
  if(S.sessionFx.ny!==false&&h>=13&&h<22)return'ny';
  if(S.sessionFx.london!==false&&h>=8&&h<17)return'ld';
  if(S.sessionFx.asia!==false&&h>=0&&h<9)return'as';
  return'dead';
}
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
  if(!sym)return;
  updateLiveKlineSeries(S.k1m[sym],60000,price,nowMs);
  updateLiveKlineSeries(S.k5m[sym],300000,price,nowMs);
  updateLiveKlineSeries(S.k1h[sym],3600000,price,nowMs);
}

function appendCandleWithGaps(arr,candle,stepMs){
  if(!arr||!candle)return;
  if(!arr.length){arr.push(candle);return;}
  const prev=arr[arr.length-1];
  if(!prev?.t){arr.push(candle);return;}
  if(candle.t<=prev.t){
    if(candle.t===prev.t)arr[arr.length-1]=candle;
    return;
  }
  if(stepMs>0){
    const gapBars=Math.max(0,Math.floor((candle.t-prev.t)/stepMs)-1);
    if(gapBars>18){
      arr.push(candle);
      return;
    }
    for(let ts=prev.t+stepMs;ts<candle.t;ts+=stepMs){
      const base=arr[arr.length-1]?.c??prev.c;
      const carryQv=+(arr[arr.length-1]?.qv??prev.qv??0)||0;
      arr.push({t:ts,o:base,h:base,l:base,c:base,v:0,tr:0,qv:carryQv,_synthetic:true});
    }
  }
  arr.push(candle);
}

function calcAll(){
  const btc5=S.k5m['BTCUSDT'];
  S.btcR=btc5?calcRets(btc5):[];
  const btcR14=btc5&&btc5.length>=15?calcRets(btc5.slice(-15)):[];
  const nowMs=Date.now();
  const dayStartMs=new Date(nowMs).setHours(0,0,0,0);
  const prevMx=S.mx;
  const nextMx={};
  for(const sym of S.syms){
    const t=S.tk[sym];if(!t)continue;
    const k5=S.k5m[sym],k1h=S.k1h[sym],k1m=S.k1m[sym];
    // cday: от первой 1ч свечи локального календарного дня
    let cday=null;
    if(k1h&&k1h.length>0){
      const todayCandle=k1h.find(c=>c.t>=dayStartMs);
      if(todayCandle)cday=(t.p-todayCandle.o)/todayCandle.o*100;
    }
    const corr14=k5&&k5.length>=15&&btcR14.length?calcCorr(calcRets(k5.slice(-15)),btcR14):null;
    const k5today=k5&&k5.length?k5.filter(c=>c.t>=dayStartMs):[];
    const rtd=calcRangeFromCandles(k5today);
    const kt=S.kTrend[sym];
    const sparkKl=(kt&&kt.length>=6)?kt:k5;
    const sp=sparkTrendSnapshot(sparkKl,30);
    const volSpark=sparkVolSnapshot(sparkKl,30);
    const vr5v=calcRel(k5,14,'qv');
    const oiE=_oiDelta[sym];
    const bb=calcBbSignals(k5,vr5v);
    const m={
      sym,price:t.p,ch24:t.c24,cday,
      sp5:sp.sp5,sp5d:sp.sp5d,
      spVol:volSpark.spVol,spVold:volSpark.spVold,
      spv:volSpark.spVol,
      rtd,
      r24:calcRange(k5,288),r7d:calcRange(k1h,168),
      na30:calcNATRFlexible(k1m,30),na14:calcNATRFlexible(k5,14),r1m5:calcRangeFlexible(k1m,5),
      tr5:calcRel(k5,14,'tr'),tr1h:calcRel(k1h,24,'tr'),
      vr5:vr5v,vr1h:calcRel(k1h,24,'qv'),
      sqzPop:calcSqueezePop(k5,vr5v),
      bbSqz:bb.bbSqz,
      bbBreak:bb.bbBreak,
      volImpulse:bb.volImpulse??0,
      fund:_fundRates[sym]??prevMx[sym]?.fund??null,
      oi1h:oiE?.oi1h??prevMx[sym]?.oi1h??null,
      oi4h:oiE?.oi4h??prevMx[sym]?.oi4h??null,
      ch7d:null,trd24:t.tr,vol24:t.qv,
      corr:S.btcR.length>10&&k5?calcCorr(calcRets(k5),S.btcR):null,
      corr14,
      v15m:k1m&&k1m.length>=2?k1m.slice(-Math.min(15,k1m.length)).reduce((a,k)=>a+k.qv,0):null,
      v60m:k1m&&k1m.length>=2?k1m.slice(-Math.min(60,k1m.length)).reduce((a,k)=>a+k.qv,0):null,
    };
    if(k1h&&k1h.length>=168){const old=k1h[k1h.length-168];m.ch7d=(t.p-old.c)/old.c*100;}
    nextMx[sym]=m;
  }
  S.mx=nextMx;
}

// ───────────────────────────────────────────────────────────────
//  FORMAT HELPERS
// ───────────────────────────────────────────────────────────────
function fv(v,id){
  if(v==null||isNaN(v))return'•';
  if(id==='ch24'||id==='ch7d'||id==='cday'||id==='sp5'||id==='spv')return(v>0?'+':'')+fn(v,2)+'%';
  if(id==='fund')return(v==null||!isFinite(v))?'•':(v*100).toFixed(3)+'%';
  if(id==='oi1h'||id==='oi4h')return(v==null||!isFinite(v))?'•':(v>0?'+':'')+fn(v,2)+'%';
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
  if(id==='ch24'||id==='ch7d'||id==='cday'||id==='sp5'||id==='spv')return v>0?'p':v<0?'n':'w';
  if(id==='fund')return'w';
  if(id==='oi1h'||id==='oi4h')return v>0?'p':v<0?'n':'w';
  if(id==='rtd'||id==='r24'||id==='r7d'||id==='r1m5')return v>15?'y':'w';
  if(id==='na30'||id==='na14')return v>0.5?'y':'w';
  if(id==='corr'||id==='corr14')return v>0.75?'d':v<-0.2?'n':'w';
  if(['tr5','tr1h','vr5','vr1h'].includes(id))return'w';
  return'w';
}
function fh(v,id){
  if(v==null||isNaN(v))return'';
  if(id==='oi1h'||id==='oi4h'){
    const a=Math.abs(v);
    if(a>=10)return'hv3';
    if(a>=5)return'hv2';
    if(a>=2.5)return'hv1';
    return'';
  }
  if(!['tr5','tr1h','vr5','vr1h'].includes(id))return'';
  // Gradient green from >0.7 up to >3; base cells stay default/neutral at <=0.7
  if(v>=3)return'hv3';if(v>=2)return'hv2';if(v>=1.4)return'hv1';if(v>=0.7)return'hv0';
  return'';
}

function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function svgPathAttr(str){
  // SVG path data should only contain a very narrow character set.
  return String(str).replace(/[^\d\s\.,\-MLHVCSQTAZmlhvcsqtaz]/g,'');
}


function copyTicker(sym){
  // Accept short name (ETH) or full (ETHUSDT) • always copy full USDT form
  if(!sym||sym==='•')return;
  const full=String(sym).endsWith('USDT')?String(sym):String(sym)+'USDT';
  navigator.clipboard.writeText(full).then(()=>{
    // Brief visual toast
    let t=document.getElementById('copyToast');
    if(!t){t=document.createElement('div');t.id='copyToast';
      t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg4);border:1px solid var(--border2);color:var(--text);border-radius:4px;padding:5px 14px;font-size:10px;z-index:9999;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(t);}
    t.textContent=`${full} скопировано`;t.style.opacity='1';
    clearTimeout(t._to);t._to=setTimeout(()=>{t.style.opacity='0';},1200);
  }).catch(()=>{});
}

function showConfirmModal(text,{title='Подтверждение',okText='Подтвердить',cancelText='Отмена',danger=false,onConfirm}={}){
  const old=document.getElementById('csConfirmModal');if(old)old.remove();
  const ov=document.createElement('div');ov.id='csConfirmModal';
  ov.style.cssText='position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;';
  ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
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
  ok.focus();
}

// ───────────────────────────────────────────────────────────────
//  CHART GRID BUILD
// ───────────────────────────────────────────────────────────────
function buildChartGrid(){
  const g=document.getElementById('cgrid');g.innerHTML='';
  const n=S.gridSize;
  const cols=Math.max(1,Math.min(7,S.gridCols||3));
  const rows=Math.max(1,Math.min(7,S.gridRows||3));
  g.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  g.style.gridTemplateRows=`repeat(${rows},1fr)`;
  for(let i=0;i<n;i++){
    g.insertAdjacentHTML('beforeend',`
      <div class="ccell" id="cc${i}">
        <div class="chead">
          <span class="chart-cg-dot cg-dot" id="cgd${i}" title="Цветовая группа" onclick="showChartGroupPicker(S.charts[${i}].sym,this)"></span>
          <img class="coin-icon" id="ci${i}" src="" alt="" style="display:none;width:14px;height:14px;border-radius:50%;flex-shrink:0">
          <span class="csym" id="cs${i}" title="Нажмите для копирования" onclick="copyTicker(this.textContent)" style="cursor:pointer">•</span>
          <span class="cprc" id="cp${i}"></span>
          <div class="chead-stats" id="chs${i}"></div>
          <span class="chead-gap"></span>
          <button class="fs-open-btn" onclick="openFullscreen(${i})" title="На весь экран">⛶</button>
        </div>
        <div class="cbody" id="cb${i}">
          <div class="cph"><span class="cph-n">${i+1}</span><span style="font-size:9px;color:var(--text3)">ожидание</span></div>
        </div>
      </div>`);
  }
  for(let i=0;i<n;i++)initChartHeadSlot(i);
}

function initChartHeadSlot(slot){
  const el=document.getElementById(`chs${slot}`);
  if(!el)return;
  el.innerHTML='';
  for(const def of CHART_HEAD_DEFS){
    const s=document.createElement('span');
    s.id=`chs${slot}-${def.id}`;
    s.className=def.cls;
    s.title=def.tip;
    el.appendChild(s);
  }
  applyChartHeadLayoutForSlot(slot);
}

function applyChartHeadLayoutForSlot(slot){
  const order=S.chartHeadOrder.filter(id=>CHART_HEAD_IDS.includes(id));
  const vis=S.chartHeadVisible;
  for(const id of CHART_HEAD_IDS){
    const s=document.getElementById(`chs${slot}-${id}`);
    if(!s)continue;
    const oi=order.indexOf(id);
    s.style.display=vis.has(id)&&oi>=0?'':'none';
    if(oi>=0)s.style.order=String(oi);
  }
}

function applyChartHeadLayoutAll(){
  for(let i=0;i<S.gridSize;i++)applyChartHeadLayoutForSlot(i);
  layoutFsHeadStats();
}

function clearChartHeadValues(slot){
  setText(`cp${slot}`,'');
  for(const id of CHART_HEAD_IDS){
    const el=document.getElementById(`chs${slot}-${id}`);
    if(!el)continue;
    el.textContent='';
    el.innerHTML='';
    if(id==='chg')el.className='cchg';
  }
}

// Coin icon cache and loader • multi-CDN with fallback chain.
// coincap.io and livecoinwatch were removed: they regularly return
// ERR_CONNECTION_RESET and flood the console for every symbol on
// cold start (500 symbols * 1+ image each). GitHub raw is reliable
// and slow but quiet. bin.bnbstatic covers ~95% of Binance-listed
// tokens with sub-100ms response times.
const _iconCache={};
function setCoinIcon(elId,sym){
  const rawBase=sym.replace(/USDT$/,'').toUpperCase();
  // Handle 1000X prefix tokens (e.g. 1000SHIB->SHIB, 1000BONK->BONK)
  const base=rawBase.replace(/^1000(?=[A-Z])/,'').replace(/^100(?=[A-Z])/,'');
  const el=document.getElementById(elId);if(!el)return;
  if(_iconCache[base]===false){el.style.display='none';return;}
  if(_iconCache[base]){el.src=_iconCache[base];el.style.display='';return;}
  // CDN priority list • try each in order
  const cdns=[
    `https://bin.bnbstatic.com/static/assets/logos/${base}.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${base.toLowerCase()}.png`,
    rawBase!==base?`https://bin.bnbstatic.com/static/assets/logos/${rawBase}.png`:null,
    rawBase!==base?`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${rawBase.toLowerCase()}.png`:null,
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

// ───────────────────────────────────────────────────────────────
//  CHART INIT
// ───────────────────────────────────────────────────────────────
function initLCChart(slot,isFs=false,fsIdx=null){
  if(!S.LC)return false;
  const ch=isFs?S.fsCharts[fsIdx]:S.charts[slot];
  const containerId=isFs?`fsChartEl${fsIdx}`:`cb${slot}`;
  const container=document.getElementById(containerId);
  if(!container)return false;
  if(ch._ro){try{ch._ro.disconnect();}catch(e){}ch._ro=null;}
  if(ch.lc){
    try{ch.lc.remove();}catch(e){}
    ch.lc=null;ch.cs=null;ch.vs=null;ch.livePriceLine=null;
    ch.oiLine=null;ch.bbUpperLine=null;ch.bbLowerLine=null;
  }
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
    timeScale:{borderColor:'#252530',timeVisible:true,secondsVisible:false,fixRightEdge:false},
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
  lc.priceScale('oi').applyOptions({
    // Keep OI in a very compact lower panel (above volume).
    scaleMargins:{top:.86,bottom:.08},
    drawTicks:false,
    borderVisible:false,
    visible:false,
  });
  const oiLine=lc.addLineSeries({
    priceScaleId:'oi',
    color:'#22d3ee',
    lineWidth:1,
    lastValueVisible:false,
    priceLineVisible:false,
    visible:S.showOiOnChart,
  });
  // In some LightweightCharts builds custom scale options are applied
  // reliably only through the series scale handle.
  try{
    oiLine.priceScale().applyOptions({
      scaleMargins:{top:.86,bottom:.08},
      drawTicks:false,
      borderVisible:false,
      visible:false,
    });
  }catch(e){}
  const bbUpperLine=lc.addLineSeries({
    color:'#f59e0b',
    lineWidth:1,
    lastValueVisible:false,
    priceLineVisible:false,
    crosshairMarkerVisible:false,
    visible:S.showBbOverlay,
  });
  const bbLowerLine=lc.addLineSeries({
    color:'#f59e0b',
    lineWidth:1,
    lastValueVisible:false,
    priceLineVisible:false,
    crosshairMarkerVisible:false,
    lineStyle:2,
    visible:S.showBbOverlay,
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
    const drawSym=getChartSym(ch);
    if(drawSym)pushDrawUndo(drawSym);
    const stroke={id:++S.drawIdCounter,type:'brush',pts:[pt],color:_brushColor,width:_brushWidth,opacity:0.85};
    ch.drawings.push(stroke);
    setLastDrawSym();
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
    const drawSym=hadStroke?getChartSym(ch):null;
    ch._brushStroke=null;
    if(drawSym)schedulePersistDrawings(drawSym);
    if(hadStroke&&S.drawMode==='brush')setDrawMode(null);
  });
  interact.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(S.drawMode){setDrawMode(null);return;} // #10: RMB exits draw mode
    removeDrawingAtCursor(ch);
  });
  container.appendChild(interact);ch.interact=interact;

  // Container-level listeners use abortable signal (cleanup on re-init / chart rebuild)
  const ab=new AbortController();
  const sig=ab.signal;
  ch._ab=ab;

  interact.addEventListener('wheel',e=>{
    if(!S.drawMode)return;
    const{x}=getCoords(container,e.clientX,e.clientY);
    const drawW=Math.max(1,container.clientWidth-PRICE_AXIS_W);
    if(x>=drawW)return;
    const chartRoot=container.firstElementChild;
    if(!chartRoot||typeof WheelEvent==='undefined')return;
    chartRoot.dispatchEvent(new WheelEvent('wheel',{
      deltaY:e.deltaY,deltaX:e.deltaX,deltaZ:e.deltaZ,
      clientX:e.clientX,clientY:e.clientY,
      bubbles:true,cancelable:true,view:window,
      ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,
    }));
    e.preventDefault();
  },{passive:false,signal:sig});

  // Container-level listeners (always active regardless of draw mode)
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
    if(!S.drawMode&&!ch.draggingDraw&&!ch.ruler?.active&&!_anyChartPanning)updateChartIndTooltip(ch,e.clientX,e.clientY,container);
    else hideChartIndTooltip();
  },{signal:sig});
  container.addEventListener('mouseleave',()=>{
    ch.hoveredIdx=-1;
    ch.hoverX=0;ch.hoverY=0;
    hideChartIndTooltip();
    rCanvas(ch);
  },{signal:sig});
  container.addEventListener('mousedown',e=>{if(e.button===1){e.preventDefault();onRulerStart(ch,e,container);}},{capture:true,signal:sig});
  container.addEventListener('mousemove',e=>{if(ch.ruler?.active)onRulerMove(ch,e,container);},{capture:true,signal:sig});
  container.addEventListener('mouseup',e=>{if(e.button===1&&ch.ruler?.active)onRulerEnd(ch,e);},{capture:true,signal:sig});
  // #4: Container-level RMB (works in cursor mode when interact is non-interactive)
  container.addEventListener('contextmenu',e=>{
    if(S.drawMode)return; // already handled by interact
    e.preventDefault();
    // Check if RMB is near ruler • if so, remove ruler
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

  // Drag drawing points • cursor mode
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
    if(!ch.draggingDraw._undoPushed){
      const drawSym=getChartSym(ch);
      if(drawSym)pushDrawUndo(drawSym);
      ch.draggingDraw._undoPushed=true;
      setLastDrawSym();
    }
    const{x,y}=getCoords(container,e.clientX,e.clientY);
    const d=ch.drawings[ch.draggingDraw.drawIdx];
    if(!d)return;
    if(ch.draggingDraw.pointKey==='trade'){
      const{isLong}=getTradeParams(d);
      const part=ch.draggingDraw.tradePart;
      // Horizontal drags • use raw X coordinate
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
        } else { // body • move whole rect horizontally
          d.p1={...d.p1,time:ch.draggingDraw.orig_p1_time+dt,price:ch.draggingDraw.orig_entry+dPrice};
          d.p2={...d.p2,time:ch.draggingDraw.orig_p2_time+dt};
          d.slPrice=ch.draggingDraw.orig_sl+dPrice;
          d.tpPrice=ch.draggingDraw.orig_tp+dPrice;
        }
        rCanvas(ch);return;
      }
      // Vertical drags • Ctrl: OHLC/live; иначе вертикаль к свече, цена от курсора
      const pt=e.ctrlKey?snapPoint(ch,x,y,true):snapPoint(ch,x,y,false);
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
      const pt=e.ctrlKey?snapPoint(ch,x,y,true):snapPoint(ch,x,y,false);
      if(!pt)return;
      d[ch.draggingDraw.pointKey]=pt;checkAlerts(ch,d);
    }
    _rCanvasImmediate(ch);
  },{capture:true,signal:sig});
  container.addEventListener('mouseup',e=>{
    if(e.button!==0||!ch.draggingDraw)return;
    const drawSym=getChartSym(ch);
    ch.draggingDraw=null;
    if(drawSym)schedulePersistDrawings(drawSym);
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

  const onVisibleRangePan=()=>{_onPanStart();rCanvas(ch,{immediate:true});};
  lc.timeScale().subscribeVisibleLogicalRangeChange(range=>{
    if(range&&range.from<HIST_TRIGGER){
      if(isFs)loadMoreFsHistory(fsIdx);else loadMoreHistory(slot);
    }
    onVisibleRangePan();
  });
  try{
    if(typeof lc.timeScale().subscribeVisibleTimeRangeChange==='function'){
      lc.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangePan);
    }
  }catch(e){}

  ch.lc=lc;ch.cs=cs;ch.vs=vs;ch.oiLine=oiLine;ch.bbUpperLine=bbUpperLine;ch.bbLowerLine=bbLowerLine;
  return true;
}

// ───────────────────────────────────────────────────────────────
//  CHART LOAD
// ───────────────────────────────────────────────────────────────
function getSymDrawings(sym){
  if(!S.symDrawings[sym])S.symDrawings[sym]=[];
  return S.symDrawings[sym];
}
function cloneDrawings(drawings){ return cloneDrawingsUi(drawings); }

let _persistSettingsTimer=null;
let _drawPersistTimer=null;
const _dirtyDrawSyms=new Set();

function collectUserSettings(){
  return {
    chartSymbols:S.charts.map(c=>c.sym||null),
    fsSym:S.fsSym||null,
    gridLayout:{gridSize:S.gridSize,gridRows:S.gridRows,gridCols:S.gridCols},
    fsLayout:{preset:S.fsLayoutPreset,count:S.fsChartCount,tfs:[...S.fsChartTfs]},
    volMin:S.minVol,
    minTrd:S.minTrd,
    page:S.page,
    sortId:S.sortId,
    sortDir:S.sortDir,
    sortAlpha:S.sortAlpha,
    tf:S.tf,
    symGroups:S.symGroups,
    symFavorites:S.symFavorites,
    lastGroupUsed:S.lastGroupUsed,
    activeGroupFilter:S.activeGroupFilter,
    search:S.q,
    chartAutoSync:S.chartAutoSync,
    chartHead:{order:[...S.chartHeadOrder],visible:[...S.chartHeadVisible]},
    columns:{order:[...S.colOrder],visible:[...S.colVisible]},
    lineColors:{...S.lineColors},
    chartView:{chartRightOffset:S.chartRightOffset,chartVisibleBars:S.chartVisibleBars},
    sessionFx:{...S.sessionFx},
    showOiOnChart:!!S.showOiOnChart,
    showBbOverlay:!!S.showBbOverlay,
    alertSettings:{...S.alertSettings},
    emaVisible:!!S.emaVisible,
    emaCrossSound:!!S.emaCrossSound,
    emaSettings:Array.isArray(S.emaSettings)?S.emaSettings.map(c=>({...c})):[],
    emaSymOverrides:S.emaSymOverrides&&typeof S.emaSymOverrides==='object'?JSON.parse(JSON.stringify(S.emaSymOverrides)):{},
    emaSymEnabled:S.emaSymEnabled&&typeof S.emaSymEnabled==='object'?{...S.emaSymEnabled}:{},
    potentialPresets:Array.isArray(S.potentialPresets)?JSON.parse(JSON.stringify(S.potentialPresets)):[],
    potFilterPreset:S._potFilterPreset||null,
    draw:{brushColor:_brushColor,brushWidth:_brushWidth},
    autoTrend:{...S.autoTrend},
    fastMode:true,
  };
}

let _lastPersistedSettingsJson='';
function schedulePersistUserSettings(){
  if(!getToken())return;
  clearTimeout(_persistSettingsTimer);
  _persistSettingsTimer=setTimeout(()=>{
    _persistSettingsTimer=null;
    const payload=collectUserSettings();
    const json=JSON.stringify(payload);
    if(json===_lastPersistedSettingsJson)return;
    _lastPersistedSettingsJson=json;
    saveUserSettings(payload);
  },2000);
}

function syncVolTrdSlidersFromState(){
  const vSl=Math.max(0,Math.min(25,Math.round(S.minVol/10)));
  const dispV=S.minVol===0?'0':`${S.minVol}M`;
  ['volVal','fsVolVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=dispV;});
  ['volSlider','fsVolSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=String(vSl);});
  const tSl=Math.max(0,Math.min(40,Math.round(S.minTrd/50000)));
  const dispT=S.minTrd===0?'0':(S.minTrd>=1e6?`${(S.minTrd/1e6).toFixed(1)}M`:`${Math.round(S.minTrd/1000)}K`);
  ['trdVal','fsTrdVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=dispT;});
  ['trdSlider','fsTrdSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=String(tSl);});
}

function rebumpDrawIdAfterLoad(){
  let m=S.drawIdCounter|0;
  const walk=d=>{
    if(!d||typeof d!=='object')return;
    if(typeof d.id==='number'&&d.id>m)m=d.id;
    if(Array.isArray(d.pts))for(const p of d.pts)walk(p);
  };
  for(const arr of Object.values(S.symDrawings)){
    if(!Array.isArray(arr))continue;
    for(const d of arr)walk(d);
  }
  S.drawIdCounter=m;
}

async function flushDrawingsToServer(){
  _drawPersistTimer=null;
  if(!getToken()||!_dirtyDrawSyms.size)return;
  const syms=[..._dirtyDrawSyms];
  _dirtyDrawSyms.clear();
  const token=getToken();
  if(!token)return;
  for(const sym of syms){
    try{
      await fetch(`${BACKEND}/api/user/drawings/${encodeURIComponent(sym)}`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({ drawings:cloneDrawings(getSymDrawings(sym)) }),
      });
    }catch(e){ console.warn('drawings persist',sym,e); }
  }
}

function schedulePersistDrawings(sym){
  if(!getToken()||!sym)return;
  _dirtyDrawSyms.add(sym);
  clearTimeout(_drawPersistTimer);
  _drawPersistTimer=setTimeout(flushDrawingsToServer,1500);
}
function _getDrawStack(map,sym){
  if(!map[sym])map[sym]=[];
  return map[sym];
}
function pushDrawUndo(sym){
  if(!sym)return;
  S.drawRedo={};
  _redoSymOrder.splice(0,_redoSymOrder.length,...([]));
  const st=_getDrawStack(S.drawUndo,sym);
  st.push(cloneDrawings(getSymDrawings(sym)));
  if(st.length>DRAW_HISTORY_LIMIT)st.shift();
  _undoSymOrder.push(sym);
  if(_undoSymOrder.length>DRAW_HISTORY_LIMIT)_undoSymOrder.shift();
}
function undoLastDrawingAction(){
  while(_undoSymOrder.length){
    const sym=_undoSymOrder[_undoSymOrder.length-1];
    const st=_getDrawStack(S.drawUndo,sym);
    if(!st.length){_undoSymOrder.pop();continue;}
    _undoSymOrder.pop();
    _getDrawStack(S.drawRedo,sym).push(cloneDrawings(getSymDrawings(sym)));
    applySymDrawings(sym,st.pop());
    setLastDrawSym();
    _redoSymOrder.push(sym);
    return true;
  }
  return false;
}
function redoLastDrawingAction(){
  while(_redoSymOrder.length){
    const sym=_redoSymOrder[_redoSymOrder.length-1];
    const rst=_getDrawStack(S.drawRedo,sym);
    if(!rst.length){_redoSymOrder.pop();continue;}
    _redoSymOrder.pop();
    _getDrawStack(S.drawUndo,sym).push(cloneDrawings(getSymDrawings(sym)));
    applySymDrawings(sym,rst.pop());
    setLastDrawSym();
    _undoSymOrder.push(sym);
    return true;
  }
  return false;
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
  schedulePersistDrawings(sym);
}
function setSlotLoading(slot,on,text='Загрузка данных...'){
  const cb=document.getElementById(`cb${slot}`);
  if(!cb)return;
  let m=cb.querySelector('.chart-load-mask');
  if(!on){
    if(m)m.remove();
    return;
  }
  if(!m){
    m=document.createElement('div');
    m.className='chart-load-mask';
    m.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;background:linear-gradient(to bottom,rgba(10,10,11,.10),rgba(10,10,11,.45));z-index:7';
    m.innerHTML='<div class="cloading"><span class="cloading-dot"></span><span class="cloading-dot"></span><span class="cloading-dot"></span></div>';
    cb.appendChild(m);
  }
  m.title=text;
}
async function loadChart(slot,sym){
  const ch=S.charts[slot];
  if(!sym){
    ch.sym=null;ch.candles=[];ch.drawings=[];ch._histBootstrapDone=false;
    setSlotLoading(slot,false);
    setText(`cs${slot}`,'•');
    clearChartHeadValues(slot);
    const cb=document.getElementById(`cb${slot}`);
    if(cb)cb.innerHTML=`<div class="cph"><span class="cph-n">${slot+1}</span><span style="font-size:9px;color:var(--text3)">пусто</span></div>`;
    return;
  }
  ch.sym=sym;ch.candles=[];ch.histLoading=false;ch._histBootstrapDone=false;
  ch._oiHist=[];ch._oiRaw=[];ch._oiLastFetchTs=0;
  ch.drawings=getSymDrawings(sym); // shared reference
  setText(`cs${slot}`,sym.replace(/USDT$/,''));
  setCoinIcon(`ci${slot}`,sym);
  const cb=document.getElementById(`cb${slot}`);
  if(cb)cb.innerHTML='<div class="cloading"><span class="cloading-dot"></span><span class="cloading-dot"></span><span class="cloading-dot"></span></div>';
  initLCChart(slot);
  setSlotLoading(slot,true);
  const wm=document.getElementById(`wm${slot}`);if(wm)wm.textContent=sym.replace(/USDT$/,'');
  const cacheKey=`${S.tf}:${sym}`;
  const cached=S.histCache[cacheKey];
  // Avoid reusing too-short caches: it causes inconsistent "bars shown" on first load (e.g. 50 vs 90).
  const wantMinCache=Math.max(
    MIN_CHART_CANDLES,
    (S.chartVisibleBars|0)+(S.chartRightOffset|0)+8
  );
  if(Array.isArray(cached)&&cached.length>=wantMinCache){
    ch.candles=cached.slice(-HIST_CACHE_MAX);
    paintSlotData(slot);
    refreshChartOiSeries(ch,S.tf,sym);
    if(S.showDensity)fetchOrderBookUi(sym, densityDeps);
    return;
  }
  if(Array.isArray(cached)&&cached.length&&cached.length<MIN_CHART_CANDLES)delete S.histCache[cacheKey];
  try{
    // Prefer parallel fetch of initial + next chunk so big charts fill faster.
    const tfM=tfMs(S.tf);
    const [raw1,raw2]=await Promise.all([
      fj(`${API}/klines?symbol=${sym}&interval=${S.tf}&limit=${HIST_INITIAL}`),
      fj(`${API}/klines?symbol=${sym}&interval=${S.tf}&limit=${HIST_LIMIT}&endTime=${Date.now()-HIST_INITIAL*tfM}`)
    ]);
    if(ch.sym!==sym)return;
    const merged=mergeKlineChunks(parseKlines(raw1),parseKlines(raw2));
    ch.candles=merged.slice(-HIST_CACHE_MAX);
    if(ch.candles.length<MIN_CHART_CANDLES){
      const raw=await fj(`${API}/klines?symbol=${sym}&interval=${S.tf}&limit=${Math.max(HIST_INITIAL,800)}`);
      if(ch.sym!==sym)return;
      ch.candles=parseKlines(raw).slice(-HIST_CACHE_MAX);
    }
    if(ch.candles.length>=MIN_CHART_CANDLES)S.histCache[cacheKey]=ch.candles.slice();
    paintSlotData(slot);
    refreshChartOiSeries(ch,S.tf,sym);
    if(S.showDensity)fetchOrderBookUi(sym, densityDeps); // #1: pre-fetch OB for density
  }catch(e){
    if(cb&&ch.sym===sym)cb.innerHTML=`<div class="cph"><span style="color:var(--red);font-size:10px">Ошибка загрузки</span></div>`;
    // If network briefly drops, retry once after a short delay (prevents "dead" chart tiles).
    setTimeout(()=>{ if(ch.sym===sym) loadChart(slot,sym); }, 3500);
  }
}

function paintSlotData(slot){
  const ch=S.charts[slot];
  if(!ch.candles.length||!ch.cs)return;
  if(ch.candles.length<MIN_CHART_CANDLES){
    ch._histBootstrapDone=false;
    setSlotLoading(slot,true,'Догружаем историю...');
    ch._thinPaintRetries=(ch._thinPaintRetries||0)+1;
    if(ch._thinPaintRetries<=3&&ch.sym){
      const sym=ch.sym,ck=`${S.tf}:${sym}`,tf=S.tf;
      delete S.histCache[ck];
      (async()=>{
        try{
          const raw=await fj(`${API}/klines?symbol=${sym}&interval=${tf}&limit=${Math.max(HIST_INITIAL,800)}`);
          if(ch.sym!==sym||!ch.cs)return;
          ch.candles=parseKlines(raw).slice(-HIST_CACHE_MAX);
          if(ch.candles.length>=MIN_CHART_CANDLES)S.histCache[ck]=ch.candles.slice();
          paintSlotData(slot);
        }catch(e){}
      })();
    }
    return;
  }
  ch._histBootstrapDone=true;
  setSlotLoading(slot,false);
  ch._thinPaintRetries=0;
  try{
    const lp=ch.candles[ch.candles.length-1].c;
    ch.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lp)}});
    ch.cs.setData(ch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    ch.vs.setData(ch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    repaintBbSeries(ch);
    repaintOiSeries(ch);
    syncLivePriceLabel(ch,lp,ch.candles[ch.candles.length-1].o);
    // Reset range guard on fresh data so applyDefaultChartView actually applies
    ch._lastAppliedRangeFrom=null;ch._lastAppliedRangeTo=null;ch._lastAppliedRo=null;
    applyDefaultChartView(ch);
    updateChartHeader(slot,ch.sym);
    rCanvas(ch);
  }catch(e){console.warn('paintSlotData',e);}
}

function updateChartHeader(slot,sym){
  const t=S.tk[sym]||{};const m=S.mx[sym]||{};
  if(t.p)setText(`cp${slot}`,fmtPrice(t.p));
  const elChg=document.getElementById(`chs${slot}-chg`);
  if(elChg){
    if(t.c24!=null){
      elChg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';
      elChg.className='cchg '+(t.c24>=0?'p':'n');
    }else{elChg.textContent='';elChg.className='cchg';}
  }
  const elVol=document.getElementById(`chs${slot}-vol`);
  if(elVol)elVol.innerHTML=t.qv?`<span style="opacity:.55">◼</span>${fk(t.qv)}`:'';
  const elTrd=document.getElementById(`chs${slot}-trd`);
  if(elTrd)elTrd.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const elNatr=document.getElementById(`chs${slot}-natr`);
  if(elNatr){
    const na=m.na14;
    elNatr.textContent=na!=null?`${fn(na,2)}%`:'';
  }
  const corVal=m.corr14??m.corr;
  const elCorr=document.getElementById(`chs${slot}-corr`);
  if(elCorr)elCorr.innerHTML=corVal!=null?`<span style="opacity:.55">∞</span>${fn(corVal,2)}`:'';
  const dot=document.getElementById(`cgd${slot}`);
  if(dot)styleGroupDot(dot,sym);
  // If stats wrap into two lines, tighten spacing to avoid clipping.
  const head=document.getElementById(`cc${slot}`)?.querySelector('.chead');
  const stats=document.getElementById(`chs${slot}`);
  if(head&&stats){
    requestAnimationFrame(()=>{
      // wrap if stats don't fit into the header height
      const wrap=stats.scrollHeight>head.clientHeight;
      head.classList.toggle('wrap',wrap);
    });
  }
}

async function loadMoreHistory(slot){
  const ch=S.charts[slot];
  if(!ch.sym||ch.histLoading||!ch.candles.length||!ch.lc)return;
  ch.histLoading=true;
  try{
    const raw=await fj(`${API}/klines?symbol=${ch.sym}&interval=${S.tf}&limit=${HIST_LIMIT}&endTime=${ch.candles[0].t-1}`);
    if(!raw||!raw.length){ch.histLoading=false;return;}
    const nc=parseKlines(raw);if(!ch.cs||!ch.lc)return;
    const tsApi=ch.lc.timeScale();
    let logRange=null,vTime=null;
    try{
      logRange=(typeof tsApi.getVisibleLogicalRange==='function')?tsApi.getVisibleLogicalRange():null;
    }catch(e){}
    try{
      if(typeof tsApi.getVisibleRange==='function')vTime=tsApi.getVisibleRange();
    }catch(e){}
    let pr=null;
    try{
      const ps=typeof ch.cs.priceScale==='function'?ch.cs.priceScale():null;
      if(ps&&typeof ps.getVisibleRange==='function')pr=ps.getVisibleRange();
    }catch(e){}
    const prepended=nc.length;
    ch.candles=[...nc,...ch.candles].slice(-HIST_CACHE_MAX);
    // Keep cache bounded and avoid persisting too-short histories (causes inconsistent visible bars on next load).
    const wantMinCache=Math.max(MIN_CHART_CANDLES,(S.chartVisibleBars|0)+(S.chartRightOffset|0)+8);
    if(ch.candles.length>=wantMinCache)S.histCache[`${S.tf}:${ch.sym}`]=ch.candles.slice(-HIST_CACHE_MAX);
    // Schedule heavy setData on idle to avoid blocking pan interaction
    const merged=ch.candles;
    const doSet=()=>{
      if(!ch.cs||!ch.lc)return;
      try{
        ch.cs.setData(merged.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
        ch.vs.setData(merged.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
        const tsScale=ch.lc.timeScale();
        const ro=Math.max(0,Math.min(36,S.chartRightOffset|0));
        try{tsScale.applyOptions({rightOffset:ro,fixRightEdge:false});}catch(e){}
        if(logRange&&typeof logRange.from==='number'&&typeof logRange.to==='number'&&typeof tsScale.setVisibleLogicalRange==='function'){
          try{tsScale.setVisibleLogicalRange({from:logRange.from+prepended,to:logRange.to+prepended});}catch(e){}
        }else if(vTime&&vTime.from!=null&&vTime.to!=null){try{tsScale.setVisibleRange(vTime);}catch(e){}}
        try{
          const ps=typeof ch.cs.priceScale==='function'?ch.cs.priceScale():null;
          if(pr&&ps&&typeof ps.setVisibleRange==='function')ps.setVisibleRange(pr);
        }catch(e){}
        // Reset range guard so applyDefaultChartView can run again when new data settles
        ch._lastAppliedRangeFrom=null;ch._lastAppliedRangeTo=null;ch._lastAppliedRo=null;
        repaintBbSeries(ch);
        if(S.showOiOnChart&&ch.sym)void refreshChartOiSeries(ch,S.tf,ch.sym);
        else{ch._oiHist=alignOiToCandles(merged,ch._oiRaw||[]);repaintOiSeries(ch);}
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

// ───────────────────────────────────────────────────────────────
//  CANVAS DRAWING SYSTEM
// ───────────────────────────────────────────────────────────────
function getCoords(container,cx,cy){const r=container.getBoundingClientRect();return{x:cx-r.left,y:cy-r.top};}

function timeToCoordX(ch,time){ return timeToCoordXUi(ch,time); }

function pixelToPoint(ch,x,y){ return pixelToPointUi(ch,x,y); }

function chartLivePriceForSnap(ch){ const __dctx = makeDrawingCtx({ tk: S.tk, fsSym: S.fsSym, fsCharts: S.fsCharts||[], tf: S.tf, lineColors: S.lineColors||{} }); return chartLivePriceForSnapUi(ch, __dctx); }

function inferBarChartSec(ch){ const __dctx = makeDrawingCtx({ tk: S.tk, fsSym: S.fsSym, fsCharts: S.fsCharts||[], tf: S.tf, lineColors: S.lineColors||{} }); return inferBarChartSecUi(ch, __dctx); }

function snapPoint(ch,x,y,ctrl){ const __dctx = makeDrawingCtx({ tk: S.tk, fsSym: S.fsSym, fsCharts: S.fsCharts||[], tf: S.tf, lineColors: S.lineColors||{} }); return snapPointUi(ch,x,y,ctrl,__dctx); }

function _inferOhlcAnchor(candle,price){ return inferOhlcAnchorUi(candle,price); }

function resolveDrawPoint(ch,pt){ return resolveDrawPointUi(ch,pt); }

function _findPivots(candles,lb){ return findPivotsUi(candles,lb); }
function _trendLineTouches(candles,i0,p0,i1,p1,touchPct,side){ return trendLineTouchesUi(candles,i0,p0,i1,p1,touchPct,side); }
function detectAutoTrendlines(candles,opt){ return detectAutoTrendlinesUi(candles, { ...S.autoTrend, ...(opt||{}) }); }
function applyAutoTrendlinesToChart(ch,replace=false){
  if(!ch?.candles?.length)return 0;
  const sym=getChartSym(ch);
  const lines=detectAutoTrendlines(ch.candles,S.autoTrend);
  if(!lines.length)return 0;
  if(sym)pushDrawUndo(sym);
  if(replace){
    ch.drawings=ch.drawings.filter(d=>!d.autoTrend);
  }
  const col=S.lineColors.autotl||'#38bdf8';
  for(const ln of lines){
    ch.drawings.push({
      id:++S.drawIdCounter,
      type:'tline',
      p1:ln.p1,
      p2:ln.p2,
      color:col,
      autoTrend:true,
      trendSide:ln.side,
    });
  }
  if(sym)schedulePersistDrawings(sym);
  rCanvas(ch,{immediate:true});
  return lines.length;
}
function runAutoTrendlinesOnVisibleCharts(){
  let n=0;
  const targets=S.fsOpen?[...S.fsCharts.filter(c=>c.lc&&c.candles?.length),...S.charts.filter(c=>c.sym&&c.candles?.length)]
    :S.charts.filter(c=>c.sym&&c.candles?.length);
  for(const ch of targets){
    n+=applyAutoTrendlinesToChart(ch,true);
  }
  return n;
}
function setAutoTrendSetting(key,val){
  if(!S.autoTrend)S.autoTrend={};
  S.autoTrend[key]=val;
  schedulePersistUserSettings();
}

// Distance from point to drawing (screen pixels)
function drawingDist(ch,d,px,py){ return drawingDistUi(ch,d,px,py); }

function findDrawingNear(ch,px,py){ return findDrawingNearUi(ch,px,py,window.__drawHit||DRAW_HIT); }

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
    const drawSym=getChartSym(ch);
    if(drawSym)pushDrawUndo(drawSym);
    ch.drawings.splice(idx,1);ch.hoveredIdx=-1;
    setLastDrawSym();
    rCanvas(ch);
    if(drawSym)schedulePersistDrawings(drawSym);
  }
}

// ───────────────────────────────────────────────────────────────
//  DENSITY (ORDER BOOK CLUSTERS) • Fix #1: uses real depth API
// ───────────────────────────────────────────────────────────────
// _obCache, _obQueue, _obPending, _densityFirstSeen and the order-book
// cache live as state fields on S (initialised lazily by the density
// module). _densityCache is the in-render cache.
// NB: must be declared BEFORE densityDeps, because the object literal
// below reads it at module-evaluation time (TDZ otherwise).
const _densityCache=new Map(); // sym → {ts, zones}

// Shared deps for density module (order-book fetch + cache).
const densityDeps = {
  S,
  API,
  fetchJSON: fj,
  fmtPrice,
  fk,
  rCanvas,
  timeToCoordX,
  densityCache: _densityCache,
  consoleWarn: (...args) => console.warn(...args),
};

function drawSessionZones(ctx,ch,W,H){
  if(!S.sessionFx?.enabled||!ch?.lc)return;
  const ts=ch.lc.timeScale();
  if(!ts)return;
  const vr=ts.getVisibleRange?.();
  if(!vr?.from||!vr?.to)return;
  const from=Math.floor(vr.from),to=Math.ceil(vr.to);
  if(!isFinite(from)||!isFinite(to)||to<=from)return;
  const sessionColors={
    ny:'rgba(59,130,246,0.04)',
    ld:'rgba(234,179,8,0.038)',
    as:'rgba(139,92,246,0.04)',
  };
  const borderColors={
    ny:'rgba(59,130,246,0.28)',
    ld:'rgba(234,179,8,0.25)',
    as:'rgba(139,92,246,0.28)',
  };
  const fromUtcMs=(from-TZ_OFFSET_S)*1000;
  const toUtcMs=(to-TZ_OFFSET_S)*1000;
  const dayMs=86400000;
  const dayStart=Math.floor(fromUtcMs/dayMs)*dayMs-dayMs;
  const sessions=[
    {id:'as',enabled:S.sessionFx.asia!==false,startH:0,endH:9},
    {id:'ld',enabled:S.sessionFx.london!==false,startH:8,endH:17},
    {id:'ny',enabled:S.sessionFx.ny!==false,startH:13,endH:22},
  ];
  for(let d=dayStart;d<=toUtcMs+dayMs;d+=dayMs){
    for(const s of sessions){
      if(!s.enabled)continue;
      const sUtc=d+s.startH*3600000;
      const eUtc=d+s.endH*3600000;
      if(eUtc<fromUtcMs||sUtc>toUtcMs)continue;
      const x0=ts.timeToCoordinate(Math.floor(sUtc/1000)+TZ_OFFSET_S);
      const x1=ts.timeToCoordinate(Math.floor(eUtc/1000)+TZ_OFFSET_S);
      if(x0==null||x1==null||x1<=x0)continue;
      const xs=Math.max(0,x0),xe=Math.min(W,x1);
      if(xe<=xs)continue;
      ctx.fillStyle=sessionColors[s.id];
      ctx.fillRect(xs,0,xe-xs,H);
      ctx.strokeStyle=borderColors[s.id];
      ctx.lineWidth=1.1;
      ctx.beginPath();ctx.moveTo(xs,0);ctx.lineTo(xs,H);ctx.stroke();
      ctx.beginPath();ctx.moveTo(xe,0);ctx.lineTo(xe,H);ctx.stroke();
    }
  }
}

function drawDensities(ctx,ch,W,H){
  drawZonesUi(ctx,ch,W,H,densityDeps);
}

// Track Ctrl key globally • Fix #5
let _ctrlHeld=false;
document.addEventListener('keydown',e=>{if(e.key==='Control'||e.key==='Meta')_ctrlHeld=true;});
document.addEventListener('keyup',e=>{if(e.key==='Control'||e.key==='Meta')_ctrlHeld=false;});

// Price axis width estimate (LW Charts right scale ~= 65px)
const PRICE_AXIS_W=65;
const TIME_AXIS_H=22;

// ”Ђ”Ђ Render canvas ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
// Per-chart RAF guard: only one pending rCanvas per chart at a time
function rCanvas(ch,opts){
  if(_anyChartPanning||opts?.immediate){
    ch._rCanvasRaf=false;
    _rCanvasImmediate(ch);
    return;
  }
  if(ch._rCanvasRaf)return;
  ch._rCanvasRaf=true;
  requestAnimationFrame(()=>{
    ch._rCanvasRaf=false;
    _rCanvasImmediate(ch);
  });
}

function _rCanvasGridLabImmediate(ch){
  const canvas=ch.canvas;if(!canvas||!ch.lc||!ch.cs)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const drawW=Math.max(1,W-PRICE_AXIS_W);
  const drawH=Math.max(1,H-TIME_AXIS_H);
  ctx.save();ctx.beginPath();ctx.rect(0,0,drawW,drawH);ctx.clip();
  if(ch.ruler)drawRuler(ctx,ch);
  let dragPr=null,dgKind=null;
  try{
    const modal=document.getElementById('gridLabModal');
    const body=modal?.querySelector('#gridLabBody');
    const gctx=body?._gbChartCtx;
    const dg=gctx?._gbDrag;
    if(dg&&(dg.kind==='high'||dg.kind==='low')&&dg.previewPrice!=null&&isFinite(+dg.previewPrice)){
      dragPr=+dg.previewPrice;
      dgKind=dg.kind;
    }
  }catch(e){}
  if(dragPr!=null){
    const yy=ch.cs.priceToCoordinate(dragPr);
    if(yy!=null&&!isNaN(yy)){
      ctx.save();
      ctx.strokeStyle=dgKind==='high'?'rgba(239,68,68,.78)':'rgba(52,211,153,.75)';
      ctx.lineWidth=1.5;
      ctx.setLineDash([5,5]);
      ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(drawW,yy);ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  let anchPr=null;
  try{
    const modal=document.getElementById('gridLabModal');
    const bod=modal?.querySelector('#gridLabBody');
    const ap=bod?._gbChartCtx?._gbAnchorPreviewPrice;
    if(ap!=null&&isFinite(+ap))anchPr=+ap;
  }catch(e){}
  if(anchPr!=null){
    const yyA=ch.cs.priceToCoordinate(anchPr);
    if(yyA!=null&&!isNaN(yyA)){
      ctx.save();
      ctx.strokeStyle='rgba(245,158,11,.88)';
      ctx.lineWidth=2;
      ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.moveTo(0,yyA);ctx.lineTo(drawW,yyA);ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  ctx.restore();
  if(ch.hoverX>0&&ch.hoverX<drawW&&ch.hoverY>0&&ch.hoverY<H){
    drawCustomCrosshair(ctx,ch,drawW,H);
  }
}

function _rCanvasImmediate(ch){
  if(ch._gridLabChart)return _rCanvasGridLabImmediate(ch);
  const canvas=ch.canvas;if(!canvas||!ch.lc||!ch.cs||!ch.vs)return;
  ch._emaHoverZones=[];
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  // #3: clip drawing area so we don't overdraw the axes (price/time)
  const drawW=Math.max(1,W-PRICE_AXIS_W);
  const drawH=Math.max(1,H-TIME_AXIS_H);
  ctx.save();ctx.beginPath();ctx.rect(0,0,drawW,drawH);ctx.clip();
  drawSessionZones(ctx,ch,drawW,drawH);
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
  // Custom crosshair: всегда при X к свече; без Ctrl • Y свободно; с Ctrl • Y к O/H/L/C или к цене.
  if(ch.hoverX>0&&ch.hoverX<drawW&&ch.hoverY>0&&ch.hoverY<H){
    drawCustomCrosshair(ctx,ch,drawW,H);
  }
}

// Custom crosshair: без Ctrl • вертикаль к свече, горизонталь свободна; с Ctrl • + магнит по цене к OHLC/текущей.
function drawCustomCrosshair(ctx,ch,W,H){
  const x=ch.hoverX,y=ch.hoverY;
  const ptV=snapPoint(ch,x,y,false);
  const dx=ptV?(timeToCoordX(ch,ptV.time)??x):x;
  const ptH=_ctrlHeld?snapPoint(ch,x,y,true):null;
  const dy=ptH?(ch.cs.priceToCoordinate(ptH.price)??y):y;
  const col='#60607088';
  ctx.save();
  ctx.setLineDash([3,3]);
  ctx.strokeStyle=col;
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,dy);ctx.lineTo(W,dy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(dx,0);ctx.lineTo(dx,H);ctx.stroke();
  ctx.setLineDash([]);
  // Price label
  const price=ptH?ptH.price:ch.cs?.coordinateToPrice(y);
  if(price!=null){
    const label=fmtPrice(price);
    ctx.font='9px JetBrains Mono,monospace';
    const tw=ctx.measureText(label).width+8;
    ctx.fillStyle='#252530';
    ctx.fillRect(W-tw-2,dy-9,tw+2,14);
    ctx.fillStyle='#80809a';
    ctx.textAlign='right';ctx.fillText(label,W-4,dy+1);ctx.textAlign='left';
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
      // Use LOCAL timezone methods (getDate/getHours) • browser converts automatically
      const tStr=`${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      let volStr='';
      const tMs=(time-TZ_OFFSET_S)*1000;
      const tfM=tfMs(S.fsCharts.includes(ch)?ch.tf:S.tf);
      const cHit=ch.candles.find(c=>Math.abs(c.t-tMs)<Math.max(2000,tfM*0.55));
      if(cHit&&isFinite(cHit.qv))volStr=`ОБ: ${fk(cHit.qv)}$`;
      ctx.save();ctx.font='9px JetBrains Mono,monospace';
      const tw=Math.max(ctx.measureText(tStr).width,volStr?ctx.measureText(volStr).width:0)+8;
      const lx=Math.min(Math.max(dx-tw/2,0),W-tw);
      ctx.fillStyle='#1c1c28';
      const lblH=volStr?24:14;
      const y0=H-lblH;
      ctx.fillRect(lx,y0,tw,lblH);
      ctx.fillStyle='#80809a';
      ctx.textAlign='left';
      ctx.fillText(tStr,lx+4,y0+10);
      if(volStr)ctx.fillText(volStr,lx+4,y0+20);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawingLineColor(d){ const __dctx = makeDrawingCtx({ tk: S.tk, fsSym: S.fsSym, fsCharts: S.fsCharts||[], tf: S.tf, lineColors: S.lineColors||{} }); return drawingLineColorUi(d, __dctx); }

function emaHoverTip(period){
  return`EMA ${period} • экспоненциальная скользящая средняя по ${period} закрытиям свечи. Сглаживает ценовой шум и показывает локальный тренд; расхождение и пересечение нескольких EMA помогают оценить силу движения.`;
}

function hideChartIndTooltip(){
  const tt=document.getElementById('chartIndTooltip');
  if(tt)tt.style.display='none';
}
function updateChartIndTooltip(ch,clientX,clientY,container){
  const tt=document.getElementById('chartIndTooltip');
  if(!tt||!ch?.canvas)return;
  const sym=ch.sym||S.fsSym;
  const symEnabled=!!(sym&&S.emaSymEnabled[sym]);
  if(!S.emaVisible&&!symEnabled){hideChartIndTooltip();return;}
  const{x,y}=getCoords(container,clientX,clientY);
  const drawW=ch.canvas.width-PRICE_AXIS_W;
  const drawH=ch.canvas.height-TIME_AXIS_H;
  if(x<=0||y<=0||x>=drawW||y>=drawH){hideChartIndTooltip();return;}
  const zones=ch._emaHoverZones;
  if(!zones||!zones.length){hideChartIndTooltip();return;}
  for(const z of zones){
    if(x>=z.x1&&x<=z.x2&&y>=z.y1&&y<=z.y2){
      tt.textContent=z.tip;
      tt.style.display='block';
      tt.style.left=(clientX+14)+'px';
      tt.style.top=(clientY+14)+'px';
      return;
    }
  }
  hideChartIndTooltip();
}

function drawHRay(ctx,ch,d,W,hov){
  const p1=resolveDrawPoint(ch,d.p1);
  const y=ch.cs.priceToCoordinate(p1.price);if(y===null)return;
  const x0=timeToCoordX(ch,p1.time)??0;
  const col=drawingLineColor(d);
  // Clamp x0 so ray always starts left-of or at current position, draws rightward
  const xs=Math.max(0,x0);
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=hov?2:1;
  ctx.moveTo(xs,y);ctx.lineTo(W,y);ctx.stroke();
  ctx.fillStyle=col;ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='right';
  ctx.fillText(fmtPrice(p1.price),W-3,y-3);ctx.textAlign='left';
  ctx.beginPath();ctx.arc(xs,y,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawTLine(ctx,ch,d,hov){
  const p1=resolveDrawPoint(ch,d.p1),p2=resolveDrawPoint(ch,d.p2);
  const x1=timeToCoordX(ch,p1.time);
  const y1=ch.cs.priceToCoordinate(p1.price);
  const x2=timeToCoordX(ch,p2.time);
  const y2=ch.cs.priceToCoordinate(p2.price);
  if(x1===null||y1===null||x2===null||y2===null)return;
  const col=drawingLineColor(d);
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=hov?2.5:1.2;
  ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  ctx.beginPath();ctx.fillStyle=col;ctx.arc(x1,y1,3,0,Math.PI*2);ctx.fill();
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

// ”Ђ”Ђ Alert Ray ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
function drawAlertRay(ctx,ch,d,W,hov){
  const p1=resolveDrawPoint(ch,d.p1);
  const y=ch.cs.priceToCoordinate(p1.price);if(y===null)return;
  const x0=timeToCoordX(ch,p1.time)??0;
  const xs=Math.max(0,x0);
  const col=drawingLineColor(d);
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  if(d.alertPct!=null&&d.alertPct>0){
    const bandH=Math.abs((ch.cs.priceToCoordinate(d.p1.price*(1-d.alertPct/100))??y)-y);
    ctx.fillStyle=hexToRgbA(col,0.06);
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
  const p1=resolveDrawPoint(ch,d.p1),p2=resolveDrawPoint(ch,d.p2);
  const x1=timeToCoordX(ch,p1.time);
  const y1=ch.cs.priceToCoordinate(p1.price);
  const x2=timeToCoordX(ch,p2.time);
  const y2=ch.cs.priceToCoordinate(p2.price);
  if(x1===null||y1===null||x2===null||y2===null)return;
  const col=drawingLineColor(d);
  ctx.save();
  if(hov){ctx.shadowColor=col;ctx.shadowBlur=6;}
  // #7: Draw ±alertPct% band
  if(d.alertPct!=null&&d.alertPct>0){
    const factor=d.alertPct/100;
    // Upper band points (prices * (1+factor))
    const y1u=ch.cs.priceToCoordinate(p1.price*(1+factor));
    const y2u=ch.cs.priceToCoordinate(p2.price*(1+factor));
    const y1l=ch.cs.priceToCoordinate(p1.price*(1-factor));
    const y2l=ch.cs.priceToCoordinate(p2.price*(1-factor));
    if(y1u!=null&&y2u!=null&&y1l!=null&&y2l!=null){
      // Filled polygon
      ctx.beginPath();
      ctx.moveTo(x1,y1u);ctx.lineTo(x2,y2u);
      ctx.lineTo(x2,y2l);ctx.lineTo(x1,y1l);ctx.closePath();
      ctx.fillStyle=hexToRgbA(col,0.06);ctx.fill();
      // Upper & lower dashed lines
      ctx.beginPath();ctx.strokeStyle=hexToRgbA(col,0.35);ctx.lineWidth=0.8;ctx.setLineDash([4,4]);
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

// ”Ђ”Ђ Brush stroke ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
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

// ”Ђ”Ђ Trade helpers ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
// Returns entry/tp/sl as absolute prices (migrates old rr-based format)
function getTradeParams(d){ return getTradeParamsUi(d); }
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

// ”Ђ”Ђ Trade Rectangle (Long / Short simulation) ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
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

  // Labels
  ctx.font='bold 9px JetBrains Mono,monospace';
  const pctTp=isLong
    ?((tpPrice-entryPrice)/entryPrice*100)
    :((entryPrice-tpPrice)/entryPrice*100);
  const pctSl=isLong
    ?((slPrice-entryPrice)/entryPrice*100)
    :((entryPrice-slPrice)/entryPrice*100);
  ctx.fillStyle=tpCol;ctx.globalAlpha=0.9;ctx.textAlign='left';
  ctx.fillText(`TP ${fmtPrice(tpPrice)} (${pctTp>=0?'+':''}${pctTp.toFixed(2)}%)`,rx+4,yTp+3);
  ctx.fillStyle=slCol;
  ctx.fillText(`SL ${fmtPrice(slPrice)} (${pctSl>=0?'+':''}${pctSl.toFixed(2)}%)`,rx+4,ySl+3);
  ctx.fillStyle='#ffffff88';ctx.font='9px JetBrains Mono,monospace';
  ctx.fillText(`Вход ${fmtPrice(entryPrice)} · R:R ${rr.toFixed(1)}:1`,lx+3,yEntry-4);
  ctx.fillStyle=dirCol;ctx.font='bold 10px JetBrains Mono,monospace';ctx.textAlign='center';
  ctx.fillText(isLong?'–І ЛОНГ':'–ј ШОРТ',(lx+rx)/2,(yTp+yEntry)/2+3);
  ctx.globalAlpha=1;ctx.restore();
}

// ”Ђ”Ђ EMA overlay ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
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
    result.push({t:candles[i].t,val:ema});
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
    'e2',
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
      const{t,val:emaVal}=vals[i];
      const px=timeToCoordX(ch,toChartTime(t));
      const py=ch.cs.priceToCoordinate(emaVal);
      if(px==null||py==null){started=false;continue;}
      if(px<-W||px>W*2){started=false;continue;}
      if(!started){ctx.moveTo(px,py);started=true;}
      else ctx.lineTo(px,py);
      lastPy=py;
    }
    ctx.stroke();
    // Label near right edge (+ hover target for tooltip)
    if(lastPy!=null&&lastPy>5&&lastPy<plotH-5){
      ctx.font='bold 8px JetBrains Mono,monospace';ctx.fillStyle=cfg.color;
      ctx.globalAlpha=0.95;ctx.textAlign='left';
      const label=`EMA${cfg.period}`;
      const tw=ctx.measureText(label).width;
      ctx.fillText(label,4,lastPy-3);
      ch._emaHoverZones.push({x1:1,y1:lastPy-11,x2:10+tw,y2:lastPy+5,tip:emaHoverTip(cfg.period)});
    }
  }
  ctx.globalAlpha=1;ctx.restore();
}

// ”Ђ”Ђ EMA Crossover alerts ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
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
      const a1=va[va.length-1].val,a2=va[va.length-2].val;
      const b1=vb[vb.length-1].val,b2=vb[vb.length-2].val;
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
        presetName:`[${tf}] EMA${a.period} ${dir} EMA${b.period} • ${label}`});
      if(S.alertLog.length>50)S.alertLog.pop();
      renderAlertLog();
      const badge=document.getElementById('alertBadge');
      if(badge){badge.textContent=S.alertLog.length;badge.style.display='inline';}
    }
  }
}

// ”Ђ”Ђ Alert Sound ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
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
    const drawSym=getChartSym(ch);
    if(drawSym)schedulePersistDrawings(drawSym);
    wrap.remove();
    [...S.charts,...S.fsCharts].forEach(c=>rCanvas(c));
  };
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')confirm();if(e.key==='Escape')wrap.remove();});
  setTimeout(()=>document.addEventListener('mousedown',function h(e){if(!wrap.contains(e.target)){confirm();document.removeEventListener('mousedown',h);}},true),100);
}

// ”Ђ”Ђ Interact events ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
function onInteractMove(ch,e,container){
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  ch.hoverX=x;ch.hoverY=y;
  // Mirror container-level hover detection in draw mode so alert rays highlight correctly.
  if(!ch.draggingDraw){
    const now=performance.now();
    if(now-(ch._lastHoverCheckTs||0)>32){
      ch.hoveredIdx=findDrawingNear(ch,x,y);
      ch._lastHoverCheckTs=now;
    }
  }
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
  const drawSym=getChartSym(ch);
  if(S.drawMode==='hray'){
    if(drawSym)pushDrawUndo(drawSym);
    ch.drawings.push({id:++S.drawIdCounter,type:'hray',p1:pt,color:S.lineColors.hray});
    setLastDrawSym();
    if(drawSym)schedulePersistDrawings(drawSym);
    rCanvas(ch);
    setDrawMode(null);
  }else if(S.drawMode==='tline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      if(drawSym)pushDrawUndo(drawSym);
      ch.drawings.push({id:++S.drawIdCounter,type:'tline',p1:ch.pendingP1,p2:pt,color:S.lineColors.tline});
      setLastDrawSym();
      if(drawSym)schedulePersistDrawings(drawSym);
      ch.pendingP1=null;rCanvas(ch);
      setDrawMode(null);
    }
  }else if(S.drawMode==='aray'){
    const d={id:++S.drawIdCounter,type:'aray',p1:pt,alertPct:null,_lastAlert:0,color:S.lineColors.aray};
    if(drawSym)pushDrawUndo(drawSym);
    ch.drawings.push(d);rCanvas(ch);
    setLastDrawSym();
    if(drawSym)schedulePersistDrawings(drawSym);
    showAlertPctInput(ch,d,container);
    setDrawMode(null);
  }else if(S.drawMode==='atline'){
    if(!ch.pendingP1)ch.pendingP1=pt;
    else{
      const d={id:++S.drawIdCounter,type:'atline',p1:ch.pendingP1,p2:pt,alertPct:null,_lastAlert:0,color:S.lineColors.atline};
      if(drawSym)pushDrawUndo(drawSym);
      ch.drawings.push(d);ch.pendingP1=null;rCanvas(ch);
      setLastDrawSym();
      if(drawSym)schedulePersistDrawings(drawSym);
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
      if(drawSym)pushDrawUndo(drawSym);
      ch.drawings.push(d);ch.pendingP1=null;rCanvas(ch);
      setLastDrawSym();
      if(drawSym)schedulePersistDrawings(drawSym);
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
  // Палитра для луча / линии / алертов (не лонг-шорт)
  const lp=document.getElementById('linePalette');
  if(lp){
    const lineModes=['hray','tline','aray','atline'];
    lp.classList.toggle('visible',mode&&mode!=='brush'&&lineModes.includes(mode));
  }
  if(mode&&['hray','tline','aray','atline'].includes(mode))syncLinePaletteForDrawMode();
  if(!mode)hideChartIndTooltip();
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

function refreshEMAButtonState(){ refreshEmaButtonStateUi({ S }); }

function toggleEMA(){
  toggleEmaUi({ S, clearEmaCache: () => _emaCache.clear(), rCanvas });
}

function openEMAEditor(mode='auto'){
  openEmaEditorModal(mode, {
    S,
    rCanvas,
    clearEmaCache: () => _emaCache.clear(),
    schedulePersistUserSettings,
  });
}
window.openEMAEditor=openEMAEditor;

// ”Ђ”Ђ Ruler ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ”Ђ
function clearAllRulers(){
  const tt=document.getElementById('rulerTooltip');
  if(tt)tt.style.display='none';
  for(const ch of [...S.charts,...S.fsCharts]){
    if(ch?.ruler)ch.ruler=null;
  }
}

function onRulerStart(ch,e,container){
  if(!ch.lc||!ch.cs)return;
  const{x,y}=getCoords(container,e.clientX,e.clientY);
  const pt=snapPoint(ch,x,y,e.ctrlKey)||pixelToPoint(ch,x,y);if(!pt)return;
  // Clear rulers on charts from opposite context (не трогаем основные графики из Grid Lab)
  if(!ch._gridLabChart){
    [...S.charts,...S.fsCharts].forEach((c)=>{if(c!==ch&&c.ruler){c.ruler=null;rCanvas(c);}});
  }
  ch.ruler={active:true,p1:pt,p2:pt,mouseX:e.clientX,mouseY:e.clientY};
  ch._rulerIsFsChart=!ch._gridLabChart&&S.fsCharts.includes(ch);
  _rCanvasImmediate(ch);
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
      scheduleRulerRedraw(fc);
    });
  }
  scheduleRulerRedraw(ch);
  // Tooltip (NATR/vol/trades) is heavier • throttle independently
  const now=performance.now();
  if(!ch._lastRulerTipTs||now-ch._lastRulerTipTs>50){
    ch._lastRulerTipTs=now;
    updateRulerTooltip(ch);
  }
}

// rAF-throttled ruler redraw • caps redraws at the browser's frame rate even
// when the mouse fires at 120Hz+. Each chart redraws at most once per frame.
function scheduleRulerRedraw(ch){
  if(ch._rulerRafPending)return;
  ch._rulerRafPending=true;
  requestAnimationFrame(()=>{
    ch._rulerRafPending=false;
    _rCanvasImmediate(ch);
  });
}
function onRulerEnd(ch){
  if(!ch.ruler)return;
  ch.ruler.active=false;
  if(ch._rulerIsFsChart){
    S.fsCharts.forEach(fc=>{
      if(fc===ch||!fc.ruler)return;
      fc.ruler.active=false;
      _rCanvasImmediate(fc);
    });
  }
  updateRulerTooltip(ch);
}

// Cached ruler-tooltip DOM nodes. The old version called
// getElementById 9× per mousemove which forces style/layout invalidation
// and is a big chunk of why the tooltip felt slow on the mini-charts.
let _rtNodes=null;
function _rtDom(){
  if(_rtNodes)return _rtNodes;
  _rtNodes={
    tt:document.getElementById('rulerTooltip'),
    pct:document.getElementById('rtPct'),
    bars:document.getElementById('rtBars'),
    time:document.getElementById('rtTime'),
    vol:document.getElementById('rtVol'),
    vr:document.getElementById('rtVr'),
    tr:document.getElementById('rtTr'),
    natr:document.getElementById('rtNatr'),
  };
  return _rtNodes;
}
// Binary search for first candle index with t >= target. Candles are
// sorted by time, so this turns the old O(n) findIndex into O(log n).
function _lowerBound(arr,t,lo,hi){
  while(lo<hi){const mid=(lo+hi)>>>1;if(arr[mid].t<t)lo=mid+1;else hi=mid;}
  return lo;
}

function updateRulerTooltip(ch){
  const d=_rtDom();
  if(!d.tt||!ch.ruler?.p1||!ch.ruler?.p2){if(d.tt)d.tt.style.display='none';return;}
  const r=ch.ruler;
  const pct=(r.p2.price-r.p1.price)/r.p1.price*100;
  const isUp=pct>=0;const col=isUp?'#1fa891':'#e04040';
  const tMin=(Math.min(r.p1.time,r.p2.time)-TZ_OFFSET_S)*1000;
  const tMax=(Math.max(r.p1.time,r.p2.time)-TZ_OFFSET_S)*1000;
  // Binary search the start index instead of scanning the whole candle
  // array — O(log n) instead of O(n) on every mouse move.
  const cnd=ch.candles;
  const n=cnd.length;
  let bars=0,vol=0,sumTr=0;
  let startIdx=_lowerBound(cnd,tMin,0,n);
  let endIdx=_lowerBound(cnd,tMax+1,startIdx,n);
  const rangeLen=endIdx-startIdx;
  for(let i=startIdx;i<endIdx;i++){vol+=cnd[i].qv;sumTr+=cnd[i].tr||0;}
  bars=rangeLen;

  // NATR of the range. Inline to avoid slicing `cnd` on every mousemove
  // (slice would allocate a new array and the existing calcNATR expects
  // a full candle array, not a sub-range). With a sub-range we need the
  // ATR over just [startIdx..endIdx).
  let natrTxt='•';
  if(rangeLen>=2){
    let atrSum=0;
    for(let i=startIdx+1;i<endIdx;i++){
      const k=cnd[i],p=cnd[i-1];
      atrSum+=Math.max(k.h-k.l,Math.abs(k.h-p.c),Math.abs(k.l-p.c));
    }
    const natr=atrSum/(rangeLen-1);
    const lastClose=cnd[endIdx-1].c;
    if(lastClose>0)natrTxt=fn(natr/lastClose*100,2)+'%';
  }

  // Volume spike: avg vol of range candles vs avg of preceding N candles
  let vrTxt='•', trTxt='•';
  if(rangeLen>0&&startIdx>0){
    const preN=Math.min(startIdx,bars*3,50);
    let avgVol=0,avgTr=0;
    for(let i=startIdx-preN;i<startIdx;i++){avgVol+=cnd[i].qv;avgTr+=cnd[i].tr||0;}
    avgVol/=preN;avgTr/=preN;
    if(avgVol>0)vrTxt=fn((vol/rangeLen)/avgVol,2)+'×';
    if(avgTr>0)trTxt=fn((sumTr/rangeLen)/avgTr,2)+'×';
  }

  // All DOM writes batched below — no getElementById in the hot path.
  const pctTxt=(isUp?'+':'')+pct.toFixed(3)+'%';
  if(d.pct.textContent!==pctTxt)d.pct.textContent=pctTxt;
  if(d.pct.style.color!==col)d.pct.style.color=col;
  const barsTxt=`Баров: ${bars}`;
  if(d.bars.textContent!==barsTxt)d.bars.textContent=barsTxt;
  const timeTxt=`Время: ${formatDuration(Math.abs(r.p2.time-r.p1.time))}`;
  if(d.time.textContent!==timeTxt)d.time.textContent=timeTxt;
  const volTxt=`Объём: ${fk(vol)} USDT`;
  if(d.vol.textContent!==volTxt)d.vol.textContent=volTxt;
  if(rangeLen>=1){
    const openPrice=cnd[startIdx].o;
    const closePrice=cnd[endIdx-1].c;
    const cndPct=(closePrice-openPrice)/openPrice*100;
    const cndCol=cndPct>=0?'#1fa891':'#e04040';
    const natrTxt2=`Свечи: ${cndPct>=0?'+':''}${cndPct.toFixed(3)}%`;
    if(d.natr.textContent!==natrTxt2)d.natr.textContent=natrTxt2;
    if(d.natr.style.color!==cndCol)d.natr.style.color=cndCol;
  } else {
    if(d.natr.textContent!=='Свечи: •')d.natr.textContent='Свечи: •';
    if(d.natr.style.color!=='')d.natr.style.color='';
  }
  const vrTxt2=`NATR: ${natrTxt}`;
  if(d.vr.textContent!==vrTxt2)d.vr.textContent=vrTxt2;
  const trTxt2=`ОБ*: ${vrTxt}  СД*: ${trTxt}`;
  if(d.tr.textContent!==trTxt2)d.tr.textContent=trTxt2;
  // Position via transform: translate3d — keeps the tooltip on its own
  // composited layer (CSS already has will-change:transform) and skips
  // layout entirely. The old style.left/top forced a layout pass per move.
  const tw=175,th=120;
  const x=Math.min(r.mouseX+18,window.innerWidth-tw-8);
  const y=Math.max(r.mouseY-th-8,4);
  d.tt.style.transform=`translate3d(${x}px, ${y}px, 0)`;
  d.tt.style.display='block';
}

// ───────────────────────────────────────────────────────────────
//  БЫСТРЫЙ ПОИСК МОНЕТЫ (печать с клавиатуры)
// ───────────────────────────────────────────────────────────────
function ensureQuickFindUI(){
  if(document.getElementById('quickFindModal'))return;
  const d=document.createElement('div');
  d.id='quickFindModal';
  d.style.cssText='display:none;position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,.5);align-items:flex-start;justify-content:center;padding-top:10vh;';
  d.innerHTML=`<div style="background:#111113;border:1px solid #252530;border-radius:8px;width:min(440px,94vw);box-shadow:0 12px 40px #000;">
  <div style="padding:10px 12px;border-bottom:1px solid #252530;font-size:11px;color:#80808f">Переход к монете</div>
  <div style="padding:10px 12px">
    <input id="qfInput" type="text" autocomplete="off" spellcheck="false" placeholder="Начните вводить тикервЂ¦"
      style="width:100%;box-sizing:border-box;background:#161619;border:1px solid #252530;border-radius:4px;padding:8px 10px;color:#e2e8f0;font:inherit;font-size:12px;outline:none">
    <div id="qfList" style="max-height:240px;overflow:auto;margin-top:8px;font-size:11px"></div>
    <div style="font-size:9px;color:#454555;margin-top:8px">Enter • выбрать первую · Esc • закрыть</div>
  </div></div>`;
  document.body.appendChild(d);
  d.addEventListener('mousedown',ev=>{if(ev.target===d)closeQuickFind();});
  const inp=document.getElementById('qfInput');
  inp.addEventListener('input',()=>{
    // Mirror the top search behaviour: if the user typed a Cyrillic char
    // on a Russian layout, remap it to the matching English key before
    // we filter. This lets people type tickers (BTC, ETH, ...) without
    // having to switch keyboard layout first.
    const raw=inp.value;
    const mapped=mapRuKeyboardToEn(raw);
    if(mapped!==raw){
      const pos=inp.selectionStart;
      inp.value=mapped;
      try{inp.setSelectionRange(pos,pos);}catch(e){}
    }
    renderQuickFindList();
  });
  inp.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){
      const first=document.querySelector('#qfList .qf-item');
      if(first?.dataset?.sym)jumpToSymbol(first.dataset.sym);
    }
  });
}
function openQuickFind(seed){
  ensureQuickFindUI();
  const m=document.getElementById('quickFindModal');
  const inp=document.getElementById('qfInput');
  // Map RU→EN layout so users typing on a Russian keyboard get the
  // English ticker they actually wanted (same logic as the top search).
  const mapped=mapRuKeyboardToEn(seed!=null&&seed!==''?String(seed):'').slice(0,24);
  inp.value=mapped;
  renderQuickFindList();
  m.style.display='flex';
  // Place the caret at the END so the next keystroke appends. Chromium
  // tends to select-all on focus() of a freshly-rendered input, so we
  // blur+focus to force a "fresh" focus state, then deselect. We do this
  // both synchronously and after a frame, because the modal is still
  // settling its layout when the sync block runs.
  try{ inp.blur(); }catch(e){}
  try{ inp.focus({preventScroll:true}); }catch(e){ try{inp.focus();}catch(_){} }
  const placeCaret=()=>{
    try{
      if(document.activeElement!==inp){
        try{inp.focus({preventScroll:true});}catch(_){inp.focus();}
      }
      const len=inp.value.length;
      inp.setSelectionRange(len,len);
    }catch(e){}
  };
  placeCaret();
  requestAnimationFrame(placeCaret);
  setTimeout(placeCaret,0);
}
function closeQuickFind(){
  const m=document.getElementById('quickFindModal');
  if(m){m.style.display='none';}
}
function renderQuickFindList(){
  const list=document.getElementById('qfList');
  const inp=document.getElementById('qfInput');
  if(!list||!inp)return;
  const q=inp.value.trim().toUpperCase();
  if(!q){list.innerHTML='<div style="padding:8px;color:#606070">Введите символы тикера</div>';return;}
  if(!S.syms.length){list.innerHTML='<div style="padding:8px;color:#606070">Список монет ещё не загружен</div>';return;}
  const rows=S.syms.filter(s=>s.includes(q)).slice(0,50);
  if(!rows.length){list.innerHTML='<div style="padding:8px;color:#606070">Нет совпадений</div>';return;}
  list.innerHTML=rows.map(s=>{
    const base=s.replace(/USDT$/,'');
    return`<div class="qf-item" data-sym="${s}" style="padding:7px 9px;cursor:pointer;border-radius:4px;color:#e2e8f0">${base}</div>`;
  }).join('');
  list.querySelectorAll('.qf-item').forEach(el=>{
    el.onmouseenter=()=>{el.style.background='#1c1c22';};
    el.onmouseleave=()=>{el.style.background='';};
    el.onclick=()=>jumpToSymbol(el.dataset.sym,{openFs:true});
  });
}
function jumpToSymbol(sym,{openFs=false}={}){
  if(!sym)return;
  // Try to find the symbol in the filtered/sorted list first (so the screener
  // can land on the right page). If filters (volume/trades/group/preset) hide
  // the symbol, fall back to opening it directly without touching the screener •
  // the user explicitly chose it from the quick-find popup.
  const rows=sortedRows();
  let idx=rows.findIndex(r=>r.sym===sym);
  if(idx<0){
    // Look up the symbol in the raw screener so we can still navigate to its page
    const raw=(S.mx[sym])?[S.mx[sym]]:S.syms.filter(s=>s===sym).map(s=>({sym:s}));
    if(raw.length){
      const allSyms=Object.values(S.mx);
      if(allSyms.length){
        // Recompute the row set with the SAME sort but WITHOUT filters/group/preset
        // so we get the symbol's position under the active sort.
        const sorted=[...allSyms];
        const sortId=S.sortId,sortDir=S.sortDir,sortAlpha=S.sortAlpha,sortAbs=S.sortAbs;
        sorted.sort((a,b)=>{
          if(sortAlpha)return sortDir==='asc'?a.sym.localeCompare(b.sym):b.sym.localeCompare(a.sym);
          const sortKey=sortId==='spv'?'spVol':sortId;
          let va=a[sortKey],vb=b[sortKey];
          if(sortAbs&&(sortId==='ch24'||sortId==='ch7d'||sortId==='cday'||sortId==='sp5'||sortId==='spv'||sortId==='oi1h'||sortId==='oi4h')){
            va=va!=null&&!isNaN(va)?Math.abs(va):va;vb=vb!=null&&!isNaN(vb)?Math.abs(vb):vb;
          }
          if(va==null||isNaN(va))return 1;if(vb==null||isNaN(vb))return-1;
          return sortDir==='desc'?vb-va:va-vb;
        });
        idx=sorted.findIndex(r=>r.sym===sym);
      }
    }
  }
  if(idx>=0)S.page=Math.floor(idx/S.charts.length);
  closeQuickFind();
  if(idx>=0){
    updateCharts();renderTable();
  }else{
    // Symbol not in screener at all • still honour the openFs request
    renderTable();
  }
  if(openFs)openFullscreenBySym(sym);
}

function handleUndoRedoShortcut(e){
  const tgt=e.target;
  const editable=tgt&&((tgt.tagName==='INPUT')||(tgt.tagName==='TEXTAREA')||tgt.isContentEditable);
  const mod=(e.ctrlKey||e.metaKey);
  if(!mod||e.altKey||editable)return false;
  const key=(e.key||'').toLowerCase();
  const code=(e.code||'').toLowerCase();
  const isZ=code==='keyz'||key==='z'||key==='я';
  const isY=code==='keyy'||key==='y'||key==='н';
  if(!isZ&&!isY)return false;
  const wantRedo=(e.shiftKey&&isZ)||isY;
  const ok=wantRedo?redoLastDrawingAction():undoLastDrawingAction();
  if(ok)e.preventDefault();
  return ok;
}

document.addEventListener('keydown',e=>{
  if(handleUndoRedoShortcut(e))return;
  const tgt=e.target;
  const editable=tgt&&((tgt.tagName==='INPUT')||(tgt.tagName==='TEXTAREA')||tgt.isContentEditable);
  const mod=(e.ctrlKey||e.metaKey);
  const key=(e.key||'').toLowerCase();
  const code=(e.code||'').toLowerCase();
  const isZ=code==='keyz'||key==='z'||key==='я';
  const isY=code==='keyy'||key==='y'||key==='н';
  const qfOpen=document.getElementById('quickFindModal')&&document.getElementById('quickFindModal').style.display==='flex';
  if(qfOpen&&e.key==='Escape'){
    closeQuickFind();
    e.preventDefault();
    return;
  }
  if(mod&&!e.altKey&&(isZ||isY)&&!editable)return;
  if(!qfOpen&&!editable&&!S.drawMode&&!mod&&!e.altKey&&e.key.length===1){
    // Open quickfind if either the raw key or its RU→EN mapping is a
    // Latin alphanum. This way typing on a Russian keyboard (where the
    // first char might be Cyrillic, e.g. "й" instead of "q") still
    // opens the panel and remaps to "q" downstream.
    const mapped=mapRuKeyboardToEn(e.key);
    if(/[a-z0-9]/i.test(mapped)){
      const rulerOn=[...S.charts,...S.fsCharts].some(c=>c.ruler?.active);
      const blocks=document.getElementById('settingsModal')?.classList.contains('open')||!!document.getElementById('emaEditorModal')||!!document.getElementById('alertPctOverlay');
      if(!blocks&&!rulerOn){
        openQuickFind(e.key);
        e.preventDefault();
        return;
      }
    }
  }
  if(e.key==='Escape'){
    if(document.getElementById('quickFindModal')?.style.display==='flex'){
      closeQuickFind();
      e.preventDefault();
      return;
    }
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
let _resumeRecoveryAt=0;
async function backfillChartGap(ch,sym,tf,limit=500){
  if(!ch?.candles?.length||!sym)return;
  const tfM=tfMs(tf);
  const last=ch.candles[ch.candles.length-1];
  if(!last?.t)return;
  const gapMs=Date.now()-last.t;
  if(gapMs<tfM*2)return;
  const need=Math.min(1500,Math.max(30,Math.ceil(gapMs/tfM)+5,limit));
  const raw=await fj(`${API}/klines?symbol=${sym}&interval=${tf}&limit=${need}`,9000,1);
  const nc=parseKlines(raw);
  if(!nc.length)return;
  const byT=new Map(ch.candles.map(c=>[c.t,c]));
  for(const c of nc)byT.set(c.t,c);
  ch.candles=[...byT.values()].sort((a,b)=>a.t-b.t).slice(-HIST_CACHE_MAX);
}
async function backfillVisibleCharts(limit=900){
  for(const ch of S.charts){
    if(!ch.sym||!ch.cs||!ch.candles.length)continue;
    try{
      await backfillChartGap(ch,ch.sym,S.tf,limit);
      if(ch.cs&&ch.lc)repaintChartSeries(ch,`${S.tf}:${ch.sym}`);
      else if(ch.canvas)_rCanvasImmediate(ch);
    }catch(e){}
  }
  if(S.fsOpen&&S.fsSym){
    const fsTasks=S.fsCharts.map(async fch=>{
      if(!fch.cs||!fch.candles.length)return;
      try{
        await backfillChartGap(fch,S.fsSym,fch.tf,limit);
        if(fch.cs&&fch.lc)repaintChartSeries(fch,`${fch.tf}:${S.fsSym}`);
      }catch(e){}
    });
    await Promise.all(fsTasks);
  }
}
function closeAllRealtimeSockets(){
  if(S.wsCharts){try{S.wsCharts.close();}catch(e){}}
  if(S.wsScreener){try{S.wsScreener.close();}catch(e){}}
  closeChartTradesSockets();
  if(S.fsWs){try{S.fsWs.close();}catch(e){}S.fsWs=null;}
}
async function handleResumeRecovery(reason='resume'){
  const now=Date.now();
  if(now-_resumeRecoveryAt<3000)return;
  _resumeRecoveryAt=now;
  const idleMs=_lastHiddenAt>0?now-_lastHiddenAt:0;
  console.log(`Resume recovery: ${reason}`);
  closeAllRealtimeSockets();
  updateHeaderStreamStatus();
  if(idleMs>120000){
    for(const ch of S.charts){
      if(ch.sym)delete S.histCache[`${S.tf}:${ch.sym}`];
    }
  }
  await backfillVisibleCharts(idleMs>60000?1400:1000);
  try{
    calcAll();
    if(!document.hidden)renderTable();
  }catch(e){}
  try{await refreshMetricKlinesSlice();}catch(e){}
  for(const ch of S.charts){
    if(ch.lc&&ch.cs)try{_rCanvasImmediate(ch);}catch(e){}
  }
  setTimeout(()=>{
    restartChartStreams(0);
    startScreenerWS();
    updateHeaderStreamStatus();
    if(!document.hidden)renderTable();
  },idleMs>60000?200:450);
}
function repaintChartSeries(ch,cacheKey=''){
  if(!ch?.cs||!ch?.vs||!ch?.candles?.length)return;
  ch._histBootstrapDone=ch.candles.length>=MIN_CHART_CANDLES;
  let logRange=null,vTime=null,pRange=null;
  if(ch._histBootstrapDone&&ch.lc){
    try{logRange=(typeof ch.lc.timeScale().getVisibleLogicalRange==='function')?ch.lc.timeScale().getVisibleLogicalRange():null;}catch(e){}
    try{if(typeof ch.lc.timeScale().getVisibleRange==='function')vTime=ch.lc.timeScale().getVisibleRange();}catch(e){}
    try{
      const ps=typeof ch.cs.priceScale==='function'?ch.cs.priceScale():null;
      if(ps&&typeof ps.getVisibleRange==='function')pRange=ps.getVisibleRange();
    }catch(e){}
  }
  ch.cs.setData(ch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
  ch.vs.setData(ch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
  const roR=Math.max(0,Math.min(36,S.chartRightOffset|0));
  try{ch.lc.timeScale().applyOptions({rightOffset:roR,fixRightEdge:false});}catch(e){}
  if(vTime&&vTime.from!=null&&vTime.to!=null){
    try{ch.lc.timeScale().setVisibleRange(vTime);}catch(e){}
  }else if(logRange&&typeof logRange.from==='number'&&typeof logRange.to==='number'){
    try{if(typeof ch.lc.timeScale().setVisibleLogicalRange==='function')ch.lc.timeScale().setVisibleLogicalRange(logRange);}catch(e){}
  }
  try{
    const ps=typeof ch.cs.priceScale==='function'?ch.cs.priceScale():null;
    if(pRange&&ps&&typeof ps.setVisibleRange==='function')ps.setVisibleRange(pRange);
  }catch(e){}
  repaintBbSeries(ch);
  ch._oiHist=alignOiToCandles(ch.candles,ch._oiRaw||[]);
  repaintOiSeries(ch);
  const lc=ch.candles[ch.candles.length-1];
  if(lc)syncLivePriceLabel(ch,lc.c,lc.o);
  if(cacheKey)S.histCache[cacheKey]=ch.candles.slice(-HIST_CACHE_MAX);
  rCanvas(ch);
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){_lastHiddenAt=Date.now();updateHeaderStreamStatus();return;}
  const hiddenMs=Date.now()-_lastHiddenAt;
  if(hiddenMs<400)return;
  handleResumeRecovery(`visibility ${Math.round(hiddenMs/1000)}s`);
});

// When connectivity returns, restart streams & patch candle gaps.
window.addEventListener('online',()=>{
  handleResumeRecovery('network-online');
});

// ───────────────────────────────────────────────────────────────
//  WEBSOCKETS • generation counter pattern prevents reconnect storms
// ───────────────────────────────────────────────────────────────
let _wsChartsGen=0; // increment on each start to invalidate old callbacks
let _wsScreenerGen=0;
let _wsChartsReconnectTimer=null;
let _wsScreenerReconnectTimer=null;
let _lastScreenerWsMsgAt=0;
let _lastChartWsMsgAt=0;
let _wsChartTradesGen=0;
let _wsChartTradesReconnectTimer=null;
let _chartWsRestartTimer=null;
let _watchdogPrevNow=Date.now();

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
    const ch=S.charts[slot];if(!ch.cs||!ch._histBootstrapDone)return;
    const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q,v:+k.v,tr:+k.n};
    const lastC=ch.candles[ch.candles.length-1];
    if(lastC&&lastC.t===candle.t){
      // Update existing candle only if close differs meaningfully (avoid jitter from identical re-broadcasts)
      if(lastC.c!==candle.c||lastC.h!==candle.h||lastC.l!==candle.l||lastC.o!==candle.o||lastC.qv!==candle.qv){
        ch.candles[ch.candles.length-1]=candle;
      }
    }
    else if(lastC&&candle.t>lastC.t)appendCandleWithGaps(ch.candles,candle,tfMs(S.tf));
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
          repaintBbSeries(ch);
          syncLivePriceLabel(ch,c.c,c.o);
        }catch(e){}
        ch.drawings.forEach(d=>{if(d.type==='aray'||d.type==='atline')checkAlerts(ch,d);});
        if(S.emaVisible)checkEMACrossovers(ch);
        const cpEl=document.getElementById(`cp${slot}`);if(cpEl)cpEl.textContent=fmtPrice(c.c);
        updateChartHeader(slot,symU);
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
  const last=ch.candles[ch.candles.length-1];
  const ref=last?.c||last?.o;
  if(ref&&isFinite(ref)&&ref>0){
    const rel=Math.abs(price-ref)/ref;
    // Ignore websocket spikes / stale ticks that create giant phantom candles.
    if(rel>0.25)return false;
  }
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
    const nc={t:bucketTs,o:c.c,h:Math.max(c.c,price),l:Math.min(c.c,price),c:price,qv:0,v:0,tr:0,_synthetic:true};
    appendCandleWithGaps(ch.candles,nc,ms);
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

/** Живое обновление последней цены на графике Grid Lab (без добавления символа в streams сделок). */
function pulseGridLabFromTicker(symU,price,tsMs){
  const modal=document.getElementById('gridLabModal');
  const body=modal?.querySelector('#gridLabBody');
  const ctx=body?._gbChartCtx;
  if(!ctx?.cs||!ctx.merged?.length||ctx.sym!==symU)return;
  const tf=ctx.tf||'5m';
  const pseudo={candles:ctx.merged,cs:ctx.cs};
  if(price==null||!isFinite(price))return;
  if(!applyLivePriceToCandle(pseudo,tf,price,tsMs)){return;}
  const lc=pseudo.candles[pseudo.candles.length-1];
  try{
    ctx.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
  }catch(e){}
}
function kickGridLabPricePoll(symU){
  const m=document.getElementById('gridLabModal');
  const body=m?.querySelector('#gridLabBody');
  const ctx=body?._gbChartCtx;
  if(ctx?._pollTimer){clearInterval(ctx._pollTimer);ctx._pollTimer=null;}
  if(!symU)return;
  ctx._pollTimer=setInterval(()=>{
    if(!document.getElementById('gridLabModal'))return;
    const p=S.tk[symU]?.p;
    if(p!=null&&isFinite(+p))pulseGridLabFromTicker(symU,+p,Date.now());
  },460);
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
    const ts=+(d.T||d.E)||Date.now();
    pulseGridLabFromTicker(symU,price,ts);
    const slot=S.charts.findIndex(c=>c.sym===symU);
    if(slot===-1)return;
    const ch=S.charts[slot];
    if(!ch?.cs||!ch._histBootstrapDone||!ch.candles?.length)return;
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
          ch.vs.update({time:toChartTime(lc.t),value:lc.qv||0,color:lc.c>=lc.o?'#1fa89122':'#e0404022'});
          repaintBbSeries(ch);
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
    const jump=now-_watchdogPrevNow;
    _watchdogPrevNow=now;
    if(jump>45000){
      handleResumeRecovery(`clock-jump ${Math.round(jump/1000)}s`);
      return;
    }
    if(!document.hidden){
      if(S.wsScreener&&_lastScreenerWsMsgAt&&now-_lastScreenerWsMsgAt>25000){
        console.warn('Screener WS stale, restarting');
        try{S.wsScreener.close();}catch(e){}
      }
      if(S.wsCharts&&_lastChartWsMsgAt&&now-_lastChartWsMsgAt>25000){
        console.warn('Chart WS stale, restarting');
        try{S.wsCharts.close();}catch(e){}
        closeChartTradesSockets();
      }
    }
    updTime();
  },2000);
  if(S._rtCandleFallback)return;
  S._rtCandleFallback=setInterval(()=>{
    if(document.hidden)return;
    const now=Date.now();
    S.charts.forEach(ch=>{
      if(!ch?.sym||!ch?.cs||!ch.candles?.length)return;
      const staleFor=now-(ch._lastRtUpdateTs||0);
      if(staleFor<5000)return;
      const need=Math.max(3,Math.min(800,Math.ceil(staleFor/tfMs(S.tf))+2));
      fj(`${API}/klines?symbol=${ch.sym}&interval=${S.tf}&limit=${need}`,6000,0).then(raw=>{
        if(!ch?.cs||!ch.candles?.length)return;
        const nc=parseKlines(raw);
        const byT=new Map(ch.candles.map(c=>[c.t,c]));
        for(const c of nc)byT.set(c.t,c);
        ch.candles=[...byT.values()].sort((a,b)=>a.t-b.t).slice(-HIST_CACHE_MAX);
        const lc=ch.candles[ch.candles.length-1];
        if(!lc)return;
        ch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
        ch.vs.update({time:toChartTime(lc.t),value:lc.qv,color:lc.c>=lc.o?'#1fa89122':'#e0404022'});
        syncLivePriceLabel(ch,lc.c,lc.o);
        ch._lastRtUpdateTs=Date.now();
        const wantMinCache=Math.max(MIN_CHART_CANDLES,(S.chartVisibleBars|0)+(S.chartRightOffset|0)+8);
        if(ch.candles.length>=wantMinCache)S.histCache[`${S.tf}:${ch.sym}`]=ch.candles.slice(-HIST_CACHE_MAX);
      }).catch(()=>{});
    });
    if(S.fsOpen&&S.fsSym){
      S.fsCharts.forEach(fch=>{
        if(!fch?.cs||!fch.candles?.length)return;
        const staleFor=now-(fch._lastRtUpdateTs||0);
        if(staleFor<5000)return;
        const need=Math.max(3,Math.min(800,Math.ceil(staleFor/tfMs(fch.tf))+2));
        fj(`${API}/klines?symbol=${S.fsSym}&interval=${fch.tf}&limit=${need}`,6000,0).then(raw=>{
          if(!fch?.cs||!fch.candles?.length)return;
          const nc=parseKlines(raw);
          const byT=new Map(fch.candles.map(c=>[c.t,c]));
          for(const c of nc)byT.set(c.t,c);
          fch.candles=[...byT.values()].sort((a,b)=>a.t-b.t).slice(-HIST_CACHE_MAX);
          const lc=fch.candles[fch.candles.length-1];
          if(!lc)return;
          fch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
          fch.vs.update({time:toChartTime(lc.t),value:lc.qv,color:lc.c>=lc.o?'#1fa89122':'#e0404022'});
          repaintBbSeries(fch);
          syncLivePriceLabel(fch,lc.c,lc.o);
          fch._lastRtUpdateTs=Date.now();
          const wantMinCache=Math.max(MIN_CHART_CANDLES,(S.chartVisibleBars|0)+(S.chartRightOffset|0)+8);
          if(fch.candles.length>=wantMinCache)S.histCache[`${fch.tf}:${S.fsSym}`]=fch.candles.slice(-HIST_CACHE_MAX);
        }).catch(()=>{});
      });
    }
  },2500);
}

// ”Ђ”Ђ Web Worker for heavy JSON parsing (Fix #7 #8: eliminates main thread freezes) ”Ђ”Ђ
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
const SCREENER_BATCH_MS_FAST=100;
let SCREENER_BATCH_MS=SCREENER_BATCH_MS_FAST;
const METRICS_RECALC_DEBOUNCE_MS=250;
let _metricsSyncBusy=false;
let _metricsSyncCursor=0;
let _metricsSyncInterval=null;
let _tickerRestFallbackInterval=null;
let _lastTickerRestAt=0;
// NOTE: _fundRates, _oiDelta, _fundOiSymIdx, _fundOiBusy, _fundOiInterval
// are declared at the top of this module so they are available to calcAll()
// and other early-defined functions. See top-of-file comment.

async function refreshPremiumFundingAll(){
  if(document.hidden)return;
  try{
    const raw=await fj(`${API}/premiumIndex`,22000,1);
    const arr=Array.isArray(raw)?raw:[raw];
    const next={};
    for(const row of arr){
      const sym=row.symbol;
      if(!sym||!sym.endsWith('USDT'))continue;
      const r=+row.lastFundingRate;
      if(isFinite(r))next[sym]=r;
    }
    _fundRates=next;
  }catch(e){}
}

async function refreshOpenInterestHistSlice(){
  if(document.hidden||!S.syms.length||_fundOiBusy)return;
  const syms=priorityMetricSyms(Math.min(120,S.syms.length));
  if(!syms.length)return;
  const batch=6;
  const start=_fundOiSymIdx%syms.length;
  const slice=[];
  for(let i=0;i<batch;i++)slice.push(syms[(start+i)%syms.length]);
  _fundOiSymIdx=(start+batch)%(syms.length*100+1);
  _fundOiBusy=true;
  try{
    for(const sym of slice){
      try{
        const h=await fj(`${API_FDATA}/openInterestHist?symbol=${encodeURIComponent(sym)}&period=1h&limit=8`,14000,0);
        if(!Array.isArray(h)||h.length<4)continue;
        const o0=+h[h.length-1]?.sumOpenInterest;
        const o1=+h[h.length-2]?.sumOpenInterest;
        const o4=+h[h.length-5]?.sumOpenInterest;
        if(!isFinite(o0)||!isFinite(o1)||o1<=0)continue;
        const p1=(o0/o1-1)*100;
        const p4=isFinite(o4)&&o4>0?(o0/o4-1)*100:null;
        _oiDelta[sym]={oi1h:p1,oi4h:p4};
      }catch(e){}
      await new Promise(r=>setTimeout(r,60));
    }
  }finally{
    _fundOiBusy=false;
  }
}

function ensureFundOiLoop(){
  if(_fundOiInterval)return;
  refreshPremiumFundingAll();
  refreshOpenInterestHistSlice();
  if(S.showOiOnChart){
    S.charts.forEach(ch=>{if(ch.sym)refreshChartOiSeries(ch,S.tf,ch.sym);});
    if(S.fsOpen&&S.fsSym)S.fsCharts.forEach(ch=>refreshChartOiSeries(ch,ch.tf,S.fsSym));
  }
  _fundOiInterval=setInterval(()=>{
    refreshPremiumFundingAll();
    refreshOpenInterestHistSlice();
    if(!S.showOiOnChart)return;
    S.charts.forEach(ch=>{
      if(!ch.sym)return;
      if(Date.now()-(ch._oiLastFetchTs||0)>55000)refreshChartOiSeries(ch,S.tf,ch.sym);
    });
    if(S.fsOpen&&S.fsSym)S.fsCharts.forEach(ch=>{
      if(Date.now()-(ch._oiLastFetchTs||0)>55000)refreshChartOiSeries(ch,ch.tf,S.fsSym);
    });
  },32000);
}

function priorityMetricSyms(limit=90){
  const pinned=[...S.charts.map(c=>c.sym).filter(Boolean),...(S.fsOpen&&S.fsSym?[S.fsSym]:[])];
  const byVol=Object.entries(S.tk).filter(([sym])=>S.syms.includes(sym)).sort((a,b)=>(b[1]?.qv||0)-(a[1]?.qv||0)).map(([sym])=>sym);
  const seen=new Set();
  const out=[];
  for(const s of[...pinned,...byVol]){
    if(!s||seen.has(s))continue;
    seen.add(s);out.push(s);
    if(out.length>=limit)break;
  }
  return out;
}

async function refreshMetricKlinesSlice(){
  if(_metricsSyncBusy||!S.syms.length)return;
  _metricsSyncBusy=true;
  try{
    const universe=priorityMetricSyms(Math.min(180,S.syms.length));
    if(!universe.length)return;
    const sliceSize=36;
    if(_metricsSyncCursor>=universe.length)_metricsSyncCursor=0;
    const slice=universe.slice(_metricsSyncCursor,_metricsSyncCursor+sliceSize);
    _metricsSyncCursor+=slice.length;
    if(!slice.length)return;
    const trendTf=S.tf;
    const trendLim=trendKlineFetchLimit(trendTf);
    const [k5,k1h,k1m,kTr]=await Promise.all([
      batchKlines(slice,'5m',300,null,null,10),
      batchKlines(slice,'1h',170,null,null,10),
      batchKlines(slice,'1m',70,null,null,10),
      batchKlines(slice,trendTf,trendLim,null,null,10),
    ]);
    Object.assign(S.k5m,k5);Object.assign(S.k1h,k1h);Object.assign(S.k1m,k1m);
    if(trendTf===S.tf)Object.assign(S.kTrend,kTr);
    calcAll();
    if(!document.hidden){
      if(_anyChartPanning||_scrolling)setDeferredRenderNeeded();
      else scheduleRender();
    }
    if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
  }catch(e){
    console.warn('metric sync slice failed',e);
  }finally{
    _metricsSyncBusy=false;
  }
}

function ensureMetricsSyncLoop(){
  if(_metricsSyncInterval)return;
  _metricsSyncInterval=setInterval(()=>{
    if(document.hidden)return;
    refreshMetricKlinesSlice();
  },20000);
}

async function refreshTicker24hrFallback(){
  if(document.hidden)return;
  // Avoid hammering REST endpoint (and avoid fighting a healthy WS stream).
  const now=Date.now();
  if(now-_lastTickerRestAt<25000)return;
  _lastTickerRestAt=now;
  try{
    const rawTk=await fj(`${API}/ticker/24hr`,9000,1);
    for(const t of rawTk){
      const sym=t.symbol;
      if(!sym||!sym.endsWith('USDT'))continue;
      const tk=S.tk[sym];
      if(!tk)continue;
      tk.p=+t.lastPrice;
      tk.c24=+t.priceChangePercent;
      tk.h24=+t.highPrice;
      tk.l24=+t.lowPrice;
      tk.qv=+t.quoteVolume;
      tk.tr=+t.count;
      const mx=S.mx[sym];
      if(mx){mx.price=tk.p;mx.ch24=tk.c24;mx.vol24=tk.qv;mx.trd24=tk.tr;}
    }
    // Patch live series & recompute derived metrics for the "priority" universe.
    const nowMs=Date.now();
    const universe=priorityMetricSyms(Math.min(180,S.syms.length));
    for(const sym of universe){
      const tk=S.tk[sym];
      if(!tk||tk.p==null||isNaN(tk.p))continue;
      applyLiveKlineUpdate(sym,tk.p,nowMs);
    }
    calcAll();
    if(!document.hidden){
      if(_anyChartPanning||_scrolling)setDeferredRenderNeeded();
      else scheduleRender();
    }
    if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
  }catch(e){
    // Silent fallback • WS is still the primary source.
  }
}

function ensureTickerRestFallbackLoop(){
  if(_tickerRestFallbackInterval)return;
  _tickerRestFallbackInterval=setInterval(()=>{
    if(document.hidden)return;
    const now=Date.now();
    // If WS is healthy (fresh messages), skip REST.
    if(_lastScreenerWsMsgAt&&now-_lastScreenerWsMsgAt<6000)return;
    refreshTicker24hrFallback();
  },30000);
}

function scheduleRealtimeMetricRecalc(gen){
  if(_metricsRecalcTimer||!S.bgDone)return;
  _metricsRecalcTimer=setTimeout(()=>{
    _metricsRecalcTimer=null;
    if(gen!==_wsScreenerGen)return;
    const run=()=>{
      try{
        const nowMs=Date.now();
        // Recalc only for the most relevant symbols to keep UI snappy:
        // pinned charts/FS + top-by-volume universe.
        const universe=priorityMetricSyms(Math.min(240,S.syms.length));
        for(const sym of universe){
          const tk=S.tk[sym];
          if(!tk||tk.p==null||isNaN(tk.p))continue;
          applyLiveKlineUpdate(sym,tk.p,nowMs);
        }
        calcAll();
        if(!document.hidden){
          if(_anyChartPanning||_scrolling)setDeferredRenderNeeded();
          else scheduleRender();
        }
        if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
      }catch(e){
        console.warn('realtime metric recalc failed',e);
      }
    };
    if(typeof requestIdleCallback!=='undefined')requestIdleCallback(run,{timeout:600});
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
  ensureMetricsSyncLoop();
  ensureTickerRestFallbackLoop();
}

function _applyTickerUpdate(arr,gen){
  let changed=false;
  const nowMs=Date.now();
  for(const t of arr){
    if(!t||!t.s)continue;
    const sym=t.s;
    const tk=S.tk[sym];const mx=S.mx[sym];
    if(!tk)continue;
    const q=isFinite(+t.q)?+t.q:tk.qv;
    const n=isFinite(+t.n)?+t.n:tk.tr;
    if(tk.p!==t.c||tk.c24!==t.P){tk.p=+t.c;tk.c24=+t.P;tk.qv=q;tk.tr=n;changed=true;}
    if(mx){mx.price=tk.p;mx.ch24=tk.c24;mx.vol24=tk.qv;mx.trd24=tk.tr;}
    applyLiveKlineUpdate(sym,tk.p,nowMs);
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
          setDeferredRenderNeeded();
        } else {
          scheduleRender();
        }
      }
      if(S.fsOpen&&S.fsSym&&S.tk[S.fsSym])updateFsHeaderValues();
      if(!_anyChartPanning)checkAllAlerts();
    },SCREENER_BATCH_MS);
  }
}

function ensureFsHeadStatsDom(){
  const wrap=document.getElementById('fsHeadStats');
  if(!wrap||wrap.dataset.inited==='1')return;
  wrap.innerHTML='';
  for(const def of CHART_HEAD_DEFS){
    const s=document.createElement('span');
    s.id=`fsStat-${def.id}`;
    s.className=`${def.cls} fs-stat`;
    s.title=def.tip;
    wrap.appendChild(s);
  }
  wrap.dataset.inited='1';
}

function layoutFsHeadStats(){
  const wrap=document.getElementById('fsHeadStats');
  if(!wrap||!wrap.dataset.inited)return;
  wrap.style.display='flex';
  const order=S.chartHeadOrder.filter(id=>CHART_HEAD_IDS.includes(id));
  const vis=S.chartHeadVisible;
  for(const id of CHART_HEAD_IDS){
    const s=document.getElementById(`fsStat-${id}`);
    if(!s)continue;
    const oi=order.indexOf(id);
    s.style.display=vis.has(id)&&oi>=0?'':'none';
    if(oi>=0)s.style.order=String(oi);
  }
}

function updateFsHeaderValues(){
  const t=S.tk[S.fsSym]||{};const m=S.mx[S.fsSym]||{};
  ensureFsHeadStatsDom();
  layoutFsHeadStats();
  const fsp=document.getElementById('fsPrc');if(fsp)fsp.textContent=fmtPrice(t.p);
  const elChg=document.getElementById('fsStat-chg');
  if(elChg){
    if(t.c24!=null){
      elChg.textContent=(t.c24>=0?'+':'')+t.c24.toFixed(2)+'%';
      elChg.className='cchg fs-stat '+(t.c24>=0?'p':'n');
    }else{elChg.textContent='';elChg.className='cchg fs-stat';}
  }
  const elVol=document.getElementById('fsStat-vol');
  if(elVol)elVol.innerHTML=t.qv?`<span style="opacity:.55">◼</span>${fk(t.qv)}`:'';
  const elTrd=document.getElementById('fsStat-trd');
  if(elTrd)elTrd.innerHTML=t.tr?`<span style="opacity:.55">⚡</span>${fk(t.tr)}`:'';
  const elNatr=document.getElementById('fsStat-natr');
  if(elNatr){
    const na=m.na14;
    elNatr.textContent=na!=null?`${fn(na,2)}%`:'';
  }
  const corVal=m.corr14??m.corr;
  const elCorr=document.getElementById('fsStat-corr');
  if(elCorr)elCorr.innerHTML=corVal!=null?`<span style="opacity:.55">∞</span>${fn(corVal,2)}`:'';
}

// ───────────────────────────────────────────────────────────────
//  SCREENER TABLE (shared for main & FS)
// ───────────────────────────────────────────────────────────────
function buildScreenerHeader(hdrEl){
  hdrEl.innerHTML='';
  const tickCol=document.createElement('div');
  tickCol.className='tick-col';tickCol.title='Сортировать по тикеру';
  tickCol.innerHTML='<span class="tick-lbl">ТИКЕР '+(S.sortAlpha?(S.sortDir==='asc'?'–І':'–ј'):'')+' </span>';
  tickCol.onclick=()=>doSort('sym');
  hdrEl.appendChild(tickCol);
  const ms=document.createElement('div');ms.className='mscroll';
  const mg=document.createElement('div');mg.style.display='flex';mg.style.height='100%';
  const cols=activeCols();
  cols.forEach(c=>{
    const d=document.createElement('div');
    d.className='mhcol';d.id=`hc-${c.id}`;d.title=c.tip;d.style.flex='1';d.style.minWidth='32px';
    if(c.id==='sp5'||c.id==='spv'){
      d.classList.add('mhcol-fixed-sp5');
      d.style.flex='0 0 90px';
      d.style.minWidth='90px';
      d.style.maxWidth='90px';
      d.style.width='90px';
    }else if(c.id==='fund'||c.id==='oi1h'||c.id==='oi4h'){
      d.style.flex='0 0 64px';
      d.style.minWidth='64px';
      d.style.maxWidth='64px';
      d.style.width='64px';
    }
    const sub=(c.id==='sp5'||c.id==='spv')?trendColShortLabel(S.tf):c.s;
    d.innerHTML=`<div class="ht">${c.l}</div><div class="hb">${sub}</div>`;
    d.onclick=()=>doSort(c.id);mg.appendChild(d);
  });
  ms.appendChild(mg);hdrEl.appendChild(ms);
  updSortHdr();
  setTimeout(buildGroupFilterBar,0);
}

function sortedRows(){
  let rows=Object.values(S.mx);
  // Подмешиваем монеты без записи в mx (гонка calcAll / partial tk) • иначе пустые слоты и «•».
  if(S.syms.length){
    const have=new Set(rows.map(r=>r.sym));
    for(const sym of S.syms){
      if(have.has(sym))continue;
      const t=S.tk[sym]||{};
      rows.push({
        sym,price:t.p??null,ch24:t.c24??null,cday:null,rtd:null,r24:null,r7d:null,
        na30:null,na14:null,r1m5:null,tr5:null,tr1h:null,vr5:null,vr1h:null,
        ch7d:null,trd24:t.tr??null,vol24:t.qv??null,corr:null,corr14:null,v15m:null,v60m:null,
        sp5:null,sp5d:'',spVol:null,spVold:'',spv:null,fund:null,oi1h:null,oi4h:null,sqzPop:0,bbSqz:0,bbBreak:0,volImpulse:0
      });
    }
  }
  // Search is purely visual (search-hidden class in renderScreenerRow). It must never
  // narrow the row set, otherwise mini-charts and the FS screener would collapse to
  // a single symbol after typing in the search input.
  const bypassGroup=(sym)=>S.activeGroupFilter>0&&symbolInGroup(sym,S.activeGroupFilter);
  if(S.minVol>0)rows=rows.filter(r=>(r.vol24!=null&&r.vol24>=S.minVol*1e6)||bypassGroup(r.sym));
  if(S.minTrd>0)rows=rows.filter(r=>(r.trd24!=null&&r.trd24>=S.minTrd)||bypassGroup(r.sym));
  // Filters are exclusive: preset OR color group OR all
  if(S._potFilterPreset){
    const pr=S.potentialPresets.find(p=>p.id===S._potFilterPreset);
    if(pr&&Object.keys(pr.matches||{}).length>0)rows=rows.filter(r=>pr.matches[r.sym]);
    else S._potFilterPreset=null; // preset has no matches, clear filter
  }else if(S.activeGroupFilter>0){
    rows=rows.filter(r=>symbolInGroup(r.sym,S.activeGroupFilter));
  }
  rows.sort((a,b)=>{
    if(S.sortAlpha){
      const r=a.sym.localeCompare(b.sym);return S.sortDir==='asc'?r:-r;
    }
    const sortKey=S.sortId==='spv'?'spVol':S.sortId;
    let va=a[sortKey],vb=b[sortKey];
    if(S.sortAbs&&(S.sortId==='ch24'||S.sortId==='ch7d'||S.sortId==='cday'||S.sortId==='sp5'||S.sortId==='spv'||S.sortId==='oi1h'||S.sortId==='oi4h')){
      va=va!=null&&!isNaN(va)?Math.abs(va):va;vb=vb!=null&&!isNaN(vb)?Math.abs(vb):vb;
    }
    if(va==null||isNaN(va))return 1;if(vb==null||isNaN(vb))return-1;
    return S.sortDir==='desc'?vb-va:va-vb;
  });
  return rows;
}

// O(n) check that bodyEl's existing children are in the same order as
// the new rows. Cheap enough to run on every WS batch (a few microseconds
// for 500 rows). Returns false when length or order differs (filter change,
// sort change, or first render after colsKey change).
function sameDomOrder(bodyEl,rows){
  const children=bodyEl.children;
  if(children.length!==rows.length)return false;
  for(let i=0;i<rows.length;i++){
    if(!children[i]||children[i]._sym!==rows[i].sym)return false;
  }
  return true;
}

function renderScreenerInto(bodyEl,rows){
  if(!bodyEl)return;
  const inChart=new Set(S.charts.map(c=>c.sym).filter(Boolean));
  const cols=activeCols();
  const colsKey=cols.map(c=>c.id).join(',');
  if(bodyEl.dataset.colsKey!==colsKey){
    bodyEl.innerHTML='';
    bodyEl._rowMap=new Map();
    bodyEl.dataset.colsKey=colsKey;
  }
  if(!bodyEl._rowMap)bodyEl._rowMap=new Map();
  const rowMap=bodyEl._rowMap;
  // Fast path: if the screener rows are in the same order as the existing
  // DOM children (no sort change, no filter change), just update each row
  // in place. This skips the expensive detach+reattach of every row that
  // `bodyEl.replaceChildren(frag)` does on every WS batch — at 500 rows ×
  // ~20 cells that's ~10k DOM ops per tick. In-place update keeps it
  // O(rows) text-mutation only, no DOM reordering.
  if(sameDomOrder(bodyEl,rows)){
    for(const m of rows){
      const row=rowMap.get(m.sym);
      if(row)updateScreenerRow(row,m,cols,inChart);
    }
  } else {
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
  }
  for(const sym of Array.from(rowMap.keys())){
    if(!(sym in S.mx))rowMap.delete(sym);
  }
}

function buildScreenerRow(m,cols){
  const sym=m.sym;
  const row=document.createElement('div');
  row.className='srow';
  row.onclick=()=>openFullscreenBySym(sym);
  row._sym=sym;
  const rt=document.createElement('div');rt.className='rtick';
  const gdot=document.createElement('span');gdot.className='cg-dot';
  gdot.title='Группа/избранное';
  gdot.onclick=ev=>{ev.stopPropagation();showGroupPicker(sym,gdot);};
  rt.appendChild(gdot);
  const fstar=document.createElement('span');
  fstar.className='cg-fstar';
  fstar.textContent='★';
  fstar.title='Избранное';
  rt.appendChild(fstar);
  const nameSpan=document.createElement('span');nameSpan.className='tname';nameSpan.textContent=sym.replace(/USDT$/,'');
  nameSpan.title='Нажмите для копирования';nameSpan.style.cursor='pointer';
  nameSpan.onclick=ev=>{ev.stopPropagation();copyTicker(sym.replace(/USDT$/,''));openFullscreenBySym(sym);};
  rt.appendChild(nameSpan);
  row._gdot=gdot;row._fstar=fstar;row._name=nameSpan;row.appendChild(rt);
  const rg=document.createElement('div');rg.className='rmgrid';
  const cellArr=[];
  for(const c of cols){
    const cell=document.createElement('div');
    cell.className='mc d';
    if(c.id==='sp5'||c.id==='spv'){
      cell.classList.add('spark-col');
      cell.style.flex='0 0 90px';
      cell.style.minWidth='90px';
      cell.style.maxWidth='90px';
      cell.style.width='90px';
    }else if(c.id==='fund'||c.id==='oi1h'||c.id==='oi4h'){
      cell.style.flex='0 0 64px';
      cell.style.minWidth='64px';
      cell.style.maxWidth='64px';
      cell.style.width='64px';
    }
    rg.appendChild(cell);cellArr.push(cell);
  }
  row._cells=cellArr;row._rg=rg;row.appendChild(rg);
  return row;
}

function updateScreenerRow(row,m,cols,inChart){
  const sym=m.sym;
  const grp=getSymGroup(sym);
  const grpCol=GROUP_COLORS[grp]||'';
  const q=S.q?S.q.toUpperCase():'';
  const matchesSearch=!q||sym.includes(q);
  const newCls='srow'+(inChart.has(sym)?' inchart':'')+(S.fsOpen&&S.fsSym===sym?' infullscreen':'')+(matchesSearch?'':' search-hidden');
  if(row.className!==newCls)row.className=newCls;
  row._sym=sym;
  const gdot=row._gdot;
  if(gdot){
    styleGroupDot(gdot,sym);
    gdot.onclick=ev=>{ev.stopPropagation();showGroupPicker(sym,gdot);};
  }
  const fstar=row._fstar;
  if(fstar){
    const on=isSymFavorite(sym);
    fstar.style.display=on?'inline-block':'none';
  }
  const nameTxt=sym.replace(/USDT$/,'');
  if(row._name&&row._name.textContent!==nameTxt)row._name.textContent=nameTxt;
  if(row._name){
    row._name.onclick=ev=>{ev.stopPropagation();copyTicker(nameTxt);openFullscreenBySym(sym);};
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
      if(c.id==='sp5'||c.id==='spv'){
        cell.classList.add('spark-col');
        cell.style.flex='0 0 90px';
        cell.style.minWidth='90px';
        cell.style.maxWidth='90px';
        cell.style.width='90px';
      }else if(c.id==='fund'||c.id==='oi1h'||c.id==='oi4h'){
        cell.style.flex='0 0 64px';
        cell.style.minWidth='64px';
        cell.style.maxWidth='64px';
        cell.style.width='64px';
      }
      row._rg.appendChild(cell);
      row._cells.push(cell);
    }
  }
  cols.forEach((c,ci)=>{
    const cell=row._cells[ci];if(!cell)return;
    if(c.id==='sp5'){
      const hasPath=m.sp5d&&String(m.sp5d).length>8;
      const chgDisp=(m.sp5!=null&&!isNaN(m.sp5))?m.sp5:(m.ch24!=null&&!isNaN(m.ch24)?m.ch24:null);
      const dLine=hasPath?String(m.sp5d):'M1,20 L99,20';
      const sig=`${chgDisp}|${dLine}`;
      if(cell._sparkSig!==sig){
        cell._sparkSig=sig;
        const pct=chgDisp!=null&&!isNaN(chgDisp)?(chgDisp>=0?'+':'')+chgDisp.toFixed(1)+'%':'•';
        const ud=(chgDisp!=null&&chgDisp<0)?'down':'up';
        const bg=sparkHeatBackground(chgDisp);
        cell.innerHTML=`<div class="spark-inner ${escapeHtml(ud)}" style="background:${escapeHtml(bg)}"><svg viewBox="0 0 100 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="${svgPathAttr(dLine)}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="spark-pct">${escapeHtml(pct)}</span></div>`;
      }
      const clsBase='mc spark-col '+(chgDisp==null||isNaN(chgDisp)?'d':fc(chgDisp,'ch24'));
      if(cell.className!==clsBase)cell.className=clsBase;
      return;
    }
    if(c.id==='spv'){
      const hasPath=m.spVold&&String(m.spVold).length>8;
      const chgDisp=(m.spVol!=null&&!isNaN(m.spVol))?m.spVol:null;
      const dLine=hasPath?String(m.spVold):'M1,20 L99,20';
      const sig=`spv|${chgDisp}|${dLine}`;
      if(cell._sparkSig!==sig){
        cell._sparkSig=sig;
        const pct=chgDisp!=null&&!isNaN(chgDisp)?(chgDisp>=0?'+':'')+chgDisp.toFixed(1)+'%':'•';
        const ud=(chgDisp!=null&&chgDisp<0)?'down':'up';
        const bg=sparkHeatBackground(chgDisp);
        cell.innerHTML=`<div class="spark-inner ${escapeHtml(ud)}" style="background:${escapeHtml(bg)}"><svg viewBox="0 0 100 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><path d="${svgPathAttr(dLine)}" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="spark-pct">${escapeHtml(pct)}</span></div>`;
      }
      const clsBase='mc spark-col '+(chgDisp==null||isNaN(chgDisp)?'d':fc(chgDisp,'spv'));
      if(cell.className!==clsBase)cell.className=clsBase;
      return;
    }
    const val=m[c.id];
    const newTxt=fv(val,c.id);
    const newCls='mc '+fc(val,c.id)+' '+fh(val,c.id);
    // While some derived metrics are being (re)computed, keep the previous value instead of flashing zeros/dashes.
    // This is especially noticeable for СД*/ОБ* ratios.
    const holdDuringRecalc = (c.id==='tr5'||c.id==='tr1h'||c.id==='vr5'||c.id==='vr1h');
    const holdOiDuring = (_fundOiBusy&&(c.id==='oi1h'||c.id==='oi4h'));
    if(holdDuringRecalc){
      const vBad = (val==null||!isFinite(val)) || (_metricsSyncBusy && val===0);
      if(vBad && cell.textContent && cell.textContent!=='•'){
        if(cell.className!==newCls)cell.className=newCls;
        return;
      }
    }
    if(holdOiDuring){
      const vBad=val==null||!isFinite(val);
      if(vBad&&cell.textContent&&cell.textContent!=='•'){
        if(cell.className!==newCls)cell.className=newCls;
        return;
      }
    }
    if(cell.textContent!==newTxt)cell.textContent=newTxt;
    if(cell.className!==newCls)cell.className=newCls;
  });
}

let _rt=null;
function _scheduleUi(cb){
  // In fast mode we prefer immediate frames over idle scheduling.
  if(S.fastMode){requestAnimationFrame(cb);return;}
  if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(cb,{timeout:400});return;}
  requestAnimationFrame(cb);
}
let _renderScheduled=false;
function scheduleRender(){
  if(_renderScheduled)return;
  // Throttle: never schedule more often than _renderMinMs to avoid DOM thrashing during WS bursts.
  const now=performance.now();
  const due=Math.max(0,S._renderMinMs-(now-S._renderTs));
  _renderScheduled=true;
  const run=()=>{
    _renderScheduled=false;
    S._renderTs=performance.now();
    if(_anyChartPanning){setDeferredRenderNeeded();return;} // defer until pan ends
    if(!_scrolling&&!document.hidden)renderTable();
  };
  if(due<=1)_scheduleUi(run);
  else setTimeout(()=>_scheduleUi(run),due);
}
// Skip DOM rebuild while user is scrolling the screener
let _scrolling=false,_scrollEnd=null;
document.addEventListener('DOMContentLoaded',()=>{
  const sb=document.getElementById('sbody');
  if(sb){sb.addEventListener('scroll',()=>{_scrolling=true;clearTimeout(_scrollEnd);_scrollEnd=setTimeout(()=>{_scrolling=false;renderTable();},150);});}
});

function renderTable(){
  const rows=sortedRows();
  S._lastVisibleCount=rows.length;
  const countTxt=rows.length+' монет';
  setText('hcount',countTxt);
  renderScreenerInto(document.getElementById('sbody'),rows);
  if(S.fsOpen&&S.fsScreenerVisible){
    renderScreenerInto(document.getElementById('fsSbody'),rows);
  }
  updatePagination(rows.length);
  // Keep mini-charts in sync with live-sorted rows.
  // Without this, when sorting by a live-updating metric (e.g. ИЗМ24ч),
  // the table changes but the 3×3 grid can stay on stale symbols.
  maybeSyncChartsToTopRows(rows);
}

let _lastChartSyncAt=0;
function maybeSyncChartsToTopRows(rows){
  if(document.hidden||_anyChartPanning)return;
  if(!S.chartAutoSync)return;
  // Only meaningful when we're showing the screener and not sorting alphabetically.
  if(!S.screenerVisible||S.sortAlpha)return;
  const now=Date.now();
  const minEvery=S.fastMode?600:1500;
  if(now-_lastChartSyncAt<minEvery)return;
  _lastChartSyncAt=now;

  const start=S.page*S.charts.length;
  const pageSyms=rows.slice(start,start+S.charts.length).map(r=>r.sym);
  let changed=false;
  for(let i=0;i<S.charts.length;i++){
    const ns=pageSyms[i]||null;
    if(S.charts[i].sym!==ns){changed=true;loadChart(i,ns);}
  }
  if(changed)restartChartStreams(300);
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
  const si=document.getElementById('sinfo');
  if(si)si.textContent='';
}

// ───────────────────────────────────────────────────────────────
//  CONTROLS
// ───────────────────────────────────────────────────────────────
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
  clearAllRulers();
  const rows=sortedRows();
  const tp=Math.max(1,Math.ceil(rows.length/S.charts.length));
  S.page=Math.max(0,Math.min(tp-1,S.page+delta));
  updateCharts();renderTable();
}

function setTf(tf,btnId){
  clearAllRulers();
  S.tf=tf;
  S.kTrend={};
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
  calcAll();
  renderTable();
  rebuildScreenerHeaders();
  refreshMetricKlinesSlice();
  schedulePersistUserSettings();
}

/** Русская раскладка → латиница (поиск тикера как на EN-клавиатуре). */
function mapRuKeyboardToEn(s){
  const ru='ёйцукенгшщзхъфывапролджэячсмитьбюЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ';
  const en='`qwertyuiop[]asdfghjkl;\'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?';
  let out='';
  for(const ch of String(s||'')){
    const i=ru.indexOf(ch);
    out+=i>=0?en[i]:ch;
  }
  return out;
}
function onSearchInput(inp){
  if(!inp)return;
  const raw=inp.value;
  const mapped=mapRuKeyboardToEn(raw);
  if(mapped!==raw){
    const pos=inp.selectionStart;
    inp.value=mapped;
    try{inp.setSelectionRange(pos,pos);}catch(e){}
  }
  onSearch(mapped);
}
function onSearch(q){
  const clean=mapRuKeyboardToEn(q).trim();
  S.q=clean;
  S.page=0;
  renderTable();
  // Search only highlights the row in the right-side screener; it never filters the list.
}

function onVolFilter(val){
  S.minVol=+val*10;
  const disp=S.minVol===0?'0':`${S.minVol}M`;
  ['volVal','fsVolVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=disp;});
  ['volSlider','fsVolSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=val;});
  S.page=0;updateCharts();renderTable();
  schedulePersistUserSettings();
}
function onTrdFilter(val){
  // 1 step = 50k trades/day. Range 0..2M by default.
  S.minTrd=+val*50000;
  const disp=S.minTrd===0?'0':(S.minTrd>=1e6?`${(S.minTrd/1e6).toFixed(1)}M`:`${Math.round(S.minTrd/1000)}K`);
  ['trdVal','fsTrdVal'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=disp;});
  ['trdSlider','fsTrdSlider'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=val;});
  S.page=0;updateCharts();renderTable();
  schedulePersistUserSettings();
}

const STREAM_STALE_MS=20000;

let _lastSessionUiKey=-1;
function updTime(){
  const d=new Date();const pad=n=>n.toString().padStart(2,'0');
  const timeStr=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ht=document.getElementById('htime');if(ht)ht.textContent=timeStr;
  updateHeaderStreamStatus();
  if(S.sessionFx?.enabled){
    const key=d.getUTCHours()*60+d.getUTCMinutes();
    if(key!==_lastSessionUiKey){
      _lastSessionUiKey=key;
      if(!document.hidden&&!_scrolling)scheduleRender();
      [...S.charts,...S.fsCharts].forEach(ch=>{if(ch?.canvas&&ch?.lc)rCanvas(ch);});
    }
  }
}

function _setHeaderLiveDot(mode){
  const dot=document.getElementById('ldot');
  if(!dot)return;
  dot.className='live-dot'+(mode==='warn'?' live-dot-warn':mode==='err'?' live-dot-err':mode==='pause'?' live-dot-pause':'');
}

/** Статус Binance WS (тикер + минивЂ‘графики): свежий / подключение / нет данных >20с */
function updateHeaderStreamStatus(){
  const hs=document.getElementById('hstatus');
  if(!hs)return;
  const now=Date.now();
  if(document.hidden){
    hs.textContent='Вкладка на паузе';
    _setHeaderLiveDot('pause');
    return;
  }
  if(typeof navigator!=='undefined'&&!navigator.onLine){
    hs.textContent='Нет сети';
    _setHeaderLiveDot('err');
    return;
  }
  // Skip the "Подключение потокавЂ¦" indicator • it was always showing on first paint
  // and adding visual noise without telling the user anything actionable.
  const wantChart=S.charts.some(c=>c.sym);
  const scrConn=!!S.wsScreener;
  const chartConn=wantChart&&!!S.wsCharts;
  let worst=0;
  let any=false;
  if(scrConn&&_lastScreenerWsMsgAt){any=true;worst=Math.max(worst,now-_lastScreenerWsMsgAt);}
  if(chartConn&&_lastChartWsMsgAt){any=true;worst=Math.max(worst,now-_lastChartWsMsgAt);}
  if(!any){
    hs.textContent='Онлайн';
    _setHeaderLiveDot('');
    return;
  }
  if(worst>=STREAM_STALE_MS){
    hs.textContent=`Нет потока ${Math.round(worst/1000)}с`;
    _setHeaderLiveDot('warn');
    return;
  }
  const s=Math.round(worst/1000);
  hs.textContent=s<=1?'Поток ок':'Поток ок · '+s+'с';
  _setHeaderLiveDot('');
}

function syncFastBtnUi(){
  S.fastMode=true;
  SCREENER_BATCH_MS=SCREENER_BATCH_MS_FAST;
}

function toggleFastMode(){
  syncFastBtnUi();
}

function syncChartSyncBtnUi(){
  const b=document.getElementById('chartSyncBtn');
  if(!b)return;
  b.classList.toggle('on',S.chartAutoSync);
  b.textContent=S.chartAutoSync?'Графы·авто':'Графы·стоп';
  b.title=S.chartAutoSync
    ?'Вкл: мини-графики 3×3 подстраиваются под текущий топ страницы при живой сортировке. Список всегда обновляется.'
    :'Выкл: список обновляется, но символы в сетке графиков не меняются сами • пока не перелистнёте страницу или не смените сортировку вручную.';
}
function syncOiChartBtnUi(){
  const btn=document.getElementById('oiChartBtn');
  if(!btn)return;
  btn.classList.toggle('on',S.showOiOnChart);
  btn.textContent=S.showOiOnChart?'OI: ВКЛ':'OI: ВЫКЛ';
}
function toggleOiChart(){
  S.showOiOnChart=!S.showOiOnChart;
  saveOiChartPref();
  syncOiChartBtnUi();
  S.charts.forEach(ch=>{
    repaintOiSeries(ch);
    if(S.showOiOnChart&&ch.sym)refreshChartOiSeries(ch,S.tf,ch.sym);
  });
  S.fsCharts.forEach(ch=>{
    repaintOiSeries(ch);
    if(S.showOiOnChart&&S.fsSym)refreshChartOiSeries(ch,ch.tf,S.fsSym);
  });
}
function syncBbBtnUi(){
  const btn=document.getElementById('bbBtn');
  if(!btn)return;
  btn.classList.toggle('on',S.showBbOverlay);
}
function toggleBbOverlay(){
  S.showBbOverlay=!S.showBbOverlay;
  saveBbOverlayPref();
  syncBbBtnUi();
  [...S.charts,...S.fsCharts].forEach(ch=>{
    repaintBbSeries(ch);
    rCanvas(ch);
  });
}
function toggleChartAutoSync(){
  S.chartAutoSync=!S.chartAutoSync;
  saveChartAutoSyncPref();
  syncChartSyncBtnUi();
  schedulePersistUserSettings();
}

function updateToggleScrBtn(){
  const btn=document.getElementById('toggleScrBtn');
  if(!btn)return;
  const on=S.fsOpen?S.fsScreenerVisible:S.screenerVisible;
  // Reconstruct the label from char codes so this file is safe to save
  // in any encoding without producing mojibake. Word is "Spisok"
  // (Список): \u0421\u043f\u0438\u0441\u043e\u043a. \u2212 is minus.
  btn.textContent = (on ? String.fromCharCode(0x2212) : '+')
    + ' ' + String.fromCharCode(0x0421, 0x043f, 0x0438, 0x0441, 0x043e, 0x043a);
  btn.classList.toggle('on',on);
}

// ───────────────────────────────────────────────────────────────
//  AUTO CHART UPDATE
// ───────────────────────────────────────────────────────────────
function updateCharts(){
  const rows=sortedRows();
  const start=S.page*S.charts.length;
  const pageSyms=rows.slice(start,start+S.charts.length).map(r=>r.sym);
  let changed=false;
  const currentSyms=S.charts.map(c=>c.sym);
  for(let i=0;i<S.charts.length;i++){
    const ns=pageSyms[i]||null;
    if(currentSyms[i]!==ns)changed=true;
  }
  if(changed){
    clearAllRulers();
    (async()=>{
      for(let i=0;i<S.charts.length;i++){
        const ns=pageSyms[i]||null;
        if(S.charts[i].sym!==ns)await loadChart(i,ns);
      }
      restartChartStreams(600);
    })();
  }
  updatePagination(rows.length);
  schedulePersistUserSettings();
}

// ───────────────────────────────────────────────────────────────
//  TOGGLE SCREENER
// ───────────────────────────────────────────────────────────────
function toggleDensity(){
  toggleDensityUi({
    S, rCanvas, renderSettingsDensity,
    fetchJSON: fj, API,
    densityCache: _densityCache,
  });
}

function getDensitySettings(sym){
  return getOrCreateDensitySettings(S.densitySettings, sym);
}

function renderSettingsDensity(body){
  renderSettingsDensityUi(body, {
    S, tbtnHtml,
    fetchJSON: fj, API,
    densityCache: _densityCache,
    rCanvas,
    timeToCoordX,
  });
}

function setDensityVisible(on){
  setDensityVisibleUi(on, {
    S, rCanvas, renderSettingsDensity,
    fetchJSON: fj, API, densityCache: _densityCache,
  });
}

function setDensityMult(sym,key,val){
  setDensityMultUi(sym, key, val, {
    S, rCanvas,
    fetchJSON: fj, API, densityCache: _densityCache,
    setDensityThreshold: setDensityThresholdMod,
  });
}

function resetDensitySettings(sym){
  resetDensitySettingsUi(sym, {
    S, rCanvas, renderSettingsDensity,
    fetchJSON: fj, API, densityCache: _densityCache,
    resetDensitySettings: resetDensitySettingsMod,
  });
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
    <button class="tbtn" onclick="toggleAlertLog();closeSettings()">рџ”” Открыть лог</button>
  </div>
  <div class="smodal-row" style="border-bottom:none">
    <span class="smodal-lbl" style="color:var(--text2)">Сброс всех алертов</span>
    <button class="tbtn" onclick="resetAllAlerts()">вџі Сброс fired</button>
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

// ───────────────────────────────────────────────────────────────
//  #11: CLEAR DRAWINGS (double-click button in chart header)
// ───────────────────────────────────────────────────────────────
const _clearClickTs={};
function clearDrawingsSlot(slot){
  const now=Date.now();
  const last=_clearClickTs[slot]||0;
  if(now-last<600){
    const ch=S.charts[slot];
    if(ch.sym&&ch.drawings.length){
      pushDrawUndo(ch.sym);
      applySymDrawings(ch.sym,[]);
      setLastDrawSym();
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
      setLastDrawSym();
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

// ───────────────────────────────────────────────────────────────
//  #9: COLOR GROUPS
// ───────────────────────────────────────────────────────────────
function getSymGroup(sym){return S.symGroups[sym]||0;}
function isSymFavorite(sym){return !!S.symFavorites?.[sym];}
function symbolInGroup(sym,g){
  if(!sym||!g)return false;
  if(g===FAVORITE_GROUP_ID)return isSymFavorite(sym);
  return getSymGroup(sym)===g;
}
function styleGroupDot(dot,sym){
  if(!dot)return;
  const grp=getSymGroup(sym);
  const col=GROUP_COLORS[grp]||'';
  dot.style.display=sym?'inline-block':'none';
  dot.textContent='';
  dot.style.color='';
  dot.style.fontSize='';
  dot.style.background=col||'var(--bg4)';
  dot.style.borderColor=col?'rgba(255,255,255,.25)':'var(--border2)';
}
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
  if(g===FAVORITE_GROUP_ID){
    if(sym)S.symFavorites[sym]=true;
  }else if(g===0){
    delete S.symGroups[sym];
  }else{
    S.symGroups[sym]=g;
  }
  // update color stripe in chart headers immediately
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
  scheduleGroupUiRefresh();
  schedulePersistUserSettings();
}
function setSymFavorite(sym,on){
  if(!sym)return;
  if(on)S.symFavorites[sym]=true;
  else delete S.symFavorites[sym];
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
  scheduleGroupUiRefresh();
  schedulePersistUserSettings();
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
    for(let g=1;g<=FAVORITE_GROUP_ID;g++){
      const cnt=g===FAVORITE_GROUP_ID
        ? Object.keys(S.symFavorites).length
        : Object.values(S.symGroups).filter(v=>v===g).length;
      // Hide group button if no coins assigned AND it's not the active filter
      if(cnt===0&&S.activeGroupFilter!==g)continue;
      const wrap=document.createElement('div');wrap.style.cssText='position:relative;display:flex;align-items:center;';
      const btn=document.createElement('div');
      btn.className='cg-filter-btn'+(S.activeGroupFilter===g?' active':'')+(g===FAVORITE_GROUP_ID?' cg-filter-fav':'');
      if(g===FAVORITE_GROUP_ID){
        btn.style.background='transparent';
        btn.style.border='2px solid transparent';
        btn.style.borderRadius='50%';
        btn.style.width='18px';
        btn.style.height='18px';
        btn.style.minWidth='18px';
        btn.style.minHeight='18px';
        btn.style.padding='0';
        btn.style.boxSizing='border-box';
        btn.style.color=FAVORITE_GROUP_COLOR;
        btn.style.display='inline-flex';
        btn.style.alignItems='center';
        btn.style.justifyContent='center';
        btn.style.fontSize='13px';
        btn.style.lineHeight='1';
        btn.textContent='★';
      }else{
        btn.style.background=GROUP_COLORS[g];
        btn.textContent='';
      }
      btn.title=`${g===FAVORITE_GROUP_ID?'Избранное':`Группа ${g}`} (${cnt} монет). ЛКМ • фильтр · ПКМ • очистить группу`;
      btn.onclick=()=>{
        const next=S.activeGroupFilter===g?0:g;
        S.activeGroupFilter=next;
        S._potFilterPreset=null;
        scheduleGroupUiRefresh();
      };
      btn.oncontextmenu=ev=>{ev.preventDefault();ev.stopPropagation();
        if(!cnt)return;
        showConfirmModal(`Очистить ${g===FAVORITE_GROUP_ID?'избранное':`группу ${g}`} (${cnt} монет)?`,{
          title:g===FAVORITE_GROUP_ID?'Очистка избранного':'Очистка группы',
          okText:'Очистить',
          danger:true,
          onConfirm:()=>{
            if(g===FAVORITE_GROUP_ID)S.symFavorites={};
            else Object.keys(S.symGroups).forEach(s=>{if(S.symGroups[s]===g)delete S.symGroups[s];});
            if(S.activeGroupFilter===g)S.activeGroupFilter=0;
            scheduleGroupUiRefresh();
            schedulePersistUserSettings();
          }
        });
      };
      wrap.appendChild(btn);
      // Small "+" button to manage this group
      const addBtn=document.createElement('button');
      addBtn.style.cssText='background:none;border:none;color:var(--text3);cursor:pointer;font:inherit;font-size:8px;padding:0 1px;line-height:1;margin-left:-1px;';
      addBtn.title=g===FAVORITE_GROUP_ID?'Управление избранным':`Управление группой ${g}`;addBtn.textContent='＋';
      addBtn.onclick=ev=>{ev.stopPropagation();openGroupManager(g);};
      wrap.appendChild(addBtn);
      grpSec.appendChild(wrap);
    }
    bar.appendChild(grpSec);

    // Potential preset tabs • appear as filter tabs alongside color groups
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
      tab.title=`${pr.name}: ${cnt} монет. ЛКМ • фильтр, ПКМ • настройка`;
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
  // Quick-assign last used group first (fast tagging), then allow changing in picker.
  const target=Math.max(1,Math.min(7,S.lastGroupUsed||1));
  if(getSymGroup(sym)!==target)setSymGroup(sym,target);
  else setSymGroup(sym,0);
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
  pick.style.cssText=`position:fixed;z-index:600;left:${r.left}px;top:${Math.max(4,r.top-10)}px;
    background:var(--bg3);border:1px solid var(--border2);border-radius:6px;
    padding:6px 8px;display:flex;flex-direction:column;gap:5px;
    box-shadow:0 4px 16px rgba(0,0,0,.6)`;
  // Label
  const lbl=document.createElement('div');lbl.style.cssText='font-size:9px;color:var(--text3);padding-bottom:2px;border-bottom:1px solid var(--border);';
  lbl.textContent='Цветовая группа + Избранное:';pick.appendChild(lbl);
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
  const favOn=isSymFavorite(sym);
  const fav=document.createElement('div');
  fav.className='cg-dot cg-fav-dot';
  fav.textContent='★';
  fav.title='Избранное · нажмите чтобы добавить/убрать';
  if(favOn)fav.style.outline='2px solid #fff';
  fav.onclick=()=>{setSymFavorite(sym,!favOn);pick.remove();syncAllGroupDots(sym);};
  row.appendChild(fav);
  pick.appendChild(row);
  document.body.appendChild(pick);
  // Position picker above the anchor when possible (so it doesn't block items below).
  const vw=window.innerWidth||0,vh=window.innerHeight||0;
  const pr=pick.getBoundingClientRect();
  let left=Math.max(4,Math.min(r.left,Math.max(4,vw-pr.width-4)));
  let top=r.top-pr.height-6;
  if(top<4)top=r.bottom+6;
  if(top+pr.height>vh-4)top=Math.max(4,vh-pr.height-4);
  pick.style.left=left+'px';
  pick.style.top=top+'px';
  setTimeout(()=>document.addEventListener('mousedown',function h(e){if(!pick.contains(e.target)){pick.remove();document.removeEventListener('mousedown',h);}},true),50);
}

// Sync all visible dots (chart headers + FS) after a group change
function syncAllGroupDots(sym){
  S.charts.forEach((ch,i)=>{if(ch.sym===sym)updateChartHeader(i,sym);});
  const fsCgDot=document.getElementById('fsCgDot');
  if(fsCgDot&&S.fsSym===sym)styleGroupDot(fsCgDot,sym);
}

function openGroupManager(g){
  const old=document.getElementById('groupMgrModal');if(old)old.remove();
  const col=g===FAVORITE_GROUP_ID?FAVORITE_GROUP_COLOR:GROUP_COLORS[g];
  const modal=document.createElement('div');modal.id='groupMgrModal';
  modal.style.cssText='position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
  const box=document.createElement('div');
  box.style.cssText=`background:var(--bg2);border:1px solid ${col};border-radius:6px;width:320px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.7);`;
  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);gap:8px;flex-shrink:0';
  hdr.innerHTML=`<span style="width:12px;height:12px;${g===FAVORITE_GROUP_ID?'':'border-radius:50%;'}background:${g===FAVORITE_GROUP_ID?'transparent':col};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:${FAVORITE_GROUP_COLOR}">${g===FAVORITE_GROUP_ID?'★':''}</span>
    <span style="font-size:11px;font-weight:600;color:#fff;flex:1">${g===FAVORITE_GROUP_ID?'Избранное':`Группа ${g}`}</span>
    <span style="font-size:9px;color:var(--text3)">Нажмите монету чтобы добавить/убрать</span>
    <button style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:0 3px" onclick="document.getElementById('groupMgrModal').remove()">вњ•</button>`;
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
      const ag=symbolInGroup(a.sym,g)?0:1,bg=symbolInGroup(b.sym,g)?0:1;
      if(ag!==bg)return ag-bg;return a.sym.localeCompare(b.sym);
    });
    const frag=document.createDocumentFragment();
    for(const m of rows){
      const inGrp=symbolInGroup(m.sym,g);
      const row=document.createElement('div');
      row.style.cssText=`display:flex;align-items:center;padding:5px 12px;cursor:pointer;gap:8px;border-bottom:1px solid rgba(37,37,48,.4);transition:background .06s;${inGrp?'background:rgba(255,255,255,.04)':''}`;
      row.innerHTML=`<span style="width:10px;height:10px;${g===FAVORITE_GROUP_ID?'':'border-radius:50%;'}background:${g===FAVORITE_GROUP_ID?'transparent':(inGrp?col:'var(--bg4)')};border:1px solid ${g===FAVORITE_GROUP_ID?'transparent':(inGrp?col:'var(--border2)')};flex-shrink:0;color:${FAVORITE_GROUP_COLOR};display:inline-flex;align-items:center;justify-content:center;font-size:10px">${g===FAVORITE_GROUP_ID?(inGrp?'★':'★†'):''}</span>
        <span style="font-size:10px;font-weight:500;color:${inGrp?'#fff':'var(--text2)'};flex:1">${m.sym.replace(/USDT$/,'')}</span>
        ${inGrp?`<span style="font-size:9px;color:${col}">✓ в группе</span>`:''}`;
      row.onmouseenter=()=>row.style.background=inGrp?'rgba(255,255,255,.07)':'rgba(255,255,255,.025)';
      row.onmouseleave=()=>row.style.background=inGrp?'rgba(255,255,255,.04)':'';
      row.onclick=()=>{
        if(g===FAVORITE_GROUP_ID)setSymFavorite(m.sym,!inGrp);
        else setSymGroup(m.sym,inGrp?0:g);
        buildList(srch.value);
      };
      frag.appendChild(row);
    }
    list.appendChild(frag);
  };
  buildList();
  srch.oninput=()=>{
    const mapped=mapRuKeyboardToEn(srch.value);
    if(mapped!==srch.value){
      const pos=srch.selectionStart;
      srch.value=mapped;
      try{srch.setSelectionRange(pos,pos);}catch(e){}
    }
    buildList(mapped);
  };
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

// ───────────────────────────────────────────────────────────────
//  SPLITTER (generic)
// ───────────────────────────────────────────────────────────────
function dragSpl(e,splId,leftId,bodyId){
  e.preventDefault();
  const spl=document.getElementById(splId);spl.classList.add('drag');
  const left=document.getElementById(leftId);
  const body=document.getElementById(bodyId);
  const fsCA=document.getElementById('fsChartArea');
  const cp=document.getElementById('cpanel');
  // Cache the body rect once — `getBoundingClientRect` is layout-bound
  // and was the main reason dragging felt slow (called per mousemove).
  const bodyRect0=body.getBoundingClientRect();
  let resizeRaf=0;
  const doResize=()=>{
    resizeRaf=0;
    for(const ch of S.charts){if(ch.lc)try{ch.lc.resize(ch.canvas?.width||1,ch.canvas?.height||1);}catch(_){}}
    for(const ch of S.fsCharts){if(ch.lc)try{ch.lc.resize(ch.canvas?.width||1,ch.canvas?.height||1);}catch(_){}}
  };
  const onM=(ev)=>{
    const pct=Math.max(20,Math.min(85,((ev.clientX-bodyRect0.left)/bodyRect0.width)*100));
    left.style.width=pct+'%';
    if(leftId==='cpanel'&&fsCA){fsCA.style.flex='none';fsCA.style.width=pct+'%';}
    else if(leftId==='fsChartArea'&&cp){cp.style.flex='none';cp.style.width=pct+'%';}
    S._savedCpW=pct+'%';S._savedFsCaW=pct+'%';
    // Coalesce all per-move lc.resize() calls into a single rAF: at
    // 120Hz mouse this turns N sync layout passes into one.
    if(!resizeRaf)resizeRaf=requestAnimationFrame(doResize);
  };
  const onU=()=>{
    spl.classList.remove('drag');
    window.removeEventListener('mousemove',onM);
    window.removeEventListener('mouseup',onU);
    // Make sure the final resize still runs even if rAF is pending.
    if(!resizeRaf)doResize();
  };
  window.addEventListener('mousemove',onM);
  window.addEventListener('mouseup',onU);
}

// ───────────────────────────────────────────────────────────────
//  SETTINGS
// ───────────────────────────────────────────────────────────────
function openSettings(){
  switchSettingsTab(S.settingsTab);
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings(){document.getElementById('settingsModal').classList.remove('open');}

function switchSettingsTab(tab){
  S.settingsTab=tab;
  ['gen','chead','ind','density','alerts'].forEach(t=>{
    const el=document.getElementById(`stab-${t}`);if(el)el.classList.toggle('on',t===tab);
  });
  const body=document.getElementById('smodal-body');
  if(tab==='gen')renderSettingsGen(body);
  else if(tab==='chead')renderSettingsChartHead(body);
  else if(tab==='ind')renderSettingsInd(body);
  else if(tab==='density')renderSettingsDensity(body);
  else renderSettingsAlerts(body);
}

function tbtnHtml(id,label,onclick,active){return`<button class="tbtn${active?' on':''}" id="${id}" onclick="${onclick}">${label}</button>`;}

function renderSettingsGen(body){
  const fsPresetLabel=(
    S.fsLayoutPreset==='two_horizontal'?'2 графика (горизонтально)':
    S.fsLayoutPreset==='two_vertical'?'2 графика (вертикально)':
    S.fsLayoutPreset==='four_grid'?'4 графика (2×2)':
    '3 графика (широкий сверху)'
  );
  body.innerHTML=`
  <div class="smodal-row">
    <span class="smodal-lbl">Мини-графики: вертикаль × горизонталь</span>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:290px;flex:1">
      <div style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-end">
        <span style="font-size:9px;color:var(--text3);min-width:54px">Вертикаль</span>
        <input type="range" min="1" max="7" step="1" value="${S.gridRows}" oninput="setGridRows(this.value)" style="flex:1;max-width:170px">
        <span style="font-size:10px;color:var(--text3);min-width:20px;text-align:right">${S.gridRows}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-end">
        <span style="font-size:9px;color:var(--text3);min-width:54px">Горизонталь</span>
        <input type="range" min="1" max="7" step="1" value="${S.gridCols}" oninput="setGridCols(this.value)" style="flex:1;max-width:170px">
        <span style="font-size:10px;color:var(--text3);min-width:20px;text-align:right">${S.gridCols}</span>
      </div>
      <div style="font-size:9px;color:var(--text3)">Итог: ${S.gridRows} × ${S.gridCols} = ${S.gridSize} графиков</div>
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Крупный режим: пресеты</span>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;max-width:320px;flex:1">
      <div class="smodal-btns" style="gap:4px;flex-wrap:wrap;justify-content:flex-end">
        ${tbtnHtml('fspH2','2 гориз',"setFsLayoutPreset('two_horizontal')",S.fsLayoutPreset==='two_horizontal')}
        ${tbtnHtml('fspV2','2 вертик',"setFsLayoutPreset('two_vertical')",S.fsLayoutPreset==='two_vertical')}
        ${tbtnHtml('fsp3','3 (шир+2)',"setFsLayoutPreset('three_top_wide')",S.fsLayoutPreset==='three_top_wide')}
        ${tbtnHtml('fsp4','2×2',"setFsLayoutPreset('four_grid')",S.fsLayoutPreset==='four_grid')}
      </div>
      <div style="font-size:9px;color:var(--text3)">Активный: ${fsPresetLabel}</div>
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
  <div class="smodal-row" style="flex-direction:column;align-items:stretch;gap:8px">
    <span class="smodal-lbl">Авто-наклонки (вџ‚ на тулбаре)</span>
    <div style="font-size:9px;color:var(--text3);line-height:1.45">Пивоты + касания свечей. Поддержка • по минимумам, сопротивление • по максимумам.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px">
      <label>Пивот (бар) <input type="number" min="2" max="8" value="${S.autoTrend.pivotBars}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('pivotBars',+this.value)"></label>
      <label>Касания ≥ <input type="number" min="2" max="8" value="${S.autoTrend.minTouches}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('minTouches',+this.value)"></label>
      <label>Допуск % <input type="number" min="0.05" max="2" step="0.05" value="${S.autoTrend.touchPct}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('touchPct',+this.value)"></label>
      <label>Макс. линий <input type="number" min="1" max="10" value="${S.autoTrend.maxLines}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('maxLines',+this.value)"></label>
      <label>Окно баров <input type="number" min="60" max="400" value="${S.autoTrend.lookback}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('lookback',+this.value)"></label>
      <label>Продлить <input type="number" min="0" max="80" value="${S.autoTrend.extendBars}" style="width:100%;margin-top:3px" onchange="setAutoTrendSetting('extendBars',+this.value)"></label>
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Сортировка изм. по модулю</span>
    <div class="smodal-btns">
      ${tbtnHtml('sabsOn','Вкл',"setSortAbs(true)",S.sortAbs)}
      ${tbtnHtml('sabsOff','Выкл',"setSortAbs(false)",!S.sortAbs)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Отступ справа (бары пустоты)</span>
    <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;max-width:280px">
      <input type="range" id="chartRoSlider" min="0" max="28" step="1" value="${S.chartRightOffset}"
        oninput="setChartRightOffset(this.value)" style="flex:1;max-width:180px">
      <span id="chartRoVal" style="font-size:10px;color:var(--text3);min-width:20px">${S.chartRightOffset}</span>
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Видимых свечей (масштаб)</span>
    <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;max-width:280px">
      <input type="range" id="chartVisSlider" min="48" max="200" step="4" value="${S.chartVisibleBars}"
        oninput="setChartVisibleBars(this.value)" style="flex:1;max-width:180px">
      <span id="chartVisVal" style="font-size:10px;color:var(--text3);min-width:28px">${S.chartVisibleBars}</span>
    </div>
  </div>
  <div class="smodal-row" style="border-bottom:none;padding-top:0">
    <span class="smodal-lbl" style="flex:1;font-size:9px;color:var(--text3);line-height:1.45;font-weight:400">На полноэкранных графиках масштаб и отступ справа подстраиваются по ширине окна: показывается больше свечей, «пустые» бары справа слегка ужимаются • чтобы крупный график не казался чрезмерно «растянутым».</span>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Автосмена монет в сетке графиков</span>
    <div class="smodal-btns">
      ${tbtnHtml('cSynOn','Вкл',"setChartAutoSyncOpt(true)",S.chartAutoSync)}
      ${tbtnHtml('cSynOff','Стоп',"setChartAutoSyncOpt(false)",!S.chartAutoSync)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Подсветка сессий (UTC)</span>
    <div class="smodal-btns">
      ${tbtnHtml('sessOn','Вкл',"setSessionFxEnabled(true)",S.sessionFx.enabled)}
      ${tbtnHtml('sessOff','Выкл',"setSessionFxEnabled(false)",!S.sessionFx.enabled)}
    </div>
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Зоны сессий</span>
    <div class="smodal-btns" style="flex-wrap:wrap;justify-content:flex-end;max-width:240px;gap:4px">
      ${tbtnHtml('sessAsia','Азия 0—9',"toggleSessionBand('asia')",S.sessionFx.asia)}
      ${tbtnHtml('sessLon','Лондон 8—17',"toggleSessionBand('london')",S.sessionFx.london)}
      ${tbtnHtml('sessNy','NY 13—22',"toggleSessionBand('ny')",S.sessionFx.ny)}
    </div>
  </div>
  <div class="smodal-row" style="border-bottom:none;padding-top:0">
    <span class="smodal-lbl" style="flex:1;font-size:8px;color:var(--text3);line-height:1.45;font-weight:400">Границы в UTC (как у глобальных рынков). Пересечения: приоритет NY → Лондон → Азия; вне зон • приглушённая полоса «мёртвое время».</span>
  </div>
  <div class="smodal-ver">CryptScreen v1.4 · Binance Futures</div>`;
}

function setChartAutoSyncOpt(on){
  S.chartAutoSync=!!on;
  saveChartAutoSyncPref();
  syncChartSyncBtnUi();
  const body=document.getElementById('smodal-body');
  if(body&&S.settingsTab==='gen')renderSettingsGen(body);
  schedulePersistUserSettings();
}
function setSessionFxEnabled(on){
  S.sessionFx.enabled=!!on;
  saveSessionFxPref();
  const body=document.getElementById('smodal-body');
  if(body&&S.settingsTab==='gen')renderSettingsGen(body);
  renderTable();
  [...S.charts,...S.fsCharts].forEach(ch=>{if(ch?.canvas&&ch?.lc)rCanvas(ch);});
  schedulePersistUserSettings();
}
function toggleSessionBand(which){
  if(which==='asia')S.sessionFx.asia=!S.sessionFx.asia;
  else if(which==='london')S.sessionFx.london=!S.sessionFx.london;
  else if(which==='ny')S.sessionFx.ny=!S.sessionFx.ny;
  saveSessionFxPref();
  const body=document.getElementById('smodal-body');
  if(body&&S.settingsTab==='gen')renderSettingsGen(body);
  renderTable();
  [...S.charts,...S.fsCharts].forEach(ch=>{if(ch?.canvas&&ch?.lc)rCanvas(ch);});
  schedulePersistUserSettings();
}

function renderSettingsChartHead(body){
  body.innerHTML='<div style="font-size:9px;color:var(--text3);margin-bottom:8px">Плашки над мини-графиками и в шапке полноэкранного режима. Отдельно от колонок списка монет (вкладка «Индикаторы»). Перетащите порядок, ✓ • показать/скрыть.</div>';
  const list=document.createElement('div');list.className='ind-list';list.id='chartHeadList';
  S.chartHeadOrder.forEach(id=>{
    const def=CHART_HEAD_DEFS.find(d=>d.id===id);if(!def)return;
    const item=document.createElement('div');
    item.className='ind-item';item.dataset.id=id;item.draggable=true;
    const visible=S.chartHeadVisible.has(id);
    item.innerHTML=`<span class="ind-handle" title="Перетащить">⋮⋮</span>
      <span class="ind-check${visible?' checked':''}" onclick="toggleChartHeadCol('${id}',this)">✓</span>
      <span class="ind-name">${def.id==='chg'?'Рост':def.id==='vol'?'Объём':def.id==='trd'?'Сделки':def.id==='natr'?'NATR':'Корр.'}</span>
      <span class="ind-sub" style="opacity:.75">${def.id==='chg'?'24ч %':def.id==='vol'?'USDT 24ч':def.id==='trd'?'кол-во 24ч':def.id==='natr'?'5м/14 %':'к BTC'}</span>`;
    item.addEventListener('dragstart',e=>{e.dataTransfer.setData('text',id);item.style.opacity='0.4';});
    item.addEventListener('dragend',()=>{item.style.opacity='';document.querySelectorAll('#chartHeadList .ind-item').forEach(i=>i.classList.remove('drag-over'));});
    item.addEventListener('dragover',e=>{e.preventDefault();item.classList.add('drag-over');});
    item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
    item.addEventListener('drop',e=>{
      e.preventDefault();item.classList.remove('drag-over');
      const fromId=e.dataTransfer.getData('text');const toId=id;
      if(fromId===toId)return;
      const fi=S.chartHeadOrder.indexOf(fromId);const ti=S.chartHeadOrder.indexOf(toId);
      if(fi<0||ti<0)return;
      S.chartHeadOrder.splice(fi,1);S.chartHeadOrder.splice(ti,0,fromId);
      saveChartHeadPrefs();
      schedulePersistUserSettings();
      renderSettingsChartHead(body);
      applyChartHeadLayoutAll();
      for(let s=0;s<S.gridSize;s++){
        const sym=S.charts[s]?.sym;if(sym)updateChartHeader(s,sym);
      }
      if(S.fsOpen&&S.fsSym)updateFsHeaderValues();
    });
    list.appendChild(item);
  });
  body.appendChild(list);
}

function toggleChartHeadCol(id,el){
  if(S.chartHeadVisible.has(id)){if(S.chartHeadVisible.size>1)S.chartHeadVisible.delete(id);}
  else S.chartHeadVisible.add(id);
  el.classList.toggle('checked',S.chartHeadVisible.has(id));
  saveChartHeadPrefs();
  schedulePersistUserSettings();
  applyChartHeadLayoutAll();
  for(let s=0;s<S.gridSize;s++){
    const sym=S.charts[s]?.sym;if(sym)updateChartHeader(s,sym);
  }
  if(S.fsOpen&&S.fsSym)updateFsHeaderValues();
}

function renderSettingsInd(body){
  body.innerHTML='<div style="font-size:9px;color:var(--text3);margin-bottom:8px">Перетащите для изменения порядка. Нажмите ✓ для показа/скрытия.</div>';
  const list=document.createElement('div');list.className='ind-list';list.id='indList';
  S.colOrder.forEach(id=>{
    const col=ALL_COLS.find(c=>c.id===id);if(!col)return;
    const item=document.createElement('div');
    item.className='ind-item';item.dataset.id=id;item.draggable=true;
    const visible=S.colVisible.has(id);
    item.innerHTML=`<span class="ind-handle" title="Перетащить">⋮⋮</span>
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
      schedulePersistUserSettings();
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
  schedulePersistUserSettings();
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

function setGridSize(n, opts){
  n=Math.max(1,Math.min(49,+n|0));
  const skipAutoFill=opts&&opts.skipAutoFill;
  if(S.gridSize===n)return;
  S.gridSize=n;
  S.charts=Array.from({length:n},()=>mkChart());
  buildChartGrid();if(S.LC)for(let i=0;i<n;i++)initLCChart(i);
  S.page=0;
  if(!skipAutoFill){updateCharts();restartChartStreams(0);}
  renderSettingsGen(document.getElementById('smodal-body'));
  schedulePersistUserSettings();
}
function applyGridAxes(rows,cols,opts){
  rows=Math.max(1,Math.min(7,+rows|0));
  cols=Math.max(1,Math.min(7,+cols|0));
  const skipAutoFill=opts&&opts.skipAutoFill;
  if(S.gridRows===rows&&S.gridCols===cols)return;
  S.gridRows=rows;S.gridCols=cols;
  setGridSize(rows*cols,{skipAutoFill});
}
function setGridRows(rows){applyGridAxes(rows,S.gridCols);}
function setGridCols(cols){applyGridAxes(S.gridRows,cols);}
function getFsPresetCount(preset){
  if(preset==='two_horizontal'||preset==='two_vertical')return 2;
  if(preset==='four_grid')return 4;
  return 3;
}
function buildFsChartsFromConfig(){
  S.fsChartCount=getFsPresetCount(S.fsLayoutPreset);
  const next=[];
  for(let i=0;i<S.fsChartCount;i++){
    let tf=S.fsChartTfs[i]||FS_TFS[Math.min(i,FS_TFS.length-1)]||'5m';
    if(!FS_TFS.includes(tf))tf='5m';
    next.push(tf);
  }
  S.fsChartTfs=next;
  S.fsCharts=next.map(tf=>mkFsChart(tf));
}
function setFsLayoutPreset(preset){
  if(!['two_horizontal','two_vertical','three_top_wide','four_grid'].includes(preset))return;
  if(S.fsLayoutPreset===preset)return;
  S.fsLayoutPreset=preset;
  buildFsChartsFromConfig();
  if(S.fsOpen)openFullscreenBySym(S.fsSym);
  const body=document.getElementById('smodal-body');
  if(body&&S.settingsTab==='gen')renderSettingsGen(body);
  schedulePersistUserSettings();
}

function setUpColor(color){
  const upC=color==='white'?'#cccccc':'#1fa891';S.upColor=upC;
  [...S.charts,...S.fsCharts].forEach(ch=>{if(ch.cs)try{ch.cs.applyOptions({upColor:upC,borderUpColor:upC,wickUpColor:upC});}catch(e){}});
  renderSettingsGen(document.getElementById('smodal-body'));
  schedulePersistUserSettings();
}

function setWatermark(on){
  S.wmVisible=on;document.querySelectorAll('.chart-wm').forEach(el=>el.style.display=on?'flex':'none');
  renderSettingsGen(document.getElementById('smodal-body'));
  schedulePersistUserSettings();
}

function setSortAbs(on){
  S.sortAbs=on;updSortHdr();updateCharts();renderTable();
  renderSettingsGen(document.getElementById('smodal-body'));
  schedulePersistUserSettings();
}

function setChartRightOffset(v){
  S.chartRightOffset=Math.max(0,Math.min(36,+v));
  saveChartViewPrefs();
  applyDefaultChartViewAll();
  const el=document.getElementById('chartRoVal');if(el)el.textContent=String(S.chartRightOffset);
  const sl=document.getElementById('chartRoSlider');if(sl)sl.value=String(S.chartRightOffset);
  schedulePersistUserSettings();
}
function setChartVisibleBars(v){
  S.chartVisibleBars=Math.max(40,Math.min(220,+v));
  saveChartViewPrefs();
  applyDefaultChartViewAll();
  const el=document.getElementById('chartVisVal');if(el)el.textContent=String(S.chartVisibleBars);
  const sl=document.getElementById('chartVisSlider');if(sl)sl.value=String(S.chartVisibleBars);
  schedulePersistUserSettings();
}

// ───────────────────────────────────────────────────────────────
//  FULLSCREEN ANALYSIS
// ───────────────────────────────────────────────────────────────
function buildFsChartLayout(){
  const area=document.getElementById('fsChartArea');
  if(!area)return;
  area.innerHTML='';
  const makeCell=(idx,label)=>{
    const cell=document.createElement('div');
    cell.className='fs-dyn-cell';
    const bar=document.createElement('div');
    bar.className='fs-tf-bar';
    bar.id=`fsTfBar${idx}`;
    bar.innerHTML=`<span class="fs-label">${label}:</span>`;
    const el=document.createElement('div');
    el.className='fs-chart-el';
    el.id=`fsChartEl${idx}`;
    cell.append(bar,el);
    return cell;
  };
  if(S.fsLayoutPreset==='two_horizontal'){
    area.className='fs-layout-2h';
    area.append(makeCell(0,'ВЕРХ'),makeCell(1,'НИЗ'));
    return;
  }
  if(S.fsLayoutPreset==='two_vertical'){
    area.className='fs-layout-2v';
    area.append(makeCell(0,'ЛЕВЫЙ'),makeCell(1,'ПРАВЫЙ'));
    return;
  }
  if(S.fsLayoutPreset==='four_grid'){
    area.className='fs-layout-4';
    area.append(makeCell(0,'ЛЕВЫЙ ВЕРХ'),makeCell(1,'ПРАВЫЙ ВЕРХ'),makeCell(2,'ЛЕВЫЙ НИЗ'),makeCell(3,'ПРАВЫЙ НИЗ'));
    return;
  }
  area.className='fs-layout-3';
  const top=makeCell(0,'ОСНОВНОЙ');
  top.classList.add('fs-span-all');
  area.append(top,makeCell(1,'ЛЕВЫЙ'),makeCell(2,'ПРАВЫЙ'));
}
function buildFsTfBar(barId,idx){
  const bar=document.getElementById(barId);
  if(!bar)return;
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
  fch._histBootstrapDone=false;
  fch.drawings=S.fsSym?getSymDrawings(S.fsSym):[];
  initLCChart(null,true,idx);
  const wm=document.getElementById(`fswm${idx}`);
  if(wm&&S.fsSym)wm.textContent=S.fsSym.replace(/USDT$/,'');
}

async function loadFsChart(idx){
  const fch=S.fsCharts[idx];const sym=S.fsSym;
  if(!sym||!fch.cs||!fch.lc)return;
  fch._histBootstrapDone=false;
  fch._oiHist=[];fch._oiRaw=[];fch._oiLastFetchTs=0;
  const applyCandles=(candles)=>{
    fch.candles=candles.slice(-HIST_CACHE_MAX);
    if(fch.candles.length<MIN_CHART_CANDLES){
      fch._histBootstrapDone=false;
      return false;
    }
    fch._histBootstrapDone=true;
    const lp=fch.candles[fch.candles.length-1].c;
    fch.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lp)}});
    fch.cs.setData(fch.candles.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    fch.vs.setData(fch.candles.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
    repaintBbSeries(fch);
    repaintOiSeries(fch);
    refreshChartOiSeries(fch,fch.tf,sym);
    const lastFsCandle=fch.candles[fch.candles.length-1];
    if(lastFsCandle)syncLivePriceLabel(fch,lastFsCandle.c,lastFsCandle.o);
    applyDefaultChartView(fch);
    rCanvas(fch);
    return true;
  };
  try{
    const cacheKey=`${fch.tf}:${sym}`;
    const cached=S.histCache[cacheKey];
    if(Array.isArray(cached)&&cached.length>=MIN_CHART_CANDLES){
      applyCandles(cached);
    }
    let raw=await fj(`${API}/klines?symbol=${sym}&interval=${fch.tf}&limit=${HIST_INITIAL}`);
    if(S.fsSym!==sym)return;
    let candles=parseKlines(raw);
    if(candles.length<MIN_CHART_CANDLES){
      raw=await fj(`${API}/klines?symbol=${sym}&interval=${fch.tf}&limit=${Math.max(HIST_INITIAL,800)}`);
      if(S.fsSym!==sym)return;
      candles=parseKlines(raw);
    }
    S.histCache[cacheKey]=candles.slice(-HIST_CACHE_MAX);
    if(!applyCandles(candles)){
      console.warn('loadFsChart thin',sym,fch.tf,candles.length);
      return;
    }
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
    const fts=fch.lc.timeScale();
    let logRange=null,vTime=null;
    try{logRange=(typeof fts.getVisibleLogicalRange==='function')?fts.getVisibleLogicalRange():null;}catch(e){}
    try{if(typeof fts.getVisibleRange==='function')vTime=fts.getVisibleRange();}catch(e){}
    let pr=null;
    try{
      const ps=typeof fch.cs.priceScale==='function'?fch.cs.priceScale():null;
      if(ps&&typeof ps.getVisibleRange==='function')pr=ps.getVisibleRange();
    }catch(e){}
    const prepended=nc.length;
    fch.candles=[...nc,...fch.candles];
    const merged=fch.candles;
    const doSet=()=>{
      if(!fch.cs||!fch.lc)return;
      try{
        fch.cs.setData(merged.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
        fch.vs.setData(merged.map(k=>({time:toChartTime(k.t),value:k.qv,color:k.c>=k.o?'#1fa89122':'#e0404022'})));
        const ro=Math.max(0,Math.min(36,S.chartRightOffset|0));
        try{fts.applyOptions({rightOffset:ro,fixRightEdge:false});}catch(e){}
        if(logRange&&typeof logRange.from==='number'&&typeof logRange.to==='number'&&typeof fts.setVisibleLogicalRange==='function'){
          try{fts.setVisibleLogicalRange({from:logRange.from+prepended,to:logRange.to+prepended});}catch(e){}
        }else if(vTime&&vTime.from!=null&&vTime.to!=null){try{fts.setVisibleRange(vTime);}catch(e){}}
        try{
          const ps=typeof fch.cs.priceScale==='function'?fch.cs.priceScale():null;
          if(pr&&ps&&typeof ps.setVisibleRange==='function')ps.setVisibleRange(pr);
        }catch(e){}
        repaintBbSeries(fch);
        if(S.showOiOnChart&&S.fsSym)void refreshChartOiSeries(fch,fch.tf,S.fsSym);
        else{fch._oiHist=alignOiToCandles(merged,fch._oiRaw||[]);repaintOiSeries(fch);}
      }catch(e){}
    };
    if(typeof requestIdleCallback!=='undefined'){requestIdleCallback(doSet,{timeout:2000});}
    else{setTimeout(doSet,0);}
  }catch(e){}finally{fch.histLoading=false;}
}

function openFullscreenBySym(sym){
  if(!sym)return;
  clearAllRulers();
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
  if(fsCgDot)styleGroupDot(fsCgDot,sym);
  updateFsHeaderValues();
  // Build FS screener
  buildScreenerHeader(document.getElementById('fsShdr'));
  renderTable();
  // Build configurable FS charts (load first chart with priority)
  buildFsChartLayout();
  for(let i=0;i<S.fsChartCount;i++){buildFsTfBar(`fsTfBar${i}`,i);initFsChart(i);}
  if(S.fsChartCount>0)loadFsChart(0);
  for(let i=1;i<S.fsChartCount;i++)setTimeout(()=>loadFsChart(i),0);
  refreshEMAButtonState();
  startFsWs();
  setTimeout(autoResizeScreener,100);
}

function openFullscreen(slot){
  const sym=S.charts[slot]?.sym;if(!sym)return;
  openFullscreenBySym(sym);
}

function closeFullscreen(){
  hideChartIndTooltip();
  clearAllRulers();
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
  if(idx<0||idx>=S.fsCharts.length)return;
  S.fsCharts[idx].tf=tf;
  S.fsChartTfs[idx]=tf;
  const bar=document.getElementById(`fsTfBar${idx}`);
  if(bar)bar.querySelectorAll('.fs-tf-btn').forEach(b=>b.classList.toggle('on',b.textContent===tf));
  initFsChart(idx);await loadFsChart(idx);startFsWs();
  schedulePersistUserSettings();
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
        if(!fch.cs||!fch._histBootstrapDone||!fch.candles?.length)return;
        if(!applyLivePriceToCandle(fch,fch.tf,price,ts))return;
        fch._lastRtUpdateTs=Date.now();
        S.histCache[`${fch.tf}:${S.fsSym}`]=fch.candles.slice(-HIST_CACHE_MAX);
        try{
          const lc=fch.candles[fch.candles.length-1];
          fch.cs.update({time:toChartTime(lc.t),open:lc.o,high:lc.h,low:lc.l,close:lc.c});
          fch.vs.update({time:toChartTime(lc.t),value:lc.qv||0,color:lc.c>=lc.o?'#1fa89122':'#e0404022'});
          repaintBbSeries(fch);
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
      if(fch.tf!==tf||!fch.cs||!fch._histBootstrapDone)return;
      const candle={t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,qv:+k.q,v:+k.v,tr:+k.n};
      try{
        fch.cs.update({time:toChartTime(candle.t),open:candle.o,high:candle.h,low:candle.l,close:candle.c});
        fch.vs.update({time:toChartTime(candle.t),value:candle.qv,color:candle.c>=candle.o?'#1fa89122':'#e0404022'});
        repaintBbSeries(fch);
        syncLivePriceLabel(fch,candle.c,candle.o);
      }catch(e){}
      if(fch.candles.length&&fch.candles[fch.candles.length-1].t===candle.t)fch.candles[fch.candles.length-1]=candle;
      else if(fch.candles.length&&candle.t>fch.candles[fch.candles.length-1].t)appendCandleWithGaps(fch.candles,candle,tfMs(fch.tf));
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

// ───────────────────────────────────────────────────────────────
//  BACKGROUND KLINES
// ───────────────────────────────────────────────────────────────
async function loadKlinesBackground(){
  try{
    const visible=S.charts.map(c=>c.sym).filter(Boolean);
    const top=Object.entries(S.tk).filter(([s])=>S.syms.includes(s)).sort((a,b)=>b[1].qv-a[1].qv).map(([s])=>s);
    const all=[...new Set([...visible,...top])];
    const trendTf=S.tf;
    const trendLim=trendKlineFetchLimit(trendTf);
    if(visible.length){
      const kVis=await batchKlines(visible,S.tf,Math.max(MIN_CHART_CANDLES,Math.min(HIST_INITIAL,500)),null,null,12);
      for(const sym of visible){
        const kl=kVis[sym];
        if(!kl?.length)continue;
        S.histCache[`${S.tf}:${sym}`]=kl.slice(-HIST_CACHE_MAX);
        const slot=S.charts.findIndex(c=>c.sym===sym);
        if(slot<0)continue;
        const ch=S.charts[slot];
        if(ch.sym!==sym||!ch.cs)continue;
        ch.candles=kl.slice(-HIST_CACHE_MAX);
        if(ch.candles.length>=MIN_CHART_CANDLES){
          ch._histBootstrapDone=true;
          try{paintSlotData(slot);}catch(e){}
        }
      }
    }
    const [k5,k1h,k1m,kTr]=await Promise.all([
      batchKlines(all,'5m',300,null,null,8),
      batchKlines(all,'1h',170,null,null,8),
      batchKlines(all,'1m',70,null,null,6),
      batchKlines(all,trendTf,trendLim,null,null,8),
    ]);
    Object.assign(S.k5m,k5);Object.assign(S.k1h,k1h);Object.assign(S.k1m,k1m);
    if(trendTf===S.tf)Object.assign(S.kTrend,kTr);
    calcAll();renderTable();
    refreshMetricKlinesSlice();
  }catch(e){
    console.warn('bg klines',e);
  }finally{
    S.bgDone=true; // гарантируем true даже при ошибке
  }
}

function loadScript(url){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

// ───────────────────────────────────────────────────────────────
//  MAIN
// ───────────────────────────────────────────────────────────────
function hydrateUserSession(){
  const pd=window.__pendingDrawings;
  if(pd&&typeof pd==='object'){
    for(const [sym,dr] of Object.entries(pd)){
      if(!Array.isArray(dr))continue;
      S.symDrawings[sym]=cloneDrawings(dr);
    }
    rebumpDrawIdAfterLoad();
    window.__pendingDrawings=null;
  }
  const ps=window.__pendingUserSettings;
  window.__pendingUserSettings=null;
  if(!ps||typeof ps!=='object')return false;

  if(ps.symGroups&&typeof ps.symGroups==='object')
    Object.assign(S.symGroups,ps.symGroups);
  if(ps.symFavorites&&typeof ps.symFavorites==='object'){
    Object.keys(ps.symFavorites).forEach(sym=>{if(ps.symFavorites[sym])S.symFavorites[sym]=true;});
  }
  if(ps.lastGroupUsed!=null&&!isNaN(+ps.lastGroupUsed))S.lastGroupUsed=Math.max(1,Math.min(7,+ps.lastGroupUsed|0));
  if(ps.activeGroupFilter!=null&&!isNaN(+ps.activeGroupFilter))S.activeGroupFilter=Math.max(0,Math.min(FAVORITE_GROUP_ID,+ps.activeGroupFilter|0));
  if(ps.search!=null)S.q=String(ps.search);
  if(typeof ps.chartAutoSync==='boolean')S.chartAutoSync=ps.chartAutoSync;
  if(ps.chartHead&&typeof ps.chartHead==='object'){
    if(Array.isArray(ps.chartHead.order)){
      const seen=new Set();
      const next=[];
      for(const id of ps.chartHead.order){if(CHART_HEAD_IDS.includes(id)&&!seen.has(id)){next.push(id);seen.add(id);}}
      for(const id of CHART_HEAD_IDS){if(!seen.has(id))next.push(id);}
      S.chartHeadOrder=next;
    }
    if(Array.isArray(ps.chartHead.visible)){
      S.chartHeadVisible=new Set(ps.chartHead.visible.filter(id=>CHART_HEAD_IDS.includes(id)));
      if(!S.chartHeadVisible.size)S.chartHeadVisible=new Set(['chg','vol','trd','natr']);
    }
  }
  if(ps.columns&&typeof ps.columns==='object'){
    if(Array.isArray(ps.columns.order)){
      const seen=new Set();
      const next=[];
      for(const id of ps.columns.order){if(ALL_COLS.some(c=>c.id===id)&&!seen.has(id)){next.push(id);seen.add(id);}}
      for(const c of ALL_COLS){if(!seen.has(c.id))next.push(c.id);}
      S.colOrder=next;
    }
    if(Array.isArray(ps.columns.visible)){
      const vis=ps.columns.visible.filter(id=>ALL_COLS.some(c=>c.id===id));
      if(vis.length)S.colVisible=new Set(vis);
    }
  }
  if(ps.lineColors&&typeof ps.lineColors==='object'){
    for(const k of['hray','tline','aray','atline'])if(typeof ps.lineColors[k]==='string'&&ps.lineColors[k].startsWith('#'))S.lineColors[k]=ps.lineColors[k];
  }
  if(ps.chartView&&typeof ps.chartView==='object'){
    if(ps.chartView.chartRightOffset!=null)S.chartRightOffset=Math.max(0,Math.min(40,+ps.chartView.chartRightOffset));
    if(ps.chartView.chartVisibleBars!=null)S.chartVisibleBars=Math.max(40,Math.min(220,+ps.chartView.chartVisibleBars));
  }
  if(ps.sessionFx&&typeof ps.sessionFx==='object'){
    if(typeof ps.sessionFx.enabled==='boolean')S.sessionFx.enabled=ps.sessionFx.enabled;
    if(typeof ps.sessionFx.asia==='boolean')S.sessionFx.asia=ps.sessionFx.asia;
    if(typeof ps.sessionFx.london==='boolean')S.sessionFx.london=ps.sessionFx.london;
    if(typeof ps.sessionFx.ny==='boolean')S.sessionFx.ny=ps.sessionFx.ny;
  }
  if(typeof ps.showOiOnChart==='boolean')S.showOiOnChart=ps.showOiOnChart;
  if(typeof ps.showBbOverlay==='boolean')S.showBbOverlay=ps.showBbOverlay;
  if(ps.alertSettings&&typeof ps.alertSettings==='object'){
    if(typeof ps.alertSettings.repeat==='boolean')S.alertSettings.repeat=ps.alertSettings.repeat;
    if(ps.alertSettings.cooldown!=null&&!isNaN(+ps.alertSettings.cooldown))S.alertSettings.cooldown=Math.max(1,Math.min(120,+ps.alertSettings.cooldown));
    if(typeof ps.alertSettings.sound==='boolean')S.alertSettings.sound=ps.alertSettings.sound;
  }
  if(typeof ps.emaVisible==='boolean')S.emaVisible=ps.emaVisible;
  if(typeof ps.emaCrossSound==='boolean')S.emaCrossSound=ps.emaCrossSound;
  if(Array.isArray(ps.emaSettings)&&ps.emaSettings.length){
    S.emaSettings=ps.emaSettings.map(c=>({
      period:Math.max(2,Math.min(400,+(c?.period||20))),
      color:(typeof c?.color==='string'&&c.color.startsWith('#'))?c.color:'#a855f7',
      visible:c?.visible!==false,
    }));
  }
  if(ps.emaSymOverrides&&typeof ps.emaSymOverrides==='object')S.emaSymOverrides=JSON.parse(JSON.stringify(ps.emaSymOverrides));
  if(ps.emaSymEnabled&&typeof ps.emaSymEnabled==='object')S.emaSymEnabled={...ps.emaSymEnabled};
  if(Array.isArray(ps.potentialPresets))S.potentialPresets=JSON.parse(JSON.stringify(ps.potentialPresets));
  if(ps.potFilterPreset!=null)S._potFilterPreset=ps.potFilterPreset||null;
  if(ps.draw&&typeof ps.draw==='object'){
    if(typeof ps.draw.brushColor==='string'&&ps.draw.brushColor.startsWith('#'))_brushColor=ps.draw.brushColor;
    if(ps.draw.brushWidth!=null&&!isNaN(+ps.draw.brushWidth))_brushWidth=Math.max(1,Math.min(12,+ps.draw.brushWidth));
  }
  if(ps.autoTrend&&typeof ps.autoTrend==='object'){
    const at=ps.autoTrend;
    if(at.pivotBars!=null)S.autoTrend.pivotBars=Math.max(2,Math.min(8,+at.pivotBars));
    if(at.touchPct!=null)S.autoTrend.touchPct=Math.max(0.05,Math.min(2,+at.touchPct));
    if(at.minTouches!=null)S.autoTrend.minTouches=Math.max(2,Math.min(8,+at.minTouches));
    if(at.maxLines!=null)S.autoTrend.maxLines=Math.max(1,Math.min(10,+at.maxLines));
    if(at.lookback!=null)S.autoTrend.lookback=Math.max(60,Math.min(400,+at.lookback));
    if(at.extendBars!=null)S.autoTrend.extendBars=Math.max(0,Math.min(80,+at.extendBars));
  }
  syncFastBtnUi();
  if(ps.sortId&&typeof ps.sortId==='string'){
    S.sortId=ps.sortId;
    S.sortAlpha=!!ps.sortAlpha;
  }
  if(ps.sortDir==='asc'||ps.sortDir==='desc')S.sortDir=ps.sortDir;
  if(ps.volMin!=null&&!isNaN(+ps.volMin))S.minVol=+ps.volMin;
  if(ps.minTrd!=null&&!isNaN(+ps.minTrd))S.minTrd=+ps.minTrd;
  syncVolTrdSlidersFromState();

  const gs=ps.gridLayout?.gridSize;
  if(ps.gridLayout?.gridRows!=null&&!isNaN(+ps.gridLayout.gridRows))S.gridRows=Math.max(1,Math.min(7,+ps.gridLayout.gridRows|0));
  if(ps.gridLayout?.gridCols!=null&&!isNaN(+ps.gridLayout.gridCols))S.gridCols=Math.max(1,Math.min(7,+ps.gridLayout.gridCols|0));
  if(gs!=null&&gs>=1&&gs<=49&&gs!==S.gridSize)setGridSize(gs|0,{skipAutoFill:true});
  else{
    const target=Math.max(1,Math.min(49,S.gridRows*S.gridCols));
    if(target!==S.gridSize)setGridSize(target,{skipAutoFill:true});
    else buildChartGrid();
  }

  if(ps.fsLayout&&typeof ps.fsLayout==='object'){
    if(typeof ps.fsLayout.preset==='string')S.fsLayoutPreset=ps.fsLayout.preset;
    if(ps.fsLayout.count!=null&&!isNaN(+ps.fsLayout.count))S.fsChartCount=Math.max(2,Math.min(5,+ps.fsLayout.count|0));
    if(Array.isArray(ps.fsLayout.tfs))S.fsChartTfs=ps.fsLayout.tfs.filter(tf=>FS_TFS.includes(tf)).slice(0,5);
  }
  buildFsChartsFromConfig();

  const restoredTf=typeof ps.tf==='string'&&['1m','5m','15m','1h','4h','1d'].includes(ps.tf);
  if(restoredTf&&ps.tf!==S.tf)
    setTf(ps.tf,tfToolbarBtnId(ps.tf));

  if(ps.page!=null&&!isNaN(+ps.page))S.page=Math.max(0,+ps.page|0);
  if(ps.fsSym&&typeof ps.fsSym==='string')S.fsSym=ps.fsSym;

  const chartSyms=ps.chartSymbols;
  const validArr=Array.isArray(chartSyms)&&chartSyms.some(s=>s&&String(s).length>0);
  if(validArr){
    for(let i=0;i<S.charts.length;i++){
      const sym=chartSyms[i]||null;
      if(sym&&typeof sym==='string'&&S.syms.includes(sym))loadChart(i,sym);
      else loadChart(i,null);
    }
  }
  const rowsPg=sortedRows();
  const tp=Math.max(1,Math.ceil(rowsPg.length/Math.max(1,S.charts.length)));
  if(S.page>=tp)S.page=Math.max(0,tp-1);
  updatePagination(rowsPg.length);
  rebuildScreenerHeaders();
  try{
    localStorage.setItem('cs_chartView',JSON.stringify({chartRightOffset:S.chartRightOffset,chartVisibleBars:S.chartVisibleBars}));
    localStorage.setItem('cs_chartHead',JSON.stringify({order:S.chartHeadOrder,visible:[...S.chartHeadVisible]}));
    localStorage.setItem('cs_lineColors',JSON.stringify(S.lineColors));
    localStorage.setItem('cs_chart_autosync',S.chartAutoSync?'1':'0');
    localStorage.setItem('cs_sess_fx',JSON.stringify(S.sessionFx));
    localStorage.setItem('cs_oi_chart',S.showOiOnChart?'1':'0');
    localStorage.setItem('cs_bb_overlay',S.showBbOverlay?'1':'0');
  }catch(e){}
  _lastPersistedSettingsJson=JSON.stringify(collectUserSettings());
  schedulePersistUserSettings();
  return validArr;
}

async function main() {
  try {
    loadChartViewPrefs();
    loadChartHeadPrefs();
    loadLineColorPrefs();
    loadUiPrefs();

    // Kick off the chart-library CDN load IMMEDIATELY and in parallel
    // with everything else. The preconnect/dns-prefetch tags in index.html
    // have already started DNS+TLS, so by the time we need LC (only
    // when we call initLCChart) the script is usually already in flight.
    ldSet('Загрузка библиотеки графиковвЂ¦',5);
    const lcPromise = (async () => {
      for (const url of [
        'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
        'https://cdn.jsdelivr.net/npm/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js',
      ]) {
        try {
          await loadScript(url);
          if (typeof LightweightCharts !== 'undefined') {
            S.LC = LightweightCharts;
            return;
          }
        } catch (e) { /* try the next CDN */ }
      }
    })();

    ldSet('Построение интерфейсавЂ¦',12);
    buildChartGrid();
    ensureQuickFindUI();
    updateToggleScrBtn(); // first paint: replace the ASCII placeholder
    buildScreenerHeader(document.getElementById('shdr'));
    updSortHdr();

    // ── IDB cache hydrate ──────────────────────────────────────────
    // Show cached ticker/symbols immediately so the screener is not
    // empty during the ~1-3s Binance round-trip. Fresh data will
    // overwrite these values a moment later.
    let _cacheHitSyms = false;
    let _cacheHitTk = false;
    const idbPromise = (async () => {
      if (!cacheHasIDB()) return;
      try {
        const [cachedSyms, cachedTk] = await Promise.all([
          cacheGetFresh('binance:symbols', 24 * 60 * 60 * 1000),
          cacheGetFresh('binance:ticker24', 30 * 1000),
        ]);
        if (Array.isArray(cachedSyms) && cachedSyms.length) {
          S.syms = cachedSyms;
          _cacheHitSyms = true;
        }
        if (cachedTk && typeof cachedTk === 'object') {
          Object.assign(S.tk, cachedTk);
          _cacheHitTk = true;
        }
        if (_cacheHitSyms || _cacheHitTk) {
          // Render placeholder rows so the UI is not blank while fresh
          // data is fetched. mx is still empty so most metrics show as
          // dashes; we will re-render once calcAll() has run.
          renderTable();
        }
      } catch (e) { /* cache is best-effort, never block init */ }
    })();

    // Wait for LC AND IDB in parallel before doing anything that needs them.
    await Promise.all([lcPromise, idbPromise]);
    if (S.LC) for (let i = 0; i < S.gridSize; i++) initLCChart(i);

    // ── Exchange info + 24h ticker in parallel ─────────────────────
    // These two endpoints are independent — fire them together so the
    // serial round-trips become one round-trip. Both have separate
    // try/catch fallbacks below.
    ldSet('Получение списка фьючерсов BinanceвЂ¦',18);
    const [infoResult, tkResult] = await Promise.allSettled([
      fj(`${API}/exchangeInfo`),
      fj(`${API}/ticker/24hr`),
    ]);

    if (infoResult.status === 'fulfilled') {
      const info = infoResult.value;
      if (info && Array.isArray(info.symbols)) {
        S.syms = info.symbols
          .filter(s => s?.contractType === 'PERPETUAL' && s?.quoteAsset === 'USDT' && s?.status === 'TRADING')
          .map(s => s.symbol)
          .sort();
        cacheSet('binance:symbols', S.syms, 24 * 60 * 60 * 1000);
      }
    } else {
      const e = infoResult.reason;
      if (_cacheHitSyms) {
        console.warn('exchangeInfo refresh failed, using cache:', e.message);
      } else {
        throw new Error(`Не удалось подключиться к Binance API.\n${e.message}\n\nПричины: нет интернета, Binance заблокирован, CORS.`);
      }
    }

    ldSet('Загрузка 24-часовых данныхвЂ¦',45);
    if (tkResult.status === 'fulfilled') {
      const rawTk = tkResult.value;
      if (Array.isArray(rawTk)) {
        for (const t of rawTk) {
          if (t?.symbol?.endsWith('USDT'))
            S.tk[t.symbol] = { p: +t.lastPrice, c24: +t.priceChangePercent, h24: +t.highPrice, l24: +t.lowPrice, qv: +t.quoteVolume, tr: +t.count };
        }
        // Persist the freshly-built map for next cold start.
        cacheSet('binance:ticker24', S.tk, 30 * 1000);
      }
    } else if (!_cacheHitTk) {
      console.warn('ticker/24hr failed:', tkResult.reason && tkResult.reason.message);
    }

    ldSet('Вычисление метриквЂ¦',70);
    // Run the heavy per-symbol metric pass off the main thread when we
    // can. Fall back to the synchronous calcAll() in any failure case
    // (worker unsupported, timeout, postMessage error) so behaviour
    // is identical for users on browsers without Worker support.
    try {
      if (workerAvailable()) {
        const payload = {
          syms: S.syms,
          k5m: S.k5m, k1h: S.k1h, k1m: S.k1m,
          tk: S.tk,
          fundRates: _fundRates,
          oiDelta: _oiDelta,
          prevMx: S.mx,
          dayStartMs: new Date().setHours(0, 0, 0, 0),
        };
        const res = await runMetrics(payload);
        if (res && res.mx) {
          S.mx = res.mx;
          if (Array.isArray(res.btcR)) S.btcR = res.btcR;
        } else {
          calcAll();
        }
      } else {
        calcAll();
      }
    } catch (e) {
      console.warn('metrics worker failed, falling back to main thread:', e.message);
      calcAll();
    }
    ldSet('Готово!',100);
    renderTable(); updSortHdr(); updTime(); refreshEMAButtonState();
    setTimeout(ldHide, 150);

    // Defer trivial UI-sync calls so the loader can fade out and the
    // first paint of the chart grid happens immediately. These calls
    // each toggle a button's `on` class — they don't block layout.
    requestIdleCallback(() => {
      syncFastBtnUi();
      syncChartSyncBtnUi();
      syncOiChartBtnUi();
      syncBbBtnUi();
    }, { timeout: 1000 });

    const restoredLayout = hydrateUserSession();
    if (!restoredLayout) updateCharts();
    renderTable();
    restartChartStreams(0); startScreenerWS();
    S.bgDone = true; // разрешить realtime-обновление метрик сразу, не ждать фоновой загрузки истории
    loadKlinesBackground();
    startRealtimeWatchdog();
    ensureFundOiLoop();
    setTimeout(autoResizeScreener, 300);
  } catch (err) {
    console.error('Init error:', err); ldSet('Ошибка загрузки', 100); ldErr(err.message || String(err));
  }
}

// ───────────────────────────────────────────────────────────────
//  POTENTIAL MONITOR • multi-preset tabbed system
// ───────────────────────────────────────────────────────────────
// POT_FIELDS, POT_FIELD_DESC, POT_ABS_FIELDS and pure helpers live in
// potentialPresets.js (extracted during refactor).

let _potActiveTab=null; // preset id

function togglePotentialPanel(){
  togglePotentialPanelUi({ S, renderPotentialPanel });
}

function renderPotentialPanel(){
  renderPotentialPanelUi({
    S,
    activeTabRef: { current: _potActiveTab, set: (v) => { _potActiveTab = v; } },
    setActiveTab: (id) => { _potActiveTab = id; },
    openPotPresetEditorUi: openPotPresetEditor,
    addBuiltinSqueezePreset,
    togglePotPresetUi: togglePotPreset,
    deletePotPresetUi: deletePotPreset,
    openFullscreenBySym,
    fmt: { fn, fk, fmtPrice },
    groupColors: GROUP_COLORS,
    getSymGroup,
  });
}

function openPotPresetEditor(presetId){
  openPotPresetEditorUi(presetId, {
    S,
    setActiveTab: (id) => { _potActiveTab = id; },
    renderPotentialPanel,
    runPotentialCheck,
    buildGroupFilterBar,
    togglePotPresetUi: togglePotPreset,
    deletePotPresetUi: deletePotPreset,
    showConfirmModal,
  });
}


function togglePotPreset(id){
  togglePotPresetUi(id, {
    S,
    setActiveTab: (v) => { _potActiveTab = v; },
    startPotentialMonitor,
    renderPotentialPanel,
    buildGroupFilterBar,
  });
}

function deletePotPreset(id){
  deletePotPresetUi(id, {
    S,
    activeTabRef: { current: _potActiveTab },
    setActiveTab: (v) => { _potActiveTab = v; },
    renderPotentialPanel,
    buildGroupFilterBar,
  });
}

function addBuiltinSqueezePreset(){
  addBuiltinSqueezePresetUi({
    S,
    setActiveTab: (id) => { _potActiveTab = id; },
  });
}

function runPotentialCheck(){
  const now=Date.now();let anyEnabled=false;
  S.potentialPresets.forEach(pr=>{
    if(!pr.enabled)return;anyEnabled=true;
    const {matched,details}=scanPresetMatches(
      pr,
      S.syms,
      sym=>S.mx[sym],
      sym=>S.k5m[sym],
      calcEMA,
    );
    const toAlert=selectAlertableSymbols(matched,pr,now);
    for(const sym of toAlert){
      pr.alerted[sym]=now;
      playAlert(660);
      const m=S.mx[sym]||{};
      S.alertLog.unshift({ts:now,sym,curPrice:m.price,linePrice:m.price,distPct:0,type:'potential',alertPct:0,presetName:pr.name});
      if(S.alertLog.length>50)S.alertLog.pop();
      renderAlertLog();
      const badge=document.getElementById('alertBadge');
      if(badge){badge.textContent=S.alertLog.length;badge.style.display='inline';}
    }
    // Attach per-symbol EMA touch snapshot so the panel renderer can show ✓/· for each period used.
    const emaTouchPeriods=Array.from(new Set(pr.conditions.filter(c=>c.field==='emaTouch').map(c=>clampEmaPeriodPp(c.period||20))));
    const newMatches={};
    for(const sym of matched){
      const emaTouch={};
      for(const p of emaTouchPeriods)emaTouch[p]=evalEmaTouchSignal(S.k5m[sym],calcEMA,p);
      newMatches[sym]={...details[sym],emaTouch};
    }
    pr.matches=newMatches;
  });
  updatePotBadgeUi(S);
  const panel=document.getElementById('potentialPanel');
  if(panel&&panel.style.display!=='none')renderPotentialPanel();
  buildGroupFilterBar();
  if(!anyEnabled&&S._potInterval){clearInterval(S._potInterval);S._potInterval=null;}
}

function clearPotentialMatches(){
  clearPotentialMatchesUi({ S, renderPotentialPanel });
}

function startPotentialMonitor(){
  if(S._potInterval)clearInterval(S._potInterval);
  S._potInterval=setInterval(runPotentialCheck,15000);
  runPotentialCheck();
}
function stopPotentialMonitor(){
  if(S._potInterval){clearInterval(S._potInterval);S._potInterval=null;}
}

function calcGridCoinScore(m){
  if(!m)return null;
  const range=Math.max(0,Math.min(1,(m.r24||0)/18));
  const natr=Math.max(0,Math.min(1,(m.na14||0)/1.4));
  const meanRev=Math.max(0,Math.min(1,1-Math.min(1,Math.abs(m.ch24||0)/12)));
  const liq=Math.max(0,Math.min(1,((m.vol24||0)/3e8)));
  const tradeAct=Math.max(0,Math.min(1,(m.trd24||0)/9e5));
  const score=range*0.24+natr*0.2+meanRev*0.22+liq*0.22+tradeAct*0.12;
  return score*100;
}

function getGridSelectorRows(limit=20){
  return getGridSelectorRowsUi(S.syms, S.mx, calcGridCoinScore, { limit });
}

async function ensureBacktestCandles(sym,tf,bars){
  const key=tf==='1m'?'k1m':tf==='15m'?'k15m':tf==='1h'?'k1h':'k5m';
  if(!S[key])S[key]={};
  const store=S[key];
  const want=Math.max(120,Math.min(1500,bars|0));
  const have=(store[sym]||[]).length;
  if(have>=want)return(store[sym]||[]).slice(-want);
  try{
    const raw=await fj(`${API}/klines?symbol=${encodeURIComponent(sym)}&interval=${tf}&limit=${want}`,10000,1);
    const parsed=parseKlines(raw);
    if(parsed.length)store[sym]=parsed;
  }catch(e){}
  return(store[sym]||[]).slice(-want);
}

function pushGridLabBoundsUndo(body){
  const modal=document.getElementById('gridLabModal');
  pushBoundsUndo(
    modal,
    () => body.querySelector('#gbLow')?.value || '',
    () => body.querySelector('#gbHigh')?.value || '',
  );
}
function gridLabBoundsUndo(body,gbPrefs){
  const modal=document.getElementById('gridLabModal');
  if(!modal||!body)return;
  const r = undoBounds(modal);
  if(!r)return;
  const loEl=body.querySelector('#gbLow'),hiEl=body.querySelector('#gbHigh');
  const curLo=parseFloat(loEl?.value||''),curHi=parseFloat(hiEl?.value||'');
  pushRedoFromCurrent(modal, curLo, curHi);
  const prev=r.prev;
  if(prev&&isFinite(prev.lo)&&isFinite(prev.hi)){
    loEl.value=String(prev.lo);
    hiEl.value=String(prev.hi);
    const sym=String(body.querySelector('#gbSym')?.value||'').toUpperCase().trim();
    if(sym){
      applyBoundsToPrefs(gbPrefs, sym, prev.lo, prev.hi);
      saveGridLabPrefs(gbPrefs);
    }
  }
  if(body._gbChartCtx?.lc)body._gbPendingViewport=captureGbLabViewport(body._gbChartCtx.lc,body._gbChartCtx.cs);
  scheduleGridLabSync(body,gbPrefs,{reuseCandles:true});
}
function gridLabBoundsRedo(body,gbPrefs){
  const modal=document.getElementById('gridLabModal');
  if(!modal||!body)return;
  const r = redoBounds(modal);
  if(!r)return;
  const loEl=body.querySelector('#gbLow'),hiEl=body.querySelector('#gbHigh');
  const curLo=parseFloat(loEl?.value||''),curHi=parseFloat(hiEl?.value||'');
  pushUndoFromCurrent(modal, curLo, curHi);
  const nxt=r.next;
  if(nxt&&isFinite(nxt.lo)&&isFinite(nxt.hi)){
    loEl.value=String(nxt.lo);
    hiEl.value=String(nxt.hi);
    const sym=String(body.querySelector('#gbSym')?.value||'').toUpperCase().trim();
    if(sym){
      applyBoundsToPrefs(gbPrefs, sym, nxt.lo, nxt.hi);
      saveGridLabPrefs(gbPrefs);
    }
  }
  if(body._gbChartCtx?.lc)body._gbPendingViewport=captureGbLabViewport(body._gbChartCtx.lc,body._gbChartCtx.cs);
  scheduleGridLabSync(body,gbPrefs,{reuseCandles:true});
}
/** Подпись уровня сетки на графике (тот же риск, что в панели). */
// (gridRiskMetaForPrice + fmtGridLineTitle moved to ./gridLab.js)
function renderGridRiskProfile(body, out, gbPrefs) {
  const host = body.querySelector("#gbRisk");
  if (!host) return;
  if (!out || !out.ok) { host.innerHTML = ""; return; }
  renderGridRiskProfileUi(host, body, out, gbPrefs, {
    fn, fmtPrice,
    scheduleGridLabSync,
    captureGbLabViewport,
    rCanvas,
  });
}


/** DOM-обёртка над computeRatioGridUpdate: читает инпуты, применяет, перерисовывает. */
function applyGbRatioGrid(body, gbPrefs) {
  const sym = String(body.querySelector('#gbSym')?.value || '').toUpperCase().trim();
  const ratioLong = parseFloat(body.querySelector('#gbRatioLong')?.value || '');
  const ratioShort = parseFloat(body.querySelector('#gbRatioShort')?.value || '');
  const ratioStep = parseFloat(body.querySelector('#gbRatioStep')?.value || '');
  const totalLevels = +body.querySelector('#gbLevels')?.value || 12;
  // resolve anchor: prefer explicit anchorPrice, fall back to last candle close
  let anchor = gbPrefs.symbolBounds?.[sym]?.anchorPrice;
  const merged = body._gbChartCtx?.merged;
  if (anchor == null || !isFinite(+anchor)) {
    const last = merged?.length ? +merged[merged.length - 1].c : null;
    anchor = isFinite(last) ? last : null;
  }
  const r = computeRatioGridUpdate(gbPrefs, sym, ratioLong, ratioShort, ratioStep, totalLevels, anchor);
  if (!r.updated) return;
  saveGridLabPrefs(gbPrefs);
  body.querySelector('#gbLow').value = String(r.built.lower);
  body.querySelector('#gbHigh').value = String(r.built.upper);
  body.querySelector('#gbLevels').value = String(r.built.levels);
  scheduleGridLabSync(body, gbPrefs, { reuseCandles: true });
}

function readGridLabInputs(body,gbPrefs,wantBars,mergedCand){
  return readGridLabInputsUi(
    {
      sym: body.querySelector('#gbSym')?.value || '',
      tf: body.querySelector('#gbTf')?.value || '5m',
      levels: body.querySelector('#gbLevels')?.value || 12,
      leverage: body.querySelector('#gbLev')?.value || 3,
      deposit: body.querySelector('#gbDep')?.value || 500,
      lower: body.querySelector('#gbLow')?.value || '',
      upper: body.querySelector('#gbHigh')?.value || '',
      gridMode: body.querySelector('#gbGridMode')?.value || 'neutral',
    },
    gbPrefs, wantBars, mergedCand,
  );
}
async function prependGridLabHistory(body,sym,tf){
  const ctx=body._gbChartCtx;
  if(!ctx?.merged?.length||ctx._histLoading)return;
  ctx._histLoading=true;
  try{
    const raw=await fj(`${API}/klines?symbol=${encodeURIComponent(sym)}&interval=${tf}&limit=${HIST_LIMIT}&endTime=${ctx.merged[0].t-1}`);
    if(!raw?.length)return;
    const nc=parseKlines(raw);if(!nc.length)return;
    const ts=ctx.lc.timeScale();
    let logRange=null,vTime=null,pRange=null;
    try{logRange=(typeof ts.getVisibleLogicalRange==='function')?ts.getVisibleLogicalRange():null;}catch(e){}
    try{if(typeof ts.getVisibleRange==='function')vTime=ts.getVisibleRange();}catch(e){}
    try{
      const ps=typeof ctx.cs.priceScale==='function'?ctx.cs.priceScale():null;
      if(ps&&typeof ps.getVisibleRange==='function')pRange=ps.getVisibleRange();
    }catch(e){}
    const prepended=nc.length;
    const m=ctx.merged;
    m.unshift(...nc);
    if(m.length>HIST_CACHE_MAX)m.splice(0,m.length-HIST_CACHE_MAX);
    const lastC=+m[m.length-1]?.c||1;
    try{ctx.cs.applyOptions({priceFormat:{type:'custom',formatter:fmtPrice,minMove:getPriceMinMove(lastC)}});}catch(e){}
    ctx.cs.setData(m.map(k=>({time:toChartTime(k.t),open:k.o,high:k.h,low:k.l,close:k.c})));
    const gro=Math.max(0,Math.min(36,S.chartRightOffset|0));
    try{ts.applyOptions({rightOffset:gro,fixRightEdge:false});}catch(e){}
    if(logRange&&typeof logRange.from==='number'&&typeof logRange.to==='number'){
      try{if(typeof ts.setVisibleLogicalRange==='function')ts.setVisibleLogicalRange({from:logRange.from+prepended,to:logRange.to+prepended});}catch(e){}
    }else if(vTime&&vTime.from!=null&&vTime.to!=null){try{ts.setVisibleRange(vTime);}catch(e){}}
    try{
      const ps=typeof ctx.cs.priceScale==='function'?ctx.cs.priceScale():null;
      if(pRange&&ps&&typeof ps.setVisibleRange==='function')ps.setVisibleRange(pRange);
    }catch(e){}
  }catch(e){}finally{ctx._histLoading=false;}
}
function renderManualBacktestPreview(body, out, gbPrefs, viewOpts) {
  renderManualBacktestPreviewUi(body, out, gbPrefs, viewOpts, {
    S, toChartTime, fmtPrice, getPriceMinMove, rCanvas,
    getCoords, pushGridLabBoundsUndo, scheduleGridLabSync,
    saveGridLabPrefs, captureGbLabViewport, applyGbViewportFreeze,
    onRulerStart, onRulerMove, onRulerEnd, isNearRuler,
    PRICE_AXIS_W, prependGridLabHistory, kickGridLabPricePoll,
  });
}


function scheduleGridLabSync(body, gbPrefs, opt = {}) {
  scheduleGridLabSyncUi(body, gbPrefs, opt);
}

function runGridLabSync(body, gbPrefs, opt = {}) {
  return runGridLabSyncUi(body, gbPrefs, opt, {
    fn, fmtPrice,
    ensureBacktestCandles,
    readGridLabInputsFn: readGridLabInputs,
    renderPreviewFn: renderManualBacktestPreview,
    renderRiskFn: renderGridRiskProfile,
  });
}

function renderGridLabModal(defSymOpt) {
  return renderGridLabModalUi(defSymOpt, {
    S,
    fn, fk,
    openFullscreenBySym,
    scheduleGridLabSync,
    applyGbRatioGrid,
    gridLabBoundsUndo,
    gridLabBoundsRedo,
    getGridSelectorRows,
    calcGridCoinScore,
  });
}


function toggleGridLab(){
  const old=document.getElementById('gridLabModal');
  if(old){old.remove();return;}
  renderGridLabModal();
}

/**
 * Open Grid Lab with a pre-filled payload from a screener row.
 * Does NOT close the calling screener modal • Grid Lab opens on top (z 820 vs 825).
 */
function openGridLabFromRow(row, source, closeSelf){
  const payload = buildGridLabPayload(row, source);
  if(!payload || !payload.sym) return;
  const prefs = loadGridLabPrefs();
  // Apply suggested lower/upper and grid levels from screener.
  // Existing user overrides win if present (but caller may have set them intentionally).
  if(!prefs.symbolBounds || typeof prefs.symbolBounds !== 'object') prefs.symbolBounds = {};
  const existing = prefs.symbolBounds[payload.sym] || {};
  prefs.symbolBounds[payload.sym] = {
    ...existing,
    lower: payload.lower,
    upper: payload.upper,
  };
  if(payload.levels != null) prefs.symbolBounds[payload.sym].gridLevels = payload.levels;
  // Also push levels into global • that's where the form input reads them from.
  if(payload.levels != null) prefs.global = { ...(prefs.global || {}), levels: payload.levels };
  // Apply direction from Smart screener → gridMode (LONG/SHORT/NEUTRAL).
  if(payload.direction === 'LONG' || payload.direction === 'SHORT' || payload.direction === 'NEUTRAL'){
    prefs.global = { ...(prefs.global || {}), gridMode: payload.direction.toLowerCase() };
  }
  // Also push the suggested TF into globals so the modal opens on the right timeframe.
  if(payload.tf) prefs.global = { ...(prefs.global || {}), tf: payload.tf };
  saveGridLabPrefs(prefs);
  // Close the calling screener modal ONLY if requested (Swing/Intra/Pick close themselves,
  // Smart stays open so the user can compare several rows back-to-back).
  if(typeof closeSelf === 'function'){
    try { closeSelf(); } catch(e) { /* ignore */ }
  }
  // If Grid Lab is already open, just refresh its inputs (cheap sync) instead of stacking.
  const existingModal = document.getElementById('gridLabModal');
  if(existingModal){
    existingModal.remove();
  }
  // Pass payload.sym so the form opens on the right symbol and pulls the suggested bounds.
  renderGridLabModal(payload.sym);
}

function setBrushColor(col,el){
  _brushColor=col;
  document.querySelectorAll('.brush-color').forEach(d=>d.classList.remove('active'));
  if(el)el.classList.add('active');
}
function syncLinePaletteForDrawMode(){
  const m=S.drawMode;
  const want=(m&&['hray','tline','aray','atline'].includes(m))?S.lineColors[m]:null;
  document.querySelectorAll('#linePalette .line-color').forEach(d=>{
    const c=d.dataset?.c||'';
    d.classList.toggle('active',!!want&&c.toLowerCase()===String(want).toLowerCase());
  });
}

function setLineColor(col,el){
  const m=S.drawMode;
  if(m&&['hray','tline','aray','atline'].includes(m)){
    S.lineColors[m]=col;
    saveLineColorPrefs();
  }
  document.querySelectorAll('#linePalette .line-color').forEach(d=>d.classList.remove('active'));
  if(el)el.classList.add('active');
  else syncLinePaletteForDrawMode();
  [...S.charts,...S.fsCharts].forEach(ch=>rCanvas(ch));
}
function setBrushWidth(w){_brushWidth=Math.max(1,Math.min(12,w||2));}

registerGridBotScreeners({
  S,
  BACKEND,
  fj,
  parseKlines,
  batchKlines,
  fn,
  fmtPrice,
  openFullscreenBySym,
  openGridLabFromRow,
  bollingerOnTail,
  calcATR,
  GROUP_COLORS,
  calcAll,
  tagScreenerGroup: (sym, g) => {
    if (sym && g > 0) setSymGroup(sym, g);
  },
});

registerGridSmartScreener({
  S,
  BACKEND,
  fj,
  batchKlines,
  fn,
  fmtPrice,
  openFullscreenBySym,
  openGridLabFromRow,
  GROUP_COLORS,
  tagScreenerGroup: (sym, g) => {
    if (sym && g > 0) setSymGroup(sym, g);
  },
});

// ───────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────
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
window.onSearchInput      = onSearchInput;
window.onVolFilter        = onVolFilter;
window.onTrdFilter        = onTrdFilter;
window.toggleDensity      = toggleDensity;
window.toggleOiChart      = toggleOiChart;
window.toggleBbOverlay    = toggleBbOverlay;
window.renderAlertLog     = renderAlertLog;
window.dragSpl            = dragSpl;
window.setGridSize        = setGridSize;
window.setGridRows        = setGridRows;
window.setGridCols        = setGridCols;
window.setFsLayoutPreset  = setFsLayoutPreset;
window.setUpColor         = setUpColor;
window.setWatermark       = setWatermark;
window.setSortAbs         = setSortAbs;
window.setChartRightOffset= setChartRightOffset;
window.setChartVisibleBars= setChartVisibleBars;
window.toggleCol          = toggleCol;
window.toggleChartHeadCol = toggleChartHeadCol;
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
window.toggleGridLab       = toggleGridLab;
window.openPotPresetEditor  = openPotPresetEditor;
window.togglePotPreset      = togglePotPreset;
window.deletePotPreset      = deletePotPreset;
window.clearPotentialMatches= clearPotentialMatches;
window.setBrushColor        = setBrushColor;
window.setBrushWidth        = setBrushWidth;
window.setLineColor         = setLineColor;
window.toggleEMA            = toggleEMA;
window.openEMAEditor        = openEMAEditor;
window.toggleFastMode       = toggleFastMode;
window.runAutoTrendlinesOnVisibleCharts=runAutoTrendlinesOnVisibleCharts;
window.setAutoTrendSetting  =setAutoTrendSetting;
window.toggleChartAutoSync  = toggleChartAutoSync;
window.setChartAutoSyncOpt  = setChartAutoSyncOpt;
window.setSessionFxEnabled  = setSessionFxEnabled;
window.toggleSessionBand    = toggleSessionBand;
window.addBuiltinSqueezePreset = addBuiltinSqueezePreset;
