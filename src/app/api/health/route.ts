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
  const degraded = dataStatus ? !dataStatus.live : false;

  return NextResponse.json(
    {
      ok: true,
      status: degraded ? 'degraded' : 'healthy',
      service: 'crypto-advanced-signal-scanner',
      version: ENGINE_VERSION,
      mode: 'serverless-memory',
      primaryProvider: 'binance-public',
      metadataFallback: 'coingecko',
      dataFallback: 'deterministic-simulation',
      dataStatus: {
        live: dataStatus?.live ?? true,
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
      warnings: degraded
        ? ['دسترسی به API عمومی بایننس برقرار نیست؛ خروجی‌ها روی دادهٔ شبیه‌سازی‌شدهٔ قطعی محاسبه می‌شوند.']
        : openBreakers > 0
        ? [`${openBreakers} میزبان دادهٔ موقتاً قطع شده است (circuit breaker).`]
        : [],
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
