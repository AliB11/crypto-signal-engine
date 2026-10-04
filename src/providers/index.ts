import { MarketDataProvider } from './MarketDataProvider';
import { BinanceProvider } from './BinanceProvider';
import { CoinGeckoProvider } from './CoinGeckoProvider';

export class ProviderManager {
  private static instance: ProviderManager;
  private primaryProvider: MarketDataProvider;
  private fallbackProvider: MarketDataProvider;

  private constructor() {
    this.primaryProvider = new BinanceProvider();
    this.fallbackProvider = new CoinGeckoProvider();
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

  public getFallback(): MarketDataProvider {
    return this.fallbackProvider;
  }
}

export const dataProvider = ProviderManager.getInstance().getPrimary();
export { BinanceProvider, CoinGeckoProvider };
export type { MarketDataProvider };
