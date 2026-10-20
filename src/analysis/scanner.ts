import { Signal, SignalWeights, Timeframe, DataQualityInfo, DataSource } from '../types/market';
import { MarketDataProvider, createDataTrace, dataQualityFromTrace } from '../providers/MarketDataProvider';
import { runFullAnalysis } from './engine';

export interface ScannerSymbolError {
  symbol: string;
  message: string;
}

export interface ScannerResult {
  updatedAt: string;
  timestamp: number;
  totalScanned: number;
  timeframe: Timeframe;
  signals: Signal[];
  dataSource: DataSource;
  /** جزئیات کیفیت دادهٔ این اسکن (نسبت فراخوانی‌های زنده) */
  dataQuality?: DataQualityInfo;
  /**
   * منبع فهرست نمادها: `live-volume` یعنی از حجم واقعی ۲۴ساعتهٔ بایننس رتبه‌بندی
   * شده، `static-watchlist` یعنی دیده‌بان ایستای پیکربندی (بدون رتبه‌بندی زنده).
   */
  symbolsSource?: 'live-volume' | 'static-watchlist';
  /** نمادهایی که تحلیلشان با خطا مواجه شد — پیش‌تر خطاها بی‌صدا حذف می‌شدند */
  errors: ScannerSymbolError[];
  summary: {
    longs: number;
    shorts: number;
    noSignal: number;
    strongOrBetter: number;
    failed: number;
  };
  durationMs?: number;
}

export async function runScanner(
  provider: MarketDataProvider,
  symbols: string[],
  timeframe: Timeframe = '15m',
  concurrency = 4,
  weights?: Partial<SignalWeights>
): Promise<ScannerResult> {
  const startedAt = Date.now();
  // یک شمارندهٔ مشترک برای «کل این اسکن»؛ همهٔ نمادها در همین یک شیء جمع می‌شوند
  // تا کیفیت دادهٔ اسکن از درخواست‌های هم‌زمانِ دیگر مستقل بماند.
  const trace = createDataTrace();
  const results: Signal[] = [];
  const errors: ScannerSymbolError[] = [];

  const safeConcurrency = Math.max(1, Math.min(8, Math.floor(concurrency) || 4));

  // اجرای کنترل‌شدهٔ هم‌زمان در دسته‌های محدود
  for (let i = 0; i < symbols.length; i += safeConcurrency) {
    const chunk = symbols.slice(i, i + safeConcurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (symbol) => {
        try {
          const full = await runFullAnalysis(provider, symbol, {
            timeframe,
            candleLimit: 120,
            weights,
            trace,
          });
          return { signal: full.signal as Signal | null, error: null as string | null };
        } catch (err: unknown) {
          return { signal: null, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    chunkResults.forEach((result, index) => {
      if (result.signal) results.push(result.signal);
      else errors.push({ symbol: chunk[index], message: result.error || 'خطای نامشخص در تحلیل نماد' });
    });
  }

  // مرتب‌سازی سیگنال‌ها بر پایهٔ امتیاز نزولی
  results.sort((a, b) => b.score - a.score);

  const longs = results.filter((s) => s.direction === 'LONG').length;
  const shorts = results.filter((s) => s.direction === 'SHORT').length;
  const noSignal = results.filter((s) => s.direction === 'NO_SIGNAL').length;
  const strongOrBetter = results.filter(
    (s) => s.classification === 'STRONG' || s.classification === 'VERY_STRONG'
  ).length;

  // کیفیت دادهٔ «همین اسکن» از شمارندهٔ اختصاصی همان اسکن خوانده می‌شود.
  // (نسخهٔ نخست پرچم سراسری را *پیش از* اجرای اسکن می‌خواند و همیشه «live» بود؛
  //  نسخهٔ دوم از اختلاف آمار سراسری پروایدر استفاده می‌کرد که بین درخواست‌های
  //  هم‌زمان آلوده می‌شد.)
  const dataQuality = dataQualityFromTrace(trace);
  const symbolsSource = provider.getSymbolsSource?.();

  return {
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
    totalScanned: symbols.length,
    timeframe,
    signals: results,
    dataSource: dataQuality.source,
    dataQuality,
    ...(symbolsSource ? { symbolsSource } : {}),
    errors,
    summary: {
      longs,
      shorts,
      noSignal,
      strongOrBetter,
      failed: errors.length,
    },
    durationMs: Date.now() - startedAt,
  };
}
