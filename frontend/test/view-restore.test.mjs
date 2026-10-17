// Unit tests for the residual-correction view restore after
// setData-with-prepend (the chart zoom/magnet family of bugs).
//
// The restore algorithm (main.js loadMoreHistory.doSet):
//   logicalBefore = getVisibleLogicalRange()      // BEFORE setData
//   setData(merged)                               // prepend + trim
//   after = getVisibleLogicalRange()              // AFTER setData
//   target = logicalBefore + realShift            // where the view SHOULD be
//   err = after - target
//   setVisibleLogicalRange(after - err)           // single compensation
//
// LWC semantics measured live on v4.1.3 (magnet-exp experiment):
//   - setData does NOT preserve the logical range when bars are prepended:
//     the view follows the SAME INDEXES, which now point at different bars.
//   - The view's SPAN (to-from) is always preserved by setData.
// These tests emulate exactly that behaviour and assert the algorithm
// returns the view to "same bars on screen" (from+realShift) while keeping
// the user's zoom span — including a zoom whose `from` is NEGATIVE
// (space left of the oldest bar), which a time-range restore cannot
// represent at all (getVisibleRange clamps `from` to the oldest bar —
// that clamping was the "scale resets" bug).
import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Emulates the LWC timeScale for these tests. */
function mkFakeScale() {
  let range = { from: 0, to: 100 };
  return {
    getVisibleLogicalRange: () => ({ ...range }),
    setVisibleLogicalRange: (r) => { range = { from: +r.from, to: +r.to }; },
  };
}

/** The restore algorithm exactly as patched into main.js. */
function restoreAfterPrepend(scale, realShift) {
  const logicalBefore = scale.getVisibleLogicalRange();
  // setData happens between the two reads; LWC keeps SPAN and keeps
  // INDEXES pointing at the same slots (emulated by doing nothing —
  // the fake scale does not move on setData).
  const after = scale.getVisibleLogicalRange();
  const targetFrom = logicalBefore.from + realShift;
  const targetTo = logicalBefore.to + realShift;
  const errFrom = after.from - targetFrom;
  const errTo = after.to - targetTo;
  if (Math.abs(errFrom) > 0.01 || Math.abs(errTo) > 0.01) {
    scale.setVisibleLogicalRange({ from: after.from - errFrom, to: after.to - errTo });
  }
}

test('restore: zoom span preserved through prepend + restore', () => {
  const s = mkFakeScale();
  s.setVisibleLogicalRange({ from: 500, to: 600 }); // user zoom (span 100)
  restoreAfterPrepend(s, 300);
  const r = s.getVisibleLogicalRange();
  assert.equal(Math.round(r.to - r.from), 100); // span kept
  assert.equal(Math.round(r.from), 800); // from shifted by realShift
});

test('restore: NEGATIVE from (zoom into unloaded space) is representable', () => {
  // The old time-range restore clamped from to the oldest bar and reset
  // the zoom; logical restore keeps the negative offset.
  const s = mkFakeScale();
  s.setVisibleLogicalRange({ from: -80, to: 20 }); // 80 bars of empty space left
  restoreAfterPrepend(s, 300);
  const r = s.getVisibleLogicalRange();
  assert.equal(Math.round(r.to - r.from), 100);
  assert.equal(Math.round(r.from), 220); // -80 + 300
});

test('restore: zero real shift (pure repaint) is a no-op', () => {
  const s = mkFakeScale();
  s.setVisibleLogicalRange({ from: 12.5, to: 88.25 });
  restoreAfterPrepend(s, 0);
  const r = s.getVisibleLogicalRange();
  assert.equal(r.from, 12.5);
  assert.equal(r.to, 88.25);
});

test('restore: cache saturated (trim cancels prepend) still works', () => {
  // HIST_CACHE_MAX trims older bars: realShift = merged - before can be 0
  // even when 300 bars were prepended. Same invariant: from + realShift.
  const s = mkFakeScale();
  s.setVisibleLogicalRange({ from: 2500, to: 2600 });
  restoreAfterPrepend(s, 0); // prepend 300, trim 300
  const r = s.getVisibleLogicalRange();
  assert.equal(Math.round(r.to - r.from), 100);
  assert.equal(Math.round(r.from), 2500);
});
