import { Signal, MarketRegime, LiquidityLevel } from '../src/types/market';
import {
  updateSignalLifecycle,
  pruneLifecycle,
  lifecycleStateLabel,
  formatLifecycleAge,
  LIFECYCLE_MAX_ENTRIES,
  PERSISTENT_SCAN_THRESHOLD,
} from '../src/lib/signal-lifecycle';
import {
  computeMarketPulse,
  describeMarketPulse,
  biasLabel,
  trendStrengthLabel,
  volatilityLabel,
} from '../src/lib/market-pulse';
import { selectLiquidityMagnets, computeLiquidityDraw } from '../src/lib/liquidity-magnets';

/** ساخت سیگنال حداقلی برای آزمون توابع خالص (فقط فیلدهای مورد استفاده) */
function makeSignal(spec: {
  symbol: string;
  direction: Signal['direction'];
  score: number;
  adx?: number;
  atrPercent?: number;
  regime?: MarketRegime['regime'];
}): Signal {
  return {
    symbol: spec.symbol,
    timeframe: '15m',
    direction: spec.direction,
    score: spec.score,
    classification: spec.score >= 75 ? 'STRONG' : spec.score >= 50 ? 'MODERATE' : 'NO_SIGNAL',
    currentPrice: 100,
    tradePlan: null,
    reasons: [],
    warnings: [],
    invalidation: '',
    marketRegime: {
      regime: spec.regime ?? 'RANGING',
      atr: 1,
      atrPercent: spec.atrPercent ?? 0.5,
      adx: spec.adx ?? 15,
      bbWidth: 1,
      description: '',
    },
    dataTimestamp: 0,
    analysisTimestamp: 0,
    isStale: false,
  } as unknown as Signal;
}

function makeLevel(price: number, strength: number, swept = false): LiquidityLevel {
  return {
    price,
    type: price >= 100 ? 'SWING_HIGH' : 'SWING_LOW',
    strength,
    swept,
    distancePercent: 0,
    timestamp: 0,
  };
}

/** آزمون ردیاب چرخهٔ عمر سیگنال (تازه / پایدار / برگشتی / بازگشتی) */
export function testSignalLifecycle() {
  console.log('Testing signal lifecycle tracker...');

  const t0 = 1_700_000_000_000;
  const minute = 60_000;

  // اسکن ۱: یک ستاپ لانگ تازه
  let map = updateSignalLifecycle({}, [makeSignal({ symbol: 'BTCUSDT', direction: 'LONG', score: 80 })], t0);
  if (map.BTCUSDT.state !== 'NEW' || map.BTCUSDT.scans !== 1 || map.BTCUSDT.firstSeen !== t0) {
    throw new Error('First appearance must be a fresh setup with scans=1');
  }

  // اسکن ۲: همان جهت با امتیاز بالاتر
  map = updateSignalLifecycle(
    map,
    [makeSignal({ symbol: 'BTCUSDT', direction: 'LONG', score: 83 })],
    t0 + minute
  );
  if (map.BTCUSDT.state !== 'NEW' || map.BTCUSDT.scans !== 2 || map.BTCUSDT.scoreDelta !== 3) {
    throw new Error('Second identical scan must keep state NEW with scans=2 and a positive score delta');
  }

  // اسکن ۳: به آستانهٔ پایداری می‌رسد
  map = updateSignalLifecycle(
    map,
    [makeSignal({ symbol: 'BTCUSDT', direction: 'LONG', score: 82 })],
    t0 + 2 * minute
  );
  if (map.BTCUSDT.state !== 'PERSISTENT' || map.BTCUSDT.scans !== PERSISTENT_SCAN_THRESHOLD) {
    throw new Error('Setup must become PERSISTENT after the configured number of consecutive scans');
  }
  if (map.BTCUSDT.peakScore !== 83) {
    throw new Error('Peak score must be remembered across scans');
  }

  // اسکن ۴: برگشت جهت
  map = updateSignalLifecycle(
    map,
    [makeSignal({ symbol: 'BTCUSDT', direction: 'SHORT', score: 70 })],
    t0 + 3 * minute
  );
  if (map.BTCUSDT.state !== 'FLIPPED' || map.BTCUSDT.previousDirection !== 'LONG' || map.BTCUSDT.flips !== 1) {
    throw new Error('Direction reversal must be reported as FLIPPED with the previous direction kept');
  }

  // اسکن ۵: ستاپ از جدول خارج می‌شود (وقفه)
  map = updateSignalLifecycle(map, [], t0 + 4 * minute);
  if (map.BTCUSDT.active !== false) {
    throw new Error('A symbol without a directional setup must be marked inactive, not deleted');
  }

  // اسکن ۶: بازگشت ستاپ
  map = updateSignalLifecycle(
    map,
    [makeSignal({ symbol: 'BTCUSDT', direction: 'SHORT', score: 74 })],
    t0 + 5 * minute
  );
  if (map.BTCUSDT.state !== 'RESUMED' || map.BTCUSDT.scans !== 1) {
    throw new Error('A setup returning after a gap must be reported as RESUMED with the run reset');
  }

  // برچسب‌ها و سن
  if (!lifecycleStateLabel(map.BTCUSDT).includes('بازگشت')) {
    throw new Error('Persian state label for RESUMED is missing');
  }
  if (formatLifecycleAge(90_000) !== '۱ دقیقه' || formatLifecycleAge(4 * 60 * minute) !== '۴ ساعت') {
    throw new Error(`Lifecycle age formatting is wrong: ${formatLifecycleAge(90_000)} / ${formatLifecycleAge(4 * 60 * minute)}`);
  }

  // سقف حافظهٔ ردیاب
  const crowded: Record<string, ReturnType<typeof updateSignalLifecycle>[string]> = {};
  for (let i = 0; i < LIFECYCLE_MAX_ENTRIES + 30; i++) {
    crowded[`SYM${i}`] = {
      direction: 'LONG',
      state: 'NEW',
      firstSeen: t0,
      lastSeen: t0 + i,
      scans: 1,
      flips: 0,
      lastScore: 60,
      scoreDelta: 0,
      active: true,
      peakScore: 60,
    };
  }
  const pruned = pruneLifecycle(crowded);
  if (Object.keys(pruned).length !== LIFECYCLE_MAX_ENTRIES) {
    throw new Error(`Lifecycle map must be capped at ${LIFECYCLE_MAX_ENTRIES} entries`);
  }
  if (!pruned[`SYM${LIFECYCLE_MAX_ENTRIES + 29}`]) {
    throw new Error('Pruning must keep the most recently seen symbols');
  }

  console.log('✓ Signal lifecycle passed (new → persistent → flipped → resumed, memory capped).');
}

