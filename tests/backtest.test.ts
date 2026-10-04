import { runBacktest } from '../src/backtest/engine';
import { Kline } from '../src/types/market';

export function testBacktestEngine() {
  console.log('Testing Backtest Engine & Walk-Forward Validation...');

  // Generate 200 synthetic candles with simulated market waves
  const klines: Kline[] = [];
  let price = 50000;

  for (let i = 0; i < 200; i++) {
    const wave = Math.sin(i / 10) * 400;
    const open = price;
    const close = open + wave + (Math.random() - 0.45) * 100;
    const high = Math.max(open, close) + 80;
    const low = Math.min(open, close) - 80;
    const volume = 200 + Math.random() * 300;

    klines.push({
      timestamp: 1700000000000 + i * 15 * 60000,
      open,
      high,
      low,
      close,
      volume,
      closeTime: 1700000000000 + (i + 1) * 15 * 60000 - 1,
      quoteVolume: volume * close,
      trades: 150,
      takerBuyBaseVolume: volume * 0.52,
      takerBuyQuoteVolume: volume * close * 0.52,
    });

    price = close;
  }

  const report = runBacktest('BTCUSDT', '15m', klines, { minScore: 55 });

  if (report.candlesAnalyzed !== 200) {
    throw new Error(`Expected 200 candles analyzed, got ${report.candlesAnalyzed}`);
  }

  if (!report.overallMetrics) {
    throw new Error('Expected overall metrics in backtest report');
  }

  if (!report.walkForward.training || !report.walkForward.validation || !report.walkForward.outOfSample) {
    throw new Error('Expected 3-way walk-forward validation segments');
  }

  console.log(`✓ Backtest & Walk-Forward passed (Analyzed ${report.candlesAnalyzed} bars, generated ${report.overallMetrics.totalTrades} simulated trades with 3-split validation).`);
}
