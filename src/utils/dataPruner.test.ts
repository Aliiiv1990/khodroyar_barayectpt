import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pruneOldListings,
  formatPersianTimeAgo,
  toPersianDigits,
  formatTomanPrice,
  MAX_RETENTION_DAYS,
} from './dataPruner';
import { CarListing } from '../types/car';

test('pruneOldListings keeps listings within 4 days and removes older ones', () => {
  const now = 1700000000000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const sampleListings: CarListing[] = [
    {
      id: '1',
      type: 'sale',
      title: 'خودرو ۱ روز پیش',
      brand: 'پژو',
      model: '206',
      year: 1401,
      price: 400000000,
      priceFormatted: '۴۰۰ میلیون',
      mileage: 30000,
      mileageFormatted: '۳۰,۰۰۰',
      color: 'سفید',
      gearbox: 'دنده‌ای',
      bodyCondition: 'سالم',
      fuelType: 'بنزین',
      city: 'تهران',
      phoneNumber: '09120000000',
      description: '',
      createdAt: new Date(now - 1 * ONE_DAY).toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
    },
    {
      id: '2',
      type: 'sale',
      title: 'خودرو ۳ روز پیش',
      brand: 'سایپا',
      model: 'کوییک',
      year: 1402,
      price: 350000000,
      priceFormatted: '۳۵۰ میلیون',
      mileage: 10000,
      mileageFormatted: '۱۰,۰۰۰',
      color: 'قرمز',
      gearbox: 'دنده‌ای',
      bodyCondition: 'سالم',
      fuelType: 'بنزین',
      city: 'کرج',
      phoneNumber: '09120000001',
      description: '',
      createdAt: new Date(now - 3.5 * ONE_DAY).toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
    },
    {
      id: '3',
      type: 'sale',
      title: 'خودرو ۵ روز پیش (منقضی)',
      brand: 'ایران خودرو',
      model: 'دنا',
      year: 1400,
      price: 600000000,
      priceFormatted: '۶۰۰ میلیون',
      mileage: 50000,
      mileageFormatted: '۵۰,۰۰۰',
      color: 'مشکی',
      gearbox: 'اتوماتیک',
      bodyCondition: 'سالم',
      fuelType: 'بنزین',
      city: 'شیراز',
      phoneNumber: '09120000002',
      description: '',
      createdAt: new Date(now - 5 * ONE_DAY).toISOString(),
      imageThumbnailBase64: '',
      imageFullBase64: '',
    },
  ];

  const { prunedListings, removedCount } = pruneOldListings(sampleListings, now);

  assert.equal(removedCount, 1);
  assert.equal(prunedListings.length, 2);
  assert.equal(prunedListings[0].id, '1');
  assert.equal(prunedListings[1].id, '2');
});

test('toPersianDigits converts English numbers to Persian glyphs', () => {
  assert.equal(toPersianDigits('1402'), '۱۴۰۲');
  assert.equal(toPersianDigits(1234567890), '۱۲۳۴۵۶۷۸۹۰');
});

test('formatTomanPrice handles zero and positive amounts', () => {
  assert.equal(formatTomanPrice(0), 'توافقی');
  assert.equal(formatTomanPrice(450000000), '۴۵۰,۰۰۰,۰۰۰ تومان');
});

test('formatPersianTimeAgo computes human readable Persian time labels', () => {
  const now = 1700000000000;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  assert.equal(formatPersianTimeAgo(new Date(now - 30 * 60 * 1000).toISOString(), now), '۳۰ دقیقه پیش');
  assert.equal(formatPersianTimeAgo(new Date(now - 4 * HOUR).toISOString(), now), '۴ ساعت پیش');
  assert.equal(formatPersianTimeAgo(new Date(now - 25 * HOUR).toISOString(), now), 'دیروز');
  assert.equal(formatPersianTimeAgo(new Date(now - 49 * HOUR).toISOString(), now), '۲ روز پیش');
  assert.equal(formatPersianTimeAgo(new Date(now - 75 * HOUR).toISOString(), now), '۳ روز پیش');
});
