'use client';

import React, { useMemo } from 'react';
import { Signal } from '@/types/market';
import { Activity, Compass, Gauge, PieChart, Waves } from 'lucide-react';
import { faLabel, FA_REGIME } from '@/lib/i18n';
import { toFaDigits } from '@/lib/format';
import {
  biasLabel,
  computeMarketPulse,
  describeMarketPulse,
  trendStrengthLabel,
  volatilityLabel,
} from '@/lib/market-pulse';

interface Props {
  signals: Signal[];
}

/**
 * «نبض کلان بازار» — تصویری واحد از سوگیری، روند و نوسان کل بازاری که اسکن شده
 * است. این پنل از تجمیع همان سیگنال‌های اسکنر ساخته می‌شود و هیچ درخواست اضافه‌ای
 * به سرور نمی‌فرستد.
 */
export const MarketPulsePanel: React.FC<Props> = ({ signals }) => {
  const pulse = useMemo(() => computeMarketPulse(signals), [signals]);

  const totalWeight = pulse.longWeight + pulse.shortWeight;
  const longShare = totalWeight > 0 ? (pulse.longWeight / totalWeight) * 100 : 50;

  const biasTone =
    pulse.bias === 'BULLISH'
      ? 'text-emerald-400 border-emerald-800/60 bg-emerald-950/40'
      : pulse.bias === 'BEARISH'
      ? 'text-rose-400 border-rose-800/60 bg-rose-950/40'
      : 'text-slate-300 border-slate-700 bg-slate-950/50';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Waves className="w-4.5 h-4.5 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-sm">نبض کلان بازار</h3>
          <span className="text-[10px] text-slate-500">
            تجمیع {toFaDigits(pulse.scanned)} نماد اسکن‌شده
          </span>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${biasTone}`}>
          {biasLabel(pulse.bias)}
        </span>
      </div>

      {/* نوار دوطرفهٔ سهم وزنی ستاپ‌های خرید و فروش */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold">
          <span className="text-emerald-400">
            خرید ({toFaDigits(Math.round(longShare))}٪)
          </span>
          <span className="text-slate-500">سهم وزنی بر پایهٔ امتیاز ستاپ‌ها</span>
          <span className="text-rose-400">فروش ({toFaDigits(Math.round(100 - longShare))}٪)</span>
        </div>
        <div className="w-full h-2.5 rounded-full overflow-hidden bg-slate-950 border border-slate-800 flex" dir="ltr">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700"
            style={{ width: `${longShare}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-700"
            style={{ width: `${100 - longShare}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
          <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-semibold">قدرت روند (ADX)</div>
            <div className="text-[11px] text-slate-200 font-bold truncate">
              {trendStrengthLabel(pulse.trendStrength)}
              <span className="text-slate-500 font-mono text-[10px] num">
                {pulse.avgAdx === null ? '' : ` · ${toFaDigits(pulse.avgAdx)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
          <Activity className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-semibold">نوسان (میانهٔ ATR)</div>
            <div className="text-[11px] text-slate-200 font-bold truncate">
              {volatilityLabel(pulse.volatility)}
              <span className="text-slate-500 font-mono text-[10px] num">
                {pulse.medianAtrPercent === null ? '' : ` · ${toFaDigits(pulse.medianAtrPercent)}٪`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
          <Compass className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-semibold">رژیم غالب</div>
            <div className="text-[11px] text-slate-200 font-bold truncate">
              {pulse.dominantRegime ? faLabel(FA_REGIME, pulse.dominantRegime) : '—'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
          <PieChart className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 font-semibold">پوشش ستاپ جهت‌دار</div>
            <div className="text-[11px] text-slate-200 font-bold truncate">
              <span className="num">{toFaDigits(pulse.directional)}</span> از{' '}
              <span className="num">{toFaDigits(pulse.scanned)}</span> نماد (
              <span className="num">{toFaDigits(pulse.coveragePercent)}</span>٪)
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2.5">
        {describeMarketPulse(pulse)}
      </p>
    </div>
  );
};
