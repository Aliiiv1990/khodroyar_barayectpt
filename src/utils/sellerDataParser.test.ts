import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSellersJson,
  parseListingFileName,
  formatIranianPhone,
  extractIranianPhone,
  parseCarYear,
  detectBrand,
} from './sellerDataParser';

test('parseListingFileName extracts phone from start, separates it from caption, and detects .txt', () => {
  // 1. Image filename with long caption after <phone>_<random4DigitCode>_
  const imgWithCaption = parseListingFileName(
    '989121769442_1268_۲۰۷_پانا_۴۰۳_سفید_۴۰_تا_کار._اتومات.jpg'
  );
  assert.equal(imgWithCaption.phoneNumber, '09121769442');
  assert.equal(imgWithCaption.randomCode, '1268');
  assert.equal(imgWithCaption.caption, '۲۰۷ پانا ۴۰۳ سفید ۴۰ تا کار. اتومات');
  assert.equal(imgWithCaption.isTextFile, false);
  assert.ok(!imgWithCaption.caption.includes('989121769442'));
  assert.ok(!imgWithCaption.captionWithCode.includes('989121769442'));

  // 2. Truncated OS image filename
  const truncatedImg = parseListingFileName(
    '989121837606_5490_پراید_وانت_۱۴۰۲_سفید_بیرنگ_۴۰_تا_کار_پشت_آمپر_جدید_کفی_باربند.jpg'
  );
  assert.equal(truncatedImg.phoneNumber, '09121837606');
  assert.equal(truncatedImg.randomCode, '5490');
  assert.equal(
    truncatedImg.caption,
    'پراید وانت ۱۴۰۲ سفید بیرنگ ۴۰ تا کار پشت آمپر جدید کفی باربند'
  );

  // 3. Image filename with only phone + 4-digit random code
  const imgCodeOnly = parseListingFileName('989122720114_2963.jpg');
  assert.equal(imgCodeOnly.phoneNumber, '09122720114');
  assert.equal(imgCodeOnly.randomCode, '2963');
  assert.equal(imgCodeOnly.caption, '');
  assert.equal(imgCodeOnly.isTextFile, false);

  // 4. Text-only filename (<phone>_<4DigitCode>.txt)
  const txtFile = parseListingFileName('989121769442_5144.txt');
  assert.equal(txtFile.phoneNumber, '09121769442');
  assert.equal(txtFile.randomCode, '5144');
  assert.equal(txtFile.caption, '');
  assert.equal(txtFile.isTextFile, true);
});

test('formatIranianPhone converts 989... to 09... and handles Persian digits', () => {
  assert.equal(formatIranianPhone('989122959582'), '09122959582');
  assert.equal(formatIranianPhone('989121769442'), '09121769442');
  assert.equal(formatIranianPhone('09123456789'), '09123456789');
  assert.equal(formatIranianPhone('9123456789'), '09123456789');
  assert.equal(formatIranianPhone('۰۹۱۲۲۹۵۹۵۸۲'), '09122959582');
  assert.equal(formatIranianPhone('۹۸۹۳۵۱۲۳۴۵۶۷'), '09351234567');
});

test('extractIranianPhone searches across candidate fields and filenames for all 11-digit numbers', () => {
  // Candidate 1 is empty, but Candidate 2 is filename starting with phone
  assert.equal(
    extractIranianPhone(undefined, '989121769442_1268_۲۰۷_پانا.jpg'),
    '09121769442'
  );
  // Prioritizes filename prefix even if another field is passed first
  assert.equal(
    extractIranianPhone('نام فروشنده', '989128360320_8568_۸۲_چن_لکه_رنگ.jpg'),
    '09128360320'
  );
  // Irancell (0935)
  assert.equal(extractIranianPhone('09351234567'), '09351234567');
  // RighTel (0921)
  assert.equal(extractIranianPhone('989211234567'), '09211234567');
  // Exhibition landline 021 (11 digits)
  assert.equal(extractIranianPhone('نمایشگاه تهران 02188776655'), '02188776655');
  // Exhibition landline 026 Karaj (11 digits)
  assert.equal(extractIranianPhone('02634455667'), '02634455667');
  // Persian digits in text note
  assert.equal(
    extractIranianPhone('', 'تماس: ۰۹۳۵۱۲۳۴۵۶۷ آقای رضایی'),
    '09351234567'
  );
  // No phone in any field
  assert.equal(extractIranianPhone(undefined, 'فایل بدون شماره.jpg'), 'ثبت نشده');
});

