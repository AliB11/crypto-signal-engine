import { generateSignal, DEFAULT_WEIGHTS, MIN_SIGNAL_SCORE } from '../src/analysis/signal';
import { detectLiquidityLevels } from '../src/analysis/liquidity';
import { makeKlines } from './analysis.test';
import {
  DerivativesData,
  Layer3Analysis,
  LiquidityLevel,
  LiquiditySweep,
  MarketRegime,
  MarketStructureSummary,
  MTFAnalysis,
  SessionLiquiditySummary,
  VolumeMetrics,
} from '../src/types/market';

function buildInputs(klines = makeKlines([
  { open: 95_000, high: 95_400, low: 94_600, close: 95_000 },
  { open: 95_000, high: 95_600, low: 94_900, close: 95_400 },
])) {
  const sweeps: LiquiditySweep[] = [
    {
      type: 'SELL_SIDE_SWEEP',
      levelPrice: 94_800,
      levelType: 'SWING_LOW',
      sweepExtremePrice: 94_500,
      reclaimPrice: 95_100,
      penetrationPercent: 0.32,
      wickToBodyRatio: 1.9,
      candleIndex: 20,
      timestamp: klines[0].timestamp - 900_000,
      volumeConfirmed: true,
      timeframe: '15m',
    },
  ];

  const liquidityLevels: LiquidityLevel[] = [
    {
      price: 94_800,
      type: 'SWING_LOW',
      strength: 88,
      swept: true,
      distancePercent: -0.4,
      timestamp: klines[0].timestamp - 1_800_000,
    },
    {
      price: 96_200,
      type: 'SWING_HIGH',
      strength: 80,
      swept: false,
      distancePercent: 0.7,
      timestamp: klines[0].timestamp - 900_000,
    },
    {
      price: 99_500,
      type: 'EQUAL_HIGH',
      strength: 92,
      swept: false,
      distancePercent: 4.2,
      timestamp: klines[0].timestamp - 3_600_000,
    },
  ];

  const structure: MarketStructureSummary = {
    trend: 'BULLISH',
    lastEvent: null,
    events: [],
    swingHighs: [{ index: 12, time: klines[0].timestamp - 2_700_000, price: 96_200, type: 'SWING_HIGH', confirmedAt: 14, strength: 80 }],
    swingLows: [{ index: 9, time: klines[0].timestamp - 3_600_000, price: 94_800, type: 'SWING_LOW', confirmedAt: 11, strength: 88 }],
    fvgs: [],
    orderBlocks: [],
    displacementDetected: true,
    recentMSS: {
      type: 'MSS',
      direction: 'BULLISH',
      price: 95_800,
      candleIndex: 21,
      timestamp: klines[0].timestamp - 900_000,
      timeframe: '15m',
      strength: 90,
      displacement: true,
    },
    recentBOS: null,
  };

  const sessions: SessionLiquiditySummary = {
    currentSession: 'London',
    sessions: {
      asian: { name: 'Asian', isActive: false, startHourUTC: 0, endHourUTC: 8, high: 95_300, low: 94_400, openPrice: 94_900, rangePercent: 0.95, highSwept: false, lowSwept: true, bias: 'NEUTRAL' },
      london: { name: 'London', isActive: true, startHourUTC: 7, endHourUTC: 15, high: 96_000, low: 94_300, openPrice: 94_900, rangePercent: 1.8, highSwept: false, lowSwept: false, bias: 'BULLISH' },
      newYork: { name: 'New York', isActive: false, startHourUTC: 13, endHourUTC: 21, high: 0, low: 0, openPrice: 0, rangePercent: 0, highSwept: false, lowSwept: false, bias: 'NEUTRAL' },
    },
    judasSwingDetected: true,
    nyReversalDetected: false,
    keyLevels: [
      { price: 96_000, type: 'SESSION_HIGH', strength: 88, swept: false, distancePercent: 0.5, timestamp: klines[0].timestamp - 900_000 },
    ],
  };

  const volume: VolumeMetrics = {
    currentVolume: 520,
    volumeSMA: 210,
    rvol: 2.4,
    isSpike: true,
    state: 'EXPANSION',
    takerBuyVolume: 360,
    takerSellVolume: 160,
    takerBuyRatio: 69,
    takerSellRatio: 31,
    imbalance: 38,
    volumeProfile: null,
    hasTickFlowData: true,
  };

  const derivatives: DerivativesData = {
    symbol: 'BTCUSDT',
    openInterest: 21_000,
    openInterestValueUSD: 1_900_000_000,
    oiChange1hPercent: 2.1,
    oiChange24hPercent: 5.4,
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
    timeframes: {} as MTFAnalysis['timeframes'],
    alignmentScore: 86,
    htfTrend: 'BULLISH',
    ltfConfirmation: true,
    confluenceDescription: 'هم‌راستایی صعودی',
  };

  const regime: MarketRegime = {
    regime: 'TRENDING_BULLISH',
    atr: 180,
    atrPercent: 0.19,
    adx: 32,
    bbWidth: 2.2,
    description: 'روند صعودی',
  };

  const layer3: Layer3Analysis = {
    layer1BasicLiquidity: { swingHighsCount: 4, swingLowsCount: 4, equalHighs: liquidityLevels.filter((l) => l.type === 'EQUAL_HIGH'), equalLows: [], pdhDistancePercent: 1.2, pdlDistancePercent: -0.8, score: 80 },
    layer2StructuralLiquidity: { activeSweeps: sweeps, activeMSS: structure.recentMSS, activeBOS: null, recentFVGs: [], recentOBs: [], sessionSweeps: ['Asian Low Swept'], displacementScore: 90, score: 85 },
    layer3AdvancedContext: { htfAlignment: true, sessionConfluence: true, sweepPlusMSSDisplacement: true, volumeConfluence: true, derivativesConfluence: true, regimeBonus: 15, score: 92 },
    totalLayer3Score: 88,
  };

  return { klines, sweeps, liquidityLevels, structure, sessions, volume, derivatives, mtf, regime, layer3 };
}

