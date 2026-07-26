// ═══════════════════════════════════════════════════════════════
//  emaEditor-ui.js — render and event handlers for the EMA modal.
//
//  Pattern matches gridLab-ui.js: a single `openEmaEditorModal(deps)`
//  wires everything up. All host-side dependencies (S state, rCanvas,
//  clearEmaCache, refreshEmaButtonState, schedulePersistUserSettings)
//  are passed in via `deps` — no imports from main.js, no globals read
//  at import time.
// ═══════════════════════════════════════════════════════════════

import {
  EMA_COLORS,
  EMA_DEFAULT_PERIOD,
  EMA_MIN_PERIOD,
  EMA_MAX_PERIOD,
  nextAvailableColor,
  validateEmaPeriod,
  makeEmaConfig,
  visiblePeriods,
  buildEmaAlertPairs,
  emaButtonState,
  fmtEmaSym,
  resolveEmaActiveSym,
} from './emaEditor.js';

/**
 * Compute the EMA toolbar button on/off state and apply it to the DOM.
 * host globals: `S.emaVisible`, `S.emaSymEnabled`, `S.fsSym`.
 */
export function refreshEmaButtonState(deps) {
  const { S, getById = (id) => document.getElementById(id) } = deps;
  const st = emaButtonState({
    emaVisible: S.emaVisible,
    emaSymEnabled: S.emaSymEnabled,
    fsSym: S.fsSym,
  });
  const btn = getById('emaBtn'); if (btn) btn.classList.toggle('on', st.active);
  const fsBtn = getById('fsEmaBtn'); if (fsBtn) fsBtn.classList.toggle('on', st.active);
}

/**
 * Toggle the global EMA visible flag, repaint all charts, refresh button state.
 */
export function toggleEma(deps) {
  const { S, clearEmaCache, rCanvas } = deps;
  S.emaVisible = !S.emaVisible;
  refreshEmaButtonState(deps);
  if (typeof clearEmaCache === 'function') clearEmaCache();
  if (typeof rCanvas === 'function') {
    for (const ch of [...S.charts, ...S.fsCharts]) rCanvas(ch);
  }
}

/**
 * Open the EMA editor modal.
 *
 * `mode` is 'auto' (default — pick current symbol) or 'symbol' (force
 * per-symbol editing of S.fsSym).
 *
 * deps:
 *   S                              - global state
 *   rCanvas(ch)                    - chart repaint
 *   clearEmaCache()                - invalidate cached EMA series
 *   schedulePersistUserSettings()  - debounced save
 */
