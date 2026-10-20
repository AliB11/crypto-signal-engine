import {
  MTFAnalysis,
  MarketStructureSummary,
  Timeframe,
  TimeframeAnalysis,
} from '../src/types/market';

/**
 * سازندهٔ fixture برای تست‌ها.
 *
 * این فایل عمداً وجود دارد تا fixtureها با تایپ‌های واقعی همگام بمانند: وقتی فیلد
 * جدیدی به `MarketStructureSummary` یا `MTFAnalysis` اضافه می‌شود، typecheck همین‌جا
 * شکست می‌کند و مجبور می‌شویم مقدار *واقعی* آن را انتخاب کنیم، نه اینکه در چند فایل
 * تست به‌صورت دستی و واگرا پخش شود.
 */

export function makeStructure(overrides: Partial<MarketStructureSummary> = {}): MarketStructureSummary {
  return {
    trend: 'RANGING',
    available: true,
    candleCount: 100,
    lastEvent: null,
    events: [],
    swingHighs: [],
    swingLows: [],
    fvgs: [],
    orderBlocks: [],
    displacementDetected: false,
    recentMSS: null,
    recentBOS: null,
    ...overrides,
  };
}

/** یک تایم‌فریم «تحلیل‌شده» با مقادیر خنثی */
export function makeTimeframeAnalysis(
  timeframe: Timeframe,
  overrides: Partial<TimeframeAnalysis> = {}
): TimeframeAnalysis {
  return {
    timeframe,
    available: true,
    candleCount: 100,
    trend: 'RANGING',
    structureScore: 50,
    lastMSS: null,
    lastBOS: null,
    sweeps: [],
    fvgCount: 0,
    orderBlockCount: 0,
    volumeState: 'NORMAL',
    ...overrides,
  };
}

/** یک تایم‌فریم بدون داده — باید `available: false` و `structureScore: null` باشد */
export function makeUnavailableTimeframe(
  timeframe: Timeframe,
  candleCount = 0
): TimeframeAnalysis {
  return {
    timeframe,
    available: false,
    candleCount,
    trend: 'UNKNOWN',
    structureScore: null,
    lastMSS: null,
    lastBOS: null,
    sweeps: [],
    fvgCount: 0,
    orderBlockCount: 0,
    volumeState: 'UNKNOWN',
  };
}

export function makeMtf(overrides: Partial<MTFAnalysis> = {}): MTFAnalysis {
  return {
    timeframes: {} as Record<Timeframe, TimeframeAnalysis>,
    alignmentScore: 50,
    htfTrend: 'NEUTRAL',
    ltfConfirmation: false,
    confluenceDescription: 'بدون سوگیری جهت‌دار',
    analyzedTimeframes: [],
    htfAnalyzedCount: 3,
    htfTotal: 3,
    ...overrides,
  };
}
