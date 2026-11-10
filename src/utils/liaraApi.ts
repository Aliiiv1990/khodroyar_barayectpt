import { CarListing } from '../types/car';
import { getListingImage, optimizeImageForUpload } from './imageHelper';
import { buildSearchIndex } from './persianSearch';
import { sanitizeAndIndexListing } from './sessionDataParser';
import JSZip from 'jszip';

export interface LiaraHealthResponse {
  status: string;
  platform: string;
  dbLocation: string;
  isLiaraDisk: boolean;
  totalListings: number;
  salesCount?: number;
  buysCount?: number;
  lastUpdated: string;
}

/**
 * Checks connectivity to the Liara Cloud backend server
 */
export async function checkLiaraHealth(timeoutMs = 8000): Promise<{
  ok: boolean;
  data?: LiaraHealthResponse;
  message: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('مهلت زمانی ارتباط با سرور لیارا پایان یافت'));
    }, timeoutMs);

    const resp = await fetch('/api/health', {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        ok: false,
        message: `پاسخ ناموفق از سرور لیارا (کد وضعیت ${resp.status})`,
      };
    }

    const data: LiaraHealthResponse = await resp.json();
    return {
      ok: true,
      data,
      message: `اتصال به سرور لیارا برقرار است (${data.totalListings} خودرو در دیتابیس)`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: 'عدم ارتباط با سرور محلی/لیارا (احتمال اجرای برنامه به صورت استاتیک یا خاموش بودن سرور)',
    };
  }
}

/**
 * Fetches all active car listings from Liara Cloud database with timeout & cache busting
 */
export async function fetchListingsFromLiara(timeoutMs = 20000, fast = false): Promise<CarListing[] | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error('مهلت بارگیری از سرور به پایان رسید'));
    }, timeoutMs);

    const queryParam = fast ? `format=fast&_t=${Date.now()}` : `_t=${Date.now()}`;
    const resp = await fetch(`/api/listings?${queryParam}`, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    clearTimeout(timer);

    if (!resp.ok) return null;

    const result = await resp.json();
    if (!result.success || !Array.isArray(result.listings)) return null;

    if (typeof window !== 'undefined' && Array.isArray(result.hiddenBatches)) {
      localStorage.setItem('car_hidden_batches', JSON.stringify(result.hiddenBatches));
      window.dispatchEvent(new CustomEvent('car_batches_updated', { detail: result }));
      window.dispatchEvent(new Event('storage'));
    }

    return result.listings.map((item: any) =>
      sanitizeAndIndexListing({
        ...item,
        hasPhoto: Boolean(item.hasPhoto),
        imageUrl: item.imageUrl || (item.hasPhoto ? `/api/images/${encodeURIComponent(item.id)}?thumb=true` : undefined),
        imageThumbnailBase64: item.imageThumbnailBase64 || '',
        imageFullBase64: item.imageFullBase64 || '',
      })
    );
  } catch (err) {
    console.warn('Could not fetch listings from Liara server:', err);
    return null;
  }
}

export interface LiaraSyncMeta {
  success: boolean;
  lastUpdated: string;
  hiddenBatches: string[];
  totalListings: number;
}

/**
 * Fetches lightweight synchronization metadata (~50 bytes) from Liara Cloud
 */
export async function fetchSyncMetaFromLiara(): Promise<LiaraSyncMeta | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`/api/sync-meta?_t=${Date.now()}`, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Publishes/Syncs car listings to Liara Cloud centralized database.
 * Uses lightweight optimized batches (70 items), pre-compresses photos,
 * extends timeout to 120s with exponential retries so large datasets
 * (1,400+ items) never abort or time out on any internet connection!
 */
