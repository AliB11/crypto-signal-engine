import { Kline, Timeframe } from '../types/market';
import { TIMEFRAME_MS } from './timeframes';

/**
 * بازنمونه‌گیری (downsample) کندل‌ها به تایم‌فریم بزرگ‌تر.
 * برای بک‌تست لازم است: تحلیل چندتایم‌فریم نباید فقط به تایم‌فریم اصلی محدود شود.
 * فقط زمانی معنا دارد که تایم‌فریم مقصد بزرگ‌تر (یا مساوی) مبدأ باشد.
 */
export function resampleKlines(klines: Kline[], targetTf: Timeframe): Kline[] {
  if (!klines || klines.length === 0) return [];
  const bucketSize = TIMEFRAME_MS[targetTf];
  if (!bucketSize) return [...klines];

  const buckets = new Map<number, Kline[]>();

  for (const kline of klines) {
    const bucket = Math.floor(kline.timestamp / bucketSize) * bucketSize;
    const list = buckets.get(bucket);
    if (list) list.push(kline);
    else buckets.set(bucket, [kline]);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, group]) => {
      const ordered = group.sort((a, b) => a.timestamp - b.timestamp);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      return {
        timestamp,
        open: first.open,
        high: Math.max(...ordered.map((k) => k.high)),
        low: Math.min(...ordered.map((k) => k.low)),
        close: last.close,
        volume: ordered.reduce((sum, k) => sum + k.volume, 0),
        closeTime: last.closeTime,
        quoteVolume: ordered.reduce((sum, k) => sum + k.quoteVolume, 0),
        trades: ordered.reduce((sum, k) => sum + k.trades, 0),
        takerBuyBaseVolume: ordered.reduce((sum, k) => sum + k.takerBuyBaseVolume, 0),
        takerBuyQuoteVolume: ordered.reduce((sum, k) => sum + k.takerBuyQuoteVolume, 0),
      } satisfies Kline;
    });
}
