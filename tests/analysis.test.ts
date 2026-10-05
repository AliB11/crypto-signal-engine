import { detectLiquidityLevels } from '../src/analysis/liquidity';
import { detectLiquiditySweeps } from '../src/analysis/sweeps';
import { detectMarketRegime } from '../src/analysis/regime';
import { analyzeVolume } from '../src/analysis/volume';
import { Kline, Timeframe } from '../src/types/market';

/** ساخت سری کندل ساختگی با کنترل کامل روی OHLC */
export function makeKlines(
  spec: { open: number; high: number; low: number; close: number; volume?: number }[],
  timeframe: Timeframe = '15m',
  startAt = Date.UTC(2026, 0, 10, 0, 0, 0)
): Kline[] {
  const intervalMs =
    timeframe === '1d' ? 86_400_000 : timeframe === '1h' ? 3_600_000 : timeframe === '15m' ? 900_000 : 900_000;

  return spec.map((candle, index) => {
    const volume = candle.volume ?? 100;
    return {
      timestamp: startAt + index * intervalMs,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume,
      closeTime: startAt + (index + 1) * intervalMs - 1,
      quoteVolume: volume * candle.close,
      trades: Math.round(volume * 2),
      takerBuyBaseVolume: volume * 0.52,
      takerBuyQuoteVolume: volume * 0.52 * candle.close,
    };
  });
}

/**
 * آزمون پرهیز از آینده‌نگری در سطوح نقدینگی:
 * هر سطح پیوتی فقط پس از بسته‌شدن کندلِ تأیید (i + rightBars) قابل استناد است.
 * این آزمون یک «ناوردا» (invariant) روی یک سری واقع‌گرایانه بررسی می‌کند:
 * هیچ سوئیپی نباید پیش از زمان تأیید سطح رخ داده باشد.
 */
export function testLiquidityNoLookAhead() {
  console.log('Testing Liquidity Levels Confirmation (no look-ahead)...');

  // سری ساختگی موج‌دار همراه با دو سوئیپ عمیق
  const spec = Array.from({ length: 160 }, (_, i) => {
    const base = 100 + Math.sin(i / 7) * 3 + Math.sin(i / 23) * 1.5;
    const isDeepLow = i === 70 || i === 122;
    const isSpikeHigh = i === 96;
    return {
      open: base,
      high: base + (isSpikeHigh ? 5 : 0.8),
      low: base - (isDeepLow ? 6 : 0.8),
      close: base + (i % 2 === 0 ? 0.3 : -0.3),
      volume: 100 + (isDeepLow || isSpikeHigh ? 400 : 0),
    };
  });

  const klines = makeKlines(spec);
  const levels = detectLiquidityLevels(klines, '15m');
  const sweeps = detectLiquiditySweeps(klines, levels, '15m');

  const confirmedLevels = levels.filter((l) => l.confirmedTimestamp !== undefined);
  if (confirmedLevels.length === 0) {
    throw new Error('Expected liquidity levels to carry confirmation timestamps');
  }

  // ۱) در «پنجرهٔ تأیید» (از زمان تشکیل پیوت تا کندل تأیید) سطح نباید نقض شده باشد
  for (const level of confirmedLevels) {
    const inWindow = klines.filter(
      (k) => k.timestamp > level.timestamp && k.timestamp <= level.confirmedTimestamp!
    );
    const violated = inWindow.some((k) =>
      level.type.includes('HIGH') || level.type === 'EQUAL_HIGH'
        ? k.high > level.price
        : k.low < level.price
    );
    if (violated) {
      throw new Error(
        `Level ${level.type}@${level.price} was violated inside its confirmation window (look-ahead risk)`
      );
    }
  }

  // ۲) هیچ سوئیپی نباید پیش از زمان تأیید سطح مربوطه ثبت شده باشد
  for (const sweep of sweeps) {
    const matching = levels.find((l) => Math.abs(l.price - sweep.levelPrice) / l.price < 1e-6);
    if (!matching) continue;
    const visibleFrom = matching.confirmedTimestamp ?? matching.timestamp;
    if (sweep.timestamp < visibleFrom) {
      throw new Error('A sweep was recorded before the level was structurally confirmed');
    }
  }

  console.log(
    `✓ Liquidity confirmation passed (${confirmedLevels.length} levels verified, ${sweeps.length} sweeps checked for look-ahead).`
  );
}

