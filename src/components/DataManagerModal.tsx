import React, { useState, useRef } from 'react';
import { CarListing } from '../types/car';
import { pruneOldListings, toPersianDigits, MAX_RETENTION_DAYS } from '../utils/dataPruner';
import { generateRealisticCarListings } from '../utils/dataGenerator';
import {
  parseZipArchive,
  parseSessionJson,
  parseCarCsv,
  sanitizeAndIndexListing,
  SessionJsonRoot,
  extractBuyersArray,
  extractSellersArray,
  isBuyerRecord,
} from '../utils/sessionDataParser';
import { parseSellersJson } from '../utils/sellerDataParser';
import { clearIndexedDBListings, saveListingsToIndexedDB, setStorageExplicitlyCleared } from '../utils/storage';
import { publishAdminDatasetToCloud, fetchAdminDatasetFromCloud } from '../utils/cloudSync';
import { checkCloudConnection } from '../lib/firebase';
import { pocketbase, pocketbaseListings } from '../lib/pocketbase';
import { publishListingsToPocketBase } from '../lib/pocketbaseImport';
import { getListingImage } from '../utils/imageHelper';
import { buildSearchIndex } from '../utils/persianSearch';
import {
  checkLiaraHealth,
  fetchListingsFromLiara,
  publishListingsToLiara,
  clearLiaraDatabase,
  downloadLiaraDeploymentZip,
  fetchLiaraBatches,
  deleteLiaraBatches,
  LiaraBatchInfo,
  LiaraHealthResponse,
  setLiaraBatchVisibility,
  setMultipleLiaraBatchesVisibility,
  verifyServerIntegrity,
  uploadZipFileToLiara,
} from '../utils/liaraApi';
import {
  X,
  Database,
  UploadCloud,
  Download,
  Trash2,
  Sparkles,
  Check,
  AlertCircle,
  FileCode,
  AlertTriangle,
  Upload,
  Archive,
  FileSpreadsheet,
  CheckCircle2,
  HelpCircle,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Globe,
  Server,
  HardDrive,
  Send,
  ExternalLink,
  Shield,
  Layers,
  Zap,
  FolderArchive,
  Box,
  Eye,
  EyeOff,
} from 'lucide-react';

interface DataManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  listings: CarListing[];
  onUpdateListings: (newListings: CarListing[]) => void;
  onAppendListings?: (incomingListings: CarListing[]) => void;
}

// Complete mock session adhering to the Car Exhibition Dataset Specification
const SPEC_SAMPLE_SESSION: SessionJsonRoot = {
  version: 2,
  normalizationRules: [
    {
      id: 'rule-207',
      targetName: 'پژو ۲۰۷ سقف شیشه‌ای',
      aliases: ['207 پانا', '۲۰۷ پانوراما', '207 سقف شیشه'],
    },
    {
      id: 'rule-tara',
      targetName: 'ایران خودرو تارا اتوماتیک V4',
      aliases: ['تارا اتو', 'تارا v4', 'تارا اتومات'],
    },
  ],
  dominantKeywords: ['تیپ 2', 'توربو', 'اتومات', 'پانوراما'],
  sellers: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      rowIndex: 1,
      imageFileName: '989122959582_9584.jpg',
      status: 'success',
      اسم_ماشین: '207 پانا',
      سال_ساخت: '۱۴۰۴',
      رنگ: 'سفید',
      کارکرد_کیلومتر: '۰',
      قیمت_تومان: '۸۴۰,۰۰۰,۰۰۰',
      اسم_فروشنده: '989122959582',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      rowIndex: 2,
      imageFileName: '989122720114_7282.jpg',
      status: 'success',
      اسم_ماشین: 'ایران خودرو تارا',
      سال_ساخت: '1403',
      رنگ: 'مشکی متالیک',
      کارکرد_کیلومتر: '۱۵,۰۰۰',
      قیمت_تومان: '۹۲۰,۰۰۰,۰۰۰',
      اسم_فروشنده: '989122720114',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      rowIndex: 3,
      imageFileName: '989121769442_5144.txt',
      status: 'success',
      اسم_ماشین: 'تویوتا کمری',
      سال_ساخت: '2025',
      رنگ: 'سربی',
      کارکرد_کیلومتر: '۵,۰۰۰',
      قیمت_تومان: '۴,۲۰۰,۰۰۰,۰۰۰',
      اسم_فروشنده: '989121769442',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      rowIndex: 4,
      imageFileName: '989128360320_8568_۸۲_چن_لکه_رنگ.jpg',
      status: 'success',
      اسم_ماشین: 'سیتروئن زانتیا',
      سال_ساخت: '82',
      رنگ: 'نقره‌ای',
      کارکرد_کیلومتر: '۲۲۰,۰۰۰',
      قیمت_تومان: '۳۱۰,۰۰۰,۰۰۰',
      اسم_فروشنده: '989128360320',
    },
  ],
  buyers: [
    {
      id: 'buyer-uuid-8801',
      rowIndex: 1,
      imageFileName: 'ورودی دستی',
      status: 'success',
      اسم_مشتری: '989124383296',
      اسم_ماشین: 'نیسان جوک',
      سال_ساخت: '2017 به بالا',
      رنگ: 'مشکی یا سفید',
      بودجه_تقریبی_تومان: '۱,۶۰۰,۰۰۰,۰۰۰',
      توضیحات_بیشتر: 'خریدار نقدی فوری، بدون رنگ، کارکرد زیر ۸۰ هزار',
    },
    {
      id: 'buyer-uuid-8802',
      rowIndex: 2,
      imageFileName: 'ورودی دستی',
      status: 'success',
      اسم_مشتری: '989121837606',
      اسم_ماشین: 'هیوندای پالیسید',
      سال_ساخت: '2025 یا 2026',
      رنگ: 'مشکی',
      بودجه_تقریبی_تومان: 'توافقی',
      توضیحات_بیشتر: 'تحویل فوری روز، تسویه در صرافی',
    },
  ],
};

const USE_POCKETBASE = Boolean(import.meta.env.VITE_POCKETBASE_URL?.trim());

