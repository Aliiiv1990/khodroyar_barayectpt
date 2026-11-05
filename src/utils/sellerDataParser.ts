import { CarListing, CarListingType } from '../types/car';
import { normalizePersianText, buildSearchIndex } from './persianSearch';
import { toPersianDigits, formatTomanPrice } from './dataPruner';

// Raw seller item as provided in the user's dataset
export interface RawSellerItem {
  id?: string;
  rowIndex?: number;
  imageFileName?: string;
  status?: string;
  اسم_ماشین?: string;
  سال_ساخت?: string | number;
  رنگ?: string;
  اسم_فروشنده?: string;
  errorMessage?: string;
  // Fallbacks if English keys are used
  title?: string;
  carName?: string;
  year?: string | number;
  color?: string;
  sellerPhone?: string;
  price?: number;
  priceFormatted?: string;
  description?: string;
  createdAt?: string;
  imageThumbnailBase64?: string;
  imageFullBase64?: string;
}

export interface SellerJsonPayload {
  version?: number;
  sellers?: RawSellerItem[];
  [key: string]: any;
}

export interface ParsedFilenameInfo {
  phoneNumber: string;
  rawPhonePrefix: string;
  randomCode: string;
  caption: string;
  captionWithCode: string;
  isTextFile: boolean;
}

/**
 * Helper to normalize a single phone candidate string into an 11-digit Iranian phone number (09... or 021...).
 */
function normalizeSinglePhoneCandidate(raw: string): string {
  const normalized = normalizePersianText(raw).trim();
  if (!normalized) return 'ثبت نشده';

  const spaced = normalized.replace(/[_.\-\/\\|,;:]/g, ' ');

  // Match 1: 12-digit international format starting with 98, +98, 0098 (e.g. 989121769442 or 982188776655)
  const mIntl = spaced.match(/(?:(?:\+|00)?98)(\d{10})(?!\d)/);
  if (mIntl && mIntl[1]) {
    const formatted = '0' + mIntl[1];
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  }

  // Match 2: Standard 11-digit number starting with 0 (e.g. 09351234567 or 02188776655)
  const m11 = spaced.match(/(?<!\d)(0\d{10})(?!\d)/);
  if (m11 && m11[1]) {
    const formatted = m11[1];
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  }

  // Match 3: 10-digit number without leading 0 (e.g. 9121769442 or 9351234567)
  const m10 = spaced.match(/(?<!\d)(9\d{9})(?!\d)/);
  if (m10 && m10[1]) {
    const formatted = '0' + m10[1];
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  }

  // Match 4: Clean all non-digits and test if whole sequence is 10, 11, or 12 digits
  const cleanedDigits = normalized.replace(/[^\d]/g, '');
  if (cleanedDigits.startsWith('98') && cleanedDigits.length === 12) {
    const formatted = '0' + cleanedDigits.slice(2);
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  } else if (cleanedDigits.startsWith('0098') && cleanedDigits.length === 14) {
    const formatted = '0' + cleanedDigits.slice(4);
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  } else if (cleanedDigits.startsWith('0') && cleanedDigits.length === 11) {
    if (isValidIranian11DigitNumber(cleanedDigits)) {
      return cleanedDigits;
    }
  } else if (cleanedDigits.startsWith('9') && cleanedDigits.length === 10) {
    const formatted = '0' + cleanedDigits;
    if (isValidIranian11DigitNumber(formatted)) {
      return formatted;
    }
  }

  return 'ثبت نشده';
}

/**
 * Parses the standard listing filename format:
 *   "<phone>_<random4DigitCode>_<raw_caption>.jpg"
 *   "<phone>_<random4DigitCode>.jpg"
 *   "<phone>_<random4DigitCode>.txt"
 *
 * Extracts the phone number from the very beginning of the filename (before the first underscore),
 * separates it from the rest of the filename, extracts the 4-digit random code, and extracts
 * the raw caption after the underline with underscores replaced by spaces.
 */
