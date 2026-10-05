import { Timeframe } from '../types/market';

/** ترتیب تایم‌فریم‌ها از کوچک به بزرگ */
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/**
 * مدت هر تایم‌فریم به میلی‌ثانیه — تک‌منبعِ حقیقت برای همه لایه‌ها
 * (پیش‌تر این جدول در چند فایل تکرار شده بود و امکان واگرایی داشت)
 */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

/** مدت تایم‌فریم به دقیقه */
export const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
};

/** بررسی معتبر بودن تایم‌فریم ورودی (برای اعتبارسنجی پارامترهای API) */
export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && (TIMEFRAMES as string[]).includes(value);
}

/**
 * تبدیل تایم‌فریم به تایم‌فریم پشتیبان برای تحلیل جلسات معاملاتی.
 * جلسات (آسیا/لندن/نیویورک) بر پایه ساعت UTC تعریف می‌شوند؛ بنابراین برای
 * تایم‌فریم‌های درشت‌تر از ۱۵ دقیقه، تحلیل جلسه باید روی کندل‌های ۱۵ دقیقه‌ای
 * انجام شود تا هر جلسه کندل واقعی داشته باشد (وگرنه کندل ۱روزه فقط در ساعت ۰۰:۰۰
 * قرار می‌گیرد و جلسات لندن/نیویورک خالی می‌مانند).
 */
export function sessionTimeframeFor(tf: Timeframe): Timeframe {
  const order: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
  return order.indexOf(tf) <= order.indexOf('15m') ? tf : '15m';
}

/** تعداد دوره‌های یک تایم‌فریم در یک سال (برای سالانه‌سازی شاخص‌های ریسک) */
export function periodsPerYear(tf: Timeframe): number {
  return (365 * 24 * 60) / TIMEFRAME_MINUTES[tf];
}
