# FatFox — Complete Offline EXE Conversion Plan

> **Purpose:** Convert the entire FatFox web application (Admin Panel + API Server) into a
> fully self-contained offline Windows desktop EXE that requires **zero internet** for
> day-to-day restaurant operations.
>
> **Scope:** Administration, Dashboard, Pickup POS, Dine-In POS, KDS, Finance/Reports,
> Menu Management, Table Management, Taxes, Discounts, Staff, Invoices, Printing.
>
> **Excluded (intentionally online-only):** Live online orders, prebooking, delivery
> module, storefront links, customer app users, QR dine-in from customer phones,
> OneSignal push notifications, Firebase analytics, subscription licence validation.

---

## 🤖 AI Agent Execution Directives (Rules of Engagement)

**CRITICAL INSTRUCTION TO THE AGENT EXECUTING THIS PLAN:** 
This document is your master blueprint. When tasked with building this offline EXE, you must act as a Senior Full-Stack Engineer and follow these strict rules of engagement:

1. **Iterative Coding & Testing Loop:** DO NOT attempt to write all code in one go. You must write a module, run `npm run build` (or test the Node backend), check the compilation logs, and fix any errors before moving to the next module.
2. **Autonomous Debugging:** If a script crashes, you must read the terminal output, inspect the stack trace, hypothesize the fix, and self-correct. Loop this process until the build is green.
3. **Meticulous Edge-Case Handling:** Pay explicit attention to the "Critical Edge Cases" section. Do not ignore them. They are known failure points (e.g., Mongoose `populate()`, Native node modules).
4. **No Assumptions:** If a module relies on online functionality (like SMS OTP), you must proactively stub it out or replace it with the offline equivalent (PIN auth).
5. **Production Readiness Check:** Before declaring the task "Complete", you must have successfully run `npx electron-builder` and generated the `.exe` file in the `dist-electron/` folder without fatal errors.

---

## Table of Contents

