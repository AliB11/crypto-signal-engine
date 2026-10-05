import { NextRequest, NextResponse } from 'next/server';
import { Timeframe } from '../types/market';
import { isTimeframe } from './timeframes';

/**
 * ابزارهای مشترک لایهٔ API: اعتبارسنجی ورودی، محدودسازی نرخ درخواست و پاسخ خطای یکدست.
 * هدف: هیچ پارامتر خامی از کاربر نباید بدون پاک‌سازی به پروایدر داده یا موتور تحلیل برسد.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const RATE_BUCKETS = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

/**
 * محدودساز نرخ درخواست به سبک سبد توکن، کاملاً در حافظه (بدون دیتابیس).
 * هر مسیر می‌تواند سقف خودش را تعیین کند؛ این لایه از هدررفتِ سهمیهٔ API بایننس
 * و سوءاستفاده از endpoints عمومی جلوگیری می‌کند.
 */
export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): RateLimitResult {
  const now = Date.now();

  if (RATE_BUCKETS.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of RATE_BUCKETS) {
      if (now - bucket.updatedAt > windowMs * 2) RATE_BUCKETS.delete(bucketKey);
    }
    if (RATE_BUCKETS.size > MAX_BUCKETS) RATE_BUCKETS.clear();
  }

  const bucket = RATE_BUCKETS.get(key) || { tokens: limit, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  const refill = (elapsed / windowMs) * limit;
  bucket.tokens = Math.min(limit, bucket.tokens + refill);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    RATE_BUCKETS.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(((1 - bucket.tokens) * windowMs) / limit / 1000)),
    };
  }

  bucket.tokens -= 1;
  RATE_BUCKETS.set(key, bucket);
  return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSeconds: 0 };
}

/** کلید یکتای مشتری برای محدودسازی نرخ (IP پشت پروکسی) */
export function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'anonymous';
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
