import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
  parseNumericValue,
  applyNormalizationRules,
  parseSessionJson,
  parseZipArchive,
  parseCarCsv,
  applyListingEdits,
  SessionJsonRoot,
} from './sessionDataParser';
import { filterCarListings } from './persianSearch';

test('parseNumericValue parses Persian digits, words and commas', () => {
  assert.equal(parseNumericValue('۴۵۰,۰۰۰,۰۰۰'), 450_000_000);
  assert.equal(parseNumericValue('۶۵۰ میلیون'), 650_000_000);
  assert.equal(parseNumericValue('1.2 میلیارد'), 1_200_000_000);
  assert.equal(parseNumericValue('توافقی'), 0);
  assert.equal(parseNumericValue(850000000), 850_000_000);
});

test('applyNormalizationRules maps aliases to targetName', () => {
  const rules = [
    {
      id: 'rule-1',
      targetName: 'پژو ۲۰۷ پانوراما',
      aliases: ['207 پانا', '۲۰۷ سقف شیشه‌ای', '207 pcb'],
    },
    {
      id: 'rule-2',
      targetName: 'دنا پلاس توربو اتوماتیک',
      aliases: ['دنا اتومات', 'دنا توربو اتو'],
    },
  ];

  assert.equal(applyNormalizationRules('207 پانا سفید', rules), 'پژو ۲۰۷ پانوراما');
  assert.equal(applyNormalizationRules('دنا اتومات', rules), 'دنا پلاس توربو اتوماتیک');
  assert.equal(applyNormalizationRules('پراید ۱۱۱', rules), 'پراید ۱۱۱');
});

test('parseSessionJson parses both sellers and buyers correctly and extracts phone from imageFileName', () => {
  const sessionData: SessionJsonRoot = {
    version: 2,
    normalizationRules: [
      {
        id: 'r1',
        targetName: 'پژو ۲۰۷ پانوراما',
        aliases: ['207 پانا'],
      },
    ],
    sellers: [
      {
        id: 'seller-uuid-1',
        rowIndex: 1,
        imageFileName: '989121769442_1268_۲۰۷_پانا_۴۰۳_سفید_۴۰_تا_کار._اتومات.jpg',
        status: 'success',
        اسم_ماشین: '207 پانا',
        سال_ساخت: '۱۴۰۳',
        رنگ: 'سفید',
        کارکرد_کیلومتر: '۲۵,۰۰۰',
        قیمت_تومان: '۷۵۰,۰۰۰,۰۰۰',
        اسم_فروشنده: '',
      },
      {
        id: 'seller-err-2',
        status: 'error',
        errorMessage: 'File corrupt',
      },
    ],
    buyers: [
      {
        id: 'buyer-uuid-1',
        rowIndex: 1,
        imageFileName: '989129876543_3482_خریدار_تارا_اتوماتیک_سفید.jpg',
        status: 'success',
        اسم_مشتری: '',
        اسم_ماشین: 'تارا اتوماتیک',
        سال_ساخت: '۱۴۰۲ به بالا',
        رنگ: 'سفید یا مشکی',
        بودجه_تقریبی_تومان: '۹۰۰ میلیون',
        توضیحات_بیشتر: 'خریدار فوری، شاسی‌ها پلمپ باشد',
      },
    ],
  };

  const { listings, sellersCount, buyersCount, errorsCount } = parseSessionJson(sessionData);

  assert.equal(errorsCount, 1);
  assert.equal(sellersCount, 1);
  assert.equal(buyersCount, 1);
  assert.equal(listings.length, 2);

  // Seller check: phone comes from imageFileName even when اسم_فروشنده is empty, and caption is clean
  const sellerListing = listings.find((l) => l.type === 'sale')!;
  assert.equal(sellerListing.model, 'پژو ۲۰۷ پانوراما');
  assert.equal(sellerListing.year, 1403);
  assert.equal(sellerListing.phoneNumber, '09121769442');
  assert.ok(sellerListing.fileDescription?.includes('۲۰۷ پانا ۴۰۳ سفید ۴۰ تا کار. اتومات'));
  assert.ok(!sellerListing.fileDescription?.includes('989121769442'));
  assert.equal(sellerListing.price, 750_000_000);
  assert.equal(sellerListing.mileage, 25_000);

  // Buyer check: phone comes from imageFileName and caption is preserved
  const buyerListing = listings.find((l) => l.type === 'buy_request')!;
  assert.equal(buyerListing.model, 'تارا اتوماتیک');
  assert.equal(buyerListing.phoneNumber, '09129876543');
  assert.equal(buyerListing.price, 900_000_000);
  assert.ok(buyerListing.fileDescription?.includes('خریدار تارا اتوماتیک سفید'));
});