export function openEmaEditorModal(mode = 'auto', deps) {
  const { S } = deps;
  const old = document.getElementById('emaEditorModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'emaEditorModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2);border:1px solid var(--border2);border-radius:8px;width:300px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.8)';

  let editSym = (mode === 'symbol' && S.fsSym) ? S.fsSym : null;

  const closeModal = () => {
    modal.remove();
    refreshEmaButtonState(deps);
  };

  const render = () => {
    const activeSym = resolveEmaActiveSym({
      editSym,
      fsSym: S.fsSym,
      charts: S.charts,
    });
    const targetSymEnabled = activeSym ? !!S.emaSymEnabled[activeSym] : false;

    box.innerHTML = `
      <div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <span style="font-size:11px;font-weight:600;color:#fff;flex:1">EMA линии и алерты</span>
        <button id="emaCloseBtn" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:15px">✕</button>
      </div>
      <div id="emaList" style="flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:6px;min-height:0"></div>
      <div style="padding:6px 14px;border-top:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:9px;color:var(--text3)">Показывать EMA:</label>
        <button id="emaGlobalBtn" class="tbtn${S.emaVisible ? ' on' : ''}" title="Показывать EMA на всех монетах">Все</button>
        <button id="emaSymOnlyBtn" class="tbtn${targetSymEnabled ? ' on' : ''}" title="Показывать EMA только для выбранной монеты">Текущая монета</button>
        <label style="font-size:9px;color:var(--text3)">Звук при пересечении:</label>
        <button id="emaSoundBtn" class="tbtn${S.emaCrossSound ? ' on' : ''}">${S.emaCrossSound ? '🔔 Вкл' : '🔕 Выкл'}</button>
        <span style="flex:1"></span>
        <label style="font-size:9px;color:var(--text3)" title="Задать отдельные EMA для текущей монеты">Режим:</label>
        <button id="emaSymBtn" class="tbtn${editSym ? ' on' : ''}">${editSym ? '📊 ' + fmtEmaSym(editSym) : '🌐 Глобал'}</button>
      </div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
        <div style="font-size:9px;color:var(--text3)">Алерты пересечения EMA (добавляются в Алерты с ТФ):</div>
        <div id="emaPairsList" style="display:flex;flex-wrap:wrap;gap:6px"></div>
      </div>
      <div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:6px;flex-shrink:0">
        <button class="tbtn" style="flex:1" id="addEmaBtn">＋ Добавить EMA</button>
        <button class="tbtn on" style="flex:1" id="emaDoneBtn">✓ Готово</button>
      </div>
    `;

    const list = box.querySelector('#emaList');
    if (editSym && !S.emaSymOverrides[editSym]) {
      S.emaSymOverrides[editSym] = S.emaSettings.map(c => ({ ...c }));
    }
    const activeSettings = editSym ? S.emaSymOverrides[editSym] : S.emaSettings;

    activeSettings.forEach((cfg, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--bg3);border-radius:4px;padding:5px 8px;';

      // Color picker dots
      const colorPicker = document.createElement('div');
      colorPicker.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;';
      EMA_COLORS.forEach(col => {
        const dot = document.createElement('div');
        dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${col};cursor:pointer;border:2px solid ${cfg.color === col ? '#fff' : 'transparent'};transition:transform .1s`;
        dot.onmouseenter = () => { dot.style.transform = 'scale(1.3)'; };
        dot.onmouseleave = () => { dot.style.transform = 'scale(1)'; };
        dot.onclick = () => {
          cfg.color = col;
          deps.clearEmaCache?.();
          for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
          render();
        };
        colorPicker.appendChild(dot);
      });
      row.appendChild(colorPicker);

      // Period input
      const pInp = document.createElement('input');
      pInp.type = 'number';
      pInp.min = String(EMA_MIN_PERIOD);
      pInp.max = String(EMA_MAX_PERIOD);
      pInp.value = cfg.period;
      pInp.style.cssText = 'width:50px;background:var(--bg4);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:10px;padding:2px 4px;text-align:center';
      pInp.onchange = () => {
        const v = validateEmaPeriod(pInp.value);
        if (v.valid) {
          cfg.period = v.value;
          deps.clearEmaCache?.();
          for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
        } else if (v.suggested != null) {
          pInp.value = String(v.suggested);
          cfg.period = v.suggested;
          deps.clearEmaCache?.();
          for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
        } else {
          pInp.value = String(cfg.period); // revert
        }
      };
      row.appendChild(pInp);

      // Visible toggle
      const visBtn = document.createElement('button');
      visBtn.style.cssText = `background:${cfg.visible ? cfg.color + '22' : 'transparent'};border:1px solid ${cfg.visible ? cfg.color : 'var(--border2)'};border-radius:3px;color:${cfg.visible ? cfg.color : 'var(--text3)'};font:inherit;font-size:9px;padding:2px 5px;cursor:pointer`;
      visBtn.textContent = cfg.visible ? 'Вкл' : 'Выкл';
      visBtn.onclick = () => {
        cfg.visible = !cfg.visible;
        deps.clearEmaCache?.();
        for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
        render();
      };
      row.appendChild(visBtn);

      // Delete
      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px;margin-left:auto';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить';
      delBtn.onclick = () => {
        activeSettings.splice(i, 1);
        deps.clearEmaCache?.();
        for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
        render();
      };
      row.appendChild(delBtn);

      list.appendChild(row);
    });

    if (!activeSettings.length) {
      list.innerHTML = '<div style="font-size:9px;color:var(--text3);text-align:center;padding:12px">Нет EMA линий. Нажми ＋ чтобы добавить.</div>';
    }

    // Pairs grid
    const pairsEl = box.querySelector('#emaPairsList');
    const periods = visiblePeriods(activeSettings);
    if (periods.length < 2) {
      pairsEl.innerHTML = '<span style="font-size:9px;color:var(--text3)">Нужно минимум 2 активные EMA линии</span>';
    } else {
      pairsEl.innerHTML = '';
      const pairs = buildEmaAlertPairs(periods, S.emaAlertPairs);
      // Persist any newly-created pairs back to S so toggles survive re-renders.
      S.emaAlertPairs = pairs;
      for (const pair of pairs) {
        const pbtn = document.createElement('button');
        pbtn.className = 'tbtn' + (pair.enabled ? ' on' : '');
        pbtn.textContent = `EMA${pair.a}×EMA${pair.b}`;
        pbtn.onclick = () => {
          pair.enabled = !pair.enabled;
          render();
        };
        pairsEl.appendChild(pbtn);
      }
    }

    // Footer buttons
    box.querySelector('#addEmaBtn').onclick = () => {
      activeSettings.push(makeEmaConfig(activeSettings, EMA_DEFAULT_PERIOD));
      deps.clearEmaCache?.();
      for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
      render();
    };

    box.querySelector('#emaCloseBtn').onclick = closeModal;
    box.querySelector('#emaDoneBtn').onclick = closeModal;

    const soundBtn = box.querySelector('#emaSoundBtn');
    if (soundBtn) soundBtn.onclick = () => { S.emaCrossSound = !S.emaCrossSound; render(); };

    const gBtn = box.querySelector('#emaGlobalBtn');
    if (gBtn) gBtn.onclick = () => {
      S.emaVisible = !S.emaVisible;
      refreshEmaButtonState(deps);
      for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
      render();
    };

    const symOnlyBtn = box.querySelector('#emaSymOnlyBtn');
    if (symOnlyBtn) symOnlyBtn.onclick = () => {
      if (!activeSym) return;
      S.emaSymEnabled[activeSym] = !S.emaSymEnabled[activeSym];
      refreshEmaButtonState(deps);
      for (const c of [...S.charts, ...S.fsCharts]) deps.rCanvas?.(c);
      render();
    };

    const symBtn = box.querySelector('#emaSymBtn');
    if (symBtn) symBtn.onclick = () => {
      editSym = editSym ? null : activeSym;
      render();
    };
  };

  render();
  modal.appendChild(box);
  document.body.appendChild(modal);
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) closeModal();
  });
}
