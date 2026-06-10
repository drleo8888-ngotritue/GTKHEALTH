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
('MED_001', 'Panadol Extra', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_002', 'Efferalgan sủi', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_003', 'Panadol cảm cúm', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_004', 'Codacmin', 'Hạ sốt giảm đau', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_005', 'Viên ngậm ho Eugica', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_006', 'Methorphan', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_007', 'Siro ho Bảo thanh', 'Thuốc Ho', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_008', 'Yumangel', 'Thuốc Dạ dày', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_009', 'Omeprazol 20mg', 'Thuốc Dạ dày', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_010', 'Biolac men tiêu hóa', 'Điều trị Rối loạn tiêu hóa', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_011', 'Flamipio Loperamid', 'Điều trị Rối loạn tiêu hóa', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_023', 'Nospa', 'Thuốc tiêu hóa khác', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_024', 'Trà gừng 3g', 'Thuốc tiêu hóa khác', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_025', 'Thuốc bôi nhiệt miệng Oracortia', 'Thuốc tiêu hóa khác', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_012', 'Natriclorid 0,9% 10ml', 'Thuốc mắt', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_013', 'Dexalevo', 'Thuốc mắt', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_014', 'Tomax', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_015', 'Gentrisone', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_033', 'Acyclovir', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_034', 'Panthenol', 'Thuốc bôi ngoài', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_035', 'Yoosun rau má', 'Thuốc bôi ngoài', 'Tuyp', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_016', 'Salonpas', 'Cao dán', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_017', 'Salonsip', 'Cao dán', 'Gói', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_018', 'Bạch hổ hoạt lạc cao', 'Cao dán', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_019', 'Dầu gió trường sơn phật linh', 'Cao dán', 'Lọ', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_020', 'Thylmedi 16mg', 'Thuốc chống viêm dị ứng', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
('MED_021', 'Loratadin 10mg', 'Thuốc chống viêm dị ứng', 'Viên', 0, 'DANH_MUC_GOC', '---', 'MEDICINE', 'MASTER_DATA'),
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
async function smartRestoreStock(medicineName, qty, stationName, logNote) {
    // Hoàn kho: cộng lại vào lô có hạn dùng sớm nhất (reverse FEFO - ưu tiên lô đã bị trừ trước)
    const batch = await getOne(
        `SELECT * FROM medicines
         WHERE name = ? AND (station = ? OR station = 'Unknown' OR station = 'MASTER_DATA')
         AND batch_number != 'DANH_MUC_GOC'
         ORDER BY expiry_date ASC LIMIT 1`,
        [medicineName, stationName]
    );

    if (batch) {
        await runQuery(`UPDATE medicines SET stock = stock + ? WHERE id = ?`, [qty, batch.id]);
        await runQuery(
            `INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                Date.now().toString() + Math.random().toString().slice(2, 5),
                'RESTORE', 'PATIENT', stationName,
                JSON.stringify([{ name: medicineName, batch: batch.batch_number, qty }]),
                Date.now(), logNote
            ]
        );
    } else {
        console.warn(`⚠️ Không tìm thấy lô thuốc ${medicineName} tại trạm ${stationName} để hoàn kho`);
    }
}

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

            // Bật WAL mode — an toàn hơn khi crash, không block read khi write
            db.run("PRAGMA journal_mode = WAL");
            db.run("PRAGMA synchronous = NORMAL"); // cân bằng tốc độ và an toàn

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

                // 🏥 BẢNG KẾT QUẢ KHÁM SỨC KHỎE HÀNG NĂM
                await runQuery(`CREATE TABLE IF NOT EXISTS health_checkups (
                  id TEXT PRIMARY KEY,
                  employee_id TEXT NOT NULL,
                  year INTEGER NOT NULL,
                  checkup_month TEXT,
                  health_class TEXT,
                  health_conclusion TEXT,
                  disease_conclusion TEXT,
                  exam_details TEXT,
                  created_at INTEGER
                )`);

                // 🔄 MIGRATION: Thêm cột is_synced_server (Phase 1 - Server Sync)
                // Bảng chốt kỳ
                await runQuery(`CREATE TABLE IF NOT EXISTS period_close_records (
                  id TEXT PRIMARY KEY,
                  station TEXT NOT NULL,
                  period_type TEXT NOT NULL,
                  period_year INTEGER NOT NULL,
                  period_ref INTEGER NOT NULL,
                  closed_at INTEGER NOT NULL,
                  closed_by TEXT NOT NULL,
                  snapshot TEXT NOT NULL
                )`);

                // Bảng báo cáo thuốc từ các Spoke gửi về Hub
                await runQuery(`CREATE TABLE IF NOT EXISTS spoke_medicine_reports (
                  id TEXT PRIMARY KEY,
                  station TEXT NOT NULL,
                  period_type TEXT NOT NULL,
                  period_month INTEGER NOT NULL,
                  period_year INTEGER NOT NULL,
                  data TEXT NOT NULL,
                  imported_at INTEGER NOT NULL,
                  file_id TEXT UNIQUE
                )`);

                const migrations = [
                    `ALTER TABLE encounters ADD COLUMN is_synced_server INTEGER DEFAULT 0`,
                    `ALTER TABLE medicines ADD COLUMN is_synced_server INTEGER DEFAULT 0`,
                    `ALTER TABLE inventory_logs ADD COLUMN is_synced_server INTEGER DEFAULT 0`,
                    `ALTER TABLE health_checkups ADD COLUMN consultation TEXT`,
                    `ALTER TABLE health_checkups ADD COLUMN gender TEXT`,
                    `ALTER TABLE encounters ADD COLUMN is_supplementary INTEGER DEFAULT 0`,
                    `ALTER TABLE encounters ADD COLUMN prescription_date INTEGER`,
                    `ALTER TABLE encounters ADD COLUMN had_rest_at_room INTEGER DEFAULT 0`,
                    `ALTER TABLE inventory_logs ADD COLUMN actor_name TEXT`,
                    `ALTER TABLE inventory_logs ADD COLUMN actor_role TEXT`,
                ];
                for (const sql of migrations) {
                    try { await runQuery(sql); } catch (_) { /* Cột đã tồn tại, bỏ qua */ }
                }

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
    const sql = `SELECT * FROM encounters WHERE status IN ('WAITING', 'IN_PROGRESS', 'waiting', 'in_progress', 'REST_30', 'MONITOR') ORDER BY start_time DESC`;
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
      restStartTime: row.rest_start_time || null,
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

      // Bước 3: Cập nhật bảng encounters (reset is_synced_server=0 để đảm bảo re-push bản mới nhất)
      const isRestStatus = data.status === 'REST_30' || data.status === 'MONITOR';
      const sql = `UPDATE encounters SET diagnosis = ?, disease_group = ?, status = ?, end_time = ?, prescriptions = ?, symptoms = ?, rest_start_time = ?, had_rest_at_room = CASE WHEN ? = 1 THEN 1 ELSE had_rest_at_room END, is_synced_server = 0 WHERE id = ?`;
      await runQuery(sql, [
        data.diagnosis, data.diseaseGroup, data.status, Date.now(),
        JSON.stringify(totalPrescriptions), JSON.stringify(data.symptoms || []),
        data.restStartTime || null, isRestStatus ? 1 : 0, data.id
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
      isSynced: row.is_synced,
      isSupplementary: row.is_supplementary || 0,
      prescriptionDate: row.prescription_date || null,
      hadRestAtRoom: row.had_rest_at_room === 1,
    }));
  },

  // --- CHỐT KỲ & ĐƠN KÊ BỔ SUNG ---

  // Tạo đơn kê bổ sung cuối kỳ (is_supplementary=1), trừ kho ngay
  createSupplementaryEncounter: async (data) => {
    const sql = `INSERT INTO encounters
      (id, patient_id, patient_name, department, station_name, symptoms,
       diagnosis, disease_group, prescriptions, status,
       start_time, end_time, is_synced, station_id, is_supplementary, prescription_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED_WORK', ?, ?, 0, ?, 1, ?)`;
    const now = Date.now();
    await runQuery(sql, [
      data.id, data.patientId, data.patientName, data.department || '',
      data.stationName, JSON.stringify(data.symptoms || []),
      data.diagnosis || '', data.diseaseGroup || '',
      JSON.stringify(data.prescriptions || []),
      now, now, data.stationId || data.stationName,
      data.prescriptionDate || now,
    ]);
    // Trừ kho cho từng thuốc
    for (const rx of (data.prescriptions || [])) {
      const qty = parseInt(rx.quantity);
      if (rx.medicineName && qty > 0) {
        await smartDeductStock(rx.medicineName, qty, data.stationName,
          `Bổ sung đơn chốt kỳ — ${data.patientName}`);
      }
    }
    return data.id;
  },

  // Lưu bản ghi chốt kỳ + tạo EXPORT_ADJUST cho phần hụt còn lại
  closePeriod: async ({ id, station, periodType, periodYear, periodRef,
                        closedBy, snapshot, adjustments }) => {
    // Lưu bản ghi chốt kỳ
    await runQuery(
      `INSERT INTO period_close_records
         (id, station, period_type, period_year, period_ref, closed_at, closed_by, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, station, periodType, periodYear, periodRef,
       Date.now(), closedBy, JSON.stringify(snapshot)]
    );
    // Tạo EXPORT_ADJUST cho các mặt hàng hao hụt còn lại
    for (const adj of (adjustments || [])) {
      if (adj.qty > 0) {
        await smartDeductStock(adj.name, adj.qty, station,
          `Hao hụt/Kiểm kê kỳ ${periodType === 'MONTHLY' ? 'T' : 'Q'}${periodRef}/${periodYear}`);
      }
    }
    return true;
  },

  // Lấy danh sách các kỳ đã chốt của trạm
  getClosedPeriods: async (station) => {
    const rows = await getQuery(
      `SELECT * FROM period_close_records WHERE station = ? ORDER BY closed_at DESC`,
      [station]
    );
    return rows.map(r => ({
      id: r.id, station: r.station,
      periodType: r.period_type, periodYear: r.period_year, periodRef: r.period_ref,
      closedAt: r.closed_at, closedBy: r.closed_by,
      snapshot: JSON.parse(r.snapshot || '[]'),
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

  // Lấy toàn bộ thuốc theo từng trạm thực (bỏ MASTER_DATA) — dùng cho báo cáo đa trạm
  getAllInventoryByStation: async () => {
    const sql = `SELECT * FROM medicines WHERE station NOT IN ('MASTER_DATA', 'Unknown') ORDER BY name ASC`;
    const rows = await getQuery(sql);
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
        await runQuery(`INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note, actor_name, actor_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [Date.now().toString() + Math.random().toString().slice(2, 5), 'IMPORT', 'NCC', stationName || 'Unknown', JSON.stringify([{ name: data.name, batch: data.batchNumber, qty: data.stock }]), Date.now(), `Nhập lẻ thủ công: ${data.name}`, data.actorName || null, data.actorRole || null]);
    }
    return true;
  },

  // --- I. LƯU LỊCH SỬ KHO (LOGS) ---
  createInventoryLog: async (logData) => {
      const sql = `INSERT INTO inventory_logs (id, type, source, target, items, timestamp, note, actor_name, actor_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await runQuery(sql, [logData.id, logData.type, logData.source, logData.target, JSON.stringify(logData.items || []), logData.timestamp, logData.note, logData.actorName || null, logData.actorRole || null]);
      return true;
  },

  // --- J. LẤY TOÀN BỘ LOG ĐỂ LÀM BÁO CÁO ---
  getInventoryLogs: async () => {
      const sql = `SELECT * FROM inventory_logs ORDER BY timestamp ASC`;
      const rows = await getQuery(sql);
      return rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]'), actorName: r.actor_name, actorRole: r.actor_role }));
  },

  // --- I2. XÓA LÔ THUỐC ---
  deleteMedicine: async (id) => {
      await runQuery(`DELETE FROM medicines WHERE id = ?`, [id]);
      return true;
  },

  // --- I3. CẬP NHẬT LÔ THUỐC ---
  updateMedicineBatch: async (id, data) => {
      await runQuery(
          `UPDATE medicines SET name=?, group_name=?, unit=?, batch_number=?, expiry_date=?, mfg_date=?, type=? WHERE id=?`,
          [data.name, data.group, data.unit, data.batchNumber, data.expiryDate, data.mfgDate, data.type || 'MEDICINE', id]
      );
      return true;
  },

  // --- K1. XUẤT DANH MỤC THUỐC ĐỂ SYNC ---
  getMedicinesForExport: async () => {
      const sql = `SELECT * FROM medicines ORDER BY name ASC, expiry_date ASC`;
      const rows = await getQuery(sql);
      return rows.map(r => ({
          id: r.id, name: r.name, group: r.group_name, unit: r.unit,
          stock: r.stock, batchNumber: r.batch_number, expiryDate: r.expiry_date,
          mfgDate: r.mfg_date, type: r.type, station: r.station
      }));
  },

  // --- HEALTH CHECKUP: IMPORT KẾT QUẢ KSK HÀNG NĂM ---
  importHealthCheckups: async (rows, year) => {
      return new Promise((resolve, reject) => {
          db.serialize(async () => {
              db.run("BEGIN TRANSACTION");
              const stmt = db.prepare(`
                INSERT OR REPLACE INTO health_checkups
                  (id, employee_id, year, checkup_month, health_class, health_conclusion, disease_conclusion, consultation, gender, exam_details, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              for (const row of rows) {
                  stmt.run([
                      `${row.employee_id}_${year}`,
                      row.employee_id,
                      year,
                      row.checkup_month || null,
                      row.health_class || null,
                      row.health_conclusion || null,
                      row.disease_conclusion || null,
                      row.consultation || null,
                      row.gender || null,
                      JSON.stringify(row.exam_details || {}),
                      Date.now()
                  ]);
              }
              stmt.finalize((err) => {
                  if (err) { db.run("ROLLBACK"); return reject(err); }
                  db.run("COMMIT", (err2) => {
                      if (err2) reject(err2);
                      else resolve(rows.length);
                  });
              });
          });
      });
  },

  // --- HEALTH CHECKUP: LẤY TOÀN BỘ TIMELINE CỦA 1 BỆNH NHÂN ---
  getPatientTimeline: async (patientId) => {
      const encounters = await getQuery(
          `SELECT id, patient_name, department, station_name, diagnosis, disease_group, status, start_time, prescriptions
           FROM encounters WHERE patient_id = ? ORDER BY start_time ASC`,
          [patientId]
      );
      const checkups = await getQuery(
          `SELECT * FROM health_checkups WHERE employee_id = ? ORDER BY year ASC`,
          [patientId]
      );
      return {
          encounters: encounters.map(e => ({
              id: e.id,
              patientName: e.patient_name,
              department: e.department,
              stationName: e.station_name,
              diagnosis: e.diagnosis,
              diseaseGroup: e.disease_group,
              status: e.status,
              startTime: e.start_time,
              prescriptions: JSON.parse(e.prescriptions || '[]')
          })),
          checkups: checkups.map(c => ({
              id: c.id,
              employeeId: c.employee_id,
              year: c.year,
              checkupMonth: c.checkup_month,
              healthClass: c.health_class,
              healthConclusion: c.health_conclusion,
              diseaseConclusion: c.disease_conclusion,
              consultation: c.consultation,
              examDetails: JSON.parse(c.exam_details || '{}'),
              createdAt: c.created_at
          }))
      };
  },

  // --- HEALTH CHECKUP: LẤY DỮ LIỆU BÁO CÁO TỔNG HỢP ---
  getKskReport: async (year, month) => {
      let sql = `SELECT gender, health_class, disease_conclusion, checkup_month
                 FROM health_checkups WHERE year = ?`;
      const params = [year];
      if (month) { sql += ` AND checkup_month = ?`; params.push(month); }

      const rows = await getQuery(sql, params);

      // Danh sách các đợt khám có trong năm
      const metaRows = await getQuery(
          `SELECT DISTINCT checkup_month FROM health_checkups WHERE year = ? ORDER BY checkup_month`,
          [year]
      );
      const months = metaRows.map(r => r.checkup_month).filter(Boolean);

      return {
          rows: rows.map(r => ({
              gender:             r.gender,
              health_class:       r.health_class,
              disease_conclusion: r.disease_conclusion,
              checkup_month:      r.checkup_month,
          })),
          months,
          departments: [],
      };
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

  // Helper Sync: Lấy TẤT CẢ ca khám (bao gồm cả đơn bổ sung, Hub tự dedup qua INSERT OR IGNORE)
  getUnsyncedData: async () => {
    // Xuất TẤT CẢ ca khám — Spoke có thể re-export nhiều lần, Hub dùng INSERT OR IGNORE để dedup
    const sql = "SELECT * FROM encounters";
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
            isSupplementary: row.is_supplementary ?? 0,
            prescriptionDate: row.prescription_date ?? null,
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
  // --- XÓA PHIẾU KHÁM (Dọn dữ liệu rác) ---
  deleteEncounter: async (id) => {
      // Lấy thông tin encounter trước khi xóa để hoàn kho
      const enc = await getOne(`SELECT prescriptions, station_name, patient_name FROM encounters WHERE id = ?`, [id]);
      if (enc) {
          const prescriptions = JSON.parse(enc.prescriptions || '[]');
          for (const rx of prescriptions) {
              const qty = parseInt(rx.quantity);
              if (rx.medicineName && qty > 0) {
                  await smartRestoreStock(
                      rx.medicineName,
                      qty,
                      enc.station_name || 'Unknown',
                      `Hoàn kho - xóa phiếu: ${enc.patient_name}`
                  );
              }
          }
      }
      await runQuery(`DELETE FROM encounters WHERE id = ?`, [id]);
      await runQuery(`DELETE FROM clinical_events WHERE encounter_id = ?`, [id]);
      return true;
  },

  importSyncedData: async (data) => {
      let count = 0;
      if (data.encounters && data.encounters.length > 0) {
          console.log(`📥 [Import] Nhận ${data.encounters.length} bản ghi.`);
          
          // Debug dòng đầu tiên để soi
          // console.log("Sample Data:", JSON.stringify(data.encounters[0]));

          // INSERT OR IGNORE: nếu ID đã tồn tại → bỏ qua (Spoke có thể gửi lại nhiều lần)
          const sql = `
            INSERT OR IGNORE INTO encounters (
                id, patient_id, patient_name, department, station_name,
                symptoms, diagnosis, disease_group, prescriptions, status,
                start_time, end_time, is_synced, station_id,
                is_supplementary, prescription_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          `;

          // Dùng Transaction để import nhanh và an toàn
          db.serialize(() => {
              db.run("BEGIN TRANSACTION");
              const stmt = db.prepare(sql);

              for (const enc of data.encounters) {
                  // 🛡️ Safe Mapping: Ưu tiên CamelCase, fallback sang SnakeCase
                  const safeId          = enc.id || crypto.randomUUID();
                  const safeName        = enc.patientName || enc.patient_name || 'Unknown';
                  const safePId         = enc.patientId || enc.patient_id || 'UNKNOWN';
                  const safeDept        = enc.department || '';
                  const safeStation     = enc.stationName || enc.station_name || 'Unknown Station';
                  const safeSym         = JSON.stringify(enc.symptoms || []);
                  const safeDiag        = enc.diagnosis || '';
                  const safeGroup       = enc.diseaseGroup || enc.disease_group || '';
                  const safeRx          = JSON.stringify(enc.prescriptions || []);
                  const safeStatus      = enc.status || 'COMPLETED';
                  const safeStart       = enc.startTime || enc.start_time || Date.now();
                  const safeEnd         = enc.endTime || enc.end_time || Date.now();
                  const safeStationId   = enc.stationId || enc.station_id || 'unknown';
                  const safeSupp        = enc.isSupplementary ?? enc.is_supplementary ?? 0;
                  const safePrescDate   = enc.prescriptionDate ?? enc.prescription_date ?? null;

                  stmt.run([
                      safeId, safePId, safeName, safeDept, safeStation,
                      safeSym, safeDiag, safeGroup, safeRx, safeStatus,
                      safeStart, safeEnd, safeStationId,
                      safeSupp, safePrescDate
                  ]);
                  count++;
              }
              stmt.finalize();
              db.run("COMMIT");
          });
      }
      return count;
  },

  // === ĐẾM BẢN GHI CHƯA SYNC LÊN SERVER ===
  getUnsyncedCount: async () => {
    const encounters = await getOne(`SELECT COUNT(*) as count FROM encounters WHERE is_synced_server = 0`);
    const medicines  = await getOne(`SELECT COUNT(*) as count FROM medicines WHERE is_synced_server = 0`);
    const logs       = await getOne(`SELECT COUNT(*) as count FROM inventory_logs WHERE is_synced_server = 0`);
    return {
      encounters:    encounters?.count || 0,
      medicines:     medicines?.count  || 0,
      inventoryLogs: logs?.count       || 0,
    };
  },

  // === SERVER SYNC HELPERS ===

  getUnsyncedEncounters: async () => {
    // Đảm bảo cột tồn tại trước khi query (phòng DB cũ chưa migrate)
    try { await runQuery(`ALTER TABLE encounters ADD COLUMN is_synced_server INTEGER DEFAULT 0`); } catch (_) {}
    const rows = await getQuery(
      `SELECT e.*, GROUP_CONCAT(ce.id||'|'||ce.action_type||'|'||ce.actor_name||'|'||ce.details||'|'||ce.timestamp, ';;') as events_raw
       FROM encounters e
       LEFT JOIN clinical_events ce ON ce.encounter_id = e.id
       WHERE (e.is_synced_server = 0 OR e.is_synced_server IS NULL)
         AND e.status NOT IN ('WAITING', 'IN_PROGRESS')
       GROUP BY e.id
       ORDER BY e.start_time ASC
       LIMIT 100`
    );
    console.log(`🔍 [SYNC] getUnsyncedEncounters: tìm thấy ${rows.length} ca chưa sync`);
    return rows.map(r => {
      const clinical_events = r.events_raw
        ? r.events_raw.split(';;').map(s => {
            const [id, action_type, actor_name, details, timestamp] = s.split('|');
            return { id, action_type, actor_name, details, timestamp: Number(timestamp) };
          })
        : [];
      const { events_raw, ...enc } = r;
      return {
        ...enc,
        symptoms:      JSON.parse(enc.symptoms      || '[]'),
        prescriptions: JSON.parse(enc.prescriptions || '[]'),
        clinical_events,
      };
    });
  },

  getUnsyncedInventoryLogs: async () => {
    try { await runQuery(`ALTER TABLE inventory_logs ADD COLUMN is_synced_server INTEGER DEFAULT 0`); } catch (_) {}
    const rows = await getQuery(
      `SELECT * FROM inventory_logs WHERE is_synced_server = 0 OR is_synced_server IS NULL ORDER BY timestamp ASC LIMIT 100`
    );
    return rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  },

  getMedicinesStock: async (stationName) => {
    const rows = await getQuery(
      `SELECT id, name, group_name, unit, stock, batch_number, expiry_date, type
       FROM medicines
       WHERE (station = ? OR station = 'MASTER_DATA') AND batch_number != 'DANH_MUC_GOC'`,
      [stationName]
    );
    return rows;
  },

  markEncountersSynced: async (ids) => {
    if (!ids || !ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    await runQuery(`UPDATE encounters SET is_synced_server = 1 WHERE id IN (${placeholders})`, ids);
  },

  markInventoryLogsSynced: async (ids) => {
    if (!ids || !ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    await runQuery(`UPDATE inventory_logs SET is_synced_server = 1 WHERE id IN (${placeholders})`, ids);
  },

  // Reset toàn bộ lịch sử sync về 0 — dùng khi vừa wipe DB server, cần đẩy lại từ đầu
  resetSyncFlags: async () => {
    try { await runQuery(`ALTER TABLE inventory_logs ADD COLUMN is_synced_server INTEGER DEFAULT 0`); } catch (_) {}
    const enc = await runQuery(`UPDATE encounters     SET is_synced_server = 0`);
    const inv = await runQuery(`UPDATE inventory_logs SET is_synced_server = 0`);
    return {
      encounters:    enc?.changes ?? 0,
      inventoryLogs: inv?.changes ?? 0,
    };
  },

  // === BÁO CÁO THUỐC TỪ SPOKE (Hub nhập về) ===
  importSpokeReport: async ({ id, station, periodType, periodMonth, periodYear, data, fileId }) => {
    // Tránh nhập trùng cùng file
    if (fileId) {
      const existing = await getOne(`SELECT id FROM spoke_medicine_reports WHERE file_id = ?`, [fileId]);
      if (existing) return { duplicate: true };
    }
    await runQuery(
      `INSERT OR REPLACE INTO spoke_medicine_reports
         (id, station, period_type, period_month, period_year, data, imported_at, file_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, station, periodType, periodMonth, periodYear, JSON.stringify(data), Date.now(), fileId || null]
    );
    return { duplicate: false };
  },

  // Lấy trạng thái báo cáo thuốc của các Spoke cho tháng/năm cụ thể
  getSpokeReportStatus: async (periodMonth, periodYear) => {
    const rows = await getQuery(
      `SELECT station, imported_at FROM spoke_medicine_reports
       WHERE period_month = ? AND period_year = ? AND period_type = 'MONTHLY'`,
      [periodMonth, periodYear]
    );
    return rows.map(r => ({ station: r.station, importedAt: r.imported_at }));
  },

  // Lấy dữ liệu báo cáo thuốc của 1 trạm (cho Reports tổng hợp toàn hệ thống)
  getSpokeReportData: async (periodMonth, periodYear) => {
    const rows = await getQuery(
      `SELECT station, data, imported_at FROM spoke_medicine_reports
       WHERE period_month = ? AND period_year = ? AND period_type = 'MONTHLY'
       ORDER BY station`,
      [periodMonth, periodYear]
    );
    return rows.map(r => ({
      station: r.station,
      importedAt: r.imported_at,
      items: JSON.parse(r.data || '[]'),
    }));
  },

  // === NHẬP BỔ SUNG CA KHÁM TỪ EXCEL ===
  importEncountersFromExcel: async (encounters, deductInventory = true) => {
    let inserted = 0;
    for (const enc of encounters) {
      const id = Date.now().toString() + Math.random().toString().slice(2, 6);
      try {
        await runQuery(
          `INSERT OR IGNORE INTO encounters
            (id, patient_id, patient_name, department, station_id, station_name,
             symptoms, diagnosis, disease_group, prescriptions, status,
             start_time, end_time, rest_start_time, is_synced, is_supplementary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
          [
            id,
            enc.patientId,
            enc.patientName,
            enc.department || '',
            enc.stationId || 'unknown',
            enc.stationName || 'Unknown',
            JSON.stringify([]),
            enc.diagnosis || '',
            enc.diseaseGroup || '',
            JSON.stringify(enc.prescriptions || []),
            enc.status,
            enc.startTime,
            enc.endTime,
            enc.restStartTime || null,
          ]
        );
        if (deductInventory) {
          for (const rx of (enc.prescriptions || [])) {
            if (rx.medicineName && rx.quantity > 0) {
              await smartDeductStock(
                rx.medicineName,
                rx.quantity,
                enc.stationName || 'Unknown',
                `Nhập bổ sung từ Excel: ${enc.patientName}`
              );
            }
          }
        }
        inserted++;
      } catch (e) {
        console.warn(`⚠️ Bỏ qua encounter ${enc.patientId}:`, e.message);
      }
    }
    return { success: true, count: inserted };
  },

  // Hub upsert ca khám kéo từ server về local DB (INSERT OR IGNORE → không ghi đè)
  upsertEncountersFromServer: async (encounters) => {
    if (!encounters || encounters.length === 0) return 0;
    let inserted = 0;
    for (const enc of encounters) {
      try {
        const result = await runQuery(
          `INSERT OR IGNORE INTO encounters
            (id, patient_id, patient_name, department, station_id, station_name,
             symptoms, diagnosis, disease_group, instruction, prescriptions, status,
             start_time, end_time, rest_start_time, notes, is_synced_server, is_supplementary)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`,
          [
            enc.id,
            enc.patient_id   || enc.patientId   || '',
            enc.patient_name || enc.patientName  || '',
            enc.department   || '',
            enc.station_id   || enc.stationId    || '',
            enc.station_name || enc.stationName  || '',
            typeof enc.symptoms      === 'string' ? enc.symptoms      : JSON.stringify(enc.symptoms      || []),
            enc.diagnosis     || null,
            enc.disease_group || enc.diseaseGroup || null,
            enc.instruction   || null,
            typeof enc.prescriptions === 'string' ? enc.prescriptions : JSON.stringify(enc.prescriptions || []),
            enc.status        || 'COMPLETED_WORK',
            enc.start_time    || enc.startTime,
            enc.end_time      || enc.endTime      || null,
            enc.rest_start_time || enc.restStartTime || null,
            enc.notes         || null,
          ]
        );
        if (result && result.changes > 0) inserted++;
      } catch (e) {
        console.warn(`⚠️ upsertEncountersFromServer bỏ qua ${enc.id}:`, e.message);
      }
    }
    return inserted;
  },

  // === SYNC PROGRESS: Lấy trạng thái push nhóm theo ngày ===
  getPushStatusByDate: async () => {
    const rows = await getQuery(
      `SELECT
         date(start_time / 1000, 'unixepoch', 'localtime') as date,
         COUNT(*) as total,
         SUM(CASE WHEN is_synced_server = 1 THEN 1 ELSE 0 END) as pushed
       FROM encounters
       WHERE status NOT IN ('WAITING', 'IN_PROGRESS')
       GROUP BY date
       ORDER BY date DESC`
    );
    return rows.map(r => ({
      date:    r.date,
      total:   r.total,
      pushed:  r.pushed || 0,
      pending: r.total - (r.pushed || 0),
    }));
  },

  // === SYNC PROGRESS: Lấy toàn bộ inventory logs chưa sync (cho manual push) ===
  getAllInventoryLogsForSync: async () => {
    try { await runQuery(`ALTER TABLE inventory_logs ADD COLUMN is_synced_server INTEGER DEFAULT 0`); } catch (_) {}
    const rows = await getQuery(
      `SELECT * FROM inventory_logs
       WHERE is_synced_server = 0 OR is_synced_server IS NULL
       ORDER BY timestamp DESC`
    );
    return rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));
  },

  // === SYNC PROGRESS: Lấy toàn bộ ca đã hoàn thành, chưa sync, DESC để push mới nhất trước ===
  getAllCompletedForSync: async () => {
    try { await runQuery(`ALTER TABLE encounters ADD COLUMN is_synced_server INTEGER DEFAULT 0`); } catch (_) {}
    const rows = await getQuery(
      `SELECT e.*, GROUP_CONCAT(ce.id||'|'||ce.action_type||'|'||ce.actor_name||'|'||ce.details||'|'||ce.timestamp, ';;') as events_raw
       FROM encounters e
       LEFT JOIN clinical_events ce ON ce.encounter_id = e.id
       WHERE e.status NOT IN ('WAITING', 'IN_PROGRESS')
         AND (e.is_synced_server = 0 OR e.is_synced_server IS NULL)
       GROUP BY e.id
       ORDER BY e.start_time DESC`
    );
    return rows.map(r => {
      const clinical_events = r.events_raw
        ? r.events_raw.split(';;').map(s => {
            const [id, action_type, actor_name, details, timestamp] = s.split('|');
            return { id, action_type, actor_name, details, timestamp: Number(timestamp) };
          })
        : [];
      const { events_raw, ...enc } = r;
      return {
        ...enc,
        symptoms:       JSON.parse(enc.symptoms      || '[]'),
        prescriptions:  JSON.parse(enc.prescriptions || '[]'),
        clinical_events,
      };
    });
  },

  // === RESET DỮ LIỆU ===
  resetData: async (type) => {
    // type: 'MEDICINE' | 'SUPPLY' | 'ALL'
    if (type === 'MEDICINE') {
      await runQuery(`DELETE FROM medicines WHERE type = 'MEDICINE' OR type IS NULL`);
      await runQuery(`DELETE FROM inventory_logs`);
      await runQuery(`DELETE FROM import_history`);
    } else if (type === 'SUPPLY') {
      await runQuery(`DELETE FROM medicines WHERE type = 'SUPPLY'`);
      await runQuery(`DELETE FROM inventory_logs`);
      await runQuery(`DELETE FROM import_history`);
    } else if (type === 'ALL') {
      await runQuery(`DELETE FROM medicines`);
      await runQuery(`DELETE FROM inventory_logs`);
      await runQuery(`DELETE FROM import_history`);
      await runQuery(`DELETE FROM encounters`);
      await runQuery(`DELETE FROM clinical_events`);
    }
    return true;
  }
};