test('parseZipArchive extracts session.json and maps both data/{id} images and extensionless data/{id} .txt files', async () => {
  const zip = new JSZip();

  const sessionJson = {
    version: 2,
    sellers: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        imageFileName: '989123334455_1234_پژو_پارس_سفید_بی_رنگ.jpg',
        status: 'success',
        اسم_ماشین: 'پژو پارس',
        سال_ساخت: '1401',
        قیمت_تومان: '۶۰۰,۰۰۰,۰۰۰',
      },
      {
        id: '8218dd81-7326-4011-b0da-6bb8e3891edb',
        imageFileName: '989121769442_5144.txt',
        status: 'success',
        اسم_ماشین: 'تویوتا کمری',
        سال_ساخت: '2016',
      },
    ],
  };

  zip.file('session.json', JSON.stringify(sessionJson));
  // Add a real JPEG header in data/{id}
  zip.file('data/550e8400-e29b-41d4-a716-446655440000', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  // Add extensionless UTF-8 Persian text file in data/{id} corresponding to 989121769442_5144.txt
  zip.file(
    'data/8218dd81-7326-4011-b0da-6bb8e3891edb',
    'کمری هیبرید ال ای۲۵۰۰\nمدل ۲۰۱۶\nسفارش عربستان'
  );

  const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
  const result = await parseZipArchive(zipBuffer);

  assert.equal(result.sellersCount, 2);
  assert.equal(result.listings.length, 2);

  const imgListing = result.listings.find((l) => l.id === '550e8400-e29b-41d4-a716-446655440000')!;
  assert.equal(imgListing.phoneNumber, '09123334455');
  assert.equal(imgListing.isTextOnly, false);
  assert.ok(imgListing.fileDescription?.includes('پژو پارس سفید بی رنگ'));
  assert.ok(imgListing.imageFullBase64.startsWith('data:image/jpeg;base64,'));

  const txtListing = result.listings.find((l) => l.id === '8218dd81-7326-4011-b0da-6bb8e3891edb')!;
  assert.equal(txtListing.phoneNumber, '09121769442');
  assert.equal(txtListing.isTextOnly, true);
  assert.ok(txtListing.fileDescription?.includes('کمری هیبرید ال ای۲۵۰۰'));
  assert.ok(txtListing.fileDescription?.includes('سفارش عربستان'));
});

