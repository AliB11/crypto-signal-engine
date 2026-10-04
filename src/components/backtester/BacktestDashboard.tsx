'use client';

import React, { useState } from 'react';
import { BacktestReport, Timeframe } from '@/types/market';
import {
  Play,
  RotateCcw,
  TrendingUp,
  Award,
  AlertTriangle,
  BarChart2,
  PieChart,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface Props {
  initialSymbol?: string;
  initialTimeframe?: Timeframe;
}

export const BacktestDashboard: React.FC<Props> = ({
  initialSymbol = 'BTCUSDT',
  initialTimeframe = '15m',
}) => {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [minScore, setMinScore] = useState(65);
  const [candleLimit, setCandleLimit] = useState(500);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, minScore, candleLimit }),
      });

      if (!res.ok) {
        throw new Error(`Backtest failed with status: ${res.status}`);
      }

      const data = (await res.json()) as BacktestReport;
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Run backtest initially if not yet loaded
  React.useEffect(() => {
    if (!report && !isLoading) {
      handleRunBacktest();
    }
  }, []);

  const overall = report?.overallMetrics;
  const walkForward = report?.walkForward;
  const failure = report?.failureBreakdown;

  return (
    <div className="flex flex-col gap-6">
      {/* Controls Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Symbol Input */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Asset Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="ETHUSDT">ETHUSDT</option>
                <option value="SOLUSDT">SOLUSDT</option>
                <option value="BNBUSDT">BNBUSDT</option>
                <option value="XRPUSDT">XRPUSDT</option>
                <option value="DOGEUSDT">DOGEUSDT</option>
                <option value="ADAUSDT">ADAUSDT</option>
                <option value="AVAXUSDT">AVAXUSDT</option>
                <option value="LINKUSDT">LINKUSDT</option>
              </select>
            </div>

            {/* Timeframe Selector */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Timeframe
              </label>
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                {(['5m', '15m', '1h', '4h'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded font-semibold uppercase ${
                      timeframe === tf ? 'bg-cyan-600 text-white shadow' : 'text-slate-400'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Min Signal Score Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400">
                  Min Signal Score:
                </label>
                <span className="text-xs font-mono font-bold text-cyan-400">{minScore}</span>
              </div>
              <input
                type="range"
                min="50"
                max="85"
                step="5"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-32 accent-cyan-500"
              />
            </div>

            {/* Historical Candles */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Candle Depth
              </label>
              <select
                value={candleLimit}
                onChange={(e) => setCandleLimit(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="300">300 Bars</option>
                <option value="500">500 Bars</option>
                <option value="1000">1000 Bars</option>
              </select>
            </div>
          </div>

          {/* Run Button */}
          <button
            onClick={handleRunBacktest}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
            <span>{isLoading ? 'Simulating...' : 'Run Quantitative Backtest'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {overall && (
        <>
          {/* Performance KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Win Rate */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Win Rate
              </span>
              <span
                className={`font-mono text-xl font-black block ${
                  overall.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.winRate}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {overall.winningTrades}W / {overall.losingTrades}L
              </span>
            </div>

            {/* Profit Factor */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Profit Factor
              </span>
              <span
                className={`font-mono text-xl font-black block ${
                  overall.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {overall.profitFactor}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Gross P/L</span>
            </div>

            {/* Expectancy */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Expectancy
              </span>
              <span
                className={`font-mono text-xl font-black block ${
                  overall.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.expectancy > 0 ? '+' : ''}
                {overall.expectancy}R
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Per Trade</span>
            </div>

            {/* Max Drawdown */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Max Drawdown
              </span>
              <span className="font-mono text-xl font-black text-rose-400 block">
                -{overall.maxDrawdownPercent}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Peak-to-Trough</span>
            </div>

            {/* Cumulative Return */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Net Return
              </span>
              <span
                className={`font-mono text-xl font-black block ${
                  overall.cumulativeReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.cumulativeReturnPercent >= 0 ? '+' : ''}
                {overall.cumulativeReturnPercent}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">1% Risk/Trade</span>
            </div>

            {/* Average RR */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Avg RR
              </span>
              <span className="font-mono text-xl font-black text-cyan-400 block">
                1 : {overall.avgRR}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Realized</span>
            </div>

            {/* Sharpe Ratio */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Sharpe Ratio
              </span>
              <span className="font-mono text-xl font-black text-slate-200 block">
                {overall.sharpeRatio}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Risk-Adjusted</span>
            </div>

            {/* Sortino Ratio */}
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Sortino Ratio
              </span>
              <span className="font-mono text-xl font-black text-slate-200 block">
                {overall.sortinoRatio}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Downside Risk</span>
            </div>
          </div>

          {/* Equity Curve Visualization */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Simulated Account Equity Curve (Zero Look-Ahead Bias)
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Initial: <strong>$10,000 USD</strong> • Total Trades: <strong>{overall.totalTrades}</strong>
              </span>
            </div>

            {/* Custom SVG Equity Curve Line */}
            <div className="w-full h-48 relative flex items-end">
              {overall.equityCurve.length > 1 ? (
                <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Draw Polyline */}
                  {(() => {
                    const points = overall.equityCurve;
                    const minEq = Math.min(...points.map((p) => p.equity)) * 0.98;
                    const maxEq = Math.max(...points.map((p) => p.equity)) * 1.02;
                    const range = Math.max(1, maxEq - minEq);

                    const coords = points.map((p, idx) => {
                      const x = (idx / (points.length - 1)) * 1000;
                      const y = 200 - ((p.equity - minEq) / range) * 190;
                      return `${x},${y}`;
                    });

                    const pathStr = `M 0,200 L ${coords.join(' L ')} L 1000,200 Z`;
                    const lineStr = `M ${coords.join(' L ')}`;

                    return (
                      <>
                        <path d={pathStr} fill="url(#equityGrad)" />
                        <path d={lineStr} fill="none" stroke="#06b6d4" strokeWidth="2.5" />
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="w-full flex items-center justify-center text-slate-500 text-xs">
                  Insufficient trades generated in this window
                </div>
              )}
            </div>
          </div>

          {/* Walk-Forward Validation & False Signal Diagnostics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Walk-Forward Split (60% Train / 20% Val / 20% OOS) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-slate-100 text-sm">
                    Walk-Forward Validation (3-Split)
                  </h3>
                </div>
                {walkForward?.overfitWarning ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                    ⚠ Overfit Warning
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ✓ Validated
                  </span>
                )}
              </div>

              {walkForward && (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="py-2">Split Segment</th>
                        <th className="py-2">Trades</th>
                        <th className="py-2">Win Rate</th>
                        <th className="py-2">Profit Factor</th>
                        <th className="py-2">Max Drawdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">
                          Training (60%)
                        </td>
                        <td className="py-2.5 text-slate-300">{walkForward.training.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400">{walkForward.training.winRate}%</td>
                        <td className="py-2.5 text-cyan-400">{walkForward.training.profitFactor}</td>
                        <td className="py-2.5 text-rose-400">-{walkForward.training.maxDrawdownPercent}%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">
                          Validation (20%)
                        </td>
                        <td className="py-2.5 text-slate-300">{walkForward.validation.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400">{walkForward.validation.winRate}%</td>
                        <td className="py-2.5 text-cyan-400">{walkForward.validation.profitFactor}</td>
                        <td className="py-2.5 text-rose-400">-{walkForward.validation.maxDrawdownPercent}%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">
                          Out-of-Sample (20%)
                        </td>
                        <td className="py-2.5 text-slate-300">{walkForward.outOfSample.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400">{walkForward.outOfSample.winRate}%</td>
                        <td className="py-2.5 text-cyan-400">{walkForward.outOfSample.profitFactor}</td>
                        <td className="py-2.5 text-rose-400">-{walkForward.outOfSample.maxDrawdownPercent}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* False Signal Root-Cause Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100 text-sm">
                    Losing Setup Failure Mode Breakdown
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Total Losses: {failure?.totalLosses || 0}
                </span>
              </div>

              {failure && failure.totalLosses > 0 ? (
                <div className="flex flex-col gap-2.5 text-xs">
                  <div>
                    <div className="flex justify-between mb-1 text-slate-300">
                      <span>Liquidity Level Breach (No Reclaim)</span>
                      <span className="font-mono">{failure.liquidityFailures}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full"
                        style={{ width: `${(failure.liquidityFailures / failure.totalLosses) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 text-slate-300">
                      <span>False Breakout & Trap Continuation</span>
                      <span className="font-mono">{failure.falseBreakouts}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full"
                        style={{ width: `${(failure.falseBreakouts / failure.totalLosses) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 text-slate-300">
                      <span>Weak Displacement & Momentum Stagnation</span>
                      <span className="font-mono">{failure.weakDisplacement}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full"
                        style={{ width: `${(failure.weakDisplacement / failure.totalLosses) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 text-slate-300">
                      <span>Opposing HTF Macro Trend Conflict</span>
                      <span className="font-mono">{failure.badHTFAlignment}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${(failure.badHTFAlignment / failure.totalLosses) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  No loss breakdown available for current configuration
                </div>
              )}
            </div>
          </div>

          {/* Historical Simulated Trades Log Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 text-sm">
                Simulated Execution Log ({report.trades.length} Trades)
              </h3>
              <span className="text-xs text-slate-400">
                Period: {report.startDate} – {report.endDate}
              </span>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-sans text-[11px]">
                    <th className="py-2.5 px-4">Direction</th>
                    <th className="py-2.5 px-4">Entry Time</th>
                    <th className="py-2.5 px-4">Entry Price</th>
                    <th className="py-2.5 px-4">Stop Loss</th>
                    <th className="py-2.5 px-4">TP1 / TP2</th>
                    <th className="py-2.5 px-4">Exit Price</th>
                    <th className="py-2.5 px-4">Result</th>
                    <th className="py-2.5 px-4">Realized RR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {report.trades.slice(-25).reverse().map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-sans font-bold">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            t.direction === 'LONG'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">
                        {new Date(t.entryTime).toLocaleDateString()}{' '}
                        {new Date(t.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4 text-slate-200">${t.entryPrice.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-rose-400">${t.stopLoss.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-emerald-400">
                        ${t.tp1.toLocaleString()} / ${t.tp2.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">${t.exitPrice.toLocaleString()}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`font-bold ${
                            t.status === 'WIN' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.status} ({t.exitReason})
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-cyan-400">
                        {t.rrRealized > 0 ? `+${t.rrRealized}R` : `${t.rrRealized}R`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