export const DataManagerModal: React.FC<DataManagerModalProps> = ({
  isOpen,
  onClose,
  listings,
  onUpdateListings,
  onAppendListings,
}) => {
  const [inputText, setInputText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'liara' | 'status' | 'import' | 'iran_sync' | 'spec'>('liara');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isPublishingCloud, setIsPublishingCloud] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const [isFetchingCloud, setIsFetchingCloud] = useState(false);
  const [isCheckingConn, setIsCheckingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [iranServerUrl, setIranServerUrl] = useState(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('car_iran_server_url') : '') || '';
  });
  const [isFetchingIran, setIsFetchingIran] = useState(false);
  const [liaraHealth, setLiaraHealth] = useState<LiaraHealthResponse | null>(null);
  const [isCheckingLiara, setIsCheckingLiara] = useState(false);
  const [isPublishingLiara, setIsPublishingLiara] = useState(false);
  const [isFetchingLiara, setIsFetchingLiara] = useState(false);
  const [isDownloadingLiaraZip, setIsDownloadingLiaraZip] = useState(false);
  const [liaraZipProgress, setLiaraZipProgress] = useState(0);
  const [batches, setBatches] = useState<LiaraBatchInfo[]>([]);
  const [hiddenBatches, setHiddenBatches] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('car_hidden_batches');
        if (raw) return new Set(JSON.parse(raw));
      } catch {}
    }
    return new Set();
  });
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [newlyImportedBatch, setNewlyImportedBatch] = useState<{
    batchName: string;
    listings: CarListing[];
    count: number;
    sellersCount: number;
    buyersCount: number;
    rawFile?: File;
  } | null>(null);
  const [publishingBatchName, setPublishingBatchName] = useState<string | null>(null);
  const [isVerifyingIntegrity, setIsVerifyingIntegrity] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<{
    success: boolean;
    totalListings?: number;
    salesCount?: number;
    buysCount?: number;
    revision?: number;
    batches?: Record<string, number>;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipDirectFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingZipDirect, setIsUploadingZipDirect] = useState(false);
  const [zipDirectProgress, setZipDirectProgress] = useState(0);

  const handleDirectZipUpload = async (file: File) => {
    setIsUploadingZipDirect(true);
    setZipDirectProgress(0);
    setImportStatus(`در حال آپلود و ذخیره فایل ${file.name} در دیسک دائمی لیارا...`);
    setIsSuccess(false);

    try {
      const res = await uploadZipFileToLiara(file, file.name, (p, msg) => {
        setZipDirectProgress(p);
        if (msg) setImportStatus(msg);
      }, USE_POCKETBASE ? pocketbase.authStore.token : undefined);
      if (res.success) {
        setIsSuccess(true);
        setImportStatus(res.message);

        // Refresh from the selected authoritative backend.
        const refreshed = USE_POCKETBASE
          ? await pocketbaseListings.list()
          : await fetchListingsFromLiara(20000, true);
        if (refreshed && refreshed.length > 0) {
          onUpdateListings(refreshed);
          if (!USE_POCKETBASE) await saveListingsToIndexedDB(refreshed);
        }
        await handleCheckLiara();
        await loadBatches();
      } else {
        setIsSuccess(false);
        setImportStatus(`خطا در آپلود به سرور: ${res.message}`);
      }
    } catch (err: any) {
      setIsSuccess(false);
      setImportStatus(`خطا در آپلود: ${err.message || 'مشکل در ارتباط با سرور'}`);
    } finally {
      setIsUploadingZipDirect(false);
      if (zipDirectFileInputRef.current) zipDirectFileInputRef.current.value = '';
    }
  };

  const handleVerifyIntegrity = async () => {
    setIsVerifyingIntegrity(true);
    setIntegrityReport(null);
    try {
      const res = await verifyServerIntegrity();
      if (res) {
        setIntegrityReport(res);
      } else {
        setIntegrityReport({ success: false, error: 'سرور پاسخی ارسال نکرد.' });
      }
    } catch (err: any) {
      setIntegrityReport({ success: false, error: err.message || 'خطای شبکه' });
    } finally {
      setIsVerifyingIntegrity(false);
    }
  };

  // Load server batches and their visibility status
  const loadBatches = async () => {
    setIsLoadingBatches(true);
    try {
      if (USE_POCKETBASE) {
        const serverBatches = await pocketbaseListings.listBatches();
        setBatches(serverBatches as LiaraBatchInfo[]);
        const serverHidden = new Set<string>(serverBatches.filter((batch) => !batch.isVisible).map((batch) => batch.batchName));
        setHiddenBatches(serverHidden);
        localStorage.setItem('car_hidden_batches', JSON.stringify(Array.from(serverHidden)));
      } else {
        const serverBatches = await fetchLiaraBatches();
        setBatches(serverBatches);
        const serverHidden = new Set<string>();
        for (const b of serverBatches) if (b.isVisible === false) serverHidden.add(b.batchName);
        setHiddenBatches(serverHidden);
        if (typeof window !== 'undefined') localStorage.setItem('car_hidden_batches', JSON.stringify(Array.from(serverHidden)));
      }
    } catch {
      // Ignore transient backend errors; the listing view remains usable.
    } finally {
      setIsLoadingBatches(false);
    }
  };

  // Check Liara health and load batches on modal open, and listen to real-time sync events from other devices
  React.useEffect(() => {
    if (isOpen) {
      handleCheckLiara();
      loadBatches();

      const handleLiveSync = () => {
        loadBatches();
      };
      window.addEventListener('car_batches_updated', handleLiveSync);
      window.addEventListener('storage', handleLiveSync);
      return () => {
        window.removeEventListener('car_batches_updated', handleLiveSync);
        window.removeEventListener('storage', handleLiveSync);
      };
    }
  }, [isOpen]);

  // Check connectivity to Liara Backend Server
  const handleCheckLiara = async () => {
    setIsCheckingLiara(true);
    try {
      if (USE_POCKETBASE) {
        const records = await pocketbaseListings.list();
        setLiaraHealth({
          status: 'ok', platform: 'PocketBase', dbLocation: 'PocketBase persistent storage',
          isLiaraDisk: false, totalListings: records.length,
          salesCount: records.filter((item) => item.type === 'sale').length,
          buysCount: records.filter((item) => item.type === 'buy_request').length,
          lastUpdated: new Date().toISOString(),
        });
        return;
      }
      const res = await checkLiaraHealth(6000);
      if (res.ok && res.data) {
        setLiaraHealth(res.data);
      } else {
        setLiaraHealth(null);
      }
    } catch {
      setLiaraHealth(null);
    } finally {
      setIsCheckingLiara(false);
    }
  };

  // Combine server batches with local listings for guaranteed visibility
  const displayBatches = React.useMemo(() => {
    const map = new Map<string, LiaraBatchInfo>();

    // 1. First add server batches
    for (const b of batches) {
      map.set(b.batchName, {
        ...b,
        isVisible: !hiddenBatches.has(b.batchName),
      });
    }

    // 2. Also ensure any local batches (including manual entries) are represented
    for (const item of listings) {
      const bName = item.importBatchName || 'ثبت‌های دستی همکاران و مدیر';
      const bDate = item.importDate || (item.createdAt ? new Date(item.createdAt).toLocaleDateString('fa-IR') : 'امروز');
      const existing = map.get(bName);
      if (!existing) {
        map.set(bName, {
          id: bName,
          batchName: bName,
          date: bDate,
          count: 1,
          saleCount: item.type === 'buy_request' ? 0 : 1,
          buyCount: item.type === 'buy_request' ? 1 : 0,
          isVisible: !hiddenBatches.has(bName),
        });
      }
    }

    return Array.from(map.values());
  }, [batches, listings, hiddenBatches]);

  // Toggle visibility of a specific batch/file
  const handleToggleBatchVisibility = async (batchName: string) => {
    const isCurrentlyHidden = hiddenBatches.has(batchName);
    const newIsVisible = isCurrentlyHidden; // If hidden, make visible; if visible, hide!

    const nextHidden = new Set(hiddenBatches);
    if (newIsVisible) {
      nextHidden.delete(batchName);
    } else {
      nextHidden.add(batchName);
    }
    setHiddenBatches(nextHidden);
    if (typeof window !== 'undefined') {
      localStorage.setItem('car_hidden_batches', JSON.stringify(Array.from(nextHidden)));
      // Dispatch storage event so App.tsx can re-render immediately
      window.dispatchEvent(new Event('storage'));
    }

    try {
      if (USE_POCKETBASE) {
        await pocketbaseListings.setBatchVisibility(batchName, newIsVisible);
        setImportStatus(newIsVisible ? 'بسته «' + batchName + '» در PocketBase فعال شد.' : 'بسته «' + batchName + '» در PocketBase مخفی شد.');
        setIsSuccess(true);
        await loadBatches();
        return;
      }
      const res = await setLiaraBatchVisibility(batchName, newIsVisible);
      setImportStatus(
        newIsVisible
          ? `فایل/بسته «${batchName}» فعال شد و محتوای آن در لیست به همه نمایش داده می‌شود.`
          : `فایل/بسته «${batchName}» موقتاً مخفی شد (داده‌ها در سرور محفوظ است ولی در لیست به کاربران نمایش داده نمی‌شود).`
      );
      setIsSuccess(true);
      loadBatches();
    } catch (err: any) {
      setImportStatus(`خطا در تغییر وضعیت نمایش: ${err.message || 'مشکل ارتباط با سرور'}`);
      setIsSuccess(false);
    }
  };

  // Show all batches
  const handleShowAllBatches = async () => {
    const allBatchNames = displayBatches.map((b) => b.batchName);
    setHiddenBatches(new Set());
    if (typeof window !== 'undefined') {
      localStorage.setItem('car_hidden_batches', JSON.stringify([]));
      window.dispatchEvent(new Event('storage'));
    }
    try {
      if (USE_POCKETBASE) {
        await Promise.all(allBatchNames.map((name) => pocketbaseListings.setBatchVisibility(name, true)));
        setImportStatus('تمامی بسته‌ها در PocketBase فعال شدند.');
        setIsSuccess(true);
        await loadBatches();
        return;
      }
      await setMultipleLiaraBatchesVisibility(allBatchNames, true);
      setImportStatus('تمامی فایل‌ها و بسته‌ها فعال شدند و در برنامه نمایش داده می‌شوند.');
      setIsSuccess(true);
      loadBatches();
    } catch (err: any) {
      setImportStatus(`خطا در فعال‌سازی: ${err.message}`);
      setIsSuccess(false);
    }
  };

  // Hide all batches
  const handleHideAllBatches = async () => {
    const allBatchNames = displayBatches.map((b) => b.batchName);
    setHiddenBatches(new Set(allBatchNames));
    if (typeof window !== 'undefined') {
      localStorage.setItem('car_hidden_batches', JSON.stringify(allBatchNames));
      window.dispatchEvent(new Event('storage'));
    }
    try {
      if (USE_POCKETBASE) {
        await Promise.all(allBatchNames.map((name) => pocketbaseListings.setBatchVisibility(name, false)));
        setImportStatus('تمامی بسته‌ها در PocketBase مخفی شدند؛ اطلاعات حذف نشده‌اند.');
        setIsSuccess(true);
        await loadBatches();
        return;
      }
      await setMultipleLiaraBatchesVisibility(allBatchNames, false);
      setImportStatus('تمامی فایل‌ها موقتاً مخفی شدند (داده‌ها در سرور محفوظ است).');
      setIsSuccess(true);
      loadBatches();
    } catch (err: any) {
      setImportStatus(`خطا در مخفی‌سازی: ${err.message}`);
      setIsSuccess(false);
    }
  };

  // Delete a specific batch from server and local state
  const handleDeleteSingleBatch = async (batchName: string) => {
    setIsDeletingBatch(true);
    setImportStatus(`در حال حذف دائم بسته «${batchName}» از سرور لیارا و این دستگاه...`);

    try {
      if (USE_POCKETBASE) {
        await pocketbaseListings.deleteBatch(batchName);
        const remainingListings = await pocketbaseListings.list();
        onUpdateListings(remainingListings);
        setHiddenBatches((previous) => { const next = new Set(previous); next.delete(batchName); return next; });
        setImportStatus('بسته «' + batchName + '» به‌طور دائم از PocketBase حذف شد.');
        setIsSuccess(true);
        await handleCheckLiara();
        await loadBatches();
        return;
      }
      const res = await deleteLiaraBatches({ batchName });

      const remainingListings = listings.filter((l) => (l.importBatchName || 'ثبت‌های دستی همکاران و مدیر') !== batchName);
      await saveListingsToIndexedDB(remainingListings);
      onUpdateListings(remainingListings);

      setHiddenBatches((prev) => {
        const next = new Set(prev);
        next.delete(batchName);
        return next;
      });

      setImportStatus(res.message || `بسته «${batchName}» با موفقیت به طور دائم حذف شد.`);
      setIsSuccess(true);
      handleCheckLiara();
      loadBatches();
    } catch (err: any) {
      setImportStatus(`خطا در حذف بسته: ${err.message || 'مشکل ارتباط با سرور'}`);
      setIsSuccess(false);
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Publish listings to Liara centralized database on disk (Safe Merge)
  // Supports publishing only the newly imported batch, a specific file, or all listings
  const handlePublishToLiara = async (customListings?: CarListing[], customTitle?: string) => {
    const targetListings = customListings || (newlyImportedBatch ? newlyImportedBatch.listings : listings);
    const targetTitle = customTitle || (newlyImportedBatch ? newlyImportedBatch.batchName : 'تمامی آگهی‌ها');

    if (targetListings.length === 0) {
      setImportStatus('ابتدا باید دیتایی وارد سامانه شده باشد تا روی سرور لیارا ذخیره گردد.');
      setIsSuccess(false);
      return;
    }
    setIsPublishingLiara(true);
    setPublishingBatchName(targetTitle);
    setPublishProgress(0);
    setImportStatus(`در حال ارسال «${targetTitle}» (${toPersianDigits(targetListings.length)} خودرو) به سرور لیارا (بدون حذف فایل‌های قبلی)...`);
    if (typeof window !== 'undefined') {
      (window as any).__isSyncingToLiara = true;
    }
    try {
      if (USE_POCKETBASE) {
        const result = await publishListingsToPocketBase(targetListings, targetTitle, (progress) => {
          setPublishProgress(progress.percent);
          setImportStatus('در حال ثبت در PocketBase: ' + toPersianDigits(progress.processed) + ' از ' + toPersianDigits(progress.total) + ' رکورد (' + toPersianDigits(progress.percent) + '٪)');
        }, targetTitle);
        const refreshed = await pocketbaseListings.list();
        onUpdateListings(refreshed);
        setImportStatus('ثبت در PocketBase کامل شد: ' + toPersianDigits(result.saved) + ' رکورد در بسته «' + targetTitle + '».');
        setIsSuccess(true);
        if (newlyImportedBatch && targetTitle === newlyImportedBatch.batchName) setNewlyImportedBatch(null);
        await handleCheckLiara();
        await loadBatches();
        return;
      }
      const res = await publishListingsToLiara(
        targetListings,
        true, // Safe append/merge mode! Never wipe previous batches
        'مدیر نمایشگاه',
        (percent, curBatch, totalBatches) => {
          setPublishProgress(percent);
          if (curBatch === 0) {
            setImportStatus(`در حال بهینه‌سازی و فشرده‌سازی تصاویر برای ارسال سریع (${toPersianDigits(percent)}٪)...`);
          } else {
            setImportStatus(
              `در حال ارسال بسته اطلاعاتی ${toPersianDigits(curBatch)} از ${toPersianDigits(totalBatches)} به سرور لیارا (${toPersianDigits(percent)}٪)...`
            );
          }
        }
      );
      if (res.success) {
        setImportStatus(
          res.message || `بسته «${targetTitle}» (${toPersianDigits(targetListings.length)} خودرو) با موفقیت در دیتابیس لیارا ثبت شد و فایل‌های قبلی کاملاً حفظ شدند.`
        );
        setIsSuccess(true);
        // Clear newly imported batch if it was just successfully published
        if (newlyImportedBatch && (customListings === newlyImportedBatch.listings || !customListings)) {
          setNewlyImportedBatch(null);
        }
        handleCheckLiara();
        loadBatches();
      } else {
        setImportStatus(res.message);
        setIsSuccess(false);
      }
    } catch (err: any) {
      setImportStatus(`خطا در ارتباط با سرور لیارا: ${err.message || 'خطای شبکه'}`);
      setIsSuccess(false);
    } finally {
      if (typeof window !== 'undefined') {
        (window as any).__isSyncingToLiara = false;
      }
      setIsPublishingLiara(false);
      setPublishingBatchName(null);
    }
  };

  // Fetch all current listings from Liara centralized database
  const handleFetchFromLiara = async () => {
    setIsFetchingLiara(true);
    setImportStatus('در حال دریافت آخرین نسخه بانک اطلاعاتی از دیتابیس سرور لیارا...');
    try {
      const serverListings = await fetchListingsFromLiara();
      if (serverListings && serverListings.length > 0) {
        const { prunedListings } = pruneOldListings(serverListings);
        setStorageExplicitlyCleared(false);
        await saveListingsToIndexedDB(prunedListings);
        onUpdateListings(prunedListings);
        setImportStatus(
          `بانک اطلاعاتی لیارا (${toPersianDigits(prunedListings.length)} خودرو) با موفقیت دریافت و فعال گردید.`
        );
        setIsSuccess(true);
        handleCheckLiara();
      } else {
        setImportStatus('سرور لیارا پاسخی نداد یا هنوز داده‌ای در دیتابیس لیارا ثبت نشده است.');
        setIsSuccess(false);
      }
    } catch (err: any) {
      setImportStatus(`خطا در دریافت از لیارا: ${err.message || 'مشکل اتصال'}`);
      setIsSuccess(false);
    } finally {
      setIsFetchingLiara(false);
    }
  };

  // Download ready-to-deploy zip for Liara Drag & Drop
  const handleDownloadLiaraZip = async () => {
    setIsDownloadingLiaraZip(true);
    setLiaraZipProgress(15);
    setImportStatus('در حال ساخت بسته استقرار فشرده مخصوص Drag & Drop در پنل لیارا...');
    try {
      await downloadLiaraDeploymentZip((p) => {
        setLiaraZipProgress(p);
      });
      setImportStatus(
        'فایل زیپ استقرار (liara_deployment_*.zip) آماده و دانلود شد! اکنون کافیست وارد console.liara.ir شده و آن را با Drag & Drop آپلود فرمایید.'
      );
      setIsSuccess(true);
    } catch (e: any) {
      setImportStatus(`خطا در ایجاد فایل زیپ: ${e.message}`);
      setIsSuccess(false);
    } finally {
      setIsDownloadingLiaraZip(false);
    }
  };

  if (!isOpen) return null;

  // Manual Cloud Connectivity Tester
  const handleTestCloudConnection = async () => {
    setIsCheckingConn(true);
    setConnResult(null);
    try {
      const res = await checkCloudConnection(9000);
      setConnResult(res);
      setImportStatus(res.message);
      setIsSuccess(res.ok);
    } catch (e: any) {
      setConnResult({ ok: false, message: e.message || 'خطا در ارتباط با سرور فایربیس' });
      setIsSuccess(false);
    } finally {
      setIsCheckingConn(false);
    }
  };

  // Cloud Publish handler (Admin uploads daily data for all users)
  const handlePublishToCloud = async () => {
    if (listings.length === 0) {
      setImportStatus('ابتدا باید دیتایی وارد سامانه شده باشد تا روی ابر منتشر شود.');
      setIsSuccess(false);
      return;
    }

    setIsPublishingCloud(true);
    setPublishProgress(0);
    setImportStatus('در حال اتصال به سرور ابری و ارسال بسته‌های اطلاعاتی (Firestore)...');

    try {
      await publishAdminDatasetToCloud(listings, (percent, curChunk, totalChunks) => {
        setPublishProgress(percent);
        if (totalChunks > 0 && curChunk > 0) {
          setImportStatus(
            `در حال ارسال بسته اطلاعاتی ${toPersianDigits(curChunk)} از ${toPersianDigits(totalChunks)} (${toPersianDigits(percent)}٪)...`
          );
        }
      });
      setImportStatus(
        `بانک اطلاعات روزانه (${toPersianDigits(listings.length)} آگهی) با موفقیت در پایگاه ابری منتشر شد! هم‌اکنون تمامی بازدیدکنندگان این داده‌ها را دریافت می‌کنند.`
      );
      setIsSuccess(true);
    } catch (err: any) {
      const msg = err.message || 'مشکل در برقراری ارتباط با فایربیس';
      setImportStatus(`خطا در انتشار ابری: ${msg}`);
      setIsSuccess(false);
    } finally {
      setIsPublishingCloud(false);
    }
  };

  // Cloud Fetch handler (Fetch latest admin dataset)
  const handleFetchFromCloud = async () => {
    setIsFetchingCloud(true);
    setPublishProgress(0);
    setImportStatus('در حال بررسی و بارگیری آخرین نسخه بانک اطلاعاتی از فضای ابری...');

    try {
      const cloudData = await fetchAdminDatasetFromCloud((percent) => {
        setPublishProgress(percent);
        setImportStatus(`در حال بارگیری بسته‌های اطلاعاتی ابری (${toPersianDigits(percent)}٪)...`);
      });

      if (cloudData && cloudData.length > 0) {
        const { prunedListings } = pruneOldListings(cloudData);
        setStorageExplicitlyCleared(false);
        await saveListingsToIndexedDB(prunedListings);
        onUpdateListings(prunedListings);
        setImportStatus(
          `آخرین نسخه بانک اطلاعات ابری (${toPersianDigits(prunedListings.length)} خودرو) با موفقیت دریافت و بارگذاری شد.`
        );
        setIsSuccess(true);
      } else {
        setImportStatus('هنوز بانک اطلاعاتی روزانه‌ای توسط ادمین در ابر ثبت نشده است.');
        setIsSuccess(false);
      }
    } catch (err: any) {
      setImportStatus(`خطا در دریافت اطلاعات ابری: ${err.message || 'مشکل اتصال'}`);
      setIsSuccess(false);
    } finally {
      setIsFetchingCloud(false);
    }
  };

  // Export full backup with images for Telegram, Bale, Eitaa, etc. (No VPN needed)
  const handleExportFullBackup = () => {
    if (listings.length === 0) {
      setImportStatus('ابتدا باید داده‌ای در برنامه وجود داشته باشد تا فایل پشتیبان ساخته شود.');
      setIsSuccess(false);
      return;
    }
    const fullBackup = listings.map((l) => ({
      ...l,
      imageThumbnailBase64: getListingImage(l, false),
      imageFullBase64: getListingImage(l, true),
    }));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `car_database_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setImportStatus(
      `فایل دیتابیس کامل روزانه (${toPersianDigits(listings.length)} خودرو همراه با عکس‌ها) دانلود شد. می‌توانید این فایل را در ایتا، بله یا تلگرام برای همکاران ارسال فرمایید.`
    );
    setIsSuccess(true);
  };

  // Fetch directly from Iranian host / custom server (No VPN needed)
  const handleFetchFromIranServer = async () => {
    if (!iranServerUrl.trim()) {
      setImportStatus('لطفاً آدرس اینترنتی فایل JSON روی هاست ایران را وارد کنید (مثال: https://mysite.ir/cars.json)');
      setIsSuccess(false);
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('car_iran_server_url', iranServerUrl.trim());
    }
    setIsFetchingIran(true);
    setImportStatus('در حال اتصال به سرور ایران و بارگیری مستقیم فایل...');

    try {
      const resp = await fetch(iranServerUrl.trim());
      if (!resp.ok) {
        throw new Error(`خطای دریافت از سرور: کد وضعیت ${resp.status}`);
      }
      const rawText = await resp.text();
      await processJsonText(rawText, false);
      setImportStatus('بانک اطلاعات خودروها با موفقیت از سرور ایران دریافت و در برنامه فعال گردید.');
      setIsSuccess(true);
    } catch (e: any) {
      setImportStatus(`خطا در ارتباط با سرور ایران: ${e.message || 'عدم دسترسی به فایل یا مسدود بودن CORS'}`);
      setIsSuccess(false);
    } finally {
      setIsFetchingIran(false);
    }
  };

  // Clear all listings (both locally and on Liara server)
  const handleConfirmClearAll = async () => {
    await clearIndexedDBListings();
    setStorageExplicitlyCleared(true);
    onUpdateListings([]);
    setShowClearConfirm(false);

    try {
      await clearLiaraDatabase();
      setImportStatus('تمامی آگهی‌ها هم از روی این دستگاه و هم از روی سرور لیارا به طور کامل پاکسازی شدند (دیتابیس کاملاً خالی شد).');
    } catch {
      setImportStatus('تمامی آگهی‌های این دستگاه پاک شدند.');
    }
    setIsSuccess(true);
    handleCheckLiara();
    loadBatches();
  };

  const handlePruneNow = async () => {
    const { prunedListings, removedCount } = pruneOldListings(listings);
    await saveListingsToIndexedDB(prunedListings);
    onUpdateListings(prunedListings);
    setImportStatus(
      `پاکسازی خودکار انجام شد: ${toPersianDigits(removedCount)} آگهی قدیمی‌تر از ۴ روز حذف گردید.`
    );
    setIsSuccess(true);
  };

  const handleRegenerate5000 = async () => {
    const fresh = generateRealisticCarListings(5000);
    const { prunedListings } = pruneOldListings(fresh);
    setStorageExplicitlyCleared(false);
    await saveListingsToIndexedDB(prunedListings);
    onUpdateListings(prunedListings);
    setImportStatus(`۵,۰۰۰ آگهی جدید و واقعی با موفقیت در بانک اطلاعاتی مرورگر بارگذاری شد.`);
    setIsSuccess(true);
  };

  const handleLoadSpecSample = () => {
    setInputText(JSON.stringify(SPEC_SAMPLE_SESSION, null, 2));
    setActiveTab('import');
    setImportStatus('نمونه داده استاندارد session.json (شامل فروشندگان و خریداران) در کادر قرار گرفت.');
    setIsSuccess(true);
  };

  // Handles ZIP, JSON or CSV file selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportStatus(`در حال پردازش فایل ${file.name}...`);

    try {
      const fileNameLower = file.name.toLowerCase();

      // Case A: ZIP archive (car_session_*.zip)
      if (fileNameLower.endsWith('.zip')) {
        setActiveTab('liara');
        await handleDirectZipUpload(file);
        return;
      }
      // Case B: CSV file
      else if (fileNameLower.endsWith('.csv')) {
        const text = await file.text();
        const csvListings = parseCarCsv(text, file.name);
        if (csvListings.length === 0) {
          throw new Error('هیچ رکوردی در فایل CSV یافت نشد.');
        }

        if (onAppendListings) {
          onAppendListings(csvListings);
        } else {
          const existingOtherListings = listings.filter((l) => (l.importBatchName || '') !== file.name);
          const mergedListings = [...csvListings, ...existingOtherListings];
          setStorageExplicitlyCleared(false);
          await saveListingsToIndexedDB(mergedListings);
          onUpdateListings(mergedListings);
        }

        const sales = csvListings.filter((l) => l.type === 'sale').length;
        const buys = csvListings.filter((l) => l.type === 'buy_request').length;

        setNewlyImportedBatch({
          batchName: file.name,
          listings: csvListings,
          count: csvListings.length,
          sellersCount: sales,
          buyersCount: buys,
        });

        setImportStatus(`فایل CSV (${file.name}) اضافه شد: ${toPersianDigits(csvListings.length)} رکورد آماده انتشار در لیارا هستند.`);
        setIsSuccess(true);
        setActiveTab('liara');
        loadBatches();
      }
      // Case C: JSON file (session.json)
      else {
        const text = await file.text();
        setInputText(text);
        await processJsonText(text, false, file.name);
      }
    } catch (err: any) {
      setImportStatus(`خطا در باز کردن فایل: ${err.message || 'فرمت نامعتبر است'}`);
      setIsSuccess(false);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processJsonText = async (rawText: string, append = false, sourceBatchName = 'فایل داده') => {
    try {
      if (!rawText.trim()) {
        setImportStatus('لطفاً ابتدا محتوای JSON یا CSV را در کادر زیر وارد کنید.');
        setIsSuccess(false);
        return;
      }

      // Check if CSV
      if (rawText.includes(',') && (rawText.includes('اسم ماشین') || rawText.includes('اسم مشتری'))) {
        const csvListings = parseCarCsv(rawText, sourceBatchName);
        const existingOther = listings.filter((l) => (l.importBatchName || '') !== sourceBatchName);
        const merged = append ? [...csvListings, ...listings] : [...csvListings, ...existingOther];
        setStorageExplicitlyCleared(false);
        await saveListingsToIndexedDB(merged);
        onUpdateListings(merged);
        setImportStatus(`تعداد ${toPersianDigits(csvListings.length)} رکورد از CSV اضافه گردید.`);
        setIsSuccess(true);
        setInputText('');
        loadBatches();
        return;
      }

      const parsed = JSON.parse(rawText);

      let newListings: CarListing[] = [];
      let message = '';
      const currentDateFa = new Date().toLocaleDateString('fa-IR');

      // Case 1: Array of listings (e.g., full backup or API feed or raw records array)
      if (Array.isArray(parsed)) {
        const isAlreadyCarListing =
          parsed.length > 0 &&
          Boolean(parsed[0].title || parsed[0].model) &&
          Boolean(parsed[0].priceFormatted || parsed[0]._searchIndex);

        if (isAlreadyCarListing) {
          newListings = parsed.map((item: any) => ({
            ...item,
            importBatchName: item.importBatchName || sourceBatchName,
            importDate: item.importDate || currentDateFa,
            imageThumbnailBase64: getListingImage(item, false),
            imageFullBase64: getListingImage(item, true),
            _searchIndex: item._searchIndex || buildSearchIndex(item),
          }));
          message = `بارگذاری بسته پشتیبان: ${toPersianDigits(newListings.length)} خودرو با تصاویر کامل فعال شد.`;
        } else {
          const buyers = parsed.filter((item: any) => isBuyerRecord(item));
          const sellers = parsed.filter((item: any) => !isBuyerRecord(item));
          const sessionResult = parseSessionJson({ sellers, buyers }, new Map(), new Map(), sourceBatchName);
          newListings = sessionResult.listings.map((item) => ({
            ...item,
            importBatchName: item.importBatchName || sourceBatchName,
            importDate: item.importDate || currentDateFa,
            imageThumbnailBase64: getListingImage(item, false),
            imageFullBase64: getListingImage(item, true),
          }));
          message = `بارگذاری لیست: ${toPersianDigits(sessionResult.sellersCount)} فروشنده و ${toPersianDigits(
            sessionResult.buyersCount
          )} متقاضی خرید افزوده شدند.`;
        }
      }
      // Case 2: Full session or multi-role object with sellers / buyers / Persian keys
      else if (parsed && typeof parsed === 'object') {
        const extractedB = extractBuyersArray(parsed);
        const extractedS = extractSellersArray(parsed);

        if (extractedB.length > 0 || extractedS.length > 0 || parsed.sellers || parsed.buyers) {
          const sessionResult = parseSessionJson(parsed, new Map(), new Map(), sourceBatchName);
          newListings = sessionResult.listings.map((item) => ({
            ...item,
            importBatchName: item.importBatchName || sourceBatchName,
            importDate: item.importDate || currentDateFa,
            imageThumbnailBase64: getListingImage(item, false),
            imageFullBase64: getListingImage(item, true),
          }));
          message = `تزریق فایل کامل: ${toPersianDigits(sessionResult.sellersCount)} فروشنده و ${toPersianDigits(
            sessionResult.buyersCount
          )} متقاضی خرید افزوده شدند.`;
        } else {
          // Case 3: Fallback to sellerDataParser
          const sellerResult = parseSellersJson(parsed);
          newListings = sellerResult.listings.map((item) => ({
            ...item,
            importBatchName: item.importBatchName || sourceBatchName,
            importDate: item.importDate || currentDateFa,
            imageThumbnailBase64: getListingImage(item, false),
            imageFullBase64: getListingImage(item, true),
          }));
          message = `تزریق انجام شد: ${toPersianDigits(newListings.length)} آگهی با موفقیت افزوده شد.`;
        }
      }

      if (newListings.length === 0) {
        throw new Error('هیچ رکورد معتبری در ورودی یافت نشد.');
      }

      if (onAppendListings) {
        onAppendListings(newListings);
      } else {
        const existingOther = listings.filter((l) => (l.importBatchName || '') !== sourceBatchName);
        const merged = append ? [...newListings, ...listings] : [...newListings, ...existingOther];
        setStorageExplicitlyCleared(false);
        await saveListingsToIndexedDB(merged);
        onUpdateListings(merged);
      }

      const sales = newListings.filter((l) => l.type === 'sale').length;
      const buys = newListings.filter((l) => l.type === 'buy_request').length;
      setNewlyImportedBatch({
        batchName: sourceBatchName,
        listings: newListings,
        count: newListings.length,
        sellersCount: sales,
        buyersCount: buys,
      });

      setImportStatus(`${message} (${toPersianDigits(newListings.length)} رکورد جدید - آماده ثبت سریع در لیارا)`);
      setIsSuccess(true);
      setInputText('');
      setActiveTab('liara');
    } catch (err: any) {
      setImportStatus(`خطا در پردازش ورودی: ${err.message || 'ساختار نامعتبر است'}`);
      setIsSuccess(false);
    }
  };

  const handleExportJson = () => {
    const exportData: SessionJsonRoot = {
      version: 2,
      sellers: listings
        .filter((l) => l.type === 'sale')
        .map((l, idx) => ({
          id: l.id,
          rowIndex: idx + 1,
          imageFileName: l.imageFileName || `${l.phoneNumber}_car.jpg`,
          status: 'success',
          اسم_ماشین: l.model,
          سال_ساخت: l.year > 0 ? toPersianDigits(l.year) : '',
          رنگ: l.color,
          کارکرد_کیلومتر: l.mileage,
          قیمت_تومان: l.price,
          اسم_فروشنده: l.phoneNumber,
        })),
      buyers: listings
        .filter((l) => l.type === 'buy_request')
        .map((l, idx) => ({
          id: l.id,
          rowIndex: idx + 1,
          imageFileName: l.imageFileName || 'ورودی دستی',
          status: 'success',
          اسم_مشتری: l.phoneNumber,
          اسم_ماشین: l.model,
          سال_ساخت: l.year > 0 ? toPersianDigits(l.year) : '',
          رنگ: l.color,
          بودجه_تقریبی_تومان: l.price,
          توضیحات_بیشتر: l.description,
        })),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `car_session_export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-[#131924] rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[92vh] flex flex-col text-slate-900 dark:text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-base">
                مدیریت داده‌ها و ورودی اکسپورت (ZIP / JSON / CSV)
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                سازگار با ساختار استاندارد car_session_*.zip و session.json
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره مدیریت داده"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 my-3 border-b border-slate-100 pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('liara')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 transition-all ${
              activeTab === 'liara'
                ? 'bg-purple-700 text-white shadow-sm ring-2 ring-purple-300'
                : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-purple-500" />
            <span>سرور و دیتابیس لیارا (ایران)</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
              activeTab === 'status' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            وضعیت داده‌ها
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
              activeTab === 'import' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            تزریق ZIP / JSON / CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('iran_sync')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer flex items-center gap-1.5 transition-colors ${
              activeTab === 'iran_sync'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-300/80 hover:bg-emerald-100'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>روش‌های آفلاین و هاست</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spec')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer ${
              activeTab === 'spec' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            راهنما
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {importStatus && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                isSuccess
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {isSuccess ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{importStatus}</span>
            </div>
          )}

          {/* Confirm Clear Modal Box */}
          {showClearConfirm && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 text-red-800 font-extrabold text-sm mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span>آیا مطمئن هستید که می‌خواهید همه آگهی‌ها را پاک کنید؟</span>
              </div>
              <p className="text-xs text-red-700 leading-relaxed mb-4">
                با این کار تمامی {toPersianDigits(listings.length)} آگهی فعلی حذف شده و لیست خالی
                خواهد شد.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmClearAll}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-black rounded-xl cursor-pointer shadow-xs"
                >
                  بله، همه آگهی‌ها را پاک کن
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 text-xs font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}

          {activeTab === 'liara' && (
            <div className="space-y-4">
              {/* Liara Status Banner */}
              <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border border-purple-800/60">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-400/30">
                      <Server className="w-5 h-5 text-purple-300" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-white flex items-center gap-2">
                        <span>سرور و دیتابیس بومی در سرویس ابری لیارا (Liara.ir)</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                          ۱۰۰٪ بدون فیلتر در ایران
                        </span>
                      </h4>
                      <p className="text-[11px] text-purple-200/80 font-medium mt-0.5">
                        پلتفرم فول‌استک Node.js همراه با دیسک دائمی ذخیره‌سازی آگهی‌ها و عکس‌ها
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckLiara}
                    disabled={isCheckingLiara}
                    className="text-xs bg-white/10 hover:bg-white/20 active:bg-white/30 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors border border-white/10"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingLiara ? 'animate-spin' : ''}`} />
                    <span>بررسی اتصال</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-purple-800/40 text-xs">
                  <div className="bg-black/25 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-purple-300 block mb-0.5 font-bold">وضعیت اتصال سرور:</span>
                    <div className="flex items-center gap-1.5 font-black text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>{liaraHealth?.status === 'ok' ? 'آنلاین و آماده (Port 3000)' : 'سرور فعال / آماده اتصال'}</span>
                    </div>
                  </div>

                  <div className="bg-black/25 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-purple-300 block mb-0.5 font-bold">محل دیتابیس در لیارا:</span>
                    <span className="font-mono text-[11px] font-bold text-white">
                      {liaraHealth?.isLiaraDisk ? 'دیسک اختصاصی (/data)' : '/data/cars_database.json'}
                    </span>
                  </div>

                  <div className="bg-black/25 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-purple-300 block mb-0.5 font-bold">تعداد در دیتابیس سرور:</span>
                    <div className="text-white font-black text-xs">
                      <span>{toPersianDigits(liaraHealth?.totalListings ?? listings.length)} آگهی</span>
                      <span className="text-[10px] text-purple-300 block font-normal">
                        {liaraHealth && liaraHealth.salesCount !== undefined
                          ? `(${toPersianDigits(liaraHealth.salesCount)} فروش + ${toPersianDigits(liaraHealth.buysCount ?? 0)} خرید)`
                          : `(${toPersianDigits(listings.filter((l) => l.type === 'sale').length)} فروش + ${toPersianDigits(listings.filter((l) => l.type === 'buy_request').length)} خرید)`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Integrity Audit Card */}
              <div className="bg-slate-900 border border-slate-700/80 p-3.5 rounded-2xl text-white space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-black">اعتبارسنجی یکپارچگی پایگاه داده (Data Integrity Audit)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyIntegrity}
                    disabled={isVerifyingIntegrity}
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isVerifyingIntegrity ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>بررسی و انطباق آگهی‌ها</span>
                  </button>
                </div>
                {integrityReport && (
                  <div className="bg-black/40 border border-white/10 rounded-xl p-2.5 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span>وضعیت پایگاه داده سرور:</span>
                      <span>{integrityReport.success ? 'کاملاً منطبق و پایدار' : 'نیاز به بررسی'}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>مجموع کل آگهی‌ها روی دیسک دائمی:</span>
                      <span className="font-bold text-white">{toPersianDigits(integrityReport.totalListings ?? 0)} خودرو</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>تفکیک:</span>
                      <span>{toPersianDigits(integrityReport.salesCount ?? 0)} فروشنده | {toPersianDigits(integrityReport.buysCount ?? 0)} خریدار</span>
                    </div>
                    {integrityReport.revision !== undefined && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>شماره ویرایش (Revision):</span>
                        <span className="font-mono text-purple-300 font-bold">{toPersianDigits(integrityReport.revision)}</span>
                      </div>
                    )}
                    {integrityReport.batches && Object.keys(integrityReport.batches).length > 0 && (
                      <div className="pt-1.5 border-t border-white/10 space-y-1">
                        <span className="text-[10px] text-slate-400 block font-bold">بسته‌های موجود در سرور:</span>
                        {Object.entries(integrityReport.batches).map(([bName, bCount]) => (
                          <div key={bName} className="flex items-center justify-between text-[10px] text-slate-300 bg-white/5 px-2 py-0.5 rounded-lg">
                            <span className="truncate max-w-[220px]">📁 {bName}</span>
                            <span className="font-bold text-emerald-300">{toPersianDigits(bCount as number)} خودرو</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {integrityReport.error && (
                      <div className="text-rose-400 text-[10px] font-bold">
                        خطا: {integrityReport.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Progress bar during zip or sync */}
              {(isPublishingLiara || isFetchingLiara || isDownloadingLiaraZip) && (
                <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200">
                  <div className="flex items-center justify-between text-xs font-black text-purple-900 mb-1.5">
                    <span>
                      {isPublishingLiara && `در حال ارسال بسته به دیسک لیارا (${toPersianDigits(publishProgress)}٪)...`}
                      {isFetchingLiara && 'در حال بارگیری خودروها از دیتابیس سرور لیارا...'}
                      {isDownloadingLiaraZip && 'در حال فشرده‌سازی و بسته‌بندی فایل زیپ استقرار...'}
                    </span>
                    {(isDownloadingLiaraZip || isPublishingLiara) && (
                      <span className="font-mono text-xs">
                        {toPersianDigits(isPublishingLiara ? publishProgress : liaraZipProgress)}٪
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-purple-200/60 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-700 h-2.5 rounded-full transition-all duration-200"
                      style={{
                        width: isPublishingLiara
                          ? `${Math.max(publishProgress, 6)}%`
                          : isDownloadingLiaraZip
                          ? `${Math.max(liaraZipProgress, 10)}%`
                          : '100%',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 3 Main Action Cards */}
              <div className="space-y-3">
                {/* 🚀 Direct High-Speed ZIP Upload to Liara Disk */}
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 border-2 border-emerald-500/80 p-4 rounded-2xl shadow-lg text-white space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/40 shrink-0">
                        <Zap className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <h5 className="font-black text-sm text-white flex items-center gap-2">
                          <span>آپلود مستقیم فایل زیپ دیتابیس به سرور لیارا (با ذخیره دائمی عکس‌ها)</span>
                          <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                            پیشنهادی و فوری
                          </span>
                        </h5>
                        <p className="text-[11px] text-slate-300 font-medium">
                          آپلود فایل زیپ بدون پردازش سنگین مرورگر؛ عکس‌ها مستقیماً در دیسک /data/images ذخیره شده و روی تمام گوشی‌ها باز می‌شوند.
                        </p>
                      </div>
                    </div>
                  </div>

                  <input
                    ref={zipDirectFileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleDirectZipUpload(f);
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => zipDirectFileInputRef.current?.click()}
                    disabled={isUploadingZipDirect}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 active:scale-[0.99] text-slate-950 font-black text-xs sm:text-sm rounded-xl cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isUploadingZipDirect ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        <span>در حال ارسال مستقیم به دیسک سرور ({toPersianDigits(zipDirectProgress)}٪)...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                        <span>انتخاب فایل car_session_*.zip و ارسال مستقیم به سرور و دیسک لیارا</span>
                      </>
                    )}
                  </button>

                  {isUploadingZipDirect && (
                    <div className="space-y-1">
                      <div className="w-full bg-black/50 h-2.5 rounded-full overflow-hidden border border-white/10">
                        <div
                          className="bg-emerald-400 h-2.5 rounded-full transition-all duration-150"
                          style={{ width: `${Math.max(zipDirectProgress, 4)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 block text-left font-mono">
                        {zipDirectProgress}% Uploaded
                      </span>
                    </div>
                  )}
                </div>
                {/* 1. Drag & Drop Zip Download */}
                <div className="bg-white border-2 border-purple-200 hover:border-purple-300 p-4 rounded-2xl shadow-2xs space-y-2.5 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <FolderArchive className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                          ۱. دریافت بسته زیپ برای Drag & Drop در پنل لیارا
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          بسته کامل شامل liara.json، سرور Node.js، فرانت‌اند React و تنظیمات دیسک
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full">
                      یک کلیک
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    با کلیک روی دکمه زیر، یک فایل فشرده آماده استقرار تحویل می‌گیرید. کافیست در کنسول لیارا آن را Drag & Drop کنید.
                  </p>

                  <button
                    type="button"
                    onClick={handleDownloadLiaraZip}
                    disabled={isDownloadingLiaraZip}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-colors"
                  >
                    {isDownloadingLiaraZip ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>دانلود فایل زیپ جهت Drag & Drop در لیارا (liara_deployment.zip)</span>
                  </button>
                </div>

                {/* 2. Admin Daily Sync to Liara Server */}
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <UploadCloud className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                          ۲. انتشار روزانه آگهی‌ها در دیتابیس دائمی لیارا
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          ارسال اطلاعات به سرور لیارا تا همه کاربران در گوشی‌ها و لپ‌تاپ‌های خود آن را مشاهده کنند
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                      مخصوص ادمین
                    </span>
                  </div>

                  {/* Smart Card: If a new file was just imported */}
                  {newlyImportedBatch ? (
                    <div className="bg-emerald-50 border-2 border-emerald-400 p-3.5 rounded-2xl space-y-3 shadow-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Zap className="w-4 h-4 text-yellow-300" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-black bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                                فایل جدید وارد شده
                              </span>
                              <span className="text-xs font-black text-emerald-950 truncate max-w-[200px] sm:max-w-[300px]">
                                {newlyImportedBatch.batchName}
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                              شامل {toPersianDigits(newlyImportedBatch.count)} آگهی ({toPersianDigits(newlyImportedBatch.sellersCount)} فروشنده + {toPersianDigits(newlyImportedBatch.buyersCount)} خریدار)
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewlyImportedBatch(null)}
                          className="text-[11px] text-emerald-700 hover:text-emerald-950 underline cursor-pointer"
                        >
                          صرف‌نظر
                        </button>
                      </div>

                      <div className="bg-white/80 p-2.5 rounded-xl text-xs text-emerald-900 leading-relaxed border border-emerald-200 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>ارسال هوشمند و فوق‌سریع:</strong> نیازی به ارسال مجدد فایل‌های قبلی نیست! تنها همین فایل جدید در چند ثانیه به دیتابیس لیارا متصل می‌شود و داده‌های قبلی کاملاً محفوظ می‌مانند.
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {newlyImportedBatch.rawFile ? (
                          <button
                            type="button"
                            onClick={() => handleDirectZipUpload(newlyImportedBatch.rawFile!)}
                            disabled={isUploadingZipDirect}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl cursor-pointer shadow-md transition-all disabled:opacity-50"
                          >
                            {isUploadingZipDirect ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                <span>در حال ارسال مستقیم به دیسک سرور ({toPersianDigits(zipDirectProgress)}٪)...</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-4 h-4 text-amber-300" />
                                <span>⚡ ارسال مستقیم فایل ZIP به سرور لیارا (با ذخیره دائمی ۱۰۰٪ عکس‌ها)</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePublishToLiara(newlyImportedBatch.listings, newlyImportedBatch.batchName)}
                            disabled={isPublishingLiara}
                            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-md transition-all"
                          >
                            {isPublishingLiara && publishingBatchName === newlyImportedBatch.batchName ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <UploadCloud className="w-4 h-4" />
                            )}
                            <span>⚡ انتشار فقط همین فایل جدید ({toPersianDigits(newlyImportedBatch.count)} خودرو)</span>
                          </button>
                        )}

                        {listings.length > newlyImportedBatch.count && (
                          <button
                            type="button"
                            onClick={() => handlePublishToLiara(listings, 'همه آگهی‌ها')}
                            disabled={isPublishingLiara}
                            className="flex items-center justify-center gap-1.5 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl cursor-pointer transition-colors"
                            title={`ارسال کل دیتابیس شامل ${newlyImportedBatch.count} آگهی فایل جدید + ${listings.length - newlyImportedBatch.count} آگهی قبلی موجود در حافظه`}
                          >
                            <span>ارسال کل آرشیو دستگاه ({toPersianDigits(listings.length)})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleFetchFromLiara}
                          disabled={isPublishingLiara || isFetchingLiara}
                          className="flex items-center justify-center gap-1.5 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl cursor-pointer transition-colors"
                        >
                          {isFetchingLiara ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          ) : (
                            <CloudDownload className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span>دریافت از سرور</span>
                        </button>
                      </div>

                      {listings.length > newlyImportedBatch.count && (
                        <p className="text-[10px] text-emerald-800/80 bg-white/60 p-2 rounded-lg border border-emerald-100">
                          راهنما: فایل فشرده جدید شامل <strong>{toPersianDigits(newlyImportedBatch.count)} خودرو</strong> است. همچنین <strong>{toPersianDigits(listings.length - newlyImportedBatch.count)} خودرو</strong> از قبل در حافظه این مرورگر ذخیره بوده (مجموعاً {toPersianDigits(listings.length)} خودرو). برای ارسال فقط فایل جدید، دکمه سبز اولی را بزنید.
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Default state: option to publish all or fetch from server */
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        مجموعاً <strong>{toPersianDigits(listings.length)} خودرو</strong> در حافظه این سیستم آماده همگام‌سازی است.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handlePublishToLiara(listings, 'همه آگهی‌ها')}
                          disabled={isPublishingLiara || isFetchingLiara || listings.length === 0}
                          className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm transition-colors"
                        >
                          {isPublishingLiara && publishingBatchName === 'همه آگهی‌ها' ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CloudUpload className="w-4 h-4" />
                          )}
                          <span>انتشار و همگام‌سازی تمامی {toPersianDigits(listings.length)} آگهی در سرور لیارا</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleFetchFromLiara}
                          disabled={isPublishingLiara || isFetchingLiara}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs rounded-xl cursor-pointer transition-colors"
                        >
                          {isFetchingLiara ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                          ) : (
                            <CloudDownload className="w-4 h-4 text-blue-600" />
                          )}
                          <span>دریافت آخرین نسخه از لیارا</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Batch Visibility & File Manager (Toggle visibility or delete specific files/dates) */}
                <div className="bg-white border-2 border-purple-200 p-4 rounded-2xl shadow-2xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                          مدیریت فایل‌ها، پوشه‌های زیپ و ورودی‌های دستی
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          با گذاشتن یا برداشتن تیک، انتخاب کنید محتوای کدوم فایل‌ها به همه نشان داده شود (بدون پاک شدن اطلاعات)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleShowAllBatches}
                        className="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg border border-emerald-200 cursor-pointer transition-colors"
                        title="نمایش محتوای تمامی فایل‌ها در برنامه"
                      >
                        نمایش همه
                      </button>
                      <button
                        type="button"
                        onClick={handleHideAllBatches}
                        className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-200 cursor-pointer transition-colors"
                        title="مخفی‌سازی موقت تمامی فایل‌ها"
                      >
                        مخفی‌سازی همه
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleCheckLiara();
                          loadBatches();
                        }}
                        disabled={isLoadingBatches}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer transition-colors"
                        title="بروزرسانی وضعیت فایل‌ها"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBatches ? 'animate-spin text-purple-600' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {displayBatches.length === 0 ? (
                    <div className="text-center py-5 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      هنوز فایلی در سرور یا سامانه ثبت نشده است.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 px-1 flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span>لیست فایل‌های موجود در دیتابیس ({toPersianDigits(displayBatches.length)} فایل):</span>
                        <span className="text-[10px] text-purple-700 font-medium">
                          تیک سبز = فعال و نمایان به کاربران | بدون تیک = مخفی در دیتابیس
                        </span>
                      </div>

                      {/* Batches List with Visibility Checkbox */}
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                        {displayBatches.map((batch) => {
                          const isVisible = batch.isVisible !== false;
                          const isManualBatch = batch.batchName.includes('ثبت‌های دستی') || batch.batchName.includes('دستی');

                          return (
                            <div
                              key={batch.id}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                isVisible
                                  ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                                  : 'border-slate-200 bg-slate-100/70 opacity-75'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <label
                                  className="flex items-center gap-2 cursor-pointer select-none"
                                  title={isVisible ? 'کلیک کنید تا این فایل مخفی شود' : 'کلیک کنید تا این فایل فعال و نمایش داده شود'}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isVisible}
                                    onChange={() => handleToggleBatchVisibility(batch.batchName)}
                                    className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                                  />
                                  <span
                                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                      isVisible
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                                    }`}
                                  >
                                    {isVisible ? 'نمایش به همه' : 'مخفی'}
                                  </span>
                                </label>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-slate-900 text-xs truncate">
                                      {isManualBatch ? '✍️ ' : '📁 '}
                                      {batch.batchName}
                                    </span>
                                    <span className="text-[10px] font-bold bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded">
                                      📅 {batch.date}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                                    <span className="font-bold text-slate-700">
                                      مجموع {toPersianDigits(batch.count)} آگهی:
                                    </span>
                                    <span className="text-blue-700 font-semibold">
                                      {toPersianDigits(batch.saleCount)} فروشنده
                                    </span>
                                    <span>•</span>
                                    <span className="text-emerald-700 font-semibold">
                                      {toPersianDigits(batch.buyCount)} خریدار
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const bItems = listings.filter(
                                      (l) => (l.importBatchName || 'ثبت‌های دستی همکاران و مدیر') === batch.batchName
                                    );
                                    if (bItems.length > 0) {
                                      handlePublishToLiara(bItems, batch.batchName);
                                    } else {
                                      setImportStatus(`آگهی‌های این فایل برای ارسال مجدد در حافظه این دستگاه یافت نشد.`);
                                    }
                                  }}
                                  disabled={isPublishingLiara}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                                  title={`ارسال یا به‌روزرسانی اختصاصی فقط این بسته (${batch.batchName}) به سرور لیارا`}
                                >
                                  <UploadCloud className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleBatch(batch.batchName)}
                                  disabled={isDeletingBatch}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                  title={`حذف دائم این فایل از سرور و برنامه`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Three-step guide */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2">
                  <h6 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>مراحل استقرار در لیارا (کمتر از ۲ دقیقه):</span>
                  </h6>
                  <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1.5 pr-1 leading-relaxed">
                    <li>
                      در پنل <strong className="font-bold text-slate-800">console.liara.ir</strong> وارد شده و روی دکمه «ایجاد برنامه» کلیک کنید. پلتفرم را <strong>NodeJS</strong> انتخاب نمایید.
                    </li>
                    <li>
                      از منوی کناری برنامه وارد بخش <strong>«دیسک‌ها»</strong> شوید، یک دیسک با نام <code className="font-mono text-purple-700 bg-purple-100 px-1 rounded">data</code> ایجاد کرده و مسیر اتصال (Mount) آن را <code className="font-mono text-purple-700 bg-purple-100 px-1 rounded">/data</code> قرار دهید.
                    </li>
                    <li>
                      روی بخش <strong>«استقرار»</strong> در کنسول لیارا بروید و فایل زیپ دانلودشده را به سادگی با <strong>Drag & Drop</strong> رها کنید.
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-xs text-slate-400 font-bold block mb-1">
                    کل آگهی‌های فعال
                  </span>
                  <span className="text-xl font-black text-slate-900">
                    {toPersianDigits(listings.length)}
                  </span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <span className="text-xs text-slate-400 font-bold block mb-1">
                    پنجره مجاز نگهداری
                  </span>
                  <span className="text-xl font-black text-blue-700">
                    {toPersianDigits(MAX_RETENTION_DAYS)} روز اخیر
                  </span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 col-span-2 sm:col-span-1">
                  <span className="text-xs text-slate-400 font-bold block mb-1">وضعیت حافظه رم</span>
                  <span className="text-sm font-black text-emerald-600">
                    سبک و ایمن (Virtualize)
                  </span>
                </div>
              </div>

              {/* Cloud Sync & Distribution Box */}
              <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/80 border border-blue-200/90 rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-800">
                        همگام‌سازی ابری و انتشار همگانی (Cloud Sync)
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium">
                        انتشار داده‌ها به صورت سراسری برای تمامی بازدیدکنندگان و دستگاه‌ها
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    متصل به فایربیس
                  </span>
                </div>

                {/* Progress bar during publish or fetch */}
                {(isPublishingCloud || isFetchingCloud) && (
                  <div className="my-2.5 bg-white p-3 rounded-xl border border-blue-200 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] font-black text-blue-800 mb-1.5">
                      <span>{isPublishingCloud ? 'در حال ارسال بسته‌ها به ابر...' : 'در حال دریافت اطلاعات از ابر...'}</span>
                      <span className="font-mono text-xs">{toPersianDigits(publishProgress)}٪</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 rounded-full transition-all duration-200"
                        style={{ width: `${Math.max(publishProgress, 4)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handlePublishToCloud}
                    disabled={isPublishingCloud || isFetchingCloud || listings.length === 0}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm transition-colors"
                  >
                    {isPublishingCloud ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CloudUpload className="w-4 h-4" />
                    )}
                    <span>انتشار داده‌های فعلی در ابر برای همه</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFetchFromCloud}
                    disabled={isPublishingCloud || isFetchingCloud}
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer shadow-2xs transition-colors"
                  >
                    {isFetchingCloud ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <CloudDownload className="w-4 h-4 text-blue-600" />
                    )}
                    <span>دریافت آخرین نسخه ابری ادمین</span>
                  </button>
                </div>

                {/* Connection Tester Row */}
                <div className="mt-3 pt-2.5 border-t border-blue-200/60 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>سرور ابری: Google Firestore (اروپا)</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestCloudConnection}
                    disabled={isCheckingConn}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-100/70 hover:bg-blue-100 px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    {isCheckingConn ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span>تست زنده اتصال به سرور ابری</span>
                  </button>
                </div>

                {connResult && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 ${
                      connResult.ok
                        ? 'bg-emerald-100/80 text-emerald-900 border border-emerald-300'
                        : 'bg-amber-100/90 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {connResult.ok ? (
                      <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    )}
                    <span>{connResult.message}</span>
                  </div>
                )}
              </div>

              {/* Iran anti-sanction quick switch banner */}
              <div
                onClick={() => setActiveTab('iran_sync')}
                className="bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-300/80 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-colors shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-900 block">
                      دسترسی به فایربیس گوگل یا نتلیفای در ایران مسدود است؟
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      کلیک کنید: استفاده از روش‌های ۱۰۰٪ بدون فیلتر در ایران (ایتا، بله، هاست داخلی)
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shrink-0">
                  مشاهده روش‌ها ←
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerate5000}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>تولید ۵,۰۰۰ آگهی آزمایشی</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadSpecSample}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm"
                  >
                    <FileCode className="w-4 h-4" />
                    <span>تست ساختار کامل (فروشندگان + خریداران)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePruneNow}
                    className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-amber-600" />
                    <span>حذف قدیمی‌تر از ۴ روز</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                    <span>خروجی session.json</span>
                  </button>
                </div>

                {/* THE CLEAR ALL BUTTON */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 rounded-xl text-xs font-black transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                    <span>پاک کردن همه آگهی‌ها (خالی کردن کامل لیست)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-3">
              {/* File upload box */}
              <div className="border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 rounded-2xl p-4 text-center transition-colors">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".zip,.json,.csv,application/zip,application/json,text/csv,text/plain"
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="flex items-center gap-2 text-blue-600">
                    <Archive className="w-6 h-6" />
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">
                      انتخاب فایل آرشیو ZIP یا فایل‌های JSON / CSV
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      آرشیوهای زیپ شامل پوشه <code className="font-mono text-blue-700">data/</code> به صورت خودکار آنزیپ و عکس‌های هر آگهی متصل می‌شوند.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{isProcessing ? 'در حال استخراج...' : 'انتخاب فایل از دستگاه'}</span>
                  </button>
                </div>
              </div>

              {/* Textarea for JSON/CSV paste */}
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  یا کدهای متنی JSON / CSV را در این کادر جای‌گذاری کنید:
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder='{ "version": 2, "sellers": [...], "buyers": [...] }'
                  rows={6}
                  className="w-full bg-slate-50 p-3 rounded-xl border border-slate-300 font-mono text-xs text-slate-800 focus:outline-hidden focus:border-blue-600 dir-ltr text-left"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => processJsonText(inputText, false)}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm"
                >
                  جایگزینی کل داده‌ها با این ورودی
                </button>
                <button
                  type="button"
                  onClick={() => processJsonText(inputText, true)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-black text-xs rounded-xl cursor-pointer shadow-sm"
                >
                  افزودن به داده‌های فعلی
                </button>
              </div>
            </div>
          )}

          {activeTab === 'iran_sync' && (
            <div className="space-y-4">
              {/* Header Box */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <Shield className="w-5 h-5 text-emerald-200 shrink-0" />
                  <h4 className="font-black text-sm">
                    راهکارهای ۱۰۰٪ داخلی و بدون فیلتر برای ایران (ضد تحریم)
                  </h4>
                </div>
                <p className="text-xs text-emerald-100 leading-relaxed">
                  اگر به فیلترشکن، فایربیس گوگل یا نتلیفای دسترسی ندارید، از این ۳ روش کاملاً آزاد و بدون فیلتر استفاده کنید:
                </p>
              </div>

              {/* Method 1: Offline Messenger Packets (Bale, Eitaa, Telegram) */}
              <div className="bg-white border-2 border-emerald-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-sm">
                      ۱
                    </div>
                    <div>
                      <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                        اشتراک‌گذاری بسته روزانه در پیام‌رسان‌ها (ایتا، بله، روبیکا، تلگرام)
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        ساده‌ترین و سریع‌ترین روش: ۱۰۰٪ آفلاین، بدون نیاز به سرور یا اینترنت خارجی
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    همراه با عکس‌ها
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>چگونه کار می‌کند؟</strong> ادمین با زدن دکمه سبز رنگ زیر، یک فایل سبک کم‌حجم شامل تمام ۵,۰۰۰ آگهی و عکس‌های آن‌ها را دانلود می‌کند و در گروه ایتا یا بله یا فلش‌مموری به همکاران می‌دهد. هر همکار با زدن دکمه «انتخاب فایل از دستگاه»، در ۱ ثانیه بدون اینترنت برنامه را آپدیت می‌کند.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExportFullBackup}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود بسته کامل دیتابیس روزانه (شامل همه عکس‌ها)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border border-slate-300 rounded-xl text-xs font-black cursor-pointer shadow-2xs transition-colors"
                  >
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span>باز کردن و فعال‌سازی فایل همکاران</span>
                  </button>
                </div>
              </div>

              {/* Method 2: Direct Iran Server / Host Sync (No VPN) */}
              <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-sm">
                    ۲
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                      همگام‌سازی از هاست یا سرور شخصی داخل ایران (Direct URL)
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      دریافت با ۱ کلیک از روی هاست با دامنه .ir بدون نیاز به فیلترشکن
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  اگر یک هاست شخصی در ایران دارید (مثل پارس‌پک، برتینا، ایران‌سرور یا لیارا)، فایل JSON را در هاست خود آپلود کنید و آدرس آن را در کادر زیر بگذارید تا همکاران با یک کلیک آپدیت شوند:
                </p>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={iranServerUrl}
                      onChange={(e) => setIranServerUrl(e.target.value)}
                      placeholder="https://mysite.ir/data.json"
                      className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-300 font-mono text-xs text-slate-800 dir-ltr text-left focus:border-blue-600 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleFetchFromIranServer}
                      disabled={isFetchingIran || !iranServerUrl.trim()}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      {isFetchingIran ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                      <span>دریافت از سرور ایران</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Method 3: Replacement for Netlify (Hosting inside Iran) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-sm">
                    ۳
                  </div>
                  <div>
                    <h5 className="font-black text-slate-800 text-xs sm:text-sm">
                      جایگزین‌های بدون فیلتر برای Netlify (استقرار روی هاست‌های ایران)
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      چگونه برنامه را بدون فیلتر در سراسر ایران برای همه در دسترس قرار دهیم؟
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs text-slate-700">
                  {/* Option A: Liara.ir */}
                  <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-xl space-y-1">
                    <div className="flex items-center justify-between font-black text-purple-950">
                      <span>گزینه اول (پیشنهادی): سرویس ابری لیارا (Liara.ir)</span>
                      <span className="text-[10px] bg-purple-200/80 px-2 py-0.5 rounded-md">رایگان و سرورهای تهران</span>
                    </div>
                    <p className="text-[11px] text-purple-900 leading-relaxed">
                      ۱. در سایت <strong className="font-bold">liara.ir</strong> با شماره موبایل ثبت‌نام کنید.<br/>
                      ۲. یک برنامه از نوع <strong>«Static (استاتیک)»</strong> ایجاد کنید.<br/>
                      ۳. محتویات پوشه <code className="font-mono text-purple-800 bg-white px-1 rounded">dist</code> برنامه را داخل آن آپلود کنید.<br/>
                      ۴. فوراً آدرس اینترنتی اختصاصی (مثل <code className="font-mono text-purple-800">car-app.liara.run</code>) به شما داده می‌شود که روی همه خطوط بدون فیلتر و پرسرعت باز می‌شود.
                    </p>
                  </div>

                  {/* Option B: cPanel / DirectAdmin host */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                    <div className="font-black text-slate-900">
                      گزینه دوم: هاست‌های لینوکس ایران (cPanel / DirectAdmin)
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      کافیست فایل زیپ محتویات پوشه <code className="font-mono text-blue-700 bg-white px-1 rounded">dist</code> را داخل پوشه <code className="font-mono text-slate-700">public_html</code> هاست شخصی خود اکسترکت کنید تا با دامنه اختصاصی .ir همیشه بدون فیلتر فعال باشد.
                    </p>
                  </div>

                  {/* Option C: GitHub Pages */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                    <div className="font-black text-slate-900">
                      گزینه سوم: گیت‌هاب پیجز (GitHub Pages)
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      در مخزن گیت‌هاب خود به بخش <strong>Settings &gt; Pages</strong> بروید و سورس را روی شاخه اصلی تنظیم کنید تا رایگان و بدون تحریم نتلیفای فعال شود.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'spec' && (
            <div className="space-y-3 text-xs leading-relaxed">
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl text-blue-900 space-y-2">
                <div className="flex items-center gap-1.5 font-black text-sm text-blue-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>پشتیبانی کامل از استاندارد Car Exhibition Dataset Specification:</span>
                </div>
                <p>
                  برنامه به طور خودکار فایل فشرده ZIP را با رعایت نکات زیر پردازش می‌کند:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700 pr-1">
                  <li>
                    <strong>فایل session.json:</strong> رکوردهای فروشندگان (sellers) و خریداران (buyers) را خوانده و در دو تب تفکیک‌شده قرار می‌دهد.
                  </li>
                  <li>
                    <strong>پوشه data/ در ZIP:</strong> تصاویر با نام فایل معادل <code className="font-mono text-blue-700">id</code> آگهی استخراج شده و به کارت‌ها متصل می‌شوند.
                  </li>
                  <li>
                    <strong>قوانین normalizationRules:</strong> نام‌های مستعار مدل خودروها (مانند «۲۰۷ پانا») طبق جدول قوانین به نام رسمی تغییر می‌یابند.
                  </li>
                  <li>
                    <strong>شماره‌های تماس ۹۸:</strong> به صورت خودکار به پیش‌شماره استاندارد ۰۹ تبدیل شده و با دکمه سبز رنگ «تماس تلفنی مستقیم» لینک می‌شوند.
                  </li>
                  <li>
                    <strong>فایل‌های CSV:</strong> خروجی‌های جدول فروشندگان و خریداران با کدگذاری UTF-8 BOM پشتیبانی می‌شوند.
                  </li>
                </ul>
              </div>

              <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-2xl text-[11px] font-mono overflow-x-auto dir-ltr text-left">
{`{
  "version": 2,
  "sellers": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "imageFileName": "car.jpg",
      "اسم_ماشین": "207",
      "سال_ساخت": "۱۴۰۴",
      "رنگ": "سفید",
      "کارکرد_کیلومتر": "۰",
      "قیمت_تومان": "۸۴۰,۰۰۰,۰۰۰",
      "اسم_فروشنده": "989122959582",
      "status": "success"
    }
  ],
  "buyers": [
    {
      "id": "buyer-uuid-1",
      "اسم_ماشین": "تارا اتوماتیک",
      "سال_ساخت": "1403",
      "بودجه_تقریبی_تومان": "۹۰۰,۰۰۰,۰۰۰",
      "توضیحات_بیشتر": "خریدار فوری، بی‌رنگ",
      "اسم_مشتری": "989121234567",
      "status": "success"
    }
  ]
}`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
