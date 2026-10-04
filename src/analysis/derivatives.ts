import { DerivativesData, Kline } from '../types/market';

export function enrichDerivativesData(
  derivatives: DerivativesData,
  klines: Kline[]
): DerivativesData {
  if (!klines || klines.length < 5) return derivatives;

  const currentPrice = klines[klines.length - 1].close;
  const prevPrice = klines[klines.length - 5].close;
  const priceChangePercent = ((currentPrice - prevPrice) / prevPrice) * 100;

  // Determine refined OI trend based on price movement & OI change
  let oiTrend: DerivativesData['oiTrend'] = derivatives.oiTrend;
  const oiChange = derivatives.oiChange1hPercent;

  if (priceChangePercent > 0.3 && oiChange > 0.5) {
    oiTrend = 'LONG_BUILDUP';
  } else if (priceChangePercent > 0.3 && oiChange < -0.5) {
    oiTrend = 'SHORT_COVERING';
  } else if (priceChangePercent < -0.3 && oiChange > 0.5) {
    oiTrend = 'SHORT_BUILDUP';
  } else if (priceChangePercent < -0.3 && oiChange < -0.5) {
    oiTrend = 'LONG_LIQUIDATION';
  }

  return {
    ...derivatives,
    oiTrend,
  };
}
