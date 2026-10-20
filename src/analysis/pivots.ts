import { Kline, SwingPoint } from '../types/market';

/**
 * Confirmed Pivot Point Detection (No Look-Ahead Bias)
 *
 * A pivot at index `i` requires `leftBars` bars before it and `rightBars` bars after it
 * with lower highs (for swing high) or higher lows (for swing low).
 *
 * In real-time analysis, pivot `i` is ONLY confirmed when candle `i + rightBars` has closed.
 */
/**
 * قدرت یک پیوت، ۰ تا ۱۰۰.
 *
 * پیش‌تر `min(100, 50 + ratio * 20)` بود که `ratio` نسبت حجم کندل پیوت به *یک*
 * کندل قبلی بود؛ عملاً هر پیوتی بین ۵۰ تا ۱۰۰ می‌گرفت و تمایز واقعی بین پیوت
 * پرحجم و کم‌حجم ایجاد نمی‌کرد (نسبت ≈۱ ⇒ ۷۰، و با یک کندل پرحجم فوراً به سقف
 * ۱۰۰ می‌چسبید). اگر حجم کندل قبلی صفر بود، `|| 1` تقسیم را به نسبتی نجومی
 * تبدیل می‌کرد و قدرت ۱۰۰ می‌ساخت.
 *
 * حالا قدرت از دو جزء واقعی ساخته می‌شود:
 *  1. حجم کندل پیوت نسبت به *میانگین حجم* پنجره (نه یک کندل تکی)؛
 *  2. میزان برآمدگی پیوت نسبت به کندل‌های همسایه‌اش (چقدر از اطرافش جداست).
 */
function pivotStrength(
  klines: Kline[],
  index: number,
  type: 'SWING_HIGH' | 'SWING_LOW',
  avgVolume: number
): number {
  const candle = klines[index];

  // جزء حجمی: نسبت به میانگین پنجره، در دو برابر میانگین به سقف می‌رسد
  const volumeScore = avgVolume > 0 ? Math.min(1, candle.volume / (avgVolume * 2)) : 0;

  // جزء جدایی قیمت: فاصلهٔ پیوت تا اکسترمم همسایگان، نرمال‌شده با دامنهٔ کندل
  const from = Math.max(0, index - 3);
  const to = Math.min(klines.length - 1, index + 2);
  const neighbours = klines.slice(from, to + 1).filter((_, offset) => from + offset !== index);
  const range = Math.max(candle.high - candle.low, candle.close * 1e-9);
  let isolation = 0;
  if (neighbours.length > 0) {
    const extreme =
      type === 'SWING_HIGH'
        ? Math.max(...neighbours.map((k) => k.high))
        : Math.min(...neighbours.map((k) => k.low));
    const pivotPrice = type === 'SWING_HIGH' ? candle.high : candle.low;
    isolation = Math.min(1, Math.abs(pivotPrice - extreme) / range);
  }

  return Math.max(0, Math.min(100, Math.round(volumeScore * 60 + isolation * 40)));
}

export function findConfirmedPivots(
  klines: Kline[],
  leftBars = 3,
  rightBars = 2,
  maxIndex?: number
): { swingHighs: SwingPoint[]; swingLows: SwingPoint[] } {
  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  // میانگین حجم برای نرمال‌سازی قدرت پیوت‌ها — بدون کندل در حال تشکیل (آخرین کندل)
  const closed = klines.slice(0, Math.max(0, klines.length - 1)).slice(-50);
  const avgVolume =
    closed.length > 0 ? closed.reduce((sum, k) => sum + k.volume, 0) / closed.length : 0;

  const limit = maxIndex !== undefined ? Math.min(maxIndex, klines.length - 1) : klines.length - 1;

  for (let i = leftBars; i <= limit - rightBars; i++) {
    const currentHigh = klines[i].high;
    const currentLow = klines[i].low;

    // Check Swing High
    let isHigh = true;
    for (let l = 1; l <= leftBars; l++) {
      if (klines[i - l].high >= currentHigh) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let r = 1; r <= rightBars; r++) {
        if (klines[i + r].high > currentHigh) {
          isHigh = false;
          break;
        }
      }
    }

    if (isHigh) {
      swingHighs.push({
        index: i,
        time: klines[i].timestamp,
        price: currentHigh,
        type: 'SWING_HIGH',
        confirmedAt: i + rightBars,
        strength: pivotStrength(klines, i, 'SWING_HIGH', avgVolume),
      });
    }

    // Check Swing Low
    let isLow = true;
    for (let l = 1; l <= leftBars; l++) {
      if (klines[i - l].low <= currentLow) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let r = 1; r <= rightBars; r++) {
        if (klines[i + r].low < currentLow) {
          isLow = false;
          break;
        }
      }
    }

    if (isLow) {
      swingLows.push({
        index: i,
        time: klines[i].timestamp,
        price: currentLow,
        type: 'SWING_LOW',
        confirmedAt: i + rightBars,
        strength: pivotStrength(klines, i, 'SWING_LOW', avgVolume),
      });
    }
  }

  return { swingHighs, swingLows };
}
