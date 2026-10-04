import { NextRequest, NextResponse } from 'next/server';
import { dataProvider, getDataSource } from '@/providers';
import { runScanner } from '@/analysis/scanner';
import { SignalWeights, Timeframe } from '@/types/market';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';

export const dynamic = 'force-dynamic';

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof SignalWeights)[];

/** وزن‌های سفارشی از کوئری‌استرینگ را اعتبارسنجی و نرمال می‌کند */
export function parseWeightsParam(raw: string | null): Partial<SignalWeights> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Partial<SignalWeights> = {};
    for (const key of WEIGHT_KEYS) {
      const val = Number(parsed[key]);
      if (isFinite(val) && val >= 0 && val <= 1) {
        clean[key] = val;
      }
    }
    return Object.keys(clean).length > 0 ? clean : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tier = searchParams.get('tier') || 'top10';
    const tf = (searchParams.get('tf') || '15m') as Timeframe;
    const customSymbols = searchParams.get('symbols');
    const weights = parseWeightsParam(searchParams.get('weights'));

    let symbolList: string[] = [];

    if (customSymbols) {
      symbolList = customSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else {
      const count = tier === 'top50' ? 50 : tier === 'top25' ? 25 : 10;
      symbolList = await dataProvider.getTopSymbols(count);
    }

    const dataSource = getDataSource();
    const scannerResult = await runScanner(dataProvider, symbolList, tf, 5, weights, dataSource);

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
