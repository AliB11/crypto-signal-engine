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
import { getPublicConfig, LIMITS } from './config/engine';
import { isTimeframe } from './lib/timeframes';

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

// Health Check — شامل وضعیت واقعی منبع داده
app.get('/api/health', (c) => {
  const stats = binanceProvider.getStats();
  const live = binanceProvider.getDataStatus().live;
  return c.json({
    ok: true,
    status: live ? 'healthy' : 'degraded',
    service: 'crypto-advanced-signal-scanner',
    runtime: 'cloudflare-worker-serverless',
    database: 'none (in-memory zero-db)',
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
  const symbol = sanitizeSymbol(c.req.query('symbol'));
  try {
    const ticker = await binanceProvider.getTicker24h(symbol);
    const metadata = await binanceProvider.getMetadata(symbol);
    return c.json({
      symbol,
      ticker,
      metadata,
      dataSource: binanceProvider.getDataStatus().live ? 'live' : 'simulated',
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Full Deep Analysis
app.get('/api/analyze', async (c) => {
  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const limit = clampLimit(c.req.query('limit'), LIMITS.analysisCandleLimit);
  try {
    const res = await runFullAnalysis(binanceProvider, symbol, { timeframe: tf, candleLimit: limit });
    return c.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Signals
app.get('/api/signals', async (c) => {
  const symbolsParam = c.req.query('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT';
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const symbols = symbolsParam
    .split(',')
    .map((s) => sanitizeSymbol(s, ''))
    .filter((s) => s.length >= 3)
    .slice(0, 20);

  const signals = await Promise.all(
    symbols.map(async (s) => {
      try {
        const full = await runFullAnalysis(binanceProvider, s, { timeframe: tf, candleLimit: 120 });
        return full.signal;
      } catch {
        return null;
      }
    })
  );

  return c.json({
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
    timeframe: tf,
    signals: signals.filter(Boolean),
  });
});

// Scanner
app.get('/api/scanner', async (c) => {
  const tier = c.req.query('tier') || 'top10';
  const tf = sanitizeTimeframe(c.req.query('tf'));
  const custom = c.req.query('symbols');
  const count = tier === 'top50' ? 50 : tier === 'top25' ? 25 : 10;

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

    // dataSource اکنون داخل runScanner از اختلاف آمار پروایدر محاسبه می‌شود
    const result = await runScanner(binanceProvider, symbols, tf, 5);
    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Liquidity
app.get('/api/liquidity', async (c) => {
  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));

  try {
    const [klines, daily] = await Promise.all([
      binanceProvider.getKlines(symbol, tf, 200),
      binanceProvider.getKlines(symbol, '1d', 30),
    ]);
    const levels = detectLiquidityLevels(klines, tf, {}, daily);
    const sweeps = detectLiquiditySweeps(klines, levels, tf);

    return c.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      levels,
      sweeps,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Structure
app.get('/api/structure', async (c) => {
  const symbol = sanitizeSymbol(c.req.query('symbol'));
  const tf = sanitizeTimeframe(c.req.query('tf'));

  try {
    const klines = await binanceProvider.getKlines(symbol, tf, 200);
    const structure = analyzeMarketStructure(klines, tf);
    return c.json({ symbol, timeframe: tf, structure, timestamp: Date.now() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Derivatives
app.get('/api/derivatives', async (c) => {
  const symbol = sanitizeSymbol(c.req.query('symbol'));
  try {
    const [rawDeriv, klines] = await Promise.all([
      binanceProvider.getDerivativesData(symbol),
      binanceProvider.getKlines(symbol, '15m', 30),
    ]);
    const enriched = enrichDerivativesData(rawDeriv, klines);
    return c.json(enriched);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
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
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const symbol = sanitizeSymbol(String(body.symbol ?? ''));
  const tf = sanitizeTimeframe(body.timeframe ? String(body.timeframe) : null);
  const minScore = clampLimit(String(body.minScore ?? ''), { min: 0, max: 100, fallback: 65 });
  const candleLimit = clampLimit(String(body.candleLimit ?? ''), LIMITS.backtestCandleLimit);

  try {
    const klines = await binanceProvider.getKlines(symbol, tf, candleLimit);
    if (klines.length < 60) {
      return c.json({ error: 'کندل کافی برای بک‌تست در دسترس نیست', status: 'INSUFFICIENT_DATA' }, 422);
    }
    const report = runBacktest(symbol, tf, klines, { minScore });
    return c.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Cloudflare Worker Handler
const workerHandler = {
  fetch: app.fetch,

  // Cron trigger scheduled handler (Runs every minute)
  async scheduled(event: { cron: string; scheduledTime: number }) {
    console.log(`[Cron Trigger] Scanning crypto market at: ${new Date(event.scheduledTime).toISOString()}`);
    try {
      const symbols = await binanceProvider.getTopSymbols(10);
      const scanResults = await runScanner(binanceProvider, symbols, '15m', 4);
      console.log(`[Cron Scan Complete] ${scanResults.signals.length} symbols analyzed. Longs: ${scanResults.summary.longs}, Shorts: ${scanResults.summary.shorts}`);
    } catch (err) {
      console.error('[Cron Scan Error]', err);
    }
  },
};

export default workerHandler;
