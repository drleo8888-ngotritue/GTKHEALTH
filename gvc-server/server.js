require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const db      = require('./db');
const auth    = require('./middleware/auth');
const { auditMiddleware } = require('./audit-log');

const app  = express();
const PORT = process.env.PORT || 3500;

// CORS — cho phép Electron (file://) và localhost
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));

// Request logger (console — xem nhanh khi chạy)
app.use((req, _res, next) => {
  const t = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${t}] ${req.method} ${req.path}`);
  next();
});

// Nhật ký audit ra file CSV theo ngày (mở bằng Excel) — ghi cả lệnh chưa qua auth
app.use(auditMiddleware);

// Health check — không cần auth
app.use('/api/ping', require('./routes/ping'));

// Tất cả routes còn lại yêu cầu API Key
app.use('/api/sync',  auth, require('./routes/sync'));
app.use('/api/hub',   auth, require('./routes/hub'));
app.use('/api/spoke', auth, require('./routes/spoke'));
app.use('/api/admin', auth, require('./routes/admin'));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route không tồn tại: ${req.method} ${req.path}` });
});

// Khởi động
db.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ GVC Server đang chạy tại http://0.0.0.0:${PORT}`);
    console.log(`   Ping test: http://localhost:${PORT}/api/ping`);
  });
}).catch(err => {
  console.error('❌ Lỗi khởi tạo DB:', err);
  process.exit(1);
});
