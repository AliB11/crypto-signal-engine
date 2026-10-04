import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BinanceProvider } from './providers/BinanceProvider';
import { CoinGeckoProvider } from './providers/CoinGeckoProvider';
import { runFullAnalysis } from './analysis/engine';
import { runScanner } from './analysis/scanner';
import { detectLiquidityLevels } from './analysis/liquidity';
import { detectLiquiditySweeps } from './analysis/sweeps';
import { analyzeMarketStructure } from './analysis/structure';
import { enrichDerivativesData } from './analysis/derivatives';
import { runBacktest } from './backtest/engine';
import { DEFAULT_WEIGHTS } from './analysis/signal';
import { Timeframe } from './types/market';

const app = new Hono();
const binanceProvider = new BinanceProvider();
const coingeckoProvider = new CoinGeckoProvider();

app.use('*', cors());

// Health Check
app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    status: 'healthy',
    service: 'crypto-advanced-signal-scanner',
    runtime: 'cloudflare-worker-serverless',
    database: 'none (in-memory zero-db)',
    timestamp: new Date().toISOString(),
  });
});

// Market Ticker
app.get('/api/market', async (c) => {
  const symbol = c.req.query('symbol') || 'BTCUSDT';
  try {
    const ticker = await binanceProvider.getTicker24h(symbol);
    const metadata = await binanceProvider.getMetadata(symbol);
    return c.json({ symbol, ticker, metadata, timestamp: Date.now() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Full Deep Analysis
app.get('/api/analyze', async (c) => {
  const symbol = c.req.query('symbol') || 'BTCUSDT';
  const tf = (c.req.query('tf') || '15m') as Timeframe;
  try {
    const res = await runFullAnalysis(binanceProvider, symbol, { timeframe: tf, candleLimit: 200 });
    return c.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Signals
app.get('/api/signals', async (c) => {
  const symbolsParam = c.req.query('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT';
  const tf = (c.req.query('tf') || '15m') as Timeframe;
  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());

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
  const tf = (c.req.query('tf') || '15m') as Timeframe;
  const count = tier === 'top50' ? 50 : tier === 'top25' ? 25 : 10;

  try {
    const symbols = await binanceProvider.getTopSymbols(count);
    const result = await runScanner(binanceProvider, symbols, tf, 5);
    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// Liquidity
app.get('/api/liquidity', async (c) => {
  const symbol = c.req.query('symbol') || 'BTCUSDT';
  const tf = (c.req.query('tf') || '15m') as Timeframe;

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
  const symbol = c.req.query('symbol') || 'BTCUSDT';
  const tf = (c.req.query('tf') || '15m') as Timeframe;

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
  const symbol = c.req.query('symbol') || 'BTCUSDT';
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

// Config
app.get('/api/config', (c) => {
  return c.json({
    version: '1.0.0',
    weights: DEFAULT_WEIGHTS,
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    sessions: {
      asian: { startHourUTC: 0, endHourUTC: 8, name: 'Asian (Tokyo / Sydney)' },
      london: { startHourUTC: 7, endHourUTC: 15, name: 'London (European)' },
      newYork: { startHourUTC: 13, endHourUTC: 21, name: 'New York (US)' },
    },
    defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT'],
  });
});

// Backtest
app.post('/api/backtest', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
  const tf = (body.timeframe || '15m') as Timeframe;
  const minScore = body.minScore ? Number(body.minScore) : 65;

  try {
    const klines = await binanceProvider.getKlines(symbol, tf, 500);
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
