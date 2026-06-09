const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs'); // Bypass Electron asar patch (dùng cho update)
const crypto = require('crypto');

// --- 🛠️ KIỂM TRA MÔI TRƯỜNG (DEV HAY PROD) ---
// Nếu app chưa được đóng gói (đang chạy npm start) thì là Dev
const isDev = !app.isPackaged;

// --- 🔐 CẤU HÌNH MÃ HÓA ---
const ENCRYPTION_KEY = crypto.scryptSync('vnp-secret-key-2025', 'salt', 32);
const IV = Buffer.alloc(16, 0);

// --- 1. NẠP CÁC MODULE LOGIC ---
const dbService   = require('./db-service.js');
const syncService = require('./sync-service.js');
const syncServer  = require('./sync-server.js');

// Khai báo biến toàn cục quản lý cửa sổ
let mainWindow;
let kioskWindow = null; // Biến quản lý cửa sổ Kiosk

function createWindow() {
  console.log('🖥️ Đang khởi tạo cửa sổ giao diện chính...');

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // Màn hình dọc: sh > sw; màn hình nhỏ: sw < 1280
  const isPortraitOrSmall = sh > sw || sw < 1280;
  const initW = Math.min(sw, 1280);
  const initH = Math.min(sh, 900);

  mainWindow = new BrowserWindow({
    width: initW,
    height: initH,
    minWidth: 800,
    minHeight: 500,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/Ico.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.setMenu(null);

  // F12 mở/đóng DevTools (cả dev lẫn production)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });

  // Tự động maximize trên màn hình dọc hoặc màn hình nhỏ
  if (isPortraitOrSmall) {
    mainWindow.maximize();
  }

  // --- LOGIC LOAD URL THÔNG MINH ---
  if (isDev) {
    console.log('🚧 Đang chạy chế độ DEVELOPMENT (localhost:3000)');
    mainWindow.loadURL('http://localhost:3000');
    // Mở DevTools nếu cần thiết
    // mainWindow.webContents.openDevTools(); 
  } else {
    console.log('📦 Đang chạy chế độ PRODUCTION (File build)');
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

// ---------------------------------------------------------------------------
// SERVER SYNC — chạy hoàn toàn trong main process, không crash app khi lỗi
// ---------------------------------------------------------------------------
let _retryTimer = null;

// Hub kéo ca khám + tồn kho từ server về local DB
async function doHubPull() {
  try {
    // 1. Pull encounters
    console.log('🔄 [HUB PULL] Đang kéo ca khám từ server...');
    const serverEncounters = await syncServer.pullHubEncounters();
    if (Array.isArray(serverEncounters) && serverEncounters.length > 0) {
      const inserted = await dbService.upsertEncountersFromServer(serverEncounters);
      if (inserted > 0) {
        console.log(`✅ [HUB PULL] Đã lưu ${inserted} ca khám mới (server có ${serverEncounters.length} bản ghi)`);
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) win.webContents.send('data:update');
        });
      } else {
        console.log(`ℹ️ [HUB PULL] Không có ca khám mới (server: ${serverEncounters.length}, đều đã có)`);
      }
    } else {
      console.log('ℹ️ [HUB PULL] Server chưa có ca khám nào.');
    }
  } catch (err) {
    console.warn('⚠️ [HUB PULL] Lỗi kéo dữ liệu từ server:', err.message);
  }
}

async function doServerSync() {
  const cfg = syncServer.getSyncConfig();
  if (!cfg.enabled || !cfg.serverUrl) return;

  try {
    // PUSH encounters
    const encounters = await dbService.getUnsyncedEncounters();
    if (encounters.length > 0) {
      console.log(`⬆️ [SYNC] Đang push ${encounters.length} ca khám lên server...`);
      const res = await syncServer.pushEncounters(encounters);
      if (res?.success && Array.isArray(res.received_ids) && res.received_ids.length > 0) {
        await dbService.markEncountersSynced(res.received_ids);
        console.log(`✅ [SYNC] Push ca khám: ${res.received_ids.length} đã xác nhận.`);
      } else if (res?.success) {
        // Server thành công nhưng không trả received_ids → mark tất cả
        await dbService.markEncountersSynced(encounters.map(e => e.id));
        console.log(`✅ [SYNC] Push ca khám: ${encounters.length} đã gửi.`);
      } else {
        console.warn('⚠️ [SYNC] Push ca khám thất bại hoặc server không phản hồi.');
      }
    }

    // PUSH inventory logs
    const logs = await dbService.getUnsyncedInventoryLogs();
    if (logs.length > 0) {
      console.log(`⬆️ [SYNC] Đang push ${logs.length} inventory logs lên server...`);
      const res = await syncServer.pushInventoryLogs(logs);
      if (res?.success && Array.isArray(res.received_ids) && res.received_ids.length > 0) {
        await dbService.markInventoryLogsSynced(res.received_ids);
        console.log(`✅ [SYNC] Push inventory logs: ${res.received_ids.length} đã xác nhận.`);
      } else if (res?.success) {
        await dbService.markInventoryLogsSynced(logs.map(l => l.id));
        console.log(`✅ [SYNC] Push inventory logs: ${logs.length} đã gửi.`);
      } else {
        console.warn('⚠️ [SYNC] Push inventory logs thất bại.');
      }
    }

    // HUB: kéo dữ liệu từ server về local
    if (_stationType === 'HUB') {
      await doHubPull();
    }

    // SPOKE: kiểm tra phiếu điều chuyển thuốc đang chờ từ Hub
    if (_stationType !== 'HUB') {
      const pendingTransfers = await syncServer.pullPendingTransfers(syncServer.getStationName());
      if (Array.isArray(pendingTransfers) && pendingTransfers.length > 0) {
        let applied = 0;
        for (const transfer of pendingTransfers) {
          try {
            const logItems = [];
            for (const med of transfer.medicines) {
              await dbService.importMedicine(
                { name: med.name, stock: med.qty, batchNumber: med.batchNumber || '', unit: med.unit || '', type: 'MEDICINE', group: med.group || '' },
                transfer.target_station
              );
              logItems.push({ name: med.name, qty: med.qty, batch: med.batchNumber || '' });
            }
            await dbService.createInventoryLog({
              id: require('crypto').randomUUID(),
              type: 'TRANSFER_IN',
              source: transfer.source_station,
              target: transfer.target_station,
              timestamp: Date.now(),
              note: `Nhận điều chuyển từ ${transfer.source_station} (tự động)`,
              items: logItems,
              actorName: 'SERVER_SYNC',
              actorRole: 'SYSTEM',
            });
            await syncServer.confirmTransfer(transfer.id);
            applied++;
          } catch (e) {
            console.warn(`⚠️ Lỗi áp dụng phiếu điều chuyển ${transfer.id}:`, e.message);
          }
        }
        if (applied > 0) {
          BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) win.webContents.send('data:update');
          });
          console.log(`✅ Đã nhận ${applied} phiếu điều chuyển thuốc từ server.`);
        }
      }
    }

    // Emit thời gian sync thành công lên renderer
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send('server-sync:last-time', timeStr);
    });
  } catch (err) {
    console.warn('⚠️ Server sync lỗi (sẽ retry sau):', err.message);
  }
}

