import PocketBase, { type RecordModel } from 'pocketbase';
import type { CarListing, CarListingType } from '../types/car';
import { sanitizeAndIndexListing } from '../utils/sessionDataParser';

const configuredUrl = import.meta.env.VITE_POCKETBASE_URL?.trim();
if (!configuredUrl && import.meta.env.PROD) {
  console.warn('[PocketBase] VITE_POCKETBASE_URL is not configured.');
}

export const pocketbase = new PocketBase(configuredUrl || 'http://127.0.0.1:8090');
pocketbase.autoCancellation(false);

async function writePocketBaseAudit(action: string, recordId: string, summary: string): Promise<void> {
  const actorId = String(pocketbase.authStore.record?.id || '');
  if (!actorId) return;
  try {
    await pocketbase.collection('audit_logs').create({
      actor_id: actorId,
      action,
      collection_name: 'listings',
      record_id: recordId,
      summary: summary.slice(0, 1000),
    });
  } catch (error) {
    console.warn('[PocketBase] Could not write audit entry:', error);
  }
}

function requirePocketBaseAdmin(): void {
  if (!pocketbase.authStore.isValid || pocketbase.authStore.record?.role !== 'admin') {
    throw new Error('این عملیات فقط برای مدیر سامانه مجاز است.');
  }
}

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
  const thumbnailUrl = photos[0] ? fileUrl(record, photos[0], true) : '';
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
    imageThumbnailBase64: thumbnailUrl,
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
    const pageSize = Math.min(Math.max(options.pageSize || 500, 1), 500);
    const filter = options.type
      ? pocketbase.filter('is_active = true && type = {:type}', { type: options.type })
      : 'is_active = true';
    const first = await pocketbase.collection('listings').getList(1, pageSize, {
      filter,
      sort: '-created',
      fields: 'id,legacy_id,type,title,brand,model,year,has_explicit_year,price,price_formatted,mileage,mileage_formatted,color,gearbox,body_condition,fuel_type,city,description,source,creator_name,import_batch,import_date,is_text_only,is_edited,is_active,revision,photos,created,updated',
    });
    const records: RecordModel[] = [...first.items];
    for (let firstPage = 2; firstPage <= first.totalPages; firstPage += 4) {
      const pageNumbers = Array.from(
        { length: Math.min(4, first.totalPages - firstPage + 1) },
        (_, index) => firstPage + index,
      );
      const remainingPages = await Promise.all(pageNumbers.map((pageNumber) =>
        pocketbase.collection('listings').getList(pageNumber, pageSize, {
          filter,
          sort: '-created',
          fields: 'id,legacy_id,type,title,brand,model,year,has_explicit_year,price,price_formatted,mileage,mileage_formatted,color,gearbox,body_condition,fuel_type,city,description,source,creator_name,import_batch,import_date,is_text_only,is_edited,is_active,revision,photos,created,updated',
        }),
      ));
      remainingPages.forEach((page) => records.push(...page.items));
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

  async getContactPhone(listingId: string): Promise<string> {
    if (!pocketbase.authStore.isValid) return '';
    try {
      const contact = await pocketbase.collection('listing_contacts').getFirstListItem(
        pocketbase.filter('listing_id = {:listingId}', { listingId }),
      );
      return String(contact.phone_number || '');
    } catch {
      return '';
    }
  },
  async create(listing: CarListing, files: File[] = []): Promise<CarListing> {
    const payload = toFormData(listing, files);
    payload.append('created_by', String(pocketbase.authStore.record?.id || ''));
    const record = await pocketbase.collection('listings').create(payload);
    if (listing.phoneNumber && pocketbase.authStore.isValid) {
      await pocketbase.collection('listing_contacts').create({ listing_id: String(listing.id), phone_number: listing.phoneNumber, owner_id: String(pocketbase.authStore.record?.id || '') });
      const syncedRecord = await pocketbase.collection('listings').update(record.id, { revision: Number(record.revision || 1) + 1 });
      void writePocketBaseAudit('create', String(listing.id), 'Listing created');
      return { ...fromPocketBaseRecord(syncedRecord), phoneNumber: listing.phoneNumber || '' };
    }
    void writePocketBaseAudit('create', String(listing.id), 'Listing created');
    return { ...fromPocketBaseRecord(record), phoneNumber: listing.phoneNumber || '' };
  },

  async update(recordId: string, listing: Partial<CarListing>, files: File[] = []): Promise<CarListing> {
    let existing: RecordModel;
    try {
      existing = await pocketbase.collection('listings').getFirstListItem(
        pocketbase.filter('legacy_id = {:legacyId}', { legacyId: recordId }),
      );
    } catch (error: any) {
      if (error?.status !== 404) throw error;
      existing = await pocketbase.collection('listings').getOne(recordId);
    }
    const currentRevision = Number(existing.revision || 1);
    const requestedRevision = Number(listing.revision || currentRevision);
    if (requestedRevision !== currentRevision) {
      throw new Error('این آگهی روی دستگاه دیگری تغییر کرده است. فهرست را تازه‌سازی کنید و دوباره تغییر دهید.');
    }
    const record = await pocketbase.collection('listings').update(
      existing.id,
      toFormData({ ...listing, revision: currentRevision + 1 }, files),
    );
    let finalRecord = record;
    if (listing.phoneNumber !== undefined && pocketbase.authStore.isValid) {
      let contact: RecordModel | null = null;
      try {
        contact = await pocketbase.collection('listing_contacts').getFirstListItem(
          pocketbase.filter('listing_id = {:listingId}', { listingId: recordId }),
        );
      } catch (error: any) {
        if (error?.status !== 404) throw error;
      }
      if (contact) {
        await pocketbase.collection('listing_contacts').update(contact.id, { phone_number: listing.phoneNumber });
      } else if (listing.phoneNumber) {
        await pocketbase.collection('listing_contacts').create({ listing_id: recordId, phone_number: listing.phoneNumber, owner_id: String(pocketbase.authStore.record?.id || '') });
      }
      finalRecord = await pocketbase.collection('listings').update(record.id, { revision: Number(record.revision || currentRevision + 1) + 1 });
    }
    void writePocketBaseAudit('update', recordId, 'Listing updated');
    return { ...fromPocketBaseRecord(finalRecord), phoneNumber: listing.phoneNumber ?? '' };
  },

  async upsert(listing: CarListing, files: File[] = []): Promise<CarListing> {
    let existing: RecordModel;
    try {
      existing = await pocketbase.collection('listings').getFirstListItem(
        pocketbase.filter('legacy_id = {:legacyId}', { legacyId: listing.id }),
      );
    } catch (error: any) {
      if (error?.status !== 404) throw error;
      return await this.create(listing, files);
    }
    return await this.update(String(listing.id), { ...listing, revision: Number(existing.revision || 1) }, files);
  },
  async remove(recordId: string, writeAudit = true): Promise<void> {
    let existing: RecordModel;
    try {
      existing = await pocketbase.collection('listings').getFirstListItem(
        pocketbase.filter('legacy_id = {:legacyId}', { legacyId: recordId }),
      );
    } catch (error: any) {
      if (error?.status !== 404) throw error;
      existing = await pocketbase.collection('listings').getOne(recordId);
    }
    const currentUserId = String(pocketbase.authStore.record?.id || '');
    if (pocketbase.authStore.record?.role !== 'admin' && String(existing.created_by || '') !== currentUserId) {
      throw new Error('حذف این آگهی فقط برای ثبت‌کننده یا مدیر سامانه مجاز است.');
    }
    let contact: RecordModel | null = null;
    try {
      contact = await pocketbase.collection('listing_contacts').getFirstListItem(
        pocketbase.filter('listing_id = {:listingId}', { listingId: recordId }),
      );
    } catch (error: any) {
      if (error?.status !== 404) throw error;
    }
    if (contact) await pocketbase.collection('listing_contacts').delete(contact.id);
    await pocketbase.collection('listings').delete(existing.id);
    if (writeAudit) void writePocketBaseAudit('delete', recordId, 'Listing permanently deleted');
  },

  async listBatches(): Promise<Array<{ id: string; batchName: string; date: string; count: number; saleCount: number; buyCount: number; isVisible: boolean }>> {
    requirePocketBaseAdmin();
    const [records, batches] = await Promise.all([
      pocketbase.collection('listings').getFullList({ fields: 'legacy_id,import_batch,type,is_active,created' }),
      pocketbase.collection('import_batches').getFullList({ sort: '-created' }),
    ]);
    const grouped = new Map<string, { count: number; saleCount: number; buyCount: number; visibleCount: number; date: string }>();
    for (const record of records) {
      const name = String(record.import_batch || 'ثبت‌های دستی همکاران و مدیر');
      const item = grouped.get(name) || { count: 0, saleCount: 0, buyCount: 0, visibleCount: 0, date: String(record.created || '') };
      item.count += 1;
      if (record.type === 'buy_request') item.buyCount += 1; else item.saleCount += 1;
      if (record.is_active !== false) item.visibleCount += 1;
      grouped.set(name, item);
    }
    const names = new Set<string>([...grouped.keys(), ...batches.map((batch) => String(batch.batch_name || ''))]);
    return Array.from(names).filter(Boolean).map((name) => {
      const stats = grouped.get(name) || { count: 0, saleCount: 0, buyCount: 0, visibleCount: 0, date: '' };
      const batch = batches.find((item) => String(item.batch_name) === name);
      return {
        id: String(batch?.id || name), batchName: name,
        date: String(batch?.created || stats.date || new Date().toISOString()),
        count: Number(batch?.record_count || stats.count),
        saleCount: stats.saleCount, buyCount: stats.buyCount,
        isVisible: stats.count === 0 ? true : stats.visibleCount === stats.count,
      };
    }).sort((left, right) => right.date.localeCompare(left.date));
  },

  async setBatchVisibility(batchName: string, visible: boolean): Promise<void> {
    requirePocketBaseAdmin();
    const records = await pocketbase.collection('listings').getFullList({
      filter: pocketbase.filter('import_batch = {:batchName}', { batchName }),
      fields: 'id,is_active,revision',
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < records.length) {
        const index = cursor++;
        await pocketbase.collection('listings').update(records[index].id, { is_active: visible, revision: Number(records[index].revision || 1) + 1 });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, records.length) }, () => worker()));
    void writePocketBaseAudit('batch_visibility', batchName, visible ? 'Batch made visible' : 'Batch hidden');
  },

  async deleteBatch(batchName: string): Promise<number> {
    requirePocketBaseAdmin();
    const records = await pocketbase.collection('listings').getFullList({
      filter: pocketbase.filter('import_batch = {:batchName}', { batchName }),
      fields: 'id,legacy_id',
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < records.length) {
        const index = cursor++;
        await this.remove(String(records[index].legacy_id || records[index].id), false);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, records.length) }, () => worker()));
    try {
      const batch = await pocketbase.collection('import_batches').getFirstListItem(
        pocketbase.filter('batch_name = {:batchName}', { batchName }),
      );
      await pocketbase.collection('import_batches').delete(batch.id);
    } catch (error: any) {
      if (error?.status !== 404) throw error;
    }
    void writePocketBaseAudit('batch_delete', batchName, 'Batch permanently deleted; records=' + records.length);
    return records.length;
  },

  async clearAll(): Promise<number> {
    requirePocketBaseAdmin();
    const records = await pocketbase.collection('listings').getFullList({ fields: 'id,legacy_id' });
    let cursor = 0;
    const worker = async () => {
      while (cursor < records.length) {
        const index = cursor++;
        await this.remove(String(records[index].legacy_id || records[index].id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, records.length) }, () => worker()));
    const batches = await pocketbase.collection('import_batches').getFullList({ fields: 'id' });
    await Promise.all(batches.map((batch) => pocketbase.collection('import_batches').delete(batch.id)));
    void writePocketBaseAudit('clear_all', 'all', 'All listings and import batches permanently deleted; records=' + records.length);
    return records.length;
  },
  async subscribe(onEvent: (event: PocketBaseListingEvent) => void): Promise<() => void> {
    const unsubscribe = await pocketbase.collection('listings').subscribe('*', (event) => {
      const record = event.record;
      onEvent({
        action: event.action as PocketBaseListingEvent['action'],
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
