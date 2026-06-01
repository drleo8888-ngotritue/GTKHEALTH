# GoertekVinaCare Smart Medical

> **Hệ thống Quản lý Y tế Thông minh** dành cho phòng khám y tế nội bộ khu công nghiệp  
> **智能医疗管理系统** — Desktop App đa trạm, offline-first, đồng bộ qua file `.dat` USB

**Version:** 1.26.04.23 · Electron 40 + React 19 + SQLite · 2026

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc kỹ thuật](#2-kiến-trúc-kỹ-thuật)
3. [Topology mạng lưới trạm (HUB–SPOKE)](#3-topology-mạng-lưới-trạm-hubspoke)
4. [Luồng dữ liệu tổng thể](#4-luồng-dữ-liệu-tổng-thể)
5. [Phân quyền người dùng](#5-phân-quyền-người-dùng)
6. [Mô hình dữ liệu](#6-mô-hình-dữ-liệu)
7. [Các Module chức năng](#7-các-module-chức-năng)
8. [Cơ chế đồng bộ dữ liệu (File .dat)](#8-cơ-chế-đồng-bộ-dữ-liệu-file-dat)
9. [Cơ sở dữ liệu SQLite](#9-cơ-sở-dữ-liệu-sqlite)
10. [Hướng dẫn cài đặt & khởi chạy](#10-hướng-dẫn-cài-đặt--khởi-chạy)
11. [Cấu hình trạm lần đầu](#11-cấu-hình-trạm-lần-đầu)
12. [Lịch vận hành tháng](#12-lịch-vận-hành-tháng)

---

## 1. Tổng quan hệ thống

**GoertekVinaCare Smart Medical** là ứng dụng desktop (Electron) quản lý toàn bộ hoạt động y tế nội bộ cho nhà máy GoertekVina. Hệ thống hỗ trợ **song ngữ Việt–Trung** và vận hành **offline-first** tại nhiều phòng y tế (trạm), với đồng bộ dữ liệu về trung tâm qua file `.dat` mã hóa AES-256 (USB hoặc thư mục chia sẻ).

### Đối tượng sử dụng

| Đối tượng | Vai trò trong hệ thống |
|---|---|
| **Nhân viên y tế (STAFF)** | Tiếp nhận, khám, kê đơn, xem báo cáo |
| **Trưởng trạm (MODERATOR)** | STAFF + quản lý trạm, xem toàn bộ cấu hình |
| **Quản trị viên (ADMIN)** | MODERATOR + reset trạm, xóa ca khám |
| **Nhân viên nhà máy** | Tự khai báo triệu chứng qua màn hình Kiosk (không đăng nhập) |

### Bối cảnh nghiệp vụ

- Nhà máy có nhiều phòng y tế (A6, C6, D4…) và 1 phòng trung tâm (**E4 — HUB**)
- Mỗi phòng là một **Spoke** độc lập, không cần internet
- Cuối ca / cuối tháng, mỗi Spoke xuất file `.dat` mã hóa → USB → HUB tổng hợp

---

## 2. Kiến trúc kỹ thuật

```
┌──────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                      │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │  main.js   │  │ db-service.js │  │   sync-service.js    │ │
│  │ IPC Router │◄─│ SQLite CRUD   │  │ Mã hóa AES-256-CBC   │ │
│  │ App Window │  │ FEFO Algorithm│  │ Xuất/nhập file .dat  │ │
│  └─────┬──────┘  └───────────────┘  └──────────────────────┘ │
│        │ IPC invoke/handle                                     │
└────────┼─────────────────────────────────────────────────────┘
         │ contextBridge (preload.js)
┌────────┼─────────────────────────────────────────────────────┐
│        ▼        ELECTRON RENDERER (React + Vite)              │
│  App.tsx (HashRouter)                                         │
│  ├── Route "/"       → MainApp: Login → Layout → Tabs         │
│  └── Route "/kiosk"  → StandaloneKioskWrapper (no login)      │
│                                                               │
│  Tabs: Dashboard │ Clinical │ Inventory │ Reports │ Admin     │
│  Components: RestMonitor │ NotificationBell │ SyncControl     │
│  Services: storage.ts (LocalStorage — config + nhân viên)     │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Tầng | Công nghệ | Mục đích |
|---|---|---|
| Desktop Shell | Electron 40 | App đa nền tảng, IPC, cửa sổ |
| Frontend | React 19 + TypeScript 5.8 | UI framework |
| Build | Vite 6 | Dev server + production build |
| Styling | Tailwind CSS 3 + Be Vietnam Pro (bundled) | UI + font tiếng Việt offline |
| Database | SQLite3 5 | Local DB, không cần server |
| Charts | Recharts 3 | Biểu đồ thống kê |
| Excel | SheetJS (xlsx) | Xuất báo cáo, nhập danh sách nhân viên |
| Mã hóa | Node.js crypto (built-in) | AES-256-CBC file đồng bộ |

---

## 3. Topology mạng lưới trạm (HUB–SPOKE)

```
                   ┌──────────────────────┐
                   │      E4 (HUB)         │
                   │  Phòng Y tế Trung tâm │
                   │  • Nhận file .dat USB  │
                   │  • Báo cáo toàn hệ    │
                   │  • Phân phối thuốc    │
                   └──────────┬───────────┘
                              │  File .dat (AES-256)
             ┌────────────────┼─────────────────┐
             ▼                ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  A6 (SPOKE)  │  │  D4 (SPOKE)  │  │  C6 (SPOKE)  │
    │  + Kiosk     │  │  + Kiosk     │  │  + Kiosk     │
    │  (Offline)   │  │  (Offline)   │  │  (Offline)   │
    └──────────────┘  └──────────────┘  └──────────────┘
```

| Loại trạm | Chức năng đặc biệt |
|---|---|
| **HUB (E4)** | Xem báo cáo đa trạm, nhận file `.dat` từ Spoke, xuất danh mục thuốc xuống Spoke |
| **SPOKE (A6, D4, C6…)** | Hoạt động độc lập, xuất file báo cáo ca khám + báo cáo thuốc lên HUB |

---

## 4. Luồng dữ liệu tổng thể

### 4.1 Luồng đăng ký — khám — kết thúc ca

```
[Nhân viên nhà máy]
        │
        ▼
  Kiosk (cửa sổ riêng)              ──hoặc──    Clinical (nhập tay)
  Quẹt thẻ RFID / nhập mã NV                    Y tá thêm bệnh nhân thủ công
  Chọn triệu chứng (song ngữ)                   storage.findPatient() → lookup
  storage.findPatient() → lookup                 Nếu chưa có → modal đăng ký
  Nếu không tìm thấy → màn hình lỗi
        │                                                   │
        └──────────────────────┬────────────────────────────┘
                               ▼
                   Encounter tạo trong SQLite
                   status = WAITING
                   symptoms[] lưu dạng "Tên VI (中文)"
                   stationId / stationName gắn với trạm hiện tại
                               │
                    [Clinical Tab — auto-reload 5s]
                               │
                               ▼
                   Y tá chọn bệnh nhân
                   status → IN_PROGRESS
                               │
                   ┌───────────────────────┐
                   │  Workspace khám bệnh  │
                   │  • Nhập chẩn đoán     │
                   │  • Chọn nhóm bệnh     │
                   │  • Kê đơn thuốc       │
                   │    (fuzzy search,      │
                   │     kiểm tra tồn kho)  │
                   │  • Áp phác đồ 1-click │
                   └───────────┬───────────┘
                               │
                     ┌─────────┴──────────┐
                     ▼                    ▼
              Về làm việc          Nghỉ / Theo dõi
              COMPLETED_WORK       REST_30 / MONITOR
              COMPLETED_TRANSFER   restStartTime = now()
                     │                    │
                     └─────────┬──────────┘
                               ▼
                   Kho tự động trừ (thuật toán FEFO)
                   is_synced = 0 (chờ đồng bộ)
                   clinical_events ghi audit log
```

### 4.2 Luồng danh sách nhân viên (hai nguồn độc lập)

```
NGUỒN 1 — Import ca khám từ Excel (ExcelEncounterImport)
  File Excel chứa: MãNV + HọTên (không có bộ phận)
        │
        ▼
  Wizard bước 1: Chọn file
  Wizard bước 2: Chọn có trừ kho hay không
                  ├── "Có — nhập thuốc vào kho" → deductInventory = true
                  └── "Không — chỉ ghi nhận"   → deductInventory = false
  Wizard bước 3: Mapping cột
  Wizard bước 4: Xem trước & Nhập
        │
        ▼
  Auto-add nhân viên mới vào localStorage:
    { id: maNV, name: hoTen, department: '' }   ← department để trống
  (chỉ thêm ID chưa từng xuất hiện, không ghi đè ID cũ)
        │
        ▼
  Encounter lưu SQLite (kể cả BN không có trong danh mục)

NGUỒN 2 — Import danh sách nhân viên hàng tháng (Admin tab)
  File Excel chứa: id_nv + ho_ten + bp (bộ phận)
        │
        ▼
  Upsert theo ID:
    ID mới   → thêm mới với đầy đủ id + name + department
    ID cũ khác thông tin → cập nhật name + department theo file mới
    ID cũ giống hệt → bỏ qua
        │
        ▼
  Feedback: "X mới thêm / Y cập nhật / Z không thay đổi"

QUY TẮC:
  • Department CHỈ được cập nhật qua luồng 2 (import danh sách tháng)
  • Luồng 1 (import ca khám) KHÔNG bao giờ ghi đè department đã có
  • Mã nhân viên là khóa duy nhất — cùng mã = cùng người
```

### 4.3 Luồng cảnh báo nghỉ quá giờ (RestMonitor)

```
RestMonitor (chạy ngầm trong App, poll mỗi 10 giây)
        │
        ▼
window.electron.getEncounters()
  → SQLite: SELECT * WHERE status IN (WAITING, IN_PROGRESS, REST_30, MONITOR)
        │
        ▼
Filter: status = REST_30 hoặc MONITOR
        AND restStartTime tồn tại
        AND (now - restStartTime) >= 30 phút
        AND chưa bị dismiss
        │
        ├── Lần đầu phát hiện quá giờ:
        │     new Notification("⏰ Nghỉ quá giờ!")  ← Windows toast
        │     (hiện ở góc trên phải màn hình, kể cả khi app minimize)
        │
        └── Hiển thị floating card đỏ (góc dưới phải)
              tên BN, phòng ban, số phút đã nghỉ
              nút "Đã biết / 收到" → dismiss (không tự đổi status)
```

### 4.4 Luồng đồng bộ dữ liệu (file .dat qua USB)

```
SPOKE                                          HUB (E4)
─────                                          ────────
SyncControl → "Xuất BC"                        SyncControl → "Nhập BC"
  Lấy tất cả Encounter is_synced=0               Dialog chọn file .dat
  JSON → AES-256-CBC → hex string                Giải mã → JSON
  Dialog "Save As"                               Kiểm tra fileId trong import_history
  → BC_<trạm>_<ngày>.dat ra USB                 Nếu trùng → báo lỗi, dừng
                                                 Nếu mới → importSyncedData()
  Đánh dấu is_synced=1                           INSERT OR IGNORE (dedup theo encounter.id)
                                                 Lưu fileId vào import_history
                                                 Broadcast data:update → tất cả cửa sổ

Cuối tháng (sau chốt kỳ):
  Inventory → "Gửi BC Thuốc về Hub"            Smart Import tự detect loại file:
  → BC_THUOC_<trạm>_<tháng>.dat                  CLINICAL_REPORT → importSyncedData
                                                  MEDICINE_CATALOG → processMedicineImport
Hub → Spoke:                                      MEDICINE_REPORT → importSpokeReport
  Inventory → "Xuất danh mục thuốc"
  → THUOC_<ngày>.dat
  Spoke nhập → cập nhật kho Spoke
```

### 4.5 Luồng kho thuốc — trừ tự động (FEFO)

```
Kê đơn trong Clinical hoặc import ca khám (deductInventory=true)
        │
        ▼
smartDeductStock(medicineName, quantity, station, note)
        │
        ▼
SELECT * FROM medicines
WHERE name = ? AND station = ? AND stock > 0
ORDER BY expiry_date ASC        ← lô hết hạn trước được trừ trước
        │
        ▼
Trừ dần từng lô cho đến đủ số lượng kê đơn
Ghi log vào inventory_logs (type = EXPORT_USE)
```

---

## 5. Phân quyền người dùng

### 5.1 Bảng phân quyền theo chức năng

| Chức năng | STAFF | MODERATOR | ADMIN |
|---|:---:|:---:|:---:|
| **Dashboard** — xem KPI trạm | ✅ | ✅ | ✅ |
| **Kiosk** — mở cửa sổ tự phục vụ | ✅ | ✅ | ✅ |
| **Clinical** — xem hàng chờ | ✅ | ✅ | ✅ |
| **Clinical** — tiếp nhận & kê đơn | ✅ | ✅ | ✅ |
| **Clinical** — nhập ca khám từ Excel | ✅ | ✅ | ✅ |
| **Clinical** — xóa ca khám | ❌ | ❌ | ✅ |
| **Inventory** — xem tổng quan kho | ✅ | ✅ | ✅ |
| **Inventory** — nhập kho, chuyển kho | ✅ | ✅ | ✅ |
| **Inventory** — chốt kỳ tháng | ✅ | ✅ | ✅ |
| **Reports** — xem & xuất báo cáo | ✅ | ✅ | ✅ |
| **Reports** — kê đơn bổ sung ca cũ | ✅ | ✅ | ✅ |
| **Admin** — quản lý phác đồ điều trị | ✅ | ✅ | ✅ |
| **Admin** — quản lý triệu chứng Kiosk | ✅ | ✅ | ✅ |
| **Admin** — import danh sách nhân viên | ✅ | ✅ | ✅ |
| **Admin** — quản lý trạm | ❌ | ✅ | ✅ |
| **Admin** — cập nhật ứng dụng | ❌ | ✅ | ✅ |
| **Admin** — reset cấu hình trạm | ❌ | ❌ | ✅ (password) |
| **Admin** — reset toàn bộ dữ liệu | ❌ | ❌ | ✅ (password) |

### 5.2 Cơ chế xác thực

- **Đăng nhập:** Chọn tên từ danh sách nhân viên y tế (không username/password)
- **Phân quyền:** Dựa trên trường `role` trong object User (`STAFF` / `MODERATOR` / `ADMIN`)
- **Bảo vệ Admin:** Các thao tác nhạy cảm (reset trạm, reset DB) yêu cầu nhập password xác nhận
- **Password reset:** Được cấu hình cứng trong hệ thống (yêu cầu xác nhận 2 bước)
- **Kiosk:** Không yêu cầu đăng nhập — chạy độc lập trong cửa sổ riêng

### 5.3 Phạm vi dữ liệu theo loại trạm

| Dữ liệu | SPOKE | HUB |
|---|---|---|
| Ca khám của trạm mình | ✅ Toàn quyền | ✅ Xem (sau khi Spoke xuất .dat) |
| Ca khám của trạm khác | ❌ | ✅ Xem (sau Smart Import) |
| Báo cáo tổng hợp toàn hệ thống | ❌ | ✅ |
| Kho thuốc của mình | ✅ Toàn quyền | ✅ Toàn quyền |
| Xuất danh mục thuốc xuống Spoke | ❌ | ✅ |

---

## 6. Mô hình dữ liệu

### 6.1 Nhân viên y tế (User)

```typescript
interface User {
  id: string;
  name: string;
  role: 'ADMIN' | 'MODERATOR' | 'STAFF';
  canPrescribe: boolean;
}
```

> Lưu trong `localStorage` (storage.ts). Danh sách được cấu hình tại Admin tab.

### 6.2 Nhân viên nhà máy (Patient)

```typescript
interface Patient {
  id: string;         // Mã nhân viên — khóa duy nhất
  name: string;       // Họ và tên
  department: string; // Bộ phận — chỉ cập nhật qua import danh sách tháng
}
```

> Lưu trong `localStorage`. Được thêm tự động khi import ca khám (department=''), cập nhật đầy đủ khi import danh sách nhân viên hàng tháng.

### 6.3 Ca khám (Encounter)

```typescript
interface Encounter {
  id: string;
  patientId: string;
  patientName: string;
  department: string;
  stationId: string;
  stationName: string;
  symptoms: string[];          // ["Cảm sốt (感冒)", "Đau đầu (头痛)"]
  startTime: number;           // Unix timestamp
  restStartTime?: number;      // Set khi status → REST_30 hoặc MONITOR
  endTime?: number;
  status: EncounterStatus;
  diagnosis?: string;
  diseaseGroup?: string;
  instruction?: string;        // Y lệnh thêm (ghi log dạng chuỗi)
  prescriptions: Prescription[];
  is_synced: number;           // 0 = chờ đồng bộ, 1 = đã xuất .dat
  is_supplementary: number;    // 1 = đơn bổ sung cuối kỳ
  hadRestAtRoom: boolean;
}
```

**Trạng thái Encounter:**

| Status | Ý nghĩa | Kho bị trừ? | restStartTime set? |
|---|---|:---:|:---:|
| `WAITING` | Chờ khám | ❌ | ❌ |
| `IN_PROGRESS` | Đang khám | ❌ | ❌ |
| `COMPLETED_WORK` | Về làm việc | ✅ | ❌ |
| `COMPLETED_TRANSFER` | Chuyển viện | ✅ | ❌ |
| `REST_30` | Nghỉ tại phòng | ✅ | ✅ |
| `MONITOR` | Theo dõi tại phòng | ✅ | ✅ |

### 6.4 Thuốc / Vật tư (Medicine)

```typescript
interface Medicine {
  id: string;
  name: string;
  group: string;        // Nhóm thuốc
  unit: string;         // Viên / Gói / Tuyp...
  stock: number;        // Tồn kho lô này
  batchNumber: string;  // Số lô
  mfgDate?: string;
  expiryDate: string;   // FEFO sắp xếp theo trường này
  type: 'MEDICINE' | 'SUPPLY';
  station?: string;     // Trạm đang giữ lô này
}
```

> Nhiều hàng cùng `name` = nhiều lô khác nhau. Tồn kho hiển thị = tổng cộng dồn tất cả lô.

---

## 7. Các Module chức năng

### 7.1 Dashboard

- Đồng hồ thời gian thực, lời chào theo giờ (song ngữ)
- KPI Cards: tổng BN hôm nay, đơn thuốc, tồn kho, cảnh báo hết hạn
- Quick Actions: shortcut đến Clinical, Inventory, Reports
- **NotificationBell:** cảnh báo động — BN chờ > 60 phút, nghỉ > 30 phút, trạm chưa gửi BC tháng (HUB, ngày 1–5)

### 7.2 Kiosk — Màn hình tự phục vụ

- Chạy trong **cửa sổ Electron riêng** (route `/kiosk`) — không cần đăng nhập
- Phù hợp kết nối màn hình cảm ứng thứ 2
- Input ẩn auto-focus để bắt dữ liệu từ đầu đọc RFID/NFC (emulate keyboard)
- Bàn phím số virtual để nhập thủ công
- Chọn đa triệu chứng từ danh mục động (cấu hình qua Admin)
- Tự reset sau 3s (thành công) hoặc 5s (lỗi) với progress bar countdown
- Triệu chứng lưu dạng `"Tên Việt (中文)"`

### 7.3 Clinical — Phòng khám

**Cột trái (25%):** Hàng chờ real-time (auto-reload 5s), badge cảnh báo > 15 phút chờ, nút thêm BN thủ công

**Cột giữa (55%):** Workspace khám bệnh:
- Thông tin bệnh nhân, triệu chứng, chẩn đoán, nhóm bệnh
- Kê thuốc: tìm kiếm fuzzy, xem tồn kho thực tế, chặn kê quá tồn kho
- 3 nút kết thúc: Về làm → `COMPLETED_WORK` / Nghỉ → `REST_30` / Chuyển viện → `COMPLETED_TRANSFER`
- Nút theo dõi → `MONITOR`

**Cột phải (20%):** Phác đồ mẫu — áp dụng 1 click, tự điều chỉnh nếu phác đồ vượt tồn kho

**Import ca khám từ Excel (wizard 4 bước):**
1. Chọn file Excel
2. Xác nhận trừ kho: **Có — nhập thuốc vào kho** (deductInventory=true) hoặc **Không — chỉ ghi nhận** (deductInventory=false)
3. Mapping cột (patientId, patientName, diagnosis, medicines…)
4. Xem trước & Nhập — tự động thêm nhân viên mới chưa có trong danh mục (department='')

### 7.4 Inventory — Quản lý kho dược

| Tab | Chức năng |
|---|---|
| **Tổng quan kho** | Master data gom nhóm theo tên thuốc, chi tiết từng lô, màu cảnh báo (Expired/Near/OK) |
| **Nhập kho** | Nhập từ nhà cung cấp hoặc từ file Hub, ghi inventory_log |
| **Chuyển kho** | HUB xuất `THUOC_<ngày>.dat` → USB → SPOKE nhập cập nhật danh mục |
| **Phân tích** | Tốc độ tiêu thụ trung bình/ngày, dự báo ngày hết hàng |
| **Lịch sử** | Toàn bộ log xuất/nhập/chuyển kho, filter theo loại |
| **Chốt kỳ** | Chỉ mở cuối tháng (2 ngày cuối / 2 ngày đầu tháng sau), snapshot tồn kho, xuất BC Thuốc |

### 7.5 Reports — Báo cáo

- Filter theo khoảng ngày, theo trạm (HUB xem được tất cả)
- KPI: tổng lượt khám, chuyển viện, nghỉ tại phòng
- Biểu đồ cơ cấu bệnh theo nhóm (Recharts)
- Bảng chi tiết → click mở hồ sơ đầy đủ:
  - Thông tin thuốc tổng hợp
  - Timeline audit log (actor + timestamp)
  - Kê đơn bổ sung cho ca đang mở
- **Xuất Excel:** format pivot (thuốc = cột, bệnh nhân = hàng)
- **Nhập file .dat thủ công** từ USB (thay thế SyncControl)
- **KSK hàng năm:** import CSV kết quả, báo cáo tổng hợp theo năm/giới tính/phân loại

### 7.6 Admin — Quản trị hệ thống

| Tab | Ai dùng | Chức năng |
|---|---|---|
| **Phác đồ** | STAFF+ | Tạo/xóa phác đồ điều trị mẫu |
| **Nhân viên** | STAFF+ | Xem, tìm kiếm, import Excel hàng tháng (upsert) |
| **Triệu chứng** | STAFF+ | Thêm/xóa triệu chứng hiển thị trên Kiosk |
| **Nhóm bệnh** | STAFF+ | Quản lý danh mục nhóm bệnh |
| **Trạm** | MODERATOR+ | Thêm/xóa trạm trong hệ thống |
| **Cập nhật App** | MODERATOR+ | Áp patch update từ file .zip |
| **Reset** | ADMIN | Reset cấu hình trạm hoặc toàn bộ dữ liệu (có password) |

### 7.7 RestMonitor — Giám sát nghỉ ngơi

- Chạy ngầm trong App, **poll mỗi 10 giây** từ SQLite
- Phát hiện Encounter có `status = REST_30 / MONITOR` và `(now - restStartTime) ≥ 30 phút`
- **Khi app đang mở:** floating card đỏ góc dưới phải, animation bounce
- **Khi app minimize:** Windows toast notification góc trên phải màn hình
- Nút "Đã biết / 收到" dismiss alert (không tự đổi trạng thái BN)

---

## 8. Cơ chế đồng bộ dữ liệu (File .dat)

### 8.1 Hai loại file

| File | Tạo bởi | Nhập bởi | Nội dung |
|---|---|---|---|
| `BC_<trạm>_<ngày>.dat` | SPOKE | HUB | Ca khám (`CLINICAL_REPORT`) |
| `BC_THUOC_<trạm>_<tháng>.dat` | SPOKE (sau chốt kỳ) | HUB | Báo cáo thuốc (`MEDICINE_REPORT`) |
| `THUOC_<ngày>.dat` | HUB | SPOKE | Danh mục thuốc (`MEDICINE_CATALOG`) |

### 8.2 Mã hóa

- **Thuật toán:** AES-256-CBC
- **Key:** `crypto.scryptSync('vnp-secret-key-2025', 'salt', 32)`
- **Payload:** `{ fileId, version, type, exportedAt, sourceStation, data }`

### 8.3 Chống import trùng lặp

Mỗi file có `fileId` (UUID) tạo lúc xuất. Trước khi import, kiểm tra `fileId` trong bảng `import_history`. Nếu đã tồn tại → từ chối. Sau import thành công → ghi `fileId` vào `import_history`.

Với dữ liệu ca khám: `INSERT OR IGNORE` theo `encounter.id` — đảm bảo không bao giờ tạo bản ghi trùng dù import file nhiều lần.

---

## 9. Cơ sở dữ liệu SQLite

**Vị trí:** `%APPDATA%\GoertekVinaCare Smart Medical\local_data.db`

| Bảng | Mô tả |
|---|---|
| `encounters` | Ca khám bệnh — trường chính: `id, patient_id, status, rest_start_time, prescriptions(JSON), is_synced` |
| `clinical_events` | Audit log từng hành động (actor + timestamp + details) |
| `medicines` | Kho thuốc theo lô — trường chính: `name, stock, batch_number, expiry_date, station` |
| `inventory_logs` | Lịch sử xuất/nhập/chuyển kho (type + items JSON) |
| `health_checkups` | KSK hàng năm (employee_id, year, health_class) |
| `period_close_records` | Chốt kỳ tháng (snapshot tồn kho) |
| `spoke_medicine_reports` | Báo cáo thuốc từ Spoke gửi về HUB |
| `import_history` | Track file `.dat` đã import (chống duplicate theo fileId) |

---

## 10. Hướng dẫn cài đặt & khởi chạy

### Yêu cầu

- Windows 10/11 (64-bit)
- Node.js ≥ 18.x (chỉ cần khi dev)
- RAM ≥ 4GB

### Development

```bash
npm install          # Cài dependencies
npm run rebuild      # Rebuild native SQLite cho Electron
npm run dev          # Vite dev server (port 3000) — terminal 1
npm start            # Electron — terminal 2
```

### Build production

```bash
npm run dist         # Vite build + electron-builder → release/<version>/
```

Output: `release/1.26.04.23/GoertekVinaCare Smart Medical.exe`

---

## 11. Cấu hình trạm lần đầu

1. Lần đầu mở app → **Màn hình Setup** → Chọn loại trạm (E4 / A6 / D4 / C6)
2. Nhấn **Lưu cấu hình** → máy bị ghim với trạm này
3. **Màn hình Login** → Chọn nhân viên y tế → Đăng nhập
4. Để reset: click icon khóa ở Login → nhập password Admin → xác nhận

**Mở Kiosk độc lập:** Từ Layout chính → nút mở Kiosk → spawn cửa sổ Electron thứ 2 chạy route `/kiosk`, kết nối chung SQLite với cửa sổ chính. Phù hợp gắn màn hình cảm ứng thứ 2.

---

## 12. Lịch vận hành tháng

```
Hàng ngày:
  Spoke → SyncControl "Xuất BC" → file .dat → USB → HUB "Nhập BC"

Cuối tháng (ngày 28-31 hoặc ngày 1-3 tháng sau):
  Spoke → Inventory "Chốt kỳ" → "Gửi BC Thuốc về Hub"
  HUB Smart Import tự nhận diện loại file

Ngày 1-5 tháng mới:
  NotificationBell HUB cảnh báo trạm nào chưa gửi báo cáo thuốc
  HUB xem báo cáo thuốc tổng hợp (self / từng trạm / toàn hệ thống)

Hàng năm:
  Admin → Reports → import CSV kết quả KSK
  Xem báo cáo KSK theo năm / giới tính / phân loại sức khỏe
```

---

<div align="center">

**GoertekVinaCare Smart Medical**  
*Hệ thống Y tế Thông minh — Goertek Vina*  
Version 1.26.04.23 · Electron + React + SQLite · 2026

</div>
