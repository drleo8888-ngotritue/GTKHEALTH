require('dotenv').config();

module.exports = {
  DB_PATH: process.env.DB_PATH || '',
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD || 'Goertek@2024',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  COMPANY_NAME: process.env.COMPANY_NAME || 'Goertek Vina',
};
