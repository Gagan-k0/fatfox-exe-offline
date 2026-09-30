'use strict';

/**
 * FatFox offline Express API.
 *
 * No MongoDB, no Redis, no AWS, no Firebase. Binds only to 127.0.0.1 when launched
 * via electron/embedded-api.js. Controllers are added module-by-module in later steps.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const logger = require('morgan');

process.env.OFFLINE_MODE = process.env.OFFLINE_MODE || 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'offline';
process.env.DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'single';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex');
  console.warn('[offline-api] JWT_SECRET was missing/weak — generated an ephemeral secret for this process');
}

const apiResponse = require('./helpers/apiResponse');
const errorHandler = require('./middlewares/error-handler');
const { HEALTH_PATH, healthHandler } = require('./helpers/health');
const { dataDir } = require('./helpers/offline-db-adapter');
const { ensureSeed } = require('./helpers/seed');

global.redis = require('./helpers/offline-cache');

const mediaDir = process.env.MEDIA_DIR || path.join(
  process.env.APPDATA || process.env.HOME || process.cwd(),
  'FatFox Admin',
  'media'
);
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const app = express();
app.set('trust proxy', false);
app.disable('x-powered-by');

if (process.env.NODE_ENV !== 'test') {
  app.use(logger('dev', { skip: (req) => req.path === HEALTH_PATH }));
}

app.use(helmet({ contentSecurityPolicy: false }));

app.get(HEALTH_PATH, healthHandler);
app.options(HEALTH_PATH, healthHandler);

app.use(cookieParser());
app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 },
  abortOnLimit: true
}));

const corsOrigin = process.env.OFFLINE_CORS_ORIGIN || 'http://localhost:4200';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    try {
      const hostname = new URL(origin).hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') return callback(null, true);
    } catch (_) {
      return callback(new Error(`CORS: malformed origin — ${origin}`));
    }
    if (origin === corsOrigin) return callback(null, true);
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true
}));

app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));

app.use('/media', express.static(mediaDir, { maxAge: '1d' }));

app.get('/api/v1/config', (_req, res) => {
  return apiResponse.successResponseWithData(res, 0, 'OK', {
    mode: 'offline',
    media_domain: `http://127.0.0.1:${process.env.EMBEDDED_API_PORT || 4201}/media`,
    features: {
      pickup: true,
      dinein: true,
      kds: true,
      delivery: false,
      storefront: false,
      payments_online: false
    }
  });
});

const restaurantRoutes = require('./routes/restaurant');
app.use('/api/v1/restaurant', restaurantRoutes);

ensureSeed().catch((err) => {
  console.error('[offline-api] seed failed:', err);
});

app.use(errorHandler);
app.all('*', (req, res) => {
  return apiResponse.notFoundResponse(res, 404, 'Page not found.');
});

app.use((err, req, res, _next) => {
  if (err && err.name === 'UnauthorizedError') {
    return apiResponse.unauthorizedResponse(res, 401, err.message);
  }
  return apiResponse.ErrorResponse(res, 500, err && err.message ? err.message : 'Internal server error');
});

module.exports = app;
