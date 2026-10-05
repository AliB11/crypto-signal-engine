import { Kline, MarketRegime, MarketRegimeType } from '../types/market';

/**
 * تشخیص رژیم بازار
 *
 * اصلاح مهم: نسخهٔ قبلی «ADX» را با شمارش سادهٔ کندل‌های صعودی/نزولی تقریب می‌زد
 * (adx = |up - down| / 14 * 100) که رابطهٔ معناداری با قدرت روند نداشت. این نسخه
 * ADX استاندارد وایلدر را همراه با +DI/-DI محاسبه می‌کند و برای تأیید جهت روند از
 * شیب EMA20/EMA50 استفاده می‌کند.
 */

interface AdxResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/** میانگین متحرک نمایی روی آخرین مقدار */
function emaLast(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

/** ADX وایلدر با هموارسازی RMA (میانگین متحرک وایلدر) */
function computeADX(klines: Kline[], period = 14): AdxResult {
  if (klines.length < period * 2 + 1) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < klines.length; i++) {
    const upMove = klines[i].high - klines[i - 1].high;
    const downMove = klines[i - 1].low - klines[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const prevClose = klines[i - 1].close;
    tr.push(
      Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - prevClose),
        Math.abs(klines[i].low - prevClose)
      )
    );
  }

  const wilderSmooth = (values: number[]): number[] => {
    const out: number[] = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      if (i < period) {
        sum += values[i];
        if (i === period - 1) out.push(sum);
      } else {
        const prev = out[out.length - 1];
        out.push(prev - prev / period + values[i]);
      }
    }
    return out;
  };

  const smoothTR = wilderSmooth(tr);
  const smoothPlus = wilderSmooth(plusDM);
  const smoothMinus = wilderSmooth(minusDM);

  const dx: number[] = [];
  let lastPlusDI = 0;
  let lastMinusDI = 0;

  for (let i = 0; i < smoothTR.length; i++) {
    const trValue = smoothTR[i];
    if (trValue <= 0) {
      dx.push(0);
      continue;
    }
    const plusDI = (smoothPlus[i] / trValue) * 100;
    const minusDI = (smoothMinus[i] / trValue) * 100;
    lastPlusDI = plusDI;
    lastMinusDI = minusDI;
    const diSum = plusDI + minusDI;
    dx.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
  }

  let adx = 0;
  if (dx.length >= period) {
    // اولین ADX = میانگین سادهٔ period مقدار DX، سپس هموارسازی وایلدر
    let value = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) {
      value = (value * (period - 1) + dx[i]) / period;
    }
    adx = value;
  }

  return { adx: parseFloat(adx.toFixed(1)), plusDI: parseFloat(lastPlusDI.toFixed(1)), minusDI: parseFloat(lastMinusDI.toFixed(1)) };
}

export function detectMarketRegime(klines: Kline[]): MarketRegime {
  if (!klines || klines.length < 20) {
    return {
      regime: 'RANGING',
      atr: 0,
      atrPercent: 0,
      adx: 0,
      bbWidth: 2.0,
      description: 'کندل کافی برای تشخیص رژیم بازار وجود ندارد',
    };
  }

  // ۱. ATR (بازهٔ ۱۴)
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  const atrPeriod = 14;
  const recentTRs = trs.slice(-atrPeriod);
  const atr = recentTRs.reduce((a, b) => a + b, 0) / atrPeriod;
  const currentPrice = klines[klines.length - 1].close;
  const atrPercent = currentPrice > 0 ? parseFloat(((atr / currentPrice) * 100).toFixed(2)) : 0;

  // ۲. پهنای باند بولینگر (۲۰ دوره، ۲ انحراف معیار)
  const bbSlice = klines.slice(-20);
  const bbMean = bbSlice.reduce((sum, k) => sum + k.close, 0) / 20;
  const bbVariance = bbSlice.reduce((sum, k) => sum + Math.pow(k.close - bbMean, 2), 0) / 20;
  const bbStd = Math.sqrt(bbVariance);
  const bbUpper = bbMean + 2 * bbStd;
  const bbLower = bbMean - 2 * bbStd;
  const bbWidth = bbMean > 0 ? parseFloat((((bbUpper - bbLower) / bbMean) * 100).toFixed(2)) : 2.0;

  // ۳. مومنتوم قیمت در ۲۰ کندل
  const priceChange20 =
    klines[klines.length - 20].close > 0
      ? ((currentPrice - klines[klines.length - 20].close) / klines[klines.length - 20].close) * 100
      : 0;

  // ۴. ADX استاندارد + DI و شیب EMA
  const { adx, plusDI, minusDI } = computeADX(klines, 14);
  const closes = klines.map((k) => k.close);
  const ema20 = emaLast(closes.slice(-60), 20);
  const ema50 = emaLast(closes.slice(-120), 50);
  const emaSlopePercent = ema50 > 0 ? parseFloat((((ema20 - ema50) / ema50) * 100).toFixed(3)) : 0;

  const bullishTrend = plusDI > minusDI && emaSlopePercent > 0;
  const bearishTrend = minusDI > plusDI && emaSlopePercent < 0;
  const strongTrend = adx >= 25;

  let regime: MarketRegimeType = 'RANGING';
  let description = 'بازار در حال تثبیت داخل یک محدودهٔ افقی فشرده';

  if (bbWidth > 4.5 || atrPercent > 2.5) {
    if (strongTrend && bullishTrend) {
      regime = 'TRENDING_BULLISH';
      description = 'گسترش روند صعودی قوی با نوسان بالا و چیرگی خریداران';
    } else if (strongTrend && bearishTrend) {
      regime = 'TRENDING_BEARISH';
      description = 'گسترش روند نزولی قوی با نوسان بالا و فشار فروشندگان';
    } else {
      regime = 'HIGH_VOLATILITY';
      description = 'نوسان شدید و بی‌جهت با دامنهٔ در حال گسترش و شدوهای دوطرفه';
    }
  } else if (bbWidth < 1.2 || atrPercent < 0.6) {
    regime = 'CONTRACTION';
    description = 'فشردگی دامنه و نوسان؛ زمینه‌ساز شکست احتمالی انفجاری';
  } else if (strongTrend && bullishTrend) {
    regime = 'TRENDING_BULLISH';
    description = 'ساختار روند صعودی پایدار با ADX بالای ۲۵ و EMA20 بالای EMA50';
  } else if (strongTrend && bearishTrend) {
    regime = 'TRENDING_BEARISH';
    description = 'ساختار روند نزولی پایدار با ADX بالای ۲۵ و EMA20 زیر EMA50';
  } else if (bbWidth < 2.0) {
    regime = 'LOW_VOLATILITY';
    description = 'تثبیت کم‌نوسان با فعالیت معاملاتی ضعیف';
  } else if (Math.abs(priceChange20) > 3 && adx >= 20) {
    regime = priceChange20 > 0 ? 'TRENDING_BULLISH' : 'TRENDING_BEARISH';
    description =
      priceChange20 > 0
        ? 'مومنتوم صعودی متوسط با ADX نزدیک به ناحیهٔ روند'
        : 'مومنتوم نزولی متوسط با ADX نزدیک به ناحیهٔ روند';
  }

  return {
    regime,
    atr: parseFloat(atr.toFixed(6)),
    atrPercent,
    adx,
    bbWidth,
    description,
    plusDI,
    minusDI,
    emaSlopePercent,
  };
}
