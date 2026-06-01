const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const db = require('../db');

// Tất cả route health đều cần đăng nhập
router.use(authMiddleware);

// Middleware chặn nếu chưa đổi mật khẩu
router.use((req, res, next) => {
  if (req.user.mustChange) {
    return res.status(403).json({ error: 'Vui lòng đổi mật khẩu trước khi xem dữ liệu sức khỏe', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
});

// GET /api/health/summary
// Trả về lịch sử KSK + ca khám gần đây (dữ liệu đầy đủ cho UI, chưa anonymize)
router.get('/summary', (req, res) => {
  const employeeId = req.user.employeeId;
  try {
    const checkups = db.getCheckups(employeeId);
    const encounters = db.getRecentEncounters(employeeId, 6);

    // Parse JSON fields
    const parsedCheckups = checkups.map(c => ({
      ...c,
      exam_details: parseJSON(c.exam_details),
    }));
    const parsedEncounters = encounters.map(e => ({
      ...e,
      prescriptions: parseJSON(e.prescriptions),
      date: e.start_time ? new Date(e.start_time).toLocaleDateString('vi-VN') : null,
    }));

    res.json({ checkups: parsedCheckups, encounters: parsedEncounters });
  } catch (err) {
    console.error('health/summary error:', err);
    res.status(500).json({ error: 'Không thể tải dữ liệu sức khỏe' });
  }
});

function parseJSON(val) {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

module.exports = router;
