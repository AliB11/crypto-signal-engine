# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] – 2026-10-20

بازبینی خط‌به‌خط همهٔ لایه‌ها با یک معیار واحد: **مقدار نامعلوم باید «نامعلوم»
گزارش شود، نه یک عدد باورپذیرِ ساختگی.** هر جایی که برنامه دادهٔ جعلی، ثابت یا
حدسی تولید می‌کرد حذف یا به مقدار واقعی/`null` تبدیل شد.

### Removed — دادهٔ ساختگی

- **جدول ثابت رتبهٔ بازار حذف شد.** `BinanceProvider.staticNames` نام و رتبه را
  هاردکد می‌کرد (`BTC 1، ETH 2، XRP 3 … RENDER 26` و هر نماد ناشناخته → `50`).
  حالا نام/رتبه/ارزش بازار/حجم/تغییر ۲۴ساعته فقط از `/coins/markets` کوین‌گکو
  می‌آید و در نبود آن `null` است.
- **`CoinGeckoProvider` بازنویسی شد.** نسخهٔ قبلی کد مرده‌ای بود که دادهٔ جعلی
  می‌ساخت: `highPrice = price × 1.02` و `lowPrice = price × 0.98`، فاندینگ ثابت
  `0.0001` با سالانهٔ `10.95%`، و کندل‌های **بیت‌کوین** برای هر نماد ناشناخته.
  اکنون فقط فرادادهٔ واقعی می‌خواند.
- **استاب سوگیرانهٔ بک‌تست حذف شد.** موتور بک‌تست یک شیء ثابت با
  `oiTrend: 'LONG_BUILDUP'` تزریق می‌کرد که به هر معامله +۲۵ امتیاز لانگ می‌داد.
  جای آن را `NEUTRAL_DERIVATIVES` با `missingFields` کامل گرفته و وزن آن مؤلفه
  صفر و میان شش مؤلفهٔ دیگر بازتوزیع شده است.
- **سهم ۵۰/۵۰ ساختگی حذف شد.** `MarketPulsePanel.longShare` و
  `liquidity-magnets.upPercent` در نبود داده عدد `50` می‌گرفتند (یعنی «بازار
  متعادل است»)؛ حالا `null` و در رابط کاربری `—` هستند.
- **`{trend: 'RANGING', structureScore: 50}` برای تایم‌فریم بدون داده حذف شد.**
  چنین تایم‌فریمی `available: false`، `trend: 'UNKNOWN'` و `structureScore: null`
  می‌گیرد و از محاسبهٔ هم‌راستایی کنار گذاشته می‌شود.
- **`profitFactor: 99.99` حذف شد.** در نبود زیان، `null` برمی‌گردد و در رابط
  کاربری `∞` با توضیح نمایش داده می‌شود.
- **`wickToBodyRatio: 2.0` ساختگی برای کندل‌های دوجی حذف شد**؛ نسبت واقعی
  اندازه‌گیری می‌شود.
- **کلیدهای محیطی خیالی از `.env.example` و `docs/DEPLOYMENT.md` حذف شدند**
  (`DATABASE_URL`، `NODE_ENV`). مستندسازیِ کلیدی که هیچ‌جا خوانده نمی‌شد خودش
  یک دادهٔ جعلی بود.

### Fixed — لایهٔ داده

- **`dataQuality` آلوده بین درخواست‌ها.** کیفیت داده از اختلاف شمارندهٔ سراسریِ
  یک نمونهٔ singleton گرفته می‌شد، پس دو درخواست هم‌زمان در محیط سرورلس آمار
  یکدیگر را می‌دیدند. اکنون یک `DataTrace` اختصاصی به هر فراخوانی پروایدر
  پاس داده می‌شود.
- **`mixed` به `simulated` فروکاسته می‌شد.** وقتی ۹ فراخوانی از ۱۰ زنده بود،
  رابط کاربری «بدون دسترسی به بایننس» می‌نوشت. `DataSource` اکنون سه‌حالته است
  و هر سه حالت در Header، نمودار، بنر اسکنر و تحلیلگر سکه نمایش داده می‌شود.
- **مشتقات ناقص خود را زنده جا می‌زد.** اگر حتی یک اندپوینت آتی پاسخ می‌داد،
  بقیه با مقادیر خنثی (LSR=1، funding=0، takerRatio=1) و `isSimulated: false`
  پر می‌شدند. اکنون `missingFields: DerivativesField[]` گزارش می‌شود و
  `oiTrend`/`fundingCategory`/`positioning` فقط از فیلدهای خوانده‌شده ساخته
  می‌شوند.
