const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto'); // Cần thêm cái này để generate ID nếu thiếu

// Biến lưu kết nối
let db = null;

// --- CÁC HÀM HỖ TRỢ CHẠY SQL (Wrapper) ---
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Chưa kết nối Database! Hãy gọi initDB trước.'));
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); 
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Chưa kết nối Database! Hãy gọi initDB trước.'));
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error('Chưa kết nối Database! Hãy gọi initDB trước.'));
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
}

// 💊 DANH SÁCH 36 LOẠI THUỐC MẪU
const SEED_MEDICINES_SQL = `
INSERT INTO medicines (id, name, group_name, unit, stock, batch_number, expiry_date, type, station) VALUES
('MED_001', 'Panadol Extra 500mg', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_002', 'Efferalgan 500mg', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_003', 'Panadol cảm cúm 500mg', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_004', 'Codacmin', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_005', 'Eugica', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_006', 'Methorphan', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_007', 'Siro Bảo thanh', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_008', 'Yumangel', 'Thuốc Dạ dày', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_009', 'Omeprazol 20mg', 'Thuốc Dạ dày', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_010', 'Biolac', 'Điều trị Rối loạn tiêu hóa', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_011', 'Flamipio Loperamid', 'Điều trị Rối loạn tiêu hóa', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_023', 'Nospa', 'Thuốc tiêu hóa khác', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_024', 'Trà gừng', 'Thuốc tiêu hóa khác', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_025', 'Oracortia', 'Thuốc tiêu hóa khác', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_012', 'Natricloru 0,9% 10ml', 'Thuốc mắt', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_013', 'Dexalevo', 'Thuốc mắt', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_014', 'Tomax', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_015', 'Gentrisone', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_033', 'Acyclovir', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_034', 'Panthenol', 'Thuốc bôi ngoài', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_035', 'Yoosun rau má', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_016', 'Salonpas', 'Cao dán', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_017', 'Salonship', 'Cao dán', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_018', 'Bạch hổ hoạt lạc cao', 'Cao dán', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_019', 'Phật linh', 'Cao dán', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_020', 'Thylmedi 16mg', 'Thuốc chống viêm dị ứng', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_021', 'Loratadine 10mg', 'Thuốc chống viêm dị ứng', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_022', 'Alphachoay', 'Thuốc chống viêm dị ứng', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_026', 'Naphazolin', 'Thuốc chống viêm dị ứng', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_027', 'Oresol', 'Thuốc bổ', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_028', 'Bổ máu Fevit', 'Thuốc bổ', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_029', 'Hoạt huyết', 'Thuốc bổ', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_030', 'Sủi tăng lực', 'Thuốc bổ', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_036', 'Thymo Immusta', 'Thuốc bổ', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_031', 'Amoxicyclin 500mg', 'Thuốc kháng sinh', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_032', 'Augcixine 1g', 'Thuốc kháng sinh', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA');
`;

