import { Signal } from '@/types/market';
import { toFaDigits } from '@/lib/format';

/**
 * ردیاب «چرخهٔ عمر سیگنال»
 *
 * اسکنرهای معمول فقط یک تصویر لحظه‌ای نشان می‌دهند؛ کاربر نمی‌داند یک ستاپ
 * همین الان متولد شده یا نیم‌ساعت است در جدول است، و آیا جهت آن برگشته یا نه.
 * این ماژول با نگه‌داشتن حافظهٔ کوچکی از اسکن‌های قبلی (به‌صورت کاملاً سمت مرورگر،
 * بدون هیچ ذخیره‌سازی سمت سرور) به هر سیگنال «سن» و «وضعیت» می‌دهد:
 *
 * - `NEW`        تازه دیده شده (کمتر از آستانهٔ پایداری)
 * - `PERSISTENT` چند اسکن پیاپی با همین جهت باقی مانده است
 * - `FLIPPED`    جهت ستاپ نسبت به اسکن قبلی برگشته است
 * - `RESUMED`    ستاپ بعد از یک وقفه (خروج از جدول) با همان جهت برگشته است
 */

export type SignalLifecycleState = 'NEW' | 'PERSISTENT' | 'FLIPPED' | 'RESUMED';

export interface SignalLifecycleEntry {
  /** جهت فعال فعلی ستاپ */
  direction: 'LONG' | 'SHORT';
  /** جهت اسکن قبلی — فقط زمانی پر می‌شود که جهت برگشته باشد */
  previousDirection?: 'LONG' | 'SHORT';
  state: SignalLifecycleState;
  /** زمان اولین مشاهدهٔ ستاپ با جهت فعلی */
  firstSeen: number;
  /** زمان آخرین اسکنی که ستاپ جهت‌دار داشته است */
  lastSeen: number;
  /** تعداد اسکن‌های پیاپی با جهت یکسان */
  scans: number;
  /** تعداد تغییر جهت‌های مشاهده‌شده در طول رصد (معیار بی‌ثباتی) */
  flips: number;
  /** امتیاز آخرین اسکن و تغییر آن نسبت به اسکن قبلی */
  lastScore: number;
  scoreDelta: number;
  /** آیا در آخرین اسکن، این نماد ستاپ جهت‌دار داشته است */
  active: boolean;
  /** میانهٔ امتیاز در طول رصد — برای تشخیص «قدرت گرفتن» یا «ضعیف شدن» ستاپ */
  peakScore: number;
}

export type SignalLifecycleMap = Record<string, SignalLifecycleEntry>;

/** پس از این تعداد اسکن پیاپی با جهت یکسان، ستاپ «پایدار» شناخته می‌شود */
export const PERSISTENT_SCAN_THRESHOLD = 3;
/** سقف نمادهای رصدشده تا حافظهٔ مرورگر و رندر جدول بی‌جهت رشد نکند */
export const LIFECYCLE_MAX_ENTRIES = 120;

type LifecycleInput = Pick<Signal, 'symbol' | 'direction' | 'score'>;

/**
 * نقشهٔ چرخهٔ عمر را با نتایج اسکن جدید به‌روزرسانی می‌کند (تابع خالص و تست‌پذیر).
 *
 * @param previous نقشهٔ قبلی
 * @param signals سیگنال‌های اسکن جدید
 * @param now زمان اسکن (میلی‌ثانیه)
 */
export function updateSignalLifecycle(
  previous: SignalLifecycleMap,
  signals: LifecycleInput[],
  now: number
): SignalLifecycleMap {
  // ابتدا همهٔ نمادهای قبلی «غیرفعال» علامت می‌خورند تا وقفه در ستاپ‌ها قابل تشخیص باشد.
  const next: SignalLifecycleMap = {};
  for (const [symbol, entry] of Object.entries(previous)) {
    next[symbol] = { ...entry, active: false };
  }

  for (const signal of signals) {
    if (signal.direction !== 'LONG' && signal.direction !== 'SHORT') continue;
    const symbol = signal.symbol;
    const direction = signal.direction;
    // وضعیت قبلی باید از نقشهٔ «قبل از به‌روزرسانی» خوانده شود؛ `next` عمداً
    // ابتدا غیرفعال شده است تا وقفه در ستاپ‌ها قابل تشخیص باشد.
    const prev = previous[symbol];

    if (!prev) {
      next[symbol] = {
        direction,
        state: 'NEW',
        firstSeen: now,
        lastSeen: now,
        scans: 1,
        flips: 0,
        lastScore: signal.score,
        scoreDelta: 0,
        active: true,
        peakScore: signal.score,
      };
      continue;
    }

    const directionChanged = prev.direction !== direction;

    // ستاپ بعد از یک وقفه (نبودِ ستاپ جهت‌دار در اسکن قبل) برگشته است
    if (!prev.active) {
      next[symbol] = {
        direction,
        ...(directionChanged ? { previousDirection: prev.direction } : {}),
        state: 'RESUMED',
        firstSeen: now,
        lastSeen: now,
        scans: 1,
        flips: prev.flips + (directionChanged ? 1 : 0),
        lastScore: signal.score,
        scoreDelta: signal.score - prev.lastScore,
        active: true,
        peakScore: signal.score,
      };
      continue;
    }

    // جهت در دو اسکن پیاپی برگشته است — ستاپ «نو» با جهت مخالف
    if (directionChanged) {
      next[symbol] = {
        direction,
        previousDirection: prev.direction,
        state: 'FLIPPED',
        firstSeen: now,
        lastSeen: now,
        scans: 1,
        flips: prev.flips + 1,
        lastScore: signal.score,
        scoreDelta: signal.score - prev.lastScore,
        active: true,
        peakScore: signal.score,
      };
      continue;
    }

    const scans = prev.scans + 1;
    next[symbol] = {
      ...prev,
      state: scans >= PERSISTENT_SCAN_THRESHOLD ? 'PERSISTENT' : 'NEW',
      lastSeen: now,
      scans,
      lastScore: signal.score,
      scoreDelta: signal.score - prev.lastScore,
      active: true,
      peakScore: Math.max(prev.peakScore, signal.score),
    };
  }

  return pruneLifecycle(next);
}

/** حداکثر `LIFECYCLE_MAX_ENTRIES` نماد «تازه‌تر» حفظ می‌شود (LRU بر اساس آخرین مشاهده) */
export function pruneLifecycle(map: SignalLifecycleMap): SignalLifecycleMap {
  const entries = Object.entries(map);
  if (entries.length <= LIFECYCLE_MAX_ENTRIES) return map;
  entries.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  return Object.fromEntries(entries.slice(0, LIFECYCLE_MAX_ENTRIES));
}

/** برچسب فارسی وضعیت ستاپ (بدون وابستگی به React تا در تست هم قابل استفاده باشد) */
export function lifecycleStateLabel(entry: SignalLifecycleEntry): string {
  switch (entry.state) {
    case 'PERSISTENT':
      return `پایدار ×${toFaDigits(entry.scans)}`;
    case 'FLIPPED':
      return 'برگشتِ جهت';
    case 'RESUMED':
      return 'بازگشت';
    default:
      return 'تازه';
  }
}

/** سن ستاپ را به شکل خوانا برمی‌گرداند: «۴۲ ثانیه»، «۱۲ دقیقه»، «۳ ساعت» */
export function formatLifecycleAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return '—';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${toFaDigits(seconds)} ثانیه`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${toFaDigits(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toFaDigits(hours)} ساعت`;
  return `${toFaDigits(Math.floor(hours / 24))} روز`;
}
