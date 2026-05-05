/**
 * Grid Bot Screeners — Swing (medium-term) & Intraday (short-term).
 * Registered from main.js with shared Binance helpers and app state S.
 */

function gbsFmt(v, d = 2) {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return 'N/A';
  return Number(v).toFixed(d);
}

const GRID_SWING_TIPS = {
  adx: 'ADX показывает силу тренда. Для бокового грида нужен слабый тренд (низкий ADX), иначе цена уходит в одну сторону и сетка «ломается».',
  chop: 'Choppiness Index высокий, когда рынок «пилит» в диапазоне. Это ближе к идее mean-reversion и частых пересечений уровней сетки.',
  atrp: 'ATR% — волатильность относительно цены. Слишком мало — мало сделок; слишком много — риск резких выносов за сетку.',
  hurst: 'Hurst < 0.5 намекает на mean-reversion (откаты), > 0.5 — на персистентность тренда. Грид обычно лучше ведёт себя при более низком Hurst.',
  cross: 'Частые пересечения MA(20) за месяц = цена часто возвращается к среднему — больше срабатываний уровней сетки.',
  vm: 'Объём к капитализации: выше доля оборота — ликвиднее инструмент, проще выходить из позиций на лимитках сетки.',
  rcov: 'Ширина диапазона за 30 дней к средней цене. Умеренная ширина помогает подобрать сетку, не слишком узкую и не слишком широкую.',
};

const GRID_INTRADAY_TIPS = {
  adx: 'ADX на 1H: во время консолидации после импульса ADX обычно снижается. Резкий рост ADX — признак нового тренда (опасно для грида).',
  bbw: 'Сужение полос Боллинджера на 15m — типичный признак «сжатия» перед движением; для входа в грид мы хотим спокойное сужение, а не хаос.',
  rstab: 'Стабильность размеров свечей: низкий std/avg диапазонов = ритмичный боковик; высокий — неравномерные выбросы.',
  cons: 'Длительность удержания цены в полосе ±ATR от текущей — чем дольше боковик, тем больше уверенности, что импульс «остыл».',
  voltr: 'Падение объёма на консолидации часто здорово (затишье). Рост объёма — возможный прелюдия нового выноса.',
  spr: 'Прокси спреда через (H−L)/Close последней 15m. Широкие бары — выше издержки/шум для сетки.',
};

function bandFromScore(score) {
  if (score >= 11) return 'green';
  if (score >= 7) return 'yellow';
  return 'red';
}

function trueRangeBar(h, l, prevC) {
  return Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
}

function wilderRmaSeries(arr, period) {
  if (!arr || arr.length < period) return null;
  const out = [];
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  out.push(s);
  for (let i = period; i < arr.length; i++) {
    const prev = out[out.length - 1];
    out.push(prev - prev / period + arr[i]);
  }
  return out;
}

/** Wilder ADX(14) on full kline array (oldest→newest). Returns last ADX + last +DI/−DI. */
function calcADXWilder(kl, period = 14) {
  if (!kl || kl.length < period * 2 + 2) return null;
  const tr = [];
  const plusDM = [];
  const minusDM = [];
  for (let i = 1; i < kl.length; i++) {
    const h = kl[i].h;
    const l = kl[i].l;
    const ph = kl[i - 1].h;
    const pl = kl[i - 1].l;
    const pc = kl[i - 1].c;
    tr.push(trueRangeBar(h, l, pc));
    const up = h - ph;
    const down = pl - l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const smTR = wilderRmaSeries(tr, period);
  const smPlus = wilderRmaSeries(plusDM, period);
  const smMinus = wilderRmaSeries(minusDM, period);
  if (!smTR || !smPlus || !smMinus) return null;
  const n = Math.min(smTR.length, smPlus.length, smMinus.length);
  const dx = [];
  for (let i = 0; i < n; i++) {
    const t = smTR[i];
    const pdi = t > 0 ? (100 * smPlus[i]) / t : 0;
    const mdi = t > 0 ? (100 * smMinus[i]) / t : 0;
    const s = pdi + mdi;
    dx.push(s > 0 ? (100 * Math.abs(pdi - mdi)) / s : 0);
  }
  if (dx.length < period * 2) return null;
  let adx = 0;
  for (let i = 0; i < period; i++) adx += dx[i];
  adx /= period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;
  const lastTR = smTR[smTR.length - 1];
  const lastP = smPlus[smPlus.length - 1];
  const lastM = smMinus[smMinus.length - 1];
  const plusDI = lastTR > 0 ? (100 * lastP) / lastTR : 0;
  const minusDI = lastTR > 0 ? (100 * lastM) / lastTR : 0;
  return { adx, plusDI, minusDI };
}

function calcChoppiness(kl, n = 14) {
  if (!kl || kl.length < n + 1) return null;
  const slice = kl.slice(-(n + 1));
  let sumTR = 0;
  for (let i = 1; i < slice.length; i++) sumTR += trueRangeBar(slice[i].h, slice[i].l, slice[i - 1].c);
  const win = kl.slice(-n);
  const hh = Math.max(...win.map((k) => k.h));
  const ll = Math.min(...win.map((k) => k.l));
  if (!(hh > ll) || sumTR <= 0) return null;
  const ratio = sumTR / (hh - ll);
  if (ratio <= 0) return null;
  return (100 * Math.log10(ratio)) / Math.log10(n);
}

function hurstExponentRS(closes) {
  const x = closes.filter((c) => isFinite(c) && c > 0);
  if (x.length < 60) return null;
  const lens = [10, 12, 15, 20, 25, 30, 40].filter((L) => L * 3 <= x.length);
  const pts = [];
  for (const L of lens) {
    let acc = 0;
    let cnt = 0;
    for (let start = 0; start + L <= x.length; start += L) {
      const seg = x.slice(start, start + L);
      const m = seg.reduce((a, b) => a + b, 0) / L;
      const y = seg.map((v) => v - m);
      let cum = 0;
      const w = y.map((d) => {
        cum += d;
        return cum;
      });
      const R = Math.max(...w) - Math.min(...w);
      const v = y.reduce((a, d) => a + d * d, 0) / L;
      const s = Math.sqrt(v);
      if (s > 1e-12) {
        acc += R / s;
        cnt++;
      }
    }
    if (cnt > 0) pts.push({ lx: Math.log(L), lry: Math.log(acc / cnt) });
  }
  if (pts.length < 2) return null;
  const nn = pts.length;
  const mx = pts.reduce((a, p) => a + p.lx, 0) / nn;
  const my = pts.reduce((a, p) => a + p.lry, 0) / nn;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.lx - mx) * (p.lry - my);
    den += (p.lx - mx) ** 2;
  }
  if (den < 1e-12) return null;
  return num / den;
}

