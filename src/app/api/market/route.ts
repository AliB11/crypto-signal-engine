import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { checkRateLimit, clientKey, parseSymbolParam, rateLimitResponse, errorResponse } from '@/lib/http';
import { createDataTrace, dataQualityFromTrace } from '@/providers/MarketDataProvider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`market:${clientKey(request)}`, 90, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');
    const trace = createDataTrace();
    const [ticker, metadata] = await Promise.all([
      dataProvider.getTicker24h(symbol, trace),
      dataProvider.getMetadata(symbol),
    ]);

    const dataQuality = dataQualityFromTrace(trace);
    const stats = dataProvider.getStats?.();

    return NextResponse.json(
      {
        symbol,
        ticker,
        metadata,
        // کیفیت دادهٔ «همین پاسخ»، نه وضعیت سراسری پروایدر
        dataSource: dataQuality.source,
        dataQuality,
        dataStatus: stats
          ? {
              liveFetches: stats.liveFetches,
              simulatedFetches: stats.simulatedFetches,
              cacheHits: stats.cacheHits,
              openBreakers: stats.openBreakers,
            }
          : undefined,
        timestamp: Date.now(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' } }
    );
  } catch (err: unknown) {
    return errorResponse(err, 500, 'DATA_SOURCE_ERROR');
  }
}
