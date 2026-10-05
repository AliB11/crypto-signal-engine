import { MarketRegimeType, Signal } from '@/types/market';
import { toFaDigits } from '@/lib/format';

/**
 * «نبض کلان بازار» — تجمیع نتیجهٔ اسکن چندنمادی به یک تصویر واحد.
 *
 * تک‌سیگنال‌ها فقط وضعیت یک نماد را نشان می‌دهند؛ این ماژول با وزن‌دهی به امتیاز
 * ستاپ‌های جهت‌دار، میانهٔ نوسان و میانگین ADX، سوگیری کلی بازار (ریسک‌پذیری /
 * ریسک‌گریزی)، قدرت روند و وضعیت نوسان را به‌صورت نسبی (نسبت به همان اسکن)
 * محاسبه می‌کند تا در تایم‌فریم‌های مختلف هم معنادار بماند.
 */

export type MarketBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TrendStrength = 'WEAK' | 'MODERATE' | 'STRONG';
export type VolatilityState = 'NORMAL' | 'ELEVATED';

export interface MarketPulse {
  /** تعداد نمادهای اسکن‌شده */
  scanned: number;
  /** تعداد ستاپ‌های جهت‌دار (لانگ/شورت) */
  directional: number;
  longWeight: number;
  shortWeight: number;
  /** سهم وزن خرید از کل ستاپ‌های جهت‌دار (۰ تا ۱۰۰)؛ بدون ستاپ => null */
  riskOnPercent: number | null;
  bias: MarketBias;
  /** میانگین ADX نمادهای اسکن‌شده */
  avgAdx: number | null;
  trendStrength: TrendStrength | null;
  /** میانهٔ ATR نسبی — معیار نوسان مستقل از تایم‌فریم */
  medianAtrPercent: number | null;
  /** سهم نمادهایی که نوسانشان دست‌کم ۱.۵ برابر میانه است */
  elevatedVolShare: number;
  volatility: VolatilityState | null;
  dominantRegime: MarketRegimeType | null;
  /** درصد نمادهایی که ستاپ جهت‌دار دارند */
  coveragePercent: number;
}

