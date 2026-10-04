'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  LineStyle,
} from 'lightweight-charts';
import { Kline, LiquidityLevel, LiquiditySweep, MarketStructureSummary, TradePlan, Timeframe } from '@/types/market';
import { faLabel, FA_LEVEL_TYPE, FA_TREND } from '@/lib/i18n';
import { formatPrice } from '@/lib/format';

interface Props {
  candles: Kline[];
  liquidityLevels?: LiquidityLevel[];
  sweeps?: LiquiditySweep[];
  structure?: MarketStructureSummary;
  tradePlan?: TradePlan | null;
  timeframe: Timeframe;
  symbol: string;
}

export const TradingViewChart: React.FC<Props> = ({
  candles,
  liquidityLevels = [],
  sweeps = [],
  structure,
  tradePlan,
  timeframe,
  symbol,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const [activeOverlayTab, setActiveOverlayTab] = useState<'ALL' | 'LIQUIDITY' | 'STRUCTURE' | 'PLAN'>('ALL');

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { color: '#090d16' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
        horzLine: { color: '#38bdf8', width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: timeframe === '1m',
        borderColor: '#1e293b',
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
      },
    });

    chartInstanceRef.current = chart;

    const candleSeries: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const formattedData: CandlestickData<Time>[] = candles
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((k) => ({
        time: (Math.floor(k.timestamp / 1000) as unknown) as Time,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

    candleSeries.setData(formattedData);

    // خطوط برنامه معامله
    if (tradePlan && (activeOverlayTab === 'ALL' || activeOverlayTab === 'PLAN')) {
      candleSeries.createPriceLine({
        price: tradePlan.entry.optimal,
        color: '#06b6d4',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'ورود بهینه',
      });

      candleSeries.createPriceLine({
        price: tradePlan.stopLoss,
        color: '#f43f5e',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `حد ضرر (-${tradePlan.stopLossPercent}%)`,
      });

      candleSeries.createPriceLine({
        price: tradePlan.tp1,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `هدف ۱ (+${tradePlan.tp1Percent}%)`,
      });

      candleSeries.createPriceLine({
        price: tradePlan.tp2,
        color: '#34d399',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `هدف ۲ (+${tradePlan.tp2Percent}%)`,
      });
    }

    // سطوح کلیدی نقدینگی (EQH، EQL، PDH، PDL و...)
    if (liquidityLevels.length > 0 && (activeOverlayTab === 'ALL' || activeOverlayTab === 'LIQUIDITY')) {
      const topLevels = liquidityLevels.filter((l) => l.strength >= 80).slice(0, 6);
      topLevels.forEach((lvl) => {
        let color = '#a855f7';
        if (lvl.type === 'EQUAL_HIGH' || lvl.type === 'EQUAL_LOW') color = '#ec4899';
        else if (lvl.type === 'PREVIOUS_DAY_HIGH' || lvl.type === 'PREVIOUS_DAY_LOW') color = '#eab308';
        else if (lvl.type === 'SESSION_HIGH' || lvl.type === 'SESSION_LOW') color = '#3b82f6';

        candleSeries.createPriceLine({
          price: lvl.price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `${faLabel(FA_LEVEL_TYPE, lvl.type)}${lvl.swept ? ' (سوئیپ‌شده)' : ''}`,
        });
      });
    }

    // رویدادهای ساختاری (BOS / MSS) — پیش‌تر تب «ساختار» خروجی خالی داشت
    if (structure && (activeOverlayTab === 'ALL' || activeOverlayTab === 'STRUCTURE')) {
      const structureEvents = [structure.recentBOS, structure.recentMSS].filter(
        (e): e is NonNullable<typeof e> => Boolean(e)
      );
      structureEvents.slice(0, 4).forEach((ev) => {
        const isMSS = ev.type === 'MSS';
        candleSeries.createPriceLine({
          price: ev.price,
          color: isMSS ? '#f59e0b' : '#22d3ee',
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: `${isMSS ? 'MSS' : 'BOS'} ${faLabel(FA_TREND, ev.direction)}`,
        });
      });

      // میانه گپ‌های نقدینگی پرنشده
      structure.fvgs
        .filter((f) => !f.filled)
        .slice(-3)
        .forEach((fvg) => {
          candleSeries.createPriceLine({
            price: fvg.midpoint,
            color: '#8b5cf6',
            lineWidth: 1,
            lineStyle: LineStyle.LargeDashed,
            axisLabelVisible: true,
            title: 'گپ نقدینگی (FVG)',
          });
        });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (container && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ width: container.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [candles, liquidityLevels, structure, tradePlan, activeOverlayTab, timeframe, symbol]);

  const lastSweep = sweeps.length > 0 ? sweeps[sweeps.length - 1] : null;

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* نوار بالای نمودار */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 tracking-wide text-lg num">{symbol}</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950 text-cyan-400 border border-cyan-800 num">
              {timeframe.toUpperCase()}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <span>
              کندل‌ها: <span className="num">{candles.length}</span>
            </span>
            <span>•</span>
            <span className="text-emerald-400">فید زنده بایننس</span>
          </div>
        </div>

        {/* فیلتر لایه‌های نمایش */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          {(['ALL', 'LIQUIDITY', 'STRUCTURE', 'PLAN'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveOverlayTab(tab)}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeOverlayTab === tab
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL'
                ? 'همه لایه‌ها'
                : tab === 'LIQUIDITY'
                ? 'نقشه نقدینگی'
                : tab === 'STRUCTURE'
                ? 'ساختار'
                : 'برنامه معامله'}
            </button>
          ))}
        </div>
      </div>

      {/* بوم اصلی نمودار — بوم نمودار مالی چپ‌به‌راست ایزوله می‌شود */}
      <div className="relative w-full h-[480px]">
        <div dir="ltr" ref={chartContainerRef} className="w-full h-full" />

        {/* نشان‌های شناور */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-10 text-[11px]">
          {lastSweep && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-950/90 border border-purple-700/60 text-purple-300 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>
                سوئیپ اخیر: {faLabel(FA_LEVEL_TYPE, lastSweep.levelType)} @ {formatPrice(lastSweep.levelPrice)}
              </span>
            </div>
          )}

          {structure?.recentMSS && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/90 border border-amber-700/60 text-amber-300 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>
                تغییر ساختار (MSS): {faLabel(FA_TREND, structure.recentMSS.direction)} @{' '}
                {formatPrice(structure.recentMSS.price)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* راهنمای رنگ‌ها */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950 text-[11px] text-slate-400 border-t border-slate-800 gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-500 rounded-full" />
            <span>محدوده ورود</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 rounded-full" />
            <span>حد ضرر (بی‌اعتبارسازی)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
            <span>اهداف سود</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-pink-500 rounded-full" />
            <span>سقف‌ها / کف‌های برابر</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-yellow-500 rounded-full" />
            <span>سقف / کف روز قبل</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-violet-500 rounded-full" />
            <span>گپ نقدینگی (FVG)</span>
          </div>
        </div>

        <div className="text-slate-500">نمودار سبک‌وزن مالی • بدون وابستگی به دیتابیس</div>
      </div>
    </div>
  );
};
