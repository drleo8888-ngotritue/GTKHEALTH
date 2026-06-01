const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- 🛠️ KIỂM TRA MÔI TRƯỜNG (DEV HAY PROD) ---
// Nếu app chưa được đóng gói (đang chạy npm start) thì là Dev
const isDev = !app.isPackaged;

// --- 🔐 CẤU HÌNH MÃ HÓA ---
const ENCRYPTION_KEY = crypto.scryptSync('vnp-secret-key-2025', 'salt', 32);
const IV = Buffer.alloc(16, 0);

// --- 1. NẠP CÁC MODULE LOGIC ---
const dbService = require('./db-service.js');
const syncService = require('./sync-service.js');

// Khai báo biến toàn cục quản lý cửa sổ
let mainWindow;
let kioskWindow = null; // Biến quản lý cửa sổ Kiosk

function createWindow() {
  console.log('🖥️ Đang khởi tạo cửa sổ giao diện chính...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

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
        return result;
    } catch (err) {
        console.error('❌ Lỗi cập nhật:', err);
        throw err;
    }
});

// === D. ĐỒNG BỘ GỬI EMAIL ===
ipcMain.handle('sync:trigger-send', async () => {
  console.log('☁️ [SYNC] Đang bắt đầu quy trình đồng bộ...');
  try {
     const result = await syncService.performSync(); 
     console.log('✅ Đồng bộ hoàn tất:', result);
     return result;
  } catch (error) {
    console.error('❌ Lỗi đồng bộ:', error);
    throw error;
  }
});

// === E. LẤY DỮ LIỆU TỪ EMAIL ===
ipcMain.handle('sync:trigger-fetch', async () => {
    console.log('⬇️ [HUB] Đang tải dữ liệu từ Email...');
    try {
        const result = await syncService.fetchAndMerge();
        return result;
    } catch (error) {
        console.error('❌ Lỗi tải về:', error);
        throw error;
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

// === G. NHẬP DỮ LIỆU THỦ CÔNG ===
ipcMain.handle('sync:import-manual', async (event, fileContent) => {
  console.log('📂 [IMPORT] Đang xử lý file thủ công...');
  try {
    let data;
    try {
        data = JSON.parse(fileContent);
    } catch (jsonErr) {
        console.log('🔐 File đã bị mã hóa, đang giải mã...');
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
            let decrypted = decipher.update(fileContent, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            data = JSON.parse(decrypted);
            console.log('🔓 Giải mã thành công!');
        } catch (decryptErr) {
            console.error('❌ Giải mã thất bại:', decryptErr.message);
            return { success: false, message: 'Sai khóa giải mã hoặc file hỏng!' };
        }
    }

    if (!data) return { success: false, message: 'Dữ liệu rỗng!' };

    if (data.type === 'TRANSFER') {
        return { success: true, dataType: 'TRANSFER', data: data };
    }

    if (data.encounters) {
        const count = await dbService.importSyncedData(data);
        return { success: true, dataType: 'SYNC', count: count };
    }

    return { success: false, message: 'Loại dữ liệu không hỗ trợ!' };

  } catch (err) {
    console.error('❌ Lỗi nhập file:', err);
    return { success: false, message: 'Lỗi hệ thống: ' + err.message };
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
        return { success: true };
    } catch (e) {
        console.error("Lỗi lưu log:", e);
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
  
  const kioskIconPath = path.join(__dirname, 'assets/icon.png');
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