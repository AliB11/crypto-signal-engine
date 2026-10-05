import {
  Kline,
  Ticker24h,
  DerivativesData,
  CoinMetadata,
  Timeframe,
  DataProviderStats,
} from '../types/market';
import { MarketDataProvider } from './MarketDataProvider';
import { isTimeframe } from '../lib/timeframes';
import {
  simulateDerivatives,
  simulateKlines,
  simulateTicker,
  SIM_BASE_PRICES,
} from './simulation';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface HostState {
  failures: number;
  openUntil: number;
  lastError: string | null;
}

/** تایم‌اوت هر درخواست شبکه (ms) — کوتاه تا اسکنر در حالت قطعی شبکه قفل نشود */
const REQUEST_TIMEOUT_MS = 4000;
/** تعداد تلاش مجدد برای هر میزبان */
const RETRIES_PER_HOST = 1;
/** تعداد خطای پیاپی لازم برای باز کردن قطع‌کنندهٔ مدار */
const BREAKER_THRESHOLD = 2;
/** مدت باز بودن قطع‌کنندهٔ مدار (ms) */
const BREAKER_COOLDOWN_MS = 25_000;
/** عمر حافظهٔ نهان دادهٔ زنده (ms) */
const CACHE_TTL_MS = 8000;
const CACHE_MAX_ENTRIES = 400;

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance';

  private baseSpotUrls = [
    'https://data-api.binance.vision',
    'https://api.binance.com',
    'https://api1.binance.com',
  ];

  private baseFuturesUrl = 'https://fapi.binance.com';

  private cache = new Map<string, CacheEntry<unknown>>();
  /** درخواست‌های در حال پرواز — برای ادغام فراخوانی‌های تکراری (request coalescing) */
  private inflight = new Map<string, Promise<unknown>>();
  /** وضعیت قطع‌کنندهٔ مدار به تفکیک میزبان */
  private hosts = new Map<string, HostState>();
  /** حافظهٔ نهان فراداده (ارز، رتبه، ارزش بازار) با عمر طولانی */
  private metadataCache = new Map<string, { data: CoinMetadata | null; timestamp: number }>();
  /**
   * حافظهٔ نهان «افتِ شبیه‌سازی‌شده» با عمر کوتاه.
   * پیش‌تر در حالت قطع اتصال، هر درخواست تکراری کل مجموعهٔ کندل‌ها را از نو
   * شبیه‌سازی می‌کرد و شمارندهٔ cacheHits همیشه صفر می‌ماند.
   */
  private simCache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly SIM_CACHE_TTL_MS = 3_000;

  private readonly METADATA_TTL_MS = 10 * 60_000;

  private stats = {
    liveFetches: 0,
    simulatedFetches: 0,
    cacheHits: 0,
    liveCacheHits: 0,
    simulatedCacheHits: 0,
    coalescedRequests: 0,
    breakerTrips: 0,
    lastError: null as string | null,
    lastLiveAt: null as number | null,
    lastSimulatedAt: null as number | null,
  };

  /** وضعیت زنده بودن منبع داده (سازگار با رابط قبلی) */
  getDataStatus(): { live: boolean } {
    // «زنده» یعنی آخرین دادهٔ سرو‌شده از بایننس آمده باشد، نه از موتور شبیه‌سازی.
    // (پیش‌تر تنها معیار، «هیچ افت شبیه‌سازی تا کنون» بود که پس از نخستین قطعی
    // اتصال، تا ری‌استارت سرور هرگز به «زنده» برنمی‌گشت.)
    const lastLive = this.stats.lastLiveAt ?? 0;
    const lastSimulated = this.stats.lastSimulatedAt ?? 0;
    return { live: lastSimulated === 0 || lastLive >= lastSimulated };
  }

  /** آمار کامل برای پایش و عیب‌یابی */
  getStats(): DataProviderStats {
    return {
      ...this.stats,
      openBreakers: [...this.hosts.entries()]
        .filter(([, state]) => state.openUntil > Date.now())
        .map(([host]) => host),
    };
  }

  /** صفر کردن شمارنده‌ها — برای اندازه‌گیری «کیفیت دادهٔ یک درخواست مشخص» */
  resetStats(): void {
    this.stats = {
      liveFetches: 0,
      simulatedFetches: 0,
      cacheHits: 0,
      liveCacheHits: 0,
      simulatedCacheHits: 0,
      coalescedRequests: 0,
      breakerTrips: 0,
      lastError: null,
      lastLiveAt: null,
      lastSimulatedAt: null,
    };
  }

  private noteLive(host: string): void {
    this.stats.liveFetches++;
    this.stats.lastLiveAt = Date.now();
    const state = this.hosts.get(host);
    if (state) {
      state.failures = 0;
      state.openUntil = 0;
    }
  }

  private noteFailure(host: string, message: string): void {
    this.stats.lastError = message;
    const state = this.hosts.get(host) || { failures: 0, openUntil: 0, lastError: null };
    state.failures += 1;
    state.lastError = message;
    if (state.failures >= BREAKER_THRESHOLD && state.openUntil <= Date.now()) {
      state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.stats.breakerTrips += 1;
    }
    this.hosts.set(host, state);
  }

  private noteSimulated(): void {
    this.stats.simulatedFetches++;
    this.stats.lastSimulatedAt = Date.now();
  }

  /**
   * افت به موتور شبیه‌سازی همراه با حافظهٔ نهان کوتاه‌مدت.
   * خروجی شبیه‌سازی قطعی است، بنابراین سرو کردن همان نتیجه برای چند ثانیه
   * هم داده را ناسازگار نمی‌کند و هم بار محاسباتی را پایین می‌آورد.
   */
  private simulateWithCache<T>(key: string, factory: () => T): T {
    const cached = this.simCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.SIM_CACHE_TTL_MS) {
      this.stats.cacheHits++;
      this.stats.simulatedCacheHits++;
      return cached.data as T;
    }
    const data = factory();
    if (this.simCache.size >= CACHE_MAX_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, entry] of this.simCache) {
        if (entry.timestamp < oldestAt) {
          oldestAt = entry.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.simCache.delete(oldestKey);
    }
    this.simCache.set(key, { data, timestamp: Date.now() });
    this.noteSimulated();
    return data;
  }

  private isBreakerOpen(host: string): boolean {
    const state = this.hosts.get(host);
    return !!state && state.openUntil > Date.now();
  }

  private readCache<T>(key: string, ttl = CACHE_TTL_MS): T | null {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < ttl) {
      this.stats.cacheHits++;
      this.stats.liveCacheHits++;
      return cached.data;
    }
    return null;
  }

  private writeCache<T>(key: string, data: T): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // حذف قدیمی‌ترین ورودی برای جلوگیری از نشت حافظه
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const [k, entry] of this.cache) {
        if (entry.timestamp < oldestAt) {
          oldestAt = entry.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * واکشی JSON با حفاظ‌های چندلایه:
   *  • حافظهٔ نهان کوتاه‌مدت (۸ ثانیه)
   *  • ادغام درخواست‌های هم‌زمان یکسان (به‌جای ۵ فراخوانی موازی، یک فراخوانی)
   *  • قطع‌کنندهٔ مدار هر میزبان (پس از ۲ خطای پیاپی، ۲۵ ثانیه نادیده گرفته می‌شود)
   *  • تایم‌اوت ۴ ثانیه‌ای و فقط یک تلاش مجدد
   * پیش‌تر هر درخواست تا ۹ بار (۳ میزبان × ۳ تلاش) با تایم‌اوت ۶ ثانیه تکرار می‌شد
   * و یک تحلیل تک‌نماد می‌توانست ده‌ها ثانیه طول بکشد.
   */
  private async fetchJson<T>(hosts: string[], path: string, ttl = CACHE_TTL_MS): Promise<T> {
    const cacheKey = `${hosts[0]}${path}`;
    const cached = this.readCache<T>(cacheKey, ttl);
    if (cached !== null) return cached;

    const inflightRequest = this.inflight.get(cacheKey);
    if (inflightRequest) {
      this.stats.coalescedRequests++;
      return inflightRequest as Promise<T>;
    }

    const request = this.performFetch<T>(hosts, path)
      .then((data) => {
        this.writeCache(cacheKey, data);
        return data;
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, request as Promise<unknown>);
    return request;
  }

  private async performFetch<T>(hosts: string[], path: string): Promise<T> {
    let lastError: Error | null = null;
    const availableHosts = hosts.filter((host) => !this.isBreakerOpen(host));

    if (availableHosts.length === 0) {
      const state = this.hosts.get(hosts[0]);
      throw new Error(
        `Circuit breaker open for ${hosts[0]}${state?.lastError ? ` (${state.lastError})` : ''}`
      );
    }

    for (const host of availableHosts) {
      for (let attempt = 0; attempt <= RETRIES_PER_HOST; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

          const response = await fetch(`${host}${path}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json', 'User-Agent': 'CryptoSignalScanner/1.1' },
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 429 || response.status === 418) {
              await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
              lastError = new Error(`HTTP ${response.status}: rate limited`);
              continue;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const json = (await response.json()) as T;
          this.noteLive(host);
          return json;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          this.noteFailure(host, lastError.message);
          if (attempt < RETRIES_PER_HOST) {
            await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
          }
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${path}`);
  }

  async getKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Kline[]> {
    const formattedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const safeLimit = Math.max(10, Math.min(1000, Math.floor(limit)));
    const interval: Timeframe = isTimeframe(timeframe) ? timeframe : '15m';

    try {
      const raw = await this.fetchJson<unknown[][]>(
        this.baseSpotUrls,
        `/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${safeLimit}`
      );

      if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error('Invalid kline response format');
      }

      return raw.map((k) => ({
        timestamp: Number(k[0]),
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
        volume: parseFloat(String(k[5])),
        closeTime: Number(k[6]),
        quoteVolume: parseFloat(String(k[7])),
        trades: Number(k[8]),
        takerBuyBaseVolume: parseFloat(String(k[9])),
        takerBuyQuoteVolume: parseFloat(String(k[10])),
      }));
    } catch {
      // افت به موتور شبیه‌سازی قطعی: خروجی پایدار، بازتولیدپذیر و سازگار با تیکر
      return this.simulateWithCache(`sim:klines:${formattedSymbol}:${timeframe}:${safeLimit}`, () =>
        simulateKlines(formattedSymbol, timeframe, safeLimit)
      );
    }
  }

  async getTicker24h(symbol: string): Promise<Ticker24h> {
    const formattedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
      const data = await this.fetchJson<{
        symbol: string;
        priceChange: string;
        priceChangePercent: string;
        lastPrice: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
        quoteVolume: string;
        openPrice: string;
        closeTime: number;
      }>(this.baseSpotUrls, `/api/v3/ticker/24hr?symbol=${formattedSymbol}`);

      if (!data || typeof data.lastPrice !== 'string') {
        throw new Error('Invalid ticker response');
      }

      return {
        symbol: data.symbol,
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        lastPrice: parseFloat(data.lastPrice),
        highPrice: parseFloat(data.highPrice),
        lowPrice: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume),
        quoteVolume: parseFloat(data.quoteVolume),
        openPrice: parseFloat(data.openPrice),
        closeTime: data.closeTime,
      };
    } catch {
      return this.simulateWithCache(`sim:ticker:${formattedSymbol}`, () => simulateTicker(formattedSymbol));
    }
  }

  async getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit = 150
  ): Promise<Record<Timeframe, Kline[]>> {
    const results = await Promise.all(
      timeframes.map(async (tf) => ({ tf, klines: await this.getKlines(symbol, tf, limit) }))
    );

    const mtfMap: Partial<Record<Timeframe, Kline[]>> = {};
    for (const { tf, klines } of results) {
      mtfMap[tf] = klines;
    }

    return mtfMap as Record<Timeframe, Kline[]>;
  }

  async getDerivativesData(symbol: string): Promise<DerivativesData> {
    const formattedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let openInterest = 0;
    let oiValue = 0;
    let fundingRate = 0;
    let globalLSR = 1.0;
    let topPosRatio = 1.0;
    let takerBuyRatio = 1.0;
    let livePieces = 0;

    try {
      // ۱. قراردادهای باز
      const oiRes = await this.fetchJson<{ openInterest: string; symbol: string; time: number }>(
        [this.baseFuturesUrl],
        `/fapi/v1/openInterest?symbol=${formattedSymbol}`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (oiRes?.openInterest) {
        openInterest = parseFloat(oiRes.openInterest);
        livePieces++;
      }

      // ۲. فاندینگ و مارک‌پرایس
      const fundingRes = await this.fetchJson<{ lastFundingRate: string; markPrice: string }>(
        [this.baseFuturesUrl],
        `/fapi/v1/premiumIndex?symbol=${formattedSymbol}`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (fundingRes?.lastFundingRate) {
        fundingRate = parseFloat(fundingRes.lastFundingRate);
        if (fundingRes.markPrice && openInterest > 0) {
          oiValue = openInterest * parseFloat(fundingRes.markPrice);
        }
        livePieces++;
      }

      // ۳. نسبت لانگ/شورت حساب‌ها
      const lsrRes = await this.fetchJson<
        { symbol: string; longShortRatio: string; longAccount: string; shortAccount: string }[]
      >(
        [this.baseFuturesUrl],
        `/futures/data/globalLongShortAccountRatio?symbol=${formattedSymbol}&period=15m&limit=1`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (Array.isArray(lsrRes) && lsrRes.length > 0) {
        globalLSR = parseFloat(lsrRes[0].longShortRatio);
        livePieces++;
      }

      // ۴. نسبت پوزیشن معامله‌گران برتر
      const topRes = await this.fetchJson<{ symbol: string; longShortRatio: string }[]>(
        [this.baseFuturesUrl],
        `/futures/data/topLongShortPositionRatio?symbol=${formattedSymbol}&period=15m&limit=1`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (Array.isArray(topRes) && topRes.length > 0) {
        topPosRatio = parseFloat(topRes[0].longShortRatio);
        livePieces++;
      }

      // ۵. حجم خرید/فروش تیکر
      const takerRes = await this.fetchJson<
        { buySellRatio: string; buyVol: string; sellVol: string }[]
      >(
        [this.baseFuturesUrl],
        `/futures/data/takerBuySellVol?symbol=${formattedSymbol}&period=15m&limit=1`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (Array.isArray(takerRes) && takerRes.length > 0) {
        takerBuyRatio = parseFloat(takerRes[0].buySellRatio);
        livePieces++;
      }

      // تاریخچهٔ قراردادهای باز (تغییرات ۱ساعته و ۲۴ساعته)
      let oiChange1hPercent = 0;
      let oiChange24hPercent = 0;

      const oiHist1h = await this.fetchJson<
        { symbol: string; sumOpenInterest: string; timestamp: number }[]
      >(
        [this.baseFuturesUrl],
        `/futures/data/openInterestHist?symbol=${formattedSymbol}&period=1h&limit=2`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (Array.isArray(oiHist1h) && oiHist1h.length >= 2) {
        const prev = parseFloat(oiHist1h[0].sumOpenInterest);
        const curr = parseFloat(oiHist1h[oiHist1h.length - 1].sumOpenInterest);
        if (prev > 0) oiChange1hPercent = parseFloat((((curr - prev) / prev) * 100).toFixed(2));
        livePieces++;
      }

      const oiHist24h = await this.fetchJson<
        { symbol: string; sumOpenInterest: string; timestamp: number }[]
      >(
        [this.baseFuturesUrl],
        `/futures/data/openInterestHist?symbol=${formattedSymbol}&period=4h&limit=7`,
        CACHE_TTL_MS
      ).catch(() => null);

      if (Array.isArray(oiHist24h) && oiHist24h.length >= 2) {
        const prev = parseFloat(oiHist24h[0].sumOpenInterest);
        const curr = parseFloat(oiHist24h[oiHist24h.length - 1].sumOpenInterest);
        if (prev > 0) oiChange24hPercent = parseFloat((((curr - prev) / prev) * 100).toFixed(2));
        livePieces++;
      }

      // اگر حتی یک قطعهٔ داده زنده هم به دست نیامد، کل شیء باید شبیه‌سازی‌شده تلقی شود
      if (livePieces === 0) {
        return this.simulateWithCache(`sim:derivatives:${formattedSymbol}`, () =>
          simulateDerivatives(formattedSymbol)
        );
      }

      let oiTrend: DerivativesData['oiTrend'] = 'NEUTRAL';
      if (oiChange1hPercent > 1.0) oiTrend = 'LONG_BUILDUP';
      else if (oiChange1hPercent < -1.0) oiTrend = 'SHORT_COVERING';

      const fundingCategory: DerivativesData['fundingCategory'] =
        fundingRate > 0.0005
          ? 'EXTREME_POSITIVE'
          : fundingRate > 0.00015
          ? 'POSITIVE'
          : fundingRate < -0.0005
          ? 'EXTREME_NEGATIVE'
          : fundingRate < -0.0001
          ? 'NEGATIVE'
          : 'NEUTRAL';

      const positioning: DerivativesData['positioning'] =
        globalLSR > 1.8 || topPosRatio > 2.0
          ? 'EXTREME_LONG'
          : globalLSR > 1.2 || topPosRatio > 1.3
          ? 'LONG_DOMINANT'
          : globalLSR < 0.6 || topPosRatio < 0.5
          ? 'EXTREME_SHORT'
          : globalLSR < 0.85 || topPosRatio < 0.8
          ? 'SHORT_DOMINANT'
          : 'BALANCED';

      return {
        symbol: formattedSymbol,
        openInterest,
        openInterestValueUSD: oiValue,
        oiChange1hPercent,
        oiChange24hPercent,
        oiTrend,
        fundingRate,
        fundingRateAnnualizedPercent: fundingRate * 3 * 365 * 100,
        fundingCategory,
        globalLongShortRatio: globalLSR,
        topTraderLongShortRatio: topPosRatio,
        topTraderPositionRatio: topPosRatio,
        positioning,
        takerBuySellRatio: takerBuyRatio,
        timestamp: Date.now(),
        isSimulated: false,
      };
    } catch {
      return this.simulateWithCache(`sim:derivatives:${formattedSymbol}`, () =>
        simulateDerivatives(formattedSymbol)
      );
    }
  }

  /** جدول نام و رتبهٔ نمادهای پرکاربرد (Binance رتبهٔ بازار ارائه نمی‌دهد) */
  private staticNames: Record<string, { name: string; rank: number }> = {
    BTC: { name: 'Bitcoin', rank: 1 },
    ETH: { name: 'Ethereum', rank: 2 },
    BNB: { name: 'BNB', rank: 4 },
    SOL: { name: 'Solana', rank: 5 },
    XRP: { name: 'XRP', rank: 3 },
    DOGE: { name: 'Dogecoin', rank: 7 },
    ADA: { name: 'Cardano', rank: 9 },
    AVAX: { name: 'Avalanche', rank: 12 },
    LINK: { name: 'Chainlink', rank: 14 },
    DOT: { name: 'Polkadot', rank: 16 },
    SUI: { name: 'Sui', rank: 15 },
    NEAR: { name: 'NEAR Protocol', rank: 18 },
    APT: { name: 'Aptos', rank: 22 },
    PEPE: { name: 'Pepe', rank: 24 },
    SHIB: { name: 'Shiba Inu', rank: 13 },
    LTC: { name: 'Litecoin', rank: 20 },
    UNI: { name: 'Uniswap', rank: 21 },
    ICP: { name: 'Internet Computer', rank: 23 },
    RENDER: { name: 'Render', rank: 26 },
    FET: { name: 'Artificial Superintelligence', rank: 28 },
  };

  async getMetadata(symbol: string): Promise<CoinMetadata | null> {
    const base = symbol.toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
    const formatted = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const cached = this.metadataCache.get(base);
    if (cached && Date.now() - cached.timestamp < this.METADATA_TTL_MS) {
      return cached.data;
    }

    const info = this.staticNames[base] || { name: base, rank: 50 };
    const metadata: CoinMetadata = {
      id: base.toLowerCase(),
      symbol: formatted,
      name: info.name,
      rank: info.rank,
      marketCapUSD: 0,
      volume24hUSD: 0,
      priceChange24h: 0,
      source: 'binance',
    };

    // غنی‌سازی ارزش بازار از CoinGecko به‌صورت غیرمسدودکننده (background) انجام می‌شود؛
    // پاسخ جاری هرگز منتظر شبکهٔ ثالث نمی‌ماند و نتیجه برای درخواست‌های بعدی نهان می‌شود.
    this.hydrateMarketCapInBackground(base);
    this.metadataCache.set(base, { data: metadata, timestamp: Date.now() });

    return metadata;
  }

  private hydrateMarketCapInBackground(baseSymbol: string): void {
    const host = 'https://api.coingecko.com';
    if (this.isBreakerOpen(host)) return;

    const ids: Record<string, string> = {
      BTC: 'bitcoin',
      ETH: 'ethereum',
      BNB: 'binancecoin',
      SOL: 'solana',
      XRP: 'ripple',
      DOGE: 'dogecoin',
      ADA: 'cardano',
      AVAX: 'avalanche-2',
      LINK: 'chainlink',
      DOT: 'polkadot',
      SUI: 'sui',
      NEAR: 'near',
      APT: 'aptos',
      PEPE: 'pepe',
      SHIB: 'shiba-inu',
    };
    const coinId = ids[baseSymbol];
    if (!coinId) return;

    void (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(
          `${host}/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`,
          { signal: controller.signal, headers: { Accept: 'application/json' } }
        );
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Record<
          string,
          { usd?: number; usd_market_cap?: number; usd_24h_vol?: number; usd_24h_change?: number }
        >;
        const coin = json[coinId];
        if (!coin) return;
        this.noteLive(host);
        const existing = this.metadataCache.get(baseSymbol)?.data;
        if (!existing) return;
        this.metadataCache.set(baseSymbol, {
          data: {
            ...existing,
            marketCapUSD: coin.usd_market_cap || 0,
            volume24hUSD: coin.usd_24h_vol || 0,
            priceChange24h: coin.usd_24h_change || 0,
          },
          timestamp: Date.now(),
        });
      } catch (err) {
        this.noteFailure(host, err instanceof Error ? err.message : String(err));
      }
    })();
  }

  async getTopSymbols(count = 25): Promise<string[]> {
    const defaultSymbols = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
      'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
      'SUIUSDT', 'NEARUSDT', 'APTUSDT', 'PEPEUSDT', 'SHIBUSDT',
      'LTCUSDT', 'UNIUSDT', 'ICPUSDT', 'RENDERUSDT', 'FETUSDT',
      'ARBUSDT', 'OPUSDT', 'INJUSDT', 'TIAUSDT', 'SEIUSDT',
    ];
    const safeCount = Math.max(1, Math.min(100, Math.floor(count)));

    try {
      const tickers = await this.fetchJson<{ symbol: string; quoteVolume: string }[]>(
        this.baseSpotUrls,
        '/api/v3/ticker/24hr',
        60_000
      );

      if (Array.isArray(tickers) && tickers.length > 0) {
        const available = new Set(tickers.map((t) => t.symbol));
        const stableBases = new Set([
          'USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'DAI', 'USDD', 'USDE', 'USD1',
          'EUR', 'GBP', 'AEUR', 'EURI', 'TRY', 'BRL', 'ARS', 'JPY', 'ZAR', 'PLN',
          'RON', 'CZK', 'MXN', 'COP', 'UAH', 'NGN', 'IDRT', 'BIDR', 'VAI', 'XUSD',
        ]);

        const usdtPairs = tickers
          .filter((t) => t.symbol.endsWith('USDT'))
          .map((t) => t.symbol.replace(/USDT$/, ''))
          .filter((base) => {
            if (stableBases.has(base)) return false;
            // توکن‌های اهرمی بایننس (BTCUPUSDT، BTCDOWNUSDT، …) توکن پایهٔ خود را
            // در بازار اسپات دارند؛ پس فقط در صورتی حذف می‌شوند که «ریشهٔ» نماد
            // به‌عنوان یک جفت معتبر وجود داشته باشد. با این روش JUPUSDT (که به
            // اشتباه با الگوی «UPUSDT» حذف می‌شد) سالم می‌ماند.
            const leveragedMatch = base.match(/^(.*)(UP|DOWN|BULL|BEAR)$/);
            if (leveragedMatch && available.has(`${leveragedMatch[1]}USDT`)) return false;
            return true;
          })
          .map((base) => `${base}USDT`);

        const usdtPairSet = new Set(usdtPairs);
        const volumeByPair = new Map(
          tickers
            .filter((t) => usdtPairSet.has(t.symbol))
            .map((t) => [t.symbol, parseFloat(t.quoteVolume) || 0] as const)
        );

        const ranked = usdtPairs
          .sort((a, b) => (volumeByPair.get(b) || 0) - (volumeByPair.get(a) || 0))
          .slice(0, safeCount);

        if (ranked.length >= safeCount) return ranked;
      }
    } catch {
      // در نبود شبکه، فهرست پیش‌فرض استفاده می‌شود
      this.noteSimulated();
    }

    return defaultSymbols.slice(0, safeCount);
  }

  /** قیمت پایهٔ شبیه‌سازی (فقط برای آزمون‌ها و رابط کاربری) */
  static getBasePrice(symbol: string): number {
    return SIM_BASE_PRICES[symbol.toUpperCase()] || 100;
  }
}
