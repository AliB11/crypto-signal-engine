import {
  Kline,
  Timeframe,
  LiquidityLevel,
  LiquiditySweep,
  MarketStructureSummary,
  SessionLiquiditySummary,
  VolumeMetrics,
  DerivativesData,
  MTFAnalysis,
  MarketRegime,
  Layer3Analysis,
  Signal,
  SignalClassification,
  SignalDirection,
  SignalComponents,
  SignalWeights,
  TradePlan,
} from '../types/market';

export const DEFAULT_WEIGHTS: SignalWeights = {
  liquidity: 0.2,
  marketStructure: 0.2,
  multiTimeframe: 0.2,
  sessionLiquidity: 0.1,
  volume: 0.1,
  derivatives: 0.1,
  advancedLayer3: 0.1,
};

export function generateSignal(params: {
  symbol: string;
  timeframe: Timeframe;
  klines: Kline[];
  liquidityLevels: LiquidityLevel[];
  sweeps: LiquiditySweep[];
  structure: MarketStructureSummary;
  sessions: SessionLiquiditySummary;
  volume: VolumeMetrics;
  derivatives: DerivativesData;
  mtf: MTFAnalysis;
  regime: MarketRegime;
  layer3: Layer3Analysis;
  weights?: Partial<SignalWeights>;
}): Signal {
  const {
    symbol,
    timeframe,
    klines,
    liquidityLevels,
    sweeps,
    structure,
    sessions,
    volume,
    derivatives,
    mtf,
    regime,
    layer3,
  } = params;

  const w: SignalWeights = { ...DEFAULT_WEIGHTS, ...(params.weights || {}) };
  const currentPrice = klines[klines.length - 1]?.close || 0;
  const dataTimestamp = klines[klines.length - 1]?.timestamp || Date.now();
  const analysisTimestamp = Date.now();
  const isStale = Date.now() - dataTimestamp > 300000; // > 5 minutes stale

  const reasons: string[] = [];
  const warnings: string[] = [];

  // 1. Calculate Component Scores
  // A. Liquidity Component (0-100)
  let liqScore = 40;
  const recentSweeps = sweeps.slice(-3);
  const sslSweep = recentSweeps.find((s) => s.type === 'SELL_SIDE_SWEEP');
  const bslSweep = recentSweeps.find((s) => s.type === 'BUY_SIDE_SWEEP');

  if (sslSweep || bslSweep) liqScore += 35;
  if (layer3.layer1BasicLiquidity.equalHighs.length > 0 || layer3.layer1BasicLiquidity.equalLows.length > 0) {
    liqScore += 15;
  }
  if (layer3.layer1BasicLiquidity.score >= 70) liqScore += 10;
  liqScore = Math.min(100, liqScore);

  // B. Market Structure Component (0-100)
  let msScore = 40;
  if (structure.trend !== 'RANGING') msScore += 20;
  if (structure.recentMSS) msScore += 25;
  if (structure.recentBOS) msScore += 15;
  if (structure.displacementDetected) msScore += 15;
  msScore = Math.min(100, msScore);

  // C. MTF Component (0-100)
  const mtfScore = mtf.alignmentScore;

  // D. Session Liquidity Component (0-100)
  let sessScore = 50;
  if (sessions.judasSwingDetected) sessScore += 30;
  if (sessions.nyReversalDetected) sessScore += 30;
  if (sessions.sessions.asian.highSwept || sessions.sessions.asian.lowSwept) sessScore += 15;
  sessScore = Math.min(100, sessScore);

  // E. Volume Component (0-100)
  let volScore = 50;
  if (volume.state === 'EXPANSION') volScore += 25;
  if (volume.isSpike) volScore += 20;
  if (Math.abs(volume.imbalance) > 15) volScore += 15;
  volScore = Math.min(100, volScore);

  // F. Derivatives Component (0-100)
  let derivScore = 50;
  if (derivatives.oiTrend === 'LONG_BUILDUP' || derivatives.oiTrend === 'SHORT_BUILDUP') {
    derivScore += 25;
  }
  if (derivatives.fundingCategory === 'EXTREME_NEGATIVE' || derivatives.fundingCategory === 'EXTREME_POSITIVE') {
    derivScore += 20;
  }
  if (derivatives.positioning === 'EXTREME_SHORT' || derivatives.positioning === 'EXTREME_LONG') {
    derivScore += 15;
  }
  derivScore = Math.min(100, derivScore);

  // G. Layer 3 Score
  const l3Score = layer3.totalLayer3Score;

  const components: SignalComponents = {
    liquidity: liqScore,
    marketStructure: msScore,
    multiTimeframe: mtfScore,
    sessionLiquidity: sessScore,
    volume: volScore,
    derivatives: derivScore,
    advancedLayer3: l3Score,
  };

  // Weighted total score
  const rawScore =
    components.liquidity * w.liquidity +
    components.marketStructure * w.marketStructure +
    components.multiTimeframe * w.multiTimeframe +
    components.sessionLiquidity * w.sessionLiquidity +
    components.volume * w.volume +
    components.derivatives * w.derivatives +
    components.advancedLayer3 * w.advancedLayer3;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Determine Direction
  let direction: SignalDirection = 'NO_SIGNAL';
  let longConfluence = 0;
  let shortConfluence = 0;

  // Bullish signals
  if (sslSweep) {
    longConfluence += 35;
    reasons.push(`Sell-side liquidity sweep executed at $${sslSweep.levelPrice.toLocaleString()} (${sslSweep.levelType})`);
  }
  if (structure.recentMSS?.direction === 'BULLISH') {
    longConfluence += 30;
    reasons.push('Bullish Market Structure Shift (MSS/CHoCH) confirmed');
  } else if (structure.trend === 'BULLISH') {
    longConfluence += 15;
    reasons.push('Established Bullish trend structure (Higher Highs & Higher Lows)');
  }
  if (mtf.htfTrend === 'BULLISH') {
    longConfluence += 25;
    reasons.push('Higher Timeframe alignment bullish across 1D/4H/1H');
  }
  if (structure.displacementDetected) {
    longConfluence += 15;
    reasons.push('High-momentum displacement impulse detected');
  }
  if (volume.state === 'EXPANSION' || volume.imbalance > 10) {
    longConfluence += 15;
    reasons.push(`Buyer volume dominance (+${volume.imbalance}% taker imbalance)`);
  }
  if (derivatives.oiTrend === 'LONG_BUILDUP') {
    longConfluence += 15;
    reasons.push('Futures Open Interest rising with price (Aggressive Long Buildup)');
  } else if (derivatives.fundingCategory === 'NEGATIVE' || derivatives.fundingCategory === 'EXTREME_NEGATIVE') {
    longConfluence += 20;
    reasons.push(`Negative funding rate (${(derivatives.fundingRate * 100).toFixed(4)}%) creating short squeeze potential`);
  }
  if (sessions.judasSwingDetected && sessions.sessions.asian.lowSwept) {
    longConfluence += 20;
    reasons.push('London Judas Swing swept Asian Session Low liquidity');
  }

  // Bearish signals
  if (bslSweep) {
    shortConfluence += 35;
    reasons.push(`Buy-side liquidity sweep executed at $${bslSweep.levelPrice.toLocaleString()} (${bslSweep.levelType})`);
  }
  if (structure.recentMSS?.direction === 'BEARISH') {
    shortConfluence += 30;
    reasons.push('Bearish Market Structure Shift (MSS/CHoCH) confirmed');
  } else if (structure.trend === 'BEARISH') {
    shortConfluence += 15;
    reasons.push('Established Bearish trend structure (Lower Lows & Lower Highs)');
  }
  if (mtf.htfTrend === 'BEARISH') {
    shortConfluence += 25;
    reasons.push('Higher Timeframe alignment bearish across 1D/4H/1H');
  }
  if (volume.imbalance < -10) {
    shortConfluence += 15;
    reasons.push(`Seller volume dominance (${volume.imbalance}% taker imbalance)`);
  }
  if (derivatives.oiTrend === 'SHORT_BUILDUP') {
    shortConfluence += 15;
    reasons.push('Futures Open Interest rising on selloffs (Aggressive Short Buildup)');
  } else if (derivatives.fundingCategory === 'EXTREME_POSITIVE') {
    shortConfluence += 20;
    reasons.push('Extreme positive funding rate indicates overheated long positioning');
  }
  if (sessions.judasSwingDetected && sessions.sessions.asian.highSwept) {
    shortConfluence += 20;
    reasons.push('London Judas Swing swept Asian Session High liquidity');
  }

  // Decide direction
  if (longConfluence >= 55 && longConfluence > shortConfluence + 15) {
    direction = 'LONG';
  } else if (shortConfluence >= 55 && shortConfluence > longConfluence + 15) {
    direction = 'SHORT';
  } else {
    direction = 'NO_SIGNAL';
  }

  // Warnings
  if (derivatives.fundingCategory === 'EXTREME_POSITIVE' && direction === 'LONG') {
    warnings.push('High positive funding rate: long positions carry elevated funding cost');
  }
  if (derivatives.positioning === 'EXTREME_LONG' && direction === 'LONG') {
    warnings.push('Retail long positioning is heavily crowded');
  }
  if (regime.regime === 'HIGH_VOLATILITY') {
    warnings.push('High volatility regime: wider stop loss required');
  }
  if (isStale) {
    warnings.push('Data stream is delayed; verify price before action');
  }

  // Classification
  let classification: SignalClassification = 'NO_SIGNAL';
  if (direction === 'NO_SIGNAL' || score < 50) {
    classification = 'NO_SIGNAL';
  } else if (score < 65) {
    classification = 'WEAK';
  } else if (score < 75) {
    classification = 'MODERATE';
  } else if (score < 85) {
    classification = 'STRONG';
  } else {
    classification = 'VERY_STRONG';
  }

  // Calculate Trade Plan
  let tradePlan: TradePlan | null = null;

  if (direction !== 'NO_SIGNAL' && currentPrice > 0) {
    if (direction === 'LONG') {
      // Entry: Look for FVG, OB, or liquidity reclaim
      const activeBullishFVG = structure.fvgs.find((f) => f.direction === 'BULLISH' && !f.filled);
      const activeBullishOB = structure.orderBlocks.find((o) => o.direction === 'BULLISH' && !o.mitigated);

      let entryMin = currentPrice * 0.996;
      let entryMax = currentPrice * 1.002;
      let entryOptimal = currentPrice;
      let entryType: TradePlan['entry']['type'] = 'LIQUIDITY_RECLAIM';

      if (activeBullishFVG && activeBullishFVG.bottom < currentPrice) {
        entryMin = activeBullishFVG.bottom;
        entryMax = Math.min(currentPrice, activeBullishFVG.top);
        entryOptimal = activeBullishFVG.midpoint;
        entryType = 'FVG';
      } else if (activeBullishOB && activeBullishOB.bottom < currentPrice) {
        entryMin = activeBullishOB.bottom;
        entryMax = Math.min(currentPrice, activeBullishOB.top);
        entryOptimal = (activeBullishOB.top + activeBullishOB.bottom) / 2;
        entryType = 'ORDER_BLOCK';
      }

      // Stop Loss: Below structural swing low or sweep extreme
      const sweepLow = sslSweep?.sweepExtremePrice;
      const recentSwingLow = structure.swingLows.slice(-2).map((s) => s.price);
      const lowestPoint = Math.min(...(sweepLow ? [sweepLow] : []), ...recentSwingLow, currentPrice * 0.985);
      const stopLoss = parseFloat((lowestPoint * 0.997).toFixed(2));
      const stopLossPercent = parseFloat((((currentPrice - stopLoss) / currentPrice) * 100).toFixed(2));

      // Take Profits
      const tp1 = parseFloat((currentPrice + (currentPrice - stopLoss) * 1.5).toFixed(2));
      const tp2 = parseFloat((currentPrice + (currentPrice - stopLoss) * 2.5).toFixed(2));
      const tp3 = parseFloat((currentPrice + (currentPrice - stopLoss) * 4.0).toFixed(2));

      const rrRatio = stopLossPercent > 0 ? parseFloat(((tp1 - currentPrice) / (currentPrice - stopLoss)).toFixed(2)) : 1.5;

      tradePlan = {
        entry: {
          min: parseFloat(entryMin.toFixed(2)),
          max: parseFloat(entryMax.toFixed(2)),
          optimal: parseFloat(entryOptimal.toFixed(2)),
          type: entryType,
        },
        stopLoss,
        stopLossPercent,
        invalidationReason: `Candle close below structural swing low $${stopLoss.toLocaleString()}`,
        tp1,
        tp1Percent: parseFloat((((tp1 - currentPrice) / currentPrice) * 100).toFixed(2)),
        tp2,
        tp2Percent: parseFloat((((tp2 - currentPrice) / currentPrice) * 100).toFixed(2)),
        tp3,
        tp3Percent: parseFloat((((tp3 - currentPrice) / currentPrice) * 100).toFixed(2)),
        rrRatio,
        riskLevel: stopLossPercent < 1.5 ? 'LOW' : stopLossPercent < 3.0 ? 'MEDIUM' : 'HIGH',
      };
    } else if (direction === 'SHORT') {
      const activeBearishFVG = structure.fvgs.find((f) => f.direction === 'BEARISH' && !f.filled);
      const activeBearishOB = structure.orderBlocks.find((o) => o.direction === 'BEARISH' && !o.mitigated);

      let entryMin = currentPrice * 0.998;
      let entryMax = currentPrice * 1.004;
      let entryOptimal = currentPrice;
      let entryType: TradePlan['entry']['type'] = 'LIQUIDITY_RECLAIM';

      if (activeBearishFVG && activeBearishFVG.top > currentPrice) {
        entryMin = Math.max(currentPrice, activeBearishFVG.bottom);
        entryMax = activeBearishFVG.top;
        entryOptimal = activeBearishFVG.midpoint;
        entryType = 'FVG';
      } else if (activeBearishOB && activeBearishOB.top > currentPrice) {
        entryMin = Math.max(currentPrice, activeBearishOB.bottom);
        entryMax = activeBearishOB.top;
        entryOptimal = (activeBearishOB.top + activeBearishOB.bottom) / 2;
        entryType = 'ORDER_BLOCK';
      }

      const sweepHigh = bslSweep?.sweepExtremePrice;
      const recentSwingHigh = structure.swingHighs.slice(-2).map((s) => s.price);
      const highestPoint = Math.max(...(sweepHigh ? [sweepHigh] : []), ...recentSwingHigh, currentPrice * 1.015);
      const stopLoss = parseFloat((highestPoint * 1.003).toFixed(2));
      const stopLossPercent = parseFloat((((stopLoss - currentPrice) / currentPrice) * 100).toFixed(2));

      const tp1 = parseFloat((currentPrice - (stopLoss - currentPrice) * 1.5).toFixed(2));
      const tp2 = parseFloat((currentPrice - (stopLoss - currentPrice) * 2.5).toFixed(2));
      const tp3 = parseFloat((currentPrice - (stopLoss - currentPrice) * 4.0).toFixed(2));

      const rrRatio = stopLossPercent > 0 ? parseFloat(((currentPrice - tp1) / (stopLoss - currentPrice)).toFixed(2)) : 1.5;

      tradePlan = {
        entry: {
          min: parseFloat(entryMin.toFixed(2)),
          max: parseFloat(entryMax.toFixed(2)),
          optimal: parseFloat(entryOptimal.toFixed(2)),
          type: entryType,
        },
        stopLoss,
        stopLossPercent,
        invalidationReason: `Candle close above structural swing high $${stopLoss.toLocaleString()}`,
        tp1,
        tp1Percent: parseFloat((((currentPrice - tp1) / currentPrice) * 100).toFixed(2)),
        tp2,
        tp2Percent: parseFloat((((currentPrice - tp2) / currentPrice) * 100).toFixed(2)),
        tp3,
        tp3Percent: parseFloat((((currentPrice - tp3) / currentPrice) * 100).toFixed(2)),
        rrRatio,
        riskLevel: stopLossPercent < 1.5 ? 'LOW' : stopLossPercent < 3.0 ? 'MEDIUM' : 'HIGH',
      };
    }
  }

  const invalidation =
    tradePlan?.invalidationReason || 'Market structure invalidation upon key level breach';

  return {
    symbol,
    timeframe,
    direction,
    score,
    classification,
    currentPrice,
    tradePlan,
    reasons: reasons.length > 0 ? reasons : ['No high-confluence directional trigger met'],
    warnings,
    invalidation,
    marketRegime: regime,
    components,
    layer3,
    dataTimestamp,
    analysisTimestamp,
    isStale,
  };
}
