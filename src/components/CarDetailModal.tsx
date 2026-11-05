import React, { useState, useEffect } from 'react';
import { CarListing, CarListingType } from '../types/car';
import { toPersianDigits } from '../utils/dataPruner';
import { getListingImage } from '../utils/imageHelper';
import { parseListingFileName } from '../utils/sellerDataParser';
import { extractCleanFileDescription, applyListingEdits } from '../utils/sessionDataParser';
import {
  X,
  Phone,
  Lock,
  FileText,
  Copy,
  Check,
  Eye,
  EyeOff,
  Palette,
  Gauge,
  Settings,
  Sparkles,
  Pencil,
} from 'lucide-react';

interface CarDetailModalProps {
  listing: CarListing | null;
  isOpen: boolean;
  onClose: () => void;
  isUnlockedColleague: boolean;
  onRequestUnlock: () => void;
  onUpdateListing?: (updatedListing: CarListing) => Promise<void> | void;
}

export const CarDetailModal: React.FC<CarDetailModalProps> = ({
  listing,
  isOpen,
  onClose,
  isUnlockedColleague,
  onRequestUnlock,
  onUpdateListing,
}) => {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const parsedFile = parseListingFileName(listing?.imageFileName);
  const effectivePhone =
    parsedFile.phoneNumber !== 'ثبت نشده'
      ? parsedFile.phoneNumber
      : listing?.phoneNumber || 'ثبت نشده';
  const rawFullText = listing?.fileDescription || listing?.description || '';
  const fullText =
    listing && !listing.isEdited && parsedFile.caption && (!rawFullText || rawFullText === parsedFile.randomCode)
      ? extractCleanFileDescription(listing.imageFileName, listing.color, rawFullText)
      : rawFullText;

  const [editModel, setEditModel] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editType, setEditType] = useState<CarListingType>('sale');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editMileage, setEditMileage] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editGearbox, setEditGearbox] = useState<'دنده‌ای' | 'اتوماتیک'>('دنده‌ای');
  const [editBody, setEditBody] = useState('');
  const [editCity, setEditCity] = useState('تهران');

  useEffect(() => {
    if (listing) {
      setIsEditing(false);
      setEditModel(listing.model);
      setEditYear(listing.year > 0 ? toPersianDigits(listing.year) : '');
      setEditType(listing.type);
      setEditDescription(fullText);
      setEditPrice(listing.priceFormatted || '');
      setEditMileage(listing.mileageFormatted || '');
      setEditColor(listing.color || '');
      setEditGearbox(listing.gearbox || 'دنده‌ای');
      setEditBody(listing.bodyCondition || '');
      setEditCity(listing.city || 'تهران');
    }
  }, [listing?.id, isOpen]);

  if (!isOpen || !listing) return null;

  const isSale = listing.type === 'sale';

  const handleStartEdit = () => {
    setEditModel(listing.model);
    setEditYear(listing.year > 0 ? toPersianDigits(listing.year) : '');
    setEditType(listing.type);
    setEditDescription(fullText);
    setEditPrice(listing.priceFormatted || '');
    setEditMileage(listing.mileageFormatted || '');
    setEditColor(listing.color || '');
    setEditGearbox(listing.gearbox || 'دنده‌ای');
    setEditBody(listing.bodyCondition || '');
    setEditCity(listing.city || 'تهران');
    setShowOverlay(true);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editModel.trim()) return;
    setIsSaving(true);
    try {
      const updated = applyListingEdits(listing, {
        model: editModel,
        yearInput: editYear,
        type: editType,
        fileDescription: editDescription,
        priceInput: editPrice,
        mileageInput: editMileage,
        color: editColor,
        gearbox: editGearbox,
        bodyCondition: editBody,
        city: editCity,
      });
      if (onUpdateListing) {
        await onUpdateListing(updated);
      }
      setIsEditing(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyPhone = () => {
    if (effectivePhone && effectivePhone !== 'ثبت نشده') {
      navigator.clipboard?.writeText(effectivePhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleCopyText = () => {
    if (fullText) {
      navigator.clipboard?.writeText(fullText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const renderEditForm = () => (
    <div
      onClick={(e) => e.stopPropagation()}
      className="space-y-2.5 text-right dir-rtl bg-neutral-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-blue-400/50 text-white"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <span className="text-xs font-black text-blue-300 flex items-center gap-1">
          <Pencil className="w-3.5 h-3.5" />
          <span>ویرایش مشخصات آگهی (شماره تماس ثابت است)</span>
        </span>
        <button
          type="button"
          onClick={() => setEditType(editType === 'sale' ? 'buy_request' : 'sale')}
          className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg border cursor-pointer ${
            editType === 'sale'
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-emerald-600 text-white border-emerald-400'
          }`}
        >
          {editType === 'sale' ? 'فروشی' : 'درخواست خرید'}
        </button>
      </div>

      {/* Car Name & Year */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">نام خودرو</label>
          <input
            type="text"
            value={editModel}
            onChange={(e) => setEditModel(e.target.value)}
            placeholder="نام خودرو"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-black text-white focus:outline-hidden"
          />
        </div>
        <div className="w-24">
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">سال ساخت</label>
          <input
            type="text"
            value={editYear}
            onChange={(e) => setEditYear(e.target.value)}
            placeholder="مثلاً ۱۴۰۳"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1.5 text-xs sm:text-sm font-bold text-white text-center focus:outline-hidden"
          />
        </div>
      </div>

      {/* Full Description */}
      <div>
        <label className="block text-[10px] font-bold text-slate-400 mb-0.5">متن کامل آگهی و فایل</label>
        <textarea
          rows={3}
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="توضیحات آگهی..."
          className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl p-2 text-xs sm:text-sm font-medium text-white leading-relaxed focus:outline-hidden resize-y"
        />
      </div>

      {/* Price, Mileage, Color, Gearbox, Body Condition, City */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">قیمت / بودجه</label>
          <input
            type="text"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            placeholder="مثلاً ۸۵۰ میلیون"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-emerald-300 focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">کارکرد</label>
          <input
            type="text"
            value={editMileage}
            onChange={(e) => setEditMileage(e.target.value)}
            placeholder="مثلاً ۴۰,۰۰۰ کیلومتر"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-white focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">رنگ</label>
          <input
            type="text"
            value={editColor}
            onChange={(e) => setEditColor(e.target.value)}
            placeholder="سفید"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-white focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">گیربکس</label>
          <select
            value={editGearbox}
            onChange={(e) => setEditGearbox(e.target.value as 'دنده‌ای' | 'اتوماتیک')}
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-white focus:outline-hidden"
          >
            <option value="دنده‌ای">دنده‌ای</option>
            <option value="اتوماتیک">اتوماتیک</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">وضعیت بدنه</label>
          <input
            type="text"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder="بدون رنگ"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-white focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-0.5">شهر</label>
          <input
            type="text"
            value={editCity}
            onChange={(e) => setEditCity(e.target.value)}
            placeholder="تهران"
            className="w-full bg-neutral-800 border border-white/20 focus:border-blue-400 rounded-xl px-2 py-1 text-xs font-bold text-white focus:outline-hidden"
          />
        </div>
      </div>

      {/* Footer: Read-only Phone + Save/Cancel */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1 truncate">
          <Lock className="w-3 h-3 shrink-0" />
          <span className="truncate">
            شماره ثابت: {isUnlockedColleague ? effectivePhone : 'مخصوص همکاران'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={isSaving || !editModel.trim()}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1 cursor-pointer shadow-md"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Zero-scroll Modal Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg h-[92vh] max-h-[720px] bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col justify-between"
      >
        {/* Top Floating Control Bar */}
        <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-3 sm:left-3 sm:right-3 z-30 flex items-center justify-between gap-1 pointer-events-auto">
          {/* Close Button & Listing Type Tag on one side */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm backdrop-blur-md border border-white/20 shadow-lg transition-transform active:scale-95 cursor-pointer shrink-0"
              aria-label="بستن پنجره"
            >
              <span>بستن</span>
              <X className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
            </button>

            <span
              className={`text-xs font-black px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl backdrop-blur-md shadow-md border shrink-0 ${
                isSale
                  ? 'bg-blue-600/90 text-white border-blue-400/40'
                  : 'bg-emerald-600/90 text-white border-emerald-400/40'
              }`}
            >
              {isSale ? 'فروشی' : 'خرید'}
            </span>
          </div>

          {/* Quick Actions (ویرایش / عکس) on the other side */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {justSaved && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-xl bg-emerald-600/90 text-white flex items-center gap-1 shadow-md shrink-0">
                <Check className="w-3 h-3" />
                <span>ذخیره شد</span>
              </span>
            )}

            {!isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white rounded-xl sm:rounded-2xl text-xs font-bold backdrop-blur-md border border-white/20 shadow-md cursor-pointer transition-colors shrink-0"
                title="ویرایش مشخصات آگهی"
              >
                <Pencil className="w-3.5 h-3.5 text-blue-300" />
                <span>ویرایش</span>
              </button>
            )}

            {!listing.isTextOnly && !isEditing && (
              <button
                type="button"
                onClick={() => setShowOverlay(!showOverlay)}
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-xl sm:rounded-2xl text-xs font-bold backdrop-blur-md border border-white/20 shadow-md cursor-pointer transition-colors shrink-0"
                title={showOverlay ? 'مخفی کردن نوشته‌ها برای دیدن کامل عکس خودرو' : 'نمایش مجدد مشخصات روی عکس'}
              >
                {showOverlay ? <EyeOff className="w-3.5 h-3.5 text-amber-300 shrink-0" /> : <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                <span className="hidden sm:inline">{showOverlay ? 'دیدن کامل عکس' : 'نمایش کادر'}</span>
                <span className="sm:hidden">{showOverlay ? 'عکس' : 'کادر'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        {listing.isTextOnly ? (
          /* ==============================================================
             1. TEXT-ONLY LISTING VIEW: Complete verbatim text cleanly shown
             ============================================================== */
          <div className="w-full h-full flex flex-col bg-neutral-900 text-white px-4 pb-4 pt-16 sm:px-6 sm:pb-6 sm:pt-16 overflow-y-auto justify-between">
            {isEditing ? (
              renderEditForm()
            ) : (
              <>
                {/* Header info */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 stroke-[2]" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base sm:text-lg font-black text-white leading-tight truncate">
                          {listing.model}
                        </h2>
                        <span className="text-xs font-bold text-slate-400">
                          {listing.year > 0
                            ? `مدل ${toPersianDigits(listing.year)} • ${listing.city}`
                            : listing.city}
                        </span>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="text-sm sm:text-base font-black text-emerald-400 bg-neutral-800 px-3 py-1 rounded-xl border border-emerald-500/30 inline-block">
                        {listing.priceFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Title & Badge */}
                  <div className="flex items-center justify-between py-1 border-b border-white/10 mb-3">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      متن کامل آگهی و فایل:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyText}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedText ? 'کپی شد' : 'کپی کل متن'}</span>
                    </button>
                  </div>
                </div>

                {/* Complete Verbatim Text Box - Scrollable if long, fully readable */}
                <div className="flex-1 min-h-0 bg-neutral-950/80 rounded-2xl p-4 border border-white/15 overflow-y-auto my-2 select-text">
                  <p className="text-sm sm:text-base font-medium text-slate-100 leading-loose text-right dir-rtl whitespace-pre-wrap">
                    {fullText || 'متنی برای این آگهی یافت نشد.'}
                  </p>
                </div>

                {/* Quick Specs & Actions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-xs text-slate-300 font-semibold flex-wrap">
                    <span className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Palette className="w-3.5 h-3.5 text-slate-300" />
                      {listing.color}
                    </span>
                    <span className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-slate-300" />
                      {listing.mileageFormatted}
                    </span>
                    <span className="bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Settings className="w-3.5 h-3.5 text-slate-300" />
                      {listing.gearbox}
                    </span>
                  </div>

                  {/* Call Action */}
                  {isUnlockedColleague ? (
                    effectivePhone && effectivePhone !== 'ثبت نشده' && !effectivePhone.includes('0000000') ? (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${effectivePhone}`}
                          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                          <span>تماس مستقیم ({effectivePhone})</span>
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyPhone}
                          className="p-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl border border-white/20 transition-colors cursor-pointer"
                          title="کپی شماره تماس"
                        >
                          {copiedPhone ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-neutral-800/80 rounded-xl border border-white/10 text-center text-xs text-slate-300 font-bold">
                        <span>شماره تماس مستقیمی در فایل برای این آگهی ثبت نشده است.</span>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={onRequestUnlock}
                      className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm sm:text-base rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Lock className="w-5 h-5 text-slate-900" />
                      <span>شماره تماس: مخصوص همکاران (کلیک جهت ورود با رمز)</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* ==============================================================
             2. IMAGE LISTING VIEW: Ultra-translucent glass overlay & pure photo
             ============================================================== */
          <div
            className="relative w-full h-full flex items-center justify-center bg-neutral-950 cursor-pointer overflow-hidden"
            onClick={() => {
              if (!isEditing) setShowOverlay(!showOverlay);
            }}
            title="برای دیدن عکس کامل بدون نوشته، روی عکس بزنید"
          >
            {/* The Crisp Car Photo - Never zoomed or cropped, always authentic aspect ratio */}
            <img
              src={getListingImage(listing, true)}
              alt={listing.title}
              className="w-full h-full object-contain select-none transition-all duration-200"
              loading="eager"
            />

            {/* Ultra-Translucent Glass Card (کاملاً شیشه‌ای که ماشین پشت آن پیداست) */}
            {showOverlay && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 z-20 max-h-[80vh] overflow-y-auto backdrop-blur-md bg-black/20 hover:bg-black/30 transition-colors border border-white/25 rounded-2xl sm:rounded-3xl p-3 sm:p-4 text-white shadow-2xl space-y-2 animate-in fade-in duration-150"
              >
                {isEditing ? (
                  renderEditForm()
                ) : (
                  <>
                    {/* Row 1: Car Name, Year, and Price */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-base sm:text-lg font-black text-white leading-tight [text-shadow:_0_1px_3px_rgba(0,0,0,0.9)]">
                          {listing.model}
                          <span className="text-xs font-bold text-slate-100 mr-2 [text-shadow:_0_1px_3px_rgba(0,0,0,0.9)]">
                            {listing.year > 0
                              ? `مدل ${toPersianDigits(listing.year)} • ${listing.city}`
                              : listing.city}
                          </span>
                        </h2>
                      </div>

                      <div className="text-left shrink-0">
                        <span className="text-sm sm:text-base font-black text-emerald-300 bg-black/45 px-2.5 py-0.5 rounded-lg border border-emerald-400/40 shadow-xs">
                          {listing.priceFormatted}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Full Complete Description on Glass (بدون خلاصه‌سازی، متن کامل) */}
                    <div className="bg-black/30 backdrop-blur-sm rounded-xl p-2.5 border border-white/15 text-xs sm:text-sm text-slate-100 font-medium leading-relaxed max-h-36 overflow-y-auto">
                      <div className="flex items-start justify-between gap-1.5 mb-1 border-b border-white/10 pb-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-200">
                          <FileText className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                          <span>متن کامل آگهی و فایل:</span>
                        </div>
                        {fullText && (
                          <button
                            type="button"
                            onClick={handleCopyText}
                            className="text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedText ? 'کپی شد' : 'کپی'}</span>
                          </button>
                        )}
                      </div>
                      <p className="text-right dir-rtl leading-relaxed whitespace-pre-wrap select-text [text-shadow:_0_1px_2px_rgba(0,0,0,0.9)]">
                        {fullText || 'توضیحات تکمیلی ثبت نشده است.'}
                      </p>
                    </div>

                    {/* Row 3: Quick Specs Chips on Glass */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-100 font-semibold flex-wrap">
                      <span className="bg-black/45 border border-white/20 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                        <Palette className="w-3 h-3 text-slate-200" />
                        {listing.color}
                      </span>
                      <span className="bg-black/45 border border-white/20 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                        <Gauge className="w-3 h-3 text-slate-200" />
                        {listing.mileageFormatted}
                      </span>
                      <span className="bg-black/45 border border-white/20 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                        <Settings className="w-3 h-3 text-slate-200" />
                        {listing.gearbox}
                      </span>
                    </div>

                    {/* Row 4: Call Action or Colleague Unlock */}
                    <div className="pt-0.5">
                      {isUnlockedColleague ? (
                        effectivePhone && effectivePhone !== 'ثبت نشده' && !effectivePhone.includes('0000000') ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`tel:${effectivePhone}`}
                              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                            >
                              <Phone className="w-4 h-4" />
                              <span>تماس مستقیم ({effectivePhone})</span>
                            </a>

                            <button
                              type="button"
                              onClick={handleCopyPhone}
                              className="p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-xl border border-white/20 transition-colors cursor-pointer"
                              title="کپی شماره"
                            >
                              {copiedPhone ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        ) : (
                          <div className="py-2 px-3 bg-black/50 rounded-xl border border-white/15 text-center text-xs text-slate-200 font-bold">
                            <span>شماره تماس مستقیمی در فایل ثبت نشده است.</span>
                          </div>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={onRequestUnlock}
                          className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Lock className="w-4 h-4 text-slate-900" />
                          <span>شماره تماس: مخصوص همکاران (کلیک جهت ورود)</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
