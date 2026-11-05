import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, SlidersHorizontal, Mic, MicOff, Sparkles } from 'lucide-react';
import { CarListingType, FilterOptions } from '../types/car';
import { parseVoiceSearchQuery } from '../utils/voiceAssistant';
import { requestMicrophoneAccess } from '../utils/microphoneHelper';
import { MicrophonePermissionModal } from './MicrophonePermissionModal';
import { toPersianDigits } from '../utils/dataPruner';

interface SearchBarAndFiltersProps {
  filters: FilterOptions;
  onFilterChange: (newFilters: FilterOptions) => void;
  totalMatches: number;
  saleMatchesCount?: number;
  buyMatchesCount?: number;
  hasActiveFilter?: boolean;
  onTypeChange?: (type: CarListingType) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const PRICE_RANGES = [
  { id: 'all', label: 'همه قیمت‌ها' },
  { id: 'under300', label: 'زیر ۳۰۰ میلیون' },
  { id: '300to600', label: '۳۰۰ تا ۶۰۰ م' },
  { id: '600to1000', label: '۶۰۰ م تا ۱ میلیارد' },
  { id: 'above1000', label: 'بالای ۱ میلیارد' },
];

export const SearchBarAndFilters: React.FC<SearchBarAndFiltersProps> = ({
  filters,
  onFilterChange,
  saleMatchesCount = 0,
  buyMatchesCount = 0,
  hasActiveFilter = false,
  onTypeChange,
  inputRef,
}) => {
  // Local input state for smooth typing without lag
  const [inputValue, setInputValue] = useState(filters.searchQuery);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Voice Search State
  const [isListening, setIsListening] = useState(false);
  const [voiceSummary, setVoiceSummary] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const recognitionRef = useRef<any>(null);

  // Keep local input in sync if filters.searchQuery changes externally (e.g. reset)
  useEffect(() => {
    setInputValue(filters.searchQuery);
  }, [filters.searchQuery]);

  // 300ms Debounce to prevent CPU stutter on low-end phones
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== filters.searchQuery) {
        onFilterChange({ ...filters, searchQuery: inputValue });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, filters, onFilterChange]);

  const handleClearSearch = () => {
    setInputValue('');
    setVoiceSummary('');
    onFilterChange({ ...filters, searchQuery: '', brand: '' });
  };

  const handlePriceSelect = (priceId: FilterOptions['priceRange']) => {
    onFilterChange({ ...filters, priceRange: priceId });
  };

  // Microphone Permission Modal State
  const [showMicModal, setShowMicModal] = useState(false);

  const applyVoiceSearch = (transcript: string) => {
    const parsed = parseVoiceSearchQuery(transcript);
    const finalQuery = parsed.normalizedQuery;
    setInputValue(finalQuery);
    setVoiceSummary(parsed.summaryMessage);
    onFilterChange({ ...filters, searchQuery: finalQuery });
    setVoiceNotice(`متوجه شدم: ${parsed.summaryMessage}`);
    setTimeout(() => setVoiceNotice(''), 5000);
  };

  const startRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceNotice('مرورگر شما از جستجوی صوتی پشتیبانی نمی‌کند (در کروم و اندروید پشتیبانی می‌شود).');
      setShowMicModal(true);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'fa-IR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice('در حال گوش دادن به صدای شما... (مثلاً بگویید: ۲۰۶ تیپ ۲ مدل ۴۰۰)');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        applyVoiceSearch(transcript);
        setIsListening(false);
      };

      recognition.onerror = (e: any) => {
        setIsListening(false);
        if (e.error === 'not-allowed') {
          setVoiceNotice('دسترسی به میکروفون مسدود است.');
          setShowMicModal(true);
        } else if (e.error !== 'no-speech') {
          setVoiceNotice('خطا در دریافت صدا، لطفاً مجدداً امتحان کنید.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setVoiceNotice('امکان فعال‌سازی میکروفون وجود ندارد.');
      setShowMicModal(true);
    }
  };

  // Voice Search Handler (Browser-Native Web Speech API - Google STT)
  const handleToggleVoiceSearch = async () => {
    setVoiceNotice('');

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    // Explicitly prompt browser's native permission modal first
    const micRes = await requestMicrophoneAccess();
    if (micRes.status === 'granted') {
      startRecognition();
    } else {
      setVoiceNotice(micRes.message || 'دسترسی به میکروفون داده نشد.');
      setShowMicModal(true);
    }
  };

  return (
    <div className="pt-0.5 pb-1.5 space-y-1.5">
      {/* Compact Sticky Search Input with Integrated Match Counts & Voice Search */}
      <div className="relative">
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
          <Search className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onFilterChange({ ...filters, searchQuery: inputValue });
            }
          }}
          placeholder="جستجوی خودرو، مدل یا سال..."
          className={`w-full bg-white dark:bg-[#131924] text-slate-900 dark:text-white pr-9 ${
            hasActiveFilter ? 'pl-44 sm:pl-52' : 'pl-24 sm:pl-32'
          } py-2 sm:py-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 focus:border-blue-600 dark:focus:border-blue-500 focus:outline-hidden text-xs sm:text-sm font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-2xs transition-all`}
        />

        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {/* Artistic Micro Match Counter inside Search Bar when searching */}
          {hasActiveFilter && (
            <div className="flex items-center bg-slate-100/90 dark:bg-[#0c1017] border border-slate-200/90 dark:border-slate-800 rounded-lg p-0.5 text-[10px] font-black leading-none select-none">
              <button
                type="button"
                onClick={() => onTypeChange?.('sale')}
                className={`px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filters.type === 'sale'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400'
                }`}
                title="تعداد تطابق در خودروهای فروشی"
              >
                فروش {toPersianDigits(saleMatchesCount)}
              </button>
              <button
                type="button"
                onClick={() => onTypeChange?.('buy_request')}
                className={`px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filters.type === 'buy_request'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : buyMatchesCount > 0
                    ? 'text-emerald-700 dark:text-emerald-400 font-black hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400'
                }`}
                title="تعداد تطابق در درخواست‌های خرید"
              >
                خرید {toPersianDigits(buyMatchesCount)}
              </button>
            </div>
          )}

          {/* Clear Search Button */}
          {(inputValue || hasActiveFilter) && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="p-1 text-slate-400 hover:text-rose-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              aria-label="پاک کردن متن جستجو"
              title="پاک کردن جستجو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Voice Search Microphone Button */}
          <button
            type="button"
            onClick={handleToggleVoiceSearch}
            className={`p-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-md ring-4 ring-red-200 dark:ring-red-900/50'
                : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/60'
            }`}
            title="جستجوی صوتی (بگویید تا جستجو کند)"
            aria-label="جستجوی صوتی"
          >
            {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[11px] font-black">
              {isListening ? 'شنیدن...' : 'صوتی'}
            </span>
          </button>

          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`p-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              showAdvancedFilters || filters.brand || filters.priceRange !== 'all' || filters.dayFilter !== 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
            }`}
            aria-label="فیلترهای پیشرفته"
            title="فیلتر قیمت و زمان"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">فیلتر</span>
          </button>
        </div>
      </div>

      {/* Voice Status Pill / Live Notification */}
      {voiceNotice && (
        <div
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in ${
            isListening
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
          }`}
        >
          {isListening ? (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          ) : (
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span className="leading-tight">{voiceNotice}</span>
        </div>
      )}

      {/* Expandable Advanced Filters (Price and Day) */}
      {showAdvancedFilters && (
        <div className="bg-white dark:bg-[#131924] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 animate-in fade-in duration-150">
          {/* Price Range */}
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5">محدوده قیمت:</span>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_RANGES.map((pr) => {
                const isSelected = filters.priceRange === pr.id;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => handlePriceSelect(pr.id as FilterOptions['priceRange'])}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
                    }`}
                  >
                    {pr.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day Filter */}
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1.5">بازه زمانی آگهی:</span>
            <div className="flex gap-2">
              {[
                { id: 'all', label: 'کل ۴ روز گذشته' },
                { id: 'today', label: 'فقط امروز' },
                { id: 'yesterday', label: 'دیروز' },
                { id: 'older', label: '۲ و ۳ روز قبل' },
              ].map((d) => {
                const isSelected = filters.dayFilter === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onFilterChange({ ...filters, dayFilter: d.id as FilterOptions['dayFilter'] })}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent dark:border-slate-700/60'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* Microphone Permission Guidance Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <MicrophonePermissionModal
            isOpen={showMicModal}
            onClose={() => setShowMicModal(false)}
            onPermissionGranted={() => {
              setShowMicModal(false);
              startRecognition();
            }}
            onSelectSampleVoice={(sampleQuery) => {
              applyVoiceSearch(sampleQuery);
            }}
          />,
          document.body
        )}
    </div>
  );
};
