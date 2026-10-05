import { MarketDataProvider, computeDataQuality } from './MarketDataProvider';
import { BinanceProvider } from './BinanceProvider';
import { CoinGeckoProvider } from './CoinGeckoProvider';

/**
 * مدیر پروایدر داده.
 *
 * زنجیرهٔ واقعی تأمین داده به این شکل است:
 *   ۱. بایننس (فید اصلی؛ دارای cache، ادغام درخواست، قطع‌کنندهٔ مدار و تایم‌اوت)
 *   ۲. CoinGecko فقط برای «غنی‌سازی فراداده» (ارزش بازار) به‌صورت غیرمسدودکننده
 *   ۳. موتور شبیه‌سازی قطعی به‌عنوان آخرین سنگر (همیشه در دسترس، بدون شبکه)
 *
 * نکته: نمونهٔ «پروایدر جایگزین» کوین‌گکو در نسخهٔ قبلی ساخته می‌شد اما هیچ‌جا
 * استفاده نمی‌شد (کد مرده) و در پاسخ سلامت هم به‌عنوان fallback تبلیغ می‌شد.
 */
export class ProviderManager {
  private static instance: ProviderManager;
  private primaryProvider: MarketDataProvider;

  private constructor() {
    this.primaryProvider = new BinanceProvider();
  }

  public static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  public getPrimary(): MarketDataProvider {
    return this.primaryProvider;
  }
}

export const dataProvider = ProviderManager.getInstance().getPrimary();

/** منبع فعلی داده بر پایهٔ آخرین بازهٔ اندازه‌گیری‌شدهٔ پروایدر */
export function getDataSource(): 'live' | 'simulated' {
  const status = dataProvider.getDataStatus?.();
  return status && status.live ? 'live' : 'simulated';
}

export { BinanceProvider, CoinGeckoProvider, computeDataQuality };
export type { MarketDataProvider };
