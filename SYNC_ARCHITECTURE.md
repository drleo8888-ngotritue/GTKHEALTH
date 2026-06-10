# Kiến trúc Đồng bộ Dữ liệu — GVC Smart Medical

## 1. Vai trò các thành phần

| Thành phần | Vai trò | Ví dụ |
|---|---|---|
| **Hub** | Trạm tổng hợp, đọc dữ liệu toàn hệ thống | E4 |
| **Spoke** | Trạm khám bệnh độc lập | A6, C6, B2, ... |
| **Server** | Kho dữ liệu trung tâm (Express + SQLite, port 3500) | `10.175.16.164` |

---

## 2. Cấu trúc dữ liệu

### Local DB (SQLite — mỗi máy một file `local_data.db`)

**Bảng `encounters` — ca khám bệnh**
```
id               TEXT PRIMARY KEY   UUID do client tạo
patient_id       TEXT               Mã nhân viên
patient_name     TEXT
department       TEXT
station_id       TEXT               ID trạm khám
station_name     TEXT               Tên trạm (E4 / A6 / C6 ...)
symptoms         TEXT               JSON array
status           TEXT               WAITING → IN_PROGRESS → COMPLETED_WORK / COMPLETED_TRANSFER / REST_30 / MONITOR
start_time       INTEGER            Unix ms — giờ vào
end_time         INTEGER            Unix ms — giờ ra (null khi chưa xong)
diagnosis        TEXT               Chẩn đoán (null khi mới tạo)
disease_group    TEXT               Nhóm bệnh
prescriptions    TEXT               JSON array đơn thuốc
had_rest_at_room INTEGER            0/1
is_supplementary INTEGER            0/1 — đơn bổ sung cuối kỳ
is_synced        INTEGER            0/1 — đã sync kiểu cũ (file .dat)
is_synced_server INTEGER            0/1/NULL — đã push lên server
```

**Bảng `inventory_logs` — nhật ký kho**
```
id               TEXT PRIMARY KEY
type             TEXT               IMPORT_SUPPLIER / EXPORT_USE / TRANSFER_IN / TRANSFER_OUT / ...
source           TEXT               Nơi gửi
target           TEXT               Nơi nhận
items            TEXT               JSON array
timestamp        INTEGER            Unix ms
station_id       TEXT
station_name     TEXT
is_synced_server INTEGER
```

### Server DB (SQLite — `gvc-server/`)

Server có thêm cột:
```
received_at      INTEGER            Unix ms — thời điểm server nhận được record này
```

Bảng riêng của server:
- `protocols` — phác đồ Hub đẩy lên
- `pending_transfers` — phiếu điều chuyển thuốc Hub→Spoke
- `medicines_stock` — snapshot tồn kho từng trạm
- `spoke_medicine_reports` — báo cáo thuốc tháng từng Spoke

---

## 3. Luồng PUSH — Spoke/Hub → Server

### 3.1 Khi nào trigger push?

| Sự kiện | Code |
|---|---|
| Bệnh nhân đăng ký khám | `createEncounter()` |
| Bác sĩ hoàn thành ca (Về làm, Chuyển viện, Nghỉ, Theo dõi) | `updateEncounter()` với status trong finalStatuses |
| Nhập/xuất kho | `createInventoryLog()` |
| Timer định kỳ | mỗi N phút (cấu hình trong Admin) |
| Bấm "Sync ngay" | Admin UI |

### 3.2 Luồng push encounters

```
doServerSync()
  ↓
getUnsyncedEncounters()
  WHERE is_synced_server = 0 OR is_synced_server IS NULL
  LIMIT 100 records/lần
  ↓
pushEncounters(records)  →  POST /api/sync/encounters
  Body: { station_id, station_name, records[] }
  ↓
Server: INSERT OR REPLACE INTO encounters ... received_at = Date.now()
  ↓
markEncountersSynced(received_ids)
  UPDATE encounters SET is_synced_server = 1 WHERE id IN (...)
```

### 3.3 Chu kỳ sống của is_synced_server

```
Tạo encounter         →  is_synced_server = NULL  (chưa bao giờ push)
Sau push thành công   →  is_synced_server = 1     (đã có trên server)
Sau updateEncounter   →  is_synced_server = 0     (cần push lại bản mới)
Sau push lại          →  is_synced_server = 1     (server có bản đầy đủ)
```

> **Quan trọng:** `updateEncounter` luôn reset về 0 để đảm bảo bản có chẩn đoán/giờ ra/đơn thuốc được push lên server, thay thế bản cũ lúc mới tạo.

### 3.4 Hub push thêm

| Dữ liệu | API | Khi nào |
|---|---|---|
| Phác đồ | `POST /api/hub/protocols` | Admin bấm "Đồng bộ lên Server" |
| Tồn kho snapshot | `POST /api/sync/medicines/stock` | Sau chốt kỳ |
| Báo cáo thuốc nhập (từ Spoke) | qua file .dat | Import thủ công |

