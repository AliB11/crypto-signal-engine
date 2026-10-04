import { BacktestTrade, BacktestMetrics } from '../types/market';

export function calculateBacktestMetrics(
  trades: BacktestTrade[],
  initialBalance = 10000
): BacktestMetrics {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      lossRate: 0,
      profitFactor: 0,
      expectancy: 0,
      maxDrawdownPercent: 0,
      avgRR: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      avgHoldCandles: 0,
      cumulativeReturnPercent: 0,
      equityCurve: [{ time: Date.now(), equity: initialBalance, drawdown: 0 }],
    };
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.status === 'WIN');
  const losses = trades.filter((t) => t.status === 'LOSS');

  const winningTrades = wins.length;
  const losingTrades = losses.length;
  const winRate = parseFloat(((winningTrades / totalTrades) * 100).toFixed(2));
  const lossRate = parseFloat(((losingTrades / totalTrades) * 100).toFixed(2));

  // Gross profits and gross losses (assuming fixed 1% risk per trade)
  const riskPerTrade = initialBalance * 0.01;
  let grossProfit = 0;
  let grossLoss = 0;

  let currentEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdown = 0;

  const equityCurve: { time: number; equity: number; drawdown: number }[] = [
    { time: trades[0].entryTime - 60000, equity: initialBalance, drawdown: 0 },
  ];

  const returns: number[] = [];

  for (const trade of trades) {
    const tradePnlUSD = riskPerTrade * trade.rrRealized;
    if (tradePnlUSD > 0) {
      grossProfit += tradePnlUSD;
    } else {
      grossLoss += Math.abs(tradePnlUSD);
    }

    currentEquity += tradePnlUSD;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }

    const dd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }

    const returnPct = (tradePnlUSD / initialBalance) * 100;
    returns.push(returnPct);

    equityCurve.push({
      time: trade.exitTime,
      equity: parseFloat(currentEquity.toFixed(2)),
      drawdown: parseFloat(dd.toFixed(2)),
    });
  }

  const profitFactor =
    grossLoss > 0
      ? parseFloat((grossProfit / grossLoss).toFixed(2))
      : grossProfit > 0
      ? 99.99
      : 0;

  const avgWinPnl = wins.length > 0 ? wins.reduce((s, t) => s + t.rrRealized, 0) / wins.length : 0;
  const avgLossPnl = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.rrRealized, 0) / losses.length) : 1;
  const expectancy = parseFloat(
    ((winRate / 100) * avgWinPnl - (lossRate / 100) * avgLossPnl).toFixed(2)
  );

  const avgRR =
    trades.length > 0
      ? parseFloat((trades.reduce((s, t) => s + Math.max(0, t.rrRealized), 0) / Math.max(1, wins.length)).toFixed(2))
      : 0;

  // Sharpe & Sortino (assuming risk free rate = 0)
  const meanReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length || 1);
  const stdDev = Math.sqrt(variance);

  const negativeReturns = returns.filter((r) => r < 0);
  const downsideVariance =
    negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (negativeReturns.length || 1);
  const downsideStd = Math.sqrt(downsideVariance);

  const sharpeRatio = stdDev > 0 ? parseFloat(((meanReturn / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;
  const sortinoRatio = downsideStd > 0 ? parseFloat(((meanReturn / downsideStd) * Math.sqrt(252)).toFixed(2)) : 0;

  const cumulativeReturnPercent = parseFloat(
    (((currentEquity - initialBalance) / initialBalance) * 100).toFixed(2)
  );

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    lossRate,
    profitFactor,
    expectancy,
    maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
    avgRR,
    sharpeRatio,
    sortinoRatio,
    avgHoldCandles: 8,
    cumulativeReturnPercent,
    equityCurve,
  };
}
