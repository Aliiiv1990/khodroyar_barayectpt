# Khodroyar — PocketBase Core Migration

> **Status (2026-11-12):** Implementation is isolated on `feat/pocketbase-core` and the draft PR #2. The existing React interface and its visual design are retained. GitHub Actions currently passes TypeScript lint, all 44 automated tests, the production Node/Vite build, and a Docker build of the standalone PocketBase service. No live PocketBase instance has been deployed and no real archive, multi-device, or backup-restore acceptance test has been performed. This is a staging candidate, not a production cutover.

## Product constraint

Keep the existing React interface, screens, workflows, and visual language. Replace the persistence/auth/file/realtime foundation behind the current components; do not redesign the UI.

## Existing application

- React + TypeScript + Vite frontend.
- Existing screens include HeaderAndTabs, SearchBarAndFilters, VirtualCarList, CarCard, CarDetailModal, NewListingModal, ColleagueAuthModal, DataManagerModal, and SettingsModal.
- The listing view model remains `CarListing`. A typed PocketBase repository adapter maps records into that existing shape so most UI components do not depend on PocketBase record structures.
- The PocketBase path is enabled at build time with `VITE_POCKETBASE_URL`; the Node service uses the private/runtime `POCKETBASE_URL`. The old backend path remains available until staging acceptance and deliberate cutover.

## Target architecture

- PocketBase is the authoritative store for listings, user accounts, private contact details, photo files, and realtime record events.
- PocketBase runs as a separate Liara Docker service. It must have its own persistent disk mounted at `/pb/pb_data`; never mount the old Node app's disk as the PocketBase data directory.
- The existing Node service remains a trusted ZIP extraction/streaming worker. It validates the signed-in PocketBase administrator token and streams extracted image files into PocketBase. It is not the source of truth for listings.
- The frontend uses the official PocketBase JavaScript SDK. No superuser password, API key, or other service credential is placed in a `VITE_*` variable or browser code.
- Public visitors can read active listings. Authenticated colleagues can read all listings and contact details, create records, and update records. A listing can be deleted by its owner or an admin; bulk imports, batch visibility/deletion, and administrative operations require an admin.
- Phone numbers are stored separately in `listing_contacts`, not in public listing records. The UI receives them only after authentication.
- Photos are stored as PocketBase file attachments with generated 640×480 thumbnails. Listing records contain file metadata/URLs, not base64 image blobs.
- Revision checks reject stale edits instead of silently overwriting newer changes. Stable `legacy_id` values make imports idempotent.
- PocketBase realtime subscriptions update the existing UI immediately after record changes. Reconnect, browser visibility, and online events trigger a fresh catalogue read as a recovery path.
- IndexedDB may be used as a non-authoritative read cache only. It must never resurrect a remotely deleted listing.

## Collections and key rules

1. **users** (auth): email/password login, `role` (admin/colleague), `display_name`, `enabled`. The first PocketBase superuser is separate from app users.
2. **listings**: existing CarListing fields, stable `legacy_id`, `created_by`, `revision`, `is_active`, import metadata, and multiple `photos` files. Indexed by stable ID, type/active/created, brand/model, city, and import batch.
3. **listing_contacts**: listing ID, phone number, and immutable owner ID. Read access requires authentication; writes/deletes are restricted to the owner or admin.
4. **import_batches**: batch name, status, counts, source file, and error summary. Administrative access only.
5. **audit_logs**: actor, action, collection, record/batch ID, and summary. App-level entries are immutable; secrets and credentials are never logged.

## Implemented on the feature branch

- PocketBase SDK client and typed `CarListing` adapter.
- Native account login in the existing authentication modal, retaining the modal layout.
- Listing pagination, mapping, create/edit/delete, private contact lookup, file upload, and revision checks.
- Admin batch visibility and permanent deletion through PocketBase.
- Realtime listing subscription and UI refresh/reconnect handling.
- Audit entries for listing changes, batch actions, and ZIP imports.
- Resumable 1.5 MB ZIP upload chunks, disk-based archive extraction, image validation, and PocketBase file uploads.
- Separate PocketBase Dockerfile, Liara setup guide, and persistent-volume/backup instructions.
- Health endpoint reports `dbBackend: pocketbase` only when the Node service can reach the configured PocketBase service.

## Remaining acceptance work

1. Deploy a **separate staging PocketBase service** with a persistent disk and create admin/colleague accounts. Do not replace the current `carplus` app.
2. Configure `POCKETBASE_URL` on the Node service and `VITE_POCKETBASE_URL` at frontend build time; verify the health endpoint reports PocketBase.
3. Test login and role restrictions for one admin and at least two colleagues.
4. Test create/edit/delete from two separate devices and verify realtime propagation, including permanent deletion.
5. Import a representative ZIP first, reconcile source records vs imported records, verify images and phone numbers, then test the full 7–8k-record / ~10k-photo archive.
6. Test interrupted upload resume, duplicate re-import, failed-record reporting, and cleanup of staging files. Add an explicit batch rollback workflow before production if partial-import rollback is required.
7. Verify search speed and browser memory with the full catalogue.
8. Configure off-service PocketBase backups and restore a backup into a separate staging instance, checking both SQLite records and `pb_data/storage` files.
9. Only after all acceptance checks pass, approve the PR and perform a controlled production cutover. Keep the previous app/database and rollback path until the new deployment is verified.

## Storage and operations

- The Node staging disk needs temporary space for the uploaded ZIP plus extracted files. The import checks available space before extraction.
- The PocketBase persistent disk stores the SQLite database, original photos, and thumbnails. Size it from the actual archive size and average image size, with headroom for growth and temporary backup operations. Do not upload the full photo archive until the disk is large enough.
- Back up the database and uploaded files together. A backup stored only on the same disk does not protect against disk/account loss.
- PocketBase is pre-1.0; review release notes and test upgrades/restores before updating the pinned server/SDK versions.
- Keep HTTPS enabled, use unique strong passwords, apply least privilege, and never commit secrets.
