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
  /** کارمزد یک‌طرفهٔ معامله به درصد (پیش‌فرض ۰٫۰۵٪ = نرخ تیکر آتی بایننس) */
  feePercent?: number;
  /** اسلیپیج یک‌طرفه به درصد (پیش‌فرض ۰٫۰۲٪) */
  slippagePercent?: number;
}

/** کارمزد تیکر یک‌طرفهٔ آتی بایننس در سطح پایه (بدون تخفیف BNB) */
export const DEFAULT_FEE_PERCENT = 0.05;
/** اسلیپیج پیش‌فرض برای سفارش‌های بازار در نمادهای نقدشونده */
export const DEFAULT_SLIPPAGE_PERCENT = 0.02;
/** کسری از حجم که در هر هدف سود بسته می‌شود (سه هدف → سه‌قسمت) */
const EXIT_FRACTIONS = [1 / 3, 1 / 3, 1 / 3];

/**
 * دادهٔ مشتقات در بک‌تست تاریخی در دسترس نیست. نسخهٔ قبلی یک شیء ثابت با
 * `oiTrend: 'LONG_BUILDUP'` تزریق می‌کرد که هر معاملهٔ بک‌تست را به‌طور سیستماتیک
 * +۲۵ امتیاز لانگ می‌داد و نتایج را سوگیرانه می‌کرد. اکنون مقدار پیش‌فرض «کاملاً خنثی»
 * است، همهٔ فیلدها در `missingFields` اعلام می‌شوند و وزن مؤلفهٔ مشتقات هم صفر می‌شود.
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
  missingFields: [
    'openInterest',
    'openInterestValueUSD',
    'fundingRate',
    'oiChange1hPercent',
    'oiChange24hPercent',
    'globalLongShortRatio',
    'topTraderPositionRatio',
    'takerBuySellRatio',
  ],
};

interface OpenPosition {
  trade: BacktestTrade;
  candlesOpen: number;
  /** کسر باقی‌مانده از حجم اولیه (۱ = کامل) */
  remaining: number;
  /** میانگین وزنی قیمت خروج‌های انجام‌شده (برای محاسبهٔ PnL خالص) */
  realizedMovement: number;
  /** آخرین دلیلی که باعث بسته‌شدن بخشی از حجم شد */
  lastExitReason: BacktestTrade['exitReason'];
  /** آیا بخشی از حجم با حد ضرر بسته شده است */
  stopHit: boolean;
  /** ورود در بازِ کندل بعد ثبت شده است؟ */
  entered: boolean;
}

