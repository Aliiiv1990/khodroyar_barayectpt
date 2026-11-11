import PocketBase, { type RecordModel } from 'pocketbase';
import type { CarListing, CarListingType } from '../types/car';
import { sanitizeAndIndexListing } from '../utils/sessionDataParser';

const configuredUrl = import.meta.env.VITE_POCKETBASE_URL?.trim();
if (!configuredUrl && import.meta.env.PROD) {
  console.warn('[PocketBase] VITE_POCKETBASE_URL is not configured.');
}

export const pocketbase = new PocketBase(configuredUrl || 'http://127.0.0.1:8090');
pocketbase.autoCancellation(false);

export type PocketBaseListingEvent = {
  action: 'create' | 'update' | 'delete';
  record: CarListing | null;
  recordId: string;
};

function fileUrl(record: RecordModel, fileName: string, thumb = false): string {
  if (!fileName) return '';
  return pocketbase.files.getURL(record, fileName, thumb ? { thumb: '640x480' } : {});
}

export function fromPocketBaseRecord(record: RecordModel): CarListing {
  const photos = Array.isArray(record.photos) ? record.photos as string[] : [];
  const imageUrl = photos[0] ? fileUrl(record, photos[0]) : '';
  return sanitizeAndIndexListing({
    id: String(record.legacy_id || record.id),
    type: (record.type === 'buy_request' ? 'buy_request' : 'sale') as CarListingType,
    title: String(record.title || record.model || ''),
    brand: String(record.brand || ''),
    model: String(record.model || ''),
    year: Number(record.year || 0),
    hasExplicitYear: Boolean(record.has_explicit_year),
    price: Number(record.price || 0),
    priceFormatted: String(record.price_formatted || 'توافقی'),
    mileage: Number(record.mileage || 0),
    mileageFormatted: String(record.mileage_formatted || 'صفر'),
    color: String(record.color || 'سفید'),
    gearbox: (record.gearbox || 'دنده‌ای') as CarListing['gearbox'],
    bodyCondition: String(record.body_condition || 'بدون رنگ'),
    fuelType: (record.fuel_type || 'بنزین') as CarListing['fuelType'],
    city: String(record.city || ''),
    phoneNumber: '', // Private contact data is loaded separately for authenticated users.
    description: String(record.description || ''),
    createdAt: String(record.created || new Date().toISOString()),
    imageThumbnailBase64: '',
    imageFullBase64: '',
    hasPhoto: photos.length > 0,
    imageUrl: imageUrl || undefined,
    imageFileName: photos[0] || undefined,
    fileDescription: String(record.file_description || ''),
    isTextOnly: Boolean(record.is_text_only),
    source: record.source === 'user' ? 'user' : 'admin',
    creatorName: String(record.creator_name || ''),
    importBatchName: String(record.import_batch || ''),
    importDate: String(record.import_date || ''),
    isEdited: Boolean(record.is_edited),
    revision: Number(record.revision || 1),
    status: record.is_active === false ? 'inactive' : 'active',
    _searchIndex: [record.title, record.brand, record.model, record.city].filter(Boolean).join(' ').toLocaleLowerCase(),
  });
}

function toFormData(listing: Partial<CarListing>, files: File[] = []): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    legacy_id: String(listing.id || ''),
    type: listing.type || 'sale',
    title: String(listing.title || listing.model || ''),
    brand: String(listing.brand || ''),
    model: String(listing.model || ''),
    year: String(Number(listing.year || 0)),
    has_explicit_year: String(Boolean(listing.hasExplicitYear)),
    price: String(Number(listing.price || 0)),
    price_formatted: String(listing.priceFormatted || 'توافقی'),
    mileage: String(Number(listing.mileage || 0)),
    mileage_formatted: String(listing.mileageFormatted || 'صفر'),
    color: String(listing.color || 'سفید'),
    gearbox: String(listing.gearbox || 'دنده‌ای'),
    body_condition: String(listing.bodyCondition || 'بدون رنگ'),
    fuel_type: String(listing.fuelType || 'بنزین'),
    city: String(listing.city || ''),
    description: String(listing.description || ''),
    file_description: String(listing.fileDescription || ''),
    source: listing.source || 'user',
    creator_name: String(listing.creatorName || ''),
    import_batch: String(listing.importBatchName || ''),
    import_date: String(listing.importDate || ''),
    is_text_only: String(Boolean(listing.isTextOnly)),
    is_edited: String(Boolean(listing.isEdited)),
    is_active: 'true',
    revision: String(Number(listing.revision || 1)),
  };
  Object.entries(values).forEach(([key, value]) => form.append(key, value));
  files.forEach((file) => form.append('photos', file, file.name));
  return form;
}

