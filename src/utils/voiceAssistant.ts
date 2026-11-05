import { normalizePersianText } from './persianSearch';
import { parseCarYear, extractCarAttributes, formatIranianPhone, detectBrand } from './sellerDataParser';
import { parseNumericValue } from './sessionDataParser';
import { toPersianDigits, formatTomanPrice } from './dataPruner';

export interface VoiceSearchResult {
  rawTranscript: string;
  normalizedQuery: string;
  detectedCarName?: string;
  detectedYears: number[];
  summaryMessage: string;
}

export interface VoiceRegistrationResult {
  rawTranscript: string;
  type: 'sale' | 'buy_request';
  carName: string;
  year: number;
  price: number;
  priceFormatted: string;
  color: string;
  mileage: number;
  mileageFormatted: string;
  bodyCondition: string;
  phoneNumber: string;
  description: string;
  confidence: 'high' | 'medium';
}

/**
 * Parses spoken voice query for search (e.g. "یه ۲۰۶ تیپ ۲ مدل ۴۰۰ ۴۰۱ این طوری می‌خوام")
 * Completely deterministic - never hallucinates or skips matching cars.
 */
export function parseVoiceSearchQuery(transcript: string): VoiceSearchResult {
  const normalized = normalizePersianText(transcript);

  // Extract years (e.g. 400, 401, 1400, 1401, 1398, 98, 2020)
  const detectedYears: number[] = [];
  const yearMatches = normalized.match(/(?:مدل\s*)?(\d{2,4})/g);
  if (yearMatches) {
    for (const match of yearMatches) {
      const digits = match.replace(/[^\d]/g, '');
      const parsedYear = parseCarYear(digits);
      if (parsedYear && !detectedYears.includes(parsedYear)) {
        detectedYears.push(parsedYear);
      }
    }
  }

  // Common car models and variants (with and without prefix)
  const KNOWN_MODELS = [
    'پژو ۲۰۶ تیپ ۲',
    '۲۰۶ تیپ ۲',
    'پژو ۲۰۶ تیپ ۵',
    '۲۰۶ تیپ ۵',
    'پژو ۲۰۶',
    '۲۰۶',
    'پژو ۲۰۷',
    '۲۰۷',
    'پژو پارس',
    'پارس',
    'دنا پلاس توربو',
    'دنا پلاس',
    'دنا',
    'تارا اتوماتیک',
    'تارا دنده‌ای',
    'تارا',
    'کوییک R',
    'کوییک',
    'شاهین',
    'پراید ۱۱۱',
    '۱۱۱',
    'پراید ۱۳۱',
    '۱۳۱',
    'پراید',
    'تیبا ۲',
    'تیبا',
    'ساینا S',
    'ساینا',
    'هایما S7',
    'هایما',
    'جک S5',
    'جک',
    'فیدلیتی',
    'دیگنیتی',
    'چانگان',
    'تویوتا کمری',
    'تویوتا پرادو',
    'هیوندای سانتافه',
    'هیوندای سوناتا',
    'زانتیا',
    'ماکسیما',
  ];

  let detectedCarName = '';
  for (const model of KNOWN_MODELS) {
    const normModel = normalizePersianText(model);
    if (normalized.includes(normModel)) {
      detectedCarName = model;
      break;
    }
  }

  // Build clean search keywords for internal search engine
  const searchKeywords: string[] = [];
  if (detectedCarName) {
    searchKeywords.push(detectedCarName);
  } else {
    // If no exact known model, strip filler phrases like "میخوام", "دنبال", "یه"
    const cleaned = normalized
      .replace(/یه|یک|دنبال|میخوام|می خواهم|این طورا|اینطورا|باشه|هستم/g, '')
      .trim();
    if (cleaned) searchKeywords.push(cleaned);
  }

  // If specific single year found, append to search query
  if (detectedYears.length === 1) {
    searchKeywords.push(detectedYears[0].toString());
  }

  const query = searchKeywords.join(' ');

  let summaryMessage = '';
  if (detectedCarName && detectedYears.length > 0) {
    summaryMessage = `${detectedCarName} - مدل ${detectedYears.map((y) => toPersianDigits(y)).join(' یا ')}`;
  } else if (detectedCarName) {
    summaryMessage = detectedCarName;
  } else {
    summaryMessage = query || transcript;
  }

  return {
    rawTranscript: transcript,
    normalizedQuery: query || normalized,
    detectedCarName,
    detectedYears,
    summaryMessage,
  };
}