export function runBacktest(
  symbol: string,
  timeframe: Timeframe,
  klines: Kline[],
  options: BacktestOptions = {}
): BacktestReport {
  const minScore = options.minScore || 65;
  const maxHoldingCandles = options.maxHoldingCandles || 30;
  const useDerivatives = options.useDerivatives === true;
  const feePercent = options.feePercent ?? DEFAULT_FEE_PERCENT;
  const slippagePercent = options.slippagePercent ?? DEFAULT_SLIPPAGE_PERCENT;
  const trades: BacktestTrade[] = [];
  const assumptions: string[] = [
    'هر معامله با ریسک ثابت ۱٪ از موجودی اولیه شبیه‌سازی می‌شود.',
    `ورود در قیمت بازِ کندلِ *بعد از* صدور سیگنال ثبت می‌شود (نه بستهٔ همان کندل سیگنال)، چون سیگنال تنها پس از بسته‌شدن کندل قابل اجراست.`,
    `خروج به‌صورت پله‌ای انجام می‌شود: یک‌سوم حجم در هر یک از اهداف TP1/TP2/TP3.`,
    'در هر کندل، حد ضرر پیش از اهداف بررسی می‌شود (سناریوی بدبینانه؛ ترتیب واقعی رخدادها داخل کندل نامشخص است).',
    `هزینهٔ معامله لحاظ شده است: ${feePercent}٪ کارمزد + ${slippagePercent}٪ اسلیپیج در هر سمت.`,
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

  /**
   * هزینهٔ یک‌طرفه به نسبت.
   * اسلیپیج مستقیماً در قیمت هر «پرش» (entry/exit) اعمال می‌شود؛ کارمزد در پایان
   * به‌صورت جدا کسر می‌گردد تا دوبار شمرده نشود.
   */
  const oneWayFee = feePercent / 100;
  /** قیمت پرشده با احتساب اسلیپیج، به نفع بازار (بدبینانه) */
  const fillPrice = (price: number, direction: 'LONG' | 'SHORT', side: 'ENTRY' | 'EXIT'): number => {
    const adverse =
      (direction === 'LONG' && side === 'ENTRY') || (direction === 'SHORT' && side === 'EXIT');
    return adverse ? price * (1 + slippagePercent / 100) : price * (1 - slippagePercent / 100);
  };

  let position: OpenPosition | null = null;
  /** سیگنالی که باید در بازِ کندل بعدی وارد شود */
  let pendingEntry: { trade: BacktestTrade } | null = null;

  // شبیه‌سازی گام‌به‌گام با پنجرهٔ مرئی (بدون آینده‌نگری)
  const windowSize = 60;

  for (let i = windowSize; i < klines.length; i++) {
    const currentCandle = klines[i];
    const isLastCandle = i === klines.length - 1;

    // ۰. ثبت ورود برنامه‌ریزی‌شده در بازِ همین کندل
    if (!position && pendingEntry) {
      const planned = pendingEntry.trade;
      const entryPrice = fillPrice(currentCandle.open, planned.direction, 'ENTRY');
      planned.entryTime = currentCandle.timestamp;
      planned.entryPrice = parseFloat(entryPrice.toFixed(8));
      position = {
        trade: planned,
        candlesOpen: 0,
        remaining: 1,
        realizedMovement: 0,
        lastExitReason: 'TIMEOUT',
        stopHit: false,
        entered: true,
      };
      pendingEntry = null;
    }

    // ۱. ارزیابی خروج معاملهٔ باز روی همین کندل
    if (position) {
      const t = position.trade;
      position.candlesOpen++;

      const risk = Math.abs(t.entryPrice - t.stopLoss);
      const isLong = t.direction === 'LONG';

      /** کسر بسته‌شده را با قیمت مشخص ثبت می‌کند (حرکت خالص از ورود، به R) */
      const closeFraction = (fraction: number, price: number, reason: BacktestTrade['exitReason']) => {
        const size = Math.min(position!.remaining, fraction);
        if (size <= 0) return;
        const net = fillPrice(price, t.direction, 'EXIT');
        const movement = isLong ? net - t.entryPrice : t.entryPrice - net;
        position!.realizedMovement += size * (risk > 0 ? movement / risk : 0);
        position!.remaining -= size;
        position!.lastExitReason = reason;
      };

      // ۱.۱ حد ضرر اول بررسی می‌شود (بدبینانه)
      if (position.remaining > 0 && (isLong ? currentCandle.low <= t.stopLoss : currentCandle.high >= t.stopLoss)) {
        closeFraction(position.remaining, t.stopLoss, 'STOP_LOSS');
        position.stopHit = true;
      }

      // ۱.۲ اهداف، به ترتیب پله‌ای
      if (position.remaining > 0 && (isLong ? currentCandle.high >= t.tp1 : currentCandle.low <= t.tp1)) {
        closeFraction(EXIT_FRACTIONS[0], t.tp1, 'TP1');
      }
      if (position.remaining > 0 && (isLong ? currentCandle.high >= t.tp2 : currentCandle.low <= t.tp2)) {
        closeFraction(EXIT_FRACTIONS[1], t.tp2, 'TP2');
      }
      if (position.remaining > 0 && (isLong ? currentCandle.high >= t.tp3 : currentCandle.low <= t.tp3)) {
        closeFraction(EXIT_FRACTIONS[2], t.tp3, 'TP3');
      }

      // ۱.۳ پایان زمان نگهداری یا پایان داده
      if (position.remaining > 0 && (position.candlesOpen >= maxHoldingCandles || isLastCandle)) {
        closeFraction(position.remaining, currentCandle.close, isLastCandle ? 'END_OF_DATA' : 'TIMEOUT');
      }

      if (position.remaining <= 1e-9) {
        // `realizedMovement` میانگین وزنیِ حرکت خالص (با احتساب اسلیپیج) به واحد R است
        const feeCostR = feeCostInR(oneWayFee, risk, t.entryPrice);
        const exitPrice = t.entryPrice + (isLong ? 1 : -1) * position.realizedMovement * risk;
        const rrRealized = parseFloat((position.realizedMovement - feeCostR).toFixed(2));
        const grossPnlPercent =
          ((isLong ? exitPrice - t.entryPrice : t.entryPrice - exitPrice) / t.entryPrice) * 100;
        const netPnlPercent = grossPnlPercent - oneWayFee * 2 * 100;

        t.exitTime = currentCandle.timestamp;
        t.exitPrice = parseFloat(exitPrice.toFixed(8));
        t.exitReason = position.stopHit && rrRealized < 0 ? 'STOP_LOSS' : position.lastExitReason;
        t.rrRealized = rrRealized;
        t.pnlPercent = parseFloat(netPnlPercent.toFixed(2));
        t.status = rrRealized > 0 ? 'WIN' : 'LOSS';
        t.holdCandles = position.candlesOpen;

        if (t.status === 'LOSS') {
          const category = position.stopHit
            ? isLong
              ? ('LIQUIDITY_FAIL' as const)
              : ('FALSE_BREAKOUT' as const)
            : ('WEAK_DISPLACEMENT' as const);
          t.failureCategory = category;
          t.failureReason =
            category === 'LIQUIDITY_FAIL'
              ? 'شکست سطح نقدینگی و عبور از حد ساختاری'
              : category === 'FALSE_BREAKOUT'
              ? 'شکست جعلی و ادامهٔ حرکت به سمت نقدینگی سمت خرید'
              : 'مومنتوم قادر به گسترش نبود';
        }

        trades.push(t);
        position = null;
      }
    }

    // ۲. جست‌وجوی ورود جدید (فقط با کندل‌های ۰ تا i)
    if (!position && !pendingEntry && i < klines.length - 2) {
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
        pendingEntry = {
          trade: {
            id: `bt_${symbol}_${i}`,
            symbol,
            timeframe,
            direction: signal.direction,
            entryTime: 0,
            entryPrice: 0,
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
        };
      }
    }
  }

  // معاملهٔ بازی که در پایان داده هنوز بسته نشده است نباید بی‌صدا حذف شود؛
  // پیش‌تر آخرین ستاپِ در جریان از فهرست معاملات کنار گذاشته می‌شد و آمار
  // (نرخ برد، فاکتور سود) روی نمونهٔ ناقص محاسبه می‌گردید.
  if (position) {
    const t = position.trade;
    const risk = Math.abs(t.entryPrice - t.stopLoss);
    const feeCostR = feeCostInR(oneWayFee, risk, t.entryPrice);
    const rrRealized = parseFloat((position.realizedMovement - feeCostR).toFixed(2));
    const lastClose = klines[klines.length - 1].close;
    t.exitTime = klines[klines.length - 1].timestamp;
    t.exitPrice = lastClose;
    t.exitReason = 'END_OF_DATA';
    t.rrRealized = rrRealized;
    t.pnlPercent = parseFloat(
      (
        ((t.direction === 'LONG'
          ? (lastClose - t.entryPrice) / t.entryPrice
          : (t.entryPrice - lastClose) / t.entryPrice) *
          100 -
          oneWayFee * 2 * 100) as number
      ).toFixed(2)
    );
    t.status = rrRealized > 0 ? 'WIN' : 'LOSS';
    t.holdCandles = position.candlesOpen;
    trades.push(t);
    assumptions.push(
      'آخرین معاملهٔ باز در پایان بازهٔ داده با قیمت بستهٔ آخرین کندل بسته شد (خروج «پایان داده»).'
    );
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

/**
 * کارمزد کل معامله (ورود یک‌بار + خروج یک‌بار روی کل حجم) بر حسب واحد ریسک R.
 *
 * چون PnL در خروجی‌ها به R بیان می‌شود، هزینه هم باید با همان واحد کسر شود؛
 * وگرنه بک‌تست بدون هزینه — و در نتیجه خوش‌بینانه — گزارش می‌شود.
 */
function feeCostInR(oneWayFee: number, risk: number, entryPrice: number): number {
  if (risk <= 0 || entryPrice <= 0) return 0;
  return (entryPrice * oneWayFee * 2) / risk;
}
