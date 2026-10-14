/**
 * RadarScan — orchestrates the pump/dump detector (radar.js) across the
 * symbol universe. Lives between the pure detector and the UI:
 *  - fetches klines per symbol (injected fetcher — testable),
 *  - runs detection on the live bar + confirmation,
 *  - keeps a rolling event log with outcomes measured on later scans
 *    (events are only fully measurable +15m/+1h/+4h later),
 *  - aggregates hit-rates per horizon.
 *
 * The scan state is meant to be persisted (localStorage) so hit-rates
 * survive reloads and accumulate over days — the whole point of the
 * "measure the detector" loop.
 */

import {
  detectRadarEvent,
  confirmRadarEvent,
  radarEventsForSeries,
  measureRadarOutcome,
  aggregateHitRates,
  ROBUST_Z_THRESH,
} from './radar.js';

const LIVE_BARS = 3; // bars to look back for a live event (fresh spike)

export class RadarScan {
  /**
   * opts: { fetcher: { fetchKlines(sym, tf, limit) → kline[] },
   *         thresh, confirmBars, retraceFrac, minVolRatio,
   *         tf, maxEvents }
   */
  constructor(opts = {}) {
    this.fetcher = opts.fetcher;
    this.thresh = opts.thresh ?? ROBUST_Z_THRESH;
    this.confirmBars = opts.confirmBars ?? 3;
    this.retraceFrac = opts.retraceFrac ?? 0.5;
    this.minVolRatio = opts.minVolRatio ?? 1.0;
    this.tf = opts.tf ?? '5m';
    this.maxEvents = opts.maxEvents ?? 500;
    // Rolling log: { sym, kind, idx→t (bar time), z, ret, price, volRatio,
    //                outcomes, detectedAt }
    this.events = [];
    this.lastScanAt = 0;
    this.scanned = 0;
  }

  /** Scan a list of symbols. Returns { events, newEvents } (all detections,
   *  incl. pending — see `pending` flag; confirmation matures later). */
  async scanAll(symbols) {
    if (!Array.isArray(symbols) || !symbols.length) {
      return { events: this.events, newEvents: [] };
    }
    const newEvents = [];
    for (const sym of symbols) {
      let kl = null;
      try {
        kl = await this.fetcher.fetchKlines(sym, this.tf, 400);
      } catch (e) { /* one dead symbol must not kill the scan */ }
      if (!Array.isArray(kl) || kl.length < 60) continue;
      this.scanned++;

      // LIVE detection: fresh spike on the last bar. Confirmation bars do
      // not EXIST yet — the event is logged as pending and matures on
      // subsequent scans (confirm/outcome backfill below).
      const ev = detectRadarEvent(kl, {
        thresh: this.thresh,
        minVolRatio: this.minVolRatio,
      });
      if (ev) {
        const t = kl[ev.idx]?.t ?? 0;
        const dup = this.events.some((e) => e.sym === sym && e.t === t);
        if (!dup) {
          const rec = {
            sym,
            kind: ev.kind,
            t,
            z: +ev.z.toFixed(2),
            ret: +ev.ret.toFixed(2),
            price: ev.price,
            volRatio: ev.volRatio,
            outcomes: { '+15m': null, '+1h': null, '+4h': null },
            detectedAt: Date.now(),
            pending: true,
            matured: false,
          };
          this.events.push(rec);
          newEvents.push(rec);
        }
      }

      // BACKFILL: confirmation + outcomes for this symbol's pending events.
      this._backfillOutcomes(sym, kl);
    }
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    this.lastScanAt = Date.now();
    return { events: this.events, newEvents };
  }

  /** Mature pending events of this symbol:
   *  1) once enough bars exist after the spike, confirmation is checked
   *     (hold semantics); a rejected spike flips the event to `rejected`,
   *  2) outcomes are measured when their horizon bars arrive;
   *     +4h present → matured. */
  _backfillOutcomes(sym, kl) {
    const pend = this.events.filter((e) => e.sym === sym && !e.matured);
    if (!pend.length) return;
    const byTime = new Map(kl.map((k, i) => [k.t, i]));
    for (const e of pend) {
      const idx = byTime.get(e.t);
      if (idx == null) continue;
      // confirmation check (needs confirmBars bars after idx)
      if (e.pending) {
        const conf = confirmRadarEvent(kl, { idx }, {
          confirmBars: this.confirmBars,
          retraceFrac: this.retraceFrac,
        });
        if (kl.length - 1 - idx >= this.confirmBars) {
          // enough bars to decide: confirmed or rejected
          if (conf.confirmed) {
            e.pending = false;
            e.confirmed = true;
          } else {
            e.pending = false;
            e.confirmed = false;
          }
        }
      }
      // outcomes
      const out = measureRadarOutcome(kl, { idx });
      for (const h of ['+15m', '+1h', '+4h']) {
        if (e.outcomes[h] == null && out[h] != null) e.outcomes[h] = out[h];
      }
      if (e.outcomes['+4h'] != null) e.matured = true;
    }
  }

  /** Hit-rate aggregation over the event log (wins = outcome > 0). */
  hitRates() {
    return aggregateHitRates(this.events);
  }

  /** Serializable state (for localStorage). */
  toJSON() {
    return { events: this.events.slice(-this.maxEvents), lastScanAt: this.lastScanAt, scanned: this.scanned };
  }
  static fromJSON(json, opts = {}) {
    const rs = new RadarScan(opts);
    if (json && Array.isArray(json.events)) rs.events = json.events;
    if (json && json.lastScanAt) rs.lastScanAt = json.lastScanAt;
    if (json && json.scanned) rs.scanned = json.scanned;
    return rs;
  }
}

/** UI helper: is the given bar-time within the last N minutes? */
export function isFreshEvent(t, nowMs = Date.now(), maxAgeMs = 15 * 60000) {
  return typeof t === 'number' && nowMs - t * 1000 <= maxAgeMs;
}
