# Developer Quick Start + SQLite DB Init Guide

This guide is the **single entry point** for contributors who want to:

1. start Amy's Echo locally,
2. verify the setup works, and
3. re-initialize the local SQLite DB when needed.

It is intentionally short and links to canonical docs for details.

---

## 1) Local setup (fast path)

From repo root:

```bash
# install dependencies
npm ci --prefix webapp
npm ci --prefix server
pip install -r server/requirements.txt

# run full verification
./scripts/full-check.sh
```

If `full-check.sh` passes, your local environment is ready.

Authoritative reference:
- `docs/workflows/build-and-test.md`

---

## 2) Run app + server locally

From repo root:

```bash
# terminal A: backend
npm run build --prefix server
npm start --prefix server

# terminal B: frontend
VITE_API_URL=http://localhost:5000 npm run dev --prefix webapp
```

Default local URLs:
- API: `http://localhost:5000`
- Webapp: `http://localhost:5173`

---

## 3) SQLite location + re-initialize DB (development only)

SQLite path:
- local: `server/db.sqlite`
- Docker container: `/app/db.sqlite`

Re-initialize (⚠️ destroys persisted accounts/profiles/training metadata):

```bash
# stop server first, then from repo root:
rm -f server/db.sqlite server/db.sqlite-shm server/db.sqlite-wal
```

Docker variant:

```bash
docker-compose stop amysecho-server
docker-compose exec amysecho-server rm -f /app/db.sqlite /app/db.sqlite-shm /app/db.sqlite-wal
docker-compose start amysecho-server
```

Authoritative reference:
- `docs/deployment/quickstart-server.md` (Server Management section)

---

## 4) API naming sanity check (current canonical contract)

Before updating docs/tests, confirm you use the current API contract:

- Account endpoints:
  - `PUT /api/v1/account/profile`
  - `PUT /api/v1/account/password`
- Profile label endpoints:
  - `GET /api/v1/profiles/:profileId/labels`
  - `GET /api/v1/profiles/:profileId/labels/:labelId`
  - `PATCH /api/v1/profiles/:profileId/labels/:labelId`
  - `POST /api/v1/profiles/:profileId/labels/initialize`

Authoritative references:
- `docs/integration/api.md`
- `server/src/routes/userRoutes.ts`
- `server/src/routes/profileLabelRoutes.ts`

---

## 5) Keep docs synced with runtime

After route-level changes:

```bash
node scripts/check-api-doc-routes.mjs
```

If this check fails, update:
- `docs/integration/api.md`
- `docs/integration/api-route-inventory.json`

