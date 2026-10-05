import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runScanner } from '@/analysis/scanner';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { SignalWeights } from '@/types/market';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  parseWeightsParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';
import { LIMITS } from '@/config/engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`scanner:${clientKey(request)}`, 40, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const tier = searchParams.get('tier') || 'top10';
    const tf = parseTimeframeParam(searchParams.get('tf'), '15m');
    const customSymbols = searchParams.get('symbols');
    const weights = parseWeightsParam<SignalWeights>(searchParams.get('weights'), DEFAULT_WEIGHTS);

    let symbolList: string[] = [];

    if (customSymbols) {
      symbolList = customSymbols
        .split(',')
        .map((s) => parseSymbolParam(s, ''))
        .filter((s): s is string => s.length >= 3)
        .slice(0, LIMITS.scannerMaxSymbols);
    } else {
      const count = tier === 'top50' ? 50 : tier === 'top25' ? 25 : 10;
      symbolList = await dataProvider.getTopSymbols(count);
    }

    if (symbolList.length === 0) {
      return NextResponse.json(
        { error: 'فهرست نمادها خالی است؛ پارامتر symbols را بررسی کنید.', status: 'INVALID_SYMBOLS' },
        { status: 400 }
      );
    }

    const scannerResult = await runScanner(dataProvider, symbolList, tf, 5, weights);

    return NextResponse.json(scannerResult, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
        'X-RateLimit-Remaining': String(limitCheck.remaining),
      },
    });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'SCANNER_ERROR');
  }
}
