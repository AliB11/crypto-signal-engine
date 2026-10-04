'use client';

import React, { useState, useEffect } from 'react';
import { Signal } from '@/types/market';
import {
  History,
  Star,
  Download,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BookmarkCheck,
} from 'lucide-react';

interface Props {
  onSelectSymbol: (symbol: string) => void;
  favorites: string[];
  onToggleFavorite: (symbol: string) => void;
}

interface SavedSignalSnapshot {
  id: string;
  savedAt: number;
  signal: Signal;
}

export const SignalHistory: React.FC<Props> = ({
  onSelectSymbol,
  favorites,
  onToggleFavorite,
}) => {
  const [snapshots, setSnapshots] = useState<SavedSignalSnapshot[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('crypto_signal_scanner_history');
      if (stored) {
        setSnapshots(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const clearHistory = () => {
    localStorage.removeItem('crypto_signal_scanner_history');
    setSnapshots([]);
  };

  const exportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snapshots, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `crypto_signals_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Watchlist Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm">Pinned Watchlist Assets</h3>
          </div>
          <span className="text-xs text-slate-400">{favorites.length} Pinned</span>
        </div>

        {favorites.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            No favorite symbols pinned yet. Click the star icon on any table row to pin assets here.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {favorites.map((sym) => (
              <div
                key={sym}
                onClick={() => onSelectSymbol(sym)}
                className="p-3 bg-slate-950/80 border border-slate-800 hover:border-cyan-500/60 rounded-lg cursor-pointer transition-all flex items-center justify-between group"
              >
                <div>
                  <span className="font-bold text-slate-200 text-xs block group-hover:text-cyan-300">
                    {sym}
                  </span>
                  <span className="text-[10px] text-slate-500">Quick Analyze</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(sym);
                  }}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Local Historical Snapshots */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 mb-4 gap-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm">
              Local Browser Signal History (Zero Server Database)
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {snapshots.length > 0 && (
              <>
                <button
                  onClick={exportJSON}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export JSON</span>
                </button>
                <button
                  onClick={clearHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 text-xs font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </>
            )}
          </div>
        </div>

        {snapshots.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <BookmarkCheck className="w-8 h-8 text-slate-600" />
            <span>No automatic local snapshots saved in this session yet.</span>
            <span className="text-[11px] text-slate-600">
              When high-confluence setups trigger, they are preserved locally in your browser.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                onClick={() => onSelectSymbol(snap.signal.symbol)}
                className="p-3 bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-lg flex items-center justify-between cursor-pointer transition-all text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-200 text-sm font-sans">
                    {snap.signal.symbol}
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      snap.signal.direction === 'LONG'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {snap.signal.direction}
                  </span>
                  <span className="font-mono text-cyan-400 font-bold">
                    Score: {snap.signal.score}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                  <span>{new Date(snap.savedAt).toLocaleTimeString()}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
