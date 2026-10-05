import { LiquidityLevel } from '@/types/market';

/**
 * «مغناطیس نقدینگی» — نردبان سطوح دست‌نخوردهٔ اطراف قیمت.
 *
 * بازار معمولاً به سمت مناطقی کشیده می‌شود که سفارش‌های باقی‌مانده (استاپ‌ها و
 * سفارش‌های محدود) در آن‌ها تلنبار شده است. این ماژول نزدیک‌ترین سطوح
 * دست‌نخوردهٔ بالای قیمت (نقدینگی سمت فروش) و پایین قیمت (نقدینگی سمت خرید)
 * را رتبه‌بندی می‌کند و یک «کشش خالص» برای نمایش جهت احتمالی آینده می‌سازد.
 */

export interface MagnetLevel {
  price: number;
  type: LiquidityLevel['type'];
  strength: number;
  /** فاصلهٔ درصدی از قیمت فعلی (همیشه مثبت) */
  distancePercent: number;
  side: 'ABOVE' | 'BELOW';
}

export interface LiquidityDraw {
  upWeight: number;
  downWeight: number;
  direction: 'UP' | 'DOWN' | 'BALANCED';
  /** سهم کشش صعودی از کل (۰ تا ۱۰۰) */
  upPercent: number;
  /** تعداد سطوح دست‌نخوردهٔ استفاده‌شده */
  unsweptCount: number;
}

function distancePercentFrom(price: number, currentPrice: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(currentPrice) || currentPrice <= 0) return 0;
  return Math.abs(((price - currentPrice) / currentPrice) * 100);
}

function untapped(levels: LiquidityLevel[]): LiquidityLevel[] {
  return levels.filter(
    (lvl) => !lvl.swept && Number.isFinite(lvl.price) && lvl.price > 0 && lvl.price !== 0
  );
}

/**
 * نزدیک‌ترین سطوح دست‌نخوردهٔ هر سمت قیمت را به‌ترتیب فاصله برمی‌گرداند.
 */
export function selectLiquidityMagnets(
  levels: LiquidityLevel[],
  currentPrice: number,
  perSide = 3
): { above: MagnetLevel[]; below: MagnetLevel[] } {
  const unswept = untapped(levels);

  const above: MagnetLevel[] = unswept
    .filter((lvl) => lvl.price > currentPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, perSide)
    .map((lvl) => ({
      price: lvl.price,
      type: lvl.type,
      strength: lvl.strength,
      distancePercent: distancePercentFrom(lvl.price, currentPrice),
      side: 'ABOVE' as const,
    }));

  const below: MagnetLevel[] = unswept
    .filter((lvl) => lvl.price < currentPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, perSide)
    .map((lvl) => ({
      price: lvl.price,
      type: lvl.type,
      strength: lvl.strength,
      distancePercent: distancePercentFrom(lvl.price, currentPrice),
      side: 'BELOW' as const,
    }));

  return { above, below };
}

/**
 * وزن هر سطح = قدرت آن تقسیم بر فاصله (سطوح دورتر کشش کمتری دارند).
 * سطوح دقیقاً روی قیمت فعلی نادیده گرفته می‌شوند تا جهت‌گیری مصنوعی نسازند.
 */
function drawWeight(level: LiquidityLevel, currentPrice: number): number {
  const distance = distancePercentFrom(level.price, currentPrice);
  if (distance < 0.02) return 0;
  return level.strength / (1 + distance);
}

export function computeLiquidityDraw(levels: LiquidityLevel[], currentPrice: number): LiquidityDraw {
  const unswept = untapped(levels).filter((lvl) => Math.abs(lvl.price - currentPrice) > 0);
  let upWeight = 0;
  let downWeight = 0;

  for (const lvl of unswept) {
    const weight = drawWeight(lvl, currentPrice);
    if (lvl.price > currentPrice) upWeight += weight;
    else downWeight += weight;
  }

  const total = upWeight + downWeight;
  const upPercent = total > 0 ? Math.round((upWeight / total) * 100) : 50;
  const rounded = {
    upWeight: Math.round(upWeight * 10) / 10,
    downWeight: Math.round(downWeight * 10) / 10,
  };

  let direction: LiquidityDraw['direction'] = 'BALANCED';
  if (total > 0) {
    if (upPercent >= 60) direction = 'UP';
    else if (upPercent <= 40) direction = 'DOWN';
  }

  return {
    ...rounded,
    direction,
    upPercent,
    unsweptCount: unswept.length,
  };
}
