import { Kline, Ticker24h, DerivativesData, CoinMetadata, Timeframe } from '../types/market';

export interface MarketDataProvider {
  readonly name: string;
  getKlines(symbol: string, timeframe: Timeframe, limit?: number): Promise<Kline[]>;
  getTicker24h(symbol: string): Promise<Ticker24h>;
  getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit?: number
  ): Promise<Record<Timeframe, Kline[]>>;
  getDerivativesData(symbol: string): Promise<DerivativesData>;
  getMetadata(symbol: string): Promise<CoinMetadata | null>;
  getTopSymbols(count?: number): Promise<string[]>;
  /** وضعیت زنده بودن منبع داده (در صورت پشتیبانی پروایدر) */
  getDataStatus?(): { live: boolean };
}