/** آستانه‌های سوگیری بازار بر پایهٔ سهم وزنی خرید */
export const BIAS_BULLISH_THRESHOLD = 62;
export const BIAS_BEARISH_THRESHOLD = 38;
/** آستانهٔ ADX برای روند «قوی» و «ضعیف» */
export const ADX_STRONG = 30;
export const ADX_WEAK = 20;
/** ضریب تشخیص نوسان غیرعادی نسبت به میانهٔ همان اسکن */
export const VOLATILITY_ELEVATED_MULTIPLE = 1.5;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeMarketPulse(signals: Signal[]): MarketPulse {
  const scanned = signals.length;
  const directionalSignals = signals.filter((s) => s.direction === 'LONG' || s.direction === 'SHORT');

  const longWeight = directionalSignals
    .filter((s) => s.direction === 'LONG')
    .reduce((sum, s) => sum + Math.max(0, s.score), 0);
  const shortWeight = directionalSignals
    .filter((s) => s.direction === 'SHORT')
    .reduce((sum, s) => sum + Math.max(0, s.score), 0);

  const totalWeight = longWeight + shortWeight;
  const riskOnPercent = totalWeight > 0 ? Math.round((longWeight / totalWeight) * 100) : null;

  let bias: MarketBias = 'NEUTRAL';
  if (riskOnPercent !== null) {
    if (riskOnPercent >= BIAS_BULLISH_THRESHOLD) bias = 'BULLISH';
    else if (riskOnPercent <= BIAS_BEARISH_THRESHOLD) bias = 'BEARISH';
  }

  const adxValues = signals
    .map((s) => s.marketRegime?.adx)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avgAdx = adxValues.length > 0 ? adxValues.reduce((a, b) => a + b, 0) / adxValues.length : null;

  let trendStrength: TrendStrength | null = null;
  if (avgAdx !== null) {
    if (avgAdx >= ADX_STRONG) trendStrength = 'STRONG';
    else if (avgAdx >= ADX_WEAK) trendStrength = 'MODERATE';
    else trendStrength = 'WEAK';
  }

  const atrValues = signals
    .map((s) => s.marketRegime?.atrPercent ?? s.tradePlan?.atrPercent)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const medianAtrPercent = median(atrValues);
  // آستانه با یک اپسیلون کوچک مقایسه می‌شود تا خطای شناور (مثلاً ۰.۸×۱.۵ > ۱.۲) نتیجه را خراب نکند
  const elevatedThreshold = medianAtrPercent === null ? 0 : medianAtrPercent * VOLATILITY_ELEVATED_MULTIPLE - 1e-9;
  const elevatedVolShare =
    medianAtrPercent && medianAtrPercent > 0
      ? atrValues.filter((v) => v >= elevatedThreshold).length / atrValues.length
      : 0;
  const volatility: VolatilityState | null =
    medianAtrPercent === null ? null : elevatedVolShare >= 0.35 ? 'ELEVATED' : 'NORMAL';

  const regimeCounts = new Map<MarketRegimeType, number>();
  for (const s of signals) {
    const regime = s.marketRegime?.regime;
    if (!regime) continue;
    regimeCounts.set(regime, (regimeCounts.get(regime) || 0) + 1);
  }
  let dominantRegime: MarketRegimeType | null = null;
  let dominantCount = 0;
  for (const [regime, count] of regimeCounts) {
    if (count > dominantCount) {
      dominantRegime = regime;
      dominantCount = count;
    }
  }

  return {
    scanned,
    directional: directionalSignals.length,
    longWeight,
    shortWeight,
    riskOnPercent,
    bias,
    avgAdx: avgAdx === null ? null : Math.round(avgAdx * 10) / 10,
    trendStrength,
    medianAtrPercent: medianAtrPercent === null ? null : Math.round(medianAtrPercent * 100) / 100,
    elevatedVolShare: Math.round(elevatedVolShare * 100) / 100,
    volatility,
    dominantRegime,
    coveragePercent: scanned > 0 ? Math.round((directionalSignals.length / scanned) * 100) : 0,
  };
}

export function biasLabel(bias: MarketBias): string {
  if (bias === 'BULLISH') return 'سوگیری صعودی';
  if (bias === 'BEARISH') return 'سوگیری نزولی';
  return 'بازار دوطرفه';
}

export function trendStrengthLabel(strength: TrendStrength | null): string {
  if (strength === 'STRONG') return 'روند قوی';
  if (strength === 'MODERATE') return 'روند متوسط';
  if (strength === 'WEAK') return 'بدون روند (رِنج)';
  return 'نامشخص';
}

export function volatilityLabel(state: VolatilityState | null): string {
  if (state === 'ELEVATED') return 'نوسان بالاتر از معمول';
  if (state === 'NORMAL') return 'نوسان عادی';
  return 'نامشخص';
}

/** یک جملهٔ تفسیری کوتاه از ترکیب سوگیری، روند و پوشش ستاپ‌ها */
export function describeMarketPulse(pulse: MarketPulse): string {
  if (pulse.directional === 0) {
    return `در این اسکن هیچ ستاپ جهت‌داری میان ${toFaDigits(pulse.scanned)} نماد پیدا نشد؛ بازار در حالت انتظار است.`;
  }

  const breadth = `سهم وزنی خرید ${toFaDigits(pulse.riskOnPercent ?? 0)}٪ از ${toFaDigits(
    pulse.directional
  )} ستاپ جهت‌دار است`;

  if (pulse.bias === 'BULLISH' && pulse.trendStrength === 'STRONG') {
    return `${breadth} و میانگین ADX نشان‌دهندهٔ روند صعودی قوی است.`;
  }
  if (pulse.bias === 'BEARISH' && pulse.trendStrength === 'STRONG') {
    return `${breadth} و میانگین ADX نشان‌دهندهٔ روند نزولی قوی است.`;
  }
  if (pulse.trendStrength === 'WEAK') {
    return `${breadth}، اما میانگین ADX پایین است و ستاپ‌ها بیشتر در بازار رِنج معنا دارند.`;
  }
  return `${breadth} و شدت روند بازار متوسط است.`;
}
