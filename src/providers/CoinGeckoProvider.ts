import { CoinMetadata } from '../types/market';

/**
 * کلاینت «فرادادهٔ بازار» کوین‌گکو — فقط همان چیزی که کوین‌گکو واقعاً می‌دهد.
 * ─────────────────────────────────────────────────────────────────────────────
 * نسخهٔ قبلی این کلاس یک `MarketDataProvider` کامل بود که هیچ‌جا استفاده نمی‌شد
 * (کد مرده) و در عین حال دادهٔ ساختگی تولید می‌کرد:
 *
 *   • `getTicker24h` مقدار `highPrice = price × 1.02` و `lowPrice = price × 0.98`
 *     می‌ساخت؛ یعنی سقف/کف ۲۴ساعتهٔ کاملاً جعلی.
 *   • `getDerivativesData` فاندینگ ثابت `0.0001` و سالانهٔ `10.95%` و نسبت
 *     لانگ/شورت `1.0` برمی‌گرداند، بدون هیچ `isSimulated`.
 *   • `getKlines` برای هر نمادِ ناشناخته بی‌صدا دادهٔ **بیت‌کوین** را برمی‌گرداند
 *     و حجم را `0` می‌گذاشت.
 *   • `getMetadata` در نبود رتبه، عدد `50` را به‌عنوان رتبهٔ بازار گزارش می‌کرد.
 *
 * کوین‌گکو نه کندل با حجم می‌دهد، نه دادهٔ مشتقات. بنابراین این ماژول اکنون فقط
 * «فراداده» می‌خواند و برای هر چیزی که واقعاً در دسترس نیست `null` برمی‌گرداند —
 * نه عدد حدسی. خروجی برای یک ساعت نهان می‌شود و تنها یک درخواست شبکه می‌زند.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const COINGECKO_HOST = 'https://api.coingecko.com';
/**
 * کلید رایگان (Demo) کوین‌گکو.
 *
 * بدون کلید، لایهٔ ناشناس کوین‌گکو محدودیت نرخ سخت‌گیرانه‌ای دارد و چون فرادادهٔ
 * بازار (نام، رتبه، ارزش بازار) اکنون تنها از همین‌جا می‌آید، یک پاسخ `429`
 * یعنی «نام و رتبهٔ هیچ ارزی را نداریم». تنظیم `COINGECKO_API_KEY` این کلید را
 * در سرآیند `x-cg-demo-api-key` می‌فرستد. این متغیر پیش‌تر فقط در `.env.example`
 * مستند شده بود ولی هیچ‌جا خوانده نمی‌شد.
 */
function coingeckoApiKey(): string | null {
  const key =
    typeof process !== 'undefined' && process.env
      ? (process.env.COINGECKO_API_KEY ?? '').trim()
      : '';
  return key.length > 0 ? key : null;
}
const REQUEST_TIMEOUT_MS = 4000;
/** فهرست بازار برای یک ساعت معتبر است (رتبه/ارزش بازار دقیقه‌ای تغییر نمی‌کند) */
const MARKETS_TTL_MS = 60 * 60_000;
/** سقف تعداد دارایی‌هایی که در یک درخواست فهرست بازار خوانده می‌شود */
const MARKETS_PER_PAGE = 250;
const MARKETS_MAX_PAGES = 2;

export interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  marketCapUSD: number | null;
  volume24hUSD: number | null;
  priceChange24h: number | null;
}

export class CoinGeckoProvider {
  readonly name = 'coingecko';
  private readonly baseUrl = `${COINGECKO_HOST}/api/v3`;

  /** نگاشت تیکر (بدون پسوند) → فرادادهٔ واقعی بازار */
  private marketsBySymbol = new Map<string, CoinGeckoMarket>();
  private fetchedAt = 0;
  /** درخواست در حال پرواز تا چند فراخوانی هم‌زمان، چند درخواست شبکه نزنند */
  private inflight: Promise<void> | null = null;
  private lastError: string | null = null;

  /** آخرین خطای شبکهٔ ثبت‌شده (برای `/api/health`) */
  getLastError(): string | null {
    return this.lastError;
  }