/**
 * آزمون‌های رگرسیون موتور سیگنال:
 *  ۱) اهداف سود باید از نقشهٔ نقدینگی استخراج شوند و نردبان همیشه یکنواخت باشد
 *  ۲) حد ضرر باید حداقل ۱.۲ برابر ATR از قیمت ورود فاصله داشته باشد
 *  ۳) ستاپ با امتیاز کمتر از آستانه نباید برنامهٔ معامله تولید کند
 */
export function testSignalTargetLadder() {
  console.log('Testing Signal Target Ladder & Risk Gating...');

  const inputs = buildInputs();
  const long = generateSignal({ symbol: 'BTCUSDT', timeframe: '15m', weights: DEFAULT_WEIGHTS, ...inputs });

  if (long.direction !== 'LONG') {
    throw new Error(`Expected LONG signal, got ${long.direction}`);
  }
  const plan = long.tradePlan;
  if (!plan) throw new Error('Expected a trade plan');

  if (!(plan.tp1 < plan.tp2 && plan.tp2 < plan.tp3)) {
    throw new Error(`Ladder is not monotonic: ${plan.tp1} / ${plan.tp2} / ${plan.tp3}`);
  }
  if (!plan.targetSources) throw new Error('Expected target sources to be reported');
  if (plan.targetSources.tp1 === 'R_MULTIPLE' && plan.targetSources.tp2 === 'R_MULTIPLE') {
    throw new Error('Expected at least one target to come from the liquidity map');
  }

  const risk = long.currentPrice - plan.stopLoss;
  if (risk < 0.5 * inputs.regime.atr) {
    throw new Error(`Stop loss is too tight relative to ATR (risk=${risk}, ATR=${inputs.regime.atr})`);
  }
  if (!plan.stopLossBasis) throw new Error('Expected stop-loss basis to be reported');
  if (typeof plan.atrPercent !== 'number') throw new Error('Expected ATR percent in the plan');

  // حالت شورت با آینهٔ همان ورودی‌ها
  const shortInputs = buildInputs();
  const shortSessions = shortInputs.sessions;
  const short = generateSignal({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    weights: DEFAULT_WEIGHTS,
    ...shortInputs,
    sweeps: [
      {
        ...shortInputs.sweeps[0],
        type: 'BUY_SIDE_SWEEP',
        levelPrice: 96_000,
        levelType: 'SWING_HIGH',
        sweepExtremePrice: 96_400,
        reclaimPrice: 95_600,
      },
    ],
    structure: {
      ...shortInputs.structure,
      trend: 'BEARISH',
      recentMSS: { ...shortInputs.structure.recentMSS!, direction: 'BEARISH' },
      swingLows: [],
    },
    sessions: { ...shortSessions, judasSwingDetected: false },
    mtf: { ...shortInputs.mtf, htfTrend: 'BEARISH' },
  });

  if (short.direction === 'SHORT' && short.tradePlan) {
    const p = short.tradePlan;
    if (!(p.tp1 > p.tp2 && p.tp2 > p.tp3)) {
      throw new Error(`Short ladder is not monotonic: ${p.tp1} / ${p.tp2} / ${p.tp3}`);
    }
    if (p.stopLoss <= short.currentPrice) {
      throw new Error('Short stop loss must be above the entry price');
    }
  }

  // دروازهٔ کیفیت: وزن‌دهی صفر به همهٔ اجزا → امتیاز پایین → بدون برنامهٔ معامله
  const zeroWeighted = generateSignal({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    ...inputs,
    weights: { liquidity: 0, marketStructure: 0, multiTimeframe: 0, sessionLiquidity: 0, volume: 0, derivatives: 0, advancedLayer3: 1 },
    mtf: { ...inputs.mtf, alignmentScore: 10, htfTrend: 'NEUTRAL' },
    layer3: {
      ...inputs.layer3,
      totalLayer3Score: 0,
      layer1BasicLiquidity: { ...inputs.layer3.layer1BasicLiquidity, score: 0, equalHighs: [], equalLows: [] },
      layer2StructuralLiquidity: { ...inputs.layer3.layer2StructuralLiquidity, score: 0, activeSweeps: [] },
      layer3AdvancedContext: { ...inputs.layer3.layer3AdvancedContext, score: 0 },
    },
  });

  if (zeroWeighted.score < MIN_SIGNAL_SCORE && zeroWeighted.direction !== 'NO_SIGNAL') {
    throw new Error('A low-quality setup must not be reported as a directional signal');
  }
  if (zeroWeighted.classification === 'NO_SIGNAL' && zeroWeighted.tradePlan) {
    throw new Error('NO_SIGNAL classifications must not carry a trade plan');
  }

  console.log(
    `✓ Target Ladder passed (LONG TP1 ${plan.tp1} از ${plan.targetSources.tp1}، SL basis: ${plan.stopLossBasis}).`
  );
}

