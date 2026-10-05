import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { runBacktest } from '@/backtest/engine';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { SignalWeights } from '@/types/market';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  parseIntParam,
  parseWeightsParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';
import { LIMITS } from '@/config/engine';

export const dynamic = 'force-dynamic';

async function runFromParams(params: {
  symbol: string;
  timeframe: ReturnType<typeof parseTimeframeParam>;
  minScore: number;
  candleLimit: number;
  maxHoldingCandles: number;
  weights?: Partial<SignalWeights>;
}) {
  const klines = await dataProvider.getKlines(params.symbol, params.timeframe, params.candleLimit);

  if (!klines || klines.length < 60) {
    return NextResponse.json(
      {
        error: 'کندل کافی برای بک‌تست در دسترس نیست (حداقل ۶۰ کندل لازم است).',
        status: 'INSUFFICIENT_DATA',
      },
      { status: 422 }
    );
  }

  const report = runBacktest(params.symbol, params.timeframe, klines, {
    minScore: params.minScore,
    maxHoldingCandles: params.maxHoldingCandles,
    weights: params.weights,
  });

  return NextResponse.json(report);
}

export async function POST(request: NextRequest) {
  const limitCheck = checkRateLimit(`backtest:${clientKey(request)}`, 12, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const symbol = parseSymbolParam(String(body.symbol ?? ''), 'BTCUSDT');
    const timeframe = parseTimeframeParam(body.timeframe ? String(body.timeframe) : null, '15m');
    const minScore = parseIntParam(body.minScore as number | undefined, { min: 0, max: 100, fallback: 65 });
    const candleLimit = parseIntParam(body.candleLimit as number | undefined, LIMITS.backtestCandleLimit);
    const maxHoldingCandles = parseIntParam(body.maxHoldingCandles as number | undefined, {
      min: 5,
      max: 200,
      fallback: 30,
    });
    const weights = parseWeightsParam<SignalWeights>(
      body.weights ? JSON.stringify(body.weights) : null,
      DEFAULT_WEIGHTS
    );

    return await runFromParams({ symbol, timeframe, minScore, candleLimit, maxHoldingCandles, weights });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'BACKTEST_ERROR');
  }
}

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`backtest:${clientKey(request)}`, 12, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = parseSymbolParam(searchParams.get('symbol'), 'BTCUSDT');
    const timeframe = parseTimeframeParam(searchParams.get('tf'), '15m');
    const minScore = parseIntParam(searchParams.get('minScore'), { min: 0, max: 100, fallback: 65 });
    const candleLimit = parseIntParam(searchParams.get('limit'), LIMITS.backtestCandleLimit);
    const maxHoldingCandles = parseIntParam(searchParams.get('maxHoldingCandles'), {
      min: 5,
      max: 200,
      fallback: 30,
    });

    return await runFromParams({ symbol, timeframe, minScore, candleLimit, maxHoldingCandles });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'BACKTEST_ERROR');
  }
}
