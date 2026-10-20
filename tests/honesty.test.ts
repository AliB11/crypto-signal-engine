import { Kline, DerivativesData, BacktestTrade } from '../src/types/market';
import { analyzeMarketStructure, MIN_CANDLES_FOR_STRUCTURE } from '../src/analysis/structure';
import { analyzeMultiTimeframe, MIN_CANDLES_PER_TIMEFRAME } from '../src/analysis/mtf';
import { detectLiquiditySweeps } from '../src/analysis/sweeps';
import { detectLiquidityLevels } from '../src/analysis/liquidity';
import { detectMarketRegime } from '../src/analysis/regime';
import { enrichDerivativesData } from '../src/analysis/derivatives';
import {
  annualizeFundingRate,
  fundingIntervalLabel,
  DEFAULT_FUNDING_INTERVAL_HOURS,
} from '../src/lib/funding';
import { createDataTrace, dataQualityFromTrace } from '../src/providers/MarketDataProvider';
import { parseScannerTier, SCANNER_TIER_COUNTS } from '../src/config/engine';
import {
  runBacktest,
  DEFAULT_FEE_PERCENT,
  DEFAULT_SLIPPAGE_PERCENT,
} from '../src/backtest/engine';
import { calculateBacktestMetrics } from '../src/backtest/metrics';
import { makeKlines } from './analysis.test';
import { simulateDerivatives } from '../src/providers/simulation';

