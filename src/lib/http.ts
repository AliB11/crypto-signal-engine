import { NextRequest, NextResponse } from 'next/server';
import { Timeframe } from '../types/market';
import { isTimeframe } from './timeframes';

/**
 * ابزارهای مشترک لایهٔ API: اعتبارسنجی ورودی، محدودسازی نرخ درخواست و پاسخ خطای یکدست.
 * هدف: هیچ پارامتر خامی از کاربر نباید بدون پاک‌سازی به پروایدر داده یا موتور تحلیل برسد.
 */

/**
 * محدودسازی نرخ و کلید مشتری از ماژول مشترک `lib/rate-limit` خوانده می‌شود تا
 * نکست و Cloudflare Worker دقیقاً یک منطق داشته باشند.
 */
export { checkRateLimit, clientKeyFromHeaders } from './rate-limit';
export type { RateLimitResult } from './rate-limit';
import { clientKeyFromHeaders, type RateLimitResult } from './rate-limit';

/** کلید یکتای مشتری برای محدودسازی نرخ (IP پشت پروکسی) */
export function clientKey(request: NextRequest): string {
  return clientKeyFromHeaders(request.headers);
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: 'تعداد درخواست‌ها بیش از حد مجاز است؛ لطفاً چند لحظه بعد تلاش کنید.',
      status: 'RATE_LIMITED',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } }
  );
}

/** پاک‌سازی نماد ورودی */
export function parseSymbolParam(raw: string | null, fallback = 'BTCUSDT'): string {
  if (!raw) return fallback;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 3 || clean.length > 20) return fallback;
  return clean;
}

/** اعتبارسنجی تایم‌فریم */
export function parseTimeframeParam(raw: string | null, fallback: Timeframe = '15m'): Timeframe {
  return isTimeframe(raw) ? raw : fallback;
}

/** خواندن عدد صحیح با محدودهٔ مجاز */
export function parseIntParam(
  raw: string | number | null | undefined,
  { min, max, fallback }: { min: number; max: number; fallback: number }
): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/** پاسخ خطای یکدست با پیام فارسی و کد وضعیت مناسب */
export function errorResponse(err: unknown, status = 500, code = 'INTERNAL_ERROR'): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message, status: code, timestamp: Date.now() }, { status });
}

/** وزن‌های سفارشی از کوئری‌استرینگ (اعتبارسنجی + محدودهٔ ۰ تا ۱) */
export function parseWeightsParam<T extends object>(
  raw: string | null,
  template: T
): Partial<T> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Partial<T> = {};
    for (const key of Object.keys(template) as (keyof T & string)[]) {
      const value = Number(parsed[key]);
      if (isFinite(value) && value >= 0 && value <= 1) {
        clean[key] = value as T[keyof T & string];
      }
    }
    return Object.keys(clean).length > 0 ? clean : undefined;
  } catch {
    return undefined;
  }
}
