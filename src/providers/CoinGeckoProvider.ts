import { Kline, Ticker24h, DerivativesData, CoinMetadata, Timeframe } from '../types/market';
import { MarketDataProvider } from './MarketDataProvider';

export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = 'coingecko';
  private baseUrl = 'https://api.coingecko.com/api/v3';

  // Mapping from USDT pairs to CoinGecko IDs
  private symbolMap: Record<string, string> = {
    BTCUSDT: 'bitcoin',
    ETHUSDT: 'ethereum',
    BNBUSDT: 'binancecoin',
    SOLUSDT: 'solana',
    XRPUSDT: 'ripple',
    DOGEUSDT: 'dogecoin',
    ADAUSDT: 'cardano',
    AVAXUSDT: 'avalanche-2',
    LINKUSDT: 'chainlink',
    DOTUSDT: 'polkadot',
    SUIUSDT: 'sui',
    NEARUSDT: 'near',
    APTUSDT: 'aptos',
    PEPEUSDT: 'pepe',
    SHIBUSDT: 'shiba-inu',
  };

  async getKlines(symbol: string, timeframe: Timeframe, limit = 100): Promise<Kline[]> {
    const coinId = this.symbolMap[symbol.toUpperCase()] || 'bitcoin';
    try {
      const days = timeframe === '1d' ? '30' : timeframe === '4h' ? '7' : '1';
      const res = await fetch(`${this.baseUrl}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) throw new Error(`CoinGecko OHLC error: ${res.status}`);
      const raw = (await res.json()) as number[][];

      return raw.slice(-limit).map((c) => ({
        timestamp: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: 0,
        closeTime: c[0] + 60000,
        quoteVolume: 0,
        trades: 0,
        takerBuyBaseVolume: 0,
        takerBuyQuoteVolume: 0,
      }));
    } catch {
      return [];
    }
  }

  async getTicker24h(symbol: string): Promise<Ticker24h> {
    const coinId = this.symbolMap[symbol.toUpperCase()] || 'bitcoin';
    try {
      const res = await fetch(
        `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true`
      );
      if (!res.ok) throw new Error('CoinGecko price fetch failed');
      const data = await res.json();
      const coin = data[coinId];

      const price = coin?.usd || 0;
      const change = coin?.usd_24h_change || 0;
      const vol = coin?.usd_24h_vol || 0;

      return {
        symbol: symbol.toUpperCase(),
        priceChange: (price * change) / 100,
        priceChangePercent: change,
        lastPrice: price,
        highPrice: price * 1.02,
        lowPrice: price * 0.98,
        volume: vol / price,
        quoteVolume: vol,
        openPrice: price - (price * change) / 100,
        closeTime: Date.now(),
      };
    } catch {
      return {
        symbol: symbol.toUpperCase(),
        priceChange: 0,
        priceChangePercent: 0,
        lastPrice: 0,
        highPrice: 0,
        lowPrice: 0,
        volume: 0,
        quoteVolume: 0,
        openPrice: 0,
        closeTime: Date.now(),
      };
    }
  }

  async getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit = 100
  ): Promise<Record<Timeframe, Kline[]>> {
    const map: Partial<Record<Timeframe, Kline[]>> = {};
    for (const tf of timeframes) {
      map[tf] = await this.getKlines(symbol, tf, limit);
    }
    return map as Record<Timeframe, Kline[]>;
  }

  async getDerivativesData(symbol: string): Promise<DerivativesData> {
    return {
      symbol: symbol.toUpperCase(),
      openInterest: 0,
      openInterestValueUSD: 0,
      oiChange1hPercent: 0,
      oiChange24hPercent: 0,
      oiTrend: 'NEUTRAL',
      fundingRate: 0.0001,
      fundingRateAnnualizedPercent: 10.95,
      fundingCategory: 'NEUTRAL',
      globalLongShortRatio: 1.0,
      topTraderLongShortRatio: 1.0,
      topTraderPositionRatio: 1.0,
      positioning: 'BALANCED',
      takerBuySellRatio: 1.0,
      timestamp: Date.now(),
    };
  }

  async getMetadata(symbol: string): Promise<CoinMetadata | null> {
    const coinId = this.symbolMap[symbol.toUpperCase()];
    if (!coinId) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
      if (!res.ok) return null;
      const data = await res.json();

      return {
        id: data.id,
        symbol: symbol.toUpperCase(),
        name: data.name,
        rank: data.market_cap_rank || 50,
        marketCapUSD: data.market_data?.market_cap?.usd || 0,
        volume24hUSD: data.market_data?.total_volume?.usd || 0,
        priceChange24h: data.market_data?.price_change_percentage_24h || 0,
        source: 'coingecko',
      };
    } catch {
      return null;
    }
  }

  async getTopSymbols(count = 25): Promise<string[]> {
    return Object.keys(this.symbolMap).slice(0, count);
  }
}
