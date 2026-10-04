'use client';

import React, { useState } from 'react';
import { BacktestReport, Timeframe } from '@/types/market';
import {
  Play,
  TrendingUp,
  Award,
  AlertTriangle,
  PieChart,
} from 'lucide-react';
import { formatPrice, toFaDigits, formatFaDateTime } from '@/lib/format';
import { faLabel, FA_DIRECTION, FA_EXIT_REASON } from '@/lib/i18n';

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
        throw new Error(`بک‌تست با خطای سرور (${res.status}) مواجه شد`);
      }

      const data = (await res.json()) as BacktestReport;
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // اجرای اولیه بک‌تست هنگام ورود به تب
  React.useEffect(() => {
    if (!report && !isLoading) {
      // اجرای خودکار بک‌تست در ورود به تب — فقط یک‌بار
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleRunBacktest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = report?.overallMetrics;
  const walkForward = report?.walkForward;
  const failure = report?.failureBreakdown;

  return (
    <div className="flex flex-col gap-6">
      {/* سربرگ کنترل‌ها */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* نماد دارایی */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">نماد دارایی</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                dir="ltr"
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

            {/* تایم‌فریم */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">تایم‌فریم</label>
              <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                {(['5m', '15m', '1h', '4h'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded font-semibold num ${
                      timeframe === tf ? 'bg-cyan-600 text-white shadow' : 'text-slate-400'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* حداقل امتیاز سیگنال */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400">حداقل امتیاز سیگنال:</label>
                <span className="text-xs font-mono font-bold text-cyan-400 num">{minScore}</span>
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

            {/* عمق کندل‌ها */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">عمق داده تاریخی</label>
              <select
                value={candleLimit}
                onChange={(e) => setCandleLimit(Number(e.target.value))}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="300">{toFaDigits(300)} کندل</option>
                <option value="500">{toFaDigits(500)} کندل</option>
                <option value="1000">{toFaDigits(1000)} کندل</option>
              </select>
            </div>
          </div>

          {/* دکمه اجرا */}
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
            <span>{isLoading ? 'در حال شبیه‌سازی...' : 'اجرای بک‌تست کمّی'}</span>
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
          {/* کارت‌های شاخص عملکرد */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">نرخ برد</span>
              <span
                className={`font-mono text-xl font-black block num ${
                  overall.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.winRate}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block num">
                {overall.winningTrades} برد / {overall.losingTrades} باخت
              </span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">فاکتور سود</span>
              <span
                className={`font-mono text-xl font-black block num ${
                  overall.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {overall.profitFactor}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">سود/زیان ناخالص</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">امید ریاضی</span>
              <span
                className={`font-mono text-xl font-black block num ${
                  overall.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.expectancy > 0 ? '+' : ''}
                {overall.expectancy}R
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">به ازای هر معامله</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">حداکثر افت سرمایه</span>
              <span className="font-mono text-xl font-black text-rose-400 block num">
                -{overall.maxDrawdownPercent}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">از اوج تا کف</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">بازده خالص</span>
              <span
                className={`font-mono text-xl font-black block num ${
                  overall.cumulativeReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overall.cumulativeReturnPercent >= 0 ? '+' : ''}
                {overall.cumulativeReturnPercent}%
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">ریسک ۱٪ در هر معامله</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">میانگین ریوارد</span>
              <span className="font-mono text-xl font-black text-cyan-400 block num">1:{overall.avgRR}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">تحقق‌یافته</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">نسبت شارپ</span>
              <span className="font-mono text-xl font-black text-slate-200 block num">{overall.sharpeRatio}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">تعدیل‌شده با ریسک</span>
            </div>

            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl shadow-md text-center">
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">نسبت سورتینو</span>
              <span className="font-mono text-xl font-black text-slate-200 block num">{overall.sortinoRatio}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">ریسک نزولی</span>
            </div>
          </div>

          {/* منحنی سرمایه */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  منحنی سرمایه شبیه‌سازی‌شده (بدون سوگیری نگاه به آینده)
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                سرمایه اولیه: <strong className="num">$10,000</strong> • تعداد معاملات:{' '}
                <strong className="num">{overall.totalTrades}</strong>
              </span>
            </div>

            {/* نمودار خطی منحنی سرمایه */}
            <div dir="ltr" className="w-full h-48 relative flex items-end">
              {overall.equityCurve.length > 1 ? (
                <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

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
                  در این بازه تعداد معاملات کافی تولید نشد
                </div>
              )}
            </div>
          </div>

          {/* اعتبارسنجی پیش‌رو و عیب‌یابی سیگنال‌های کاذب */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-slate-100 text-sm">اعتبارسنجی پیش‌رو (سه‌بخشی)</h3>
                </div>
                {walkForward?.overfitWarning ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                    ⚠ هشدار بیش‌برازش
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ✓ اعتبارسنجی شد
                  </span>
                )}
              </div>

              {walkForward && (
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                        <th className="py-2">بخش</th>
                        <th className="py-2">معاملات</th>
                        <th className="py-2">نرخ برد</th>
                        <th className="py-2">فاکتور سود</th>
                        <th className="py-2">حداکثر افت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">آموزش (۶۰٪)</td>
                        <td className="py-2.5 text-slate-300 num">{walkForward.training.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400 num">{walkForward.training.winRate}%</td>
                        <td className="py-2.5 text-cyan-400 num">{walkForward.training.profitFactor}</td>
                        <td className="py-2.5 text-rose-400 num">-{walkForward.training.maxDrawdownPercent}%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">اعتبارسنجی (۲۰٪)</td>
                        <td className="py-2.5 text-slate-300 num">{walkForward.validation.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400 num">{walkForward.validation.winRate}%</td>
                        <td className="py-2.5 text-cyan-400 num">{walkForward.validation.profitFactor}</td>
                        <td className="py-2.5 text-rose-400 num">-{walkForward.validation.maxDrawdownPercent}%</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 font-sans font-bold text-slate-200">خارج از نمونه (۲۰٪)</td>
                        <td className="py-2.5 text-slate-300 num">{walkForward.outOfSample.totalTrades}</td>
                        <td className="py-2.5 text-emerald-400 num">{walkForward.outOfSample.winRate}%</td>
                        <td className="py-2.5 text-cyan-400 num">{walkForward.outOfSample.profitFactor}</td>
                        <td className="py-2.5 text-rose-400 num">-{walkForward.outOfSample.maxDrawdownPercent}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* تفکیک علل شکست ستاپ‌های زیان‌ده */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100 text-sm">تحلیل علل شکست ستاپ‌های زیان‌ده</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  مجموع ضررها: <span className="num">{failure?.totalLosses || 0}</span>
                </span>
              </div>

              {failure && failure.totalLosses > 0 ? (
                <div className="flex flex-col gap-2.5 text-xs">
                  {[
                    { label: 'شکست سطح نقدینگی (بدون بازپس‌گیری)', count: failure.liquidityFailures, color: 'bg-rose-500' },
                    { label: 'شکست جعلی و تله ادامه حرکت', count: failure.falseBreakouts, color: 'bg-purple-500' },
                    { label: 'دیسپلیسمنت ضعیف و رکود مومنتوم', count: failure.weakDisplacement, color: 'bg-amber-500' },
                    { label: 'تضاد با روند کلان تایم‌فریم بالا', count: failure.badHTFAlignment, color: 'bg-blue-500' },
                    { label: 'عدم تأیید حجمی', count: failure.volumeFailure, color: 'bg-cyan-500' },
                    { label: 'فشار فاندینگ افراطی', count: failure.extremeFundingSqueeze, color: 'bg-pink-500' },
                  ]
                    .filter((row) => row.count > 0)
                    .map((row) => (
                      <div key={row.label}>
                        <div className="flex justify-between mb-1 text-slate-300">
                          <span>{row.label}</span>
                          <span className="font-mono num">{row.count}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${row.color} h-full rounded-full`}
                            style={{ width: `${(row.count / failure.totalLosses) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  برای پیکربندی فعلی، تفکیک ضرری در دسترس نیست
                </div>
              )}
            </div>
          </div>

          {/* جدول لاگ معاملات شبیه‌سازی‌شده */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-slate-100 text-sm">
                گزارش اجرای شبیه‌سازی‌شده (<span className="num">{report.trades.length}</span> معامله)
              </h3>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span>
                  بازه:{' '}
                  <span className="num">
                    {new Date(report.startDate).toLocaleDateString('fa-IR')} –{' '}
                    {new Date(report.endDate).toLocaleDateString('fa-IR')}
                  </span>
                </span>
                <span>
                  میانگین نگهداری: <span className="num">{overall.avgHoldCandles}</span> کندل
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-right text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-sans text-[11px]">
                    <th className="py-2.5 px-4">جهت</th>
                    <th className="py-2.5 px-4">زمان ورود</th>
                    <th className="py-2.5 px-4">قیمت ورود</th>
                    <th className="py-2.5 px-4">حد ضرر</th>
                    <th className="py-2.5 px-4">هدف ۱ / هدف ۲</th>
                    <th className="py-2.5 px-4">قیمت خروج</th>
                    <th className="py-2.5 px-4">نتیجه</th>
                    <th className="py-2.5 px-4">ریوارد محقق‌شده</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {report.trades
                    .slice(-25)
                    .reverse()
                    .map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-sans font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              t.direction === 'LONG'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {faLabel(FA_DIRECTION, t.direction)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">
                          {formatFaDateTime(t.entryTime)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-200 num">{formatPrice(t.entryPrice)}</td>
                        <td className="py-2.5 px-4 text-rose-400 num">{formatPrice(t.stopLoss)}</td>
                        <td className="py-2.5 px-4 text-emerald-400 num">
                          {formatPrice(t.tp1)} / {formatPrice(t.tp2)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 num">{formatPrice(t.exitPrice)}</td>
                        <td className="py-2.5 px-4">
                          <span className={`font-sans font-bold ${t.status === 'WIN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.status === 'WIN' ? 'برد' : 'باخت'} ({faLabel(FA_EXIT_REASON, t.exitReason)})
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-bold text-cyan-400 num">
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