/**
 * Parses spoken voice for adding a car ad (e.g. "یه چانگان مدل ۹۸ سفید بیرنگ کارکرد ۸۰ تا دارم قیمت ۹۰۰ میلیون شماره تماس ۰۹۱۲۳۴۵۶۷۸۹")
 */
export function parseVoiceAdRegistration(
  transcript: string,
  defaultType: 'sale' | 'buy_request' = 'sale'
): VoiceRegistrationResult {
  const normalized = normalizePersianText(transcript);

  // Determine if it is a buy request or sale
  let type: 'sale' | 'buy_request' = defaultType;
  if (/خریدارم|میخوام بخرم|خریدار|درخواست خرید|دنبال خرید/.test(normalized)) {
    type = 'buy_request';
  } else if (/فروشی|دارم|میفروشم|برای فروش/.test(normalized)) {
    type = 'sale';
  }

  // Extract phone number
  const phoneMatch = normalized.match(/09\d{9}|989\d{9}|9\d{9}/);
  const phoneNumber = phoneMatch ? formatIranianPhone(phoneMatch[0]) : '';

  // Extract year (0 if not spoken — never guess 1402)
  const yearMatch = normalized.match(/مدل\s*(\d{2,4})/);
  const year = yearMatch ? parseCarYear(yearMatch[1]) : 0;

  // Extract price (e.g. "قیمت ۹۰۰ میلیون", "۸۰۰ میلیون تومان", "۱ میلیارد و دویست")
  let price = 0;
  const priceMatch = normalized.match(/(?:قیمت\s*)?(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|همت|تومان)/);
  if (priceMatch) {
    const rawVal = parseFloat(priceMatch[1]);
    const unit = priceMatch[2];
    if (unit === 'میلیارد' || unit === 'همت') {
      price = Math.round(rawVal * 1_000_000_000);
    } else {
      // میلیون or تومان
      price = Math.round(rawVal * 1_000_000);
    }
  } else {
    // Check if plain number exists after قیمت
    const directPriceMatch = normalized.match(/قیمت\s*(\d{6,})/);
    if (directPriceMatch) {
      price = parseInt(directPriceMatch[1], 10);
    }
  }
  const priceFormatted = price > 0 ? formatTomanPrice(price) : 'توافقی';

  // Extract mileage
  const mileageMatch = normalized.match(/(\d+)\s*تا\s*کار/);
  const mileage = mileageMatch ? parseInt(mileageMatch[1], 10) * 1000 : 0;
  const mileageFormatted = mileage > 0 ? `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر` : 'کارشناسی نشده';

  // Extract attributes (color, body condition, gearbox)
  const attrs = extractCarAttributes(normalized, '');

  // Extract car name (remove filler phrases)
  const cleanedText = normalized
    .replace(/09\d{9}|989\d{9}/g, '')
    .replace(/مدل\s*\d{2,4}/g, '')
    .replace(/\d+\s*تا\s*کار/g, '')
    .replace(/\d+\s*(?:میلیون|میلیارد|تومان)/g, '')
    .replace(/یه|یک|دارم|فروشی|میفروشم|خریدارم|میخوام|قیمت|شماره تماس/g, '')
    .trim();

  // Try matching known brands or use the cleaned first words
  let carName = 'خودرو اعلامی';
  const KNOWN_CARS = [
    'پژو ۲۰۶',
    'پژو ۲۰۷',
    'پژو پارس',
    'تارا',
    'دنا پلاس',
    'دنا',
    'کوییک',
    'شاهین',
    'پراید',
    'تیبا',
    'ساینا',
    'چانگان',
    'هایما',
    'جک',
    'تویوتا کمری',
    'سانتافه',
    'زانتیا',
    'ماکسیما',
  ];

  for (const car of KNOWN_CARS) {
    if (normalized.includes(normalizePersianText(car))) {
      carName = car;
      break;
    }
  }

  if (carName === 'خودرو اعلامی' && cleanedText) {
    const words = cleanedText.split(' ').filter(Boolean);
    if (words.length > 0) {
      carName = words.slice(0, 3).join(' ');
    }
  }

  return {
    rawTranscript: transcript,
    type,
    carName,
    year,
    price,
    priceFormatted,
    color: attrs.color,
    mileage,
    mileageFormatted,
    bodyCondition: attrs.bodyCondition,
    phoneNumber,
    description: transcript,
    confidence: carName !== 'خودرو اعلامی' ? 'high' : 'medium',
  };
}
