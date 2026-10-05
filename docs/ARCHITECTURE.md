# Architecture Deep Dive

## System Overview

The Crypto Advanced Signal Scanner is a **zero-database, serverless** application that performs real-time quantitative market analysis using a deterministic, rule-based engine.

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Scanner     │  │ Coin         │  │ Backtester          │ │
│  │ Table       │  │ Analyzer     │  │ Dashboard           │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘ │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   localStorage (Watchlist, History)           │
└──────────────────────────┼───────────────────────────────────┘
                           │ HTTP/REST
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  API LAYER (Next.js / Cloudflare Worker)      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  /api/health  /api/scanner  /api/analyze  /api/...  │    │
│  └──────────────────────────┬───────────────────────────┘    │
│                             │                                │
│  ┌──────────────────────────┴───────────────────────────┐    │
│  │              Provider Manager                         │    │
│  │  ┌─────────────────┐    ┌─────────────────────────┐  │    │
│  │  │ BinanceProvider │    │ CoinGeckoProvider       │  │    │
│  │  │ (Primary)       │    │ (Fallback/Metadata)     │  │    │
│  │  └────────┬────────┘    └────────────┬────────────┘  │    │
│  └───────────┼──────────────────────────┼───────────────┘    │
└──────────────┼──────────────────────────┼────────────────────┘
               │                          │
    ┌──────────┴──────────┐    ┌──────────┴──────────┐
    │ Binance Public API  │    │ CoinGecko API       │
    │ Spot + Futures      │    │ Metadata & OHLC     │
    └─────────────────────┘    └─────────────────────┘
```

---

## Analysis Pipeline

Every analysis request follows this exact pipeline:

```
Raw Klines (from Binance)
         │
         ▼
┌─────────────────────────┐
│ 1. Pivot Detection      │  Confirmed swings (no look-ahead)
├─────────────────────────┤
│ 2. Liquidity Levels     │  EQH, EQL, PDH, PDL, session highs/lows
├─────────────────────────┤
│ 3. Sweep Detection      │  SSL, BSL with wick/reclaim/volume
├─────────────────────────┤
│ 4. Market Structure     │  HH/HL/LH/LL, BOS, MSS, FVG, OB
├─────────────────────────┤
│ 5. Session Liquidity    │  Asian/London/NY ranges & Judas Swings
├─────────────────────────┤
│ 6. Volume Analysis      │  RVOL, spikes, taker imbalance, VP
├─────────────────────────┤
│ 7. Derivatives Enrich   │  OI trend, funding, L/S ratio
├─────────────────────────┤
│ 8. Market Regime        │  Trending/Ranging/HV/LV/Expansion
├─────────────────────────┤
│ 9. Multi-Timeframe      │  1D→4H→1H→15m→5m→1m alignment
├─────────────────────────┤
│ 10. Layer 3 Context     │  3-layer synthesis
├─────────────────────────┤
│ 11. Signal Scoring      │  Weighted 0-100 + trade plan
└─────────────────────────┘
         │
         ▼
    JSON Response
```

---

## Zero Look-Ahead Bias Guarantee

### The Problem
Traditional technical analysis often uses future data (e.g., a pivot at bar $i$ is only valid if bars $i+1$ and $i+2$ have lower highs, but those bars don't exist yet at bar $i$).

### Our Solution
```typescript
// pivots.ts
// A swing high at index i requires:
//   - leftBars bars before it with LOWER highs
//   - rightBars bars after it with LOWER highs
// The pivot is ONLY confirmed at index i + rightBars

