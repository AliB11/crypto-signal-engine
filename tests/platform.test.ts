import { parseSymbolParam, parseTimeframeParam, parseIntParam, parseWeightsParam, checkRateLimit } from '../src/lib/http';
import { resampleKlines } from '../src/lib/resample';
import { calculateBacktestMetrics } from '../src/backtest/metrics';
import { BacktestTrade } from '../src/types/market';
import { makeKlines } from './analysis.test';

/** آزمون اعتبارسنجی ورودی‌های API (پاک‌سازی نماد، تایم‌فریم و محدودهٔ اعداد) */
export function testApiValidation() {
  console.log('Testing API input validation...');

  if (parseSymbolParam('<script>alert(1)</script>') !== 'SCRIPTALERT1SCRIPT') {
    // نماد باید فقط حروف و ارقام داشته باشد
    if (parseSymbolParam('BTC/USDT; DROP TABLE') !== 'BTCUSDTDROPTABLE') {
      throw new Error('Symbol sanitisation failed');
    }
  }
  if (parseSymbolParam('') !== 'BTCUSDT') throw new Error('Empty symbol must fall back to BTCUSDT');
  if (parseSymbolParam(null) !== 'BTCUSDT') throw new Error('Null symbol must fall back to BTCUSDT');

  if (parseTimeframeParam('7m') !== '15m') throw new Error('Invalid timeframe must fall back to 15m');
  if (parseTimeframeParam('4h') !== '4h') throw new Error('Valid timeframe must pass through');

  if (parseIntParam('99999', { min: 60, max: 1000, fallback: 200 }) !== 1000) {
    throw new Error('Numeric limits must clamp to max');
  }
  if (parseIntParam('abc', { min: 5, max: 10, fallback: 7 }) !== 7) {
    throw new Error('Non-numeric values must fall back');
  }

  const weights = parseWeightsParam('{"liquidity":0.5,"marketStructure":5,"bad":0.3}', {
    liquidity: 0,
    marketStructure: 0,
    multiTimeframe: 0,
  });
  if (!weights || weights.liquidity !== 0.5 || 'marketStructure' in weights) {
    throw new Error('Weight parsing must accept valid values and reject out-of-range ones');
  }

  console.log('✓ API validation passed (symbol, timeframe, numeric bounds, weight parsing).');
}

/** آزمون محدودساز نرخ درخواست */
export function testRateLimiter() {
  console.log('Testing in-memory rate limiter...');

  const key = `test-${Date.now()}`;
  let allowed = 0;
  for (let i = 0; i < 5; i++) {
    if (checkRateLimit(key, 3, 60_000).allowed) allowed++;
  }
  if (allowed !== 3) {
    throw new Error(`Expected exactly 3 allowed requests out of 5, got ${allowed}`);
  }
  const blocked = checkRateLimit(key, 3, 60_000);
  if (blocked.allowed || blocked.retryAfterSeconds <= 0) {
    throw new Error('Expected the fourth request to be blocked with a retry hint');
  }

  console.log('✓ Rate limiter passed (token bucket blocks after the limit and reports retry).');
}

/** آزمون بازنمونه‌گیری کندل‌ها (مبنای تحلیل چندتایم‌فریم در بک‌تست) */
export function testResampling() {
  console.log('Testing kline resampling for multi-timeframe backtests...');

  const price = 100;
  const klines = makeKlines(
    Array.from({ length: 240 }, (_, i) => {
      const open = price + i * 0.1;
      return { open, high: open + 0.5, low: open - 0.5, close: open + 0.2, volume: 10 };
    })
  );

  const hourly = resampleKlines(klines, '1h');
  if (hourly.length !== 60) {
    throw new Error(`Expected 60 hourly candles from 240 15m candles, got ${hourly.length}`);
  }
  const firstHourOpen = hourly[0].open;
  if (firstHourOpen !== klines[0].open) {
    throw new Error('Aggregated candle must open at the first sub-candle open');
  }

  const firstHourVolume = hourly[0].volume;
  if (Math.abs(firstHourVolume - 40) > 1e-6) {
    throw new Error(`Expected aggregated volume 40, got ${firstHourVolume}`);
  }

  const firstHourHigh = hourly[0].high;
  const expectedHigh = Math.max(...klines.slice(0, 4).map((k) => k.high));
  if (firstHourHigh !== expectedHigh) {
    throw new Error('Aggregated high must equal the highest sub-candle high');
  }

  console.log('✓ Resampling passed (OHLCV aggregation is correct for MTF backtests).');
}

/** آزمون سالانه‌سازی درست Sharpe/Sortino و انتظار ریاضی به واحد R */
export function testRiskMetrics() {
  console.log('Testing risk metric annualisation...');

  const base: Omit<BacktestTrade, 'id' | 'entryTime' | 'exitTime'> = {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    direction: 'LONG',
    entryPrice: 100,
    stopLoss: 99,
    tp1: 101.5,
    tp2: 102.5,
    tp3: 104,
    exitPrice: 101.5,
    exitReason: 'TP1',
    pnlPercent: 1.5,
    rrRealized: 1.5,
    status: 'WIN',
    score: 80,
    reasons: [],
    holdCandles: 12,
  };

  const trades: BacktestTrade[] = Array.from({ length: 40 }, (_, i) => ({
    ...base,
    id: `t${i}`,
    entryTime: 1700000000000 + i * 900_000,
    exitTime: 1700000000000 + i * 900_000 + 900_000 * 12,
    rrRealized: i % 3 === 0 ? -1 : 1.5,
    status: i % 3 === 0 ? 'LOSS' : 'WIN',
    pnlPercent: i % 3 === 0 ? -1 : 1.5,
  }));

  const metrics15m = calculateBacktestMetrics(trades, 10000, '15m');
  const metrics1d = calculateBacktestMetrics(trades, 10000, '1d');

  if (metrics15m.totalTrades !== 40) throw new Error('Expected 40 trades in the metrics');
  if (!(metrics15m.sharpeRatio > 0)) throw new Error('Expected a positive Sharpe ratio for a profitable edge');
  if (!(metrics15m.sharpeRatio > metrics1d.sharpeRatio)) {
    throw new Error('Sharpe annualisation must scale with the timeframe (15m > 1d for the same trade list)');
  }
  if (Math.abs(metrics15m.expectancy - (0.65 * 1.5 - 0.35 * 1.0)) > 0.2) {
    throw new Error(`Expectancy must be expressed in R units, got ${metrics15m.expectancy}`);
  }

  console.log(
    `✓ Risk metrics passed (Sharpe 15m ${metrics15m.sharpeRatio} vs 1d ${metrics1d.sharpeRatio}, expectancy ${metrics15m.expectancy}R).`
  );
}
