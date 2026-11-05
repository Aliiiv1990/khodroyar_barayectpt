/**
 * Helper to reliably handle microphone permission detection and requests.
 * In embedded iframe preview environments (such as AI Studio), browsers enforce
 * W3C Permissions Policy which blocks navigator.mediaDevices.getUserMedia and
 * webkitSpeechRecognition at document level unless the parent iframe has allow="microphone".
 */

export interface MicPermissionResult {
  status: 'granted' | 'denied' | 'iframe_blocked' | 'no_device' | 'unsupported';
  message?: string;
  isIframe?: boolean;
}

/**
 * Checks if the current document is embedded inside an iframe.
 */
export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch (e) {
    // If accessing window.top throws cross-origin error, it's definitely an iframe
    return true;
  }
}

/**
 * Checks if document features or permissions policy explicitly denies microphone
 */
export function isMicrophonePolicyRestricted(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const docAny = document as any;
    if (docAny.featurePolicy?.allowsFeature && !docAny.featurePolicy.allowsFeature('microphone')) {
      return true;
    }
    if (docAny.permissionsPolicy?.allowsFeature && !docAny.permissionsPolicy.allowsFeature('microphone')) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export async function requestMicrophoneAccess(): Promise<MicPermissionResult> {
  if (typeof window === 'undefined') {
    return { status: 'unsupported', message: 'محیط سرور است.' };
  }

  const inIframe = isRunningInIframe();
  const policyRestricted = isMicrophonePolicyRestricted();

  // If we already know the iframe permissions policy forbids microphone
  if (inIframe && policyRestricted) {
    return {
      status: 'iframe_blocked',
      isIframe: true,
      message:
        'مرورگر به دلیل قرار داشتن در کادر پیش‌نمایش (iFrame)، طبق قوانین امنیتی پنجره سوال میکروفون را مسدود می‌کند. برنامه را در تب مستقیم باز کنید.',
    };
  }

  // Check if mediaDevices API is available
  if (!navigator?.mediaDevices?.getUserMedia) {
    const legacyGetUserMedia =
      (navigator as any).webkitGetUserMedia ||
      (navigator as any).mozGetUserMedia ||
      (navigator as any).getUserMedia;

    if (!legacyGetUserMedia) {
      return {
        status: 'unsupported',
        isIframe: inIframe,
        message: 'مرورگر شما از دریافت صوت و ضبط صدا پشتیبانی نمی‌کند.',
      };
    }
  }

  try {
    // This explicit call triggers the browser's native popup: "Allow this site to use your microphone?"
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Permission granted! Immediately stop all tracks so SpeechRecognition can use it cleanly
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {
        // ignore
      }
    });

    return { status: 'granted', isIframe: inIframe };
  } catch (err: any) {
    const errorName = String(err?.name || '');
    const errorMsg = String(err?.message || '');

    // Check if error is due to iframe permissions policy violation
    if (
      inIframe ||
      errorMsg.includes('Permissions policy') ||
      errorMsg.includes('not allowed in this document') ||
      errorName === 'SecurityError'
    ) {
      return {
        status: 'iframe_blocked',
        isIframe: true,
        message:
          'مرورگر در کادر پیش‌نمایش (iFrame) اجازه نمایش پنجره درخواست میکروفون را نمی‌دهد. لطفاً با دکمه زیر برنامه را در تب اختصاصی باز کنید.',
      };
    }

    if (
      errorName === 'NotAllowedError' ||
      errorName === 'PermissionDeniedError' ||
      errorMsg.includes('Permission denied') ||
      errorMsg.includes('not allowed')
    ) {
      return {
        status: 'denied',
        isIframe: inIframe,
        message:
          'دسترسی به میکروفون داده نشد. لطفاً در نوار آدرس مرورگر روی آیکون قفل 🔒 یا میکروفون کلیک کرده و گزینه Allow را انتخاب کنید.',
      };
    }

    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return {
        status: 'no_device',
        isIframe: inIframe,
        message: 'هیچ میکروفونی در این دستگاه متصل نیست یا شناسایی نشد.',
      };
    }

    return {
      status: 'denied',
      isIframe: inIframe,
      message: 'خطا در برقراری ارتباط با میکروفون: ' + (err?.message || 'نامشخص'),
    };
  }
}
