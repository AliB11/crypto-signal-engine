import { Kline, MarketRegime, MarketRegimeType } from '../types/market';

export function detectMarketRegime(klines: Kline[]): MarketRegime {
  if (!klines || klines.length < 20) {
    return {
      regime: 'RANGING',
      atr: 0,
      atrPercent: 0,
      adx: 20,
      bbWidth: 2.0,
      description: 'کندل کافی برای تشخیص رژیم بازار وجود ندارد',
    };
  }

  // 1. Calculate True Range and ATR (14 period)
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const atrPeriod = 14;
  const recentTRs = trs.slice(-atrPeriod);
  const atr = recentTRs.reduce((a, b) => a + b, 0) / atrPeriod;
  const currentPrice = klines[klines.length - 1].close;
  const atrPercent = currentPrice > 0 ? parseFloat(((atr / currentPrice) * 100).toFixed(2)) : 0;

  // 2. Bollinger Band Width (20 period, 2 std)
  const bbSlice = klines.slice(-20);
  const bbMean = bbSlice.reduce((sum, k) => sum + k.close, 0) / 20;
  const bbVariance = bbSlice.reduce((sum, k) => sum + Math.pow(k.close - bbMean, 2), 0) / 20;
  const bbStd = Math.sqrt(bbVariance);
  const bbUpper = bbMean + 2 * bbStd;
  const bbLower = bbMean - 2 * bbStd;
  const bbWidth = bbMean > 0 ? parseFloat((((bbUpper - bbLower) / bbMean) * 100).toFixed(2)) : 2.0;

  // 3. Directional Momentum (EMA20 vs EMA50 slope or price vs EMA20)
  const priceChange20 = ((currentPrice - klines[klines.length - 20].close) / klines[klines.length - 20].close) * 100;

  // 4. Directional index approximation (ADX like)
  let upMoves = 0;
  let downMoves = 0;
  for (let i = klines.length - 14; i < klines.length; i++) {
    if (klines[i].close > klines[i - 1].close) upMoves++;
    else if (klines[i].close < klines[i - 1].close) downMoves++;
  }
  const adx = parseFloat((Math.abs(upMoves - downMoves) / 14 * 100).toFixed(1));

  // Determine Regime
  let regime: MarketRegimeType = 'RANGING';
  let description = 'بازار در حال تثبیت داخل یک محدوده افقی فشرده';

  if (bbWidth > 4.5 || atrPercent > 2.5) {
    if (priceChange20 > 2.0) {
      regime = 'TRENDING_BULLISH';
      description = 'گسترش روند صعودی قوی با نوسان بالا و چیرگی خریداران';
    } else if (priceChange20 < -2.0) {
      regime = 'TRENDING_BEARISH';
      description = 'گسترش روند نزولی قوی با نوسان بالا و فشار فروشندگان';
    } else {
      regime = 'HIGH_VOLATILITY';
      description = 'نوسان شدید و بی‌جهت با دامنه در حال گسترش و شدوهای دوطرفه';
    }
  } else if (bbWidth < 1.2 || atrPercent < 0.6) {
    regime = 'CONTRACTION';
    description = 'فشردگی دامنه و نوسان؛ زمینه‌ساز شکست احتمالی انفجاری';
  } else if (adx > 45) {
    if (priceChange20 > 1.2) {
      regime = 'TRENDING_BULLISH';
      description = 'ساختار روند صعودی پایدار با سقف‌ها و کف‌های بالاترِ مشخص';
    } else if (priceChange20 < -1.2) {
      regime = 'TRENDING_BEARISH';
      description = 'ساختار روند نزولی پایدار با کف‌ها و سقف‌های پایین‌تر';
    }
  } else if (bbWidth < 2.0) {
    regime = 'LOW_VOLATILITY';
    description = 'تثبیت کم‌نوسان با فعالیت معاملاتی ضعیف';
  }

  return {
    regime,
    atr: parseFloat(atr.toFixed(4)),
    atrPercent,
    adx,
    bbWidth,
    description,
  };
}
