import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    service: 'crypto-advanced-signal-scanner',
    version: '1.0.0',
    mode: 'serverless-memory',
    primaryProvider: 'binance-public',
    fallbackProvider: 'coingecko',
    timestamp: new Date().toISOString(),
  });
}
