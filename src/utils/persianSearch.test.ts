import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePersianText,
  buildSearchIndex,
  tokenizeSearchQuery,
  matchesSearchTokens,
  filterCarListings,
} from './persianSearch';
import { CarListing, FilterOptions } from '../types/car';

test('normalizePersianText converts Arabic characters to Persian equivalents', () => {
  assert.equal(normalizePersianText('پژو ٢٠٦ تيپ ٥'), 'پژو 206 تیپ 5');
  assert.equal(normalizePersianText('كوييك كراس'), 'کوییک کراس');
  assert.equal(normalizePersianText('پراید ۱۱۱ سفید'), 'پراید 111 سفید');
  assert.equal(normalizePersianText('دنا پلاس اتوماتيك'), 'دنا پلاس اتوماتیک');
  assert.equal(normalizePersianText('بنزين با نيم‌فاصله'), 'بنزین با نیم فاصله');
});

test('normalizePersianText handles diacritics and excessive whitespace', () => {
  assert.equal(normalizePersianText('تِستْ   فَضَاءِ   خَالِی'), 'تست فضاء خالی');
});

test('tokenizeSearchQuery returns normalized search tokens', () => {
  const tokens = tokenizeSearchQuery('پژو  ۲۰۶   سفید');
  assert.deepEqual(tokens, ['پژو', '206', 'سفید']);
});

test('matchesSearchTokens handles order-independent multi-word search', () => {
  const index = 'پژو 206 تیپ 2 سفید 1400 بدون رنگ تهران';
  assert.equal(matchesSearchTokens(index, ['206', 'پژو']), true);
  assert.equal(matchesSearchTokens(index, ['سفید', 'تهران', '206']), true);
  assert.equal(matchesSearchTokens(index, ['پراید']), false);
});

test('filterCarListings filters 5,000 items in sub-50ms', () => {
  // Generate 5,000 mock listings
  const listings: CarListing[] = [];
  const brands = ['پژو', 'سایپا', 'ایران خودرو', 'مدیران خودرو', 'بهمن موتور'];

  for (let i = 0; i < 5000; i++) {
    const is206 = i % 5 === 0;
    const title = is206 ? `پژو ۲۰۶ تیپ ۲ مدل ۱۴۰${i % 4}` : `خودرو آزمایشی ${i}`;
    const listing: CarListing = {
      id: `car-${i}`,
      type: i % 4 === 0 ? 'buy_request' : 'sale',
      title,
      brand: brands[i % brands.length],
      model: is206 ? '۲۰۶' : 'مدل دیگر',
      year: 1400 + (i % 4),
      price: 350_000_000 + (i * 10000) % 500_000_000,
      priceFormatted: '۴۰۰,۰۰۰,۰۰۰ تومان',
      mileage: 45000,
      mileageFormatted: '۴۵,۰۰۰ کیلومتر',
      color: 'سفید',
      gearbox: 'دنده‌ای',
      bodyCondition: 'بی‌رنگ',
      fuelType: 'بنزین',
      city: i % 2 === 0 ? 'تهران' : 'مشهد',
      phoneNumber: '09123456789',
      description: 'بسیار تمیز، مصرفی‌ها تعویض شده',
      createdAt: new Date(Date.now() - (i % 3) * 86400000).toISOString(),
      imageThumbnailBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      imageFullBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    };
    listing._searchIndex = buildSearchIndex(listing);
    listings.push(listing);
  }

  const filters: FilterOptions = {
    type: 'sale',
    searchQuery: 'پژو 206',
    brand: '',
    priceRange: 'all',
    dayFilter: 'all',
    city: '',
  };

  const startTime = performance.now();
  const results = filterCarListings(listings, filters);
  const duration = performance.now() - startTime;

  assert.ok(results.length > 0, 'Should find 206 listings');
  assert.ok(duration < 50, `Filtering 5,000 listings took ${duration.toFixed(2)}ms (should be < 50ms)`);
});

test('buildSearchIndex indexes fileDescription, imageFileName, phone variants, and car synonyms', () => {
  const listing: CarListing = {
    id: 'test-1',
    type: 'sale',
    title: 'پژو پارس - مدل ۱۴۰۱',
    brand: 'ایران خودرو',
    model: 'پژو پارس',
    year: 1401,
    price: 550_000_000,
    priceFormatted: '۵۵۰,۰۰۰,۰۰۰ تومان',
    mileage: 40000,
    mileageFormatted: '۴۰,۰۰۰ کیلومتر',
    color: 'سفید',
    gearbox: 'دنده‌ای',
    bodyCondition: 'بی‌رنگ',
    fuelType: 'بنزین',
    city: 'تهران',
    phoneNumber: '09121769442',
    description: 'پارس سال سفید بی رنگ (کد: 1268)',
    fileDescription: 'پارس سال سفید بی رنگ پشت آمپر جدید (کد: 1268)',
    imageFileName: '989121769442_1268_پارس_سال_سفید_بی_رنگ_پشت_آمپر_جدید.jpg',
    createdAt: new Date().toISOString(),
    imageThumbnailBase64: '',
    imageFullBase64: '',
  };
  listing._searchIndex = buildSearchIndex(listing);

  // Match by fileDescription caption
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('پشت آمپر جدید')), true);
  // Match by synonym (پرشیا -> پارس)
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('پرشیا')), true);
  // Match by space-insensitive query (بیرنگ -> بی رنگ)
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('بیرنگ')), true);
  // Match by 09... phone or 989... phone or 4-digit code
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('09121769442')), true);
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('989121769442')), true);
  assert.equal(matchesSearchTokens(listing._searchIndex, tokenizeSearchQuery('1268')), true);
});