- **سالانه‌سازی فاندینگ.** `rate × 3 × 365` بازهٔ ۸ساعته را برای *همهٔ* نمادها
  فرض می‌کرد. اکنون بازهٔ واقعی از `/fapi/v1/fundingInfo` خوانده می‌شود
  (کش ۲۴ساعته) و محاسبه در `src/lib/funding.ts` مستقل و تست‌پذیر است؛ در نبود
  بازه، `fundingIntervalHours: null` گزارش می‌شود.
- **`enrichDerivativesData` ناهم‌تراز.** تغییر OI یک‌ساعته با تغییر قیمتِ
  «۴ کندل از هر تایم‌فریمی که اتفاقاً پاس داده شده بود» مقایسه می‌شد (۴ دقیقه
  روی 1m، ۱۶ ساعت روی 4h). اکنون پنجره به یک ساعت نزدیک می‌شود، روی تایم‌فریم
  درشت‌تر از یک ساعت هیچ پالایشی انجام نمی‌شود، و در نبود `oiChange1hPercent`
  هیچ برچسبی ساخته نمی‌شود.
- **`getTopSymbols`** به‌جای فهرست پنهان، از `FALLBACK_WATCHLIST` پیکربندی
  استفاده می‌کند و منبع خود را با `symbolsSource: 'live-volume' | 'static-watchlist'`
  اعلام می‌کند.
- **`/api/health`** وضعیت واقعی منبع فراداده را گزارش می‌دهد
  (`metadataProvider.available/marketsFetchedAt/apiKeyConfigured`) به‌جای
  `metadataFallback: 'coingecko'` بی‌قیدوشرط.

### Fixed — موتورهای تحلیل

- **خطای همیشه‌درست در تشخیص سوئیپ.** وقتی بدنه صفر بود (دوجی)، شرط شدو به
  `lowerWick >= lowerWick * 0.6` تقلیل می‌یافت که *همیشه* درست است؛ پس هر دوجیِ
  نفوذکننده بدون هیچ شاهد ساختاری «سوئیپ تأییدشده» می‌شد. حالا شدو در این حالت
  با دامنهٔ کل کندل سنجیده می‌شود.
- **دیسپلیسمنت خودارجاع.** میانگین بدنه/حجم شامل کندلِ در حال تشکیل بود، پس یک
  کندل بزرگِ جاری هم صورت و هم مخرج را بزرگ می‌کرد و هرگز دیسپلیسمنت تشخیص داده
  نمی‌شد. میانگین اکنون فقط از کندل‌های بسته‌شده ساخته می‌شود.
- **رویدادهای ساختاری زمانی‌مرتب نبودند.** پیوت‌ها و شکست‌ها در دو حلقهٔ جدا
  push می‌شدند، پس `events.slice(-5)` هرگز رویدادهای HH/HL را نمی‌دید.
- **قدرت پیوت.** `min(100, 50 + volRatio × 20)` که `volRatio` نسبت به *یک* کندل
  قبلی بود عملاً هر پیوتی را بین ۵۰ تا ۱۰۰ می‌گذاشت و با حجم قبلیِ صفر، `|| 1`
  یک نسبت نجومی و قدرت ۱۰۰ می‌ساخت. حالا از میانگین حجم پنجره + میزان برآمدگی
  پیوت نسبت به همسایگانش محاسبه می‌شود.
- **ATR واقعاً وایلدر شد** (RMA)، هم‌راستا با ADX همان فایل. پیش‌تر میانگین سادهٔ
  ۱۴ مقدار آخر بود، در حالی که ادعای «استاندارد وایلدر» داشت.
- **تفکیک خرید/فروش حجم** فقط از `takerBuyBaseVolume` واقعی می‌آید؛ پیش‌تر بر
  پایهٔ رنگ کندل نسبت ۶۵/۳۵ اختراع می‌شد.
- **`sessions.ts`** ساعت جلسات را از `SESSION_DEFINITIONS` می‌خواند (نه عدد ثابت)،
  **`layer3.ts`** سوئیپ‌های نیویورک را هم می‌شمارد و شاخهٔ `HIGH_VOLATILITY` را
  پوشش می‌دهد، و `pdh/pdl` در نبود سطح `null` است نه `0`.
- **`signal.ts`** امتیاز هم‌سویی مشتقات را بر پایهٔ `oiAvailable` /
  `fundingAvailable` / `positioningAvailable` دروازه می‌کند؛ `rrRatio` در نبود
  داده `0` است (نه `1.5`)؛ و اهداف `PREVIOUS_WEEK_*` دیگر با برچسب PDH/PDL
  نمایش داده نمی‌شوند.

### Fixed — بک‌تست

