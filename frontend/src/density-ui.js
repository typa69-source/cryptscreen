// ═══════════════════════════════════════════════════════════════
//  DENSITY — UI / drawing
// ═══════════════════════════════════════════════════════════════
//
// Drawing routines for density zones (overlaid on candles) and
// the settings modal body. Pure logic lives in density.js.

import { toChartTime, TZ_OFFSET_S } from './state.js';
import {
  DEFAULT_DENSITY_SETTINGS,
  DENSITY_CACHE_TTL_MS,
  OB_CACHE_TTL_MS,
  OB_MAX_CONCURRENT,
  RELEVANT_PCT,
  BUCKET_STEP_PCT,
  buildDensityZones,
  levelsToUsd,
} from './density.js';

/** Per-tier styling for drawZonesUi. */
export const TIER_STYLE = {
  large:  { color: '#e04040', alpha: 0.75, lineWidth: 1.8, dash: [],       fontSize: 9, dot: 3.5 },
  medium: { color: '#e8a020', alpha: 0.55, lineWidth: 1.3, dash: [],       fontSize: 8, dot: 2.5 },
  small:  { color: '#606080', alpha: 0.35, lineWidth: 0.9, dash: [3, 4],   fontSize: 8, dot: 2.5 },
};

/**
 * @typedef {Object} DensityDeps
 * @property {object} S - global state
 * @property {Function} fetchJSON - async fetcher for REST calls
 * @property {Function} fmtPrice - (n) => string
 * @property {Function} fk - (n) => string   (large-number formatter)
 * @property {Function} rCanvas - (ch) => void
 * @property {Function} timeToCoordX - (ch, time) => number|null
 */

/**
 * Compute density zones for a chart. Wraps the pure logic with the
 * order-book cache + density cache + the relevant price computation.
 *
 * Returns an array of zones: {price, vol, tier, time}.
 */
export function computeZonesForChart(ch, deps) {
  const { S } = deps;
  const sym = ch?.sym || S.fsSym;
  if (!sym) return [];

  const ob = getOrFetchOrderBook(sym, deps);
  if (!ob) return [];

  const lastCandle = ch.candles?.[ch.candles.length - 1];
  const currentPrice = lastCandle?.c;
  const thresholds = S.densitySettings[sym] || { ...DEFAULT_DENSITY_SETTINGS };

  return buildDensityZones(
    ob.bids, ob.asks,
    currentPrice,
    thresholds,
    /* firstSeenMap */ deps._densityFirstSeen || (deps._densityFirstSeen = new Map()),
    sym,
  );
}

/**
 * Get the order book from cache or trigger a fetch. The fetch is
 * rate-limited via a simple in-flight queue.
 */
export function getOrFetchOrderBook(sym, deps) {
  const { S, fetchJSON, rCanvas } = deps;
  const cache = S._obCache || (S._obCache = {});
  const pending = S._obPending != null ? S._obPending : (S._obPending = 0);
  const queue = S._obQueue || (S._obQueue = []);

  const cached = cache[sym];
  if (cached && Date.now() - cached.ts < OB_CACHE_TTL_MS) return cached;

  if (pending < OB_MAX_CONCURRENT) {
    S._obPending = pending + 1;
    fetchOrderBook(sym, deps).finally(() => {
      S._obPending = Math.max(0, S._obPending - 1);
      const next = queue.shift();
      if (next) next();
    });
  } else {
    queue.push(() => getOrFetchOrderBook(sym, deps));
  }
  return cached || null;
}

/**
 * Fetch the order book for a symbol and cache it. Invalidates the
 * density cache so the next draw uses fresh data.
 */
export async function fetchOrderBook(sym, deps) {
  try {
    const data = await deps.fetchJSON(`${deps.API}/depth?symbol=${encodeURIComponent(sym)}&limit=1000`, 10000);
    const cache = deps.S._obCache || (deps.S._obCache = {});
    cache[sym] = { bids: levelsToUsd(data.bids), asks: levelsToUsd(data.asks), ts: Date.now() };
    // Invalidate density cache for this sym so the next draw recomputes.
    if (deps.densityCache?.delete) deps.densityCache.delete(sym);
    if (deps.S.showDensity) {
      for (const ch of [...deps.S.charts, ...deps.S.fsCharts]) {
        if ((ch.sym || deps.S.fsSym) === sym) deps.rCanvas(ch);
      }
    }
  } catch (e) {
    if (deps.S.consoleWarn) deps.S.consoleWarn('OB fetch', sym, e);
  }
}

/**
 * Pre-fetch order books for all visible charts. Used when density
 * toggle is turned on.
 */
export function prefetchAllOrderBooks(deps) {
  for (const ch of [...deps.S.charts, ...deps.S.fsCharts]) {
    const s = ch.sym || deps.S.fsSym;
    if (s) fetchOrderBook(s, deps);
  }
}

/**
 * Draw density zones onto the chart context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} ch - chart
 * @param {number} W - draw width
 * @param {number} H - draw height
 * @param {DensityDeps} deps
 */
