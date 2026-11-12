# Khodroyar PocketBase service for Liara

This branch is intentionally a standalone deployment context for the separate PocketBase Docker application.

## Liara settings
- App ID: khodroyar-pocketbase
- Platform: Docker
- Port: 8090
- Private network: select the same network used by the existing `carplus` Node app
- Persistent disk: create a disk named `pbdata` and mount it at `/pb/pb_data`
- Public origin allowed by default: `https://carplus.liara.run`

Do not deploy this branch over the `carplus` Node app.

## Data safety
The persistent disk mounted at `/pb/pb_data` contains both the SQLite database and uploaded photos. Never remove, reset, or replace this disk during a routine deployment.

Do not upload the full photo ZIP until the disk has enough capacity. The Node app also needs temporary free space on its own `/data` disk while the ZIP is assembled and extracted.

## First launch
PocketBase applies the committed `pb_migrations` automatically. Create the first PocketBase superuser from the service console, then create app-user accounts in the `users` auth collection.

For the existing Node app, set:
- `POCKETBASE_URL=http://khodroyar-pocketbase:8090` (private-network URL)
- `VITE_POCKETBASE_URL=https://khodroyar-pocketbase.liara.run` (public HTTPS URL used by browsers)

If Liara assigns a different public subdomain, use that exact URL in `VITE_POCKETBASE_URL` and set `POCKETBASE_ALLOWED_ORIGINS` on this service to the exact `carplus` app origin.
