import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runScanner } from '@/analysis/scanner';
import { Timeframe } from '@/types/market';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tier = searchParams.get('tier') || 'top10';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;
    const customSymbols = searchParams.get('symbols');

    let symbolList: string[] = [];

    if (customSymbols) {
      symbolList = customSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else {
      const count = tier === 'top50' ? 50 : tier === 'top25' ? 25 : 10;
      symbolList = await dataProvider.getTopSymbols(count);
    }

    const scannerResult = await runScanner(dataProvider, symbolList, tf, 5);

    return NextResponse.json(scannerResult, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, status: 'SCANNER_ERROR', timestamp: Date.now() },
      { status: 500 }
    );
  }
}
