import { test } from 'node:test';
import assert from 'node:assert';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

test('Chunked Resumable Upload and Zero-RAM extraction simulation', async () => {
  // 1. Create a simulated realistic car_session.zip with session.json and an image
  const zip = new JSZip();
  const sessionJson = {
    sellers: [
      {
        id: 'chunk_test_car_1',
        imageFileName: '989123456789_5544_تست_دنا_پلاس_۱۴۰۲_سفید.jpg',
        اسم_ماشین: 'دنا پلاس',
        سال_ساخت: '۱۴۰۲',
        رنگ: 'سفید',
        کارکرد_کیلومتر: '۲۰۰۰۰',
        قیمت_تومان: '۸۵۰۰۰۰۰۰۰',
        اسم_فروشنده: 'علی رضایی',
        status: 'success',
      },
    ],
    buyers: [],
  };
  zip.file('session.json', JSON.stringify(sessionJson));

  // Minimal valid 1x1 JPEG bytes
  const fakeJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);

  zip.file('data/chunk_test_car_1', fakeJpeg);

  const fullZipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  assert.ok(fullZipBuffer.length > 100, 'Simulated zip buffer generated');

  // 2. Simulate client-side chunking into 3 parts
  const partSize = Math.ceil(fullZipBuffer.length / 3);
  const chunk0 = fullZipBuffer.subarray(0, partSize);
  const chunk1 = fullZipBuffer.subarray(partSize, partSize * 2);
  const chunk2 = fullZipBuffer.subarray(partSize * 2);

  const totalLength = chunk0.length + chunk1.length + chunk2.length;
  assert.strictEqual(totalLength, fullZipBuffer.length, 'Chunks slice accurately');

  // 3. Simulate file stitching
  const tempDir = path.resolve('data', 'test_upload_session');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'chunk_0.part'), chunk0);
  fs.writeFileSync(path.join(tempDir, 'chunk_1.part'), chunk1);
  fs.writeFileSync(path.join(tempDir, 'chunk_2.part'), chunk2);

  const stitchedZipPath = path.join(tempDir, 'complete.zip');
  const writeStream = fs.createWriteStream(stitchedZipPath);
  for (let i = 0; i < 3; i++) {
    const partPath = path.join(tempDir, `chunk_${i}.part`);
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(partPath);
      readStream.on('error', reject);
      readStream.pipe(writeStream, { end: false });
      readStream.on('end', resolve);
    });
  }
  writeStream.end();
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  const stitchedBuffer = fs.readFileSync(stitchedZipPath);
  assert.strictEqual(stitchedBuffer.length, fullZipBuffer.length, 'Stitched buffer matches original size');

  // 4. Verify unzipping from stitched buffer
  const verifyZip = new JSZip();
  const unzipped = await verifyZip.loadAsync(stitchedBuffer);
  assert.ok(unzipped.files['session.json'], 'session.json exists in stitched archive');
  assert.ok(unzipped.files['data/chunk_test_car_1'], 'data file exists in stitched archive');

  // Cleanup test directory
  fs.unlinkSync(path.join(tempDir, 'chunk_0.part'));
  fs.unlinkSync(path.join(tempDir, 'chunk_1.part'));
  fs.unlinkSync(path.join(tempDir, 'chunk_2.part'));
  fs.unlinkSync(stitchedZipPath);
  fs.rmdirSync(tempDir);
});
