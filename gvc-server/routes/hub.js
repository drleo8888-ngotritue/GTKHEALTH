// Routes chỉ dành cho HUB — đọc dữ liệu tổng hợp từ tất cả Spoke
const router = require('express').Router();
const db = require('../db');

// GET /api/hub/encounters?from=<unix_ms>&to=<unix_ms>&station_id=<id>
router.get('/encounters', async (req, res) => {
  try {
    const { from, to, station_id } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (from)       { where += ' AND start_time >= ?'; params.push(Number(from)); }
    if (to)         { where += ' AND start_time <= ?'; params.push(Number(to)); }
    if (station_id) { where += ' AND station_id = ?';  params.push(station_id); }

    const rows = await db.all(
      `SELECT * FROM encounters ${where} ORDER BY start_time DESC LIMIT 5000`,
      params
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        symptoms:      JSON.parse(r.symptoms      || '[]'),
        prescriptions: JSON.parse(r.prescriptions || '[]'),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/encounters/:id/events — timeline của 1 ca khám
router.get('/encounters/:id/events', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM clinical_events WHERE encounter_id = ? ORDER BY timestamp ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/inventory/stock?station_id=<id>
router.get('/inventory/stock', async (req, res) => {
  try {
    const { station_id } = req.query;
    const params = [];
    let where = '';

    if (station_id) { where = 'WHERE station_id = ?'; params.push(station_id); }

    const rows = await db.all(
      `SELECT * FROM medicines_stock ${where} ORDER BY station_id, name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/inventory/logs?from=<unix_ms>&to=<unix_ms>&station_id=<id>
router.get('/inventory/logs', async (req, res) => {
  try {
    const { from, to, station_id } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (from)       { where += ' AND timestamp >= ?'; params.push(Number(from)); }
    if (to)         { where += ' AND timestamp <= ?'; params.push(Number(to)); }
    if (station_id) { where += ' AND station_id = ?'; params.push(station_id); }

    const rows = await db.all(
      `SELECT * FROM inventory_logs ${where} ORDER BY timestamp DESC LIMIT 5000`,
      params
    );

    res.json({
      success: true,
      data: rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/summary?from=<unix_ms>&to=<unix_ms> — tổng hợp nhanh
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (from) { where += ' AND start_time >= ?'; params.push(Number(from)); }
    if (to)   { where += ' AND start_time <= ?'; params.push(Number(to)); }

    const [total, byStation, byDisease] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM encounters ${where}`, params),
      db.all(
        `SELECT station_name, COUNT(*) as count FROM encounters ${where} GROUP BY station_name ORDER BY count DESC`,
        params
      ),
      db.all(
        `SELECT disease_group, COUNT(*) as count FROM encounters ${where} WHERE disease_group IS NOT NULL GROUP BY disease_group ORDER BY count DESC LIMIT 10`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: {
        total_encounters: total?.count || 0,
        by_station:       byStation,
        by_disease_group: byDisease,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/medicine-reports?period_month=&period_year= — Hub kiểm tra trạm nào đã nộp
router.get('/medicine-reports', async (req, res) => {
  try {
    const { period_month, period_year } = req.query;
    if (!period_month || !period_year) {
      return res.status(400).json({ success: false, message: 'Thiếu period_month hoặc period_year' });
    }
    const rows = await db.all(
      `SELECT station, submitted_at FROM spoke_medicine_reports
       WHERE period_month = ? AND period_year = ? AND period_type = 'MONTHLY'`,
      [Number(period_month), Number(period_year)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/medicine-reports/data?period_month=&period_year= — Hub lấy dữ liệu đầy đủ
router.get('/medicine-reports/data', async (req, res) => {
  try {
    const { period_month, period_year } = req.query;
    if (!period_month || !period_year) {
      return res.status(400).json({ success: false, message: 'Thiếu period_month hoặc period_year' });
    }
    const rows = await db.all(
      `SELECT station, data, submitted_at FROM spoke_medicine_reports
       WHERE period_month = ? AND period_year = ? AND period_type = 'MONTHLY'
       ORDER BY station`,
      [Number(period_month), Number(period_year)]
    );
    res.json({
      success: true,
      data: rows.map(r => ({
        station: r.station,
        importedAt: r.submitted_at,
        items: JSON.parse(r.data || '[]'),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hub/transfers — Hub tạo phiếu điều chuyển thuốc
router.post('/transfers', async (req, res) => {
  try {
    const { id, source_station, target_station, created_by, medicines, note } = req.body;
    if (!target_station || !Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu trạm nhận hoặc danh sách thuốc' });
    }
    const transferId = id || require('crypto').randomUUID();
    await db.run(
      `INSERT INTO pending_transfers
         (id, source_station, target_station, created_at, created_by, status, medicines, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [transferId, source_station, target_station, Date.now(),
       created_by || null, 'PENDING', JSON.stringify(medicines), note || null]
    );
    res.json({ success: true, id: transferId, message: `Đã tạo phiếu điều chuyển đến ${target_station}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hub/transfers?source_station= — Hub xem danh sách phiếu đã tạo
router.get('/transfers', async (req, res) => {
  try {
    const { source_station } = req.query;
    let sql = `SELECT * FROM pending_transfers ORDER BY created_at DESC LIMIT 100`;
    const params = [];
    if (source_station) {
      sql = `SELECT * FROM pending_transfers WHERE source_station = ? ORDER BY created_at DESC LIMIT 100`;
      params.push(source_station);
    }
    const rows = await db.all(sql, params);
    res.json({
      success: true,
      data: rows.map(r => ({ ...r, medicines: JSON.parse(r.medicines || '[]') })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/hub/protocols — Hub đồng bộ phác đồ lên server (bulk upsert)
router.post('/protocols', async (req, res) => {
  try {
    const { protocols } = req.body;
    if (!Array.isArray(protocols) || protocols.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu danh sách phác đồ' });
    }
    const now = Date.now();
    for (const p of protocols) {
      await db.run(
        `INSERT OR REPLACE INTO protocols (id, name, diagnosis, disease_group, medicines, is_approved, updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [p.id, p.name, p.diagnosis || '', p.diseaseGroup || p.disease_group || '',
         JSON.stringify(p.medicines || []), p.isApproved ? 1 : 0, now]
      );
    }
    console.log(`✅ Hub đồng bộ ${protocols.length} phác đồ lên server`);
    res.json({ success: true, count: protocols.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