export function parseListingFileName(fileName?: string | null): ParsedFilenameInfo {
  if (!fileName) {
    return {
      phoneNumber: 'ثبت نشده',
      rawPhonePrefix: '',
      randomCode: '',
      caption: '',
      captionWithCode: '',
      isTextFile: false,
    };
  }

  const trimmed = fileName.toString().trim();
  if (!trimmed || trimmed === 'ورودی دستی') {
    return {
      phoneNumber: 'ثبت نشده',
      rawPhonePrefix: '',
      randomCode: '',
      caption: '',
      captionWithCode: '',
      isTextFile: false,
    };
  }

  const baseName = trimmed.split('/').pop() || trimmed;
  const isTextFile = /\.txt$/i.test(baseName);
  const withoutExt = baseName.replace(/\.[a-zA-Z0-9]{2,5}$/i, '');

  const parts = withoutExt.split('_');
  const firstSegment = parts[0] ? parts[0].trim() : '';
  const normalizedFirst = normalizePersianText(firstSegment).replace(/\s+/g, '');

  // Check if the first segment before '_' is a phone number (e.g. 989122720114, 09122720114, 9122720114)
  let phoneFromStart = 'ثبت نشده';
  if (normalizedFirst && /^[\+\d]{8,15}$/.test(normalizedFirst)) {
    phoneFromStart = normalizeSinglePhoneCandidate(normalizedFirst);
    // Fallback if it's an 8-15 digit prefix at the start of the filename before '_'
    if (phoneFromStart === 'ثبت نشده') {
      const digitsOnly = normalizedFirst.replace(/[^\d]/g, '');
      if (digitsOnly.length >= 10 && digitsOnly.length <= 14 && !/0000000/.test(digitsOnly)) {
        phoneFromStart = digitsOnly.startsWith('98') && digitsOnly.length === 12
          ? '0' + digitsOnly.slice(2)
          : digitsOnly;
      }
    }
  }

  if (phoneFromStart !== 'ثبت نشده') {
    let randomCode = '';
    let captionSegments: string[] = [];

    if (parts.length >= 2) {
      const secondSegmentNorm = normalizePersianText(parts[1].trim());
      if (/^\d{1,8}$/.test(secondSegmentNorm)) {
        randomCode = secondSegmentNorm;
        captionSegments = parts.slice(2);
      } else {
        captionSegments = parts.slice(1);
      }
    }

    const caption = captionSegments
      .join(' ')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const captionWithCode = caption
      ? randomCode
        ? `${caption} (کد: ${randomCode})`
        : caption
      : randomCode
      ? `کد آگهی: ${randomCode}`
      : '';

    return {
      phoneNumber: phoneFromStart,
      rawPhonePrefix: firstSegment,
      randomCode,
      caption,
      captionWithCode,
      isTextFile,
    };
  }

  // Fallback if filename doesn't start with <phone>_
  const fallbackPhone = normalizeSinglePhoneCandidate(withoutExt);
  const rest = withoutExt
    .replace(/^(?:\+?98|0098|0)?9\d{9}_?/g, '')
    .replace(/^\d{10,14}_?/g, '');
  let randomCode = '';
  const subParts = rest.split('_').filter(Boolean);
  if (subParts.length >= 1 && /^\d{1,8}$/.test(normalizePersianText(subParts[0]))) {
    randomCode = normalizePersianText(subParts[0]);
    subParts.shift();
  }
  const caption = subParts.join(' ').replace(/\s+/g, ' ').trim();
  const captionWithCode = caption
    ? randomCode
      ? `${caption} (کد: ${randomCode})`
      : caption
    : randomCode
    ? `کد آگهی: ${randomCode}`
    : '';

  return {
    phoneNumber: fallbackPhone,
    rawPhonePrefix: '',
    randomCode,
    caption,
    captionWithCode,
    isTextFile,
  };
}

