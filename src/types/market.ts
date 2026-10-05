export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Kline {
  timestamp: number; // Open time ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export interface Ticker24h {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  openPrice: number;
  closeTime: number;
}

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'SWING_HIGH' | 'SWING_LOW';
  confirmedAt: number; // Index at which pivot was confirmed (no look-ahead)
  strength: number; // Volume / range factor
}

export interface LiquidityLevel {
  price: number;
  type:
    | 'SWING_HIGH'
    | 'SWING_LOW'
    | 'EQUAL_HIGH'
    | 'EQUAL_LOW'
    | 'PREVIOUS_DAY_HIGH'
    | 'PREVIOUS_DAY_LOW'
    | 'PREVIOUS_WEEK_HIGH'
    | 'PREVIOUS_WEEK_LOW'
    | 'SESSION_HIGH'
    | 'SESSION_LOW'
    | 'LOCAL_HIGH'
    | 'LOCAL_LOW';
  strength: number; // 0-100
  swept: boolean;
  sweptAt?: number;
  distancePercent: number; // relative to current price
  timestamp: number;
  /**
   * زمانِ تأییدِ ساختاری سطح (نه زمان تشکیل پیوت).
   * برای پیوت با rightBars=2، سطح فقط پس از بسته‌شدن کندل i+2 قابل استناد است؛
   * موتور سوئیپ از این مقدار استفاده می‌کند تا سوئیپِ «آینده‌نگر» ثبت نشود.
   */
  confirmedTimestamp?: number;
  timeframe?: Timeframe;
}

export interface LiquiditySweep {
  type: 'SELL_SIDE_SWEEP' | 'BUY_SIDE_SWEEP';
  levelPrice: number;
  levelType: LiquidityLevel['type'];
  sweepExtremePrice: number;
  reclaimPrice: number;
  penetrationPercent: number;
  wickToBodyRatio: number;
  candleIndex: number;
  timestamp: number;
  volumeConfirmed: boolean;
  timeframe: Timeframe;
}

export interface FairValueGap {
  top: number;
  bottom: number;
  midpoint: number;
  direction: 'BULLISH' | 'BEARISH';
  candleIndex: number;
  timestamp: number;
  filled: boolean;
  filledPercent: number;
}

export interface OrderBlock {
  top: number;
  bottom: number;
  direction: 'BULLISH' | 'BEARISH';
  candleIndex: number;
  timestamp: number;
  volume: number;
  mitigated: boolean;
}

export type StructureEventType = 'HH' | 'HL' | 'LH' | 'LL' | 'BOS' | 'CHoCH' | 'MSS';

export interface StructureEvent {
  type: StructureEventType;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  price: number;
  candleIndex: number;
  timestamp: number;
  timeframe: Timeframe;
  strength: number;
  displacement: boolean;
}