test('parseZipArchive parses real car_session_testiliar_b01f8173.zip with 100% searchability', async () => {
  const zipPath = path.resolve(process.cwd(), 'public/assets/aistudio/car_session_testiliar_b01f8173.zip');
  if (!fs.existsSync(zipPath)) return;

  const zipBytes = fs.readFileSync(zipPath);
  const result = await parseZipArchive(zipBytes, 'car_session_testiliar.zip');

  assert.equal(result.sellersCount, 28);
  assert.equal(result.buyersCount, 6);
  assert.equal(result.listings.length, 34);

  // Every single listing with a phone-prefixed filename must have a valid 09... phoneNumber
  for (const l of result.listings) {
    assert.ok(
      l.phoneNumber.startsWith('09') && l.phoneNumber.length === 11,
      `Expected valid phone for ${l.imageFileName}, got ${l.phoneNumber}`
    );
  }

  // Check buyer #5 (7ffbd759-7991-43fe-8aa0-10e95af88a14, 989196856104_7827.txt) which had empty اسم_ماشین and empty سال_ساخت in JSON
  const buyerL90 = result.listings.find((l) => l.id === '7ffbd759-7991-43fe-8aa0-10e95af88a14')!;
  assert.equal(buyerL90.phoneNumber, '09196856104');
  assert.equal(buyerL90.year, 0);
  assert.ok(!buyerL90.title.includes('۱۴۰۲'));
  assert.ok(buyerL90.fileDescription?.includes('خریدار ال ۹۰ تا ۱/۲۰۰'));

  // Check seller #1 (0bbf1f10-9287-4be1-9600-528fbf54cb0f, دانگ فنگ h30) which had empty سال_ساخت
  const sellerH30 = result.listings.find((l) => l.id === '0bbf1f10-9287-4be1-9600-528fbf54cb0f')!;
  assert.equal(sellerH30.year, 0);
  assert.equal(sellerH30.title, 'دانگ فنگ h30');

  // Check buyer #5 (3e5a4369-234f-4a6d-bf65-9903e6437c4a, ایران‌خودرو ریرا) which had سال_ساخت: "0"
  const buyerRira = result.listings.find((l) => l.id === '3e5a4369-234f-4a6d-bf65-9903e6437c4a')!;
  assert.equal(buyerRira.year, 0);
  assert.ok(!buyerRira.title.includes('مدل'));

  // Search tests across both tabs
  const searchInAll = (query: string) => [
    ...filterCarListings(result.listings, {
      type: 'sale',
      searchQuery: query,
      brand: '',
      priceRange: 'all',
      dayFilter: 'all',
      city: '',
    }),
    ...filterCarListings(result.listings, {
      type: 'buy_request',
      searchQuery: query,
      brand: '',
      priceRange: 'all',
      dayFilter: 'all',
      city: '',
    }),
  ];

  assert.ok(searchInAll('ال ۹۰').length >= 1, 'Should find L90 from .txt file');
  assert.ok(searchInAll('تندر 90').length >= 1, 'Should find L90 via Tondar 90 synonym');
  assert.ok(searchInAll('ایرتویا').length >= 1, 'Should find Corolla Cross from .txt file');
  assert.ok(searchInAll('سفارش عربستان').length >= 1, 'Should find Camry from .txt file');
  assert.ok(searchInAll('پشت آمپر').length >= 1, 'Should find Pride Vanet from image filename caption');
  assert.ok(searchInAll('پرشیا').length >= 1, 'Should find Pars via Persia synonym');
  assert.ok(searchInAll('۲۰۶تیپ۲').length >= 1, 'Should find 206 Tip 2 without spaces');
  assert.ok(searchInAll('09121769442').length >= 2, 'Should find by 09... phone');
  assert.ok(searchInAll('989121769442').length >= 2, 'Should find by 989... phone');
});

test('parseCarCsv handles sellers and buyers CSV', () => {
  const sellersCsv = `\uFEFFردیف, اسم ماشین, سال ساخت, رنگ, کارکرد (کیلومتر), قیمت (تومان), اسم فروشنده, نام فایل/منبع
1, دنا پلاس, 1402, مشکی, 30000, 800000000, 989124445566, d1.jpg`;

  const buyersCsv = `\uFEFFاسم مشتری, اسم ماشین, سال ساخت, رنگ, بودجه تقریبی (تومان), توضیحات بیشتر, وضعیت, نام فایل تصویر/منبع
989127778899, کوییک S, 1401, سفید, 380000000, مصرف کننده واقعی, success, b1.jpg`;

  const sellers = parseCarCsv(sellersCsv);
  assert.equal(sellers.length, 1);
  assert.equal(sellers[0].type, 'sale');
  assert.equal(sellers[0].model, 'دنا پلاس');
  assert.equal(sellers[0].phoneNumber, '09124445566');

  const buyers = parseCarCsv(buyersCsv);
  assert.equal(buyers.length, 1);
  assert.equal(buyers[0].type, 'buy_request');
  assert.equal(buyers[0].model, 'کوییک S');
  assert.equal(buyers[0].phoneNumber, '09127778899');
});

