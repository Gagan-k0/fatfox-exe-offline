'use strict';

/**
 * FatFox Offline EXE — Electron main process.
 *
 * Starts the embedded Express API on 127.0.0.1:4201 (fallback 4202-4210), then serves
 * the Angular UI on localhost:4200. Lives in this workspace so the production
 * fatfox-admin-panel Electron shell is not modified until the offline API is stable.
 */

const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { startEmbeddedApi, stopEmbeddedApi } = require('./embedded-api');

function logLifecycle(event, details = '') {
  const timestamp = new Date().toISOString();
  console.log(`[Lifecycle ${timestamp}] ${event} ${details}`.trim());
}

process.on('uncaughtException', (error) => {
  console.error('FatFox Offline Uncaught Exception:', error);
  try {
    dialog.showErrorBox('FatFox Offline Error', (error && error.stack) || String(error));
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  console.error('FatFox Offline Unhandled Rejection:', reason);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logLifecycle('Second process instance detected. Exiting duplicate process immediately.');
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let isShuttingDown = false;

function userDataPath() {
  return app.getPath('userData');
}

async function runDailyBackup(userData) {
  const dataDir = path.join(userData, 'data');
  const backupRoot = path.join(userData, 'backups');
  if (!fs.existsSync(dataDir)) return;
  fs.mkdirSync(backupRoot, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const dest = path.join(backupRoot, today);
  if (fs.existsSync(dest)) return;
  fs.cpSync(dataDir, dest, { recursive: true });
  const dirs = fs.readdirSync(backupRoot).sort();
  while (dirs.length > 30) {
    const oldest = dirs.shift();
    try { fs.rmSync(path.join(backupRoot, oldest), { recursive: true, force: true }); } catch (_) {}
  }
  logLifecycle('Daily backup written', dest);
}

function createWindow() {
  const webRoot = path.join(__dirname, '..', 'dist', 'angular-registration-login-example');
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 500,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const indexHtml = path.join(webRoot, 'index.html');
  if (fs.existsSync(indexHtml)) {
    mainWindow.loadFile(indexHtml);
  } else {
    mainWindow.loadURL('http://127.0.0.1:4201/api/v1/health');
    logLifecycle('Angular dist missing — showing health endpoint until UI is built');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  logLifecycle('app whenReady');
  const userData = userDataPath();
  try {
    await startEmbeddedApi(userData);
  } catch (err) {
    dialog.showErrorBox(
      'FatFox Offline API failed to start',
      (err && err.message) || String(err)
    );
    app.quit();
    return;
  }
  try {
    await runDailyBackup(userData);
  } catch (err) {
    console.error('Backup failed:', err);
  }
  createWindow();
});

app.on('window-all-closed', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  await stopEmbeddedApi();
  app.quit();
});

app.on('before-quit', () => {
  stopEmbeddedApi();
});
