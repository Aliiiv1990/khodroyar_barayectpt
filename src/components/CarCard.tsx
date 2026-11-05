import React from 'react';
import { CarListing } from '../types/car';
import { LazyThumbnail } from './LazyThumbnail';
import { toPersianDigits } from '../utils/dataPruner';
import { getListingImage } from '../utils/imageHelper';
import { parseListingFileName } from '../utils/sellerDataParser';
import { extractCleanFileDescription } from '../utils/sessionDataParser';
import {
  Phone,
  Lock,
  FileText,
  ChevronLeft,
  ShieldCheck,
  UserCheck,
  Sparkles,
} from 'lucide-react';

interface CarCardProps {
  listing: CarListing;
  isUnlockedColleague: boolean;
  onOpenDetails: (listing: CarListing) => void;
  onRequestUnlock: () => void;
}

export const CarCard: React.FC<CarCardProps> = React.memo(({
  listing,
  isUnlockedColleague,
  onOpenDetails,
  onRequestUnlock,
}) => {
  const isSale = listing.type === 'sale';
  const isUserSubmitted = listing.source === 'user';
  const parsedFile = parseListingFileName(listing.imageFileName);
  const effectivePhone =
    parsedFile.phoneNumber !== 'ثبت نشده'
      ? parsedFile.phoneNumber
      : listing.phoneNumber || 'ثبت نشده';
  const rawFileText = listing.fileDescription || listing.description || '';
  const fileText =
    !listing.isEdited && parsedFile.caption && (!rawFileText || rawFileText === parsedFile.randomCode)
      ? extractCleanFileDescription(listing.imageFileName, listing.color, rawFileText)
      : rawFileText;

  return (
    <div
      onClick={() => onOpenDetails(listing)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpenDetails(listing);
        }
      }}
      className={`group relative rounded-2xl transition-all duration-150 p-2.5 sm:p-3 select-none flex flex-col justify-between cursor-pointer active:scale-[0.99] ${
        isUserSubmitted
          ? 'bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white dark:from-[#191a32]/90 dark:via-[#16172a]/60 dark:to-[#131924] border-2 border-indigo-300/90 dark:border-indigo-500/50 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-400 hover:shadow-md'
          : 'bg-white dark:bg-[#131924] border border-slate-200/90 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs dark:shadow-md'
      }`}
    >
      <div className="flex items-start gap-2.5 sm:gap-3.5">
        {/* Square Thumbnail (or Text File Icon for text-only files) - 96px */}
        {listing.isTextOnly ? (
          <div
            className={`flex w-[96px] h-[96px] min-w-[96px] min-h-[96px] rounded-xl flex-col items-center justify-center shrink-0 shadow-xs ${
              isUserSubmitted
                ? 'bg-indigo-100/90 dark:bg-indigo-950/50 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/50 text-amber-700 dark:text-amber-300'
            }`}
          >
            {isUserSubmitted ? (
              <UserCheck className="w-9 h-9 text-indigo-600 dark:text-indigo-400 stroke-[1.8]" />
            ) : (
              <FileText className="w-9 h-9 text-amber-600 dark:text-amber-400 stroke-[1.8]" />
            )}
            <span
              className={`text-[10px] font-black mt-0.5 ${
                isUserSubmitted ? 'text-indigo-900 dark:text-indigo-300' : 'text-amber-800 dark:text-amber-300'
              }`}
            >
              {isUserSubmitted ? 'ثبت همکار' : 'فایل متنی'}
            </span>
          </div>
        ) : (
          <div className="block relative shrink-0">
            <LazyThumbnail
              base64Src={getListingImage(listing, false)}
              alt={listing.model}
              size={96}
            />
            {isUserSubmitted && (
              <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white p-1 rounded-full shadow-xs">
                <Sparkles className="w-3 h-3" />
              </span>
            )}
          </div>
        )}

        {/* Info Column */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {/* 1. Car Name, Year, and Source Badges */}
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <h3
              className={`text-sm sm:text-lg font-black transition-colors flex flex-wrap items-baseline gap-x-1.5 leading-snug min-w-0 ${
                isUserSubmitted
                  ? 'text-indigo-950 dark:text-indigo-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                  : 'text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400'
              }`}
            >
              <span className="truncate">{listing.model}</span>
              {listing.year > 0 && (
                <span className="text-slate-500 dark:text-slate-400 font-bold text-xs sm:text-sm shrink-0">
                  - مدل {toPersianDigits(listing.year)}
                </span>
              )}
            </h3>

            <div className="flex items-center gap-1 shrink-0">
              {isUserSubmitted ? (
                <span className="text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700/60 flex items-center gap-0.5 shadow-2xs">
                  <UserCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>ثبت همکار</span>
                </span>
              ) : null}

              <span
                className={`text-[11px] font-black px-2 py-0.5 rounded-md shrink-0 ${
                  isSale
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50'
                }`}
              >
                {isSale ? 'فروشی' : 'خرید'}
              </span>
            </div>
          </div>

          {/* 2. Filename Text / Description */}
          <div
            className={`flex items-start gap-1 text-xs sm:text-sm font-medium line-clamp-2 leading-relaxed p-1 sm:p-1.5 rounded-lg border ${
              isUserSubmitted
                ? 'bg-indigo-50/70 dark:bg-[#161829] border-indigo-100/90 dark:border-indigo-900/40 text-indigo-950 dark:text-indigo-200'
                : 'bg-slate-50 dark:bg-[#0c1017] border-slate-100 dark:border-slate-800/80 text-slate-600 dark:text-slate-300'
            }`}
          >
            {isUserSubmitted ? (
              <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
            )}
            <span
              className={`line-clamp-2 dir-rtl text-right ${
                isUserSubmitted ? 'text-indigo-950 dark:text-indigo-200 font-semibold' : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {fileText || 'بدون توضیحات فایل'}
            </span>
          </div>

          {/* 3. Minimal Price & Quick Status */}
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="font-black text-blue-700 dark:text-blue-400 text-sm sm:text-base">
              {listing.priceFormatted}
            </span>
            <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px] flex items-center gap-0.5 group-hover:text-blue-500 transition-colors">
              <span>مشاهده آگهی</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Phone Section */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        {isUnlockedColleague ? (
          <div className="flex items-center justify-between w-full gap-2">
            {effectivePhone && effectivePhone !== 'ثبت نشده' && !effectivePhone.includes('0000000') ? (
              <>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-300 dir-ltr font-mono bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{effectivePhone}</span>
                </div>

                <a
                  href={`tel:${effectivePhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[11px] sm:text-xs font-black shadow-2xs transition-colors cursor-pointer"
                  aria-label={`تماس با شماره ${effectivePhone}`}
                >
                  <Phone className="w-3 h-3 shrink-0" />
                  <span>تماس مستقیم</span>
                </a>
              </>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                  شماره تماس: در فایل ثبت نشده
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">تماس توافقی</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestUnlock();
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
            >
              <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>شماره تماس: مخصوص همکاران</span>
              <span className="text-[10px] underline text-amber-700 dark:text-amber-400 mr-0.5">(ورود)</span>
            </button>

            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {listing.city}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

CarCard.displayName = 'CarCard';
