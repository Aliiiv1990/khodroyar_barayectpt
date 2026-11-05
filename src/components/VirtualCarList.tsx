import React, { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CarListing, CarListingType } from '../types/car';
import { CarCard } from './CarCard';
import { Car, RefreshCw, Upload, Sparkles, PlusCircle, ArrowLeftRight, ArrowUp } from 'lucide-react';
import { toPersianDigits } from '../utils/dataPruner';

interface VirtualCarListProps {
  listings: CarListing[];
  totalListingsCount: number;
  isUnlockedColleague: boolean;
  onOpenDetails: (listing: CarListing) => void;
  onRequestUnlock: () => void;
  onResetFilters: () => void;
  onOpenDataManager?: () => void;
  onRegenerateDemo?: () => void;
  onOpenNewListing?: () => void;
  activeType?: CarListingType;
  otherTabMatchesCount?: number;
  onSwitchTab?: (targetType: CarListingType) => void;
  topPadding?: number;
  onScroll?: (scrollTop: number) => void;
  scrollResetKey?: string;
}

export const VirtualCarList: React.FC<VirtualCarListProps> = ({
  listings,
  totalListingsCount,
  isUnlockedColleague,
  onOpenDetails,
  onRequestUnlock,
  onResetFilters,
  onOpenDataManager,
  onRegenerateDemo,
  onOpenNewListing,
  activeType = 'sale',
  otherTabMatchesCount = 0,
  onSwitchTab,
  topPadding = 228,
  onScroll,
  scrollResetKey,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  const oppositeType: CarListingType = activeType === 'sale' ? 'buy_request' : 'sale';
  const oppositeTabLabel = oppositeType === 'sale' ? 'خودروهای فروشی' : 'درخواست‌های خرید';

  // Reset scroll to top when tab or filter criteria change
  useEffect(() => {
    if (parentRef.current && parentRef.current.scrollTop > 0) {
      parentRef.current.scrollTop = 0;
      setShowScrollTopBtn(false);
      onScroll?.(0);
    }
  }, [scrollResetKey]);

  // Virtualizer setup: only renders visible 10-15 cards (+4 overscan) in DOM
  const rowVirtualizer = useVirtualizer({
    count: listings.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180, // estimated height of card + gap
    overscan: 4,
    paddingStart: topPadding + 8,
    paddingEnd: 84,
  });

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    setShowScrollTopBtn(currentScrollTop > 520);
    onScroll?.(currentScrollTop);
  };

  const handleScrollToTop = () => {
    if (parentRef.current) {
      parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    onScroll?.(0);
  };

  // Case 1: Database is completely empty (user cleared all listings)
  if (totalListingsCount === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto flex flex-col justify-center pb-6"
        style={{ paddingTop: `${topPadding + 8}px` }}
      >
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center bg-white dark:bg-[#131924] rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-sm my-2">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 ring-8 ring-blue-50/50 dark:ring-blue-950/20">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">
            بانک اطلاعاتی برنامه خالی است
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
            تمامی آگهی‌های قبلی با موفقیت پاکسازی شدند. وضعیت خالی بودن در مرورگر شما ذخیره شده و با قطع اینترنت یا رفرش نیز دوباره دیتای تکراری لود نخواهد شد.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
            {onOpenDataManager && (
              <button
                type="button"
                onClick={onOpenDataManager}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Upload className="w-4 h-4" />
                <span>تزریق فایل (ZIP / JSON)</span>
              </button>
            )}

            {onOpenNewListing && (
              <button
                type="button"
                onClick={onOpenNewListing}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-black text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>ثبت آگهی یا سفارش</span>
              </button>
            )}
          </div>

          {onRegenerateDemo && (
            <button
              type="button"
              onClick={onRegenerateDemo}
              className="mt-4 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 cursor-pointer py-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>بارگذاری مجدد ۵,۰۰۰ آگهی آزمایشی جهت تست سرعت</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Filter yielded no results
  if (listings.length === 0) {
    return (
      <div
        className="flex-1 overflow-y-auto flex flex-col justify-center pb-6"
        style={{ paddingTop: `${topPadding + 8}px` }}
      >
        <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#131924] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs my-2">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">
            هیچ آگهی با این مشخصات در این تب یافت نشد
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed">
            می‌توانید فیلترهای جستجو یا قیمت را پاک کنید تا همه آگهی‌های فعال نمایش داده شوند.
          </p>

          {otherTabMatchesCount > 0 && onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab(oppositeType)}
              className="mb-3 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>
                مشاهده {toPersianDigits(otherTabMatchesCount)} آگهی منطبق در تب «{oppositeTabLabel}»
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>نمایش همه آگهی‌ها</span>
          </button>
        </div>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Scrollable Virtual Container */}
      <div
        ref={parentRef}
        onScroll={handleContainerScroll}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 pl-1 overscroll-y-contain"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = listings[virtualRow.index];
            if (!item) return null;

            return (
              <div
                key={item.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="virtual-row pb-3.5"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <CarCard
                  listing={item}
                  isUnlockedColleague={isUnlockedColleague}
                  onOpenDetails={onOpenDetails}
                  onRequestUnlock={onRequestUnlock}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Scroll-To-Top Button when scrolled deep into list */}
      {showScrollTopBtn && (
        <button
          type="button"
          onClick={handleScrollToTop}
          className="fixed bottom-5 left-4 z-20 flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-white text-xs font-black shadow-lg backdrop-blur-xs transition-all cursor-pointer border border-white/15"
          title="بازگشت به بالای لیست"
        >
          <ArrowUp className="w-4 h-4" />
          <span>بالا</span>
        </button>
      )}
    </div>
  );
};
