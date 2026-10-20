/**
 * محاسبات خالص فاندینگ (Funding).
 *
 * این توابع از `BinanceProvider` بیرون کشیده شده‌اند تا بدون شبکه قابل تست باشند.
 *
 * چرا مهم است: پیش‌تر سالانه‌سازی فاندینگ `rate × 3 × 365` بود، یعنی *فرض* می‌کرد
 * فاندینگ هر نماد هر ۸ ساعت تسویه می‌شود. بایننس برای نمادهای مختلف بازه‌های
 * متفاوتی دارد (۴، ۸ یا حتی ۱ ساعت) که از `/fapi/v1/fundingInfo` خوانده می‌شود.
 * با بازهٔ ۴ساعته، عدد گزارش‌شده نصف مقدار واقعی بود.
 */

/** بازهٔ پیش‌فرض فاندینگ بایننس وقتی `/fapi/v1/fundingInfo` در دسترس نیست */
export const DEFAULT_FUNDING_INTERVAL_HOURS = 8;

/**
 * سالانه‌سازی نرخ فاندینگ.
 *
 * @param rate        نرخ فاندینگ هر بازه (مثلاً `0.0001` یعنی ۰٫۰۱٪)
 * @param intervalHours بازهٔ تسویهٔ *واقعی* همان نماد؛ `null` یعنی خوانده نشد
 * @returns درصد سالانه، یا `null` اگر ورودی معتبر نباشد
 *
 * `null` عمداً برمی‌گردد: ساختن یک عدد از ورودی نامعتبر، همان چیزی است که این
 * ماژول برای حذفش نوشته شده.
 */
export function annualizeFundingRate(
  rate: number | null | undefined,
  intervalHours: number | null | undefined
): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  const hours =
    typeof intervalHours === 'number' && Number.isFinite(intervalHours) && intervalHours > 0
      ? intervalHours
      : DEFAULT_FUNDING_INTERVAL_HOURS;
  const periodsPerDay = 24 / hours;
  return Number((rate * periodsPerDay * 365 * 100).toFixed(3));
}

/** برچسب فارسی بازهٔ فاندینگ؛ `null` وقتی بازه خوانده نشده است */
export function fundingIntervalLabel(intervalHours: number | null | undefined): string | null {
  if (typeof intervalHours !== 'number' || !Number.isFinite(intervalHours) || intervalHours <= 0) {
    return null;
  }
  return `${intervalHours}ساعته`;
}
