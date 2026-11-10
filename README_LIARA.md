# Car Exhibition — Liara deployment

## Storage architecture

- PostgreSQL is the primary structured-data store when `PG_URI` (Liara) or `DATABASE_URL` is configured.
- The application creates `car_listings` and `car_app_state` tables and indexes automatically.
- On first connection only, if the PostgreSQL state table is empty, the existing `cars_database.json` is copied to a timestamped `.pre-postgres-*.bak` file before being imported. Existing PostgreSQL data is never overwritten by this bootstrap.
- Raster image data is written to the Liara persistent disk under `/data/images`; PostgreSQL rows store listing metadata instead of large base64 image payloads. Keep the app disk mounted at `/data`.
- When PostgreSQL is configured but unreachable, the app refuses to start or serve writes through the JSON fallback. This prevents two divergent databases.

## Liara setup

1. Create a Node.js application in Liara.
2. Attach a persistent disk named `data` mounted at `/data` (the `liara.json` file already declares this mount).
3. Create a PostgreSQL DBaaS instance in Liara.
4. Copy the database connection string from Liara's database connection page into the app environment variable `PG_URI`.
5. Deploy this project ZIP. The start command builds the frontend and starts the TypeScript server.
6. After deployment, open `/api/health`. It should report `dbBackend: postgresql`.

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
