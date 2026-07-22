# Grid Smart Screener — Design

**Date:** 2026-07-22
**Status:** Draft, awaiting user review
**Author:** Claude (brainstorming session)

## Problem

The existing screeners (`Swing`, `Intraday`, `Pick`) share a common pattern: hand-picked thresholds on a small set of heuristics (ADX ≤ 25, Hurst < 0.45, ATR% ∈ [2, 8], etc.). These thresholds were tuned by intuition and may not generalise across regimes. A more principled approach — anchored in classical time-series statistics — would let us select grid-bottable symbols with a defensible, reproducible methodology.

## Goal

Add a fourth screener — **Grid Smart** — that picks symbols for grid trading using a statistically-grounded mean-reversion / grid-fitness model. Outputs a ranked list with score, direction (LONG/SHORT/NEUTRAL), grid bounds, and level count, plus an "Open in Grid Lab" button on each row that pre-fills Grid Lab with the proposed parameters.

## Non-Goals

- Backtest inside the screener itself (use Grid Lab for that).
- Persistent filter settings across sessions (in-memory only, like `Pick`).
- Scan history (like `Swing` has) — deferred to a later release.
- Cross-symbol optimisation (this screener evaluates each symbol independently).
- ML training on historical data (all logic is deterministic and parameter-free).

## Architecture

```
frontend/src/gridSmart.js               (new module, ~400 lines)
├── ouHalfLife(closes)                  → half-life in bars | null
├── garmanKlassVol(klines)              → σ per bar | null
├── varianceRatio(closes, k)            → VR(k) | null
├── adfTest(closes)                     → {gamma, stat} | null
├── linregSlope(closes, win)            → signed slope / σ_y | null
├── vwapBias(klines, win)               → (close − VWAP) / σ | null
├── scoreSmart(klines, klCtx)           → {mr, fit, dir, total, band, breakdown}
├── classifyDirection(row, universeScores) → {dir, confidence}
├── ouGridBounds(closes, klines)        → {lower, upper, step, levels}
├── computeSmartRow(sym, kl, klCtx)     → row | null
└── registerGridSmartScreener(deps)     → public registration fn

frontend/src/main.js                    (modified)
├── import registerGridSmartScreener
├── import computeSmartRow, buildGridLabPayload (already exported via gridBotScreeners)
├── openGridSmartScreener()             → toggles modal
└── registerGridSmartScreener({...})    → wires deps

frontend/test/grid-smart.test.mjs       (new, ≥20 tests)
```

`grid-shared.js` already provides `createKlineCache`, `escapeHtml`, `pruneLocalStoragePrefix`, `baseSymbol`, `passesMinVol`, `selectUniverse` — reused as-is.

## Statistical core (6 pure functions)

### `ouHalfLife(closes) → number | null`

Fit AR(1) on log-prices: `Δln(p_t) = α + θ·(ln(p_{t-1}) − μ_OLS) + ε_t`. Half-life = `ln(2) / −θ`. Returns `null` if `θ ≥ 0` (trending, no mean reversion) or `closes.length < 30`.

### `garmanKlassVol(klines) → number | null`

GK estimator using OHLC. Returns per-bar σ. Falls back to close-to-close std if OHLC are degenerate.

### `varianceRatio(closes, k=4) → number | null`

Lo-MacKinlay heteroskedasticity-robust VR: `VR(k) = Var(r_t^k) / (k · Var(r_t))`. `VR < 1` → mean-reverting, `VR > 1` → trending. `null` if `closes.length < k*3`.

### `adfTest(closes) → {gamma, stat} | null`

Augmented Dickey-Fuller with 1 lag on log-prices. Returns OLS estimate of γ (negative = stationary) and the test statistic. `null` if `closes.length < 30`.

### `linregSlope(closes, win=30) → number | null`

OLS slope of log-prices over last `win` bars, normalised by σ_y. Sign indicates direction; magnitude indicates strength in σ-units. `null` if `closes.length < win`.

### `vwapBias(klines, win=20) → number | null`

`(close − VWAP_{win}) / σ_{win}`. Positive → price above VWAP. `null` if `klines.length < win`.

## Scoring (0..13)

