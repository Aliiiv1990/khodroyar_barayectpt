import test from 'node:test';
import assert from 'node:assert/strict';
import { CarListing } from '../types/car';
import { buildSearchIndex } from './persianSearch';

test('CarListing source identification and distinction', () => {
  const adminListing: CarListing = {
    id: 'admin-101',
    type: 'sale',
    title: 'پژو 206 تیپ 2',
    brand: 'پژو',
    model: '206 تیپ 2',
    year: 1400,
    price: 450000000,
    priceFormatted: '۴۵۰ میلیون تومان',
    mileage: 35000,
    mileageFormatted: '۳۵,۰۰۰ کیلومتر',
    color: 'سفید',
    gearbox: 'دنده‌ای',
    bodyCondition: 'بی‌رنگ',
    fuelType: 'بنزین',
    city: 'تهران',
    phoneNumber: '09121111111',
    description: 'فنی عالی بدون رنگ',
    createdAt: new Date().toISOString(),
    imageThumbnailBase64: '',
    imageFullBase64: '',
    source: 'admin',
  };

  const userListing: CarListing = {
    id: 'user-202',
    type: 'sale',
    title: 'تارا اتوماتیک V4',
    brand: 'ایران خودرو',
    model: 'تارا اتوماتیک',
    year: 1403,
    price: 900000000,
    priceFormatted: '۹۰۰ میلیون تومان',
    mileage: 5000,
    mileageFormatted: '۵,۰۰۰ کیلومتر',
    color: 'مشکی',
    gearbox: 'اتوماتیک',
    bodyCondition: 'بی‌رنگ',
    fuelType: 'بنزین',
    city: 'مشهد',
    phoneNumber: '09122222222',
    description: 'ثبت شده توسط همکار جهت فروش فوری',
    createdAt: new Date().toISOString(),
    imageThumbnailBase64: '',
    imageFullBase64: '',
    source: 'user',
    creatorName: 'علی رضایی',
  };

  assert.equal(adminListing.source, 'admin');
  assert.equal(userListing.source, 'user');
  assert.equal(userListing.creatorName, 'علی رضایی');

  // Verify search index works for both
  adminListing._searchIndex = buildSearchIndex(adminListing);
  userListing._searchIndex = buildSearchIndex(userListing);

  assert.ok(adminListing._searchIndex.includes('206'));
  assert.ok(userListing._searchIndex.includes('تارا'));
});
