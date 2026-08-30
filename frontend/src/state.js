// ═══════════════════════════════════════════════════════════════
//  GLOBAL STATE & CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const API = 'https://fapi.binance.com/fapi/v1';
export const API_FDATA = 'https://fapi.binance.com/futures/data';

// Timezone: offset candle times to device local time
export const TZ_OFFSET_S = -(new Date().getTimezoneOffset() * 60);
export function toChartTime(ms){ return Math.floor(ms/1000) + TZ_OFFSET_S; }

export const HIST_LIMIT = 1000;
export const HIST_INITIAL = 1200;
export const HIST_CACHE_MAX = 3000;
export const MIN_CHART_CANDLES = 32;
export const HIST_TRIGGER = 35;
export const FS_TFS = ['1m','3m','5m','15m','30m','1h','4h','1d','3d','1w'];
export const DRAW_HIT = 8;
export const DRAW_HISTORY_LIMIT = 60;

export function hexToRgbA(hex,a){
  if(!hex||typeof hex!=='string')return`rgba(168,85,247,${a})`;
  let h=hex.replace('#','');
  if(h.length===3)h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h,16);
  if(isNaN(n))return`rgba(168,85,247,${a})`;
  return`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

export const ALL_COLS = [
  {id:'ch24',   l:'ИЗМ',  s:'24ч',    tip:'Изменение цены относительно цены 24 часа назад по данным Binance Futures (rolling 24h), в процентах. Положительное — рост, отрицательное — падение.'},
  {id:'sp5',    l:'ТРНД', s:'…·30', tip:'Мини‑график последних 30 закрытий на том же таймфрейме, что и мини‑графики сетки (см. тулбар 1м/5м/15м/…). Пока нужный ТФ догружается в фоне, используется запасной ряд 5м. Сортировка — по % за отрезок (как у ИЗМ).'},
  {id:'spv',    l:'ОБЪ',  s:'…·30', tip:'Мини‑график объёма (USDT, qv) за последние 30 баров на том же ТФ, что и колонка «ТРНД». Сортировка — по % изменения суммарного объёма за окно (как у ТРНД, но по объёму).'},
  {id:'cday',   l:'ИЗМ',  s:'день%',  tip:'Изменение цены от первой 5-минутной свечи текущего календарного дня по локальному времени устройства до последней цены, в процентах.'},
  {id:'rtd',    l:'РЕНЖ', s:'день',   tip:'Диапазон (макс−мин)/цена в процентах с начала локального календарного дня: 5-минутные свечи с полуночи по времени устройства.'},
  {id:'r24',    l:'РЕНЖ', s:'24ч',    tip:'Диапазон за последние 24 часа по 5-минутным свечам: насколько широко ходила цена относительно текущей, в процентах.'},
  {id:'r7d',    l:'РЕНЖ', s:'7д',     tip:'Диапазон за 7 дней по часовым свечам: отношение (high−low) к цене, в процентах — оценка волатильности недели.'},
  {id:'na30',   l:'NATR', s:'1м/30',  tip:'NATR на 1м: ATR за 30 периодов, делённый на последнюю цену и умноженный на 100. Показывает типичный «размер шага» рынка относительно цены на минутном таймфрейме.'},
  {id:'na14',   l:'NATR', s:'5м/14',  tip:'NATR на 5м: ATR(14) по пятиминутным свечам, нормализованный к цене (%). Удобно сравнивать волатильность разных монет независимо от абсолютной цены.'},
  {id:'r1m5',   l:'РЕНЖ', s:'1м/5',   tip:'Диапазон последних пяти закрытых минутных свечей к текущей цене, в процентах — краткосрочный «микро-ренж».'},
  {id:'tr5',    l:'СД*',  s:'5м/14',  tip:'Отношение числа сделок на последней 5-минутной свече к среднему числу сделок за предыдущие 14 закрытых пятиминуток. >1 — активность выше недавней нормы.'},
  {id:'tr1h',   l:'СД*',  s:'1ч/24',  tip:'Отношение числа сделок на последней часовой свече к среднему за 24 предыдущих часа. Показывает всплеск или просадку торговой активности на 1ч ТФ.'},
  {id:'vr5',    l:'ОБ*',  s:'5м/14',  tip:'Объём (в USDT) последней 5-минутной свечи, делённый на средний объём за 14 предыдущих пятиминуток. >1 — объём выше обычного для этого ТФ.'},
  {id:'vr1h',   l:'ОБ*',  s:'1ч/24',  tip:'Объём последней часовой свечи к среднему часовому объёму за 24 закрытых часа. Индикатор всплеска или затишья на часовике.'},
  {id:'ch7d',   l:'ИЗМ',  s:'7д',     tip:'Изменение цены за 7 дней по дневным (или агрегированным) данным, в процентах — среднесрочный тренд.'},
  {id:'trd24',  l:'СДЛК', s:'24ч',    tip:'Суммарное число сделок (агрессивных обновлений книги) за 24 часа по данным тикера — ликвидность и интерес участников.'},
  {id:'vol24',  l:'ОБЪЕМ',s:'24ч',    tip:'Совокупный объём торгов в USDT за 24 часа (quote volume). Сравнение ликвидности инструментов между собой.'},
  {id:'corr',   l:'КРЛЦ', s:'24ч',    tip:'Коэффициент корреляции доходностей этой монеты и BTC за последние 24 часа по 5-минутным доходностям: ближе к 1 — движение с рынком, к 0 — своё движение.'},
  {id:'corr14', l:'КРЛЦ', s:'5м/14',  tip:'Корреляция с BTC по последним 14 пятиминутным свечам — краткосрочное «следование» или расхождение с биткоином.'},
  {id:'v15m',   l:'ОБ',   s:'1м/15',  tip:'Сумма объёма в USDT за последние 15 минут по минутным свечам — недавний приток/отток ликвидности без учёта направления цены.'},
  {id:'v60m',   l:'ОБ',   s:'1м/60',  tip:'Сумма объёма в USDT за последний час по минутным свечам — более широкое окно, чем 15м, для оценки недавней активности.'},
  {id:'fund',   l:'ФНД',  s:'8ч',     tip:'Ставка финансирования (lastFundingRate) с Binance Futures, в % за период ~8ч. Положительная — лонги платят шортам, отрицательная — наоборот. Обновляется пакетом раз в минуту.'},
  {id:'oi1h',   l:'OIΔ',  s:'1ч%',    tip:'Изменение open interest за ~1 час по часовым снимкам Binance (openInterestHist, period=1h). Показывает приток/отток позиций относительно час назад.'},
  {id:'oi4h',   l:'OIΔ',  s:'4ч%',    tip:'Изменение open interest за ~4 часа по тем же снимкам (сравнение с 4 барами назад). Догружается по очереди для части списка, чтобы не ловить лимиты API.'},
];

export const COLS_HIDDEN_BY_DEFAULT = new Set(['fund','oi1h','oi4h']);

// Guest sessions start with a focused set of high-signal screener metrics.
// Authenticated users keep the visibility/order restored from their account.
export const GUEST_COL_VISIBLE = new Set([
  'ch24','sp5','r24','na30','na14','tr1h','vr1h',
  'ch7d','trd24','vol24','corr',
]);

export const CHART_HEAD_DEFS = [
  {id:'chg', cls:'cchg', tip:'Изменение цены за 24 ч (тикер Binance Futures), %. Зелёный/красный — направление.'},
  {id:'vol', cls:'cvol', tip:'Объём торгов в USDT за 24 ч по тикеру — ликвидность инструмента.'},
  {id:'trd', cls:'ctrd', tip:'Число сделок за 24 ч — насколько «шумно» и часто обновляется рынок.'},
  {id:'natr',cls:'cnatr',tip:'NATR 5м/14 (%): нормализованный ATR по пятиминуткам; типичная волатильность относительно цены.'},
  {id:'corr',cls:'ccorr',tip:'Корреляция с BTC (краткий период или 24ч): насколько движение совпадает с биткоином.'},
];
export const CHART_HEAD_IDS = CHART_HEAD_DEFS.map(d=>d.id);

export const GROUP_COLORS = ['','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
export const FAVORITE_GROUP_ID = 8;
export const FAVORITE_GROUP_COLOR = '#fbbf24';

export const THEME_CONFIGS = {
  default: {
    label:'Классическая',
    vars:{bg:'#0b0c10',bg2:'#0f1117',bg3:'#141826',bg4:'#1a2032',border:'#232a3e',border2:'#2c3550',text:'#d7dbea',text2:'#9aa3bd',text3:'#6b7390',accent:'#7c3aed',green:'#22c55e',red:'#ef4444',yellow:'#f59e0b'},
    candles:{up:'#1fa891',down:'#e04040'},
  },
  midnight: {
    label:'Midnight Neon',
    vars:{bg:'#070b14',bg2:'#0b1220',bg3:'#101b2d',bg4:'#162844',border:'#1b3550',border2:'#285174',text:'#e2f3ff',text2:'#9bb9cc',text3:'#62839a',accent:'#22d3ee',green:'#34d399',red:'#fb7185',yellow:'#fbbf24'},
    candles:{up:'#22d3ee',down:'#fb7185'},
  },
  terminal: {
    label:'Terminal Green',
    vars:{bg:'#07100b',bg2:'#0b1710',bg3:'#102319',bg4:'#173323',border:'#1d4630',border2:'#28613f',text:'#d8f8df',text2:'#91c69f',text3:'#5b8c68',accent:'#4ade80',green:'#86efac',red:'#fb7185',yellow:'#facc15'},
    candles:{up:'#4ade80',down:'#f43f5e'},
  },
  amber: {
    label:'Obsidian Amber',
    vars:{bg:'#100c08',bg2:'#17110b',bg3:'#21180e',bg4:'#302012',border:'#51351a',border2:'#704a20',text:'#fff1d6',text2:'#cdb28a',text3:'#987b54',accent:'#f59e0b',green:'#a3e635',red:'#fb7185',yellow:'#fbbf24'},
    candles:{up:'#a3e635',down:'#fb7185'},
  },
  graphite: {
    label:'Graphite Pulse',
    vars:{bg:'#17191d',bg2:'#202329',bg3:'#292d34',bg4:'#353b44',border:'#454c57',border2:'#596370',text:'#eef1f4',text2:'#b8c0ca',text3:'#818b98',accent:'#a78bfa',green:'#5eead4',red:'#fb7185',yellow:'#fbbf24'},
    candles:{up:'#5eead4',down:'#fb7185'},
  },
  crimson: {
    label:'Crimson Depth',
    vars:{bg:'#140a0d',bg2:'#1c0f13',bg3:'#26141a',bg4:'#341a22',border:'#4a2530',border2:'#63323f',text:'#ffe9ee',text2:'#cf9aa8',text3:'#8f6070',accent:'#f43f5e',green:'#34d399',red:'#f87171',yellow:'#fbbf24'},
    candles:{up:'#34d399',down:'#f43f5e'},
  },
  ocean: {
    label:'Deep Ocean',
    vars:{bg:'#081420',bg2:'#0b1c2c',bg3:'#102436',bg4:'#16304a',border:'#1f4260',border2:'#2a567c',text:'#e3f2ff',text2:'#8fb4d4',text3:'#5f80a0',accent:'#38bdf8',green:'#2dd4bf',red:'#f472b6',yellow:'#fbbf24'},
    candles:{up:'#2dd4bf',down:'#f472b6'},
  },
  solarized: {
    label:'Nordic Frost',
    vars:{bg:'#1e252d',bg2:'#242d37',bg3:'#2c3743',bg4:'#384554',border:'#48586a',border2:'#5d7186',text:'#eceff4',text2:'#b6c2d2',text3:'#7b8b9e',accent:'#88c0d0',green:'#a3be8c',red:'#bf616a',yellow:'#ebcb8b'},
    candles:{up:'#a3be8c',down:'#bf616a'},
  },
  carbon: {
    label:'Carbon Gold',
    vars:{bg:'#141416',bg2:'#1b1b1f',bg3:'#24242a',bg4:'#303038',border:'#3f3f49',border2:'#545461',text:'#f2ede2',text2:'#b9b3a4',text3:'#827d6f',accent:'#d4af37',green:'#6ee7b7',red:'#f87171',yellow:'#fbbf24'},
    candles:{up:'#6ee7b7',down:'#f87171'},
  },
  paper: {
    label:'Paper Light',
    vars:{bg:'#f4f2ee',bg2:'#ffffff',bg3:'#e9e6df',bg4:'#ddd9d0',border:'#cfcbc1',border2:'#b5b0a4',text:'#1f2430',text2:'#565f6e',text3:'#8b93a1',accent:'#0f766e',green:'#15803d',red:'#dc2626',yellow:'#ca8a04'},
    candles:{up:'#15803d',down:'#dc2626'},
  },
  porcelain: {
    label:'Porcelain Blue',
    vars:{bg:'#eef3f8',bg2:'#ffffff',bg3:'#e2eaf2',bg4:'#d3dfeb',border:'#c0cede',border2:'#a3b5ca',text:'#16283b',text2:'#48607a',text3:'#7d92a8',accent:'#2563eb',green:'#059669',red:'#e11d48',yellow:'#d97706'},
    candles:{up:'#059669',down:'#e11d48'},
  },
};

export const THEME_IDS = Object.keys(THEME_CONFIGS);

/** Chart-library palette resolved from the active theme's CSS vars. */
export function chartThemeColors(){
  try{
    const cs=getComputedStyle(document.documentElement);
    const get=k=>{const v=cs.getPropertyValue(k).trim();return v||undefined;};
    return{
      background:get('--bg')||'#0a0a0b',
      text:get('--text2')||'#606070',
      grid:get('--bg3')||'#141418',
      border:get('--border')||'#252530',
    };
  }catch(e){
    return{background:'#0a0a0b',text:'#606070',grid:'#141418',border:'#252530'};
  }
}

export function trendColShortLabel(tf){
  const m={ '1m':'1м', '3m':'3м', '5m':'5м', '15m':'15м', '30m':'30м', '1h':'1ч', '4h':'4ч', '1d':'Д' };
  return`${m[tf]||'5м'}·30`;
}
export function trendKlineFetchLimit(tf){
  if(tf==='1m')return 80;
  if(tf==='3m')return 100;
  if(tf==='5m')return 300;
  if(tf==='15m')return 120;
  if(tf==='30m')return 100;
  if(tf==='1h')return 170;
  if(tf==='4h')return 120;
  if(tf==='1d')return 90;
  return 300;
}
export function tfToolbarBtnId(tf){
  const m={ '1m':'tf1m', '5m':'tf5m', '15m':'tf15m', '1h':'tf1h', '4h':'tf4h', '1d':'tf1d' };
  return m[tf]||'tf5m';
}

export function mkChart(){
  return{lc:null,cs:null,vs:null,sym:null,candles:[],histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null,oiLine:null,bbUpperLine:null,bbLowerLine:null,
    _oiHist:[],_oiRaw:[],_oiLastFetchTs:0,_histBootstrapDone:false};
}
export function mkFsChart(tf){
  return{lc:null,cs:null,vs:null,candles:[],tf,histLoading:false,
    drawings:[], pendingP1:null, ruler:null, hoverX:0, hoverY:0,
    hoveredIdx:-1, canvas:null, interact:null, _ab:null, draggingDraw:null,
    _brushStroke:null, _rCanvasRaf:false, _rafPending:false, _lastHoverCheckTs:0,
    livePriceLine:null,oiLine:null,bbUpperLine:null,bbLowerLine:null,
    _oiHist:[],_oiRaw:[],_oiLastFetchTs:0,_histBootstrapDone:false};
}

export const S = {
  syms:[], tk:{}, k5m:{}, k15m:{}, k1h:{}, k1m:{}, kTrend:{}, mx:{}, btcR:[],
  charts: Array.from({length:9},()=>mkChart()),
  wsScreener:null, wsCharts:null, wsChartTrades:null,
  sortId:'vol24', sortDir:'desc', sortAlpha:false,
  tf:'5m', q:'', page:0, LC:null, bgDone:false,
  fastMode:true,
  _renderPending:false,_renderTs:0,_renderMinMs:120,
  drawMode:null, drawIdCounter:0,
  symDrawings:{},
  drawUndo:{},
  drawRedo:{},
  chartRightOffset:10,
  chartVisibleBars:96,
  minVol:0, minTrd:0, gridSize:9, gridRows:3, gridCols:3, upColor:'#1fa891', wmVisible:true, sortAbs:true,
  screenerVisible:true, fsScreenerVisible:true,
  colOrder: ALL_COLS.map(c=>c.id),
  colVisible: new Set(ALL_COLS.map(c=>c.id).filter(id=>!COLS_HIDDEN_BY_DEFAULT.has(id))),
  chartAutoSync:true,
  sessionFx:{enabled:false,asia:true,london:true,ny:true},
  showOiOnChart:false,
  showBbOverlay:false,
  chartHeadOrder:['chg','vol','trd','natr','corr'],
  chartHeadVisible:new Set(['chg','vol','trd','natr']),
  lineColors:{hray:'#e8a020',tline:'#3b82f6',aray:'#a855f7',atline:'#a855f7',autotl:'#38bdf8'},
  autoTrend:{pivotBars:3,touchPct:0.22,minTouches:3,maxLines:5,lookback:160,extendBars:24},
  fsSym:null, fsOpen:false, fsWs:null,
  fsLayoutPreset:'three_top_wide',
  fsChartCount:3,
  fsChartTfs:['5m','1h','4h'],
  fsCharts:[mkFsChart('5m'), mkFsChart('1h'), mkFsChart('4h')],
  settingsTab:'gen', theme:'default',
 downColor:'#e04040',
  showDensity:false,
  densitySettings:{},
  alertLog:[],
  alertSettings:{repeat:true, cooldown:5, sound:true},
  symGroups:{},
  symFavorites:{},
  activeGroupFilter:0,
  lastGroupUsed:1,
  _savedCpW:'',_savedFsCaW:'',
  potentialPresets:[],
  _potFilterPreset:null,
  _potInterval:null,
  _potNextId:1,
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
  histCache:{},
};

export let _lastDrawSym = null;
export let _undoSymOrder = [];
export let _redoSymOrder = [];

export function setLastDrawSym(sym){ _lastDrawSym = sym; }
export function pushUndoSym(sym){ if(sym) _undoSymOrder.push(sym); }
export function pushRedoSym(sym){ if(sym) _redoSymOrder.push(sym); }
export function resetUndoRedo(){ _undoSymOrder=[]; _redoSymOrder=[]; _lastDrawSym=null; }

// Global pan state
export let _anyChartPanning = false;
export let _panEndTimer = null;
export let _deferredRenderNeeded = false;
export let _panOverlayRaf = null;
export function setAnyChartPanning(v){ _anyChartPanning = v; }
export function setPanEndTimer(t){ _panEndTimer = t; }
export function setDeferredRenderNeeded(v){ _deferredRenderNeeded = v; }
export function setPanOverlayRaf(r){ _panOverlayRaf = r; }
