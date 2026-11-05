import React, { useState } from 'react';
import {
  requestMicrophoneAccess,
  isRunningInIframe,
} from '../utils/microphoneHelper';
import {
  Mic,
  MicOff,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Play,
  Info,
} from 'lucide-react';

interface MicrophonePermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted: () => void;
  onSelectSampleVoice?: (sampleText: string) => void;
  customTitle?: string;
}

export const MicrophonePermissionModal: React.FC<MicrophonePermissionModalProps> = ({
  isOpen,
  onClose,
  onPermissionGranted,
  onSelectSampleVoice,
  customTitle,
}) => {
  const [isRequesting, setIsRequesting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'error' | 'success' | 'info'>('info');
  const [copied, setCopied] = useState(false);
  const [manualVoiceInput, setManualVoiceInput] = useState('');

  if (!isOpen) return null;

  const inIframe = isRunningInIframe();
  const currentAppUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleRequestNativePermission = async () => {
    setIsRequesting(true);
    setFeedback(null);
    try {
      const res = await requestMicrophoneAccess();
      if (res.status === 'granted') {
        setFeedbackType('success');
        setFeedback('دسترسی به میکروفون با موفقیت تایید شد!');
        setTimeout(() => {
          onPermissionGranted();
          onClose();
        }, 700);
      } else if (res.status === 'iframe_blocked') {
        setFeedbackType('info');
        setFeedback(
          'مرورگر به دلیل محدودیت امنیتی پیش‌نمایش (iFrame)، کادر تایید میکروفون را مسدود کرده است. لطفاً از دکمه «باز کردن در تب مستقیم» استفاده کنید.'
        );
      } else {
        setFeedbackType('error');
        setFeedback(res.message || 'دسترسی به میکروفون داده نشد.');
      }
    } catch (e: any) {
      setFeedbackType('error');
      setFeedback('خطایی در درخواست رخ داد: ' + (e?.message || ''));
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!currentAppUrl) return;
    try {
      await navigator.clipboard.writeText(currentAppUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      // ignore
    }
  };

  const handleApplyCustomSample = (text: string) => {
    if (!text.trim() || !onSelectSampleVoice) return;
    onSelectSampleVoice(text.trim());
    onClose();
  };

  const sampleVoiceQueries = [
    '۲۰۶ تیپ ۲ مدل ۱۴۰۰ سفید بدون رنگ',
    'دنا پلاس اتومات صفر مشکی',
    'پژو پارس سال تمیز موتور پلمپ',
    'کوییک دنده‌ای مدل ۱۴۰۲ کارکرد ۳۰ هزار',
    'تارا اتومات نقره‌ای قیمت توافقی',
    'خریدار سانتافه ۲۰۱۶ یا ۲۰۱۷ تمیز',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden text-right flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-amber-50 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                {customTitle || 'راهنمای فعال‌سازی میکروفون و جستجوی صوتی'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                دلیل عدم نمایش درخواست و روش‌های فعال‌سازی
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-white/80 transition-colors cursor-pointer"
            aria-label="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed overflow-y-auto">
          {/* Status Alert */}
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl font-bold flex items-start gap-2.5 ${
                feedbackType === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : feedbackType === 'info'
                  ? 'bg-blue-50 text-blue-900 border border-blue-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedbackType === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : feedbackType === 'info' ? (
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="text-xs sm:text-sm leading-normal">{feedback}</span>
            </div>
          )}

          {/* Explanation for why native browser prompt didn't show */}
          <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>چرا پیام دسترسی به میکروفون ظاهر نشد؟</span>
            </div>
            <p className="text-slate-700 text-xs sm:text-[13px] leading-relaxed">
              شما در حال حاضر برنامه را در <strong className="text-slate-900">کادر پیش‌نمایش (iFrame)</strong> استودیو هوش مصنوعی مشاهده می‌کنید. مرورگرها (مانند Google Chrome) به دلیل قانون امنیتی سخت‌گیرانه موسوم به <code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded text-[11px] font-mono">Permissions Policy</code>، اجازه باز شدن پیام دسترسی به میکروفون را در داخل قاب پیش‌نمایش به کلی مسدود می‌کنند.
            </p>
          </div>

          {/* Solution 1: Open in Dedicated Tab (Recommended) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>راه‌حل اصلی (باز کردن در تب مستقیم مرورگر)</span>
              </span>
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                توصیه شده
              </span>
            </div>
            <p className="text-slate-600 text-xs leading-normal">
              وقتی برنامه را در یک تب مستقل باز کنید، مرورگر بلافاصله سوال رسمی دسترسی به میکروفون را نشان می‌دهد و صدای شما بدون هیچ مانعی دریافت می‌شود:
            </p>

            <a
              href={currentAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-center text-xs sm:text-sm cursor-pointer no-underline"
            >
              <ExternalLink className="w-4 h-4" />
              <span>باز کردن برنامه در تب اختصاصی (دسترسی فوری میکروفون)</span>
            </a>

            {/* Copy Link Option */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">آدرس برنامه کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>کپی آدرس مستقیم برنامه برای باز کردن در مرورگر</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Solution 2: Interactive In-Modal Voice Tester / Instant Simulator */}
          {onSelectSampleVoice && (
            <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 space-y-3">
              <div className="flex items-center gap-1.5 text-blue-950 font-extrabold text-xs sm:text-sm">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>تست موتور جستجو و ثبت صوتی (همین حالا و بدون نیاز به تب جدید)</span>
              </div>
              <p className="text-slate-600 text-xs leading-normal">
                می‌توانید هر عبارتی که قصد داشتید به میکروفون بگویید را اینجا بنویسید یا از جملات آماده زیر انتخاب کنید تا هوش استخراج داده را آنی ببینید:
              </p>

              {/* Custom Input */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualVoiceInput}
                  onChange={(e) => setManualVoiceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyCustomSample(manualVoiceInput);
                  }}
                  placeholder="مثال: دنا پلاس مدل ۱۴۰۲ بدون رنگ..."
                  className="flex-1 bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleApplyCustomSample(manualVoiceInput)}
                  disabled={!manualVoiceInput.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer shrink-0"
                >
                  اعمال متن
                </button>
              </div>

              {/* Popular Sample Chips */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  جملات نمونه برای کلیک و تست سریع:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleVoiceQueries.map((query, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyCustomSample(query)}
                      className="px-2.5 py-1.5 bg-white hover:bg-blue-100 text-slate-800 hover:text-blue-900 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-blue-200/80 shadow-2xs"
                    >
                      <Play className="w-3 h-3 text-blue-600 shrink-0" />
                      <span>{query}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Standalone Permission Request Button (If not in iframe or testing) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleRequestNativePermission}
              disabled={isRequesting}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Mic className="w-4 h-4 text-slate-600" />
              <span>
                {isRequesting
                  ? 'در حال برقراری ارتباط...'
                  : 'تست مجدد دسترسی مرورگر (در صورتی که اجازه داده‌اید)'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {inIframe ? 'محیط فعلی: پیش‌نمایش در فریم' : 'محیط فعلی: صفحه مستقیم مرورگر'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white text-slate-700 hover:bg-slate-100 font-bold rounded-xl border border-slate-200 text-xs transition-colors cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