/**
 * آزمون «صداقت داده».
 *
 * این فایل یک دستهٔ مشخص از رگرسیون‌ها را قفل می‌کند: جاهایی که برنامه پیش‌تر
 * به‌جای «نمی‌دانم» یک عدد باورپذیر اما ساختگی تولید می‌کرد. هر آزمون دقیقاً همان
 * مقدار ساختگی قبلی را هدف می‌گیرد تا اگر روزی برگشت، تست بشکند.
 */

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message} (expected ${expected} ± ${tolerance}, got ${actual})`);
  }
}

/** کندل‌هایی با close ثابت و دامنهٔ مشخص ⇒ TR برابر با high-low است */
function flatRangeKlines(count: number, range: number, price = 100): Kline[] {
  return makeKlines(
    Array.from({ length: count }, () => ({
      open: price,
      high: price + range / 2,
      low: price - range / 2,
      close: price,
    })),
    '1h'
  );
}

function baseDerivatives(overrides: Partial<DerivativesData> = {}): DerivativesData {
  return {
    symbol: 'BTCUSDT',
    openInterest: 20_000,
    openInterestValueUSD: 1_900_000_000,
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
    timestamp: Date.now(),
    isSimulated: false,
    missingFields: [],
    fundingIntervalHours: 8,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
export function testFundingAnnualisation(): void {
  console.log('Testing funding annualisation with the real settlement interval...');

  // بازهٔ تسویه واقعاً نتیجه را عوض می‌کند؛ پیش‌تر همیشه ۸ ساعت فرض می‌شد
  const rate = 0.0001;
  const annual8h = annualizeFundingRate(rate, 8);
  const annual4h = annualizeFundingRate(rate, 4);
  const annual1h = annualizeFundingRate(rate, 1);

  assertClose(annual8h!, 0.0001 * 3 * 365 * 100, 0.001, '8h annualisation');
  assertClose(annual4h!, 0.0001 * 6 * 365 * 100, 0.001, '4h annualisation');
  assertClose(annual1h!, 0.0001 * 24 * 365 * 100, 0.001, '1h annualisation');
  assert(annual4h! > annual8h! * 1.9, 'A 4h interval must nearly double the annualised rate');

  // بازهٔ خوانده‌نشده ⇒ پیش‌فرض مستند، نه یک حدس پنهان
  assertClose(
    annualizeFundingRate(rate, null)!,
    annualizeFundingRate(rate, DEFAULT_FUNDING_INTERVAL_HOURS)!,
    1e-9,
    'Unknown interval falls back to the documented default'
  );

  // ورودی نامعتبر ⇒ null، نه صفر و نه عدد ساختگی
  assert(annualizeFundingRate(null, 8) === null, 'A missing funding rate must yield null');
  assert(
    annualizeFundingRate(Number.NaN, 8) === null,
    'A non-finite funding rate must yield null'
  );
  assert(fundingIntervalLabel(null) === null, 'Unknown interval has no label');
  assert(fundingIntervalLabel(4) === '4ساعته', 'Interval label must use the real value');

  console.log('✓ Funding annualisation passed (interval-aware, null-safe).');
}

// ────────────────────────────────────────────────────────────────────────────
export function testDataTraceIsolation(): void {
  console.log('Testing per-request data trace isolation...');

  const a = createDataTrace();
  const b = createDataTrace();
  a.live += 7;
  a.simulated += 3;

  const qa = dataQualityFromTrace(a);
  const qb = dataQualityFromTrace(b);

  assert(qa.liveFetches === 7 && qa.simulatedFetches === 3, 'Trace A must count its own fetches');
  assert(qb.liveFetches === 0 && qb.simulatedFetches === 0, 'Trace B must not see trace A');
  assertClose(qa.liveRatio, 0.7, 1e-9, 'Live ratio must be 7/10');

  // سه حالت متمایز: همه‌زنده / ترکیبی / همه‌شبیه‌سازی.
  // فروکاستن «ترکیبی» به «شبیه‌سازی» یعنی رابط کاربری «بدون دسترسی به بایننس»
  // می‌گفت در حالی که بایننس برای ۷ فراخوانی از ۱۰ فراخوانی پاسخ داده بود.
  assert(qa.source === 'mixed', 'A partly simulated response must be reported as mixed');

  const allSim = createDataTrace();
  allSim.simulated += 4;
  assert(
    dataQualityFromTrace(allSim).source === 'simulated',
    'A fully simulated response must be reported as simulated'
  );

  assert(qb.source === 'live', 'A trace with only live fetches is live');
  assert(
    dataQualityFromTrace(allSim).message.includes('شبیه‌سازی'),
    'The simulated message must say so explicitly'
  );

  const unknown = dataQualityFromTrace(undefined);
  assert(unknown.liveFetches === 0, 'An absent trace must not invent fetch counts');

  console.log('✓ Data trace isolation passed (live/mixed/simulated distinguished, requests isolated).');
}

// ────────────────────────────────────────────────────────────────────────────
export function testMtfHonesty(): void {
  console.log('Testing multi-timeframe honesty (no fabricated neutral scores)...');

  const enough = flatRangeKlines(40, 2);
  const tooFew = flatRangeKlines(MIN_CANDLES_PER_TIMEFRAME - 1, 2);

  const mtf = analyzeMultiTimeframe({ '1h': enough, '15m': enough, '1d': tooFew, '5m': [] });

  const missing = mtf.timeframes['1d'];
  assert(missing.available === false, 'A timeframe with too few candles must be unavailable');
  assert(missing.trend === 'UNKNOWN', "Unavailable timeframe must report trend 'UNKNOWN'");
  assert(
    missing.structureScore === null,
    `Unavailable timeframe must have a null score, got ${missing.structureScore}`
  );
  assert(missing.volumeState === 'UNKNOWN', 'Unavailable timeframe has no volume state');
  assert(missing.candleCount === tooFew.length, 'Candle count must be reported truthfully');

  const analyzed = mtf.timeframes['1h'];
  assert(analyzed.available === true, 'A timeframe with enough candles must be available');
  assert(
    typeof analyzed.structureScore === 'number',
    'An analyzed timeframe must have a numeric score'
  );

  assert(
    !mtf.analyzedTimeframes.includes('1d'),
    'Analyzed list must exclude timeframes without data'
  );
  assert(mtf.analyzedTimeframes.includes('1h'), 'Analyzed list must include analyzed timeframes');
  assert(mtf.htfTotal === 3, 'HTF total is the 1d/4h/1h reference set');
  assert(mtf.htfAnalyzedCount === 1, 'Only 1h had data among the HTF reference set');
  assert(
    mtf.htfTrend === 'NEUTRAL',
    'A directional HTF bias must not be claimed from a single timeframe'
  );
  assert(
    mtf.confluenceDescription.includes('1d'),
    'The description must name which timeframes had no data'
  );

  console.log(
    `✓ MTF honesty passed (${mtf.analyzedTimeframes.length} analyzed, htf ${mtf.htfAnalyzedCount}/${mtf.htfTotal}, unavailable score is null).`
  );
}

// ────────────────────────────────────────────────────────────────────────────
export function testStructureAvailability(): void {
  console.log('Testing market structure availability & displacement baseline...');

  const tooFew = flatRangeKlines(MIN_CANDLES_FOR_STRUCTURE - 1, 2);
  const thin = analyzeMarketStructure(tooFew, '1h');
  assert(thin.available === false, 'Too few candles must not produce a structure verdict');
  assert(thin.candleCount === tooFew.length, 'Candle count must be truthful');

  // میانگین دیسپلیسمنت باید از کندل‌های *بسته‌شده* ساخته شود.
  // ۳۰ کندل با بدنهٔ کوچک، سپس یک کندلِ در حال تشکیل با بدنهٔ بزرگ.
  const bodySmall = { open: 100, high: 101, low: 99, close: 100.4, volume: 100 };
  const forming = { open: 100, high: 112, low: 99, close: 111.5, volume: 900 };
  const withForming = makeKlines(
    [...Array.from({ length: 30 }, () => bodySmall), forming],
    '1h'
  );
  const structA = analyzeMarketStructure(withForming, '1h');

  // همان داده بدون کندل در حال تشکیل
  const withoutForming = makeKlines(
    Array.from({ length: 30 }, () => bodySmall),
    '1h'
  );
  const structB = analyzeMarketStructure(withoutForming, '1h');

  assert(structA.available && structB.available, 'Both series have enough candles');
  assert(
    structA.displacementDetected === true,
    'A 27x body expansion must be detected as displacement'
  );
  assert(
    structB.displacementDetected === false,
    'A uniform series has no displacement'
  );

  // رویدادها باید زمانی‌مرتب باشند (پیش‌تر پیوت‌ها و شکست‌ها در دو حلقهٔ جدا
  // push می‌شدند و slice(-5) هرگز رویدادهای پیوتی را نمی‌دید)
  for (let i = 1; i < structA.events.length; i++) {
    assert(
      structA.events[i].candleIndex >= structA.events[i - 1].candleIndex,
      `Structure events must be sorted by candle index (index ${i})`
    );
  }

  console.log('✓ Structure availability passed (honest verdict, closed-candle baseline, sorted events).');
}

// ────────────────────────────────────────────────────────────────────────────
export function testSweepDojiTautology(): void {
  console.log('Testing sweep wick requirement on doji candles...');

  /**
   * سازندهٔ سناریو: ۲۶ کندل نوسانی ملایم، یک کف نوسانی متمایز در ۹۹٫۰، دو کندل
   * بازیابی (تا پیوت تأیید شود) و در نهایت «کندل مورد آزمون».
   */
  const build = (last: { open: number; high: number; low: number; close: number }) => {
    const spec: { open: number; high: number; low: number; close: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const base = 100 + Math.sin(i / 3) * 0.5;
      spec.push({ open: base, high: base + 0.6, low: base - 0.6, close: base + 0.1 });
    }
    spec.push({ open: 99.8, high: 100.2, low: 99.0, close: 99.9 }); // کف نوسانی
    spec.push({ open: 99.9, high: 100.6, low: 99.4, close: 100.4 });
    spec.push({ open: 100.4, high: 101.0, low: 99.8, close: 100.7 });
    spec.push(last);
    const klines = makeKlines(spec, '15m');
    return { klines, levels: detectLiquidityLevels(klines, '15m') };
  };

  const sweepsOnLastCandle = (scenario: ReturnType<typeof build>) =>
    detectLiquiditySweeps(scenario.klines, scenario.levels, '15m').filter(
      (s) => s.type === 'SELL_SIDE_SWEEP' && s.candleIndex === scenario.klines.length - 1
    );

  // الف) دوجی (open == close) نزدیک به کف با شدوی پایینِ ناچیز.
  // پیش‌تر شرط شدو به `lowerWick >= lowerWick * 0.6` تقلیل می‌یافت که *همیشه*
  // درست است، پس همین کندل «سوئیپ تأییدشده» گزارش می‌شد.
  const weak = build({ open: 98.95, high: 99.9, low: 98.9, close: 98.95 });
  assert(weak.levels.length > 0, 'The fixture must produce liquidity levels');
  const weakSweeps = sweepsOnLastCandle(weak);
  assert(
    weakSweeps.length === 0,
    `A doji with a negligible lower wick must not count as a confirmed sweep (got ${weakSweeps.length})`
  );

  // ب) همان نفوذ با شدوی بلند باید همچنان سوئیپ شناخته شود (آزمون مثبت)
  const strong = build({ open: 99.6, high: 99.75, low: 98.9, close: 99.6 });
  const strongSweeps = sweepsOnLastCandle(strong);
  assert(
    strongSweeps.length > 0,
    'A long lower wick reclaiming the level must still be detected as a sweep'
  );

  // نسبت شدو به بدنه یک عدد اندازه‌گیری‌شده است، نه مقدار ساختگی ۲٫۰
  for (const s of strongSweeps) {
    assert(
      Number.isFinite(s.wickToBodyRatio) && s.wickToBodyRatio > 0,
      `Wick ratio must be a real measured value, got ${s.wickToBodyRatio}`
    );
  }

  console.log(
    `✓ Sweep wick test passed (doji rejected, genuine sweep detected with ratio ${strongSweeps[0].wickToBodyRatio}).`
  );
}

// ────────────────────────────────────────────────────────────────────────────
export function testDerivativesEnrichment(): void {
  console.log('Testing derivatives enrichment (timeframe alignment + missing fields)...');

  // ۱. اگر تغییر OI یک‌ساعته خوانده نشده باشد، هیچ برچسبی ساخته نمی‌شود
  const noOi = baseDerivatives({
    oiTrend: 'NEUTRAL',
    oiChange1hPercent: 0,
    missingFields: ['oiChange1hPercent'],
  });
  const rising = makeKlines(
    Array.from({ length: 40 }, (_, i) => ({
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100.9 + i,
    })),
    '15m'
  );
  const untouched = enrichDerivativesData(noOi, rising, '15m');
  assert(
    untouched.oiTrend === 'NEUTRAL',
    'Without a real OI change, no OI trend may be fabricated'
  );

  // ۲. با دادهٔ واقعی، روند روی پنجرهٔ هم‌تراز با یک ساعت ساخته می‌شود
  const withOi = baseDerivatives({ oiChange1hPercent: 2.5, missingFields: [] });
  const enriched = enrichDerivativesData(withOi, rising, '15m');
  assert(
    enriched.oiTrend === 'LONG_BUILDUP',
    `Rising price + rising OI must be LONG_BUILDUP, got ${enriched.oiTrend}`
  );

  // ۳. تایم‌فریم درشت‌تر از یک ساعت ⇒ پنجرهٔ یک‌ساعته قابل ساختن نیست
  const daily = makeKlines(
    Array.from({ length: 40 }, (_, i) => ({
      open: 100 + i * 10,
      high: 101 + i * 10,
      low: 99 + i * 10,
      close: 100.9 + i * 10,
    })),
    '1d'
  );
  const dailyOut = enrichDerivativesData(withOi, daily, '1d');
  assert(
    dailyOut.oiTrend === withOi.oiTrend,
    'A daily series cannot measure a 1h price move; the provider value must stay untouched'
  );

  console.log('✓ Derivatives enrichment passed (no trend invented from missing OI data).');
}

// ────────────────────────────────────────────────────────────────────────────
export function testWilderAtr(): void {
  console.log('Testing Wilder (RMA) ATR smoothing...');

  // ۳۰ کندل: ۱۴ کندل با TR=10، سپس یک جهش TR=100، سپس ۱۴ کندل با TR=10.
  // میانگین سادهٔ ۱۴ مقدار آخر دقیقاً ۱۰ می‌شد (جهش کاملاً فراموش می‌شد)،
  // اما RMA وایلدر بخشی از جهش را نگه می‌دارد.
  const spec: { open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const range = i === 15 ? 100 : 10;
    spec.push({ open: 100, high: 100 + range / 2, low: 100 - range / 2, close: 100 });
  }
  const klines = makeKlines(spec, '1h');
  const regime = detectMarketRegime(klines);

  // مقدار تحلیلی: seed=10، یک گام (10*13+100)/14، سپس ۱۴ گام همگرایی به ۱۰
  const seed = 10;
  const spiked = (seed * 13 + 100) / 14;
  let expected = spiked;
  for (let i = 0; i < 14; i++) expected = (expected * 13 + 10) / 14;

  assertClose(regime.atr, expected, 0.05, 'Wilder RMA ATR');
  assert(
    Math.abs(regime.atr - 10) > 1,
    `ATR must retain the spike (simple SMA14 would return exactly 10, got ${regime.atr})`
  );

  console.log(`✓ Wilder ATR passed (ATR ${regime.atr} vs simple-SMA 10).`);
}

// ────────────────────────────────────────────────────────────────────────────
export function testBacktestCostsAndExits(): void {
  console.log('Testing backtest transaction costs, partial exits and honest metrics...');

  // ۱. profitFactor وقتی هیچ زیانی وجود ندارد «تعریف‌نشده» است، نه ۹۹٫۹۹
  const onlyWins = calculateBacktestMetrics(
    [makeTrade('WIN', 2), makeTrade('WIN', 1.5)],
    10_000,
    '15m'
  );
  assert(
    onlyWins.profitFactor === null,
    `Profit factor with no losses must be null, got ${onlyWins.profitFactor}`
  );

  const empty = calculateBacktestMetrics([], 10_000, '15m');
  assert(empty.profitFactor === null, 'Profit factor with no trades must be null');

  const mixed = calculateBacktestMetrics(
    [makeTrade('WIN', 2), makeTrade('LOSS', -1)],
    10_000,
    '15m'
  );
  assert(mixed.profitFactor !== null && mixed.profitFactor > 0, 'A real profit factor is numeric');

  // ۲. کارمزد و اسلیپیج واقعاً بازده را کم می‌کنند
  const klines = makeKlines(
    Array.from({ length: 400 }, (_, i) => {
      const base = 100 + Math.sin(i / 9) * 6 + i * 0.05;
      return {
        open: base,
        high: base + 1.4,
        low: base - 1.4,
        close: base + Math.sin(i / 3) * 0.6,
        volume: 200 + ((i * 37) % 250),
      };
    }),
    '1h'
  );

  const free = runBacktest('BTCUSDT', '1h', klines, {
    minScore: 50,
    feePercent: 0,
    slippagePercent: 0,
  });
  const costed = runBacktest('BTCUSDT', '1h', klines, { minScore: 50 });

  assert(free.trades.length > 0, 'The fixture must generate trades');
  assert(
    costed.trades.length === free.trades.length,
    'Costs must not change which signals are taken, only their PnL'
  );
  assert(
    costed.overallMetrics.cumulativeReturnPercent < free.overallMetrics.cumulativeReturnPercent,
    `Fees/slippage must reduce returns (free ${free.overallMetrics.cumulativeReturnPercent}% vs costed ${costed.overallMetrics.cumulativeReturnPercent}%)`
  );

  // ۳. فرض‌های بک‌تست صریحاً مستند می‌شوند
  const assumptions = costed.assumptions.join(' ');
  assert(
    assumptions.includes(String(DEFAULT_FEE_PERCENT)) &&
      assumptions.includes(String(DEFAULT_SLIPPAGE_PERCENT)),
    'Assumptions must state the real fee and slippage numbers'
  );
  // هر چهار تصمیم مدل‌ساز باید صریحاً مستند شود، وگرنه کاربر نتایج را
  // «بازده واقعی» تفسیر می‌کند.
  assert(
    assumptions.includes('بازِ کندلِ *بعد از* صدور سیگنال'),
    'Assumptions must state that entry happens at the next candle open'
  );
  assert(
    assumptions.includes('یک‌سوم حجم'),
    'Assumptions must state the partial-exit rule'
  );
  assert(
    assumptions.includes('حد ضرر پیش از اهداف'),
    'Assumptions must state that the stop is evaluated before the targets'
  );
  assert(costed.assumptions.length >= 5, 'All modelling assumptions must be listed');

  // ۴. هر معامله‌ای که در پایان داده باز مانده، با END_OF_DATA بسته و *شمرده* می‌شود
  const shortRun = runBacktest('BTCUSDT', '1h', klines.slice(0, 120), { minScore: 50 });
  for (const t of shortRun.trades) {
    assert(
      Number.isFinite(t.pnlPercent) && Number.isFinite(t.rrRealized),
      'Every recorded trade must have finite PnL'
    );
  }

  console.log(
    `✓ Backtest costs passed (${free.trades.length} trades, ` +
      `free ${free.overallMetrics.cumulativeReturnPercent}% vs costed ${costed.overallMetrics.cumulativeReturnPercent}%).`
  );
}

function makeTrade(status: 'WIN' | 'LOSS', rr: number): BacktestTrade {
  return {
    id: `t_${status}_${rr}`,
    symbol: 'BTCUSDT',
    timeframe: '15m',
    direction: 'LONG',
    entryTime: Date.UTC(2026, 0, 10),
    entryPrice: 100,
    stopLoss: 99,
    tp1: 101,
    tp2: 102,
    tp3: 103,
    exitTime: Date.UTC(2026, 0, 10, 4),
    exitPrice: 100 + rr,
    exitReason: status === 'WIN' ? 'TP1' : 'STOP_LOSS',
    pnlPercent: rr,
    rrRealized: rr,
    status,
    score: 70,
    reasons: [],
    holdCandles: 4,
  };
}

// ────────────────────────────────────────────────────────────────────────────
export function testSimulatedDerivativesAreGated(): void {
  console.log('Testing that simulated derivatives cannot seed a derived verdict...');

  const sim = simulateDerivatives('BTCUSDT', Date.UTC(2026, 0, 10, 12, 0, 0));

  assert(sim.isSimulated === true, 'Simulated derivatives must be flagged');
  assert(
    Array.isArray(sim.missingFields) && sim.missingFields.length === 8,
    `Every simulated field must be listed in missingFields, got ${sim.missingFields?.length}`
  );
  assert(
    sim.missingFields?.includes('oiChange1hPercent') === true,
    'oiChange1hPercent must be declared missing when simulated'
  );
  assert(
    sim.fundingIntervalHours === null,
    'A simulated feed has no real settlement interval'
  );

  // چون missingFields پر است، غنی‌سازی نباید از OI ساختگی برچسب روند بسازد
  const rising = makeKlines(
    Array.from({ length: 40 }, (_, i) => ({
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100.9 + i,
    })),
    '15m'
  );
  const before = sim.oiTrend;
  const after = enrichDerivativesData(sim, rising, '15m');
  assert(
    after.oiTrend === before,
    `Enrichment must not override a simulated OI trend (${before} → ${after.oiTrend})`
  );

  // سالانه‌سازی فاندینگ روی بازهٔ پیش‌فرض مستند انجام می‌شود، نه ×۳ هاردکد
  assertClose(
    sim.fundingRateAnnualizedPercent,
    annualizeFundingRate(sim.fundingRate, DEFAULT_FUNDING_INTERVAL_HOURS)!,
    0.001,
    'Simulated funding annualisation must use the shared helper'
  );

  console.log(
    `✓ Simulated derivatives gating passed (${sim.missingFields?.length} fields declared missing, oiTrend untouched).`
  );
}

export function testScannerTierValidation(): void {
  console.log('Testing scanner tier validation...');

  assert(parseScannerTier(null) === 'top10', 'A missing tier defaults to top10');
  assert(parseScannerTier('top25') === 'top25', 'top25 is valid');
  assert(parseScannerTier('top50') === 'top50', 'top50 is valid');
  assert(SCANNER_TIER_COUNTS.top50 === 50, 'top50 maps to 50 symbols');

  // پیش‌تر هر مقدار ناشناخته بی‌صروصدا به top10 تبدیل می‌شد
  for (const bad of ['custom', 'top100', 'TOP25', '', 'all']) {
    assert(
      parseScannerTier(bad) === null,
      `Unknown tier '${bad}' must be rejected, not silently coerced to top10`
    );
  }

  console.log('✓ Scanner tier validation passed (unknown tiers are rejected, not coerced).');
}
