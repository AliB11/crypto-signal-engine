<div align="center">

# 🔮 Crypto Advanced Signal Scanner

### Context-Aware Layer 3 Market Analysis Engine

<br>

[![CI](https://github.com/crypto-signal-scanner/crypto-signal-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/crypto-signal-scanner/crypto-signal-scanner/actions/workflows/ci.yml)
[![CodeQL](https://github.com/crypto-signal-scanner/crypto-signal-scanner/actions/workflows/codeql.yml/badge.svg)](https://github.com/crypto-signal-scanner/crypto-signal-scanner/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![Zero Database](https://img.shields.io/badge/Database-None%20Required-brightgreen.svg)](#zero-database-architecture)

<br>

**Serverless · Zero-Database · Real-Time · Multi-Timeframe · Quantitative**

[Quick Start](#-quick-start) · [API Reference](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## Overview

A professional-grade, **serverless** cryptocurrency market analysis platform that identifies high-quality trading setups using a **3-layer hierarchical liquidity engine**, multi-timeframe structure analysis, derivatives flow, and deterministic rule-based signal scoring.

> ⚠️ **Disclaimer**: This system is a quantitative market analysis and setup ranking tool. All scores, trade plans, and classifications are statistical heuristics. This software **does not guarantee profits** and should **not** be construed as financial advice.

---

## Key Features

<table>
<tr>
<td width="50%">

### 🧠 Analysis Engines

- **Market Structure**: HH/HL/LH/LL, BOS, CHoCH/MSS, Displacement
- **Liquidity Layers**: Swing points, EQH/EQL, PDH/PDL, weekly & session levels
- **Volume Profile**: RVOL, spikes, taker imbalance, 70% value area (POC/VAH/VAL)
- **Derivatives**: OI trend, funding rate, Long/Short ratio, taker flow
- **Multi-Timeframe**: 1D → 4H → 1H → 15m → 5m → 1m confluence
- **Market Regime**: Wilder ADX(14) + DI dominance + EMA20/50 slope
- **No Look-Ahead Levels**: every level carries a `confirmedTimestamp`

</td>
<td width="50%">

### 📊 Signal Generation

- **Confidence Score**: Weighted 0–100 with 7 configurable components
- **Context vs Confidence**: `score` is capped below the threshold when there is
  no directional setup; raw context quality stays visible as `contextScore`
- **Directional Classification**: LONG / SHORT / NO TRADE (below-threshold
  directional setups are downgraded instead of shipping a trade plan)
- **Draw-on-Liquidity Targets**: TP1/TP2/TP3 are read from the live liquidity
  map (EQH/EQL, PDH/PDL, weekly & session levels, value-area edges) and each
  target reports its own source; R-multiples are only the last resort
- **Trade Plan**: Entry zone, structural SL, risk cap (8%), ATR context
- **Explainable Reasons**: Checklist of confluence factors per setup
- **Risk Warnings**: Funding squeeze, crowding, volatility alerts
- **No Look-Ahead Bias**: Pivots confirmed only at `i + rightBars`

</td>
</tr>
<tr>
<td width="50%">

### 🔧 Backtesting

- **In-Memory Simulator**: Step-by-step candle processing
- **Walk-Forward Validation**: 60/20/20 Train/Val/OOS split
- **Performance Metrics**: Sharpe, Sortino, Profit Factor, Max DD
- **Failure Analysis**: Root-cause breakdown of losing trades
- **Equity Curve**: Visual account balance simulation
- **No Database Required**: Runs entirely in-memory

</td>
<td width="50%">

### 💻 Dashboard

- **Live Scanner Table**: Sort, filter, search, tier switching
- **Market Pulse Panel**: Aggregate breadth, ADX trend strength, relative
  volatility and the dominant regime of the whole scan in one view
- **Signal Lifecycle Tracker**: Every setup is tagged تازه / پایدار ×n /
  برگشتِ جهت / بازگشت with its age and score delta (localStorage, no server)
- **Liquidity Magnet Ladder**: Nearest untapped liquidity above/below price
  with a weighted "draw" direction
- **TradingView Charts**: Candlestick with overlay controls + data-source badge
- **60-Second Auto-Refresh**: Countdown timer + manual trigger, alert cooldowns
- **Signal History**: localStorage watchlist & snapshots
- **Mobile Responsive**: Full touch-friendly experience

</td>
</tr>
</table>

---

## Zero Database Architecture

This project was designed with a **strict zero-database constraint**. No PostgreSQL, MySQL, MongoDB, SQLite, Redis, Cloudflare KV/D1/Durable Objects, or any form of persistent storage is used.

```
┌──────────────────────────────────────────────────────────────┐
│                      Browser (React)                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │  Scanner   │ │  Analyzer  │ │ Backtester │ │ Watchlist │ │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬─────┘ │
│        │              │              │               │        │
│        └──────────────┼──────────────┼───────────────┘        │
│                       │                                      │
│                localStorage only                             │
└───────────────────────┼──────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              API Layer (Next.js / Cloudflare Worker)          │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Analysis   │  │   Provider   │  │  Scanner Engine    │  │
│  │  Pipeline   │←─┤   Manager    │←─┤  (Concurrent)     │  │
│  │  (Layer 3)  │  │              │  │                    │  │
│  └─────────────┘  └──────┬───────┘  └────────────────────┘  │
│                          │                                   │
│               ┌──────────┴──────────┐                        │
│               │                     │                        │
│       ┌───────┴───────┐    ┌───────┴───────┐                │
│       │    Binance    │    │   CoinGecko   │                │
│       │ Public APIs   │    │  (Fallback)   │                │
│       └───────────────┘    └───────────────┘                │
└──────────────────────────────────────────────────────────────┘

     ✅ No Database  ✅ No Redis  ✅ No KV  ✅ No D1
```

---

## Innovations

### 1. Market Pulse (نبض کلان بازار)

Single-symbol analysis cannot answer "which side is the whole market leaning
to?". The scanner response is aggregated client-side into a weighted breadth
meter (LONG vs SHORT score weight), the average Wilder ADX, the **median** ATR%
(so the reading stays meaningful on every timeframe) and a relative
high-volatility share, plus the dominant regime — finished with a Persian
one-line interpretation.

### 2. Signal Lifecycle (چرخه عمر سیگنال)

A traditional scanner only ever shows a snapshot, so users cannot tell a
10-second-old setup from one that has been persisting for half an hour, nor
whether its direction just flipped. Every scan is compared with the previous
one and each directional setup is labelled:

| State | Meaning |
| :---- | :------ |
| `NEW` | first appearance (or fewer than 3 consecutive scans) |
| `PERSISTENT` | same direction for 3+ consecutive scans |
| `FLIPPED` | direction reversed versus the previous scan (previous side kept) |
| `RESUMED` | setup returned after disappearing from the table |

Age, score delta (▲/▼) and reversal count are shown next to the badge. The map
lives in `localStorage` (capped at 120 symbols) — the zero-database rule holds.

### 3. Liquidity Magnet Ladder (نردبان مغناطیس نقدینگی)

Shows the nearest untapped liquidity levels above (buy-side) and below
(sell-side) the current price with their structural strength and distance, and
computes a **draw direction** where each level is weighted by
`strength ÷ (1 + distance%)`. This turns "where could price be pulled next?"
into a readable ladder instead of a hidden assumption, and it is the same map
that feeds the trade-plan targets.

---

## Data Resilience (zero-dependency)

The engine keeps working — deterministically — when the upstream exchange API
is unreachable:

| Layer | Behaviour |
| :---- | :-------- |
| Short cache | 8 s for market data, 60 s for the ticker universe |
| Simulated cache | 3 s for fallback payloads (no repeated re-simulation) |
| Request coalescing | concurrent identical fetches share one upstream call |
| Circuit breaker | after 2 consecutive failures a host is skipped for 25 s |
| Timeout & retries | 4 s per attempt, 1 retry per host (was 9 attempts × 6 s) |
| Deterministic simulation | the same (symbol, timeframe, candle index) always yields the same OHLCV, so consecutive candles never mutate mid-flight |
| Provenance | every analysis/scanner response carries `dataSource` + `dataQuality` (`live` / `mixed` / `simulated` with a live ratio) |
| Rate limiting | in-memory token bucket per IP per route, `429` + `Retry-After` |

---

## Quick Start

### Prerequisites

- **Node.js** >= 18.17.0
- **npm** >= 10.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/crypto-signal-scanner/crypto-signal-scanner.git
cd crypto-signal-scanner

# Install dependencies
npm install

# Create environment file (no secrets required)
cp .env.example .env

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests

```bash
npm test
```

### Production Build

```bash
npm run build
npm start
```

### Deploy to Cloudflare Workers

```bash
npx wrangler login
npx wrangler deploy
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed instructions.

---

## Project Structure

```
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                  # CI/CD: Lint → Test → Build → Deploy
│   │   └── codeql.yml              # Security scanning
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── FUNDING.yml
│
├── docs/
│   ├── API.md                      # Complete API reference
│   ├── ARCHITECTURE.md             # System architecture deep-dive
│   └── DEPLOYMENT.md               # Deployment guide
│
├── src/
│   ├── analysis/                   # Core analysis engines
│   │   ├── pivots.ts               # Confirmed pivot detection (no look-ahead)
│   │   ├── liquidity.ts            # Liquidity level identification
│   │   ├── sweeps.ts               # Sell-side / Buy-side sweep detection
│   │   ├── structure.ts            # BOS, MSS/CHoCH, FVG, Order Blocks
│   │   ├── sessions.ts             # Asian/London/NY session analysis
│   │   ├── volume.ts               # RVOL, taker imbalance, Volume Profile
│   │   ├── derivatives.ts          # OI, funding, L/S ratio enrichment
│   │   ├── regime.ts               # Market regime classification
│   │   ├── mtf.ts                  # Multi-timeframe confluence
│   │   ├── layer3.ts               # Advanced Liquidity Layer 3
│   │   ├── signal.ts               # Signal scoring & trade plan
│   │   ├── scanner.ts              # Concurrent symbol scanner
│   │   └── engine.ts               # Pipeline orchestrator
│   │
│   ├── backtest/                   # Backtesting engine
│   │   ├── engine.ts               # Historical simulation
│   │   ├── metrics.ts              # Performance calculations
│   │   └── falseSignals.ts         # Failure mode analysis
│   │
│   ├── providers/                  # Market data providers
│   │   ├── MarketDataProvider.ts   # Abstract interface
│   │   ├── BinanceProvider.ts      # Primary: Spot + Futures APIs
│   │   ├── CoinGeckoProvider.ts    # Fallback: metadata & OHLC
│   │   └── index.ts                # Provider manager
│   │
│   ├── types/
│   │   └── market.ts               # TypeScript interfaces & types
│   │
│   ├── app/                        # Next.js App Router
│   │   ├── api/                    # REST API routes
│   │   │   ├── analyze/route.ts
│   │   │   ├── backtest/route.ts
│   │   │   ├── config/route.ts
│   │   │   ├── derivatives/route.ts
│   │   │   ├── health/route.ts
│   │   │   ├── liquidity/route.ts
│   │   │   ├── market/route.ts
│   │   │   ├── scanner/route.ts
│   │   │   ├── signals/route.ts
│   │   │   └── structure/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/                 # React UI components
│   │   ├── charts/
│   │   │   └── TradingViewChart.tsx
│   │   ├── scanner/
│   │   │   └── ScannerTable.tsx
│   │   ├── analyzer/
│   │   │   └── CoinAnalyzer.tsx
│   │   ├── backtester/
│   │   │   └── BacktestDashboard.tsx
│   │   ├── history/
│   │   │   └── SignalHistory.tsx
│   │   ├── settings/
│   │   │   └── SettingsModal.tsx
│   │   └── layout/
│   │       └── Header.tsx
│   │
│   └── worker.ts                   # Cloudflare Worker entry (Hono)
│
├── tests/
│   ├── run-tests.ts                # Test runner
│   ├── pivots.test.ts              # Pivot detection tests
│   ├── sweeps.test.ts              # Sweep detection tests
│   ├── signal.test.ts              # Signal engine tests
│   └── backtest.test.ts            # Backtest engine tests
│
├── .env.example                    # Environment template
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                         # MIT
├── README.md
├── SECURITY.md
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── wrangler.toml                   # Cloudflare Worker config + cron
```

---

## API Endpoints

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | [`/api/health`](docs/API.md#health-check) | Service health status |
| `GET` | [`/api/market`](docs/API.md#market-data) | 24h ticker & metadata |
| `GET` | [`/api/analyze`](docs/API.md#full-analysis) | Full Layer 3 analysis & trade plan |
| `GET` | [`/api/signals`](docs/API.md#signals) | Directional signals for symbol list |
| `GET` | [`/api/scanner`](docs/API.md#scanner) | Concurrent market scanner |
| `GET` | [`/api/liquidity`](docs/API.md#liquidity) | Liquidity map & sweeps |
| `GET` | [`/api/structure`](docs/API.md#structure) | Structure events, FVGs, OBs |
| `GET` | [`/api/derivatives`](docs/API.md#derivatives) | OI, Funding, Long/Short |
| `GET` | [`/api/config`](docs/API.md#configuration) | Engine configuration & weights |
| `POST` | [`/api/backtest`](docs/API.md#backtest) | Historical backtest simulation |

Full API documentation with request/response examples: [`docs/API.md`](docs/API.md)

---

## Advanced Liquidity Layer 3

The core differentiator of this system is its **3-layer hierarchical liquidity analysis**:

### Layer 1 — Basic Liquidity
Swing highs/lows, Equal Highs (EQH), Equal Lows (EQL), Previous Day High/Low (PDH/PDL)

### Layer 2 — Structural Liquidity
BOS (Break of Structure), MSS (Market Structure Shift / CHoCH), Displacement, Fair Value Gaps (FVG), Order Blocks (OB), Liquidity Sweeps

### Layer 3 — Advanced Context
Higher-Timeframe alignment + Session confluence + Sweep + MSS + Displacement + Volume + Derivatives (OI/Funding/L-S Ratio) + Market Regime synthesis

> Layer 3 is NOT simply a sum of indicators. It evaluates whether the **market context** supports a high-probability setup by requiring **simultaneous confluence** across multiple analytical dimensions.

---

## Signal Scoring Model

| Component | Weight | Data Source |
|:----------|:-------|:------------|
| Liquidity | 20% | Sweeps, EQH/EQL, PDH/PDL |
| Market Structure | 20% | BOS, MSS, Displacement, Trend |
| Multi-Timeframe | 20% | 1D → 1m alignment score |
| Session Liquidity | 10% | Judas Swings, session sweeps |
| Volume | 10% | RVOL, spike, taker imbalance |
| Derivatives | 10% | OI trend, funding, L/S ratio |
| Advanced Layer 3 | 10% | Cross-layer context synthesis |

Weights are **fully configurable** via the Settings UI or the `/api/config` endpoint.

---

## Technology Stack

| Layer | Technology | Purpose |
|:------|:-----------|:--------|
| Frontend | React 19 + Next.js 16 | Full-stack App Router framework |
| Styling | Tailwind CSS 4 | Utility-first responsive design |
| Charts | Lightweight Charts 5 | Financial candlestick rendering |
| Icons | Lucide React | Consistent SVG icon system |
| API | Next.js Route Handlers + Hono | REST endpoints + Worker framework |
| Worker | Cloudflare Workers | Serverless edge computing + Cron |
| Data | Binance Public API | Spot & Futures market data |
| Fallback | CoinGecko API | Metadata, market cap, OHLC |
| Language | TypeScript 5.9 (strict) | End-to-end type safety |
| Testing | tsx + custom runner | Unit & integration tests |
| CI/CD | GitHub Actions | Automated lint/test/build/deploy |
| Security | CodeQL | Automated vulnerability scanning |

---

## Documentation

| Document | Description |
|:---------|:------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, analysis pipeline, data flow |
| [`docs/API.md`](docs/API.md) | Complete API reference with examples |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Local, production, and Cloudflare deployment |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Development workflow, coding standards, PR process |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reporting policy |

---

## Contributing

We welcome contributions! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for:

- Development setup instructions
- Project architecture overview
- Coding standards and naming conventions
- Commit message convention (Conventional Commits)
- Pull request process and checklist

### Areas Where Help Is Needed

- 🔌 New data providers (Bybit, OKX, Coinbase)
- 📊 Advanced charting features
- 🧪 Edge case test coverage
- 🌍 Internationalization (Farsi, Arabic, Chinese)
- 📱 Mobile touch interactions
- 📖 Architecture decision records

---

## License

This project is licensed under the **MIT License** — see the [`LICENSE`](LICENSE) file for details.

---

## Disclaimer

This software is provided for **educational and analytical purposes only**. It is a quantitative market structure analyzer and setup ranking engine. It does not provide financial advice, and no output should be interpreted as a guarantee of profit.

**Trading cryptocurrencies involves substantial risk of loss.** Past performance of any analysis or signal does not guarantee future results. Users are solely responsible for their own trading decisions and risk management.

---

<div align="center">

**Built with TypeScript, Next.js, and Cloudflare Workers**

[⬆ Back to Top](#-crypto-advanced-signal-scanner)

</div>