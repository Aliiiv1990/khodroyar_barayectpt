import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseVoiceSearchQuery, parseVoiceAdRegistration } from './voiceAssistant';

describe('voiceAssistant', () => {
  describe('parseVoiceSearchQuery', () => {
    it('correctly extracts model and year from natural Persian speech', () => {
      const speech = 'یه ۲۰۶ تیپ ۲ مدل ۴۰۰ ۴۰۱ این طورا میخوام';
      const result = parseVoiceSearchQuery(speech);

      assert.ok(result.detectedCarName?.includes('۲۰۶ تیپ ۲') || result.normalizedQuery.includes('۲۰۶'));
      assert.ok(result.detectedYears.includes(1400));
      assert.ok(result.detectedYears.includes(1401));
    });

    it('handles query with car name and single year', () => {
      const speech = 'دنبال دنا پلاس مدل ۱۴۰۲ هستم';
      const result = parseVoiceSearchQuery(speech);

      assert.strictEqual(result.detectedCarName, 'دنا پلاس');
      assert.ok(result.detectedYears.includes(1402));
      assert.ok(result.normalizedQuery.includes('دنا پلاس'));
    });

    it('handles casual spoken car names without explicit year', () => {
      const speech = 'چانگان سفید بی رنگ';
      const result = parseVoiceSearchQuery(speech);

      assert.strictEqual(result.detectedCarName, 'چانگان');
      assert.ok(result.normalizedQuery.includes('چانگان'));
    });
  });

  describe('parseVoiceAdRegistration', () => {
    it('correctly parses full vehicle ad spoken details', () => {
      const speech = 'یه چانگان مدل ۹۸ سفید بیرنگ ۸۰ تا کار دارم قیمت ۹۰۰ میلیون شماره تماس ۰۹۱۲۳۴۵۶۷۸۹';
      const result = parseVoiceAdRegistration(speech);

      assert.strictEqual(result.carName, 'چانگان');
      assert.strictEqual(result.year, 1398);
      assert.strictEqual(result.color, 'سفید');
      assert.ok(result.bodyCondition.includes('بدون رنگ'));
      assert.strictEqual(result.mileage, 80000);
      assert.strictEqual(result.price, 900000000);
      assert.strictEqual(result.phoneNumber, '09123456789');
      assert.strictEqual(result.type, 'sale');
    });

    it('identifies buyer request intent from speech', () => {
      const speech = 'خریدار پژو ۲۰۷ مدل ۱۴۰۱ مشکی با شماره ۰۹۱۲۹۹۹۸۸۷۷';
      const result = parseVoiceAdRegistration(speech);

      assert.strictEqual(result.type, 'buy_request');
      assert.ok(result.carName.includes('۲۰۷'));
      assert.strictEqual(result.year, 1401);
      assert.strictEqual(result.color, 'مشکی');
      assert.strictEqual(result.phoneNumber, '09129998877');
    });
  });
});