export function drawZonesUi(ctx, ch, W, H, deps) {
  if (!ch?.cs || !ch?.lc) return;
  const sym = ch.sym || deps.S.fsSym;
  if (!sym) return;
  if (!deps.S.showDensity) return;

  const now = Date.now();
  const cache = deps.densityCache || (deps.densityCache = new Map());
  let zones;
  const cached = cache.get(sym);
  if (cached && now - cached.ts < DENSITY_CACHE_TTL_MS) {
    zones = cached.zones;
  } else {
    zones = computeZonesForChart(ch, deps);
    cache.set(sym, { ts: now, zones });
  }
  if (!zones?.length) return;

  ctx.save();
  for (const z of zones) {
    const y = ch.cs.priceToCoordinate(z.price);
    if (y === null || y < 0 || y > H) continue;
    const x0 = Math.max(0, deps.timeToCoordX(ch, z.time) ?? 0);
    // Skip ray origins that scrolled off the left edge long ago.
    const firstCandleT = ch.candles[0]?.t || 0;
    if (x0 <= 0 && z.time < toChartTime(firstCandleT)) continue;

    const style = TIER_STYLE[z.tier] || TIER_STYLE.small;
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = style.alpha;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(style.dash);
    ctx.moveTo(x0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.alpha + 0.2;
    ctx.font = `${style.fontSize}px JetBrains Mono,monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${deps.fmtPrice(z.price)}  ${deps.fk(z.vol)}$`, W - 3, y - (z.tier === 'large' ? 4 : 3));
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.fillStyle = style.color;
    ctx.globalAlpha = style.alpha + 0.1;
    ctx.arc(x0, y, style.dot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Render the Density tab into the settings modal body.
 *
 * @param {HTMLElement} body - the #smodal-body element
 * @param {DensityDeps & {tbtnHtml:Function}} deps
 */
export function renderSettingsDensityUi(body, deps) {
  const { S, tbtnHtml } = deps;
  const sym = S.fsSym || S.charts.find(c => c.sym)?.sym || '';
  const ds = (S.densitySettings[sym] && { ...S.densitySettings[sym] }) || { ...DEFAULT_DENSITY_SETTINGS };
  body.dataset.densitySym = sym;
  body.innerHTML = `
  <div style="font-size:9px;color:var(--text3);margin-bottom:8px;line-height:1.6">
    Плотности • горизонтальные лучи на уровнях с крупными стенками.<br>
    <span style="color:#e04040">█</span> крупная &nbsp;<span style="color:#e8a020">█</span> средняя &nbsp;<span style="color:#606080">█</span> малая
  </div>
  <div class="smodal-row">
    <span class="smodal-lbl">Отображение плотностей</span>
    <div class="smodal-btns">
      ${tbtnHtml('dOn','Вкл',"setDensityVisible(true)",S.showDensity)}
      ${tbtnHtml('dOff','Выкл',"setDensityVisible(false)",!S.showDensity)}
    </div>
  </div>
  ${sym ? `
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
    <button class="tbtn" onclick="resetDensitySettings(document.getElementById('smodal-body').dataset.densitySym)">↻ Сброс</button>
  </div>` : '<div style="font-size:9px;color:var(--text3);margin-top:8px">Откройте монету для настройки порогов</div>'}
  `;
}

/**
 * Toggle the density overlay on/off. Pre-fetches order books for
 * all visible charts when enabling.
 */
export function toggleDensityUi(deps) {
  const { S, rCanvas, renderSettingsDensity } = deps;
  S.showDensity = !S.showDensity;
  const btn = document.getElementById('densityBtn');
  if (btn) btn.classList.toggle('on', S.showDensity);
  if (S.showDensity) {
    prefetchAllOrderBooks(deps);
  }
  for (const ch of [...S.charts, ...S.fsCharts]) rCanvas(ch);
  if (renderSettingsDensity) {
    renderSettingsDensity(document.getElementById('smodal-body'));
  }
}

/**
 * Setter for the visibility toggle inside the settings modal.
 */
export function setDensityVisibleUi(on, deps) {
  const { S, rCanvas, renderSettingsDensity } = deps;
  S.showDensity = !!on;
  const btn = document.getElementById('densityBtn');
  if (btn) btn.classList.toggle('on', S.showDensity);
  for (const ch of [...S.charts, ...S.fsCharts]) rCanvas(ch);
  if (renderSettingsDensity) {
    renderSettingsDensity(document.getElementById('smodal-body'));
  }
}

/**
 * Update one of the three density thresholds for the current symbol.
 * Invalidates the cache so the next draw uses the new value.
 */
export function setDensityMultUi(sym, key, val, deps) {
  const { S, rCanvas, setDensityThreshold } = deps;
  if (!setDensityThreshold(S.densitySettings, sym, key, val)) return;
  // MUST invalidate cache so new value takes effect.
  if (deps.densityCache?.delete) deps.densityCache.delete(sym);
  for (const ch of [...S.charts, ...S.fsCharts]) {
    if ((ch.sym || S.fsSym) === sym) rCanvas(ch);
  }
}

/**
 * Reset a symbol's density thresholds to defaults.
 */
export function resetDensitySettingsUi(sym, deps) {
  const { S, rCanvas, resetDensitySettings, renderSettingsDensity } = deps;
  resetDensitySettings(S.densitySettings, sym);
  if (deps.densityCache?.delete) deps.densityCache.delete(sym);
  for (const ch of [...S.charts, ...S.fsCharts]) {
    if ((ch.sym || S.fsSym) === sym) rCanvas(ch);
  }
  if (renderSettingsDensity) {
    renderSettingsDensity(document.getElementById('smodal-body'));
  }
}
