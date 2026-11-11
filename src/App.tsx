/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { CarListing, CarListingType, FilterOptions } from './types/car';
import { generateRealisticCarListings } from './utils/dataGenerator';
import { filterCarListings, buildSearchIndex } from './utils/persianSearch';
import { pruneOldListings, toPersianDigits } from './utils/dataPruner';
import { sanitizeAndIndexListing } from './utils/sessionDataParser';
import {
  loadListingsFromIndexedDB,
  saveListingsToIndexedDB,
  clearIndexedDBListings,
  isStorageExplicitlyCleared,
  setStorageExplicitlyCleared,
  markUserVisited,
} from './utils/storage';
import { HeaderAndTabs } from './components/HeaderAndTabs';
import { SearchBarAndFilters } from './components/SearchBarAndFilters';
import { VirtualCarList } from './components/VirtualCarList';
import { CarDetailModal } from './components/CarDetailModal';
import { ColleagueAuthModal, UserAuthRole } from './components/ColleagueAuthModal';
import { DataManagerModal } from './components/DataManagerModal';
import { SettingsModal, AppFontSize, AppTheme } from './components/SettingsModal';
import { NewListingModal } from './components/NewListingModal';
import {
  subscribeToUserListings,
  addListingToCloud,
  fetchAdminDatasetFromCloud,
} from './utils/cloudSync';
import {
  fetchListingsFromLiara,
  addListingToLiara,
  updateListingOnLiara,
  fetchSyncMetaFromLiara,
  deleteListingFromLiara,
} from './utils/liaraApi';
import { pocketbase, pocketbaseListings, type PocketBaseListingEvent } from './lib/pocketbase';

const DEFAULT_FILTERS: FilterOptions = {
  type: 'sale',
  searchQuery: '',
  brand: '',
  priceRange: 'all',
  dayFilter: 'all',
  city: '',
};

const USE_POCKETBASE = Boolean(import.meta.env.VITE_POCKETBASE_URL?.trim());