export const pocketbaseListings = {
  async list(options: { type?: CarListingType; pageSize?: number } = {}): Promise<CarListing[]> {
    const pageSize = Math.min(Math.max(options.pageSize || 200, 1), 500);
    const filter = options.type
      ? pocketbase.filter('is_active = true && type = {:type}', { type: options.type })
      : 'is_active = true';
    const first = await pocketbase.collection('listings').getList(1, pageSize, {
      filter,
      sort: '-created',
      fields: 'id,legacy_id,type,title,brand,model,year,has_explicit_year,price,price_formatted,mileage,mileage_formatted,color,gearbox,body_condition,fuel_type,city,description,source,creator_name,import_batch,import_date,is_text_only,is_edited,is_active,revision,photos,created,updated',
    });
    const records: RecordModel[] = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const result = await pocketbase.collection('listings').getList(page, pageSize, {
        filter,
        sort: '-created',
        fields: 'id,legacy_id,type,title,brand,model,year,has_explicit_year,price,price_formatted,mileage,mileage_formatted,color,gearbox,body_condition,fuel_type,city,description,source,creator_name,import_batch,import_date,is_text_only,is_edited,is_active,revision,photos,created,updated',
      });
      records.push(...result.items);
    }
    const mapped = records.map(fromPocketBaseRecord);
    if (pocketbase.authStore.isValid && mapped.length) {
      try {
        const contacts = await pocketbase.collection('listing_contacts').getFullList({ fields: 'listing_id,phone_number' });
        const phones = new Map(contacts.map((contact) => [String(contact.listing_id), String(contact.phone_number || '')]));
        return mapped.map((listing) => ({ ...listing, phoneNumber: phones.get(listing.id) || '' }));
      } catch (error) {
        console.warn('[PocketBase] Private contact records are not available:', error);
      }
    }
    return mapped;
  },

  async create(listing: CarListing, files: File[] = []): Promise<CarListing> {
    const payload = toFormData(listing, files);
    payload.append('created_by', String(pocketbase.authStore.record?.id || ''));
    const record = await pocketbase.collection('listings').create(payload);
    if (listing.phoneNumber && pocketbase.authStore.isValid) {
      await pocketbase.collection('listing_contacts').create({ listing_id: String(listing.id), phone_number: listing.phoneNumber, owner_id: String(pocketbase.authStore.model?.id || '') });
    }
    return { ...fromPocketBaseRecord(record), phoneNumber: listing.phoneNumber || '' };
  },

  async update(recordId: string, listing: Partial<CarListing>, files: File[] = []): Promise<CarListing> {
    const existing = await pocketbase.collection('listings').getFirstListItem(
      pocketbase.filter('legacy_id = {:legacyId}', { legacyId: recordId }),
    );
    const record = await pocketbase.collection('listings').update(existing.id, toFormData(listing, files));
    if (listing.phoneNumber !== undefined && pocketbase.authStore.isValid) {
      try {
        const contact = await pocketbase.collection('listing_contacts').getFirstListItem(
          pocketbase.filter('listing_id = {:listingId}', { listingId: recordId }),
        );
        await pocketbase.collection('listing_contacts').update(contact.id, { phone_number: listing.phoneNumber });
      } catch {
        if (listing.phoneNumber) {
          await pocketbase.collection('listing_contacts').create({ listing_id: recordId, phone_number: listing.phoneNumber, owner_id: String(pocketbase.authStore.model?.id || '') });
        }
      }
    }
    return { ...fromPocketBaseRecord(record), phoneNumber: listing.phoneNumber ?? '' };
  },

  async remove(recordId: string): Promise<void> {
    const existing = await pocketbase.collection('listings').getFirstListItem(
      pocketbase.filter('legacy_id = {:legacyId}', { legacyId: recordId }),
    );
    try {
      const contact = await pocketbase.collection('listing_contacts').getFirstListItem(
        pocketbase.filter('listing_id = {:listingId}', { listingId: recordId }),
      );
      await pocketbase.collection('listing_contacts').delete(contact.id);
    } catch {
      // A listing may not have a private contact record.
    }
    await pocketbase.collection('listings').delete(existing.id);
  },

  async subscribe(onEvent: (event: PocketBaseListingEvent) => void): Promise<() => void> {
    const unsubscribe = await pocketbase.collection('listings').subscribe('*', (event) => {
      const record = event.record;
      onEvent({
        action: event.action,
        recordId: String(record?.legacy_id || record?.id || ''),
        record: event.action === 'delete' || !record ? null : fromPocketBaseRecord(record),
      });
    });
    return unsubscribe;
  },
};

export function getPocketBaseConnectionState(): 'authenticated' | 'anonymous' {
  return pocketbase.authStore.isValid ? 'authenticated' : 'anonymous';
}
