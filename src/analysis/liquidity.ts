import { Kline, LiquidityLevel, Timeframe } from '../types/market';
import { findConfirmedPivots } from './pivots';

export interface LiquidityConfig {
  equalHighThresholdPercent: number; // e.g. 0.2%
  pivotLeftBars: number;
  pivotRightBars: number;
}

const DEFAULT_CONFIG: LiquidityConfig = {
  equalHighThresholdPercent: 0.25,
  pivotLeftBars: 3,
  pivotRightBars: 2,
};

export function detectLiquidityLevels(
  klines: Kline[],
  timeframe: Timeframe = '15m',
  config: Partial<LiquidityConfig> = {},
  dailyKlines: Kline[] = []
): LiquidityLevel[] {
  if (!klines || klines.length < 10) return [];

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const currentPrice = klines[klines.length - 1].close;
  const levels: LiquidityLevel[] = [];

  // 1. Confirmed Swing Highs & Lows
  const { swingHighs, swingLows } = findConfirmedPivots(
    klines,
    cfg.pivotLeftBars,
    cfg.pivotRightBars
  );

  // Recent swing highs
  swingHighs.slice(-10).forEach((sh) => {
    const isSwept = klines.slice(sh.confirmedAt).some((k) => k.high > sh.price);
    const dist = ((sh.price - currentPrice) / currentPrice) * 100;
    levels.push({
      price: sh.price,
      type: 'SWING_HIGH',
      strength: sh.strength,
      swept: isSwept,
      distancePercent: parseFloat(dist.toFixed(2)),
      timestamp: sh.time,
      timeframe,
    });
  });

  // Recent swing lows
  swingLows.slice(-10).forEach((sl) => {
    const isSwept = klines.slice(sl.confirmedAt).some((k) => k.low < sl.price);
    const dist = ((sl.price - currentPrice) / currentPrice) * 100;
    levels.push({
      price: sl.price,
      type: 'SWING_LOW',
      strength: sl.strength,
      swept: isSwept,
      distancePercent: parseFloat(dist.toFixed(2)),
      timestamp: sl.time,
      timeframe,
    });
  });

  // 2. Equal Highs (EQH) - Major Liquidity Pool
  for (let i = 0; i < swingHighs.length; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const sh1 = swingHighs[i];
      const sh2 = swingHighs[j];
      const diffPct = Math.abs(sh1.price - sh2.price) / sh1.price * 100;

      if (diffPct <= cfg.equalHighThresholdPercent) {
        const avgPrice = (sh1.price + sh2.price) / 2;
        const isSwept = klines.slice(sh2.confirmedAt).some((k) => k.high > avgPrice);
        const dist = ((avgPrice - currentPrice) / currentPrice) * 100;

        levels.push({
          price: avgPrice,
          type: 'EQUAL_HIGH',
          strength: 92, // Equal highs form prime stop-loss pools
          swept: isSwept,
          distancePercent: parseFloat(dist.toFixed(2)),
          timestamp: sh2.time,
          timeframe,
        });
      }
    }
  }

  // 3. Equal Lows (EQL) - Major Liquidity Pool
  for (let i = 0; i < swingLows.length; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const sl1 = swingLows[i];
      const sl2 = swingLows[j];
      const diffPct = Math.abs(sl1.price - sl2.price) / sl1.price * 100;

      if (diffPct <= cfg.equalHighThresholdPercent) {
        const avgPrice = (sl1.price + sl2.price) / 2;
        const isSwept = klines.slice(sl2.confirmedAt).some((k) => k.low < avgPrice);
        const dist = ((avgPrice - currentPrice) / currentPrice) * 100;

        levels.push({
          price: avgPrice,
          type: 'EQUAL_LOW',
          strength: 92,
          swept: isSwept,
          distancePercent: parseFloat(dist.toFixed(2)),
          timestamp: sl2.time,
          timeframe,
        });
      }
    }
  }

  // 4. Previous Day High (PDH) and Low (PDL) if daily klines provided
  if (dailyKlines && dailyKlines.length >= 2) {
    const prevDay = dailyKlines[dailyKlines.length - 2];
    const pdhSwept = klines.some((k) => k.timestamp >= prevDay.closeTime && k.high > prevDay.high);
    const pdlSwept = klines.some((k) => k.timestamp >= prevDay.closeTime && k.low < prevDay.low);

    levels.push({
      price: prevDay.high,
      type: 'PREVIOUS_DAY_HIGH',
      strength: 88,
      swept: pdhSwept,
      distancePercent: parseFloat((((prevDay.high - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: prevDay.timestamp,
    });

    levels.push({
      price: prevDay.low,
      type: 'PREVIOUS_DAY_LOW',
      strength: 88,
      swept: pdlSwept,
      distancePercent: parseFloat((((prevDay.low - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: prevDay.timestamp,
    });
  }

  // Deduplicate very close levels
  const uniqueLevels: LiquidityLevel[] = [];
  levels.sort((a, b) => b.strength - a.strength);

  for (const lvl of levels) {
    const isDuplicate = uniqueLevels.some(
      (u) => Math.abs(u.price - lvl.price) / u.price < 0.0015 && u.type === lvl.type
    );
    if (!isDuplicate) {
      uniqueLevels.push(lvl);
    }
  }

  return uniqueLevels;
}