function startSyncRetryTimer(intervalMinutes) {
  if (_retryTimer) clearInterval(_retryTimer);
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  _retryTimer = setInterval(() => {
    doServerSync().catch(() => {});
  }, ms);
}

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');

    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'local_data.db');
    console.log('📂 Database sẽ được lưu tại:', dbPath);

    await dbService.initDB(dbPath);
    console.log('✅ Database đã sẵn sàng.');
  } catch (err) {
    console.error('❌ Lỗi khởi tạo Database:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- 2. KHU VỰC XỬ LÝ SỰ KIỆN (IPC HANDLERS) ---

// === A. LƯU BỆNH ÁN MỚI ===
ipcMain.handle('db:create-encounter', async (event, data) => {
  console.log('💾 [CREATE] Đang lưu bệnh án mới:', data.patientName);
  try {
    const id = await dbService.createEncounter(data);
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('data:update');
    });
    doServerSync().catch(() => {}); // fire-and-forget, không block UI
    return { success: true, id: id };
  } catch (err) {
    console.error('❌ Lỗi lưu DB:', err);
    throw err;
  }
});

// === B. LẤY DANH SÁCH HÀNG CHỜ ===
ipcMain.handle('db:get-encounters', async () => {
  try {
    const list = await dbService.getEncounters();
    return list;
  } catch (err) {
    console.error('❌ Lỗi lấy danh sách hàng chờ:', err);
    return []; 
  }
});

