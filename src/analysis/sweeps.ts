import { Kline, LiquidityLevel, LiquiditySweep, Timeframe } from '../types/market';

export interface SweepConfig {
  minPenetrationPercent: number; // e.g. 0.05%
  maxPenetrationPercent: number; // e.g. 3.0% (if too deep, it's a trend breakout, not a sweep)
  minWickToBodyRatio: number; // e.g. 0.4
  volumeMultiplierThreshold: number; // e.g. 1.15
}

const DEFAULT_SWEEP_CONFIG: SweepConfig = {
  minPenetrationPercent: 0.04,
  maxPenetrationPercent: 2.5,
  minWickToBodyRatio: 0.4,
  volumeMultiplierThreshold: 1.1,
};

export function detectLiquiditySweeps(
  klines: Kline[],
  levels: LiquidityLevel[],
  timeframe: Timeframe = '15m',
  config: Partial<SweepConfig> = {}
): LiquiditySweep[] {
  if (!klines || klines.length < 5 || !levels || levels.length === 0) return [];

  const cfg = { ...DEFAULT_SWEEP_CONFIG, ...config };
  const sweeps: LiquiditySweep[] = [];

  // Calculate volume SMA for volume confirmation
  const avgVolume =
    klines.slice(-30).reduce((sum, k) => sum + k.volume, 0) / Math.min(30, klines.length);

  // Focus on the most recent 30 candles for active setups
  const searchStart = Math.max(0, klines.length - 40);

  for (let i = searchStart; i < klines.length; i++) {
    const candle = klines[i];
    const prevCandle = klines[i - 1];
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const isVolumeConfirmed = candle.volume >= avgVolume * cfg.volumeMultiplierThreshold;

    for (const lvl of levels) {
      // سطح باید *پیش از* این کندل هم تشکیل شده باشد و هم تأیید شده باشد.
      // استفاده از timestamp تشکیل (به‌جای زمان تأیید پیوت) یک خطای آینده‌نگری پنهان بود:
      // پیوتی که ۲ کندل بعد تأیید می‌شود، نباید در همان ۲ کندلِ بعدی به‌عنوان سطح
      // «قابل سوئیپ» شناخته شود.
      const levelVisibleFrom = lvl.confirmedTimestamp ?? lvl.timestamp;
      if (levelVisibleFrom > candle.timestamp) continue;

      // 1. SELL-SIDE LIQUIDITY SWEEP (Bullish reversal trigger)
      if (
        lvl.type === 'SWING_LOW' ||
        lvl.type === 'EQUAL_LOW' ||
        lvl.type === 'PREVIOUS_DAY_LOW' ||
        lvl.type === 'SESSION_LOW' ||
        lvl.type === 'LOCAL_LOW'
      ) {
        // Did this candle pierce below the level?
        if (candle.low < lvl.price) {
          const penetration = ((lvl.price - candle.low) / lvl.price) * 100;

          if (
            penetration >= cfg.minPenetrationPercent &&
            penetration <= cfg.maxPenetrationPercent
          ) {
            // Case A: Intracandle sweep & reclaim (wicked down and closed back above)
            const sameCandleReclaim = candle.close >= lvl.price * 0.999;
            const hasStrongLowerWick = lowerWick >= (bodySize > 0 ? bodySize * cfg.minWickToBodyRatio : lowerWick * 0.6);

            // Case B: Pierced on prev candle, reclaimed on current candle
            const multiCandleReclaim =
              prevCandle && prevCandle.low < lvl.price && candle.close > lvl.price;

            if ((sameCandleReclaim && hasStrongLowerWick) || multiCandleReclaim) {
              const wickRatio = bodySize > 0 ? lowerWick / bodySize : 2.0;

              sweeps.push({
                type: 'SELL_SIDE_SWEEP',
                levelPrice: lvl.price,
                levelType: lvl.type,
                sweepExtremePrice: candle.low,
                reclaimPrice: candle.close,
                penetrationPercent: parseFloat(penetration.toFixed(2)),
                wickToBodyRatio: parseFloat(wickRatio.toFixed(2)),
                candleIndex: i,
                timestamp: candle.timestamp,
                volumeConfirmed: isVolumeConfirmed,
                timeframe,
              });
            }
          }
        }
      }

      // 2. BUY-SIDE LIQUIDITY SWEEP (Bearish reversal trigger)
      if (
        lvl.type === 'SWING_HIGH' ||
        lvl.type === 'EQUAL_HIGH' ||
        lvl.type === 'PREVIOUS_DAY_HIGH' ||
        lvl.type === 'SESSION_HIGH' ||
        lvl.type === 'LOCAL_HIGH'
      ) {
        // Did this candle pierce above the level?
        if (candle.high > lvl.price) {
          const penetration = ((candle.high - lvl.price) / lvl.price) * 100;

          if (
            penetration >= cfg.minPenetrationPercent &&
            penetration <= cfg.maxPenetrationPercent
          ) {
            // Case A: Intracandle sweep & reclaim (wicked up and closed back below)
            const sameCandleReclaim = candle.close <= lvl.price * 1.001;
            const hasStrongUpperWick = upperWick >= (bodySize > 0 ? bodySize * cfg.minWickToBodyRatio : upperWick * 0.6);

            // Case B: Pierced on prev candle, closed back below on current candle
            const multiCandleReclaim =
              prevCandle && prevCandle.high > lvl.price && candle.close < lvl.price;

            if ((sameCandleReclaim && hasStrongUpperWick) || multiCandleReclaim) {
              const wickRatio = bodySize > 0 ? upperWick / bodySize : 2.0;

              sweeps.push({
                type: 'BUY_SIDE_SWEEP',
                levelPrice: lvl.price,
                levelType: lvl.type,
                sweepExtremePrice: candle.high,
                reclaimPrice: candle.close,
                penetrationPercent: parseFloat(penetration.toFixed(2)),
                wickToBodyRatio: parseFloat(wickRatio.toFixed(2)),
                candleIndex: i,
                timestamp: candle.timestamp,
                volumeConfirmed: isVolumeConfirmed,
                timeframe,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate sweeps occurring within 2 candles on the same level
  const uniqueSweeps: LiquiditySweep[] = [];
  for (const s of sweeps) {
    const isDup = uniqueSweeps.some(
      (u) =>
        u.type === s.type &&
        Math.abs(u.levelPrice - s.levelPrice) / s.levelPrice < 0.001 &&
        Math.abs(u.candleIndex - s.candleIndex) <= 2
    );
    if (!isDup) {
      uniqueSweeps.push(s);
    }
  }

  return uniqueSweeps;
}
