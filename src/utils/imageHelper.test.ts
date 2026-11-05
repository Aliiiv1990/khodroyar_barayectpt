import test from 'node:test';
import assert from 'node:assert/strict';
import { getListingImage, getColorHex, generateCarSvg, optimizeImageForUpload } from './imageHelper';
import { CarListing } from '../types/car';

test('imageHelper generates fallback vehicle SVG when no images exist', () => {
  const listing: Partial<CarListing> = {
    model: 'پژو 206 تیپ 2',
    color: 'سفید',
  };

  const image = getListingImage(listing, false);
  assert.ok(image.length > 50, 'Image should be non-empty data URI');
  assert.ok(image.startsWith('data:image/svg+xml'), 'Image should be an SVG data URI');

  const fullImage = getListingImage(listing, true);
  assert.ok(fullImage.length > 50, 'Full image should be non-empty');
});

test('imageHelper preserves existing thumbnails and full images', () => {
  const listing: Partial<CarListing> = {
    model: 'تارا اتوماتیک',
    color: 'مشکی',
    imageThumbnailBase64: 'data:image/jpeg;base64,samplethumbnailbytes',
    imageFullBase64: 'data:image/jpeg;base64,samplefullbytes',
  };

  assert.equal(getListingImage(listing, false), 'data:image/jpeg;base64,samplethumbnailbytes');
  assert.equal(getListingImage(listing, true), 'data:image/jpeg;base64,samplefullbytes');
});

test('getColorHex returns authentic Iranian vehicle hex colors', () => {
  assert.equal(getColorHex('سفید روغنی'), '#ffffff');
  assert.equal(getColorHex('مشکی آبنوس متالیک'), '#1e293b');
  assert.equal(getColorHex('نقره‌ای متالیک'), '#94a3b8');
  assert.equal(getColorHex('قرمز رژ'), '#dc2626');
});

test('optimizeImageForUpload preserves short strings and SVG without errors', async () => {
  const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
  const resSvg = await optimizeImageForUpload(svg);
  assert.equal(resSvg, svg);

  const empty = await optimizeImageForUpload('');
  assert.equal(empty, '');

  const short = 'data:image/jpeg;base64,tiny';
  const resShort = await optimizeImageForUpload(short);
  assert.equal(resShort, short);
});