// === C. CẬP NHẬT TRẠNG THÁI KHÁM ===
ipcMain.handle('db:update-encounter', async (event, data) => {
    console.log('📝 [UPDATE] Cập nhật ID:', data.id);
    try {
        const result = await dbService.updateEncounter(data);
        // Chỉ push lên server khi ca khám kết thúc (không push mỗi lần click)
        const finalStatuses = ['COMPLETED', 'REFERRED', 'REST_30', 'MONITOR'];
        if (finalStatuses.includes((data.status || '').toUpperCase())) {
          doServerSync().catch(() => {});
        }
        return result;
    } catch (err) {
        console.error('❌ Lỗi cập nhật:', err);
        throw err;
    }
});

// === D. SPOKE: XUẤT FILE LÂM SÀNG ===
ipcMain.handle('sync:export-clinical', async (event, stationName) => {
    console.log(`[SYNC] Xuất file lâm sàng cho trạm: ${stationName}`);
    try {
        const result = await syncService.prepareClinicalExport(stationName);
        if (result.empty) return { success: false, message: 'Không có ca khám mới cần xuất.' };

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Lưu file báo cáo lâm sàng',
            defaultPath: `BC_${stationName}_${timestamp}.dat`,
            filters: [{ name: 'Sync Data', extensions: ['dat'] }]
        });

        if (canceled || !filePath) return { success: false, message: 'Đã hủy.' };

        fs.writeFileSync(filePath, result.encrypted, 'utf8');
        await dbService.markAsSynced(result.payload.data);

        return { success: true, count: result.count, message: `Đã xuất ${result.count} ca khám ra file.` };
    } catch (error) {
        console.error('❌ Lỗi xuất file lâm sàng:', error);
        return { success: false, message: error.message };
    }
});

// === E. HUB: NHẬP FILE LÂM SÀNG ===
ipcMain.handle('sync:import-clinical', async () => {
    console.log('[SYNC] Nhập file lâm sàng...');
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Chọn file báo cáo lâm sàng',
            filters: [{ name: 'Sync Data', extensions: ['dat'] }],
            properties: ['openFile']
        });

        if (canceled || !filePaths || filePaths.length === 0) return { success: false, message: 'Đã hủy.' };

        const content = fs.readFileSync(filePaths[0], 'utf8');
        const result = await syncService.processClinicalImport(content);
        if (result.success) {
            BrowserWindow.getAllWindows().forEach(win => win.webContents.send('data:update'));
        }
        return result;
    } catch (error) {
        console.error('❌ Lỗi nhập file lâm sàng:', error);
        return { success: false, message: error.message };
    }
});

// === F. LẤY BÁO CÁO TỔNG HỢP ===
ipcMain.handle('db:get-all-encounters', async () => {
  try {
    const list = await dbService.getAllEncounters();
    return list;
  } catch (err) {
    console.error('❌ Lỗi lấy báo cáo:', err);
    return [];
  }
});

// === G. HUB: XUẤT FILE DANH MỤC THUỐC ===
ipcMain.handle('sync:export-medicine', async (event, stationName) => {
    console.log('[SYNC] Xuất file danh mục thuốc...');
    try {
        const result = await syncService.prepareMedicineExport(stationName);
        if (result.empty) return { success: false, message: 'Không có dữ liệu thuốc để xuất.' };

        const timestamp = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Lưu file danh mục thuốc',
            defaultPath: `THUOC_${timestamp}.dat`,
            filters: [{ name: 'Sync Data', extensions: ['dat'] }]
        });

        if (canceled || !filePath) return { success: false, message: 'Đã hủy.' };

        fs.writeFileSync(filePath, result.encrypted, 'utf8');
        return { success: true, count: result.count, message: `Đã xuất ${result.count} loại thuốc ra file.` };
    } catch (error) {
        console.error('❌ Lỗi xuất thuốc:', error);
        return { success: false, message: error.message };
    }
});

