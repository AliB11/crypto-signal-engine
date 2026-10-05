# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] – 2026-10-05

بازبینی ۳۶۰ درجه و لایه‌به‌لایهٔ موتور، رفع اشکالات داده/تحلیل/API و افزودن سه قابلیت نوآورانه.
(گزارش کامل: `docs/DEBUG-REPORT.md`)

### Fixed — Data Layer
- **Unified deterministic simulation curve**: klines, the 24h ticker and every timeframe of the same symbol now sample one time-based price function, so offline data is self-consistent and reproducible (`src/providers/simulation.ts`).
- **Honest data status**: `getDataStatus()` reflects the most recently served source instead of latching to "simulated" forever after the first failure; `/api/health` reports `healthy`/`degraded`, open breakers, last error and counters.
- **Resilience**: 4s request timeout, single retry, per-host circuit breaker (2 failures → 25s), in-flight request coalescing, and a 3s cache for simulated payloads (previously every fallback re-simulated and `cacheHits` stayed 0).
- **Cache accounting**: `liveCacheHits` / `simulatedCacheHits` are exposed and counted in `dataQuality`, so cache-served responses are no longer mislabelled as live.
- **Top symbols**: fetched from the real ticker universe with stablecoin and leveraged-token filtering (JUPUSDT-style false positives avoided); graceful default list when offline.
- **Provider chain documented honestly**: removed the never-used CoinGecko "market data fallback" instance; CoinGecko is used for non-blocking market-cap enrichment behind its own breaker.

### Fixed — Analysis Engines
- **No look-ahead liquidity levels**: every level now carries `confirmedTimestamp`; the sweep engine ignores levels that were not yet structurally confirmed at the evaluated candle.
- **Session liquidity on a sub-timeframe**: sessions are always computed on 1m/5m/15m data (previously the requested 4h/1d timeframe, where a session holds almost no candles); session precedence fixed (New York → London → Asian) with `activeSessions` and New York key levels added.
- **Wilder ADX(14)** with +DI/−DI dominance and EMA20/50 slope replaces the previous approximation; the regime engine classifies trends from them.
- **Value area** (VAH/VAL) expanded from POC to cover 70% of volume; tick-flow honesty flag `hasTickFlowData`.

### Fixed — Signal & Backtest
- **Context vs confidence**: `score` now caps at `MIN_SIGNAL_SCORE − 1` when there is no directional setup (previously rows could read "NO_SIGNAL" with a score of 81); the raw context quality remains available as `contextScore` and is shown separately in the UI.
- **Quality gate**: directional setups below the score threshold no longer ship a trade plan.
- **Draw-on-Liquidity targets**: TP1/TP2/TP3 come from the liquidity map (EQH/EQL, PDH/PDL, weekly/session levels, value-area edges) with per-target `targetSources`, `stopLossBasis` and `atrPercent`; the ladder is guaranteed monotonic and the first target clears 1.2R.
- **Risk cap**: plans whose structural stop exceeds `MAX_RISK_PERCENT` (8%) are refused with an explanatory warning.
- **Simulated derivatives are excluded from scoring** (neutral component, weight redistributed) so fabricated OI trends cannot inflate confidence; the backtest already did this and now also derives realized RR from the actual plan levels.
- **Annualisation**: Sharpe/Sortino scale with `sqrt(periodsPerYear / avgHoldCandles)`; resampled MTF data in the backtest is built strictly from the visible window.

### Added — API & Platform
- Shared validation/hardening helpers (`src/lib/http.ts`): symbol sanitisation, timeframe and numeric bounds, weight parsing, in-memory token-bucket rate limiting per IP with `429` + `Retry-After`, and consistent error payloads.
- Single source of truth for engine configuration (`src/config/engine.ts`) backing `/api/config`.
- Response provenance on every analysis/scanner payload: `dataSource`, `dataQuality`, `durationMs`, per-symbol `errors`.
- 10 new regression tests (19 total): deterministic simulation, rescaling, risk metrics, API validation, rate limiter, target ladder, liquidity-mapped targets, confirmation-window look-ahead, session key-level sweeps, PWH/PWL, Wilder ADX, volume transparency.