export default function App() {
  // Load listings with persistence: if user cleared the data, keep it empty!
  // Start from an empty in-memory list and hydrate the local cache first.
  // Production devices must never invent a local demo catalogue: the API is authoritative.
  const [listings, setListings] = useState<CarListing[]>([]);

  // Filter state
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);

  // Selected listing for Bottom Sheet / Modal
  const [selectedListing, setSelectedListing] = useState<CarListing | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Font size setting state (normal, large, xlarge)
  const [fontSize, setFontSize] = useState<AppFontSize>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('car_app_font_size') as AppFontSize;
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') {
        return saved;
      }
    }
    return 'normal';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return typeof window !== 'undefined'
      ? new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      : '';
  });

  // Apply root font-size dynamically
  useEffect(() => {
    const root = document.documentElement;
    if (fontSize === 'large') {
      root.style.fontSize = '18px';
    } else if (fontSize === 'xlarge') {
      root.style.fontSize = '20px';
    } else {
      root.style.fontSize = '16px';
    }
    localStorage.setItem('car_app_font_size', fontSize);
  }, [fontSize]);

  const handleFontSizeChange = useCallback((newSize: AppFontSize) => {
    setFontSize(newSize);
  }, []);

  // Theme setting state ('light' | 'dark')
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('car_app_theme') as AppTheme;
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    }
    return 'light';
  });

  // Apply dark mode class to document root dynamically
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('car_app_theme', theme);
  }, [theme]);

  const handleThemeChange = useCallback((newTheme: AppTheme) => {
    setTheme(newTheme);
  }, []);

  // Roles: 'guest' (hidden phones), 'colleague' (visible phones), 'admin' (server sync & database controls)
  // Never trust a role cached by the browser; the signed server session restores it after mount.
  const [userRole, setUserRole] = useState<UserAuthRole>('guest');

  const isUnlockedColleague = userRole === 'admin' || userRole === 'colleague';

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDataManagerOpen, setIsDataManagerOpen] = useState(false);
  const [isNewListingOpen, setIsNewListingOpen] = useState(false);

  const handleUnlockSuccess = useCallback((role: 'colleague' | 'admin') => {
    setUserRole(role);
    sessionStorage.setItem('car_session_role_v2', role);
    if (role === 'admin') {
      setIsDataManagerOpen(true);
    }
  }, []);

  const handleLogoutRole = useCallback(() => {
    setUserRole('guest');
    sessionStorage.removeItem('car_session_role_v2');
    localStorage.removeItem('car_user_role');
    localStorage.removeItem('car_colleague_unlocked');
    if (USE_POCKETBASE) {
      pocketbase.authStore.clear();
    } else {
      void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    }
  }, []);

  const handleToggleColleagueLock = useCallback(() => {
    setIsAuthModalOpen(true);
  }, []);

  // Restore the native PocketBase auth record when the PocketBase backend is selected.
  useEffect(() => {
    if (USE_POCKETBASE) {
      const applyRole = (record: { role?: string } | null) => {
        const role = record?.role;
        if (role === 'admin' || role === 'colleague') {
          setUserRole(role);
          sessionStorage.setItem('car_session_role_v2', role);
        } else {
          setUserRole('guest');
          sessionStorage.removeItem('car_session_role_v2');
        }
      };
      applyRole(pocketbase.authStore.record as { role?: string } | null);
      const unsubscribe = pocketbase.authStore.onChange((_token, record) => applyRole(record as { role?: string } | null));
      return () => unsubscribe();
    }
    let active = true;
    fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (!active) return;
        if (session?.authenticated && (session.role === 'admin' || session.role === 'colleague')) {
          setUserRole(session.role);
          sessionStorage.setItem('car_session_role_v2', session.role);
        } else {
          setUserRole('guest');
          sessionStorage.removeItem('car_session_role_v2');
        }
      })
      .catch(() => {
        if (!active) return;
        setUserRole('guest');
        sessionStorage.removeItem('car_session_role_v2');
      });
    return () => { active = false; };
  }, []);
  // Centralized Data Loader:
  // 1. Immediately renders local cache so UI is instantaneous.
  // 2. Immediately fetches from Liara Server (/api/listings) so EVERY device/phone receives the admin's database.
  // 3. Polls Liara Server every 25 seconds so all open screens stay continuously synchronized.
  useEffect(() => {
    let isMounted = true;
    let lastSeenServerTimestamp = '';
    if (USE_POCKETBASE) {
      let unsubscribeRealtime: (() => Promise<void>) | null = null;
      let importRefreshTimer: ReturnType<typeof setTimeout> | null = null;
      let subscriptionQueue: Promise<void> = Promise.resolve();
      const refreshPocketBase = async () => {
        try {
          const fresh = await pocketbaseListings.list();
          if (!isMounted) return;
          setListings(fresh);
          setIsOffline(false);
          setLastSyncTime(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
        } catch (error) {
          console.error('PocketBase catalogue load failed:', error);
          if (typeof navigator !== 'undefined' && !navigator.onLine) setIsOffline(true);
        }
      };
      const handlePocketBaseEvent = async (event: PocketBaseListingEvent) => {
        if (!isMounted) return;
        if (event.action === 'delete') {
          setListings((previous) => previous.filter((item) => String(item.id) !== event.recordId));
          setSelectedListing((previous) => {
            if (previous && String(previous.id) === event.recordId) { setIsDetailOpen(false); return null; }
            return previous;
          });
          return;
        }
        if (!event.record) return;
        let liveRecord = event.record;
        if (pocketbase.authStore.isValid) {
          if (liveRecord.importBatchName && liveRecord.importBatchName !== 'ثبت‌های دستی همکاران و مدیر') {
            if (importRefreshTimer) clearTimeout(importRefreshTimer);
            importRefreshTimer = setTimeout(() => { void refreshPocketBase(); }, 2500);
          } else {
            const phoneNumber = await pocketbaseListings.getContactPhone(String(liveRecord.id));
            if (phoneNumber) liveRecord = { ...liveRecord, phoneNumber };
          }
        }
        if (!isMounted) return;
        if (liveRecord.status === 'inactive') {
          setListings((previous) => previous.filter((item) => String(item.id) !== String(liveRecord.id)));
          return;
        }
        setListings((previous) => {
          const index = previous.findIndex((item) => String(item.id) === String(liveRecord.id));
          if (index < 0) return [liveRecord as CarListing, ...previous];
          const next = [...previous];
          next[index] = { ...next[index], ...liveRecord, phoneNumber: liveRecord.phoneNumber || next[index].phoneNumber };
          return next;
        });
        setSelectedListing((previous) => previous && String(previous.id) === String(liveRecord.id)
          ? ({ ...previous, ...liveRecord, phoneNumber: liveRecord.phoneNumber || previous.phoneNumber } as CarListing)
          : previous);
      };
      const restartRealtimeSubscription = () => {
        subscriptionQueue = subscriptionQueue.catch(() => undefined).then(async () => {
          if (unsubscribeRealtime) {
            await unsubscribeRealtime();
            unsubscribeRealtime = null;
          }
          if (!isMounted) return;
          try {
            unsubscribeRealtime = await pocketbaseListings.subscribe(handlePocketBaseEvent);
          } catch (error) {
            console.error('PocketBase realtime subscription failed:', error);
          }
        });
      };
      void refreshPocketBase();
      restartRealtimeSubscription();
      const unsubscribeAuth = pocketbase.authStore.onChange(() => {
        void refreshPocketBase();
        restartRealtimeSubscription();
      });
      const handleOnline = () => { setIsOffline(false); void refreshPocketBase(); };
      const handleOffline = () => setIsOffline(true);
      const handleVisible = () => { if (document.visibilityState === 'visible') void refreshPocketBase(); };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      document.addEventListener('visibilitychange', handleVisible);
      return () => {
        isMounted = false;
        if (unsubscribeRealtime) void unsubscribeRealtime().catch((error) => console.warn('PocketBase realtime cleanup failed:', error));
        if (importRefreshTimer) clearTimeout(importRefreshTimer);
        unsubscribeAuth();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        document.removeEventListener('visibilitychange', handleVisible);
      };
    }

    // Step 1: Render local cache immediately
    if (!isStorageExplicitlyCleared()) {
      loadListingsFromIndexedDB()
        .then((cached) => {
          if (!isMounted) return;
          if (cached && cached.length > 0) {
            const { prunedListings } = pruneOldListings(cached);
            setListings(prunedListings.map(sanitizeAndIndexListing));
          }
        })
        .catch(() => {});
    }

    // Step 2: Fetch the centralized Liara Server Database (Single Source of Truth)
    const syncWithLiara = async () => {
      try {
        // Step 2a: Ultra-fast initial paint in < 300ms using fast metadata format
        const fastListings = await fetchListingsFromLiara(10000, true);
        if (fastListings !== null && isMounted) {
          const { prunedListings } = pruneOldListings(fastListings);
          setListings(prunedListings);
          setStorageExplicitlyCleared(false);
          markUserVisited();
          setIsOffline(false);
          setLastSyncTime(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
        }

        // Step 2b: Full background sync for offline IndexedDB persistence
        const liaraListings = await fetchListingsFromLiara(25000, false);
        if (liaraListings !== null && isMounted) {
          const { prunedListings } = pruneOldListings(liaraListings);
          setListings(prunedListings);
          setStorageExplicitlyCleared(false);
          markUserVisited();
          await saveListingsToIndexedDB(prunedListings);
          setIsOffline(false);
          setLastSyncTime(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
          return true;
        }
        return fastListings !== null;
      } catch (err) {
        console.warn('Could not sync with Liara server:', err);
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsOffline(true);
        }
      }
      return false;
    };

    void syncWithLiara();

    // Step 3: Real-time Live Synchronization across Mobile & Laptop (SSE)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/live-sync');
      eventSource.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.lastUpdated) {
            lastSeenServerTimestamp = data.lastUpdated;
          }
          if (data && Array.isArray(data.hiddenBatches)) {
            const serverHidden = new Set<string>(data.hiddenBatches);
            setHiddenBatches(serverHidden);
            localStorage.setItem('car_hidden_batches', JSON.stringify(data.hiddenBatches));
            window.dispatchEvent(new CustomEvent('car_batches_updated', { detail: data }));
          }

          // If a single listing was edited on another device, apply it immediately in <1ms!
          if (data && data.type === 'listing_updated' && data.listing) {
            setListings((prev) => {
              const idx = prev.findIndex((item) => String(item.id) === String(data.listing.id));
              if (idx === -1) return prev;
              const mergedItem = sanitizeAndIndexListing({
                ...prev[idx],
                ...data.listing,
                phoneNumber: prev[idx].phoneNumber || data.listing.phoneNumber,
                imageThumbnailBase64: prev[idx].imageThumbnailBase64,
                imageFullBase64: prev[idx].imageFullBase64,
                isEdited: true,
              });
              const next = [...prev];
              next[idx] = mergedItem;
              saveListingsToIndexedDB(next);
              return next;
            });
            setSelectedListing((prev) => {
              if (!prev || String(prev.id) !== String(data.listing.id)) return prev;
              return sanitizeAndIndexListing({
                ...prev,
                ...data.listing,
                phoneNumber: prev.phoneNumber || data.listing.phoneNumber,
                imageThumbnailBase64: prev.imageThumbnailBase64,
                imageFullBase64: prev.imageFullBase64,
                isEdited: true,
              });
            });
          } else if (data && data.type === 'listing_deleted' && data.id) {
            // Authoritative server delete event: purge immediately across all devices
            setListings((prev) => {
              const next = prev.filter((item) => String(item.id) !== String(data.id));
              saveListingsToIndexedDB(next);
              return next;
            });
            setSelectedListing((prev) => {
              if (prev && String(prev.id) === String(data.id)) {
                setIsDetailOpen(false);
                return null;
              }
              return prev;
            });
          } else if (data && data.type === 'clear') {
            safeFetchServerData(true, true);
          } else if (data && data.type === 'batch_deleted') {
            safeFetchServerData(true, true);
          } else if (
            data &&
            (data.type === 'bulk_sync' || data.type === 'listing_added')
          ) {
            safeFetchServerData(false, false);
          }
        } catch {
          // ignore keep-alive or non-json messages
        }
      };
    } catch (e) {
      console.warn('SSE not supported or failed to connect:', e);
    }

    // Mutex flag to prevent simultaneous race conditions when writing to IndexedDB
    let isFetchingServer = false;

    const safeFetchServerData = async (allowEmpty = false, replaceAll = false) => {
      if (isFetchingServer || !isMounted) return;
      if (typeof window !== 'undefined' && (window as any).__isSyncingToLiara) return;
      isFetchingServer = true;
      try {
        const cars = await fetchListingsFromLiara(25000);
        if (cars && isMounted) {
          const { prunedListings } = pruneOldListings(cars);
          setListings((prev) => {
            if (replaceAll) {
              saveListingsToIndexedDB(prunedListings);
              return prunedListings;
            }
            // The server is authoritative whenever it is reachable. Merging arbitrary
            // local cache entries here can resurrect records deleted on another device.
            saveListingsToIndexedDB(prunedListings);
            return prunedListings;
          });
        }
      } catch (err) {
        console.warn('Could not sync with Liara server:', err);
      } finally {
        isFetchingServer = false;
      }
    };

    // Lightweight metadata checker (~50 bytes)
    const checkSyncMeta = async () => {
      if (!isMounted) return;
      if (typeof window !== 'undefined' && (window as any).__isSyncingToLiara) return;

      try {
        const meta = await fetchSyncMetaFromLiara();
        if (!meta || !isMounted) return;

        setIsOffline(false);
        setLastSyncTime(new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));

        // Check if batch visibility changed on another phone or laptop
        if (Array.isArray(meta.hiddenBatches)) {
          setHiddenBatches((curr) => {
            const incomingArr = meta.hiddenBatches.slice().sort();
            const currArr = Array.from(curr).sort();
            if (JSON.stringify(incomingArr) !== JSON.stringify(currArr)) {
              localStorage.setItem('car_hidden_batches', JSON.stringify(meta.hiddenBatches));
              window.dispatchEvent(new CustomEvent('car_batches_updated', { detail: meta }));
              return new Set(meta.hiddenBatches);
            }
            return curr;
          });
        }

        // Purge tombstones: deleted ads on server can NEVER resurrect from client cache
        if (Array.isArray((meta as any).tombstones) && (meta as any).tombstones.length > 0) {
          const tombSet = new Set(
            (meta as any).tombstones
              .map((item: any) => typeof item === 'string' ? item : item?.id)
              .filter((id: unknown): id is string | number => typeof id === 'string' || typeof id === 'number')
              .map(String)
          );
          setListings((prev) => {
            const hasTomb = prev.some((l) => tombSet.has(String(l.id)));
            if (!hasTomb) return prev;
            const next = prev.filter((l) => !tombSet.has(String(l.id)));
            saveListingsToIndexedDB(next);
            return next;
          });
        }

        // Check if database updated (e.g. ad added or bulk sync on another device)
        if (meta.lastUpdated && meta.lastUpdated !== lastSeenServerTimestamp) {
          lastSeenServerTimestamp = meta.lastUpdated;
          await safeFetchServerData();
        }
      } catch {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsOffline(true);
        }
      }
    };

    // Step 4: Ultra-lightweight fallback polling to /api/sync-meta (~50 bytes)
    // Runs every 18s when active tab (since SSE already pushes instant updates), and every 60s when tab is hidden
    let pollInterval: NodeJS.Timeout | null = null;
    const startPolling = (ms: number) => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(() => {
        checkSyncMeta();
      }, ms);
    };

    startPolling(18000);

    // Visibility-Aware Background Sync:
    // When returning to tab or unlocking mobile phone, immediately refresh data in 1ms!
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        checkSyncMeta();
        startPolling(18000);
      } else {
        // Reduce polling frequency in background to save battery and memory
        startPolling(60000);
      }
    };

    // Online & Offline Events
    const handleOnline = () => {
      setIsOffline(false);
      checkSyncMeta();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Handle adding new listing from voice or manual entry
  const handleAddNewListing = useCallback(async (newListing: CarListing) => {
    setStorageExplicitlyCleared(false);
    const taggedListing: CarListing = {
      ...newListing,
      importBatchName: newListing.importBatchName || 'ثبت‌های دستی همکاران و مدیر',
      importDate: newListing.importDate || new Date().toLocaleDateString('fa-IR'),
    };
    if (USE_POCKETBASE) {
      try {
        const saved = await pocketbaseListings.upsert(taggedListing);
        setListings((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      } catch (error) {
        console.error('PocketBase create failed:', error);
        window.alert('ثبت آگهی در پایگاه داده انجام نشد. اتصال یا سطح دسترسی حساب را بررسی کنید.');
        throw error;
      }
    } else {
      setListings((previous) => {
        const updated = [taggedListing, ...previous.filter((item) => item.id !== taggedListing.id)];
        saveListingsToIndexedDB(updated);
        return updated;
      });
      addListingToLiara(taggedListing).catch((err) => console.warn('Could not sync new ad to Liara server:', err));
      if (typeof window !== 'undefined' && !window.location.hostname.includes('liara.run') && !window.location.hostname.includes('liara.ir')) {
        addListingToCloud(newListing).catch((err) => console.warn('Could not sync new ad to cloud:', err));
      }
    }
    setFilters((previous) => ({ ...previous, type: newListing.type, searchQuery: '' }));
  }, []);

  const handleUpdateSingleListing = useCallback(async (updatedListing: CarListing) => {
    const cleanUpdated = sanitizeAndIndexListing({ ...updatedListing, isEdited: true });
    if (USE_POCKETBASE) {
      try {
        const saved = await pocketbaseListings.update(cleanUpdated.id, cleanUpdated);
        setListings((previous) => previous.map((item) => item.id === saved.id ? saved : item));
        setSelectedListing((previous) => previous && previous.id === saved.id ? saved : previous);
      } catch (error) {
        console.error('PocketBase update failed:', error);
        window.alert('ذخیره تغییرات در پایگاه داده انجام نشد. لطفاً دوباره تلاش کنید.');
        throw error;
      }
      return;
    }
    setListings((previous) => {
      const index = previous.findIndex((item) => item.id === cleanUpdated.id);
      if (index < 0) return previous;
      const next = [...previous];
      next[index] = cleanUpdated;
      saveListingsToIndexedDB(next);
      return next;
    });
    setSelectedListing((previous) => previous && previous.id === cleanUpdated.id ? cleanUpdated : previous);
    await updateListingOnLiara(cleanUpdated);
  }, []);

  const handleDeleteSingleListing = useCallback(async (id: string) => {
    if (USE_POCKETBASE) {
      try {
        await pocketbaseListings.remove(id);
        setListings((previous) => previous.filter((item) => String(item.id) !== String(id)));
        setSelectedListing((previous) => previous && String(previous.id) === String(id) ? null : previous);
        setIsDetailOpen(false);
      } catch (error) {
        console.error('PocketBase delete failed:', error);
        window.alert('حذف آگهی از پایگاه داده انجام نشد. لطفاً سطح دسترسی حساب را بررسی کنید.');
        throw error;
      }
      return;
    }
    setListings((previous) => {
      const next = previous.filter((item) => String(item.id) !== String(id));
      saveListingsToIndexedDB(next);
      return next;
    });
    setSelectedListing((previous) => previous && String(previous.id) === String(id) ? null : previous);
    setIsDetailOpen(false);
    await deleteListingFromLiara(id);
  }, []);
  // Hidden batches state
  const [hiddenBatches, setHiddenBatches] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('car_hidden_batches');
        if (raw) return new Set(JSON.parse(raw));
      } catch {}
    }
    return new Set();
  });

  // Listen for storage events when DataManagerModal toggles batch visibility
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const raw = localStorage.getItem('car_hidden_batches');
        setHiddenBatches(raw ? new Set(JSON.parse(raw)) : new Set());
      } catch {}
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Active listings that are not hidden by the admin
  const visibleListings = useMemo(() => {
    if (hiddenBatches.size === 0) return listings;
    return listings.filter((l) => !hiddenBatches.has(l.importBatchName || 'ثبت‌های دستی همکاران و مدیر'));
  }, [listings, hiddenBatches]);

  // Compute sale and buy request counts from visible listings
  const { saleCount, buyCount } = useMemo(() => {
    let sales = 0;
    let buys = 0;
    const len = visibleListings.length;
    for (let i = 0; i < len; i++) {
      if (visibleListings[i].type === 'sale') sales++;
      else buys++;
    }
    return { saleCount: sales, buyCount: buys };
  }, [visibleListings]);

  // Fast filtered listings (< 5ms benchmark for 5,000 items)
  const filteredListings = useMemo(() => {
    return filterCarListings(visibleListings, filters);
  }, [visibleListings, filters]);

  // Active filter / search detection
  const hasActiveFilter = Boolean(
    filters.searchQuery.trim() ||
      filters.brand ||
      filters.priceRange !== 'all' ||
      filters.dayFilter !== 'all'
  );

  // Compute matches in the opposite tab when a search query or filter is active
  const otherTabMatchesCount = useMemo(() => {
    if (!hasActiveFilter) return 0;
    const oppositeType: CarListingType = filters.type === 'sale' ? 'buy_request' : 'sale';
    return filterCarListings(visibleListings, {
      ...filters,
      type: oppositeType,
    }).length;
  }, [visibleListings, filters, hasActiveFilter]);

  const saleMatchesCount =
    filters.type === 'sale'
      ? filteredListings.length
      : hasActiveFilter
      ? otherTabMatchesCount
      : saleCount;

  const buyMatchesCount =
    filters.type === 'buy_request'
      ? filteredListings.length
      : hasActiveFilter
      ? otherTabMatchesCount
      : buyCount;

  const handleTypeChange = useCallback((type: CarListingType) => {
    setFilters((prev) => ({ ...prev, type }));
  }, []);

  const handleOpenDetails = useCallback((listing: CarListing) => {
    setSelectedListing(listing);
    setIsDetailOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setIsDetailOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      type: prev.type,
    }));
  }, []);

  const handleUpdateListings = useCallback((newListings: CarListing[]) => {
    setListings(newListings);
    if (USE_POCKETBASE) {
      setStorageExplicitlyCleared(newListings.length === 0);
      return;
    }
    if (newListings.length === 0) {
      clearIndexedDBListings();
      setStorageExplicitlyCleared(true);
    } else {
      setStorageExplicitlyCleared(false);
      saveListingsToIndexedDB(newListings);
    }
  }, []);

  // Incremental append: adds new files/batches without rewriting or wiping existing listings
  const handleAppendListings = useCallback((incomingListings: CarListing[]) => {
    if (!incomingListings || incomingListings.length === 0) return;
    setStorageExplicitlyCleared(false);
    setListings((prev) => {
      if (USE_POCKETBASE) return [...incomingListings, ...prev.filter((item) => !incomingListings.some((incoming) => incoming.id === item.id))];
      const incomingIds = new Set(incomingListings.map((l) => l.id));
      const preserved = prev.filter((p) => !incomingIds.has(p.id));
      const merged = [...incomingListings, ...preserved];
      saveListingsToIndexedDB(merged);
      return merged;
    });
  }, []);

  const handleRegenerateDemo = useCallback(async () => {
    if (USE_POCKETBASE) {
      window.alert('ساخت داده آزمایشی محلی در حالت PocketBase غیرفعال است تا اطلاعات مشترک دست‌کاری نشوند.');
      return;
    }
    const raw = generateRealisticCarListings(5000);
    const { prunedListings } = pruneOldListings(raw);
    setStorageExplicitlyCleared(false);
    await saveListingsToIndexedDB(prunedListings);
    setListings(prunedListings);
  }, []);

  // Smart Auto-Hiding Header state (hides on scroll down, reveals on scroll up / at top)
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(148);
  const headerWrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollDeltaAccRef = useRef(0);

  useEffect(() => {
    const el = headerWrapperRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.offsetHeight > 0) {
        setHeaderHeight(el.offsetHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollResetKey = `${filters.type}|${filters.brand}|${filters.priceRange}|${filters.dayFilter}|${filters.searchQuery}`;

  useEffect(() => {
    setIsHeaderHidden(false);
    lastScrollTopRef.current = 0;
    scrollDeltaAccRef.current = 0;
  }, [scrollResetKey]);

  const handleListScroll = useCallback((scrollTop: number) => {
    const prevScrollTop = lastScrollTopRef.current;
    const delta = scrollTop - prevScrollTop;
    lastScrollTopRef.current = scrollTop;

    setIsScrolledDown(scrollTop > 14);

    // Always keep header visible near the top of the list
    if (scrollTop <= 36) {
      scrollDeltaAccRef.current = 0;
      setIsHeaderHidden(false);
      return;
    }

    // Never hide header while user is actively typing in the search bar
    if (typeof document !== 'undefined' && document.activeElement?.tagName === 'INPUT') {
      return;
    }

    if (Math.abs(delta) < 1.5) return;

    // Reset direction accumulator on direction reversal
    if (
      (delta > 0 && scrollDeltaAccRef.current < 0) ||
      (delta < 0 && scrollDeltaAccRef.current > 0)
    ) {
      scrollDeltaAccRef.current = 0;
    }

    scrollDeltaAccRef.current += delta;

    // Hide smoothly when scrolling down past 55px
    if (scrollDeltaAccRef.current > 24 && scrollTop > 55) {
      setIsHeaderHidden(true);
      scrollDeltaAccRef.current = 0;
    }
    // Reveal immediately when scrolling up even slightly
    else if (scrollDeltaAccRef.current < -10) {
      setIsHeaderHidden(false);
      scrollDeltaAccRef.current = 0;
    }
  }, []);

  const isCollapsedPeekVisible = isHeaderHidden && filteredListings.length > 0;

  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-slate-50 dark:bg-[#0b0f17] flex flex-col max-w-4xl mx-auto px-2.5 sm:px-4 text-slate-900 dark:text-slate-100 select-none">
      {/* Offline Status Banner (Section 8.5) */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-black shadow-md flex items-center justify-center gap-1.5 border-b border-amber-600 text-center animate-in slide-in-from-top duration-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-pulse text-slate-950" />
          <span>
            ارتباط با سرور برقرار نیست • نمایش آخرین همگام‌سازی: {toPersianDigits(lastSyncTime || 'لحظاتی پیش')}
          </span>
        </div>
      )}

      {/* Ultra-Compact Top Peek Bar when main header is scrolled up */}
      <div
        className={`fixed top-0 left-0 right-0 z-30 transition-all duration-250 ease-out ${
          isCollapsedPeekVisible
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-4xl mx-auto px-2.5 sm:px-4 pt-1">
          <div className="h-8 px-2.5 rounded-xl bg-white/95 dark:bg-[#131924]/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-sm flex items-center justify-between gap-2 text-[11px]">
            {/* Right side: Current searched word or quick tap to search */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  setIsHeaderHidden(false);
                  setTimeout(() => searchInputRef.current?.focus(), 120);
                }}
                className="flex items-center gap-1.5 min-w-0 text-right cursor-pointer group"
                title="نمایش نوار جستجو و منوی بالا"
              >
                <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                {filters.searchQuery.trim() ? (
                  <span className="font-black text-slate-900 dark:text-white truncate">
                    «{filters.searchQuery}»
                  </span>
                ) : (
                  <span className="font-bold text-slate-400 dark:text-slate-400 truncate group-hover:text-slate-600 dark:group-hover:text-slate-300">
                    جستجو در آگهی‌ها...
                  </span>
                )}
              </button>

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                  title="پاک کردن جستجو"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Left side: Artistic micro match counts for Sellers & Buyers + Expand button */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center bg-slate-100 dark:bg-[#1a2332] border border-slate-200/80 dark:border-slate-800 rounded-lg p-0.5 text-[10px] font-black leading-none">
                <button
                  type="button"
                  onClick={() => handleTypeChange('sale')}
                  className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                    filters.type === 'sale'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400'
                  }`}
                >
                  فروش {toPersianDigits(saleMatchesCount)}
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('buy_request')}
                  className={`px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                    filters.type === 'buy_request'
                      ? 'bg-emerald-600 text-white'
                      : buyMatchesCount > 0 && hasActiveFilter
                      ? 'text-emerald-700 dark:text-emerald-400 font-black'
                      : 'text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                  }`}
                >
                  خرید {toPersianDigits(buyMatchesCount)}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsHeaderHidden(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                title="باز کردن نوار بالا"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Collapsible Header & Search Bar: hides on scroll down, slides back in on scroll up */}
      <div
        ref={headerWrapperRef}
        className={`fixed top-0 left-0 right-0 z-30 bg-slate-50/95 dark:bg-[#0b0f17]/95 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          isCollapsedPeekVisible
            ? '-translate-y-full opacity-0 pointer-events-none shadow-none'
            : isScrolledDown
            ? 'translate-y-0 opacity-100 shadow-md border-b border-slate-200/90 dark:border-slate-800'
            : 'translate-y-0 opacity-100 border-b border-slate-200/70 dark:border-slate-800/80'
        }`}
      >
        <div className="max-w-4xl mx-auto px-2.5 sm:px-4">
          {/* Top Header & Main Sale/Buy Tabs */}
          <HeaderAndTabs
            activeType={filters.type}
            onTypeChange={handleTypeChange}
            saleCount={saleMatchesCount}
            buyCount={buyMatchesCount}
            isUnlockedColleague={isUnlockedColleague}
            userRole={userRole}
            onRequestColleagueModal={() => setIsAuthModalOpen(true)}
            onToggleColleagueLock={handleToggleColleagueLock}
            onOpenDataManager={() => {
              if (userRole === 'admin') {
                setIsDataManagerOpen(true);
              } else {
                setIsAuthModalOpen(true);
              }
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenNewListing={() => setIsNewListingOpen(true)}
            hasActiveFilter={hasActiveFilter}
          />

          {/* Search Bar with Inline Match Counters */}
          <SearchBarAndFilters
            filters={filters}
            onFilterChange={setFilters}
            totalMatches={filteredListings.length}
            saleMatchesCount={saleMatchesCount}
            buyMatchesCount={buyMatchesCount}
            hasActiveFilter={hasActiveFilter}
            onTypeChange={handleTypeChange}
            inputRef={searchInputRef}
          />
        </div>
      </div>

      {/* Virtualized List Container (occupies full viewport height with smart top padding) */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden" role="main">
        <VirtualCarList
          listings={filteredListings}
          totalListingsCount={listings.length}
          isUnlockedColleague={isUnlockedColleague}
          onOpenDetails={handleOpenDetails}
          onRequestUnlock={() => setIsAuthModalOpen(true)}
          onResetFilters={handleResetFilters}
          onOpenDataManager={() => setIsDataManagerOpen(true)}
          onRegenerateDemo={handleRegenerateDemo}
          onOpenNewListing={() => setIsNewListingOpen(true)}
          activeType={filters.type}
          otherTabMatchesCount={otherTabMatchesCount}
          onSwitchTab={handleTypeChange}
          topPadding={headerHeight}
          onScroll={handleListScroll}
          scrollResetKey={scrollResetKey}
        />
      </main>

      {/* Detail Bottom Sheet / Full-Screen Modal with Transparent Glass Overlay */}
      <CarDetailModal
        listing={selectedListing}
        isOpen={isDetailOpen}
        onClose={handleCloseDetails}
        isUnlockedColleague={isUnlockedColleague}
        onRequestUnlock={() => {
          setIsDetailOpen(false);
          setIsAuthModalOpen(true);
        }}
        onUpdateListing={handleUpdateSingleListing}
        onDeleteListing={handleDeleteSingleListing}
      />

      {/* New Car Ad Registration (Voice or Manual) Modal */}
      <NewListingModal
        isOpen={isNewListingOpen}
        onClose={() => setIsNewListingOpen(false)}
        onAddListing={handleAddNewListing}
        defaultType={filters.type}
      />

      {/* Colleague PIN Authentication Modal */}
      <ColleagueAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        userRole={userRole}
        onSuccess={handleUnlockSuccess}
        onLogout={handleLogoutRole}
        onOpenDataManager={() => setIsDataManagerOpen(true)}
      />

      {/* Data Manager & 4-Day Auto Prune Modal */}
      <DataManagerModal
        isOpen={isDataManagerOpen}
        onClose={() => setIsDataManagerOpen(false)}
        listings={listings}
        onUpdateListings={handleUpdateListings}
        onAppendListings={handleAppendListings}
      />

      {/* App Font Size & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChange}
        theme={theme}
        onThemeChange={handleThemeChange}
      />
    </div>
  );
}
