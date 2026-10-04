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
  ArrowUpLeft,
  Flame,
  Gauge,
  BarChart3,
} from 'lucide-react';
import { formatPrice, toFaDigits } from '@/lib/format';
import { faLabel, FA_CLASSIFICATION, FA_REGIME } from '@/lib/i18n';

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
    const factor = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'score') return (a.score - b.score) * factor;
    if (sortBy === 'price') return (a.currentPrice - b.currentPrice) * factor;
    if (sortBy === 'rr') return ((a.tradePlan?.rrRatio || 0) - (b.tradePlan?.rrRatio || 0)) * factor;
    if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * factor;
    return 0;
  });

  // آمار نبض بازار
  const longCount = signals.filter((s) => s.direction === 'LONG').length;
  const shortCount = signals.filter((s) => s.direction === 'SHORT').length;
  const strongCount = signals.filter((s) => s.score >= 75).length;
  const avgScore =
    signals.length > 0
      ? Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length)
      : 0;
  const bestSignal = signals.length > 0 ? [...signals].sort((a, b) => b.score - a.score)[0] : null;

  const getClassificationBadge = (classification: Signal['classification']) => {
    switch (classification) {
      case 'VERY_STRONG':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
            {FA_CLASSIFICATION.VERY_STRONG}
          </span>
        );
      case 'STRONG':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            {FA_CLASSIFICATION.STRONG}
          </span>
        );
      case 'MODERATE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            {FA_CLASSIFICATION.MODERATE}
          </span>
        );
      case 'WEAK':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/60 text-slate-300 border border-slate-600">
            {FA_CLASSIFICATION.WEAK}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {FA_CLASSIFICATION.NO_SIGNAL}
          </span>
        );
    }
  };

  const getDirectionBadge = (direction: Signal['direction']) => {
    if (direction === 'LONG') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-xs shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>ستاپ خرید (لانگ)</span>
        </div>
      );
    }
    if (direction === 'SHORT') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold text-xs shadow-[0_0_12px_rgba(244,63,94,0.2)]">
          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          <span>ستاپ فروش (شورت)</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 font-medium text-xs">
        <Activity className="w-3.5 h-3.5 text-slate-500" />
        <span>انتظار / رِنج</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* نبض بازار — خلاصه وضعیت اسکن فعلی */}
      {signals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">ستاپ‌های خرید</div>
              <div className="font-mono font-black text-lg text-emerald-400 num">{longCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-rose-950 border border-rose-800/60 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4.5 h-4.5 text-rose-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">ستاپ‌های فروش</div>
              <div className="font-mono font-black text-lg text-rose-400 num">{shortCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-800/60 flex items-center justify-center shrink-0">
              <Gauge className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-semibold">میانگین امتیاز بازار</div>
              <div className="font-mono font-black text-lg text-cyan-400 num">{avgScore}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-purple-950 border border-purple-800/60 flex items-center justify-center shrink-0">
              <Flame className="w-4.5 h-4.5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 font-semibold">داغ‌ترین سیگنال</div>
              {bestSignal ? (
                <button
                  onClick={() => onSelectSymbol(bestSignal.symbol)}
                  className="font-bold text-sm text-purple-300 hover:text-purple-200 transition-colors truncate block"
                  title={`امتیاز ${bestSignal.score}`}
                >
                  <span className="num">{bestSignal.symbol.replace(/USDT$/, '')}</span>
                  <span className="text-slate-500 font-normal text-[10px]"> · امتیاز </span>
                  <span className="num">{bestSignal.score}</span>
                </button>
              ) : (
                <div className="font-mono text-sm text-slate-500">—</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* نوار کنترل‌ها */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* انتخاب محدوده اسکن و تایم‌فریم */}
          <div className="flex flex-wrap items-center gap-3">
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
                  {t === 'top10' ? `${toFaDigits(10)} ارز برتر` : t === 'top25' ? `${toFaDigits(25)} ارز برتر` : `${toFaDigits(50)} ارز برتر`}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onChangeTimeframe(tf)}
                  className={`px-2.5 py-1 rounded-md font-semibold num transition-all ${
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

          {/* فیلترها و جستجو */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                placeholder="جستجوی نماد (مثلاً BTC)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8 pl-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44 sm:w-56"
              />
            </div>

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
                    ? 'همه'
                    : f === 'LONGS'
                    ? 'خریدها'
                    : f === 'SHORTS'
                    ? 'فروش‌ها'
                    : f === 'STRONG_ONLY'
                    ? `امتیاز ≥ ${toFaDigits(75)}`
                    : '⭐ دیده‌بان'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* جدول سیگنال‌ها */}
        <div className="overflow-x-auto min-h-[380px]">
          {isLoading && signals.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">در حال اسکن نقدینگی و ساختار بازار در بایننس...</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-2">
              <ShieldAlert className="w-8 h-8 text-slate-600" />
              <span className="text-sm font-medium">هیچ سیگنالی با فیلترهای شما مطابقت ندارد</span>
              <span className="text-xs text-slate-600">تایم‌فریم را تغییر دهید یا جستجو را پاک کنید</span>
            </div>
          ) : (
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                  <th className="py-3 px-4">نماد</th>
                  <th className="py-3 px-4">قیمت</th>
                  <th className="py-3 px-4">جهت سیگنال</th>
                  <th className="py-3 px-4">امتیاز</th>
                  <th className="py-3 px-4">قدرت</th>
                  <th className="py-3 px-4">سوئیپ نقدینگی</th>
                  <th className="py-3 px-4">ساختار بازار</th>
                  <th className="py-3 px-4">هم‌راستایی تایم‌فریم‌ها</th>
                  <th className="py-3 px-4">ریسک به ریوارد</th>
                  <th className="py-3 px-4 text-left">عملیات</th>
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
                        isSelected ? 'bg-cyan-950/30 border-s-2 border-cyan-500' : ''
                      }`}
                    >
                      {/* نماد و ستاره */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(sig.symbol);
                            }}
                            className="text-slate-500 hover:text-amber-400 transition-colors"
                            title={isFav ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                          <span className="font-bold text-slate-100 text-sm num">
                            {sig.symbol}
                          </span>
                        </div>
                      </td>

                      {/* قیمت */}
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200 num">
                        {formatPrice(sig.currentPrice)}
                      </td>

                      {/* جهت */}
                      <td className="py-3.5 px-4">{getDirectionBadge(sig.direction)}</td>

                      {/* نشانگر امتیاز */}
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
                          <span className="font-bold font-mono text-slate-200 text-xs num">{sig.score}</span>
                        </div>
                      </td>

                      {/* قدرت سیگنال */}
                      <td className="py-3.5 px-4">{getClassificationBadge(sig.classification)}</td>

                      {/* وضعیت سوئیپ نقدینگی */}
                      <td className="py-3.5 px-4">
                        {hasSweep ? (
                          <div className="inline-flex items-center gap-1 text-purple-400 font-semibold text-[11px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
                            <Zap className="w-3 h-3 text-purple-400" />
                            <span>سوئیپ شناسایی شد</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px]">سوئیپ فعال نیست</span>
                        )}
                      </td>

                      {/* ساختار */}
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
                          {faLabel(FA_REGIME, sig.marketRegime.regime)}
                        </span>
                      </td>

                      {/* هم‌راستایی تایم‌فریم‌ها */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 font-mono text-slate-300 text-[11px]">
                          <span>
                            <span className="num">{sig.components.multiTimeframe}</span>٪ هم‌راستایی
                          </span>
                        </div>
                      </td>

                      {/* ریسک به ریوارد */}
                      <td className="py-3.5 px-4">
                        {sig.tradePlan ? (
                          <div className="font-mono font-bold text-cyan-400 text-xs">
                            <span className="num">{sig.tradePlan.rrRatio}:1</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* دکمه عملیات */}
                      <td className="py-3.5 px-4 text-left">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSymbol(sig.symbol);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 text-xs font-semibold transition-all shadow-sm"
                        >
                          <span>تحلیل</span>
                          <ArrowUpLeft className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* خلاصه آماری پاصفحه */}
        <div className="flex flex-wrap items-center justify-between p-3.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                ستاپ‌های خرید: <strong className="text-slate-200 num">{longCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>
                ستاپ‌های فروش: <strong className="text-slate-200 num">{shortCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>
                احتمال بالا (≥{toFaDigits(75)}): <strong className="text-slate-200 num">{strongCount}</strong>
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            نمایش {toFaDigits(sorted.length)} از {toFaDigits(signals.length)} نماد اسکن‌شده
          </div>
        </div>
      </div>
    </div>
  );
};
