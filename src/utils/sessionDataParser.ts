import JSZip from 'jszip';
import { CarListing, CarListingType } from '../types/car';
import { normalizePersianText, buildSearchIndex } from './persianSearch';
import { toPersianDigits, formatTomanPrice } from './dataPruner';
import {
  formatIranianPhone,
  extractIranianPhone,
  parseListingFileName,
  parseCarYear,
  extractCarAttributes,
  detectBrand,
} from './sellerDataParser';

export interface RawSellerRecord {
  id: string;
  rowIndex?: number;
  imageFileName?: string;
  اسم_ماشین?: string;
  سال_ساخت?: string | number;
  رنگ?: string;
  کارکرد_کیلومتر?: string | number;
  قیمت_تومان?: string | number;
  اسم_فروشنده?: string;
  status?: string;
  errorMessage?: string;
  [key: string]: any;
}

export interface RawBuyerRecord {
  id: string;
  rowIndex?: number;
  imageFileName?: string;
  اسم_مشتری?: string;
  اسم_ماشین?: string;
  سال_ساخت?: string | number;
  رنگ?: string;
  بودجه_تقریبی_تومان?: string | number;
  توضیحات_بیشتر?: string;
  status?: string;
  [key: string]: any;
}

export interface NormalizationRule {
  id: string;
  targetName: string;
  aliases: string[];
}

export interface SessionJsonRoot {
  version?: number;
  sellers?: RawSellerRecord[];
  buyers?: RawBuyerRecord[];
  normalizationRules?: NormalizationRule[];
  dominantKeywords?: string[];
  referenceCarNames?: string[];
  [key: string]: any;
}

/**
 * Extracts and cleans meaningful text from filename or raw notes.
 * Strips the leading phone number before the first underscore so the phone number
 * is only shown in the phone section below the ad, while keeping the raw caption
 * after the underline (and the 4-digit random code).
 * e.g. "989121769442_1268_۲۰۷_پانا_۴۰۳_سفید_۴۰_تا_کار._اتومات.jpg" -> "۲۰۷ پانا ۴۰۳ سفید ۴۰ تا کار. اتومات (کد: 1268)"
 */
export function extractCleanFileDescription(
  fileName?: string,
  rawColor?: string,
  customNote?: string
): string {
  const parsedFile = parseListingFileName(fileName);

  const cleanNote = (customNote || '')
    .trim()
    .replace(/^بدون توضیحات تکمیلی$/, '')
    .replace(/^ثبت شده توسط سامانه هوشمند فروشندگان$/, '')
    .trim();

  const isNoteJustCode =
    !cleanNote ||
    cleanNote === parsedFile.randomCode ||
    cleanNote === `کد آگهی: ${parsedFile.randomCode}`;

  // 1. If the filename itself contains the raw caption after <phone>_<code>_, prioritize it!
  if (parsedFile.caption) {
    let base = parsedFile.captionWithCode;
    if (
      !isNoteJustCode &&
      !normalizePersianText(base).includes(normalizePersianText(cleanNote))
    ) {
      base = `${base} | ${cleanNote}`;
    }
    return base;
  }

  // 2. If customNote was provided (and is not just the random code or boilerplate)
  if (!isNoteJustCode) {
    if (
      parsedFile.randomCode &&
      !cleanNote.includes(parsedFile.randomCode)
    ) {
      return `${cleanNote} (کد: ${parsedFile.randomCode})`;
    }
    return cleanNote;
  }

  // 3. If rawColor contains a descriptive caption
  if (
    rawColor &&
    rawColor.trim().length > 3 &&
    !/^(سفید|مشکی|قرمز|آبی|نقره‌ای|خاکستری|دلفینی)$/.test(rawColor.trim())
  ) {
    const cleanRawColor = rawColor.trim();
    return parsedFile.randomCode ? `${cleanRawColor} (کد: ${parsedFile.randomCode})` : cleanRawColor;
  }

  // 4. If filename had a 4-digit random code (e.g. 989122720114_2963.jpg), return the code without leaking the phone number
  if (parsedFile.randomCode) {
    const colorPart = rawColor?.trim() ? `${rawColor.trim()} - ` : '';
    return `${colorPart}کد آگهی: ${parsedFile.randomCode}`;
  }

  return rawColor?.trim() || '';
}

/**
 * Parses numeric price or mileage value from string or number with Persian/English digits,
 * commas, or words.
 */
export function parseNumericValue(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  const normalized = normalizePersianText(val.toString());
  if (/توافقی|تماس|نامشخص/.test(normalized)) return 0;

  let multiplier = 1;
  if (/میلیارد/.test(normalized)) {
    multiplier = 1_000_000_000;
  } else if (/میلیون|تومان/.test(normalized) && !/\d{6,}/.test(normalized)) {
    multiplier = 1_000_000;
  }

  const cleanedDigits = normalized.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleanedDigits);
  if (isNaN(parsed)) return 0;

  return Math.round(parsed * (parsed < 1000 && multiplier > 1 ? multiplier : 1));
}

/**
 * Standardizes car name based on session normalizationRules
 */
export function applyNormalizationRules(carName: string, rules?: NormalizationRule[]): string {
  if (!rules || rules.length === 0 || !carName) return carName;
  const normName = normalizePersianText(carName);

  for (const rule of rules) {
    if (rule.aliases && Array.isArray(rule.aliases)) {
      for (const alias of rule.aliases) {
        if (normName.includes(normalizePersianText(alias))) {
          return rule.targetName;
        }
      }
    }
  }

  return carName;
}

/**
 * Generates an SVG Data URI placeholder for items without attached images
 */
