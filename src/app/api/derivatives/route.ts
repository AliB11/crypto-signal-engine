import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { enrichDerivativesData } from '@/analysis/derivatives';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'BTCUSDT';

    const [rawDeriv, klines] = await Promise.all([
      dataProvider.getDerivativesData(symbol),
      dataProvider.getKlines(symbol, '15m', 30),
    ]);

    const derivatives = enrichDerivativesData(rawDeriv, klines);

    return NextResponse.json(derivatives, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
