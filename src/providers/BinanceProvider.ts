import {
  Kline,
  Ticker24h,
  DerivativesData,
  DerivativesField,
  CoinMetadata,
  Timeframe,
  DataProviderStats,
  DataTrace,
} from '../types/market';
import { MarketDataProvider } from './MarketDataProvider';
import { isTimeframe } from '../lib/timeframes';
import {
  simulateDerivatives,
  simulateKlines,
  simulateTicker,
  SIM_BASE_PRICES,
} from './simulation';
import { CoinGeckoProvider } from './CoinGeckoProvider';
import { annualizeFundingRate, DEFAULT_FUNDING_INTERVAL_HOURS } from '../lib/funding';
import { FALLBACK_WATCHLIST } from '../config/engine';

/**
 * آیا در صورت قطع دسترسی به بایننس، موتور شبیه‌سازی مجاز به تولید داده باشد؟
 *
 * دادهٔ شبیه‌سازی‌شده هرگز به‌جای دادهٔ واقعی جا نمی‌زند (همه‌جا با
 * `isSimulated` / `dataSource: 'simulated'` علامت‌گذاری می‌شود)، اما برای
 * استقرارهایی که فقط دادهٔ واقعی می‌خواهند، با `DATA_SIMULATION_FALLBACK=off`
 * به‌طور کامل خاموش می‌شود؛ در آن حالت پروایدر به‌جای عدد ساختگی خطا می‌دهد.
 */
