import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const ticker = await dataProvider.getTicker24h(symbol);
    const metadata = await dataProvider.getMetadata(symbol);

    return NextResponse.json(
      {
        symbol,
        ticker,
        metadata,
        timestamp: Date.now(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, status: 'DATA_SOURCE_ERROR' }, { status: 500 });
  }
}
