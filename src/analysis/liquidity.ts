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

/** اولین زمانی که سطح پس از تأیید، سوئیپ شده است (برای شفافیت و پرهیز از آینده‌نگری) */
function findSweepTime(
  klines: Kline[],
  fromIndex: number,
  predicate: (k: Kline) => boolean
): number | undefined {
  for (let i = Math.max(0, fromIndex); i < klines.length; i++) {
    if (predicate(klines[i])) return klines[i].timestamp;
  }
  return undefined;
}

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

  // ۱. سقف‌ها و کف‌های نوسانی تأییدشده
  const { swingHighs, swingLows } = findConfirmedPivots(
    klines,
    cfg.pivotLeftBars,
    cfg.pivotRightBars
  );

  swingHighs.slice(-10).forEach((sh) => {
    const sweptAt = findSweepTime(klines, sh.confirmedAt, (k) => k.high > sh.price);
    const dist = ((sh.price - currentPrice) / currentPrice) * 100;
    levels.push({
      price: sh.price,
      type: 'SWING_HIGH',
      strength: sh.strength,
      swept: sweptAt !== undefined,
      sweptAt,
      distancePercent: parseFloat(dist.toFixed(2)),
      timestamp: sh.time,
      confirmedTimestamp: klines[sh.confirmedAt]?.timestamp,
      timeframe,
    });
  });

  swingLows.slice(-10).forEach((sl) => {
    const sweptAt = findSweepTime(klines, sl.confirmedAt, (k) => k.low < sl.price);
    const dist = ((sl.price - currentPrice) / currentPrice) * 100;
    levels.push({
      price: sl.price,
      type: 'SWING_LOW',
      strength: sl.strength,
      swept: sweptAt !== undefined,
      sweptAt,
      distancePercent: parseFloat(dist.toFixed(2)),
      timestamp: sl.time,
      confirmedTimestamp: klines[sl.confirmedAt]?.timestamp,
      timeframe,
    });
  });

  // ۲. سقف‌های برابر (EQH) — استخر نقدینگی اصلی
  for (let i = 0; i < swingHighs.length; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const sh1 = swingHighs[i];
      const sh2 = swingHighs[j];
      const diffPct = (Math.abs(sh1.price - sh2.price) / sh1.price) * 100;

      if (diffPct <= cfg.equalHighThresholdPercent) {
        const avgPrice = (sh1.price + sh2.price) / 2;
        const confirmedAt = Math.max(sh1.confirmedAt, sh2.confirmedAt);
        const isSwept = klines.slice(confirmedAt).some((k) => k.high > avgPrice);
        const dist = ((avgPrice - currentPrice) / currentPrice) * 100;

        levels.push({
          price: avgPrice,
          type: 'EQUAL_HIGH',
          strength: 92, // سقف‌های برابر، مخزن اصلی حد ضرر فروشندگان
          swept: isSwept,
          sweptAt: findSweepTime(klines, confirmedAt, (k) => k.high > avgPrice),
          distancePercent: parseFloat(dist.toFixed(2)),
          timestamp: sh2.time,
          confirmedTimestamp: klines[confirmedAt]?.timestamp,
          timeframe,
        });
      }
    }
  }

  // ۳. کف‌های برابر (EQL)
  for (let i = 0; i < swingLows.length; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const sl1 = swingLows[i];
      const sl2 = swingLows[j];
      const diffPct = (Math.abs(sl1.price - sl2.price) / sl1.price) * 100;

      if (diffPct <= cfg.equalHighThresholdPercent) {
        const avgPrice = (sl1.price + sl2.price) / 2;
        const confirmedAt = Math.max(sl1.confirmedAt, sl2.confirmedAt);
        const isSwept = klines.slice(confirmedAt).some((k) => k.low < avgPrice);
        const dist = ((avgPrice - currentPrice) / currentPrice) * 100;

        levels.push({
          price: avgPrice,
          type: 'EQUAL_LOW',
          strength: 92,
          swept: isSwept,
          sweptAt: findSweepTime(klines, confirmedAt, (k) => k.low < avgPrice),
          distancePercent: parseFloat(dist.toFixed(2)),
          timestamp: sl2.time,
          confirmedTimestamp: klines[confirmedAt]?.timestamp,
          timeframe,
        });
      }
    }
  }

  // ۴. سقف/کف روز قبل (PDH/PDL)
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
      confirmedTimestamp: prevDay.closeTime,
      timeframe,
    });

    levels.push({
      price: prevDay.low,
      type: 'PREVIOUS_DAY_LOW',
      strength: 88,
      swept: pdlSwept,
      distancePercent: parseFloat((((prevDay.low - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: prevDay.timestamp,
      confirmedTimestamp: prevDay.closeTime,
      timeframe,
    });
  }

  // ۵. سقف/کف هفتهٔ قبل (PWH/PWL)
  // این سطوح در مستندات و README وعده داده شده بودند اما هیچ‌گاه محاسبه نمی‌شدند.
  if (dailyKlines && dailyKlines.length >= 8) {
    const currentWeekStart = startOfUtcWeek(dailyKlines[dailyKlines.length - 1].timestamp);
    const prevWeekDays = dailyKlines.filter((k) => {
      const weekStart = startOfUtcWeek(k.timestamp);
      return weekStart < currentWeekStart && weekStart >= currentWeekStart - 7 * 86_400_000;
    });

    if (prevWeekDays.length > 0) {
      const pwHigh = Math.max(...prevWeekDays.map((k) => k.high));
      const pwLow = Math.min(...prevWeekDays.map((k) => k.low));
      const lastWeekDay = prevWeekDays[prevWeekDays.length - 1];

      levels.push({
        price: pwHigh,
        type: 'PREVIOUS_WEEK_HIGH',
        strength: 90,
        swept: klines.some((k) => k.timestamp >= lastWeekDay.closeTime && k.high > pwHigh),
        distancePercent: parseFloat((((pwHigh - currentPrice) / currentPrice) * 100).toFixed(2)),
        timestamp: lastWeekDay.timestamp,
        confirmedTimestamp: lastWeekDay.closeTime,
        timeframe,
      });

      levels.push({
        price: pwLow,
        type: 'PREVIOUS_WEEK_LOW',
        strength: 90,
        swept: klines.some((k) => k.timestamp >= lastWeekDay.closeTime && k.low < pwLow),
        distancePercent: parseFloat((((pwLow - currentPrice) / currentPrice) * 100).toFixed(2)),
        timestamp: lastWeekDay.timestamp,
        confirmedTimestamp: lastWeekDay.closeTime,
        timeframe,
      });
    }
  }

  // حذف سطوح هم‌مکان:
  //   ۱) سطوحی که هم‌نوع و تقریباً هم‌قیمت‌اند یکپارچه می‌شوند.
  //   ۲) سطوح عمومی (سقف/کف نوسانی) که روی یک سطح «مهم» (EQH/EQL/PDH/PDL/PWH/PWL)
  //      قرار می‌گیرند حذف می‌شوند تا نقشهٔ نقدینگی خوانا بماند — سطوح مهم دست‌نخورده می‌مانند
  //      چون معیارهای لایهٔ ۱ (فاصله تا PDH/PDL) به آن‌ها وابسته است.
  const SIGNIFICANT_TYPES: LiquidityLevel['type'][] = [
    'EQUAL_HIGH',
    'EQUAL_LOW',
    'PREVIOUS_DAY_HIGH',
    'PREVIOUS_DAY_LOW',
    'PREVIOUS_WEEK_HIGH',
    'PREVIOUS_WEEK_LOW',
  ];

  const sorted = [...levels].sort((a, b) => b.strength - a.strength);
  const uniqueLevels: LiquidityLevel[] = [];

  for (const lvl of sorted) {
    const isSameTypeDuplicate = uniqueLevels.some(
      (u) =>
        Math.abs(u.price - lvl.price) / Math.max(u.price, 1e-9) < 0.0015 &&
        (u.type === lvl.type || (SIGNIFICANT_TYPES.includes(u.type) && SIGNIFICANT_TYPES.includes(lvl.type)))
    );

    const isShadowedBySignificantLevel =
      !SIGNIFICANT_TYPES.includes(lvl.type) &&
      uniqueLevels.some(
        (u) =>
          SIGNIFICANT_TYPES.includes(u.type) &&
          Math.abs(u.price - lvl.price) / Math.max(u.price, 1e-9) < 0.0015
      );

    if (!isSameTypeDuplicate && !isShadowedBySignificantLevel) uniqueLevels.push(lvl);
  }

  return uniqueLevels;
}

/** آغاز هفتهٔ UTC (دوشنبه ۰۰:۰۰) */
function startOfUtcWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay(); // ۰ = یکشنبه
  const diffToMonday = (day + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - diffToMonday
  );
}