test('applyListingEdits updates all editable fields, rebuilds search index, and never modifies phoneNumber', () => {
  const [original] = parseCarCsv(`\uFEFFردیف, اسم ماشین, سال ساخت, رنگ, کارکرد (کیلومتر), قیمت (تومان), اسم فروشنده, نام فایل/منبع
1, دنا پلاس, 1402, مشکی, 30000, 800000000, 989124445566, d1.jpg`);

  const updated = applyListingEdits(original, {
    model: 'پژو ۲۰۷ اتوماتیک سقف شیشه‌ای',
    yearInput: '1403',
    priceInput: '920',
    mileageInput: '15',
    color: 'سفید دو پوششه',
    gearbox: 'اتوماتیک',
    bodyCondition: 'بی‌رنگ شاسی پلمپ',
    city: 'شیراز',
    fileDescription: 'ماشین فوق‌العاده تمیز، گارانتی فعال',
    type: 'sale',
  });

  assert.equal(updated.phoneNumber, '09124445566');
  assert.equal(updated.model, 'پژو ۲۰۷ اتوماتیک سقف شیشه‌ای');
  assert.equal(updated.year, 1403);
  assert.equal(updated.hasExplicitYear, true);
  assert.equal(updated.price, 920_000_000);
  assert.equal(updated.mileage, 15_000);
  assert.equal(updated.color, 'سفید دو پوششه');
  assert.equal(updated.gearbox, 'اتوماتیک');
  assert.equal(updated.bodyCondition, 'بی‌رنگ شاسی پلمپ');
  assert.equal(updated.city, 'شیراز');
  assert.equal(updated.fileDescription, 'ماشین فوق‌العاده تمیز، گارانتی فعال');
  assert.equal(updated.isEdited, true);
  assert.ok(updated._searchIndex?.includes('شیراز'));
  assert.ok(updated._searchIndex?.includes('گارانتی فعال'));

  // Clearing the year should set year to 0 and not inject 1402
  const clearedYear = applyListingEdits(updated, {
    yearInput: '',
  });
  assert.equal(clearedYear.year, 0);
  assert.equal(clearedYear.hasExplicitYear, false);
  assert.ok(!clearedYear.title.includes('1402') && !clearedYear.title.includes('۱۴۰۲'));
  assert.equal(clearedYear.phoneNumber, '09124445566');
});

test('parseSessionJson extracts buyers with Persian keys (خریداران, مشتریان, سفارشات)', () => {
  const sessionWithPersianKeys: any = {
    version: 2,
    فروشندگان: [
      {
        id: 's-1',
        اسم_ماشین: 'تارا اتومات',
        قیمت: '950 میلیون',
        شماره_تماس: '09121112233',
      },
    ],
    خریداران: [
      {
        id: 'b-1',
        خریدار: 'محمدی',
        شماره: '09123334455',
        مدل: 'پژو ۲۰۷',
        بودجه: '۸۰۰ میلیون',
        متن: 'خریدار نقدی پژو ۲۰۷ دنده‌ای یا اتوماتیک',
      },
      {
        id: 'b-2',
        نام_مشتری: 'حسینی',
        تماس: '09355556677',
        سفارش: 'دنا پلاس اتوماتیک مشکی',
        سقف_قیمت: '۱ میلیارد',
      },
    ],
  };

  const { listings, sellersCount, buyersCount } = parseSessionJson(sessionWithPersianKeys);
  assert.equal(sellersCount, 1);
  assert.equal(buyersCount, 2);
  assert.equal(listings.length, 3);

  const b1 = listings.find((l) => l.id === 'b-1')!;
  assert.equal(b1.type, 'buy_request');
  assert.equal(b1.phoneNumber, '09123334455');
  assert.equal(b1.price, 800_000_000);

  const b2 = listings.find((l) => l.id === 'b-2')!;
  assert.equal(b2.type, 'buy_request');
  assert.equal(b2.phoneNumber, '09355556677');
  assert.equal(b2.price, 1_000_000_000);
});

