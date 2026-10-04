import {
  Kline,
  Timeframe,
  BacktestTrade,
  BacktestReport,
  WalkForwardResult,
  DerivativesData,
} from '../types/market';
import { detectLiquidityLevels } from '../analysis/liquidity';
import { detectLiquiditySweeps } from '../analysis/sweeps';
import { analyzeMarketStructure } from '../analysis/structure';
import { analyzeSessionLiquidity } from '../analysis/sessions';
import { analyzeVolume } from '../analysis/volume';
import { detectMarketRegime } from '../analysis/regime';
import { analyzeMultiTimeframe } from '../analysis/mtf';
import { evaluateLayer3Context } from '../analysis/layer3';
import { generateSignal } from '../analysis/signal';
import { calculateBacktestMetrics } from './metrics';
import { analyzeFalseSignals } from './falseSignals';

export interface BacktestOptions {
  minScore?: number; // Minimum signal score to take trade (default 65)
  maxOpenTrades?: number;
  initialBalance?: number;
  targetRR?: number; // Target Risk Reward
  maxHoldingCandles?: number;
}

export function runBacktest(
  symbol: string,
  timeframe: Timeframe,
  klines: Kline[],
  options: BacktestOptions = {}
): BacktestReport {
  const minScore = options.minScore || 65;
  const maxHoldingCandles = options.maxHoldingCandles || 30;
  const trades: BacktestTrade[] = [];

  if (!klines || klines.length < 50) {
    const emptyMetrics = calculateBacktestMetrics([]);
    return {
      symbol,
      timeframe,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      candlesAnalyzed: 0,
      overallMetrics: emptyMetrics,
      walkForward: {
        training: emptyMetrics,
        validation: emptyMetrics,
        outOfSample: emptyMetrics,
        overfitWarning: false,
      },
      failureBreakdown: {
        liquidityFailures: 0,
        falseBreakouts: 0,
        weakDisplacement: 0,
        badHTFAlignment: 0,
        volumeFailure: 0,
        extremeFundingSqueeze: 0,
        totalLosses: 0,
      },
      trades: [],
    };
  }

  const startDate = new Date(klines[0].timestamp).toISOString().split('T')[0];
  const endDate = new Date(klines[klines.length - 1].timestamp).toISOString().split('T')[0];

  // Dummy derivatives object for backtest simulation
  const dummyDerivatives: DerivativesData = {
    symbol,
    openInterest: 10000,
    openInterestValueUSD: 500000000,
    oiChange1hPercent: 0.5,
    oiChange24hPercent: 2.0,
    oiTrend: 'LONG_BUILDUP',
    fundingRate: 0.0001,
    fundingRateAnnualizedPercent: 10.95,
    fundingCategory: 'NEUTRAL',
    globalLongShortRatio: 1.1,
    topTraderLongShortRatio: 1.2,
    topTraderPositionRatio: 1.15,
    positioning: 'BALANCED',
    takerBuySellRatio: 1.05,
    timestamp: Date.now(),
  };

  let activeTrade: {
    trade: BacktestTrade;
    candlesOpen: number;
  } | null = null;

  // Windowed backtest step-by-step simulation (No look-ahead bias)
  // Window size: 40 candles minimum
  const windowSize = 40;

  for (let i = windowSize; i < klines.length; i++) {
    const currentCandle = klines[i];

    // 1. If we have an active trade, evaluate exit on this candle first
    if (activeTrade) {
      const t = activeTrade.trade;
      activeTrade.candlesOpen++;

      let exitHappened = false;

      if (t.direction === 'LONG') {
        // Check Stop Loss first (worst case)
        if (currentCandle.low <= t.stopLoss) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.stopLoss;
          t.exitReason = 'STOP_LOSS';
          t.status = 'LOSS';
          t.rrRealized = -1.0;
          t.pnlPercent = -Math.abs(((t.entryPrice - t.stopLoss) / t.entryPrice) * 100);
          t.failureReason = 'Liquidity level failure & structural stop breached';
          exitHappened = true;
        } else if (currentCandle.high >= t.tp2) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.tp2;
          t.exitReason = 'TP2';
          t.status = 'WIN';
          t.rrRealized = 2.5;
          t.pnlPercent = ((t.tp2 - t.entryPrice) / t.entryPrice) * 100;
          exitHappened = true;
        } else if (currentCandle.high >= t.tp1) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.tp1;
          t.exitReason = 'TP1';
          t.status = 'WIN';
          t.rrRealized = 1.5;
          t.pnlPercent = ((t.tp1 - t.entryPrice) / t.entryPrice) * 100;
          exitHappened = true;
        } else if (activeTrade.candlesOpen >= maxHoldingCandles) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = currentCandle.close;
          t.exitReason = 'TIMEOUT';
          t.status = currentCandle.close >= t.entryPrice ? 'WIN' : 'LOSS';
          const pnl = ((currentCandle.close - t.entryPrice) / t.entryPrice) * 100;
          t.pnlPercent = pnl;
          t.rrRealized = pnl > 0 ? 0.8 : -0.8;
          if (t.status === 'LOSS') t.failureReason = 'Weak displacement and momentum stagnation';
          exitHappened = true;
        }
      } else if (t.direction === 'SHORT') {
        if (currentCandle.high >= t.stopLoss) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.stopLoss;
          t.exitReason = 'STOP_LOSS';
          t.status = 'LOSS';
          t.rrRealized = -1.0;
          t.pnlPercent = -Math.abs(((t.stopLoss - t.entryPrice) / t.entryPrice) * 100);
          t.failureReason = 'False breakout and buy-side liquidity continuation';
          exitHappened = true;
        } else if (currentCandle.low <= t.tp2) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.tp2;
          t.exitReason = 'TP2';
          t.status = 'WIN';
          t.rrRealized = 2.5;
          t.pnlPercent = ((t.entryPrice - t.tp2) / t.entryPrice) * 100;
          exitHappened = true;
        } else if (currentCandle.low <= t.tp1) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = t.tp1;
          t.exitReason = 'TP1';
          t.status = 'WIN';
          t.rrRealized = 1.5;
          t.pnlPercent = ((t.entryPrice - t.tp1) / t.entryPrice) * 100;
          exitHappened = true;
        } else if (activeTrade.candlesOpen >= maxHoldingCandles) {
          t.exitTime = currentCandle.timestamp;
          t.exitPrice = currentCandle.close;
          t.exitReason = 'TIMEOUT';
          t.status = currentCandle.close <= t.entryPrice ? 'WIN' : 'LOSS';
          const pnl = ((t.entryPrice - currentCandle.close) / t.entryPrice) * 100;
          t.pnlPercent = pnl;
          t.rrRealized = pnl > 0 ? 0.8 : -0.8;
          if (t.status === 'LOSS') t.failureReason = 'Momentum failed to expand';
          exitHappened = true;
        }
      }

      if (exitHappened) {
        trades.push(t);
        activeTrade = null;
      }
    }

    // 2. If no active trade, scan for entry on this candle (only looking at klines 0..i)
    if (!activeTrade && i < klines.length - 2) {
      const visibleKlines = klines.slice(Math.max(0, i - 120), i + 1);
      const levels = detectLiquidityLevels(visibleKlines, timeframe);
      const sweeps = detectLiquiditySweeps(visibleKlines, levels, timeframe);
      const structure = analyzeMarketStructure(visibleKlines, timeframe);
      const sessions = analyzeSessionLiquidity(visibleKlines);
      const volume = analyzeVolume(visibleKlines);
      const regime = detectMarketRegime(visibleKlines);
      const mtf = analyzeMultiTimeframe({ [timeframe]: visibleKlines }, timeframe);

      const layer3 = evaluateLayer3Context({
        liquidityLevels: levels,
        sweeps,
        structure,
        sessions,
        volume,
        derivatives: dummyDerivatives,
        mtf,
        regime,
      });

      const signal = generateSignal({
        symbol,
        timeframe,
        klines: visibleKlines,
        liquidityLevels: levels,
        sweeps,
        structure,
        sessions,
        volume,
        derivatives: dummyDerivatives,
        mtf,
        regime,
        layer3,
      });

      if (
        (signal.direction === 'LONG' || signal.direction === 'SHORT') &&
        signal.score >= minScore &&
        signal.tradePlan
      ) {
        const tp = signal.tradePlan;
        const entryPrice = currentCandle.close;

        activeTrade = {
          trade: {
            id: `bt_${symbol}_${i}`,
            symbol,
            timeframe,
            direction: signal.direction,
            entryTime: currentCandle.timestamp,
            entryPrice,
            stopLoss: tp.stopLoss,
            tp1: tp.tp1,
            tp2: tp.tp2,
            tp3: tp.tp3,
            exitTime: 0,
            exitPrice: 0,
            exitReason: 'TIMEOUT',
            pnlPercent: 0,
            rrRealized: 0,
            status: 'LOSS',
            score: signal.score,
            reasons: signal.reasons,
          },
          candlesOpen: 0,
        };
      }
    }
  }

  // Calculate Overall Metrics
  const overallMetrics = calculateBacktestMetrics(trades, options.initialBalance || 10000);

  // Walk-Forward Analysis Split: 60% Training, 20% Validation, 20% Out-Of-Sample
  const totalCount = trades.length;
  const trainEnd = Math.floor(totalCount * 0.6);
  const valEnd = Math.floor(totalCount * 0.8);

  const trainTrades = trades.slice(0, trainEnd);
  const valTrades = trades.slice(trainEnd, valEnd);
  const oosTrades = trades.slice(valEnd);

  const training = calculateBacktestMetrics(trainTrades);
  const validation = calculateBacktestMetrics(valTrades);
  const outOfSample = calculateBacktestMetrics(oosTrades);

  const overfitWarning =
    training.winRate > 0 && outOfSample.winRate > 0 && training.winRate - outOfSample.winRate > 20;

  const walkForward: WalkForwardResult = {
    training,
    validation,
    outOfSample,
    overfitWarning,
  };

  const failureBreakdown = analyzeFalseSignals(trades);

  return {
    symbol,
    timeframe,
    startDate,
    endDate,
    candlesAnalyzed: klines.length,
    overallMetrics,
    walkForward,
    failureBreakdown,
    trades,
  };
}
