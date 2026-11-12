# PocketBase setup for Khodroyar (staging only)

This branch is a migration workspace. It does not change the live Liara app.

## Required infrastructure

1. In Liara, create a **new Docker app** with the app ID `khodroyar-pocketbase`. Do not replace or redeploy over the existing `carplus` Node app.
2. Select the **same private network** used by `carplus` (the existing network in this account is `network-ndmwedl8xr`).
3. Deploy the GitHub branch `deploy/pocketbase-liara`. This is a dedicated deployment branch with a root-level `Dockerfile` and a Docker-specific `liara.json`; do not use the Node app branch as the PocketBase service source.
4. Create a persistent disk named `pbdata` for this new app. The branch's `liara.json` attaches it at `/pb/pb_data`. This path stores both SQLite data and uploaded photos.
5. Expose the service on port `8090` over HTTPS. The Docker image allows the existing browser app origin `https://carplus.liara.run` by default through `POCKETBASE_ALLOWED_ORIGINS`. If the app uses a different domain, set that exact origin in the PocketBase service's environment settings.
6. Keep an off-service backup of the PocketBase data directory and uploaded files. The Node app's `/data` staging disk is separate from the PocketBase `pbdata` disk.

Liara's private-network rule is important: both apps must share the same private network, and the internal app ID is used as the hostname. The Node worker therefore reaches PocketBase at `http://khodroyar-pocketbase:8090`.

## Initial setup
1. Deploy `Dockerfile.pocketbase` as a separate Docker service. It downloads the official PocketBase 0.42.2 Linux release binary from the maintainer's official host and copies the `pb_migrations/` directory; PocketBase applies pending migrations automatically on startup.
2. Create the first PocketBase superuser through the Liara console using `/pb/pocketbase superuser create admin@example.com 'REPLACE_WITH_A_STRONG_PASSWORD'` (replace both placeholders; do not commit the password).
3. Open the PocketBase dashboard and create one record in the `users` auth collection for each person. Set `display_name`, `role` (`admin` or `colleague`), `enabled=true`, a unique email, and a strong password.
4. Before deploying the Node branch, set `VITE_POCKETBASE_URL=https://khodroyar-pocketbase.liara.run` on `carplus`. This value is embedded into the browser bundle at build time, so it must be configured before the Node app is built/deployed. It is a public API URL, not a secret.
5. Set `POCKETBASE_URL=http://khodroyar-pocketbase:8090` as a runtime variable on `carplus`. This is the private-network address used by the Node ZIP worker. The worker validates the signed-in administrator's PocketBase token; it does not need a PocketBase superuser password.
6. Never put a PocketBase superuser email/password or API key into a `VITE_*` variable or commit it to Git.

## Current code status
- The PocketBase JavaScript SDK 0.28.2, typed listing adapter, native account login, listing CRUD, private contact storage, and realtime listing updates are wired behind `VITE_POCKETBASE_URL`.
- The admin data manager routes batch visibility, deletion, integrity checks, and ZIP imports to PocketBase when that setting is present.
- ZIP import uses the Node service as an authenticated streaming extraction worker; listing records and photos are stored in PocketBase.
- The current feature-branch CI passes TypeScript lint, all 44 automated tests, the production Vite/Node build, and a Docker image build for PocketBase 0.42.2. This verifies compilation and packaging only. No live PocketBase instance has been deployed, and authentication, realtime, backup/restore, and a representative ZIP import still require real staging acceptance. Do not switch the live app until those checks pass.


## ZIP import and disk sizing
- The Node app receives the ZIP in resumable 1.5 MB chunks and assembles it on its `/data` disk.
- ZIP entries are read from disk through a streaming archive reader; the whole archive is not loaded into Node memory.
- During extraction, the Node `/data` disk temporarily needs room for the uploaded ZIP plus the uncompressed files. The server checks available space before extraction and refuses the import if staging space is insufficient.
- The PocketBase service's own persistent disk stores the final uploaded photo files and its database. Size that disk for the uncompressed photo collection plus growth and backups.
- Keep both disks mounted persistently. The Node staging disk can be cleaned after a successful import; the PocketBase data disk must never be cleared during routine deploys.
- The import is idempotent by `legacy_id`; if a transfer or processing run fails, selecting the same ZIP again resumes the upload and updates existing records rather than duplicating them.


## Version and upgrade policy
- This branch pins the PocketBase server to 0.42.2 and the official JavaScript SDK to 0.28.2. Keep these versions compatible and update them together only after staging tests.
- PocketBase is still pre-1.0. Its official documentation warns that backward compatibility is not guaranteed and that production-critical deployments need changelog review and occasional manual migration work. Maintain off-service backups and test restores before every upgrade.
- The upstream project moved development away from its archived GitHub repository to the maintainer's host; it has not been abandoned. Follow the official documentation/changelog for security and release updates.


## Backup and restore acceptance procedure
1. In the PocketBase superuser dashboard, open **Settings → Backups**.
2. Configure scheduled backups and a retention limit. Prefer an S3-compatible off-site destination if available; a backup stored only on the same persistent disk does not protect against disk or account loss.
3. Before every PocketBase server upgrade, create a fresh backup and verify that it can be downloaded.
4. For a restore test, create a separate staging PocketBase service running the exact same PocketBase version. Restore the backup there, including both the SQLite database and the `pb_data/storage` files.
5. Verify record counts, a sample of photo URLs, login for an admin and colleague, and realtime updates before considering the backup valid.
6. Never replace or delete the live `pb_data` volume as part of a normal application deploy.
