import { generateSignal, DEFAULT_WEIGHTS } from '../src/analysis/signal';
import {
  Kline,
  LiquidityLevel,
  LiquiditySweep,
  MarketStructureSummary,
  SessionLiquiditySummary,
  VolumeMetrics,
  DerivativesData,
  MTFAnalysis,
  MarketRegime,
  Layer3Analysis,
} from '../src/types/market';

export function testSignalEngine() {
  console.log('Testing Context-Aware Signal Engine & Trade Plan...');

  const currentPrice = 96000;
  const mockKline: Kline = {
    timestamp: Date.now(),
    open: 95500,
    high: 96200,
    low: 95400,
    close: currentPrice,
    volume: 500,
    closeTime: Date.now() + 60000,
    quoteVolume: 500 * currentPrice,
    trades: 300,
    takerBuyBaseVolume: 350,
    takerBuyQuoteVolume: 350 * currentPrice,
  };

  const sweeps: LiquiditySweep[] = [
    {
      type: 'SELL_SIDE_SWEEP',
      levelPrice: 95200,
      levelType: 'SWING_LOW',
      sweepExtremePrice: 94800,
      reclaimPrice: 95600,
      penetrationPercent: 0.42,
      wickToBodyRatio: 1.8,
      candleIndex: 20,
      timestamp: Date.now() - 300000,
      volumeConfirmed: true,
      timeframe: '15m',
    },
  ];

  const levels: LiquidityLevel[] = [
    {
      price: 95200,
      type: 'SWING_LOW',
      strength: 90,
      swept: true,
      distancePercent: -0.83,
      timestamp: Date.now() - 600000,
    },
  ];

  const structure: MarketStructureSummary = {
    trend: 'BULLISH',
    lastEvent: null,
    events: [],
    swingHighs: [],
    swingLows: [{ index: 15, time: Date.now() - 900000, price: 94800, type: 'SWING_LOW', confirmedAt: 18, strength: 85 }],
    fvgs: [],
    orderBlocks: [],
    displacementDetected: true,
    recentMSS: {
      type: 'MSS',
      direction: 'BULLISH',
      price: 95800,
      candleIndex: 22,
      timestamp: Date.now() - 120000,
      timeframe: '15m',
      strength: 90,
      displacement: true,
    },
    recentBOS: null,
  };

  const sessions: SessionLiquiditySummary = {
    currentSession: 'London',
    sessions: {
      asian: { name: 'Asian', isActive: false, startHourUTC: 0, endHourUTC: 8, high: 96500, low: 95200, openPrice: 95800, rangePercent: 1.36, highSwept: false, lowSwept: true, bias: 'NEUTRAL' },
      london: { name: 'London', isActive: true, startHourUTC: 7, endHourUTC: 15, high: 96200, low: 94800, openPrice: 95400, rangePercent: 1.47, highSwept: false, lowSwept: false, bias: 'BULLISH' },
      newYork: { name: 'New York', isActive: false, startHourUTC: 13, endHourUTC: 21, high: 0, low: 0, openPrice: 0, rangePercent: 0, highSwept: false, lowSwept: false, bias: 'NEUTRAL' },
    },
    judasSwingDetected: true,
    nyReversalDetected: false,
    keyLevels: [],
  };

  const volume: VolumeMetrics = {
    currentVolume: 500,
    volumeSMA: 200,
    rvol: 2.5,
    isSpike: true,
    state: 'EXPANSION',
    takerBuyVolume: 350,
    takerSellVolume: 150,
    takerBuyRatio: 70,
    takerSellRatio: 30,
    imbalance: 40,
    volumeProfile: null,
    hasTickFlowData: true,
  };

  const derivatives: DerivativesData = {
    symbol: 'BTCUSDT',
    openInterest: 20000,
    openInterestValueUSD: 1900000000,
    oiChange1hPercent: 2.4,
    oiChange24hPercent: 5.6,
    oiTrend: 'LONG_BUILDUP',
    fundingRate: -0.0002,
    fundingRateAnnualizedPercent: -21.9,
    fundingCategory: 'NEGATIVE',
    globalLongShortRatio: 1.05,
    topTraderLongShortRatio: 1.35,
    topTraderPositionRatio: 1.3,
    positioning: 'BALANCED',
    takerBuySellRatio: 1.4,
    timestamp: Date.now(),
  };

  const mtf: MTFAnalysis = {
    timeframes: {} as any,
    alignmentScore: 88,
    htfTrend: 'BULLISH',
    ltfConfirmation: true,
    confluenceDescription: 'Full bullish confluence',
  };

  const regime: MarketRegime = {
    regime: 'TRENDING_BULLISH',
    atr: 450,
    atrPercent: 0.47,
    adx: 35,
    bbWidth: 2.4,
    description: 'Bullish expansion',
  };

  const layer3: Layer3Analysis = {
    layer1BasicLiquidity: { swingHighsCount: 4, swingLowsCount: 4, equalHighs: [], equalLows: [], pdhDistancePercent: 1.2, pdlDistancePercent: -0.8, score: 80 },
    layer2StructuralLiquidity: { activeSweeps: sweeps, activeMSS: structure.recentMSS, activeBOS: null, recentFVGs: [], recentOBs: [], sessionSweeps: ['Asian Low Swept'], displacementScore: 90, score: 85 },
    layer3AdvancedContext: { htfAlignment: true, sessionConfluence: true, sweepPlusMSSDisplacement: true, volumeConfluence: true, derivativesConfluence: true, regimeBonus: 15, score: 90 },
    totalLayer3Score: 86,
  };

  const signal = generateSignal({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    klines: [mockKline],
    liquidityLevels: levels,
    sweeps,
    structure,
    sessions,
    volume,
    derivatives,
    mtf,
    regime,
    layer3,
    weights: DEFAULT_WEIGHTS,
  });

  if (signal.direction !== 'LONG') {
    throw new Error(`Expected LONG signal, got ${signal.direction}`);
  }

  if (signal.score < 80) {
    throw new Error(`Expected high score (>=80), got ${signal.score}`);
  }

  if (!signal.tradePlan) {
    throw new Error('Expected trade plan to be generated');
  }

  if (signal.tradePlan.stopLoss >= currentPrice) {
    throw new Error(`Stop loss (${signal.tradePlan.stopLoss}) must be below current price (${currentPrice})`);
  }

  if (signal.tradePlan.tp1 <= currentPrice) {
    throw new Error(`TP1 (${signal.tradePlan.tp1}) must be above current price (${currentPrice})`);
  }

  if (signal.tradePlan.rrRatio < 1.0) {
    throw new Error(`Expected RR >= 1.0, got ${signal.tradePlan.rrRatio}`);
  }

  console.log(`✓ Context-Aware Signal passed (Generated LONG setup with score ${signal.score}, SL: $${signal.tradePlan.stopLoss}, TP1: $${signal.tradePlan.tp1}, RR: 1:${signal.tradePlan.rrRatio}).`);
}
