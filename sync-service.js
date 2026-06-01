const fs = require('fs');
const crypto = require('crypto');
const dbService = require('./db-service');

const ENCRYPTION_KEY = crypto.scryptSync('vnp-secret-key-2025', 'salt', 32);
const IV = Buffer.alloc(16, 0);

function encryptData(data) {
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decryptData(encryptedHex) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        console.error('[Sync] Loi giai ma:', e.message);
        return null;
    }
}

module.exports = {
    // Expose encrypt/decrypt để main.js dùng trực tiếp khi cần
    encryptPayload: encryptData,
    decryptPayload: decryptData,

    // === SPOKE: Chuan bi payload xuat file lam sang (benh nhan) ===
    prepareClinicalExport: async (stationName) => {
        const unsyncedData = await dbService.getUnsyncedData();
        if (!unsyncedData.encounters || unsyncedData.encounters.length === 0) {
            return { empty: true };
        }
        const fileId = crypto.randomUUID();
        const payload = {
            fileId,
            version: '1.0',
            type: 'CLINICAL_REPORT',
            exportedAt: Date.now(),
            sourceStation: stationName,
            data: unsyncedData
        };
        return {
            encrypted: encryptData(payload),
            fileId,
            payload,
            count: unsyncedData.encounters.length
        };
    },

    // === HUB: Xu ly file lam sang nhan ve ===
    processClinicalImport: async (fileContent) => {
        const payload = decryptData(fileContent);
        if (!payload || payload.type !== 'CLINICAL_REPORT') {
            return { success: false, message: 'File khong hop le hoac sai dinh dang.' };
        }

        const alreadyImported = await dbService.checkFileExists(payload.fileId);
        if (alreadyImported) {
            return {
                success: false,
                duplicate: true,
                message: `File nay da duoc nhap truoc do! (Tram: ${payload.sourceStation})`
            };
        }

        const count = await dbService.importSyncedData(payload.data);

        await dbService.saveFileImportHistory({
            fileId: payload.fileId,
            fileName: `CLINICAL_${payload.sourceStation}_${new Date(payload.exportedAt).toLocaleDateString('vi-VN')}`,
            importType: 'CLINICAL_REPORT',
            sourceStation: payload.sourceStation,
            timestamp: Date.now()
        });

        return { success: true, count, sourceStation: payload.sourceStation };
    },

    // === HUB: Chuan bi payload xuat danh muc thuoc ===
    prepareMedicineExport: async (sourceStation) => {
        const medicines = await dbService.getMedicinesForExport();
        if (!medicines || medicines.length === 0) {
            return { empty: true };
        }
        const fileId = crypto.randomUUID();
        const payload = {
            fileId,
            version: '1.0',
            type: 'MEDICINE_CATALOG',
            exportedAt: Date.now(),
            sourceStation: sourceStation || 'HUB',
            data: { medicines }
        };
        return {
            encrypted: encryptData(payload),
            fileId,
            count: medicines.length
        };
    },

    // === SPOKE: Xu ly file danh muc thuoc nhan ve ===
    processMedicineImport: async (fileContent, targetStation) => {
        const payload = decryptData(fileContent);
        if (!payload || payload.type !== 'MEDICINE_CATALOG') {
            return { success: false, message: 'File khong hop le hoac sai dinh dang thuoc.' };
        }

        const alreadyImported = await dbService.checkFileExists(payload.fileId);
        if (alreadyImported) {
            return {
                success: false,
                duplicate: true,
                message: 'File danh muc thuoc nay da duoc nhap truoc do!'
            };
        }

        let count = 0;
        for (const med of payload.data.medicines) {
            try {
                await dbService.importMedicine({ ...med, skipLog: true }, targetStation);
                count++;
            } catch (e) {
                console.error('[Sync] Loi import thuoc:', med.name, e.message);
            }
        }

        await dbService.saveFileImportHistory({
            fileId: payload.fileId,
            fileName: `MEDICINE_${new Date(payload.exportedAt).toLocaleDateString('vi-VN')}`,
            importType: 'MEDICINE_CATALOG',
            sourceStation: payload.sourceStation,
            timestamp: Date.now()
        });

        return { success: true, count };
    }
};
