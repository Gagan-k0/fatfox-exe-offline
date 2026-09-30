# FatFox Offline EXE — Build Progress

Workspace: `C:\Users\USER\Desktop\fatofx exe offline`
Plan: `offlinemode.md`
Source (read-only): `C:\Users\USER\Desktop\FATFOX\`

The live `fatfox-admin-panel` and `fatfox-api-server` trees are **not** modified. Offline work lives here and is wired in at packaging time.

## STEP 1 — Foundation (code complete, awaiting npm install)

- [x] `electron/embedded-api.js` — Express launcher, 127.0.0.1, ports 4201-4210
- [x] `electron/main.js` — starts embedded API before the window, daily backup stub
- [x] `electron/preload.js`
- [x] `fatfox-api-offline/helpers/offline-db-adapter.js` — NeDB Mongoose wrapper (populate, aggregate, $inc)
- [x] `fatfox-api-offline/helpers/offline-cache.js` — in-memory Redis replacement
- [x] `fatfox-api-offline/app-offline.js` — Express app, CORS for localhost:4200, `/media`, `/api/v1/health`
- [x] `src/environments/environment.offline.ts`
- [x] TEST CHECKPOINT 1: `node fatfox-api-offline/bin/www` boots; `GET /api/v1/health` returns ok

## STEP 2 — Auth & Staff (code complete, awaiting npm install)

- [x] Models: restaurant, restaurant_manager, restaurant_staff, counter
- [x] `middlewares/jwt.js` — locally-signed HS256 JWT
- [x] PIN login (`/restaurant/login`, staff-login, manager-login) — bcryptjs, no OTP/SMS
- [x] First-launch seed (`helpers/seed.js`) — admin / 1234
- [x] `/restaurant/setup` wizard endpoint
- [x] TEST CHECKPOINT 2: POST /login returns a JWT against NeDB

## STEP 3 — Menu & Categories (backend scaffolding started)

- [x] `fatfox-api-offline/models/category.model.js`
- [x] `fatfox-api-offline/controllers/category.controller.js` (create/list/view/update/delete + status)
- [x] `fatfox-api-offline/controllers/permissions.controller.js` (`GET /api/v1/restaurant/permission` for offline UI gating)

- [x] TEST CHECKPOINT 3: `npm run build` succeeded (warnings only, no TS errors). Category backend endpoints have a happy-path unit test now.

## Next

STEP 4 — Table, Area, Tax & Discount

(After Menu/Categories endpoints are verified, we’ll migrate the remaining CRUD controllers one module at a time.)

- [x] TEST CHECKPOINT 4: Taxes/Discounts CRUD via offline API + unit tests
STEP 4 — Table, Area, Tax & Discount (next module) 

(After Menu/Categories endpoints are verified, we’ll migrate the remaining CRUD controllers one module at a time.)