/**
 * Intelligently extracts and normalizes all genuine 11-digit Iranian phone numbers.
 * Prioritizes extracting the phone number from the start of filenames (<phone>_<code_or_caption>).
 */
export function extractIranianPhone(...candidates: (string | number | undefined | null)[]): string {
  // First pass: check if any candidate is a filename starting with <phone>_
  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const rawStr = raw.toString().trim();
    if (!rawStr) continue;
    if (rawStr.includes('_') || /\.(jpg|jpeg|png|webp|txt)$/i.test(rawStr)) {
      const parsed = parseListingFileName(rawStr);
      if (parsed.phoneNumber !== 'ثبت نشده') {
        return parsed.phoneNumber;
      }
    }
  }

  // Second pass: check all candidates in order
  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;
    const rawStr = raw.toString().trim();
    if (!rawStr) continue;

    const res = normalizeSinglePhoneCandidate(rawStr);
    if (res !== 'ثبت نشده') {
      return res;
    }
  }

  return 'ثبت نشده';
}

/**
 * Validates that an 11-digit number is not a dummy repetitive placeholder
 */
function isValidIranian11DigitNumber(num: string): boolean {
  if (num.length !== 11 || !num.startsWith('0')) return false;
  // Reject dummy placeholders like 09120000000, 09000000000, 00000000000, etc.
  if (
    num === '09120000000' ||
    num === '09000000000' ||
    num === '00000000000' ||
    /^0(\d)\1{9}$/.test(num) ||
    /0000000/.test(num)
  ) {
    return false;
  }
  return true;
}

/**
 * Normalizes Iranian phone numbers (e.g. "989122959582" -> "09122959582").
 * Backwards compatible with single string argument.
 */
export function formatIranianPhone(rawPhone?: string | number): string {
  if (!rawPhone) return 'ثبت نشده';
  return extractIranianPhone(rawPhone);
}

/**
 * Normalizes year (e.g. "82" -> 1382, "۱۴۰۳" -> 1403, "2017" -> 2017).
 * Returns 0 when the year is unknown, empty, or not provided (never guesses 1402).
 */
export function parseCarYear(rawYear?: string | number): number {
  if (rawYear === undefined || rawYear === null) return 0;
  const normalized = normalizePersianText(rawYear.toString()).trim();
  if (!normalized) return 0;

  const digitsOnly = normalized.replace(/[^\d]/g, '');
  if (!digitsOnly || digitsOnly === '0') return 0;
  if (digitsOnly === '00') return 1400;

  const num = parseInt(digitsOnly, 10);
  if (isNaN(num) || num <= 0) return 0;

  // Short 2-digit solar year like 82 -> 1382
  if (num >= 70 && num <= 99) {
    return 1300 + num;
  }
  if (num >= 1 && num <= 15) {
    return 1400 + num;
  }
  // Spoken 3-digit solar year like 400 -> 1400, 401 -> 1401, 402 -> 1402
  if (num >= 400 && num <= 415) {
    return 1000 + num;
  }
  if ((num >= 1350 && num <= 1420) || (num >= 1980 && num <= 2035)) {
    return num;
  }
  return 0;
}

/**
 * Extracts color, transmission, and body condition from free-form text or filename
 */