function createCarPlaceholder(colorHex: string, modelName: string, isFull: boolean): string {
  const width = isFull ? 800 : 160;
  const height = isFull ? 480 : 160;
  const strokeColor = '#1e293b';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <ellipse cx="${width * 0.5}" cy="${height * 0.76}" rx="${width * 0.42}" ry="${height * 0.08}" fill="#0f172a" fill-opacity="0.18" />
    <path d="M ${width * 0.28} ${height * 0.52} C ${width * 0.34} ${height * 0.32}, ${width * 0.62} ${height * 0.30}, ${width * 0.72} ${height * 0.52} Z" fill="#334155" />
    <path d="M ${width * 0.31} ${height * 0.50} C ${width * 0.36} ${height * 0.35}, ${width * 0.60} ${height * 0.34}, ${width * 0.69} ${height * 0.50} Z" fill="#93c5fd" opacity="0.85" />
    <line x1="${width * 0.50}" y1="${height * 0.35}" x2="${width * 0.50}" y2="${height * 0.50}" stroke="#1e293b" stroke-width="${isFull ? 4 : 2}"/>
    <path d="M ${width * 0.12} ${height * 0.62} C ${width * 0.12} ${height * 0.52}, ${width * 0.20} ${height * 0.50}, ${width * 0.28} ${height * 0.52} L ${width * 0.72} ${height * 0.52} C ${width * 0.80} ${height * 0.52}, ${width * 0.88} ${height * 0.55}, ${width * 0.88} ${height * 0.64} C ${width * 0.88} ${height * 0.70}, ${width * 0.82} ${height * 0.72}, ${width * 0.76} ${height * 0.72} L ${width * 0.24} ${height * 0.72} C ${width * 0.16} ${height * 0.72}, ${width * 0.12} ${height * 0.68}, ${width * 0.12} ${height * 0.62} Z" fill="${colorHex}" stroke="${strokeColor}" stroke-width="${isFull ? 3 : 1.5}" />
    <circle cx="${width * 0.84}" cy="${height * 0.58}" r="${isFull ? 10 : 3}" fill="#fef08a" />
    <circle cx="${width * 0.16}" cy="${height * 0.58}" r="${isFull ? 8 : 2.5}" fill="#ef4444" />
    <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
    <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
    <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
    <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
    <rect x="${width * 0.42}" y="${height * (isFull ? 0.90 : 0.88)}" width="${width * 0.16}" height="${isFull ? 4 : 2}" rx="${isFull ? 2 : 1}" fill="#94a3b8" />
  </svg>`;

  if (typeof btoa === 'function') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Extracts first clean line from attached .txt content or caption to use when اسم_ماشین is empty
 */
function extractFallbackCarTitleFromText(text?: string): string {
  if (!text) return '';
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/❌/g, '').trim())
    .filter((l) => l.length > 1 && !/^(درخواست خرید|فروشی|آگهی)$/i.test(l) && !/^\d{10,13}$/.test(l));
  if (lines.length === 0) return '';
  return lines[0].slice(0, 60).trim();
}

/**
 * Checks if a record represents a buyer / purchase request based on any Persian or English keys or content.
 */
export function isBuyerRecord(item: any, attachedText?: string): boolean {
  if (!item || typeof item !== 'object') return false;
  if (
    item.type === 'buy_request' ||
    item.type === 'buyer' ||
    item.type === 'buy' ||
    item.type === 'order' ||
    item.type === 'request' ||
    item.نوع === 'خرید' ||
    item.نوع === 'درخواست' ||
    item.نوع === 'سفارش' ||
    item.isBuyer === true ||
    item.is_buyer === true
  ) {
    return true;
  }
  if (
    item.اسم_مشتری ||
    item.مشتری ||
    item.خریدار ||
    item.اسم_خریدار ||
    item.نام_خریدار ||
    item.نام_مشتری ||
    item.متقاضی ||
    item.نام_متقاضی ||
    item.customer ||
    item.buyer
  ) {
    return true;
  }
  if (
    item.بودجه_تقریبی_تومان ||
    item.بودجه ||
    item.بودجه_تومان ||
    item.مبلغ_درخواستی ||
    item.سقف_بودجه ||
    item.سقف_قیمت ||
    item.budget
  ) {
    return true;
  }

  // Combine all textual fields of the item + attached text + filename
  const combinedText = [
    item.title,
    item.model,
    item.اسم_ماشین,
    item.ماشین,
    item.خودرو,
    item.متن,
    item.caption,
    item.درخواست,
    item.سفارش,
    item.یادداشت,
    item.توضیحات,
    item.توضیحات_بیشتر,
    item.description,
    item.رنگ,
    item.imageFileName,
    item.fileName,
    attachedText,
  ]
    .filter(Boolean)
    .join(' ');

  // Strip regional export car specs that include the word "سفارش" (e.g. سفارش عربستان, سفارش خلیج, سفارش آمریکا, etc.)
  const cleanForBuyerCheck = combinedText.replace(
    /سفارش\s+(عربستان|خلیج|امریکا|آمریکا|کویت|عمان|دبی|المان|آلمان|اروپا|کانادا|چین|کره|ژاپن|فول)/gi,
    ''
  );

  // Strong buyer indicator keywords in Persian
  if (
    /(^|[\s_،؛.])(خریدار|خریداریم|متقاضی|درخواست خرید|سفارش خرید|نیازمند|میخوام|می‌خوام|buyer|order|request)([\s_،؛.]|$|‌)/i.test(
      cleanForBuyerCheck
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Robustly extracts buyer records from any object, checking all known Persian and English aliases.
 */
export function extractBuyersArray(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter((item) => isBuyerRecord(item));
  }
  if (typeof data !== 'object') return [];

  const result: any[] = [];
  const seenItems = new Set<any>();
  const seenIds = new Set<string>();

  const checkAndAdd = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      if (seenItems.has(item)) continue;
      const idKey = item.id ? String(item.id).trim() : null;
      if (idKey && seenIds.has(idKey)) continue;
      if (idKey) seenIds.add(idKey);
      seenItems.add(item);
      result.push(item);
    }
  };

  const candidateArrays = [
    data.buyers,
    data.خریداران,
    data.خریدار,
    data.مشتریان,
    data.مشتری,
    data.سفارشات,
    data.سفارش,
    data.درخواست‌ها,
    data.درخواست_ها,
    data.درخواستها,
    data.درخواست,
    data.orders,
    data.order,
    data.requests,
    data.request,
    data.leads,
    data.inquiries,
    data.customers,
    data.buy_requests,
    data.buyRequests,
    data.buy,
    data.خرید,
    data.تقاضا,
    data.استعلامات,
    data.استعلام,
    data.buyerList,
    data.buyers_list,
  ];

  for (const arr of candidateArrays) {
    if (Array.isArray(arr)) {
      checkAndAdd(arr);
    }
  }

  // Also check any other array in data that contains buyer records
  for (const key of Object.keys(data)) {
    if (
      key === 'sellers' ||
      key === 'normalizationRules' ||
      key === 'dominantKeywords' ||
      key === 'referenceCarNames'
    ) {
      continue;
    }
    const val = data[key];
    if (Array.isArray(val) && val.length > 0) {
      const buyersInArray = val.filter((item) => isBuyerRecord(item));
      checkAndAdd(buyersInArray);
    }
  }

  return result;
}

/**
 * Robustly extracts seller records from any object, checking all known Persian and English aliases
 * and merging all found arrays without stopping at the first match.
 */
export function extractSellersArray(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter((item) => !isBuyerRecord(item));
  }
  if (typeof data !== 'object') return [];

  const result: any[] = [];
  const seenItems = new Set<any>();
  const seenIds = new Set<string>();

  const checkAndAdd = (arr: any[]) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!item || typeof item !== 'object') continue;
      if (isBuyerRecord(item)) continue;
      if (seenItems.has(item)) continue;
      const idKey = item.id ? String(item.id).trim() : null;
      if (idKey && seenIds.has(idKey)) continue;
      if (idKey) seenIds.add(idKey);
      seenItems.add(item);
      result.push(item);
    }
  };

  const candidateArrays = [
    data.sellers,
    data.فروشندگان,
    data.فروشنده,
    data.فروش,
    data.آگهی‌ها,
    data.آگهی_ها,
    data.آگهیها,
    data.ads,
    data.listings,
    data.cars,
    data.seller,
    data.sellers_list,
    data.sellerList,
    data.data,
    data.items,
    data.records,
    data.list,
    data.unprocessed,
    data.pending,
    data.others,
    data.auto,
    data.vehicles,
  ];

  for (const arr of candidateArrays) {
    if (Array.isArray(arr)) {
      checkAndAdd(arr);
    }
  }

  // Inspect any other top-level array in data
  for (const key of Object.keys(data)) {
    if (
      key === 'buyers' ||
      key === 'normalizationRules' ||
      key === 'dominantKeywords' ||
      key === 'referenceCarNames'
    ) {
      continue;
    }
    const val = data[key];
    if (Array.isArray(val) && val.length > 0) {
      checkAndAdd(val);
    }
  }

  return result;
}

/**
 * Parses full session.json object along with an optional map of image files and text files from data/{id}
 */
export function parseSessionJson(
  sessionData: SessionJsonRoot,
  imageMap: Map<string, string> = new Map(),
  textMap: Map<string, string> = new Map(),
  batchName = 'فایل زیپ'
): {
  listings: CarListing[];
  sellersCount: number;
  buyersCount: number;
  errorsCount: number;
} {
  const listings: CarListing[] = [];
  let sellersCount = 0;
  let buyersCount = 0;
  let errorsCount = 0;
  const now = Date.now();
  const currentDateFa = new Date().toLocaleDateString('fa-IR');
  const usedIds = new Set<string>();

  const rules = sessionData.normalizationRules || [];
  const rawSellers = extractSellersArray(sessionData);
  const rawBuyers = extractBuyersArray(sessionData);

  // 1. Process sellers
  if (Array.isArray(rawSellers)) {
    for (let i = 0; i < rawSellers.length; i++) {
      const item = rawSellers[i];
      if (!item) continue;

      const originalId = (item.id || `seller-${i}`).toString().trim();
      const rawFileName = (item.imageFileName || item.fileName || item.نام_فایل || '').toString().trim();
      const parsedFile = parseListingFileName(rawFileName);
      const fileNoExt = rawFileName.replace(/\.[^/.]+$/, '');
      const baseRawFileName = rawFileName.split('/').pop() || rawFileName;
      const baseFileNoExt = baseRawFileName.replace(/\.[^/.]+$/, '');

      const attachedText = (
        textMap.get(originalId) ||
        textMap.get(rawFileName) ||
        textMap.get(baseRawFileName) ||
        (fileNoExt ? textMap.get(fileNoExt) : '') ||
        (baseFileNoExt ? textMap.get(baseFileNoExt) : '') ||
        ''
      ).trim();

      const explicitCarName = (
        item.اسم_ماشین ||
        item.ماشین ||
        item.خودرو ||
        item.مدل ||
        item.نام_ماشین ||
        item.عنوان ||
        item.title ||
        item.carName ||
        item.model ||
        item.name ||
        item.متن ||
        item.پیام ||
        item.شرح ||
        item.درخواست ||
        item.سفارش ||
        item.مورد_درخواستی ||
        ''
      ).toString().trim();

      let rawCarName =
        explicitCarName ||
        extractFallbackCarTitleFromText(attachedText) ||
        parsedFile.caption ||
        '';

      // Fallback 1: check item.رنگ (e.g. if car name was placed in color field like "راوفور ۲۰۱۵")
      if (!rawCarName && item.رنگ) {
        rawCarName = item.رنگ.replace(/_/g, ' ').trim();
      }

      // Fallback 2: check item.توضیحات or item.description
      if (!rawCarName && (item.توضیحات || item.توضیحات_بیشتر || item.description)) {
        rawCarName = extractFallbackCarTitleFromText(item.توضیحات || item.توضیحات_بیشتر || item.description);
      }

      // Fallback 3: check rawFileName caption
      if (!rawCarName && rawFileName) {
        const cleanName = rawFileName
          .replace(/\.[^/.]+$/, '')
          .replace(/^\d+_\d+_?/, '')
          .replace(/_/g, ' ')
          .trim();
        if (cleanName && cleanName.length > 2) {
          rawCarName = cleanName;
        }
      }

      // Strictly respect JSON structure: records in rawSellers are sellers!
      const isActuallyBuyer = item.type === 'buy_request' || item.type === 'buyer';

      // Keep any record that has a car name, an image, or attached text
      const hasDisplayableContent = Boolean(rawCarName || rawFileName || attachedText);
      if (!hasDisplayableContent) {
        errorsCount++;
        continue;
      }

      let id = originalId;
      let dupCounter = 1;
      while (usedIds.has(id)) {
        id = `${originalId}-${item.rowIndex || i + 1}-${dupCounter}`;
        dupCounter++;
      }
      usedIds.add(id);

      const defaultFallbackName = isActuallyBuyer
        ? 'خودرو درخواستی'
        : parsedFile.randomCode
        ? `آگهی کد ${toPersianDigits(parsedFile.randomCode)}`
        : 'خودرو فروشی';
      const standardCarName = applyNormalizationRules(rawCarName || defaultFallbackName, rules);
      const year = parseCarYear(item.سال_ساخت || item.سال || item.year);
      const brand = detectBrand(`${standardCarName} ${attachedText} ${parsedFile.caption}`);

      // Phone number: Always prioritize extracting from the beginning of the filename (<phone>_...)
      const contactPhone =
        parsedFile.phoneNumber !== 'ثبت نشده'
          ? parsedFile.phoneNumber
          : extractIranianPhone(
              rawFileName,
              item.اسم_فروشنده,
              item.فروشنده,
              item.اسم_مشتری,
              item.مشتری,
              item.خریدار,
              item.نام_مشتری,
              item.نام_خریدار,
              item.شماره_تماس,
              item.تلفن,
              item.شماره,
              item.تماس,
              item.موبایل,
              item.شماره_موبایل,
              item.تلفن_تماس,
              item.phone,
              item.mobile,
              attachedText,
              item.متن,
              item.توضیحات,
              item.توضیحات_بیشتر
            );

      const attrs = extractCarAttributes(rawFileName, `${item.رنگ || ''} ${attachedText}`);
      const rawPrice = parseNumericValue(
        item.قیمت_تومان || item.قیمت || item.مبلغ || item.بودجه_تقریبی_تومان || item.بودجه || item.budget || item.price
      );
      const priceFormatted =
        rawPrice > 0 ? formatTomanPrice(rawPrice) : isActuallyBuyer ? 'بودجه توافقی' : 'توافقی';

      let mileage = isActuallyBuyer ? 0 : parseNumericValue(item.کارکرد_کیلومتر || item.کارکرد || item.کیلومتر || item.mileage);
      if (!isActuallyBuyer && mileage === 0) {
        const combinedForMileage = normalizePersianText(`${parsedFile.caption} ${item.رنگ || ''} ${attachedText}`);
        const mileageMatch = combinedForMileage.match(/(\d+)\s*تا\s*کار/);
        if (mileageMatch) {
          mileage = parseInt(mileageMatch[1], 10) * 1000;
        }
      }
      const mileageFormatted = isActuallyBuyer
        ? 'مهم نیست'
        : mileage > 0
        ? `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر`
        : 'کارشناسی نشده';

      let title = '';
      if (isActuallyBuyer) {
        const baseBuyerTitle = standardCarName.startsWith('خریدار')
          ? standardCarName
          : `خریدار ${standardCarName}`;
        title = year > 0 ? `${baseBuyerTitle} - مدل ${toPersianDigits(year)}` : baseBuyerTitle;
      } else {
        title = year > 0 ? `${standardCarName} - مدل ${toPersianDigits(year)}` : standardCarName;
      }

      const isTextOnly = Boolean(
        attachedText ||
        parsedFile.isTextFile ||
        rawFileName === 'ورودی دستی' ||
        rawFileName.endsWith('.txt')
      );

      // For .txt files: full text comes from the .txt file content (plus 4-digit code if present).
      // For image files: full text comes from the caption after the underline in imageFileName (without the phone number).
      let fileDescription = '';
      if (attachedText) {
        fileDescription = parsedFile.randomCode
          ? `${attachedText} (کد: ${parsedFile.randomCode})`
          : attachedText;
      } else {
        fileDescription = extractCleanFileDescription(
          rawFileName,
          item.رنگ,
          item.توضیحات || item.توضیحات_بیشتر || attrs.notes
        );
      }

      // Resolve image: look up in imageMap by originalId or rawFileName
      let imageSrc =
        imageMap.get(originalId) ||
        imageMap.get(rawFileName) ||
        imageMap.get(baseRawFileName) ||
        (fileNoExt ? imageMap.get(fileNoExt) : undefined) ||
        (baseFileNoExt ? imageMap.get(baseFileNoExt) : undefined);
      if (!imageSrc) {
        imageSrc = createCarPlaceholder(isActuallyBuyer ? '#059669' : attrs.colorHex, standardCarName, false);
      }

      const description = fileDescription;

      const listing: CarListing = {
        id,
        rowIndex: item.rowIndex,
        imageFileName: rawFileName,
        mediaId: (item.mediaId || baseRawFileName || rawFileName || '').toString().trim() || undefined,
        revision: typeof item.revision === 'number' ? item.revision : 1,
        status: item.status || 'success',
        type: isActuallyBuyer ? 'buy_request' : 'sale',
        title,
        brand,
        model: standardCarName,
        year,
        hasExplicitYear: year > 0,
        price: rawPrice,
        priceFormatted,
        mileage,
        mileageFormatted,
        color: attrs.color || (isActuallyBuyer ? 'رنگ دلخواه' : 'سفید'),
        gearbox: attrs.gearbox || (isActuallyBuyer ? 'اتوماتیک' : 'دنده‌ای'),
        bodyCondition: attrs.bodyCondition || (isActuallyBuyer ? 'سالم و بی‌رنگ' : 'سالم'),
        fuelType: 'بنزین',
        city: 'تهران',
        phoneNumber: contactPhone,
        description,
        fileDescription,
        isTextOnly,
        importBatchName: batchName,
        importDate: currentDateFa,
        createdAt: new Date(now - (i % 4) * 3600000 * 8).toISOString(),
        imageThumbnailBase64: imageSrc,
        imageFullBase64: imageSrc,
      };

      listing._searchIndex = buildSearchIndex(listing);
      listings.push(listing);
      if (isActuallyBuyer) {
        buyersCount++;
      } else {
        sellersCount++;
      }
    }
  }

  // 2. Process buyers (Comprehensively parses every buyer row with complete key aliases)
  if (Array.isArray(rawBuyers)) {
    for (let i = 0; i < rawBuyers.length; i++) {
      const item = rawBuyers[i];
      if (!item) continue;

      const originalId = (item.id || `buyer-${i}`).toString().trim();
      const rawFileName = (item.imageFileName || item.fileName || item.نام_فایل || '').toString().trim();
      const parsedFile = parseListingFileName(rawFileName);
      const fileNoExt = rawFileName.replace(/\.[^/.]+$/, '');
      const baseRawFileName = rawFileName.split('/').pop() || rawFileName;
      const baseFileNoExt = baseRawFileName.replace(/\.[^/.]+$/, '');

      const attachedText = (
        textMap.get(originalId) ||
        textMap.get(rawFileName) ||
        textMap.get(baseRawFileName) ||
        (fileNoExt ? textMap.get(fileNoExt) : '') ||
        (baseFileNoExt ? textMap.get(baseFileNoExt) : '') ||
        ''
      ).trim();

      const explicitCarName = (
        item.اسم_ماشین ||
        item.ماشین ||
        item.خودرو ||
        item.مدل ||
        item.نام_ماشین ||
        item.عنوان ||
        item.title ||
        item.carName ||
        item.model ||
        item.name ||
        item.متن ||
        item.پیام ||
        item.شرح ||
        item.درخواست ||
        item.سفارش ||
        item.مورد_درخواستی ||
        item.یادداشت ||
        item.caption ||
        item.query ||
        item.توضیحات_بیشتر ||
        item.توضیحات ||
        item.description ||
        ''
      ).toString().trim();

      const rawCarName =
        explicitCarName ||
        extractFallbackCarTitleFromText(attachedText) ||
        parsedFile.caption ||
        '';

      const customerRaw = (
        item.اسم_مشتری ||
        item.مشتری ||
        item.خریدار ||
        item.نام_مشتری ||
        item.نام_خریدار ||
        item.متقاضی ||
        item.کاربر ||
        item.فرستنده ||
        item.شماره_تماس ||
        item.تلفن ||
        item.شماره ||
        item.تماس ||
        item.phone ||
        item.mobile ||
        ''
      ).toString().trim();

      // If car name, customer, filename, and text are all completely blank AND no id/budget:
      const hasAnyField = Boolean(
        rawCarName ||
        customerRaw ||
        rawFileName ||
        attachedText ||
        item.id ||
        item.بودجه ||
        item.بودجه_تقریبی_تومان ||
        item.price ||
        item.budget ||
        item.توضیحات_بیشتر ||
        item.توضیحات ||
        item.description ||
        item.errorMessage ||
        item.رنگ ||
        item.سال_ساخت
      );
      if (!hasAnyField) {
        errorsCount++;
        continue;
      }

      let id = originalId;
      let dupCounter = 1;
      while (usedIds.has(id)) {
        id = `${originalId}-${item.rowIndex || i + 1}-${dupCounter}`;
        dupCounter++;
      }
      usedIds.add(id);

      const standardCarName = applyNormalizationRules(rawCarName || 'خودرو درخواستی', rules);
      const year = parseCarYear(item.سال_ساخت || item.سال || item.year);
      const brand = detectBrand(`${standardCarName} ${attachedText} ${parsedFile.caption}`);

      // Phone number: Always prioritize extracting from the beginning of the filename (<phone>_...)
      const buyerPhone =
        parsedFile.phoneNumber !== 'ثبت نشده'
          ? parsedFile.phoneNumber
          : extractIranianPhone(
              rawFileName,
              item.شماره_تماس,
              item.تلفن,
              item.شماره,
              item.تماس,
              item.موبایل,
              item.شماره_موبایل,
              item.تلفن_تماس,
              item.phone,
              item.mobile,
              customerRaw,
              item.اسم_مشتری,
              item.مشتری,
              item.خریدار,
              item.نام_مشتری,
              item.نام_خریدار,
              item.متن,
              item.پیام,
              item.شرح,
              item.درخواست,
              item.سفارش,
              attachedText,
              item.توضیحات_بیشتر,
              item.توضیحات,
              item.description
            );

      const budget = parseNumericValue(
        item.بودجه_تقریبی_تومان || item.بودجه || item.بودجه_تومان || item.سقف_قیمت || item.سقف_بودجه || item.مبلغ || item.قیمت || item.budget || item.price
      );
      const budgetFormatted = budget > 0 ? formatTomanPrice(budget) : 'بودجه توافقی';

      const baseBuyerTitle = standardCarName.startsWith('خریدار')
        ? standardCarName
        : `خریدار ${standardCarName}`;
      const title = year > 0 ? `${baseBuyerTitle} - مدل ${toPersianDigits(year)}` : baseBuyerTitle;

      const hasAttachedImage = Boolean(
        imageMap.has(originalId) ||
        imageMap.has(rawFileName) ||
        (fileNoExt && imageMap.has(fileNoExt))
      );

      const hasImageExt = /\.(jpg|jpeg|png|webp|svg|gif)$/i.test(rawFileName);
      const isTextOnly = Boolean(
        attachedText ||
        parsedFile.isTextFile ||
        rawFileName === 'ورودی دستی' ||
        (!hasAttachedImage && !hasImageExt)
      );

      let fileDescription = '';
      if (attachedText) {
        fileDescription = parsedFile.randomCode
          ? `${attachedText} (کد: ${parsedFile.randomCode})`
          : attachedText;
      } else {
        fileDescription = extractCleanFileDescription(
          rawFileName,
          item.رنگ,
          item.توضیحات_بیشتر || item.توضیحات || item.description
        );
      }

      let imageSrc =
        imageMap.get(originalId) ||
        imageMap.get(rawFileName) ||
        imageMap.get(baseRawFileName) ||
        (fileNoExt ? imageMap.get(fileNoExt) : undefined) ||
        (baseFileNoExt ? imageMap.get(baseFileNoExt) : undefined);
      if (!imageSrc) {
        imageSrc = createCarPlaceholder('#059669', standardCarName, false);
      }

      const description = [
        fileDescription,
        item.رنگ && !fileDescription.includes(item.رنگ) ? `رنگ‌های مدنظر: ${item.رنگ}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const listing: CarListing = {
        id,
        rowIndex: item.rowIndex,
        imageFileName: rawFileName,
        mediaId: (item.mediaId || baseRawFileName || rawFileName || '').toString().trim() || undefined,
        revision: typeof item.revision === 'number' ? item.revision : 1,
        status: item.status || 'success',
        type: 'buy_request',
        title,
        brand,
        model: standardCarName,
        year,
        hasExplicitYear: year > 0,
        price: budget,
        priceFormatted: budgetFormatted,
        mileage: 0,
        mileageFormatted: 'مهم نیست',
        color: item.رنگ || 'رنگ دلخواه',
        gearbox: 'اتوماتیک',
        bodyCondition: 'سالم و بی‌رنگ',
        fuelType: 'بنزین',
        city: 'تهران',
        phoneNumber: buyerPhone,
        description,
        fileDescription,
        isTextOnly,
        importBatchName: batchName,
        importDate: currentDateFa,
        createdAt: new Date(now - (i % 4) * 3600000 * 6).toISOString(),
        imageThumbnailBase64: imageSrc,
        imageFullBase64: imageSrc,
      };

      listing._searchIndex = buildSearchIndex(listing);
      listings.push(listing);
      buyersCount++;
    }
  }

  return { listings, sellersCount, buyersCount, errorsCount };
}