1. [Current Architecture Overview](#1-current-architecture-overview)
2. [Recommended Tech Stack for Offline EXE](#2-recommended-tech-stack-for-offline-exe)
3. [High-Level Architecture: Offline EXE](#3-high-level-architecture-offline-exe)
4. [File Locations Reference](#4-file-locations-reference)
5. [Phase 1 — Embed Local API Server in Electron](#phase-1--embed-local-api-server-in-electron)
6. [Phase 2 — Replace MongoDB with Embedded Database](#phase-2--replace-mongodb-with-embedded-database)
7. [Phase 3 — Remove Redis Dependency](#phase-3--remove-redis-dependency)
8. [Phase 4 — Offline Authentication](#phase-4--offline-authentication)
9. [Phase 5 — Module-by-Module Offline Conversion](#phase-5--module-by-module-offline-conversion)
10. [Phase 6 — Data Seeding & Initial Setup Wizard](#phase-6--data-seeding--initial-setup-wizard)
11. [Phase 7 — Backup, Restore & Data Safety](#phase-7--backup-restore--data-safety)
12. [Phase 8 — Autonomous QA & Self-Correction Loop](#phase-8--autonomous-qa--self-correction-loop)
13. [Phase 9 — Build, Package & Distribution](#phase-9--build-package--distribution)
14. [Edge Cases & Gotchas](#edge-cases--gotchas)
15. [Module Conversion Checklist](#module-conversion-checklist)
16. [Optional: Hybrid Mode (Online ↔ Offline Sync)](#optional-hybrid-mode)

---

## 1. Current Architecture Overview

### Admin Panel (Frontend)
- **Location:** `C:\Users\USER\Desktop\FATFOX\fatfox-admin-panel`
- **Stack:** Angular 15, TypeScript, LESS, Bootstrap 5
- **Electron Shell:** `fatfox-admin-panel/electron/` (main.js, static-server.js, printer-manager.js)
- **Current EXE mode:** Serves the Angular build over `http://localhost:4200` inside Electron. All data calls go to the **remote** API server (`https://backend.fatfox.testfox.in/`).
- **Existing offline work:** Partial — pickup-offline, dinein-offline, menu-offline modules exist in `src/app/` for **temporary** offline capture with sync-back. These queue orders in IndexedDB and flush to the remote API when connectivity returns.

### API Server (Backend)
- **Location:** `C:\Users\USER\Desktop\FATFOX\fatfox-api-server`
- **Stack:** Express.js (Node 18), Mongoose/MongoDB, Redis (ioredis), Socket.IO
- **Database:** MongoDB Atlas (cloud) — connection string from `MONGODB_URL` env
- **Cache:** Redis (Upstash cloud or local) — used for CORS domain caching, rate limiting, general caching
- **External Services:**
  - AWS S3 / CloudFront — image uploads & media
  - Firebase — push notifications, analytics
  - OneSignal — push notifications
  - Razorpay / ICICI — payment gateway
  - AWS SNS — SMS/OTP delivery
  - Nodemailer — email

### Key Dependencies That Must Be Replaced for Offline

| Dependency | Current | Offline Replacement |
|---|---|---|
| MongoDB Atlas | Cloud DB | **NeDB / SQLite / LowDB** (embedded) |
| Redis | Cloud cache | **In-memory Map** or remove |
| AWS S3 | Image storage | **Local filesystem** |
| JWT + OTP login | SMS-based auth | **Local PIN/password auth** |
| Socket.IO | Real-time events | **Local EventEmitter** (in-process) |
| Firebase | Analytics/push | **Remove entirely** |
| OneSignal | Push notifications | **Remove entirely** |
| Razorpay/ICICI | Payments | **Remove entirely** |

---

## 2. Recommended Tech Stack for Offline EXE

### Database: **NeDB (nedb-promises)** — Best Choice

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **NeDB** | MongoDB-compatible query API (same `find`, `insert`, `update`, `remove`), zero config, file-based, pure JS | Limited to ~1M docs, no transactions | **Best fit** — minimal code changes since API already uses Mongoose-like queries |
| SQLite (better-sqlite3) | Fast, SQL, unlimited size, WAL mode | Requires rewriting ALL Mongoose queries to SQL — massive effort | Too much rewrite |
| LowDB | Simple JSON file | No query API, no indexes, slow on large data | Too limited |
| MongoDB Community (local) | Zero code changes | 500MB+ install, needs service, complex packaging | Too heavy for EXE |

### Why NeDB is the best choice:

```
// CURRENT (Mongoose/MongoDB):
const items = await Menu.find({ restaurant_id: rid, status: 1 }).sort({ name: 1 });

// OFFLINE (NeDB — almost identical):
const items = await menuDb.find({ restaurant_id: rid, status: 1 }).sort({ name: 1 });
```

NeDB stores data as **append-only files** in `%APPDATA%/FatFox Admin/data/`:
```
%APPDATA%/FatFox Admin/data/
  ├── menus.db
  ├── categories.db
  ├── orders.db
  ├── invoices.db
  ├── tables.db
  ├── taxes.db
  ├── discounts.db
  ├── kitchen_work_items.db
  ├── kitchen_departments.db
  ├── transactions.db
  └── ...
```

### Cache: **In-Memory Map** (no Redis)

Replace Redis with a simple `Map<string, any>` in the Node process. The EXE is single-user
so there's no multi-server caching need.

### Image Storage: **Local Filesystem**

Store images at `%APPDATA%/FatFox Admin/media/` and serve them from the local Express static
middleware instead of S3/CloudFront.

### Real-time Events: **In-Process EventEmitter**

Replace Socket.IO with Node's `EventEmitter`. Since the API server and the frontend run in
the same Electron process, there's no network hop.

---

## 3. High-Level Architecture: Offline EXE

```
┌─────────────────────────────────────────────────────────┐
│                   ELECTRON MAIN PROCESS                  │
│                                                         │
│  ┌──────────────┐   ┌─────────────────────────────────┐ │
│  │ Static Server │   │ Embedded API Server (Express)   │ │
│  │ :4200        │   │ :4201                           │ │
│  │ (Angular UI) │   │                                 │ │
│  │              │   │  ┌──────────┐  ┌─────────────┐  │ │
│  │              │   │  │ NeDB     │  │ Local FS    │  │ │
│  │              │   │  │ (data/)  │  │ (media/)    │  │ │
│  │              │   │  └──────────┘  └─────────────┘  │ │
│  │              │   │                                 │ │
│  │              │   │  ┌──────────────────────────┐   │ │
│  │              │   │  │ In-Memory Cache (Map)    │   │ │
│  │              │   │  └──────────────────────────┘   │ │
│  └──────────────┘   └─────────────────────────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              BrowserWindow (Renderer)                │ │
│  │        Angular 15 App — http://localhost:4200        │ │
│  │        API calls → http://localhost:4201/api/v1/     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         ▼
   %APPDATA%/FatFox Admin/
     ├── data/          ← NeDB database files
     ├── media/         ← Menu images, logos
     ├── backups/       ← Automatic daily backups
     └── logs/          ← Server + error logs
```

### How It Works:
1. Electron starts → launches **Embedded Express API** on `localhost:4201`
2. Express connects to **NeDB** files (no MongoDB, no network)
3. Electron's **Static Server** serves Angular on `localhost:4200` (already exists)
4. Angular's `environment.ts` points `apiUrl` to `http://localhost:4201/`
5. All operations (orders, billing, KDS, reports) work **100% offline**
6. **Printer Manager** continues to work exactly as today (already in Electron)

---

## 4. File Locations Reference

### Admin Panel — Key Files to Modify

| File | Purpose | What Changes |
|---|---|---|
| `fatfox-admin-panel/src/environments/environment.prod.ts` | API URL config | Point `apiUrl` to `http://localhost:4201/` |
| `fatfox-admin-panel/src/environments/environment.ts` | Dev API URL config | Same as above for dev |
| `fatfox-admin-panel/electron/main.js` | Electron main process | Start embedded API server |
| `fatfox-admin-panel/electron/static-server.js` | Static file server | Already exists — no changes |
| `fatfox-admin-panel/electron/printer-manager.js` | Thermal printing | Already exists — no changes |
| `fatfox-admin-panel/src/app/_services/connectivity.service.ts` | Online/offline detection | Always report "online" in EXE mode |
| `fatfox-admin-panel/src/app/_services/account.service.ts` | Auth/login | Offline PIN auth |
| `fatfox-admin-panel/src/app/_services/user.service.ts` | All API calls | Point to local API |
| `fatfox-admin-panel/src/app/_services/subscription.service.ts` | Licence check | Bypass in offline mode |
| `fatfox-admin-panel/src/app/_services/realtime-events.service.ts` | Socket.IO events | Local EventEmitter bridge |
| `fatfox-admin-panel/src/app/app.module.ts` | Root module | Conditionally disable Firebase |
| `fatfox-admin-panel/package.json` | Build config | Add embedded API as dependency |

### API Server — Key Files to Modify

| File | Purpose | What Changes |
|---|---|---|
| `fatfox-api-server/app.js` | Server bootstrap | Replace Mongoose → NeDB, Redis → Map |
| `fatfox-api-server/models/*.model.js` | Mongoose schemas (95 files) | Create NeDB adapter layer |
| `fatfox-api-server/controllers/restaurant/cart.controller.js` | Order/cart logic (216KB!) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/pickup.controller.js` | Pickup orders (170KB) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/table.controller.js` | Dine-in tables (66KB) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/kitchen.controller.js` | KDS/KOT (110KB) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/dashboard.controller.js` | Dashboard stats (81KB) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/menu.controller.js` | Menu CRUD (65KB) | Adapt DB calls + local image storage |
| `fatfox-api-server/controllers/restaurant/invoice.controller.js` | Invoice generation | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/tax.controller.js` | Tax management | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/discount.controller.js` | Discount management | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/table_area.controller.js` | Area management | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/report.controller.js` | Sales reports | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/transaction.controller.js` | Transactions | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/restaurant.controller.js` | Profile/settings (69KB) | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/variant.controller.js` | Variants | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/category.controller.js` | Categories | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/add_on.controller.js` | Add-ons | Adapt DB calls |
| `fatfox-api-server/controllers/restaurant/kitchendepartment.controller.js` | Kitchen depts | Adapt DB calls |
| `fatfox-api-server/helpers/` | Utilities | Remove AWS/SMS/payment helpers |
| `fatfox-api-server/middlewares/` | Auth middleware | Offline JWT without OTP |
| `fatfox-api-server/routes/restaurant.js` | Route definitions | Keep routes, remove online-only endpoints |

---

## Phase 1 — Embed Local API Server in Electron

### Goal: Run the Express API server inside the same Electron process

### Steps:

**1.1 Create `electron/embedded-api.js`**

```javascript
// electron/embedded-api.js
const path = require('path');
const http = require('http');

// Set environment for offline mode BEFORE requiring app.js
process.env.NODE_ENV = 'offline';
process.env.OFFLINE_MODE = 'true';
process.env.DEPLOYMENT_MODE = 'single_tenant';
process.env.JWT_SECRET = '<generate-a-random-64-char-string-on-first-launch>';

const EMBEDDED_API_PORT = 4201;

let server = null;

async function startEmbeddedApi(userData) {
  // Set data directory
  process.env.NEDB_DATA_DIR = path.join(userData, 'data');
  process.env.MEDIA_DIR = path.join(userData, 'media');

  // Require the adapted app.js
  const app = require('../../fatfox-api-server/app');

  server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(EMBEDDED_API_PORT, '127.0.0.1', () => {
      console.log(`[Offline API] Running on http://localhost:${EMBEDDED_API_PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

function stopEmbeddedApi() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startEmbeddedApi, stopEmbeddedApi, EMBEDDED_API_PORT };
```

**1.2 Modify `electron/main.js`**

In the existing `main.js`, after the static server starts and before the BrowserWindow is
created, start the embedded API:

```javascript
// In main.js — after startStaticServer() succeeds
const { startEmbeddedApi, stopEmbeddedApi } = require('./embedded-api');

// Inside the app.whenReady() flow:
const userData = app.getPath('userData');
await startEmbeddedApi(userData);

// In the shutdown handler:
stopEmbeddedApi();
```

**1.3 Update Angular environment**

Create a new `environment.offline.ts` (or modify `environment.prod.ts` with a build flag):

```typescript
export const environment = {
  appName: "Fat Fox",
  production: true,
  apiUrl: 'http://localhost:4201/',
  apiPrefix: 'api/v1',
  offlineMode: true,
  // Remove Firebase, OneSignal, etc.
};
```

---

## Phase 2 — Replace MongoDB with Embedded Database

### Goal: Create a NeDB adapter that mimics Mongoose so all 95 models work with minimal changes

### Steps:

**2.1 Install NeDB**
```bash
cd fatfox-api-server
npm install nedb-promises
```

**2.2 Create `helpers/offline-db-adapter.js`**

This is the **most critical file** — a Mongoose-compatible wrapper around NeDB:

```javascript
// helpers/offline-db-adapter.js
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.NEDB_DATA_DIR || path.join(
  process.env.APPDATA || process.env.HOME,
  'FatFox Admin', 'data'
);

// Ensure directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const collections = {};

function getCollection(name) {
  if (!collections[name]) {
    collections[name] = Datastore.create({
      filename: path.join(dataDir, `${name}.db`),
      autoload: true,
      timestampData: true  // Adds createdAt, updatedAt automatically
    });
  }
  return collections[name];
}

/**
 * Mongoose-compatible Model factory
 * Maps Mongoose calls to NeDB equivalents
 */
function createOfflineModel(collectionName, schemaDefinition) {
  const db = getCollection(collectionName);

  const Model = {
    find: (query = {}) => createCursor(db, query),
    findOne: (query = {}) => db.findOne(query),
    findById: (id) => db.findOne({ _id: id }),
    create: (doc) => db.insert({ ...doc, _id: doc._id || generateId() }),
    insertMany: (docs) => db.insert(docs.map(d => ({ ...d, _id: d._id || generateId() }))),
    updateOne: (query, update) => db.update(query, update, {}),
    updateMany: (query, update) => db.update(query, update, { multi: true }),
    findOneAndUpdate: (query, update, opts = {}) => {
      return db.update(query, update, { returnUpdatedDocs: true })
        .then(doc => doc);
    },
    findByIdAndUpdate: (id, update, opts = {}) => {
      return db.update({ _id: id }, update, { returnUpdatedDocs: true });
    },
    deleteOne: (query) => db.remove(query, {}),
    deleteMany: (query) => db.remove(query, { multi: true }),
    countDocuments: (query = {}) => db.count(query),
    aggregate: (pipeline) => executeAggregate(db, pipeline),
    paginate: (query, options) => executePaginate(db, query, options),
    aggregatePaginate: (pipeline, options) => executeAggregatePaginate(db, pipeline, options),
    new: (doc) => ({ ...doc, save: () => db.insert(doc) }),
  };

  return Model;
}

// Chainable cursor that mimics Mongoose Query
function createCursor(db, query) {
  let cursor = db.find(query);
  const chain = {
    sort: (s) => { cursor = cursor.sort(s); return chain; },
    skip: (n) => { cursor = cursor.skip(n); return chain; },
    limit: (n) => { cursor = cursor.limit(n); return chain; },
    select: (s) => { return chain; },
    populate: (p) => { return chain; },
    lean: () => chain,
    exec: () => cursor.exec(),
    then: (resolve, reject) => cursor.exec().then(resolve, reject),
    catch: (reject) => cursor.exec().catch(reject),
  };
  return chain;
}

function generateId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i++) id += hex[Math.floor(Math.random() * 16)];
  return id;
}

module.exports = { createOfflineModel, getCollection, dataDir };
```

**2.3 Create model shim files**

For each of the 95 models, create a conditional wrapper. Example for `menu.model.js`:

```javascript
// At the top of each model file, add:
if (process.env.OFFLINE_MODE === 'true') {
  const { createOfflineModel } = require('../helpers/offline-db-adapter');
  module.exports = createOfflineModel('menus', { /* schema fields */ });
  return;
}
// ... existing Mongoose code below ...
```

**2.4 Priority Model List (in conversion order)**

| # | Model File | Collection | Used By | Priority |
|---|---|---|---|---|
| 1 | `restaurant.model.js` | restaurants | Everything (tenant data) | Critical |
| 2 | `menu.model.js` | menus | Menu management, POS | Critical |
| 3 | `category.model.js` | categories | Menu categorization | Critical |
| 4 | `table.model.js` | tables | Dine-in | Critical |
| 5 | `table_area.model.js` | table_areas | Dine-in areas | Critical |
| 6 | `tax.model.js` | taxes | Billing | Critical |
| 7 | `order.model.js` | orders | Dine-in orders | Critical |
| 8 | `order_menu.model.js` | order_menus | Dine-in order items | Critical |
| 9 | `pickup.model.js` | pickups | Pickup POS | Critical |
| 10 | `pickup_menu.model.js` | pickup_menus | Pickup items | Critical |
| 11 | `transaction.model.js` | transactions | Finance | Critical |
| 12 | `kitchen_work_item.model.js` | kitchen_work_items | KDS | High |
| 13 | `kitchen_department.model.js` | kitchen_departments | KDS | High |
| 14 | `discount.model.js` | discounts | Discounts | High |
| 15 | `add_on.model.js` | add_ons | Menu add-ons | High |
| 16 | `variant.model.js` | variants | Menu variants | High |
| 17 | `variant_group.model.js` | variant_groups | Variant groups | High |
| 18 | `dinein_session.model.js` | dinein_sessions | Active dine-in | High |
| 19 | `bill_split.model.js` | bill_splits | Split billing | High |
| 20 | `counter.model.js` | counters | Auto-increment IDs | High |
| 21 | `restaurant_manager.model.js` | restaurant_managers | Staff/login | High |
| 22 | `restaurant_staff.model.js` | restaurant_staff | Staff management | High |
| 23 | `cart.model.js` | carts | POS cart | High |
| 24 | `cart_menu.model.js` | cart_menus | Cart items | High |

**Remaining 71 models** are lower priority (delivery, drivers, hotel, customer app, OTP,
notifications, etc.) and can be stubbed out initially.

---

## Phase 3 — Remove Redis Dependency

### Goal: Replace all Redis usage with in-memory cache

**3.1 Create `helpers/offline-cache.js`**

```javascript
// helpers/offline-cache.js — drop-in Redis replacement
class OfflineCache {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, ...args) {
    this.store.set(key, value);
    const exIdx = args.indexOf('EX');
    if (exIdx !== -1 && args[exIdx + 1]) {
      this.ttls.set(key, Date.now() + (args[exIdx + 1] * 1000));
    }
    return 'OK';
  }

  async del(key) { this.store.delete(key); return 1; }
  async exists(key) { return this.store.has(key) ? 1 : 0; }
  async keys(pattern) { return []; }
  async flushall() { this.store.clear(); this.ttls.clear(); }
  on(event, cb) { /* no-op */ }
}

module.exports = new OfflineCache();
```

**3.2 In `app.js`, replace Redis initialization:**

```javascript
if (process.env.OFFLINE_MODE === 'true') {
  global.redis = require('./helpers/offline-cache');
} else {
  // ... existing Redis code ...
}
```

---

## Phase 4 — Offline Authentication

### Goal: Login without SMS OTP, without internet

**4.1 First-launch Setup Flow:**

1. EXE starts for the first time → no data exists
2. Show a **Setup Wizard** (in Electron):
   - Enter restaurant name
   - Set admin PIN (4-6 digit) or password
   - Import menu data (optional CSV/JSON)
3. Wizard creates the restaurant record + admin user in local NeDB
4. All subsequent launches → PIN/password login screen

**4.2 Modify auth middleware `middlewares/jwt.js`:**

```javascript
if (process.env.OFFLINE_MODE === 'true') {
  // Accept locally-signed JWTs
  // Skip OTP verification
  // Allow PIN-based authentication
}
```

**4.3 Modify login controller:**

- `login` endpoint → accept PIN instead of OTP
- `verifyOtp` → skip entirely (return token immediately after PIN match)
- Skip SMS sending (`helpers/otpService.js`) entirely

**4.4 Files to modify:**
- `fatfox-api-server/middlewares/jwt.js`
- `fatfox-api-server/helpers/otpService.js` (return no-op in offline)
- `fatfox-api-server/controllers/restaurant/restaurant.controller.js` (login flow)
- `fatfox-admin-panel/src/app/login/` (PIN-based login UI)

---

## Phase 5 — Module-by-Module Offline Conversion

### 5.1 Dashboard (`/dashboard`)

**Frontend:** `fatfox-admin-panel/src/app/dashboard/`
**Backend:** `fatfox-api-server/controllers/restaurant/dashboard.controller.js` (81KB)

**What it does:** Shows revenue stats, order counts, charts, today's summary.

**Conversion work:**
- Replace Mongoose aggregate pipelines with NeDB-compatible queries
- Dashboard data comes from `orders`, `pickups`, `transactions` collections
- Charts: Calculate locally from NeDB data
- Edge case: Mongoose `aggregate()` is heavily used — NeDB doesn't support full aggregation.
  Must implement `$group`, `$match`, `$sort`, `$project` manually in JS.

**Key aggregation patterns to implement:**
```javascript
// Today's revenue: SUM of all settled transactions today
const today = new Date(); today.setHours(0,0,0,0);
const transactions = await transactionDb.find({
  restaurant_id: rid,
  createdAt: { $gte: today }
});
const revenue = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
```

---

### 5.2 Pickup POS (`/pickup-dashboard`, `/pickup-new-order`)

**Frontend:** `fatfox-admin-panel/src/app/pickup-dashboard/`, `pickup-new-order/`
**Backend:** `fatfox-api-server/controllers/restaurant/pickup.controller.js` (170KB)

**What it does:** Take counter/pickup orders, manage active orders, billing, printing.

**Conversion work:**
- Already has **extensive offline support** (`pickup-offline/` in frontend)
- The existing `pickup-offline-cache.service.ts`, `pickup-offline-cart.service.ts`,
  `pickup-offline-order.service.ts` handle order capture in IndexedDB
- The `order-sync.service.ts` (45KB) manages flush-to-server
- For full offline: Make the API server accept orders locally via NeDB
- Remove the sync-back logic (no remote server to sync to)
- Keep the existing pricing engine (`pickup-pricing.ts`)

**Edge cases:**
- `counter.model.js` — auto-increment order IDs. Must work offline (use NeDB counters)
- Payment modes: Only CASH and CARD (no online payment). Remove Razorpay references.
- Pickup ID generation (`pickup-offline-id.ts`) — already has offline ID generation

---

### 5.3 Dine-In POS (`/dineIn-table-list`, `/dineIn-food-categories`)

**Frontend:** `fatfox-admin-panel/src/app/dinein-table-list/`, `dinein-food-categories/`
**Backend:** `fatfox-api-server/controllers/restaurant/table.controller.js` (66KB),
`cart.controller.js` (216KB)

**What it does:** Table floor plan, take dine-in orders per table, KOT printing, bill settle.

**Conversion work:**
- Already has offline support (`dinein-offline/` — drafts, settles, sync)
- `dinein-draft.service.ts` handles offline order saving
- `dinein-settle.service.ts` handles offline bill settlement
- Convert all table management APIs to NeDB
- Remove QR dine-in (customer phone ordering) — requires internet
- Keep POS-initiated dine-in (staff takes order on the till)

**Edge cases:**
- `dinein_session.model.js` tracks active table sessions. Must persist in NeDB.
- Bill splitting (`billSplit.controller.js`, 47KB) — complex logic, test thoroughly
- Table area management (`table_area.controller.js`, 32KB) — straightforward CRUD
- `table_claim.ts` — table locking for concurrent access (single-user EXE = not needed)

---

### 5.4 Kitchen Display System (`/kitchen-dashboard`)

**Frontend:** `fatfox-admin-panel/src/app/kitchen-dashboard/`
**Backend:** `fatfox-api-server/controllers/restaurant/kitchen.controller.js` (110KB)

**What it does:** Live KDS with KOT cards, status updates, department filtering.

**Conversion work:**
- Replace Socket.IO real-time events with local EventEmitter
- When a new order is placed → emit event → KDS updates
- All KOT work items stored in local NeDB
- Kitchen department CRUD is straightforward

**Edge cases:**
- Real-time updates: In offline mode, the KDS and POS run on the SAME machine.
  Use `BroadcastChannel` API or Electron IPC to push updates from the API handler
  to the Angular KDS component.
- Multi-screen: If KDS runs on a separate screen (extended display), it's still the same
  Electron process — no network needed.
- Sound alerts: Already work locally

---

### 5.5 Menu Management (`/food-items`, `/add-item`, `/category-dashboard`)

**Frontend:** `fatfox-admin-panel/src/app/food-items/`, `add-item/`, `category/`, etc.
**Backend:** `fatfox-api-server/controllers/restaurant/menu.controller.js` (65KB),
`category.controller.js` (31KB)

**What it does:** CRUD for menu items, categories, variants, add-ons, images.

**Conversion work:**
- Already has offline menu caching (`menu-offline/` in frontend)
- **Image handling** is the biggest change:
  - Currently uploads to AWS S3 via the API
  - Must store images locally in `%APPDATA%/FatFox Admin/media/`
  - Serve via Express static middleware: `app.use('/media', express.static(mediaDir))`
  - Frontend `media_domain` changes to `http://localhost:4201/media`
- Menu CRUD → straightforward NeDB operations

**Edge cases:**
- Image URLs stored in menu records must use relative paths, not S3 URLs
- Max image size: Limit to 2MB (already exists in API file-upload config)
- Menu import/export: Add CSV/JSON import for initial setup
- `menu.model.js` has `unique: true` on some fields — NeDB supports `ensureIndex({ unique: true })`

---

### 5.6 Tables & Areas (`/table-dashboard`, `/area-dashboard`)

Simple CRUD — replace Mongoose with NeDB.

### 5.7 Taxes (`/taxes-dashboard`, `/add-taxes`)

Simple CRUD — replace Mongoose with NeDB. Very low effort.

### 5.8 Discounts (`/discount-dashboard`, `/add-discount`)

Simple CRUD — replace Mongoose with NeDB. Low effort.
Edge case: Coupon usage tracking (`coupon_usage.model.js`) needs to persist locally.

### 5.9 Add-ons (`/addons-dashboard`, `/add-addons`)

Simple CRUD — replace Mongoose with NeDB. Low effort.

### 5.10 Invoices (`/invoice`, `/all-invoice`, `/pickup-invoice`)

Invoice data comes from orders/pickups — query local NeDB.
Invoice PDF generation (jsPDF) — already happens client-side.
Print invoice — already works via Electron printer manager.

### 5.11 Finance — Sales Reports (`/sales-report`)

Replace MongoDB aggregation with NeDB queries + JS-side aggregation.
Date-range filtering on local data.
Export to Excel (exceljs) — already works server-side.

### 5.12 Finance — Transactions (`/transactions`)

Paginated list query → NeDB `.find().sort().skip().limit()`

### 5.13 Staff / Branch Users (`/profile-staff`, `/add-branch-user`)

Staff records in local NeDB. PIN-based auth for each staff member.
Permission matrix stored locally.

### 5.14 Printer Settings (`/printer-settings`)

Minimal changes — already save to localStorage and have offline outbox support.

### 5.15 Restaurant Profile (`/profile-setting`)

Single restaurant record in NeDB. Logo upload → local filesystem.

---

## Phase 6 — Data Seeding & Initial Setup Wizard

### First-Launch Wizard (Electron-native dialog sequence)

```
Step 1: "Welcome to FatFox POS" → Continue
Step 2: Enter Restaurant Name, Address, GSTIN, Phone
Step 3: Set Admin PIN (4-6 digit)
Step 4: Configure GST tax rates (pre-filled 5%, 12%, 18%, 28%)
Step 5: Add initial tables (or skip)
Step 6: Import menu (CSV/JSON) or start from scratch
Step 7: Setup complete → redirect to dashboard
```

### Seed Data (auto-create on first launch)

- Default tax configurations (GST 5%, 12%, 18%, 28%)
- Default payment modes (Cash, Card, UPI)
- Counter auto-increment starting at 1
- Default kitchen department ("GENERAL")

---

## Phase 7 — Backup, Restore & Data Safety

### 7.1 Automatic Daily Backups

```javascript
// In electron/main.js — run at startup and every 24h
const backupDir = path.join(userData, 'backups');
const today = new Date().toISOString().split('T')[0]; // 2026-09-26

// Copy all .db files to backups/2026-09-26/
fs.cpSync(dataDir, path.join(backupDir, today), { recursive: true });

// Keep last 30 days, delete older
const dirs = fs.readdirSync(backupDir).sort();
while (dirs.length > 30) {
  fs.rmSync(path.join(backupDir, dirs.shift()), { recursive: true });
}
```

### 7.2 Manual Export/Import

- **Export:** ZIP all `.db` files + `media/` folder → save as `.fatfox-backup` file
- **Import:** Unzip `.fatfox-backup` → overwrite local data files → restart
- Add menu items in Electron tray: `File → Backup Data...` / `File → Restore Data...`

### 7.3 Data Location

```
Windows: %APPDATA%/FatFox Admin/
  ├── data/           ← NeDB database files (*.db)
  ├── media/          ← Menu images
  ├── backups/        ← Auto daily backups (last 30 days)
  ├── logs/           ← App + API logs
  └── config.json     ← App settings (port, first-launch flag)
```

### 7.4 Data Safety Edge Cases

| Scenario | Protection |
|---|---|
| Power failure mid-write | NeDB uses append-only WAL — corrupt tail is truncated on restart |
| Disk full | Check disk space at startup, warn if < 500MB free |
| Accidental uninstall | Data is in `%APPDATA%` (NOT in Program Files), survives uninstall |
| Windows Update reboot | NeDB files are just text — no database service to crash |
| USB drive deployment | Portable EXE mode: pass `--portable` flag → data stored next to EXE |

---

## Phase 8 — Autonomous QA & Self-Correction Loop

As an AI agent executing this plan, you must execute a strict **Test-Driven Self-Correction Loop** before attempting the final Electron build. Do not skip this phase.

### The Agent's Iteration Loop:
1. **Initialize Testing:** After converting Phase 1 through 7, run `npm run build` in the frontend and `node app-offline.js` in the backend.
2. **Monitor Logs:** Capture the standard output and error output.
3. **Fix and Re-evaluate:** 
   - If the API crashes on boot (e.g., missing dependencies, `mongoose` references), read the stack trace, fix the missing mock/adapter, and restart.
   - If the Angular build fails (e.g., missing imports, strict typing errors), fix the TypeScript errors and rebuild.
4. **Endpoint Verification:** Hit `http://localhost:4201/api/v1/health` and verify the embedded API responds correctly.
5. **Loop Termination:** You may only proceed to Phase 9 when both the Angular build compiles with zero errors AND the embedded Node API boots successfully without crashing.

---

## Phase 9 — Build, Package & Distribution

### 9.1 Package Structure

```
fatfox-admin-panel/
  ├── electron/
  │   ├── main.js              ← Modified: starts embedded API
  │   ├── embedded-api.js      ← NEW: Express server launcher
  │   ├── static-server.js     ← Existing: Angular file server
  │   ├── printer-manager.js   ← Existing: thermal printing
  │   └── preload.js           ← Existing
  ├── dist/                    ← Angular build output
  └── fatfox-api-offline/      ← NEW: stripped-down API server copy
      ├── app-offline.js       ← Modified app.js (no Mongoose, no Redis)
      ├── controllers/         ← Controllers with NeDB adapters
      ├── helpers/             ← Offline helpers (NeDB adapter, cache, etc.)
      ├── middlewares/         ← Auth without OTP
      ├── routes/              ← Kept restaurant routes, removed online-only
      └── models/              ← NeDB model wrappers
```

### 9.2 electron-builder Config Update

In `package.json`, add the offline API to the files list:

```json
"build": {
  "files": [
    "dist/angular-registration-login-example/**/*",
    "electron/**/*",
    "fatfox-api-offline/**/*"
  ],
  "extraResources": [
    { "from": "fatfox-api-offline/node_modules", "to": "api-modules" }
  ]
}
```

### 9.3 Build Commands

To build the offline EXE, you will run commands from the frontend folder, which will pull in the backend folder:

```powershell
# Navigate to the frontend Admin Panel
cd C:\Users\USER\Desktop\FATFOX\fatfox-admin-panel

# 1. Build Angular UI
npm run build

# 2. Prepare Offline API
# This custom script (to be created) will copy files from C:\Users\USER\Desktop\FATFOX\fatfox-api-server
# into a fatfox-api-offline/ folder and strip out the online-only MongoDB/Redis code.
node scripts/prepare-offline-api.js

# 3. Package the final EXE
npx electron-builder
```

### 9.4 Expected EXE Size

| Component | Size |
|---|---|
| Electron runtime | ~85MB |
| Angular build | ~15MB |
| Offline API (Node) | ~30MB |
| NeDB + deps | ~2MB |
| **Total installer** | **~130MB** |
| **Data at rest (1 year of orders)** | **~50-200MB** |

---

## Edge Cases & Gotchas

### Critical Edge Cases

| # | Edge Case | Impact | Solution |
|---|---|---|---|
| 1 | **Port 4201 occupied** | API server won't start | Retry with fallback ports 4202-4210, same as static-server pattern |
| 2 | **Antivirus blocks localhost** | API calls fail | Document in installer; sign EXE; add firewall exception |
| 3 | **Clock manipulation** | Sales dates wrong | Use monotonic counters for ordering, not just timestamps |
| 4 | **Disk full** | DB writes fail | Check at startup, warn user, refuse new orders if < 100MB |
| 5 | **Corrupt .db file** | Data loss | NeDB auto-compaction + daily backups → restore from backup |
| 6 | **Multiple EXE instances** | Port conflict | Already handled by `requestSingleInstanceLock()` |
| 7 | **Windows Defender SmartScreen** | Blocks unsigned EXE | Sign with code-signing certificate (EV preferred) |
| 8 | **Large menu (5000+ items)** | Slow NeDB queries | Add indexes on `restaurant_id`, `status`, `category` |
| 9 | **Year of transactions** | Large .db files | NeDB compaction cron (daily); archive old data monthly |
| 10 | **Mid-order crash** | Cart data lost | Cart persisted to NeDB on every change (not just submit) |
| 11 | **24/7 operation** | Memory leak | Same GC strategy as existing Electron main.js |
| 12 | **Thermal printer disconnect** | Print fails | Already handled by printer-manager.js retry logic |
| 13 | **Mongoose `populate()` missing in NeDB** | API crashes on join queries | Provide a helper in `offline-db-adapter.js` that manually resolves `.populate('category')` by querying the related `.db` file in JS, or refactor controllers that rely heavily on joins. |
| 14 | **CORS between 4200 and 4201** | API calls blocked by browser | In `app-offline.js`, Express must be explicitly configured to allow CORS requests from `http://localhost:4200`. |
| 15 | **Bcrypt / Native Node Modules** | EXE crashes on launch | `bcrypt` uses C++ bindings which must be compiled for Electron's V8 version. Easiest solution is to replace `bcrypt` with `bcryptjs` (pure JS) in the offline API. |
| 16 | **Socket.io on Frontend** | KDS fails to connect | Rather than rewriting the Angular frontend to use `BroadcastChannel`, run a local Socket.io server on the embedded `localhost:4201` Express app. This allows the frontend to work 100% unchanged. |

### Things That Will NOT Work Offline (By Design)

| Feature | Why | Alternative |
|---|---|---|
| Live online orders (customer app) | Requires internet for customer → server → POS flow | Not applicable for offline-only |
| Dine-in prebooking | Requires internet for customer reservation | Not applicable |
| QR code dine-in (customer phone) | Customer scans QR → orders online | Staff takes order on POS instead |
| Delivery module | Requires GPS, driver app, customer app | Not applicable |
| Payment gateway (Razorpay/ICICI) | Requires internet for payment processing | Cash / manual card entry |
| Push notifications (OneSignal) | Cloud service | Not needed offline |
| Firebase analytics | Cloud service | Not needed offline |
| Subscription licence check | Requires server validation | Bypass entirely in offline |
| Support tickets | Requires cloud API | Not applicable offline |
| Storefront links | Online storefront | Not applicable offline |
| Customer app users | Online registration | Not applicable offline |

---

## 15. Step-by-Step AI Execution Pipeline

**AI AGENT INSTRUCTION:** Do not skip steps. Execute these phases sequentially. After every phase, you MUST run a build test to ensure you haven't broken the application.

### STEP 1: Foundation (Core Infrastructure)
- [ ] **Create** `electron/embedded-api.js` (Express launcher).
- [ ] **Create** `helpers/offline-db-adapter.js` (NeDB Mongoose wrapper).
- [ ] **Create** `helpers/offline-cache.js` (In-memory Map Redis replacement).
- [ ] **Modify** `app.js` to branch into offline mode if `process.env.OFFLINE_MODE === 'true'`.
- [ ] **Create** `environment.offline.ts` in Angular.
- [ ] **Modify** `electron/main.js` to start `embedded-api.js` on port 4201.
- 🛑 **TEST CHECKPOINT 1:** Run `node electron/main.js` (or start the API locally) and ensure it boots without crashing. Fix any missing requires.

### STEP 2: Auth & Staff (The Gatekeepers)
- [ ] **Migrate Models:** `restaurant.model.js`, `restaurant_manager.model.js`, `restaurant_staff.model.js`, `counter.model.js` → NeDB.
- [ ] **Refactor Auth:** Modify `middlewares/jwt.js` to accept offline tokens and bypass OTP.
- [ ] **Refactor Login:** Modify `restaurant.controller.js` to allow PIN-based login.
- 🛑 **TEST CHECKPOINT 2:** Hit the login endpoint locally. Ensure it generates a JWT using NeDB data.

### STEP 3: Menu & Categories (Data Layer)
- [ ] **Migrate Models:** `menu.model.js`, `category.model.js`, `variant.model.js`, `variant_group.model.js`, `add_on.model.js` → NeDB.
- [ ] **Refactor Controllers:** Update the controllers for all the above models.
- [ ] **Image Handling:** Change image upload logic to save to local `media/` folder. Serve static folder from Express.
- 🛑 **TEST CHECKPOINT 3:** Run `npm run build` in Angular. Check for TypeScript errors in the Menu components.

### STEP 4: Table, Area, Tax & Discount (Configuration)
- [ ] **Migrate Models:** `table.model.js`, `table_area.model.js`, `tax.model.js`, `discount.model.js` → NeDB.
- [ ] **Refactor Controllers:** Update corresponding controllers to use NeDB adapter.
- 🛑 **TEST CHECKPOINT 4:** Verify CRUD operations on Taxes and Discounts via local API tests.

### STEP 5: Pickup POS (High Priority)
- [ ] **Migrate Models:** `pickup.model.js`, `pickup_menu.model.js`, `cart.model.js`, `cart_menu.model.js`, `transaction.model.js` → NeDB.
- [ ] **Refactor Controller:** `pickup.controller.js`. Remove Razorpay/online payment logic. Ensure order ID generation uses local `counter.model.js`.
- 🛑 **TEST CHECKPOINT 5:** Submit a test pickup order through the API. Verify it saves to `pickups.db`.

### STEP 6: Dine-In POS
- [ ] **Migrate Models:** `order.model.js`, `order_menu.model.js`, `dinein_session.model.js`, `bill_split.model.js` → NeDB.
- [ ] **Refactor Controllers:** `table.controller.js` (dine-in endpoints), `cart.controller.js`.
- [ ] **Refactor Bill Settle:** Ensure the bill settlement logic works 100% offline.
- 🛑 **TEST CHECKPOINT 6:** Test the table-locking and bill-splitting logic. Ensure no Mongoose `.populate()` crashes occur.

### STEP 7: KDS (Kitchen Display System)
- [ ] **Migrate Models:** `kitchen_work_item.model.js`, `kitchen_department.model.js` → NeDB.
- [ ] **Refactor Controller:** `kitchen.controller.js`.
- [ ] **WebSockets:** Implement local Socket.io server on `localhost:4201` so Angular KDS updates in real-time.
- 🛑 **TEST CHECKPOINT 7:** Place an order in POS, verify the Socket.io event is emitted and caught by the KDS.

### STEP 8: Finance, Reports & Invoices
- [ ] **Refactor Controllers:** `invoice.controller.js`, `transaction.controller.js`, `report.controller.js`, `dashboard.controller.js`.
- [ ] **Aggregation:** Convert Mongoose `.aggregate()` pipelines in the dashboard/reports to manual JavaScript `.reduce()` logic using NeDB raw data.
- 🛑 **TEST CHECKPOINT 8:** Generate a sales report. Verify the numbers match the NeDB records.

### STEP 9: Admin, Polish & Setup Wizard
- [ ] **Build Setup Wizard:** Create the initial setup screen for first-launch.
- [ ] **Seed Data:** Pre-populate GST brackets and payment modes.
- [ ] **Cleanup:** Remove Firebase, OneSignal, AWS S3 dependencies from `package.json`.
- [ ] **Remove Sidebar Items:** Hide online-only tabs (Delivery, App Users, Storefront).

### STEP 10: Final Autonomous QA & Build
- [ ] **Execute Phase 8 (QA Loop):** Fully compile Angular. Boot Node. Fix any final errors.
- [ ] **Build EXE:** Run `node scripts/prepare-offline-api.js` then `npx electron-builder`.
- 🛑 **FINAL VERIFICATION:** Launch the generated `.exe`. Test 1 complete order flow (Login → Add item to cart → Settle bill).

---

## Optional: Hybrid Mode

For a future phase, you could support **hybrid mode** where the EXE works offline by default
but syncs data to the cloud when internet is available:

1. **Local-first:** All operations hit local NeDB
2. **Background sync:** When internet detected, push new orders/transactions to cloud MongoDB
3. **Conflict resolution:** Server wins for menu/config, local wins for orders
4. **Benefit:** Multi-device support (POS + KDS on separate machines)

This is architecturally complex and should only be attempted AFTER the pure-offline EXE is
stable and battle-tested.

---

## Summary

| Metric | Estimate |
|---|---|
| **Total models to convert** | ~24 critical + 71 lower priority |
| **Total controller files to modify** | ~15 critical |
| **New files to create** | ~5 (adapter, cache, embedded-api, setup wizard, backup) |
| **Files unchanged** | Electron shell (static-server, printer-manager), Angular UI (mostly) |
| **Biggest risk** | MongoDB aggregation pipelines → manual JS aggregation |
| **Biggest effort** | `cart.controller.js` (216KB) and `pickup.controller.js` (170KB) |
| **Already works offline** | Printing, pricing, offline order capture, menu caching |
