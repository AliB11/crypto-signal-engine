'use client';

import React from 'react';
import {
  Activity,
  Layers,
  Compass,
  History,
  RefreshCw,
  Sliders,
  Volume2,
  VolumeX,
  Radio,
  Zap,
} from 'lucide-react';

interface Props {
  activeTab: 'scanner' | 'analyzer' | 'backtest' | 'history';
  onChangeTab: (tab: 'scanner' | 'analyzer' | 'backtest' | 'history') => void;
  lastUpdated: string;
  secondsUntilNextScan: number;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  onOpenSettings: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onChangeTab,
  lastUpdated,
  secondsUntilNextScan,
  onManualRefresh,
  isRefreshing,
  onOpenSettings,
  soundEnabled,
  onToggleSound,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 border-b border-slate-800 backdrop-blur-md px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Live Beacon */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <Zap className="w-5 h-5 text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-100 tracking-tight">
                CRYPTO SIGNAL SCANNER
              </h1>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                LAYER 3
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-semibold">Live Market Feed</span>
              </div>
              <span>•</span>
              <span className="text-slate-500">Zero Database Engine</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => onChangeTab('scanner')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'scanner'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Market Scanner</span>
          </button>

          <button
            onClick={() => onChangeTab('analyzer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'analyzer'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Coin Analyzer</span>
          </button>

          <button
            onClick={() => onChangeTab('backtest')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'backtest'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Backtester</span>
          </button>

          <button
            onClick={() => onChangeTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Watchlist</span>
          </button>
        </div>

        {/* Timer, Refresh & Action Controls */}
        <div className="flex items-center gap-3">
          {/* Refresh Countdown Pill */}
          <div className="hidden sm:flex flex-col text-right font-mono text-[11px]">
            <span className="text-slate-300">
              Updated: <strong className="text-cyan-400">{lastUpdated}</strong>
            </span>
            <span className="text-slate-500 text-[10px]">
              Next scan in <strong className="text-cyan-300">{secondsUntilNextScan}s</strong>
            </span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors disabled:opacity-50"
            title="Scan market now"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title={soundEnabled ? 'Mute Alerts' : 'Enable Sound Alerts'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Engine parameters and weights"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
