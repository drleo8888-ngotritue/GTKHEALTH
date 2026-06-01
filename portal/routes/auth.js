const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const config = require('../config');
const db = require('../db');

// GET /api/auth/config — public, không cần token
router.get('/config', (req, res) => {
  res.json({ companyName: config.COMPANY_NAME });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập mã nhân viên và mật khẩu' });
  }

  const normalizedId = String(employeeId).trim().toUpperCase();

  // Kiểm tra nhân viên có tồn tại trong hệ thống y tế không
  if (!db.employeeExists(normalizedId)) {
    return res.status(404).json({ error: 'Mã nhân viên không có trong hệ thống y tế. Vui lòng liên hệ trạm y tế.' });
  }

  // Tạo tài khoản portal nếu chưa có (mật khẩu mặc định)
  const user = db.ensureUser(normalizedId);

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Mật khẩu không đúng' });
  }

  db.recordLogin(normalizedId);

  const token = jwt.sign(
    { employeeId: normalizedId, mustChange: user.must_change === 1 },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    mustChange: user.must_change === 1,
    message: user.must_change === 1
      ? 'Đăng nhập thành công. Bạn cần đổi mật khẩu trước khi tiếp tục.'
      : 'Đăng nhập thành công',
  });
});

// POST /api/auth/change-password
const authMiddleware = require('../middleware/auth');
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
  }
  if (newPassword === config.DEFAULT_PASSWORD) {
    return res.status(400).json({ error: 'Không được dùng lại mật khẩu mặc định' });
  }

  const user = db.getUser(req.user.employeeId);
  if (!user) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.updatePassword(req.user.employeeId, newHash);

  const token = jwt.sign(
    { employeeId: req.user.employeeId, mustChange: false },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  res.json({ token, message: 'Đổi mật khẩu thành công' });
});

module.exports = router;
