// Virtualized screener list.
// Renders only ~50 rows (viewport + buffer) into the DOM regardless of
// dataset size. Uses absolute positioning inside a scroll container whose
// total height is set via a top/bottom spacer — so the scrollbar reflects
// the full dataset.
//
// Public API (compatible with previous renderScreenerInto contract):
//   const vs = ensureVirtualScreener(bodyEl, { build, update });
//   vs.setData(rows, cols, inChart);   // build/rebuild rows for current sort/filter
//   vs.updateVisibleRows(rows, inChart); // tick: refresh only visible rows
//   vs.getRowMap();                     // for code that needs to look up a row by sym
//   vs.invalidate();                    // force rebuild of pool (column changes)
//
// `build(m, cols)` should create and return a fresh row DOM node.
// `update(row, m, cols, inChart)` should mutate the existing row in place.
//
// Design choices per user:
//   - 15-row buffer above/below viewport (~50 nodes total)
//   - sparklines via SVG (already used in current code) — no canvas
//   - tick updates touch only visible rows
//   - scroll position preserved across sort/filter by remembering the
//     symbol at the top of the viewport and restoring it after the
//     dataset changes

const BUFFER = 15;
const ROW_HEIGHT = 26; // matches .srow{height:26px} in style.css

function makeSpacer(h) {
  const el = document.createElement('div');
  el.style.flexShrink = '0';
  el.style.minHeight = '0';
  el.style.height = h + 'px';
  el.style.pointerEvents = 'none';
  return el;
}