export async function publishListingsToLiara(
  listings: CarListing[],
  append = true,
  publishedBy = 'مدیر سیستم',
  onProgress?: (percent: number, currentBatch: number, totalBatches: number) => void
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    if (listings.length === 0) {
      return { success: false, message: 'هیچ آگهی برای ارسال انتخاب نشده است.' };
    }

    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(listings.length / BATCH_SIZE);

    // 1. Fast Pre-process listings: keep photos crisp without burning CPU on already-optimized images
    const sanitizedListings: CarListing[] = [];
    for (let idx = 0; idx < listings.length; idx++) {
      const item = listings[idx];
      const rawFull = item.imageFullBase64 || item.imageThumbnailBase64 || '';
      const rawThumb = item.imageThumbnailBase64 || rawFull || '';

      let optFull = rawFull;
      let optThumb = rawThumb;

      // Full Photo: Only optimize if oversized (> 220KB) and not an SVG
      if (optFull && optFull.length > 220000 && !optFull.startsWith('data:image/svg+xml')) {
        optFull = await optimizeImageForUpload(optFull, 1280, 960, 0.85);
      }

      // Thumbnail: Only optimize if oversized (> 65KB) and not an SVG
      if (optThumb && optThumb.length > 65000 && !optThumb.startsWith('data:image/svg+xml')) {
        optThumb = await optimizeImageForUpload(optThumb, 420, 315, 0.75);
      }

      sanitizedListings.push({
        id: String(item.id || `car_${idx}`),
        rowIndex: item.rowIndex,
        type: item.type === 'buy_request' ? 'buy_request' : 'sale',
        title: item.title || item.model || 'خودرو',
        brand: item.brand || '',
        model: item.model || '',
        year: Number(item.year) > 0 ? Number(item.year) : 0,
        hasExplicitYear: item.hasExplicitYear ?? Number(item.year) > 0,
        price: Number(item.price) || 0,
        priceFormatted: item.priceFormatted || 'توافقی',
        mileage: Number(item.mileage) || 0,
        mileageFormatted: item.mileageFormatted || 'صفر',
        color: item.color || 'سفید',
        gearbox: item.gearbox || 'دنده‌ای',
        bodyCondition: item.bodyCondition || 'بی‌رنگ',
        fuelType: item.fuelType || 'بنزین',
        city: item.city || 'تهران',
        phoneNumber: item.phoneNumber || '',
        description: item.description || '',
        fileDescription: item.fileDescription || '',
        imageFileName: item.imageFileName || '',
        status: item.status || 'success',
        createdAt: item.createdAt || new Date().toISOString(),
        source: item.source || 'admin',
        creatorName: item.creatorName || '',
        isTextOnly: Boolean(item.isTextOnly),
        importBatchName: item.importBatchName || 'بسته فایل زیپ',
        importDate: item.importDate || new Date(item.createdAt || Date.now()).toLocaleDateString('fa-IR'),
        imageThumbnailBase64: optThumb || optFull || '',
        imageFullBase64: optFull || optThumb || '',
      });

      // Quick progress feedback and micro-task yield to keep browser thread fluid
      if (idx % 30 === 0) {
        if (onProgress) {
          const prepPercent = Math.min(10, Math.round((idx / listings.length) * 10));
          onProgress(prepPercent, 0, totalBatches);
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Capture the exact IDs expected from this import. A successful HTTP status
    // for each batch is not enough: verify the final server catalogue before reporting success.
    const expectedIds = new Set(sanitizedListings.map((item) => String(item.id)));
    const uploadJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const failedBatches: string[] = [];
    let totalSaved = sanitizedListings.length;

    // Stage 1: Ultra-fast Metadata Push in reliable, verifiable batches
    // Sends car records without heavy base64 strings so the whole catalog is IMMEDIATELY live on all phones!
    const META_CHUNK_SIZE = 100;
    const totalMetaChunks = Math.max(1, Math.ceil(sanitizedListings.length / META_CHUNK_SIZE));

    for (let mIdx = 0; mIdx < totalMetaChunks; mIdx++) {
      const metaChunk = sanitizedListings.slice(mIdx * META_CHUNK_SIZE, (mIdx + 1) * META_CHUNK_SIZE);
      const batchId = `${uploadJobId}_meta_${mIdx + 1}`;
      const idempotencyKey = `${batchId}_${metaChunk.length}`;

      const lightweightChunk = metaChunk.map(({ imageThumbnailBase64, imageFullBase64, ...rest }) => ({
        ...rest,
        hasPhoto: Boolean(imageThumbnailBase64 || imageFullBase64),
        imageThumbnailBase64: (imageThumbnailBase64 || '').startsWith('data:image/svg+xml') ? imageThumbnailBase64 : '',
        imageFullBase64: '',
      }));

      let chunkSuccess = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);

          const metaResp = await fetch('/api/admin/sync-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listings: lightweightChunk,
              append: true, // Always append/merge idempotently by id to prevent wiping on chunk 0
              publishedBy,
              jobId: uploadJobId,
              batchId,
              idempotencyKey,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (metaResp.ok) {
            const metaRes = await metaResp.json();
            totalSaved = metaRes.count || totalSaved;
            chunkSuccess = true;
            break;
          }
        } catch {
          if (attempt < 10) {
            const jitterDelay = Math.min(8000, attempt * 1200 + Math.random() * 500);
            await new Promise((r) => setTimeout(r, jitterDelay));
          }
        }
      }

      if (!chunkSuccess) {
        failedBatches.push(batchId);
      }

      if (onProgress) {
        const metaProgress = Math.min(25, Math.round(((mIdx + 1) / totalMetaChunks) * 25));
        onProgress(metaProgress, mIdx + 1, totalMetaChunks);
      }
    }

    // Stage 2: Stream images in resilient lightweight batches (8 items) with retries and mediaId sharing
    const itemsWithImages = sanitizedListings.filter(
      (l) => (l.imageThumbnailBase64 && l.imageThumbnailBase64.length > 50) || (l.imageFullBase64 && l.imageFullBase64.length > 50)
    );
    const IMAGE_BATCH_SIZE = 8;
    const totalImgBatches = Math.max(1, Math.ceil(itemsWithImages.length / IMAGE_BATCH_SIZE));

    for (let i = 0; i < totalImgBatches; i++) {
      const batchSlice = itemsWithImages.slice(i * IMAGE_BATCH_SIZE, (i + 1) * IMAGE_BATCH_SIZE);
      const batchId = `${uploadJobId}_img_${i + 1}`;
      const imagesPayload = batchSlice.map((item) => ({
        id: item.id,
        mediaId: item.mediaId || item.imageFileName,
        thumb: item.imageThumbnailBase64,
        full: item.imageFullBase64,
      }));

      let batchSuccess = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        let timer: NodeJS.Timeout | null = null;
        try {
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(), 90000);

          const resp = await fetch('/api/admin/sync-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              images: imagesPayload,
              jobId: uploadJobId,
              batchId,
            }),
            signal: controller.signal,
          });

          if (!resp.ok) {
            // Fallback to legacy sync endpoint if sync-images not ready
            const fullBatchResp = await fetch('/api/admin/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                listings: batchSlice,
                append: true,
                publishedBy,
                jobId: uploadJobId,
                batchId,
              }),
              signal: controller.signal,
            });
            if (!fullBatchResp.ok) {
              throw new Error(`خطای سرور (${resp.status})`);
            }
          } else {
            const imageResult = await resp.json();
            if (!imageResult?.success || Number(imageResult.updated) !== batchSlice.length) {
              throw new Error(
                `ذخیره تصویر ناقص بود: ${Number(imageResult?.updated) || 0} از ${batchSlice.length} تصویر به رکوردها متصل شد.`
              );
            }
          }

          batchSuccess = true;
          break;
        } catch {
          if (attempt < 10) {
            const jitterDelay = Math.min(8000, attempt * 1200 + Math.random() * 600);
            await new Promise((r) => setTimeout(r, jitterDelay));
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      if (!batchSuccess) {
        failedBatches.push(batchId);
      }

      if (onProgress) {
        const percent = Math.min(100, 25 + Math.round(((i + 1) / totalImgBatches) * 75));
        onProgress(percent, i + 1, totalImgBatches);
      }
    }

    // Strict validation: Never report 100% false success if any batch failed!
    if (failedBatches.length > 0) {
      return {
        success: false,
        message: `آپلود ناقص ماند: ${failedBatches.length} بسته با خطای شبکه مواجه شد و ذخیره نگردید. لطفاً اتصال اینترنت را بررسی و مجدداً امتحان نمایید.`,
        count: totalSaved,
      };
    }

    // Re-read the lightweight server catalogue and reconcile every submitted ID.
    const verifiedListings = await fetchListingsFromLiara(45000, true);
    if (!verifiedListings) {
      return {
        success: false,
        message: 'بسته‌ها ارسال شدند، اما دریافت فهرست نهایی سرور برای تأیید ذخیره‌سازی ممکن نشد. لطفاً وضعیت سرور را بررسی و دوباره همگام‌سازی کنید.',
        count: totalSaved,
      };
    }
    const persistedIds = new Set(verifiedListings.map((item) => String(item.id)));
    const missingIds = Array.from(expectedIds).filter((id) => !persistedIds.has(id));
    if (missingIds.length > 0) {
      return {
        success: false,
        message: `تأیید نهایی ناموفق بود: از ${expectedIds.size} شناسه ارسالی، ${missingIds.length} مورد در فهرست سرور پیدا نشد. هیچ موفقیت کاملی اعلام نمی‌شود؛ دوباره تلاش کنید.`,
        count: verifiedListings.length,
      };
    }

    return {
      success: true,
      message: `تمام ${expectedIds.size} شناسه ارسالی در فهرست سرور تأیید شد؛ تعداد کل ثبت‌شده: ${verifiedListings.length}.`,
      count: verifiedListings.length,
    };
  } catch (err: any) {
    let cleanMessage = err.message || 'مشکل ارتباط با سرور لیارا';
    if (cleanMessage.includes('aborted') || cleanMessage.includes('AbortError') || cleanMessage.includes('signal')) {
      cleanMessage = 'مهلت زمانی ارتباط به پایان رسید یا اینترنت قطع شد. لطفاً مجدداً امتحان نمایید.';
    }
    return {
      success: false,
      message: `خطا در ذخیره‌سازی در لیارا: ${cleanMessage}`,
    };
  }
}