function simulationFallbackEnabled(): boolean {
  const flag = (
    (typeof process !== 'undefined' && process.env?.DATA_SIMULATION_FALLBACK) || ''
  )
    .toString()
    .trim()
    .toLowerCase();
  return !(flag === 'off' || flag === 'false' || flag === '0' || flag === 'deny');
}

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
  getDataStatus(): { live: boolean; measured: boolean } {
    // «زنده» یعنی آخرین دادهٔ سرو‌شده از بایننس آمده باشد، نه از موتور شبیه‌سازی.
    // (پیش‌تر تنها معیار، «هیچ افت شبیه‌سازی تا کنون» بود که پس از نخستین قطعی
    // اتصال، تا ری‌استارت سرور هرگز به «زنده» برنمی‌گشت.)
    //
    // `measured` اضافه شد چون روی یک نمونهٔ تازهٔ سرورلس هنوز *هیچ* داده‌ای
    // خوانده نشده و پاسخ `live: true` یک ادعای اندازه‌گیری‌نشده بود: `/api/health`
    // پیش از نخستین واکشی «سالم و زنده» گزارش می‌داد بدون اینکه شواهدی داشته باشد.
    const lastLive = this.stats.lastLiveAt ?? 0;
    const lastSimulated = this.stats.lastSimulatedAt ?? 0;
    const measured = lastLive > 0 || lastSimulated > 0;
    return { live: measured ? lastLive >= lastSimulated : false, measured };
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

  private noteLive(host: string, trace?: DataTrace): void {
    this.stats.liveFetches++;
    this.stats.lastLiveAt = Date.now();
    if (trace) trace.live++;
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

  private noteSimulated(trace?: DataTrace): void {
    this.stats.simulatedFetches++;
    this.stats.lastSimulatedAt = Date.now();
    if (trace) trace.simulated++;
  }

  /**
   * نقطهٔ یکتای «افت به دادهٔ ساختگی».
   * اگر شبیه‌سازی با `DATA_SIMULATION_FALLBACK=off` خاموش شده باشد، خطا می‌دهد
   * تا هیچ عدد ساختگی‌ای وارد خط لولهٔ تحلیل نشود.
   */
  private unavailable<T>(what: string, cause: unknown): T {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `دادهٔ ${what} از بایننس در دسترس نیست و شبیه‌سازی غیرفعال است (${reason})`
    );
  }

  /**
   * افت به موتور شبیه‌سازی همراه با حافظهٔ نهان کوتاه‌مدت.
   * خروجی شبیه‌سازی قطعی است، بنابراین سرو کردن همان نتیجه برای چند ثانیه
   * هم داده را ناسازگار نمی‌کند و هم بار محاسباتی را پایین می‌آورد.
   */
  private simulateWithCache<T>(key: string, factory: () => T, trace?: DataTrace): T {
    const cached = this.simCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.SIM_CACHE_TTL_MS) {
      this.stats.cacheHits++;
      this.stats.simulatedCacheHits++;
      this.noteSimulated(trace);
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
    this.noteSimulated(trace);
    return data;
  }

  private isBreakerOpen(host: string): boolean {
    const state = this.hosts.get(host);
    return !!state && state.openUntil > Date.now();
  }

  private readCache<T>(key: string, ttl = CACHE_TTL_MS, trace?: DataTrace): T | null {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.timestamp < ttl) {
      this.stats.cacheHits++;
      this.stats.liveCacheHits++;
      if (trace) trace.live++;
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
  private async fetchJson<T>(
    hosts: string[],
    path: string,
    ttl = CACHE_TTL_MS,
    trace?: DataTrace
  ): Promise<T> {
    const cacheKey = `${hosts[0]}${path}`;
    const cached = this.readCache<T>(cacheKey, ttl, trace);
    if (cached !== null) return cached;

    const inflightRequest = this.inflight.get(cacheKey);
    if (inflightRequest) {
      this.stats.coalescedRequests++;
      // درخواست ادغام‌شده هم در شمارندهٔ همین درخواست ثبت می‌شود؛ وگرنه کیفیت
      // دادهٔ درخواست دوم به‌اشتباه «هیچ فراخوانی‌ای انجام نشد» گزارش می‌شد.
      const data = (await inflightRequest) as T;
      if (trace) trace.live++;
      return data;
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
    const data = await request;
    // هر پاسخ موفقِ شبکه، یک «فراخوانی زنده» برای همین درخواست شمرده می‌شود
    if (trace) trace.live++;
    return data;
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

  async getKlines(
    symbol: string,
    timeframe: Timeframe,
    limit = 200,
    trace?: DataTrace
  ): Promise<Kline[]> {
    const formattedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const safeLimit = Math.max(10, Math.min(1000, Math.floor(limit)));
    const interval: Timeframe = isTimeframe(timeframe) ? timeframe : '15m';

    try {
      const raw = await this.fetchJson<unknown[][]>(
        this.baseSpotUrls,
        `/api/v3/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${safeLimit}`,
        CACHE_TTL_MS,
        trace
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
    } catch (err) {
      // افت به موتور شبیه‌سازی قطعی: خروجی پایدار، بازتولیدپذیر و سازگار با تیکر
      if (!simulationFallbackEnabled()) this.unavailable<Kline[]>(`کندل ${formattedSymbol}`, err);
      return this.simulateWithCache(
        `sim:klines:${formattedSymbol}:${timeframe}:${safeLimit}`,
        () => simulateKlines(formattedSymbol, timeframe, safeLimit),
        trace
      );
    }
  }

  async getTicker24h(symbol: string, trace?: DataTrace): Promise<Ticker24h> {
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
      }>(
        this.baseSpotUrls,
        `/api/v3/ticker/24hr?symbol=${formattedSymbol}`,
        CACHE_TTL_MS,
        trace
      );

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
    } catch (err) {
      if (!simulationFallbackEnabled()) this.unavailable<Ticker24h>(`تیکر ${formattedSymbol}`, err);
      return this.simulateWithCache(
        `sim:ticker:${formattedSymbol}`,
        () => simulateTicker(formattedSymbol),
        trace
      );
    }
  }

  async getMultiTimeframeKlines(
    symbol: string,
    timeframes: Timeframe[],
    limit = 150,
    trace?: DataTrace
  ): Promise<Record<Timeframe, Kline[]>> {
    const results = await Promise.all(
      timeframes.map(async (tf) => ({ tf, klines: await this.getKlines(symbol, tf, limit, trace) }))
    );

    const mtfMap: Partial<Record<Timeframe, Kline[]>> = {};
    for (const { tf, klines } of results) {
      mtfMap[tf] = klines;
    }

    return mtfMap as Record<Timeframe, Kline[]>;
  }

  /**
   * فاصلهٔ فاندینگ واقعی هر نماد (ساعت).
   *
   * پیش‌تر سالانه‌سازی فاندینگ با ضریب ثابت `× 3 × 365` انجام می‌شد، یعنی فرض
   * «فاندینگ ۸ساعته» برای همهٔ نمادها. بایننس برای بسیاری از نمادها فاصلهٔ ۴ساعته
   * (و گاهی ۱ساعته) دارد، بنابراین آن عدد سالانه تا ۳ برابر اشتباه بود. اکنون
   * فاصلهٔ واقعی از `/fapi/v1/fundingInfo` خوانده و یک روز نهان می‌شود.
   */
  private fundingIntervals = new Map<string, number>();
  private fundingInfoFetchedAt = 0;
  private readonly FUNDING_INFO_TTL_MS = 24 * 60 * 60_000;
  /** فاصلهٔ پیش‌فرض بایننس وقتی فهرست fundingInfo در دسترس نباشد */
  /**
   * بازهٔ پیش‌فرض فاندینگ، فقط وقتی `/fapi/v1/fundingInfo` خوانده نشود.
   * مقدار از `lib/funding.ts` می‌آید تا دو منبع حقیقت نسازیم؛ در این حالت
   * `fundingIntervalHours: null` در خروجی گزارش می‌شود تا معلوم باشد عدد
   * سالانه روی یک بازهٔ *فرض‌شده* محاسبه شده است.
   */
  private static readonly DEFAULT_FUNDING_INTERVAL_HOURS = DEFAULT_FUNDING_INTERVAL_HOURS;

  private async resolveFundingInterval(symbol: string): Promise<{ hours: number; live: boolean }> {
    if (Date.now() - this.fundingInfoFetchedAt > this.FUNDING_INFO_TTL_MS) {
      try {
        const info = await this.fetchJson<{ symbol: string; fundingIntervalHours: number }[]>(
          [this.baseFuturesUrl],
          '/fapi/v1/fundingInfo',
          this.FUNDING_INFO_TTL_MS
        );
        if (Array.isArray(info) && info.length > 0) {
          for (const row of info) {
            if (typeof row?.symbol === 'string' && Number.isFinite(row.fundingIntervalHours)) {
              this.fundingIntervals.set(row.symbol.toUpperCase(), row.fundingIntervalHours);
            }
          }
          this.fundingInfoFetchedAt = Date.now();
        }
      } catch {
        // فهرست در دسترس نیست؛ فاصلهٔ استاندارد ۸ساعته استفاده می‌شود و
        // این وضعیت با `fundingIntervalHours: null` در خروجی اعلام می‌گردد.
      }
    }
    const hours = this.fundingIntervals.get(symbol.toUpperCase());
    return hours
      ? { hours, live: true }
      : { hours: BinanceProvider.DEFAULT_FUNDING_INTERVAL_HOURS, live: false };
  }

  /**
   * دادهٔ مشتقات از API آتی بایننس.
   *
   * اصلاح کلیدیِ شفافیت داده: پیش‌تر اگر حتی یک endpoint پاسخ می‌داد، بقیهٔ
   * فیلدها با مقدار خنثی پیش‌فرض پر می‌شدند (LSR=1، فاندینگ=0، نسبت تیکر=1) و
   * شیء با `isSimulated: false` برمی‌گشت. یعنی «دادهٔ ساخته‌شده» با برچسب
   * «دادهٔ زنده» وارد امتیازدهی و رابط کاربری می‌شد. اکنون هر فیلدی که واقعاً
   * خوانده نشده در `missingFields` گزارش می‌شود و مصرف‌کننده‌ها موظف‌اند آن را
   * نادیده بگیرند.
   */
  async getDerivativesData(symbol: string, trace?: DataTrace): Promise<DerivativesData> {
    const formattedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const read: Record<DerivativesField, number | null> = {
      openInterest: null,
      openInterestValueUSD: null,
      fundingRate: null,
      oiChange1hPercent: null,
      oiChange24hPercent: null,
      globalLongShortRatio: null,
      topTraderPositionRatio: null,
      takerBuySellRatio: null,
    };

    const fut = <T>(path: string) =>
      this.fetchJson<T>([this.baseFuturesUrl], path, CACHE_TTL_MS, trace).catch(() => null);

    const [
      oiRes,
      fundingRes,
      lsrRes,
      topRes,
      takerRes,
      oiHist1h,
      oiHist24h,
      fundingInfo,
    ] = await Promise.all([
      fut<{ openInterest: string; symbol: string; time: number }>(
        `/fapi/v1/openInterest?symbol=${formattedSymbol}`
      ),
      fut<{ lastFundingRate: string; markPrice: string }>(
        `/fapi/v1/premiumIndex?symbol=${formattedSymbol}`
      ),
      fut<{ symbol: string; longShortRatio: string; longAccount: string; shortAccount: string }[]>(
        `/futures/data/globalLongShortAccountRatio?symbol=${formattedSymbol}&period=15m&limit=1`
      ),
      fut<{ symbol: string; longShortRatio: string }[]>(
        `/futures/data/topLongShortPositionRatio?symbol=${formattedSymbol}&period=15m&limit=1`
      ),
      fut<{ buySellRatio: string; buyVol: string; sellVol: string }[]>(
        `/futures/data/takerBuySellVol?symbol=${formattedSymbol}&period=15m&limit=1`
      ),
      fut<{ symbol: string; sumOpenInterest: string; timestamp: number }[]>(
        `/futures/data/openInterestHist?symbol=${formattedSymbol}&period=1h&limit=2`
      ),
      fut<{ symbol: string; sumOpenInterest: string; timestamp: number }[]>(
        `/futures/data/openInterestHist?symbol=${formattedSymbol}&period=4h&limit=7`
      ),
      this.resolveFundingInterval(formattedSymbol),
    ]);

    if (oiRes && Number.isFinite(Number(oiRes.openInterest))) {
      read.openInterest = Number(oiRes.openInterest);
    }
    if (fundingRes && Number.isFinite(Number(fundingRes.lastFundingRate))) {
      read.fundingRate = Number(fundingRes.lastFundingRate);
      const mark = Number(fundingRes.markPrice);
      if (read.openInterest !== null && Number.isFinite(mark) && mark > 0) {
        read.openInterestValueUSD = read.openInterest * mark;
      }
    }
    if (Array.isArray(lsrRes) && lsrRes.length > 0 && Number.isFinite(Number(lsrRes[0].longShortRatio))) {
      read.globalLongShortRatio = Number(lsrRes[0].longShortRatio);
    }
    if (Array.isArray(topRes) && topRes.length > 0 && Number.isFinite(Number(topRes[0].longShortRatio))) {
      read.topTraderPositionRatio = Number(topRes[0].longShortRatio);
    }
    if (Array.isArray(takerRes) && takerRes.length > 0 && Number.isFinite(Number(takerRes[0].buySellRatio))) {
      read.takerBuySellRatio = Number(takerRes[0].buySellRatio);
    }
    if (Array.isArray(oiHist1h) && oiHist1h.length >= 2) {
      const prev = Number(oiHist1h[0].sumOpenInterest);
      const curr = Number(oiHist1h[oiHist1h.length - 1].sumOpenInterest);
      if (prev > 0 && Number.isFinite(curr)) {
        read.oiChange1hPercent = Number((((curr - prev) / prev) * 100).toFixed(2));
      }
    }
    if (Array.isArray(oiHist24h) && oiHist24h.length >= 2) {
      const prev = Number(oiHist24h[0].sumOpenInterest);
      const curr = Number(oiHist24h[oiHist24h.length - 1].sumOpenInterest);
      if (prev > 0 && Number.isFinite(curr)) {
        read.oiChange24hPercent = Number((((curr - prev) / prev) * 100).toFixed(2));
      }
    }

    const missingFields = (Object.keys(read) as DerivativesField[]).filter((k) => read[k] === null);
    const livePieces = (Object.keys(read) as DerivativesField[]).length - missingFields.length;

    // اگر حتی یک قطعهٔ دادهٔ زنده هم به دست نیامد، کل شیء شبیه‌سازی‌شده است
    if (livePieces === 0) {
      const cause = new Error(`هیچ endpoint آتی برای ${formattedSymbol} پاسخ نداد`);
      if (!simulationFallbackEnabled()) this.unavailable<DerivativesData>('مشتقات', cause);
      return this.simulateWithCache(
        `sim:derivatives:${formattedSymbol}`,
        () => simulateDerivatives(formattedSymbol),
        trace
      );
    }

    const oiChange1h = read.oiChange1hPercent ?? 0;
    const fundingRate = read.fundingRate ?? 0;
    const globalLSR = read.globalLongShortRatio ?? 1;
    const topPosRatio = read.topTraderPositionRatio ?? 1;

    // دسته‌بندی‌ها فقط از فیلدهایی ساخته می‌شوند که واقعاً خوانده شده‌اند؛
    // در غیر این صورت «خنثی» می‌مانند و مصرف‌کننده از missingFields آگاه است.
    const oiTrend: DerivativesData['oiTrend'] =
      read.oiChange1hPercent === null
        ? 'NEUTRAL'
        : oiChange1h > 1.0
        ? 'LONG_BUILDUP'
        : oiChange1h < -1.0
        ? 'SHORT_COVERING'
        : 'NEUTRAL';

    const fundingCategory: DerivativesData['fundingCategory'] =
      read.fundingRate === null
        ? 'NEUTRAL'
        : fundingRate > 0.0005
        ? 'EXTREME_POSITIVE'
        : fundingRate > 0.00015
        ? 'POSITIVE'
        : fundingRate < -0.0005
        ? 'EXTREME_NEGATIVE'
        : fundingRate < -0.0001
        ? 'NEGATIVE'
        : 'NEUTRAL';

    const positioning: DerivativesData['positioning'] =
      read.globalLongShortRatio === null && read.topTraderPositionRatio === null
        ? 'BALANCED'
        : globalLSR > 1.8 || topPosRatio > 2.0
        ? 'EXTREME_LONG'
        : globalLSR > 1.2 || topPosRatio > 1.3
        ? 'LONG_DOMINANT'
        : globalLSR < 0.6 || topPosRatio < 0.5
        ? 'EXTREME_SHORT'
        : globalLSR < 0.85 || topPosRatio < 0.8
        ? 'SHORT_DOMINANT'
        : 'BALANCED';

    // سالانه‌سازی با فاصلهٔ واقعی فاندینگ همین نماد (۲۴ ÷ فاصله = تعداد دوره در روز).
    // محاسبه در `lib/funding.ts` است تا بدون شبکه قابل تست باشد.
    const fundingIntervalHours = fundingInfo.live ? fundingInfo.hours : null;
    const fundingRateAnnualizedPercent =
      annualizeFundingRate(fundingRate, fundingIntervalHours) ?? 0;

    return {
      symbol: formattedSymbol,
      openInterest: read.openInterest ?? 0,
      openInterestValueUSD: read.openInterestValueUSD ?? 0,
      oiChange1hPercent: oiChange1h,
      oiChange24hPercent: read.oiChange24hPercent ?? 0,
      oiTrend,
      fundingRate,
      fundingRateAnnualizedPercent,
      fundingCategory,
      globalLongShortRatio: globalLSR,
      topTraderLongShortRatio: topPosRatio,
      topTraderPositionRatio: topPosRatio,
      positioning,
      takerBuySellRatio: read.takerBuySellRatio ?? 1,
      timestamp: Date.now(),
      isSimulated: false,
      missingFields,
      fundingIntervalHours,
    };
  }

  /**
   * کلاینت فرادادهٔ بازار (کوین‌گکو) — منبعِ «نام واقعی، رتبه و ارزش بازار».
   *
   * پیش‌تر یک جدول دستی در همین فایل سخت‌کد شده بود:
   * `BTC: rank 1, ETH: rank 2, XRP: rank 3, …, RENDER: rank 26`.
   * آن اعداد هیچ منبع زنده‌ای نداشتند و به‌مرور نادرست می‌شدند، اما در پاسخ API
   * به‌عنوان «رتبهٔ بازار» ارائه می‌شدند. همچنین برای نمادهای ناشناخته رتبهٔ
   * حدسی `50` و ارزش بازار `0` برگردانده می‌شد.
   *
   * اکنون رتبه/ارزش بازار/حجم فقط از فهرست واقعی بازار خوانده می‌شوند و در نبود
   * آن `null` است — نه صفر، نه عدد حدسی.
   */
  private readonly metadataClient = new CoinGeckoProvider();
  /** درخواست‌های ناموفق پیاپی به فهرست بازار، برای پرهیز از تلاش بی‌وقفه */
  private metadataFailures = 0;
  private metadataNextAttemptAt = 0;

  async getMetadata(symbol: string): Promise<CoinMetadata | null> {
    const base = symbol.toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
    const formatted = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const cached = this.metadataCache.get(base);
    if (cached && Date.now() - cached.timestamp < this.METADATA_TTL_MS && cached.data?.isLiveMetadata) {
      return cached.data;
    }

    // تلاش برای خواندن فهرست واقعی بازار (غیرمسدودکننده نسبت به پاسخ قبلی)
    const liveMetadata = await this.readLiveMetadata(base).catch(() => null);
    if (liveMetadata) {
      const metadata: CoinMetadata = { ...liveMetadata, symbol: formatted };
      this.metadataCache.set(base, { data: metadata, timestamp: Date.now() });
      return metadata;
    }

    // بدون منبع واقعی: فقط نام (که از خودِ تیکر مشتق می‌شود) و هیچ عدد بازاری.
    const fallback: CoinMetadata = {
      id: base.toLowerCase(),
      symbol: formatted,
      name: base,
      rank: null,
      marketCapUSD: null,
      volume24hUSD: null,
      priceChange24h: null,
      source: 'binance',
      isLiveMetadata: false,
    };
    this.metadataCache.set(base, { data: fallback, timestamp: Date.now() });
    return fallback;
  }

  /**
   * وضعیت واقعی منبع فراداده (کوین‌گکو).
   *
   * `/api/health` پیش‌تر بی‌قیدوشرط `metadataProvider: 'coingecko-public-markets'`
   * گزارش می‌داد، حتی وقتی کوین‌گکو کاملاً unreachable بود و نام/رتبهٔ همهٔ ارزها
   * `null` برمی‌گشت. این متد وضعیت اندازه‌گیری‌شده را برمی‌گرداند.
   */
  getMetadataStatus(): {
    provider: 'coingecko';
    available: boolean;
    marketsFetchedAt: string | null;
    apiKeyConfigured: boolean;
    lastError: string | null;
  } {
    const fetchedAt = this.metadataClient.getMarketsFetchedAt();
    return {
      provider: 'coingecko',
      available: fetchedAt > 0,
      marketsFetchedAt: fetchedAt > 0 ? new Date(fetchedAt).toISOString() : null,
      apiKeyConfigured: this.metadataClient.hasApiKey(),
      lastError: this.metadataClient.getLastError(),
    };
  }

  private async readLiveMetadata(base: string): Promise<CoinMetadata | null> {
    if (Date.now() < this.metadataNextAttemptAt) {
      return this.metadataCache.get(base)?.data?.isLiveMetadata
        ? this.metadataCache.get(base)!.data
        : null;
    }
    const metadata = await this.metadataClient.getMetadata(base);
    if (metadata) {
      this.metadataFailures = 0;
      this.noteLive('https://api.coingecko.com');
      return metadata;
    }
    this.metadataFailures += 1;
    // پس از هر شکست، تلاش بعدی با تأخیر فزاینده انجام می‌شود (حداکثر ۱۰ دقیقه)
    const backoff = Math.min(10 * 60_000, 30_000 * 2 ** Math.min(4, this.metadataFailures - 1));
    this.metadataNextAttemptAt = Date.now() + backoff;
    const err = this.metadataClient.getLastError();
    if (err) this.noteFailure('https://api.coingecko.com', err);
    return null;
  }

  /**
   * فهرست نمادها بر پایهٔ حجم واقعی ۲۴ساعتهٔ بازار اسپات بایننس.
   *
   * در نبود شبکه، یک «دیده‌بان ایستای پیکربندی» برگردانده می‌شود؛ این فهرست
   * *دادهٔ بازار* نیست و در `lastSymbolsSource` اعلام می‌شود تا مصرف‌کننده بداند
   * رتبه‌بندی حجمیِ زنده انجام نشده است.
   */
  private lastSymbolsSource: 'live-volume' | 'static-watchlist' = 'static-watchlist';

  /** منبع آخرین فهرست نمادها (برای شفافیت در پاسخ API) */
  getSymbolsSource(): 'live-volume' | 'static-watchlist' {
    return this.lastSymbolsSource;
  }

  async getTopSymbols(count = 25): Promise<string[]> {
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

        if (ranked.length >= safeCount) {
          this.lastSymbolsSource = 'live-volume';
          return ranked;
        }
      }
    } catch {
      // در نبود شبکه، دیده‌بان ایستای پیکربندی استفاده می‌شود.
      // عمداً noteSimulated() صدا زده نمی‌شود: این «دادهٔ بازار» نیست و نباید
      // کیفیت دادهٔ تحلیل را به‌اشتباه «شبیه‌سازی‌شده» گزارش کند.
    }

    this.lastSymbolsSource = 'static-watchlist';
    return FALLBACK_WATCHLIST.slice(0, safeCount);
  }

  /** قیمت پایهٔ شبیه‌سازی (فقط برای آزمون‌ها و رابط کاربری) */
  static getBasePrice(symbol: string): number {
    return SIM_BASE_PRICES[symbol.toUpperCase()] || 100;
  }
}