export function extractCarAttributes(text: string, rawColor = ''): {
  color: string;
  colorHex: string;
  gearbox: 'دنده‌ای' | 'اتوماتیک';
  bodyCondition: string;
  notes: string;
} {
  const parsedFile = parseListingFileName(text);
  const fileCaption = parsedFile.caption || '';
  const combined = `${ fileCaption } ${ rawColor }`.replace(/_/g, ' ').trim();

  // Colors
  let color = 'سفید';
  let colorHex = '#f8fafc';
  if (/مشکی|سیاه/.test(combined)) {
    color = 'مشکی';
    colorHex = '#0f172a';
  } else if (/خاکستری|نوک‌مدادی|دلفینی|سربی/.test(combined)) {
    color = 'خاکستری';
    colorHex = '#64748b';
  } else if (/نقره‌ای|سیلور/.test(combined)) {
    color = 'نقره‌ای';
    colorHex = '#cbd5e1';
  } else if (/قرمز|شرابی|عنابی/.test(combined)) {
    color = 'قرمز';
    colorHex = '#dc2626';
  } else if (/آبی|کاربنی|سرمه‌ای|سرمه ای/.test(combined)) {
    color = 'آبی';
    colorHex = '#1d4ed8';
  } else if (/سفید/.test(combined)) {
    color = 'سفید';
    colorHex = '#f8fafc';
  }

  // Gearbox
  const gearbox: 'دنده‌ای' | 'اتوماتیک' = /اتومات|پانا|cvt|auto/i.test(combined)
    ? 'اتوماتیک'
    : 'دنده‌ای';

  // Body condition
  let bodyCondition = 'بدنه تمیز و مرتب';
  if (/بیرنگ|بی رنگ|بدون رنگ|بدونه رنگ|خشک|صفر/.test(combined)) {
    bodyCondition = 'بدون رنگ و شاسی‌ها سالم';
  } else if (/یه لکه|یک لکه|یه گلگیر|یک گلگیر/.test(combined)) {
    bodyCondition = 'یک لکه رنگ';
  } else if (/چند لکه|چن لکه|سه لکه|۳لکه|3لکه/.test(combined)) {
    bodyCondition = 'چند لکه رنگ جزئی، فنی سالم';
  }

  // Clean note: prioritize caption extracted from filename after underline, without phone number
  let cleanNote = '';
  const cleanedRawColor = rawColor
    .replace(/\.jpg|\.txt|\.png/gi, '')
    .replace(/(?:\+?98|0098|0)?9\d{9}/g, '')
    .trim();

  if (parsedFile.caption) {
    cleanNote = parsedFile.captionWithCode;
    if (
      cleanedRawColor &&
      cleanedRawColor.length > 3 &&
      !normalizePersianText(parsedFile.caption).includes(normalizePersianText(cleanedRawColor))
    ) {
      cleanNote = `${cleanNote} | ${cleanedRawColor}`;
    }
  } else if (cleanedRawColor) {
    cleanNote = parsedFile.randomCode
      ? `${cleanedRawColor} (کد: ${parsedFile.randomCode})`
      : cleanedRawColor;
  } else if (parsedFile.randomCode) {
    cleanNote = `کد آگهی: ${parsedFile.randomCode}`;
  }

  return {
    color,
    colorHex,
    gearbox,
    bodyCondition,
    notes: cleanNote || 'بدون توضیحات تکمیلی',
  };
}

/**
 * Creates lightweight Base64 SVG illustration for imported car
 */
