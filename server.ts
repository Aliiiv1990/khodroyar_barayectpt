import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(__dirname, 'dist', 'index.html'));

// Generous body limit for car catalog datasets and images
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS configuration for local dev and Liara domain
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Database file path resolution (Liara Persistent Disk at /data or local fallback)
function getDbFilePath(): string {
  // 1. Check if Liara Persistent Disk is mounted at /data
  if (fs.existsSync('/data')) {
    return '/data/cars_database.json';
  }
  // 2. Local fallback folder
  const localDir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(localDir)) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return path.resolve(localDir, 'cars_database.json');
}

interface DatabasePayload {
  lastUpdated: string;
  publishedBy: string;
  hiddenBatches?: string[];
  listings: any[];
}

function readDatabaseFromDisk(): DatabasePayload {
  const filePath = getDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return {
          lastUpdated: new Date().toISOString(),
          publishedBy: 'سامانه',
          hiddenBatches: [],
          listings: parsed,
        };
      }
      return {
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        publishedBy: parsed.publishedBy || 'مدیر سیستم',
        hiddenBatches: Array.isArray(parsed.hiddenBatches) ? parsed.hiddenBatches : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings : [],
      };
    }
  } catch (err) {
    console.error('Error reading database file from disk:', err);
  }
  return {
    lastUpdated: new Date().toISOString(),
    publishedBy: 'پیش‌فرض',
    hiddenBatches: [],
    listings: [],
  };
}

// In-memory primary store for zero-latency responses without blocking event loop
let memoryDb: DatabasePayload = readDatabaseFromDisk();
let diskSaveTimeout: NodeJS.Timeout | null = null;
let isWritingToDisk = false;
let pendingDiskSave = false;

// Asynchronous, debounced disk saver that never blocks the Node.js event loop
function queueDiskSave() {
  if (diskSaveTimeout) clearTimeout(diskSaveTimeout);
  diskSaveTimeout = setTimeout(async () => {
    if (isWritingToDisk) {
      pendingDiskSave = true;
      return;
    }
    isWritingToDisk = true;
    try {
      const filePath = getDbFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${filePath}.tmp`;
      const serialized = JSON.stringify(memoryDb);
      await fs.promises.writeFile(tempPath, serialized, 'utf-8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.error('Error writing database file asynchronously:', err);
    } finally {
      isWritingToDisk = false;
      if (pendingDiskSave) {
        pendingDiskSave = false;
        queueDiskSave();
      }
    }
  }, 400);
}

// 4-day retention pruner for server database
function pruneOldServerListings(listings: any[]) {
  const now = Date.now();
  const maxAgeMs = 4 * 24 * 60 * 60 * 1000;
  return listings.filter((item) => {
    // Imported batches from file archives are kept active
    if (item.importBatchName) return true;
    if (!item.createdAt) return true;
    const itemTime = new Date(item.createdAt).getTime();
    if (isNaN(itemTime)) return true;
    return now - itemTime <= maxAgeMs;
  });
}

// -----------------------------------------------------------------------------
// Real-time Live Synchronization Across Devices (SSE & Meta)
// -----------------------------------------------------------------------------
const sseClients = new Set<express.Response>();

function broadcastSyncEvent(eventType = 'update', extraData: Record<string, any> = {}) {
  const payload = JSON.stringify({
    type: eventType,
    lastUpdated: memoryDb.lastUpdated,
    hiddenBatches: memoryDb.hiddenBatches || [],
    totalListings: memoryDb.listings.length,
    ...extraData,
  });
  const sseMsg = `data: ${payload}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(sseMsg);
    } catch {
      sseClients.delete(client);
    }
  }
}

// -----------------------------------------------------------------------------
// API Endpoints for Liara Cloud Backend
// -----------------------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  const active = pruneOldServerListings(memoryDb.listings);
  const salesCount = active.filter((l) => l.type === 'sale').length;
  const buysCount = active.filter((l) => l.type === 'buy_request').length;
  res.json({
    status: 'ok',
    platform: 'Liara Cloud (Node.js)',
    dbLocation: getDbFilePath(),
    isLiaraDisk: fs.existsSync('/data'),
    totalListings: active.length,
    salesCount,
    buysCount,
    lastUpdated: memoryDb.lastUpdated,
    serverTime: new Date().toISOString(),
  });
});

