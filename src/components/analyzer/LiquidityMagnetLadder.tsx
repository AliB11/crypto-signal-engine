'use client';

import React, { useMemo } from 'react';
import { LiquidityLevel } from '@/types/market';
import { ArrowDown, ArrowUp, Magnet, Target } from 'lucide-react';
import { faLabel, FA_LEVEL_TYPE } from '@/lib/i18n';
import { formatPrice, toFaDigits } from '@/lib/format';
import { computeLiquidityDraw, selectLiquidityMagnets, MagnetLevel } from '@/lib/liquidity-magnets';

interface Props {
  levels: LiquidityLevel[];
  currentPrice: number;
}

/**
 * «نردبان مغناطیس نقدینگی» — نزدیک‌ترین سطوح دست‌نخوردهٔ بالا و پایین قیمت.
 *
 * بازار به سمت مناطقی کشیده می‌شود که سفارش‌های تلنبارشده (استاپ‌ها و سفارش‌های
 * محدود) در آن‌ها باقی مانده است. این پنل همان «کشش نقدینگی» را به‌صورت نردبانی
 * نشان می‌دهد تا هدف‌های قیمتی به‌جای ضرایب ثابت، از ساختار واقعی بازار خوانده شوند.
 */
export const LiquidityMagnetLadder: React.FC<Props> = ({ levels, currentPrice }) => {
  const { above, below } = useMemo(
    () => selectLiquidityMagnets(levels, currentPrice, 3),
    [levels, currentPrice]
  );
  const draw = useMemo(() => computeLiquidityDraw(levels, currentPrice), [levels, currentPrice]);
  const sweptCount = levels.filter((l) => l.swept).length;

  const renderRow = (level: MagnetLevel) => (
    <div key={`${level.side}-${level.price}`} className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5 w-32 shrink-0">
        {level.side === 'ABOVE' ? (
          <ArrowUp className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        )}
        <span className="font-mono font-bold text-slate-200 text-xs num">
          {formatPrice(level.price)}
        </span>
      </div>

      <span
        className={`text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
          level.side === 'ABOVE'
            ? 'text-rose-300 bg-rose-950/50 border-rose-800/60'
            : 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
        }`}
      >
        {faLabel(FA_LEVEL_TYPE, level.type)}
      </span>

      <div className="flex-1 min-w-[70px] bg-slate-950 border border-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            level.side === 'ABOVE' ? 'bg-rose-500/80' : 'bg-emerald-500/80'
          }`}
          style={{ width: `${Math.max(6, Math.min(100, level.strength))}%` }}
        />
      </div>

      <span className="text-[10px] text-slate-500 font-mono w-16 text-left num shrink-0">
        {toFaDigits(level.distancePercent.toFixed(2))}٪
      </span>
    </div>
  );

  const hasLadder = above.length > 0 || below.length > 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Magnet className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-sm">نردبان مغناطیس نقدینگی</h3>
        </div>
        <span className="text-[10px] text-slate-500">
          {toFaDigits(draw.unsweptCount)} سطح دست‌نخورده · {toFaDigits(sweptCount)} سطح جاروشده
        </span>
      </div>

      {/* خلاصهٔ کشش دوطرفه */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span className="text-rose-300">
            کشش به سمت بالا ({toFaDigits(draw.upPercent)}٪)
          </span>
          <span
            className={`px-2 py-0.5 rounded-full border text-[10px] ${
              draw.direction === 'UP'
                ? 'text-rose-300 bg-rose-950/50 border-rose-800/60'
                : draw.direction === 'DOWN'
                ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
                : 'text-slate-400 bg-slate-950/60 border-slate-700'
            }`}
          >
            {draw.direction === 'UP'
              ? 'کشش غالب: بالا'
              : draw.direction === 'DOWN'
              ? 'کشش غالب: پایین'
              : 'کشش متعادل'}
          </span>
          <span className="text-emerald-300">
            کشش به سمت پایین ({toFaDigits(100 - draw.upPercent)}٪)
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden bg-slate-950 border border-slate-800 flex" dir="ltr">
          <div className="h-full bg-rose-500/80 transition-all duration-700" style={{ width: `${draw.upPercent}%` }} />
          <div
            className="h-full bg-emerald-500/80 transition-all duration-700"
            style={{ width: `${100 - draw.upPercent}%` }}
          />
        </div>
      </div>

      {hasLadder ? (
        <div className="flex flex-col divide-y divide-slate-800/60">
          {[...above].reverse().map(renderRow)}

          {/* ردیف قیمت فعلی */}
          <div className="flex items-center gap-3 py-2.5 bg-cyan-950/20 -mx-2 px-2 rounded-lg">
            <div className="flex items-center gap-1.5 w-32 shrink-0">
              <Target className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="font-mono font-black text-cyan-300 text-xs num">
                {formatPrice(currentPrice)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-cyan-300">قیمت فعلی</span>
            <div className="flex-1" />
          </div>

          {below.map(renderRow)}
        </div>
      ) : (
        <div className="py-6 text-center text-slate-500 text-xs">
          همهٔ سطوح رصدشده جارو شده‌اند؛ مغناطیس نقدینگیِ باقی‌مانده‌ای در محدودهٔ دید نیست.
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
        سطوح دست‌نخورده مانند آهنربا عمل می‌کنند؛ وزن هر سطح از «قدرت ساختاری ÷ فاصله» می‌آید.
        این یک سوگیری احتمالی است، نه تضمین حرکت قیمت.
      </p>
    </div>
  );
};