/** آزمون نبض کلان بازار (سوگیری وزنی، قدرت روند، نوسان نسبی و پوشش) */
export function testMarketPulse() {
  console.log('Testing market breadth pulse...');

  const signals = [
    makeSignal({ symbol: 'A', direction: 'LONG', score: 80, adx: 34, atrPercent: 0.4, regime: 'TRENDING_BULLISH' }),
    makeSignal({ symbol: 'B', direction: 'LONG', score: 70, adx: 26, atrPercent: 0.5, regime: 'TRENDING_BULLISH' }),
    makeSignal({ symbol: 'C', direction: 'SHORT', score: 50, adx: 30, atrPercent: 1.4, regime: 'TRENDING_BEARISH' }),
    makeSignal({ symbol: 'D', direction: 'NO_SIGNAL', score: 40, adx: 12, atrPercent: 0.5, regime: 'RANGING' }),
  ];

  const pulse = computeMarketPulse(signals);
  if (pulse.directional !== 3 || pulse.scanned !== 4) {
    throw new Error(`Directional/scanned counts are wrong: ${pulse.directional}/${pulse.scanned}`);
  }
  if (pulse.riskOnPercent !== 75 || pulse.bias !== 'BULLISH') {
    throw new Error(`Weighted breadth must be 75% bullish, got ${pulse.riskOnPercent} (${pulse.bias})`);
  }
  if (pulse.avgAdx !== 25.5 || pulse.trendStrength !== 'MODERATE') {
    throw new Error(`Average ADX aggregation is wrong: ${pulse.avgAdx} (${pulse.trendStrength})`);
  }
  if (pulse.medianAtrPercent !== 0.5 || pulse.volatility !== 'NORMAL') {
    throw new Error(`Median ATR / volatility state is wrong: ${pulse.medianAtrPercent} (${pulse.volatility})`);
  }
  if (pulse.coveragePercent !== 75) {
    throw new Error(`Coverage must be 75%, got ${pulse.coveragePercent}`);
  }
  if (pulse.dominantRegime !== 'TRENDING_BULLISH') {
    throw new Error(`Dominant regime must be the most frequent one, got ${pulse.dominantRegime}`);
  }

  // بازار با ستاپ جهت‌دار نداشته باشد
  const empty = computeMarketPulse([makeSignal({ symbol: 'X', direction: 'NO_SIGNAL', score: 45 })]);
  if (empty.riskOnPercent !== null || empty.bias !== 'NEUTRAL' || empty.directional !== 0) {
    throw new Error('A scan without directional setups must report a neutral, undefined breadth');
  }
  if (!describeMarketPulse(empty).includes('هیچ ستاپ جهت‌داری')) {
    throw new Error('Persian description for an empty scan is missing');
  }

  // نوسان غیرعادی: بیش از یک‌سوم نمادها دست‌کم ۱.۵ برابر میانه
  const volatile = computeMarketPulse([
    makeSignal({ symbol: 'A', direction: 'LONG', score: 60, atrPercent: 0.4 }),
    makeSignal({ symbol: 'B', direction: 'LONG', score: 60, atrPercent: 0.4 }),
    makeSignal({ symbol: 'C', direction: 'SHORT', score: 60, atrPercent: 1.2 }),
    makeSignal({ symbol: 'D', direction: 'NO_SIGNAL', score: 40, atrPercent: 1.2 }),
  ]);
  if (volatile.volatility !== 'ELEVATED' || volatile.elevatedVolShare < 0.5) {
    throw new Error(`Relative volatility detection failed: ${volatile.volatility} (${volatile.elevatedVolShare})`);
  }

  if (biasLabel('BEARISH') !== 'سوگیری نزولی' || trendStrengthLabel('WEAK') !== 'بدون روند (رِنج)') {
    throw new Error('Persian pulse labels are missing');
  }
  if (volatilityLabel(null) !== 'نامشخص') {
    throw new Error('Unknown volatility label is missing');
  }

  console.log('✓ Market pulse passed (weighted breadth, ADX strength, relative volatility, coverage).');
}