test('parseZipArchive handles separate buyers.json and unreferenced files without losing any record', async () => {
  const zip = new JSZip();

  // sellers.json
  zip.file(
    'sellers.json',
    JSON.stringify({
      sellers: [
        {
          id: 's-10',
          اسم_ماشین: 'پژو ۲۰۶ تیپ ۲',
          قیمت_تومان: '۳۵۰,۰۰۰,۰۰۰',
          imageFileName: '09129998877_1001_۲۰۶.jpg',
        },
      ],
    })
  );

  // buyers.json (with Persian keys)
  zip.file(
    'buyers.json',
    JSON.stringify({
      خریداران: [
        {
          id: 'b-10',
          خریدار: 'کریمی',
          شماره_تماس: '09128887766',
          درخواست: 'هایما S7 پلاس',
          بودجه: '۱,۴۰۰,۰۰۰,۰۰۰',
        },
      ],
    })
  );

  // Standalone unindexed buyer txt file
  zip.file('orders/buyer_order_01.txt', 'خریدار فوری جک S5 مشکی تمیز با بودجه ۹۰۰ میلیون - شماره تماس: 09125554433');

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await parseZipArchive(zipBuffer, 'test_1200_archive.zip');

  assert.equal(result.sellersCount, 1);
  assert.equal(result.buyersCount, 2); // 1 from buyers.json + 1 standalone buyer txt!
  assert.equal(result.listings.length, 3);
});

test('parseZipArchive decodes base64-encoded text and images without extensions and merges multi-array JSON', async () => {
  const zip = new JSZip();

  // session.json with multiple arrays (sellers, cars, buyers, orders)
  zip.file(
    'session.json',
    JSON.stringify({
      version: 2,
      sellers: [
        {
          id: 's-multi-1',
          اسم_ماشین: 'پژو پارس TU5',
          سال_ساخت: '۱۴۰۲',
          imageFileName: 'data/entry-b64-text',
        },
      ],
      cars: [
        {
          id: 's-multi-2',
          اسم_ماشین: 'دنا پلاس اتوماتیک',
          سال_ساخت: '۱۴۰۳',
          imageFileName: 'data/entry-b64-img',
        },
      ],
      buyers: [
        {
          id: 'b-multi-1',
          اسم_مشتری: '09121112233',
          اسم_ماشین: 'تویوتا کرولا',
          بودجه_تقریبی_تومان: '۲,۵۰۰,۰۰۰,۰۰۰',
        },
      ],
      orders: [
        {
          id: 'b-multi-2',
          مشتری: '09124445566',
          درخواست: 'سانتافه ۲۰۱۷',
          بودجه: '۳,۲۰۰,۰۰۰,۰۰۰',
        },
      ],
    })
  );

  // File 1 in data/: base64-encoded Persian text
  const b64PersianText = Buffer.from('پارس تیوفایو مشکی بدون رنگ و خط و خش کارکرد ۳۰ هزار ۰۹۱۲۳۳۳۲۲۱۱', 'utf8').toString('base64');
  zip.file('data/entry-b64-text', b64PersianText);

  // File 2 in data/: base64-encoded JPEG image string starting with /9j/
  const fakeB64Jpeg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  zip.file('data/entry-b64-img', fakeB64Jpeg);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await parseZipArchive(zipBuffer, 'multi_array_test.zip');

  // Should have 2 sellers (1 from sellers, 1 from cars)
  assert.equal(result.sellersCount, 2);
  // Should have 2 buyers (1 from buyers, 1 from orders)
  assert.equal(result.buyersCount, 2);
  assert.equal(result.listings.length, 4);

  // Check that base64 text was decoded correctly into fileDescription
  const parsListing = result.listings.find((l) => l.id === 's-multi-1')!;
  assert.ok(parsListing.fileDescription.includes('پارس تیوفایو مشکی'));
  assert.equal(parsListing.isTextOnly, true);

  // Check that base64 image was assigned properly to imageThumbnailBase64
  const denaListing = result.listings.find((l) => l.id === 's-multi-2')!;
  assert.ok(denaListing.imageThumbnailBase64?.startsWith('data:image/jpeg;base64,'));
});


