// ═══════════════════════════════════════════════════════════════
//  POTENTIAL PRESETS — UI
// ═══════════════════════════════════════════════════════════════
//
// DOM rendering for the Potential panel and preset editor modal.
// Pure logic lives in potentialPresets.js.

import {
  POT_FIELDS,
  POT_FIELD_DESC,
  POT_ABS_FIELDS,
  clampEmaPeriod,
  makePreset,
  ensureBuiltinSqueezePreset,
  totalActiveMatches,
  fmtConditionTag,
  fmtConditionValue,
} from './potentialPresets.js';

/**
 * Toggle the Potential panel visibility.
 * @param {object} deps
 *   S                    - global state
 *   renderPotentialPanel - () => void
 */
export function togglePotentialPanelUi({ S, renderPotentialPanel }) {
  const p = document.getElementById('potentialPanel');
  if (!p) return;
  const vis = p.style.display === 'none' || p.style.display === '';
  p.style.display = vis ? 'flex' : 'none';
  const btn = document.getElementById('potBtn');
  if (btn) btn.classList.toggle('on', vis);
  if (vis) renderPotentialPanel?.();
}

/**
 * Render the Potential panel into #potentialPanel.
 *
 * @param {object} deps
 *   S                       - global state
 *   activeTabRef            - { current: string|null }  preset id of the active tab
 *   setActiveTab            - (id) => void
 *   openPotPresetEditorUi   - (id) => void
 *   addBuiltinSqueezePreset - () => void
 *   togglePotPresetUi       - (id) => void
 *   deletePotPresetUi       - (id) => void
 *   openFullscreenBySym     - (sym) => void
 *   fmt                     - { fn, fk, fmtPrice }
 *   groupColors             - string[]   GROUP_COLORS
 *   getSymGroup             - (sym) => number
 */
