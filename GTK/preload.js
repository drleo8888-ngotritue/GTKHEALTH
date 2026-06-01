const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // --- SYNC SERVICE (Quan trọng cho tính năng Nhập File JSON/Transfer) ---
  triggerSendSync: () => ipcRenderer.invoke('sync:trigger-send'),
  triggerFetchSync: () => ipcRenderer.invoke('sync:trigger-fetch'),
  importManualData: (fileContent) => ipcRenderer.invoke('sync:import-manual', fileContent),

  // --- [MỚI] KIỂM TRA & ĐÁNH DẤU FILE ĐÃ NHẬP (Chống Spam) ---
  checkFileImported: (fileId) => ipcRenderer.invoke('check-file-imported', fileId),
  markFileImported: (data) => ipcRenderer.invoke('mark-file-imported', data),

  // --- DATABASE: KHÁM BỆNH ---
  createEncounter: (data) => ipcRenderer.invoke('db:create-encounter', data),
  getEncounters: () => ipcRenderer.invoke('db:get-encounters'),
  updateEncounter: (data) => ipcRenderer.invoke('db:update-encounter', data),
  getAllEncounters: () => ipcRenderer.invoke('db:get-all-encounters'),

  // --- DATABASE: KHO DƯỢC & BÁO CÁO ---
  getInventory: (stationName) => ipcRenderer.invoke('db:get-inventory', stationName),
  importMedicine: (data, stationName) => ipcRenderer.invoke('db:import-medicine', { data, stationName }),
  createInventoryLog: (logData) => ipcRenderer.invoke('db:create-inventory-log', logData),
  getInventoryLogs: () => ipcRenderer.invoke('db:get-inventory-logs'),

  // --- DATABASE: NHẬT KÝ LÂM SÀNG (TIMELINE) ---
  getClinicalEvents: (encounterId) => ipcRenderer.invoke('db:get-clinical-events', encounterId),

  // --- [MỚI] QUẢN LÝ CỬA SỔ (WINDOW) ---
  openKiosk: () => ipcRenderer.invoke('app:open-kiosk'),

  // --- HỆ THỐNG REAL-TIME ---
  onDataUpdate: (callback) => ipcRenderer.on('data:update', (_event, value) => callback(value)),
  removeDataUpdateListener: () => ipcRenderer.removeAllListeners('data:update'),
});