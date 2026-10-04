import { detectLiquiditySweeps } from '../src/analysis/sweeps';
import { Kline, LiquidityLevel } from '../src/types/market';

function createMockKline(index: number, open: number, high: number, low: number, close: number, volume = 100): Kline {
  return {
    timestamp: 1700000000000 + index * 60000,
    open,
    high,
    low,
    close,
    volume,
    closeTime: 1700000000000 + (index + 1) * 60000 - 1,
    quoteVolume: volume * close,
    trades: 50,
    takerBuyBaseVolume: volume * 0.5,
    takerBuyQuoteVolume: volume * close * 0.5,
  };
}

export function testSweepDetection() {
  console.log('Testing Liquidity Sweep Engine...');

  const levels: LiquidityLevel[] = [
    {
      price: 100,
      type: 'SWING_LOW',
      strength: 90,
      swept: false,
      distancePercent: 0,
      timestamp: 1700000000000,
      timeframe: '15m',
    },
  ];

  // Candle 0-3: Range above 100
  // Candle 4: Dips to 99 (piercing 100 by 1%), wicks, and reclaims close at 101 with volume spike
  const klines: Kline[] = [
    createMockKline(0, 105, 106, 104, 105),
    createMockKline(1, 105, 105, 102, 103),
    createMockKline(2, 103, 104, 101, 102),
    createMockKline(3, 102, 103, 100.5, 101),
    createMockKline(4, 101, 102, 99.0, 101.5, 250), // Sell-side Sweep!
  ];

  const sweeps = detectLiquiditySweeps(klines, levels, '15m');

  if (sweeps.length !== 1) {
    throw new Error(`Expected 1 Sell-side sweep, found ${sweeps.length}`);
  }

  const s = sweeps[0];
  if (s.type !== 'SELL_SIDE_SWEEP') {
    throw new Error(`Expected SELL_SIDE_SWEEP, got ${s.type}`);
  }

  if (s.sweepExtremePrice !== 99.0) {
    throw new Error(`Expected extreme price 99.0, got ${s.sweepExtremePrice}`);
  }

  console.log('✓ Liquidity Sweep Detection passed (Sell-side sweep confirmed with wick reclaim and volume surge).');
}