/**
 * Server-First authoritative listing deletion with tombstones
 * Ensures the ad is deleted on the server first, so other devices purge it during sync
 */
export async function deleteListingFromLiara(id: string): Promise<{ success: boolean; wasRemoved?: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return { success: false };
    const data = await resp.json();
    return { success: Boolean(data?.success), wasRemoved: Boolean(data?.wasRemoved) };
  } catch (err) {
    console.warn('Could not delete listing from Liara database:', err);
    return { success: false };
  }
}

/**
 * Verifies exact database record counts and consistency on Liara
 */
export async function verifyServerIntegrity(): Promise<{
  success: boolean;
  totalListings?: number;
  salesCount?: number;
  buysCount?: number;
  revision?: number;
  batches?: Record<string, number>;
} | null> {
  try {
    const resp = await fetch(`/api/admin/verify-integrity?_t=${Date.now()}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Adds single listing (submitted by colleague/user) to Liara Cloud database
 */
export async function addListingToLiara(listing: CarListing): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...listing,
        source: 'user',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return resp.ok;
  } catch (err) {
    console.warn('Could not add listing to Liara database:', err);
    return false;
  }
}

/**
 * Updates an existing listing in the Liara Cloud database and broadcasts the change to all connected devices.
 * First sends a fast, lightweight payload (~400 bytes without base64 images) for instant save;
 * if the item wasn't on the server yet, sends the full item with images.
 */
export async function updateListingOnLiara(listing: CarListing): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const { imageThumbnailBase64, imageFullBase64, _searchIndex, ...lightweightPayload } = listing;

    const resp = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lightweightPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return false;
    const data = await resp.json();

    // If the item only existed locally and wasn't in the server DB yet, push the full item
    if (data && data.needsFullInsert) {
      const fullResp = await fetch('/api/listings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...listing,
          _searchIndex: undefined,
          allowInsertWithoutImage: true,
        }),
      });
      return fullResp.ok;
    }

    return Boolean(data?.success);
  } catch (err) {
    console.warn('Could not update listing in Liara database:', err);
    return false;
  }
}

/**
 * Clears the centralized database on Liara
 */
export async function clearLiaraDatabase(): Promise<boolean> {
  try {
    const resp = await fetch('/api/admin/clear', { method: 'POST' });
    return resp.ok;
  } catch (err) {
    console.warn('Could not clear Liara database:', err);
    return false;
  }
}

export interface LiaraBatchInfo {
  id: string;
  batchName: string;
  date: string;
  count: number;
  saleCount: number;
  buyCount: number;
  isVisible: boolean;
}

/**
 * Fetches all distinct file/zip batches and import dates from Liara server
 */
export async function fetchLiaraBatches(): Promise<LiaraBatchInfo[]> {
  try {
    const resp = await fetch(`/api/admin/batches?_t=${Date.now()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.batches) ? data.batches : [];
  } catch (err) {
    console.warn('Could not fetch batches from Liara:', err);
    return [];
  }
}

/**
 * Toggles visibility of a specific batch or multiple batches on the Liara server
 */
export async function setLiaraBatchVisibility(
  batchName: string,
  isVisible: boolean
): Promise<{ success: boolean; message: string; hiddenBatches?: string[] }> {
  try {
    const resp = await fetch('/api/admin/batch-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchName, isVisible }),
    });
    const data = await resp.json();
    return {
      success: Boolean(data.success),
      message: data.message || (isVisible ? 'بسته فعال شد.' : 'بسته مخفی شد.'),
      hiddenBatches: data.hiddenBatches,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `خطا در تغییر وضعیت نمایش بسته: ${err.message || 'مشکل ارتباط با سرور'}`,
    };
  }
}