export function renderPotentialPanelUi(deps) {
  const {
    S,
    activeTabRef,
    setActiveTab,
    openPotPresetEditorUi,
    addBuiltinSqueezePreset,
    togglePotPresetUi,
    deletePotPresetUi,
    openFullscreenBySym,
    fmt = {},
    groupColors = [],
    getSymGroup,
  } = deps;
  const { fn = (v, d) => Number(v).toFixed(d), fk = (v) => String(v), fmtPrice = (v) => String(v) } = fmt;

  const panel = document.getElementById('potentialPanel');
  if (!panel) return;

  // Tabs bar
  let tabBar = panel.querySelector('.pot-tab-bar');
  if (!tabBar) {
    tabBar = document.createElement('div');
    tabBar.className = 'pot-tab-bar';
    panel.querySelector('.pot-hdr').after(tabBar);
  }
  tabBar.innerHTML = '';
  S.potentialPresets.forEach(pr => {
    const tab = document.createElement('button');
    tab.className = 'pot-tab' + (pr.id === activeTabRef.current ? ' active' : '');
    const cnt = Object.keys(pr.matches || {}).length;
    tab.innerHTML = `<span>${pr.name}</span>${cnt ? `<span class="pot-tab-cnt">${cnt}</span>` : ''}`;
    tab.onclick = () => { setActiveTab(pr.id); renderPotentialPanelUi(deps); };
    tab.oncontextmenu = ev => { ev.preventDefault(); openPotPresetEditorUi(pr.id); };
    tabBar.appendChild(tab);
  });

  // Built-in squeeze template
  const tplBtn = document.createElement('button');
  tplBtn.className = 'pot-tab';
  tplBtn.title = 'Готовый пресет: BB squeeze + volume impulse + breakout';
  tplBtn.textContent = '＋Squeeze';
  tplBtn.onclick = () => { addBuiltinSqueezePreset(); renderPotentialPanelUi(deps); };
  tabBar.appendChild(tplBtn);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'pot-tab pot-tab-add';
  addBtn.title = 'Добавить пресет';
  addBtn.textContent = '＋';
  addBtn.onclick = () => openPotPresetEditorUi(null);
  tabBar.appendChild(addBtn);

  // Body area
  let body = panel.querySelector('.pot-body');
  if (!body) {
    body = document.createElement('div');
    body.className = 'pot-body';
    panel.appendChild(body);
  }
  body.innerHTML = '';

  const pr = S.potentialPresets.find(p => p.id === activeTabRef.current);
  if (!pr) {
    body.innerHTML = '<div class="pot-empty">Нажми ＋ чтобы добавить пресет с условиями</div>';
    return;
  }

  // Preset controls
  const ctrl = document.createElement('div');
  ctrl.className = 'pot-preset-ctrl';
  ctrl.innerHTML = `
    <span style="font-size:9px;color:var(--text3);flex:1">${pr.conditions.length} условий</span>
    <button class="tbtn${pr.enabled ? ' on' : ''}" data-act="toggle">${pr.enabled ? '🔔 Вкл' : '🔕 Выкл'}</button>
    <button class="tbtn" data-act="edit" title="Редактировать">✏️</button>
    <button class="tbtn" data-act="delete" style="color:var(--red)" title="Удалить">✕</button>`;
  ctrl.querySelector('[data-act="toggle"]').onclick = () => togglePotPresetUi(pr.id);
  ctrl.querySelector('[data-act="edit"]').onclick = () => openPotPresetEditorUi(pr.id);
  ctrl.querySelector('[data-act="delete"]').onclick = () => deletePotPresetUi(pr.id);
  body.appendChild(ctrl);

  // Conditions summary
  if (pr.conditions.length) {
    const cond = document.createElement('div');
    cond.className = 'pot-cond-summary';
    cond.innerHTML = pr.conditions
      .map(c => `<span class="pot-cond-tag">${fmtConditionTag(c)}</span>`)
      .join('');
    body.appendChild(cond);

    const dsc = document.createElement('div');
    dsc.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-top:6px';
    dsc.innerHTML = pr.conditions
      .map(c => POT_FIELD_DESC[c.field] ? `<span style="font-size:9px;color:var(--text3)">• ${POT_FIELD_DESC[c.field]}</span>` : '')
      .join('');
    if (dsc.innerHTML.trim()) body.appendChild(dsc);
  }

  // Matches list
  const listEl = document.createElement('div');
  listEl.className = 'pot-list';
  const matches = Object.entries(pr.matches || {}).sort((a, b) => b[1].ts - a[1].ts);
  if (!matches.length) {
    listEl.innerHTML = `<div class="pot-empty">${pr.enabled ? 'Совпадений нет • ждём…' : 'Мониторинг выключен'}</div>`;
  } else {
    matches.forEach(([sym, d]) => {
      const sn = sym.replace(/USDT$/, '');
      const m = S.mx[sym] || {};
      const col = (m.ch24 ?? 0) >= 0 ? '#1fa891' : '#e04040';
      const grp = getSymGroup ? getSymGroup(sym) : 0;
      const grpCol = groupColors[grp] || '';
      const item = document.createElement('div');
      item.className = 'pot-item';
      item.onclick = () => openFullscreenBySym(sym);
      const tags = pr.conditions
        .map(c => {
          const f = POT_FIELDS.find(x => x.id === c.field);
          let val = m[c.field];
          if (c.field === 'emaTouch') val = Number(d?.emaTouch?.[c.period || 20]) || 0;
          const fmt2 = fmtConditionValue(val, c, fmt);
          const absTxt = c.abs && POT_ABS_FIELDS.has(c.field) ? '|.| ' : '';
          return `<span class="pot-tag">${absTxt}${f?.label?.split(' ')[0] || c.field} ${fmt2}${f?.unit ? f.unit : ''}</span>`;
        })
        .join('');
      item.innerHTML = `
        ${grpCol ? `<span style="width:3px;align-self:stretch;background:${grpCol};border-radius:2px;flex-shrink:0"></span>` : ''}
        <span class="pot-sym">${sn}</span>
        <span style="color:${col};font-weight:600;font-size:10px">${(m.ch24 ?? 0) >= 0 ? '+' : ''}${fn(m.ch24, 2)}%</span>
        ${tags}
        <span style="color:var(--text3);font-size:9px;margin-left:auto">${fmtPrice(m.price)}</span>`;
      listEl.appendChild(item);
    });
  }
  body.appendChild(listEl);
}

/**
 * Open the preset editor modal.
 *
 * @param {string|null} presetId - null creates a new preset
 * @param {object} deps
 *   S                       - global state
 *   setActiveTab            - (id) => void
 *   renderPotentialPanel    - () => void
 *   runPotentialCheck       - () => void
 *   buildGroupFilterBar     - () => void
 *   togglePotPresetUi       - (id) => void
 *   deletePotPresetUi       - (id) => void
 *   showConfirmModal        - (msg, opts) => void
 */
