# PocketBase setup for Khodroyar (staging only)

This branch is a migration workspace. It does not change the live Liara app.

## Required infrastructure
1. Create a separate PocketBase service/app on Liara; do not replace the existing `carplus` app yet.
2. Attach a persistent disk and mount it at PocketBase's data directory (`/pb/pb_data`, or the exact path configured for the service).
3. Put PocketBase behind HTTPS and restrict access to its admin UI.
4. Keep a separate backup of the PocketBase data directory and uploaded files.

## Initial setup
1. Run the PocketBase version pinned by the deployment image.
2. Apply the migration in `pb_migrations/` using the PocketBase CLI.
3. Create the first admin account through the PocketBase superuser UI/CLI.
4. Create application users in the `users` auth collection and assign `role=admin` or `role=colleague`.
5. Set frontend build variable `VITE_POCKETBASE_URL` to the HTTPS PocketBase base URL. This is a public API base URL, not a secret.
6. Never put a PocketBase superuser email/password or API key into a `VITE_*` variable or commit it to Git.

## Current code status
- PocketBase SDK dependency and typed listing adapter are being introduced.
- The current React screens are intentionally retained.
- The adapter is not yet wired into the app's active data flow or login screen.
- Do not deploy this branch to the live app until migration phases and staging tests are complete.
