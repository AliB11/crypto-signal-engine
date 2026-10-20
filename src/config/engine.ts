import { Timeframe } from '../types/market';

/**
 * پیکربندی مرجع موتور — تک‌منبعِ حقیقت.
 *
 * پیش‌تر این مقادیر (نسخه، وزن‌ها، جلسات، آستانه‌ها، نمادهای پیش‌فرض) در سه جای
 * مستقل تکرار شده بودند: مسیرهای `api/config`، `api/health`، worker کلادفلر و
 * مستندات. هر تغییر در یک جا، بقیه را ناسازگار می‌کرد.
 */
export const ENGINE_VERSION = '1.2.0';

/**
 * ساعات جلسات معاملاتی (UTC) — تک‌منبعِ حقیقت.
 *
 * موتور تحلیل (`analysis/sessions.ts`) و رابط کاربری هر دو از همین جدول می‌خوانند.
 * پیش‌تر موتور یک نسخه از این ساعات را داشت و رابط کاربری نسخهٔ دیگری را
 * هاردکد کرده بود (لندن «۰۷:۰۰–۱۵:۳۰» و نیویورک «۱۳:۰۰–۲۱:۳۰» در حالی که موتور
 * ۱۵:۰۰ و ۲۱:۰۰ را مبنا قرار می‌داد) — یعنی کاربر برچسبی می‌دید که با محاسبهٔ
 * واقعی موتور نمی‌خواند.
 */
export const SESSION_DEFINITIONS = {
  asian: { startHourUTC: 0, endHourUTC: 8, name: 'Asian (Tokyo / Sydney)' },
  london: { startHourUTC: 7, endHourUTC: 15, name: 'London (European)' },
  newYork: { startHourUTC: 13, endHourUTC: 21, name: 'New York (US)' },
} as const;

export type SessionKey = keyof typeof SESSION_DEFINITIONS;

/** برچسب خوانای بازهٔ یک جلسه، مثلاً `07:00 - 15:00 UTC` */
export function sessionHoursLabel(key: SessionKey): string {
  const { startHourUTC, endHourUTC } = SESSION_DEFINITIONS[key];
  const pad = (h: number) => String(h).padStart(2, '0');
  return `${pad(startHourUTC)}:00 - ${pad(endHourUTC)}:00 UTC`;
}

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

/**
 * دیده‌بان ایستای پشتیبان — *فقط* وقتی فهرست حجمی زندهٔ بایننس در دسترس نباشد.
 *
 * این فهرست «دادهٔ بازار» نیست (نه رتبه‌بندی زنده دارد، نه حجم)؛ صرفاً مجموعه‌ای
 * از جفت‌های نقدشونده است تا اسکنر در حالت قطعی شبکه بی‌ورودی نماند. پاسخ API
 * منبع فهرست را با `symbolsSource` اعلام می‌کند.
 */
export const FALLBACK_WATCHLIST = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'SUIUSDT', 'NEARUSDT', 'APTUSDT', 'PEPEUSDT', 'SHIBUSDT',
  'LTCUSDT', 'UNIUSDT', 'ICPUSDT', 'RENDERUSDT', 'FETUSDT',
  'ARBUSDT', 'OPUSDT', 'INJUSDT', 'TIAUSDT', 'SEIUSDT',
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
    fallbackWatchlist: FALLBACK_WATCHLIST,
  };
}

/** لایه‌های اسکن پشتیبانی‌شده (تعداد نمادهایی که در هر اسکن تحلیل می‌شوند) */
export type ScannerTier = 'top10' | 'top25' | 'top50';

export const SCANNER_TIERS: ScannerTier[] = ['top10', 'top25', 'top50'];

export const SCANNER_TIER_COUNTS: Record<ScannerTier, number> = {
  top10: 10,
  top25: 25,
  top50: 50,
};

export const DEFAULT_SCANNER_TIER: ScannerTier = 'top10';

/**
 * تبدیل پارامتر `tier` درخواست به یک لایهٔ معتبر.
 *
 * پیش‌تر هر مقدار ناشناخته (از جمله `'custom'` که در رابط کاربری تعریف شده بود
 * ولی هیچ دکمه‌ای نداشت) بی‌سروصدا به `top10` تبدیل می‌شد؛ یعنی کاربر می‌توانست
 * درخواستی بفرستد که نتیجه‌اش با چیزی که خواسته بود فرق داشت و هیچ خطایی هم
 * نمی‌گرفت. حالا مقدار نامعتبر صریحاً رد می‌شود.
 */
export function parseScannerTier(value: string | null | undefined): ScannerTier | null {
  if (value === null || value === undefined) return DEFAULT_SCANNER_TIER;
  return (SCANNER_TIERS as string[]).includes(value) ? (value as ScannerTier) : null;
}
