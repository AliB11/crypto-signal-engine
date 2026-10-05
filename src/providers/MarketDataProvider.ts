import { Kline, Ticker24h, DerivativesData, CoinMetadata, Timeframe, DataProviderStats, DataQualityInfo } from '../types/market';

export interface MarketDataProvider {
  readonly name: string;
  getKlines(symbol: string, timeframe: Timeframe, limit?: number): Promise<Kline[]>;
  getTicker24h(symbol: string): Promise<Ticker24h>;
  getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit?: number
  ): Promise<Record<Timeframe, Kline[]>>;
  getDerivativesData(symbol: string): Promise<DerivativesData>;
  getMetadata(symbol: string): Promise<CoinMetadata | null>;
  getTopSymbols(count?: number): Promise<string[]>;
  /** وضعیت زنده بودن منبع داده (در صورت پشتیبانی پروایدر) */
  getDataStatus?(): { live: boolean };
  /** آمار تفصیلی پروایدر برای شفافیت داده و عیب‌یابی */
  getStats?(): DataProviderStats;
}

/**
 * محاسبهٔ کیفیت دادهٔ یک درخواست از اختلاف آمار پروایدر در ابتدا و انتهای کار.
 * این روش جایگزین پرچم سراسری قبلی (`simulatedFallbackUsed`) شده است که پس از
 * نخستین افت، برنامه را برای همیشه «شبیه‌سازی‌شده» نشان می‌داد و حتی در
 * مسیر `/api/scanner` پیش از اجرای اسکن خوانده می‌شد (بنابراین همیشه «live» بود).
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
  const total = liveFetches + simulatedFetches;

  let source: DataQualityInfo['source'] = 'live';
  if (simulatedFetches > 0 && liveFetches === 0) source = 'simulated';
  else if (simulatedFetches > 0) source = 'mixed';

  const liveRatio = total > 0 ? liveFetches / total : 1;

  const message =
    source === 'live'
      ? 'داده‌های این تحلیل مستقیماً از API عمومی بایننس خوانده شده‌اند.'
      : source === 'simulated'
      ? 'دسترسی به بایننس برقرار نشد؛ همهٔ داده‌های این تحلیل از موتور شبیه‌سازی قطعی آمده‌اند و برای معاملهٔ واقعی مناسب نیستند.'
      : `بخشی از داده‌ها زنده و بخشی شبیه‌سازی‌شده است (نسبت زنده: ${(liveRatio * 100).toFixed(0)}٪).`;

  return { source, liveRatio: Number(liveRatio.toFixed(3)), liveFetches, simulatedFetches, message };
}
