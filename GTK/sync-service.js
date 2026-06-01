const nodemailer = require('nodemailer');
const imap = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const dbService = require('./db-service');

// --- CẤU HÌNH CHUNG ---
const EMAIL_CONFIG = {
    user: 'drleo888@gmail.com',
    password: 'ldom likf ucen mapu', // <--- Đảm bảo mật khẩu đúng
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    // THÊM DÒNG NÀY ĐỂ SỬA LỖI "SELF SIGNED CERTIFICATE"
    tlsOptions: { rejectUnauthorized: false }, 
    authTimeout: 10000 
};

const ENCRYPTION_KEY = crypto.scryptSync('vnp-secret-key-2025', 'salt', 32);
const IV = Buffer.alloc(16, 0);

// Hàm mã hóa
function encryptData(data) {
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// Hàm giải mã
function decryptData(encryptedHex) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        console.error("Lỗi giải mã:", e);
        return null;
    }
}

module.exports = {
    // === CHỨC NĂNG 1: GỬI ĐI (SPOKE) ===
    performSync: async () => {
        try {
            console.log('[Sync-Send] Đang chuẩn bị gửi...');
            const data = await dbService.getUnsyncedData();
            
            if ((!data.encounters || data.encounters.length === 0)) {
                return { success: true, message: "Nothing to sync" };
            }

            const encryptedContent = encryptData(data);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `SYNC_DATA_${timestamp}.dat`;
            const tempFilePath = path.join(os.tmpdir(), fileName);
            fs.writeFileSync(tempFilePath, encryptedContent);

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.password }
            });

            await transporter.sendMail({
                from: EMAIL_CONFIG.user,
                to: EMAIL_CONFIG.user,
                subject: `[Y TẾ] Dữ liệu đồng bộ - ${new Date().toLocaleString()}`,
                text: `Dữ liệu từ Spoke. Số ca: ${data.encounters.length}`,
                attachments: [{ filename: fileName, path: tempFilePath }]
            });

            fs.unlinkSync(tempFilePath);
            await dbService.markAsSynced(data);
            
            return { success: true, message: "Sync Success" };
        } catch (error) {
            console.error('[Sync-Send] Lỗi:', error);
            return { success: false, message: error.message };
        }
    },

    // === CHỨC NĂNG 2: NHẬN VỀ (HUB) ===
    fetchAndMerge: async () => {
        console.log('[Sync-Fetch] Đang kết nối IMAP...');
        let connection = null;
        try {
            // Kết nối với cấu hình đã bỏ qua lỗi SSL
            connection = await imap.connect({ imap: EMAIL_CONFIG });
            await connection.openBox('INBOX');

            // Tìm thư chưa đọc có tiêu đề [Y TẾ]
            const searchCriteria = ['UNSEEN', ['HEADER', 'SUBJECT', '[Y TẾ]']];
            const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: true };
            const messages = await connection.search(searchCriteria, fetchOptions);

            if (messages.length === 0) return { success: true, count: 0, message: "No new reports" };

            let totalImported = 0;
            console.log(`[Sync-Fetch] Tìm thấy ${messages.length} email mới.`);

            for (const item of messages) {
                const all = item.parts.find(part => part.which === '');
                const id = item.attributes.uid;
                const idHeader = "Imap-Id: " + id + "\r\n";
                const mail = await simpleParser(idHeader + all.body);

                if (mail.attachments) {
                    for (const att of mail.attachments) {
                        if (att.filename.endsWith('.dat')) {
                            console.log(' -> Đang xử lý file:', att.filename);
                            const cleanData = decryptData(att.content.toString('utf8'));
                            if (cleanData) {
                                // Gọi DB để lưu vào
                                const count = await dbService.importSyncedData(cleanData);
                                totalImported += count;
                            }
                        }
                    }
                }
            }
            return { success: true, count: totalImported, message: `Imported ${totalImported}` };
        } catch (error) {
            console.error('[Sync-Fetch] Lỗi:', error);
            throw error; // Ném lỗi để main.js bắt được
        } finally {
            if (connection) {
                try { connection.end(); } catch(e) {}
            }
        }
    }
};