export function   openPotPresetEditorUi(presetId, deps) {
  const {
    S,
    setActiveTab,
    renderPotentialPanel,
    runPotentialCheck,
    buildGroupFilterBar,
    togglePotPresetUi,
    deletePotPresetUi: deletePreset,
    showConfirmModal,
  } = deps;

  const existing = presetId ? S.potentialPresets.find(p => p.id === presetId) : null;
  const old = document.getElementById('potPresetModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'potPresetModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg2);border:1px solid var(--border2);border-radius:8px;width:min(520px,96vw);max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.8)';

  // Working copy of conditions
  const wCond = (existing?.conditions || []).map(c => ({ ...c, abs: !!c.abs }));

  const render = () => {
    box.innerHTML = `
      <div style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid var(--border);flex-shrink:0;gap:8px">
        <span style="font-size:11px;font-weight:600;color:#fff;flex:1">${existing ? 'Редактировать' : 'Новый'} пресет</span>
        <button style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:15px" id="potCloseBtn">✕</button>
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0">
        <label style="font-size:9px;color:var(--text3);display:block;margin-bottom:4px">НАЗВАНИЕ</label>
        <input id="potPresetName" value="${existing?.name || ''}" placeholder="Например: Импульс роста"
          style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font:inherit;font-size:10px;padding:5px 8px;outline:none">
      </div>
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:10px;color:var(--text2)">Условия (ВСЕ должны совпасть)</span>
        <button class="tbtn" id="potAddCond">＋ Условие</button>
      </div>
      <div id="potCondList" style="flex:1;overflow-y:auto;min-height:0;padding:6px 14px"></div>
      <div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <button class="tbtn" style="flex:1;color:var(--text2)" id="potCancelBtn">Отмена</button>
        <button class="tbtn on" style="flex:2" id="potSaveBtn">✓ Сохранить</button>
      </div>
      ${existing ? `<div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0">
        <button class="tbtn${existing.enabled ? ' on' : ''}" style="flex:1" id="potToggleBtn">${existing.enabled ? '🔔 Вкл' : '🔕 Выкл'} алерты</button>
        <button class="tbtn" style="flex:1;color:var(--red)" id="potDeleteBtn">Удалить пресет</button>
      </div>` : ''}`;

    // Render conditions
    const cl = box.querySelector('#potCondList');
    if (!wCond.length) {
      cl.innerHTML = '<div style="font-size:9px;color:var(--text3);padding:8px 0">Нет условий • нажми ＋ чтобы добавить</div>';
    }
    wCond.forEach((c, idx) => {
      const f = POT_FIELDS.find(x => x.id === c.field) || POT_FIELDS[0];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(37,37,48,.5)';
      row.innerHTML = `
        <select style="flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:3px 4px">
          ${POT_FIELDS.map(x => `<option value="${x.id}"${x.id === c.field ? ' selected' : ''}>${x.label}</option>`).join('')}
        </select>
        <label title="Игнорировать направление (+/-), использовать модуль" style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--text3);${POT_ABS_FIELDS.has(c.field) ? '' : 'visibility:hidden'}">
          |x|
          <input type="checkbox" ${c.abs ? 'checked' : ''}>
        </label>
        <span style="font-size:9px;color:var(--text3)">от</span>
        <input type="number" value="${c.min ?? ''}" placeholder="•" step="${f.step}" class="pot-min"
          style="width:52px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:2px 4px;text-align:right">
        <span style="font-size:9px;color:var(--text3)">до</span>
        <input type="number" value="${c.max ?? ''}" placeholder="•" step="${f.step}" class="pot-max"
          style="width:52px;background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:2px 4px;text-align:right">
        <span style="font-size:9px;color:var(--text3);${c.field === 'emaTouch' ? '' : 'display:none;'}" class="pot-ema-lbl" title="Период EMA, по умолчанию 20">EMA period</span>
        <input type="number" value="${clampEmaPeriod(c.period || 20)}" min="2" max="400" step="1"
          class="pot-ema-period" title="Период EMA для условия EMA touch" style="width:68px;${c.field === 'emaTouch' ? '' : 'display:none;'}background:var(--bg3);border:1px solid var(--border2);border-radius:3px;color:var(--text);font:inherit;font-size:9px;padding:2px 4px;text-align:right">
        <button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:0 2px" data-del="${idx}">✕</button>
        <span style="display:none" class="pot-desc">${POT_FIELD_DESC[c.field] || ''}</span>`;
      const sel = row.querySelector('select');
      sel.onchange = () => {
        wCond[idx].field = sel.value;
        if (sel.value === 'emaTouch' && (wCond[idx].period == null || !isFinite(wCond[idx].period))) {
          wCond[idx].period = 20;
        }
        render();
      };
      const absCb = row.querySelector('input[type=checkbox]');
      if (absCb) absCb.onchange = () => { wCond[idx].abs = absCb.checked; };
      const minI = row.querySelector('.pot-min');
      const maxI = row.querySelector('.pot-max');
      minI.onchange = () => { const v = parseFloat(minI.value); wCond[idx].min = isNaN(v) ? null : v; };
      maxI.onchange = () => { const v = parseFloat(maxI.value); wCond[idx].max = isNaN(v) ? null : v; };
      const pI = row.querySelector('.pot-ema-period');
      if (pI) pI.onchange = () => {
        const v = clampEmaPeriod(parseInt(pI.value || '20', 10) || 20);
        wCond[idx].period = v;
        pI.value = String(v);
      };
      row.querySelector('[data-del]').onclick = () => { wCond.splice(idx, 1); render(); };
      cl.appendChild(row);
      if (POT_FIELD_DESC[c.field]) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:8px;color:var(--text3);margin:-1px 0 5px 2px;line-height:1.35';
        hint.textContent = POT_FIELD_DESC[c.field];
        cl.appendChild(hint);
      }
    });

    box.querySelector('#potAddCond').onclick = () => {
      wCond.push({ field: 'ch24', min: null, max: null, abs: false, period: 20 });
      render();
    };
    box.querySelector('#potCloseBtn').onclick = () => modal.remove();
    box.querySelector('#potCancelBtn').onclick = () => modal.remove();
    box.querySelector('#potSaveBtn').onclick = () => {
      const name = box.querySelector('#potPresetName').value.trim() || 'Пресет';
      if (existing) {
        existing.name = name;
        existing.conditions = [...wCond];
      } else {
        const pr = makePreset(name, wCond, { enabled: true, cooldown: 60 });
        S.potentialPresets.push(pr);
        setActiveTab(pr.id);
      }
      modal.remove();
      renderPotentialPanel?.();
      runPotentialCheck?.();
      buildGroupFilterBar?.();
    };

    const tg = box.querySelector('#potToggleBtn');
    if (tg && existing) {
      tg.onclick = () => {
        existing.enabled = !existing.enabled;
        if (existing.enabled) {
          runPotentialCheck?.();
        } else {
          existing.matches = {};
          existing.alerted = {};
          renderPotentialPanel?.();
          buildGroupFilterBar?.();
        }
        tg.classList.toggle('on', existing.enabled);
        tg.textContent = (existing.enabled ? '🔔 Вкл' : '🔕 Выкл') + ' алерты';
      };
    }
    const del = box.querySelector('#potDeleteBtn');
    if (del && existing) {
      del.onclick = () => {
        showConfirmModal?.(`Удалить пресет "${existing.name}"?`, {
          title: 'Удаление пресета',
          okText: 'Удалить',
          danger: true,
          onConfirm: () => { deletePreset?.(existing.id); modal.remove(); },
        });
      };
    }
  };

  render();
  modal.appendChild(box);
  document.body.appendChild(modal);
  modal.addEventListener('mousedown', e => { if (e.target === modal) modal.remove(); });
}