/**
 * آزمون سوئیپ سطوح جلسات:
 * پیش‌تر زمان سطوح جلسه برابر «آخرین کندل» گذاشته می‌شد و موتور سوئیپ هرگز
 * نمی‌توانست سقف/کف جلسه را به‌عنوان سطح قابل سوئیپ ببیند.
 */
export function testSessionLevelSweeps() {
  console.log('Testing session key-level sweeps...');

  const dayStart = Date.UTC(2026, 0, 12, 0, 0, 0); // دوشنبه ۰۰:۰۰ UTC
  const spec: { open: number; high: number; low: number; close: number; volume?: number }[] = [];

  // جلسهٔ آسیا: یک کف V شکل دقیقاً روی ۹۵ (تا پیوت معتبر بسازد) و سقف ۹۹
  const asianLows = [96.6, 96.4, 96.2, 96.0, 95.8, 95.6, 95.4, 95.2, 95.0, 95.2, 95.4, 95.6, 95.8, 96.0, 96.2, 96.4, 96.6, 96.8, 97.0, 97.2, 97.4, 97.6, 97.8, 98.0, 98.2, 98.4, 98.6, 98.8, 99.0, 99.2, 99.4, 99.6];
  asianLows.forEach((low) => {
    spec.push({ open: 97, high: 99, low, close: 97.5, volume: 120 });
  });

  // جلسهٔ لندن: کندل سوئیپ کف آسیا را تا ۹۴ می‌شکند و بازمی‌گردد
  for (let hour = 8; hour < 14; hour++) {
    for (let q = 0; q < 4; q++) {
      // سوئیپ در انتهای جلسهٔ لندن (در پنجرهٔ ۴۰ کندلِ اخیر که موتور سوئیپ اسکن می‌کند)
      const isSweep = hour === 13 && q === 0;
      spec.push({
        open: isSweep ? 95.6 : 97,
        high: isSweep ? 95.8 : 98.6,
        low: isSweep ? 94 : 95.6,
        close: isSweep ? 95.4 : 97.4,
        volume: isSweep ? 900 : 140,
      });
    }
  }
  // جلسهٔ نیویورک
  for (let hour = 14; hour < 20; hour++) {
    for (let q = 0; q < 4; q++) {
      spec.push({ open: 97.4, high: 98.2, low: 96.8, close: 97.9, volume: 160 });
    }
  }

  const klines = makeKlines(spec, '15m', dayStart);
  const levels = detectLiquidityLevels(klines, '15m');
  const sweeps = detectLiquiditySweeps(klines, levels, '15m');

  // سطح کف آسیا از سطوح پیوتی باید در لندن سوئیپ شده باشد
  const asianLowLevel = levels.find(
    (l) => l.type === 'SWING_LOW' && Math.abs(l.price - 95) / 95 < 0.002
  );
  if (!asianLowLevel) {
    throw new Error('Expected the Asian session low (95) to be detected as a liquidity level');
  }
  if (!asianLowLevel.swept) {
    throw new Error('Expected the Asian session low to be marked as swept');
  }

  const sellSideSweep = sweeps.find((s) => s.type === 'SELL_SIDE_SWEEP');
  if (!sellSideSweep) {
    throw new Error('Expected a sell-side sweep of the session low');
  }
  const sweepTime = klines[sellSideSweep.candleIndex].timestamp;
  const levelVisibleFrom = asianLowLevel.confirmedTimestamp ?? asianLowLevel.timestamp;
  if (sweepTime < levelVisibleFrom) {
    throw new Error('Sweep candle must come after the level confirmation time');
  }
  if (sweepTime <= asianLowLevel.timestamp) {
    throw new Error('Sweep candle must come after the level formation time');
  }

  console.log('✓ Session key-level sweeps passed (session lows are sweepable once confirmed).');
}