// === G2. SPOKE: NHẬP FILE DANH MỤC THUỐC ===
ipcMain.handle('sync:import-medicine', async (event, targetStation) => {
    console.log(`[SYNC] Nhập file danh mục thuốc vào trạm: ${targetStation}`);
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Chọn file danh mục thuốc',
            filters: [{ name: 'Sync Data', extensions: ['dat'] }],
            properties: ['openFile']
        });

        if (canceled || !filePaths || filePaths.length === 0) return { success: false, message: 'Đã hủy.' };

        const content = fs.readFileSync(filePaths[0], 'utf8');
        return await syncService.processMedicineImport(content, targetStation);
    } catch (error) {
        console.error('❌ Lỗi nhập thuốc:', error);
        return { success: false, message: error.message };
    }
});

// === H. QUẢN LÝ KHO DƯỢC ===
ipcMain.handle('db:get-inventory', async (event, stationName) => {
  try {
    if (!stationName || stationName === 'ALL') {
        const list = await dbService.getAllInventory();
        return list;
    } else {
        const list = await dbService.getInventory(stationName);
        return list;
    }
  } catch (err) {
    console.error('❌ Lỗi lấy kho:', err);
    return [];
  }
});

ipcMain.handle('db:get-all-inventory-by-station', async () => {
  try {
    const list = await dbService.getAllInventoryByStation();
    return list;
  } catch (err) {
    console.error('❌ Lỗi lấy kho đa trạm:', err);
    return [];
  }
});

ipcMain.handle('db:import-medicine', async (event, { data, stationName }) => {
  console.log(`💊 [INVENTORY] Đang nhập thuốc vào kho ${stationName}:`, data.name);
  try {
    const id = await dbService.importMedicine(data, stationName);
    return { success: true, id: id };
  } catch (err) {
    console.error('❌ Lỗi nhập kho:', err);
    throw err;
  }
});

// === I. LƯU LỊCH SỬ KHO (LOGS) ===
ipcMain.handle('db:create-inventory-log', async (event, logData) => {
    try {
        await dbService.createInventoryLog(logData);
        doServerSync().catch(() => {});
        return { success: true };
    } catch (e) {
        console.error("Lỗi lưu log:", e);
        return { success: false };
    }
});

// === I2. XÓA LÔ THUỐC ===
ipcMain.handle('db:delete-medicine', async (event, id) => {
    try {
        await dbService.deleteMedicine(id);
        return { success: true };
    } catch (e) {
        console.error("Lỗi xóa thuốc:", e);
        return { success: false };
    }
});

// === I3. CẬP NHẬT LÔ THUỐC ===
ipcMain.handle('db:update-medicine-batch', async (event, { id, data }) => {
    try {
        await dbService.updateMedicineBatch(id, data);
        return { success: true };
    } catch (e) {
        console.error("Lỗi cập nhật lô thuốc:", e);
        return { success: false };
    }
});

// === J. LẤY TOÀN BỘ LOG ===
ipcMain.handle('db:get-inventory-logs', async () => {
    try {
        const logs = await dbService.getInventoryLogs();
        return logs;
    } catch (e) {
        console.error("Lỗi lấy log kho:", e);
        return [];
    }
});

// === K. LẤY TIMELINE ===
ipcMain.handle('db:get-clinical-events', async (event, encounterId) => {
    try {
        const events = await dbService.getClinicalEvents(encounterId);
        return events;
    } catch (e) {
        console.error("Lỗi lấy timeline:", e);
        return [];
    }
});

// === L. CHECK FILE ĐÃ NHẬP CHƯA ===
ipcMain.handle('check-file-imported', async (event, fileId) => {
    try {
        const exists = await dbService.checkFileExists(fileId); 
        return exists;
    } catch (e) {
        console.error("Lỗi check file:", e);
        return false;
    }
});

// === M. ĐÁNH DẤU FILE ĐÃ NHẬP ===
ipcMain.handle('mark-file-imported', async (event, data) => {
    try {
        await dbService.saveFileImportHistory(data);
        return true;
    } catch (e) {
        console.error("Lỗi mark file:", e);
        return false;
    }
});

