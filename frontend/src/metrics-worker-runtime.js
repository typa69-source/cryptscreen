// ═══════════════════════════════════════════════════════════════
//  Metrics worker wrapper
// ═══════════════════════════════════════════════════════════════
//
// Loads metrics-worker.js in a real Web Worker and falls back to
// running the computation on the main thread if the worker can't
// start (old browser, file:// origin, etc).
//
// Public API (single function):
//   const result = await runMetrics(payload)
// where payload is the same shape calcAll() in main.js needs:
//   { syms, k5m, k1h, k1m, tk, fundRates, oiDelta, prevMx, dayStartMs }
//
// Returns: { btcR, mx } — same shape calcAll currently produces.
//
// Why a wrapper instead of calling the worker directly:
//   - keeps main.js decoupled from worker lifecycle
//   - falls back transparently to a main-thread call if Worker fails
//   - gives us a single place to add batching/cancellation later

let _worker = null;
let _nextId = 1;
const _pending = new Map(); // id -> { resolve, reject }

function _ensureWorker() {
  if (_worker !== null) return _worker;
  if (typeof Worker === 'undefined') return null;
  try {
    // Use Vite's `new Worker(url, { type: 'module' })` so we can
    // share ES module syntax. Vite resolves the URL at build time.
    _worker = new Worker(new URL('./metrics-worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = (e) => {
      const { id, result, error } = e.data || {};
      const slot = _pending.get(id);
      if (!slot) return;
      _pending.delete(id);
      if (error) slot.reject(new Error(error));
      else slot.resolve(result);
    };
    _worker.onerror = (e) => {
      // Any pending requests fail; we then drop the worker so the
      // next call falls back to main thread.
      const err = new Error(e.message || 'worker_error');
      for (const slot of _pending.values()) slot.reject(err);
      _pending.clear();
      try { _worker.terminate(); } catch {}
      _worker = null;
    };
    return _worker;
  } catch {
    return null;
  }
}

// No in-process fallback: callers (main.js) catch 'worker_unavailable'
// and run their existing synchronous calcAll() instead.

export async function runMetrics(payload) {
  const w = _ensureWorker();
  if (!w) {
    throw new Error('worker_unavailable');
  }
  const id = _nextId++;
  return new Promise((resolve, reject) => {
    // Defensive timeout: if the worker hangs, we don't want to block
    // the UI forever. Caller can fall back to the synchronous path.
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        try { w.terminate(); } catch {}
        _worker = null;
        reject(new Error('worker_timeout_10s'));
      }
    }, 10000);
    _pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    w.postMessage(Object.assign({ id }, payload));
  });
}

// True if we currently have a healthy worker. Useful for telemetry.
export function workerAvailable() {
  return _worker !== null;
}
