/**
 * ابزارهای قالب‌بندی اعداد، قیمت‌ها و تاریخ‌ها
 *
 * قرارداد نمایش: قیمت‌ها و اعداد مالی با ارقام لاتین (استاندارد صرافی‌های فارسی‌زبان)
 * و تاریخ‌ها با تقویم جلالی (locale fa-IR) نمایش داده می‌شوند.
 */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل ارقام لاتین به فارسی (برای شمارنده‌ها و برچسب‌های متنی) */
export function toFaDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * گرد کردن قیمت با دقت وابسته به بزرگی عدد.
 * مشکل toFixed(2) برای کوین‌های ارزان (مثل PEPE که 0.00 می‌شد) را حل می‌کند.
 */
export function roundPrice(price: number): number {
  if (!isFinite(price) || price === 0) return 0;
  const abs = Math.abs(price);
  if (abs >= 1000) return parseFloat(price.toFixed(2));
  if (abs >= 1) return parseFloat(price.toFixed(4));
  if (abs >= 0.01) return parseFloat(price.toFixed(6));
  return parseFloat(price.toPrecision(5));
}

/** قالب‌بندی قیمت دلار با ارقام لاتین و جداکننده هزارگان */
export function formatPrice(price: number): string {
  if (!isFinite(price)) return '—';
  const abs = Math.abs(price);
  const opts: Intl.NumberFormatOptions =
    abs >= 1000
      ? { maximumFractionDigits: 2 }
      : abs >= 1
      ? { maximumFractionDigits: 4 }
      : abs >= 0.01
      ? { maximumFractionDigits: 6 }
      : { maximumSignificantDigits: 4 };
  return '$' + new Intl.NumberFormat('en-US', opts).format(price);
}

/** قیمت بدون علامت دلار */
export function formatNumber(value: number, maxFractionDigits = 2): string {
  if (!isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** زمان با اعداد فارسی (ساعت:دقیقه:ثانیه) */
export function formatFaTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

/** تاریخ جلالی کوتاه */
export function formatFaDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('fa-IR');
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

/** تاریخ و زمان جلالی برای لاگ معاملات */
export function formatFaDateTime(ts: number): string {
  try {
    const date = new Date(ts).toLocaleDateString('fa-IR');
    const time = new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return `${date} - ${time}`;
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/** قالب‌بندی درصدها با علامت */
export function formatSignedPercent(value: number, digits = 2): string {
  const v = value.toFixed(digits);
  return `${value >= 0 ? '+' : ''}${v}%`;
}