  /** آیا کلید API تنظیم شده است؟ (برای شفافیت در `/api/health`) */
  hasApiKey(): boolean {
    return coingeckoApiKey() !== null;
  }

  /** زمان آخرین واکشی موفق فهرست بازار (برای شفافیت) */
  getMarketsFetchedAt(): number {
    return this.fetchedAt;
  }

  /**
   * فرادادهٔ واقعی یک نماد (رتبه، ارزش بازار، حجم ۲۴ساعته).
   * اگر فهرست بازار در دسترس نباشد `null` برمی‌گرداند — هرگز عدد حدسی.
   */
  async getMetadata(symbol: string): Promise<CoinMetadata | null> {
    const base = symbol.toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
    if (!base) return null;

    await this.ensureMarkets();
    const market = this.marketsBySymbol.get(base);
    if (!market) return null;

    return {
      id: market.id,
      symbol: symbol.toUpperCase(),
      name: market.name,
      rank: market.marketCapRank,
      marketCapUSD: market.marketCapUSD,
      volume24hUSD: market.volume24hUSD,
      priceChange24h: market.priceChange24h,
      source: 'coingecko',
      isLiveMetadata: true,
    };
  }

  /** نام واقعی دارایی از فهرست بازار کوین‌گکو (بدون هیچ جدول دستی) */
  getName(baseSymbol: string): string | null {
    return this.marketsBySymbol.get(baseSymbol.toUpperCase())?.name ?? null;
  }

  /**
   * واکشی فهرست بازار واقعی (صفحه‌بندی‌شده) و ساخت نگاشت تیکر → فراداده.
   * هم‌زمان با پاسخ جاری اجرا می‌شود؛ در صورت شکست، نگاشت قبلی دست‌نخورده می‌ماند.
   */
  async ensureMarkets(force = false): Promise<void> {
    if (!force && this.fetchedAt > 0 && Date.now() - this.fetchedAt < MARKETS_TTL_MS) return;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const next = new Map<string, CoinGeckoMarket>();
        for (let page = 1; page <= MARKETS_MAX_PAGES; page++) {
          const rows = await this.fetchPage(page);
          if (rows.length === 0) break;
          for (const row of rows) {
            const ticker = (row.symbol || '').toUpperCase();
            if (!ticker) continue;
            // در صورت تکرار تیکر، دارایی با رتبهٔ بهتر نگه داشته می‌شود
            const existing = next.get(ticker);
            if (!existing || rankBetter(row.marketCapRank, existing.marketCapRank)) {
              next.set(ticker, row);
            }
          }
          if (rows.length < MARKETS_PER_PAGE) break;
        }

        if (next.size > 0) {
          this.marketsBySymbol = next;
          this.fetchedAt = Date.now();
          this.lastError = null;
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  private async fetchPage(page: number): Promise<CoinGeckoMarket[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url =
        `${this.baseUrl}/coins/markets?vs_currency=usd&order=market_cap_desc` +
        `&per_page=${MARKETS_PER_PAGE}&page=${page}&price_change_percentage=24h`;
      const apiKey = coingeckoApiKey();
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CryptoSignalScanner/1.2',
          ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}),
        },
      });
      if (!res.ok) throw new Error(`CoinGecko markets HTTP ${res.status}`);
      const json = (await res.json()) as {
        id?: string;
        symbol?: string;
        name?: string;
        market_cap_rank?: number | null;
        market_cap?: number | null;
        total_volume?: number | null;
        price_change_percentage_24h?: number | null;
      }[];
      if (!Array.isArray(json)) return [];

      return json
        .filter((row) => typeof row.symbol === 'string')
        .map((row) => ({
          id: String(row.id ?? row.symbol ?? '').toLowerCase(),
          symbol: String(row.symbol ?? '').toUpperCase(),
          name: String(row.name ?? row.symbol ?? ''),
          marketCapRank: toFiniteOrNull(row.market_cap_rank),
          marketCapUSD: toFiniteOrNull(row.market_cap),
          volume24hUSD: toFiniteOrNull(row.total_volume),
          priceChange24h: toFiniteOrNull(row.price_change_percentage_24h),
        }));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function toFiniteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rankBetter(a: number | null, b: number | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return a < b;
}
