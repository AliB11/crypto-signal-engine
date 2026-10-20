import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BinanceProvider } from './providers/BinanceProvider';
import { runFullAnalysis } from './analysis/engine';
import { runScanner } from './analysis/scanner';
import { detectLiquidityLevels } from './analysis/liquidity';
import { detectLiquiditySweeps } from './analysis/sweeps';
import { analyzeMarketStructure } from './analysis/structure';
import { enrichDerivativesData } from './analysis/derivatives';
import { runBacktest } from './backtest/engine';
import { DEFAULT_WEIGHTS } from './analysis/signal';
import { Timeframe } from './types/market';
import { getPublicConfig, LIMITS, SCANNER_TIER_COUNTS, parseScannerTier } from './config/engine';
import { isTimeframe } from './lib/timeframes';
import { checkRateLimit, clientKeyFromHeaders } from './lib/rate-limit';
import { createDataTrace, dataQualityFromTrace } from './providers/MarketDataProvider';

/** پاک‌سازی نماد ورودی (هم‌ارز لایهٔ API نکست، بدون وابستگی به next/server) */
function sanitizeSymbol(raw: string | undefined | null, fallback = 'BTCUSDT'): string {
  const clean = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 3 && clean.length <= 20 ? clean : fallback;
}

function sanitizeTimeframe(raw: string | undefined | null, fallback: Timeframe = '15m'): Timeframe {
  return isTimeframe(raw) ? raw : fallback;
}

function clampLimit(raw: string | null | undefined, bounds: { min: number; max: number; fallback: number }): number {
  const value = Number(raw);
  if (!isFinite(value)) return bounds.fallback;
  return Math.max(bounds.min, Math.min(bounds.max, Math.floor(value)));
}

const app = new Hono();
const binanceProvider = new BinanceProvider();

app.use('*', cors());

/**
 * محدودسازی نرخ درخواست — دقیقاً همان منطق مسیرهای API نکست (`lib/rate-limit`).
 *
 * پیش‌تر Worker هیچ محدودسازی نداشت؛ یعنی یک API واحد در دو استقرار، دو سطح
 * کاملاً متفاوتِ محافظت داشت و مسیر عمومی Worker می‌توانست سهمیهٔ IP بایننس را
 * برای همهٔ کاربران بسوزاند.
 *
 * `null` یعنی درخواست مجاز است؛ در غیر این صورت پاسخ ۴۲۹ ساخته می‌شود.
 */
function rateLimitGate(
  request: Request,
  bucket: string,
  limitPerMinute: number
): Response | null {
  const key = clientKeyFromHeaders({ get: (name) => request.headers.get(name) });
  const result = checkRateLimit(`${bucket}:${key}`, limitPerMinute, 60_000);
  if (result.allowed) return null;

  return new Response(
    JSON.stringify({
      error: 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند لحظه بعد تلاش کنید.',
      status: 'RATE_LIMITED',
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
      },
    }
  );
}

