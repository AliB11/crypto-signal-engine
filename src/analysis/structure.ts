import {
  Kline,
  MarketStructureSummary,
  StructureEvent,
  FairValueGap,
  OrderBlock,
  Timeframe,
} from '../types/market';
import { findConfirmedPivots } from './pivots';

/** حداقل کندل لازم برای تشخیص ساختار (پیوت‌ها به ۳ کندل چپ و ۲ کندل راست نیاز دارند) */
export const MIN_CANDLES_FOR_STRUCTURE = 15;

export function analyzeMarketStructure(
  klines: Kline[],
  timeframe: Timeframe = '15m'
): MarketStructureSummary {
  if (!klines || klines.length < MIN_CANDLES_FOR_STRUCTURE) {
    // دادهٔ ناکافی. `trend` در این حالت یک *نتیجه* نیست، پس `available: false`
    // اعلام می‌شود تا مصرف‌کننده آن را «بازار رنج» تفسیر نکند.
    return {
      trend: 'RANGING',
      available: false,
      candleCount: klines?.length ?? 0,
      lastEvent: null,
      events: [],
      swingHighs: [],
      swingLows: [],
      fvgs: [],
      orderBlocks: [],
      displacementDetected: false,
      recentMSS: null,
      recentBOS: null,
    };
  }

  // 1. Confirmed Pivots
  const { swingHighs, swingLows } = findConfirmedPivots(klines, 3, 2);

  // ۲. میانگین بدنه و حجم برای تشخیص دیسپلیسمنت.
  // آخرین کندلِ آرایه در بازار زنده *هنوز در حال تشکیل* است؛ اگر آن را داخل
  // میانگین ببریم، یک کندل بزرگِ جاری هم مخرج را بزرگ می‌کند و هم صورت را، و
  // دیسپلیسمنتِ واقعی خودِ همان کندل هرگز تشخیص داده نمی‌شود (سنجش خودارجاع).
  // پس میانگین فقط از کندل‌های بسته‌شده ساخته می‌شود.
  const closedCandles = klines.slice(0, klines.length - 1);
  const count = Math.min(30, closedCandles.length);
  let sumBody = 0;
  let sumVol = 0;
  for (let i = closedCandles.length - count; i < closedCandles.length; i++) {
    sumBody += Math.abs(closedCandles[i].close - closedCandles[i].open);
    sumVol += closedCandles[i].volume;
  }
  const avgBody = count > 0 ? sumBody / count : 0;
  const avgVol = count > 0 ? sumVol / count : 0;
  // با میانگین صفر (همهٔ کندل‌ها بدون حجم) هیچ کندلی دیسپلیسمنت نیست
  const isDisplacementCandle = (body: number, volume: number) =>
    avgBody > 0 && avgVol > 0 && body >= avgBody * 1.6 && volume >= avgVol * 1.25;

  const events: StructureEvent[] = [];
  let currentTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';

  // Sort all pivots chronologically
  const allPivots = [...swingHighs, ...swingLows].sort((a, b) => a.index - b.index);

  let lastSH: number | null = null;
  let lastSL: number | null = null;
  let prevSH: number | null = null;
  let prevSL: number | null = null;

  for (const pivot of allPivots) {
    if (pivot.type === 'SWING_HIGH') {
      if (lastSH !== null) {
        if (pivot.price > lastSH) {
          events.push({
            type: 'HH',
            direction: 'BULLISH',
            price: pivot.price,
            candleIndex: pivot.index,
            timestamp: pivot.time,
            timeframe,
            strength: pivot.strength,
            displacement: false,
          });
        } else {
          events.push({
            type: 'LH',
            direction: 'BEARISH',
            price: pivot.price,
            candleIndex: pivot.index,
            timestamp: pivot.time,
            timeframe,
            strength: pivot.strength,
            displacement: false,
          });
        }
        prevSH = lastSH;
      }
      lastSH = pivot.price;
    } else {
      if (lastSL !== null) {
        if (pivot.price > lastSL) {
          events.push({
            type: 'HL',
            direction: 'BULLISH',
            price: pivot.price,
            candleIndex: pivot.index,
            timestamp: pivot.time,
            timeframe,
            strength: pivot.strength,
            displacement: false,
          });
        } else {
          events.push({
            type: 'LL',
            direction: 'BEARISH',
            price: pivot.price,
            candleIndex: pivot.index,
            timestamp: pivot.time,
            timeframe,
            strength: pivot.strength,
            displacement: false,
          });
        }
        prevSL = lastSL;
      }
      lastSL = pivot.price;
    }
  }

  // 3. Detect Break of Structure (BOS) and Market Structure Shift (MSS/CHoCH)
  // We scan candle by candle after confirmed pivots
  for (let i = 10; i < klines.length; i++) {
    const candle = klines[i];
    const body = Math.abs(candle.close - candle.open);
    const isDisplacement = isDisplacementCandle(body, candle.volume);

    // Available confirmed swing points before index i
    const confirmedHighs = swingHighs.filter((sh) => sh.confirmedAt <= i && sh.index < i);
    const confirmedLows = swingLows.filter((sl) => sl.confirmedAt <= i && sl.index < i);

    if (confirmedHighs.length > 0) {
      const recentHigh = confirmedHighs[confirmedHighs.length - 1];
      // Bullish break above confirmed swing high
      if (candle.close > recentHigh.price && klines[i - 1].close <= recentHigh.price) {
        // If previous trend was bearish => MSS (Change of Character), else BOS
        const isMSS = currentTrend === 'BEARISH';
        events.push({
          type: isMSS ? 'MSS' : 'BOS',
          direction: 'BULLISH',
          price: recentHigh.price,
          candleIndex: i,
          timestamp: candle.timestamp,
          timeframe,
          strength: isDisplacement ? 90 : 75,
          displacement: isDisplacement,
        });
        currentTrend = 'BULLISH';
      }
    }

    if (confirmedLows.length > 0) {
      const recentLow = confirmedLows[confirmedLows.length - 1];
      // Bearish break below confirmed swing low
      if (candle.close < recentLow.price && klines[i - 1].close >= recentLow.price) {
        const isMSS = currentTrend === 'BULLISH';
        events.push({
          type: isMSS ? 'MSS' : 'BOS',
          direction: 'BEARISH',
          price: recentLow.price,
          candleIndex: i,
          timestamp: candle.timestamp,
          timeframe,
          strength: isDisplacement ? 90 : 75,
          displacement: isDisplacement,
        });
        currentTrend = 'BEARISH';
      }
    }
  }

  // 4. Fair Value Gaps (FVG)
  const fvgs: FairValueGap[] = [];
  for (let i = 2; i < klines.length; i++) {
    const c1 = klines[i - 2];
    const c3 = klines[i];

    // Bullish FVG: Low of candle 3 is higher than High of candle 1
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      const gapPercent = ((top - bottom) / bottom) * 100;

      if (gapPercent >= 0.05) {
        // Check if mitigated by future candles
        let filled = false;
        let lowestFuture = top;
        for (let j = i + 1; j < klines.length; j++) {
          if (klines[j].low <= bottom) {
            filled = true;
            break;
          }
          if (klines[j].low < lowestFuture) {
            lowestFuture = klines[j].low;
          }
        }

        const filledPercent = filled
          ? 100
          : Math.max(0, Math.min(100, ((top - lowestFuture) / (top - bottom)) * 100));

        fvgs.push({
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          direction: 'BULLISH',
          candleIndex: i - 1,
          timestamp: klines[i - 1].timestamp,
          filled,
          filledPercent: parseFloat(filledPercent.toFixed(1)),
        });
      }
    }

    // Bearish FVG: High of candle 3 is lower than Low of candle 1
    if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      const gapPercent = ((top - bottom) / bottom) * 100;

      if (gapPercent >= 0.05) {
        let filled = false;
        let highestFuture = bottom;
        for (let j = i + 1; j < klines.length; j++) {
          if (klines[j].high >= top) {
            filled = true;
            break;
          }
          if (klines[j].high > highestFuture) {
            highestFuture = klines[j].high;
          }
        }

        const filledPercent = filled
          ? 100
          : Math.max(0, Math.min(100, ((highestFuture - bottom) / (top - bottom)) * 100));

        fvgs.push({
          top,
          bottom,
          midpoint: (top + bottom) / 2,
          direction: 'BEARISH',
          candleIndex: i - 1,
          timestamp: klines[i - 1].timestamp,
          filled,
          filledPercent: parseFloat(filledPercent.toFixed(1)),
        });
      }
    }
  }

  // 5. Order Blocks (OB)
  const orderBlocks: OrderBlock[] = [];
  const displacementEvents = events.filter((e) => (e.type === 'BOS' || e.type === 'MSS') && e.displacement);

  for (const de of displacementEvents) {
    const idx = de.candleIndex;
    if (idx < 2) continue;

    if (de.direction === 'BULLISH') {
      // Find the last bearish candle prior to the displacement
      for (let j = idx - 1; j >= Math.max(0, idx - 4); j--) {
        if (klines[j].close < klines[j].open) {
          const top = Math.max(klines[j].open, klines[j].close);
          const bottom = klines[j].low;
          const mitigated = klines.slice(idx + 1).some((k) => k.low <= bottom);

          orderBlocks.push({
            top,
            bottom,
            direction: 'BULLISH',
            candleIndex: j,
            timestamp: klines[j].timestamp,
            volume: klines[j].volume,
            mitigated,
          });
          break;
        }
      }
    } else if (de.direction === 'BEARISH') {
      // Find the last bullish candle prior to the displacement
      for (let j = idx - 1; j >= Math.max(0, idx - 4); j--) {
        if (klines[j].close > klines[j].open) {
          const top = klines[j].high;
          const bottom = Math.min(klines[j].open, klines[j].close);
          const mitigated = klines.slice(idx + 1).some((k) => k.high >= top);

          orderBlocks.push({
            top,
            bottom,
            direction: 'BEARISH',
            candleIndex: j,
            timestamp: klines[j].timestamp,
            volume: klines[j].volume,
            mitigated,
          });
          break;
        }
      }
    }
  }

  // رویدادها در دو حلقهٔ جدا ساخته می‌شوند (پیوت‌ها، سپس شکست‌ها)، پس آرایهٔ خام
  // زمانی‌مرتب نیست و `slice(-5)` هرگز رویدادهای HH/HL را نمی‌دید. مرتب‌سازی
  // بر اساس ایندکس کندل، «آخرین رویداد» و «رویدادهای اخیر» را واقعی می‌کند.
  events.sort((a, b) => a.candleIndex - b.candleIndex || a.timestamp - b.timestamp);

  // Determine current trend based on latest structure events
  const recentEvents = events.slice(-5);
  const bullishCount = recentEvents.filter((e) => e.direction === 'BULLISH').length;
  const bearishCount = recentEvents.filter((e) => e.direction === 'BEARISH').length;

  let trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (bullishCount >= 3) trend = 'BULLISH';
  else if (bearishCount >= 3) trend = 'BEARISH';
  else trend = currentTrend;

  // «تازگی» رویداد ساختاری: رویدادی که ده‌ها کندل پیش رخ داده، محرک معتبر امروز نیست.
  // پیش‌تر رویداد MSS قدیمی (حتی ۱۰۰ کندل قبل) امتیاز کامل محرک را می‌گرفت.
  const recencyWindow = Math.max(10, Math.min(30, Math.floor(klines.length * 0.2)));
  const recentEventsWindow = events.filter((e) => e.candleIndex >= klines.length - recencyWindow);
  const recentMSS = recentEventsWindow.filter((e) => e.type === 'MSS').pop() || null;
  const recentBOS = recentEventsWindow.filter((e) => e.type === 'BOS').pop() || null;

  // دیسپلیسمنت اخیر: ۵ کندل آخر، با همان تعریف مبتنی بر میانگینِ کندل‌های بسته
  const recentDisplacement = klines
    .slice(-5)
    .some((k) => isDisplacementCandle(Math.abs(k.close - k.open), k.volume));

  // فقط FVG های «فعال» (پرشدنشده) نگه داشته می‌شوند؛ پیش‌تر برش سادهٔ `.slice(-8)`
  // می‌توانست گپ‌های پرشده را حفظ کند و گپ فعال قدیمی‌تر را دور بریزد — و به همین دلیل
  // موتور سیگنال گاهی «گپ فعالی» پیدا نمی‌کرد که واقعاً وجود داشت.
  const activeFvgs = fvgs
    .filter((f) => !f.filled)
    .slice(-10)
    .sort((a, b) => a.candleIndex - b.candleIndex);
  const filledFvgs = fvgs
    .filter((f) => f.filled)
    .slice(-2)
    .sort((a, b) => a.candleIndex - b.candleIndex);

  const activeOBs = orderBlocks
    .filter((o) => !o.mitigated)
    .slice(-6)
    .sort((a, b) => a.candleIndex - b.candleIndex);
  const mitigatedOBs = orderBlocks
    .filter((o) => o.mitigated)
    .slice(-2)
    .sort((a, b) => a.candleIndex - b.candleIndex);

  return {
    trend,
    available: true,
    candleCount: klines.length,
    lastEvent: events[events.length - 1] || null,
    events,
    swingHighs,
    swingLows,
    fvgs: [...activeFvgs, ...filledFvgs],
    orderBlocks: [...activeOBs, ...mitigatedOBs],
    displacementDetected: recentDisplacement,
    recentMSS,
    recentBOS,
  };
}
