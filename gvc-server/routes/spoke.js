// Routes dành riêng cho Spoke — nhận phiếu điều chuyển từ Hub
const router = require('express').Router();
const db = require('../db');

// GET /api/spoke/transfers/pending?station_name= — phiếu CHƯA nhận xong (PENDING + ACKNOWLEDGED)
router.get('/transfers/pending', async (req, res) => {
  try {
    const { station_name } = req.query;
    if (!station_name) {
      return res.status(400).json({ success: false, message: 'Thiếu station_name' });
    }
    const rows = await db.all(
      `SELECT * FROM pending_transfers
       WHERE target_station = ? AND status IN ('PENDING','ACKNOWLEDGED')
       ORDER BY created_at ASC`,
      [station_name]
    );
    res.json({
      success: true,
      data: rows.map(r => ({ ...r, medicines: JSON.parse(r.medicines || '[]') })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/spoke/transfers/:id/ack — app trạm nhận đã TIẾP NHẬN phiếu (đang vận chuyển)
router.post('/transfers/:id/ack', async (req, res) => {
  try {
    await db.run(
      `UPDATE pending_transfers SET status = 'ACKNOWLEDGED', acknowledged_at = ?
       WHERE id = ? AND status = 'PENDING'`,
      [Date.now(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/spoke/transfers/:id/confirm — nhân viên trạm nhận đã NHẬN ĐỦ THUỐC (nhập kho, hoàn tất)
router.post('/transfers/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run(
      `UPDATE pending_transfers SET status = 'CONFIRMED', confirmed_at = ?
       WHERE id = ? AND status IN ('PENDING','ACKNOWLEDGED')`,
      [Date.now(), id]
    );
    res.json({ success: true, message: `Phiếu ${id} đã xác nhận nhận đủ` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/spoke/protocols — Spoke kéo toàn bộ phác đồ từ server
router.get('/protocols', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM protocols ORDER BY name ASC`);
    res.json({
      success: true,
      data: rows.map(r => ({
        id: r.id, name: r.name, diagnosis: r.diagnosis,
        diseaseGroup: r.disease_group,
        medicines: JSON.parse(r.medicines || '[]'),
        isApproved: r.is_approved === 1,
        updated_at: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
