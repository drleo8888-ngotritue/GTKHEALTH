require('dotenv').config();
const API_KEY = process.env.API_KEY || '';

module.exports = (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const key = header.replace('Bearer ', '').trim();
  if (!API_KEY || key !== API_KEY) {
    return res.status(401).json({ success: false, message: 'API Key không hợp lệ' });
  }
  next();
};
