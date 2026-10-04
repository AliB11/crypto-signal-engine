# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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