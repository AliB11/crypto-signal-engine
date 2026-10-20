import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { createDataTrace, dataQualityFromTrace } from '@/providers/MarketDataProvider';
import { enrichDerivativesData } from '@/analysis/derivatives';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`derivatives:${clientKey(request)}`, 60, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');

    const trace = createDataTrace();
    const [rawDeriv, klines] = await Promise.all([
      dataProvider.getDerivativesData(symbol, trace),
      dataProvider.getKlines(symbol, '15m', 30, trace),
    ]);

    const derivatives = enrichDerivativesData(rawDeriv, klines, '15m');

    return NextResponse.json({
      ...derivatives,
      dataSource: dataQualityFromTrace(trace).source,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'DERIVATIVES_ERROR');
  }
}