---

## 4. Luồng PULL — Server → Hub / Spoke

### 4.1 Hub pull (đọc trực tiếp để hiển thị)

```
Hub mở Reports / Dashboard
  ↓
queryServerEncounters({ from, to })
  →  GET /api/hub/encounters?from=&to=
  Server filter: WHERE start_time >= from AND start_time <= to
  Trả về: snake_case → main.js map sang camelCase
  ↓
Merge với local (xem mục 5)
```

### 4.2 Spoke pull mỗi chu kỳ sync

| Dữ liệu | API | Mục đích |
|---|---|---|
| Phác đồ | `GET /api/spoke/protocols` | Tự đồng bộ phác đồ từ Hub |
| Phiếu điều chuyển | `GET /api/spoke/transfers/pending?station_name=` | Nhận thuốc Hub điều chuyển |
| Nhân viên | `GET /api/sync/employees` | Cập nhật danh sách NV |

---

## 5. Logic HIỂN THỊ dữ liệu

### 5.1 Spoke — Reports / Dashboard

```
getAllEncounters() từ LOCAL SQLite
  ↓
filter: e.stationName === tên trạm mình
  ↓
filter: e.startTime trong khoảng ngày chọn
```

**Spoke chỉ thấy ca của chính mình, hoàn toàn từ local.**

### 5.2 Hub — Reports / Dashboard

```
Song song:
  [LOCAL]  getAllEncounters()           → ca của Hub (đầy đủ: chẩn đoán, giờ ra)
  [SERVER] queryServerEncounters(from,to) → ca của Spoke (camelCase sau mapping)

Merge — LOCAL THẮNG:
  localIds = Set của tất cả ID trong local
  kết quả = [...local, ...server.filter(e => !localIds.has(e.id))]

  → Local của Hub: đầy đủ thông tin, luôn được ưu tiên
  → Spoke data từ server: bổ sung những ca không có trong local Hub

  ↓
filter station:
  ALL   → tất cả
  "A6"  → chỉ e.stationName === "A6"
  ↓
filter: e.startTime trong khoảng ngày chọn
```

### 5.3 Tại sao "local thắng" thay vì "server thắng"?

| Tình huống | Local | Server |
|---|---|---|
| Vừa tạo BN (chưa khám) | WAITING, no diagnosis | WAITING, no diagnosis ← giống nhau |
| Sau khi bác sĩ khám xong | COMPLETED_WORK + diagnosis + end_time ✅ | Có thể vẫn còn bản cũ ⚠️ |
| Sau khi re-push thành công | COMPLETED_WORK + đầy đủ ✅ | COMPLETED_WORK + đầy đủ ✅ |

Giai đoạn giữa "bác sĩ vừa khám xong" và "server nhận được bản mới" (vài giây → vài phút), local luôn chính xác hơn server.

---

## 6. Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────┐
│                       SERVER                            │
│  encounters, inventory_logs, protocols,                 │
│  pending_transfers, medicines_stock                     │
└────────────┬────────────────────────┬───────────────────┘
             │ POST /api/sync/*        │ GET /api/hub/*
             │ (push data lên)         │ GET /api/spoke/*
             │                         │ (pull data về)
    ┌────────┴────────┐       ┌────────┴────────┐
    │    SPOKE (A6)   │       │    HUB (E4)     │
    │                 │       │                 │
    │ Local SQLite    │       │ Local SQLite    │
    │ - Ca của A6     │       │ - Ca của E4     │
    │ - Kho A6        │       │ - Kho E4        │
    │                 │       │                 │
    │ Hiển thị:       │       │ Hiển thị:       │
    │ Local only      │       │ Local + Server  │
    │ (chỉ A6)        │       │ (E4 + tất cả)  │
    └─────────────────┘       └─────────────────┘
```

---

## 7. Xử lý lỗi & offline

| Trường hợp | Hành vi |
|---|---|
| Server down khi push | Push thất bại, `is_synced_server` giữ nguyên 0, retry ở lần sync tiếp |
| Server down khi Hub load Reports | `serverRes = null` → `spokeOnly = []` → Hub chỉ thấy ca của mình |
| Spoke offline nhiều ngày | Ca tích lũy với `is_synced_server = 0`, tự đẩy hết khi online lại (LIMIT 100/lần sync) |
| API key sai | Server trả 401, push thất bại, retry sau |

---

## 8. Cấu hình cần thiết (Admin → Máy chủ)

```
enabled:              true
serverUrl:            http://10.175.16.164:3500
apiKey:               ytegoertek2026
retryIntervalMinutes: 5   (trigger timer định kỳ)
```

Server `.env`:
```
API_KEY=ytegoertek2026
PORT=3500
```
