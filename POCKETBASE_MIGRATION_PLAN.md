> **Implementation status (2026-11-11):** Work is isolated on `feat/pocketbase-core`. The existing React UI now has a PocketBase-backed authentication path, listing read/create/update/delete, private contact records, revision checks, realtime listing updates, batch visibility/deletion, and a resumable ZIP import path that extracts archive entries from disk and stores photos in PocketBase. A separate PocketBase service Dockerfile and Liara setup guide are included. This is still staging work: CI has not completed and no live PocketBase service, real ZIP import, or restore test has been run. Full backup/restore UX and operational monitoring remain to be completed.


# Khodroyar — PocketBase Core Migration

## Non-negotiable product constraint
Keep the current React interface and its visual language intact. The migration changes the data/auth/file/realtime services behind existing screens; it is not a UI redesign.

## Current architecture discovered
- React + TypeScript + Vite frontend.
- Existing screen components include HeaderAndTabs, SearchBarAndFilters, VirtualCarList, CarCard, CarDetailModal, NewListingModal, ColleagueAuthModal, DataManagerModal, and SettingsModal.
- The current app mixes IndexedDB cache, Liara Express endpoints, Firebase compatibility code, JSON/PostgreSQL server storage, and periodic polling/SSE.
- The existing listing model is in src/types/car.ts and contains sale/buy_request, Persian search metadata, import batch metadata, and image metadata.

## Target architecture
- PocketBase is the single source of truth for records, native auth, file attachments, and realtime events.
- React components continue to consume the existing CarListing view model. A repository/service adapter translates PocketBase records to/from CarListing so UI components do not become coupled to PocketBase record shapes.
- PocketBase runs as a separate persistent service with its own durable data directory on Liara. Its data directory must be mounted to persistent storage and backed up.
- The frontend uses the PocketBase SDK via VITE_POCKETBASE_URL. Never put a PocketBase superuser credential in VITE_* variables or browser code.
- Public users may read active listings; authenticated colleagues may create/update listings; destructive bulk actions and imports are admin-only. Enforce these rules in PocketBase collection API rules, not only in React.
- Photo uploads use PocketBase file fields. Store file names/metadata in records; do not embed base64 images in JSON records.
- Subscribe to listings and import-batch changes using PocketBase realtime; unsubscribe on component/app teardown. Realtime events trigger targeted record updates, with a full refresh fallback on reconnect.
- Keep IndexedDB only as an optional read cache. It is never authoritative and must not resurrect records deleted remotely.

## Collections
1. users (auth): role (admin/colleague), display_name, enabled.
2. listings: fields corresponding to CarListing, including type, title, brand, model, year, price, mileage, city, phone, description, source, creator, import_batch, import_date, revision, is_active, photos (multiple files).
3. import_batches: name, imported_at, imported_by, record_count, status, source_file, notes.
4. audit_logs: actor, action, collection_name, record_id, occurred_at, summary. No PINs, passwords, auth tokens, or secrets in logs.

## Migration phases
- Phase 0 — isolate work on feat/pocketbase-core; do not alter main or deploy over the current live app.
- Phase 1 — establish PocketBase collections, rules, SDK client, health diagnostics, and backup/restore instructions.
- Phase 2 — implement a typed repository adapter and move read/list/search/detail operations to PocketBase while preserving current components.
- Phase 3 — move create/edit/delete and image uploads to PocketBase; verify deletion is immediately reflected on every device.
- Phase 4 — replace polling/SSE with PocketBase realtime subscriptions and reconnect handling.
- Phase 5 — migrate the current PIN-based entry UX to native PocketBase accounts/roles without exposing service credentials; retain the existing modal styling.
- Phase 6 — implement ZIP import as a resumable, validated batch pipeline with progress, duplicate detection, rollback/cleanup, and image upload retries.
- Phase 7 — test with 7–8k listings and ~10k photos, verify search latency, upload reliability, access rules, backup restore, and two-device concurrency.
- Phase 8 — only after acceptance, deploy PocketBase separately, point a staging frontend to it, and then switch the live app. Keep rollback path until verified.

## Data integrity and operations
- Never delete or overwrite the current Liara app/database during development.
- Use stable IDs and server-side revision/timestamps. Resolve concurrent edits with explicit revision checks; do not silently overwrite newer records.
- Bulk import must be idempotent by stable source ID/hash and batch ID.
- Deletion is server-authoritative. Local cache is updated only after server confirmation; realtime propagates the change.
- Use paginated queries and indexed fields for type, brand, model, city, created_at, import_batch, and active status. Avoid loading all full-size photos with listing pages.
- Set upload size limits based on actual photo archives and Liara disk capacity. Confirm persistent volume size before importing all images.
- Back up PocketBase data and files together; test restore before production cutover.
- Use HTTPS, strong unique admin credentials, least-privilege API rules, rate limits where supported, and never commit secrets.