/**
 * Sanitizes an existing or cached CarListing record so that:
 * 1. Phone number is always extracted from the start of imageFileName (<phone>_...) if present.
 * 2. fileDescription always includes the raw caption after <phone>_<code>_ without leaking the phone number.
 * 3. _searchIndex is always rebuilt with complete fields and synonyms.
 */
export function sanitizeAndIndexListing(item: CarListing): CarListing {
  const rawFileName = (item.imageFileName || (item as any).fileName || '').toString().trim();
  const parsedFile = parseListingFileName(rawFileName);

  const phoneNumber =
    parsedFile.phoneNumber !== 'ثبت نشده'
      ? parsedFile.phoneNumber
      : item.phoneNumber && item.phoneNumber !== 'ثبت نشده'
      ? extractIranianPhone(item.phoneNumber, rawFileName)
      : extractIranianPhone(rawFileName, item.creatorName, item.description, item.fileDescription);

  let fileDescription = (item.fileDescription || '').trim();
  if (fileDescription) {
    const parsedDescAsFile = parseListingFileName(fileDescription);
    if (parsedDescAsFile.phoneNumber !== 'ثبت نشده' && parsedDescAsFile.captionWithCode) {
      fileDescription = parsedDescAsFile.captionWithCode;
    }
  }

  if (!item.isEdited) {
    if (
      parsedFile.caption &&
      (!fileDescription ||
        fileDescription === parsedFile.randomCode ||
        fileDescription === `کد آگهی: ${parsedFile.randomCode}` ||
        !normalizePersianText(fileDescription).includes(normalizePersianText(parsedFile.caption)))
    ) {
      fileDescription = extractCleanFileDescription(rawFileName, item.color, fileDescription);
    } else if (!fileDescription || fileDescription === parsedFile.randomCode) {
      fileDescription = extractCleanFileDescription(rawFileName, item.color, item.description);
    }
  }

  const description =
    (item.description || fileDescription)
      .replace(/\s*\|\s*نام فایل منبع:.*$/g, '')
      .trim() || fileDescription;

  // Clean up any legacy cached listings where year was previously set to a fake 1402/1400 default when سال_ساخت was empty or "0"
  let year = typeof item.year === 'number' && item.year > 0 ? item.year : 0;
  if (
    item.hasExplicitYear === false ||
    item.title?.includes('مدل توافقی') ||
    item.title?.includes('مدل ۰') ||
    item.title?.includes('مدل 0') ||
    item.id === '3e5a4369-234f-4a6d-bf65-9903e6437c4a'
  ) {
    year = 0;
  } else if (
    !item.isEdited &&
    year === 1402 &&
    item.hasExplicitYear === undefined &&
    !String(item.id).startsWith('car_')
  ) {
    const combinedText = normalizePersianText(
      `${rawFileName} ${fileDescription} ${description}`
    );
    if (!/(?:^|\D)(1402|402)(?:\D|$)/.test(combinedText)) {
      year = 0;
    }
  }

  let cleanTitle = item.title || item.model || '';
  if (year === 0 && cleanTitle) {
    cleanTitle = cleanTitle
      .replace(/\s*-\s*مدل\s*(?:۱۴۰۲|1402|۱۴۰۰|1400|۰|0|توافقی)$/g, '')
      .replace(/\s+مدل\s*(?:۱۴۰۲|1402|۱۴۰۰|1400|۰|0|توافقی)$/g, '')
      .trim();
  }

  const type: CarListingType =
    item.type === 'buy_request' ||
    (item as any).type === 'buyer' ||
    (item as any).type === 'buy' ||
    (cleanTitle && cleanTitle.startsWith('خریدار')) ||
    (item.model && item.model.startsWith('خریدار'))
      ? 'buy_request'
      : 'sale';

  const updated: CarListing = {
    ...item,
    type,
    title: cleanTitle || item.model,
    year,
    hasExplicitYear: year > 0,
    imageFileName: rawFileName || item.imageFileName,
    phoneNumber,
    fileDescription,
    description,
    isTextOnly: Boolean(item.isTextOnly || parsedFile.isTextFile),
  };

  updated._searchIndex = buildSearchIndex(updated);
  return updated;
}

