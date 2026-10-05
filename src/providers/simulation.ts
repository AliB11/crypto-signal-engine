import { DerivativesData, Kline, Timeframe, Ticker24h } from '../types/market';
import { TIMEFRAME_MS } from '../lib/timeframes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * موتور دادهٔ شبیه‌سازی‌شدهٔ «قطعی و بازتولیدپذیر» (Deterministic Simulation)
 * ─────────────────────────────────────────────────────────────────────────────
 * وقتی دسترسی به بایننس برقرار نباشد (تحریم جغرافیایی، قطعی شبکه، سندباکس)، برنامه
 * باید به حالت شبیه‌سازی پناه ببرد. نسخهٔ قبلی از `Math.random()` استفاده می‌کرد و
 * در نتیجه:
 *   ۱) قیمت هر بار درخواست تغییر می‌کرد (BTC در سه درخواست پیاپی ۹۶۵۰۰، ۱۰۰۶۶۹ و ۱۰۱۰۷۰)
 *   ۲) تیکر ۲۴ساعته با کندل‌ها ناسازگار بود
 *   ۳) خروجی بک‌تست بازتولیدپذیر نبود
 *
 * در این ماژول قیمت هر کندل تابعی قطعی از (نماد، تایم‌فریم، اندیس جهانی کندل) است؛
 * بنابراین:
 *   • کندلِ گذشته هرگز تغییر نمی‌کند (فقط کندل جاری با گذر زمان تکمیل می‌شود)
 *   • تیکر، کندل‌ها و دادهٔ مشتقات همه از یک منبع مشترک مشتق می‌شوند
 *   • بک‌تست روی دادهٔ شبیه‌سازی‌شده کاملاً بازتولیدپذیر است
 *
 * از نویز کسری (fractal value-noise) با درون‌یابی کسینوسی استفاده می‌شود تا
 * سری قیمت پیوسته، بدون پرش و شبیه به رفتار واقعی بازار باشد.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** قیمت پایهٔ هر نماد (فقط برای دادهٔ شبیه‌سازی‌شده) */
export const SIM_BASE_PRICES: Record<string, number> = {
  BTCUSDT: 64800,
  ETHUSDT: 3150,
  BNBUSDT: 585,
  SOLUSDT: 148,
  XRPUSDT: 0.62,
  DOGEUSDT: 0.138,
  ADAUSDT: 0.44,
  AVAXUSDT: 27.5,
  LINKUSDT: 14.8,
  DOTUSDT: 6.4,
  SUIUSDT: 1.62,
  NEARUSDT: 5.1,
  APTUSDT: 8.4,
  PEPEUSDT: 0.0000105,
  SHIBUSDT: 0.0000182,
  LTCUSDT: 74.5,
  UNIUSDT: 8.9,
  ICPUSDT: 8.2,
  RENDERUSDT: 6.3,
  FETUSDT: 1.32,
  ARBUSDT: 0.78,
  OPUSDT: 1.45,
  INJUSDT: 20.4,
  TIAUSDT: 4.6,
  SEIUSDT: 0.34,
};

/** نوسان روزانهٔ تقریبی هر نماد در حالت شبیه‌سازی */
const SIM_VOLATILITY: Record<string, number> = {
  BTCUSDT: 0.012,
  ETHUSDT: 0.016,
  BNBUSDT: 0.015,
  SOLUSDT: 0.022,
  XRPUSDT: 0.024,
  DOGEUSDT: 0.028,
  ADAUSDT: 0.024,
  AVAXUSDT: 0.026,
  LINKUSDT: 0.024,
  DOTUSDT: 0.024,
  PEPEUSDT: 0.038,
  SHIBUSDT: 0.034,
};

const SIM_DEFAULT_PRICE = 12.5;
const SIM_DEFAULT_VOLATILITY = 0.03;
const SIM_DEFAULT_BASE_VOLUME = 120_000;