// === N_KSK. IMPORT KẾT QUẢ KHÁM SỨC KHỎE HÀNG NĂM ===
ipcMain.handle('db:import-health-checkups', async (event, { rows, year }) => {
    console.log(`🏥 [KSK] Đang import ${rows.length} kết quả KSK năm ${year}`);
    try {
        const count = await dbService.importHealthCheckups(rows, year);
        return { success: true, count };
    } catch (e) {
        console.error('❌ Lỗi import KSK:', e);
        return { success: false, message: e.message };
    }
});

// === N_TIMELINE. LẤY TIMELINE SỨC KHỎE CỦA 1 BỆNH NHÂN ===
ipcMain.handle('db:get-patient-timeline', async (event, patientId) => {
    try {
        return await dbService.getPatientTimeline(patientId);
    } catch (e) {
        console.error('❌ Lỗi lấy timeline bệnh nhân:', e);
        return { encounters: [], checkups: [] };
    }
});

// === N_KSK_REPORT. BÁO CÁO TỔNG HỢP KSK THEO NĂM ===
ipcMain.handle('db:get-ksk-report', async (event, { year, month }) => {
    try {
        return await dbService.getKskReport(year, month);
    } catch (e) {
        console.error('❌ Lỗi lấy báo cáo KSK:', e);
        return { rows: [], months: [], departments: [] };
    }
});

// === N0. XÓA PHIẾU KHÁM ===
ipcMain.handle('db:delete-encounter', async (event, id) => {
    console.log(`🗑️ [DELETE] Xóa phiếu khám: ${id}`);
    try {
        await dbService.deleteEncounter(id);
        BrowserWindow.getAllWindows().forEach(win => win.webContents.send('data:update'));
        return { success: true };
    } catch (err) {
        console.error('❌ Lỗi xóa phiếu khám:', err);
        return { success: false, message: err.message };
    }
});

// === N00. ĐẾM BẢN GHI CHƯA SYNC ===
ipcMain.handle('db:get-unsynced-count', async () => {
    try {
        return await dbService.getUnsyncedCount();
    } catch (err) {
        return { encounters: 0, medicines: 0, inventoryLogs: 0 };
    }
});

// === CHỐT KỲ ===
ipcMain.handle('db:create-supplementary-encounter', async (event, data) => {
  try { return await dbService.createSupplementaryEncounter(data); }
  catch (err) { console.error('❌ Lỗi tạo đơn bổ sung:', err); return null; }
});

ipcMain.handle('db:close-period', async (event, data) => {
  try {
    const result = await dbService.closePeriod(data);
    // Auto-push tồn kho lên server sau khi chốt kỳ
    const cfg = syncServer.getSyncConfig();
    if (cfg.enabled && cfg.serverUrl) {
      try {
        const medicines = await dbService.getInventory(data.station);
        if (medicines.length > 0) {
          await syncServer.pushMedicinesStock(medicines.map(m => ({
            id: m.id, name: m.name, group_name: m.group, unit: m.unit,
            stock: m.stock, batch_number: m.batchNumber, expiry_date: m.expiryDate, type: m.type,
          })));
        }
      } catch (e) {
        console.warn('⚠️ Push stock sau chốt kỳ thất bại (sẽ thử lại):', e.message);
      }
    }
    return result;
  }
  catch (err) { console.error('❌ Lỗi chốt kỳ:', err); return false; }
});

ipcMain.handle('db:get-closed-periods', async (event, station) => {
  try { return await dbService.getClosedPeriods(station); }
  catch (err) { console.error('❌ Lỗi lấy danh sách chốt kỳ:', err); return []; }
});

// === SPOKE: Gửi báo cáo thuốc tháng lên server ===
ipcMain.handle('sync:export-medicine-report', async (event, { stationName, periodType, periodMonth, periodYear, items }) => {
  try {
    const cfg = syncServer.getSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl) {
      return { success: false, message: 'Chưa cấu hình kết nối máy chủ. Vào Cấu hình → Máy chủ để thiết lập.' };
    }
    const res = await syncServer.pushMedicineReport({
      station: stationName, periodType, periodMonth, periodYear, items,
    });
    if (!res?.success) {
      return { success: false, message: res?.message || 'Máy chủ không phản hồi. Kiểm tra kết nối.' };
    }
    return { success: true, message: `Đã gửi báo cáo T${periodMonth}/${periodYear} lên máy chủ.` };
  } catch (err) {
    console.error('❌ Lỗi gửi báo cáo thuốc:', err);
    return { success: false, message: err.message };
  }
});

