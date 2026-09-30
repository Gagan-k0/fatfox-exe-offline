'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  notify: (title, body) => ipcRenderer.send('desktop-notification', { title, body })
});

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  offlineMode: true,
  reportRendererReady: () => ipcRenderer.send('renderer-ui-ready'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrinterSettings: () => ipcRenderer.invoke('get-printer-settings'),
  savePrinterSettings: (settings) => ipcRenderer.invoke('save-printer-settings', settings),
  getReceiptCustomization: () => ipcRenderer.invoke('get-receipt-customization'),
  saveReceiptCustomization: (settings) => ipcRenderer.invoke('save-receipt-customization', settings),
  silentPrint: (job) => ipcRenderer.invoke('silent-print-job', job),
  testPrint: (params) => ipcRenderer.invoke('test-print-job', params),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
