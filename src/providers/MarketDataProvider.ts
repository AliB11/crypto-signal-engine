import {
  Kline,
  Ticker24h,
  DerivativesData,
  CoinMetadata,
  Timeframe,
  DataProviderStats,
  DataQualityInfo,
  DataTrace,
} from '../types/market';

export interface MarketDataProvider {
  readonly name: string;
  getKlines(symbol: string, timeframe: Timeframe, limit?: number, trace?: DataTrace): Promise<Kline[]>;
  getTicker24h(symbol: string, trace?: DataTrace): Promise<Ticker24h>;
  getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit?: number,
    trace?: DataTrace
  ): Promise<Record<Timeframe, Kline[]>>;
  getDerivativesData(symbol: string, trace?: DataTrace): Promise<DerivativesData>;
  getMetadata(symbol: string): Promise<CoinMetadata | null>;
  getTopSymbols(count?: number): Promise<string[]>;
  /** وضعیت زنده بودن منبع داده (در صورت پشتیبانی پروایدر) */
  /**
   * وضعیت زنده بودن منبع داده.
   * `measured: false` یعنی هنوز هیچ داده‌ای خوانده نشده و `live` معنایی ندارد.
   */
  getDataStatus?(): { live: boolean; measured: boolean };
  /** آمار تفصیلی پروایدر برای شفافیت داده و عیب‌یابی */
  getStats?(): DataProviderStats;
  /**
   * منبع آخرین فهرست نمادها: رتبه‌بندی حجمیِ زنده یا دیده‌بان ایستای پیکربندی.
   */
  /** وضعیت واقعی منبع فرادادهٔ بازار (نام/رتبه/ارزش بازار) */
  getMetadataStatus?(): {
    provider: 'coingecko';
    available: boolean;
    marketsFetchedAt: string | null;
    apiKeyConfigured: boolean;
    lastError: string | null;
  };
  getSymbolsSource?(): 'live-volume' | 'static-watchlist';
}

/** ساخت یک شمارندهٔ تازه برای یک درخواست مشخص */
export function createDataTrace(): DataTrace {
  return { live: 0, simulated: 0 };
}

/**
 * کیفیت دادهٔ «همین درخواست» از شمارندهٔ اختصاصی همان درخواست.
 *
 * چرا نه اختلاف آمار سراسری پروایدر؟ چون در محیط سرورلس یک نمونهٔ ماژول بین
 * چندین درخواست زنده می‌ماند و دو درخواست هم‌زمان، آمار یکدیگر را می‌بینند.
 */
export function dataQualityFromTrace(trace: DataTrace | undefined): DataQualityInfo {
  if (!trace) {
    return {
      source: 'live',
      liveRatio: 1,
      liveFetches: 0,
      simulatedFetches: 0,
      message: 'وضعیت منبع داده در دسترس نیست',
    };
  }

  const liveFetches = Math.max(0, trace.live);
  const simulatedFetches = Math.max(0, trace.simulated);
  return qualityFromCounts(liveFetches, simulatedFetches);
}

/**
 * محاسبهٔ کیفیت داده از اختلاف آمار پروایدر در ابتدا و انتهای کار.
 *
 * فقط برای سازگاری با فراخوان‌های قدیمی/تک‌درخواستی نگه داشته شده است؛ مسیرهای
 * اصلی (`engine.ts` و `scanner.ts`) اکنون از `dataQualityFromTrace` استفاده
 * می‌کنند که به درخواست‌های هم‌زمان حساس نیست.
 */
export function computeDataQuality(
  before: DataProviderStats | undefined,
  after: DataProviderStats | undefined
): DataQualityInfo {
  if (!before || !after) {
    return {
      source: 'live',
      liveRatio: 1,
      liveFetches: 0,
      simulatedFetches: 0,
      message: 'وضعیت منبع داده در دسترس نیست',
    };
  }

  // پاسخ‌های سرو‌شده از حافظهٔ نهان هم باید در تفکیک زنده/شبیه‌سازی شمرده شوند،
  // وگرنه درخواستی که کامل از cache پاسخ می‌گیرد «زنده» گزارش می‌شود.
  const liveFetches =
    Math.max(0, after.liveFetches - before.liveFetches) +
    Math.max(0, (after.liveCacheHits ?? 0) - (before.liveCacheHits ?? 0));
  const simulatedFetches =
    Math.max(0, after.simulatedFetches - before.simulatedFetches) +
    Math.max(0, (after.simulatedCacheHits ?? 0) - (before.simulatedCacheHits ?? 0));

  return qualityFromCounts(liveFetches, simulatedFetches);
}

function qualityFromCounts(liveFetches: number, simulatedFetches: number): DataQualityInfo {
  const total = liveFetches + simulatedFetches;

  let source: DataQualityInfo['source'] = 'live';
  if (simulatedFetches > 0 && liveFetches === 0) source = 'simulated';
  else if (simulatedFetches > 0) source = 'mixed';

  const liveRatio = total > 0 ? liveFetches / total : 1;

  const message =
    source === 'live'
      ? total === 0
        ? 'هیچ دادهٔ بازار در این درخواست خوانده نشد.'
        : 'داده‌های این تحلیل مستقیماً از API عمومی بایننس خوانده شده‌اند.'
      : source === 'simulated'
      ? 'دسترسی به بایننس برقرار نشد؛ همهٔ داده‌های این تحلیل از موتور شبیه‌سازی قطعی آمده‌اند و برای معاملهٔ واقعی مناسب نیستند.'
      : `بخشی از داده‌ها زنده و بخشی شبیه‌سازی‌شده است (نسبت زنده: ${(liveRatio * 100).toFixed(0)}٪).`;

  return {
    source,
    liveRatio: Number(liveRatio.toFixed(3)),
    liveFetches,
    simulatedFetches,
    message,
  };
}