### Added — Innovative Features
- **Market Pulse (نبض کلان بازار)**: weighted breadth, average ADX, median ATR%, relative volatility and dominant regime aggregated from the scan (`src/lib/market-pulse.ts`, `MarketPulsePanel`).
- **Signal Lifecycle (چرخه عمر سیگنال)**: every setup tagged تازه / پایدار ×n / برگشتِ جهت / بازگشت with age and score delta, persisted in `localStorage` (capped, zero server storage) — `src/lib/signal-lifecycle.ts`.
- **Liquidity Magnet Ladder (نردبان مغناطیس نقدینگی)**: nearest untapped levels above/below price with a `strength ÷ (1 + distance%)` draw meter (`src/lib/liquidity-magnets.ts`, `LiquidityMagnetLadder`).
- Backtest assumption disclosure panel and data-source transparency in the analyzer/scanner.

---

## [1.0.0] – 2025-01-15

### Added

#### Core Analysis Engines
- **Pivot Detection Engine** (`src/analysis/pivots.ts`): Confirmed swing high/low identification with zero look-ahead bias (confirmation only at `i + rightBars` after candle close).
- **Liquidity Engine** (`src/analysis/liquidity.ts`): Detection of Equal Highs/Lows (EQH/EQL), Previous Day/Week Highs/Lows (PDH/PDL, PWH/PWL), and swing point liquidity levels.
- **Sweep Engine** (`src/analysis/sweeps.ts`): Sell-side and buy-side liquidity sweep detection with configurable penetration thresholds, wick-to-body ratio analysis, and reclaim confirmation.
- **Market Structure Engine** (`src/analysis/structure.ts`): HH/HL/LH/LL classification, BOS (Break of Structure), CHoCH/MSS (Market Structure Shift), Fair Value Gap (FVG) detection, and Order Block identification with mitigation tracking.
- **Session Liquidity Engine** (`src/analysis/sessions.ts`): Asian/London/New York session decomposition, Judas Swing detection (London sweeping Asian extremes), and NY Reversal identification.
- **Volume Engine** (`src/analysis/volume.ts`): Relative Volume (RVOL), volume spikes, taker buy/sell imbalance, and Volume Profile calculation (POC, VAH, VAL, HVN, LVN).
- **Derivatives Engine** (`src/analysis/derivatives.ts`): Open Interest trend enrichment, funding rate classification, and Long/Short ratio positioning analysis.
- **Market Regime Engine** (`src/analysis/regime.ts`): Trending/Ranging/High-Volatility/Contraction regime classification using ATR, Bollinger Band Width, and directional momentum.
- **Multi-Timeframe Engine** (`src/analysis/mtf.ts`): Top-down analysis across 1D → 4H → 1H → 15m → 5m → 1m with alignment scoring and confluence description.
- **Advanced Liquidity Layer 3** (`src/analysis/layer3.ts`): Three-layer hierarchical context analysis combining basic liquidity, structural liquidity, and advanced contextual synthesis.
- **Signal Engine** (`src/analysis/signal.ts`): Context-aware signal scoring (0–100), directional classification (LONG/SHORT/NO_SIGNAL), configurable weighted components, entry zone calculation (FVG/OB/Liquidity Reclaim), structural stop loss, multi-target take profits (TP1/TP2/TP3), and risk/reward ratio.
- **Scanner** (`src/analysis/scanner.ts`): Controlled-concurrency symbol scanner for Top 10/25/50 or custom lists.

#### Backtesting
- **Backtest Engine** (`src/backtest/engine.ts`): Historical simulation with no look-ahead bias, step-by-step candle processing, and exit logic (SL/TP1/TP2/Timeout).
- **Metrics Calculator** (`src/backtest/metrics.ts`): Win Rate, Profit Factor, Expectancy, Max Drawdown, Sharpe Ratio, Sortino Ratio, and equity curve generation.
- **Walk-Forward Validation**: 60% Training / 20% Validation / 20% Out-of-Sample split with overfit detection.
- **False Signal Analysis** (`src/backtest/falseSignals.ts`): Root-cause breakdown of losing trades (liquidity failures, false breakouts, weak displacement, HTF conflict, volume failure, funding squeeze).

