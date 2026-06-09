// Routes dành riêng cho Spoke — nhận phiếu điều chuyển từ Hub
const router = require('express').Router();
const db = require('../db');

// GET /api/spoke/transfers/pending?station_name= — Spoke hỏi có phiếu nào chờ không
router.get('/transfers/pending', async (req, res) => {
  try {
    const { station_name } = req.query;
    if (!station_name) {
      return res.status(400).json({ success: false, message: 'Thiếu station_name' });
    }
    const rows = await db.all(
      `SELECT * FROM pending_transfers
       WHERE target_station = ? AND status = 'PENDING'
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

// POST /api/spoke/transfers/:id/confirm — Spoke xác nhận đã nhận
router.post('/transfers/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run(
      `UPDATE pending_transfers SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
    res.json({ success: true, message: `Phiếu ${id} đã được xác nhận` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
