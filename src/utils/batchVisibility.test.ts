import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionJson } from './sessionDataParser';
import { CarListing } from '../types/car';

test('parseSessionJson parses all buyer rows with various alias fields without dropping', () => {
  const mockData = {
    sellers: [
      {
        id: 's1',
        اسم_ماشین: 'پژو ۲۰۶ تیپ ۲',
        سال_ساخت: '۱۴۰۰',
        قیمت_تومان: '۴۵۰,۰۰۰,۰۰۰',
        اسم_فروشنده: '09121111111',
      },
    ],
    buyers: [
      {
        id: 'b1',
        status: 'error', // Even with error status, should not be dropped!
        اسم_ماشین: 'تارا اتوماتیک',
        سال_ساخت: '۱۴۰۳',
        بودجه_تقریبی_تومان: '۸۵۰,۰۰۰,۰۰۰',
        اسم_مشتری: '09122222222',
      },
      {
        id: 'b2',
        // Alternate key name 'مدل' instead of 'اسم_ماشین'
        مدل: 'دنا پلاس توربو',
        سال: '۱۴۰۲',
        بودجه: '۷۰۰,۰۰۰,۰۰۰',
        مشتری: '09123333333',
      },
      {
        id: 'b3',
        // Text in description without explicit car name
        توضیحات_بیشتر: 'خریدار نقدی هایما S7 مشکی',
        مبلغ: '۱,۴۰۰,۰۰۰,۰۰۰',
        شماره_تماس: '09124444444',
      },
    ],
  };

  const result = parseSessionJson(mockData, new Map(), new Map(), 'test_batch.zip');
  assert.equal(result.sellersCount, 1);
  assert.equal(result.buyersCount, 3);
  assert.equal(result.listings.length, 4);

  const buyers = result.listings.filter((l) => l.type === 'buy_request');
  assert.equal(buyers.length, 3);
  assert.equal(buyers[0].model, 'تارا اتوماتیک');
  assert.equal(buyers[1].model, 'دنا پلاس توربو');
  assert.equal(buyers[2].model, 'خریدار نقدی هایما S7 مشکی');
  assert.equal(buyers[0].importBatchName, 'test_batch.zip');
});

test('batch visibility filtering preserves all items in database but filters displayed ones', () => {
  const listings: CarListing[] = [
    {
      id: 'c1',
      type: 'sale',
      title: 'Car 1',
      brand: 'ایران خودرو',
      model: 'تارا',
      year: 1402,
      price: 900000000,
      priceFormatted: '۹۰۰ میلیون',
      mileage: 0,
      mileageFormatted: 'صفر',
      color: 'سفید',
      gearbox: 'اتوماتیک',
      bodyCondition: 'بی‌رنگ',
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: '09121111111',
      description: '',
      createdAt: new Date().toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
      importBatchName: 'batch_A.zip',
    },
    {
      id: 'c2',
      type: 'buy_request',
      title: 'Buyer 1',
      brand: 'سایپا',
      model: 'شاهین',
      year: 1403,
      price: 650000000,
      priceFormatted: '۶۵۰ میلیون',
      mileage: 0,
      mileageFormatted: 'مهم نیست',
      color: 'مشکی',
      gearbox: 'دنده‌ای',
      bodyCondition: 'سالم',
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: '09122222222',
      description: '',
      createdAt: new Date().toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
      importBatchName: 'batch_B.zip',
    },
    {
      id: 'c3',
      type: 'sale',
      title: 'Manual Entry',
      brand: 'پژو',
      model: '۲۰۷',
      year: 1403,
      price: 800000000,
      priceFormatted: '۸۰۰ میلیون',
      mileage: 10000,
      mileageFormatted: '۱۰,۰۰۰',
      color: 'سفید',
      gearbox: 'اتوماتیک',
      bodyCondition: 'بی‌رنگ',
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: '09123333333',
      description: '',
      createdAt: new Date().toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
      importBatchName: 'ثبت‌های دستی همکاران و مدیر',
    },
  ];

  // Hidden set with batch_A.zip
  const hiddenBatches = new Set(['batch_A.zip']);
  const visible = listings.filter((l) => !hiddenBatches.has(l.importBatchName || ''));

  assert.equal(visible.length, 2);
  assert.equal(visible[0].id, 'c2');
  assert.equal(visible[1].id, 'c3');

  // Total database still contains all 3!
  assert.equal(listings.length, 3);
});