export interface MarketStructureSummary {
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  lastEvent: StructureEvent | null;
  events: StructureEvent[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  fvgs: FairValueGap[];
  orderBlocks: OrderBlock[];
  displacementDetected: boolean;
  recentMSS: StructureEvent | null;
  recentBOS: StructureEvent | null;
}

export interface SessionInfo {
  name: 'Asian' | 'London' | 'New York';
  isActive: boolean;
  startHourUTC: number;
  endHourUTC: number;
  high: number;
  low: number;
  openPrice: number;
  rangePercent: number;
  highSwept: boolean;
  lowSwept: boolean;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  /** زمان آخرین کندل همین جلسه (مبنای زمانی سطوح کلیدی جلسه) */
  endTimestamp?: number;
}

export interface SessionLiquiditySummary {
  currentSession: 'Asian' | 'London' | 'New York' | 'Between Sessions';
  /** همهٔ جلسات فعال در لحظهٔ تحلیل (در بازه‌های هم‌پوشانی بیش از یک جلسه فعال است) */
  activeSessions?: ('Asian' | 'London' | 'New York')[];
  sessions: {
    asian: SessionInfo;
    london: SessionInfo;
    newYork: SessionInfo;
  };
  judasSwingDetected: boolean; // London sweeping Asian high/low
  nyReversalDetected: boolean; // NY sweeping London high/low
  keyLevels: LiquidityLevel[];
}

export interface VolumeProfileNode {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface VolumeProfile {
  poc: number; // Point of Control
  vah: number; // Value Area High (70% vol)
  val: number; // Value Area Low (70% vol)
  hvn: number[]; // High Volume Nodes
  lvn: number[]; // Low Volume Nodes
  nodes: VolumeProfileNode[];
}

export interface VolumeMetrics {
  currentVolume: number;
  volumeSMA: number;
  rvol: number; // Relative Volume
  isSpike: boolean; // > 2.0 RVOL
  state: 'EXPANSION' | 'CONTRACTION' | 'NORMAL';
  takerBuyVolume: number;
  takerSellVolume: number;
  takerBuyRatio: number; // 0 - 100%
  takerSellRatio: number; // 0 - 100%
  imbalance: number; // Positive = buyers dominant
  volumeProfile: VolumeProfile | null;
  hasTickFlowData: boolean;
}

export interface DerivativesData {
  symbol: string;
  openInterest: number;
  openInterestValueUSD: number;
  oiChange1hPercent: number;
  oiChange24hPercent: number;
  oiTrend: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'LONG_LIQUIDATION' | 'SHORT_COVERING' | 'NEUTRAL';
  fundingRate: number;
  fundingRateAnnualizedPercent: number;
  fundingCategory: 'EXTREME_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'EXTREME_NEGATIVE';
  globalLongShortRatio: number;
  topTraderLongShortRatio: number;
  topTraderPositionRatio: number;
  positioning: 'LONG_DOMINANT' | 'SHORT_DOMINANT' | 'BALANCED' | 'EXTREME_LONG' | 'EXTREME_SHORT';
  takerBuySellRatio: number;
  timestamp: number;
  /**
   * اگر true باشد، مقادیر از موتور شبیه‌سازی قطعی آمده‌اند و دادهٔ واقعی بازار نیستند.
   * رابط کاربری موظف است این وضعیت را شفاف نمایش دهد.
   */
  isSimulated?: boolean;
}

/** آمار داخلی پروایدر داده — برای شفافیت منبع داده و عیب‌یابی */
export interface DataProviderStats {
  /** تعداد درخواست‌های موفق به API واقعی */
  liveFetches: number;
  /** تعداد درخواست‌هایی که به دادهٔ شبیه‌سازی‌شده افتاده‌اند */
  simulatedFetches: number;
  /** تعداد پاسخ‌های خوانده‌شده از حافظهٔ نهان (زنده + شبیه‌سازی) */
  cacheHits: number;
  /** بخشی از cacheHits که مربوط به دادهٔ زندهٔ بایننس است */
  liveCacheHits: number;
  /** بخشی از cacheHits که مربوط به دادهٔ شبیه‌سازی‌شده است */
  simulatedCacheHits: number;
  /** تعداد درخواست‌های هم‌زمان که با coalescing ادغام شدند */
  coalescedRequests: number;
  /** تعداد قطع‌کننده‌های مدار (circuit breakers) که فعال شده‌اند */
  breakerTrips: number;
  /** آخرین خطای شبکهٔ ثبت‌شده */
  lastError: string | null;
  /** زمان آخرین دادهٔ زندهٔ موفق */
  lastLiveAt: number | null;
  /** زمان آخرین افت به دادهٔ شبیه‌سازی‌شده */
  lastSimulatedAt: number | null;
  /** نام میزبان‌هایی که قطع‌کنندهٔ مدارشان باز است */
  openBreakers: string[];
}

/** کیفیت منبع داده در یک پاسخ مشخص (شفافیت برای کاربر) */
export interface DataQualityInfo {
  source: 'live' | 'simulated' | 'mixed';
  /** نسبت فراخوانی‌های زنده در طول این درخواست (۰ تا ۱) */
  liveRatio: number;
  liveFetches: number;
  simulatedFetches: number;
  /** پیام قابل نمایش فارسی */
  message: string;
}

export type MarketRegimeType =
  | 'TRENDING_BULLISH'
  | 'TRENDING_BEARISH'
  | 'RANGING'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'EXPANSION'
  | 'CONTRACTION';

export interface MarketRegime {
  regime: MarketRegimeType;
  atr: number;
  atrPercent: number;
  /** ADX استاندارد وایلدر (۱۴ دوره) — نه تقریب شمارش کندل */
  adx: number;
  bbWidth: number;
  description: string;
  /** شاخص جهت‌دار مثبت (۱۴ دوره) */
  plusDI?: number;
  /** شاخص جهت‌دار منفی (۱۴ دوره) */
  minusDI?: number;
  /** فاصلهٔ درصدی EMA20 از EMA50 (معیار تأیید جهت روند) */
  emaSlopePercent?: number;
}

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  structureScore: number; // 0-100
  lastMSS: StructureEvent | null;
  lastBOS: StructureEvent | null;
  sweeps: LiquiditySweep[];
  fvgCount: number;
  orderBlockCount: number;
  volumeState: 'EXPANSION' | 'CONTRACTION' | 'NORMAL';
}

export interface MTFAnalysis {
  timeframes: Record<Timeframe, TimeframeAnalysis>;
  alignmentScore: number; // 0 - 100
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // Based on 1D/4H/1H
  ltfConfirmation: boolean; // Based on 15m/5m/1m MSS & Sweeps
  confluenceDescription: string;
}

export interface Layer3Analysis {
  layer1BasicLiquidity: {
    swingHighsCount: number;
    swingLowsCount: number;
    equalHighs: LiquidityLevel[];
    equalLows: LiquidityLevel[];
    pdhDistancePercent: number;
    pdlDistancePercent: number;
    score: number;
  };
  layer2StructuralLiquidity: {
    activeSweeps: LiquiditySweep[];
    activeMSS: StructureEvent | null;
    activeBOS: StructureEvent | null;
    recentFVGs: FairValueGap[];
    recentOBs: OrderBlock[];
    sessionSweeps: string[];
    displacementScore: number;
    score: number;
  };
  layer3AdvancedContext: {
    htfAlignment: boolean;
    sessionConfluence: boolean;
    sweepPlusMSSDisplacement: boolean;
    volumeConfluence: boolean;
    derivativesConfluence: boolean;
    regimeBonus: number;
    score: number;
  };
  totalLayer3Score: number; // 0-100
}

export type SignalClassification = 'NO_SIGNAL' | 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
export type SignalDirection = 'LONG' | 'SHORT' | 'NO_SIGNAL';

export interface SignalComponents {
  liquidity: number; // 0-100
  marketStructure: number; // 0-100
  multiTimeframe: number; // 0-100
  sessionLiquidity: number; // 0-100
  volume: number; // 0-100
  derivatives: number; // 0-100
  advancedLayer3: number; // 0-100
}

export interface SignalWeights {
  liquidity: number; // default 0.20
  marketStructure: number; // default 0.20
  multiTimeframe: number; // default 0.20
  sessionLiquidity: number; // default 0.10
  volume: number; // default 0.10
  derivatives: number; // default 0.10
  advancedLayer3: number; // default 0.10
}

/** منبع هدف قیمتی — برای شفافیت «چرا این هدف انتخاب شد» */
export type TradeTargetSource =
  | 'EQUAL_HIGH'
  | 'EQUAL_LOW'
  | 'SWING_HIGH'
  | 'SWING_LOW'
  | 'PREVIOUS_DAY_HIGH'
  | 'PREVIOUS_DAY_LOW'
  | 'SESSION_HIGH'
  | 'SESSION_LOW'
  | 'VOLUME_PROFILE_VAH'
  | 'VOLUME_PROFILE_VAL'
  | 'VOLUME_PROFILE_POC'
  | 'R_MULTIPLE';

export interface TradePlan {
  entry: {
    min: number;
    max: number;
    optimal: number;
    type: 'LIQUIDITY_RECLAIM' | 'FVG' | 'ORDER_BLOCK' | 'STRUCTURE_RETEST';
  };
  stopLoss: number;
  stopLossPercent: number;
  invalidationReason: string;
  tp1: number;
  tp1Percent: number;
  tp2: number;
  tp2Percent: number;
  tp3: number;
  tp3Percent: number;
  rrRatio: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  /** منبع هر هدف؛ اهداف از «نقشهٔ نقدینگی» استخراج می‌شوند نه ضرایب ثابت */
  targetSources?: {
    tp1: TradeTargetSource;
    tp2: TradeTargetSource;
    tp3: TradeTargetSource;
  };
  /** نوسان (ATR) در لحظهٔ صدور سیگنال — برای تنظیم حجم و حد ضرر */
  atrPercent?: number;
  /** حد ضرر مبتنی بر ساختار است یا فقط بر پایهٔ نوسان */
  stopLossBasis?: 'STRUCTURE' | 'SWEEP_EXTREME' | 'ATR' | 'FALLBACK';
}

export interface Signal {
  symbol: string;
  timeframe: Timeframe;
  direction: SignalDirection;
  /** امتیاز ستاپ: در نبود ستاپ جهت‌دار، سقف می‌خورد تا «اطمینان کاذب» القا نکند */
  score: number; // 0-100
  /** کیفیت خام زمینهٔ بازار (۰-۱۰۰) — مستقل از وجود یا نبود ستاپ جهت‌دار */
  contextScore?: number;
  classification: SignalClassification;
  currentPrice: number;
  tradePlan: TradePlan | null;
  reasons: string[];
  warnings: string[];
  invalidation: string;
  marketRegime: MarketRegime;
  components: SignalComponents;
  layer3: Layer3Analysis;
  dataTimestamp: number;
  analysisTimestamp: number;
  isStale: boolean;
}

export interface CoinMetadata {
  id: string;
  symbol: string;
  name: string;
  rank: number;
  marketCapUSD: number;
  volume24hUSD: number;
  priceChange24h: number;
  source: 'binance' | 'coingecko';
}

export interface FullAnalysisResult {
  symbol: string;
  timeframe: Timeframe;
  ticker: Ticker24h;
  metadata?: CoinMetadata;
  signal: Signal;
  liquidityLevels: LiquidityLevel[];
  liquiditySweeps: LiquiditySweep[];
  structure: MarketStructureSummary;
  sessionLiquidity: SessionLiquiditySummary;
  volumeMetrics: VolumeMetrics;
  derivatives: DerivativesData;
  marketRegime: MarketRegime;
  mtf: MTFAnalysis;
  layer3: Layer3Analysis;
  candles: Kline[]; // Current timeframe candles
  dataTimestamp: number;
  analysisTimestamp: number;
  /** زنده بودن داده‌ها: اگر پروایدر به داده شبیه‌سازی‌شده پناه برده باشد 'simulated' است */
  dataSource?: 'live' | 'simulated';
  /** جزئیات کیفیت دادهٔ همین پاسخ (نسبت فراخوانی‌های زنده) */
  dataQuality?: DataQualityInfo;
  /** زمان اجرای کامل خط لوله به میلی‌ثانیه (برای پایش کارایی) */
  durationMs?: number;
}

// Backtesting interfaces
export type FailureCategory =
  | 'LIQUIDITY_FAIL' // شکست سطح نقدینگی و عبور از حد ساختاری
  | 'FALSE_BREAKOUT' // شکست جعلی و تله ادامه حرکت
  | 'WEAK_DISPLACEMENT' // دیسپلیسمنت ضعیف و رکود مومنتوم
  | 'HTF_CONFLICT' // تضاد با روند تایم‌فریم بالا
  | 'VOLUME_FAIL' // عدم تأیید حجمی
  | 'FUNDING_SQUEEZE'; // فشار فاندینگ

export interface BacktestTrade {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  exitTime: number;
  exitPrice: number;
  exitReason: 'TP1' | 'TP2' | 'TP3' | 'STOP_LOSS' | 'TIMEOUT';
  pnlPercent: number;
  rrRealized: number;
  status: 'WIN' | 'LOSS';
  score: number;
  reasons: string[];
  failureReason?: string;
  failureCategory?: FailureCategory;
  holdCandles?: number; // تعداد کندل‌های باز بودن معامله
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // %
  lossRate: number; // %
  profitFactor: number;
  /** انتظار ریاضی هر معامله بر حسب واحد ریسک (R) */
  expectancy: number;
  maxDrawdownPercent: number;
  avgRR: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldCandles: number;
  cumulativeReturnPercent: number;
  equityCurve: { time: number; equity: number; drawdown: number }[];
}

export interface WalkForwardResult {
  training: BacktestMetrics;
  validation: BacktestMetrics;
  outOfSample: BacktestMetrics;
  overfitWarning: boolean;
}

export interface FalseSignalBreakdown {
  liquidityFailures: number;
  falseBreakouts: number;
  weakDisplacement: number;
  badHTFAlignment: number;
  volumeFailure: number;
  extremeFundingSqueeze: number;
  totalLosses: number;
}

export interface BacktestReport {
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  candlesAnalyzed: number;
  overallMetrics: BacktestMetrics;
  walkForward: WalkForwardResult;
  failureBreakdown: FalseSignalBreakdown;
  trades: BacktestTrade[];
  /** فرض‌های شفاف شبیه‌سازی (برای جلوگیری از تفسیر نادرست نتایج) */
  assumptions?: string[];
}
