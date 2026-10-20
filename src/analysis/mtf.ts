import { Kline, Timeframe, MTFAnalysis, TimeframeAnalysis } from '../types/market';
import { analyzeMarketStructure } from './structure';
import { detectLiquidityLevels } from './liquidity';
import { detectLiquiditySweeps } from './sweeps';
import { analyzeVolume } from './volume';

/** تایم‌فریم‌های مرجع، از بالا به پایین */
export const MTF_TIMEFRAMES: Timeframe[] = ['1d', '4h', '1h', '15m', '5m', '1m'];

/** تایم‌فریم‌های بالاتر که سوگیری جهت‌دار از آن‌ها استخراج می‌شود */
export const HTF_TIMEFRAMES: Timeframe[] = ['1d', '4h', '1h'];

/** تایم‌فریم‌های پایین‌تر که تأییدیهٔ ورود از آن‌ها گرفته می‌شود */
export const LTF_TIMEFRAMES: Timeframe[] = ['15m', '5m', '1m'];

/**
 * حداقل کندل لازم برای تحلیل ساختار یک تایم‌فریم.
 * زیر این مقدار، هیچ نتیجه‌ای ساخته نمی‌شود — نه حتی یک «رنج» فرضی.
 */
export const MIN_CANDLES_PER_TIMEFRAME = 10;

/**
 * تحلیل هم‌زمان چند تایم‌فریم (MTF).
 *
 * نکتهٔ صداقت داده: پیش‌تر برای تایم‌فریمی که داده نداشت یک نتیجهٔ ساختگی
 * `{ trend: 'RANGING', structureScore: 50, volumeState: 'NORMAL' }` ساخته می‌شد.
 * این یعنی «داده‌ای نداریم» و «بازار در این تایم‌فریم خنثی است» یکسان گزارش
 * می‌شدند و امتیاز هم‌راستایی روی پایه‌ای که اصلاً اندازه‌گیری نشده بود ساخته
 * می‌شد. حالا تایم‌فریم بدون داده با `available: false`، `trend: 'UNKNOWN'` و
 * `structureScore: null` علامت‌گذاری می‌شود و از محاسبهٔ هم‌راستایی کنار گذاشته
 * می‌شود؛ پوشش واقعی هم در `htfAnalyzedCount` گزارش می‌شود.
 */
