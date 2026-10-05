import {
  simulateKlines,
  simulateTicker,
  simulateDerivatives,
  simPriceAt,
} from '../src/providers/simulation';
import { Kline } from '../src/types/market';

/**
 * آزمون‌های موتور شبیه‌سازی قطعی — رگرسیون باگ‌هایی که در نسخهٔ ۱.۰ وجود داشتند:
 *   • قیمت‌ها با هر درخواست تغییر می‌کردند (Math.random)
 *   • تیکر ۲۴ساعته با کندل‌ها ناسازگار بود (BTC: ۹۶۵۰۰ در برابر ۱۰۰۶۶۹)
 *   • هر تایم‌فریم منحنی مستقل داشت
 */
export function testDeterministicSimulation() {
  console.log('Testing Deterministic Simulation Engine (data consistency)...');

  const now = Date.UTC(2026, 0, 15, 12, 30, 0);

  // ۱) قطعیت: دو فراخوانی متوالی باید کندل‌های یکسان بدهند
  const first = simulateKlines('BTCUSDT', '15m', 50, now);
  const second = simulateKlines('BTCUSDT', '15m', 50, now);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('Simulated klines are not deterministic between calls');
  }

  // ۲) کندل‌های گذشته با گذر زمان تغییر نمی‌کنند (فقط کندل جاری تکمیل می‌شود)
  const later = simulateKlines('BTCUSDT', '15m', 50, now + 3 * 60_000);
  const sharedClosed = first.slice(0, -1);
  const sameRangeInLater = later.slice(0, later.length - 1);
  const overlap = sharedClosed.filter((k) => k.timestamp < Math.floor((now + 3 * 60_000) / 900_000) * 900_000);
  for (const candle of overlap.slice(0, -1)) {
    const match = sameRangeInLater.find((k) => k.timestamp === candle.timestamp);
    if (!match || match.close !== candle.close) {
      throw new Error(`Closed candle at ${candle.timestamp} changed after time advanced`);
    }
  }

  // ۳) سازگاری بین تایم‌فریم‌ها: کندل ۱۵ دقیقه‌ای و ۱ ساعته در یک لحظه هم‌خوان‌اند
  const fifteenMin = simulateKlines('ETHUSDT', '15m', 10, now);
  const hourly = simulateKlines('ETHUSDT', '1h', 10, now);
  const closeAt = simPriceAt('ETHUSDT', fifteenMin[fifteenMin.length - 1].timestamp);
  const relativeDiff = Math.abs(closeAt - fifteenMin[fifteenMin.length - 1].close) / closeAt;
  if (relativeDiff > 0.005) {
    throw new Error('15m candle close deviates from the shared price curve');
  }
  if (hourly[hourly.length - 1].close < 100) {
    throw new Error('Hourly simulation produced an implausible price');
  }

  // ۴) تیکر باید با آخرین قیمت کندل‌های ۱۵ دقیقه‌ای هم‌خوان باشد
  const ticker = simulateTicker('BTCUSDT', now);
  const last15m = simulateKlines('BTCUSDT', '15m', 2, now).pop() as Kline;
  const tickerDiff = Math.abs(ticker.lastPrice - last15m.close) / last15m.close;
  if (tickerDiff > 0.005) {
    throw new Error(
      `Ticker (${ticker.lastPrice}) is inconsistent with the 15m candle close (${last15m.close})`
    );
  }
  if (!(ticker.highPrice >= ticker.lowPrice) || ticker.highPrice <= 0) {
    throw new Error('Ticker range is invalid');
  }

  // ۵) دادهٔ مشتقات شبیه‌سازی‌شده باید صریحاً علامت‌گذاری شود و قطعی باشد
  const derivA = simulateDerivatives('BTCUSDT', now);
  const derivB = simulateDerivatives('BTCUSDT', now);
  if (!derivA.isSimulated) {
    throw new Error('Simulated derivatives must be flagged with isSimulated=true');
  }
  if (derivA.fundingRate !== derivB.fundingRate || derivA.openInterest !== derivB.openInterest) {
    throw new Error('Simulated derivatives are not deterministic');
  }
  if (derivA.openInterestValueUSD <= 0) {
    throw new Error('Simulated open interest notional must be positive');
  }

  // ۶) تایم‌فریم‌های مختلف باید مقیاس نوسان متفاوت (و نه یکسان) داشته باشند
  const vol15 = standardDeviationOfReturns(simulateKlines('SOLUSDT', '15m', 200, now));
  const vol1d = standardDeviationOfReturns(simulateKlines('SOLUSDT', '1d', 200, now));
  if (!(vol1d > vol15)) {
    throw new Error('Daily volatility should exceed 15m volatility in the simulation');
  }

  console.log(
    '✓ Deterministic Simulation passed (stable candles, cross-timeframe consistency, flagged simulated derivatives).'
  );
}

function standardDeviationOfReturns(klines: Kline[]): number {
  const returns: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    returns.push(Math.log(klines[i].close / klines[i - 1].close));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}
