import { Kline, SessionInfo, SessionLiquiditySummary, LiquidityLevel } from '../types/market';

/**
 * تحلیل نقدینگی جلسات معاملاتی (آسیا / لندن / نیویورک)
 *
 * اصلاحات این نسخه:
 *  ۱) اولویت جلسهٔ جاری: در بازهٔ هم‌پوشانی ۱۳:۰۰–۱۵:۰۰ UTC پیش‌تر «لندن» گزارش می‌شد،
 *     حالا آخرین جلسهٔ آغازشده (نیویورک) جلسهٔ جاری است و فهرست کامل جلسات فعال هم برگردانده می‌شود.
 *  ۲) سطوح کلیدی جلسهٔ نیویورک نیز تولید می‌شود (پیش‌تر فقط آسیا و لندن بودند).
 *  ۳) زمان سطوح جلسه، «پایان همان جلسه» است نه زمان آخرین کندل؛ در غیر این صورت موتور
 *     سوئیپ هرگز نمی‌توانست سقف/کف جلسات را به‌عنوان سطح قابل سوئیپ ببیند.
 */
export function analyzeSessionLiquidity(klines: Kline[]): SessionLiquiditySummary {
  if (!klines || klines.length === 0) {
    const emptySession = (
      name: 'Asian' | 'London' | 'New York',
      start: number,
      end: number
    ): SessionInfo => ({
      name,
      isActive: false,
      startHourUTC: start,
      endHourUTC: end,
      high: 0,
      low: 0,
      openPrice: 0,
      rangePercent: 0,
      highSwept: false,
      lowSwept: false,
      bias: 'NEUTRAL',
    });

    return {
      currentSession: 'Between Sessions',
      activeSessions: [],
      sessions: {
        asian: emptySession('Asian', 0, 8),
        london: emptySession('London', 7, 15),
        newYork: emptySession('New York', 13, 21),
      },
      judasSwingDetected: false,
      nyReversalDetected: false,
      keyLevels: [],
    };
  }

  const latestTime = klines[klines.length - 1].timestamp;
  const currentHourUTC = new Date(latestTime).getUTCHours();
  const currentPrice = klines[klines.length - 1].close;

  // کندل‌های ۲۴ ساعت گذشته
  const oneDayAgo = latestTime - 24 * 60 * 60 * 1000;
  const recent24h = klines.filter((k) => k.timestamp >= oneDayAgo);

  const getSessionCandles = (startHour: number, endHour: number): Kline[] =>
    recent24h.filter((k) => {
      const h = new Date(k.timestamp).getUTCHours();
      return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
    });

  const buildSession = (
    name: 'Asian' | 'London' | 'New York',
    startHour: number,
    endHour: number
  ): SessionInfo => {
    const candles = getSessionCandles(startHour, endHour);
    const isActive =
      startHour < endHour
        ? currentHourUTC >= startHour && currentHourUTC < endHour
        : currentHourUTC >= startHour || currentHourUTC < endHour;

    if (candles.length === 0) {
      return {
        name,
        isActive,
        startHourUTC: startHour,
        endHourUTC: endHour,
        high: currentPrice,
        low: currentPrice,
        openPrice: currentPrice,
        rangePercent: 0,
        highSwept: false,
        lowSwept: false,
        bias: 'NEUTRAL',
        endTimestamp: latestTime,
      };
    }

    const high = Math.max(...candles.map((c) => c.high));
    const low = Math.min(...candles.map((c) => c.low));
    const openPrice = candles[0].open;
    const closePrice = candles[candles.length - 1].close;
    const rangePercent = low > 0 ? ((high - low) / low) * 100 : 0;

    const sessionEndTime = candles[candles.length - 1].timestamp;
    const subsequentCandles = klines.filter((k) => k.timestamp > sessionEndTime);

    const highSwept = subsequentCandles.some((k) => k.high > high);
    const lowSwept = subsequentCandles.some((k) => k.low < low);

    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (closePrice > openPrice) bias = 'BULLISH';
    else if (closePrice < openPrice) bias = 'BEARISH';

    return {
      name,
      isActive,
      startHourUTC: startHour,
      endHourUTC: endHour,
      high,
      low,
      openPrice,
      rangePercent: parseFloat(rangePercent.toFixed(2)),
      highSwept,
      lowSwept,
      bias,
      endTimestamp: sessionEndTime,
    };
  };

  const asian = buildSession('Asian', 0, 8);
  const london = buildSession('London', 7, 15);
  const newYork = buildSession('New York', 13, 21);

  // اولویت جلسهٔ جاری: آخرین جلسه‌ای که شروع شده است (نیویورک > لندن > آسیا)
  type NamedSession = 'Asian' | 'London' | 'New York';
  const activeSessions: NamedSession[] = [];
  if (asian.isActive) activeSessions.push('Asian');
  if (london.isActive) activeSessions.push('London');
  if (newYork.isActive) activeSessions.push('New York');

  let currentSession: SessionLiquiditySummary['currentSession'] = 'Between Sessions';
  if (newYork.isActive) currentSession = 'New York';
  else if (london.isActive) currentSession = 'London';
  else if (asian.isActive) currentSession = 'Asian';

  // جوداس سوئینگ: سوئیپ سقف یا کف جلسهٔ آسیا در جلسهٔ لندن
  const judasSwingDetected = london.isActive && (asian.highSwept || asian.lowSwept);

  // بازگشت نیویورک: سوئیپ سقف یا کف جلسهٔ لندن
  const nyReversalDetected = newYork.isActive && (london.highSwept || london.lowSwept);

  const keyLevels: LiquidityLevel[] = [];
  const pushSessionLevels = (
    session: SessionInfo,
    strength: number
  ): void => {
    if (session.high <= 0 || session.low <= 0) return;
    const anchorTime = session.endTimestamp ?? latestTime;

    keyLevels.push({
      price: session.high,
      type: 'SESSION_HIGH',
      strength,
      swept: session.highSwept,
      distancePercent: parseFloat((((session.high - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: anchorTime,
      confirmedTimestamp: anchorTime,
    });

    keyLevels.push({
      price: session.low,
      type: 'SESSION_LOW',
      strength,
      swept: session.lowSwept,
      distancePercent: parseFloat((((session.low - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: anchorTime,
      confirmedTimestamp: anchorTime,
    });
  };

  pushSessionLevels(asian, 85);
  pushSessionLevels(london, 88);
  pushSessionLevels(newYork, 88);

  return {
    currentSession,
    activeSessions,
    sessions: { asian, london, newYork },
    judasSwingDetected,
    nyReversalDetected,
    keyLevels,
  };
}
