'use client';

import React from 'react';
import { FullAnalysisResult, Timeframe } from '@/types/market';
import { TradingViewChart } from '../charts/TradingViewChart';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Zap,
  CheckCircle,
  Compass,
  ArrowRight,
  Gauge,
  Percent,
} from 'lucide-react';

interface Props {
  analysis: FullAnalysisResult;
  timeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
  isLoading: boolean;
}

export const CoinAnalyzer: React.FC<Props> = ({
  analysis,
  timeframe,
  onChangeTimeframe,
  isLoading,
}) => {
  const {
    symbol,
    ticker,
    signal,
    liquidityLevels,
    liquiditySweeps,
    structure,
    sessionLiquidity,
    volumeMetrics,
    derivatives,
    marketRegime,
    mtf,
    layer3,
    candles,
  } = analysis;

  const tradePlan = signal.tradePlan;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Asset Header */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-xl gap-4">
        {/* Symbol Info */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-100 tracking-tight">{symbol}</h2>
              {analysis.metadata?.name && (
                <span className="text-xs text-slate-400 font-medium">({analysis.metadata.name})</span>
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs text-slate-400">
              <span className="font-mono text-base font-bold text-slate-100">
                ${ticker.lastPrice >= 1 ? ticker.lastPrice.toLocaleString() : ticker.lastPrice.toFixed(4)}
              </span>
              <span
                className={`font-semibold font-mono ${
                  ticker.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {ticker.priceChangePercent >= 0 ? '+' : ''}
                {ticker.priceChangePercent.toFixed(2)}%
              </span>
              <span>•</span>
              <span>24h Vol: ${(ticker.quoteVolume / 1000000).toFixed(1)}M</span>
            </div>
          </div>
        </div>

        {/* Signal Direction & Score Banner */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Timeframe Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => onChangeTimeframe(tf)}
                className={`px-3 py-1.5 rounded-md font-semibold uppercase transition-all ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Direction Badge */}
          {signal.direction === 'LONG' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-bold text-sm shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>LONG SETUP DETECTED</span>
            </div>
          ) : signal.direction === 'SHORT' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-300 font-bold text-sm shadow-[0_0_15px_rgba(244,63,94,0.25)]">
              <TrendingDown className="w-5 h-5 text-rose-400" />
              <span>SHORT SETUP DETECTED</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm">
              <Activity className="w-5 h-5 text-slate-400" />
              <span>NO DIRECTIONAL SETUP</span>
            </div>
          )}

          {/* Probability Score Pill */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Confidence Score:</span>
            <span
              className={`font-mono font-extrabold text-base ${
                signal.score >= 80
                  ? 'text-emerald-400'
                  : signal.score >= 65
                  ? 'text-cyan-400'
                  : signal.score >= 50
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {signal.score}/100
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Chart + Trade Plan Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Candlestick Chart */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <TradingViewChart
            candles={candles}
            liquidityLevels={liquidityLevels}
            sweeps={liquiditySweeps}
            structure={structure}
            tradePlan={tradePlan}
            timeframe={timeframe}
            symbol={symbol}
          />
        </div>

        {/* Right Col: Structured Trade Setup & Reasoning Checklist */}
        <div className="flex flex-col gap-4">
          {/* Action Plan Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm tracking-wide">
                  Quantitative Trade Plan
                </h3>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Risk: {tradePlan?.riskLevel || 'N/A'}
              </span>
            </div>

            {tradePlan ? (
              <div className="flex flex-col gap-3.5 text-xs">
                {/* Entry Zone */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/60">
                  <div>
                    <div className="text-slate-400 text-[11px] uppercase font-semibold">
                      Entry Zone ({tradePlan.entry.type})
                    </div>
                    <div className="font-mono font-bold text-cyan-300 text-sm">
                      ${tradePlan.entry.min.toLocaleString()} – ${tradePlan.entry.max.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Optimal</span>
                    <div className="font-mono font-bold text-cyan-400">
                      ${tradePlan.entry.optimal.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Stop Loss (Structural Invalidation) */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60">
                  <div>
                    <div className="text-slate-400 text-[11px] uppercase font-semibold">
                      Invalidation SL
                    </div>
                    <div className="font-mono font-bold text-rose-400 text-sm">
                      ${tradePlan.stopLoss.toLocaleString()}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-rose-300 text-xs">
                    -{tradePlan.stopLossPercent}%
                  </div>
                </div>

                {/* Take Profit Targets */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                    <span className="text-[10px] text-slate-400 font-semibold block">TP1</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs block">
                      ${tradePlan.tp1.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-300 font-mono">
                      +{tradePlan.tp1Percent}%
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                    <span className="text-[10px] text-slate-400 font-semibold block">TP2</span>
                    <span className="font-mono font-bold text-emerald-300 text-xs block">
                      ${tradePlan.tp2.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-300 font-mono">
                      +{tradePlan.tp2Percent}%
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                    <span className="text-[10px] text-slate-400 font-semibold block">TP3</span>
                    <span className="font-mono font-bold text-emerald-300 text-xs block">
                      ${tradePlan.tp3.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-emerald-300 font-mono">
                      +{tradePlan.tp3Percent}%
                    </span>
                  </div>
                </div>

                {/* Risk / Reward Bar */}
                <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 font-mono">
                  <span className="text-slate-400 text-[11px]">Calculated Risk / Reward:</span>
                  <span className="font-bold text-cyan-400 text-sm">
                    1 : {tradePlan.rrRatio} RR
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 gap-2">
                <AlertTriangle className="w-8 h-8 text-slate-600" />
                <span className="text-xs font-semibold">No high-probability trade plan active</span>
                <span className="text-[11px]">
                  Market structure or liquidity confluence currently insufficient.
                </span>
              </div>
            )}
          </div>

          {/* Explainable AI Reasoning Checklist */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex-1">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-slate-100 text-sm tracking-wide">
                Explainable Technical Confluence
              </h3>
            </div>

            <div className="flex flex-col gap-2">
              {signal.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span>{reason}</span>
                </div>
              ))}

              {signal.warnings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Risk Headwinds & Warnings:
                  </span>
                  {signal.warnings.map((warn, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-amber-300/90">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Liquidity Layer 3 Deep Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Layer 1: Basic Liquidity */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                <h4 className="font-bold text-slate-200 text-sm">Layer 1: Basic Liquidity</h4>
              </div>
              <span className="font-mono font-bold text-pink-400 text-xs">
                {layer3.layer1BasicLiquidity.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Equal Highs (EQH):</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer1BasicLiquidity.equalHighs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Equal Lows (EQL):</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer1BasicLiquidity.equalLows.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prev Day High Dist:</span>
                <span className="font-mono text-slate-100">
                  {layer3.layer1BasicLiquidity.pdhDistancePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prev Day Low Dist:</span>
                <span className="font-mono text-slate-100">
                  {layer3.layer1BasicLiquidity.pdlDistancePercent}%
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Swing points & resting resting stop-loss clusters
          </div>
        </div>

        {/* Layer 2: Structural Liquidity */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <h4 className="font-bold text-slate-200 text-sm">Layer 2: Structural Liquidity</h4>
              </div>
              <span className="font-mono font-bold text-purple-400 text-xs">
                {layer3.layer2StructuralLiquidity.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Active Sweeps:</span>
                <span className="font-mono font-bold text-purple-400">
                  {layer3.layer2StructuralLiquidity.activeSweeps.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Market Structure Shift:</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer2StructuralLiquidity.activeMSS ? layer3.layer2StructuralLiquidity.activeMSS.direction : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unfilled FVGs:</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer2StructuralLiquidity.recentFVGs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Displacement Score:</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer2StructuralLiquidity.displacementScore}/100
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            BOS, MSS shifts, displacement pulses, FVGs & OBs
          </div>
        </div>

        {/* Layer 3: Advanced Context */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                <h4 className="font-bold text-slate-200 text-sm">Layer 3: Advanced Context</h4>
              </div>
              <span className="font-mono font-bold text-cyan-400 text-xs">
                {layer3.layer3AdvancedContext.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">HTF Alignment:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.htfAlignment ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.htfAlignment ? 'Confirmed' : 'Mixed'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sweep + MSS + Displacement:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.sweepPlusMSSDisplacement ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.sweepPlusMSSDisplacement ? 'Active Confluence' : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Derivatives Confluence:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.derivativesConfluence ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.derivativesConfluence ? 'Aligned Flow' : 'Neutral'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Market Regime:</span>
                <span className="font-bold text-cyan-300">
                  {marketRegime.regime.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Holistic cross-timeframe synthesis & derivatives confluence
          </div>
        </div>
      </div>

      {/* Session Liquidity & Derivatives Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Liquidity */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-slate-100 text-sm">Session Liquidity & Range</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-950 text-blue-400 border border-blue-800">
              Active: {sessionLiquidity.currentSession}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Asian */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                sessionLiquidity.sessions.asian.isActive
                  ? 'bg-blue-950/40 border-blue-500/60'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-200 text-xs">Asian</span>
                  {sessionLiquidity.sessions.asian.isActive && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  )}
                </div>
                <div className="text-[11px] text-slate-400">00:00 - 08:00 UTC</div>
              </div>

              <div className="mt-3 text-[11px] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">High:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.asian.high.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Low:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.asian.low.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Range:</span>
                  <span className="font-mono text-cyan-400">
                    {sessionLiquidity.sessions.asian.rangePercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* London */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                sessionLiquidity.sessions.london.isActive
                  ? 'bg-blue-950/40 border-blue-500/60'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-200 text-xs">London</span>
                  {sessionLiquidity.sessions.london.isActive && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  )}
                </div>
                <div className="text-[11px] text-slate-400">07:00 - 15:30 UTC</div>
              </div>

              <div className="mt-3 text-[11px] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">High:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.london.high.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Low:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.london.low.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Judas Swing:</span>
                  <span
                    className={`font-semibold ${
                      sessionLiquidity.judasSwingDetected ? 'text-purple-400' : 'text-slate-500'
                    }`}
                  >
                    {sessionLiquidity.judasSwingDetected ? 'Detected' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* New York */}
            <div
              className={`p-3 rounded-lg border flex flex-col justify-between ${
                sessionLiquidity.sessions.newYork.isActive
                  ? 'bg-blue-950/40 border-blue-500/60'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-200 text-xs">New York</span>
                  {sessionLiquidity.sessions.newYork.isActive && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                  )}
                </div>
                <div className="text-[11px] text-slate-400">13:00 - 21:30 UTC</div>
              </div>

              <div className="mt-3 text-[11px] flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">High:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.newYork.high.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Low:</span>
                  <span className="font-mono text-slate-300">
                    ${sessionLiquidity.sessions.newYork.low.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NY Reversal:</span>
                  <span
                    className={`font-semibold ${
                      sessionLiquidity.nyReversalDetected ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {sessionLiquidity.nyReversalDetected ? 'Detected' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Derivatives & Order Flow Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-slate-100 text-sm">Futures Derivatives & Order Flow</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
              Binance Futures Feed
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Open Interest Trend */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                OI Trend
              </span>
              <span className="font-bold text-slate-200 block">
                {derivatives.oiTrend.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono mt-1 block">
                +{derivatives.oiChange1hPercent}% 1h
              </span>
            </div>

            {/* Funding Rate */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Funding (8h)
              </span>
              <span
                className={`font-mono font-bold block ${
                  derivatives.fundingRate >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {(derivatives.fundingRate * 100).toFixed(4)}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                {derivatives.fundingRateAnnualizedPercent.toFixed(1)}% APY
              </span>
            </div>

            {/* Global Long/Short Ratio */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Global LSR
              </span>
              <span className="font-mono font-bold text-cyan-400 block text-sm">
                {derivatives.globalLongShortRatio.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Top Trader: {derivatives.topTraderLongShortRatio.toFixed(2)}
              </span>
            </div>

            {/* Taker Volume Imbalance */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-1">
                Taker Imbalance
              </span>
              <span
                className={`font-mono font-bold block ${
                  volumeMetrics.imbalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {volumeMetrics.imbalance >= 0 ? '+' : ''}
                {volumeMetrics.imbalance}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                RVOL: {volumeMetrics.rvol}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Timeframe Confluence Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              Top-Down Multi-Timeframe Confluence Matrix
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Confluence: <strong className="text-cyan-400">{mtf.alignmentScore}%</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {(['1d', '4h', '1h', '15m', '5m', '1m'] as const).map((tf) => {
            const data = mtf.timeframes[tf];
            const isBullish = data?.trend === 'BULLISH';
            const isBearish = data?.trend === 'BEARISH';

            return (
              <div
                key={tf}
                className={`p-3 rounded-lg border text-center ${
                  isBullish
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : isBearish
                    ? 'bg-rose-950/30 border-rose-500/40'
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <span className="font-mono font-bold uppercase text-slate-200 text-xs block mb-1">
                  {tf}
                </span>
                <span
                  className={`font-semibold text-xs block ${
                    isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {data?.trend || 'RANGING'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block font-mono">
                  Score: {data?.structureScore || 50}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
