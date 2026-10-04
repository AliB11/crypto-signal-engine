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
import { AlertCircle, ShieldCheck } from 'lucide-react';

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
  const [secondsUntilNextScan, setSecondsUntilNextScan] = useState<number>(60);
  const [favorites, setFavorites] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  const [weights, setWeights] = useState<SignalWeights>(DEFAULT_WEIGHTS);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load favorites and weights from localStorage
  useEffect(() => {
    try {
      const storedFavs = localStorage.getItem('crypto_scanner_favorites');
      if (storedFavs) setFavorites(JSON.parse(storedFavs));

      const storedWeights = localStorage.getItem('crypto_scanner_weights');
      if (storedWeights) setWeights(JSON.parse(storedWeights));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Fetch Scanner Signals
  const fetchScannerSignals = useCallback(async () => {
    setIsLoadingSignals(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/scanner?tier=${tier}&tf=${currentTimeframe}`);
      if (!res.ok) throw new Error(`Scanner error: HTTP ${res.status}`);
      const data = await res.json();

      if (data.signals) {
        setSignals(data.signals);
        const dateObj = new Date(data.timestamp || Date.now());
        setLastUpdated(dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        // Check for Very Strong signals to notify
        const veryStrong = data.signals.filter((s: Signal) => s.classification === 'VERY_STRONG');
        if (veryStrong.length > 0 && soundEnabled) {
          playAlertSound();
        }

        // Save snapshot to localStorage
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
          // Ignore
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to scan market');
    } finally {
      setIsLoadingSignals(false);
      setSecondsUntilNextScan(60);
    }
  }, [tier, currentTimeframe, soundEnabled]);

  // Fetch Deep Coin Analysis
  const fetchCoinAnalysis = useCallback(async (symbol: string, tf: Timeframe) => {
    setIsLoadingCoin(true);
    try {
      const res = await fetch(`/api/analyze?symbol=${symbol}&tf=${tf}`);
      if (!res.ok) throw new Error(`Coin analysis error: HTTP ${res.status}`);
      const data = (await res.json()) as FullAnalysisResult;
      setCoinAnalysis(data);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsLoadingCoin(false);
    }
  }, []);

  // Play alert sound for high probability triggers
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
      // Audio not permitted without interaction
    }
  };

  // Initial scan & 60s countdown timer
  useEffect(() => {
    fetchScannerSignals();

    timerRef.current = setInterval(() => {
      setSecondsUntilNextScan((prev) => {
        if (prev <= 1) {
          fetchScannerSignals();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchScannerSignals]);

  // Trigger coin analysis when selected symbol or timeframe changes
  useEffect(() => {
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
    fetchScannerSignals();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Application Header */}
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
      />

      {/* Main Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={fetchScannerSignals}
              className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded font-semibold text-[11px]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Tab 1: Live Market Scanner Table */}
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

        {/* Tab 2: Deep Single Asset Analyzer */}
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
                <span>Loading deep multi-timeframe analysis for {selectedSymbol}...</span>
              </div>
            )}
          </>
        )}

        {/* Tab 3: Strategy Backtester & Walk-Forward Visualizer */}
        {activeTab === 'backtest' && (
          <BacktestDashboard
            initialSymbol={selectedSymbol}
            initialTimeframe={currentTimeframe}
          />
        )}

        {/* Tab 4: Local History & Watchlist */}
        {activeTab === 'history' && (
          <SignalHistory
            onSelectSymbol={handleSelectSymbol}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </main>

      {/* Global Disclaimer Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/90 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 font-semibold">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Serverless Quantitative Market Structure & Liquidity Engine</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">
            This platform executes deterministic multi-layer algorithmic analysis across Binance spot & futures feeds.
            All scores, invalidations, and trade zones represent mathematical confluence models and do not guarantee profits.
          </p>
        </div>
      </footer>

      {/* Engine Tuning & Settings Modal */}
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
