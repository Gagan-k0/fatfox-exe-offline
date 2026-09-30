# FatFox Offline EXE

This repository contains the fully offline Windows EXE version of the FatFox restaurant management system.

## Overview

The FatFox Offline EXE is a self-contained desktop application that requires zero internet connectivity for day-to-day restaurant operations. It includes:

- Admin Panel
- Dashboard
- Pickup POS
- Dine-In POS
- Kitchen Display System (KDS)
- Finance & Reports
- Menu Management
- Table Management
- Taxes & Discounts
- Staff Management
- Invoices
- Printing

## Technical Implementation

- **Electron** main process hosting embedded Express API on localhost:4201
- **NeDB** (nedb-promises) as embedded MongoDB-replacement database
- **In-memory Map** replacing Redis caching layer
- **Local filesystem** (%APPDATA%/FatFox Admin/media/) replacing AWS S3 for image storage
- **Socket.io** adapted for in-process real-time updates (KDS)
- **JWT authentication** modified for PIN/password login (no OTP/SMS)
- **Bcryptjs** replacing bcrypt to avoid native modules in EXE
- **Data seeding** on first launch with default restaurant, GST taxes, kitchen department
- **Automatic daily backups** with 30-day retention
- **CORS configuration** allowing Angular UI (localhost:4200) to access API (localhost:4201)
- **Port fallback system** (4201-4210) for embedded API server

## Key Files

- `electron/embedded-api.js`: Launches Express API in Electron main process with port fallback logic
- `electron/main.js`: Modified to start embedded API before creating BrowserWindow, implements daily backups
- `fatfox-api-offline/app-offline.js`: Express app that branches to offline mode, uses NeDB and offline cache
- `fatfox-api-offline/helpers/offline-db-adapter.js`: Mongoose-compatible NeDB wrapper with populate, aggregate, timestamp support
- `fatfox-api-offline/helpers/offline-cache.js`: In-memory Map replacement for Redis
- `fatfox-api-offline/controllers/auth.controller.js`: Modified for PIN-based login, setup endpoint for first-launch
- `fatfox-api-offline/models/*.js`: ~25 models converted to use createOfflineModel() factory
- `src/environments/environment.offline.ts`: Angular config pointing apiUrl to http://localhost:4201/
- `fatfox-api-offline/helpers/seed.js`: Creates default restaurant with GST taxes (5%,12%,18%,28%), kitchen department, counters
- `electron/preload.js`: Exposes desktop APIs to renderer (printers, notifications, etc.)
- `electron/setup.html`: Setup wizard UI for first-launch experience

## Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the Angular application
4. Run `npx electron-builder` to create the Windows EXE

## First Launch Experience

On first launch, the application presents a setup wizard to:
- Enter restaurant name, address, phone, GSTIN
- Set admin username and PIN (4-6 digits)
- Seeds default data including:
  - One restaurant (FatFox Offline)
  - One admin user
  - Default GST brackets (5%, 12%, 18%, 28%)
  - Kitchen department (GENERAL)
  - Order counters (pickup and order sequences)

## Offline Capabilities

All features work completely offline:
- Menu creation and management
- Table management
- Order processing (Pickup and Dine-In)
- Kitchen Display System (KDS)
- Payment processing (cash/card - no online gateways)
- Financial reporting and analytics
- Invoice generation
- Printer management
- Data backup and restore

## Limitations (Intentional)

The following online-only features are intentionally excluded:
- Live online orders
- Prebooking
- Delivery module
- Storefront links
- Customer app users
- QR dine-in from customer phones
- OneSignal push notifications
- Firebase analytics
- Subscription license validation

## Build Process

The application uses Electron Builder to create a standalone Windows EXE that includes:
- Embedded Express API server
- Angular UI
- NeDB database files
- All necessary dependencies

## Data Storage

All data is stored locally in:
- `%APPDATA%/FatFox Admin/data/` - NeDB database files
- `%APPDATA%/FatFox Admin/media/` - Menu images, logos, uploaded files
- `%APPDATA%/FatFox Admin/backups/` - Automatic daily backups (30-day retention)
- `%APPDATA%/FatFox Admin/logs/` - Application logs

## Security

- JWT authentication with locally generated secret
- PIN-based login (4-6 digits)
- Passwords hashed using bcryptjs
- All API requests bound to 127.0.0.1 only
- CORS restricted to localhost origins