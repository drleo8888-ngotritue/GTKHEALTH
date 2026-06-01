require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',   require('./routes/auth'));
app.use('/api/health', require('./routes/health'));
app.use('/api/chat',   require('./routes/chat'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi tạo DB (async, 1 lần) rồi mới listen
db.init().then(() => {
  app.listen(config.PORT, () => {
    console.log(`✅ GVC Employee Portal đang chạy tại http://localhost:${config.PORT}`);
    console.log(`   Database  : ${config.DB_PATH}`);
    console.log(`   Gemini AI : ${config.GEMINI_API_KEY ? '✅ Đã cấu hình' : '❌ Chưa cấu hình — chatbot sẽ không hoạt động'}`);
  });
}).catch(err => {
  console.error('❌ Khởi động thất bại:', err.message);
  process.exit(1);
});