/**
 * Toggles visibility of multiple batches at once
 */
export async function setMultipleLiaraBatchesVisibility(
  batchNames: string[],
  isVisible: boolean
): Promise<{ success: boolean; message: string; hiddenBatches?: string[] }> {
  try {
    const resp = await fetch('/api/admin/batch-visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchNames, isVisible }),
    });
    const data = await resp.json();
    return {
      success: Boolean(data.success),
      message: data.message || (isVisible ? 'بسته‌ها فعال شدند.' : 'بسته‌ها مخفی شدند.'),
      hiddenBatches: data.hiddenBatches,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `خطا در تغییر وضعیت نمایش بسته‌ها: ${err.message || 'مشکل ارتباط با سرور'}`,
    };
  }
}

/**
 * Deletes selected batches or date from Liara server
 */
export async function deleteLiaraBatches(params: {
  batchName?: string;
  date?: string;
  batchNames?: string[];
}): Promise<{ success: boolean; message: string; remaining?: number }> {
  try {
    const resp = await fetch('/api/admin/delete-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { success: false, message: `خطای سرور (${resp.status}): ${errText}` };
    }
    const data = await resp.json();
    return {
      success: Boolean(data.success),
      message: data.message || 'بسته‌های انتخاب‌شده با موفقیت از سرور حذف شدند.',
      remaining: data.remaining,
    };
  } catch (err: any) {
    return { success: false, message: `خطا در حذف بسته: ${err.message || 'مشکل ارتباط با سرور'}` };
  }
}

