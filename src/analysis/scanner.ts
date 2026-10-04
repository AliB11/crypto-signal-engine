import { Signal, SignalWeights, Timeframe } from '../types/market';
import { MarketDataProvider } from '../providers/MarketDataProvider';
import { runFullAnalysis } from './engine';

export interface ScannerResult {
  updatedAt: string;
  timestamp: number;
  totalScanned: number;
  timeframe: Timeframe;
  signals: Signal[];
  dataSource: 'live' | 'simulated';
  summary: {
    longs: number;
    shorts: number;
    noSignal: number;
    strongOrBetter: number;
    failed: number;
  };
}

export async function runScanner(
  provider: MarketDataProvider,
  symbols: string[],
  timeframe: Timeframe = '15m',
  concurrency = 4,
  weights?: Partial<SignalWeights>,
  dataSource: 'live' | 'simulated' = 'live'
): Promise<ScannerResult> {
  const results: Signal[] = [];
  let failed = 0;

  // Controlled concurrency batching
  for (let i = 0; i < symbols.length; i += concurrency) {
    const chunk = symbols.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (symbol) => {
      try {
        const full = await runFullAnalysis(provider, symbol, { timeframe, candleLimit: 120, weights });
        return full.signal;
      } catch {
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    for (const r of chunkResults) {
      if (r) results.push(r);
      else failed++;
    }
  }

  // Sort signals by score descending
  results.sort((a, b) => b.score - a.score);

  const longs = results.filter((s) => s.direction === 'LONG').length;
  const shorts = results.filter((s) => s.direction === 'SHORT').length;
  const noSignal = results.filter((s) => s.direction === 'NO_SIGNAL').length;
  const strongOrBetter = results.filter((s) => s.classification === 'STRONG' || s.classification === 'VERY_STRONG').length;

  return {
    updatedAt: new Date().toISOString(),
    timestamp: Date.now(),
    totalScanned: symbols.length,
    timeframe,
    signals: results,
    dataSource,
    summary: {
      longs,
      shorts,
      noSignal,
      strongOrBetter,
      failed,
    },
  };
}
