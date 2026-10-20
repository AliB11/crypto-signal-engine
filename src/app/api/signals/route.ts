import { NextRequest, NextResponse } from 'next/server';
import { dataProvider } from '@/providers';
import { createDataTrace, dataQualityFromTrace } from '@/providers/MarketDataProvider';
import { runFullAnalysis } from '@/analysis/engine';
import {
  checkRateLimit,
  clientKey,
  parseSymbolParam,
  parseTimeframeParam,
  rateLimitResponse,
  errorResponse,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 20;

export async function GET(request: NextRequest) {
  const limitCheck = checkRateLimit(`signals:${clientKey(request)}`, 30, 60_000);
  if (!limitCheck.allowed) return rateLimitResponse(limitCheck);

  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT';
    const tf = parseTimeframeParam(searchParams.get('tf'), '15m');

    const symbols = symbolsParam
      .split(',')
      .map((s) => parseSymbolParam(s, ''))
      .filter((s): s is string => s.length >= 3)
      .slice(0, MAX_SYMBOLS);

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'هیچ نماد معتبری ارسال نشده است.', status: 'INVALID_SYMBOLS' }, { status: 400 });
    }

    // یک شمارندهٔ مشترک برای کل این درخواست تا «کیفیت داده» به درخواست‌های
    // هم‌زمانِ دیگر آلوده نشود.
    const trace = createDataTrace();
    const errors: { symbol: string; message: string }[] = [];

    const results = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await runFullAnalysis(dataProvider, sym, {
            timeframe: tf,
            candleLimit: 120,
            trace,
          });
          return { signal: res.signal, dataSource: res.dataSource };
        } catch (err: unknown) {
          // خطاها پیش‌تر بی‌صدا حذف می‌شدند و فراخوان نمی‌دانست چند نماد تحلیل نشده است
          errors.push({
            symbol: sym,
            message: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      })
    );

    const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const liveCount = valid.filter((r) => r.dataSource === 'live').length;
    const dataQuality = dataQualityFromTrace(trace);

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      timestamp: Date.now(),
      timeframe: tf,
      dataSource: dataQuality.source,
      dataQuality,
      /** تعداد نمادهایی که تحلیلشان موفق بود / کل نمادهای درخواستی */
      analyzedCount: valid.length,
      errors,
      signals: valid.map((r) => r.signal),
      // حفظ سازگاری با مصرف‌کننده‌های قدیمی که این فیلد را می‌خواندند
      liveCount,
    });
  } catch (err: unknown) {
    return errorResponse(err, 500, 'SIGNALS_ERROR');
  }
}
