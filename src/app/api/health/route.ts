import { NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { ENGINE_VERSION } from '@/config/engine';

export const dynamic = 'force-dynamic';

/**
 * بررسی سلامت سرویس + تشخیص وضعیت پروایدر داده.
 * پیش‌تر این مسیر فقط یک پاسخ ثابت «healthy» برمی‌گرداند و اگر همهٔ فراخوانی‌های
 * بایننس شکست می‌خوردند، سرویس همچنان سالم گزارش می‌شد.
 */
export async function GET() {
  const stats = dataProvider.getStats?.();
  const dataStatus = dataProvider.getDataStatus?.();

  const openBreakers = stats?.openBreakers.length ?? 0;
  // `measured: false` یعنی هنوز هیچ داده‌ای خوانده نشده (نمونهٔ تازهٔ سرورلس).
  // در این حالت وضعیت «سالم» نیست بلکه «نامعلوم» است؛ پیش‌تر `live: true`
  // پیش‌فرض می‌شد و /api/health بدون هیچ شاهدی «healthy» می‌گفت.
  const measured = dataStatus?.measured ?? false;
  // «تنزل» فقط وقتی معنا دارد که واقعاً چیزی سنجیده شده باشد؛ وگرنه روی یک
  // نمونهٔ تازه هم‌زمان می‌گفت «چیزی نسنجیده‌ام» و «بایننس در دسترس نیست».
  const degraded = measured && dataStatus ? !dataStatus.live : false;
  const simulationEnabled = process.env.DATA_SIMULATION_FALLBACK?.toLowerCase() !== 'off';
  const metadataStatus =
    dataProvider.getMetadataStatus?.() ?? {
      provider: 'coingecko' as const,
      available: false,
      marketsFetchedAt: null,
      apiKeyConfigured: false,
      lastError: 'پروایدر وضعیت فراداده را گزارش نمی‌کند',
    };

  return NextResponse.json(
    {
      ok: true,
      status: !measured ? 'unknown' : degraded ? 'degraded' : 'healthy',
      service: 'crypto-advanced-signal-scanner',
      version: ENGINE_VERSION,
      mode: 'serverless-memory',
      primaryProvider: 'binance-public',
      // توصیف دقیق زنجیرهٔ داده؛ پیش‌تر «coingecko» به‌عنوان fallback عمومی
      // تبلیغ می‌شد در حالی که آن پروایدر هیچ‌گاه به‌عنوان منبع کندل/تیکر
      // استفاده نمی‌شد. حالا وضعیت *واقعی* منبع فراداده گزارش می‌شود: اگر
      // کوین‌گکو در دسترس نباشد، `available: false` است و نام/رتبه/ارزش بازار
      // در پاسخ‌ها `null` خواهد بود (نه یک عدد حدسی).
      metadataProvider: metadataStatus,
      dataFallback: simulationEnabled ? 'deterministic-simulation' : 'disabled',
      symbolsSource: dataProvider.getSymbolsSource?.() ?? null,
      dataStatus: {
        live: dataStatus?.live ?? false,
        measured,
        liveFetches: stats?.liveFetches ?? 0,
        simulatedFetches: stats?.simulatedFetches ?? 0,
        cacheHits: stats?.cacheHits ?? 0,
        liveCacheHits: stats?.liveCacheHits ?? 0,
        simulatedCacheHits: stats?.simulatedCacheHits ?? 0,
        coalescedRequests: stats?.coalescedRequests ?? 0,
        breakerTrips: stats?.breakerTrips ?? 0,
        openBreakers: stats?.openBreakers ?? [],
        lastError: stats?.lastError ?? null,
        lastLiveAt: stats?.lastLiveAt ? new Date(stats.lastLiveAt).toISOString() : null,
        lastSimulatedAt: stats?.lastSimulatedAt
          ? new Date(stats.lastSimulatedAt).toISOString()
          : null,
      },
      warnings: [
        ...(!measured
          ? ['هنوز هیچ دادهٔ بازاری در این نمونه خوانده نشده است؛ وضعیت منبع داده نامعلوم است.']
          : []),
        ...(degraded
          ? simulationEnabled
            ? ['دسترسی به API عمومی بایننس برقرار نیست؛ خروجی‌ها روی دادهٔ شبیه‌سازی‌شدهٔ قطعی محاسبه می‌شوند.']
            : ['دسترسی به API عمومی بایننس برقرار نیست و شبیه‌سازی غیرفعال است؛ درخواست‌ها با خطا پاسخ می‌گیرند.']
          : []),
        ...(openBreakers > 0
          ? [`${openBreakers} میزبان دادهٔ موقتاً قطع شده است (circuit breaker).`]
          : []),
        ...(!metadataStatus.available
          ? [
              'فهرست بازار کوین‌گکو در دسترس نیست؛ نام، رتبهٔ بازار و ارزش بازار `null` گزارش می‌شوند.',
            ]
          : []),
      ],
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
