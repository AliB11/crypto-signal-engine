'use client';

import React, { useState } from 'react';
import { Signal, Timeframe } from '@/types/market';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Star,
  Search,
  ShieldAlert,
  ArrowUpRight,
  Filter,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  signals: Signal[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  isLoading: boolean;
  tier: 'top10' | 'top25' | 'top50' | 'custom';
  onChangeTier: (tier: 'top10' | 'top25' | 'top50' | 'custom') => void;
  favorites: string[];
  onToggleFavorite: (symbol: string) => void;
  currentTimeframe: Timeframe;
  onChangeTimeframe: (tf: Timeframe) => void;
}

export const ScannerTable: React.FC<Props> = ({
  signals,
  selectedSymbol,
  onSelectSymbol,
  isLoading,
  tier,
  onChangeTier,
  favorites,
  onToggleFavorite,
  currentTimeframe,
  onChangeTimeframe,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LONGS' | 'SHORTS' | 'STRONG_ONLY' | 'FAVORITES'>('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'symbol' | 'price' | 'rr'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter signals
  const filtered = signals.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType === 'LONGS') return s.direction === 'LONG';
    if (filterType === 'SHORTS') return s.direction === 'SHORT';
    if (filterType === 'STRONG_ONLY') return s.score >= 75;
    if (filterType === 'FAVORITES') return favorites.includes(s.symbol);
    return true;
  });

  // Sort signals
  const sorted = [...filtered].sort((a, b) => {
    let factor = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'score') return (a.score - b.score) * factor;
    if (sortBy === 'price') return (a.currentPrice - b.currentPrice) * factor;
    if (sortBy === 'rr') return ((a.tradePlan?.rrRatio || 0) - (b.tradePlan?.rrRatio || 0)) * factor;
    if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * factor;
    return 0;
  });

  const getClassificationBadge = (classification: Signal['classification']) => {
    switch (classification) {
      case 'VERY_STRONG':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
            Very Strong
          </span>
        );
      case 'STRONG':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            Strong
          </span>
        );
      case 'MODERATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-400 border border-amber-500/40">
            Moderate
          </span>
        );
      case 'WEAK':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-slate-700/60 text-slate-300 border border-slate-600">
            Weak
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-slate-800 text-slate-400 border border-slate-700">
            No Signal
          </span>
        );
    }
  };

  const getDirectionBadge = (direction: Signal['direction']) => {
    if (direction === 'LONG') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-xs shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>LONG SETUP</span>
        </div>
      );
    }
    if (direction === 'SHORT') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold text-xs shadow-[0_0_12px_rgba(244,63,94,0.2)]">
          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          <span>SHORT SETUP</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 font-medium text-xs">
        <Activity className="w-3.5 h-3.5 text-slate-500" />
        <span>WAIT / RANGE</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Controls Bar */}
      <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Tier & Timeframe Switchers */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Scan Tier */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            {(['top10', 'top25', 'top50'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onChangeTier(t)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  tier === t
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'top10' ? 'Top 10' : t === 'top25' ? 'Top 25' : 'Top 50'}
              </button>
            ))}
          </div>

          {/* Timeframe Switcher */}
          <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => onChangeTimeframe(tf)}
                className={`px-2.5 py-1 rounded-md font-semibold uppercase transition-all ${
                  currentTimeframe === tf
                    ? 'bg-slate-700 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search symbol (e.g. BTC)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44 sm:w-56"
            />
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1 text-xs">
            {(['ALL', 'LONGS', 'SHORTS', 'STRONG_ONLY', 'FAVORITES'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                  filterType === f
                    ? 'bg-slate-800 border-cyan-500/60 text-cyan-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f === 'ALL'
                  ? 'All'
                  : f === 'LONGS'
                  ? 'Longs'
                  : f === 'SHORTS'
                  ? 'Shorts'
                  : f === 'STRONG_ONLY'
                  ? 'Score ≥ 75'
                  : '⭐ Watchlist'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Signals Table */}
      <div className="overflow-x-auto min-h-[380px]">
        {isLoading && signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Scanning market liquidity & structure across Binance...</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-2">
            <ShieldAlert className="w-8 h-8 text-slate-600" />
            <span className="text-sm font-medium">No signals match your filter criteria</span>
            <span className="text-xs text-slate-600">Try changing timeframe or clearing search</span>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold tracking-wider text-[11px] uppercase">
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Signal Direction</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Liquidity Sweeps</th>
                <th className="py-3 px-4">Structure</th>
                <th className="py-3 px-4">MTF Alignment</th>
                <th className="py-3 px-4">Risk / Reward</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sorted.map((sig) => {
                const isSelected = sig.symbol === selectedSymbol;
                const isFav = favorites.includes(sig.symbol);
                const hasSweep = sig.components.liquidity > 55;

                return (
                  <tr
                    key={sig.symbol}
                    onClick={() => onSelectSymbol(sig.symbol)}
                    className={`cursor-pointer transition-all hover:bg-slate-800/40 ${
                      isSelected ? 'bg-cyan-950/30 border-l-2 border-cyan-500' : ''
                    }`}
                  >
                    {/* Symbol & Star */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(sig.symbol);
                          }}
                          className="text-slate-500 hover:text-amber-400 transition-colors"
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        <span className="font-bold text-slate-100 text-sm tracking-wide">
                          {sig.symbol}
                        </span>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      ${sig.currentPrice >= 1 ? sig.currentPrice.toLocaleString() : sig.currentPrice.toFixed(4)}
                    </td>

                    {/* Direction */}
                    <td className="py-3.5 px-4">{getDirectionBadge(sig.direction)}</td>

                    {/* Score Gauge */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              sig.score >= 80
                                ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                                : sig.score >= 65
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                : sig.score >= 50
                                ? 'bg-amber-500'
                                : 'bg-slate-600'
                            }`}
                            style={{ width: `${sig.score}%` }}
                          />
                        </div>
                        <span className="font-bold font-mono text-slate-200 text-xs">{sig.score}</span>
                      </div>
                    </td>

                    {/* Classification */}
                    <td className="py-3.5 px-4">{getClassificationBadge(sig.classification)}</td>

                    {/* Liquidity Sweep Status */}
                    <td className="py-3.5 px-4">
                      {hasSweep ? (
                        <div className="inline-flex items-center gap-1 text-purple-400 font-semibold text-[11px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
                          <Zap className="w-3 h-3 text-purple-400" />
                          <span>Sweep Detected</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">No active sweep</span>
                      )}
                    </td>

                    {/* Structure */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold ${
                          sig.marketRegime.regime.includes('BULLISH')
                            ? 'text-emerald-400'
                            : sig.marketRegime.regime.includes('BEARISH')
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {sig.marketRegime.regime.replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* MTF Alignment */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-mono text-slate-300 text-[11px]">
                        <span>{sig.components.multiTimeframe}% Confluence</span>
                      </div>
                    </td>

                    {/* Risk / Reward */}
                    <td className="py-3.5 px-4">
                      {sig.tradePlan ? (
                        <div className="font-mono font-bold text-cyan-400 text-xs">
                          1 : {sig.tradePlan.rrRatio} RR
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">N/A</span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSymbol(sig.symbol);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-semibold transition-all shadow-sm"
                      >
                        <span>Analyze</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Summary Stats */}
      <div className="flex flex-wrap items-center justify-between p-3.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              Long Setups:{' '}
              <strong className="text-slate-200">
                {signals.filter((s) => s.direction === 'LONG').length}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>
              Short Setups:{' '}
              <strong className="text-slate-200">
                {signals.filter((s) => s.direction === 'SHORT').length}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>
              High Probability (≥75):{' '}
              <strong className="text-slate-200">
                {signals.filter((s) => s.score >= 75).length}
              </strong>
            </span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Showing {sorted.length} of {signals.length} symbols scanned
        </div>
      </div>
    </div>
  );
};
