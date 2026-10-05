import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runFullAnalysis } from '@/analysis/engine';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { SignalWeights } from '@/types/market';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  parseIntParam,
  parseWeightsParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';
import { LIMITS } from '@/config/engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`analyze:${clientKey(request)}`, 60, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');
    const tf = parseTimeframeParam(searchParams.get('tf'), '15m');
    const candleLimit = parseIntParam(searchParams.get('limit'), LIMITS.analysisCandleLimit);
    const weights = parseWeightsParam<SignalWeights>(searchParams.get('weights'), DEFAULT_WEIGHTS);

    const result = await runFullAnalysis(dataProvider, symbol, { timeframe: tf, candleLimit, weights });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
        'X-RateLimit-Remaining': String(limitCheck.remaining),
      },
    });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'ANALYSIS_ERROR');
  }
}