// GET /api/live-sync: Instant Server-Sent Events stream for real-time sync across phones/laptops
app.get('/api/live-sync', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Initial handshake
  res.write(`data: ${JSON.stringify({
    type: 'init',
    lastUpdated: memoryDb.lastUpdated,
    hiddenBatches: memoryDb.hiddenBatches || [],
    totalListings: memoryDb.listings.length,
  })}\n\n`);

  sseClients.add(res);

  // Keep-alive heartbeat every 20s
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(heartbeatTimer);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    sseClients.delete(res);
  });
});

// GET /api/sync-meta: Ultra-lightweight endpoint (~50 bytes) for polling checks
app.get('/api/sync-meta', (req, res) => {
  const active = pruneOldServerListings(memoryDb.listings);
  const salesCount = active.filter((l) => l.type === 'sale').length;
  const buysCount = active.filter((l) => l.type === 'buy_request').length;
  res.json({
    success: true,
    lastUpdated: memoryDb.lastUpdated,
    hiddenBatches: memoryDb.hiddenBatches || [],
    totalListings: active.length,
    salesCount,
    buysCount,
  });
});

// GET /api/images/:id: Ultra-fast cached image streaming endpoint (< 15ms response time)
app.get('/api/images/:id', (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim();
    const isFull = req.query.full === 'true';
    const found = memoryDb.listings.find(
      (l) => String(l.id) === targetId || String(l.imageFileName) === targetId
    );
    if (!found) {
      return res.status(404).send('Image not found');
    }
    const rawDataUrl = (isFull ? found.imageFullBase64 : found.imageThumbnailBase64) || found.imageThumbnailBase64 || found.imageFullBase64;
    if (!rawDataUrl) {
      return res.status(404).send('No image');
    }

    // 1. SVG illustration
    if (rawDataUrl.startsWith('data:image/svg+xml')) {
      const svgContent = rawDataUrl.includes('base64,')
        ? Buffer.from(rawDataUrl.split('base64,')[1], 'base64').toString('utf-8')
        : decodeURIComponent(rawDataUrl.split('utf8,')[1] || rawDataUrl.split(',')[1] || '');
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(svgContent);
    }

    // 2. JPEG / PNG / WebP image binary buffer
    const match = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(buffer);
    }

    res.status(400).send('Invalid image format');
  } catch (err: any) {
    res.status(500).send(err.message || 'Error serving image');
  }
});

