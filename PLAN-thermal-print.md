# Kế hoạch: Tính năng In Hướng Dẫn Dùng Thuốc (Máy in nhiệt)

> **Trạng thái:** Chờ setup máy in — chưa triển khai
> **Ngày lập kế hoạch:** 22/03/2026

---

## Mô tả tính năng

Sau khi bác sĩ/y tá hoàn tất kê đơn và bấm **"Về làm việc"**, app sẽ hiện modal hỏi:

> *"Bạn có muốn in hướng dẫn dùng thuốc cho bệnh nhân không?"*
> - **Có** → Tự động in theo mẫu có sẵn ra máy in nhiệt
> - **Không / Cancel** → Kết thúc bình thường, không in

---

## Cần xác nhận từ người dùng (trước khi triển khai)

- [ ] **Khổ giấy máy in nhiệt:** 58mm hay 80mm?
- [ ] **Cổng kết nối máy in:** USB / Bluetooth / Network?
- [ ] **Quản lý phác đồ mẫu:** Thêm `usage` trực tiếp vào `constants.ts`, hay tạo màn hình quản lý phác đồ riêng trong Admin?

---

## Phân tích hiện trạng

- Trường `usage?: string` đã có trong `Encounter.prescriptions[]` ([types.ts](types.ts)) nhưng chưa có UI nhập và chưa được lưu từ [Clinical.tsx](components/Clinical.tsx)
- `Protocol.medicines[]` hiện chỉ có `medicineId` + `quantity`, chưa có `usage`
- Không có bất kỳ chức năng in nào trong app

---

## Nhóm thay đổi cần làm (3 nhóm)

### Nhóm 1 — Thêm trường "Cách dùng" vào kê đơn

**File ảnh hưởng:** `types.ts`, `components/Clinical.tsx`, `constants.ts`

- Trong `Clinical.tsx`: mỗi dòng thuốc trong bảng kê đơn thêm 1 input nhỏ cho "Cách dùng"
  VD: `Sáng 1 viên - Tối 1 viên`
- Trong phác đồ mẫu (`Protocol`): thêm trường `usage` cho từng thuốc — khi áp dụng phác đồ thì `usage` tự điền vào đơn
- Cập nhật `types.ts`: thêm `usage?: string` vào `Protocol.medicines[]`

---

### Nhóm 2 — Modal xác nhận in (Frontend — `Clinical.tsx`)

**Luồng mới khi bấm "Về làm việc":**

```
[Bấm "Về làm việc"]
    → Lưu bệnh án vào DB (như cũ)
    → Nếu có thuốc trong đơn → Hiện modal xác nhận:

        ┌─────────────────────────────────┐
        │ 🖨️ In hướng dẫn dùng thuốc?    │
        │                                 │
        │ Bệnh nhân: NGUYEN VAN A         │
        │ Mã NV: 12345 | Trạm: E4         │
        │ Chẩn đoán: Viêm đường hô hấp   │
        │                                 │
        │ • Paracetamol 500mg   10 viên   │
        │   → Sáng 1v, Tối 1v sau ăn     │
        │ • Ambroxol             6 viên   │
        │   → Ngày 2 lần, 1 viên/lần     │
        │                                 │
        │  [✕ Không in]  [🖨️ In ngay]   │
        └─────────────────────────────────┘

    → "In ngay"   → gọi IPC → in ra máy in nhiệt
    → "Không in"  → kết thúc bình thường
```

**State mới cần thêm vào `Clinical.tsx`:**
```typescript
const [showPrintModal, setShowPrintModal] = useState(false);
const [pendingPrintData, setPendingPrintData] = useState<PrintData | null>(null);
```

---

### Nhóm 3 — In thực tế (Electron Backend)

#### Lựa chọn kỹ thuật

**Cách 1 — `electron-pos-printer`** ✅ Khuyến nghị
- Package chuyên biệt cho máy in nhiệt POS trong Electron
- Hỗ trợ khổ giấy 58mm và 80mm
- Định nghĩa template bằng JSON, không cần viết ESC/POS bytes thủ công
- Chọn đúng tên máy in, tránh nhầm sang máy in văn phòng
- Cài thêm: `npm install electron-pos-printer`

**Cách 2 — Electron built-in `webContents.print()`** (không cần cài thêm)
- Tạo BrowserWindow ẩn, load HTML receipt, gọi `.print()`
- Nhược điểm: dễ bị chọn nhầm máy in, cần cấu hình Windows đúng

#### IPC cần thêm

**`preload.js`:**
```javascript
printMedInstruction: (data) => ipcRenderer.invoke('app:print-med-instruction', data),
```

**`main.js`:**
```javascript
ipcMain.handle('app:print-med-instruction', async (event, data) => {
  // Dùng electron-pos-printer hoặc hidden BrowserWindow + webContents.print()
  // data gồm: patientName, patientId, diagnosis, prescriptions[], actorName, stationName, date
});
```

**`types.ts`** — thêm vào `window.electron`:
```typescript
printMedInstruction: (data: PrintInstructionData) => Promise<{ success: boolean; message?: string }>;
```

---

## Template phiếu hướng dẫn (nội dung in ra)

```
================================
      GOERTEK VINACARE
  HƯỚNG DẪN DÙNG THUỐC / 用药指导
================================
Bệnh nhân : NGUYEN VAN A
Mã NV     : 12345
Trạm      : E4
Ngày      : 22/03/2026 - 09:35
Chẩn đoán : Viêm đường hô hấp trên
--------------------------------
1. Paracetamol 500mg      10 viên
   → Sáng 1v, Tối 1v sau ăn
2. Ambroxol 30mg           6 viên
   → Ngày 2 lần, 1 viên/lần
--------------------------------
⚠ Uống đủ liều, đúng giờ
⚠ Uống nhiều nước
⚠ Tái khám nếu không đỡ sau 3 ngày
================================
Y tá kê đơn: PHAN THI LOAN
================================
```

---

## Thứ tự triển khai (khi sẵn sàng)

1. Xác nhận thông số máy in (khổ giấy, cổng kết nối)
2. Cài `electron-pos-printer`: `npm install electron-pos-printer`
3. Thêm trường `usage` vào UI kê đơn (`Clinical.tsx`) và phác đồ mẫu
4. Tạo `PrintConfirmModal` component
5. Sửa `finishEncounter()` trong `Clinical.tsx` để show modal sau khi lưu
6. Thêm IPC handler `app:print-med-instruction` vào `main.js`
7. Expose `printMedInstruction` trong `preload.js`
8. Test với máy in thực tế
9. Đóng gói patch file và deploy

---

## Files sẽ bị ảnh hưởng

| File | Thay đổi |
|---|---|
| `components/Clinical.tsx` | Thêm usage input, modal xác nhận in, sửa `finishEncounter()` |
| `types.ts` | Thêm `usage` vào `Protocol.medicines[]`, thêm `PrintInstructionData` interface, expose `printMedInstruction` |
| `constants.ts` | Thêm `usage` vào các phác đồ mẫu |
| `main.js` | Thêm IPC handler `app:print-med-instruction` |
| `preload.js` | Expose `printMedInstruction` |
| `package.json` | Thêm dependency `electron-pos-printer` |