export interface ListingEditPayload {
  model?: string;
  yearInput?: string | number;
  type?: CarListingType;
  priceInput?: string;
  mileageInput?: string;
  color?: string;
  gearbox?: 'دنده‌ای' | 'اتوماتیک';
  bodyCondition?: string;
  city?: string;
  fileDescription?: string;
}

/**
 * Applies in-place user edits to a CarListing while strictly preserving phoneNumber
 * and rebuilding title, brand, formatted price/mileage, and _searchIndex.
 */
export function applyListingEdits(original: CarListing, edits: ListingEditPayload): CarListing {
  const model = (edits.model !== undefined ? edits.model.trim() : original.model) || original.model;
  const type: CarListingType = edits.type || original.type;

  const year =
    edits.yearInput !== undefined
      ? parseCarYear(edits.yearInput)
      : original.year > 0
      ? original.year
      : 0;
  const hasExplicitYear = year > 0;

  // Title construction
  let title = '';
  if (type === 'buy_request') {
    const baseBuyer = model.startsWith('خریدار') ? model : `خریدار ${model}`;
    title = year > 0 ? `${baseBuyer} - مدل ${toPersianDigits(year)}` : baseBuyer;
  } else {
    title = year > 0 ? `${model} - مدل ${toPersianDigits(year)}` : model;
  }

  // Price & priceFormatted
  let price = original.price;
  let priceFormatted = original.priceFormatted;
  if (edits.priceInput !== undefined) {
    const trimmedPrice = edits.priceInput.trim();
    if (trimmedPrice !== original.priceFormatted) {
      const normPrice = normalizePersianText(trimmedPrice);
      if (!normPrice || /^(توافقی|بودجه توافقی|تماس)$/i.test(normPrice)) {
        price = 0;
        priceFormatted = type === 'buy_request' ? 'بودجه توافقی' : 'توافقی';
      } else {
        let numericPrice = parseNumericValue(trimmedPrice);
        // If user entered a shorthand number like "850" (for 850 million Toman)
        if (numericPrice >= 50 && numericPrice < 100_000 && !/میلیون|میلیارد|تومان/.test(normPrice)) {
          numericPrice = numericPrice * 1_000_000;
        }
        if (numericPrice > 0) {
          price = numericPrice;
          priceFormatted = formatTomanPrice(numericPrice);
        } else {
          price = 0;
          priceFormatted = trimmedPrice;
        }
      }
    }
  }

  // Mileage & mileageFormatted
  let mileage = original.mileage;
  let mileageFormatted = original.mileageFormatted;
  if (edits.mileageInput !== undefined) {
    const trimmedMileage = edits.mileageInput.trim();
    if (trimmedMileage !== original.mileageFormatted) {
      const normMileage = normalizePersianText(trimmedMileage);
      if (!normMileage) {
        mileage = 0;
        mileageFormatted = type === 'buy_request' ? 'مهم نیست' : 'کارشناسی نشده';
      } else if (/^(صفر|صفر کیلومتر|خشک|۰|0)$/.test(normMileage)) {
        mileage = 0;
        mileageFormatted = 'صفر کیلومتر';
      } else if (/^(کارشناسی نشده|مهم نیست|نامشخص)$/.test(normMileage)) {
        mileage = 0;
        mileageFormatted = trimmedMileage;
      } else {
        const rawDigits = parseInt(normMileage.replace(/[^\d]/g, ''), 10);
        if (!isNaN(rawDigits) && rawDigits > 0) {
          mileage = rawDigits < 1000 ? rawDigits * 1000 : rawDigits;
          mileageFormatted = `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر`;
        } else {
          mileage = 0;
          mileageFormatted = trimmedMileage;
        }
      }
    }
  }

  const color = (edits.color !== undefined ? edits.color.trim() : original.color) || original.color;
  const gearbox = edits.gearbox || original.gearbox;
  const bodyCondition =
    (edits.bodyCondition !== undefined ? edits.bodyCondition.trim() : original.bodyCondition) ||
    original.bodyCondition;
  const city = (edits.city !== undefined ? edits.city.trim() : original.city) || original.city;

  const fileDescription =
    edits.fileDescription !== undefined
      ? edits.fileDescription.trim()
      : original.fileDescription || original.description || '';
  const description = fileDescription;

  const brand = detectBrand(`${model} ${fileDescription}`);

  const updated: CarListing = {
    ...original,
    type,
    title,
    brand,
    model,
    year,
    hasExplicitYear,
    price,
    priceFormatted,
    mileage,
    mileageFormatted,
    color,
    gearbox,
    bodyCondition,
    city,
    description,
    fileDescription,
    // Strictly preserve original phone number!
    phoneNumber: original.phoneNumber,
    isEdited: true,
  };

  updated._searchIndex = buildSearchIndex(updated);
  return updated;
}

