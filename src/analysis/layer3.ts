import {
  LiquidityLevel,
  LiquiditySweep,
  MarketStructureSummary,
  SessionLiquiditySummary,
  VolumeMetrics,
  DerivativesData,
  MTFAnalysis,
  MarketRegime,
  Layer3Analysis,
} from '../types/market';

export function evaluateLayer3Context(params: {
  liquidityLevels: LiquidityLevel[];
  sweeps: LiquiditySweep[];
  structure: MarketStructureSummary;
  sessions: SessionLiquiditySummary;
  volume: VolumeMetrics;
  derivatives: DerivativesData;
  mtf: MTFAnalysis;
  regime: MarketRegime;
}): Layer3Analysis {
  const { liquidityLevels, sweeps, structure, sessions, volume, derivatives, mtf, regime } = params;

  // ----------------------------------------------------
  // Layer 1: Basic Liquidity Analysis
  // ----------------------------------------------------
  const swingHighsCount = liquidityLevels.filter((l) => l.type === 'SWING_HIGH').length;
  const swingLowsCount = liquidityLevels.filter((l) => l.type === 'SWING_LOW').length;
  const equalHighs = liquidityLevels.filter((l) => l.type === 'EQUAL_HIGH');
  const equalLows = liquidityLevels.filter((l) => l.type === 'EQUAL_LOW');

  const pdh = liquidityLevels.find((l) => l.type === 'PREVIOUS_DAY_HIGH');
  const pdl = liquidityLevels.find((l) => l.type === 'PREVIOUS_DAY_LOW');

  let layer1Score = 50;
  if (equalHighs.length > 0) layer1Score += 15;
  if (equalLows.length > 0) layer1Score += 15;
  if (swingHighsCount >= 3 && swingLowsCount >= 3) layer1Score += 10;
  layer1Score = Math.min(100, layer1Score);

  // ----------------------------------------------------
  // Layer 2: Structural Liquidity Analysis
  // ----------------------------------------------------
  const activeSweeps = sweeps.slice(-4);
  const activeMSS = structure.recentMSS;
  const activeBOS = structure.recentBOS;
  const recentFVGs = structure.fvgs.filter((f) => !f.filled).slice(-4);
  const recentOBs = structure.orderBlocks.filter((o) => !o.mitigated).slice(-4);

  const sessionSweeps: string[] = [];
  if (sessions.sessions.asian.highSwept) sessionSweeps.push('Asian High Swept');
  if (sessions.sessions.asian.lowSwept) sessionSweeps.push('Asian Low Swept');
  if (sessions.sessions.london.highSwept) sessionSweeps.push('London High Swept');
  if (sessions.sessions.london.lowSwept) sessionSweeps.push('London Low Swept');

  let displacementScore = 50;
  if (structure.displacementDetected) displacementScore += 30;
  if (volume.isSpike) displacementScore += 20;
  displacementScore = Math.min(100, displacementScore);

  let layer2Score = 40;
  if (activeSweeps.length > 0) layer2Score += 20;
  if (activeMSS) layer2Score += 15;
  if (activeBOS) layer2Score += 10;
  if (recentFVGs.length > 0) layer2Score += 10;
  if (recentOBs.length > 0) layer2Score += 10;
  if (sessionSweeps.length > 0) layer2Score += 10;
  layer2Score = Math.min(100, layer2Score);

  // ----------------------------------------------------
  // Layer 3: Advanced Context Analysis (Holistic Synthesis)
  // ----------------------------------------------------
  const htfAlignment = mtf.alignmentScore >= 65;
  const sessionConfluence = sessions.judasSwingDetected || sessions.nyReversalDetected || sessionSweeps.length > 0;
  const sweepPlusMSSDisplacement =
    activeSweeps.length > 0 && !!activeMSS && structure.displacementDetected;

  const volumeConfluence = volume.state === 'EXPANSION' || volume.isSpike || Math.abs(volume.imbalance) > 10;

  const derivativesConfluence =
    derivatives.oiTrend === 'LONG_BUILDUP' ||
    derivatives.oiTrend === 'SHORT_BUILDUP' ||
    derivatives.fundingCategory === 'EXTREME_NEGATIVE' ||
    derivatives.fundingCategory === 'EXTREME_POSITIVE';

  let regimeBonus = 0;
  if (regime.regime === 'TRENDING_BULLISH' || regime.regime === 'TRENDING_BEARISH') {
    regimeBonus = 15;
  } else if (regime.regime === 'EXPANSION') {
    regimeBonus = 10;
  } else if (regime.regime === 'RANGING' && activeSweeps.length > 0) {
    regimeBonus = 12; // Range sweeps offer high-probability mean-reversions
  }

  let layer3Score = 30;
  if (htfAlignment) layer3Score += 20;
  if (sweepPlusMSSDisplacement) layer3Score += 25;
  if (sessionConfluence) layer3Score += 15;
  if (volumeConfluence) layer3Score += 10;
  if (derivativesConfluence) layer3Score += 10;
  layer3Score += regimeBonus;
  layer3Score = Math.min(100, layer3Score);

  const totalLayer3Score = Math.round(layer1Score * 0.25 + layer2Score * 0.35 + layer3Score * 0.4);

  return {
    layer1BasicLiquidity: {
      swingHighsCount,
      swingLowsCount,
      equalHighs,
      equalLows,
      pdhDistancePercent: pdh?.distancePercent || 0,
      pdlDistancePercent: pdl?.distancePercent || 0,
      score: layer1Score,
    },
    layer2StructuralLiquidity: {
      activeSweeps,
      activeMSS,
      activeBOS,
      recentFVGs,
      recentOBs,
      sessionSweeps,
      displacementScore,
      score: layer2Score,
    },
    layer3AdvancedContext: {
      htfAlignment,
      sessionConfluence,
      sweepPlusMSSDisplacement,
      volumeConfluence,
      derivativesConfluence,
      regimeBonus,
      score: layer3Score,
    },
    totalLayer3Score,
  };
}