| Group | Max | Components |
|-------|-----|------------|
| **Mean-reversion quality** | 5 | Hurst ∈ [0.30, 0.50] → +2; `varianceRatio(4) < 0.7` → +2; OU half-life ∈ [10, 50] bars → +1 |
| **Grid fitness** | 5 | `gkVol / price ∈ [1%, 5%]` → +2; `vol24 / mcap > 0.05` → +2; spread proxy `(H-L)/C < 2%` → +1 |
| **Directional confidence** | 3 | `sign(γ_ADF) = sign(slope)` → +2; `Hurst > 0.55 ∧ slope ≠ 0` → +1 |

Bands: `total ≥ 10 → green`, `total ≥ 7 → yellow`, `total < 7 → red`. Thresholds align with the Swing/Intra bandFromScore() at `score = 7` and `score = 11` so UI conventions are consistent.

The `breakdown` object exposes `mr`, `fit`, `dir` sub-scores and per-component booleans/labels for the row-expansion tooltip.

## Direction (adaptive)

```
dirScore = sign(γ_ADF)
        + sign(slope)
        + (Hurst > 0.55 ? sign(slope) : 0)
        + sign(VWAP_bias)

// Computed only over the rows that pass the data-quality filters
// (≥ 30 bars, finite score); symbols with insufficient data are excluded.
threshold = median(|dirScore|)   over rows with finite dirScore
|dirScore| < threshold → NEUTRAL
else → LONG/SHORT
confidence = round(|dirScore| / 4 * 100)   // 0..100%
```

Adaptive threshold ensures roughly balanced 1/3 N : 1/3 L : 1/3 S in any regime — avoids "no NEUTRAL days" when the whole market trends.

## Grid bounds (OU formula)

```
μ      = exp(mean(log(closes)))
σ      = garmanKlassVol(klines)
T      = ouHalfLife(closes)
σ_T    = σ · √T
lower  = exp(ln(μ) − 1.5·σ_T)
upper  = exp(ln(μ) + 1.5·σ_T)
step   = σ · 0.5
levels = clamp(round((upper − lower) / step), 8, 30)
```

Bounds span ±1.5 σ over one half-life — a position would be expected to mean-revert over that horizon. Step size is half-bar volatility (empirically grids step tighter than daily ATR without overshooting).

## Universe & cache

- Universe: top 200 symbols by 24h quote volume (no hard `minVol` cut — Smart should evaluate thin coins too, the fitness score penalises them).
- Cache: `createKlineCache(batchKlines, 5 * 60 * 1000)` — 5 min TTL, holds last 200 bars per (symbol, TF).
- Confluence data: last 100 bars at the next-higher TF (`5m→15m`, `15m→1h`, `1h→4h`, `4h→1d`). Cached separately under a `klCtx` suffix.
- Single scan runtime: ~1.5–3 min for 200 symbols on 15m.

## UI (modal layout)

```
┌───────────────────────────────────────────────────────────────────┐
│  Grid Smart · OU-фильтр                                  [Закрыть]│
├───────────────────────────────────────────────────────────────────┤
│  TF [15m ▼]   Мин. score [8]  [↻ Обновить]                       │
│  Long ✓  Short ✓  Neutral ✓  Low conf (<60%) ☐                   │
│  Согласие с старшим TF ✓ показывать                              │
├───────────────────────────────────────────────────────────────────┤
│ Тикер  Score Dir    Конф  MR fit ΔH/L  1h↑↓  [📊]                │
│  BTC   12    LONG    88%   5  5   2.1%  ✓    [📊]                │
│  ETH   11    NEUTRAL 74%   4  4   3.0%  ⚠    [📊]                │
│  SOL    8    SHORT   62%   3  3   4.7%  ✓    [📊]                │
│  ...                                                              │
├───────────────────────────────────────────────────────────────────┤
│ Клик на строку → breakdown MR/fit/dir + метрики                   │
└───────────────────────────────────────────────────────────────────┘
```

### Columns

| Column | Source | Notes |
|--------|--------|-------|
| Тикер | `sym.replace('USDT','')` | clickable → `openFullscreenBySym` |
| Score | `scoreSmart.total` + band badge | coloured green/yellow/red |
| Dir | `classifyDirection().dir` | LONG green, SHORT red, NEUTRAL grey |
| Конф | `classifyDirection().confidence` (0..100) | `%` |
| MR | `breakdown.mr` (0..5) | mean-reversion sub-score |
| fit | `breakdown.fit` (0..5) | grid fitness sub-score |
| ΔH/L | `garmanKlassVol · 0.5` in % | per-bar grid step proxy |
| 1h↑↓ | confluence: ✓ if `sign(slope_work) == sign(slope_ctx)`, else ⚠, — if no ctx data | tooltip: "старший TF согласен / против" |
| 📊 | button | calls `openGridLabFromRow(row, 'smart', closeSelf)` |

