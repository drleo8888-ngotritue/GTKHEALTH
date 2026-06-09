// Routes nhận PUSH từ Spoke và phục vụ PULL master data
const router = require('express').Router();
const db = require('../db');

// POST /api/sync/encounters
router.post('/encounters', async (req, res) => {
  const { station_id, station_name, records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'records không hợp lệ' });
  }

  const received_ids = [];
  const receivedAt = Date.now();

  for (const enc of records) {
    try {
      await db.run(
        `INSERT OR REPLACE INTO encounters
          (id, patient_id, patient_name, department, station_id, station_name,
           symptoms, status, start_time, end_time, diagnosis, disease_group,
           prescriptions, had_rest_at_room, is_supplementary, received_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          enc.id, enc.patient_id, enc.patient_name, enc.department,
          station_id || enc.station_id, station_name || enc.station_name,
          JSON.stringify(enc.symptoms || []),
          enc.status, enc.start_time, enc.end_time,
          enc.diagnosis || null, enc.disease_group || null,
          JSON.stringify(enc.prescriptions || []),
          enc.had_rest_at_room || 0, enc.is_supplementary || 0,
          receivedAt,
        ]
      );

      // Lưu clinical_events kèm theo
      if (Array.isArray(enc.clinical_events)) {
        for (const ev of enc.clinical_events) {
          await db.run(
            `INSERT OR IGNORE INTO clinical_events (id, encounter_id, action_type, actor_name, details, timestamp)
             VALUES (?,?,?,?,?,?)`,
            [ev.id, enc.id, ev.action_type, ev.actor_name, ev.details, ev.timestamp]
          );
        }
      }

      received_ids.push(enc.id);
    } catch (err) {
      console.error('Lỗi lưu encounter:', enc.id, err.message);
    }
  }

  res.json({ success: true, message: `Đã nhận ${received_ids.length} ca khám`, received_ids });
});

// POST /api/sync/inventory-logs
router.post('/inventory-logs', async (req, res) => {
  const { station_id, station_name, records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'records không hợp lệ' });
  }

  const received_ids = [];
  const receivedAt = Date.now();

  for (const log of records) {
    try {
      await db.run(
        `INSERT OR REPLACE INTO inventory_logs
          (id, type, source, target, items, timestamp, note, actor_name, actor_role,
           station_id, station_name, received_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          log.id, log.type, log.source, log.target,
          JSON.stringify(log.items || []),
          log.timestamp, log.note || null,
          log.actor_name || null, log.actor_role || null,
          station_id || log.station_id, station_name || log.station_name,
          receivedAt,
        ]
      );
      received_ids.push(log.id);
    } catch (err) {
      console.error('Lỗi lưu inventory log:', log.id, err.message);
    }
  }

  res.json({ success: true, message: `Đã nhận ${received_ids.length} giao dịch kho`, received_ids });
});

// POST /api/sync/medicines/stock — snapshot tồn kho từ Spoke
router.post('/medicines/stock', async (req, res) => {
  const { station_id, station_name, snapshot_time, medicines } = req.body;
  if (!Array.isArray(medicines)) {
    return res.status(400).json({ success: false, message: 'medicines không hợp lệ' });
  }

  // Xóa snapshot cũ của trạm này trước khi lưu mới
  await db.run(`DELETE FROM medicines_stock WHERE station_id = ?`, [station_id]);

  for (const med of medicines) {
    try {
      await db.run(
        `INSERT INTO medicines_stock
          (id, station_id, station_name, name, group_name, unit, stock, batch_number, expiry_date, type, snapshot_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `${station_id}_${med.id}`, station_id, station_name,
          med.name, med.group_name, med.unit,
          med.stock || 0, med.batch_number, med.expiry_date,
          med.type, snapshot_time || Date.now(),
        ]
      );
    } catch (err) {
      console.error('Lỗi lưu stock:', med.name, err.message);
    }
  }

  res.json({ success: true, message: `Đã cập nhật tồn kho trạm ${station_name}` });
});

// POST /api/sync/medicine-report — Spoke push báo cáo thuốc tháng lên server
router.post('/medicine-report', async (req, res) => {
  const { station, period_type, period_month, period_year, data } = req.body;
  if (!station || !period_month || !period_year) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin kỳ báo cáo' });
  }
  try {
    const id = `${station}_${period_type || 'MONTHLY'}_${period_year}_${period_month}`;
    await db.run(
      `INSERT OR REPLACE INTO spoke_medicine_reports
         (id, station, period_type, period_month, period_year, data, submitted_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, station, period_type || 'MONTHLY', period_month, period_year,
       JSON.stringify(data || []), Date.now()]
    );
    res.json({ success: true, message: `Đã nhận báo cáo T${period_month}/${period_year} từ ${station}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sync/employees — tất cả trạm kéo về
router.get('/employees', async (req, res) => {
  try {
    const rows = await db.all(`SELECT id_nv, ho_ten, bo_phan FROM employees ORDER BY id_nv`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sync/medicines/master
router.get('/medicines/master', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM medicines_master`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sync/protocols
router.get('/protocols', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM protocols`);
    res.json({ success: true, data: rows.map(r => ({
      ...r,
      symptoms: JSON.parse(r.symptoms || '[]'),
      suggested_medicines: JSON.parse(r.suggested_medicines || '[]'),
    })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sync/symptoms
router.get('/symptoms', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM symptoms`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