// --- HÀM BỔ TRỢ: TRỪ KHO THÔNG MINH (FEFO) ---
async function smartDeductStock(medicineName, neededQty, stationName, logNote) {
    const batches = await getQuery(
        `SELECT * FROM medicines 
         WHERE name = ? AND (station = ? OR station = 'Unknown' OR station = 'MASTER_DATA') 
         AND stock > 0 AND batch_number != 'DANH_MUC_GOC'
         ORDER BY expiry_date ASC, mfg_date ASC`, 
        [medicineName, stationName]
    );

    let remaining = neededQty;
    let deductedDetails = [];

    for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.stock, remaining);
        
        await runQuery(`UPDATE medicines SET stock = stock - ? WHERE id = ?`, [take, batch.id]);
        
        remaining -= take;
        deductedDetails.push({ 
            id: batch.id, 
            batch: batch.batch_number, 
            qty: take 
        });
    }

    if (remaining > 0) {
        console.warn(`⚠️ Thuốc ${medicineName} tại trạm ${stationName} thiếu ${remaining} đơn vị!`);
    }

    if (deductedDetails.length > 0) {
        const logItemStr = JSON.stringify(deductedDetails.map(d => ({
            name: medicineName,
            batch: d.batch,
            qty: d.qty,
            medId: d.id
        })));
        
        await runQuery(
            `INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
            [Date.now().toString() + Math.random().toString().slice(2, 5), 'EXPORT_USE', stationName, 'PATIENT', logItemStr, Date.now(), logNote]
        );
    }
}

module.exports = {
  // 1. KHỞI TẠO DATABASE
  initDB: async (savePath) => {
    return new Promise(async (resolve, reject) => {
        console.log(`💽 Đang kết nối Database tại: ${savePath}`);
        
        db = new sqlite3.Database(savePath, async (err) => {
            if (err) { 
                console.error('❌ Lỗi kết nối DB:', err.message);
                reject(err);
                return;
            }
            console.log('✅ Connected to sqlite database.');

            try {
                // Tạo bảng Encounters
                await runQuery(`CREATE TABLE IF NOT EXISTS encounters (id TEXT PRIMARY KEY, patient_id TEXT, patient_name TEXT, department TEXT, station_name TEXT, symptoms TEXT, diagnosis TEXT, disease_group TEXT, prescriptions TEXT, status TEXT, start_time INTEGER, end_time INTEGER, rest_start_time INTEGER, is_synced INTEGER DEFAULT 0, station_id TEXT)`);

                // Tạo bảng Medicines
                await runQuery(`CREATE TABLE IF NOT EXISTS medicines (id TEXT PRIMARY KEY, name TEXT, group_name TEXT, unit TEXT, stock INTEGER DEFAULT 0, batch_number TEXT, expiry_date TEXT, mfg_date TEXT, type TEXT, station TEXT DEFAULT 'Unknown')`);

                // Tạo bảng Logs
                await runQuery(`CREATE TABLE IF NOT EXISTS inventory_logs (id TEXT PRIMARY KEY, type TEXT, source TEXT, target TEXT, items TEXT, timestamp INTEGER, note TEXT)`);

                // Tạo bảng Events
                await runQuery(`CREATE TABLE IF NOT EXISTS clinical_events (id TEXT PRIMARY KEY, encounter_id TEXT, action_type TEXT, actor_name TEXT, details TEXT, timestamp INTEGER)`);

                // 🔥 TẠO BẢNG LỊCH SỬ NHẬP FILE (QUAN TRỌNG ĐỂ CHỐNG SPAM IMPORT) 🔥
                await runQuery(`CREATE TABLE IF NOT EXISTS import_history (fileId TEXT PRIMARY KEY, fileName TEXT, importType TEXT, sourceStation TEXT, timestamp INTEGER)`);

                // 🔥 LOGIC TỰ ĐỘNG NẠP THUỐC MẪU 🔥
                const check = await getOne(`SELECT count(*) as count FROM medicines`);
                if (check.count === 0) {
                    console.log("💊 Kho thuốc đang trống. Đang tự động nạp 36 loại thuốc mẫu (Folder)...");
                    await runQuery(SEED_MEDICINES_SQL);
                    console.log("✅ Đã nạp xong danh mục thuốc!");
                } else {
                    console.log(`✅ Kho đã có ${check.count} loại thuốc. Bỏ qua bước nạp mẫu.`);
                }

                console.log("✅ Database initialized successfully.");
                resolve(true);

            } catch (tableErr) {
                console.error("❌ Lỗi tạo bảng/nạp dữ liệu:", tableErr);
                reject(tableErr);
            }
        });
    });
  },

  // --- PHẦN 1: QUẢN LÝ KHÁM BỆNH (ENCOUNTERS) ---

  createEncounter: async (data) => {
    console.log("💾 [DB] Đang lưu bệnh nhân:", data.patientName);
    const sql = `INSERT INTO encounters (id, patient_id, patient_name, department, station_name, symptoms, status, start_time, is_synced, station_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`;
    const symptomsJson = JSON.stringify(data.symptoms || []);
    await runQuery(sql, [data.id, data.patientId, data.patientName, data.department, data.stationName || 'Unknown', symptomsJson, data.status, data.startTime, data.stationId || 'unknown']);

    await runQuery(`INSERT INTO clinical_events (id, encounter_id, action_type, actor_name, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`, [
        Date.now().toString() + Math.random().toString().slice(2, 5),
        data.id, 'CHECK_IN', 'Kiosk/System', `Đăng ký khám. Triệu chứng: ${(data.symptoms || []).join(', ')}`, Date.now()
    ]);
    return data.id;
  },

  // Lấy danh sách đang khám (để hiển thị ở màn hình Lâm Sàng)
  getEncounters: async () => {
    const sql = `SELECT * FROM encounters WHERE status IN ('WAITING', 'IN_PROGRESS', 'waiting', 'in_progress') ORDER BY start_time DESC`;
    const rows = await getQuery(sql);
    return rows.map(row => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      department: row.department,
      stationName: row.station_name, 
      symptoms: JSON.parse(row.symptoms || '[]'),
      status: row.status,
      startTime: row.start_time,
      prescriptions: JSON.parse(row.prescriptions || '[]') 
    }));
  },

  // 4. CẬP NHẬT TRẠNG THÁI & TRỪ KHO FEFO
  updateEncounter: async (data) => {
      // Bước 1: Lấy danh sách thuốc cũ
      const currentRecord = await getOne(`SELECT prescriptions FROM encounters WHERE id = ?`, [data.id]);
      let totalPrescriptions = currentRecord ? JSON.parse(currentRecord.prescriptions || '[]') : [];

      let logDetails = [];
      if (data.diagnosis) logDetails.push(`CĐ: ${data.diagnosis}`);
      if (data.instruction) logDetails.push(`Y lệnh: ${data.instruction}`);

      // Bước 2: Xử lý thuốc mới kê (Trừ kho FEFO)
      if (data.prescriptions && data.prescriptions.length > 0) {
          for (const newRx of data.prescriptions) {
              const qty = parseInt(newRx.quantity);
              if (newRx.medicineName && qty > 0) {
                  // GỌI HÀM TRỪ KHO THÔNG MINH
                  await smartDeductStock(
                      newRx.medicineName, 
                      qty, 
                      data.stationName || 'Unknown', 
                      `Kê đơn cho: ${data.patientName}`
                  );

                  // Cộng dồn vào đơn thuốc tổng
                  const existingItem = totalPrescriptions.find(p => p.medicineName === newRx.medicineName);
                  if (existingItem) {
                      existingItem.quantity = parseInt(existingItem.quantity) + qty;
                  } else {
                      totalPrescriptions.push(newRx);
                  }
              }
          }
      }

      logDetails.push(`Trạng thái -> ${data.status}`);

      // Bước 3: Cập nhật bảng encounters
      const sql = `UPDATE encounters SET diagnosis = ?, disease_group = ?, status = ?, end_time = ?, prescriptions = ?, symptoms = ?, rest_start_time = ? WHERE id = ?`;
      await runQuery(sql, [
        data.diagnosis, data.diseaseGroup, data.status, Date.now(), 
        JSON.stringify(totalPrescriptions), JSON.stringify(data.symptoms || []),
        data.restStartTime || null, data.id
      ]);

      // Bước 4: Ghi log Timeline
      await runQuery(`INSERT INTO clinical_events (id, encounter_id, action_type, actor_name, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`, [
        Date.now().toString() + Math.random().toString().slice(2, 5),
        data.id, 'UPDATE', data.actorName || 'Unknown Doctor',
        logDetails.join(' | '), Date.now()
      ]);

      return true;
  },

  // Lấy TẤT CẢ bản ghi (cho báo cáo), bao gồm cả đã sync
  getAllEncounters: async () => {
    const sql = `SELECT * FROM encounters ORDER BY start_time DESC`;
    const rows = await getQuery(sql);
    return rows.map(row => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      department: row.department,
      stationName: row.station_name, 
      symptoms: JSON.parse(row.symptoms || '[]'),
      diagnosis: row.diagnosis,
      diseaseGroup: row.disease_group,
      prescriptions: JSON.parse(row.prescriptions || '[]'),
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      isSynced: row.is_synced // Trả về để Frontend biết
    }));
  },

  // --- PHẦN 2: QUẢN LÝ KHO DƯỢC (INVENTORY) ---

  // 🔥 [HÀM MỚI QUAN TRỌNG] ĐÂY LÀ HÀM BẠN ĐANG THIẾU 🔥
  // Lấy tất cả thuốc, GỘP THEO TÊN (GROUP BY) để làm Danh mục Phác đồ
  getAllInventory: async () => {
      const sql = `SELECT * FROM medicines GROUP BY name ORDER BY name ASC`;
      const rows = await getQuery(sql);
      return rows.map(r => ({
        id: r.id, name: r.name, group_name: r.group_name, unit: r.unit, 
        stock: r.stock, batchNumber: r.batch_number, expiryDate: r.expiry_date, 
        mfgDate: r.mfg_date, type: r.type, station: r.station 
      }));
  },

  // Hàm lấy kho theo trạm (giữ nguyên)
  getInventory: async (stationName) => {
    if (!stationName) return [];
    
    // Logic: Lấy thuốc của trạm HOẶC thuốc Master Data HOẶC Unknown
    const sql = `SELECT * FROM medicines WHERE station = ? OR station = 'Unknown' OR station = 'MASTER_DATA' ORDER BY name ASC`;
    const rows = await getQuery(sql, [stationName]);
    return rows.map(r => ({
      id: r.id, name: r.name, group_name: r.group_name, unit: r.unit, 
      stock: r.stock, batchNumber: r.batch_number, expiryDate: r.expiry_date, 
      mfgDate: r.mfg_date, type: r.type, station: r.station 
    }));
  },

  importMedicine: async (data, stationName) => {
    // Kiểm tra xem đã có Lô này chưa (Khớp Tên + Số lô + Trạm)
    const checkSql = `SELECT * FROM medicines WHERE name = ? AND batch_number = ? AND station = ?`;
    const existing = await getOne(checkSql, [data.name, data.batchNumber, stationName]);
    
    if (existing) {
      // Nếu có rồi -> Cộng thêm số lượng
      const newStock = existing.stock + parseInt(data.stock);
      await runQuery(`UPDATE medicines SET stock = ? WHERE id = ?`, [newStock, existing.id]);
    } else {
      // Nếu chưa có -> Tạo dòng mới
      const id = data.id || Date.now().toString();
      const sql = `
        INSERT INTO medicines (id, name, group_name, unit, stock, batch_number, expiry_date, mfg_date, type, station)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runQuery(sql, [
        id, data.name, data.group, data.unit, data.stock, data.batchNumber, 
        data.expiryDate, data.mfgDate, data.type || 'MEDICINE', stationName || 'Unknown'
      ]);
    }

    if (!data.skipLog) { 
        await runQuery(`INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Date.now().toString() + Math.random().toString().slice(2, 5), 'IMPORT', 'NCC', stationName || 'Unknown', JSON.stringify([{ name: data.name, batch: data.batchNumber, qty: data.stock }]), Date.now(), `Nhập lẻ thủ công: ${data.name}`]);
    }
    return true;
  },

  // --- I. LƯU LỊCH SỬ KHO (LOGS) ---
  createInventoryLog: async (logData) => {
      const sql = `INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      await runQuery(sql, [logData.id, logData.type, logData.source, logData.target, JSON.stringify(logData.items || []), logData.timestamp, logData.note]);
      return true;
  },

  // --- J. LẤY TOÀN BỘ LOG ĐỂ LÀM BÁO CÁO ---
  getInventoryLogs: async () => {
      const sql = `SELECT * FROM inventory_logs ORDER BY timestamp ASC`;
      const rows = await getQuery(sql);
      return rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  },

  // --- K. LẤY TIMELINE NHẬT KÝ LÂM SÀNG ---
  getClinicalEvents: async (encounterId) => {
      const sql = `SELECT * FROM clinical_events WHERE encounter_id = ? ORDER BY timestamp DESC`;
      const rows = await getQuery(sql, [encounterId]);
      return rows;
  },

  // --- 3. CÁC HÀM SYNC & IMPORT (SỬA CHỮA LỖI MẤT DỮ LIỆU) ---

  // 🔥 [MỚI] Kiểm tra file đã nhập chưa (Chống trùng)
  checkFileExists: async (fileId) => {
      const row = await getOne(`SELECT * FROM import_history WHERE fileId = ?`, [fileId]);
      return !!row; 
  },

  // 🔥 [MỚI] Lưu lịch sử nhập file
  saveFileImportHistory: async (data) => {
      const sql = `INSERT INTO import_history (fileId, fileName, importType, sourceStation, timestamp) VALUES (?, ?, ?, ?, ?)`;
      await runQuery(sql, [data.fileId, data.fileName, data.importType, data.sourceStation, data.timestamp]);
      return true;
  },

  // Helper Sync: Lấy dữ liệu chưa đồng bộ
  getUnsyncedData: async () => {
    const sql = "SELECT * FROM encounters WHERE is_synced = 0";
    const rows = await getQuery(sql);
    return {
        encounters: rows.map(row => ({
            ...row,
            // Sửa lại Mapping để đảm bảo đầu bên kia nhận được đúng
            patientName: row.patient_name, // Quan trọng
            patientId: row.patient_id,     // Quan trọng
            stationName: row.station_name,
            diseaseGroup: row.disease_group,
            startTime: row.start_time,
            endTime: row.end_time,
            stationId: row.station_id,
            symptoms: JSON.parse(row.symptoms || '[]'),
            prescriptions: JSON.parse(row.prescriptions || '[]')
        })),
        transactions: [] 
    };
  },

  // Helper Sync: Đánh dấu đã đồng bộ
  markAsSynced: async (data) => {
      if (data.encounters && data.encounters.length > 0) {
          const ids = data.encounters.map(e => `"${e.id}"`).join(",");
          const sql = `UPDATE encounters SET is_synced = 1 WHERE id IN (${ids})`;
          await runQuery(sql);
      }
  },

  // Helper Sync: Import dữ liệu từ trạm khác về
  // 🔥🔥🔥 ĐÂY LÀ CHỖ SỬA LỖI MẤT TÊN 🔥🔥🔥
  importSyncedData: async (data) => {
      let count = 0;
      if (data.encounters && data.encounters.length > 0) {
          console.log(`📥 [Import] Nhận ${data.encounters.length} bản ghi.`);
          
          // Debug dòng đầu tiên để soi
          // console.log("Sample Data:", JSON.stringify(data.encounters[0]));

          const sql = `
            INSERT OR REPLACE INTO encounters (
                id, patient_id, patient_name, department, station_name, 
                symptoms, diagnosis, disease_group, prescriptions, status, 
                start_time, end_time, is_synced, station_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `;

          // Dùng Transaction để import nhanh và an toàn
          db.serialize(() => {
              db.run("BEGIN TRANSACTION");
              const stmt = db.prepare(sql);

              for (const enc of data.encounters) {
                  // 🛡️ Safe Mapping: Ưu tiên CamelCase, fallback sang SnakeCase
                  const safeId = enc.id || crypto.randomUUID();
                  const safeName = enc.patientName || enc.patient_name || 'Unknown';
                  const safePId = enc.patientId || enc.patient_id || 'UNKNOWN';
                  const safeDept = enc.department || '';
                  const safeStation = enc.stationName || enc.station_name || 'Unknown Station';
                  const safeSym = JSON.stringify(enc.symptoms || []);
                  const safeDiag = enc.diagnosis || '';
                  const safeGroup = enc.diseaseGroup || enc.disease_group || ''; // Chú ý cái này
                  const safeRx = JSON.stringify(enc.prescriptions || []);
                  const safeStatus = enc.status || 'COMPLETED';
                  const safeStart = enc.startTime || enc.start_time || Date.now();
                  const safeEnd = enc.endTime || enc.end_time || Date.now();
                  const safeStationId = enc.stationId || enc.station_id || 'unknown';

                  stmt.run([
                      safeId, safePId, safeName, safeDept, safeStation,
                      safeSym, safeDiag, safeGroup, safeRx, safeStatus,
                      safeStart, safeEnd, safeStationId
                  ]);
                  count++;
              }
              stmt.finalize();
              db.run("COMMIT");
          });
      }
      return count;
  }
};