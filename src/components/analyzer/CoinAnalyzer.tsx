'use client';

import React, { useState } from 'react';
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
  CheckCircle,
  Compass,
  Copy,
  Check,
} from 'lucide-react';
import { formatPrice, formatSignedPercent } from '@/lib/format';
import {
  faCoinName,
  faLabel,
  FA_ENTRY_TYPE,
  FA_OI_TREND,
  FA_REGIME,
  FA_RISK_LEVEL,
  FA_SESSION,
  FA_TREND,
} from '@/lib/i18n';

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
  const [copied, setCopied] = useState(false);

  const persianName = faCoinName(symbol, analysis.metadata?.name);

  /** ساخت متن برنامه معامله برای کپی در کلیپ‌بورد */
  const buildPlanText = (): string => {
    if (!tradePlan) return '';
    const dirFa = signal.direction === 'LONG' ? 'خرید (لانگ)' : 'فروش (شورت)';
    return [
      `🎯 برنامه معامله ${symbol} — ${dirFa}`,
      `⏱ تایم‌فریم: ${timeframe} | امتیاز اطمینان: ${signal.score}/100`,
      ``,
      `📍 محدوده ورود (${faLabel(FA_ENTRY_TYPE, tradePlan.entry.type)}):`,
      `   ${formatPrice(tradePlan.entry.min)} تا ${formatPrice(tradePlan.entry.max)} (بهینه: ${formatPrice(tradePlan.entry.optimal)})`,
      `🛑 حد ضرر: ${formatPrice(tradePlan.stopLoss)} (${tradePlan.stopLossPercent}%-)`,
      `✅ هدف ۱: ${formatPrice(tradePlan.tp1)} (+${tradePlan.tp1Percent}%)`,
      `✅ هدف ۲: ${formatPrice(tradePlan.tp2)} (+${tradePlan.tp2Percent}%)`,
      `✅ هدف ۳: ${formatPrice(tradePlan.tp3)} (+${tradePlan.tp3Percent}%)`,
      `⚖️ ریسک به ریوارد: 1:${tradePlan.rrRatio} | ریسک: ${faLabel(FA_RISK_LEVEL, tradePlan.riskLevel)}`,
      ``,
      `دلایل:`,
      ...signal.reasons.map((r) => `• ${r}`),
      ...(signal.warnings.length > 0 ? [``, `هشدارها:`, ...signal.warnings.map((w) => `⚠️ ${w}`)] : []),
      ``,
      `⚠️ این یک تحلیل الگوریتمی است و توصیه مالی قطعی نیست.`,
    ].join('\n');
  };

  const handleCopyPlan = async () => {
    try {
      await navigator.clipboard.writeText(buildPlanText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // دسترسی کلیپ‌بورد در برخی مرورگرها محدود است
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* سربرگ دارایی */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-xl gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-100 num">{symbol}</h2>
              {(persianName || analysis.metadata?.name) && (
                <span className="text-xs text-slate-400 font-medium">
                  ({persianName || analysis.metadata?.name})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs text-slate-400">
              <span className="font-mono text-base font-bold text-slate-100 num">
                {formatPrice(ticker.lastPrice)}
              </span>
              <span
                className={`font-semibold font-mono num ${
                  ticker.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedPercent(ticker.priceChangePercent)}
              </span>
              <span>•</span>
              <span>
                حجم ۲۴ساعته: <span className="num">${(ticker.quoteVolume / 1000000).toFixed(1)}M</span>
              </span>
            </div>
          </div>
        </div>

        {/* بنر جهت سیگنال و امتیاز */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => onChangeTimeframe(tf)}
                className={`px-3 py-1.5 rounded-md font-semibold num transition-all ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {signal.direction === 'LONG' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-bold text-sm shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>ستاپ خرید (لانگ) شناسایی شد</span>
            </div>
          ) : signal.direction === 'SHORT' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-300 font-bold text-sm shadow-[0_0_15px_rgba(244,63,94,0.25)]">
              <TrendingDown className="w-5 h-5 text-rose-400" />
              <span>ستاپ فروش (شورت) شناسایی شد</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm">
              <Activity className="w-5 h-5 text-slate-400" />
              <span>ستاپ جهت‌داری فعال نیست</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">امتیاز اطمینان:</span>
            <span
              className={`font-mono font-extrabold text-base num ${
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

      {/* هشدار کهنگی یا شبیه‌سازی بودن داده */}
      {(analysis.dataSource === 'simulated' || signal.isStale) && (
        <div className="p-3.5 bg-amber-950/50 border border-amber-800/70 rounded-xl text-xs text-amber-300 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {analysis.dataSource === 'simulated'
              ? 'دسترسی به بایننس از این سرور برقرار نشد؛ داده‌های نمایش‌داده‌شده شبیه‌سازی‌شده هستند و برای تصمیم معاملاتی واقعی مناسب نیستند.'
              : 'جریان داده دارای تأخیر است؛ پیش از تصمیم‌گیری، قیمت لحظه‌ای را بررسی کنید.'}
          </span>
        </div>
      )}

      {/* شبکه اصلی: نمودار + کارت برنامه معامله */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        <div className="flex flex-col gap-4">
          {/* کارت برنامه معامله */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4 gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">برنامه معامله کمّی</h3>
              </div>
              <div className="flex items-center gap-2">
                {tradePlan && (
                  <button
                    onClick={handleCopyPlan}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-[10px] font-semibold transition-colors border border-slate-700"
                    title="کپی برنامه کامل معامله"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>کپی برنامه</span>
                      </>
                    )}
                  </button>
                )}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  ریسک: {tradePlan ? faLabel(FA_RISK_LEVEL, tradePlan.riskLevel) : '—'}
                </span>
              </div>
            </div>

            {tradePlan ? (
              <div className="flex flex-col gap-3.5 text-xs">
                {/* محدوده ورود */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/60">
                  <div>
                    <div className="text-slate-400 text-[11px] font-semibold">
                      محدوده ورود ({faLabel(FA_ENTRY_TYPE, tradePlan.entry.type)})
                    </div>
                    <div className="font-mono font-bold text-cyan-300 text-sm num">
                      {formatPrice(tradePlan.entry.min)} – {formatPrice(tradePlan.entry.max)}
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400">بهینه</span>
                    <div className="font-mono font-bold text-cyan-400 num">
                      {formatPrice(tradePlan.entry.optimal)}
                    </div>
                  </div>
                </div>

                {/* حد ضرر ساختاری */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60">
                  <div>
                    <div className="text-slate-400 text-[11px] font-semibold">حد ضرر (بی‌اعتبارسازی)</div>
                    <div className="font-mono font-bold text-rose-400 text-sm num">
                      {formatPrice(tradePlan.stopLoss)}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-rose-300 text-xs num">
                    -{tradePlan.stopLossPercent}%
                  </div>
                </div>

                {/* اهداف سود */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'هدف ۱', price: tradePlan.tp1, pct: tradePlan.tp1Percent },
                    { label: 'هدف ۲', price: tradePlan.tp2, pct: tradePlan.tp2Percent },
                    { label: 'هدف ۳', price: tradePlan.tp3, pct: tradePlan.tp3Percent },
                  ].map((tp) => (
                    <div key={tp.label} className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                      <span className="text-[10px] text-slate-400 font-semibold block">{tp.label}</span>
                      <span className="font-mono font-bold text-emerald-400 text-xs block num">
                        {formatPrice(tp.price)}
                      </span>
                      <span className="text-[10px] text-emerald-300 font-mono num">+{tp.pct}%</span>
                    </div>
                  ))}
                </div>

                {/* ریسک به ریوارد */}
                <div className="flex items-center justify-between p-2 bg-slate-950 rounded-lg border border-slate-800 font-mono">
                  <span className="text-slate-400 text-[11px] font-sans">ریسک به ریوارد محاسبه‌شده:</span>
                  <span className="font-bold text-cyan-400 text-sm num">1:{tradePlan.rrRatio}</span>
                </div>

                {/* دلیل بی‌اعتباری */}
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  <span className="text-rose-400 font-semibold">شرط بی‌اعتباری: </span>
                  {tradePlan.invalidationReason}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 gap-2">
                <AlertTriangle className="w-8 h-8 text-slate-600" />
                <span className="text-xs font-semibold">برنامه معامله با احتمال بالا فعال نیست</span>
                <span className="text-[11px]">
                  هم‌افزایی ساختار بازار و نقدینگی در حال حاضر کافی نیست.
                </span>
              </div>
            )}
          </div>

          {/* چک‌لیست دلایل قابل‌توضیح */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex-1">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-3">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-slate-100 text-sm">دلایل فنی قابل‌توضیح</h3>
            </div>

            <div className="flex flex-col gap-2">
              {signal.reasons.map((reason, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span className="leading-relaxed">{reason}</span>
                </div>
              ))}

              {signal.warnings.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-amber-400">هشدارها و ریسک‌ها:</span>
                  {signal.warnings.map((warn, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px] text-amber-300/90">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{warn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* تفکیک سه‌لایه نقدینگی پیشرفته */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* لایه ۱: نقدینگی پایه */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                <h4 className="font-bold text-slate-200 text-sm">لایه ۱: نقدینگی پایه</h4>
              </div>
              <span className="font-mono font-bold text-pink-400 text-xs num">
                {layer3.layer1BasicLiquidity.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">سقف‌های برابر (EQH):</span>
                <span className="font-mono font-bold text-slate-100 num">
                  {layer3.layer1BasicLiquidity.equalHighs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">کف‌های برابر (EQL):</span>
                <span className="font-mono font-bold text-slate-100 num">
                  {layer3.layer1BasicLiquidity.equalLows.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">فاصله تا سقف روز قبل:</span>
                <span className="font-mono text-slate-100 num">
                  {layer3.layer1BasicLiquidity.pdhDistancePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">فاصله تا کف روز قبل:</span>
                <span className="font-mono text-slate-100 num">
                  {layer3.layer1BasicLiquidity.pdlDistancePercent}%
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            نقاط نوسانی و خوشه‌های حد ضرر انباشته‌شده
          </div>
        </div>

        {/* لایه ۲: نقدینگی ساختاری */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <h4 className="font-bold text-slate-200 text-sm">لایه ۲: نقدینگی ساختاری</h4>
              </div>
              <span className="font-mono font-bold text-purple-400 text-xs num">
                {layer3.layer2StructuralLiquidity.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">سوئیپ‌های فعال:</span>
                <span className="font-mono font-bold text-purple-400 num">
                  {layer3.layer2StructuralLiquidity.activeSweeps.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">تغییر ساختار بازار (MSS):</span>
                <span className="font-mono font-bold text-slate-100">
                  {layer3.layer2StructuralLiquidity.activeMSS
                    ? faLabel(FA_TREND, layer3.layer2StructuralLiquidity.activeMSS.direction)
                    : 'ندارد'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">گپ‌های نقدینگی (FVG) پرنشده:</span>
                <span className="font-mono font-bold text-slate-100 num">
                  {layer3.layer2StructuralLiquidity.recentFVGs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">امتیاز دیسپلیسمنت:</span>
                <span className="font-mono font-bold text-slate-100 num">
                  {layer3.layer2StructuralLiquidity.displacementScore}/100
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            شکست ساختار (BOS)، تغییر شخصیت (MSS)، گپ‌های نقدینگی و اوردر بلاک‌ها
          </div>
        </div>

        {/* لایه ۳: زمینه پیشرفته */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                <h4 className="font-bold text-slate-200 text-sm">لایه ۳: زمینه پیشرفته</h4>
              </div>
              <span className="font-mono font-bold text-cyan-400 text-xs num">
                {layer3.layer3AdvancedContext.score}/100
              </span>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">هم‌راستایی تایم بالا:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.htfAlignment ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.htfAlignment ? 'تأیید شده' : 'نامشخص'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">سوئیپ + MSS + دیسپلیسمنت:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.sweepPlusMSSDisplacement ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.sweepPlusMSSDisplacement ? 'هم‌افزایی فعال' : 'در انتظار'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">هم‌افزایی مشتقات:</span>
                <span
                  className={`font-semibold ${
                    layer3.layer3AdvancedContext.derivativesConfluence ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {layer3.layer3AdvancedContext.derivativesConfluence ? 'جریان هم‌راستا' : 'خنثی'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">رژیم بازار:</span>
                <span className="font-bold text-cyan-300">
                  {faLabel(FA_REGIME, marketRegime.regime)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            تلفیق بین تایم‌فریم‌ها و جریان مشتقات برای زمینه جامع
          </div>
        </div>
      </div>

      {/* پنل‌های نقدینگی جلسات و مشتقات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* نقدینگی جلسات */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-slate-100 text-sm">نقدینگی جلسات معاملاتی و محدوده‌ها</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-950 text-blue-400 border border-blue-800">
              جلسه فعال: {faLabel(FA_SESSION, sessionLiquidity.currentSession)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { key: 'asian', title: 'آسیا', hours: '00:00 - 08:00 UTC' },
                { key: 'london', title: 'لندن', hours: '07:00 - 15:30 UTC' },
                { key: 'newYork', title: 'نیویورک', hours: '13:00 - 21:30 UTC' },
              ] as const
            ).map(({ key, title, hours }) => {
              const sess = sessionLiquidity.sessions[key];
              return (
                <div
                  key={key}
                  className={`p-3 rounded-lg border flex flex-col justify-between ${
                    sess.isActive
                      ? 'bg-blue-950/40 border-blue-500/60'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-200 text-xs">{title}</span>
                      {sess.isActive && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 num">{hours}</div>
                  </div>

                  <div className="mt-3 text-[11px] flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">سقف:</span>
                      <span className="font-mono text-slate-300 num">{formatPrice(sess.high)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">کف:</span>
                      <span className="font-mono text-slate-300 num">{formatPrice(sess.low)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        {key === 'asian' ? 'دامنه:' : key === 'london' ? 'سوئینگ جوداس:' : 'بازگشت نیویورک:'}
                      </span>
                      {key === 'asian' ? (
                        <span className="font-mono text-cyan-400 num">{sess.rangePercent}%</span>
                      ) : key === 'london' ? (
                        <span
                          className={`font-semibold ${
                            sessionLiquidity.judasSwingDetected ? 'text-purple-400' : 'text-slate-500'
                          }`}
                        >
                          {sessionLiquidity.judasSwingDetected ? 'شناسایی شد' : 'خیر'}
                        </span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            sessionLiquidity.nyReversalDetected ? 'text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          {sessionLiquidity.nyReversalDetected ? 'شناسایی شد' : 'خیر'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* پنل مشتقات و جریان سفارش‌ها */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-slate-100 text-sm">مشتقات آتی و جریان سفارش‌ها</h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
              فید آتی بایننس
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* روند قراردادهای باز */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">
                روند قراردادهای باز (OI)
              </span>
              <span className="font-bold text-slate-200 block">
                {faLabel(FA_OI_TREND, derivatives.oiTrend)}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono mt-1 block num">
                {formatSignedPercent(derivatives.oiChange1hPercent)} در ۱ ساعت
              </span>
            </div>

            {/* فاندینگ ریت */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">فاندینگ (۸ساعته)</span>
              <span
                className={`font-mono font-bold block num ${
                  derivatives.fundingRate >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {(derivatives.fundingRate * 100).toFixed(4)}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block num">
                {derivatives.fundingRateAnnualizedPercent.toFixed(1)}% سالانه
              </span>
            </div>

            {/* نسبت لانگ/شورت */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">
                نسبت لانگ/شورت کل
              </span>
              <span className="font-mono font-bold text-cyan-400 block text-sm num">
                {derivatives.globalLongShortRatio.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                معامله‌گران برتر: <span className="num">{derivatives.topTraderLongShortRatio.toFixed(2)}</span>
              </span>
            </div>

            {/* عدم تعادل تیکر */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">عدم تعادل تیکر</span>
              <span
                className={`font-mono font-bold block num ${
                  volumeMetrics.imbalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedPercent(volumeMetrics.imbalance, 1)}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">
                RVOL: <span className="num">{volumeMetrics.rvol}x</span>
              </span>
            </div>
          </div>

          {/* توصیف هم‌افزایی تایم‌فریم‌ها */}
          <div className="mt-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-[11px] text-slate-400 leading-relaxed">
            {mtf.confluenceDescription}
          </div>
        </div>
      </div>

      {/* ماتریس هم‌افزایی تایم‌فریم‌ها */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              ماتریس هم‌افزایی تایم‌فریم‌ها (از بالا به پایین)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            هم‌افزایی: <strong className="text-cyan-400 num">{mtf.alignmentScore}%</strong>
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
                <span className="font-mono font-bold text-slate-200 text-xs block mb-1 num">{tf}</span>
                <span
                  className={`font-semibold text-xs block ${
                    isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {faLabel(FA_TREND, data?.trend) || 'رِنج'}
                </span>
                <span className="text-[10px] text-slate-500 mt-1 block font-mono num">
                  امتیاز: {data?.structureScore || 50}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