export function ensureVirtualScreener(bodyEl, opts) {
  if (bodyEl._vs) return bodyEl._vs;
  const build = opts && opts.build;
  const update = opts && opts.update;
  if (typeof build !== 'function' || typeof update !== 'function') {
    throw new Error('ensureVirtualScreener: opts.build and opts.update must be functions');
  }

  // The container itself becomes the scroll viewport. We add a single
  // inner wrapper that holds the spacer + visible rows. This keeps the
  // existing outer .sbody CSS (flex, overflow-y:scroll) untouched.
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;min-height:100%';
  bodyEl.innerHTML = '';
  bodyEl.appendChild(wrap);

  const topSpacer = makeSpacer(0);
  const bottomSpacer = makeSpacer(0);
  wrap.appendChild(topSpacer);
  wrap.appendChild(bottomSpacer);

  // Pool of rows. Keyed by index in the current slice (rebuilt on scroll).
  const pool = []; // array of DOM nodes currently in pool
  const rowMap = new Map(); // sym -> row node (kept for compat with old code)

  let currentRows = []; // ordered list of {sym, ...metrics}
  let currentCols = [];
  let currentInChart = new Set();
  let scrollAnchor = null; // {sym} of first visible row, to restore on data change

  const vs = {
    bodyEl,
    wrap,
    topSpacer,
    bottomSpacer,
    _rowMap: rowMap,
    getRowMap() { return rowMap; },

    setData(rows, cols, inChart) {
      // Called both on tick updates and on sort/filter changes. If the
      // dataset is the same as last time (same length, same ordering,
      // same cols) we treat it as a tick and only refresh the visible
      // pool in place — avoiding full rebuild churn every ~1-2s.
      // Otherwise we preserve scroll position and rebuild the pool.
      const newRows = rows || [];
      const sameOrder =
        newRows === currentRows ||
        (newRows.length === currentRows.length &&
          newRows.length > 0 &&
          this._sameOrdering(newRows, currentRows));
      const sameCols = currentCols.length === cols.length &&
        currentCols.every((c, i) => c.id === cols[i].id);

      // Remember which symbol sits at the top of the viewport so we can
      // restore scroll position after the data changes.
      scrollAnchor = this._getTopSymbol();
      currentRows = newRows;
      currentCols = cols || [];
      if (inChart) currentInChart = inChart;

      if (sameOrder && sameCols) {
        this.updateVisibleRows(null, null);
        return;
      }
      this._rebuildAll();
    },

    _sameOrdering(a, b) {
      // Sample a few positions to detect re-ordering. Comparing the full
      // list would be O(n) and visible in flame graphs during 500-row
      // ticks; sampling 4 points is O(1) and catches the common case.
      if (a.length !== b.length) return false;
      const samples = [0, Math.floor(a.length / 4), Math.floor(a.length / 2), a.length - 1];
      for (const i of samples) {
        if (!a[i] || !b[i] || a[i].sym !== b[i].sym) return false;
      }
      return true;
    },

    updateVisibleRows(rows, inChart) {
      // Called on every tick (1-2s). Only updates the visible window.
      if (rows) currentRows = rows;
      if (inChart) currentInChart = inChart;
      if (currentRows.length === 0 || !build || !update) return;
      const { start, end } = this._visibleRange();
      this._populateSlice(start, end);
      this._updateSpacers();
    },

    invalidate() {
      currentCols = [];
      rowMap.clear();
      // pool will be torn down and rebuilt on next setData
    },

    _getTopSymbol() {
      const wrapTop = wrap.offsetTop;
      // The first row in DOM after the top spacer
      for (const node of wrap.children) {
        if (node === topSpacer || node === bottomSpacer) continue;
        const rect = node.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (rect.bottom > wrapRect.top + 1) {
          return node._sym || null;
        }
      }
      return null;
    },

    _restoreScrollToSymbol(sym) {
      if (!sym) {
        bodyEl.scrollTop = 0;
        return;
      }
      const idx = currentRows.findIndex(r => r.sym === sym);
      if (idx < 0) {
        bodyEl.scrollTop = 0;
        return;
      }
      bodyEl.scrollTop = idx * ROW_HEIGHT;
    },

    _visibleRange() {
      const scrollTop = bodyEl.scrollTop;
      const viewportH = bodyEl.clientHeight || 400;
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
      const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + 1;
      const end = Math.min(currentRows.length, start + visibleCount + BUFFER * 2);
      return { start, end };
    },

    _updateSpacers() {
      const { start, end } = this._visibleRange();
      topSpacer.style.height = (start * ROW_HEIGHT) + 'px';
      bottomSpacer.style.height = Math.max(0, (currentRows.length - end) * ROW_HEIGHT) + 'px';
    },

    _rebuildAll() {
      // Wipe pool + map; clear DOM between spacers
      while (wrap.children.length > 2) {
        wrap.removeChild(wrap.lastChild);
      }
      pool.length = 0;
      rowMap.clear();

      const { start, end } = this._visibleRange();
      this._populateSlice(start, end);
      this._updateSpacers();
      // After layout, restore scroll position
      requestAnimationFrame(() => {
        this._restoreScrollToSymbol(scrollAnchor);
        this._updateSpacers();
      });
    },

    _populateSlice(start, end) {
      // Ensure we have exactly (end - start) rows in the pool.
      while (pool.length < (end - start)) {
        const idx = pool.length + start;
        const m = currentRows[idx];
        if (!m) break;
        const row = build(m, currentCols);
        update(row, m, currentCols, currentInChart);
        wrap.appendChild(row);
        pool.push(row);
        rowMap.set(m.sym, row);
      }
      while (pool.length > (end - start)) {
        const row = pool.pop();
        if (row && row._sym && rowMap.get(row._sym) === row) {
          rowMap.delete(row._sym);
        }
        if (row && row.parentNode === wrap) wrap.removeChild(row);
      }
      // Sync each pool node to its current data row
      for (let i = 0; i < pool.length; i++) {
        const dataIdx = start + i;
        const m = currentRows[dataIdx];
        if (!m) continue;
        // If the sym changed (e.g. dataset reordered), rebuild this node.
        if (pool[i]._sym !== m.sym) {
          if (rowMap.get(pool[i]._sym) === pool[i]) rowMap.delete(pool[i]._sym);
          update(pool[i], m, currentCols, currentInChart);
          pool[i]._sym = m.sym;
          rowMap.set(m.sym, pool[i]);
        } else {
          update(pool[i], m, currentCols, currentInChart);
        }
      }
    },
  };

  bodyEl._vs = vs;

  // Scroll handler — recompute pool contents.
  let raf = 0;
  bodyEl.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (currentRows.length === 0) return;
      const { start, end } = vs._visibleRange();
      vs._populateSlice(start, end);
      vs._updateSpacers();
    });
  }, { passive: true });

  // Window resize handler — recompute on viewport change.
  window.addEventListener('resize', () => {
    if (currentRows.length === 0) return;
    requestAnimationFrame(() => {
      const { start, end } = vs._visibleRange();
      vs._populateSlice(start, end);
      vs._updateSpacers();
    });
  }, { passive: true });

  return vs;
}
