'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Signal, FullAnalysisResult, Timeframe, SignalWeights } from '@/types/market';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { Header } from '@/components/layout/Header';
import { ScannerTable } from '@/components/scanner/ScannerTable';
import { CoinAnalyzer } from '@/components/analyzer/CoinAnalyzer';
import { BacktestDashboard } from '@/components/backtester/BacktestDashboard';
import { SignalHistory } from '@/components/history/SignalHistory';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { AlertCircle, ShieldCheck, BellRing, X } from 'lucide-react';
import { faLabel, FA_CLASSIFICATION } from '@/lib/i18n';

const SCAN_INTERVAL_SECONDS = 60;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'analyzer' | 'backtest' | 'history'>('scanner');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [coinAnalysis, setCoinAnalysis] = useState<FullAnalysisResult | null>(null);
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>('15m');
  const [tier, setTier] = useState<'top10' | 'top25' | 'top50' | 'custom'>('top10');

  const [isLoadingSignals, setIsLoadingSignals] = useState(true);
  const [isLoadingCoin, setIsLoadingCoin] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('--:--:--');
  const [secondsUntilNextScan, setSecondsUntilNextScan] = useState<number>(SCAN_INTERVAL_SECONDS);
  const [favorites, setFavorites] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  const [weights, setWeights] = useState<SignalWeights>(DEFAULT_WEIGHTS);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'live' | 'simulated'>('live');
  const [toast, setToast] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScanningRef = useRef(false);

  // بارگذاری علاقه‌مندی‌ها و وزن‌ها از حافظه محلی
  useEffect(() => {
    try {
      const storedFavs = localStorage.getItem('crypto_scanner_favorites');
      // آب‌سازی اولیه از حافظه محلی — فقط یک‌بار هنگام مانت اجرا می‌شود
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (storedFavs) setFavorites(JSON.parse(storedFavs));

      const storedWeights = localStorage.getItem('crypto_scanner_weights');
      if (storedWeights) {
        const parsed = JSON.parse(storedWeights) as Partial<SignalWeights>;
         
        setWeights({ ...DEFAULT_WEIGHTS, ...parsed });
      }
    } catch {
      // خطاهای دسترسی به حافظه محلی نادیده گرفته می‌شوند
    }
  }, []);

  // نمایش توست با پنهان‌سازی خودکار
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // پخش صدای هشدار برای سیگنال‌های با احتمال بالا
  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // پخش صدا بدون تعامل کاربری مجاز نیست
    }
  };

  // دریافت سیگنال‌های اسکنر — وزن‌های سفارشی کاربر هم به موتور ارسال می‌شوند
  const fetchScannerSignals = useCallback(async () => {
    if (isScanningRef.current) return; // جلوگیری از اسکن هم‌زمان تکراری
    isScanningRef.current = true;
    setIsLoadingSignals(true);
    setErrorMessage(null);
    try {
      const weightsParam = encodeURIComponent(JSON.stringify(weights));
      const res = await fetch(`/api/scanner?tier=${tier}&tf=${currentTimeframe}&weights=${weightsParam}`);
      if (!res.ok) throw new Error(`خطای اسکنر بازار: وضعیت HTTP ${res.status}`);
      const data = await res.json();

      if (data.dataSource === 'simulated') {
        setDataSource('simulated');
      }

      if (data.signals) {
        setSignals(data.signals);
        const dateObj = new Date(data.timestamp || Date.now());
        setLastUpdated(
          dateObj.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );

        // اطلاع‌رسانی سیگنال‌های خیلی قوی
        const veryStrong = data.signals.filter((s: Signal) => s.classification === 'VERY_STRONG');
        if (veryStrong.length > 0) {
          showToast(
            `🔔 ${veryStrong.length} سیگنال ${faLabel(FA_CLASSIFICATION, 'VERY_STRONG')} شناسایی شد: ${veryStrong
              .map((s: Signal) => s.symbol)
              .slice(0, 3)
              .join('، ')}`
          );
          if (soundEnabled) playAlertSound();
        }

        // ذخیره تصویر لحظه‌ای در حافظه محلی مرورگر
        try {
          const stored = localStorage.getItem('crypto_signal_scanner_history');
          const historyList = stored ? JSON.parse(stored) : [];
          veryStrong.forEach((sig: Signal) => {
            historyList.unshift({
              id: `${sig.symbol}_${Date.now()}`,
              savedAt: Date.now(),
              signal: sig,
            });
          });
          localStorage.setItem('crypto_signal_scanner_history', JSON.stringify(historyList.slice(0, 50)));
        } catch {
          // نادیده گرفته می‌شود
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'اسکن بازار با خطا مواجه شد');
    } finally {
      setIsLoadingSignals(false);
      isScanningRef.current = false;
      setSecondsUntilNextScan(SCAN_INTERVAL_SECONDS);
    }
  }, [tier, currentTimeframe, soundEnabled, weights, showToast]);

  // دریافت تحلیل عمیق یک کوین — با اعمال وزن‌های سفارشی کاربر
  const fetchCoinAnalysis = useCallback(
    async (symbol: string, tf: Timeframe) => {
      setIsLoadingCoin(true);
      try {
        const weightsParam = encodeURIComponent(JSON.stringify(weights));
        const res = await fetch(`/api/analyze?symbol=${symbol}&tf=${tf}&weights=${weightsParam}`);
        if (!res.ok) throw new Error(`خطای تحلیل کوین: وضعیت HTTP ${res.status}`);
        const data = (await res.json()) as FullAnalysisResult;
        setCoinAnalysis(data);
      } catch (err: unknown) {
        console.error(err);
      } finally {
        setIsLoadingCoin(false);
      }
    },
    [weights]
  );

  // اسکن اولیه + شمارش معکوس؛ منطق اسکن از به‌روزرسانی حالت جدا شده تا در
  // حالت StrictMode درخواست تکراری ارسال نشود
  useEffect(() => {
    // واکشی داده از منبع خارجی هنگام مانت — الگوی استاندارد
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchScannerSignals();
  }, [fetchScannerSignals]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      // به‌روزرسانی شمارنده داخل کال‌بک تایمر انجام می‌شود (نه همگام با بدنه افکت)
       
      setSecondsUntilNextScan((prev) => (prev <= 1 ? SCAN_INTERVAL_SECONDS : prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // وقتی شمارنده از ۱ به مقدار اولیه بازمی‌گردد، اسکن جدید اجرا می‌شود
  const previousCountRef = useRef(SCAN_INTERVAL_SECONDS);
  useEffect(() => {
    if (previousCountRef.current === 1 && secondsUntilNextScan === SCAN_INTERVAL_SECONDS) {
       
      fetchScannerSignals();
    }
    previousCountRef.current = secondsUntilNextScan;
  }, [secondsUntilNextScan, fetchScannerSignals]);

  // شروع تحلیل کوین با تغییر نماد یا تایم‌فریم
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCoinAnalysis(selectedSymbol, currentTimeframe);
  }, [selectedSymbol, currentTimeframe, fetchCoinAnalysis]);

  const handleSelectSymbol = (symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveTab('analyzer');
  };

  const handleToggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol];
      localStorage.setItem('crypto_scanner_favorites', JSON.stringify(next));
      return next;
    });
  };

  const handleSaveWeights = (newWeights: SignalWeights) => {
    setWeights(newWeights);
    localStorage.setItem('crypto_scanner_weights', JSON.stringify(newWeights));
    // وزن‌های جدید بلافاصله در اسکن بعدی و تحلیل کوین اعمال می‌شوند
    setSecondsUntilNextScan(SCAN_INTERVAL_SECONDS);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* سربرگ اصلی برنامه */}
      <Header
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        lastUpdated={lastUpdated}
        secondsUntilNextScan={secondsUntilNextScan}
        onManualRefresh={fetchScannerSignals}
        isRefreshing={isLoadingSignals}
        onOpenSettings={() => setIsSettingsOpen(true)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        dataSource={dataSource}
      />

      {/* محتوای اصلی صفحه */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={fetchScannerSignals}
              className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded font-semibold text-[11px] shrink-0"
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {/* تب ۱: جدول زنده اسکنر بازار */}
        {activeTab === 'scanner' && (
          <ScannerTable
            signals={signals}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={handleSelectSymbol}
            isLoading={isLoadingSignals}
            tier={tier}
            onChangeTier={setTier}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            currentTimeframe={currentTimeframe}
            onChangeTimeframe={setCurrentTimeframe}
          />
        )}

        {/* تب ۲: تحلیل عمیق یک دارایی */}
        {activeTab === 'analyzer' && (
          <>
            {coinAnalysis ? (
              <CoinAnalyzer
                analysis={coinAnalysis}
                timeframe={currentTimeframe}
                onChangeTimeframe={setCurrentTimeframe}
                isLoading={isLoadingCoin}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-24 text-slate-400 gap-3">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span>
                  در حال بارگذاری تحلیل عمیق چندتایم‌فریم برای <span className="font-bold num">{selectedSymbol}</span>...
                </span>
              </div>
            )}
          </>
        )}

        {/* تب ۳: بک‌تست استراتژی و اعتبارسنجی پیش‌رو */}
        {activeTab === 'backtest' && (
          <BacktestDashboard
            initialSymbol={selectedSymbol}
            initialTimeframe={currentTimeframe}
          />
        )}

        {/* تب ۴: دیده‌بان و تاریخچه محلی */}
        {activeTab === 'history' && (
          <SignalHistory
            onSelectSymbol={handleSelectSymbol}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* توست اطلاع‌رسانی سیگنال خیلی قوی */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-toast-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 border border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.25)] backdrop-blur-md max-w-sm">
            <BellRing className="w-5 h-5 text-cyan-400 shrink-0" />
            <span className="text-xs text-slate-200 leading-relaxed">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
              title="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* پاصفحه سلب مسئولیت */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/90 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 font-semibold">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>موتور بدون سرور تحلیل ساختار بازار و نقدینگی</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            این سامانه تحلیل الگوریتمی چندلایه خود را روی فیدهای اسپات و آتی بایننس اجرا می‌کند.
            همه امتیازها، حد ضررها و نواحی معامله، مدل‌های هم‌افزایی ریاضی هستند و تضمینی بر سود نیستند.
          </p>
        </div>
      </footer>

      {/* مودال تنظیمات موتور */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        weights={weights}
        onSaveWeights={handleSaveWeights}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />
    </div>
  );
}
