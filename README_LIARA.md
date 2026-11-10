# Car Exhibition — Liara deployment

## Storage architecture

- PostgreSQL is the primary structured-data store when `PG_URI` (Liara) or `DATABASE_URL` is configured.
- The application creates `car_listings` and `car_app_state` tables and indexes automatically.
- Production startup requires server-side `ADMIN_PIN`, `COLLEAGUE_PIN`, and `SESSION_SECRET`. Admin-only operations are checked by the API, not merely hidden in the frontend. Sessions use signed HttpOnly cookies and failed login attempts are rate-limited.
- On first connection only, if the PostgreSQL state table is empty, the existing `cars_database.json` is copied to a timestamped `.pre-postgres-*.bak` file before being imported. Existing PostgreSQL data is never overwritten by this bootstrap.
- Raster image data is written to the Liara persistent disk under `/data/images`; PostgreSQL rows store listing metadata instead of large base64 image payloads. Keep the app disk mounted at `/data`.
- When PostgreSQL is configured but unreachable, the app refuses to start or serve writes through the JSON fallback. This prevents two divergent databases.

## Liara setup

1. Create a Node.js application in Liara.
2. Attach a persistent disk named `data` mounted at `/data` (the `liara.json` file already declares this mount).
3. Create a PostgreSQL DBaaS instance in Liara.
4. Copy the database connection string from Liara's database connection page into the app environment variable `PG_URI`.
5. In Liara environment variables, set `ADMIN_PIN` and `COLLEAGUE_PIN` to two different private 4-digit values. Set `SESSION_SECRET` to a cryptographically random value of at least 32 characters (for example, generate one locally with `openssl rand -base64 48`). Do not commit these values to GitHub or share them in chat.
6. Deploy this project ZIP. Liara runs the `build` script automatically before `start`; the generated production bundle then starts.
7. After deployment, open `/api/health`. It should report `dbBackend: postgresql`.

The app accepts `DATABASE_URL` as an alternative to `PG_URI`.

## Existing data and rollback

- Do not delete the old `/data/cars_database.json` file during the first PostgreSQL deployment.
- The first PostgreSQL bootstrap makes a timestamped copy before importing it. Keep this backup until the live app has been checked.
- To roll back, stop the app and restore the backup into `/data/cars_database.json` before removing the PostgreSQL environment variable. Do not run both database modes against the same live users simultaneously.

## Build and validation

```bash
bun install
bun run lint
bun run test
bun run build
```
