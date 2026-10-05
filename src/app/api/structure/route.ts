import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { analyzeMarketStructure } from '@/analysis/structure';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`structure:${clientKey(request)}`, 60, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');
    const tf = parseTimeframeParam(searchParams.get('tf'), '15m');

    const klines = await dataProvider.getKlines(symbol, tf, 200);
    const structure = analyzeMarketStructure(klines, tf);

    return NextResponse.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      structure,
      timestamp: Date.now(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'STRUCTURE_ERROR');
  }
}
