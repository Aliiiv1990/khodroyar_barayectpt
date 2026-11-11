# PocketBase setup for Khodroyar (staging only)

This branch is a migration workspace. It does not change the live Liara app.

## Required infrastructure
1. Create a separate Liara service for PocketBase using `Dockerfile.pocketbase` from this repository; do not replace the existing `carplus` Node app.
2. Attach a persistent disk to the PocketBase service and mount it at `/pb/pb_data`.
3. Publish PocketBase over HTTPS, configure CORS to allow the exact `carplus` app origin, and restrict access to its admin UI.
4. Keep a separate backup of the PocketBase data directory and uploaded files. The Node app's `/data` staging disk is separate from this PocketBase disk.

## Initial setup
1. Deploy `Dockerfile.pocketbase` as a separate Docker service. It runs PocketBase 0.26.2 and copies the `pb_migrations/` directory; PocketBase applies pending migrations automatically on startup.
2. Create the first PocketBase superuser through the Liara console using `/pb/pocketbase superuser create`.
3. Open the PocketBase dashboard and create one record in the `users` auth collection for each person. Set `display_name`, `role` (`admin` or `colleague`), `enabled=true`, a unique email, and a strong password.
4. Set frontend build variable `VITE_POCKETBASE_URL` to the HTTPS PocketBase base URL. This is a public API base URL, not a secret.
5. Set Node runtime variable `POCKETBASE_URL` to the PocketBase private-network URL reachable from the `carplus` Node app (or the HTTPS URL if private networking is not configured). The server validates the signed-in administrator's PocketBase token for ZIP imports; it does not need a PocketBase superuser password.
6. Never put a PocketBase superuser email/password or API key into a `VITE_*` variable or commit it to Git.

## Current code status
- PocketBase SDK dependency and typed listing adapter are being introduced.
- The current React screens are intentionally retained.
- The adapter is not yet wired into the app's active data flow or login screen.
- Do not deploy this branch to the live app until migration phases and staging tests are complete.


## ZIP import and disk sizing
- The Node app receives the ZIP in resumable 1.5 MB chunks and assembles it on its `/data` disk.
- ZIP entries are read from disk through a streaming archive reader; the whole archive is not loaded into Node memory.
- During extraction, the Node `/data` disk temporarily needs room for the uploaded ZIP plus the uncompressed files. The server checks available space before extraction and refuses the import if staging space is insufficient.
- The PocketBase service's own persistent disk stores the final uploaded photo files and its database. Size that disk for the uncompressed photo collection plus growth and backups.
- Keep both disks mounted persistently. The Node staging disk can be cleaned after a successful import; the PocketBase data disk must never be cleared during routine deploys.
- The import is idempotent by `legacy_id`; if a transfer or processing run fails, selecting the same ZIP again resumes the upload and updates existing records rather than duplicating them.
