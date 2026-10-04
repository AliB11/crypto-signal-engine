import { NextResponse } from 'next/server';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    version: '1.0.0',
    weights: DEFAULT_WEIGHTS,
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    sessions: {
      asian: { startHourUTC: 0, endHourUTC: 8, name: 'Asian (Tokyo / Sydney)' },
      london: { startHourUTC: 7, endHourUTC: 15, name: 'London (European)' },
      newYork: { startHourUTC: 13, endHourUTC: 21, name: 'New York (US)' },
    },
    thresholds: {
      minSignalScore: 50,
      strongSignalScore: 75,
      veryStrongSignalScore: 85,
      equalHighPercent: 0.25,
      sweepMinPenetration: 0.04,
      sweepMaxPenetration: 2.5,
    },
    defaultSymbols: [
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'DOGEUSDT',
      'ADAUSDT',
      'AVAXUSDT',
      'LINKUSDT',
      'DOTUSDT',
    ],
  });
}