export function analyzeMultiTimeframe(
  mtfKlines: Partial<Record<Timeframe, Kline[]>>,
  primaryTf: Timeframe = '15m'
): MTFAnalysis {
  const tfResults: Partial<Record<Timeframe, TimeframeAnalysis>> = {};
  const analyzedTimeframes: Timeframe[] = [];

  for (const tf of MTF_TIMEFRAMES) {
    const candles = mtfKlines[tf] ?? [];

    if (candles.length < MIN_CANDLES_PER_TIMEFRAME) {
      // دادهٔ ناکافی ⇒ نتیجه‌ای ادعا نمی‌کنیم
      tfResults[tf] = {
        timeframe: tf,
        available: false,
        candleCount: candles.length,
        trend: 'UNKNOWN',
        structureScore: null,
        lastMSS: null,
        lastBOS: null,
        sweeps: [],
        fvgCount: 0,
        orderBlockCount: 0,
        volumeState: 'UNKNOWN',
      };
      continue;
    }

    const structure = analyzeMarketStructure(candles, tf);
    const levels = detectLiquidityLevels(candles, tf);
    const sweeps = detectLiquiditySweeps(candles, levels, tf);
    const volume = analyzeVolume(candles);

    if (!structure.available) {
      tfResults[tf] = {
        timeframe: tf,
        available: false,
        candleCount: candles.length,
        trend: 'UNKNOWN',
        structureScore: null,
        lastMSS: null,
        lastBOS: null,
        sweeps,
        fvgCount: 0,
        orderBlockCount: 0,
        volumeState: volume.state,
      };
      continue;
    }

    let structureScore = 50;
    if (structure.trend === 'BULLISH') structureScore += 25;
    else if (structure.trend === 'BEARISH') structureScore -= 25;

    if (structure.recentMSS?.direction === 'BULLISH') structureScore += 15;
    else if (structure.recentMSS?.direction === 'BEARISH') structureScore -= 15;

    tfResults[tf] = {
      timeframe: tf,
      available: true,
      candleCount: candles.length,
      trend: structure.trend,
      structureScore: Math.max(0, Math.min(100, structureScore)),
      lastMSS: structure.recentMSS,
      lastBOS: structure.recentBOS,
      sweeps,
      fvgCount: structure.fvgs.length,
      orderBlockCount: structure.orderBlocks.length,
      volumeState: volume.state,
    };
    analyzedTimeframes.push(tf);
  }

  // ---- سوگیری تایم‌فریم‌های بالا (فقط آن‌هایی که واقعاً تحلیل شدند) ----
  const htfAnalyzed = HTF_TIMEFRAMES.filter((tf) => tfResults[tf]?.available);
  const htfBullish = htfAnalyzed.filter((tf) => tfResults[tf]?.trend === 'BULLISH').length;
  const htfBearish = htfAnalyzed.filter((tf) => tfResults[tf]?.trend === 'BEARISH').length;

  let htfTrend: MTFAnalysis['htfTrend'] = 'NEUTRAL';
  // برای ادعای سوگیری، دست‌کم دو تایم‌فریم بالاتر باید داده داشته باشند؛
  // با یک تایم‌فریم تنها، «دو از سه» معنایی ندارد.
  if (htfAnalyzed.length >= 2) {
    if (htfBullish >= 2) htfTrend = 'BULLISH';
    else if (htfBearish >= 2) htfTrend = 'BEARISH';
  }

  // ---- تأییدیهٔ تایم‌فریم پایین ----
  let ltfConfirmation = false;
  if (htfTrend === 'BULLISH') {
    ltfConfirmation = LTF_TIMEFRAMES.some(
      (tf) =>
        tfResults[tf]?.available &&
        (tfResults[tf]?.sweeps.some((s) => s.type === 'SELL_SIDE_SWEEP') ||
          tfResults[tf]?.lastMSS?.direction === 'BULLISH')
    );
  } else if (htfTrend === 'BEARISH') {
    ltfConfirmation = LTF_TIMEFRAMES.some(
      (tf) =>
        tfResults[tf]?.available &&
        (tfResults[tf]?.sweeps.some((s) => s.type === 'BUY_SIDE_SWEEP') ||
          tfResults[tf]?.lastMSS?.direction === 'BEARISH')
    );
  }

  // ---- امتیاز هم‌راستایی (۰ تا ۱۰۰) ----
  // خط پایه ۵۰ است؛ بدون سوگیری جهت‌دار تغییری نمی‌کند. اگر پوشش داده ناقص باشد
  // این عدد «بی‌تصمیمی» است نه «بازار خنثی»، و در توضیحات هم گفته می‌شود.
  let score = 50;
  if (htfTrend === 'BULLISH') {
    score += htfBullish * 12;
    if (ltfConfirmation) score += 15;
  } else if (htfTrend === 'BEARISH') {
    score += htfBearish * 12;
    if (ltfConfirmation) score += 15;
  }
  const alignmentScore = Math.max(10, Math.min(100, Math.round(score)));

  const htfTrendFa =
    htfTrend === 'BULLISH' ? 'صعودی' : htfTrend === 'BEARISH' ? 'نزولی' : 'خنثی';

  const missingHtf = HTF_TIMEFRAMES.filter((tf) => !tfResults[tf]?.available);

  let confluenceDescription: string;
  if (htfAnalyzed.length === 0) {
    confluenceDescription =
      'دادهٔ هیچ‌کدام از تایم‌فریم‌های بالاتر در دسترس نیست؛ سوگیری جهت‌دار قابل سنجش نیست';
  } else if (missingHtf.length > 0) {
    confluenceDescription = `سوگیری ${htfTrendFa} تنها بر پایهٔ ${htfAnalyzed.length} از ${HTF_TIMEFRAMES.length} تایم‌فریم بالاتر سنجیده شد (${missingHtf.join('، ')} داده ندارند)`;
  } else if (alignmentScore >= 80) {
    confluenceDescription = `هم‌راستایی کامل ${htfTrendFa} در تایم‌فریم‌های بالا (روزانه و ۴ساعته) و پایین`;
  } else if (alignmentScore >= 65) {
    confluenceDescription = `هم‌افزایی ${htfTrendFa} متوسط همراه با تغییر ساختار کلیدی در تایم پایین`;
  } else if (alignmentScore <= 40) {
    confluenceDescription = 'ساختار متناقض بین تایم‌فریم‌ها؛ تثبیت پرنوسان و بی‌جهت';
  } else {
    confluenceDescription = 'سوگیری جهت‌دار تایم‌فریم‌ها نامختلط و متناقض است';
  }

  void primaryTf; // تایم‌فریم اصلی توسط موتور سیگنال جداگانه تحلیل می‌شود

  return {
    timeframes: tfResults as Record<Timeframe, TimeframeAnalysis>,
    alignmentScore,
    htfTrend,
    ltfConfirmation,
    confluenceDescription,
    analyzedTimeframes,
    htfAnalyzedCount: htfAnalyzed.length,
    htfTotal: HTF_TIMEFRAMES.length,
  };
}