test('parseCarYear normalizes Persian, 2-digit and AD years and returns 0 when unknown', () => {
  assert.equal(parseCarYear('۱۴۰۴'), 1404);
  assert.equal(parseCarYear('1403'), 1403);
  assert.equal(parseCarYear('403'), 1403);
  assert.equal(parseCarYear('82'), 1382);
  assert.equal(parseCarYear('00'), 1400);
  assert.equal(parseCarYear('1396'), 1396);
  assert.equal(parseCarYear('2025'), 2025);
  assert.equal(parseCarYear(''), 0);
  assert.equal(parseCarYear('0'), 0);
  assert.equal(parseCarYear(undefined), 0);
});

test('detectBrand recognizes Iranian and imported car brands', () => {
  assert.equal(detectBrand('207'), 'ایران خودرو');
  assert.equal(detectBrand('ایرانخودرو تارا'), 'ایران خودرو');
  assert.equal(detectBrand('تویوتا کمری'), 'تویوتا');
  assert.equal(detectBrand('سیتروئن زانتیا'), 'سیتروئن');
  assert.equal(detectBrand('نیسان جوک'), 'نیسان');
  assert.equal(detectBrand('امویام تیگو 7'), 'مدیران خودرو');
  assert.equal(detectBrand('هیوندای پالیسید'), 'هیوندای');
});

test('parseSellersJson parses user exact JSON format properly', () => {
  const samplePayload = {
    version: 2,
    sellers: [
      {
        id: 'error-row',
        rowIndex: 1,
        imageFileName: '989126359410_9187.jpg',
        status: 'error',
        اسم_فروشنده: '989126359410',
        errorMessage: 'Failed to load image',
      },
      {
        id: 'item-2',
        rowIndex: 2,
        imageFileName: '989122959582_9584.jpg',
        status: 'success',
        اسم_ماشین: '207',
        سال_ساخت: '۱۴۰۴',
        رنگ: '',
        اسم_فروشنده: '989122959582',
      },
      {
        id: 'item-7',
        rowIndex: 7,
        imageFileName: '989121769442_1268_۲۰۷_پانا_۴۰۳_سفید_۴۰_تا_کار._اتومات.jpg',
        status: 'success',
        اسم_ماشین: '207',
        سال_ساخت: '1403',
        رنگ: '۲۰۷ پانا ۴۰۳ سفید ۴۰ تا کار. اتومات',
        اسم_فروشنده: '989121769442',
      },
      {
        id: 'item-9',
        rowIndex: 9,
        imageFileName: '989128360320_8568_۸۲_چن_لکه_رنگ_بدون_ضعف_فنی_عالی.jpg',
        status: 'success',
        اسم_ماشین: 'سیتروئن زانتیا',
        سال_ساخت: '82',
        رنگ: '۸۲ چن لکه رنگ بدون ضعف فنی عالی',
        اسم_فروشنده: '989128360320',
      },
    ],
  };

  const { listings, errorsCount } = parseSellersJson(samplePayload);

  assert.equal(errorsCount, 1);
  assert.equal(listings.length, 3);

  // Check item 2
  assert.equal(listings[0].model, '207');
  assert.equal(listings[0].year, 1404);
  assert.equal(listings[0].phoneNumber, '09122959582');

  // Check item 7 (with details extracted from filename/color text)
  assert.equal(listings[1].phoneNumber, '09121769442');
  assert.equal(listings[1].gearbox, 'اتوماتیک');
  assert.equal(listings[1].color, 'سفید');
  assert.equal(listings[1].mileage, 40000);
  assert.ok(listings[1].fileDescription?.includes('۲۰۷ پانا ۴۰۳ سفید ۴۰ تا کار. اتومات'));
  assert.ok(!listings[1].fileDescription?.includes('989121769442'));

  // Check item 9 (Xantia year 82 -> 1382)
  assert.equal(listings[2].model, 'سیتروئن زانتیا');
  assert.equal(listings[2].year, 1382);
  assert.equal(listings[2].phoneNumber, '09128360320');
  assert.equal(listings[2].bodyCondition, 'چند لکه رنگ جزئی، فنی سالم');
});
