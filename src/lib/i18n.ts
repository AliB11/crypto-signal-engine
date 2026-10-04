/**
 * نگاشت اصطلاحات تخصصی بازار به فارسی
 * کلیدها همان مقادیر ثابت (enum) سمت موتور تحلیل هستند و مقدارها برچسب فارسی.
 */

export const FA_CLASSIFICATION: Record<string, string> = {
  VERY_STRONG: 'خیلی قوی',
  STRONG: 'قوی',
  MODERATE: 'متوسط',
  WEAK: 'ضعیف',
  NO_SIGNAL: 'بدون سیگنال',
};

export const FA_DIRECTION: Record<string, string> = {
  LONG: 'خرید (لانگ)',
  SHORT: 'فروش (شورت)',
  NO_SIGNAL: 'خنثی / در انتظار',
};

export const FA_TREND: Record<string, string> = {
  BULLISH: 'صعودی',
  BEARISH: 'نزولی',
  RANGING: 'رنج',
  NEUTRAL: 'خنثی',
};

export const FA_REGIME: Record<string, string> = {
  TRENDING_BULLISH: 'روند صعودی',
  TRENDING_BEARISH: 'روند نزولی',
  RANGING: 'رنج',
  HIGH_VOLATILITY: 'نوسان بالا',
  LOW_VOLATILITY: 'نوسان کم',
  EXPANSION: 'انبساط',
  CONTRACTION: 'فشردگی',
};

export const FA_OI_TREND: Record<string, string> = {
  LONG_BUILDUP: 'انباشت لانگ',
  SHORT_BUILDUP: 'انباشت شورت',
  LONG_LIQUIDATION: 'لیکوئید شدن لانگ‌ها',
  SHORT_COVERING: 'پوشش شورت‌ها',
  NEUTRAL: 'خنثی',
};

export const FA_FUNDING_CATEGORY: Record<string, string> = {
  EXTREME_POSITIVE: 'مثبتِ افراطی',
  POSITIVE: 'مثبت',
  NEUTRAL: 'خنثی',
  NEGATIVE: 'منفی',
  EXTREME_NEGATIVE: 'منفیِ افراطی',
};

export const FA_POSITIONING: Record<string, string> = {
  LONG_DOMINANT: 'چیرگی لانگ‌ها',
  SHORT_DOMINANT: 'چیرگی شورت‌ها',
  BALANCED: 'متعادل',
  EXTREME_LONG: 'لانگ افراطی',
  EXTREME_SHORT: 'شورت افراطی',
};

export const FA_SESSION: Record<string, string> = {
  Asian: 'آسیا',
  London: 'لندن',
  'New York': 'نیویورک',
  'Between Sessions': 'بین جلسات',
};

export const FA_ENTRY_TYPE: Record<string, string> = {
  LIQUIDITY_RECLAIM: 'بازپس‌گیری نقدینگی',
  FVG: 'گپ نقدینگی (FVG)',
  ORDER_BLOCK: 'اوردر بلاک',
  STRUCTURE_RETEST: 'بازآزمایی ساختار',
};

export const FA_EXIT_REASON: Record<string, string> = {
  TP1: 'هدف اول',
  TP2: 'هدف دوم',
  TP3: 'هدف سوم',
  STOP_LOSS: 'حد ضرر',
  TIMEOUT: 'پایان زمان',
};

export const FA_LEVEL_TYPE: Record<string, string> = {
  SWING_HIGH: 'سقف نوسانی',
  SWING_LOW: 'کف نوسانی',
  EQUAL_HIGH: 'سقف برابر (EQH)',
  EQUAL_LOW: 'کف برابر (EQL)',
  PREVIOUS_DAY_HIGH: 'سقف روز قبل (PDH)',
  PREVIOUS_DAY_LOW: 'کف روز قبل (PDL)',
  PREVIOUS_WEEK_HIGH: 'سقف هفته قبل',
  PREVIOUS_WEEK_LOW: 'کف هفته قبل',
  SESSION_HIGH: 'سقف جلسه',
  SESSION_LOW: 'کف جلسه',
  LOCAL_HIGH: 'سقف محلی',
  LOCAL_LOW: 'کف محلی',
};

export const FA_RISK_LEVEL: Record<string, string> = {
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
};

/** نام فارسی ارزهای محبوب */
export const FA_COIN_NAMES: Record<string, string> = {
  Bitcoin: 'بیت‌کوین',
  Ethereum: 'اتریوم',
  BNB: 'بایننس کوین',
  Solana: 'سولانا',
  XRP: 'ریپل',
  Dogecoin: 'دوج‌کوین',
  Cardano: 'کاردانو',
  Avalanche: 'آوالانچ',
  Chainlink: 'چین‌لینک',
  Polkadot: 'پولکادات',
  Sui: 'سویی',
  'NEAR Protocol': 'نیر پروتکل',
  Aptos: 'آپتوس',
  Pepe: 'پپه',
  'Shiba Inu': 'شیبا اینو',
  Litecoin: 'لایت‌کوین',
  Uniswap: 'یونی‌سواپ',
  'Internet Computer': 'اینترنت کامپیوتر',
  Render: 'رندر',
  'Artificial Superintelligence': 'هوش مصنوعی فوق‌العاده (FET)',
};

/** نام فارسی نماد (بدون پسوند USDT) */
export function faCoinName(symbol: string, fallbackName?: string): string | null {
  if (fallbackName && FA_COIN_NAMES[fallbackName]) return FA_COIN_NAMES[fallbackName];
  const base = symbol.toUpperCase().replace(/USDT$/, '');
  return FA_COIN_NAMES[base] || null;
}

/** برچسب فارسی یک کلید ناشناخته؛ اگر نبود همان کلید را با حذف زیرخط برمی‌گرداند */
export function faLabel(map: Record<string, string>, key: string | undefined | null): string {
  if (!key) return '—';
  return map[key] || key.replace(/_/g, ' ');
}
