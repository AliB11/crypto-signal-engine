import { Kline, SwingPoint } from '../types/market';

/**
 * Confirmed Pivot Point Detection (No Look-Ahead Bias)
 *
 * A pivot at index `i` requires `leftBars` bars before it and `rightBars` bars after it
 * with lower highs (for swing high) or higher lows (for swing low).
 *
 * In real-time analysis, pivot `i` is ONLY confirmed when candle `i + rightBars` has closed.
 */
export function findConfirmedPivots(
  klines: Kline[],
  leftBars = 3,
  rightBars = 2,
  maxIndex?: number
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  const limit = maxIndex !== undefined ? Math.min(maxIndex, klines.length - 1) : klines.length - 1;

  for (let i = leftBars; i <= limit - rightBars; i++) {
    const currentHigh = klines[i].high;
    const currentLow = klines[i].low;

    // Check Swing High
    let isHigh = true;
    for (let l = 1; l <= leftBars; l++) {
      if (klines[i - l].high >= currentHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let r = 1; r <= rightBars; r++) {
        if (klines[i + r].high > currentHigh) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      const volRatio = klines[i].volume / (klines[i - 1]?.volume || 1);
      swingHighs.push({
        index: i,
        time: klines[i].timestamp,
        price: currentHigh,
        type: 'SWING_HIGH',
        confirmedAt: i + rightBars,
        strength: Math.min(100, Math.round(50 + volRatio * 20)),
      });
    }

    // Check Swing Low
    let isLow = true;
    for (let l = 1; l <= leftBars; l++) {
      if (klines[i - l].low <= currentLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let r = 1; r <= rightBars; r++) {
        if (klines[i + r].low < currentLow) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      const volRatio = klines[i].volume / (klines[i - 1]?.volume || 1);
      swingLows.push({
        index: i,
        time: klines[i].timestamp,
        price: currentLow,
        type: 'SWING_LOW',
        confirmedAt: i + rightBars,
        strength: Math.min(100, Math.round(50 + volRatio * 20)),
      });
    }
  }

  return { swingHighs, swingLows };
}
