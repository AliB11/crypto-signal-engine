import { Timeframe } from '../types/market';

/**
 * پیکربندی مرجع موتور — تک‌منبعِ حقیقت.
 *
 * پیش‌تر این مقادیر (نسخه، وزن‌ها، جلسات، آستانه‌ها، نمادهای پیش‌فرض) در سه جای
 * مستقل تکرار شده بودند: مسیرهای `api/config`، `api/health`، worker کلادفلر و
 * مستندات. هر تغییر در یک جا، بقیه را ناسازگار می‌کرد.
 */
export const ENGINE_VERSION = '1.1.0';

export const SESSION_DEFINITIONS = {
  asian: { startHourUTC: 0, endHourUTC: 8, name: 'Asian (Tokyo / Sydney)' },
  london: { startHourUTC: 7, endHourUTC: 15, name: 'London (European)' },
  newYork: { startHourUTC: 13, endHourUTC: 21, name: 'New York (US)' },
} as const;

export const ENGINE_THRESHOLDS = {
  minSignalScore: 50,
  strongSignalScore: 75,
  veryStrongSignalScore: 85,
  equalHighPercent: 0.25,
  sweepMinPenetration: 0.04,
  sweepMaxPenetration: 2.5,
  maxRiskPercent: 8,
} as const;

export const DEFAULT_SYMBOLS = [
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
] as const;

export const SUPPORTED_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

/** محدودیت اندازهٔ درخواست‌ها (برای جلوگیری از سوءاستفاده و بار سنگین روی پروایدر) */
export const LIMITS = {
  scannerMaxSymbols: 60,
  analysisCandleLimit: { min: 60, max: 1000, fallback: 200 },
  scannerCandleLimit: { min: 60, max: 400, fallback: 120 },
  backtestCandleLimit: { min: 100, max: 1500, fallback: 500 },
} as const;

/** پیکربندی عمومی موتور برای API و رابط کاربری */
export function getPublicConfig() {
  return {
    version: ENGINE_VERSION,
    timeframes: SUPPORTED_TIMEFRAMES,
    sessions: SESSION_DEFINITIONS,
    thresholds: ENGINE_THRESHOLDS,
    limits: LIMITS,
    defaultSymbols: DEFAULT_SYMBOLS,
  };
}