/** آزمون تولید سقف/کف هفتهٔ قبل که پیش‌تر هرگز محاسبه نمی‌شد */
export function testPreviousWeekLevels() {
  console.log('Testing Previous Week High/Low levels...');

  const dailySpec = Array.from({ length: 21 }, (_, i) => ({
    open: 100 + i,
    high: 105 + i,
    low: 95 + i,
    close: 101 + i,
    volume: 1000,
  }));
  // هفتهٔ گذشته (روزهای ۷ تا ۱۳) سقف/کف متمایز دارد
  dailySpec[9] = { open: 110, high: 130, low: 108, close: 120, volume: 1000 };
  dailySpec[11] = { open: 118, high: 119, low: 90, close: 95, volume: 1000 };

  const daily = makeKlines(dailySpec, '1d');
  const intraday = makeKlines(
    Array.from({ length: 60 }, (_, i) => ({
      open: 120 + i * 0.1,
      high: 121 + i * 0.1,
      low: 119 + i * 0.1,
      close: 120.5 + i * 0.1,
    })),
    '15m',
    daily[daily.length - 1].timestamp + 900_000
  );

  const levels = detectLiquidityLevels(intraday, '15m', {}, daily);
  const pwh = levels.find((l) => l.type === 'PREVIOUS_WEEK_HIGH');
  const pwl = levels.find((l) => l.type === 'PREVIOUS_WEEK_LOW');

  if (!pwh || !pwl) {
    throw new Error('Expected PREVIOUS_WEEK_HIGH and PREVIOUS_WEEK_LOW levels');
  }
  if (pwh.price !== 130 || pwl.price !== 90) {
    throw new Error(`Unexpected previous week range: ${pwh.price} / ${pwl.price}`);
  }

  console.log('✓ Previous Week levels passed (PWH/PWL are now produced from daily candles).');
}

/** آزمون ADX استاندارد: روند قوی باید ADX بالاتری از بازار رِنج بدهد */
export function testAdxRegime() {
  console.log('Testing Wilder ADX & Market Regime classification...');

  const trending = makeKlines(
    Array.from({ length: 80 }, (_, i) => {
      const base = 100 + i * 1.5;
      return { open: base, high: base + 1.2, low: base - 0.4, close: base + 1.0 };
    })
  );
  const ranging = makeKlines(
    Array.from({ length: 80 }, (_, i) => {
      const base = 100 + Math.sin(i / 2) * 1.2;
      return { open: base, high: base + 0.5, low: base - 0.5, close: base + (i % 2 === 0 ? 0.2 : -0.2) };
    })
  );

  const trendRegime = detectMarketRegime(trending);
  const rangeRegime = detectMarketRegime(ranging);

  if (!(trendRegime.adx > rangeRegime.adx)) {
    throw new Error(
      `ADX should be higher in a trend (${trendRegime.adx}) than in a range (${rangeRegime.adx})`
    );
  }
  if (trendRegime.adx < 25) {
    throw new Error(`Expected ADX >= 25 for a strong synthetic trend, got ${trendRegime.adx}`);
  }
  if (!trendRegime.regime.includes('TRENDING')) {
    throw new Error(`Expected a trending regime, got ${trendRegime.regime}`);
  }
  if (trendRegime.plusDI === undefined || trendRegime.minusDI === undefined) {
    throw new Error('Expected +DI/-DI to be reported');
  }
  if (!(trendRegime.plusDI > trendRegime.minusDI)) {
    throw new Error('Expected +DI to dominate in a bullish trend');
  }

  console.log(
    `✓ ADX & Regime passed (trend ADX ${trendRegime.adx} vs range ADX ${rangeRegime.adx}, +DI ${trendRegime.plusDI}).`
  );
}

/** آزمون شفافیت داده‌های حجمی و پروفایل حجم */
export function testVolumeTransparency() {
  console.log('Testing Volume metrics transparency & value area...');

  const spec = Array.from({ length: 60 }, (_, i) => ({
    open: 100 + Math.sin(i / 4) * 2,
    high: 101 + Math.sin(i / 4) * 2,
    low: 99 + Math.sin(i / 4) * 2,
    close: 100.5 + Math.sin(i / 4) * 2,
    volume: 100 + (i % 7) * 25,
  }));

  const withTicks = analyzeVolume(makeKlines(spec));
  if (!withTicks.hasTickFlowData) {
    throw new Error('Expected hasTickFlowData=true when taker volumes exist');
  }

  const withoutTicks = analyzeVolume(
    makeKlines(spec).map((k) => ({ ...k, takerBuyBaseVolume: 0, takerBuyQuoteVolume: 0 }))
  );
  if (withoutTicks.hasTickFlowData) {
    throw new Error('hasTickFlowData must be false when the source has no taker volume (e.g. CoinGecko)');
  }
  if (withoutTicks.imbalance !== 0) {
    throw new Error('Without tick data the imbalance must be neutral (0)');
  }

  const profile = withTicks.volumeProfile;
  if (!profile) throw new Error('Expected a volume profile');
  if (!(profile.vah >= profile.poc && profile.poc >= profile.val)) {
    throw new Error(
      `Value area is not ordered around the POC: VAL=${profile.val}, POC=${profile.poc}, VAH=${profile.vah}`
    );
  }

  console.log('✓ Volume transparency passed (honest tick-flow flag, ordered value area).');
}
