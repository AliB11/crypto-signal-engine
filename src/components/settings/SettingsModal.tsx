'use client';

import React, { useState } from 'react';
import { SignalWeights } from '@/types/market';
import { DEFAULT_WEIGHTS } from '@/analysis/signal';
import { Sliders, X, ShieldCheck, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { toFaDigits } from '@/lib/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  weights: SignalWeights;
  onSaveWeights: (weights: SignalWeights) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  weights,
  onSaveWeights,
  soundEnabled,
  onToggleSound,
}) => {
  const [localWeights, setLocalWeights] = useState<SignalWeights>(weights);

  if (!isOpen) return null;

  const handleWeightChange = (key: keyof SignalWeights, val: number) => {
    setLocalWeights((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleReset = () => {
    setLocalWeights(DEFAULT_WEIGHTS);
  };

  const handleSave = () => {
    onSaveWeights(localWeights);
    onClose();
  };

  const weightSum = Math.round(
    Object.values(localWeights).reduce((sum, v) => sum + v, 0) * 100
  );
  const isSumValid = weightSum === 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* سربرگ */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-base">تنظیمات و پارامترهای موتور</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* محتوا */}
        <div className="p-6 flex flex-col gap-6 text-xs text-slate-300">
          {/* وزن‌های مدل امتیازدهی */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-100 text-sm">وزن‌های مدل امتیازدهی هم‌افزایی</h4>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>بازنشانی پیش‌فرض</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { key: 'liquidity' as const, label: 'سوئیپ‌های نقدینگی و سقف/کف برابر' },
                { key: 'marketStructure' as const, label: 'ساختار بازار و MSS/BOS' },
                { key: 'multiTimeframe' as const, label: 'هم‌راستایی چند تایم‌فریم' },
                { key: 'sessionLiquidity' as const, label: 'سقف/کف جلسات و سوئینگ جوداس' },
                { key: 'volume' as const, label: 'پروفایل حجم و عدم تعادل تیکر' },
                { key: 'derivatives' as const, label: 'قراردادهای باز و فاندینگ ریت' },
                { key: 'advancedLayer3' as const, label: 'زمینه پیشرفته لایه ۳' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-slate-300">{label}</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.05"
                      max="0.4"
                      step="0.05"
                      value={localWeights[key]}
                      onChange={(e) => handleWeightChange(key, parseFloat(e.target.value))}
                      className="w-28 accent-cyan-500"
                    />
                    <span className="font-mono font-bold text-cyan-400 w-10 text-left num">
                      {Math.round(localWeights[key] * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* نوار وضعیت مجموع وزن‌ها */}
            <div
              className={`mt-4 p-2.5 rounded-lg border text-[11px] flex items-center justify-between ${
                isSumValid
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}
            >
              <span>مجموع وزن‌ها:</span>
              <span className="font-mono font-bold num">{weightSum}%</span>
              {!isSumValid && <span>برای دقت کامل، مجموع را روی ۱۰۰٪ تنظیم کنید</span>}
            </div>
          </div>

          {/* هشدار صوتی */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-200 block">هشدار صوتی</span>
              <span className="text-[11px] text-slate-500">
                پخش صدا هنگام شناسایی ستاپ خیلی قوی (امتیاز ≥ {toFaDigits(85)})
              </span>
            </div>
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg border transition-colors ${
                soundEnabled
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-400'
                  : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
              title={soundEnabled ? 'قطع صدا' : 'فعال‌سازی صدا'}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          </div>

          {/* روش‌شناسی و سلب مسئولیت */}
          <div className="pt-4 border-t border-slate-800 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>تحلیل کمّی و هشدار ریسک</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              این سامانه یک تحلیل‌گر چندلایه ساختار بازار و موتور رتبه‌بندی ستاپ‌های معاملاتی است.
              همه امتیازها و برنامه‌های معامله، معیارهای هم‌افزایی آماری هستند و هرگز تضمین سود نیستند.
              حد ضررها، سطوح بی‌اعتباری ساختاری‌اند. با احتیاط معامله کنید و مدیریت سرمایه را جدی بگیرید.
            </p>
          </div>
        </div>

        {/* پاصفحه */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
          >
            انصراف
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md"
          >
            ذخیره تنظیمات
          </button>
        </div>
      </div>
    </div>
  );
};