function findConfirmedPivots(klines, leftBars = 3, rightBars = 2, maxIndex) {
  // maxIndex ensures we never look beyond available confirmed data
  const limit = maxIndex ?? klines.length - 1;
  for (let i = leftBars; i <= limit - rightBars; i++) {
    // ... validation
  }
}
```

In real-time analysis, the `maxIndex` parameter ensures pivots are only evaluated against fully closed candles.

---

## Signal Scoring Model

### Component Weights (configurable via `/api/config`)

| Component           | Default Weight | Source                        |
| :------------------ | :------------- | :---------------------------- |
| Liquidity           | 20%            | Sweeps, EQH/EQL, PDH/PDL     |
| Market Structure    | 20%            | BOS, MSS, displacement, trend |
| Multi-Timeframe     | 20%            | 1D→1m alignment score         |
| Session Liquidity   | 10%            | Judas Swings, session sweeps   |
| Volume              | 10%            | RVOL, spike, taker imbalance   |
| Derivatives         | 10%            | OI trend, funding, L/S ratio   |
| Advanced Layer 3    | 10%            | Cross-layer context synthesis  |

### Classification Thresholds

| Score Range | Classification |
| :---------- | :------------- |
| 0–49        | NO SIGNAL      |
| 50–64       | WEAK           |
| 65–74       | MODERATE       |
| 75–84       | STRONG         |
| 85–100      | VERY STRONG    |

---

## Trade Plan Generation

### Entry Zone
Priority order for entry identification:
1. **Fair Value Gap (FVG)**: Unfilled bullish/bearish FVG midpoint
2. **Order Block (OB)**: Unmitigated OB zone
3. **Liquidity Reclaim**: Reclaimed level from sweep
4. **Structure Retest**: Price retesting broken structure

### Stop Loss (Structural Invalidation)
- Anchored to the sweep extreme or the recent structural swing, minus a
  0.35 × ATR(14) buffer so ordinary noise does not take the trade out
- Floored at 1.2 × ATR from the entry (never a fixed percentage)
- Capped: if the structural stop is more than `MAX_RISK_PERCENT` (8%) away,
  the trade plan is refused and a Persian warning is attached instead

### Take Profits — Draw on Liquidity
Targets are read from the live liquidity map rather than hardcoded multiples:

1. The map is filtered to levels that are **on the correct side** of the entry,
   **not yet swept**, and orders them by distance.
2. TP1 must clear `MIN_TP1_R_MULTIPLE` (1.2× risk) — otherwise the nearest
   qualifying level is used; TP2/TP3 continue from there.
3. Every target reports its own source (`targetSources`): EQH/EQL, PDH/PDL,
   previous-week levels, session extremes, value-area edges (VAH/VAL/POC), or
   `R_MULTIPLE` when no qualifying level exists.
4. The ladder is clamped to be strictly monotonic (`TP1 < TP2 < TP3` for longs),
   so a fallback target can never sit inside an earlier one.

| Component | Meaning |
| :-------- | :------ |
| `targetSources` | per-target origin from the liquidity map |
| `stopLossBasis` | `SWEEP_EXTREME` / `STRUCTURE` / `ATR` / `FALLBACK` |
| `atrPercent` | ATR(14) at signal time, for position sizing |

---

## Data Flow & Caching

### Rate Limit Handling & Resilience
```
Request → Cache Check (8s TTL; simulated payloads cached 3s)
    │
    ├── Cache HIT            → Return cached data (live or simulated)
    ├── In-flight duplicate  → Join the existing request (coalescing)
    │
    └── Cache MISS → Try each Binance host (breakers are skipped)
                         │
                         ├── 429/418 → Exponential backoff (800 ms × 2^attempt)
                         │              → Alternate Binance mirror
                         │
                         ├── Success → Cache + Return (counts as a live fetch)
                         │
                         └── All hosts failed / breakers open
                                       │
                                       └── Deterministic simulation engine
                                           (reproducible, no network, provenance
                                            reported via dataSource/dataQuality)
