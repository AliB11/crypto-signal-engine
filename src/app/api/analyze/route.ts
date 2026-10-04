import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runFullAnalysis } from '@/analysis/engine';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;

    const result = await runFullAnalysis(dataProvider, symbol, {
      timeframe: tf,
      candleLimit: 200,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, status: 'ANALYSIS_ERROR', timestamp: Date.now() },
      { status: 500 }
    );
  }
}