/** هش رشته‌ای به عدد ۳۲ بیتی (FNV-1a) */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** مولد شبه‌تصادفی قطعی: خروجی برای (seed, index) همیشه یکسان است */
function rand01(seed: number, index: number): number {
  let t = (seed ^ Math.imul(index | 0, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** نویز کسری پیوسته در بازهٔ ۰ تا ۱ */
function fractalNoise(seed: number, x: number, octaves = 4): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const latticeSeed = (seed + o * 7919) >>> 0;
    const scaled = x * frequency;
    const i0 = Math.floor(scaled);
    const frac = scaled - i0;
    const smooth = (1 - Math.cos(frac * Math.PI)) / 2;
    const a = rand01(latticeSeed, i0);
    const b = rand01(latticeSeed, i0 + 1);
    value += amplitude * (a + (b - a) * smooth);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }
  return norm > 0 ? value / norm : 0.5;
}

export function simBasePrice(symbol: string): number {
  return SIM_BASE_PRICES[symbol] || SIM_DEFAULT_PRICE;
}

export function simVolatility(symbol: string): number {
  return SIM_VOLATILITY[symbol] || SIM_DEFAULT_VOLATILITY;
}

/**
 * قیمت قطعی نماد در لحظهٔ t (میلی‌ثانیه).
 *
 * نکتهٔ کلیدی: این تابع به تایم‌فریم وابسته نیست و تابعی از *زمان* است؛ بنابراین
 * سری‌های ۱ دقیقه، ۱۵ دقیقه، ۱ ساعته و روزانهٔ یک نماد همه نمونه‌برداری‌هایی از
 * «یک منحنی قیمتِ مشترک» هستند — همان‌طور که در بازار واقعی. پیش‌تر هر تایم‌فریم
 * نویز مستقل خودش را داشت و نمودار ۱۵ دقیقه‌ای با تیکر ۲۴ساعته ناسازگار می‌شد.
 */
export function simPriceAt(symbol: string, timestampMs: number): number {
  const seed = hashString(`${symbol}|price-curve`);
  const base = simBasePrice(symbol);
  const vol = simVolatility(symbol);
  const days = timestampMs / TIMEFRAME_MS['1d'];

  // سه اکتاو با مقیاس ماه / چندروز / چندساعت
  const macro = (fractalNoise(seed, days / 30, 3) - 0.5) * 2;
  const swing = (fractalNoise(seed ^ 0x5bf03635, days / 3, 3) - 0.5) * 2;
  const micro = (fractalNoise(seed ^ 0x27d4eb2f, days * 4, 2) - 0.5) * 2;

  const logReturn = vol * (macro * 9 + swing * 3.5 + micro * 1.1);
  return base * Math.exp(logReturn);
}

/**
 * تولید کندل‌های قطعی برای یک نماد و تایم‌فریم.
 * آخرین کندل «در حال تشکیل» است (closeTime در آینده) — دقیقاً مانند فید زندهٔ بایننس.
 */
export function simulateKlines(
  symbol: string,
  timeframe: Timeframe,
  count: number,
  now: number = Date.now()
): Kline[] {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const interval = TIMEFRAME_MS[timeframe];
  const lastIndex = Math.floor(now / interval);
  const firstIndex = lastIndex - Math.max(1, count) + 1;
  const klines: Kline[] = [];

  const vol = simVolatility(safeSymbol) * Math.sqrt(interval / TIMEFRAME_MS['1d']);
  const baseVolume = SIM_DEFAULT_BASE_VOLUME * (safeSymbol === 'BTCUSDT' ? 40 : 1);

  let prevClose = simPriceAt(safeSymbol, (firstIndex - 1) * interval);

  for (let index = firstIndex; index <= lastIndex; index++) {
    const timestamp = index * interval;
    const close = simPriceAt(safeSymbol, timestamp);
    const open = prevClose;

    const seed = hashString(`${safeSymbol}|${timeframe}|ohlc`);
    const range = Math.abs(close - open) + Math.max(open, close) * vol * 0.35;
    const upperWick = range * (0.25 + rand01(seed, index) * 0.9);
    const lowerWick = range * (0.25 + rand01(seed ^ 0x6d2b79f5, index) * 0.9);

    const high = Math.max(open, close) + upperWick;
    const low = Math.max(0.0000001, Math.min(open, close) - lowerWick);

    const activity = 0.55 + rand01(seed ^ 0x1b56c4e9, index) * 1.1;
    const impulse = 1 + (Math.abs(close - open) / Math.max(open, 1)) * 45;
    const volume = baseVolume * activity * impulse * 0.01;
    const takerBuyRatio = 0.44 + rand01(seed ^ 0x3f84d5b5, index) * 0.12;

    klines.push({
      timestamp,
      open: roundSim(open),
      high: roundSim(high),
      low: roundSim(low),
      close: roundSim(close),
      volume: Number(volume.toFixed(2)),
      closeTime: (index + 1) * interval - 1,
      quoteVolume: Number((volume * close).toFixed(2)),
      trades: Math.round(volume * 4),
      takerBuyBaseVolume: Number((volume * takerBuyRatio).toFixed(2)),
      takerBuyQuoteVolume: Number((volume * takerBuyRatio * close).toFixed(2)),
    });

    prevClose = close;
  }

  return klines;
}

/** گرد کردن قیمت شبیه‌سازی‌شده با دقت وابسته به بزرگی عدد */
function roundSim(price: number): number {
  const abs = Math.abs(price);
  if (abs >= 1000) return Number(price.toFixed(2));
  if (abs >= 1) return Number(price.toFixed(4));
  if (abs >= 0.01) return Number(price.toFixed(6));
  return Number(price.toPrecision(6));
}

/**
 * تیکر ۲۴ساعتهٔ سازگار با کندل‌های شبیه‌سازی‌شده.
 * از سری ۱ساعتهٔ همان نماد مشتق می‌شود تا قیمت/حجم با کندل‌ها یکی باشد.
 */
export function simulateTicker(symbol: string, now: number = Date.now()): Ticker24h {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // پنجرهٔ ۲۴ ساعته از کندل‌های ۱ دقیقه‌ای ساخته می‌شود تا «آخرین قیمت» با
  // ریزترین تایم‌فریم نمودار (که کاربر می‌بیند) هم‌خوان باشد.
  const minuteCount = Math.max(2, Math.round(TIMEFRAME_MS['1d'] / TIMEFRAME_MS['1m']) + 1);
  const window = simulateKlines(safeSymbol, '1m', minuteCount, now);

  const last = window[window.length - 1];
  const first = window[0];
  const high = Math.max(...window.map((k) => k.high));
  const low = Math.min(...window.map((k) => k.low));
  const volume = window.reduce((sum, k) => sum + k.volume, 0);
  const quoteVolume = window.reduce((sum, k) => sum + k.quoteVolume, 0);

  return {
    symbol: safeSymbol,
    priceChange: Number((last.close - first.open).toFixed(6)),
    priceChangePercent: Number((((last.close - first.open) / first.open) * 100).toFixed(2)),
    lastPrice: last.close,
    highPrice: Number(high.toFixed(6)),
    lowPrice: Number(low.toFixed(6)),
    volume: Number(volume.toFixed(2)),
    quoteVolume: Number(quoteVolume.toFixed(2)),
    openPrice: first.open,
    closeTime: now,
  };
}

/**
 * دادهٔ مشتقات شبیه‌سازی‌شدهٔ قطعی.
 * برخلاف نسخهٔ قبلی که «۱۵۴۲۰ قرارداد باز» و «فاندینگ ۰.۰۱٪» ثابت را به‌عنوان
 * مقدار زنده گزارش می‌کرد، اینجا همهٔ مقادیر از نماد و بازهٔ زمانی جاری مشتق
 * می‌شوند و شیء خروجی با پرچم `isSimulated` علامت‌گذاری می‌شود.
 */
export function simulateDerivatives(symbol: string, now: number = Date.now()): DerivativesData {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // بازهٔ ۱۵ دقیقه‌ای جاری به‌عنوان دانهٔ زمانی: مقادیر در طول یک بازه ثابت می‌مانند
  const bucket = Math.floor(now / (15 * 60_000));
  const seed = hashString(`${safeSymbol}|derivatives`);

  const ticker = simulateTicker(safeSymbol, now);
  const price = ticker.lastPrice || simBasePrice(safeSymbol);

  const openInterestNotional = ticker.quoteVolume * (0.22 + rand01(seed, bucket) * 0.35);
  const openInterest = price > 0 ? openInterestNotional / price : 0;

  const oiChange1hPercent = Number(((rand01(seed ^ 0x2545f491, bucket) - 0.45) * 6).toFixed(2));
  const oiChange24hPercent = Number(((rand01(seed ^ 0x2c1b3c6d, bucket) - 0.4) * 16).toFixed(2));
  const fundingRate = Number(((rand01(seed ^ 0x9e3779b9, bucket) - 0.42) * 0.0008).toFixed(6));
  const globalLongShortRatio = Number((0.7 + rand01(seed ^ 0x12bd8c1f, bucket) * 1.4).toFixed(3));
  const topTraderPositionRatio = Number(
    (0.75 + rand01(seed ^ 0x7feb352d, bucket) * 1.5).toFixed(3)
  );
  const takerBuySellRatio = Number(
    (0.85 + rand01(seed ^ 0x846ca68b, bucket) * 0.35).toFixed(3)
  );

  const fundingCategory: DerivativesData['fundingCategory'] =
    fundingRate > 0.0005
      ? 'EXTREME_POSITIVE'
      : fundingRate > 0.00015
      ? 'POSITIVE'
      : fundingRate < -0.0005
      ? 'EXTREME_NEGATIVE'
      : fundingRate < -0.0001
      ? 'NEGATIVE'
      : 'NEUTRAL';

  const positioning: DerivativesData['positioning'] =
    globalLongShortRatio > 1.8 || topTraderPositionRatio > 2.0
      ? 'EXTREME_LONG'
      : globalLongShortRatio > 1.2 || topTraderPositionRatio > 1.3
      ? 'LONG_DOMINANT'
      : globalLongShortRatio < 0.6 || topTraderPositionRatio < 0.5
      ? 'EXTREME_SHORT'
      : globalLongShortRatio < 0.85 || topTraderPositionRatio < 0.8
      ? 'SHORT_DOMINANT'
      : 'BALANCED';

  const oiTrend: DerivativesData['oiTrend'] =
    oiChange1hPercent > 1.0 ? 'LONG_BUILDUP' : oiChange1hPercent < -1.0 ? 'SHORT_COVERING' : 'NEUTRAL';

  return {
    symbol: safeSymbol,
    openInterest: Number(openInterest.toFixed(4)),
    openInterestValueUSD: Number(openInterestNotional.toFixed(2)),
    oiChange1hPercent,
    oiChange24hPercent,
    oiTrend,
    fundingRate,
    fundingRateAnnualizedPercent: Number((fundingRate * 3 * 365 * 100).toFixed(3)),
    fundingCategory,
    globalLongShortRatio,
    topTraderLongShortRatio: topTraderPositionRatio,
    topTraderPositionRatio,
    positioning,
    takerBuySellRatio,
    timestamp: now,
    isSimulated: true,
  };
}
