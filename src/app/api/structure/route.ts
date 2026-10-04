import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { analyzeMarketStructure } from '@/analysis/structure';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;

    const klines = await dataProvider.getKlines(symbol, tf, 200);
    const structure = analyzeMarketStructure(klines, tf);

    return NextResponse.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      structure,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
