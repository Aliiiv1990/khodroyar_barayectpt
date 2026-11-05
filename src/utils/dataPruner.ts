import { CarListing } from '../types/car';

export const MAX_RETENTION_DAYS = 4;
export const FOUR_DAYS_MS = MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Filters out any listings that are older than 4 days to protect memory
 * and keep the active listing pool strictly relevant.
 */
export function pruneOldListings(listings: CarListing[], referenceTime = Date.now()): {
  prunedListings: CarListing[];
  removedCount: number;
} {
  const prunedListings: CarListing[] = [];
  let removedCount = 0;

  for (let i = 0; i < listings.length; i++) {
    const item = listings[i];
    // Listings belonging to an imported user/server batch are always preserved
    if (item.importBatchName) {
      prunedListings.push(item);
      continue;
    }

    if (!item.createdAt) {
      prunedListings.push(item);
      continue;
    }

    const itemDate = new Date(item.createdAt).getTime();
    if (isNaN(itemDate)) {
      prunedListings.push(item);
      continue;
    }

    if (referenceTime - itemDate > FOUR_DAYS_MS) {
      removedCount++;
    } else {
      prunedListings.push(item);
    }
  }

  return { prunedListings, removedCount };
}

/**
 * Formats a date relative to now in friendly Persian ("امروز", "دیروز", "۲ روز پیش", ...)
 */
export function formatPersianTimeAgo(dateStr: string, referenceTime = Date.now()): string {
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return 'نامشخص';

  const diffMs = referenceTime - time;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${toPersianDigits(diffMinutes)} دقیقه پیش`;
  }
  if (diffHours < 24) {
    return `${toPersianDigits(diffHours)} ساعت پیش`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'دیروز';
  }
  if (diffDays === 2) {
    return '۲ روز پیش';
  }
  if (diffDays === 3) {
    return '۳ روز پیش';
  }
  return `${toPersianDigits(diffDays)} روز پیش`;
}

/**
 * Converts English digits (0-9) to Persian digits (۰-۹).
 */
export function toPersianDigits(value: number | string): string {
  if (value === undefined || value === null) return '';
  const str = value.toString();
  return str.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 1728));
}

/**
 * Formats monetary price in Toman with thousand separators and Persian digits.
 */
export function formatTomanPrice(amount: number): string {
  if (amount <= 0) return 'توافقی';
  const formatted = amount.toLocaleString('en-US');
  return `${toPersianDigits(formatted)} تومان`;
}
