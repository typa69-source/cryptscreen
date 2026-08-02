// Virtual scroll math for the screener table.
//
// The screener renders hundreds of coin rows; rendering all of them in DOM
// costs both initial layout and per-tick reflow (every WS batch touches
// every row). With virtual scrolling we keep only ~one viewport worth of
// rows in the DOM and translate them into place as the user scrolls.
//
// This file is pure math — no DOM access — so it can be unit-tested in
// node:test without a browser. The DOM wiring lives in main.js.
//
// The model:
//   - The scroll container is `sbody` with `overflow-y:scroll`.
//   - Its scrollable height equals `total * rowHeight` (set via a spacer
//     div, not via real rows).
//   - The actual rows are positioned inside the container using
//     `transform: translate3d(0, firstIndex * rowHeight, 0)`.
//
//   ┌─────────────────────────┐  ← sbody (overflow:auto)
//   │  spacer-top             │  height: firstIndex * rowHeight
//   ├─────────────────────────┤
//   │  visible rows           │  transform: translateY(-topSpacer)
//   │  (~ viewport)           │
//   ├─────────────────────────┤
//   │  spacer-bottom          │  height: (total - lastIndex) * rowHeight
//   └─────────────────────────┘
//
// Overscan: render a few extra rows above/below the viewport so that
// fast scrolls don't flash empty space. Default = 5 rows.

export const DEFAULT_OVERSCAN = 5;

// Row height in pixels. Matches .srow CSS (26px content + 1px border).
// Kept as a single source of truth — the CSS line in style.css must
// match this number.
export const ROW_HEIGHT = 27;

/**
 * Compute which rows should be mounted in the DOM given a scroll position.
 *
 * @param {number} scrollTop    - container.scrollTop (>= 0)
 * @param {number} viewportH    - container.clientHeight (>= 0)
 * @param {number} total        - total number of rows (>= 0)
 * @param {number} [rowHeight]  - per-row height in px (default ROW_HEIGHT)
 * @param {number} [overscan]   - extra rows above/below (default DEFAULT_OVERSCAN)
 * @returns {{first:number,last:number,offsetY:number,spacerTop:number,spacerBottom:number}}
 *
 *   first/last      — inclusive indices of rows to render
 *   offsetY         — pixels the row container should be translated up
 *                     by translate3d (always 0; the spacer-top handles it)
 *   spacerTop       — height in px of the empty div above the rows
 *   spacerBottom    — height in px of the empty div below the rows
 */
export function visibleRange(scrollTop, viewportH, total, rowHeight = ROW_HEIGHT, overscan = DEFAULT_OVERSCAN) {
  if (!Number.isFinite(scrollTop) || scrollTop < 0) scrollTop = 0;
  if (!Number.isFinite(viewportH) || viewportH < 0) viewportH = 0;
  if (!Number.isFinite(total) || total < 0) total = 0;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) rowHeight = ROW_HEIGHT;
  if (!Number.isFinite(overscan) || overscan < 0) overscan = 0;

  if (total === 0) {
    return { first: 0, last: -1, offsetY: 0, spacerTop: 0, spacerBottom: 0 };
  }

  // Clamp scrollTop to the real scrollable range, like the browser does.
  // (Browsers clamp scrollTop automatically, but defensive math matters
  // for tests and for any caller that forgets to clamp.)
  const maxScroll = Math.max(0, total * rowHeight - viewportH);
  const safeScroll = Math.min(Math.max(0, scrollTop), maxScroll);

  // First visible row index. Floor so partial rows at top count as "not yet".
  const rawFirst = Math.floor(safeScroll / rowHeight);
  // Last visible row index (inclusive). Ceil so partial rows at bottom count.
  const rawLast = Math.ceil((safeScroll + viewportH) / rowHeight) - 1;

  // Apply overscan and clamp to [0, total).
  const first = Math.max(0, rawFirst - overscan);
  const last = Math.min(total - 1, rawLast + overscan);

  // Spacers fill the rest of the scrollable height.
  const spacerTop = first * rowHeight;
  const spacerBottom = (total - 1 - last) * rowHeight;

  return {
    first,
    last,
    offsetY: 0, // reserved for future sub-row scroll adjustments
    spacerTop,
    spacerBottom,
  };
}

/**
 * Convenience: how many rows are visible (between first and last inclusive).
 */
export function visibleCount(range) {
  if (!range || range.last < range.first) return 0;
  return range.last - range.first + 1;
}

/**
 * Scroll a specific row index to the top of the viewport.
 * Returns the scrollTop to assign.
 */
export function scrollOffsetForRow(rowIndex, rowHeight = ROW_HEIGHT) {
  if (!Number.isFinite(rowIndex) || rowIndex < 0) return 0;
  return rowIndex * rowHeight;
}