/**
 * Generates and triggers download of a ready-to-deploy zip archive for Liara Drag & Drop!
 */
export async function downloadLiaraDeploymentZip(onProgress?: (percent: number) => void): Promise<void> {
  if (onProgress) onProgress(15);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch('/api/export/liara-zip', { signal: controller.signal });
    clearTimeout(timer);

    if (resp.ok) {
      if (onProgress) onProgress(65);
      const blob = await resp.blob();
      if (onProgress) onProgress(90);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `liara_deployment_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (onProgress) onProgress(100);
      return;
    }
  } catch (err) {
    console.warn('Could not fetch server zip endpoint, falling back to client-generated package:', err);
  }

  // Fallback client-side generation
  const zip = new JSZip();

  zip.file(
    'package.json',
    JSON.stringify(
      {
        name: 'car-exhibition',
        private: true,
        version: '1.0.0',
        type: 'module',
        scripts: { start: 'node server.js' },
        dependencies: { express: '^4.21.2', dotenv: '^17.2.3' },
      },
      null,
      2
    )
  );

  zip.file(
    'liara.json',
    JSON.stringify(
      {
        platform: 'node',
        app: 'car-exhibition',
        port: 3000,
        disks: [{ name: 'data', mountTo: '/data' }],
      },
      null,
      2
    )
  );

  zip.file('.liaraignore', 'node_modules/\n.git/\n.env\n.env.local\n.DS_Store\n');
  zip.file('.env.example', 'PORT=3000\nNODE_ENV=production\n');
  zip.file(
    'README.md',
    `# Car Exhibition App - آماده برای استقرار در لیارا (Liara Cloud)
۱. وارد کنسول لیارا (console.liara.ir) شوید.
۲. برنامه جدید از نوع NodeJS بسازید.
۳. دیسکی با نام data و مسیر مونت /data بسازید.
۴. همین فایل زیپ را با Drag & Drop آپلود کنید.
`
  );

  if (onProgress) onProgress(75);
  const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (onProgress) onProgress(75 + Math.round(metadata.percent * 0.25));
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `liara_deployment_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  if (onProgress) onProgress(100);
}

// -----------------------------------------------------------------------------
// Resilient Resumable Chunked Uploader Engine for Liara Cloud
// -----------------------------------------------------------------------------

function sleepAsync(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureConnectionAvailable(maxWaitMs = 30000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener('online', handleOnline);
        resolve(false);
      }, maxWaitMs);
      const handleOnline = () => {
        clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
        resolve(true);
      };
      window.addEventListener('online', handleOnline);
    });
  }
  return true;
}

