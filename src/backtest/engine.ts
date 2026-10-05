import {
  Kline,
  Timeframe,
  BacktestTrade,
  BacktestReport,
  WalkForwardResult,
  DerivativesData,
  SignalWeights,
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
import { resampleKlines } from '../lib/resample';
import { TIMEFRAME_MS } from '../lib/timeframes';

export interface BacktestOptions {
  minScore?: number; // Minimum signal score to take trade (default 65)
  maxOpenTrades?: number;
  initialBalance?: number;
  targetRR?: number; // Target Risk Reward
  maxHoldingCandles?: number;
  /** وزن‌های سفارشی موتور سیگنال */
  weights?: Partial<SignalWeights>;
  /** آیا از داده‌های مشتقات (که در بک‌تست تاریخی در دسترس نیست) استفاده شود */
  useDerivatives?: boolean;
}

/**
 * دادهٔ مشتقات در بک‌تست تاریخی در دسترس نیست. نسخهٔ قبلی یک شیء ثابت با
 * `oiTrend: 'LONG_BUILDUP'` تزریق می‌کرد که هر معاملهٔ بک‌تست را به‌طور سیستماتیک
 * +۲۵ امتیاز لانگ می‌داد و نتایج را سوگیرانه می‌کرد. اکنون مقدار پیش‌فرض «کاملاً خنثی»
 * است و وزن مؤلفهٔ مشتقات نیز در امتیازدهی صفر می‌شود.
 */
const NEUTRAL_DERIVATIVES: Omit<DerivativesData, 'symbol' | 'timestamp'> = {
  openInterest: 0,
  openInterestValueUSD: 0,
  oiChange1hPercent: 0,
  oiChange24hPercent: 0,
  oiTrend: 'NEUTRAL',
  fundingRate: 0,
  fundingRateAnnualizedPercent: 0,
  fundingCategory: 'NEUTRAL',
  globalLongShortRatio: 1,
  topTraderLongShortRatio: 1,
  topTraderPositionRatio: 1,
  positioning: 'BALANCED',
  takerBuySellRatio: 1,
  isSimulated: true,
};

export function runBacktest(
  symbol: string,
  timeframe: Timeframe,
  klines: Kline[],
  options: BacktestOptions = {}
): BacktestReport {
  const minScore = options.minScore || 65;
  const maxHoldingCandles = options.maxHoldingCandles || 30;
  const useDerivatives = options.useDerivatives === true;
  const trades: BacktestTrade[] = [];
  const assumptions: string[] = [
    'هر معامله با ریسک ثابت ۱٪ از موجودی اولیه شبیه‌سازی می‌شود.',
    'ورود در قیمت بستهٔ کندلِ صدور سیگنال و خروج بر پایهٔ حد ضرر/اهداف همان سیگنال انجام می‌شود.',
    'حد ضرر پیش از اهداف بررسی می‌شود (سناریوی بدترین حالت).',
  ];

  if (!klines || klines.length < 60) {
    const emptyMetrics = calculateBacktestMetrics([]);
    return {
      symbol,
      timeframe,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      candlesAnalyzed: 0,
      overallMetrics: emptyMetrics,
      walkForward: { training: emptyMetrics, validation: emptyMetrics, outOfSample: emptyMetrics, overfitWarning: false },
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
      assumptions: ['دادهٔ کافی برای بک‌تست وجود ندارد (حداقل ۶۰ کندل لازم است).'],
    };
  }

  // وزن‌های مؤثر: در نبود دادهٔ مشتقات، وزن آن صفر و میان سایر مؤلفه‌ها بازتوزیع می‌شود
  const effectiveWeights: Partial<SignalWeights> = { ...(options.weights || {}) };
  if (!useDerivatives) {
    const keys: (keyof SignalWeights)[] = [
      'liquidity',
      'marketStructure',
      'multiTimeframe',
      'sessionLiquidity',
      'volume',
      'advancedLayer3',
    ];
    effectiveWeights.derivatives = 0;
    const base: Record<string, number> = {
      liquidity: 0.2,
      marketStructure: 0.2,
      multiTimeframe: 0.2,
      sessionLiquidity: 0.1,
      volume: 0.1,
      advancedLayer3: 0.1,
    };
    const sum = keys.reduce((acc, key) => acc + (base[key] || 0), 0);
    for (const key of keys) {
      effectiveWeights[key] = ((base[key] || 0) / sum) * 0.9;
    }
    assumptions.push(
      'دادهٔ تاریخی مشتقات (OI/فاندینگ) در دسترس نیست؛ وزن این مؤلفه صفر و میان سایر مؤلفه‌ها بازتوزیع شده است.'
    );
  }

  assumptions.push(
    'تحلیل چندتایم‌فریم در بک‌تست با بازنمونه‌گیری کندل‌های همان پنجرهٔ مرئی ساخته می‌شود (بدون دادهٔ خارج از پنجره).'
  );

  const startDate = new Date(klines[0].timestamp).toISOString();
  const endDate = new Date(klines[klines.length - 1].timestamp).toISOString();

  let activeTrade: { trade: BacktestTrade; candlesOpen: number } | null = null;

  // شبیه‌سازی گام‌به‌گام با پنجرهٔ مرئی (بدون آینده‌نگری)
  const windowSize = 60;

  for (let i = windowSize; i < klines.length; i++) {
    const currentCandle = klines[i];

    // ۱. ارزیابی خروج معاملهٔ باز روی همین کندل
    if (activeTrade) {
      const t = activeTrade.trade;
      activeTrade.candlesOpen++;

      const risk = Math.abs(t.entryPrice - t.stopLoss);
      const rrOf = (exit: number): number => {
        if (risk <= 0) return 0;
        const movement = t.direction === 'LONG' ? exit - t.entryPrice : t.entryPrice - exit;
        return parseFloat((movement / risk).toFixed(2));
      };
      const pnlOf = (exit: number): number =>
        t.direction === 'LONG'
          ? ((exit - t.entryPrice) / t.entryPrice) * 100
          : ((t.entryPrice - exit) / t.entryPrice) * 100;

      let exitHappened = false;
      const closeTrade = (
        exitPrice: number,
        exitReason: BacktestTrade['exitReason'],
        status: BacktestTrade['status'],
        failureCategory?: BacktestTrade['failureCategory'],
        failureReason?: string
      ) => {
        t.exitTime = currentCandle.timestamp;
        t.exitPrice = exitPrice;
        t.exitReason = exitReason;
        t.status = status;
        t.rrRealized = rrOf(exitPrice);
        t.pnlPercent = parseFloat(pnlOf(exitPrice).toFixed(2));
        if (failureCategory) t.failureCategory = failureCategory;
        if (failureReason) t.failureReason = failureReason;
        exitHappened = true;
      };

      if (t.direction === 'LONG') {
        if (currentCandle.low <= t.stopLoss) {
          closeTrade(t.stopLoss, 'STOP_LOSS', 'LOSS', 'LIQUIDITY_FAIL', 'شکست سطح نقدینگی و عبور از حد ساختاری');
        } else if (currentCandle.high >= t.tp3) {
          closeTrade(t.tp3, 'TP3', 'WIN');
        } else if (currentCandle.high >= t.tp2) {
          closeTrade(t.tp2, 'TP2', 'WIN');
        } else if (currentCandle.high >= t.tp1) {
          closeTrade(t.tp1, 'TP1', 'WIN');
        } else if (activeTrade.candlesOpen >= maxHoldingCandles) {
          const status = currentCandle.close >= t.entryPrice ? 'WIN' : 'LOSS';
          closeTrade(
            currentCandle.close,
            'TIMEOUT',
            status,
            status === 'LOSS' ? 'WEAK_DISPLACEMENT' : undefined,
            status === 'LOSS' ? 'دیسپلیسمنت ضعیف و رکود مومنتوم' : undefined
          );
        }
      } else {
        if (currentCandle.high >= t.stopLoss) {
          closeTrade(
            t.stopLoss,
            'STOP_LOSS',
            'LOSS',
            'FALSE_BREAKOUT',
            'شکست جعلی و ادامهٔ حرکت به سمت نقدینگی سمت خرید'
          );
        } else if (currentCandle.low <= t.tp3) {
          closeTrade(t.tp3, 'TP3', 'WIN');
        } else if (currentCandle.low <= t.tp2) {
          closeTrade(t.tp2, 'TP2', 'WIN');
        } else if (currentCandle.low <= t.tp1) {
          closeTrade(t.tp1, 'TP1', 'WIN');
        } else if (activeTrade.candlesOpen >= maxHoldingCandles) {
          const status = currentCandle.close <= t.entryPrice ? 'WIN' : 'LOSS';
          closeTrade(
            currentCandle.close,
            'TIMEOUT',
            status,
            status === 'LOSS' ? 'WEAK_DISPLACEMENT' : undefined,
            status === 'LOSS' ? 'مومنتوم قادر به گسترش نبود' : undefined
          );
        }
      }

      if (exitHappened) {
        t.holdCandles = activeTrade.candlesOpen;
        trades.push(t);
        activeTrade = null;
      }
    }

    // ۲. جست‌وجوی ورود جدید (فقط با کندل‌های ۰ تا i)
    if (!activeTrade && i < klines.length - 2) {
      const visibleKlines = klines.slice(Math.max(0, i - 160), i + 1);
      const derivatives: DerivativesData = {
        ...NEUTRAL_DERIVATIVES,
        symbol,
        timestamp: currentCandle.timestamp,
      };

      const levels = detectLiquidityLevels(visibleKlines, timeframe);
      const sweeps = detectLiquiditySweeps(visibleKlines, levels, timeframe);
      const structure = analyzeMarketStructure(visibleKlines, timeframe);

      // تحلیل جلسات روی کندل‌های همان پنجرهٔ مرئی (برای تایم‌فریم زیر ۱۵ دقیقه،
      // بازنمونه‌گیری به ۱۵ دقیقه انجام می‌شود تا تفکیک ساعتی جلسات دقیق‌تر باشد).
      const sessionSeries =
        TIMEFRAME_MS[timeframe] < TIMEFRAME_MS['15m']
          ? resampleKlines(visibleKlines, '15m')
          : visibleKlines;
      const sessions = analyzeSessionLiquidity(sessionSeries);
      const volume = analyzeVolume(visibleKlines);
      const regime = detectMarketRegime(visibleKlines);

      // تحلیل چندتایم‌فریم: فقط تایم‌فریم‌های بزرگ‌تر از تایم‌فریم اصلی از همان
      // پنجرهٔ مرئی ساخته می‌شوند؛ تایم‌فریم اصلی خودش و هیچ دادهٔ آینده‌ای استفاده نمی‌شود.
      const mtfInput: Partial<Record<Timeframe, Kline[]>> = { [timeframe]: visibleKlines };
      for (const candidate of ['1d', '4h', '1h', '15m', '5m', '1m'] as Timeframe[]) {
        if (TIMEFRAME_MS[candidate] > TIMEFRAME_MS[timeframe]) {
          mtfInput[candidate] = resampleKlines(visibleKlines, candidate);
        }
      }
      const mtf = analyzeMultiTimeframe(mtfInput, timeframe);

      const layer3 = evaluateLayer3Context({
        liquidityLevels: levels,
        sweeps,
        structure,
        sessions,
        volume,
        derivatives,
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
        derivatives,
        mtf,
        regime,
        layer3,
        weights: effectiveWeights,
      });

      if (
        (signal.direction === 'LONG' || signal.direction === 'SHORT') &&
        signal.score >= minScore &&
        signal.tradePlan &&
        Math.abs(signal.tradePlan.stopLoss - currentCandle.close) > 0
      ) {
        const plan = signal.tradePlan;
        activeTrade = {
          trade: {
            id: `bt_${symbol}_${i}`,
            symbol,
            timeframe,
            direction: signal.direction,
            entryTime: currentCandle.timestamp,
            entryPrice: currentCandle.close,
            stopLoss: plan.stopLoss,
            tp1: plan.tp1,
            tp2: plan.tp2,
            tp3: plan.tp3,
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

  const initialBalance = options.initialBalance || 10000;
  const overallMetrics = calculateBacktestMetrics(trades, initialBalance, timeframe);

  // اعتبارسنجی گام‌به‌گام: ۶۰٪ آموزش، ۲۰٪ اعتبارسنجی، ۲۰٪ خارج از نمونه (به ترتیب زمان)
  const totalCount = trades.length;
  const trainEnd = Math.floor(totalCount * 0.6);
  const valEnd = Math.floor(totalCount * 0.8);

  const training = calculateBacktestMetrics(trades.slice(0, trainEnd), initialBalance, timeframe);
  const validation = calculateBacktestMetrics(trades.slice(trainEnd, valEnd), initialBalance, timeframe);
  const outOfSample = calculateBacktestMetrics(trades.slice(valEnd), initialBalance, timeframe);

  const overfitWarning =
    training.totalTrades >= 5 &&
    outOfSample.totalTrades >= 3 &&
    training.winRate - outOfSample.winRate > 20;

  const walkForward: WalkForwardResult = { training, validation, outOfSample, overfitWarning };
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
    assumptions,
  };
}