/** آزمون نردبان و کشش نقدینگی (سطوح دست‌نخوردهٔ اطراف قیمت) */
export function testLiquidityMagnets() {
  console.log('Testing liquidity magnet ladder...');

  const levels: LiquidityLevel[] = [
    makeLevel(130, 50),
    makeLevel(110, 60),
    makeLevel(105, 80),
    makeLevel(102, 90),
    makeLevel(98, 85),
    makeLevel(95, 70),
    makeLevel(90, 80),
    makeLevel(60, 95),
    makeLevel(100, 99), // دقیقاً روی قیمت — باید بی‌اثر باشد
    makeLevel(104, 100, true), // سوئیپ‌شده — باید حذف شود
  ];

  const { above, below } = selectLiquidityMagnets(levels, 100, 2);
  if (above.length !== 2 || above[0].price !== 102 || above[1].price !== 105) {
    throw new Error(`Nearest levels above price are wrong: ${above.map((l) => l.price).join(', ')}`);
  }
  if (below.length !== 2 || below[0].price !== 98 || below[1].price !== 95) {
    throw new Error(`Nearest levels below price are wrong: ${below.map((l) => l.price).join(', ')}`);
  }
  if (above.some((l) => l.type === 'SWING_HIGH' && l.price === 104)) {
    throw new Error('Swept levels must be excluded from the magnet ladder');
  }
  if (Math.abs(below[0].distancePercent - 2) > 0.001) {
    throw new Error(`Distance percent is wrong: ${below[0].distancePercent}`);
  }

  // کشش صعودی: وزن سطوح بالایی غالب است
  const upDraw = computeLiquidityDraw([makeLevel(120, 90), makeLevel(115, 90), makeLevel(95, 40)], 100);
  if (upDraw.direction !== 'UP' || upDraw.upPercent < 60) {
    throw new Error(`Upward liquidity draw not detected: ${upDraw.direction} (${upDraw.upPercent}%)`);
  }

  // کشش نزولی
  const downDraw = computeLiquidityDraw([makeLevel(120, 20), makeLevel(95, 90), makeLevel(90, 90)], 100);
  if (downDraw.direction !== 'DOWN' || downDraw.upPercent >= 40) {
    throw new Error(`Downward liquidity draw not detected: ${downDraw.direction} (${downDraw.upPercent}%)`);
  }

  // بدون سطح دست‌نخورده => متعادل
  const flat = computeLiquidityDraw([makeLevel(120, 90, true), makeLevel(100, 99)], 100);
  if (flat.direction !== 'BALANCED' || flat.unsweptCount !== 0 || flat.upWeight !== 0) {
    throw new Error('Draw must stay balanced when no meaningful unswept level exists');
  }

  console.log('✓ Liquidity magnets passed (nearest untapped levels + weighted draw direction).');
}