```

Circuit breakers open after 2 consecutive failures per host and skip it for 25 s;
timeouts are 4 s per attempt with a single retry (the previous 3 hosts × 3
attempts × 6 s could make one analysis take tens of seconds).

### Client-facing rate limits
Every route applies an in-memory token bucket per IP (scanner 40/min, analyze
60/min, signals 30/min, backtest 12/min, market data 90/min …) and answers
`429` with `Retry-After` when the budget is exhausted. No Redis, no database.

### Concurrency Control
The scanner processes symbols in batches of 4–5 concurrent requests using `Promise.all` chunking:
```typescript
for (let i = 0; i < symbols.length; i += concurrency) {
  const chunk = symbols.slice(i, i + concurrency);
  const results = await Promise.all(chunk.map(fetchSymbol));
}
```

---

## Explainable Innovations

| Feature | Where | Why it matters |
| :------ | :---- | :------------- |
| Market Pulse | scanner tab (`computeMarketPulse`) | Weighted breadth (LONG vs SHORT score mass), average Wilder ADX, **median** ATR% and relative high-volatility share → one honest macro reading per scan |
| Signal Lifecycle | scanner tab (`updateSignalLifecycle`) | Tags every setup تازه / پایدار ×n / برگشتِ جهت / بازگشت with age and score delta; distinguishes a fresh setup from a stale one that never changes |
| Liquidity Magnet Ladder | analyzer tab (`selectLiquidityMagnets`) | Nearest untapped levels above/below price with a `strength ÷ (1 + distance%)` draw meter — the same map that feeds trade-plan targets |

All three are pure functions (unit-tested in `tests/features.test.ts`) and run
entirely in the browser; nothing is persisted server-side.

---

## Cloudflare Worker Architecture

The standalone Cloudflare Worker (`src/worker.ts`) uses **Hono** as the HTTP framework and supports:

- `fetch` handler for HTTP requests
- `scheduled` handler for Cron Trigger (`* * * * *`)
- CORS middleware for cross-origin requests

### Cron Flow
```
Every minute:
  1. Fetch top 10 symbols from Binance
  2. Run scanner with 4 concurrent workers
  3. Log summary (longs, shorts, no-signal counts)
```

---

## Extending the System

### Adding a New Data Provider

1. Implement the `MarketDataProvider` interface:
```typescript
class BybitProvider implements MarketDataProvider {
  readonly name = 'bybit';
  async getKlines(symbol, timeframe, limit) { /* ... */ }
  async getTicker24h(symbol) { /* ... */ }
  async getDerivativesData(symbol) { /* ... */ }
  async getMetadata(symbol) { /* ... */ }
  async getTopSymbols(count) { /* ... */ }
}
```

2. Register in `ProviderManager`:
```typescript
this.providers.set('bybit', new BybitProvider());
```

### Adding a New Analysis Layer

1. Create `src/analysis/yourEngine.ts`
2. Export an analysis function returning typed results
3. Integrate in `src/analysis/engine.ts`
4. Add component weight in `src/types/market.ts` → `SignalWeights`
5. Wire into `src/analysis/signal.ts` scoring

---

## Technology Stack

| Layer         | Technology                          | Purpose                         |
| :------------ | :---------------------------------- | :------------------------------ |
| Frontend      | React 19 + Next.js 16 App Router    | Full-stack framework            |
| Styling       | Tailwind CSS 4                      | Utility-first responsive UI     |
| Charts        | Lightweight Charts 5                | Candlestick + overlay rendering |
| Icons         | Lucide React                        | Consistent icon system          |
| API           | Next.js Route Handlers + Hono       | REST API layer                  |
| Worker        | Cloudflare Workers + Hono           | Serverless edge computing       |
| Data          | Binance Public API + CoinGecko      | Market data feeds               |
| Language      | TypeScript (strict mode)            | Type safety throughout          |
| Testing       | tsx + custom runner                 | Unit & integration tests        |
| CI/CD         | GitHub Actions                      | Lint → Test → Build → Deploy    |
| Security      | CodeQL                              | Automated vulnerability scanning|