/**
 * Toggle preset enabled state.
 * Schedules the periodic check if any preset is enabled.
 *
 * @param {string} id
 * @param {object} deps
 *   S                    - global state
 *   activeTabRef         - { current }
 *   setActiveTab         - (id) => void
 *   startPotentialMonitor - () => void
 *   renderPotentialPanel - () => void
 *   buildGroupFilterBar  - () => void
 */
export function togglePotPresetUi(id, deps) {
  const { S, setActiveTab, startPotentialMonitor, renderPotentialPanel, buildGroupFilterBar } = deps;
  const pr = S.potentialPresets.find(p => p.id === id);
  if (!pr) return;
  pr.enabled = !pr.enabled;
  if (pr.enabled) {
    startPotentialMonitor?.();
  } else {
    pr.matches = {};
    pr.alerted = {};
  }
  renderPotentialPanel?.();
  buildGroupFilterBar?.();
  if (setActiveTab) void 0; // silence unused
}

/**
 * Delete a preset by id. If it was the active tab, move to the first
 * remaining preset (or null).
 */
export function deletePotPresetUi(id, deps) {
  const { S, activeTabRef, setActiveTab, renderPotentialPanel, buildGroupFilterBar } = deps;
  const idx = S.potentialPresets.findIndex(p => p.id === id);
  if (idx < 0) return;
  S.potentialPresets.splice(idx, 1);
  if (activeTabRef.current === id) setActiveTab(S.potentialPresets[0]?.id || null);
  renderPotentialPanel?.();
  buildGroupFilterBar?.();
}

/**
 * Add the builtin squeeze preset and select it as the active tab.
 */
export function addBuiltinSqueezePresetUi(deps) {
  const { S, setActiveTab } = deps;
  const pr = ensureBuiltinSqueezePreset(S.potentialPresets);
  setActiveTab(pr.id);
}

/**
 * Clear matches and alerted timestamps for all presets.
 */
export function clearPotentialMatchesUi(deps) {
  const { S, renderPotentialPanel } = deps;
  S.potentialPresets.forEach(pr => {
    pr.matches = {};
    pr.alerted = {};
  });
  renderPotentialPanel?.();
  const badge = document.getElementById('potBadge');
  if (badge) badge.style.display = 'none';
}

/**
 * Update the badge in the toolbar with the current match count.
 */
export function updatePotBadgeUi(S) {
  const badge = document.getElementById('potBadge');
  if (!badge) return;
  const total = totalActiveMatches(S.potentialPresets);
  badge.textContent = total;
  badge.style.display = total ? 'inline' : 'none';
}
