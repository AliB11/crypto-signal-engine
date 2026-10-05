import { NextResponse } from 'next/server';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { getPublicConfig } from '@/config/engine';

export const dynamic = 'force-dynamic';

/** پیکربندی عمومی موتور — همهٔ مقادیر از تک‌منبع `src/config/engine.ts` خوانده می‌شوند */
export async function GET() {
  return NextResponse.json({
    ...getPublicConfig(),
    weights: DEFAULT_WEIGHTS,
  });
}
