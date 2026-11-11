import React, { useState, useEffect, useRef } from 'react';
import { CarListing, CarListingType } from '../types/car';
import { buildSearchIndex } from '../utils/persianSearch';
import { parseCarYear, formatIranianPhone, detectBrand } from '../utils/sellerDataParser';
import { parseVoiceAdRegistration } from '../utils/voiceAssistant';
import { toPersianDigits, formatTomanPrice } from '../utils/dataPruner';
import {
  X,
  Mic,
  MicOff,
  PlusCircle,
  Car,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  FileText,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { requestMicrophoneAccess } from '../utils/microphoneHelper';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';

interface NewListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddListing: (listing: CarListing) => Promise<void> | void;
  defaultType?: CarListingType;
}

export const NewListingModal: React.FC<NewListingModalProps> = ({
  isOpen,
  onClose,
  onAddListing,
  defaultType = 'sale',
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'manual'>('voice');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [voiceError, setVoiceError] = useState('');

  // Form Fields
  const [type, setType] = useState<CarListingType>(defaultType);
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [price, setPrice] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [color, setColor] = useState('سفید');
  const [mileage, setMileage] = useState('');
  const [bodyCondition, setBodyCondition] = useState('بدون رنگ');
  const [description, setDescription] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [isSavingListing, setIsSavingListing] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  // Sync default type when opened
  useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setFeedbackSuccess(false);
      setSubmitError('');
      setVoiceError('');
      setVoiceTranscript('');
    }
  }, [isOpen, defaultType]);

  const [showMicModal, setShowMicModal] = useState(false);

  const applyVoiceAdText = (transcript: string) => {
    setVoiceTranscript(transcript);

    // Parse extracted values on the fly
    const parsed = parseVoiceAdRegistration(transcript, type);
    if (parsed.carName && parsed.carName !== 'خودرو اعلامی') {
      setModel(parsed.carName);
    }
    if (parsed.year) {
      setYear(parsed.year.toString());
    }
    if (parsed.price > 0) {
      setPrice(parsed.price.toString());
    }
    if (parsed.phoneNumber) {
      setPhoneNumber(parsed.phoneNumber);
    }
    if (parsed.color) {
      setColor(parsed.color);
    }
    if (parsed.bodyCondition) {
      setBodyCondition(parsed.bodyCondition);
    }
    if (parsed.mileage > 0) {
      setMileage(parsed.mileage.toString());
    }
    if (parsed.type) {
      setType(parsed.type);
    }
    setDescription(transcript);
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setVoiceError('مرورگر شما از ورودی صوتی پشتیبانی نمی‌کند. لطفاً از فرم دستی استفاده کنید.');
      setShowMicModal(true);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'fa-IR';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setVoiceError('');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        applyVoiceAdText(transcript);
      };

      recognition.onerror = (e: any) => {
        setIsRecording(false);
        if (e.error === 'not-allowed') {
          setVoiceError('دسترسی به میکروفون مسدود است.');
          setShowMicModal(true);
        } else if (e.error !== 'no-speech') {
          setVoiceError('خطا در دریافت صدا. لطفاً مجدداً امتحان کنید.');
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsRecording(false);
      setVoiceError('امکان راه‌اندازی میکروفون وجود ندارد.');
      setShowMicModal(true);
    }
  };

  const handleStartVoice = async () => {
    setVoiceError('');

    // First request permission through browser native prompt
    const micRes = await requestMicrophoneAccess();
    if (micRes.status === 'granted') {
      startListening();
    } else {
      setVoiceError(micRes.message || 'دسترسی به میکروفون داده نشد.');
      setShowMicModal(true);
    }
  };

  const handleStopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim()) return;

    const parsedYear = parseCarYear(year);
    const numPrice = parseInt(price.replace(/[^\d]/g, ''), 10) || 0;
    const numMileage = parseInt(mileage.replace(/[^\d]/g, ''), 10) || 0;
    const cleanPhone = formatIranianPhone(phoneNumber);
    const brand = detectBrand(model);

    // Create SVG placeholder for new ad
    const svgColor = type === 'sale' ? '#2563eb' : '#059669';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480" fill="none">
      <rect width="800" height="480" fill="#090d16"/>
      <path d="M160 330 C220 230 320 200 400 200 C480 200 580 230 640 330 Z" fill="${svgColor}" fill-opacity="0.25" stroke="${svgColor}" stroke-width="6"/>
      <circle cx="260" cy="350" r="50" fill="#1e293b" stroke="#94a3b8" stroke-width="8"/>
      <circle cx="540" cy="350" r="50" fill="#1e293b" stroke="#94a3b8" stroke-width="8"/>
      <text x="400" y="160" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="bold" font-family="sans-serif">${model}</text>
      ${parsedYear > 0 ? `<text x="400" y="440" text-anchor="middle" fill="#94a3b8" font-size="22" font-family="sans-serif">مدل ${toPersianDigits(parsedYear)}</text>` : ''}
    </svg>`;
    const placeholderBase64 =
      typeof btoa === 'function'
        ? 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
        : '';

    const baseTitle = `${type === 'sale' ? '' : 'خریدار '}${model}`;
    const fullTitle = parsedYear > 0 ? `${baseTitle} - مدل ${toPersianDigits(parsedYear)}` : baseTitle;
    const defaultDesc =
      parsedYear > 0
        ? `${model} مدل ${toPersianDigits(parsedYear)} به رنگ ${color}`
        : `${model} به رنگ ${color}`;

    const newListing: CarListing = {
      id: `manual-${Date.now()}`,
      type,
      title: fullTitle,
      brand,
      model,
      year: parsedYear,
      hasExplicitYear: parsedYear > 0,
      price: numPrice,
      priceFormatted: numPrice > 0 ? formatTomanPrice(numPrice) : 'توافقی',
      mileage: numMileage,
      mileageFormatted: numMileage > 0 ? `${toPersianDigits(numMileage.toLocaleString('en-US'))} کیلومتر` : 'کارشناسی نشده',
      color: color || 'سفید',
      gearbox: 'اتوماتیک',
      bodyCondition: bodyCondition || 'سالم و بدون رنگ',
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: cleanPhone,
      description: description || defaultDesc,
      fileDescription: description || defaultDesc,
      isTextOnly: false,
      source: 'user',
      importBatchName: 'ثبت‌های دستی همکاران و مدیر',
      importDate: new Date().toLocaleDateString('fa-IR'),
      createdAt: new Date().toISOString(),
      imageThumbnailBase64: placeholderBase64,
      imageFullBase64: placeholderBase64,
    };

    newListing._searchIndex = buildSearchIndex(newListing);
    setIsSavingListing(true);
    setSubmitError('');
    try {
      await onAddListing(newListing);
      setFeedbackSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch {
      setSubmitError('ثبت آگهی انجام نشد. اتصال اینترنت و ورود به حساب را بررسی کنید.');
    } finally {
      setIsSavingListing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] bg-white dark:bg-[#131924] rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-[#1a2332]">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                ثبت آگهی جدید
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                ورود اطلاعات آسان به صورت صوتی یا دستی
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Voice vs Manual */}
        <div className="grid grid-cols-2 p-2 bg-slate-100 dark:bg-[#0e141f] gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-[#1a2332] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>ثبت با صدا (هوشمند و سریع)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-[#1a2332] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>ثبت دستی (فرم ساده)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Success Notification */}
          {feedbackSuccess && (
            <div className="bg-emerald-500 text-white p-3 rounded-2xl flex items-center justify-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5" />
              <span>آگهی با موفقیت ثبت شد و در لیست قرار گرفت!</span>
            </div>
          )}

          {submitError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 p-3 rounded-xl text-xs font-bold text-center">
              {submitError}
            </div>
          )}

          {/* Voice Tab Active Content */}
          {activeTab === 'voice' && (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center space-y-3">
                <span className="text-xs font-bold text-blue-800 block">
                  دکمه زیر را بزنید و مشخصات خودرو را بگویید:
                </span>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={isRecording ? handleStopVoice : handleStartVoice}
                    className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95 ${
                      isRecording
                        ? 'bg-red-500 text-white ring-8 ring-red-200 animate-pulse'
                        : 'bg-blue-600 hover:bg-blue-700 text-white ring-4 ring-blue-100'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-9 h-9" /> : <Mic className="w-9 h-9" />}
                  </button>
                </div>

                <p className="text-xs font-black text-slate-700">
                  {isRecording ? 'در حال شنیدن صدای شما... (پس از اتمام دوباره بزنید)' : 'برای شروع صحبت روی میکروفون بزنید'}
                </p>

                <div className="text-[11px] text-slate-500 bg-white/80 p-2.5 rounded-xl border border-blue-100 text-right leading-relaxed">
                  <span className="font-bold text-blue-700">مثال گفتاری: </span>
                  «یه پژو ۲۰۷ مدل ۴۰۲ سفید بیرنگ ۴۰ تا کار دارم قیمت ۸۵۰ میلیون شماره ۰۹۱۲۳۴۵۶۷۸۹»
                </div>

                {voiceTranscript && (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-right text-xs font-medium text-slate-800 leading-relaxed">
                    <span className="text-slate-400 block mb-1">متن شنیده شده:</span>
                    «{voiceTranscript}»
                  </div>
                )}

                {voiceError && (
                  <div className="text-xs font-bold text-red-600 bg-red-50 p-2 rounded-xl flex items-center gap-1.5 justify-center">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{voiceError}</span>
                  </div>
                )}
              </div>

              <div className="text-xs font-bold text-slate-500 text-right">
                مقادیر استخراج شده از گفتار (در صورت نیاز می‌توانید ویرایش کنید):
              </div>
            </div>
          )}

          {/* Listing Form Fields */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Category Toggle: Sale vs Buy */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('sale')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black border transition-all cursor-pointer ${
                  type === 'sale'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-[#1a2332] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#232d3d]'
                }`}
              >
                <Car className="w-4 h-4" />
                <span>فروش خودرو</span>
              </button>

              <button
                type="button"
                onClick={() => setType('buy_request')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black border transition-all cursor-pointer ${
                  type === 'buy_request'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white dark:bg-[#1a2332] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#232d3d]'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>درخواست خرید خودرو</span>
              </button>
            </div>

            {/* Car Name & Model */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                نام خودرو و مدل *
              </label>
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="مثلاً: پژو ۲۰۷ دنده‌ای، دنا پلاس، هایما"
                className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            {/* Year & Price Row */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  سال ساخت (اختیاری)
                </label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="مثلاً: ۱۴۰۲ یا ۱۴۰۳"
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  قیمت (تومان)
                </label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="مثلاً: ۶۵۰,۰۰۰,۰۰۰"
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center"
                />
              </div>
            </div>

            {/* Phone & Color */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  شماره تماس
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0912..."
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رنگ
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="سفید، مشکی، خاکستری..."
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center"
                />
              </div>
            </div>

            {/* Body Condition & Mileage */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  وضعیت بدنه
                </label>
                <input
                  type="text"
                  value={bodyCondition}
                  onChange={(e) => setBodyCondition(e.target.value)}
                  placeholder="بدون رنگ، یک لکه رنگ..."
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  کارکرد (کیلومتر)
                </label>
                <input
                  type="text"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="مثلاً: ۵۰,۰۰۰"
                  className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden text-center"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                توضیحات تکمیلی
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیحات دلخواه در مورد مشخصات فنی، آپشن‌ها، بیمه یا شرایط..."
                className="w-full bg-slate-50 dark:bg-[#1a2332] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#1f2a3c] focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!model.trim() || isSavingListing}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-2xl font-black text-sm sm:text-base shadow-md transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>{isSavingListing ? 'در حال ذخیره…' : 'ثبت و ذخیره آگهی'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Microphone Permission Modal */}
      <MicrophonePermissionModal
        isOpen={showMicModal}
        onClose={() => setShowMicModal(false)}
        onPermissionGranted={() => {
          setShowMicModal(false);
          startListening();
        }}
        onSelectSampleVoice={(sampleVoice) => {
          applyVoiceAdText(sampleVoice);
        }}
      />
    </div>
  );
};
