const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    req.user = payload; // { employeeId, mustChange }
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });
  }
};
