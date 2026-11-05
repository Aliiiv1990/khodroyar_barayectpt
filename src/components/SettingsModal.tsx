import React from 'react';
import { X, Type, Check, Sun, Moon, Palette } from 'lucide-react';

export type AppFontSize = 'normal' | 'large' | 'xlarge';
export type AppTheme = 'light' | 'dark';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: AppFontSize;
  onFontSizeChange: (size: AppFontSize) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  fontSize,
  onFontSizeChange,
  theme,
  onThemeChange,
}) => {
  if (!isOpen) return null;

  const fontOptions: Array<{
    id: AppFontSize;
    title: string;
    scale: string;
  }> = [
    {
      id: 'normal',
      title: 'استاندارد',
      scale: '۱۰۰٪',
    },
    {
      id: 'large',
      title: 'درشت',
      scale: '۱۱۵٪',
    },
    {
      id: 'xlarge',
      title: 'خیلی درشت',
      scale: '۱۳۰٪',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#131924] text-slate-900 dark:text-slate-100 rounded-3xl p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base">تنظیمات برنامه</h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره تنظیمات"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto py-3 space-y-4">
          {/* 1. Luxurious Charcoal Dark Mode Toggle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>تم ظاهری برنامه:</span>
              </span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                {theme === 'dark' ? 'نوک‌مدادی لوکس' : 'روشن'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-[#0c1017] p-1 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`py-2 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Sun className={`w-4 h-4 ${theme === 'light' ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                <span>حالت روشن</span>
              </button>

              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`py-2 px-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-[#1b2332] text-white shadow-xs border border-blue-500/50 ring-1 ring-blue-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Moon className={`w-4 h-4 ${theme === 'dark' ? 'text-blue-400 fill-blue-400' : 'text-slate-400'}`} />
                <span>نوک‌مدادی لوکس</span>
              </button>
            </div>
          </div>

          {/* 2. Font Size Selection Options */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Type className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                اندازه نوشته‌ها:
              </span>
            </div>

            <div className="space-y-1.5">
              {fontOptions.map((opt) => {
                const isSelected = fontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onFontSizeChange(opt.id)}
                    className={`w-full py-2.5 px-3.5 rounded-2xl border-2 text-right transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-xs text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-[#0f141d]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        {opt.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.scale}
                      </span>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'border-2 border-slate-300 dark:border-slate-600 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Close confirmation button - Always visible and pinned at bottom */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs sm:text-sm rounded-xl cursor-pointer shadow-sm transition-colors"
          >
            تأیید و ذخیره تنظیمات
          </button>
        </div>
      </div>
    </div>
  );
};
