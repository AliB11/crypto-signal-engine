import { MarketDataProvider, computeDataQuality } from './MarketDataProvider';
import { BinanceProvider } from './BinanceProvider';
import { CoinGeckoProvider } from './CoinGeckoProvider';

/**
 * مدیر پروایدر داده.
 *
 * زنجیرهٔ واقعی تأمین داده به این شکل است:
 *   ۱. بایننس — فید اصلی (کندل، تیکر، مشتقات) با cache، ادغام درخواست،
 *      قطع‌کنندهٔ مدار و تایم‌اوت
 *   ۲. کوین‌گکو — فقط «فرادادهٔ واقعی بازار» (نام، رتبه، ارزش بازار، حجم ۲۴ساعته)
 *      که بایننس ارائه نمی‌دهد؛ در نبود آن، رتبه/ارزش بازار `null` گزارش می‌شود
 *   ۳. موتور شبیه‌سازی قطعی — آخرین سنگر در قطعی شبکه، همیشه با برچسب صریح
 *      `isSimulated` / `dataSource: 'simulated'` (و با `DATA_SIMULATION_FALLBACK=off`
 *      کاملاً قابل خاموش کردن)
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
