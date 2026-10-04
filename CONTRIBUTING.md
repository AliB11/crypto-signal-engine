# Contributing to Crypto Advanced Signal Scanner

First off, thank you for considering contributing to this project! 🎉

This document provides guidelines and steps for contributing.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Architecture](#project-architecture)
- [Coding Standards](#coding-standards)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

---

## Code of Conduct

Please be respectful to all contributors. We are building a professional, educational quantitative analysis tool. Harassment, spam, or promotion of guaranteed-profit schemes will not be tolerated.

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.17.0
- **npm** >= 10.0.0
- **Git**

### Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/<your-username>/crypto-signal-scanner.git
cd crypto-signal-scanner

# 3. Install dependencies
npm install

# 4. Create environment file
cp .env.example .env

# 5. Start development server
npm run dev

# 6. Run tests
npm test
```

---

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following our coding standards.

3. **Run all checks** before committing:
   ```bash
   npm run typecheck   # TypeScript validation
   npm run lint        # ESLint
   npm test            # Unit & integration tests
   npm run build       # Production build
   ```

4. **Commit** using our convention (see below).

5. **Push** and open a Pull Request.

---

## Project Architecture

```
src/
├── analysis/           # Core analysis engines
│   ├── pivots.ts       # Confirmed pivot detection (no look-ahead)
│   ├── liquidity.ts    # Liquidity level detection
│   ├── sweeps.ts       # Liquidity sweep engine
│   ├── structure.ts    # Market structure (HH/HL/LH/LL, BOS, MSS)
│   ├── sessions.ts     # Session liquidity (Asian, London, NY)
│   ├── volume.ts       # Volume analysis & Volume Profile
│   ├── derivatives.ts  # OI, Funding, Long/Short enrichment
│   ├── regime.ts       # Market regime classification
│   ├── mtf.ts          # Multi-timeframe alignment
│   ├── layer3.ts       # Advanced Liquidity Layer 3
│   ├── signal.ts       # Signal scoring & trade plan generation
│   ├── scanner.ts      # Concurrent symbol scanner
│   └── engine.ts       # Unified analysis pipeline orchestrator
│
├── backtest/           # Backtesting engine
│   ├── engine.ts       # Historical simulation & walk-forward
│   ├── metrics.ts      # Win rate, PF, Sharpe, Sortino, etc.
│   └── falseSignals.ts # Failure mode root-cause analysis
│
├── providers/          # Market data providers
│   ├── MarketDataProvider.ts  # Abstract interface
│   ├── BinanceProvider.ts     # Primary: Binance Spot + Futures
│   ├── CoinGeckoProvider.ts   # Fallback: metadata & OHLC
│   └── index.ts               # Provider manager singleton
│
├── types/
│   └── market.ts       # All TypeScript interfaces & types
│
├── app/                # Next.js App Router
│   ├── api/            # REST API route handlers
│   ├── page.tsx        # Main dashboard page
│   ├── layout.tsx      # Root layout
│   └── globals.css     # Tailwind CSS entry
│
├── components/         # React UI components
│   ├── charts/         # TradingView Lightweight Charts wrapper
│   ├── scanner/        # Scanner table with sort/filter
│   ├── analyzer/       # Deep coin analysis view
│   ├── backtester/     # Interactive backtest dashboard
│   ├── history/        # Local signal history & watchlist
│   ├── settings/       # Engine weight tuning modal
│   └── layout/         # Header, navigation, countdown
│
└── worker.ts           # Cloudflare Worker entrypoint (Hono)

tests/                  # Unit & integration tests
├── run-tests.ts        # Test runner
├── pivots.test.ts      # Pivot detection tests
├── sweeps.test.ts      # Sweep detection tests
├── signal.test.ts      # Signal engine tests
└── backtest.test.ts    # Backtest engine tests
```

---

## Coding Standards

### TypeScript

- **Strict mode** enabled in `tsconfig.json`.
- Prefer `interface` over `type` for object shapes.
- Use explicit return types on exported functions.
- No `any` — use `unknown` and type-guard.

### Naming Conventions

- **Files**: `camelCase.ts` for modules, `PascalCase.tsx` for React components.
- **Interfaces**: `PascalCase` (e.g., `LiquidityLevel`, `MarketStructureSummary`).
- **Functions**: `camelCase` (e.g., `detectLiquiditySweeps`, `analyzeMarketStructure`).
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_WEIGHTS`).

### React Components

- Use functional components with hooks.
- Mark client components with `'use client'` directive.
- Keep components under 400 lines; split if larger.

### Analysis Engines

- **No look-ahead bias**: Pivots must only confirm at `i + rightBars`.
- **Deterministic logic**: Rule-based, quantitative. No random seed in production paths.
- All numeric outputs must be `parseFloat(value.toFixed(N))` for consistency.
- Timeframes must be passed explicitly, never assumed.

---

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

### Types

| Type       | Description                                    |
| :--------- | :--------------------------------------------- |
| `feat`     | New feature                                    |
| `fix`      | Bug fix                                        |
| `docs`     | Documentation only                             |
| `style`    | Formatting, no code change                     |
| `refactor` | Code restructuring, no functional change       |
| `test`     | Adding or updating tests                       |
| `chore`    | Build process, tooling, dependencies           |
| `perf`     | Performance improvement                        |

### Scopes

| Scope         | Description                         |
| :------------ | :---------------------------------- |
| `analysis`    | Core analysis engines               |
| `backtest`    | Backtesting engine                  |
| `providers`   | Data provider adapters              |
| `api`         | Next.js API routes                  |
| `ui`          | Frontend components                 |
| `worker`      | Cloudflare Worker                   |
| `config`      | Configuration files                 |

### Examples

```
feat(analysis): add Volume Profile POC/VAH/VAL calculation
fix(sweeps): correct wick-to-body ratio for bearish sweeps
docs(readme): update API endpoint documentation
test(backtest): add walk-forward validation edge cases
```

---

## Pull Request Process

1. **Fill out the PR template** completely.
2. Ensure all CI checks pass (lint, typecheck, test, build).
3. Request review from at least one maintainer.
4. Address all review comments.
5. Squash-merge is preferred for clean history.

### PR Title Convention

```
feat(analysis): add Open Interest divergence detection
fix(ui): correct scanner table sort by RR column
```

---

## Reporting Bugs

Use the [Bug Report](https://github.com/crypto-signal-scanner/crypto-signal-scanner/issues/new?template=bug_report.md) template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Affected symbol/timeframe
- Screenshots or console logs

---

## Suggesting Features

Use the [Feature Request](https://github.com/crypto-signal-scanner/crypto-signal-scanner/issues/new?template=feature_request.md) template. Include:

- Clear use case description
- Which analysis layer it affects
- Implementation ideas (if any)

---

## Areas Where Help Is Needed

- 🔌 **New data providers**: Bybit, OKX, Coinbase adapters
- 📊 **Advanced charting**: Drawing tools, multi-pane layouts
- 🧪 **Test coverage**: More edge cases for sweep detection, FVG filling
- 🌍 **Internationalization**: Persian (Farsi), Arabic, Chinese UI
- 📱 **Mobile UX**: Touch-friendly chart interactions
- 📖 **Documentation**: Architecture decision records (ADRs)

---

## Questions?

Open a [Discussion](https://github.com/crypto-signal-scanner/crypto-signal-scanner/discussions) or join the conversation in existing issues.

Thank you for contributing! 🚀