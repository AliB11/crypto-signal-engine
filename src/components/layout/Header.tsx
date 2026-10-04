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
  Zap,
  FlaskConical,
} from 'lucide-react';
import { toFaDigits } from '@/lib/format';

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
  dataSource: 'live' | 'simulated';
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
  dataSource,
}) => {
  const isLive = dataSource === 'live';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 border-b border-slate-800 backdrop-blur-md px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* برند و نشانگر وضعیت زنده */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <Zap className="w-5 h-5 text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-100">
                اسکنر سیگنال کریپتو
              </h1>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                لایه {toFaDigits(3)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isLive ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                {isLive ? (
                  <span className="text-emerald-400 font-semibold">فید زنده بازار</span>
                ) : (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" />
                    داده شبیه‌سازی‌شده
                  </span>
                )}
              </div>
              <span>•</span>
              <span className="text-slate-500">موتور بدون دیتابیس</span>
            </div>
          </div>
        </div>

        {/* تب‌های ناوبری */}
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
            <span>اسکنر بازار</span>
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
            <span>تحلیل کوین</span>
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
            <span>بک‌تست</span>
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
            <span className="hidden sm:inline">دیده‌بان</span>
          </button>
        </div>

        {/* شمارش معکوس، نوسازی و کنترل‌ها */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-start font-mono text-[11px]">
            <span className="text-slate-300">
              به‌روزرسانی: <strong className="text-cyan-400 num">{lastUpdated}</strong>
            </span>
            <span className="text-slate-500 text-[10px]">
              اسکن بعدی در <strong className="text-cyan-300">{toFaDigits(secondsUntilNextScan)} ثانیه</strong>
            </span>
          </div>

          {/* دکمه نوسازی */}
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors disabled:opacity-50"
            title="اسکن فوری بازار"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* کلید صدا */}
          <button
            onClick={onToggleSound}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title={soundEnabled ? 'قطع هشدار صوتی' : 'فعال‌سازی هشدار صوتی'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* دکمه تنظیمات */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="پارامترها و وزن‌های موتور"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
