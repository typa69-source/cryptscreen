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
  settingsTab:'gen',
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
