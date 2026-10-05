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
  TradeTargetSource,
} from '../types/market';
import { roundPrice } from '../lib/format';
import { faLabel, FA_LEVEL_TYPE } from '../lib/i18n';
import { TIMEFRAME_MS } from '../lib/timeframes';

export const DEFAULT_WEIGHTS: SignalWeights = {
  liquidity: 0.2,
  marketStructure: 0.2,
  multiTimeframe: 0.2,
  sessionLiquidity: 0.1,
  volume: 0.1,
  derivatives: 0.1,
  advancedLayer3: 0.1,
};

/** حداقل امتیاز لازم برای معتبر دانستن یک ستاپ جهت‌دار */
export const MIN_SIGNAL_SCORE = 50;
/** حداکثر ریسک قابل قبول (درصد فاصلهٔ حد ضرر از قیمت ورود) */
const MAX_RISK_PERCENT = 8;
/** حداقل فاصلهٔ هدف اول از ورود بر حسب ضریب ریسک */
const MIN_TP1_R_MULTIPLE = 1.2;

/** نرمال‌سازی وزن‌ها تا جمعشان ۱ شود (از صفر شدن تصادفی امتیاز جلوگیری می‌کند) */
function normalizeWeights(weights: SignalWeights): SignalWeights {
  const raw: SignalWeights = { ...weights };
  const keys = Object.keys(raw) as (keyof SignalWeights)[];
  for (const key of keys) {
    if (!isFinite(raw[key]) || raw[key] < 0) raw[key] = 0;
  }
  const sum = keys.reduce((acc, key) => acc + raw[key], 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  const normalized = {} as SignalWeights;
  for (const key of keys) normalized[key] = raw[key] / sum;
  return normalized;
}

/** نگاشت نوع سطح نقدینگی به منبع هدف معاملاتی */
const LEVEL_TO_TARGET_SOURCE: Record<LiquidityLevel['type'], TradeTargetSource> = {
  SWING_HIGH: 'SWING_HIGH',
  SWING_LOW: 'SWING_LOW',
  EQUAL_HIGH: 'EQUAL_HIGH',
  EQUAL_LOW: 'EQUAL_LOW',
  PREVIOUS_DAY_HIGH: 'PREVIOUS_DAY_HIGH',
  PREVIOUS_DAY_LOW: 'PREVIOUS_DAY_LOW',
  PREVIOUS_WEEK_HIGH: 'PREVIOUS_DAY_HIGH',
  PREVIOUS_WEEK_LOW: 'PREVIOUS_DAY_LOW',
  SESSION_HIGH: 'SESSION_HIGH',
  SESSION_LOW: 'SESSION_LOW',
  LOCAL_HIGH: 'SWING_HIGH',
  LOCAL_LOW: 'SWING_LOW',
};

interface TargetCandidate {
  price: number;
  source: TradeTargetSource;
}

/**
 * ساخت «نردبان اهداف» از نقشهٔ واقعی نقدینگی (Draw on Liquidity):
 * سقف‌های نقدینگی، EQH/EQL، PDH/PDL، PWH/PWL، سطوح جلسات و مرزهای پروفایل حجم.
 * پیش‌تر اهداف تنها ضرایب ثابت ۱.۵/۲.۵/۴ برابر ریسک بودند و به ساختار بازار
 * هیچ ارتباطی نداشتند.
 */
function buildTargetLadder(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  risk: number;
  liquidityLevels: LiquidityLevel[];
  sessionLevels: LiquidityLevel[];
  volume: VolumeMetrics;
}): { tp1: number; tp2: number; tp3: number; sources: TradePlan['targetSources'] } {
  const { direction, entry, risk, liquidityLevels, sessionLevels, volume } = params;

  const candidates: TargetCandidate[] = [];
  const availableLevels = [...(liquidityLevels || []), ...(sessionLevels || [])];

  if (direction === 'LONG') {
    for (const level of availableLevels) {
      if (level.price > entry * 1.001) {
        candidates.push({ price: level.price, source: LEVEL_TO_TARGET_SOURCE[level.type] });
      }
    }
    const profile = volume.volumeProfile;
    if (profile) {
      if (profile.vah > entry * 1.001) candidates.push({ price: profile.vah, source: 'VOLUME_PROFILE_VAH' });
      if (profile.poc > entry * 1.001) candidates.push({ price: profile.poc, source: 'VOLUME_PROFILE_POC' });
    }
  } else {
    for (const level of availableLevels) {
      if (level.price < entry * 0.999) {
        candidates.push({ price: level.price, source: LEVEL_TO_TARGET_SOURCE[level.type] });
      }
    }
    const profile = volume.volumeProfile;
    if (profile) {
      if (profile.val < entry * 0.999) candidates.push({ price: profile.val, source: 'VOLUME_PROFILE_VAL' });
      if (profile.poc < entry * 0.999) candidates.push({ price: profile.poc, source: 'VOLUME_PROFILE_POC' });
    }
  }

  // مرتب‌سازی از نزدیک‌ترین به دورترین + حذف اهداف هم‌مکان
  candidates.sort((a, b) => (direction === 'LONG' ? a.price - b.price : b.price - a.price));
  const unique: TargetCandidate[] = [];
  for (const candidate of candidates) {
    const isDuplicate = unique.some(
      (u) => Math.abs(u.price - candidate.price) / Math.max(candidate.price, 1e-9) < 0.0015
    );
    if (!isDuplicate) unique.push(candidate);
  }

  const picks: { price: number; source: TradeTargetSource }[] = [];
  let cursor = direction === 'LONG' ? entry + risk * MIN_TP1_R_MULTIPLE : entry - risk * MIN_TP1_R_MULTIPLE;

  for (let i = 0; i < 3; i++) {
    const found = unique.find((c) =>
      direction === 'LONG' ? c.price >= cursor * 1.0005 : c.price <= cursor * 0.9995
    );

    if (found) {
      picks.push({ price: found.price, source: found.source });
      cursor = direction === 'LONG' ? found.price * 1.004 : found.price * 0.996;
    } else {
      // در نبود سطح نقدینگی معتبر، هدف پشتیبان «بیرون از آخرین هدف» ساخته می‌شود
      // تا نردبان اهداف همیشه صعودی/نزولی بماند.
      // (نسخهٔ نخست این پشتیبان را با ضریب ثابت از قیمت ورود می‌ساخت و هدف سوم
      //  می‌توانست به سمت اشتباه نردبان بیفتد.)
      const anchor = picks.length > 0 ? picks[picks.length - 1].price : entry;
      const step = Math.max(
        risk * (picks.length === 0 ? MIN_TP1_R_MULTIPLE : 0.9),
        Math.abs(anchor - entry) * 0.1
      );
      const desired = direction === 'LONG' ? anchor + step : anchor - step;
      // هدف پشتیبان هرگز نباید از آستانهٔ جست‌وجو (cursor) عقب‌تر باشد
      const price = direction === 'LONG' ? Math.max(desired, cursor) : Math.min(desired, cursor);
      picks.push({ price, source: 'R_MULTIPLE' });
      cursor = direction === 'LONG' ? price * 1.004 : price * 0.996;
    }
  }

  // تضمین یکنواختی نردبان: TP1 < TP2 < TP3 برای لانگ و TP1 > TP2 > TP3 برای شورت
  for (let i = 1; i < picks.length; i++) {
    const previous = picks[i - 1].price;
    const current = picks[i].price;
    const minimumStep = Math.max(risk * 0.5, previous * 0.001);
    if (direction === 'LONG' ? current <= previous : current >= previous) {
      picks[i] = {
        price: direction === 'LONG' ? previous + minimumStep : previous - minimumStep,
        source: picks[i].source === 'R_MULTIPLE' ? 'R_MULTIPLE' : picks[i].source,
      };
    }
  }

  return {
    tp1: roundPrice(picks[0].price),
    tp2: roundPrice(picks[1].price),
    tp3: roundPrice(picks[2].price),
    sources: {
      tp1: picks[0].source,
      tp2: picks[1].source,
      tp3: picks[2].source,
    },
  };
}

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
    // مقادیر پیش‌فرض تدافعی: فراخوانی ناقص نباید کل تحلیل را با استثنا متوقف کند
    liquidityLevels = [],
    sweeps = [],
    structure,
    sessions,
    volume,
    derivatives,
    mtf,
    regime,
    layer3,
  } = params;

  const w = normalizeWeights({ ...DEFAULT_WEIGHTS, ...(params.weights || {}) });
  const lastKline = klines[klines.length - 1];
  const currentPrice = lastKline?.close || 0;
  const dataTimestamp = lastKline?.timestamp || Date.now();
  const analysisTimestamp = Date.now();

  // تشخیص کهنگی داده: معیار، زمانِ انتظار برای بسته‌شدن آخرین کندل است (نه زمان باز شدن آن).
  const expectedCloseTime = lastKline
    ? lastKline.closeTime || lastKline.timestamp + TIMEFRAME_MS[timeframe]
    : Date.now();
  const isStale = Date.now() - expectedCloseTime > 180_000;

  const longReasons: string[] = [];
  const shortReasons: string[] = [];
  const warnings: string[] = [];

  // ۱. امتیاز اجزای تحلیل
  // A. نقدینگی
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

  // B. ساختار بازار
  let msScore = 40;
  if (structure.trend !== 'RANGING') msScore += 20;
  if (structure.recentMSS) msScore += 25;
  if (structure.recentBOS) msScore += 15;
  if (structure.displacementDetected) msScore += 15;
  msScore = Math.min(100, msScore);

  // C. هم‌راستایی چندتایم‌فریم
  const mtfScore = mtf.alignmentScore;

  // D. نقدینگی جلسات
  let sessScore = 50;
  if (sessions.judasSwingDetected) sessScore += 30;
  if (sessions.nyReversalDetected) sessScore += 30;
  if (sessions.sessions.asian.highSwept || sessions.sessions.asian.lowSwept) sessScore += 15;
  sessScore = Math.min(100, sessScore);

  // E. حجم
  let volScore = 50;
  if (volume.state === 'EXPANSION') volScore += 25;
  if (volume.isSpike) volScore += 20;
  if (Math.abs(volume.imbalance) > 15) volScore += 15;
  volScore = Math.min(100, volScore);

  // F. مشتقات
  let derivScore = 50;
  if (derivatives.oiTrend === 'LONG_BUILDUP' || derivatives.oiTrend === 'SHORT_BUILDUP') derivScore += 25;
  if (derivatives.fundingCategory === 'EXTREME_NEGATIVE' || derivatives.fundingCategory === 'EXTREME_POSITIVE') {
    derivScore += 20;
  }
  if (derivatives.positioning === 'EXTREME_SHORT' || derivatives.positioning === 'EXTREME_LONG') derivScore += 15;
  derivScore = Math.min(100, derivScore);

  // اگر دادهٔ مشتقات از موتور شبیه‌سازی آمده باشد (نبود شبکه/API آتی)، نباید در
  // امتیاز اثر بگذارد؛ وگرنه روند OIِ ساختگی می‌تواند «اطمینان کاذب» بسازد.
  // در این حالت مؤلفه خنثی (۵۰) گزارش و وزنش میان سایر مؤلفه‌ها بازتوزیع می‌شود.
  const derivativesLive = derivatives.isSimulated !== true;
  const derivativesComponent = derivativesLive ? derivScore : 50;
  const otherWeightTotal =
    w.liquidity + w.marketStructure + w.multiTimeframe + w.sessionLiquidity + w.volume + w.advancedLayer3;
  const weightScale =
    !derivativesLive && otherWeightTotal > 0 ? (otherWeightTotal + w.derivatives) / otherWeightTotal : 1;
  const others = (weight: number) => (derivativesLive ? weight : weight * weightScale);

  const components: SignalComponents = {
    liquidity: liqScore,
    marketStructure: msScore,
    multiTimeframe: mtfScore,
    sessionLiquidity: sessScore,
    volume: volScore,
    derivatives: derivativesComponent,
    advancedLayer3: layer3.totalLayer3Score,
  };

  const rawScore =
    components.liquidity * others(w.liquidity) +
    components.marketStructure * others(w.marketStructure) +
    components.multiTimeframe * others(w.multiTimeframe) +
    components.sessionLiquidity * others(w.sessionLiquidity) +
    components.volume * others(w.volume) +
    components.derivatives * (derivativesLive ? w.derivatives : 0) +
    components.advancedLayer3 * others(w.advancedLayer3);

  const contextScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // ۲. تعیین جهت بر پایهٔ هم‌افزایی محرک‌ها
  let direction: SignalDirection = 'NO_SIGNAL';
  let longConfluence = 0;
  let shortConfluence = 0;

  if (sslSweep) {
    longConfluence += 35;
    longReasons.push(
      `سوئیپ نقدینگی سمت فروش روی ${faLabel(FA_LEVEL_TYPE, sslSweep.levelType)} در قیمت $${roundPrice(sslSweep.levelPrice)} انجام شد`
    );
  }
  if (structure.recentMSS?.direction === 'BULLISH') {
    longConfluence += 30;
    longReasons.push('تغییر ساختار بازار صعودی (MSS/CHoCH) به‌تازگی تأیید شد');
  } else if (structure.trend === 'BULLISH') {
    longConfluence += 15;
    longReasons.push('ساختار روند صعودی تثبیت‌شده (سقف‌ها و کف‌های بالاتر)');
  }
  if (mtf.htfTrend === 'BULLISH') {
    longConfluence += 25;
    longReasons.push('هم‌راستایی صعودی در تایم‌فریم‌های بالای 1D/4H/1H');
  }
  if (structure.displacementDetected) {
    longConfluence += 15;
    longReasons.push('حرکت قدرتمند با مومنتوم بالا (دیسپلیسمنت) شناسایی شد');
  }
  if (volume.state === 'EXPANSION' || volume.imbalance > 10) {
    longConfluence += 15;
    longReasons.push(`چیرگی حجم خریداران (عدم تعادل تیکر +${volume.imbalance}%)`);
  }
  if (derivatives.oiTrend === 'LONG_BUILDUP') {
    longConfluence += 15;
    longReasons.push('افزایش قراردادهای باز همراه با قیمت (انباشت تهاجمی لانگ)');
  } else if (derivatives.fundingCategory === 'NEGATIVE' || derivatives.fundingCategory === 'EXTREME_NEGATIVE') {
    longConfluence += 20;
    longReasons.push(
      `فاندینگ ریت منفی (${(derivatives.fundingRate * 100).toFixed(4)}%) پتانسیل شورت اسکوئیز ایجاد می‌کند`
    );
  }
  if (sessions.judasSwingDetected && sessions.sessions.asian.lowSwept) {
    longConfluence += 20;
    longReasons.push('سوئینگ جوداس لندن، نقدینگی کف جلسهٔ آسیا را سوئیپ کرد');
  }

  if (bslSweep) {
    shortConfluence += 35;
    shortReasons.push(
      `سوئیپ نقدینگی سمت خرید روی ${faLabel(FA_LEVEL_TYPE, bslSweep.levelType)} در قیمت $${roundPrice(bslSweep.levelPrice)} انجام شد`
    );
  }
  if (structure.recentMSS?.direction === 'BEARISH') {
    shortConfluence += 30;
    shortReasons.push('تغییر ساختار بازار نزولی (MSS/CHoCH) به‌تازگی تأیید شد');
  } else if (structure.trend === 'BEARISH') {
    shortConfluence += 15;
    shortReasons.push('ساختار روند نزولی تثبیت‌شده (کف‌ها و سقف‌های پایین‌تر)');
  }
  if (mtf.htfTrend === 'BEARISH') {
    shortConfluence += 25;
    shortReasons.push('هم‌راستایی نزولی در تایم‌فریم‌های بالای 1D/4H/1H');
  }
  if (structure.displacementDetected && structure.recentMSS?.direction === 'BEARISH') {
    shortConfluence += 15;
    shortReasons.push('دیسپلیسمنت نزولی، فشار فروش را تأیید می‌کند');
  }
  if (volume.imbalance < -10) {
    shortConfluence += 15;
    shortReasons.push(`چیرگی حجم فروشندگان (عدم تعادل تیکر ${volume.imbalance}%)`);
  }
  if (derivatives.oiTrend === 'SHORT_BUILDUP') {
    shortConfluence += 15;
    shortReasons.push('افزایش قراردادهای باز در ریزش‌ها (انباشت تهاجمی شورت)');
  } else if (derivatives.fundingCategory === 'EXTREME_POSITIVE') {
    shortConfluence += 20;
    shortReasons.push('فاندینگ ریت مثبتِ افراطی، نشان‌دهندهٔ اشباع موقعیت‌های لانگ است');
  }
  if (sessions.judasSwingDetected && sessions.sessions.asian.highSwept) {
    shortConfluence += 20;
    shortReasons.push('سوئینگ جوداس لندن، نقدینگی سقف جلسهٔ آسیا را سوئیپ کرد');
  }

  if (longConfluence >= 55 && longConfluence > shortConfluence + 15) {
    direction = 'LONG';
  } else if (shortConfluence >= 55 && shortConfluence > longConfluence + 15) {
    direction = 'SHORT';
  }

  // امتیاز نهایی: در نبود ستاپ جهت‌دار، امتیاز «اطمینان» نباید بالا نمایش داده شود؛
  // کیفیت زمینهٔ بازار جداگانه در contextScore گزارش می‌شود.
  // (پیش‌تر ردیف‌هایی با جهت NO_SIGNAL اما امتیاز ۸۱ در جدول دیده می‌شد.)
  // (ترتیب نسبی داخل ردیف‌های بدون ستاپ حفظ می‌شود تا شدت هم‌افزایی هم دیده شود.)
  const score =
    direction === 'NO_SIGNAL'
      ? Math.min(MIN_SIGNAL_SCORE - 1, Math.round(contextScore * 0.6))
      : contextScore;

  // دروازهٔ کیفیت: ستاپ جهت‌دار با امتیاز پایین «سیگنال» نیست.
  // پیش‌تر می‌شد سیگنالی با طبقه‌بندی NO_SIGNAL اما به‌همراه برنامهٔ معاملهٔ کامل دریافت کرد.
  if (direction !== 'NO_SIGNAL' && score < MIN_SIGNAL_SCORE) {
    warnings.push(
      `هم‌افزایی جهت‌دار شناسایی شد اما امتیاز کیفیت (${score}) کمتر از آستانهٔ ${MIN_SIGNAL_SCORE} است؛ ستاپ معتبر تلقی نشد.`
    );
    direction = 'NO_SIGNAL';
  }

  const reasons: string[] =
    direction === 'LONG'
      ? longReasons
      : direction === 'SHORT'
      ? shortReasons
      : longConfluence >= 55 || shortConfluence >= 55
      ? ['محرک‌های جهت‌دار متقابل یکدیگر را خنثی کرده‌اند؛ چیدمان پرنوسان و بی‌سوگیری است']
      : ['هیچ محرک جهت‌داری با هم‌افزایی کافی فعال نیست'];

  // ۳. هشدارهای ریسک
  if (derivatives.fundingCategory === 'EXTREME_POSITIVE' && direction === 'LONG') {
    warnings.push('فاندینگ ریت مثبتِ بالا: نگهداری لانگ هزینهٔ فاندینگ سنگینی دارد');
  }
  if (derivatives.positioning === 'EXTREME_LONG' && direction === 'LONG') {
    warnings.push('موقعیت‌های لانگ معامله‌گران خُرد به‌شدت اشباع شده است');
  }
  if (regime.regime === 'HIGH_VOLATILITY') {
    warnings.push('رژیم نوسان بالا: حد ضرر وسیع‌تری لازم است');
  }
  if (regime.regime === 'CONTRACTION' && direction !== 'NO_SIGNAL') {
    warnings.push('بازار در فشردگی است؛ احتمال شکست جعلی پیش از حرکت اصلی بالاست');
  }
  if (derivatives.isSimulated) {
    warnings.push('دادهٔ مشتقات (OI/فاندینگ) در دسترس نبود و از موتور شبیه‌سازی قطعی آمده است');
  }
  if (isStale) {
    warnings.push('جریان داده دارای تأخیر است؛ پیش از اقدام، قیمت را راستی‌آزمایی کنید');
  }

  // ۴. طبقه‌بندی
  let classification: SignalClassification = 'NO_SIGNAL';
  if (direction === 'NO_SIGNAL' || score < MIN_SIGNAL_SCORE) {
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

  // ۵. برنامهٔ معاملاتی
  let tradePlan: TradePlan | null = null;
  const atr = regime.atr > 0 ? regime.atr : currentPrice * 0.004;

  if (direction !== 'NO_SIGNAL' && currentPrice > 0) {
    const isLong = direction === 'LONG';
    const activeFVG = structure.fvgs.find((f) => f.direction === (isLong ? 'BULLISH' : 'BEARISH') && !f.filled);
    const activeOB = structure.orderBlocks.find(
      (o) => o.direction === (isLong ? 'BULLISH' : 'BEARISH') && !o.mitigated
    );

    let entryMin = isLong ? currentPrice * 0.996 : currentPrice * 0.998;
    let entryMax = isLong ? currentPrice * 1.002 : currentPrice * 1.004;
    let entryOptimal = currentPrice;
    let entryType: TradePlan['entry']['type'] = 'LIQUIDITY_RECLAIM';

    if (isLong && activeFVG && activeFVG.bottom < currentPrice) {
      entryMin = activeFVG.bottom;
      entryMax = Math.min(currentPrice, activeFVG.top);
      entryOptimal = activeFVG.midpoint;
      entryType = 'FVG';
    } else if (isLong && activeOB && activeOB.bottom < currentPrice) {
      entryMin = activeOB.bottom;
      entryMax = Math.min(currentPrice, activeOB.top);
      entryOptimal = (activeOB.top + activeOB.bottom) / 2;
      entryType = 'ORDER_BLOCK';
    } else if (!isLong && activeFVG && activeFVG.top > currentPrice) {
      entryMin = Math.max(currentPrice, activeFVG.bottom);
      entryMax = activeFVG.top;
      entryOptimal = activeFVG.midpoint;
      entryType = 'FVG';
    } else if (!isLong && activeOB && activeOB.top > currentPrice) {
      entryMin = Math.max(currentPrice, activeOB.bottom);
      entryMax = activeOB.top;
      entryOptimal = (activeOB.top + activeOB.bottom) / 2;
      entryType = 'ORDER_BLOCK';
    }

    // نقطهٔ ابطال ساختاری: اگر سوئیپ تازه رخ داده باشد، اکستریم همان سوئیپ معتبرترین
    // حد ضرر است؛ در غیر این صورت آخرین کف/سقف نوسانی تأییدشده.
    // (نسخهٔ قبلی کمینه/بیشینهٔ «دو کف آخر» را می‌گرفت که می‌توانست حد ضرر را
    //  بی‌دلیل به یک کف دورافتاده و قدیمی بچسباند.)
    const lastSwingLow = structure.swingLows[structure.swingLows.length - 1]?.price;
    const lastSwingHigh = structure.swingHighs[structure.swingHighs.length - 1]?.price;
    const structuralAnchor = isLong
      ? sslSweep?.sweepExtremePrice ?? lastSwingLow ?? currentPrice * 0.992
      : bslSweep?.sweepExtremePrice ?? lastSwingHigh ?? currentPrice * 1.008;

    // حد ضرر = ساختار + نوسان:
    //   • فاصلهٔ حداقل ۱.۲ برابر ATR از ورود (تا نویز معمول بازار باعث استاپ نشود)
    //   • و یک بافر کوچک (۰.۳۵ ATR) فراتر از سطح ساختاری
    const atrStopDistance = Math.max(atr * 1.2, currentPrice * 0.005);
    let stopLoss: number;
    let stopLossBasis: TradePlan['stopLossBasis'];

    if (isLong) {
      const structuralStop = structuralAnchor - atr * 0.35;
      stopLoss = Math.min(structuralStop, currentPrice - atrStopDistance * 0.35);
      stopLossBasis = sslSweep ? 'SWEEP_EXTREME' : lastSwingLow ? 'STRUCTURE' : 'ATR';
    } else {
      const structuralStop = structuralAnchor + atr * 0.35;
      stopLoss = Math.max(structuralStop, currentPrice + atrStopDistance * 0.35);
      stopLossBasis = bslSweep ? 'SWEEP_EXTREME' : lastSwingHigh ? 'STRUCTURE' : 'ATR';
    }

    stopLoss = roundPrice(stopLoss);
    let stopLossPercent = parseFloat((((isLong ? currentPrice - stopLoss : stopLoss - currentPrice) / currentPrice) * 100).toFixed(2));

    // اندازهٔ ریسک نباید بی‌معنا کوچک یا بیش از حد بزرگ باشد
    if (stopLossPercent < 0.2) {
      stopLoss = roundPrice(isLong ? currentPrice - atrStopDistance : currentPrice + atrStopDistance);
      stopLossPercent = parseFloat((((isLong ? currentPrice - stopLoss : stopLoss - currentPrice) / currentPrice) * 100).toFixed(2));
      stopLossBasis = 'ATR';
    }

    if (stopLossPercent > MAX_RISK_PERCENT) {
      warnings.push(
        `فاصلهٔ حد ضرر ساختاری (${stopLossPercent}٪) از سقف ریسک مجاز (${MAX_RISK_PERCENT}٪) بیشتر است؛ برنامهٔ معامله صادر نشد.`
      );
    } else if (stopLoss > 0) {
      const risk = isLong ? currentPrice - stopLoss : stopLoss - currentPrice;
      const ladder = buildTargetLadder({
        direction: isLong ? 'LONG' : 'SHORT',
        entry: currentPrice,
        risk,
        liquidityLevels,
        sessionLevels: sessions.keyLevels,
        volume,
      });

      const pct = (target: number) =>
        parseFloat((((isLong ? target - currentPrice : currentPrice - target) / currentPrice) * 100).toFixed(2));

      const rrRatio = risk > 0 ? parseFloat(((isLong ? ladder.tp1 - currentPrice : currentPrice - ladder.tp1) / risk).toFixed(2)) : 0;

      tradePlan = {
        entry: {
          min: roundPrice(entryMin),
          max: roundPrice(entryMax),
          optimal: roundPrice(entryOptimal),
          type: entryType,
        },
        stopLoss,
        stopLossPercent,
        invalidationReason: isLong
          ? `بسته‌شدن کندل زیر کف ساختاری $${roundPrice(stopLoss)}`
          : `بسته‌شدن کندل بالای سقف ساختاری $${roundPrice(stopLoss)}`,
        tp1: ladder.tp1,
        tp1Percent: pct(ladder.tp1),
        tp2: ladder.tp2,
        tp2Percent: pct(ladder.tp2),
        tp3: ladder.tp3,
        tp3Percent: pct(ladder.tp3),
        rrRatio: rrRatio > 0 ? rrRatio : 1.5,
        riskLevel: stopLossPercent < 1.5 ? 'LOW' : stopLossPercent < 3.0 ? 'MEDIUM' : 'HIGH',
        targetSources: ladder.sources,
        atrPercent: regime.atrPercent,
        stopLossBasis,
      };
    }
  }

  if (tradePlan) {
    // دلایل و آرایهٔ reasons هم‌مرجع هستند، بنابراین این توضیح در خروجی دیده می‌شود
    const sourceLabel = (source: TradeTargetSource): string =>
      source === 'R_MULTIPLE'
        ? 'ضریب ریسک استاندارد'
        : source.startsWith('VOLUME_PROFILE')
        ? 'پروفایل حجم'
        : faLabel(FA_LEVEL_TYPE, source);
    const directionalReasons = direction === 'LONG' ? longReasons : shortReasons;
    directionalReasons.push(
      `اهداف سود از نقشهٔ نقدینگی استخراج شد (هدف اول روی ${sourceLabel(
        tradePlan.targetSources?.tp1 || 'R_MULTIPLE'
      )})`
    );
  }

  const invalidation = tradePlan?.invalidationReason || 'بی‌اعتباری ساختار بازار با شکست سطح کلیدی';

  return {
    symbol,
    timeframe,
    direction,
    score,
    contextScore,
    classification,
    currentPrice,
    tradePlan,
    reasons,
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