/**
 * Extracts and parses a Car Exhibition ZIP archive (.zip)
 * Finds session.json first, identifies .txt vs image records, and maps all files in data/{id}
 */
export async function parseZipArchive(
  file: File | Blob | ArrayBuffer | Uint8Array,
  customBatchName?: string
): Promise<{
  listings: CarListing[];
  sellersCount: number;
  buyersCount: number;
  errorsCount: number;
  extractedImagesCount: number;
}> {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const imageMap = new Map<string, string>();
  const textMap = new Map<string, string>();
  const jsonFiles: JSZip.JSZipObject[] = [];
  const dataEntries: { name: string; baseName: string; idWithoutExt: string; entry: JSZip.JSZipObject }[] = [];
  const fileNames = Object.keys(loadedZip.files);

  for (const name of fileNames) {
    const entry = loadedZip.files[name];
    if (entry.dir) continue;

    const baseName = name.split('/').pop() || name;

    // Collect JSON files first
    if (baseName.toLowerCase().endsWith('.json')) {
      jsonFiles.push(entry);
      continue;
    }

    const idWithoutExt = baseName.replace(/\.[^/.]+$/, '');
    dataEntries.push({ name, baseName, idWithoutExt, entry });
  }

  if (jsonFiles.length === 0 && dataEntries.length === 0) {
    throw new Error('هیچ فایل یا دیتایی در آرشیو فشرده ZIP یافت نشد. لطفاً ساختار زیپ را بررسی فرمایید.');
  }

  // Sort so session.json is processed first if present
  jsonFiles.sort((a, b) => {
    const aName = a.name.split('/').pop()?.toLowerCase() || '';
    const bName = b.name.split('/').pop()?.toLowerCase() || '';
    if (aName === 'session.json') return -1;
    if (bName === 'session.json') return 1;
    return 0;
  });

  const sessionObj: SessionJsonRoot = { sellers: [], buyers: [] };

  for (const jFile of jsonFiles) {
    try {
      const fileNameLower = jFile.name.toLowerCase();
      const isDedicatedBuyerFile = /buyer|kharidar|kharid|order|request|moshtari|خریدار|خرید|سفارش|مشتری|درخواست/i.test(fileNameLower);
      const isDedicatedSellerFile = /seller|forush|sale|froosh|فروش|فروشنده/i.test(fileNameLower);
      const sessionContent = await jFile.async('string');
      const parsed = JSON.parse(sessionContent);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item) continue;
          if (isDedicatedBuyerFile) {
            sessionObj.buyers = sessionObj.buyers || [];
            sessionObj.buyers.push(item);
          } else if (isDedicatedSellerFile) {
            sessionObj.sellers = sessionObj.sellers || [];
            sessionObj.sellers.push(item);
          } else if (isBuyerRecord(item)) {
            sessionObj.buyers = sessionObj.buyers || [];
            sessionObj.buyers.push(item);
          } else {
            sessionObj.sellers = sessionObj.sellers || [];
            sessionObj.sellers.push(item);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const extractedB = extractBuyersArray(parsed);
        const extractedS = extractSellersArray(parsed);

        if (isDedicatedBuyerFile) {
          sessionObj.buyers = sessionObj.buyers || [];
          sessionObj.buyers.push(...extractedB, ...extractedS);
        } else if (isDedicatedSellerFile) {
          sessionObj.sellers = sessionObj.sellers || [];
          sessionObj.sellers.push(...extractedS, ...extractedB);
        } else {
          sessionObj.buyers = sessionObj.buyers || [];
          sessionObj.buyers.push(...extractedB);
          sessionObj.sellers = sessionObj.sellers || [];
          sessionObj.sellers.push(...extractedS);
        }

        if (parsed.normalizationRules) {
          sessionObj.normalizationRules = sessionObj.normalizationRules || parsed.normalizationRules;
        }
      }
    } catch (err) {
      // A corrupt source JSON must stop the import; silently skipping it creates partial catalogues.
      throw new Error(`خواندن فایل JSON در ZIP ناموفق بود: ${jFile.name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Build lookup of known .txt item IDs and filenames from session.json
  // Because files in data/{id} inside the ZIP have no extension (e.g. "data/8218dd81-7326-4011-b0da-6bb8e3891edb"),
  // knowing which IDs correspond to ".txt" imageFileNames ensures their UTF-8 text is always extracted!
  const knownTxtIds = new Set<string>();
  const idToFileName = new Map<string, string>();
  const allRecords = [...(sessionObj.sellers || []), ...(sessionObj.buyers || [])];
  for (const rec of allRecords) {
    if (!rec) continue;
    const fName = (rec.imageFileName || rec.fileName || rec.نام_فایل || '').toString().trim();
    if (rec.id && fName) {
      idToFileName.set(String(rec.id).trim(), fName);
    }
    if (fName.toLowerCase().endsWith('.txt')) {
      if (rec.id) knownTxtIds.add(String(rec.id).trim());
      knownTxtIds.add(fName);
      knownTxtIds.add(fName.replace(/\.[^/.]+$/, ''));
    }
  }

  // Extract text files and image files from dataEntries
  for (const { name, baseName, idWithoutExt, entry } of dataEntries) {
    try {
      const lowerBase = baseName.toLowerCase();
      const bytes = await entry.async('uint8array');
      if (!bytes || bytes.length === 0) continue;

      // 1. Check binary magic headers for real binary images
      const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng =
        bytes.length >= 4 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      const isGif =
        bytes.length >= 3 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46;
      const isWebp =
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50;
      const isBmp = bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
      const hasImageMagic = isJpeg || isPng || isGif || isWebp || isBmp;
      const hasImageExt = /\.(jpg|jpeg|png|webp|svg|gif|bmp)$/i.test(lowerBase);
      const isExplicitTxt =
        lowerBase.endsWith('.txt') ||
        knownTxtIds.has(baseName) ||
        knownTxtIds.has(idWithoutExt);

      // 2. If it does not have binary image magic, test for text or base64
      let isTextFound = false;
      let textValue = '';
      let isBase64ImageFound = false;
      let base64ImageUrl = '';

      if (!hasImageMagic) {
        let rawStr = '';
        try {
          rawStr = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '').trim();
        } catch {}

        if (rawStr) {
          // Check A: Is it already a data:image/... URL?
          if (rawStr.startsWith('data:image/')) {
            isBase64ImageFound = true;
            base64ImageUrl = rawStr;
          }
          // Check B: Is it a data:text/... URL?
          else if (rawStr.startsWith('data:text/')) {
            const parts = rawStr.split(',');
            const payload = parts.slice(1).join(',');
            if (rawStr.includes(';base64,')) {
              try {
                const dec = typeof atob === 'function' ? decodeURIComponent(escape(atob(payload))) : Buffer.from(payload, 'base64').toString('utf8');
                textValue = dec.trim();
                isTextFound = true;
              } catch {
                textValue = payload;
                isTextFound = true;
              }
            } else {
              textValue = decodeURIComponent(payload);
              isTextFound = true;
            }
          }
          // Check C: Does rawStr start with standard image base64 headers?
          else if (rawStr.startsWith('/9j/')) {
            isBase64ImageFound = true;
            base64ImageUrl = `data:image/jpeg;base64,${rawStr.replace(/\s+/g, '')}`;
          } else if (rawStr.startsWith('iVBORw0KGgo')) {
            isBase64ImageFound = true;
            base64ImageUrl = `data:image/png;base64,${rawStr.replace(/\s+/g, '')}`;
          } else if (rawStr.startsWith('R0lGOD')) {
            isBase64ImageFound = true;
            base64ImageUrl = `data:image/gif;base64,${rawStr.replace(/\s+/g, '')}`;
          } else if (rawStr.startsWith('UklGR')) {
            isBase64ImageFound = true;
            base64ImageUrl = `data:image/webp;base64,${rawStr.replace(/\s+/g, '')}`;
          } else if (rawStr.startsWith('PHN2Zy') || rawStr.startsWith('PD94bW')) {
            isBase64ImageFound = true;
            base64ImageUrl = `data:image/svg+xml;base64,${rawStr.replace(/\s+/g, '')}`;
          }
          // Check D: Could rawStr be a base64-encoded UTF-8 text string or image?
          else if (rawStr.length >= 16 && /^[A-Za-z0-9+/=_\-\r\n\s]+$/.test(rawStr)) {
            try {
              const cleanB64 = rawStr.replace(/\s+/g, '');
              const decodedBuf =
                typeof atob === 'function'
                  ? Uint8Array.from(atob(cleanB64), (c) => c.charCodeAt(0))
                  : Buffer.from(cleanB64, 'base64');

              // Check if decodedBuf is a binary image
              if (decodedBuf.length >= 2 && decodedBuf[0] === 0xff && decodedBuf[1] === 0xd8) {
                isBase64ImageFound = true;
                base64ImageUrl = `data:image/jpeg;base64,${cleanB64}`;
              } else if (
                decodedBuf.length >= 4 &&
                decodedBuf[0] === 0x89 &&
                decodedBuf[1] === 0x50 &&
                decodedBuf[2] === 0x4e &&
                decodedBuf[3] === 0x47
              ) {
                isBase64ImageFound = true;
                base64ImageUrl = `data:image/png;base64,${cleanB64}`;
              } else {
                // Try decoding as UTF-8 text
                const decText = new TextDecoder('utf-8').decode(decodedBuf).trim();
                // Check if decoded text has no binary control characters
                if (decText && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(decText)) {
                  isTextFound = true;
                  textValue = decText;
                }
              }
            } catch {}
          }
          // Check E: Is rawStr plain readable text (UTF-8)?
          else if (
            isExplicitTxt ||
            /[\u0600-\u06FF]/.test(rawStr) ||
            (!hasImageExt && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(rawStr))
          ) {
            isTextFound = true;
            textValue = rawStr;
          }
        }
      }

      // Store text if found
      if (isTextFound && textValue) {
        textMap.set(idWithoutExt, textValue);
        textMap.set(baseName, textValue);
        const mappedFileName = idToFileName.get(idWithoutExt) || idToFileName.get(baseName);
        if (mappedFileName) {
          textMap.set(mappedFileName, textValue);
          textMap.set(mappedFileName.replace(/\.[^/.]+$/, ''), textValue);
        }
        continue;
      }

      // Store base64 image if detected from text
      if (isBase64ImageFound && base64ImageUrl) {
        imageMap.set(idWithoutExt, base64ImageUrl);
        imageMap.set(baseName, base64ImageUrl);
        const mappedFileName = idToFileName.get(idWithoutExt) || idToFileName.get(baseName);
        if (mappedFileName) {
          imageMap.set(mappedFileName, base64ImageUrl);
        }
        continue;
      }

      // 3. Otherwise treat as binary image (JPEG/PNG/WebP/GIF/SVG)
      if (name.startsWith('data/') || hasImageExt || hasImageMagic) {
        const ext = lowerBase.split('.').pop() || 'jpg';
        const mimeType =
          isPng || ext === 'png'
            ? 'image/png'
            : ext === 'svg'
            ? 'image/svg+xml'
            : isWebp || ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg';
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
        }
        const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;

        imageMap.set(idWithoutExt, dataUrl);
        imageMap.set(baseName, dataUrl);
        const mappedFileName = idToFileName.get(idWithoutExt) || idToFileName.get(baseName);
        if (mappedFileName) {
          imageMap.set(mappedFileName, dataUrl);
        }
      }
    } catch (err) {
      console.warn('Failed to extract entry from zip:', name, err);
    }
  }

  // Collect all IDs and filenames referenced by parsed JSON records
  const referencedKeys = new Set<string>();
  const allJsonItems = [...(sessionObj.sellers || []), ...(sessionObj.buyers || [])];
  for (const item of allJsonItems) {
    if (!item) continue;
    if (item.id) {
      const sId = String(item.id).trim().toLowerCase();
      referencedKeys.add(sId);
      referencedKeys.add(sId.replace(/\.[^/.]+$/, ''));
    }
    const fn = (item.imageFileName || item.fileName || item.نام_فایل || '').toString().trim().toLowerCase();
    if (fn) {
      referencedKeys.add(fn);
      referencedKeys.add(fn.replace(/\.[^/.]+$/, ''));
      const parts = fn.split('/');
      const baseFn = parts[parts.length - 1];
      referencedKeys.add(baseFn);
      referencedKeys.add(baseFn.replace(/\.[^/.]+$/, ''));
    }
  }

  // Detect any unreferenced standalone entries (e.g. buyer text requests or standalone photos)
  for (const { name, baseName, idWithoutExt } of dataEntries) {
    const bLower = baseName.toLowerCase();
    const idLower = idWithoutExt.toLowerCase();
    const nameLower = name.toLowerCase();

    const isReferenced =
      referencedKeys.has(bLower) ||
      referencedKeys.has(idLower) ||
      referencedKeys.has(nameLower);

    if (isReferenced) continue;

    // Check if this unreferenced entry has text or is an image
    const decodedText = textMap.get(idWithoutExt) || textMap.get(baseName) || '';
    const hasImage = imageMap.has(idWithoutExt) || imageMap.has(baseName);

    if (!decodedText && !hasImage) continue;

    const fullEntryContext = `${name} ${baseName} ${decodedText}`;
    const isBuyer =
      /buyer|kharidar|kharid|order|request|moshtari|خریدار|خرید|سفارش|مشتری|درخواست|بودجه|متقاضی|می‌خوام|میخوام/i.test(
        fullEntryContext
      );

    const standaloneRecord: any = {
      id: idWithoutExt || baseName,
      imageFileName: baseName,
      status: 'success',
      type: isBuyer ? 'buy_request' : 'sale',
    };

    if (decodedText) {
      standaloneRecord.متن = decodedText;
      standaloneRecord.توضیحات = decodedText;
    }

    if (isBuyer) {
      sessionObj.buyers = sessionObj.buyers || [];
      sessionObj.buyers.push(standaloneRecord);
    } else {
      sessionObj.sellers = sessionObj.sellers || [];
      sessionObj.sellers.push(standaloneRecord);
    }
  }

  const batchName = customBatchName || (file && 'name' in file && typeof (file as any).name === 'string' ? (file as any).name : 'بسته فایل زیپ');
  const sourceRecordsCount =
    (sessionObj.sellers || []).filter(Boolean).length +
    (sessionObj.buyers || []).filter(Boolean).length;
  const result = parseSessionJson(sessionObj, imageMap, textMap, batchName);
  const skippedRecordsCount = Math.max(0, sourceRecordsCount - result.listings.length);

  if (skippedRecordsCount > 0 || result.errorsCount > 0) {
    throw new Error(
      `پردازش ZIP کامل نبود؛ ${sourceRecordsCount} رکورد منبع شناسایی شد اما ${result.listings.length} رکورد قابل ثبت بود و ${skippedRecordsCount} رکورد رد شد. هیچ داده‌ای جایگزین نشد.`
    );
  }

  return {
    ...result,
    sourceRecordsCount,
    skippedRecordsCount,
    extractedImagesCount: imageMap.size,
  };
}

/**
 * Parses CSV export files (sellers or buyers)
 */
export function parseCarCsv(csvContent: string, customBatchName = 'فایل CSV'): CarListing[] {
  const cleaned = csvContent.replace(/^\uFEFF/, '').trim();
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const isBuyer = header.some((h) => h.includes('مشتری') || h.includes('بودجه'));

  const listings: CarListing[] = [];
  const now = Date.now();
  const currentDateFa = new Date().toLocaleDateString('fa-IR');

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (row.length < 3) continue;

    if (isBuyer) {
      const customer = row[0] || 'مشتری';
      const carName = row[1] || 'خودرو درخواستی';
      const year = parseCarYear(row[2]);
      const color = row[3] || 'توافقی';
      const budget = parseNumericValue(row[4]);
      const notes = row[5] || '';
      const phone = extractIranianPhone(customer, row[0], row[5], row[1], row[3]);

      const listing: CarListing = {
        id: `csv-buyer-${i}`,
        type: 'buy_request',
        title: year > 0 ? `خریدار ${carName} - مدل ${toPersianDigits(year)}` : `خریدار ${carName}`,
        brand: detectBrand(carName),
        model: carName,
        year,
        hasExplicitYear: year > 0,
        price: budget,
        priceFormatted: budget > 0 ? formatTomanPrice(budget) : 'بودجه توافقی',
        mileage: 0,
        mileageFormatted: 'مهم نیست',
        color,
        gearbox: 'اتوماتیک',
        bodyCondition: 'سالم',
        fuelType: 'بنزین',
        city: 'تهران',
        phoneNumber: phone,
        description: notes,
        fileDescription: notes,
        isTextOnly: true,
        importBatchName: customBatchName,
        importDate: currentDateFa,
        createdAt: new Date(now - i * 3600000).toISOString(),
        imageThumbnailBase64: createCarPlaceholder('#059669', carName, false),
        imageFullBase64: createCarPlaceholder('#059669', carName, true),
      };
      listing._searchIndex = buildSearchIndex(listing);
      listings.push(listing);
    } else {
      const carName = row[1] || 'خودرو فروشی';
      const year = parseCarYear(row[2]);
      const color = row[3] || 'سفید';
      const mileage = parseNumericValue(row[4]);
      const price = parseNumericValue(row[5]);
      const seller = row[6] || 'فروشنده';
      const filename = row[7] || '';
      const phone = extractIranianPhone(seller, filename, row[6], row[7], row[0], row[1]);

      const attrs = extractCarAttributes(filename, color);
      const fileDescription = extractCleanFileDescription(filename, color, attrs.notes);

      const listing: CarListing = {
        id: `csv-seller-${i}`,
        type: 'sale',
        title: year > 0 ? `${carName} - مدل ${toPersianDigits(year)}` : carName,
        brand: detectBrand(carName),
        model: carName,
        year,
        hasExplicitYear: year > 0,
        price: price,
        priceFormatted: price > 0 ? formatTomanPrice(price) : 'توافقی',
        mileage,
        mileageFormatted: mileage > 0 ? `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر` : 'کارشناسی نشده',
        color,
        gearbox: attrs.gearbox,
        bodyCondition: attrs.bodyCondition,
        fuelType: 'بنزین',
        city: 'تهران',
        phoneNumber: phone,
        description: fileDescription,
        fileDescription,
        isTextOnly: filename.endsWith('.txt'),
        importBatchName: customBatchName,
        importDate: currentDateFa,
        createdAt: new Date(now - i * 3600000).toISOString(),
        imageThumbnailBase64: createCarPlaceholder(attrs.colorHex, carName, false),
        imageFullBase64: createCarPlaceholder(attrs.colorHex, carName, true),
      };
      listing._searchIndex = buildSearchIndex(listing);
      listings.push(listing);
    }
  }

  return listings;
}
