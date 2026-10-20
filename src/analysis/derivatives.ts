import { DerivativesData, Kline, Timeframe } from '../types/market';
import { TIMEFRAME_MS } from '../lib/timeframes';

/** آستانهٔ تغییر قیمت و تغییر OI برای دسته‌بندی روند موقعیت‌ها (درصد) */
const PRICE_MOVE_THRESHOLD_PERCENT = 0.3;
const OI_CHANGE_THRESHOLD_PERCENT = 0.5;

/**
 * دسته‌بندی روند موقعیت‌های باز (OI Trend) با ترکیب تغییر قیمت و تغییر OI.
 *
 * دو خطای داده‌ای اینجا اصلاح شد:
 *
 * 1. **ناهم‌ترازی زمانی.** `oiChange1hPercent` یک تغییر *یک‌ساعته* است، اما تغییر
 *    قیمت پیش‌تر از `klines[length-5]` گرفته می‌شد؛ یعنی ۴ کندل از هر تایم‌فریمی
 *    که اتفاقاً پاس داده شده بود (۴ دقیقه روی 1m، ۱۶ ساعت روی 4h). مقایسهٔ یک
 *    تغییر ۴دقیقه‌ای با یک تغییر یک‌ساعته، برچسب‌های `LONG_BUILDUP` و
 *    `SHORT_COVERING` بی‌معنا می‌ساخت. حالا پنجرهٔ کندل طوری انتخاب می‌شود که
 *    به یک ساعت نزدیک باشد و اگر تایم‌فریم از یک ساعت درشت‌تر است (۴ساعته/روزانه)
 *    اصلاً پالایشی انجام نمی‌شود، چون با این کندل‌ها نمی‌توان حرکت یک‌ساعته را سنجید.
 *
 * 2. **ساختن روند از دادهٔ ناموجود.** اگر `oiChange1hPercent` در `missingFields`
 *    باشد (اندپوینت OI پاسخ نداده)، پیش‌تر مقدار پیش‌فرض صفر خوانده می‌شد و
 *    تابع همچنان یک برچسب روند تولید می‌کرد. حالا در این حالت مقدار پروایدر
 *    دست‌نخورده باقی می‌ماند.
 *
 * این تابع خالص است و هرگز داده‌ای اختراع نمی‌کند: یا یک برچسب مستند بر پایهٔ
 * دادهٔ واقعی می‌سازد، یا ورودی را بدون تغییر برمی‌گرداند.
 */
export function enrichDerivativesData(
  derivatives: DerivativesData,
  klines: Kline[],
  timeframe: Timeframe = '15m'
): DerivativesData {
  const interval = TIMEFRAME_MS[timeframe];
  if (!klines || klines.length < 2 || !interval) return derivatives;

  // تغییر OI یک‌ساعته در دسترس نیست ⇒ هیچ دسته‌بندی‌ای ساخته نمی‌شود
  if (derivatives.missingFields?.includes('oiChange1hPercent')) return derivatives;

  const oiChange = derivatives.oiChange1hPercent;
  if (typeof oiChange !== 'number' || !Number.isFinite(oiChange)) return derivatives;

  // یک کندلِ این تایم‌فریم بلندتر از یک ساعت است ⇒ پنجرهٔ یک‌ساعته قابل ساختن نیست
  if (interval > TIMEFRAME_MS['1h']) return derivatives;

  // نزدیک‌ترین پنجرهٔ کندلی به یک ساعت (دست‌کم یک کندل فاصله)
  const lookback = Math.max(1, Math.round(TIMEFRAME_MS['1h'] / interval));
  if (klines.length <= lookback) return derivatives;

  const currentPrice = klines[klines.length - 1].close;
  const prevPrice = klines[klines.length - 1 - lookback].close;
  if (!Number.isFinite(currentPrice) || !Number.isFinite(prevPrice) || prevPrice <= 0) {
    return derivatives;
  }

  const priceChangePercent = ((currentPrice - prevPrice) / prevPrice) * 100;

  // Determine refined OI trend based on price movement & OI change
  let oiTrend: DerivativesData['oiTrend'] = derivatives.oiTrend;

  if (priceChangePercent > PRICE_MOVE_THRESHOLD_PERCENT && oiChange > OI_CHANGE_THRESHOLD_PERCENT) {
    oiTrend = 'LONG_BUILDUP';
  } else if (
    priceChangePercent > PRICE_MOVE_THRESHOLD_PERCENT &&
    oiChange < -OI_CHANGE_THRESHOLD_PERCENT
  ) {
    oiTrend = 'SHORT_COVERING';
  } else if (
    priceChangePercent < -PRICE_MOVE_THRESHOLD_PERCENT &&
    oiChange > OI_CHANGE_THRESHOLD_PERCENT
  ) {
    oiTrend = 'SHORT_BUILDUP';
  } else if (
    priceChangePercent < -PRICE_MOVE_THRESHOLD_PERCENT &&
    oiChange < -OI_CHANGE_THRESHOLD_PERCENT
  ) {
    oiTrend = 'LONG_LIQUIDATION';
  }

  return { ...derivatives, oiTrend };
}