// === HUB: Nhập báo cáo thuốc từ Spoke ===
ipcMain.handle('sync:import-medicine-report', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn file báo cáo thuốc từ Spoke',
      filters: [{ name: 'Sync Data', extensions: ['dat'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false, message: 'Đã hủy.' };

    const syncService = require('./sync-service');
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const payload = syncService.decryptPayload(content);
    if (!payload || payload.type !== 'MEDICINE_REPORT') {
      return { success: false, message: 'File không hợp lệ hoặc sai định dạng.' };
    }

    const result = await dbService.importSpokeReport({
      id: require('crypto').randomUUID(),
      station: payload.sourceStation,
      periodType: payload.periodType || 'MONTHLY',
      periodMonth: payload.periodMonth,
      periodYear: payload.periodYear,
      data: payload.data,
      fileId: payload.fileId,
    });

    if (result.duplicate) {
      return { success: false, duplicate: true, message: 'File này đã được nhập trước đó!' };
    }
    BrowserWindow.getAllWindows().forEach(win => win.webContents.send('data:update'));
    return {
      success: true,
      sourceStation: payload.sourceStation,
      periodMonth: payload.periodMonth,
      periodYear: payload.periodYear,
      message: `Đã nhập báo cáo thuốc của ${payload.sourceStation} T${payload.periodMonth}/${payload.periodYear}.`,
    };
  } catch (err) {
    console.error('❌ Lỗi nhập báo cáo thuốc:', err);
    return { success: false, message: err.message };
  }
});

// === HUB: Lấy trạng thái báo cáo thuốc các Spoke (từ server) ===
ipcMain.handle('db:get-spoke-report-status', async (event, { periodMonth, periodYear }) => {
  try {
    const cfg = syncServer.getSyncConfig();
    if (cfg.enabled && cfg.serverUrl) {
      const data = await syncServer.pullHubReportStatus(periodMonth, periodYear);
      if (data !== null) {
        // Chuẩn hóa về shape { station, importedAt } giống local DB
        return data.map(r => ({ station: r.station, importedAt: r.submitted_at }));
      }
    }
    // Fallback: local DB (dữ liệu cũ từ .dat)
    return await dbService.getSpokeReportStatus(periodMonth, periodYear);
  }
  catch (err) { console.error('❌ Lỗi lấy trạng thái spoke:', err); return []; }
});

// === HUB: Nhập thông minh — tự nhận diện loại file ===
ipcMain.handle('sync:smart-import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Chọn file báo cáo từ Spoke',
      filters: [{ name: 'Sync Data', extensions: ['dat'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.length) return { success: false, message: 'Đã hủy.' };

    const syncService = require('./sync-service');
    const content = fs.readFileSync(filePaths[0], 'utf8');
    const payload = syncService.decryptPayload(content);
    if (!payload || !payload.type) {
      return { success: false, message: 'File không hợp lệ hoặc đã bị hỏng.' };
    }

    // Route theo loại file
    if (payload.type === 'CLINICAL_REPORT') {
      const result = await syncService.processClinicalImport(content);
      if (result.success) BrowserWindow.getAllWindows().forEach(w => w.webContents.send('data:update'));
      return { ...result, fileType: 'CLINICAL_REPORT' };
    }

    if (payload.type === 'MEDICINE_REPORT') {
      const importResult = await dbService.importSpokeReport({
        id: require('crypto').randomUUID(),
        station: payload.sourceStation,
        periodType: payload.periodType || 'MONTHLY',
        periodMonth: payload.periodMonth,
        periodYear: payload.periodYear,
        data: payload.data,
        fileId: payload.fileId,
      });
      if (importResult.duplicate) {
        return { success: false, duplicate: true, fileType: 'MEDICINE_REPORT', message: 'File này đã được nhập trước đó!' };
      }
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('data:update'));
      return {
        success: true,
        fileType: 'MEDICINE_REPORT',
        sourceStation: payload.sourceStation,
        periodMonth: payload.periodMonth,
        periodYear: payload.periodYear,
        message: `Đã nhập báo cáo thuốc của ${payload.sourceStation} T${payload.periodMonth}/${payload.periodYear}.`,
      };
    }

    return { success: false, message: `Loại file không được hỗ trợ: ${payload.type}` };
  } catch (err) {
    console.error('❌ Lỗi smart import:', err);
    return { success: false, message: err.message };
  }
});