function countMa20Crossings30(last30) {
  if (!last30 || last30.length < 30) return null;
  const c = last30.map((k) => +k.c);
  let x = 0;
  for (let i = 20; i < 30; i++) {
    const maPrev = c.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
    const maCur = c.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
    const cp = c[i - 1];
    const cc = c[i];
    const sp = cp - maPrev;
    const sc = cc - maCur;
    if (sp !== 0 && sc !== 0 && Math.sign(sp) !== Math.sign(sc)) x++;
  }
  return x;
}

function percentileCloses(closes, p) {
  const s = closes.filter((x) => isFinite(x)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = (s.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - idx) + s[hi] * (idx - lo);
}

function scoreSwingMetricADX(adx) {
  if (adx == null || !isFinite(adx)) return { pts: 0, label: 'N/A' };
  if (adx < 20) return { pts: 3, label: gbsFmt(adx, 2) };
  if (adx <= 25) return { pts: 1, label: gbsFmt(adx, 2) };
  return { pts: 0, label: gbsFmt(adx, 2) };
}

function scoreSwingChop(ch) {
  if (ch == null || !isFinite(ch)) return { pts: 0, label: 'N/A' };
  if (ch > 61.8) return { pts: 2, label: gbsFmt(ch, 2) };
  if (ch >= 55) return { pts: 1, label: gbsFmt(ch, 2) };
  return { pts: 0, label: gbsFmt(ch, 2) };
}

function scoreSwingAtrp(pct) {
  if (pct == null || !isFinite(pct)) return { pts: 0, label: 'N/A' };
  if (pct >= 2 && pct <= 8) return { pts: 2, label: gbsFmt(pct, 2) + '%' };
  if ((pct >= 1 && pct < 2) || (pct > 8 && pct <= 12)) return { pts: 1, label: gbsFmt(pct, 2) + '%' };
  return { pts: 0, label: gbsFmt(pct, 2) + '%' };
}

function scoreSwingHurst(h) {
  if (h == null || !isFinite(h)) return { pts: 0, label: 'N/A' };
  if (h < 0.45) return { pts: 3, label: gbsFmt(h, 3) };
  if (h < 0.5) return { pts: 2, label: gbsFmt(h, 3) };
  if (h <= 0.55) return { pts: 1, label: gbsFmt(h, 3) };
  return { pts: 0, label: gbsFmt(h, 3) };
}

function scoreSwingCross(x) {
  if (x == null || !isFinite(x)) return { pts: 0, label: 'N/A' };
  if (x >= 8) return { pts: 2, label: String(x) };
  if (x >= 4) return { pts: 1, label: String(x) };
  return { pts: 0, label: String(x) };
}

function scoreSwingVm(ratio) {
  if (ratio == null || !isFinite(ratio)) return { pts: 0, label: 'N/A' };
  if (ratio > 0.08) return { pts: 1, label: gbsFmt(ratio * 100, 2) + '%' };
  if (ratio >= 0.05) return { pts: 1, label: gbsFmt(ratio * 100, 2) + '%' };
  return { pts: 0, label: gbsFmt(ratio * 100, 2) + '%' };
}

function scoreSwingRcov(rc) {
  if (rc == null || !isFinite(rc)) return { pts: 0, label: 'N/A' };
  if (rc >= 15 && rc <= 40) return { pts: 1, label: gbsFmt(rc, 2) + '%' };
  return { pts: 0, label: gbsFmt(rc, 2) + '%' };
}

let _cgMcapMap = null;
let _cgMcapAt = 0;

async function ensureCgMcapMap(fj) {
  if (_cgMcapMap && Date.now() - _cgMcapAt < 3600000) return _cgMcapMap;
  const map = new Map();
  for (let page = 1; page <= 5; page++) {
    try {
      const rows = await fj(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
        20000,
        1
      );
      if (!Array.isArray(rows)) break;
      for (const row of rows) {
        const sym = String(row.symbol || '').toUpperCase();
        if (sym && row.market_cap && !map.has(sym)) map.set(sym, row.market_cap);
      }
      await new Promise((r) => setTimeout(r, 1100));
    } catch {
      break;
    }
  }
  _cgMcapMap = map;
  _cgMcapAt = Date.now();
  return map;
}

function baseSymbol(sym) {
  return sym.replace(/USDT$/i, '').toUpperCase();
}

export function registerGridBotScreeners(deps) {
  const { S, fj, batchKlines, fn, fmtPrice, openFullscreenBySym, bollingerOnTail, calcATR } = deps;

  function vol24For(sym) {
    return S.mx[sym]?.vol24 ?? S.tk[sym]?.qv ?? null;
  }

  function passesVol(sym) {
    const v = vol24For(sym);
    if ((S.minVol | 0) <= 0) return true;
    return v != null && v >= S.minVol * 1e6;
  }

  function pruneLocalStoragePrefix(prefix, maxKeep) {
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .sort()
      .reverse();
    for (let i = maxKeep; i < keys.length; i++) {
      try {
        localStorage.removeItem(keys[i]);
      } catch {
        /* ignore */
      }
    }
  }

  function computeSwingRow(sym, d1, j4h, mcapMap) {
    const kl = d1[sym];
    if (!kl || kl.length < 35) return null;
    const last30 = kl.slice(-30);
    const closes30 = last30.map((k) => +k.c);
    const closes100 = kl.map((k) => +k.c).filter((x) => isFinite(x));
    const price = +kl[kl.length - 1].c;
    if (!isFinite(price) || price <= 0) return null;

    const adxR = calcADXWilder(kl, 14);
    const adx = adxR?.adx ?? null;
    const chop = calcChoppiness(kl, 14);
    const atr14 = calcATR(kl, 14);
    const atrp = atr14 != null ? (atr14 / price) * 100 : null;
    const hurst = hurstExponentRS(closes100.slice(-100));
    const maX = countMa20Crossings30(last30);

    const p5 = percentileCloses(closes30, 5);
    const p95 = percentileCloses(closes30, 95);
    const hi = Math.max(...last30.map((k) => k.h));
    const lo = Math.min(...last30.map((k) => k.l));
    const avg = closes30.reduce((a, b) => a + b, 0) / closes30.length;
    const rcov = avg > 0 ? ((hi - lo) / avg) * 100 : null;

    const vol = vol24For(sym);
    const mcap = mcapMap.get(baseSymbol(sym));
    const vm = vol != null && mcap > 0 ? vol / mcap : null;

    const s1 = scoreSwingMetricADX(adx);
    const s2 = scoreSwingChop(chop);
    const s3 = scoreSwingAtrp(atrp);
    const s4 = scoreSwingHurst(hurst);
    const s5 = scoreSwingCross(maX);
    const s6 = scoreSwingVm(vm);
    const s7 = scoreSwingRcov(rcov);

    const score = s1.pts + s2.pts + s3.pts + s4.pts + s5.pts + s6.pts + s7.pts;
    const stepAbs = atr14 != null ? atr14 * 0.5 : null;
    const stepPct = stepAbs != null && price > 0 ? (stepAbs / price) * 100 : null;

    const ch24 = S.mx[sym]?.ch24 ?? S.tk[sym]?.c24 ?? null;

    let h4ch = null;
    const h4 = j4h?.[sym];
    if (h4 && h4.length >= 2) {
      const c0 = +h4[h4.length - 1].c;
      const c1 = +h4[h4.length - 2].c;
      if (isFinite(c0) && isFinite(c1) && c1 !== 0) h4ch = Math.abs((c0 / c1 - 1) * 100);
    }

    return {
      sym,
      ch24,
      h4ch,
      price,
      score,
      band: bandFromScore(score),
      gridLo: p5,
      gridHi: p95,
      stepAbs,
      stepPct,
      breakdown: {
        adx: { ...s1, tip: GRID_SWING_TIPS.adx },
        chop: { ...s2, tip: GRID_SWING_TIPS.chop },
        atrp: { ...s3, tip: GRID_SWING_TIPS.atrp },
        hurst: { ...s4, tip: GRID_SWING_TIPS.hurst },
        cross: { ...s5, tip: GRID_SWING_TIPS.cross },
        vm: { ...s6, tip: GRID_SWING_TIPS.vm },
        rcov: { ...s7, tip: GRID_SWING_TIPS.rcov },
      },
      raw: { adx, chop, atrp, hurst, maX, vm, rcov, p5, p95, h4ch },
    };
  }

  async function runSwingScan(ui) {
    ui.loading = true;
    if (ui.renderMeta) ui.renderMeta();
    const syms = S.syms.filter(passesVol);
    const mcapMap = await ensureCgMcapMap(fj);
    const d1 = await batchKlines(syms, '1d', 100, null, null, 8);
    const j4h = await batchKlines(syms, '4h', 14, null, null, 8);
    const rows = [];
    for (const sym of syms) {
      const r = computeSwingRow(sym, d1, j4h, mcapMap);
      if (r) rows.push(r);
    }
    ui.lastRows = rows;
    ui.loading = false;
    ui.lastRun = Date.now();
    if (ui.applyFiltersAndRender) ui.applyFiltersAndRender();
    try {
      const key = `gridswing_history_${Date.now()}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          ts: Date.now(),
          top5: rows
            .slice()
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((x) => ({ sym: x.sym, score: x.score })),
        })
      );
      pruneLocalStoragePrefix('gridswing_history_', 20);
    } catch {
      /* ignore */
    }
  }

  function openGridSwingScreener() {
    const old = document.getElementById('gridSwingModal');
    if (old) {
      old.remove();
      return;
    }
    const modal = document.createElement('div');
    modal.id = 'gridSwingModal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:825;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText =
      'width:min(1100px,98vw);height:min(88vh,900px);background:var(--bg2);border:1px solid var(--border2);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;';

    const ui = {
      minScore: 7,
      maxAdx: 25,
      atrLo: 2,
      atrHi: 8,
      sortKey: 'score',
      sortDir: 'desc',
      lastRows: [],
      loading: false,
      lastRun: 0,
      timer: null,
    };

    function renderMeta() {
      const lu = box.querySelector('#gbsSwingLu');
      if (lu) lu.textContent = ui.lastRun ? new Date(ui.lastRun).toLocaleTimeString() : '—';
      const sk = box.querySelector('#gbsSwingSk');
      if (sk) sk.style.display = ui.loading ? '' : 'none';
    }

    function applyFiltersAndRender() {
      let rows = ui.lastRows.slice();
      rows = rows.filter((r) => r.score >= ui.minScore);
      rows = rows.filter((r) => r.raw.adx == null || r.raw.adx <= ui.maxAdx);
      rows = rows.filter((r) => {
        const a = r.raw.atrp;
        if (a == null || !isFinite(a)) return false;
        return a >= ui.atrLo && a <= ui.atrHi;
      });

      const dir = ui.sortDir === 'asc' ? 1 : -1;
      const key = ui.sortKey;
      const val = (r) => {
        if (key === 'sym') return r.sym;
        if (key === 'score') return r.score;
        if (key === 'adx') return r.raw?.adx;
        if (key === 'ch24') return r.ch24;
        if (key === 'h4ch') return r.h4ch;
        return null;
      };
      rows.sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (key === 'sym') return va.localeCompare(vb) * dir;
        const na = va == null || isNaN(va) ? -Infinity : va;
        const nb = vb == null || isNaN(vb) ? -Infinity : vb;
        return (na - nb) * dir;
      });

      const tb = box.querySelector('#gbsSwingBody');
      if (!tb) return;
      tb.innerHTML = rows
        .map((r) => {
          const badge =
            r.band === 'green'
              ? '#22c55e'
              : r.band === 'yellow'
                ? '#eab308'
                : '#ef4444';
          const bd = r.breakdown;
          const det = Object.entries(bd)
            .map(
              ([k, v]) =>
                `<span class="gbs-tag" title="${v.tip}">${k}: ${v.label} → +${v.pts}</span>`
            )
            .join(' ');
          const gl =
            r.gridLo != null && r.gridHi != null
              ? `${fmtPrice(r.gridLo)} … ${fmtPrice(r.gridHi)}`
              : '—';
          const st =
            r.stepAbs != null ? `${fmtPrice(r.stepAbs)} (${fn(r.stepPct, 2)}%)` : '—';
          return `<tr data-sym="${r.sym}">
          <td><b style="cursor:pointer;color:#7dd3fc" class="gbs-open">${r.sym.replace(/USDT$/, '')}</b></td>
          <td class="${(r.ch24 ?? 0) >= 0 ? 'p' : 'n'}">${r.ch24 != null ? fn(r.ch24, 2) : '—'}%</td>
          <td>${r.h4ch != null ? fn(r.h4ch, 2) : '—'}%</td>
          <td><span style="background:${badge};color:#0a0a0b;padding:2px 6px;border-radius:4px;font-weight:700">${r.score}</span></td>
          <td>${r.raw.adx != null ? fn(r.raw.adx, 1) : '—'}</td>
          <td>${gl}</td>
          <td>${st}</td>
          <td style="font-size:9px;color:var(--text3)">${det}</td>
        </tr>`;
        })
        .join('');
      tb.querySelectorAll('.gbs-open').forEach((el) => {
        el.onclick = () => openFullscreenBySym(el.closest('tr').dataset.sym);
      });
      renderMeta();
    }

    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:#fff;flex:1">Grid Bot Screener — Swing</span>
        <span id="gbsSwingSk" style="font-size:10px;color:var(--text3);display:none">Обновление…</span>
        <button class="tbtn" id="gbsSwingRf">Обновить</button>
        <button class="tbtn" id="gbsSwingHi">История</button>
        <button class="tbtn" id="gbsSwingX">Закрыть</button>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:10px">
        <label>Мин. score <input type="range" id="gbsSwingMinSc" min="0" max="14" value="7" style="width:100px;vertical-align:middle"></label>
        <span id="gbsSwingMinScV">7</span>
        <label>Max ADX <input type="range" id="gbsSwingMaxAdx" min="0" max="50" value="25" style="width:100px;vertical-align:middle"></label>
        <span id="gbsSwingMaxAdxV">25</span>
        <label>ATR% от <input type="number" id="gbsSwingAtrLo" value="2" step="0.1" style="width:52px"></label>
        <label>до <input type="number" id="gbsSwingAtrHi" value="8" step="0.1" style="width:52px"></label>
        <span style="color:var(--text3)">Объём: слайдер в тулбаре (как в списке)</span>
        <span style="margin-left:auto;color:var(--text3)">Обновлено: <span id="gbsSwingLu">—</span></span>
      </div>
      <div style="flex:1;min-height:0;overflow:auto">
        <table class="gbs-table" style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr>
            <th class="gbs-th" data-k="sym">Тикер</th>
            <th class="gbs-th" data-k="ch24">24ч %</th>
            <th class="gbs-th" data-k="h4ch">4ч %</th>
            <th class="gbs-th" data-k="score">Score</th>
            <th class="gbs-th" data-k="adx">ADX</th>
            <th class="gbs-th">Сетка p5–p95</th>
            <th class="gbs-th">Шаг 0.5×ATR</th>
            <th class="gbs-th">Метрики</th>
          </tr></thead>
          <tbody id="gbsSwingBody"></tbody>
        </table>
      </div>
      <div id="gbsSwingHist" style="display:none;border-top:1px solid var(--border);max-height:160px;overflow:auto;padding:8px 12px;font-size:9px;color:var(--text3)"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const onHdr = (e) => {
      const th = e.target.closest('.gbs-th');
      if (!th || !th.dataset.k) return;
      const k = th.dataset.k;
      if (ui.sortKey === k) ui.sortDir = ui.sortDir === 'desc' ? 'asc' : 'desc';
      else {
        ui.sortKey = k;
        ui.sortDir = 'desc';
      }
      applyFiltersAndRender();
    };
    box.querySelector('thead').addEventListener('click', onHdr);

    box.querySelector('#gbsSwingMinSc').oninput = (e) => {
      ui.minScore = +e.target.value;
      box.querySelector('#gbsSwingMinScV').textContent = String(ui.minScore);
      applyFiltersAndRender();
    };
    box.querySelector('#gbsSwingMaxAdx').oninput = (e) => {
      ui.maxAdx = +e.target.value;
      box.querySelector('#gbsSwingMaxAdxV').textContent = String(ui.maxAdx);
      applyFiltersAndRender();
    };
    ['gbsSwingAtrLo', 'gbsSwingAtrHi'].forEach((id) => {
      box.querySelector(`#${id}`).onchange = (e) => {
        if (id === 'gbsSwingAtrLo') ui.atrLo = +e.target.value;
        else ui.atrHi = +e.target.value;
        applyFiltersAndRender();
      };
    });

    box.querySelector('#gbsSwingRf').onclick = () => runSwingScan(ui);
    box.querySelector('#gbsSwingX').onclick = () => {
      if (ui.timer) clearInterval(ui.timer);
      modal.remove();
    };
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        if (ui.timer) clearInterval(ui.timer);
        modal.remove();
      }
    });

    box.querySelector('#gbsSwingHi').onclick = () => {
      const p = box.querySelector('#gbsSwingHist');
      const vis = p.style.display !== 'block';
      p.style.display = vis ? 'block' : 'none';
      if (!vis) return;
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith('gridswing_history_'))
        .sort()
        .reverse()
        .slice(0, 20);
      p.innerHTML =
        keys.length === 0
          ? 'Нет сохранённых снимков'
          : keys
              .map((k) => {
                try {
                  const o = JSON.parse(localStorage.getItem(k));
                  const t = new Date(o.ts).toLocaleString();
                  const top = (o.top5 || []).map((x) => `${x.sym.replace(/USDT$/, '')}:${x.score}`).join(', ');
                  return `<div style="margin-bottom:6px"><b>${t}</b> — ${top}</div>`;
                } catch {
                  return '';
                }
              })
              .join('');
    };

    ui.renderMeta = renderMeta;
    ui.applyFiltersAndRender = applyFiltersAndRender;
    ui.timer = setInterval(() => runSwingScan(ui), 300000);
    runSwingScan(ui);
  }

  // ─── Intraday ───────────────────────────────────────────────────────

  function bbWidthPctSeries(kl, period = 20) {
    const out = [];
    for (let i = period - 1; i < kl.length; i++) {
      const bb = bollingerOnTail(kl.slice(i - period + 1, i + 1), period, 2);
      if (bb) out.push(bb.width * 100);
    }
    return out;
  }

  function scoreIntraAdx(adx) {
    if (adx == null || !isFinite(adx)) return { pts: 0, label: 'N/A' };
    if (adx < 20) return { pts: 3, label: fn(adx, 2) };
    if (adx < 25) return { pts: 2, label: fn(adx, 2) };
    if (adx <= 30) return { pts: 1, label: fn(adx, 2) };
    return { pts: 0, label: fn(adx, 2) };
  }

  function scoreBbwTrend(widths) {
    if (!widths || widths.length < 4) return { pts: 0, label: 'N/A', n: 0 };
    const a = widths[widths.length - 1];
    const b = widths[widths.length - 2];
    const c = widths[widths.length - 3];
    const d = widths[widths.length - 4];
    if (a < b && b < c && c < d) return { pts: 2, label: '3+↓', n: 3 };
    if (a < b && b < c) return { pts: 1, label: '2↓', n: 2 };
    return { pts: 0, label: '—', n: 0 };
  }

  function rangeStability8(kl) {
    if (!kl || kl.length < 8) return null;
    const ranges = kl.slice(-8).map((k) => k.h - k.l);
    const mean = ranges.reduce((a, b) => a + b, 0) / 8;
    if (mean < 1e-12) return null;
    const v = ranges.reduce((a, x) => a + (x - mean) ** 2, 0) / 8;
    const std = Math.sqrt(v);
    return std / mean;
  }

  function scoreRstab(rs) {
    if (rs == null || !isFinite(rs)) return { pts: 0, label: 'N/A' };
    if (rs < 0.3) return { pts: 3, label: fn(rs, 3) };
    if (rs <= 0.5) return { pts: 2, label: fn(rs, 3) };
    if (rs <= 0.7) return { pts: 1, label: fn(rs, 3) };
    return { pts: 0, label: fn(rs, 3) };
  }

  function consolidationBars15m(kl, atr) {
    if (!kl || kl.length < 2 || atr == null || !isFinite(atr) || atr <= 0) return 0;
    const P = +kl[kl.length - 1].c;
    let n = 0;
    for (let i = kl.length - 1; i >= 0; i--) {
      const c = +kl[i].c;
      if (c >= P - atr && c <= P + atr) n++;
      else break;
    }
    return n;
  }

  function scoreCons(n) {
    if (n >= 12) return { pts: 3, label: String(n) };
    if (n >= 6) return { pts: 2, label: String(n) };
    if (n >= 3) return { pts: 1, label: String(n) };
    return { pts: 0, label: String(n) };
  }

  function volTrendScore(kl) {
    if (!kl || kl.length < 13) return { pts: 0, label: 'N/A', ratio: null };
    const recent = kl.slice(-4);
    const old = kl.slice(-12, -8);
    const a = recent.reduce((s, k) => s + k.qv, 0) / 4;
    const b = old.reduce((s, k) => s + k.qv, 0) / 4;
    if (b < 1e-9) return { pts: 0, label: '—', ratio: null };
    const r = a / b;
    if (r < 0.7) return { pts: 2, label: fn(r, 2) + '×', ratio: r };
    if (r <= 1.0) return { pts: 1, label: fn(r, 2) + '×', ratio: r };
    return { pts: 0, label: fn(r, 2) + '×', ratio: r };
  }

  function spreadProxyLast(kl) {
    if (!kl || !kl.length) return null;
    const k = kl[kl.length - 1];
    const c = +k.c;
    if (!isFinite(c) || c <= 0) return null;
    return ((k.h - k.l) / c) * 100;
  }

  function scoreSpread(sp) {
    if (sp == null || !isFinite(sp)) return { pts: 0, label: 'N/A' };
    if (sp < 0.3) return { pts: 1, label: fn(sp, 3) + '%' };
    if (sp <= 0.6) return { pts: 1, label: fn(sp, 3) + '%' };
    return { pts: 0, label: fn(sp, 3) + '%' };
  }

  function formatConsMin(n15) {
    const m = n15 * 15;
    if (m >= 60) return `~${fn(m / 60, 1)} ч`;
    return `~${m} мин`;
  }

  function computeStage1(sym, d15, h1, d1) {
    const vol = vol24For(sym);
    const ch24 = Math.abs(S.mx[sym]?.ch24 ?? S.tk[sym]?.c24 ?? 0);
    const d = d1[sym];
    let avg14 = null;
    if (d && d.length >= 15) {
      const sl = d.slice(-15, -1);
      const s = sl.reduce((a, k) => a + k.qv, 0);
      avg14 = sl.length ? s / sl.length : null;
    }
    const volRatio = vol != null && avg14 > 0 ? vol / avg14 : null;
    const h = h1[sym];
    let ch4h = null;
    if (h && h.length >= 5) {
      const c0 = +h[h.length - 1].c;
      const c4 = +h[h.length - 5].c;
      if (isFinite(c0) && isFinite(c4) && c4 !== 0) ch4h = Math.abs((c0 / c4 - 1) * 100);
    }
    const passVol = (S.minVol | 0) <= 0 || (vol != null && vol >= S.minVol * 1e6);
    const passVR = volRatio != null && volRatio > 3;
    const passCh = (ch4h != null && ch4h > 8) || ch24 > 15;
    const pass = passVol && passVR && passCh;
    return { pass, volRatio, ch4h, ch24, passVol, passVR, passCh };
  }

  function computeIntradayRow(sym, m15, h1, st1) {
    const kl = m15[sym];
    const h = h1[sym];
    if (!kl || kl.length < 25 || !h || h.length < 30) return null;

    const adxR = calcADXWilder(h, 14);
    const adx = adxR?.adx ?? null;
    const widths = bbWidthPctSeries(kl, 20);
    const bbSc = scoreBbwTrend(widths);
    const rs = rangeStability8(kl);
    const rsSc = scoreRstab(rs);
    const atr15 = calcATR(kl, 14);
    const consN = consolidationBars15m(kl, atr15);
    const consSc = scoreCons(consN);
    const vt = volTrendScore(kl);
    const sp = spreadProxyLast(kl);
    const spSc = scoreSpread(sp);

    const sAdx = scoreIntraAdx(adx);
    const pts = sAdx.pts + bbSc.pts + rsSc.pts + consSc.pts + vt.pts + spSc.pts;
    const price = +kl[kl.length - 1].c;
    const atr1h = calcATR(h, 14);
    const gLo = atr1h != null ? price - atr1h * 2.5 : null;
    const gHi = atr1h != null ? price + atr1h * 2.5 : null;
    const stepAbs = atr15 != null ? atr15 * 0.5 : null;
    const stepPct = stepAbs != null && price > 0 ? (stepAbs / price) * 100 : null;
    let nLev = null;
    if (gLo != null && gHi != null && stepAbs != null && stepAbs > 0) nLev = Math.round((gHi - gLo) / stepAbs);

    const highs48 = kl.slice(-192).length ? kl.slice(-192) : kl;
    const hh = Math.max(...highs48.map((k) => k.h));
    const nearHigh = hh > 0 && Math.abs(price - hh) / hh * 100 <= 3;

    const adxSeq = [];
    for (let cut = 2; cut >= 0; cut--) {
      const sub = h.slice(0, h.length - cut);
      const r = calcADXWilder(sub, 14);
      adxSeq.push(r?.adx ?? null);
    }
    let adxWarn = false;
    if (adxSeq[0] != null && adxSeq[1] != null && adxSeq[2] != null) {
      if (adxSeq[0] < 25 && adxSeq[1] > adxSeq[0] && adxSeq[2] > adxSeq[1]) adxWarn = true;
    }

    let volDiv = false;
    if (kl.length >= 9) {
      const a = kl.slice(-4).reduce((s, k) => s + k.qv, 0) / 4;
      const b = kl.slice(-8, -4).reduce((s, k) => s + k.qv, 0) / 4;
      const up = +kl[kl.length - 1].c > +kl[kl.length - 5].c;
      if (b > 0 && a < b * 0.5 && up) volDiv = true;
    }

    const flags = [];
    if (volDiv) flags.push({ level: 'red', text: 'Volume divergence' });
    if (adxWarn) flags.push({ level: 'red', text: 'ADX rising again' });
    if (nearHigh) flags.push({ level: 'red', text: 'Near recent high' });
    if (sp != null && sp > 0.5) flags.push({ level: 'yellow', text: 'Wide spread' });

    const ch24s = S.mx[sym]?.ch24 ?? S.tk[sym]?.c24 ?? null;

    return {
      sym,
      st1,
      score: pts,
      band: bandFromScore(pts),
      consN,
      consHuman: formatConsMin(consN),
      breakdown: {
        adx: { ...sAdx, tip: GRID_INTRADAY_TIPS.adx },
        bbw: { pts: bbSc.pts, label: bbSc.label, tip: GRID_INTRADAY_TIPS.bbw },
        rstab: { ...rsSc, tip: GRID_INTRADAY_TIPS.rstab },
        cons: { ...consSc, tip: GRID_INTRADAY_TIPS.cons },
        voltr: { pts: vt.pts, label: vt.label, tip: GRID_INTRADAY_TIPS.voltr },
        spr: { ...spSc, tip: GRID_INTRADAY_TIPS.spr },
      },
      grid: { gLo, gHi, stepAbs, stepPct, nLev, price },
      flags,
      raw: { adx, volRatio: st1.volRatio, ch4h: st1.ch4h },
      ch24: ch24s,
    };
  }

  async function runIntradayScan(ui) {
    const root = ui.root;
    if (!root) return;
    ui.busy = true;
    const sk = root.querySelector('#gbsIntBusy');
    if (sk) sk.style.display = '';
    const syms = S.syms.filter(passesVol);
    const d1 = await batchKlines(syms, '1d', 16, null, null, 8);
    const h1 = await batchKlines(syms, '1h', 48, null, null, 8);
    const st1Map = {};
    for (const sym of syms) st1Map[sym] = computeStage1(sym, null, h1, d1);
    const passSyms = syms.filter((s) => st1Map[s].pass);
    let m15 = {};
    if (passSyms.length) m15 = await batchKlines(passSyms, '15m', 200, null, null, 8);
    if (!passSyms.length) {
      ui.ready = [];
      ui.watch = syms
        .filter((s) => vol24For(s) != null)
        .sort((a, b) => (vol24For(b) || 0) - (vol24For(a) || 0))
        .slice(0, 40)
        .map((sym) => ({ sym, st1: st1Map[sym] }));
    } else {
      const ready = [];
      for (const sym of passSyms) {
        const row = computeIntradayRow(sym, m15, h1, st1Map[sym]);
        if (row) ready.push(row);
      }
      ready.sort((a, b) => b.score - a.score || b.consN - a.consN);
      ui.ready = ready;
      const watch = [];
      for (const sym of syms) {
        if (st1Map[sym].pass) continue;
        if (watch.length >= 40) break;
        const v = vol24For(sym);
        if (v == null) continue;
        watch.push({ sym, st1: st1Map[sym] });
      }
      watch.sort((a, b) => (vol24For(b.sym) || 0) - (vol24For(a.sym) || 0));
      ui.watch = watch;
    }
    const now = Date.now();
    const setQ = new Set(ui.ready.map((r) => r.sym));
    const prev = ui.prevQualified || new Set();
    ui.newSyms = [...setQ].filter((s) => !prev.has(s));
    ui.goneSyms = [...prev].filter((s) => !setQ.has(s));
    ui.prevQualified = setQ;
    for (const r of ui.ready) {
      if (!ui.seen.has(r.sym)) ui.seen.set(r.sym, now);
    }
    for (const s of [...ui.seen.keys()]) {
      if (!setQ.has(s)) ui.seen.delete(s);
    }
    ui.lastRun = now;
    ui.busy = false;
    ui.cdLeft = 30;
    if (sk) sk.style.display = 'none';
    if (ui.applyFiltersAndRender) ui.applyFiltersAndRender();
    try {
      const key = `gridintraday_history_${Date.now()}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          ts: now,
          qualified: ui.ready.map((r) => r.sym),
          newSyms: ui.newSyms,
          goneSyms: ui.goneSyms,
        })
      );
      pruneLocalStoragePrefix('gridintraday_history_', 50);
    } catch {
      /* ignore */
    }
  }

  function openGridIntradayScreener() {
    const old = document.getElementById('gridIntradayModal');
    if (old) {
      old.remove();
      return;
    }
    const modal = document.createElement('div');
    modal.id = 'gridIntradayModal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:825;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText =
      'width:min(1150px,98vw);height:min(90vh,920px);background:var(--bg2);border:1px solid var(--border2);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;';

    const ui = {
      minScore: 7,
      minCons: 0,
      hideFlags: false,
      sortKey: 'score',
      sortDir: 'desc',
      ready: [],
      watch: [],
      busy: false,
      lastRun: 0,
      timer: null,
      cdTimer: null,
      cdLeft: 30,
      prevQualified: new Set(),
      seen: new Map(),
      newSyms: [],
      goneSyms: [],
      root: box,
    };

    function applyFiltersAndRender() {
      let rows = ui.ready.filter((r) => r.score >= ui.minScore);
      if (ui.minCons > 0) rows = rows.filter((r) => r.consN >= ui.minCons);
      if (ui.hideFlags) rows = rows.filter((r) => !r.flags.some((f) => f.level === 'red'));

      const dir = ui.sortDir === 'asc' ? 1 : -1;
      const key = ui.sortKey;
      rows.sort((a, b) => {
        let va;
        let vb;
        if (key === 'sym') {
          va = a.sym;
          vb = b.sym;
          return va.localeCompare(vb) * dir;
        }
        if (key === 'consN') {
          va = a.consN;
          vb = b.consN;
        } else if (key === 'volRatio') {
          va = a.st1.volRatio ?? -1;
          vb = b.st1.volRatio ?? -1;
        } else {
          va = a[key] ?? -1;
          vb = b[key] ?? -1;
        }
        if (va === vb) return (b.consN - a.consN) * (ui.sortDir === 'desc' ? 1 : -1);
        return (va - vb) * dir;
      });

      const root = ui.root;
      const body = root.querySelector('#gbsIntReady');
      const wbody = root.querySelector('#gbsIntWatch');
      const meta = root.querySelector('#gbsIntMeta');
      if (meta) {
        meta.innerHTML = `Новые в списке: <b style="color:#7dd3fc">${ui.newSyms.map((s) => s.replace(/USDT$/, '')).join(', ') || '—'}</b> · Выпали: <b style="color:#f97316">${ui.goneSyms.map((s) => s.replace(/USDT$/, '')).join(', ') || '—'}</b>`;
      }
      if (body) {
        body.innerHTML = rows
          .map((r) => {
            const badge = r.band === 'green' ? '#22c55e' : r.band === 'yellow' ? '#eab308' : '#ef4444';
            const fl = r.flags.map((f) => (f.level === 'red' ? '🔴' : '🟡') + f.text).join(' ');
            const bd = Object.entries(r.breakdown)
              .map(([k, v]) => `<span class="gbs-tag" title="${v.tip}">${k}: ${v.label} → +${v.pts}</span>`)
              .join(' ');
            const tIn = ui.seen.has(r.sym) ? Math.round((ui.lastRun - ui.seen.get(r.sym)) / 60000) : 0;
            const g = r.grid;
            const gridTxt =
              g.gLo != null
                ? `${fmtPrice(g.gLo)} … ${fmtPrice(g.gHi)} · шаг ${fmtPrice(g.stepAbs)} (${fn(g.stepPct, 2)}%) · ~${g.nLev} ур.`
                : '—';
            return `<tr data-sym="${r.sym}">
            <td><b class="gbs-open" style="cursor:pointer;color:#7dd3fc">${r.sym.replace(/USDT$/, '')}</b></td>
            <td class="${(r.ch24 ?? 0) >= 0 ? 'p' : 'n'}">${r.ch24 != null ? fn(r.ch24, 2) : '—'}%</td>
            <td>${r.st1.volRatio != null ? fn(r.st1.volRatio, 2) + '×' : '—'}</td>
            <td><span style="background:#166534;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px">S1✓</span></td>
            <td><span style="background:${badge};color:#0a0a0b;padding:2px 6px;border-radius:4px;font-weight:700">${r.score}</span></td>
            <td>${r.consHuman} (${r.consN}×15m)</td>
            <td style="font-size:9px">${fl || '—'}</td>
            <td style="font-size:9px;color:var(--text3)">${gridTxt}</td>
            <td style="font-size:9px;color:var(--text3)">${bd}</td>
            <td style="font-size:9px;color:var(--text3)">в списке ~${tIn} мин</td>
          </tr>`;
          })
          .join('');
        body.querySelectorAll('.gbs-open').forEach((el) => {
          el.onclick = () => openFullscreenBySym(el.closest('tr').dataset.sym);
        });
      }
      if (wbody) {
        wbody.innerHTML = ui.watch
          .map((w) => {
            const s = w.st1;
            const why = [
              !s.passVol ? 'объём' : '',
              !s.passVR ? `vol/avg≤3 (${s.volRatio != null ? fn(s.volRatio, 2) : '—'})` : '',
              !s.passCh ? `4ч/24ч (${s.ch4h != null ? fn(s.ch4h, 1) : '—'}% / ${fn(s.ch24, 1)}%)` : '',
            ]
              .filter(Boolean)
              .join('; ');
            return `<tr data-sym="${w.sym}"><td><b class="gbs-open" style="cursor:pointer;color:#6b7390">${w.sym.replace(/USDT$/, '')}</b></td><td colspan="9" style="color:var(--text3);font-size:9px">S1 ✗ — ${why}</td></tr>`;
          })
          .join('');
        wbody.querySelectorAll('tr[data-sym]').forEach((row) => {
          const o = row.querySelector('.gbs-open');
          if (o)
            o.onclick = () => openFullscreenBySym(row.dataset.sym);
        });
      }
      const lu = root.querySelector('#gbsIntLu');
      if (lu && ui.lastRun) lu.textContent = new Date(ui.lastRun).toLocaleTimeString();
    }

    box.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:#fff;flex:1">Grid Bot Screener — Intraday</span>
        <span id="gbsIntBusy" style="font-size:10px;color:var(--text3);display:none">Обновление…</span>
        <span id="gbsIntCd" style="font-size:10px;color:var(--text3)">30</span>
        <button class="tbtn" id="gbsIntRf">Сейчас</button>
        <button class="tbtn" id="gbsIntHi">История</button>
        <button class="tbtn" id="gbsIntX">Закрыть</button>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:10px">
        <label>Мин. S2 <input type="range" id="gbsIntMinSc" min="0" max="14" value="7" style="width:90px"></label><span id="gbsIntMinScV">7</span>
        <label>Консолидация
          <select id="gbsIntCons">
            <option value="0">любая</option>
            <option value="2">30м+</option>
            <option value="4">1ч+</option>
            <option value="8">2ч+</option>
          </select>
        </label>
        <label><input type="checkbox" id="gbsIntHideFl"> Скрыть 🔴 флаги</label>
        <span style="color:var(--text3)">Объём — тулбар</span>
        <span style="margin-left:auto">Обновлено: <span id="gbsIntLu">—</span></span>
      </div>
      <div id="gbsIntMeta" style="padding:6px 12px;font-size:9px;color:var(--text3);border-bottom:1px solid var(--border)"></div>
      <div style="flex:1;min-height:0;overflow:auto">
        <table class="gbs-table" style="width:100%;border-collapse:collapse;font-size:10px">
          <thead><tr>
            <th class="gbs-ith" data-k="sym">Тикер</th>
            <th class="gbs-ith" data-k="ch24">24ч%</th>
            <th class="gbs-ith" data-k="volRatio">Vol×</th>
            <th>S1</th>
            <th class="gbs-ith" data-k="score">S2</th>
            <th class="gbs-ith" data-k="consN">Конс.</th>
            <th>Флаги</th>
            <th>Сетка</th>
            <th>Метрики</th>
            <th>В списке</th>
          </tr></thead>
          <tbody id="gbsIntReady"></tbody>
        </table>
        <div style="padding:8px 12px;font-size:10px;color:var(--text3)">Watching (не готовы к S1)</div>
        <table class="gbs-table" style="width:100%;border-collapse:collapse;font-size:10px;opacity:.85">
          <tbody id="gbsIntWatch"></tbody>
        </table>
      </div>
      <div id="gbsIntHist" style="display:none;border-top:1px solid var(--border);max-height:140px;overflow:auto;padding:8px;font-size:9px"></div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    ui.root.querySelector('thead').addEventListener('click', (e) => {
      const th = e.target.closest('.gbs-ith');
      if (!th || !th.dataset.k) return;
      const k = th.dataset.k;
      if (ui.sortKey === k) ui.sortDir = ui.sortDir === 'desc' ? 'asc' : 'desc';
      else {
        ui.sortKey = k;
        ui.sortDir = 'desc';
      }
      applyFiltersAndRender();
    });

    ui.root.querySelector('#gbsIntMinSc').oninput = (e) => {
      ui.minScore = +e.target.value;
      ui.root.querySelector('#gbsIntMinScV').textContent = String(ui.minScore);
      applyFiltersAndRender();
    };
    ui.root.querySelector('#gbsIntCons').onchange = (e) => {
      ui.minCons = +e.target.value;
      applyFiltersAndRender();
    };
    ui.root.querySelector('#gbsIntHideFl').onchange = (e) => {
      ui.hideFlags = e.target.checked;
      applyFiltersAndRender();
    };

    ui.root.querySelector('#gbsIntRf').onclick = () => {
      ui.cdLeft = 30;
      runIntradayScan(ui);
    };
    ui.root.querySelector('#gbsIntX').onclick = () => {
      if (ui.timer) clearInterval(ui.timer);
      if (ui.cdTimer) clearInterval(ui.cdTimer);
      modal.remove();
    };
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        if (ui.timer) clearInterval(ui.timer);
        if (ui.cdTimer) clearInterval(ui.cdTimer);
        modal.remove();
      }
    });

    ui.root.querySelector('#gbsIntHi').onclick = () => {
      const p = ui.root.querySelector('#gbsIntHist');
      const vis = p.style.display !== 'block';
      p.style.display = vis ? 'block' : 'none';
      if (!vis) return;
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith('gridintraday_history_'))
        .sort()
        .reverse()
        .slice(0, 50);
      p.innerHTML = keys.length
        ? keys
            .map((k) => {
              try {
                const o = JSON.parse(localStorage.getItem(k));
                return `<div>${new Date(o.ts).toLocaleTimeString()} — qual ${(o.qualified || []).length} · +${(o.newSyms || []).length} · −${(o.goneSyms || []).length}</div>`;
              } catch {
                return '';
              }
            })
            .join('')
        : 'Нет снимков';
    };

    ui.applyFiltersAndRender = applyFiltersAndRender;
    ui.timer = setInterval(() => runIntradayScan(ui), 30000);
    ui.cdTimer = setInterval(() => {
      ui.cdLeft = Math.max(0, ui.cdLeft - 1);
      const el = ui.root.querySelector('#gbsIntCd');
      if (el) el.textContent = String(ui.cdLeft);
      if (ui.cdLeft <= 0) ui.cdLeft = 30;
    }, 1000);

    runIntradayScan(ui);
  }

  if (typeof window !== 'undefined') {
    window.openGridSwingScreener = openGridSwingScreener;
    window.openGridIntradayScreener = openGridIntradayScreener;
  }
}
