import { NextRequest, NextResponse } from 'next/server';
import { dataProvider, getDataSource } from '@/providers';
import { runFullAnalysis } from '@/analysis/engine';
import { Timeframe } from '@/types/market';
import { parseWeightsParam } from '../scanner/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;
    const weights = parseWeightsParam(searchParams.get('weights'));

    const result = await runFullAnalysis(dataProvider, symbol, {
      timeframe: tf,
      candleLimit: 200,
      weights,
    });

    return NextResponse.json(
      { ...result, dataSource: getDataSource() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, status: 'ANALYSIS_ERROR', timestamp: Date.now() },
      { status: 500 }
    );
  }
}