// === HUB: Lấy dữ liệu báo cáo thuốc từ các Spoke (từ server) ===
ipcMain.handle('db:get-spoke-report-data', async (event, { periodMonth, periodYear }) => {
  try {
    const cfg = syncServer.getSyncConfig();
    if (cfg.enabled && cfg.serverUrl) {
      const data = await syncServer.pullHubReportData(periodMonth, periodYear);
      if (data !== null) return data;
    }
    // Fallback: local DB
    return await dbService.getSpokeReportData(periodMonth, periodYear);
  }
  catch (err) { console.error('❌ Lỗi lấy spoke report data:', err); return []; }
});

// === HUB: Tạo phiếu điều chuyển thuốc qua server ===
ipcMain.handle('hub:create-transfer', async (event, { targetStation, medicines, note, createdBy }) => {
  try {
    const cfg = syncServer.getSyncConfig();
    if (!cfg.enabled || !cfg.serverUrl) {
      return { success: false, message: 'Chưa cấu hình kết nối máy chủ.' };
    }
    const transferId = require('crypto').randomUUID();
    const res = await syncServer.createTransfer({
      id: transferId,
      sourceStation: syncServer.getStationName(),
      targetStation,
      createdBy,
      medicines,
      note,
    });
    if (!res?.success) {
      return { success: false, message: res?.message || 'Không thể tạo phiếu điều chuyển.' };
    }
    return { success: true, id: transferId };
  } catch (err) {
    console.error('❌ Lỗi tạo phiếu điều chuyển:', err);
    return { success: false, message: err.message };
  }
});

// === HUB: Lấy tồn kho tức thời của một trạm Spoke từ server ===
ipcMain.handle('hub:get-spoke-stock', async (event, stationName) => {
  try {
    console.log(`🔍 [HUB] Lấy tồn kho trạm "${stationName}" từ server...`);
    const data = await syncServer.pullHubStock(stationName);
    console.log(`✅ [HUB] Tồn kho "${stationName}": ${(data || []).length} mặt hàng`);
    return { success: true, data: data || [] };
  } catch (err) {
    console.error('❌ Lỗi lấy tồn kho Spoke:', err.message);
    return { success: false, data: [], message: err.message };
  }
});

// === N0. RESET DỮ LIỆU ===
ipcMain.handle('db:import-encounters-excel', async (event, encounters, deductInventory) => {
    try {
        const result = await dbService.importEncountersFromExcel(encounters, deductInventory !== false);
        BrowserWindow.getAllWindows().forEach(win => win.webContents.send('data:update'));
        return result;
    } catch (err) {
        console.error('❌ Lỗi import encounters từ Excel:', err);
        return { success: false, count: 0, message: err.message };
    }
});

ipcMain.handle('db:reset-data', async (event, type) => {
    console.log(`🗑️ [RESET] Xóa dữ liệu loại: ${type}`);
    try {
        await dbService.resetData(type);
        BrowserWindow.getAllWindows().forEach(win => win.webContents.send('data:update'));
        return { success: true };
    } catch (err) {
        console.error('❌ Lỗi reset dữ liệu:', err);
        return { success: false, message: err.message };
    }
});