// GET /api/listings: Retrieve listings from Liara database
// Supports ?format=fast (or ?fast=true) which returns lightweight catalog (~200KB for all 1,300 cars)
// allowing mobile devices to render the full catalog in under 300 milliseconds!
app.get('/api/listings', (req, res) => {
  try {
    const activeListings = pruneOldServerListings(memoryDb.listings);
    const hiddenSet = new Set(memoryDb.hiddenBatches || []);
    const onlyVisible = req.query.onlyVisible === 'true';
    const isFast = req.query.format === 'fast' || req.query.fast === 'true';

    const baseListings = onlyVisible
      ? activeListings.filter((l) => !hiddenSet.has(l.importBatchName || 'بسته پیش‌فرض سرور'))
      : activeListings;

    const returnedListings = isFast
      ? baseListings.map((item) => {
          const hasThumb = Boolean(item.imageThumbnailBase64 && item.imageThumbnailBase64.length > 30);
          const hasFull = Boolean(item.imageFullBase64 && item.imageFullBase64.length > 30);
          const isSvg = (item.imageThumbnailBase64 || '').startsWith('data:image/svg+xml');

          return {
            ...item,
            hasPhoto: hasThumb || hasFull,
            // Keep lightweight SVGs inlined, omit heavy raster image base64 in fast mode
            imageThumbnailBase64: isSvg ? item.imageThumbnailBase64 : '',
            imageFullBase64: '',
            imageUrl: hasThumb || hasFull ? `/api/images/${encodeURIComponent(item.id)}?thumb=true` : undefined,
          };
        })
      : baseListings;

    res.json({
      success: true,
      lastUpdated: memoryDb.lastUpdated,
      publishedBy: memoryDb.publishedBy,
      total: returnedListings.length,
      totalAllBatches: activeListings.length,
      hiddenBatches: Array.from(hiddenSet),
      listings: returnedListings,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/listings: Add single listing by colleague or user (grouped into manual entries batch)
app.post('/api/listings', (req, res) => {
  try {
    const newListing = req.body;
    if (!newListing || !newListing.model) {
      return res.status(400).json({ success: false, error: 'اطلاعات خودرو ناقص است.' });
    }

    const existing = memoryDb.listings.filter((l) => l.id !== newListing.id);
    const updatedListings = [
      {
        ...newListing,
        importBatchName: newListing.importBatchName || 'ثبت‌های دستی همکاران و مدیر',
        importDate: newListing.importDate || new Date().toLocaleDateString('fa-IR'),
        createdAt: newListing.createdAt || new Date().toISOString(),
        source: newListing.source || 'user',
      },
      ...existing,
    ];

    memoryDb.listings = pruneOldServerListings(updatedListings);
    memoryDb.lastUpdated = new Date().toISOString();
    queueDiskSave();
    broadcastSyncEvent('listing_added');

    res.json({
      success: true,
      message: 'آگهی با موفقیت در دیتابیس ابری ثبت گردید.',
      listing: newListing,
      total: memoryDb.listings.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/listings/:id & POST /api/listings/update: Update an existing listing (all fields except phoneNumber)
const handleUpdateListing = (req: express.Request, res: express.Response) => {
  try {
    const targetId = String(req.params.id || req.body?.id || '').trim();
    const updates = req.body;
    if (!targetId || !updates) {
      return res.status(400).json({ success: false, error: 'شناسه آگهی ارسال نشده است.' });
    }

    const foundIndex = memoryDb.listings.findIndex((l) => String(l.id) === targetId);
    let updatedItem: any;

    if (foundIndex !== -1) {
      const existing = memoryDb.listings[foundIndex];
      updatedItem = {
        ...existing,
        ...updates,
        id: existing.id,
        // Strictly preserve phoneNumber and original media/batch metadata
        phoneNumber: existing.phoneNumber || updates.phoneNumber,
        imageFileName: existing.imageFileName || updates.imageFileName,
        imageThumbnailBase64: existing.imageThumbnailBase64 || updates.imageThumbnailBase64,
        imageFullBase64: existing.imageFullBase64 || updates.imageFullBase64,
        importBatchName: existing.importBatchName || updates.importBatchName,
        importDate: existing.importDate || updates.importDate,
        createdAt: existing.createdAt || updates.createdAt,
        isEdited: true,
      };
      memoryDb.listings[foundIndex] = updatedItem;
    } else {
      // If the listing wasn't in memoryDb yet, insert it if full data is provided, or request full item
      if (!updates.imageThumbnailBase64 && !updates.imageFullBase64 && !updates.allowInsertWithoutImage) {
        return res.json({
          success: true,
          needsFullInsert: true,
        });
      }
      const { allowInsertWithoutImage, ...cleanUpdates } = updates;
      updatedItem = {
        ...cleanUpdates,
        id: targetId,
        importBatchName: cleanUpdates.importBatchName || 'ثبت‌های دستی همکاران و مدیر',
        importDate: cleanUpdates.importDate || new Date().toLocaleDateString('fa-IR'),
        createdAt: cleanUpdates.createdAt || new Date().toISOString(),
        isEdited: true,
      };
      memoryDb.listings.unshift(updatedItem);
    }

    memoryDb.lastUpdated = new Date().toISOString();
    queueDiskSave();

    const { imageThumbnailBase64, imageFullBase64, _searchIndex, ...lightweightUpdated } = updatedItem;
    broadcastSyncEvent('listing_updated', { listing: lightweightUpdated });

    res.json({
      success: true,
      message: 'تغییرات آگهی با موفقیت در دیتابیس ذخیره شد و برای همه دستگاه‌ها اعمال گردید.',
      listing: lightweightUpdated,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.put('/api/listings/:id', handleUpdateListing);
app.post('/api/listings/update', handleUpdateListing);

// POST /api/admin/sync: Bulk upload/merge feed by admin without wiping previous batches
app.post('/api/admin/sync', (req, res) => {
  try {
    const { listings: incomingListings, append = true, publishedBy } = req.body;
    if (!Array.isArray(incomingListings)) {
      return res.status(400).json({ success: false, error: 'لیست آگهی‌ها ارسال نشده است.' });
    }

    // Collect all incoming batch names
    const incomingBatchNames = new Set<string>();
    for (const item of incomingListings) {
      if (item.importBatchName) {
        incomingBatchNames.add(item.importBatchName);
      }
    }

    const incomingIds = new Set(incomingListings.map((l) => String(l.id)));

    // Preserve existing listings:
    // If incoming listings have specific batch names, only replace matching IDs or old versions of the same batch.
    // ALWAYS preserve other batches and manual entries!
    let finalList: any[] = [];
    if (incomingBatchNames.size > 0 && append === false) {
      const otherBatches = memoryDb.listings.filter(
        (l) => !incomingBatchNames.has(l.importBatchName || '') && !incomingIds.has(String(l.id))
      );
      finalList = [...incomingListings, ...otherBatches];
    } else {
      // Append / Merge mode: update matching IDs, preserve all other existing listings
      const preservedExisting = memoryDb.listings.filter((l) => !incomingIds.has(String(l.id)));
      finalList = [...incomingListings, ...preservedExisting];
    }

    const pruned = pruneOldServerListings(finalList);
    memoryDb = {
      lastUpdated: new Date().toISOString(),
      publishedBy: publishedBy || 'مدیر سیستم',
      hiddenBatches: memoryDb.hiddenBatches || [],
      listings: pruned,
    };

    queueDiskSave();
    broadcastSyncEvent('bulk_sync');

    res.json({
      success: true,
      message: `بانک اطلاعات با موفقیت در سرور و دیتابیس لیارا به روزرسانی شد (${pruned.length} خودرو).`,
      count: pruned.length,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/sync-metadata: Ultra-fast (under 1 second) sync of catalog text (< 300KB)
// Instantly updates the database and broadcasts to all phones in real-time
app.post('/api/admin/sync-metadata', (req, res) => {
  try {
    const { listings: incomingListings, append = true, publishedBy } = req.body;
    if (!Array.isArray(incomingListings)) {
      return res.status(400).json({ success: false, error: 'لیست آگهی‌ها ارسال نشده است.' });
    }

    const incomingMap = new Map<string, any>();
    for (const item of incomingListings) {
      incomingMap.set(String(item.id), item);
    }

    // Merge metadata while strictly preserving any existing images already in memoryDb
    const existingListings = memoryDb.listings.map((existing) => {
      const incoming = incomingMap.get(String(existing.id));
      if (incoming) {
        incomingMap.delete(String(existing.id));
        return {
          ...incoming,
          imageThumbnailBase64: existing.imageThumbnailBase64 || incoming.imageThumbnailBase64,
          imageFullBase64: existing.imageFullBase64 || incoming.imageFullBase64,
        };
      }
      return existing;
    });

    // Add remaining new items
    for (const newItem of incomingMap.values()) {
      existingListings.unshift(newItem);
    }

    const pruned = pruneOldServerListings(existingListings);
    memoryDb = {
      lastUpdated: new Date().toISOString(),
      publishedBy: publishedBy || 'مدیر سیستم',
      hiddenBatches: memoryDb.hiddenBatches || [],
      listings: pruned,
    };

    queueDiskSave();
    broadcastSyncEvent('bulk_sync');

    res.json({
      success: true,
      message: `اطلاعات متنی تمامی ${pruned.length} خودرو در ۱ ثانیه در سرور فعال شد و برای تمام کاربران نمایش داده می‌شود.`,
      count: pruned.length,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/sync-images: Background batch upload of images
app.post('/api/admin/sync-images', (req, res) => {
  try {
    const { images = [] } = req.body;
    if (!Array.isArray(images)) {
      return res.status(400).json({ success: false, error: 'تصاویر ارسال نشده است.' });
    }

    const imgMap = new Map<string, { thumb?: string; full?: string }>();
    for (const img of images) {
      if (img && img.id) {
        imgMap.set(String(img.id), img);
      }
    }

    let updatedCount = 0;
    for (const item of memoryDb.listings) {
      const found = imgMap.get(String(item.id));
      if (found) {
        if (found.thumb) item.imageThumbnailBase64 = found.thumb;
        if (found.full) item.imageFullBase64 = found.full;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      queueDiskSave();
    }

    res.json({ success: true, updated: updatedCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/clear: Clear database
app.post('/api/admin/clear', (req, res) => {
  try {
    memoryDb = {
      lastUpdated: new Date().toISOString(),
      publishedBy: 'مدیر سیستم',
      hiddenBatches: [],
      listings: [],
    };
    queueDiskSave();
    broadcastSyncEvent('clear');
    res.json({ success: true, message: 'دیتابیس لیارا با موفقیت پاکسازی شد.', count: 0 });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/batches: List all distinct batches, days, and their visibility state
app.get('/api/admin/batches', (req, res) => {
  try {
    const hiddenSet = new Set(memoryDb.hiddenBatches || []);
    const batchMap = new Map<
      string,
      { id: string; batchName: string; date: string; count: number; saleCount: number; buyCount: number; isVisible: boolean }
    >();

    for (const item of memoryDb.listings) {
      const bName = item.importBatchName || 'بسته پیش‌فرض سرور';
      const bDate = item.importDate || (item.createdAt ? new Date(item.createdAt).toLocaleDateString('fa-IR') : 'نامشخص');
      const key = `${bName}___${bDate}`;
      const existing = batchMap.get(key) || {
        id: key,
        batchName: bName,
        date: bDate,
        count: 0,
        saleCount: 0,
        buyCount: 0,
        isVisible: !hiddenSet.has(bName),
      };
      existing.count++;
      if (item.type === 'buy_request') {
        existing.buyCount++;
      } else {
        existing.saleCount++;
      }
      batchMap.set(key, existing);
    }

    res.json({
      success: true,
      batches: Array.from(batchMap.values()),
      hiddenBatches: Array.from(hiddenSet),
      total: memoryDb.listings.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/batch-visibility: Toggle visibility of a batch or multiple batches
app.post('/api/admin/batch-visibility', (req, res) => {
  try {
    const { batchName, isVisible, batchNames } = req.body;
    const targets = Array.isArray(batchNames) ? batchNames : batchName ? [batchName] : [];
    if (targets.length === 0) {
      return res.status(400).json({ success: false, error: 'نام بسته مشخص نشده است.' });
    }

    const currentHidden = new Set(memoryDb.hiddenBatches || []);
    for (const name of targets) {
      if (isVisible) {
        currentHidden.delete(name);
      } else {
        currentHidden.add(name);
      }
    }

    memoryDb.hiddenBatches = Array.from(currentHidden);
    // Note: Do NOT mutate memoryDb.lastUpdated here so clients only update their lightweight
    // hiddenBatches set (~80 bytes) without re-downloading the entire /api/listings payload.
    queueDiskSave();
    broadcastSyncEvent('visibility_change');

    res.json({
      success: true,
      message: isVisible
        ? 'بسته فعال شد و به همه نمایش داده می‌شود.'
        : 'بسته مخفی شد (داده‌ها در سرور محفوظ است ولی در لیست به کاربران نمایش داده نمی‌شود).',
      hiddenBatches: memoryDb.hiddenBatches,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/delete-batch: Delete all listings belonging to a specific batch or date
app.post('/api/admin/delete-batch', (req, res) => {
  try {
    const { batchName, date, batchNames } = req.body;
    const namesSet = new Set<string>(Array.isArray(batchNames) ? batchNames : batchName ? [batchName] : []);

    const beforeCount = memoryDb.listings.length;
    memoryDb.listings = memoryDb.listings.filter((item) => {
      const bName = item.importBatchName || 'بسته پیش‌فرض سرور';
      const bDate = item.importDate || (item.createdAt ? new Date(item.createdAt).toLocaleDateString('fa-IR') : 'نامشخص');
      if (namesSet.has(bName)) return false;
      if (date && bDate === date) return false;
      return true;
    });

    if (memoryDb.hiddenBatches) {
      memoryDb.hiddenBatches = memoryDb.hiddenBatches.filter((name) => !namesSet.has(name));
    }

    memoryDb.lastUpdated = new Date().toISOString();
    queueDiskSave();
    broadcastSyncEvent('batch_deleted');

    const removedCount = beforeCount - memoryDb.listings.length;
    res.json({
      success: true,
      message: `${removedCount} آگهی با موفقیت از سرور حذف گردید.`,
      remaining: memoryDb.listings.length,
      removedCount,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/export: Direct JSON backup download
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=liara_cars_backup_${Date.now()}.json`);
  res.send(JSON.stringify(memoryDb.listings));
});

// Helper to recursively add files from a directory to JSZip
function addDirToZip(zipInstance: any, dirPath: string, rootPrefix = '') {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = rootPrefix ? `${rootPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirToZip(zipInstance, fullPath, zipPath);
    } else if (entry.isFile()) {
      zipInstance.file(zipPath, fs.readFileSync(fullPath));
    }
  }
}

// GET /api/export/liara-zip: Generate complete ready-to-deploy zip for Liara Drag & Drop!
app.get('/api/export/liara-zip', async (req, res) => {
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    // 1. Production package.json (minimal dependencies to ensure 5-second deploy in Liara container)
    const prodPackageJson = {
      name: 'car-exhibition',
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: {
        start: 'node server.js',
      },
      dependencies: {
        express: '^4.21.2',
        dotenv: '^17.2.3',
      },
    };
    zip.file('package.json', JSON.stringify(prodPackageJson, null, 2));

    // 2. server.js (compiled standalone server)
    const serverJsPath = path.resolve(__dirname, 'server.js');
    if (fs.existsSync(serverJsPath)) {
      zip.file('server.js', fs.readFileSync(serverJsPath));
    } else {
      const serverTsPath = path.resolve(__dirname, 'server.ts');
      if (fs.existsSync(serverTsPath)) {
        zip.file('server.js', fs.readFileSync(serverTsPath));
      }
    }

    // 3. liara.json
    const liaraJsonContent = {
      platform: 'node',
      app: 'car-exhibition',
      port: 3000,
      disks: [
        {
          name: 'data',
          mountTo: '/data',
        },
      ],
    };
    zip.file('liara.json', JSON.stringify(liaraJsonContent, null, 2));

    // 4. .liaraignore
    zip.file('.liaraignore', 'node_modules/\n.git/\n.env\n.env.local\n.DS_Store\n');

    // 5. .env.example
    zip.file('.env.example', 'PORT=3000\nNODE_ENV=production\n');

    // 6. dist folder (all compiled frontend assets)
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      addDirToZip(zip, distPath, 'dist');
    }

    // 7. README.md
    zip.file(
      'README.md',
      `# Car Exhibition App - آماده برای استقرار در لیارا (Liara Cloud)
این بسته شامل سرور Node.js و فرانت‌اند کامل بیلدشده است.

## نحوه استقرار در ۳ مرحله ساده:
۱. وارد کنسول لیارا (console.liara.ir) شوید و یک برنامه از نوع NodeJS بسازید.
۲. در بخش «دیسک‌ها»، یک دیسک با نام data و مسیر مونت /data ایجاد کنید.
۳. همین فایل زیپ را با Drag & Drop در بخش استقرار رها کنید.
`
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="liara_deployment.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('Error creating Liara zip deployment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Frontend Integration (Vite dev middleware vs Production static serving)
// -----------------------------------------------------------------------------
async function setupFrontend() {
  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      app.get('*', (req, res) => {
        res.send('پروژه ساخته شده است اما پوشه dist موجود نیست. لطفاً دستور npm run build را اجرا نمایید.');
      });
    }
  } else {
    // Development mode: Vite dev server middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
}

setupFrontend().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚗 Car Exhibition Server is LIVE on Liara Cloud!`);
    console.log(`📍 Listening on: http://0.0.0.0:${PORT}`);
    console.log(`💾 Database file: ${getDbFilePath()}`);
    console.log(`=================================================`);
  });
});
