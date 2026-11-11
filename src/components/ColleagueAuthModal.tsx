import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Crown,
  LogOut,
  Database,
  Delete,
  RotateCcw,
} from 'lucide-react';
import { toPersianDigits } from '../utils/dataPruner';
import { pocketbase } from '../lib/pocketbase';

function toEnglishDigits(input: string): string {
  return String(input || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export type UserAuthRole = 'guest' | 'colleague' | 'admin';

interface ColleagueAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: UserAuthRole;
  onSuccess: (role: 'colleague' | 'admin') => void;
  onLogout: () => void;
  onOpenDataManager?: () => void;
  promptMessage?: string;
}

export const ColleagueAuthModal: React.FC<ColleagueAuthModalProps> = ({
  isOpen,
  onClose,
  userRole,
  onSuccess,
  onLogout,
  onOpenDataManager,
  promptMessage,
}) => {
  const isPocketBaseEnabled = Boolean(import.meta.env.VITE_POCKETBASE_URL?.trim());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [showPinEntryWhileLogged, setShowPinEntryWhileLogged] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Reset PIN input state every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setEmail('');
      setPassword('');
      setAuthError('');
      setError(false);
      setShowPinEntryWhileLogged(false);
      setIsChecking(false);
    }
  }, [isOpen]);

  // Verify the PIN on the server. The browser never stores or contains shared PINs.
  const evaluatePin = useCallback(async (rawCandidate: string): Promise<boolean> => {
    if (isChecking) return false;
    setIsChecking(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: toEnglishDigits(rawCandidate).trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || (result?.role !== 'admin' && result?.role !== 'colleague')) {
        return false;
      }
      setError(false);
      setPin('');
      onSuccess(result.role);
      onClose();
      return true;
    } catch {
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, onClose, onSuccess]);

  const handlePocketBaseLogin = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isChecking || !email.trim() || !password) return;
    setIsChecking(true);
    setAuthError('');
    try {
      const auth = await pocketbase.collection('users').authWithPassword(email.trim(), password);
      const role = auth.record.role;
      if (role !== 'admin' && role !== 'colleague') {
        pocketbase.authStore.clear();
        throw new Error('حساب کاربری نقش معتبر ندارد.');
      }
      setPassword('');
      onSuccess(role);
      onClose();
    } catch {
      setAuthError('ایمیل یا گذرواژه معتبر نیست، یا حساب کاربری غیرفعال است.');
    } finally {
      setIsChecking(false);
    }
  }, [email, password, isChecking, onClose, onSuccess]);
  const handleDigitInput = useCallback(
    (rawDigit: string) => {
      const digit = toEnglishDigits(rawDigit);
      if (isChecking || !/^\d$/.test(digit)) return;

      setPin((prev) => {
        if (prev.length >= 4) return prev;
        const nextPin = prev + digit;
        if (nextPin.length === 4) {
          setTimeout(() => {
            void evaluatePin(nextPin).then((accepted) => {
              if (!accepted) {
                setError(true);
                setPin('');
              }
            });
          }, 80);
        } else {
          setError(false);
        }
        return nextPin;
      });
    },
    [evaluatePin, isChecking]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  }, []);

  const handleClearPin = useCallback(() => {
    setPin('');
    setError(false);
  }, []);

  // Support physical keyboard input when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const isShowingKeypad = userRole === 'guest' || showPinEntryWhileLogged;
    if (!isShowingKeypad) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      const normalized = toEnglishDigits(e.key);
      if (/^\d$/.test(normalized)) {
        e.preventDefault();
        handleDigitInput(normalized);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, userRole, showPinEntryWhileLogged, handleBackspace, handleDigitInput, onClose]);

  if (!isOpen) return null;

  const isLoggedIn = userRole === 'admin' || userRole === 'colleague';
  const showKeypad = !isLoggedIn || showPinEntryWhileLogged;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#131924] rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100 transition-colors"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                userRole === 'admin'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                  : userRole === 'colleague'
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
              }`}
            >
              {userRole === 'admin' ? (
                <Crown className="w-5 h-5" />
              ) : userRole === 'colleague' ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base">
                {isLoggedIn && !showPinEntryWhileLogged ? 'وضعیت حساب کاربری' : isPocketBaseEnabled ? 'ورود با حساب کاربری' : 'ورود با رمز دسترسی'}
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
                {isLoggedIn && !showPinEntryWhileLogged
                  ? 'مدیریت سطح دسترسی در سامانه'
                  : 'ویژه همکاران و مدیریت نمایشگاه'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Logged-in Account Status View */}
        {isLoggedIn && !showPinEntryWhileLogged ? (
          <div className="mt-4 space-y-3">
            <div
              className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                userRole === 'admin'
                  ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-950 dark:text-amber-200'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-200'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  userRole === 'admin'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {userRole === 'admin' ? (
                  <Crown className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold opacity-75">سطح دسترسی فعلی شما:</div>
                <div className="text-sm font-black">
                  {userRole === 'admin' ? 'مدیر نمایشگاه' : 'همکار نمایشگاه'}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {userRole === 'admin'
                    ? 'مشاهده شماره‌های تماس و مدیریت فایل‌ها فعال است.'
                    : 'مشاهده شماره‌های تماس مالکان فعال است.'}
                </div>
              </div>
            </div>

            {userRole === 'admin' && onOpenDataManager && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDataManager();
                }}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>ورود به پنل مدیریت داده‌ها و فایل‌ها</span>
              </button>
            )}

            {userRole === 'colleague' && (
              <button
                type="button"
                onClick={() => {
                  setPin('');
                  setError(false);
                  setShowPinEntryWhileLogged(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>{isPocketBaseEnabled ? 'ورود با حساب مدیر' : 'وارد کردن رمز مدیر'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 active:bg-red-200 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج از حساب (قفل کردن دسترسی)</span>
            </button>
          </div>
        ) : null}

        {/* PocketBase native account login. Keep the existing modal layout. */}
        {showKeypad && isPocketBaseEnabled && (
          <form onSubmit={handlePocketBaseLogin} className="mt-4 space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 text-center leading-relaxed font-medium">
              با حساب کاربری اختصاصی خود وارد شوید.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">ایمیل حساب</span>
              <input type="email" dir="ltr" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0c1017] px-3 py-3 text-sm outline-none focus:border-blue-500" placeholder="name@example.com" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">گذرواژه</span>
              <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0c1017] px-3 py-3 text-sm outline-none focus:border-blue-500" placeholder="گذرواژه حساب" required />
            </label>
            {authError && <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-center text-xs font-bold text-red-700 dark:text-red-300">{authError}</div>}
            <button type="submit" disabled={isChecking || !email.trim() || !password} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-3 text-sm font-black text-white transition-colors">
              {isChecking ? 'در حال بررسی حساب…' : 'ورود امن'}
            </button>
          </form>
        )}

        {/* Legacy PIN login remains available until PocketBase is configured. */}
        {showKeypad && !isPocketBaseEnabled && (
          <div className="mt-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3 text-center leading-relaxed font-medium">
              {promptMessage || 'لطفاً رمز ۴ رقمی خود را وارد نمایید:'}
            </p>

            {/* 4-Digit Masked PIN Boxes */}
            <div className="flex justify-center gap-3 my-3" dir="ltr">
              {[0, 1, 2, 3].map((idx) => {
                const char = pin[idx];
                return (
                  <div
                    key={idx}
                    className={`w-12 h-14 rounded-2xl flex items-center justify-center text-2xl font-black transition-all ${
                      error
                        ? 'border-2 border-red-500 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'
                        : char
                        ? 'border-2 border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-2xs'
                        : 'border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0c1017] text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {char ? '●' : ''}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-300 mb-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 py-2 px-3 rounded-xl">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>رمز ورود معتبر نیست یا سرور در دسترس نیست. دوباره تلاش کنید.</span>
              </div>
            )}

            {/* Clean Numeric Keypad (Zero Password Hints) */}
            <div className="grid grid-cols-3 gap-2 my-2" dir="ltr">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitInput(digit)}
                  className="py-3.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-blue-600 active:text-white rounded-xl font-black text-xl text-slate-800 dark:text-slate-100 transition-colors cursor-pointer select-none"
                >
                  {toPersianDigits(digit)}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClearPin}
                disabled={pin.length === 0 || isChecking}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 disabled:opacity-40 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer select-none"
                title="پاک کردن"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>پاکسازی</span>
              </button>

              <button
                type="button"
                onClick={() => handleDigitInput('0')}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-blue-600 active:text-white rounded-xl font-black text-xl text-slate-800 dark:text-slate-100 transition-colors cursor-pointer select-none"
              >
                {toPersianDigits('0')}
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                disabled={pin.length === 0}
                className="py-3.5 bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 disabled:opacity-40 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1 transition-colors cursor-pointer select-none"
                title="حذف رقم آخر"
              >
                <Delete className="w-4 h-4" />
                <span>حذف</span>
              </button>
            </div>

            {isLoggedIn && showPinEntryWhileLogged && (
              <button
                type="button"
                onClick={() => setShowPinEntryWhileLogged(false)}
                className="w-full mt-2 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                بازگشت
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
