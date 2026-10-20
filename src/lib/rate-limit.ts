/**
 * محدودساز نرخ درخواست به سبک سبد توکن، کاملاً در حافظه (بدون دیتابیس).
 *
 * این ماژول عمداً هیچ وابستگی به `next/server` ندارد تا همان منطق هم در مسیرهای
 * API نکست و هم در Cloudflare Worker استفاده شود. پیش‌تر Worker هیچ محدودسازی
 * نداشت، یعنی دو سطح کاملاً متفاوتِ محافظت برای یک API یکسان.
 *
 * توجه: در محیط سرورلس هر isolate شمارندهٔ خودش را دارد؛ بنابراین این سقف
 * «به ازای هر نمونهٔ در حال اجرا» است، نه سراسری. این یک محدودیت معماریِ
 * zero-database است و در مستندات هم گفته شده است.
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

/** کلید یکتای مشتری برای محدودسازی نرخ.
 *  `x-forwarded-for` قابل جعل است؛ فقط به‌عنوان بهترین تلاش (best-effort) استفاده
 *  می‌شود و نباید مبنای هیچ تصمیم امنیتیِ حساس قرار بگیرد. */
export function clientKeyFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim() || 'anonymous';
  return headers.get('x-real-ip') || 'anonymous';
}
