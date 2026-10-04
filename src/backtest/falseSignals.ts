import { BacktestTrade, FailureCategory, FalseSignalBreakdown } from '../types/market';

/**
 * طبقه‌بندی علل شکست معاملات زیان‌ده — برچسب‌ها دسته‌بندی واقعی هر معامله است
 * و دیگر هیچ توزیع مصنوعی ساخته نمی‌شود (دادهٔ صادقانه).
 */
const LEGACY_TEXT_MAP: { match: RegExp; category: FailureCategory }[] = [
  { match: /نقدینگی|Liquidity/i, category: 'LIQUIDITY_FAIL' },
  { match: /شکست جعلی|تله|Breakout|Trap/i, category: 'FALSE_BREAKOUT' },
  { match: /دیسپلیسمنت|مومنتوم|Displacement|Momentum/i, category: 'WEAK_DISPLACEMENT' },
  { match: /تایم‌فریم بالا|تایم بالا|HTF/i, category: 'HTF_CONFLICT' },
  { match: /حجم|Volume/i, category: 'VOLUME_FAIL' },
  { match: /فاندینگ|Funding/i, category: 'FUNDING_SQUEEZE' },
];

export function analyzeFalseSignals(trades: BacktestTrade[]): FalseSignalBreakdown {
  const losses = trades.filter((t) => t.status === 'LOSS');
  const totalLosses = losses.length;

  let liquidityFailures = 0;
  let falseBreakouts = 0;
  let weakDisplacement = 0;
  let badHTFAlignment = 0;
  let volumeFailure = 0;
  let extremeFundingSqueeze = 0;

  for (const trade of losses) {
    let category: FailureCategory | undefined = trade.failureCategory;

    // سازگاری با داده‌های قدیمی: اگر دسته نداشت، از روی متن تشخیص بده
    if (!category && trade.failureReason) {
      category = LEGACY_TEXT_MAP.find((m) => m.match.test(trade.failureReason || ''))?.category;
    }

    switch (category) {
      case 'FALSE_BREAKOUT':
        falseBreakouts++;
        break;
      case 'WEAK_DISPLACEMENT':
        weakDisplacement++;
        break;
      case 'HTF_CONFLICT':
        badHTFAlignment++;
        break;
      case 'VOLUME_FAIL':
        volumeFailure++;
        break;
      case 'FUNDING_SQUEEZE':
        extremeFundingSqueeze++;
        break;
      case 'LIQUIDITY_FAIL':
      default:
        liquidityFailures++;
        break;
    }
  }

  return {
    liquidityFailures,
    falseBreakouts,
    weakDisplacement,
    badHTFAlignment,
    volumeFailure,
    extremeFundingSqueeze,
    totalLosses,
  };
}
