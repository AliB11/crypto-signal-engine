import { Kline, Timeframe, MTFAnalysis, TimeframeAnalysis } from '../types/market';
import { analyzeMarketStructure } from './structure';
import { detectLiquidityLevels } from './liquidity';
import { detectLiquiditySweeps } from './sweeps';
import { analyzeVolume } from './volume';

export function analyzeMultiTimeframe(
  mtfKlines: Partial<Record<Timeframe, Kline[]>>,
  primaryTf: Timeframe = '15m'
): MTFAnalysis {
  const timeframes: Timeframe[] = ['1d', '4h', '1h', '15m', '5m', '1m'];
  const tfResults: Partial<Record<Timeframe, TimeframeAnalysis>> = {};

  for (const tf of timeframes) {
    const candles = mtfKlines[tf] || [];
    if (candles.length >= 10) {
      const structure = analyzeMarketStructure(candles, tf);
      const levels = detectLiquidityLevels(candles, tf);
      const sweeps = detectLiquiditySweeps(candles, levels, tf);
      const volume = analyzeVolume(candles);

      let structureScore = 50;
      if (structure.trend === 'BULLISH') structureScore += 25;
      else if (structure.trend === 'BEARISH') structureScore -= 25;

      if (structure.recentMSS?.direction === 'BULLISH') structureScore += 15;
      else if (structure.recentMSS?.direction === 'BEARISH') structureScore -= 15;

      tfResults[tf] = {
        timeframe: tf,
        trend: structure.trend,
        structureScore: Math.max(0, Math.min(100, structureScore)),
        lastMSS: structure.recentMSS,
        lastBOS: structure.recentBOS,
        sweeps,
        fvgCount: structure.fvgs.length,
        orderBlockCount: structure.orderBlocks.length,
        volumeState: volume.state,
      };
    } else {
      tfResults[tf] = {
        timeframe: tf,
        trend: 'RANGING',
        structureScore: 50,
        lastMSS: null,
        lastBOS: null,
        sweeps: [],
        fvgCount: 0,
        orderBlockCount: 0,
        volumeState: 'NORMAL',
      };
    }
  }

  // HTF Trend assessment (1d, 4h, 1h)
  const htfTfs: Timeframe[] = ['1d', '4h', '1h'];
  const htfBullish = htfTfs.filter((tf) => tfResults[tf]?.trend === 'BULLISH').length;
  const htfBearish = htfTfs.filter((tf) => tfResults[tf]?.trend === 'BEARISH').length;

  let htfTrend: MTFAnalysis['htfTrend'] = 'NEUTRAL';
  if (htfBullish >= 2) htfTrend = 'BULLISH';
  else if (htfBearish >= 2) htfTrend = 'BEARISH';

  // LTF Confirmation assessment (15m, 5m, 1m)
  const ltfTfs: Timeframe[] = ['15m', '5m', '1m'];
  let ltfConfirmation = false;
  if (htfTrend === 'BULLISH') {
    ltfConfirmation = ltfTfs.some(
      (tf) =>
        tfResults[tf]?.sweeps.some((s) => s.type === 'SELL_SIDE_SWEEP') ||
        tfResults[tf]?.lastMSS?.direction === 'BULLISH'
    );
  } else if (htfTrend === 'BEARISH') {
    ltfConfirmation = ltfTfs.some(
      (tf) =>
        tfResults[tf]?.sweeps.some((s) => s.type === 'BUY_SIDE_SWEEP') ||
        tfResults[tf]?.lastMSS?.direction === 'BEARISH'
    );
  }

  // Calculate Alignment Score (0 - 100)
  let score = 50;
  if (htfTrend === 'BULLISH') {
    score += htfBullish * 12;
    if (ltfConfirmation) score += 15;
  } else if (htfTrend === 'BEARISH') {
    score += htfBearish * 12;
    if (ltfConfirmation) score += 15;
  }

  const alignmentScore = Math.max(10, Math.min(100, Math.round(score)));

  const htfTrendFa = htfTrend === 'BULLISH' ? 'صعودی' : htfTrend === 'BEARISH' ? 'نزولی' : 'خنثی';
  let confluenceDescription = 'سوگیری جهت‌دار تایم‌فریم‌ها نامختلط و متناقض است';
  if (alignmentScore >= 80) {
    confluenceDescription = `هم‌راستایی کامل ${htfTrendFa} در تایم‌فریم‌های بالا (روزانه و ۴ساعته) و پایین`;
  } else if (alignmentScore >= 65) {
    confluenceDescription = `هم‌افزایی ${htfTrendFa} متوسط همراه با تغییر ساختار کلیدی در تایم پایین`;
  } else if (alignmentScore <= 40) {
    confluenceDescription = 'ساختار متناقض بین تایم‌فریم‌ها؛ تثبیت پرنوسان و بی‌جهت';
  }

  return {
    timeframes: tfResults as Record<Timeframe, TimeframeAnalysis>,
    alignmentScore,
    htfTrend,
    ltfConfirmation,
    confluenceDescription,
  };
}
