'use strict';

/**
 * Launches the stripped-down Express API inside the Electron main process.
 * Binds 127.0.0.1 only. Falls back across 4201-4210 if the preferred port is taken.
 */

const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const FALLBACK_PORTS = [4201, 4202, 4203, 4204, 4205, 4206, 4207, 4208, 4209, 4210];
const PREFERRED_PORT = 4201;

let server = null;
let boundPort = null;

function ensureJwtSecret(userData) {
  const secretFile = path.join(userData, 'jwt-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
  } catch (_) { /* generate below */ }
  const secret = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretFile, secret, { encoding: 'utf8' });
  } catch (err) {
    console.warn('[Offline API] could not persist JWT secret:', err.message);
  }
  return secret;
}

function listenOn(app, port) {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(app);
    try {
      const { attachSocket } = require('../fatfox-api-offline/helpers/offline-socket');
      attachSocket(httpServer);
    } catch (err) {
      console.warn('[Offline API] Socket.io attach failed:', err && err.message);
    }
    const onError = (err) => {
      httpServer.removeListener('listening', onListening);
      try { httpServer.close(); } catch (_) {}
      reject(err);
    };
    const onListening = () => {
      httpServer.removeListener('error', onError);
      resolve(httpServer);
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(port, '127.0.0.1');
  });
}

async function startEmbeddedApi(userData) {
  process.env.NODE_ENV = process.env.NODE_ENV || 'offline';
  process.env.OFFLINE_MODE = 'true';
  process.env.DEPLOYMENT_MODE = 'single';
  process.env.SINGLE_TENANT_SLUG = process.env.SINGLE_TENANT_SLUG || 'offline';
  process.env.NEDB_DATA_DIR = path.join(userData, 'data');
  process.env.MEDIA_DIR = path.join(userData, 'media');
  process.env.JWT_SECRET = process.env.JWT_SECRET || ensureJwtSecret(userData);

  fs.mkdirSync(process.env.NEDB_DATA_DIR, { recursive: true });
  fs.mkdirSync(process.env.MEDIA_DIR, { recursive: true });
  fs.mkdirSync(path.join(userData, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });

  const app = require('../fatfox-api-offline/app-offline');

  let lastErr = null;
  for (const port of FALLBACK_PORTS) {
    try {
      server = await listenOn(app, port);
      boundPort = port;
      process.env.EMBEDDED_API_PORT = String(port);
      console.log(`[Offline API] Running on http://127.0.0.1:${port}`);
      return { server, port };
    } catch (err) {
      lastErr = err;
      if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) {
        console.warn(`[Offline API] port ${port} unavailable (${err.code}), trying next`);
        continue;
      }
      throw err;
    }
  }
  const error = lastErr || new Error('No free port in 4201-4210 for the embedded API');
  error.isPortBlocked = true;
  throw error;
}

function stopEmbeddedApi() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      boundPort = null;
      resolve();
    });
  });
}

function getEmbeddedApiPort() {
  return boundPort;
}

module.exports = {
  startEmbeddedApi,
  stopEmbeddedApi,
  getEmbeddedApiPort,
  EMBEDDED_API_PORT: PREFERRED_PORT,
  FALLBACK_PORTS
};
