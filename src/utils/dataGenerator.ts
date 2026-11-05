import { CarListing, CarListingType } from '../types/car';
import { buildSearchIndex } from './persianSearch';
import { toPersianDigits, formatTomanPrice } from './dataPruner';

// Pre-generated optimized Base64 SVG vehicle illustrations by color & category
// This provides authentic Base64 image payload without massive multi-megabyte payloads that crash older mobile RAM.
function createCarSvgBase64(colorHex: string, modelName: string, isFull = false): string {
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
    
    <!-- Floor shadow -->
    <ellipse cx="${width * 0.5}" cy="${height * 0.76}" rx="${width * 0.42}" ry="${height * 0.08}" fill="#0f172a" fill-opacity="0.2" />

    <!-- Car Body Shape -->
    <g filter="url(#shadow)">
      <!-- Roof & Cabin -->
      <path d="M ${width * 0.28} ${height * 0.52} 
               C ${width * 0.34} ${height * 0.32}, ${width * 0.62} ${height * 0.30}, ${width * 0.72} ${height * 0.52} 
               Z" fill="#334155" />
      <!-- Windows Glass -->
      <path d="M ${width * 0.31} ${height * 0.50} 
               C ${width * 0.36} ${height * 0.35}, ${width * 0.60} ${height * 0.34}, ${width * 0.69} ${height * 0.50} 
               Z" fill="#93c5fd" opacity="0.85" />
      <!-- Window Divider -->
      <line x1="${width * 0.50}" y1="${height * 0.35}" x2="${width * 0.50}" y2="${height * 0.50}" stroke="#1e293b" stroke-width="${isFull ? 4 : 2}"/>

      <!-- Main Lower Chassis -->
      <path d="M ${width * 0.12} ${height * 0.62} 
               C ${width * 0.12} ${height * 0.52}, ${width * 0.20} ${height * 0.50}, ${width * 0.28} ${height * 0.52}
               L ${width * 0.72} ${height * 0.52}
               C ${width * 0.80} ${height * 0.52}, ${width * 0.88} ${height * 0.55}, ${width * 0.88} ${height * 0.64}
               C ${width * 0.88} ${height * 0.70}, ${width * 0.82} ${height * 0.72}, ${width * 0.76} ${height * 0.72}
               L ${width * 0.24} ${height * 0.72}
               C ${width * 0.16} ${height * 0.72}, ${width * 0.12} ${height * 0.68}, ${width * 0.12} ${height * 0.62} Z" 
               fill="${colorHex}" stroke="${strokeColor}" stroke-width="${isFull ? 3 : 1.5}" />

      <!-- Headlights / Taillights -->
      <circle cx="${width * 0.84}" cy="${height * 0.58}" r="${isFull ? 10 : 3}" fill="#fef08a" />
      <circle cx="${width * 0.16}" cy="${height * 0.58}" r="${isFull ? 8 : 2.5}" fill="#ef4444" />

      <!-- Wheels Front & Rear -->
      <g>
        <!-- Rear Wheel -->
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.025}" fill="#0f172a"/>

        <!-- Front Wheel -->
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.07}" fill="#94a3b8"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.025}" fill="#0f172a"/>
      </g>
    </g>

    <!-- Brand Stylized Accent Bar -->
    <rect x="${width * 0.42}" y="${height * (isFull ? 0.90 : 0.88)}" 
          width="${width * 0.16}" height="${isFull ? 4 : 2}" 
          rx="${isFull ? 2 : 1}" fill="#94a3b8" />
  </svg>`;

  // Base64 encoding via browser/node safe method
  if (typeof btoa === 'function') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// Color palette with Persian names and matching hex
const CAR_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'سفید', hex: '#f8fafc' },
  { name: 'مشکی متالیک', hex: '#0f172a' },
  { name: 'خاکستری متالیک', hex: '#64748b' },
  { name: 'نقره‌ای', hex: '#cbd5e1' },
  { name: 'دلفینی', hex: '#475569' },
  { name: 'قرمز رژ', hex: '#dc2626' },
  { name: 'آبی کاسپین', hex: '#1d4ed8' },
  { name: 'نوک‌مدادی', hex: '#334155' },
  { name: 'سربی متالیک', hex: '#94a3b8' },
  { name: 'عنابی', hex: '#831843' },
];

interface CarTemplate {
  brand: string;
  model: string;
  titleVariants: string[];
  basePrice: number;
  gearbox: 'دنده‌ای' | 'اتوماتیک';
  years: number[];
  category: 'سدان' | 'هاچبک' | 'شاسی‌بلند' | 'وانت';
}

const CAR_TEMPLATES: CarTemplate[] = [
  {
    brand: 'ایران خودرو',
    model: 'پژو ۲۰۶ تیپ ۲',
    titleVariants: ['پژو ۲۰۶ تیپ ۲ تمیز و خانگی', 'پژو 206 تیپ 2 بی‌رنگ', 'پژو ۲۰۶ تیپ ۲ فرانسوی'],
    basePrice: 420_000_000,
    gearbox: 'دنده‌ای',
    years: [1398, 1399, 1400, 1401],
    category: 'هاچبک',
  },
  {
    brand: 'ایران خودرو',
    model: 'پژو ۲۰۶ تیپ ۵',
    titleVariants: ['پژو ۲۰۶ تیپ ۵ فول TU5', 'پژو 206 تیپ 5 موتور پلمپ', 'پژو ۲۰۶ تیپ ۵ شتاب عالی'],
    basePrice: 490_000_000,
    gearbox: 'دنده‌ای',
    years: [1397, 1398, 1399],
    category: 'هاچبک',
  },
  {
    brand: 'ایران خودرو',
    model: 'پژو ۲۰۷ دنده‌ای',
    titleVariants: ['پژو ۲۰۷ دنده‌ای پانوراما', 'پژو 207 دنده‌ای هیدرولیک', 'پژو ۲۰۷ سقف شیشه‌ای'],
    basePrice: 650_000_000,
    gearbox: 'دنده‌ای',
    years: [1401, 1402, 1403],
    category: 'هاچبک',
  },
  {
    brand: 'ایران خودرو',
    model: 'پژو ۲۰۷ اتوماتیک',
    titleVariants: ['پژو ۲۰۷ اتوماتیک سقف قرمز MC', 'پژو 207 اتوماتیک TU5 پلاس', 'پژو ۲۰۷ اتومات ۶ سرعته'],
    basePrice: 830_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'هاچبک',
  },
  {
    brand: 'ایران خودرو',
    model: 'پژو پارس سال TU5',
    titleVariants: ['پژو پارس سال TU5 بدون رنگ', 'پارس TU5 گاز سیمی سفارشی', 'پژو پارس موتور جدید'],
    basePrice: 680_000_000,
    gearbox: 'دنده‌ای',
    years: [1400, 1401, 1402],
    category: 'سدان',
  },
  {
    brand: 'ایران خودرو',
    model: 'دنا پلاس توربو اتوماتیک',
    titleVariants: ['دنا پلاس توربو اتوماتیک آپشنال', 'دنا پلاس توربو ۶ سرعته', 'دنا پلاس اتومات صفر کیلومتر'],
    basePrice: 940_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'سدان',
  },
  {
    brand: 'ایران خودرو',
    model: 'تارا اتوماتیک',
    titleVariants: ['تارا اتوماتیک V4 فول آپشن', 'تارا اتوماتیک V2 گارانتی فعال', 'تارا اتومات با سانروف'],
    basePrice: 920_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'سدان',
  },
  {
    brand: 'ایران خودرو',
    model: 'هایما S7 توربو پلاس',
    titleVariants: ['هایما S7 توربو پلاس بدون خط', 'هایما اس ۷ صفر خشک', 'هایما S7 اتومات خانگی'],
    basePrice: 1_650_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'سایپا',
    model: 'پراید ۱۱۱',
    titleVariants: ['پراید ۱۱۱ مدل ۹۷ تمیز', 'پراید 111 سفید هیدرولیک ABS', 'پراید ۱۱۱ فنی به شرط کارشناس'],
    basePrice: 280_000_000,
    gearbox: 'دنده‌ای',
    years: [1395, 1396, 1397, 1398, 1399],
    category: 'هاچبک',
  },
  {
    brand: 'سایپا',
    model: 'پراید ۱۳۱',
    titleVariants: ['پراید ۱۳۱ SE تک سوز', 'پراید 131 دوگانه کارخانه', 'پراید ۱۳۱ کم کارکرد و بیرنگ'],
    basePrice: 250_000_000,
    gearbox: 'دنده‌ای',
    years: [1395, 1396, 1397, 1398, 1399],
    category: 'سدان',
  },
  {
    brand: 'سایپا',
    model: 'کوییک R',
    titleVariants: ['کوییک R دو رنگ پارس خودرویی', 'کوییک آر سفید قرمز کم‌کار', 'کوییک R مدل ۱۴۰۲ بدون رنگ'],
    basePrice: 410_000_000,
    gearbox: 'دنده‌ای',
    years: [1400, 1401, 1402, 1403],
    category: 'هاچبک',
  },
  {
    brand: 'سایپا',
    model: 'کوییک اتوماتیک',
    titleVariants: ['کوییک اتوماتیک پلاس با کروز', 'کوییک اتوماتیک CVT کم‌مصرف', 'کوییک اتومات مدل ۱۴۰۱'],
    basePrice: 510_000_000,
    gearbox: 'اتوماتیک',
    years: [1400, 1401, 1402],
    category: 'هاچبک',
  },
  {
    brand: 'سایپا',
    model: 'شاهین G',
    titleVariants: ['شاهین G سانروف دار', 'شاهین جی مدل ۱۴۰۲ گارانتی فعال', 'شاهین G توربو مشکی'],
    basePrice: 690_000_000,
    gearbox: 'دنده‌ای',
    years: [1401, 1402, 1403],
    category: 'سدان',
  },
  {
    brand: 'سایپا',
    model: 'تیبا ۲',
    titleVariants: ['تیبا ۲ هاچبک EX', 'تیبا 2 سالم و بدون رنگ', 'تیبا دو خانگی لاستیک نو'],
    basePrice: 320_000_000,
    gearbox: 'دنده‌ای',
    years: [1398, 1399, 1400, 1401],
    category: 'هاچبک',
  },
  {
    brand: 'سایپا',
    model: 'ساینا S',
    titleVariants: ['ساینا S دنده‌ای استاندارد ۸۵گانه', 'ساینا اس مدل ۱۴۰۲ بدون رنگ', 'ساینا S بنزینی بسیار تمیز'],
    basePrice: 425_000_000,
    gearbox: 'دنده‌ای',
    years: [1401, 1402, 1403],
    category: 'سدان',
  },
  {
    brand: 'مدیران خودرو',
    model: 'ام‌وی‌ام X22 پرو',
    titleVariants: ['ام‌وی‌ام X22 پرو توربو اتوماتیک', 'MVM X22 Pro سانروف و مانیتور', 'ام وی ام ایکس ۲۲ پرو صفر'],
    basePrice: 980_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'بهمن موتور',
    model: 'فیدلیتی پرایم',
    titleVariants: ['فیدلیتی پرایم ۷ نفره رینگ جدید', 'فیدلیتی پرایم ۵ نفره مشکی', 'فیدلیتی گیربکس دوکلاچه تر'],
    basePrice: 1_850_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'بهمن موتور',
    model: 'دیگنیتی پرایم',
    titleVariants: ['دیگنیتی پرایم سفید تریم مارون', 'دیگنیتی مشکی بدون رنگ و خط', 'دیگنیتی پرایم فول'],
    basePrice: 1_920_000_000,
    gearbox: 'اتوماتیک',
    years: [1401, 1402, 1403],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'کرمان موتور',
    model: 'جک S5 توربو',
    titleVariants: ['جک S5 توربو نیوفیس موتور ۱۵۰۰', 'جک اس ۵ اتومات ۲۰۰۰ بدون رنگ', 'جک S5 قهوه‌ای متالیک تمیز'],
    basePrice: 1_450_000_000,
    gearbox: 'اتوماتیک',
    years: [1399, 1400, 1401, 1402],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'هیوندای',
    model: 'هیوندای سانتافه',
    titleVariants: ['هیوندای سانتافه ۲۰۱۶ فول گرند', 'سانتافه نیوفیس اتوپارک ۵ کلید', 'هیوندای سانتافه سفید شرکتی'],
    basePrice: 3_800_000_000,
    gearbox: 'اتوماتیک',
    years: [1395, 1396, 1397],
    category: 'شاسی‌بلند',
  },
  {
    brand: 'رنو',
    model: 'تندر ۹۰ E2',
    titleVariants: ['رنو تندر ۹۰ E2 فول پارس خودرو', 'ال ۹۰ مدل ۹۵ بدون رنگ', 'تندر 90 فرانسه بسیار تمیز'],
    basePrice: 560_000_000,
    gearbox: 'دنده‌ای',
    years: [1394, 1395, 1396, 1397, 1398],
    category: 'سدان',
  },
];

const CITIES = [
  'تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'کرج',
  'اهواز', 'قم', 'رشت', 'ساری', 'ارومیه', 'کرمانشاه',
  'یزد', 'قزوین', 'کرمان', 'همدان', 'زنجان', 'بوشهر'
];

const BODY_CONDITIONS = [
  'بی‌رنگ، بدون تصادف و شاسی‌ها پلمپ به شرط',
  'بی‌رنگ، فقط دارای خط و خش بسیار جزئی لیسه‌گیری‌شده',
  'یک لکه رنگ روی گلگیر سمت شاگرد، شاسی جلو و عقب سالم',
  'دو لکه رنگ دور طوق گلگیر، بدون ضربه و تصادف',
  'کاپوت استوک کارخانه‌ای تعویض، شاسی‌ها بدون ضربه',
  'بدنه کاملاً بیرنگ، سرامیک ۵ ساله اجرا شده، در حد صفر',
];

const BUY_REQUEST_DESCRIPTIONS = [
  'خریدار نقدی فوری و تسویه در لحظه، خودرو حتماً بی‌رنگ و شاسی سالم باشد.',
  'جهت مصرف شخصی خریدارم، کارکرد زیر ۵۰ هزار و شاسی‌ها بدون ضربه باشد.',
  'خریدار واقعی با بودجه مشخص، آماده تعویض پلاک فوری در همان روز.',
  'درخواست خرید نقدی این مدل، ترجیحاً رنگ سفید یا مشکی، لطفاً مشخصات را پیام دهید.',
];

const SALE_DESCRIPTIONS = [
  'ماشین بسیار تمیز و خانگی، تمامی سرویس‌های دوره‌ای از جمله روغن، فیلترها و لنت‌ها هفته گذشته در نمایندگی مجاز تعویض شده است. مناسب مصرف‌کننده محترم.',
  'سند تک‌برگ از ابتدا دست خودم بوده، فنی و موتور کاملاً پلمپ و پرشتاب، لاستیک‌ها ۸۵ درصد کره‌ای، زاپاس زیرش نرفته. فروش فقط نقدی یا معاوضه با خودرو سبکتر.',
  'بدون کوچکترین تصادف و رنگ‌شدگی، به شرط برگه کارشناسی معتبر عبادی و رنگین، کولر و بخاری عالی، آماده مسافرت، تخفیف جزیی فقط پای معامله.',
  'فوق‌العاده تمیز و خوش‌رخ، دارای روکش چرم درجه یک، کفپوش پنج‌بعدی، دزدگیر تصویری و مانیتور اندروید. بیمه بدنه و شخص ثالث تا انتهای سال معتبر است.',
];

/**
 * Pre-computes base64 images for popular color-model combinations
 * to avoid regenerating Base64 strings repeatedly and save massive memory.
 */
const cachedThumbnails = new Map<string, string>();
const cachedFullImages = new Map<string, string>();

function getOrGenerateImage(colorHex: string, modelName: string, isFull: boolean): string {
  const cacheKey = `${colorHex}_${modelName}_${isFull ? 'F' : 'T'}`;
  const cache = isFull ? cachedFullImages : cachedThumbnails;
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, createCarSvgBase64(colorHex, modelName, isFull));
  }
  return cache.get(cacheKey)!;
}

/**
 * Deterministically generates ~5,000 realistic Iranian car ads
 * distributed within the last 4 days.
 */
export function generateRealisticCarListings(count = 5000): CarListing[] {
  const listings: CarListing[] = [];
  const now = Date.now();
  const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const template = CAR_TEMPLATES[i % CAR_TEMPLATES.length];
    const colorObj = CAR_COLORS[(i * 3 + 1) % CAR_COLORS.length];
    const isBuyRequest = i % 4 === 0; // 25% buy requests, 75% for sale
    const type: CarListingType = isBuyRequest ? 'buy_request' : 'sale';

    const year = template.years[i % template.years.length];
    const city = CITIES[(i * 7) % CITIES.length];

    // Price variation ±15%
    const priceFactor = 0.85 + ((i * 13) % 31) / 100;
    const price = Math.round((template.basePrice * priceFactor) / 10_000_000) * 10_000_000;
    const priceFormatted = formatTomanPrice(price);

    // Mileage
    const mileage = isBuyRequest ? 0 : Math.round(15000 + ((i * 29) % 110000));
    const mileageFormatted = isBuyRequest ? 'مهم نیست' : `${toPersianDigits(mileage.toLocaleString('en-US'))} کیلومتر`;

    // Distributed timestamps within last 3.9 days (so all 5,000 are valid active ads)
    // with heavy concentration on today and yesterday
    const ageOffset = (i / count) * (FOUR_DAYS_MS * 0.95);
    const createdAt = new Date(now - ageOffset).toISOString();

    const titlePrefix = isBuyRequest ? 'خریدار فوری ' : '';
    const titleVariant = template.titleVariants[i % template.titleVariants.length];
    const title = `${titlePrefix}${titleVariant} مدل ${toPersianDigits(year)}`;

    const bodyCondition = BODY_CONDITIONS[i % BODY_CONDITIONS.length];
    const descArray = isBuyRequest ? BUY_REQUEST_DESCRIPTIONS : SALE_DESCRIPTIONS;
    const description = `${descArray[i % descArray.length]} (تماس فقط خریدار واقعی)`;

    const phonePrefixes = ['0912', '0919', '0935', '0936', '0913', '0915', '0930'];
    const prefix = phonePrefixes[i % phonePrefixes.length];
    const randomSuffix = String(1000000 + ((i * 3821) % 8999999)).slice(0, 7);
    const phoneNumber = `${prefix}${randomSuffix}`;

    const thumbnail = getOrGenerateImage(colorObj.hex, template.model, false);
    const fullImage = getOrGenerateImage(colorObj.hex, template.model, true);

    const fileDescription = isBuyRequest
      ? `${template.model} ${toPersianDigits(year)} - خریدار نقدی فوری`
      : `${template.model} ${colorObj.name} ${bodyCondition.slice(0, 32)}`;

    const isTextOnly = isBuyRequest && (i % 4 === 0);

    const listing: CarListing = {
      id: `car-${i + 1}`,
      type,
      title,
      brand: template.brand,
      model: template.model,
      year,
      price,
      priceFormatted,
      mileage,
      mileageFormatted,
      color: colorObj.name,
      gearbox: template.gearbox,
      bodyCondition,
      fuelType: i % 7 === 0 ? 'دوگانه‌سوز' : 'بنزین',
      city,
      phoneNumber,
      description,
      fileDescription,
      isTextOnly,
      createdAt,
      imageThumbnailBase64: thumbnail,
      imageFullBase64: fullImage,
    };

    // Pre-calculate search index
    listing._searchIndex = buildSearchIndex(listing);
    listings.push(listing);
  }

  return listings;
}