### Sort

Default: `score DESC, confidence DESC`. Header click toggles `DESC/ASC` on each column (same UX as Swing).

### Direction filter

Four checkboxes in the toolbar — independent of sort. Default: all on except `Low conf`.

## Open in Grid Lab

Same flow as Swing/Intra/Pick. New entry in `buildGridLabPayload`:

```js
case 'smart':
  lo = row.gridBounds?.lower;
  hi = row.gridBounds?.upper;
  stepAbs = row.gridBounds?.step;
  levels = row.gridBounds?.levels;
  break;
```

Default TF: `15m`. `closeSelf` callback removes the screener modal (same UX as the others).

## Edge cases

| Case | Behaviour |
|------|-----------|
| < 30 bars on working TF | row → `null`, symbol skipped |
| OU half-life > 200 bars | direction still classified but the MR sub-score loses the half-life component (only +2 from Hurst + VR; max 4 instead of 5) |
| OU half-life = null (trending) | MR sub-score loses both the half-life and Hurst-bonus components (only the VR component may still contribute; max 2 instead of 5) |
| `mcap` missing or `undefined` from `mcapMap.get(...)` | skip the `vol/mcap` component (counts as 0) |
| Universe empty (0 symbols after filters) | diag message "проверь фильтр объёма" + empty table |
| API rate-limit on Binance | diag "rate limit X/Y", retry after 60s, partial rows still rendered |
| Existing Swing rows are NOT in Smart | expected — Smart is stricter, complements Swing |
| Cache hit (same scan within 5 min) | scan completes in ~3s, no API calls |

## Testing strategy

### Unit tests (`frontend/test/grid-smart.test.mjs`)

Synthetic deterministic series — no API. ≥20 tests:

| Function | Tests |
|----------|-------|
| `ouHalfLife` | trending → null; mean-reverting AR(1) → known half-life ±20%; < 30 → null |
| `garmanKlassVol` | known σ → within 5%; empty → null; degenerate OHLC falls back to close-to-close |
| `varianceRatio` | trending VR>1.1; mean-rev VR<0.9; random walk VR∈[0.85, 1.15]; short → null |
| `adfTest` | stationary → γ<−0.1; unit root → |γ|<0.05; < 30 → null |
| `linregSlope` | straight line → +1; flat → 0; declining → −1; < win → null |
| `vwapBias` | close above VWAP → positive; below → negative; < win → null |
| `scoreSmart` | 3 groups summed; bands correct; breakdown has 3 keys with sub-pts |
| `classifyDirection` | adaptive threshold gives LONG/SHORT/NEUTRAL; confidence ∈ [0, 100] |
| `ouGridBounds` | μ centred; σ_T grows with T; levels ∈ [8, 30]; step ≈ 0.5σ |

### Build verification

- `node --test` → ≥ 73 tests green (current 53 + new ≥ 20).
- `npx vite build` → no errors.

### Manual smoke

1. Open the new modal — universe loads.
2. Sort by score — top 3 should be plausible grid candidates.
3. Click 📊 on top row — Grid Lab opens with `lower/upper/levels` filled and `tf='15m'`.
4. Switch TF from 15m → 1h → table re-renders within ~10s (cache hit).

## Rollout

| Step | PR | Est. size |
|------|-----|-----------|
| 1. `gridSmart.js` — pure functions only | `feat: smart-screener-stats` | ~250 lines |
| 2. `grid-smart.test.mjs` — unit tests | same PR | ~200 lines |
| 3. `registerGridSmartScreener` — modal + scan + render | `feat: smart-screener-ui` | ~250 lines |
| 4. `main.js` — wire deps + add `openGridSmartScreener` + toolbar button | same PR | ~30 lines |
| 5. `buildGridLabPayload` — add `'smart'` case | same PR | ~10 lines |
| 6. Manual smoke test | — | — |

Total: ~750 lines new code, ~200 test lines. Estimated time: 2–3 hours.
