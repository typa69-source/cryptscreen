/**
 * Radar UI — panel rendering for the pump/dump radar.
 * Pure-DOM module: no fetch, no chart access. The host app injects
 * dependencies (openSymbol callback, persistence) via init().
 */

let _deps = { openSymbol: null, persist: null, loadPersisted: null };

export function initRadarUi(deps) {
  _deps = { ..._deps, ...deps };
}

export function isRadarPanelOpen() {
  const el = document.getElementById('radarPanel');
  return !!el && el.style.display !== 'none';
}

export function toggleRadarPanelUi() {
  const el = document.getElementById('radarPanel');
  if (!el) return false;
  const open = el.style.display === 'none';
  el.style.display = open ? 'flex' : 'none';
  const btn = document.getElementById('radarBtn');
  if (btn) btn.classList.toggle('on', open);
  return open;
}

export function radarSetTabUi(tab) {
  document.querySelectorAll('#radarPanel .pot-tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.rt === tab);
  });
  const live = document.getElementById('radarLive');
  const stats = document.getElementById('radarStats');
  if (live) live.style.display = tab === 'live' ? '' : 'none';
  if (stats) stats.style.display = tab === 'stats' ? '' : 'none';
}

function fmtAge(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч${m % 60 ? ' ' + (m % 60) + 'м' : ''}`;
  return `${Math.floor(h / 24)}д`;
}

function outcomeChip(o) {
  if (o == null) return '';
  const cls = o > 0 ? 'radar-kind-pump' : 'radar-kind-dump';
  return `<span class="radar-out-c ${cls}" title="исход">${o > 0 ? '+' : ''}${o.toFixed(1)}%</span>`;
}

/** Render the live events tab. events — array of radar-scan records. */
export function renderRadarLive(events) {
  const el = document.getElementById('radarLive');
  if (!el) return;
  if (!events.length) {
    el.innerHTML = '<div class="radar-empty">Памп/дамп не обнаружены — сканер работает по 5m-барам</div>';
    return;
  }
  const rows = events
    .slice()
    .reverse()
    .slice(0, 100)
    .map((e) => {
      const kindCls = e.kind === 'PUMP' ? 'radar-kind-pump' : 'radar-kind-dump';
      const badge = e.pending
        ? '<span class="radar-ev-pend">ожид</span>'
        : (e.confirmed === false ? '<span class="radar-ev-rej">отклонён</span>' : '');
      const ret = e.ret != null ? `${e.ret > 0 ? '+' : ''}${e.ret.toFixed(1)}%` : '';
      const retCls = e.ret > 0 ? 'radar-kind-pump' : 'radar-kind-dump';
      const o = e.outcomes || {};
      return `<div class="radar-ev" data-sym="${e.sym}" title="${e.kind} z=${e.z} · клик — открыть график">
  <span class="radar-ev-sym">${e.sym.replace(/USDT$/, '')}</span>
  <span class="radar-ev-kind ${kindCls}">${e.kind === 'PUMP' ? '▲' : '▼'}</span>
  <span class="radar-ev-ret ${retCls}">${ret}</span>
  ${outcomeChip(o['+1h'])}
  ${badge}
  <span class="radar-ev-age">${fmtAge(e.detectedAt)}</span>
</div>`;
    })
    .join('');
  el.innerHTML = rows;
  el.querySelectorAll('.radar-ev').forEach((row) => {
    row.addEventListener('click', () => {
      const sym = row.dataset.sym;
      if (sym && _deps.openSymbol) _deps.openSymbol(sym);
    });
  });
}

/** Render the hit-rate (accuracy) tab. agg — aggregateHitRates() result. */
export function renderRadarStats(agg, nEvents, scanned) {
  const el = document.getElementById('radarStats');
  if (!el) return;
  const horizons = ['+15m', '+1h', '+4h'];
  let best = null;
  for (const h of horizons) if (agg[h] && agg[h].n >= 10 && (best == null || agg[h].rate > best.rate)) best = { h, ...agg[h] };
  const rows = horizons
    .map((h) => {
      const a = agg[h] || { n: 0, wins: 0, rate: 0, median: null };
      const pct = Math.round(a.rate * 100);
      const barColor = a.rate >= 0.6 ? '#2fbf9d' : a.rate >= 0.45 ? '#f59e0b' : '#ff6b6b';
      const med = a.median != null ? `медиана ${a.median > 0 ? '+' : ''}${a.median.toFixed(1)}%` : 'медиана —';
      return `<div class="radar-stat-row">
  <span class="radar-stat-h">${h}</span>
  <div class="radar-bar"><div class="radar-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
  <span class="radar-stat-rate" style="color:${barColor}">${pct}%</span>
  <span class="radar-stat-n">${a.n} соб</span>
  <span class="radar-stat-n">${med}</span>
</div>`;
    })
    .join('');
  el.innerHTML = `<div class="radar-stats">
${rows}
<div class="radar-note">События: ${nEvents} · просканировано баров: ${scanned || '—'}<br>
Попадание = цена выше (для PUMP) / ниже (для DUMP) точки входа на горизонте.
Выборка &lt; 10 не агрегируется. ${
    best
      ? `Лучшая точность: <b>${best.h}</b> — ${Math.round(best.rate * 100)}% (n=${best.n}).`
      : 'Наберём ≥10 дозревших событий на горизонт — появится статистика.'
  }</div>
</div>`;
}

/** Update the header badge: count of fresh confirmed events. */
export function updateRadarBadge(freshCount) {
  const b = document.getElementById('radarBadge');
  if (!b) return;
  if (freshCount > 0) {
    b.style.display = '';
    b.textContent = String(freshCount);
  } else {
    b.style.display = 'none';
  }
}

/** Scan status line under the panel title. */
export function setRadarScanStatus(text) {
  const el = document.getElementById('radarScanStatus');
  if (el) el.textContent = text || '';
}