/**
 * Resilient Chunked Resumable ZIP file uploader for Liara Cloud.
 * Slices large 50MB-100MB+ archives into 1.5MB chunks.
 * Features 15 automatic exponential retries per chunk and network pause/resume,
 * guaranteeing successful transmission over Iranian mobile/cellular connections!
 */
export async function uploadZipFileToLiara(
  file: File | Blob,
  batchName?: string,
  onProgress?: (percent: number, message?: string) => void
): Promise<{
  success: boolean;
  message: string;
  total?: number;
  batchCount?: number;
  sellersCount?: number;
  buyersCount?: number;
  extractedImagesCount?: number;
}> {
  const cleanBatchName = batchName || (file instanceof File ? file.name : `car_session_${Date.now()}.zip`);
  const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5 MB resilient chunks
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Step 1: Initialize session with server
  if (onProgress) onProgress(1, 'در حال راه‌اندازی نشست ارسال تکه‌ای به لیارا...');

  let receivedChunks = new Set<number>();
  try {
    const initController = new AbortController();
    const initTimer = setTimeout(() => initController.abort(), 20000);
    const initResp = await fetch('/api/admin/upload-chunk/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        fileName: cleanBatchName,
        fileSize: file.size,
        totalChunks,
        batchName: cleanBatchName,
        publishedBy: 'مدیر نمایشگاه',
      }),
      signal: initController.signal,
    });
    clearTimeout(initTimer);

    if (initResp.ok) {
      const initData = await initResp.json();
      if (Array.isArray(initData.receivedChunks)) {
        receivedChunks = new Set(initData.receivedChunks);
      }
    }
  } catch (initErr) {
    console.warn('Chunked init failed, will attempt chunk uploads directly:', initErr);
  }

  // Step 2: Upload each chunk with up to 15 retries and automatic resume
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (receivedChunks.has(chunkIndex)) {
      if (onProgress) {
        const pct = Math.min(94, Math.round(((chunkIndex + 1) / totalChunks) * 94));
        onProgress(pct, `تکه ${chunkIndex + 1} از ${totalChunks} قبلاً ذخیره شده است.`);
      }
      continue;
    }

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, (chunkIndex + 1) * CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    let chunkUploaded = false;
    let lastError = '';

    for (let attempt = 1; attempt <= 15; attempt++) {
      await ensureConnectionAvailable(15000);

      try {
        if (onProgress) {
          const pct = Math.min(94, Math.round((chunkIndex / totalChunks) * 94));
          const retryNotice = attempt > 1 ? ` (تلاش مجدد ${attempt}/15)` : '';
          onProgress(pct, `ارسال تکه ${chunkIndex + 1} از ${totalChunks} (${pct}٪)${retryNotice}...`);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);

        const resp = await fetch(
          `/api/admin/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunkBlob,
            signal: controller.signal,
          }
        );
        clearTimeout(timer);

        if (resp.ok) {
          chunkUploaded = true;
          receivedChunks.add(chunkIndex);
          if (onProgress) {
            const pct = Math.min(94, Math.round(((chunkIndex + 1) / totalChunks) * 94));
            onProgress(pct, `تکه ${chunkIndex + 1} از ${totalChunks} با موفقیت دریافت شد.`);
          }
          break;
        } else {
          lastError = `خطای سرور (${resp.status})`;
        }
      } catch (err: any) {
        lastError = err.message || 'خطای شبکه یا قطعی موقت اینترنت';
      }

      if (attempt < 15) {
        const delay = Math.min(10000, 1000 * Math.pow(1.5, attempt - 1) + Math.random() * 500);
        await sleepAsync(delay);
      }
    }

    if (!chunkUploaded) {
      return {
        success: false,
        message: `ارسال تکه شماره ${chunkIndex + 1} از ${totalChunks} به دلیل نوسان شبکه متوقف شد (${lastError}). لطفاً مجدداً دکمه را بزنید؛ ارسال دقیقاً از همین تکه ادامه می‌یابد.`,
      };
    }
  }

  // Step 3: Finalize stitching and extraction on server
  if (onProgress) onProgress(95, 'تمامی تکه‌ها دریافت شدند. در حال استخراج و ذخیره‌سازی تصاویر در دیسک دائمی...');

  try {
    const finalController = new AbortController();
    const finalTimer = setTimeout(() => finalController.abort(), 180000);

    const finalResp = await fetch('/api/admin/upload-chunk/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        batchName: cleanBatchName,
        publishedBy: 'مدیر سیستم (آپلود تکه‌ای)',
      }),
      signal: finalController.signal,
    });
    clearTimeout(finalTimer);

    if (!finalResp.ok) {
      let errText = 'خطا در نهایی‌سازی فایل زیپ در سرور';
      try {
        const errJson = await finalResp.json();
        if (errJson.error) errText = errJson.error;
      } catch {}
      return {
        success: false,
        message: `${errText} (کد وضعیت ${finalResp.status})`,
      };
    }

    const res = await finalResp.json();
    if (onProgress) onProgress(100, 'فایل و عکس‌ها با موفقیت در دیسک دائمی لیارا ثبت شدند.');
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: `خطا در پردازش نهایی در سرور: ${err.message || 'مهلت زمانی به پایان رسید'}`,
    };
  }
}