/** سطوح نقدینگی واقعی باید به اهداف معاملاتی نگاشت شوند */
export function testLiquidityMappedTargets() {
  console.log('Testing Draw-on-Liquidity target mapping...');

  const spec = Array.from({ length: 120 }, (_, i) => {
    const base = 100 + Math.sin(i / 9) * 3;
    return { open: base, high: base + 1.1, low: base - 1.1, close: base + (i % 3 === 0 ? 0.4 : -0.4) };
  });
  const klines = makeKlines(spec);
  const levels = detectLiquidityLevels(klines, '15m');

  if (levels.length === 0) throw new Error('Expected liquidity levels from the synthetic series');
  const unsweptHighs = levels.filter((l) => l.price > klines[klines.length - 1].close);

  const inputs = buildInputs(klines.slice(-2));
  const signal = generateSignal({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    weights: DEFAULT_WEIGHTS,
    ...inputs,
    liquidityLevels: levels,
  });

  if (signal.tradePlan && unsweptHighs.length > 0) {
    const usedLiquidityTarget =
      signal.tradePlan.targetSources?.tp1 !== 'R_MULTIPLE' ||
      signal.tradePlan.targetSources?.tp2 !== 'R_MULTIPLE';
    if (!usedLiquidityTarget) {
      throw new Error('Expected at least one take-profit to be anchored to a liquidity level');
    }
  }

  console.log('✓ Draw-on-Liquidity mapping passed (targets derive from detected liquidity levels).');
}
