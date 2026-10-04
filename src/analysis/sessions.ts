import { Kline, SessionInfo, SessionLiquiditySummary, LiquidityLevel } from '../types/market';

export function analyzeSessionLiquidity(klines: Kline[]): SessionLiquiditySummary {
  if (!klines || klines.length === 0) {
    const emptySession = (name: 'Asian' | 'London' | 'New York', start: number, end: number): SessionInfo => ({
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

  // Find candles belonging to the most recent 24h
  const oneDayAgo = latestTime - 24 * 60 * 60 * 1000;
  const recent24h = klines.filter((k) => k.timestamp >= oneDayAgo);

  const getSessionCandles = (startHour: number, endHour: number): Kline[] => {
    return recent24h.filter((k) => {
      const h = new Date(k.timestamp).getUTCHours();
      if (startHour < endHour) {
        return h >= startHour && h < endHour;
      } else {
        return h >= startHour || h < endHour;
      }
    });
  };

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
      };
    }

    const high = Math.max(...candles.map((c) => c.high));
    const low = Math.min(...candles.map((c) => c.low));
    const openPrice = candles[0].open;
    const closePrice = candles[candles.length - 1].close;
    const rangePercent = low > 0 ? ((high - low) / low) * 100 : 0;

    // Check if subsequent candles swept this session's high or low
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
    };
  };

  const asian = buildSession('Asian', 0, 8);
  const london = buildSession('London', 7, 15);
  const newYork = buildSession('New York', 13, 21);

  // Current session name
  let currentSession: SessionLiquiditySummary['currentSession'] = 'Between Sessions';
  if (asian.isActive) currentSession = 'Asian';
  else if (london.isActive) currentSession = 'London';
  else if (newYork.isActive) currentSession = 'New York';

  // Judas Swing: London sweeping Asian High or Asian Low
  const judasSwingDetected =
    london.isActive && (asian.highSwept || asian.lowSwept);

  // NY Reversal: NY sweeping London High or London Low
  const nyReversalDetected =
    newYork.isActive && (london.highSwept || london.lowSwept);

  // Session liquidity levels
  const keyLevels: LiquidityLevel[] = [];
  if (asian.high > 0) {
    keyLevels.push({
      price: asian.high,
      type: 'SESSION_HIGH',
      strength: 85,
      swept: asian.highSwept,
      distancePercent: parseFloat((((asian.high - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: latestTime,
    });
    keyLevels.push({
      price: asian.low,
      type: 'SESSION_LOW',
      strength: 85,
      swept: asian.lowSwept,
      distancePercent: parseFloat((((asian.low - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: latestTime,
    });
  }

  if (london.high > 0) {
    keyLevels.push({
      price: london.high,
      type: 'SESSION_HIGH',
      strength: 88,
      swept: london.highSwept,
      distancePercent: parseFloat((((london.high - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: latestTime,
    });
    keyLevels.push({
      price: london.low,
      type: 'SESSION_LOW',
      strength: 88,
      swept: london.lowSwept,
      distancePercent: parseFloat((((london.low - currentPrice) / currentPrice) * 100).toFixed(2)),
      timestamp: latestTime,
    });
  }

  return {
    currentSession,
    sessions: {
      asian,
      london,
      newYork,
    },
    judasSwingDetected,
    nyReversalDetected,
    keyLevels,
  };
}