- **ورود در بازِ کندلِ بعد** از صدور سیگنال ثبت می‌شود، نه بستهٔ همان کندل
  سیگنال (که یک خطای آینده‌نگری بود).
- **حد ضرر پیش از اهداف** بررسی می‌شود؛ خروج پله‌ای یک‌سوم حجم در هر هدف.
- **کارمزد و اسلیپیج** لحاظ می‌شود (پیش‌فرض ۰٫۰۵٪ کارمزد + ۰٫۰۲٪ اسلیپیج در هر
  سمت)؛ پیش‌تر نتایج بدون هیچ هزینه‌ای گزارش می‌شد.
- **معاملهٔ بازِ مانده در پایان داده** با `END_OF_DATA` بسته و *شمرده* می‌شود؛
  پیش‌تر بی‌صدا از آمار حذف می‌شد.
- همهٔ فرض‌های مدل‌سازی در `BacktestReport.assumptions` (اکنون فیلدی اجباری)
  فهرست می‌شوند.

### Fixed — رابط کاربری

- برچسب مشتقات سه‌حالته شد (زنده/ناقص/شبیه‌سازی) با پنل هشدار که دقیقاً
  `missingFields` را نام می‌برد.
- ساعت جلسات، بازهٔ فاندینگ و `structureScore` تایم‌فریم‌ها از دادهٔ تحلیل
  خوانده می‌شوند، نه رشته‌های هاردکد («۱۵:۳۰–۲۱:۳۰»، «۸ساعته»).
- PDH/PDL/عدم‌تعادل حجم در غیرقابل‌سنجش بودن `—` نشان می‌دهند.
- **صدای هشدار پیش‌فرض خاموش** شد و همراه با لایهٔ اسکن در حافظهٔ محلی می‌ماند؛
  پیش‌تر پیش‌فرض روشن بود و با هر بارگذاری صفحه دوباره روشن می‌شد.
- گزینهٔ مردهٔ `tier: 'custom'` از انواع حذف شد (هیچ دکمه‌ای نداشت و
  `/api/scanner` هرگز آن را نگاشت می‌کرد).

### Fixed — پلتفرم

- **Worker کرن** از `* * * * *` به `*/5 * * * *` تغییر کرد. پیش‌تر هر دقیقه یک
  اسکن کامل ۱۰ نمادی در چند تایم‌فریم اجرا و نتیجه دور ریخته می‌شد — روزانه چند
  صد هزار درخواست بالادستی برای گرم‌کردن کشی با TTL هشت ثانیه. حالا یک کاوش
  سبک دسترس‌پذیری با ثبت وضعیت فیوزها انجام می‌شود.
- **`src/lib/rate-limit.ts`** تنها پیاده‌سازی محدودسازی نرخ است که هم مسیرهای
  Next و هم Worker از آن استفاده می‌کنند؛ Worker پیش‌تر هیچ محدودسازی نداشت.
- **پارامتر `tier` اعتبارسنجی می‌شود** و مقدار ناشناخته `400 INVALID_TIER`
  می‌گیرد، به‌جای تبدیل بی‌صدای همه‌چیز به `top10`.
- مسیرهای API هرکدام `DataTrace` اختصاصی می‌سازند و `dataSource` + `dataQuality`
  برمی‌گردانند؛ `/api/signals` خطاهای هر نماد را جمع می‌کند و `analyzedCount` /
  `liveCount` می‌دهد.

### Added

- `src/lib/funding.ts` — سالانه‌سازی و برچسب بازهٔ فاندینگ (خالص و تست‌پذیر).
- `src/lib/rate-limit.ts` — محدودسازی نرخ مشترک Next/Worker.
- پشتیبانی اختیاری از `COINGECKO_API_KEY` (سرآیند `x-cg-demo-api-key`)؛ این
  متغیر پیش‌تر فقط مستند شده بود ولی هیچ‌جا خوانده نمی‌شد.
- سوئیچ `DATA_SIMULATION_FALLBACK=off` برای محیط‌هایی که «یا دادهٔ واقعی یا هیچ»
  می‌خواهند.
- `tests/fixtures.ts` — سازندهٔ مشترک fixture تا تست‌ها با تایپ‌ها همگام بمانند.
- `tests/honesty.test.ts` — ۹ آزمون جدید که دقیقاً همان مقادیر ساختگیِ حذف‌شده را
  قفل می‌کنند (سالانه‌سازی فاندینگ، ایزولگی trace، صداقت MTF/ساختار، تائوتولوژی
  سوئیپ، غنای مشتقات، ATR وایلدر، هزینه‌های بک‌تست، اعتبارسنجی tier).
- بخش «Data provenance guarantees» در `docs/ARCHITECTURE.md`.

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