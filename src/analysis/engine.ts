import {
  FullAnalysisResult,
  Kline,
  Timeframe,
  SignalWeights,
  DataTrace,
} from '../types/market';
import { MarketDataProvider, createDataTrace, dataQualityFromTrace } from '../providers/MarketDataProvider';
import { detectLiquidityLevels } from './liquidity';
import { detectLiquiditySweeps } from './sweeps';
import { analyzeMarketStructure } from './structure';
import { analyzeSessionLiquidity } from './sessions';
import { analyzeVolume } from './volume';
import { enrichDerivativesData } from './derivatives';
import { detectMarketRegime } from './regime';
import { analyzeMultiTimeframe, MTF_TIMEFRAMES } from './mtf';
import { evaluateLayer3Context } from './layer3';
import { generateSignal } from './signal';
import { isTimeframe, sessionTimeframeFor } from '../lib/timeframes';

export interface AnalysisOptions {
  timeframe?: Timeframe;
  weights?: Partial<SignalWeights>;
  candleLimit?: number;
  /**
   * نقشهٔ نقدینگی و سطوح کلیدی از کندل‌های یک تایم‌فریم مرجع (پیش‌فرض: خودِ تایم‌فریم)
   * ساخته می‌شود؛ برای تحلیل جلسات معاملاتی همیشه از تایم‌فریم ۱۵ دقیقه استفاده می‌شود.
   */
  enableSessions?: boolean;
  /**
   * شمارندهٔ منبع دادهٔ اشتراکی (برای اسکن چندنمادی). اگر داده نشود، یک
   * شمارندهٔ اختصاصی برای همین تحلیل ساخته می‌شود.
   */
  trace?: DataTrace;
}

// فهرست تایم‌فریم‌های MTF از `analysis/mtf` وارد می‌شود تا دو تعریف واگرا نسازیم.

/** پاک‌سازی نماد ورودی و جلوگیری از تزریق به URL پروایدر */
export function sanitizeSymbol(symbol: string): string {
  const clean = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 3 && clean.length <= 20 ? clean : 'BTCUSDT';
}

export async function runFullAnalysis(
  provider: MarketDataProvider,
  symbol: string,
  options: AnalysisOptions = {}
): Promise<FullAnalysisResult> {
  const startedAt = Date.now();
  const tf: Timeframe = options.timeframe && isTimeframe(options.timeframe) ? options.timeframe : '15m';
  const safeSymbol = sanitizeSymbol(symbol);
  const limit = Math.max(60, Math.min(1000, Math.floor(options.candleLimit || 200)));
  // شمارندهٔ منبع دادهٔ *همین* تحلیل — نه اختلاف آمار سراسری پروایدر، که در
  // محیط سرورلس بین درخواست‌های هم‌زمان آلوده می‌شود.
  const trace = options.trace ?? createDataTrace();

  // ۱. واکشی موازی کندل‌های چندتایم‌فریم، تیکر، مشتقات و فراداده
  const [mtfKlines, ticker, rawDerivatives, metadata] = await Promise.all([
    provider.getMultiTimeframeKlines(safeSymbol, MTF_TIMEFRAMES, limit, trace),
    provider.getTicker24h(safeSymbol, trace),
    provider.getDerivativesData(safeSymbol, trace),
    provider.getMetadata(safeSymbol),
  ]);

  const primaryKlines: Kline[] = mtfKlines[tf] || [];
  const dailyKlines: Kline[] = mtfKlines['1d'] || [];

  // ۲. اجرای موتورهای تحلیلی
  const liquidityLevels = detectLiquidityLevels(primaryKlines, tf, {}, dailyKlines);
  const sweeps = detectLiquiditySweeps(primaryKlines, liquidityLevels, tf);
  const structure = analyzeMarketStructure(primaryKlines, tf);

  // تحلیل جلسات روی کندل‌های ۱۵ دقیقه‌ای انجام می‌شود (حتی وقتی تایم‌فریم اصلی درشت‌تر است)
  const sessionTf = sessionTimeframeFor(tf);
  const sessionKlines =
    options.enableSessions === false
      ? primaryKlines
      : mtfKlines[sessionTf]?.length
      ? mtfKlines[sessionTf]
      : primaryKlines;
  const sessionLiquidity = analyzeSessionLiquidity(sessionKlines);

  const volumeMetrics = analyzeVolume(primaryKlines);
  const derivatives = enrichDerivativesData(rawDerivatives, primaryKlines, tf);
  const marketRegime = detectMarketRegime(primaryKlines);
  const mtf = analyzeMultiTimeframe(mtfKlines, tf);

  // ۳. ارزیابی بافت پیشرفتهٔ نقدینگی لایهٔ ۳
  const layer3 = evaluateLayer3Context({
    liquidityLevels,
    sweeps,
    structure,
    sessions: sessionLiquidity,
    volume: volumeMetrics,
    derivatives,
    mtf,
    regime: marketRegime,
  });

  // ۴. تولید سیگنال
  const signal = generateSignal({
    symbol: safeSymbol,
    timeframe: tf,
    klines: primaryKlines,
    liquidityLevels,
    sweeps,
    structure,
    sessions: sessionLiquidity,
    volume: volumeMetrics,
    derivatives,
    mtf,
    regime: marketRegime,
    layer3,
    weights: options.weights,
  });

  const now = Date.now();
  const dataTimestamp = primaryKlines[primaryKlines.length - 1]?.timestamp || now;
  const dataQuality = dataQualityFromTrace(trace);

  return {
    symbol: safeSymbol,
    timeframe: tf,
    ticker,
    metadata: metadata || undefined,
    signal,
    liquidityLevels,
    liquiditySweeps: sweeps,
    structure,
    sessionLiquidity,
    volumeMetrics,
    derivatives,
    marketRegime,
    mtf,
    layer3,
    candles: primaryKlines,
    dataTimestamp,
    analysisTimestamp: now,
    dataSource: dataQuality.source,
    dataQuality,
    durationMs: now - startedAt,
  };
}
