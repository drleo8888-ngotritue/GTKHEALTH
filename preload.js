const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // --- SYNC: Đồng bộ qua file (thay thế email) ---
  // SPOKE: Xuất ca khám ra file .dat
  exportClinicalData: (stationName) => ipcRenderer.invoke('sync:export-clinical', stationName),
  // HUB: Nhập file .dat ca khám từ Spoke
  importClinicalData: () => ipcRenderer.invoke('sync:import-clinical'),
  // HUB: Xuất danh mục thuốc ra file .dat
  exportMedicineFile: (stationName) => ipcRenderer.invoke('sync:export-medicine', stationName),
  // SPOKE: Nhập file danh mục thuốc từ HUB
  importMedicineFile: (stationName) => ipcRenderer.invoke('sync:import-medicine', stationName),

  // --- Kiểm tra & đánh dấu file đã nhập (Chống trùng) ---
  checkFileImported: (fileId) => ipcRenderer.invoke('check-file-imported', fileId),
  markFileImported: (data) => ipcRenderer.invoke('mark-file-imported', data),

  // --- DATABASE: KHÁM BỆNH ---
  deleteEncounter: (id) => ipcRenderer.invoke('db:delete-encounter', id),
  createEncounter: (data) => ipcRenderer.invoke('db:create-encounter', data),
  getEncounters: () => ipcRenderer.invoke('db:get-encounters'),
  updateEncounter: (data) => ipcRenderer.invoke('db:update-encounter', data),
  getAllEncounters: () => ipcRenderer.invoke('db:get-all-encounters'),

  // --- DATABASE: KHO DƯỢC & BÁO CÁO ---
  getInventory: (stationName) => ipcRenderer.invoke('db:get-inventory', stationName),
  getAllInventoryByStation: () => ipcRenderer.invoke('db:get-all-inventory-by-station'),
  importMedicine: (data, stationName) => ipcRenderer.invoke('db:import-medicine', { data, stationName }),
  createInventoryLog: (logData) => ipcRenderer.invoke('db:create-inventory-log', logData),
  getInventoryLogs: () => ipcRenderer.invoke('db:get-inventory-logs'),
  deleteMedicine: (id) => ipcRenderer.invoke('db:delete-medicine', id),
  updateMedicineBatch: (id, data) => ipcRenderer.invoke('db:update-medicine-batch', { id, data }),

  // --- DATABASE: NHẬT KÝ LÂM SÀNG (TIMELINE) ---
  getClinicalEvents: (encounterId) => ipcRenderer.invoke('db:get-clinical-events', encounterId),

  // --- DATABASE: HỒ SƠ SỨC KHỎE NHÂN VIÊN ---
  importHealthCheckups: (rows, year) => ipcRenderer.invoke('db:import-health-checkups', { rows, year }),
  getPatientTimeline: (patientId) => ipcRenderer.invoke('db:get-patient-timeline', patientId),
  getKskReport: (year, month) => ipcRenderer.invoke('db:get-ksk-report', { year, month }),

  // --- [MỚI] QUẢN LÝ CỬA SỔ (WINDOW) ---
  openKiosk: () => ipcRenderer.invoke('app:open-kiosk'),

  // --- SERVER SYNC ---
  getUnsyncedCount:          ()       => ipcRenderer.invoke('db:get-unsynced-count'),
  updateServerSyncConfig:    (config) => ipcRenderer.invoke('server-sync:update-config', config),
  updateServerStationConfig: (s)      => ipcRenderer.invoke('server-sync:update-station', s),
  syncNow:                   ()       => ipcRenderer.invoke('server-sync:sync-now'),
  pullEmployees:             ()       => ipcRenderer.invoke('server-sync:pull-employees'),

  // --- CHỐT KỲ ---
  createSupplementaryEncounter: (data) => ipcRenderer.invoke('db:create-supplementary-encounter', data),
  closePeriod: (data) => ipcRenderer.invoke('db:close-period', data),
  getClosedPeriods: (station) => ipcRenderer.invoke('db:get-closed-periods', station),

  // --- BÁO CÁO THUỐC THÁNG (Spoke → Hub) ---
  exportMedicineReport: (data) => ipcRenderer.invoke('sync:export-medicine-report', data),
  importMedicineReport: () => ipcRenderer.invoke('sync:import-medicine-report'),
  getSpokeReportStatus: (periodMonth, periodYear) => ipcRenderer.invoke('db:get-spoke-report-status', { periodMonth, periodYear }),
  getSpokeReportData: (periodMonth, periodYear) => ipcRenderer.invoke('db:get-spoke-report-data', { periodMonth, periodYear }),
  smartImport: () => ipcRenderer.invoke('sync:smart-import'),

  // --- NHẬP BỔ SUNG CA KHÁM TỪ EXCEL ---
  importEncountersFromExcel: (encounters, deductInventory) => ipcRenderer.invoke('db:import-encounters-excel', encounters, deductInventory),

  // --- RESET DỮ LIỆU ---
  resetData: (type) => ipcRenderer.invoke('db:reset-data', type),

  // --- CẬP NHẬT ỨNG DỤNG ---
  applyUpdate: () => ipcRenderer.invoke('app:apply-update'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // --- HỆ THỐNG REAL-TIME ---
  onDataUpdate: (callback) => ipcRenderer.on('data:update', (_event, value) => callback(value)),
  removeDataUpdateListener: () => ipcRenderer.removeAllListeners('data:update'),

  // Nhận thời gian sync server thành công
  onServerSyncTime: (callback) => ipcRenderer.on('server-sync:last-time', (_event, time) => callback(time)),
  removeServerSyncTimeListener: () => ipcRenderer.removeAllListeners('server-sync:last-time'),

  // --- ĐIỀU CHUYỂN THUỐC QUA SERVER ---
  createServerTransfer: (data) => ipcRenderer.invoke('hub:create-transfer', data),

  // --- HUB: Lấy tồn kho snapshot của một trạm Spoke ---
  getHubSpokeStock: (stationName) => ipcRenderer.invoke('hub:get-spoke-stock', stationName),

  // --- HUB: Query ca khám từ server theo khoảng thời gian ---
  queryServerEncounters: (params) => ipcRenderer.invoke('hub:query-server-encounters', params),

  // --- HUB: Đẩy phác đồ lên server ---
  pushProtocolsToServer: (protocols) => ipcRenderer.invoke('hub:push-protocols', protocols),

  // --- SPOKE: Nhận phác đồ mới từ server (real-time) ---
  onSpokeProtocolsUpdate: (callback) => ipcRenderer.on('spoke:protocols-update', (_event, data) => callback(data)),
  removeSpokeProtocolsListener: () => ipcRenderer.removeAllListeners('spoke:protocols-update'),

  // --- SYNC PROGRESS MODAL ---
  getPushStatus:              ()         => ipcRenderer.invoke('sync:get-push-status'),
  syncWithProgress:           (options)  => ipcRenderer.invoke('sync:push-with-progress', options),
  resetSyncFlags:             ()         => ipcRenderer.invoke('sync:reset-flags'),
  onSyncProgress:             (callback) => ipcRenderer.on('sync:progress-update', (_event, data) => callback(data)),
  removeSyncProgressListener: ()         => ipcRenderer.removeAllListeners('sync:progress-update'),
});