// === N. 🔥 MỞ CỬA SỔ KIOSK RIÊNG BIỆT (SINGLETON) 🔥 ===
ipcMain.handle('app:open-kiosk', () => {
  // 1. Kiểm tra nếu cửa sổ đã tồn tại và chưa bị đóng
  if (kioskWindow && !kioskWindow.isDestroyed()) {
    console.log('⚠️ Cửa sổ Kiosk đang mở rồi, chỉ focus lại thôi.');
    kioskWindow.show(); // Đảm bảo nó hiện lên (trường hợp bị minimize)
    kioskWindow.focus(); // Đưa lên trên cùng
    return { status: 'ALREADY_OPEN', message: 'Màn hình Kiosk đang hoạt động!' };
  }

  // 2. Nếu chưa có thì tạo mới
  console.log('🖥️ Đang khởi tạo màn hình Kiosk mới...');
  
  const kioskIconPath = path.join(__dirname, 'assets/Ico.png');
  kioskWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    ...(fs.existsSync(kioskIconPath) && { icon: kioskIconPath }),
    autoHideMenuBar: true, // Ẩn menu bar cho gọn giao diện Kiosk
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // Dùng chung preload với main
    },
  });

  // 3. Logic load URL riêng cho Kiosk (có hash #/kiosk)
  const kioskUrl = isDev 
    ? 'http://localhost:3000/#/kiosk' 
    : `file://${path.join(__dirname, 'dist/index.html')}#/kiosk`;

  kioskWindow.loadURL(kioskUrl);

  // 4. Xử lý khi cửa sổ bị đóng để reset biến
  kioskWindow.on('closed', () => {
    kioskWindow = null;
  });

  return { status: 'SUCCESS', message: 'Đã mở Kiosk thành công.' };
});

// --- CẬP NHẬT ỨNG DỤNG (PATCH) ---
ipcMain.handle('app:apply-update', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file cập nhật (.zip)',
    filters: [{ name: 'Patch Update', extensions: ['zip'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

  const zipPath = result.filePaths[0];
  const tempDir = path.join(app.getPath('temp'), 'gvc-update-' + Date.now());
  try {
    originalFs.mkdirSync(tempDir, { recursive: true });

    // Giải nén zip bằng PowerShell (không cần thư viện ngoài)
    require('child_process').execSync(
      `powershell -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tempDir}' -Force"`,
      { timeout: 60000 }
    );

    // Kiểm tra file app.asar có trong zip không
    // Dùng originalFs để tránh Electron intercept path kết thúc bằng .asar
    const newAsar = path.join(tempDir, 'app.asar');
    if (!originalFs.existsSync(newAsar)) {
      return { success: false, message: 'File patch không hợp lệ: thiếu app.asar bên trong zip.' };
    }

    // Sao chép vào staging (không ghi đè trực tiếp vì file đang chạy bị lock)
    const resourcesDir = process.resourcesPath;
    const stagingAsar = path.join(resourcesDir, 'app-update.asar');
    const currentAsar = path.join(resourcesDir, 'app.asar');
    const exePath = app.getPath('exe');

    originalFs.copyFileSync(newAsar, stagingAsar);

    // Tạo script bat: chờ app exit → copy → relaunch → tự xóa
    const batPath = path.join(app.getPath('temp'), 'gvc-apply-update.bat');
    const batContent = [
      '@echo off',
      'timeout /t 2 /nobreak >nul',
      `copy /y "${stagingAsar}" "${currentAsar}"`,
      `del "${stagingAsar}"`,
      `start "" "${exePath}"`,
      'del "%~f0"',
    ].join('\r\n');
    originalFs.writeFileSync(batPath, batContent, 'utf8');

    // Chạy bat file tách biệt rồi thoát app
    require('child_process').spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();

    app.exit(0);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    try { originalFs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// === SERVER SYNC IPC ===

// Renderer gọi khi Admin lưu cấu hình — main giữ config trong memory
ipcMain.handle('server-sync:update-config', async (event, config) => {
  syncServer.setSyncConfig(config);
  startSyncRetryTimer(config.retryIntervalMinutes || 5);
  return { success: true };
});

// Renderer gọi khi Admin lưu station config — để main biết stationId/stationName/type
let _stationType = 'SPOKE';
ipcMain.handle('server-sync:update-station', async (event, { id, name, type }) => {
  syncServer.setStationConfig({ id, name });
  if (type) _stationType = type;
  return { success: true };
});

// Nút "Sync ngay" trong Admin UI
ipcMain.handle('server-sync:sync-now', async () => {
  await doServerSync();
  const count = await dbService.getUnsyncedCount();
  return { success: true, unsyncedCount: count };
});

// Renderer gọi khi khởi động — lấy danh sách nhân viên mới nhất từ server
ipcMain.handle('server-sync:pull-employees', async () => {
  try {
    const employees = await syncServer.pullEmployees();
    return { success: true, data: employees || [] };
  } catch {
    return { success: false, data: [] };
  }
});