import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runFullAnalysis } from '@/analysis/engine';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

    const signals = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await runFullAnalysis(dataProvider, sym, { timeframe: tf, candleLimit: 120 });
          return res.signal;
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      timestamp: Date.now(),
      timeframe: tf,
      signals: signals.filter(Boolean),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
