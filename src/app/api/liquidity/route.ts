import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { detectLiquidityLevels } from '@/analysis/liquidity';
import { detectLiquiditySweeps } from '@/analysis/sweeps';
import { analyzeSessionLiquidity } from '@/analysis/sessions';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`liquidity:${clientKey(request)}`, 60, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');
    const tf = parseTimeframeParam(searchParams.get('tf'), '15m');

    const [klines, dailyKlines] = await Promise.all([
      dataProvider.getKlines(symbol, tf, 200),
      dataProvider.getKlines(symbol, '1d', 30),
    ]);

    const levels = detectLiquidityLevels(klines, tf, {}, dailyKlines);
    const sweeps = detectLiquiditySweeps(klines, levels, tf);
    const sessions = analyzeSessionLiquidity(klines);

    return NextResponse.json({
      symbol,
      timeframe: tf,
      currentPrice: klines[klines.length - 1]?.close || 0,
      totalLevels: levels.length,
      levels,
      sweeps,
      sessionKeyLevels: sessions.keyLevels,
      currentSession: sessions.currentSession,
      activeSessions: sessions.activeSessions ?? [],
      timestamp: Date.now(),
    }, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'LIQUIDITY_ERROR');
  }
}
