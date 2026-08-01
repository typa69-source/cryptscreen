// Cheap string fingerprint of the data fields that updateScreenerRow uses
// to render the row. If the signature hasn't changed since the last call,
// we can skip the per-cell DOM work — most rows don't change on most ticks.
//
// Includes only fields that actually drive visible text/className:
//   - price, ch24, vol24, trd24, cday, rtd, r24, r7d, r1m5
//   - na30, na14, tr5, tr1h, vr5, vr1h
//   - sp5/sp5d (sparkline 5m path + %), spv/spVold (sparkline vol path + %)
//   - oi1h, oi4h, fund
//
// Excludes things updateScreenerRow does NOT read:
//   - corr, corr14, sqzPop, bbSqz, bbBreak, volImpulse (formatting only via fv/fc — included via their base fields)
//
// `null`/`undefined` are normalised to '' so missing fields don't cause
// spurious changes (e.g. oi1h flips null→0 on first poll).
export function rowSignature(m) {
  if (!m || !m.sym) return '';
  const norm = (v) => (v == null || (typeof v === 'number' && !isFinite(v))) ? '' : v;
  // Build the signature in a fixed order so equal data → equal string.
  return [
    m.sym,
    norm(m.price),
    norm(m.ch24),
    norm(m.cday),
    norm(m.rtd),
    norm(m.r24),
    norm(m.r7d),
    norm(m.r1m5),
    norm(m.na30),
    norm(m.na14),
    norm(m.tr5),
    norm(m.tr1h),
    norm(m.vr5),
    norm(m.vr1h),
    norm(m.vol24),
    norm(m.trd24),
    norm(m.sp5),
    norm(m.sp5d),
    norm(m.spVol),
    norm(m.spVold),
    norm(m.fund),
    norm(m.oi1h),
    norm(m.oi4h),
  ].join('|');
}
