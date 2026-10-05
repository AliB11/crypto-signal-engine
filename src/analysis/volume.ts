import { Kline, VolumeMetrics, VolumeProfile, VolumeProfileNode } from '../types/market';

export function analyzeVolume(klines: Kline[], binCount = 40): VolumeMetrics {
  if (!klines || klines.length === 0) {
    return {
      currentVolume: 0,
      volumeSMA: 0,
      rvol: 1.0,
      isSpike: false,
      state: 'NORMAL',
      takerBuyVolume: 0,
      takerSellVolume: 0,
      takerBuyRatio: 50,
      takerSellRatio: 50,
      imbalance: 0,
      volumeProfile: null,
      hasTickFlowData: false,
    };
  }

  const smaPeriod = Math.min(20, klines.length);
  const recentSlice = klines.slice(-smaPeriod);
  const volumeSMA = recentSlice.reduce((acc, k) => acc + k.volume, 0) / smaPeriod;

  const currentKline = klines[klines.length - 1];
  const currentVolume = currentKline.volume;
  const rvol = volumeSMA > 0 ? parseFloat((currentVolume / volumeSMA).toFixed(2)) : 1.0;

  const isSpike = rvol >= 2.0;

  // Recent 5-candle trend for volume expansion / contraction
  let state: VolumeMetrics['state'] = 'NORMAL';
  if (klines.length >= 5) {
    const last3Avg = (klines[klines.length - 1].volume + klines[klines.length - 2].volume + klines[klines.length - 3].volume) / 3;
    const prev3Avg = (klines[klines.length - 4].volume + klines[klines.length - 5].volume + (klines[klines.length - 6]?.volume || klines[klines.length - 5].volume)) / 3;
    if (last3Avg > prev3Avg * 1.35) {
      state = 'EXPANSION';
    } else if (last3Avg < prev3Avg * 0.7) {
      state = 'CONTRACTION';
    }
  }

  // Taker buy/sell volume analysis
  // اگر منبع داده ستون حجم تیکر نداشته باشد (مثلاً CoinGecko)، نسبت‌ها باید خنثی
  // گزارش شوند و پرچم hasTickFlowData نباید true باشد.
  const hasTickFlowData = klines.some((k) => (k.takerBuyBaseVolume || 0) > 0);
  let totalTakerBuy = 0;
  let totalVol = 0;
  const takerLookback = Math.min(30, klines.length);
  for (let i = klines.length - takerLookback; i < klines.length; i++) {
    totalTakerBuy += hasTickFlowData
      ? klines[i].takerBuyBaseVolume
      : klines[i].volume * 0.5;
    totalVol += klines[i].volume;
  }
  const totalTakerSell = Math.max(0, totalVol - totalTakerBuy);
  const takerBuyRatio = totalVol > 0 ? parseFloat(((totalTakerBuy / totalVol) * 100).toFixed(1)) : 50;
  const takerSellRatio = totalVol > 0 ? parseFloat(((totalTakerSell / totalVol) * 100).toFixed(1)) : 50;
  const imbalance = parseFloat((takerBuyRatio - takerSellRatio).toFixed(1));

  // Volume Profile Calculation
  const profileLookback = Math.min(100, klines.length);
  const profileKlines = klines.slice(-profileLookback);

  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const k of profileKlines) {
    if (k.low < minPrice) minPrice = k.low;
    if (k.high > maxPrice) maxPrice = k.high;
  }

  let volumeProfile: VolumeProfile | null = null;

  if (maxPrice > minPrice && profileKlines.length >= 10) {
    const binSize = (maxPrice - minPrice) / binCount;
    const bins: VolumeProfileNode[] = [];

    for (let i = 0; i < binCount; i++) {
      bins.push({
        price: minPrice + i * binSize + binSize / 2,
        volume: 0,
        buyVolume: 0,
        sellVolume: 0,
      });
    }

    // Distribute each candle's volume across intersected bins
    let totalProfileVolume = 0;
    for (const k of profileKlines) {
      const kHigh = k.high;
      const kLow = k.low;
      const kVol = k.volume;
      const isBullish = k.close >= k.open;

      const startBin = Math.max(0, Math.floor((kLow - minPrice) / binSize));
      const endBin = Math.min(binCount - 1, Math.floor((kHigh - minPrice) / binSize));
      const touchedBins = Math.max(1, endBin - startBin + 1);
      const volPerBin = kVol / touchedBins;

      for (let b = startBin; b <= endBin; b++) {
        bins[b].volume += volPerBin;
        if (isBullish) {
          bins[b].buyVolume += volPerBin * 0.65;
          bins[b].sellVolume += volPerBin * 0.35;
        } else {
          bins[b].buyVolume += volPerBin * 0.35;
          bins[b].sellVolume += volPerBin * 0.65;
        }
        totalProfileVolume += volPerBin;
      }
    }

    // POC: Point of Control (highest volume bin)
    let pocBin = bins[0];
    let maxBinVol = 0;
    for (const bin of bins) {
      if (bin.volume > maxBinVol) {
        maxBinVol = bin.volume;
        pocBin = bin;
      }
    }

    // Value Area: گسترش از POC به سمت همسایهٔ پرحجم‌تر تا پوشش ۷۰٪ حجم
    // (روش قبلی بین‌های پرحجم پراکنده را انتخاب می‌کرد و VAH/VAL می‌توانست
    // محدوده‌ای غیرپیوسته و نادرست بسازد.)
    const targetValueAreaVol = totalProfileVolume * 0.7;
    const pocIndex = bins.indexOf(pocBin);
    let lowerIdx = pocIndex;
    let upperIdx = pocIndex;
    let accumulatedVol = bins[pocIndex].volume;

    while (accumulatedVol < targetValueAreaVol && (lowerIdx > 0 || upperIdx < binCount - 1)) {
      const belowVol = lowerIdx > 0 ? bins[lowerIdx - 1].volume : -1;
      const aboveVol = upperIdx < binCount - 1 ? bins[upperIdx + 1].volume : -1;

      if (aboveVol >= belowVol) {
        upperIdx += 1;
        accumulatedVol += bins[upperIdx].volume;
      } else {
        lowerIdx -= 1;
        accumulatedVol += bins[lowerIdx].volume;
      }
    }

    const vah = bins[upperIdx].price;
    const val = bins[lowerIdx].price;

    // HVN (High Volume Nodes) & LVN (Low Volume Nodes)
    const avgBinVol = totalProfileVolume / binCount;
    const hvn = bins.filter((b) => b.volume > avgBinVol * 1.5).map((b) => b.price);
    const lvn = bins.filter((b) => b.volume < avgBinVol * 0.35).map((b) => b.price);

    volumeProfile = {
      poc: pocBin.price,
      vah,
      val,
      hvn,
      lvn,
      nodes: bins,
    };
  }

  return {
    currentVolume,
    volumeSMA: parseFloat(volumeSMA.toFixed(2)),
    rvol,
    isSpike,
    state,
    takerBuyVolume: parseFloat(totalTakerBuy.toFixed(2)),
    takerSellVolume: parseFloat(totalTakerSell.toFixed(2)),
    takerBuyRatio,
    takerSellRatio,
    imbalance,
    volumeProfile,
    hasTickFlowData,
  };
}
