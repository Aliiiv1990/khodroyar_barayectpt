import type { CarListing } from '../types/car';
import { pocketbase, pocketbaseListings } from './pocketbase';
import { optimizeImageForUpload } from './imageHelper';

export interface PocketBaseImportProgress {
  processed: number;
  total: number;
  failed: number;
  percent: number;
}

function imageDataUrlToFile(dataUrl: string, fileName: string): File | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (mimeType === 'image/svg+xml') return null;
  const binary = atob(match[2].replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const safeName = fileName.split(/[\\/]/).pop()?.replace(/[^\w.\-\u0600-\u06FF]/g, '_') || 'vehicle-photo';
  const extension = mimeType.split('/')[1].replace('jpeg', 'jpg');
  return new File([bytes], safeName.includes('.') ? safeName : safeName + '.' + extension, { type: mimeType });
}

async function listingFiles(listing: CarListing): Promise<File[]> {
  const candidates = [listing.imageFullBase64, listing.imageThumbnailBase64]
    .filter((value): value is string => Boolean(value && value.startsWith('data:image/') && !value.startsWith('data:image/svg+xml')))
    .filter((value, index, all) => all.indexOf(value) === index);
  const files: File[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const optimized = await optimizeImageForUpload(
      candidates[index],
      index === 0 ? 1280 : 420,
      index === 0 ? 960 : 315,
      index === 0 ? 0.84 : 0.72,
    );
    const file = imageDataUrlToFile(
      optimized,
      listing.imageFileName || (String(listing.id) + (index === 0 ? '-full' : '-thumb') + '.jpg'),
    );
    if (file) files.push(file);
  }
  return files;
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function ensureImportBatch(batchName: string, total: number, sourceFile: string) {
  try {
    const existing = await pocketbase.collection('import_batches').getFirstListItem(
      pocketbase.filter('batch_name = {:batchName}', { batchName }),
    );
    return await pocketbase.collection('import_batches').update(existing.id, {
      status: 'processing',
      record_count: total,
      processed_count: 0,
      error_summary: '',
      source_file: sourceFile,
    });
  } catch (error: any) {
    if (error?.status !== 404) throw error;
    return await pocketbase.collection('import_batches').create({
      batch_name: batchName,
      status: 'processing',
      record_count: total,
      processed_count: 0,
      error_summary: '',
      source_file: sourceFile,
    });
  }
}

/**
 * Resumable, idempotent import: each listing is upserted by its stable legacy_id.
 * A failed run remains marked as failed and can be safely retried with the same ZIP.
 */
export async function publishListingsToPocketBase(
  listings: CarListing[],
  batchName: string,
  onProgress?: (progress: PocketBaseImportProgress) => void,
  sourceFile = batchName,
): Promise<{ saved: number; failed: number; batchId: string }> {
  if (!pocketbase.authStore.isValid || pocketbase.authStore.record?.role !== 'admin') {
    throw new Error('فقط مدیر سامانه اجازه ورود اطلاعات گروهی را دارد.');
  }
  if (!listings.length) throw new Error('فایل ورودی هیچ رکوردی ندارد.');

  const batch = await ensureImportBatch(batchName, listings.length, sourceFile);
  const errors: string[] = [];
  let nextIndex = 0;
  let processed = 0;
  let saved = 0;
  let failed = 0;
  let lastBatchUpdate = 0;
  const concurrency = 3;

  const persistProgress = async (force = false) => {
    if (!force && processed - lastBatchUpdate < 25) return;
    lastBatchUpdate = processed;
    await pocketbase.collection('import_batches').update(batch.id, {
      processed_count: processed,
      error_summary: errors.slice(0, 20).join('\n').slice(0, 4500),
    });
  };

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= listings.length) return;
      const listing = {
        ...listings[current],
        importBatchName: batchName,
        source: 'admin' as const,
        status: 'active',
      };
      let completed = false;
      for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
        try {
          const files = await listingFiles(listing);
          await pocketbaseListings.upsert(listing, files);
          saved += 1;
          completed = true;
        } catch (error: any) {
          if (attempt < 3) await delay(attempt * 700);
          else {
            failed += 1;
            errors.push('ردیف ' + (current + 1) + ' (' + listing.id + '): ' + String(error?.message || error).slice(0, 180));
          }
        }
      }
      processed += 1;
      onProgress?.({
        processed,
        total: listings.length,
        failed,
        percent: Math.round((processed / listings.length) * 100),
      });
      try {
        await persistProgress();
      } catch (error) {
        errors.push('ثبت وضعیت پیشرفت ناموفق بود: ' + String((error as Error)?.message || error).slice(0, 180));
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, listings.length) }, () => worker()));
  await pocketbase.collection('import_batches').update(batch.id, {
    status: failed === 0 ? 'completed' : 'failed',
    record_count: listings.length,
    processed_count: processed,
    error_summary: errors.slice(0, 20).join('\n').slice(0, 4500),
  });

  return { saved, failed, batchId: batch.id };
}
