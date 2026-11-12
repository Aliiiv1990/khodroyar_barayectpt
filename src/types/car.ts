export type CarListingType = 'sale' | 'buy_request';

export interface CarListing {
  id: string;
  type: CarListingType;
  title: string;
  brand: string;
  model: string;
  year: number; // e.g. 1402, or 0 when year is unknown/not specified
  hasExplicitYear?: boolean;
  price: number; // 0 for negotiable (توافقی)
  priceFormatted: string;
  mileage: number; // km
  mileageFormatted: string;
  color: string;
  gearbox: 'دنده‌ای' | 'اتوماتیک';
  bodyCondition: string; // e.g. بی‌رنگ، یک لکه رنگ، خط و خش جزئی
  fuelType: 'بنزین' | 'دوگانه‌سوز' | 'هیبرید' | 'دیزل';
  city: string;
  phoneNumber: string;
  description: string;
  createdAt: string; // ISO date string
  imageThumbnailBase64: string;
  imageFullBase64: string;
  hasPhoto?: boolean; // True if the listing has an attached photo on the server
  imageUrl?: string; // Optional direct HTTP image URL
  fileDescription?: string; // Original filename text or description
  isTextOnly?: boolean; // True if it is a text-only record (.txt or no image)
  source?: 'admin' | 'user'; // 'admin' = bulk daily dataset, 'user' = submitted by user/colleague
  creatorName?: string; // Optional name or username of person who submitted
  rowIndex?: number;
  imageFileName?: string;
  status?: string;
  isEdited?: boolean; // True if fields were manually edited in-app
  // Batch and origin tracking for admin deletion and date management
  importBatchName?: string; // e.g. "archive_28oct.zip" or "ورودی روز شنبه"
  importDate?: string; // e.g. "1403/08/08"
  mediaId?: string; // Media file identifier (can be shared across multiple listings)
  revision?: number; // Version / Revision sequence for multi-device synchronization
  _createdById?: string; // Internal immutable PocketBase owner ID
  // Normalized cached string for instant sub-millisecond filtering
  _searchIndex?: string;
}

export interface FilterOptions {
  type: CarListingType;
  searchQuery: string;
  brand: string;
  priceRange: 'all' | 'under300' | '300to600' | '600to1000' | 'above1000';
  dayFilter: 'all' | 'today' | 'yesterday' | 'older';
  city: string;
}
