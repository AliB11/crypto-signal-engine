import {
  FullAnalysisResult,
  Kline,
  Timeframe,
  SignalWeights,
} from '../types/market';
import { MarketDataProvider } from '../providers/MarketDataProvider';
import { detectLiquidityLevels } from './liquidity';
import { detectLiquiditySweeps } from './sweeps';
import { analyzeMarketStructure } from './structure';
import { analyzeSessionLiquidity } from './sessions';
import { analyzeVolume } from './volume';
import { enrichDerivativesData } from './derivatives';
import { detectMarketRegime } from './regime';
import { analyzeMultiTimeframe } from './mtf';
import { evaluateLayer3Context } from './layer3';
import { generateSignal } from './signal';

export interface AnalysisOptions {
  timeframe?: Timeframe;
  weights?: Partial<SignalWeights>;
  candleLimit?: number;
}

export async function runFullAnalysis(
  provider: MarketDataProvider,
  symbol: string,
  options: AnalysisOptions = {}
): Promise<FullAnalysisResult> {
  const tf = options.timeframe || '15m';
  const limit = options.candleLimit || 200;

  // 1. Fetch MTF Klines, Ticker, Derivatives, Metadata in parallel
  const [mtfKlines, ticker, rawDerivatives, metadata] = await Promise.all([
    provider.getMultiTimeframeKlines(symbol, ['1d', '4h', '1h', '15m', '5m', '1m'], limit),
    provider.getTicker24h(symbol),
    provider.getDerivativesData(symbol),
    provider.getMetadata(symbol),
  ]);

  const primaryKlines: Kline[] = mtfKlines[tf] || [];
  const dailyKlines: Kline[] = mtfKlines['1d'] || [];

  // 2. Run Individual Feature Engines
  const liquidityLevels = detectLiquidityLevels(primaryKlines, tf, {}, dailyKlines);
  const sweeps = detectLiquiditySweeps(primaryKlines, liquidityLevels, tf);
  const structure = analyzeMarketStructure(primaryKlines, tf);
  const sessionLiquidity = analyzeSessionLiquidity(primaryKlines);
  const volumeMetrics = analyzeVolume(primaryKlines);
  const derivatives = enrichDerivativesData(rawDerivatives, primaryKlines);
  const marketRegime = detectMarketRegime(primaryKlines);
  const mtf = analyzeMultiTimeframe(mtfKlines, tf);

  // 3. Evaluate Advanced Liquidity Layer 3 Context
  const layer3 = evaluateLayer3Context({
    liquidityLevels,
    sweeps,
    structure,
    sessions: sessionLiquidity,
    volume: volumeMetrics,
    derivatives,
    mtf,
    regime: marketRegime,
  });

  // 4. Generate Signal
  const signal = generateSignal({
    symbol,
    timeframe: tf,
    klines: primaryKlines,
    liquidityLevels,
    sweeps,
    structure,
    sessions: sessionLiquidity,
    volume: volumeMetrics,
    derivatives,
    mtf,
    regime: marketRegime,
    layer3,
    weights: options.weights,
  });

  const now = Date.now();
  const dataTimestamp = primaryKlines[primaryKlines.length - 1]?.timestamp || now;

  return {
    symbol,
    timeframe: tf,
    ticker,
    metadata: metadata || undefined,
    signal,
    liquidityLevels,
    liquiditySweeps: sweeps,
    structure,
    sessionLiquidity,
    volumeMetrics,
    derivatives,
    marketRegime,
    mtf,
    layer3,
    candles: primaryKlines,
    dataTimestamp,
    analysisTimestamp: now,
  };
}
