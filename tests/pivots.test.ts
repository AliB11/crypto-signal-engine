import { findConfirmedPivots } from '../src/analysis/pivots';
import { Kline } from '../src/types/market';

function createMockKline(index: number, open: number, high: number, low: number, close: number): Kline {
  return {
    timestamp: 1700000000000 + index * 60000,
    open,
    high,
    low,
    close,
    volume: 100,
    closeTime: 1700000000000 + (index + 1) * 60000 - 1,
    quoteVolume: 100 * close,
    trades: 50,
    takerBuyBaseVolume: 50,
    takerBuyQuoteVolume: 50 * close,
  };
}

export function testPivotDetection() {
  console.log('Testing Confirmed Pivot Detection (No Look-Ahead Bias)...');

  // Create a 10-candle series with a clear peak at index 3 (High = 110)
  const klines: Kline[] = [
    createMockKline(0, 100, 102, 99, 101),
    createMockKline(1, 101, 104, 100, 103),
    createMockKline(2, 103, 107, 102, 106),
    createMockKline(3, 106, 110, 105, 108), // PEAK HIGH = 110
    createMockKline(4, 108, 106, 103, 104),
    createMockKline(5, 104, 103, 100, 101), // CONFIRMATION CANDLE (rightBars = 2, so at index 5)
    createMockKline(6, 101, 102, 98, 99),
  ];

  const { swingHighs } = findConfirmedPivots(klines, 2, 2);

  if (swingHighs.length !== 1) {
    throw new Error(`Expected 1 swing high, found ${swingHighs.length}`);
  }

  const pivot = swingHighs[0];
  if (pivot.price !== 110) {
    throw new Error(`Expected pivot price 110, got ${pivot.price}`);
  }

  if (pivot.index !== 3) {
    throw new Error(`Expected pivot index 3, got ${pivot.index}`);
  }

  if (pivot.confirmedAt !== 5) {
    throw new Error(`Expected confirmedAt = 5, got ${pivot.confirmedAt}`);
  }

  console.log('✓ Confirmed Pivot Detection passed (Pivot accurately confirmed at i+rightBars with zero look-ahead bias).');
}
