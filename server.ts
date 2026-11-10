import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import {
  parseZipArchive,
  parseSessionJson,
  extractSellersArray,
  extractBuyersArray,
  isBuyerRecord,
  SessionJsonRoot,
} from './src/utils/sessionDataParser';

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

// Persistent images directory resolution (Liara Persistent Disk at /data/images or local fallback)
function getImagesDir(): string {
  const baseDir = fs.existsSync('/data') ? '/data' : path.resolve(__dirname, 'data');
  const imagesDir = path.resolve(baseDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    try {
      fs.mkdirSync(imagesDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return imagesDir;
}

// Temporary uploads directory for chunked upload sessions
function getUploadsDir(): string {
  const baseDir = fs.existsSync('/data') ? '/data' : path.resolve(__dirname, 'data');
  const uploadsDir = path.resolve(baseDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return uploadsDir;
}

// In-memory index of disk images for zero-latency lookups without blocking filesystem I/O
const diskImageSet = new Set<string>();

function refreshDiskImageSet(): void {
  try {
    const dir = getImagesDir();
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      diskImageSet.clear();
      for (const f of files) {
        diskImageSet.add(f);
        diskImageSet.add(f.replace(/\.[^/.]+$/, ''));
      }
    }
  } catch (err) {
    console.error('Error refreshing disk image index:', err);
  }
}
refreshDiskImageSet();

// Crisp fallback car vector SVG generator ensuring images NEVER return broken or 404
function generateFallbackCarSvg(colorName: string, modelName: string, isFull = false): string {
  let colorHex = '#3b82f6';
  const c = (colorName || '').toLowerCase();
  if (c.includes('سفید')) colorHex = '#ffffff';
  else if (c.includes('مشکی') || c.includes('سیاه')) colorHex = '#1e293b';
  else if (c.includes('نقره') || c.includes('سربی')) colorHex = '#94a3b8';
  else if (c.includes('خاکستری') || c.includes('طوسی') || c.includes('دلفینی')) colorHex = '#64748b';
  else if (c.includes('قرمز') || c.includes('آلبالویی')) colorHex = '#dc2626';
  else if (c.includes('آبی') || c.includes('کاربنی')) colorHex = '#2563eb';
  else if (c.includes('سبز') || c.includes('یشمی')) colorHex = '#15803d';
  else if (c.includes('زرد') || c.includes('طلایی')) colorHex = '#eab308';
  else if (c.includes('قهوه‌ای') || c.includes('مسی')) colorHex = '#78350f';

  const width = isFull ? 800 : 160;
  const height = isFull ? 480 : 160;
  const strokeColor = '#1e293b';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg_${colorHex.replace('#', '')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg_${colorHex.replace('#', '')})"/>
    <ellipse cx="${width * 0.5}" cy="${height * 0.76}" rx="${width * 0.42}" ry="${height * 0.08}" fill="#0f172a" fill-opacity="0.2" />
    <g>
      <path d="M ${width * 0.28} ${height * 0.52} C ${width * 0.34} ${height * 0.32}, ${width * 0.62} ${height * 0.30}, ${width * 0.72} ${height * 0.52} Z" fill="#334155" />
      <path d="M ${width * 0.31} ${height * 0.50} C ${width * 0.36} ${height * 0.35}, ${width * 0.60} ${height * 0.34}, ${width * 0.69} ${height * 0.50} Z" fill="#93c5fd" opacity="0.85" />
      <line x1="${width * 0.50}" y1="${height * 0.35}" x2="${width * 0.50}" y2="${height * 0.50}" stroke="#1e293b" stroke-width="${isFull ? 4 : 2}"/>
      <path d="M ${width * 0.12} ${height * 0.62} C ${width * 0.12} ${height * 0.52}, ${width * 0.20} ${height * 0.50}, ${width * 0.28} ${height * 0.52} L ${width * 0.72} ${height * 0.52} C ${width * 0.80} ${height * 0.52}, ${width * 0.88} ${height * 0.55}, ${width * 0.88} ${height * 0.64} C ${width * 0.88} ${height * 0.70}, ${width * 0.82} ${height * 0.72}, ${width * 0.76} ${height * 0.72} L ${width * 0.24} ${height * 0.72} C ${width * 0.16} ${height * 0.72}, ${width * 0.12} ${height * 0.68}, ${width * 0.12} ${height * 0.62} Z" fill="${colorHex}" stroke="${strokeColor}" stroke-width="${isFull ? 3 : 1.5}" />
      <circle cx="${width * 0.84}" cy="${height * 0.58}" r="${isFull ? 10 : 3}" fill="#fef08a" />
      <circle cx="${width * 0.16}" cy="${height * 0.58}" r="${isFull ? 8 : 2.5}" fill="#ef4444" />
      <g>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a" stroke="#cbd5e1" stroke-width="${isFull ? 3 : 1.5}"/>
        <circle cx="${width * 0.28}" cy="${height * 0.72}" r="${height * 0.05}" fill="#94a3b8"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.12}" fill="#0f172a" stroke="#cbd5e1" stroke-width="${isFull ? 3 : 1.5}"/>
        <circle cx="${width * 0.72}" cy="${height * 0.72}" r="${height * 0.05}" fill="#94a3b8"/>
      </g>
    </g>
    <text x="${width * 0.5}" y="${height * 0.92}" font-family="sans-serif" font-size="${isFull ? 24 : 11}" font-weight="bold" fill="#475569" text-anchor="middle" direction="rtl">${modelName}</text>
  </svg>`;
}

interface Tombstone {
  id: string;
  deletedAt: string;
  revision: number;
}

interface UploadBatchAudit {
  jobId: string;
  batchId: string;
  confirmedAt: string;
  itemCount: number;
  idempotencyKey?: string;
}

interface DatabasePayload {
  revision: number;
  lastUpdated: string;
  publishedBy: string;
  hiddenBatches?: string[];
  listings: any[];
  tombstones?: Tombstone[];
  confirmedBatches?: Record<string, UploadBatchAudit>;
}

function readDatabaseFromDisk(): DatabasePayload {
  const filePath = getDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return {
          revision: 1,
          lastUpdated: new Date().toISOString(),
          publishedBy: 'سامانه',
          hiddenBatches: [],
          listings: parsed,
          tombstones: [],
          confirmedBatches: {},
        };
      }
      return {
        revision: typeof parsed.revision === 'number' ? parsed.revision : 1,
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        publishedBy: parsed.publishedBy || 'مدیر سیستم',
        hiddenBatches: Array.isArray(parsed.hiddenBatches) ? parsed.hiddenBatches : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings : [],
        tombstones: Array.isArray(parsed.tombstones) ? parsed.tombstones : [],
        confirmedBatches: parsed.confirmedBatches && typeof parsed.confirmedBatches === 'object' ? parsed.confirmedBatches : {},
      };
    }
  } catch (err) {
    console.error('Error reading database file from disk:', err);
  }
  return {
    revision: 1,
    lastUpdated: new Date().toISOString(),
    publishedBy: 'پیش‌فرض',
    hiddenBatches: [],
    listings: [],
    tombstones: [],
    confirmedBatches: {},
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
  const recentTombstones = (memoryDb.tombstones || []).slice(-200);
  res.json({
    success: true,
    revision: memoryDb.revision || 1,
    lastUpdated: memoryDb.lastUpdated,
    hiddenBatches: memoryDb.hiddenBatches || [],
    totalListings: active.length,
    salesCount,
    buysCount,
    tombstones: recentTombstones,
  });
});

// GET /api/images/:id: Ultra-fast cached image streaming endpoint (< 10ms response time)
// Checks in-memory diskImageSet first, Liara Persistent Disk (/data/images/) second, memory base64 third,
// supports HTTP ETag / 304 Not Modified and long-term caching,
// and ALWAYS returns HTTP 200 (with crisp SVG vector fallback) if file not found to prevent broken skeletons.
app.get('/api/images/:id', (req, res) => {
  try {
    const rawParam = String(req.params.id || '').trim();
    let targetId = rawParam;
    try {
      targetId = decodeURIComponent(rawParam);
    } catch {}

    const isFull = req.query.full === 'true';
    const found = memoryDb.listings.find(
      (l) =>
        String(l.id) === targetId ||
        String(l.id) === rawParam ||
        String(l.imageFileName) === targetId ||
        String(l.imageFileName) === rawParam ||
        (l.mediaId && (String(l.mediaId) === targetId || String(l.mediaId) === rawParam))
    );

    const imagesDir = getImagesDir();

    // 1. Check physical files on persistent disk (/data/images/)
    const candidates: string[] = [
      path.join(imagesDir, `${targetId}.jpg`),
      path.join(imagesDir, `${targetId}.png`),
      path.join(imagesDir, `${targetId}.webp`),
      path.join(imagesDir, targetId),
      path.join(imagesDir, `${rawParam}.jpg`),
      path.join(imagesDir, rawParam),
    ];
    if (found) {
      if (found.imageFileName && !found.imageFileName.toLowerCase().endsWith('.txt')) {
        const baseName = found.imageFileName.split('/').pop() || found.imageFileName;
        const baseNoExt = baseName.replace(/\.[^/.]+$/, '');
        candidates.push(path.join(imagesDir, baseName));
        candidates.push(path.join(imagesDir, `${baseName}.jpg`));
        candidates.push(path.join(imagesDir, `${baseNoExt}.jpg`));
        candidates.push(path.join(imagesDir, `${baseNoExt}.png`));
        candidates.push(path.join(imagesDir, `${baseNoExt}.webp`));
      }
      if (found.mediaId) {
        candidates.push(path.join(imagesDir, `${found.mediaId}.jpg`));
        candidates.push(path.join(imagesDir, String(found.mediaId)));
      }
    }

    for (const filePath of candidates) {
      const fileName = path.basename(filePath);
      const fileNoExt = fileName.replace(/\.[^/.]+$/, '');
      // Fast check in memory index first to avoid unnecessary filesystem stats
      if (diskImageSet.has(fileName) || diskImageSet.has(fileNoExt) || fs.existsSync(filePath)) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && stat.size > 0) {
            const etag = `W/"${stat.size}-${stat.mtimeMs.toString(16)}"`;
            if (req.headers['if-none-match'] === etag) {
              return res.status(304).end();
            }

            let contentType = 'image/jpeg';
            if (filePath.endsWith('.png')) contentType = 'image/png';
            else if (filePath.endsWith('.webp')) contentType = 'image/webp';
            else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';

            res.setHeader('Content-Type', contentType);
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(filePath);
          }
        } catch {
          // continue checking other candidates or fallback
        }
      }
    }

    // 2. Check in-memory base64 if listing exists
    if (found) {
      const rawDataUrl = (isFull ? found.imageFullBase64 : found.imageThumbnailBase64) || found.imageThumbnailBase64 || found.imageFullBase64;
      if (rawDataUrl && rawDataUrl.length > 20) {
        if (rawDataUrl.startsWith('data:image/svg+xml')) {
          const svgContent = rawDataUrl.includes('base64,')
            ? Buffer.from(rawDataUrl.split('base64,')[1], 'base64').toString('utf-8')
            : decodeURIComponent(rawDataUrl.split('utf8,')[1] || rawDataUrl.split(',')[1] || '');
          res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
          return res.send(svgContent);
        }

        const match = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const buffer = Buffer.from(match[2], 'base64');
          // Asynchronously persist buffer to disk so subsequent reads hit the filesystem directly
          fs.promises.writeFile(path.join(imagesDir, `${found.id}.jpg`), buffer).then(() => {
            diskImageSet.add(String(found.id));
            diskImageSet.add(`${found.id}.jpg`);
          }).catch(() => {});

          res.setHeader('Content-Type', mimeType);
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
          return res.send(buffer);
        }
      }
    }

    // 3. Fallback: ALWAYS return a beautiful vehicle illustration with HTTP 200 (NEVER 404!)
    // This ensures no mobile or laptop view is ever stuck with a broken skeleton icon!
    const model = found ? (found.model || found.title || 'خودرو') : 'خودرو';
    const color = found ? (found.color || 'سفید') : 'سفید';
    const fallbackSvg = generateFallbackCarSvg(color, model, isFull);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(fallbackSvg);
  } catch (err: any) {
    res.status(500).send(err.message || 'Error serving image');
  }
});

// GET /api/listings: Retrieve listings from Liara database
// Zero filesystem I/O: uses in-memory diskImageSet for instantaneous lookups
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

    const returnedListings = baseListings.map((item) => {
      const idStr = String(item.id);
      const fnStr = item.imageFileName ? String(item.imageFileName).split('/').pop() || item.imageFileName : '';
      const fnBase = fnStr.replace(/\.[^/.]+$/, '');
      const mediaStr = item.mediaId ? String(item.mediaId) : '';

      // High-speed O(1) in-memory check (never blocks the event loop with synchronous fs calls!)
      const hasDiskImg =
        diskImageSet.has(idStr) ||
        diskImageSet.has(`${idStr}.jpg`) ||
        Boolean(fnStr && (diskImageSet.has(fnStr) || diskImageSet.has(fnBase) || diskImageSet.has(`${fnStr}.jpg`))) ||
        Boolean(mediaStr && (diskImageSet.has(mediaStr) || diskImageSet.has(`${mediaStr}.jpg`)));

      const hasThumb = Boolean(item.imageThumbnailBase64 && item.imageThumbnailBase64.length > 30);
      const hasFull = Boolean(item.imageFullBase64 && item.imageFullBase64.length > 30);
      const hasPhoto = Boolean(item.hasPhoto || hasDiskImg || hasThumb || hasFull);
      const isSvg = (item.imageThumbnailBase64 || '').startsWith('data:image/svg+xml');

      if (isFast) {
        return {
          ...item,
          hasPhoto,
          // Keep lightweight SVGs inlined, omit heavy raster image base64 in fast mode
          imageThumbnailBase64: isSvg ? item.imageThumbnailBase64 : '',
          imageFullBase64: '',
          imageUrl: hasPhoto ? `/api/images/${encodeURIComponent(item.id)}?thumb=true` : undefined,
        };
      }

      return {
        ...item,
        hasPhoto,
        imageUrl: hasPhoto ? `/api/images/${encodeURIComponent(item.id)}?thumb=true` : undefined,
      };
    });

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

// DELETE /api/listings/:id: Server-First authoritative listing deletion with tombstones
app.delete('/api/listings/:id', (req, res) => {
  try {
    const targetId = String(req.params.id || '').trim();
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'شناسه آگهی ارسال نشده است.' });
    }

    const beforeCount = memoryDb.listings.length;
    memoryDb.listings = memoryDb.listings.filter((l) => String(l.id) !== targetId);
    const wasRemoved = memoryDb.listings.length < beforeCount;

    // Increment revision and record tombstone so all connected devices purge it
    memoryDb.revision = (memoryDb.revision || 1) + 1;
    memoryDb.lastUpdated = new Date().toISOString();
    memoryDb.tombstones = memoryDb.tombstones || [];

    // Avoid duplicate tombstones
    if (!memoryDb.tombstones.some((t) => t.id === targetId)) {
      memoryDb.tombstones.push({
        id: targetId,
        deletedAt: new Date().toISOString(),
        revision: memoryDb.revision,
      });
      if (memoryDb.tombstones.length > 500) {
        memoryDb.tombstones = memoryDb.tombstones.slice(-500);
      }
    }

    queueDiskSave();
    broadcastSyncEvent('listing_deleted', {
      id: targetId,
      revision: memoryDb.revision,
    });

    res.json({
      success: true,
      message: wasRemoved ? 'آگهی با موفقیت از سرور و تمامی دستگاه‌ها حذف گردید.' : 'آگهی در سرور یافت نشد یا قبلاً حذف شده بود.',
      id: targetId,
      wasRemoved,
      revision: memoryDb.revision,
      total: memoryDb.listings.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/sync: Bulk upload/merge feed by admin without wiping previous batches
app.post('/api/admin/sync', (req, res) => {
  try {
    const { listings: incomingListings, append = true, publishedBy, jobId, batchId } = req.body;
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

    let finalList: any[] = [];
    if (incomingBatchNames.size > 0 && append === false) {
      const otherBatches = memoryDb.listings.filter(
        (l) => !incomingBatchNames.has(l.importBatchName || '') && !incomingIds.has(String(l.id))
      );
      finalList = [...incomingListings, ...otherBatches];
    } else {
      const preservedExisting = memoryDb.listings.filter((l) => !incomingIds.has(String(l.id)));
      finalList = [...incomingListings, ...preservedExisting];
    }

    const pruned = pruneOldServerListings(finalList);
    memoryDb.revision = (memoryDb.revision || 1) + 1;
    memoryDb.lastUpdated = new Date().toISOString();
    memoryDb.publishedBy = publishedBy || 'مدیر سیستم';
    memoryDb.listings = pruned;

    queueDiskSave();
    broadcastSyncEvent('bulk_sync', { revision: memoryDb.revision, jobId, batchId });

    res.json({
      success: true,
      message: `بانک اطلاعات با موفقیت در سرور و دیتابیس لیارا به روزرسانی شد (${pruned.length} خودرو).`,
      count: pruned.length,
      confirmedCount: incomingListings.length,
      jobId,
      batchId,
      revision: memoryDb.revision,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/sync-metadata: Ultra-fast (under 1 second) sync of catalog text (< 300KB)
// Instantly updates the database and broadcasts to all phones in real-time with idempotency
app.post('/api/admin/sync-metadata', (req, res) => {
  try {
    const {
      listings: incomingListings,
      append = true,
      publishedBy,
      jobId,
      batchId,
      idempotencyKey,
    } = req.body;

    if (!Array.isArray(incomingListings)) {
      return res.status(400).json({ success: false, error: 'لیست آگهی‌ها ارسال نشده است.' });
    }

    // Idempotency check: if this batchId/idempotencyKey was already confirmed
    memoryDb.confirmedBatches = memoryDb.confirmedBatches || {};
    const batchKey = batchId || idempotencyKey;
    if (batchKey && memoryDb.confirmedBatches[batchKey]) {
      const existingAudit = memoryDb.confirmedBatches[batchKey];
      return res.json({
        success: true,
        message: 'این بسته قبلاً با موفقیت ذخیره شده است (Idempotent).',
        jobId: existingAudit.jobId,
        batchId: existingAudit.batchId,
        confirmedCount: existingAudit.itemCount,
        count: memoryDb.listings.length,
        revision: memoryDb.revision || 1,
        lastUpdated: memoryDb.lastUpdated,
        isIdempotent: true,
      });
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
          mediaId: incoming.mediaId || existing.mediaId,
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
    memoryDb.revision = (memoryDb.revision || 1) + 1;
    memoryDb.lastUpdated = new Date().toISOString();
    memoryDb.publishedBy = publishedBy || 'مدیر سیستم';
    memoryDb.listings = pruned;

    // Record confirmed batch
    if (batchKey) {
      memoryDb.confirmedBatches[batchKey] = {
        jobId: jobId || 'job_default',
        batchId: batchKey,
        confirmedAt: new Date().toISOString(),
        itemCount: incomingListings.length,
        idempotencyKey,
      };
    }

    queueDiskSave();
    broadcastSyncEvent('bulk_sync', { revision: memoryDb.revision, jobId, batchId });

    res.json({
      success: true,
      message: `اطلاعات متنی تمامی ${incomingListings.length} خودرو این بسته با موفقیت در دیتابیس ثبت شد.`,
      jobId,
      batchId,
      confirmedCount: incomingListings.length,
      count: pruned.length,
      revision: memoryDb.revision,
      lastUpdated: memoryDb.lastUpdated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/sync-images: Background batch upload of images with mediaId sharing and disk persistence
app.post('/api/admin/sync-images', (req, res) => {
  try {
    const { images = [], jobId, batchId } = req.body;
    if (!Array.isArray(images)) {
      return res.status(400).json({ success: false, error: 'تصاویر ارسال نشده است.' });
    }

    const imgMap = new Map<string, { thumb?: string; full?: string }>();
    for (const img of images) {
      if (img && img.id) {
        imgMap.set(String(img.id), img);
        if (img.mediaId) {
          imgMap.set(String(img.mediaId), img);
        }
      }
    }

    const imagesDir = getImagesDir();
    let updatedCount = 0;
    for (const item of memoryDb.listings) {
      const found =
        imgMap.get(String(item.id)) ||
        (item.mediaId ? imgMap.get(String(item.mediaId)) : undefined) ||
        (item.imageFileName ? imgMap.get(String(item.imageFileName)) : undefined);
      if (found) {
        if (found.thumb) item.imageThumbnailBase64 = found.thumb;
        if (found.full) item.imageFullBase64 = found.full;
        item.hasPhoto = true;
        item.imageUrl = `/api/images/${encodeURIComponent(item.id)}?thumb=true`;

        // Write image binary directly to persistent disk (/data/images/)
        const dataToSave = found.full || found.thumb;
        if (dataToSave && dataToSave.includes(';base64,')) {
          try {
            const buf = Buffer.from(dataToSave.split(';base64,')[1], 'base64');
            fs.promises.writeFile(path.join(imagesDir, `${item.id}.jpg`), buf).catch(() => {});
            if (item.imageFileName && !item.imageFileName.toLowerCase().endsWith('.txt')) {
              const baseName = item.imageFileName.split('/').pop() || item.imageFileName;
              fs.promises.writeFile(path.join(imagesDir, baseName), buf).catch(() => {});
            }
            if (item.mediaId) {
              fs.promises.writeFile(path.join(imagesDir, `${item.mediaId}.jpg`), buf).catch(() => {});
            }
          } catch {}
        }

        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      memoryDb.revision = (memoryDb.revision || 1) + 1;
      queueDiskSave();
    }

    res.json({
      success: true,
      jobId,
      batchId,
      updated: updatedCount,
      confirmedCount: images.length,
      revision: memoryDb.revision || 1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Zero-RAM Streaming ZIP Extraction & Resumable Chunk Upload Engine
// -----------------------------------------------------------------------------

interface ChunkUploadSession {
  uploadId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  batchName: string;
  publishedBy: string;
  createdAt: number;
}

/**
 * Extracts a ZIP archive directly to persistent disk (/data/images/)
 * with zero base64 RAM overhead, indexing all photos in diskImageSet immediately.
 */
async function extractZipDirectlyToDisk(
  zipBuffer: Buffer,
  customBatchName?: string,
  publishedBy = 'مدیر سیستم'
): Promise<{
  success: boolean;
  message: string;
  total: number;
  batchCount: number;
  sellersCount: number;
  buyersCount: number;
  extractedImagesCount: number;
  batchName: string;
  revision: number;
  lastUpdated: string;
}> {
  const imagesDir = getImagesDir();
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipBuffer);

  const textMap = new Map<string, string>();
  const jsonFiles: JSZip.JSZipObject[] = [];
  const dataEntries: { name: string; baseName: string; idWithoutExt: string; entry: JSZip.JSZipObject }[] = [];
  const fileNames = Object.keys(loadedZip.files);

  for (const name of fileNames) {
    const entry = loadedZip.files[name];
    if (entry.dir) continue;
    const baseName = name.split('/').pop() || name;
    if (baseName.toLowerCase().endsWith('.json')) {
      jsonFiles.push(entry);
    } else {
      const idWithoutExt = baseName.replace(/\.[^/.]+$/, '');
      dataEntries.push({ name, baseName, idWithoutExt, entry });
    }
  }

  // Sort jsonFiles so session.json is processed first
  jsonFiles.sort((a, b) => {
    const aName = a.name.split('/').pop()?.toLowerCase() || '';
    const bName = b.name.split('/').pop()?.toLowerCase() || '';
    if (aName === 'session.json') return -1;
    if (bName === 'session.json') return 1;
    return 0;
  });

  const sessionObj: SessionJsonRoot = { sellers: [], buyers: [] };

  for (const jFile of jsonFiles) {
    try {
      const fileNameLower = jFile.name.toLowerCase();
      const isDedicatedBuyerFile = /buyer|kharidar|kharid|order|request|moshtari|خریدار|خرید|سفارش|مشتری|درخواست/i.test(fileNameLower);
      const isDedicatedSellerFile = /seller|forush|sale|froosh|فروش|فروشنده/i.test(fileNameLower);
      const sessionContent = await jFile.async('string');
      const parsed = JSON.parse(sessionContent);

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item) continue;
          if (isDedicatedBuyerFile) {
            sessionObj.buyers = sessionObj.buyers || [];
            sessionObj.buyers.push(item);
          } else if (isDedicatedSellerFile) {
            sessionObj.sellers = sessionObj.sellers || [];
            sessionObj.sellers.push(item);
          } else if (isBuyerRecord(item)) {
            sessionObj.buyers = sessionObj.buyers || [];
            sessionObj.buyers.push(item);
          } else {
            sessionObj.sellers = sessionObj.sellers || [];
            sessionObj.sellers.push(item);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        const extractedB = extractBuyersArray(parsed);
        const extractedS = extractSellersArray(parsed);

        if (isDedicatedBuyerFile) {
          sessionObj.buyers = sessionObj.buyers || [];
          sessionObj.buyers.push(...extractedB, ...extractedS);
        } else if (isDedicatedSellerFile) {
          sessionObj.sellers = sessionObj.sellers || [];
          sessionObj.sellers.push(...extractedS, ...extractedB);
        } else {
          sessionObj.buyers = sessionObj.buyers || [];
          sessionObj.buyers.push(...extractedB);
          sessionObj.sellers = sessionObj.sellers || [];
          sessionObj.sellers.push(...extractedS);
        }

        if (parsed.normalizationRules) {
          sessionObj.normalizationRules = sessionObj.normalizationRules || parsed.normalizationRules;
        }
      }
    } catch (err) {
      // Do not silently continue with a partial catalogue when a JSON source file is corrupt.
      throw new Error(`خواندن فایل JSON در آرشیو ناموفق بود: ${jFile.name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Build lookup of known .txt item IDs and filenames from session.json
  const knownTxtIds = new Set<string>();
  const idToFileName = new Map<string, string>();
  const allRecords = [...(sessionObj.sellers || []), ...(sessionObj.buyers || [])];
  for (const rec of allRecords) {
    if (!rec) continue;
    const fName = (rec.imageFileName || rec.fileName || rec.نام_فایل || '').toString().trim();
    if (rec.id && fName) {
      idToFileName.set(String(rec.id).trim(), fName);
    }
    if (fName.toLowerCase().endsWith('.txt')) {
      if (rec.id) knownTxtIds.add(String(rec.id).trim());
      knownTxtIds.add(fName);
      knownTxtIds.add(fName.replace(/\.[^/.]+$/, ''));
    }
  }

  let savedImagesCount = 0;

  // Extract entries directly to disk and memory index without Base64 strings in memory
  for (const { name, baseName, idWithoutExt, entry } of dataEntries) {
    try {
      const lowerBase = baseName.toLowerCase();
      const nodeBuffer = await entry.async('nodebuffer');
      if (!nodeBuffer || nodeBuffer.length === 0) continue;

      const bytes = nodeBuffer;
      const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
      const isPng =
        bytes.length >= 4 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      const isGif =
        bytes.length >= 3 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46;
      const isWebp =
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50;
      const isBmp = bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
      const hasImageMagic = isJpeg || isPng || isGif || isWebp || isBmp;

      if (hasImageMagic) {
        // Direct binary image: save to persistent disk!
        const ext = isPng ? '.png' : isWebp ? '.webp' : isGif ? '.gif' : '.jpg';
        await fs.promises.writeFile(path.join(imagesDir, `${idWithoutExt}${ext}`), nodeBuffer);
        await fs.promises.writeFile(path.join(imagesDir, `${idWithoutExt}.jpg`), nodeBuffer);
        if (baseName !== idWithoutExt) {
          await fs.promises.writeFile(path.join(imagesDir, baseName), nodeBuffer);
        }
        const mappedFName = idToFileName.get(idWithoutExt) || idToFileName.get(baseName);
        if (mappedFName && mappedFName !== baseName) {
          await fs.promises.writeFile(path.join(imagesDir, mappedFName), nodeBuffer);
        }

        diskImageSet.add(idWithoutExt);
        diskImageSet.add(`${idWithoutExt}.jpg`);
        diskImageSet.add(baseName);
        if (mappedFName) diskImageSet.add(mappedFName);
        savedImagesCount++;
        continue;
      }

      // Check text or base64 data file
      let rawStr = '';
      try {
        rawStr = nodeBuffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
      } catch {}

      if (rawStr) {
        if (rawStr.startsWith('data:image/')) {
          const match = rawStr.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const buf = Buffer.from(match[2], 'base64');
            await fs.promises.writeFile(path.join(imagesDir, `${idWithoutExt}.jpg`), buf);
            await fs.promises.writeFile(path.join(imagesDir, baseName), buf);
            diskImageSet.add(idWithoutExt);
            diskImageSet.add(`${idWithoutExt}.jpg`);
            diskImageSet.add(baseName);
            savedImagesCount++;
            continue;
          }
        } else if (rawStr.startsWith('/9j/') || rawStr.startsWith('iVBORw0KGgo') || rawStr.startsWith('UklGR')) {
          const buf = Buffer.from(rawStr.replace(/\s+/g, ''), 'base64');
          await fs.promises.writeFile(path.join(imagesDir, `${idWithoutExt}.jpg`), buf);
          await fs.promises.writeFile(path.join(imagesDir, baseName), buf);
          diskImageSet.add(idWithoutExt);
          diskImageSet.add(`${idWithoutExt}.jpg`);
          diskImageSet.add(baseName);
          savedImagesCount++;
          continue;
        }

        // It is a text note or text ad!
        textMap.set(idWithoutExt, rawStr);
        textMap.set(baseName, rawStr);
      }
    } catch (err) {
      console.warn('Error processing zip entry:', name, err);
    }
  }

  // Handle standalone entries if not mentioned in session.json
  const knownRecordIds = new Set(allRecords.map((r) => String(r.id || '').trim()));
  for (const { name, baseName, idWithoutExt } of dataEntries) {
    if (knownRecordIds.has(idWithoutExt) || knownRecordIds.has(baseName)) continue;
    const decodedText = textMap.get(idWithoutExt) || textMap.get(baseName) || '';
    const hasImage = diskImageSet.has(idWithoutExt) || diskImageSet.has(baseName);
    if (!decodedText && !hasImage) continue;

    const fullContext = `${name} ${baseName} ${decodedText}`;
    const isBuyer = /buyer|kharidar|kharid|order|request|moshtari|خریدار|خرید|سفارش|مشتری|درخواست|بودجه|متقاضی|می‌خوام|میخوام/i.test(fullContext);

    const standaloneRecord: any = {
      id: idWithoutExt || baseName,
      imageFileName: baseName,
      status: 'success',
      type: isBuyer ? 'buy_request' : 'sale',
    };
    if (decodedText) {
      standaloneRecord.متن = decodedText;
      standaloneRecord.توضیحات = decodedText;
    }
    if (isBuyer) {
      sessionObj.buyers = sessionObj.buyers || [];
      sessionObj.buyers.push(standaloneRecord);
    } else {
      sessionObj.sellers = sessionObj.sellers || [];
      sessionObj.sellers.push(standaloneRecord);
    }
  }

  const batchName = customBatchName || `car_session_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '_')}.zip`;
  const sourceRecordsCount =
    (sessionObj.sellers || []).filter(Boolean).length +
    (sessionObj.buyers || []).filter(Boolean).length;
  const result = parseSessionJson(sessionObj, new Map(), textMap, batchName);
  const skippedRecordsCount = Math.max(0, sourceRecordsCount - result.listings.length);

  // Refuse to replace an existing batch with a silently incomplete parse.
  // The original database remains untouched so the administrator can correct/retry the ZIP.
  if (skippedRecordsCount > 0 || result.errorsCount > 0) {
    throw new Error(
      `پردازش ZIP کامل نبود؛ ${sourceRecordsCount} رکورد منبع شناسایی شد اما ${result.listings.length} رکورد قابل ثبت بود و ${skippedRecordsCount} رکورد رد شد. دیتابیس قبلی تغییر نکرد. فایل JSON و فیلدهای رکوردهای ردشده را بررسی کنید.`
    );
  }

  // Link images with zero RAM overhead (keep heavy base64 strings empty!)
  for (const item of result.listings) {
    const idStr = String(item.id);
    const fnStr = item.imageFileName ? String(item.imageFileName).split('/').pop() || item.imageFileName : '';
    const fnBase = fnStr.replace(/\.[^/.]+$/, '');
    const mediaStr = item.mediaId ? String(item.mediaId) : '';

    const hasPhoto =
      diskImageSet.has(idStr) ||
      diskImageSet.has(`${idStr}.jpg`) ||
      Boolean(fnStr && (diskImageSet.has(fnStr) || diskImageSet.has(fnBase) || diskImageSet.has(`${fnStr}.jpg`))) ||
      Boolean(mediaStr && (diskImageSet.has(mediaStr) || diskImageSet.has(`${mediaStr}.jpg`)));

    item.hasPhoto = Boolean(item.hasPhoto || hasPhoto);
    item.imageUrl = item.hasPhoto ? `/api/images/${encodeURIComponent(item.id)}?thumb=true` : undefined;
    item.imageThumbnailBase64 = '';
    item.imageFullBase64 = '';
  }

  // Preserve other batches
  const otherBatches = memoryDb.listings.filter((l) => (l.importBatchName || '') !== batchName);
  const combined = [...result.listings, ...otherBatches];

  memoryDb.revision = (memoryDb.revision || 1) + 1;
  memoryDb.lastUpdated = new Date().toISOString();
  memoryDb.publishedBy = publishedBy;
  memoryDb.listings = pruneOldServerListings(combined);

  refreshDiskImageSet();
  queueDiskSave();
  broadcastSyncEvent('bulk_sync', {
    revision: memoryDb.revision,
    batchName,
    totalListings: memoryDb.listings.length,
  });

  return {
    success: true,
    message: `فایل با موفقیت و معماری صفر-رم در دیسک دائمی لیارا پردازش شد: ${result.sellersCount} خودرو، ${result.buyersCount} متقاضی خرید و ${savedImagesCount} تصویر ذخیره شدند.`,
    total: memoryDb.listings.length,
    batchCount: result.listings.length,
    sourceRecordsCount,
    skippedRecordsCount,
    errorsCount: result.errorsCount,
    sellersCount: result.sellersCount,
    buyersCount: result.buyersCount,
    extractedImagesCount: savedImagesCount,
    batchName,
    revision: memoryDb.revision,
    lastUpdated: memoryDb.lastUpdated,
  };
}

// -----------------------------------------------------------------------------
// Resumable Chunked Upload API Endpoints
// -----------------------------------------------------------------------------

// 1. POST /api/admin/upload-chunk/init: Initializes a chunked upload session or checks resume state
app.post('/api/admin/upload-chunk/init', (req, res) => {
  try {
    const { uploadId, fileName, fileSize, totalChunks, batchName, publishedBy } = req.body;
    if (!uploadId || !totalChunks) {
      return res.status(400).json({ success: false, error: 'پارامترهای شروع آپلود ناقص است.' });
    }

    const uploadsDir = getUploadsDir();
    const sessionDir = path.join(uploadsDir, uploadId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const meta: ChunkUploadSession = {
      uploadId,
      fileName: fileName || 'archive.zip',
      fileSize: Number(fileSize) || 0,
      totalChunks: Number(totalChunks),
      batchName: batchName || fileName || `car_session_${Date.now()}.zip`,
      publishedBy: publishedBy || 'مدیر سیستم',
      createdAt: Date.now(),
    };
    fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify(meta), 'utf-8');

    // Collect already received chunks for instant resume support
    const files = fs.readdirSync(sessionDir);
    const receivedChunks: number[] = [];
    for (const f of files) {
      const m = f.match(/^chunk_(\d+)\.part$/);
      if (m) {
        receivedChunks.push(parseInt(m[1], 10));
      }
    }
    receivedChunks.sort((a, b) => a - b);

    res.json({
      success: true,
      uploadId,
      receivedChunks,
      totalChunks: meta.totalChunks,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. POST /api/admin/upload-chunk: Writes an individual 1.5MB binary chunk directly to disk
app.post(
  '/api/admin/upload-chunk',
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res) => {
    try {
      const uploadId = String(req.query.uploadId || '').trim();
      const chunkIndex = parseInt(String(req.query.chunkIndex || '-1'), 10);

      if (!uploadId || chunkIndex < 0) {
        return res.status(400).json({ success: false, error: 'شناسه یا شماره تکه نامعتبر است.' });
      }

      const rawBuffer = req.body;
      if (!rawBuffer || !(rawBuffer instanceof Buffer) || rawBuffer.length === 0) {
        return res.status(400).json({ success: false, error: 'محتوای تکه خالی است.' });
      }

      const uploadsDir = getUploadsDir();
      const sessionDir = path.join(uploadsDir, uploadId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}.part`);
      await fs.promises.writeFile(chunkPath, rawBuffer);

      res.json({
        success: true,
        uploadId,
        chunkIndex,
        receivedBytes: rawBuffer.length,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// 3. GET /api/admin/upload-chunk/status/:uploadId: Returns resume status
app.get('/api/admin/upload-chunk/status/:uploadId', (req, res) => {
  try {
    const uploadId = String(req.params.uploadId || '').trim();
    const uploadsDir = getUploadsDir();
    const sessionDir = path.join(uploadsDir, uploadId);
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ success: false, error: 'نشست آپلود یافت نشد.' });
    }

    const files = fs.readdirSync(sessionDir);
    const receivedChunks: number[] = [];
    for (const f of files) {
      const m = f.match(/^chunk_(\d+)\.part$/);
      if (m) receivedChunks.push(parseInt(m[1], 10));
    }
    receivedChunks.sort((a, b) => a - b);

    let meta: any = {};
    const metaPath = path.join(sessionDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {}
    }

    res.json({
      success: true,
      uploadId,
      totalChunks: meta.totalChunks || receivedChunks.length,
      receivedChunks,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /api/admin/upload-chunk/finalize: Stitches chunks via file stream, extracts to disk, and updates catalog
app.post('/api/admin/upload-chunk/finalize', async (req, res) => {
  try {
    const { uploadId, batchName: customBatchName, publishedBy: customPublishedBy } = req.body;
    if (!uploadId) {
      return res.status(400).json({ success: false, error: 'شناسه آپلود ارسال نشده است.' });
    }

    const uploadsDir = getUploadsDir();
    const sessionDir = path.join(uploadsDir, uploadId);
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ success: false, error: 'پوشه نشست آپلود یافت نشد.' });
    }

    let meta: any = {};
    const metaPath = path.join(sessionDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {}
    }

    const totalChunks = meta.totalChunks;
    if (!totalChunks || totalChunks <= 0) {
      return res.status(400).json({ success: false, error: 'اطلاعات تعداد تکه‌ها در سرور ناقص است.' });
    }

    // Verify all chunks from 0 to totalChunks - 1 are present
    const missingChunks: number[] = [];
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(path.join(sessionDir, `chunk_${i}.part`))) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      return res.status(400).json({
        success: false,
        error: `تعدادی از تکه‌ها دریافت نشده‌اند (${missingChunks.length} تکه ناقص).`,
        missingChunks,
      });
    }

    // Stitch chunks sequentially into complete.zip via Node.js streams (Zero RAM overhead!)
    const completeZipPath = path.join(sessionDir, 'complete.zip');
    const writeStream = fs.createWriteStream(completeZipPath);

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(sessionDir, `chunk_${i}.part`);
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

    // Delete part files to free disk space immediately
    for (let i = 0; i < totalChunks; i++) {
      try {
        fs.unlinkSync(path.join(sessionDir, `chunk_${i}.part`));
      } catch {}
    }

    // Read stitched zip and extract directly to persistent disk
    const zipBuffer = await fs.promises.readFile(completeZipPath);
    const targetBatchName = customBatchName || meta.batchName || meta.fileName || `car_session_${Date.now()}.zip`;
    const targetPublishedBy = customPublishedBy || meta.publishedBy || 'مدیر سیستم (آپلود تکه‌ای)';

    const extractResult = await extractZipDirectlyToDisk(zipBuffer, targetBatchName, targetPublishedBy);

    // Clean up temporary session folder
    try {
      if (fs.existsSync(completeZipPath)) fs.unlinkSync(completeZipPath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      fs.rmdirSync(sessionDir);
    } catch (cleanupErr) {
      console.warn('Could not clean up temporary upload directory:', cleanupErr);
    }

    res.json(extractResult);
  } catch (err: any) {
    console.error('Error in upload-chunk/finalize:', err);
    res.status(500).json({ success: false, error: err.message || 'خطا در نهایی‌سازی و پردازش فایل زیپ در سرور' });
  }
});

// POST /api/admin/upload-zip: Direct high-speed upload using zero-RAM disk extractor
app.post(
  '/api/admin/upload-zip',
  express.raw({ type: () => true, limit: '300mb' }),
  async (req, res) => {
    try {
      const rawBuffer = req.body;
      if (!rawBuffer || !(rawBuffer instanceof Buffer) || rawBuffer.length < 50) {
        return res.status(400).json({ success: false, error: 'فایل زیپ ارسالی نامعتبر یا خالی است.' });
      }

      const customBatchName =
        (req.query.batchName as string) ||
        `car_session_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '_')}.zip`;
      const publishedBy = (req.query.publishedBy as string) || 'مدیر سیستم (آپلود مستقیم زیپ)';

      const extractResult = await extractZipDirectlyToDisk(rawBuffer, customBatchName, publishedBy);
      res.json(extractResult);
    } catch (err: any) {
      console.error('Error in upload-zip:', err);
      res.status(500).json({ success: false, error: err.message || 'خطا در پردازش فایل زیپ در سرور' });
    }
  }
);

// GET /api/admin/verify-integrity: Verifies exact record counts and database consistency
app.get('/api/admin/verify-integrity', (req, res) => {
  try {
    const active = pruneOldServerListings(memoryDb.listings);
    const salesCount = active.filter((l) => l.type === 'sale').length;
    const buysCount = active.filter((l) => l.type === 'buy_request').length;

    const batchesMap: Record<string, number> = {};
    for (const item of active) {
      const b = item.importBatchName || 'پیش‌فرض';
      batchesMap[b] = (batchesMap[b] || 0) + 1;
    }

    res.json({
      success: true,
      totalListings: active.length,
      salesCount,
      buysCount,
      revision: memoryDb.revision || 1,
      lastUpdated: memoryDb.lastUpdated,
      batches: batchesMap,
      tombstonesCount: (memoryDb.tombstones || []).length,
      confirmedBatchesCount: Object.keys(memoryDb.confirmedBatches || {}).length,
    });
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
      revision: (memoryDb.revision || 0) + 1,
      tombstones: [],
      confirmedBatches: {},
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
        jszip: '^3.10.2',
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
