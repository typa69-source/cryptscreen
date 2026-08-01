// Tests for rowSignature — the cheap data fingerprint that lets
// updateScreenerRow skip the per-cell DOM loop when nothing relevant
// changed since the last update.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowSignature } from '../src/screener-row-sig.js'

test('rowSignature: equal data → equal signature', () => {
  const a = {
    sym: 'BTCUSDT', price: 65000, ch24: 2.5, cday: 1.0, rtd: 0.3, r24: 2.5,
    r7d: 5.0, r1m5: 10, na30: 0.4, na14: 0.6, tr5: 1.2, tr1h: 0.8,
    vr5: 1.1, vr1h: 0.9, vol24: 1e9, trd24: 5e8, sp5: 0.5, sp5d: 'M1,20 L99,20',
    spVol: 0.3, spVold: 'M0,40 L100,0', fund: 0.01, oi1h: 0.5, oi4h: 1.2,
  }
  const b = { ...a }
  assert.equal(rowSignature(a), rowSignature(b))
})

test('rowSignature: price change → different signature', () => {
  const base = {
    sym: 'ETHUSDT', price: 3500, ch24: 1.5, cday: 0.5, rtd: 0.1, r24: 1.5,
    r7d: 3.0, r1m5: 8, na30: 0.5, na14: 0.7, tr5: 0.9, tr1h: 0.6,
    vr5: 1.0, vr1h: 0.8, vol24: 5e8, trd24: 3e8, sp5: 0.4, sp5d: 'M1,20 L99,20',
    spVol: 0.2, spVold: 'M0,40 L100,0', fund: 0.005, oi1h: 0.3, oi4h: 0.9,
  }
  const changed = { ...base, price: 3500.01 }
  assert.notEqual(rowSignature(base), rowSignature(changed))
})

test('rowSignature: different sym → different sig', () => {
  const a = { sym: 'BTCUSDT', price: 100 }
  const b = { sym: 'ETHUSDT', price: 100 }
  assert.notEqual(rowSignature(a), rowSignature(b))
})

test('rowSignature: NaN is treated as missing (stable)', () => {
  // tan() can produce NaN briefly during cold-start; must not look like
  // a value change that forces re-render.
  const a = { sym: 'ADAUSDT', price: 0.5, na30: NaN }
  const b = { sym: 'ADAUSDT', price: 0.5, na30: undefined }
  assert.equal(rowSignature(a), rowSignature(b))
})

test('rowSignature: null/missing input returns empty string', () => {
  assert.equal(rowSignature(null), '')
  assert.equal(rowSignature(undefined), '')
  assert.equal(rowSignature({}), '')
})

test('rowSignature: spark path change is detected', () => {
  // sp5d is the SVG path string — must trigger re-render when it changes.
  const a = { sym: 'SOLUSDT', price: 100, sp5d: 'M1,20 L99,20' }
  const b = { sym: 'SOLUSDT', price: 100, sp5d: 'M1,30 L99,10' }
  assert.notEqual(rowSignature(a), rowSignature(b))
})
