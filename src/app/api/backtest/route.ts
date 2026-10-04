import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runBacktest } from '@/backtest/engine';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol = (body.symbol || 'BTCUSDT').toUpperCase();
    const timeframe = (body.timeframe || '15m') as Timeframe;
    const minScore = body.minScore ? Number(body.minScore) : 65;
    const candleLimit = body.candleLimit ? Number(body.candleLimit) : 500;

    const klines = await dataProvider.getKlines(symbol, timeframe, candleLimit);
    const report = runBacktest(symbol, timeframe, klines, { minScore });

    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    const timeframe = (searchParams.get('tf') || '15m') as Timeframe;
    const minScore = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : 65;

    const klines = await dataProvider.getKlines(symbol, timeframe, 400);
    const report = runBacktest(symbol, timeframe, klines, { minScore });

    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
