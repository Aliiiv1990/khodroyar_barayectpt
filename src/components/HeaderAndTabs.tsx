import React from 'react';
import { CarListingType } from '../types/car';
import { toPersianDigits } from '../utils/dataPruner';
import {
  Car,
  ShoppingBag,
  ShieldCheck,
  Lock,
  Database,
  Settings,
  Plus,
  ExternalLink,
  Crown,
} from 'lucide-react';
import { isRunningInIframe } from '../utils/microphoneHelper';
import { UserAuthRole } from './ColleagueAuthModal';

interface HeaderAndTabsProps {
  activeType: CarListingType;
  onTypeChange: (type: CarListingType) => void;
  saleCount: number;
  buyCount: number;
  isUnlockedColleague: boolean;
  userRole?: UserAuthRole;
  onRequestColleagueModal: () => void;
  onToggleColleagueLock: () => void;
  onOpenDataManager: () => void;
  onOpenSettings: () => void;
  onOpenNewListing: () => void;
  hasActiveFilter?: boolean;
}

export const HeaderAndTabs: React.FC<HeaderAndTabsProps> = ({
  activeType,
  onTypeChange,
  saleCount,
  buyCount,
  isUnlockedColleague,
  userRole = 'guest',
  onRequestColleagueModal,
  onToggleColleagueLock,
  onOpenDataManager,
  onOpenSettings,
  onOpenNewListing,
  hasActiveFilter = false,
}) => {
  return (
    <header className="shrink-0 space-y-1.5 pt-1.5 pb-1">
      {/* Top Navbar: Compact on mobile so all buttons fit without overflow */}
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {/* Brand Title: Never truncated into ellipsis */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Car className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="shrink-0">
            <h1 className="text-xs sm:text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1 whitespace-nowrap">
              <span>آگهی‌های خودرو</span>
              <span className="hidden md:inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                فوق‌سریع
              </span>
            </h1>
          </div>
        </div>

        {/* Action Buttons: Compact icons & responsive labels */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          {/* Prominent Add Listing Button */}
          <button
            type="button"
            onClick={onOpenNewListing}
            className="flex items-center gap-1 px-1.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
            title="ثبت آگهی صوتی یا دستی"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span>ثبت</span>
            <span className="hidden sm:inline">آگهی</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 p-1.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg sm:rounded-xl text-xs font-bold transition-colors border border-transparent dark:border-slate-700/60 cursor-pointer shrink-0"
            title="تنظیمات اندازه فونت و برنامه"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 dark:text-slate-300" />
            <span className="hidden lg:inline text-xs">تنظیمات</span>
          </button>

          <button
            type="button"
            onClick={onOpenDataManager}
            className={`flex items-center gap-1 p-1.5 rounded-lg sm:rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              userRole === 'admin'
                ? 'bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900/60 text-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 text-slate-700 dark:text-slate-200 border border-transparent dark:border-slate-700/60'
            }`}
            title={userRole === 'admin' ? 'پنل مدیریت داده‌ها و انتشار در لیارا' : 'مدیریت داده‌ها'}
          >
            <Database className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${userRole === 'admin' ? 'text-purple-700 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`} />
            <span className="hidden lg:inline text-xs">داده‌ها</span>
          </button>

          {/* Direct Tab opener for full permissions (microphone, fullscreen, etc.) */}
          {typeof window !== 'undefined' && isRunningInIframe() && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 p-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg sm:rounded-xl text-xs font-bold transition-colors border border-blue-200 dark:border-blue-800/60 no-underline cursor-pointer shrink-0"
              title="باز کردن در تب مستقیم (برای فعال‌سازی کامل میکروفون)"
            >
              <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
              <span className="hidden xl:inline text-xs">تب جدید</span>
            </a>
          )}

          {userRole === 'admin' ? (
            <button
              type="button"
              onClick={onRequestColleagueModal}
              className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-all shadow-xs cursor-pointer shrink-0"
              title="حساب مدیر نمایشگاه"
            >
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-200" />
              <span>مدیر</span>
            </button>
          ) : userRole === 'colleague' || isUnlockedColleague ? (
            <button
              type="button"
              onClick={onRequestColleagueModal}
              className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 bg-emerald-100 dark:bg-emerald-950/50 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-colors cursor-pointer border border-emerald-300 dark:border-emerald-800/60 shrink-0"
              title="حساب همکار نمایشگاه"
            >
              <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
              <span>همکار</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestColleagueModal}
              className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-300 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-colors cursor-pointer border border-amber-200 dark:border-amber-800/60 shrink-0"
              title="ورود همکار یا مدیر (مشاهده شماره تماس مالکان)"
            >
              <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
              <span>ورود</span>
            </button>
          )}
        </div>
      </div>

      {/* Two Prominent Main Category Tabs with Integrated Match Badges */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 dark:bg-[#0f1520] p-1 rounded-2xl border border-transparent dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => onTypeChange('sale')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1.5 sm:px-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
            activeType === 'sale'
              ? 'bg-white dark:bg-[#1a2332] text-blue-700 dark:text-blue-400 shadow-xs dark:shadow-md border border-transparent dark:border-blue-500/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="whitespace-nowrap leading-tight text-center">
            <span className="hidden sm:inline">خودروهای </span>فروشی
          </span>
          <span
            className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full font-extrabold shrink-0 transition-colors ${
              activeType === 'sale'
                ? hasActiveFilter
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300'
                : hasActiveFilter && saleCount > 0
                ? 'bg-amber-500 text-white'
                : 'bg-slate-300/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {toPersianDigits(saleCount)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTypeChange('buy_request')}
          className={`flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 px-1.5 sm:px-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
            activeType === 'buy_request'
              ? 'bg-white dark:bg-[#1a2332] text-emerald-700 dark:text-emerald-400 shadow-xs dark:shadow-md border border-transparent dark:border-emerald-500/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="whitespace-nowrap leading-tight text-center">
            <span className="hidden sm:inline">درخواست‌های </span>خرید
          </span>
          <span
            className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full font-extrabold shrink-0 transition-colors ${
              activeType === 'buy_request'
                ? hasActiveFilter
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                : hasActiveFilter && buyCount > 0
                ? 'bg-amber-500 text-white'
                : 'bg-slate-300/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {toPersianDigits(buyCount)}
          </span>
        </button>
      </div>
    </header>
  );
};
