import { CarListing } from '../types/car';

/**
 * Pre-generated optimized Base64 SVG vehicle illustration based on color & model
 */
export function generateCarSvg(colorHex: string, modelName: string, isFull = false): string {
  const width = isFull ? 800 : 160;
  const height = isFull ? 480 : 160;
  const strokeColor = '#1e293b';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg_${colorHex.replace('#', '')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#e2e8f0"/>
      </linearGradient>
      <linearGradient id="body_${colorHex.replace('#', '')}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${colorHex}"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.3"/>
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

  if (typeof btoa !== 'undefined') {
    try {
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    } catch {
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Color mapper helper
 */
export function getColorHex(colorName?: string): string {
  if (!colorName) return '#3b82f6';
  const c = colorName.toLowerCase();
  if (c.includes('سفید')) return '#ffffff';
  if (c.includes('مشکی') || c.includes('سیاه')) return '#1e293b';
  if (c.includes('نقره') || c.includes('سربی')) return '#94a3b8';
  if (c.includes('خاکستری') || c.includes('طوسی') || c.includes('دلفینی')) return '#64748b';
  if (c.includes('قرمز') || c.includes('آلبالویی')) return '#dc2626';
  if (c.includes('آبی') || c.includes('کاربنی')) return '#2563eb';
  if (c.includes('سبز') || c.includes('یشمی')) return '#15803d';
  if (c.includes('زرد') || c.includes('طلایی')) return '#eab308';
  if (c.includes('قهوه‌ای') || c.includes('مسی')) return '#78350f';
  return '#3b82f6';
}

/**
 * Returns a guaranteed valid image src for any car listing.
 * Never leaves a car with empty or broken image.
 */
export function getListingImage(listing: Partial<CarListing>, isFull = false): string {
  // 1. If requesting full image and real photo exists:
  if (isFull && listing.imageFullBase64 && listing.imageFullBase64.length > 20 && !listing.imageFullBase64.startsWith('data:image/svg+xml')) {
    return listing.imageFullBase64;
  }
  // 2. If requesting thumbnail (or full not available) and real thumbnail exists:
  if (!isFull && listing.imageThumbnailBase64 && listing.imageThumbnailBase64.length > 20 && !listing.imageThumbnailBase64.startsWith('data:image/svg+xml')) {
    return listing.imageThumbnailBase64;
  }
  // 3. If imageFullBase64 exists as real photo:
  if (listing.imageFullBase64 && listing.imageFullBase64.length > 20 && !listing.imageFullBase64.startsWith('data:image/svg+xml')) {
    return listing.imageFullBase64;
  }
  // 4. Server-streamed image URL from persistent disk (/api/images/:id)
  if (listing.imageUrl) {
    return listing.imageUrl;
  }
  if (listing.hasPhoto && listing.id) {
    return `/api/images/${encodeURIComponent(listing.id)}${isFull ? '?full=true' : '?thumb=true'}`;
  }
  // 5. Any explicit SVG illustration preserved in listing
  if (isFull && listing.imageFullBase64 && listing.imageFullBase64.length > 20) {
    return listing.imageFullBase64;
  }
  if (listing.imageThumbnailBase64 && listing.imageThumbnailBase64.length > 20) {
    return listing.imageThumbnailBase64;
  }
  if (listing.imageFullBase64 && listing.imageFullBase64.length > 20) {
    return listing.imageFullBase64;
  }
  // 6. Generate dedicated illustration as ultimate fallback
  const colorHex = getColorHex(listing.color);
  const modelName = listing.model || listing.title || 'خودرو';
  return generateCarSvg(colorHex, modelName, isFull);
}

/**
 * Optimizes and downscales large base64 photos before uploading to the server.
 * Preserves high definition and crystal-clear vehicle details (plates, stickers, body)
 * at up to 1280x960 with quality 0.85, preventing pixelation while still avoiding giant multi-MB uploads.
 */
export async function optimizeImageForUpload(
  dataUrl?: string,
  maxWidth = 1280,
  maxHeight = 960,
  quality = 0.85
): Promise<string> {
  if (!dataUrl || dataUrl.length < 50 || dataUrl.startsWith('data:image/svg+xml')) {
    return dataUrl || '';
  }
  // If already reasonably sized for the target resolution, preserve original bytes
  if (maxWidth >= 1000 && dataUrl.length < 85000) {
    return dataUrl;
  }
  if (maxWidth < 1000 && dataUrl.length < 28000) {
    return dataUrl;
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(10, Math.round(width * ratio));
            height = Math.max(10, Math.round(height * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}
