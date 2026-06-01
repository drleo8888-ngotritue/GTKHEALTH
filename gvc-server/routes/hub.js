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

module.exports = router;