function createImportedCarSvg(colorHex: string, modelName: string, isFull: boolean): string {
  const width = isFull ? 800 : 160;
  const height = isFull ? 480 : 160;
  const strokeColor = '#1e293b';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
      <linearGradient id="carBody" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${colorHex}"/>
        <stop offset="100%" stop-color="#1e293b" stop-opacity="0.25"/>
      </linearGradient>
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <ellipse cx="${width * 0.5}" cy="${height * 0.76}" rx="${width * 0.42}" ry="${height * 0.08}" fill="#0f172a" fill-opacity="0.2" />

    <g filter="url(#shadow)">
      <path d="M ${width * 0.28} ${height * 0.52} 
               C ${width * 0.34} ${height * 0.32}, ${width * 0.62} ${height * 0.30}, ${width * 0.72} ${height * 0.52} 
               Z" fill="#334155" />
      <path d="M ${width * 0.31} ${height * 0.50} 
               C ${width * 0.36} ${height * 0.35}, ${width * 0.60} ${height * 0.34}, ${width * 0.69} ${height * 0.50} 
               Z" fill="#93c5fd" opacity="0.85" />
      <line x1="${width * 0.50}" y1="${height * 0.35}" x2="${width * 0.50}" y2="${height * 0.50}" stroke="#1e293b" stroke-width="${isFull ? 4 : 2}"/>

      <path d="M ${width * 0.12} ${height * 0.62} 
               C ${width * 0.12} ${height * 0.52}, ${width * 0.20} ${height * 0.50}, ${width * 0.28} ${height * 0.52}
               L ${width * 0.72} ${height * 0.52}
               C ${width * 0.80} ${height * 0.52}, ${width * 0.88} ${height * 0.55}, ${width * 0.88} ${height * 0.64}
               C ${width * 0.88} ${height * 0.70}, ${width * 0.82} ${height * 0.72}, ${width * 0.76} ${height * 0.72}
               L ${width * 0.24} ${height * 0.72}
               C ${width * 0.16} ${height * 0.72}, ${width * 0.12} ${height * 0.68}, ${width * 0.12} ${height * 0.62} Z" 
               fill="${colorHex}" stroke="${strokeColor}" stroke-width="${isFull ? 3 : 1.5}" />

      <circle cx="${width * 0.84}" cy="${height * 0.58}" r="${isFull ? 10 : 3}" fill="#fef08a" />
      <circle cx="${width * 0.16}" cy="${height * 0.58}" r="${isFull ? 8 : 2.5}" fill="#ef4444" />

      <g>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.025}" fill="#0f172a"/>

        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.025}" fill="#0f172a"/>
      </g>
    </g>

    <rect x="${width * 0.42}" y="${height * (isFull ? 0.90 : 0.88)}" 
          width="${width * 0.16}" height="${isFull ? 4 : 2}" 
          rx="${isFull ? 2 : 1}" fill="#94a3b8" />
  </svg>`;

  if (typeof btoa === 'function') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Detects car brand from name
 */
export function detectBrand(carName: string): string {
  const norm = normalizePersianText(carName);
  if (/206|207|2008|پژو|پارس|پرشیا|405|دنا|تارا|سمند|سورن|رانا|هایما|آریسان|ریرا|ال 90|ال90|تندر/.test(norm)) {
    return 'ایران خودرو';
  }
  if (/پراید|تیبا|کوییک|ساینا|شاهین|آریا|زامیاد/.test(norm)) {
    return 'سایپا';
  }
  if (/نیسان|ماکسیما|جوک|ترا|قشقایی|رونیز/.test(norm)) {
    return 'نیسان';
  }
  if (/تویوتا|کمری|کرولا|پرادو|لندکروز|راوفور|ایرتویا|لوین|یاریس|هایلوکس/.test(norm)) {
    return 'تویوتا';
  }
  if (/هیوندای|سانتافه|سوناتا|الانترا|النترا|توسان|پالیسید|آزرا|اکسنت|وراکروز|کنا/.test(norm)) {
    return 'هیوندای';
  }
  if (/کیا|اسپورتیج|سراتو|اپتیما|سورنتو|موهاوی|پیکانتو|کادنزا/.test(norm)) {
    return 'کیا';
  }
  if (/سیتروئن|زانتیا/.test(norm)) {
    return 'سیتروئن';
  }
  if (/دانگفنگ|دانگ فنگ|اچسی|اچ سی|h30/.test(norm)) {
    return 'دانگ‌فنگ';
  }
  if (/امویام|ام وی ام|تیگو|آریزو|فونیکس|چری|اکستروم/.test(norm)) {
    return 'مدیران خودرو';
  }
  if (/بنز|مرسدس/.test(norm)) {
    return 'مرسدس بنز';
  }
  if (/لکسوس/.test(norm)) {
    return 'لکسوس';
  }
  if (/آئودی|audi/i.test(norm)) {
    return 'آئودی';
  }
  if (/لاماری/.test(norm)) {
    return 'آرین پارس موتور';
  }
  return 'سایر';
}

/**
 * Parses user input JSON (either { version: 2, sellers: [...] } or array of objects)
 * into high-performance CarListing[]
 */
export function parseSellersJson(inputJson: string | object): {
  listings: CarListing[];
  errorsCount: number;
} {
  let data: any = inputJson;
  if (typeof inputJson === 'string') {
    data = JSON.parse(inputJson);
  }

  // Extract array of items
  let rawList: RawSellerItem[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.sellers)) {
      rawList = data.sellers;
    } else if (Array.isArray(data.data)) {
      rawList = data.data;
    } else {
      // Find first array property
      const keys = Object.keys(data);
      for (const k of keys) {
        if (Array.isArray(data[k])) {
          rawList = data[k];
          break;
        }
      }
    }
  }

  const listings: CarListing[] = [];
  let errorsCount = 0;
  const now = Date.now();

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];

    // Skip items explicitly marked with status === 'error' if they lack car name
    if (raw.status === 'error' && !raw.اسم_ماشین && !raw.title && !raw.carName) {
      errorsCount++;
      continue;
    }

    const parsedFile = parseListingFileName(raw.imageFileName);
    const rawCarName = (raw.اسم_ماشین || raw.title || raw.carName || parsedFile.caption || raw.رنگ || '').trim();
    if (!rawCarName && !raw.imageFileName && !raw.اسم_فروشنده && !raw.sellerPhone && !raw.id) {
      errorsCount++;
      continue;
    }

    const carName = rawCarName || 'خودرو فروشی';
    const year = parseCarYear(raw.سال_ساخت || raw.year);
    const brand = detectBrand(carName);
    const sellerPhone =
      parsedFile.phoneNumber !== 'ثبت نشده'
        ? parsedFile.phoneNumber
        : extractIranianPhone(
            raw.imageFileName,
            raw.اسم_فروشنده,
            raw.sellerPhone,
            raw.id,
            raw.description
          );

    const attrs = extractCarAttributes(raw.imageFileName || '', raw.رنگ || raw.color || '');

    // Title construction (only include year if known)
    const title = year > 0 ? `${carName} مدل ${toPersianDigits(year)}` : carName;

    // Price
    const price = raw.price || 0;
    const priceFormatted = raw.priceFormatted || (price > 0 ? formatTomanPrice(price) : 'توافقی');

    // Mileage
    const combinedInfo = normalizePersianText(`${raw.رنگ || ''} ${parsedFile.caption || ''}`);
    const mileageMatch = combinedInfo.match(/(\d+)\s*تا\s*کار/);
    const mileage = mileageMatch ? parseInt(mileageMatch[1], 10) * 1000 : 0;
    const mileageFormatted = mileage > 0 ? `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر` : 'کارشناسی نشده';

    const isTextOnly = Boolean(parsedFile.isTextFile || raw.imageFileName === 'ورودی دستی');
    const fileDescription = raw.description?.trim() || attrs.notes || '';
    const description = fileDescription;

    // Base64 SVGs
    const thumbnail = raw.imageThumbnailBase64 || createImportedCarSvg(attrs.colorHex, carName, false);
    const fullImage = raw.imageFullBase64 || createImportedCarSvg(attrs.colorHex, carName, true);

    const listing: CarListing = {
      id: raw.id || `seller-${Date.now()}-${i}`,
      type: 'sale',
      title,
      brand,
      model: carName,
      year,
      hasExplicitYear: year > 0,
      price,
      priceFormatted,
      mileage,
      mileageFormatted,
      color: attrs.color,
      gearbox: attrs.gearbox,
      bodyCondition: attrs.bodyCondition,
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: sellerPhone,
      description,
      fileDescription,
      imageFileName: raw.imageFileName,
      rowIndex: raw.rowIndex,
      isTextOnly,
      createdAt: raw.createdAt || new Date(now - (i % 3) * 3600000 * 12).toISOString(),
      imageThumbnailBase64: thumbnail,
      imageFullBase64: fullImage,
    };

    listing._searchIndex = buildSearchIndex(listing);
    listings.push(listing);
  }

  return { listings, errorsCount };
}
