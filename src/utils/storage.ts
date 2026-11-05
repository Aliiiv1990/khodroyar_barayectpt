import { CarListing } from '../types/car';

const DB_NAME = 'CarExhibitionPlatformDB';
const DB_VERSION = 1;
const STORE_NAME = 'listings_cache';
const KEY_NAME = 'all_listings';

const CLEARED_FLAG_KEY = 'car_db_explicitly_cleared_v1';
const HAS_LOADED_BEFORE_KEY = 'car_db_has_visited_before_v1';

/**
 * Open or initialize the native browser IndexedDB
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Check if the user has explicitly cleared all listings
 */
export function isStorageExplicitlyCleared(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  return window.localStorage.getItem(CLEARED_FLAG_KEY) === 'true';
}

/**
 * Mark whether storage was explicitly cleared by the user
 */
export function setStorageExplicitlyCleared(cleared: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (cleared) {
    window.localStorage.setItem(CLEARED_FLAG_KEY, 'true');
  } else {
    window.localStorage.removeItem(CLEARED_FLAG_KEY);
  }
}

/**
 * Check if this is the first visit to the application
 */
export function hasUserVisitedBefore(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  return window.localStorage.getItem(HAS_LOADED_BEFORE_KEY) === 'true';
}

/**
 * Mark that the user has visited the app
 */
export function markUserVisited(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(HAS_LOADED_BEFORE_KEY, 'true');
}

/**
 * Save current listings to IndexedDB
 */
export async function saveListingsToIndexedDB(listings: CarListing[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(listings, KEY_NAME);

      req.onsuccess = () => {
        setStorageExplicitlyCleared(listings.length === 0);
        markUserVisited();
        resolve(true);
      };

      req.onerror = () => {
        console.warn('Failed to write listings to IndexedDB:', req.error);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB write error:', err);
    return false;
  }
}

/**
 * Load listings from IndexedDB
 */
export async function loadListingsFromIndexedDB(): Promise<CarListing[] | null> {
  // If explicitly cleared, do not load old cached listings
  if (isStorageExplicitlyCleared()) {
    return [];
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);

      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result)) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        console.warn('Failed to read from IndexedDB:', req.error);
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
    return null;
  }
}

/**
 * Append or merge new listings into IndexedDB without wiping existing records
 */
export async function appendListingsToIndexedDB(newListings: CarListing[]): Promise<CarListing[]> {
  try {
    const current = (await loadListingsFromIndexedDB()) || [];
    const incomingIds = new Set(newListings.map((l) => l.id));
    const merged = [...newListings, ...current.filter((item) => !incomingIds.has(item.id))];
    await saveListingsToIndexedDB(merged);
    return merged;
  } catch (err) {
    console.warn('IndexedDB append error:', err);
    await saveListingsToIndexedDB(newListings);
    return newListings;
  }
}

/**
 * Completely clear cached listings from IndexedDB
 */
export async function clearIndexedDBListings(): Promise<boolean> {
  setStorageExplicitlyCleared(true);
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_NAME);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
    return false;
  }
}