#### Data Providers
- **Binance Provider** (`src/providers/BinanceProvider.ts`): Primary data source using public Spot and Futures APIs with exponential backoff, rate limit handling, and in-memory caching.
- **CoinGecko Provider** (`src/providers/CoinGeckoProvider.ts`): Fallback provider for metadata, market cap, and rank.
- **Provider Manager** (`src/providers/index.ts`): Abstract `MarketDataProvider` interface for future extensibility (Bybit, OKX, Coinbase).

#### API Endpoints
- `GET /api/health` – Service health status
- `GET /api/market` – 24h ticker and metadata
- `GET /api/analyze` – Full multi-timeframe Layer 3 analysis
- `GET /api/signals` – Directional signal generation
- `GET /api/scanner` – Concurrency-controlled market scanner
- `GET /api/liquidity` – Liquidity map with sweeps
- `GET /api/structure` – Structure events, FVGs, OBs
- `GET /api/derivatives` – OI, Funding, Long/Short ratios
- `GET /api/config` – Engine configuration and weights
- `POST /api/backtest` – Historical backtest simulation

#### Frontend Dashboard
- **Scanner Table** (`ScannerTable.tsx`): Real-time scan results with sort, filter, search, tier switching, and timeframe selection.
- **Coin Analyzer** (`CoinAnalyzer.tsx`): Deep single-asset analysis view with Layer 3 breakdown, session cards, derivatives panel, and MTF confluence matrix.
- **TradingView Chart** (`TradingViewChart.tsx`): Interactive candlestick chart with overlay controls for Liquidity, Structure, and Trade Plan layers.
- **Backtester Dashboard** (`BacktestDashboard.tsx`): Interactive backtest configuration, KPI cards, equity curve visualization, walk-forward table, and failure mode breakdown.
- **Signal History** (`SignalHistory.tsx`): Browser-local watchlist and signal snapshot persistence using `localStorage`.
- **Settings Modal** (`SettingsModal.tsx`): Real-time signal weight tuning, sound alert toggle, and risk disclosure.
- **Header** (`Header.tsx`): Navigation tabs, 60-second auto-scan countdown, manual refresh, and settings access.

#### Cloudflare Worker
- **Worker Entrypoint** (`src/worker.ts`): Standalone Hono-based Cloudflare Worker with all API endpoints and minute-by-minute Cron Trigger (`* * * * *`).
- **Wrangler Configuration** (`wrangler.toml`): Worker name, cron schedule, and environment variables.

#### Infrastructure
- **Next.js App Router**: Full-stack framework with API routes and static generation.
- **Tailwind CSS 4**: Utility-first styling throughout the dashboard.
- **TypeScript**: Strict mode with comprehensive type definitions (`src/types/market.ts`).
- **Zero Database**: All computation performed in-memory from live API feeds.

#### Documentation & GitHub
- **README.md**: Architecture overview, API reference, deployment guide, and disclaimer.
- **CONTRIBUTING.md**: Development workflow, coding standards, commit conventions, and PR process.
- **CHANGELOG.md**: Version history (this file).
- **LICENSE**: MIT License.
- **GitHub Actions CI/CD**: Lint → Typecheck → Test → Build → Deploy pipeline.
- **CodeQL Security Analysis**: Automated security scanning on push and schedule.
- **Issue Templates**: Bug report and feature request templates.
- **PR Template**: Structured pull request checklist.
- **Funding Configuration**: GitHub Sponsors setup.

#### Testing
- **Pivot Detection Tests** (`tests/pivots.test.ts`): Validates confirmed pivot identification and absence of look-ahead bias.
- **Sweep Detection Tests** (`tests/sweeps.test.ts`): Validates sell-side and buy-side sweep detection with volume confirmation.
- **Signal Engine Tests** (`tests/signal.test.ts`): Validates directional signal generation, scoring, classification, and trade plan integrity.
- **Backtest Engine Tests** (`tests/backtest.test.ts`): Validates historical simulation, walk-forward split, and metrics generation.

### Security
- No API keys or secrets are hardcoded in the source code.
- All external API calls use public endpoints that do not require authentication.
- Binance and CoinGecko API interactions are proxied server-side only.
- Client-side code only exposes `NEXT_PUBLIC_` prefixed environment variables.

### Disclaimer
This system is a quantitative market analysis and setup ranking tool. All scores, trade plans, and classifications are statistical heuristics derived from deterministic rule-based engines. This software does not guarantee profits and should not be construed as financial advice. Users are solely responsible for their trading decisions and risk management.