function errorJson(err: unknown, status = 500): Response {
  const msg = err instanceof Error ? err.message : String(err);
  return new Response(JSON.stringify({ error: msg, timestamp: Date.now() }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Health Check — شامل وضعیت واقعی منبع داده
app.get('/api/health', (c) => {
  const stats = binanceProvider.getStats();
  const live = binanceProvider.getDataStatus().live;
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const simulationEnabled = (env.DATA_SIMULATION_FALLBACK ?? '').toLowerCase() !== 'off';
  return c.json({
    ok: true,
    status: live ? 'healthy' : 'degraded',
    service: 'crypto-advanced-signal-scanner',
    runtime: 'cloudflare-worker-serverless',
    database: 'none (in-memory zero-db)',
    metadataProvider: 'coingecko-public-markets',
    dataFallback: simulationEnabled ? 'deterministic-simulation' : 'disabled',
    symbolsSource: binanceProvider.getSymbolsSource(),
    dataStatus: {
      live,
      liveFetches: stats.liveFetches,
      simulatedFetches: stats.simulatedFetches,
      cacheHits: stats.cacheHits,
      liveCacheHits: stats.liveCacheHits,
      simulatedCacheHits: stats.simulatedCacheHits,
      coalescedRequests: stats.coalescedRequests,
      breakerTrips: stats.breakerTrips,
      openBreakers: stats.openBreakers,
      lastError: stats.lastError,
    },
    timestamp: new Date().toISOString(),
  });
});

// Market Ticker
app.get('/api/market', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'market', 90);
  if (blocked) return blocked;

  const symbol = sanitizeSymbol(c.req.query('symbol'));
  try {
    const trace = createDataTrace();
    const ticker = await binanceProvider.getTicker24h(symbol, trace);
    const metadata = await binanceProvider.getMetadata(symbol);
    const dataQuality = dataQualityFromTrace(trace);
    return c.json({
      symbol,
      ticker,
      metadata,
      dataSource: dataQuality.source,
      dataQuality,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Full Deep Analysis
app.get('/api/analyze', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'analyze', 60);
  if (blocked) return blocked;

  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const limit = clampLimit(c.req.query('limit'), LIMITS.analysisCandleLimit);
  try {
    const res = await runFullAnalysis(binanceProvider, symbol, { timeframe: tf, candleLimit: limit });
    return c.json(res);
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Signals
app.get('/api/signals', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'signals', 30);
  if (blocked) return blocked;

  const symbolsParam = c.req.query('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT';
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const symbols = symbolsParam
    .split(',')
    .map((s) => sanitizeSymbol(s, ''))
    .filter((s) => s.length >= 3)
    .slice(0, 20);

  const trace = createDataTrace();
  const errors: { symbol: string; message: string }[] = [];

  const signals = await Promise.all(
    symbols.map(async (s) => {
      try {
        const full = await runFullAnalysis(binanceProvider, s, {
          timeframe: tf,
          candleLimit: 120,
          trace,
        });
        return full.signal;
      } catch (err: unknown) {
        errors.push({ symbol: s, message: err instanceof Error ? err.message : String(err) });
        return null;
      }
    })
  );

  const dataQuality = dataQualityFromTrace(trace);

  return c.json({
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
    timeframe: tf,
    dataSource: dataQuality.source,
    dataQuality,
    analyzedCount: signals.filter(Boolean).length,
    errors,
    signals: signals.filter(Boolean),
  });
});

// Scanner
app.get('/api/scanner', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'scanner', 40);
  if (blocked) return blocked;

  const tier = parseScannerTier(c.req.query('tier'));
  if (tier === null) {
    return c.json(
      {
        error: "Invalid 'tier' parameter. Allowed values: 'top10', 'top25', 'top50'.",
        status: 'INVALID_TIER',
      },
      400
    );
  }
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const custom = c.req.query('symbols');
  const count = SCANNER_TIER_COUNTS[tier];

  try {
    const symbols = custom
      ? custom
          .split(',')
          .map((s) => sanitizeSymbol(s, ''))
          .filter((s) => s.length >= 3)
          .slice(0, LIMITS.scannerMaxSymbols)
      : await binanceProvider.getTopSymbols(count);

    if (symbols.length === 0) {
      return c.json({ error: 'فهرست نمادها خالی است', status: 'INVALID_SYMBOLS' }, 400);
    }

    // dataSource اکنون داخل runScanner از شمارندهٔ اختصاصی همان اسکن محاسبه می‌شود
    const result = await runScanner(binanceProvider, symbols, tf, 5);
    return c.json({ ...result, symbolsSource: binanceProvider.getSymbolsSource() });
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Liquidity
app.get('/api/liquidity', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'liquidity', 60);
  if (blocked) return blocked;

  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));

  try {
    const trace = createDataTrace();
    const [klines, daily] = await Promise.all([
      binanceProvider.getKlines(symbol, tf, 200, trace),
      binanceProvider.getKlines(symbol, '1d', 30, trace),
    ]);
    const levels = detectLiquidityLevels(klines, tf, {}, daily);
    const sweeps = detectLiquiditySweeps(klines, levels, tf);
    const dataQuality = dataQualityFromTrace(trace);

    return c.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      levels,
      sweeps,
      dataSource: dataQuality.source,
      dataQuality,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Structure
app.get('/api/structure', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'structure', 60);
  if (blocked) return blocked;

  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));

  try {
    const trace = createDataTrace();
    const klines = await binanceProvider.getKlines(symbol, tf, 200, trace);
    const structure = analyzeMarketStructure(klines, tf);
    const dataQuality = dataQualityFromTrace(trace);
    return c.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      structure,
      dataSource: dataQuality.source,
      dataQuality,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Derivatives
app.get('/api/derivatives', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'derivatives', 60);
  if (blocked) return blocked;

  const symbol = sanitizeSymbol(c.req.query('symbol'));
  try {
    const trace = createDataTrace();
    const [rawDeriv, klines] = await Promise.all([
      binanceProvider.getDerivativesData(symbol, trace),
      binanceProvider.getKlines(symbol, '15m', 30, trace),
    ]);
    const enriched = enrichDerivativesData(rawDeriv, klines, '15m');
    return c.json({
      ...enriched,
      dataSource: dataQualityFromTrace(trace).source,
    });
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Config — از تک‌منبع پیکربندی موتور خوانده می‌شود
app.get('/api/config', (c) => {
  return c.json({
    ...getPublicConfig(),
    weights: DEFAULT_WEIGHTS,
  });
});

// Backtest
app.post('/api/backtest', async (c) => {
  const blocked = rateLimitGate(c.req.raw, 'backtest', 12);
  if (blocked) return blocked;

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const symbol = sanitizeSymbol(String(body.symbol ?? ''));
  const tf = sanitizeTimeframe(body.timeframe ? String(body.timeframe) : null);
  const minScore = clampLimit(String(body.minScore ?? ''), { min: 0, max: 100, fallback: 65 });
  const candleLimit = clampLimit(String(body.candleLimit ?? ''), LIMITS.backtestCandleLimit);
  const maxHoldingCandles = clampLimit(String(body.maxHoldingCandles ?? ''), {
    min: 5,
    max: 200,
    fallback: 30,
  });

  try {
    const klines = await binanceProvider.getKlines(symbol, tf, candleLimit);
    if (klines.length < 60) {
      return c.json({ error: 'کندل کافی برای بک‌تست در دسترس نیست', status: 'INSUFFICIENT_DATA' }, 422);
    }
    const report = runBacktest(symbol, tf, klines, { minScore, maxHoldingCandles });
    return c.json(report);
  } catch (err: unknown) {
    return errorJson(err);
  }
});

// Cloudflare Worker Handler
const workerHandler = {
  fetch: app.fetch,

  /**
   * Cron trigger — گرم‌کنندهٔ حافظهٔ نهان.
   *
   * پیش‌تر این زمان‌بند «هر دقیقه» یک اسکن کامل اجرا می‌کرد و نتیجه را دور
   * می‌ریخت. یک اسکن ۱۰نمادی حدود ۷۰ درخواست به بایننس می‌زند؛ در مقیاس دقیقه‌ای
   * یعنی بیش از ۱۰۰ هزار درخواست در روز که هم سهمیهٔ رایگان Worker و هم محدودیت
   * نرخ بایننس را می‌سوزاند. اکنون هر ۱۵ دقیقه اجرا می‌شود و هدفش صریحاً
   * «گرم نگه‌داشتن cache و قطع‌کنندهٔ مدار» است، نه تولید داده.
   */
  /**
   * زمان‌بند نگهداری (هر ۵ دقیقه — در `wrangler.toml` تنظیم می‌شود).
   *
   * این زمان‌بند پیش‌تر هر *دقیقه* یک اسکن کامل ۱۰ نمادی در چند تایم‌فریم اجرا
   * می‌کرد و نتیجه را دور می‌ریخت؛ یعنی روزانه چند صد هزار درخواست بالادستی فقط
   * برای گرم‌کردن کشی که TTL آن ۸ ثانیه است (و تا رسیدن درخواست کاربر مدت‌ها
   * منقضی شده). فیوزهای مدار هم با `openUntil` خودبازگردند و با نخستین درخواست
   * موفق کاربر بسته می‌شوند، پس به این اسکن نیازی ندارند.
   *
   * حالا به‌جایش یک کاوش سبک «دسترس‌پذیری بالادستی» انجام می‌دهیم: یک درخواست
   * تیکر، و ثبت وضعیت فیوزها و آخرین خطا. هم بار بالادستی ناچیز است و هم
   * سیگنال زنده‌بودن واقعی برای دیپلوی تولید می‌کند.
   */
  async scheduled(event: { cron: string; scheduledTime: number }) {
    const startedAt = Date.now();
    const at = new Date(event.scheduledTime).toISOString();
    try {
      const trace = createDataTrace();
      const ticker = await binanceProvider.getTicker24h('BTCUSDT', trace);
      const quality = dataQualityFromTrace(trace);
      const stats = binanceProvider.getStats();
      console.log(
        `[Cron ${at}] upstream probe: BTCUSDT=${ticker.lastPrice} ` +
          `source=${quality.source} liveRatio=${quality.liveRatio} ` +
          `breakersOpen=${stats.openBreakers.length} ` +
          `lastError=${stats.lastError ?? 'none'} durationMs=${Date.now() - startedAt}`
      );
    } catch (err) {
      console.error(
        `[Cron ${at}] upstream probe FAILED after ${Date.now() - startedAt}ms: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }
  },
};

export default workerHandler;
