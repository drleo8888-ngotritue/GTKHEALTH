# LOGIC HỆ THỐNG: CLINICAL & KHO DƯỢC - VẬT TƯ
> GoertekVinaCare Smart Medical — v1.26.3.262  
> Cập nhật: 31/03/2026

---

## MỤC LỤC

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Cấu trúc dữ liệu](#2-cấu-trúc-dữ-liệu)
3. [PHẦN I — CLINICAL (Khám bệnh & Kê đơn)](#3-phần-i--clinical)
4. [PHẦN II — INVENTORY (Kho Dược - Vật tư)](#4-phần-ii--inventory)
5. [DB-SERVICE — Backend Logic](#5-db-service--backend-logic)
6. [Luồng dữ liệu tổng thể](#6-luồng-dữ-liệu-tổng-thể)
7. [Edge Cases & Safety](#7-edge-cases--safety)

---

## 1. TỔNG QUAN HỆ THỐNG

```
Electron + React + SQLite

Clinical  ──────────────────────────────►  Inventory
(Kê đơn thuốc)  updateEncounter()          (Trừ kho FEFO)
                deleteEncounter()           (Hoàn kho)
                    ↓
              onDataChange()  →  Reload Inventory UI
```

**Hai khu vực chính:**
- **Clinical**: Tiếp nhận bệnh nhân → Khám → Kê đơn → Cập nhật trạng thái
- **Inventory**: Nhập kho → Xuất/Chuyển/Hủy → Báo cáo → Dự báo hết hàng

---

## 2. CẤU TRÚC DỮ LIỆU

### 2.1 Encounter (Phiếu khám bệnh)

| Field | Kiểu | Mô tả |
|-------|------|-------|
| `id` | string (UUID) | Định danh phiếu |
| `patientId` | string | Mã thẻ nhân viên hoặc `"NHÀ THẦU"` |
| `patientName` | string | Tên bệnh nhân (IN HOA) |
| `department` | string | Phòng ban |
| `stationId` / `stationName` | string | Trạm y tế |
| `status` | EncounterStatus | Trạng thái (xem bên dưới) |
| `symptoms` | string[] | Danh sách triệu chứng |
| `diagnosis` | string? | Chẩn đoán |
| `diseaseGroup` | string? | Nhóm bệnh |
| `instruction` | string? | Y lệnh thêm |
| `prescriptions` | Prescription[] | Đơn thuốc |
| `startTime` | number (epoch) | Giờ vào |
| `endTime` | number? (epoch) | Giờ ra |
| `restStartTime` | number? | Thời điểm bắt đầu nghỉ |
| `is_synced` | 0 \| 1 | Cờ đồng bộ SQLite |

### 2.2 EncounterStatus

| Status | Ý nghĩa |
|--------|---------|
| `WAITING` | Chờ khám (vừa tạo) |
| `IN_PROGRESS` | Đang được khám (auto khi bác sĩ chọn) |
| `COMPLETED_WORK` | Về làm việc |
| `COMPLETED_TRANSFER` | Chuyển viện |
| `REST_30` | Nghỉ ngơi tại trạm |
| `MONITOR` | Theo dõi thêm |

### 2.3 Medicine (Thuốc / Vật tư)

| Field | Mô tả |
|-------|-------|
| `id` | UUID hoặc ID cố định (master data) |
| `name` | Tên thuốc |
| `group` / `group_name` | Nhóm thuốc |
| `unit` | Đơn vị tính (Viên, Chai, Gói…) |
| `stock` | Số lượng hiện có |
| `batchNumber` | Số lô (`"DANH_MUC_GOC"` = danh mục gốc) |
| `expiryDate` | Hạn dùng `"YYYY-MM-DD"` |
| `mfgDate` | Ngày sản xuất |
| `type` | `"MEDICINE"` hoặc `"SUPPLY"` |
| `station` | Trạm đang giữ (`"MASTER_DATA"`, `"Unknown"`, tên trạm) |

### 2.4 InventoryLog (Lịch sử kho)

| Field | Mô tả |
|-------|-------|
| `id` | UUID |
| `timestamp` | Epoch |
| `type` | Loại giao dịch (xem bảng bên dưới) |
| `source` | Nơi gửi |
| `target` | Nơi nhận |
| `note` | Ghi chú |
| `items` | `[{ name, qty, batch, medId, receivedQty }]` |

**Các loại log (type):**

| Type | Ý nghĩa |
|------|---------|
| `IMPORT` | Nhập kho tự do |
| `IMPORT_INIT` | Setup tồn đầu kỳ |
| `IMPORT_SUPPLIER` | Nhập từ nhà cung cấp |
| `IMPORT_HUB` | Nhập từ Hub (dùng cho Spoke) |
| `EXPORT_USE` | Kê đơn cho bệnh nhân |
| `EXPORT_DESTROY` | Hủy (hết hạn, hỏng) |
| `EXPORT_ADJUST` | Cân bằng kho (thất thoát) |
| `EXPORT_OTHER` | Xuất khác |
| `TRANSFER_OUT` | Xuất chuyển trạm |
| `TRANSFER_IN` | Nhập chuyển trạm |
| `TRANSFER` | File tạm (chuyển chưa xác nhận) |
| `RESTORE` | Hoàn kho (khi xóa phiếu khám) |

---

## 3. PHẦN I — CLINICAL

### 3.1 State Variables

**Dữ liệu chính:**

| State | Kiểu | Mục đích |
|-------|------|---------|
| `encounters` | Encounter[] | Danh sách phiếu khám của trạm |
| `medicines` | Medicine[] | Dữ liệu thô từ DB |
| `groupedMedicines` | GroupedMedicine[] | Thuốc đã gom nhóm + tổng tồn |
| `selectedEncounterId` | string\|null | Phiếu đang được chọn |
| `protocols` | Protocol[] | Danh sách phác đồ đã duyệt |
| `diseaseGroupList` | string[] | Danh sách nhóm bệnh (từ storage) |

**Thêm bệnh nhân:**

| State | Mục đích |
|-------|---------|
| `manualId` | Mã thẻ hoặc tên nhà thầu |
| `isContractor` | Toggle nhà thầu / nhân viên |
| `showNewEmpModal` | Hiện modal tạo nhân viên mới |
| `newEmpId/Name/Dept` | Dữ liệu form nhân viên mới |

**Thông tin khám:**

| State | Mục đích |
|-------|---------|
| `diagnosis` | Chẩn đoán bác sĩ nhập |
| `diseaseGroup` | Nhóm bệnh (dropdown) |
| `prescriptions` | `[{medName, qty, unit}]` - Đơn thuốc |

**Tìm kiếm thuốc:**

| State | Mục đích |
|-------|---------|
| `medSearch` | Input tìm kiếm |
| `showMedResults` | Hiện dropdown kết quả |

---

### 3.2 Hàm Logic Chính

#### `loadData()`
Tải encounters + thuốc + phác đồ + nhóm bệnh.

```
1. getEncounters() → lọc: status=WAITING|IN_PROGRESS & station=myStation
2. getInventory(stationName) → processGroupedMedicines()
3. getProtocols() → filter isApproved=true
4. getDiseaseGroups() → setDiseaseGroupList
```

#### `processGroupedMedicines(rawMeds)`
Gom thuốc theo tên chuẩn hóa, tính tổng tồn:

```
FOR each medicine:
  - Skip nếu batchNumber == "DANH_MUC_GOC" AND stock ≤ 0
  - Normalize name (trim → uppercase → collapse spaces)
  - Cộng dồn stock vào nhóm
→ Output: GroupedMedicine[] (1 dòng/tên thuốc)
```

Ví dụ:
- Panadol lô A: 5, Panadol lô B: 3, PANADOL lô C: 2
- → 1 nhóm `"PANADOL"` với `totalStock = 10`

#### `normalizeName(name)`
```
.trim() → .toUpperCase() → .replace(/\s+/g, ' ')
"  panadol  EXTRA  " → "PANADOL EXTRA"
```

#### `handleManualAdd()`

```
IF isContractor:
  → newEmpId = "NHÀ THẦU", mở modal nhập tên

ELSE (nhân viên):
  → findPatient(id) trong storage
  → IF found: createEncounterForPatient() ngay
  → IF not found: mở modal nhập nhân viên mới
```

#### `handleSelectEncounter(id)`

```
1. Set selectedEncounterId
2. Load diagnosis, diseaseGroup, prescriptions vào form
3. IF status == WAITING:
   → Auto updateEncounter(status=IN_PROGRESS)
```

#### `applyProtocol(protocol)`
Áp dụng phác đồ mẫu, validate tồn kho:

```
1. Set diagnosis & diseaseGroup từ phác đồ
2. FOR each medicine in protocol:
   a. Match tên thuốc với groupedMedicines (exact → contains)
   b. safeQty = min(protocolQty, actualStock)
3. Set prescriptions với qty an toàn
```

> **Ví dụ**: Phác đồ cần 10 Salonpas, kho chỉ có 5 → prescription = 5

#### `updateRxQty(medName, qty)`
```
maxStock = groupedMedicines.find(medName).totalStock
IF qty > maxStock → cap tại maxStock
IF qty < 0 → set = 0
```

#### `addMedToRx(medicine)`
```
IF stock ≤ 0 → Alert "Hết hàng", Return
IF trùng tên (normalized) → skip
ELSE → push vào prescriptions, qty = 1
```

#### `finishEncounter(status)`

```
1. Filter: loại bỏ prescription có qty = 0
2. Map format: {medName} → {medicineName, quantity, unit}
3. IF REST_30 or MONITOR → restStartTime = now
4. updateEncounter() → backend xử lý FEFO
5. onDataChange() → trigger reload Inventory
6. Reset form & reload danh sách
```

#### `handleDeleteEncounter()`

```
1. Confirm người dùng
2. deleteEncounter(id) → backend hoàn kho
3. Reset & reload
```

---

### 3.3 Luồng khám bệnh

```
[BỆNH NHÂN VÀO]
       ↓
[Nhập ID / Tên nhà thầu]
       ↓
  ┌────────────────────────────────┐
  │  Tìm trong DB?                 │
  │  YES → createEncounterForPatient│
  │  NO  → Modal nhập thông tin mới │
  └────────────────────────────────┘
       ↓
  Encounter tạo: status = WAITING, prescriptions = []
       ↓
[BÁC SĨ CHỌN PHIẾU]
  → Auto status = IN_PROGRESS
       ↓
[BÁC SĨ KHÁM]
  ├─ Nhập diagnosis, chọn diseaseGroup
  ├─ Search thuốc → addMedToRx() → updateRxQty()
  └─ Hoặc: Apply Protocol → validate tồn kho tự động
       ↓
[LƯU / HOÀN TẤT]
  → updateEncounter() → smartDeductStock() FEFO
  → onDataChange() → Reload Inventory
  → Status = COMPLETED_WORK / TRANSFER / REST_30 / MONITOR
```

---

## 4. PHẦN II — INVENTORY

### 4.1 State Variables

| State | Mục đích |
|-------|---------|
| `medicines` | Medicine[] - Toàn bộ thuốc từ DB |
| `logs` | InventoryLog[] - Lịch sử giao dịch |
| `cleanBatches` | Gom nhóm theo (name, batch, expiry), stock > 0 |
| `flowData` | MasterItem[] - Báo cáo nhập/xuất theo kỳ |
| `analysisData` | AnalyticsItem[] - Dự báo hết hàng |
| `activeTab` | `'flow'` \| `'analysis'` \| `'history'` |
| `inventoryType` | `'MEDICINE'` \| `'SUPPLY'` |
| `startDate, endDate` | Khoảng thời gian báo cáo |
| `isSetupMode` | Toggle: Setup đầu kỳ vs nhập thường |
| `transferCart` | Giỏ hàng xuất/hủy |
| `incomingTransfer` | Data file .dat nhận từ trạm khác |
| `verifiedItems` | Items trong verify modal |

---

### 4.2 Hàm Logic Chính

#### `calculateFlowData(): MasterItem[]`
Tính báo cáo kho: Tồn đầu → Nhập → Kê đơn → Chuyển → Hủy → Tồn cuối.

```
FOR each unique medicine (grouped by name):
  FOR each batch:
    opening = 0, import = 0, usage = 0, transfer = 0, other = 0
    
    SCAN ALL LOGS:
      
      IF log.timestamp < startDate:   # Trước kỳ → tính Tồn đầu
        IF (IMPORT* or TRANSFER_IN) AND target = myStation:
          opening += qty
        IF source = myStation:
          opening -= qty
      
      IF log.timestamp IN [startDate, endDate]:   # Trong kỳ
        IF target = myStation AND (IMPORT* or TRANSFER_IN):
          import += qty
        IF source = myStation:
          IF EXPORT_USE       → usage += qty
          IF TRANSFER_OUT     → transfer += qty
          IF DESTROY/ADJUST   → other += qty
    
    closing = opening + import - usage - transfer - other
    
    # Fallback nếu lệch so với tồn thực:
    IF closing ≠ realStock:
      diff = realStock - closing
      opening += diff    # Giải thích chênh lệch bằng tồn đầu
      closing = realStock
    
    # Trạng thái hạn:
    IF expiryDate < now           → EXPIRED
    IF expiryDate < now + 90 days → NEAR_EXPIRY
    ELSE                          → OK
  
  ROLLUP: cộng dồn tất cả lô vào master item
```

**Ví dụ thực tế:**
```
Kỳ: 01/01 - 31/01
  - 15/12 (trước kỳ): IMPORT +50 Panadol lô A
  - 05/01: EXPORT_USE -20 Panadol lô A
  - 10/01: EXPORT_USE -15 Panadol lô A
  - 25/01: IMPORT     +30 Panadol lô B
  Tồn thực: Lô A=15, Lô B=30

Kết quả:
  Lô A: opening=50, usage=35, closing=15 ✓
  Lô B: opening=0,  import=30, closing=30 ✓
  Master: opening=50, import=30, usage=35, closing=45 ✓
```

#### `calculateAnalysisData(): AnalyticsItem[]`
Dự báo ngày hết hàng:

```
FOR each item in flowData:
  daysInPeriod = (endDate - startDate) / 86400000
  avgDaily = (usage + transfer) / daysInPeriod
  
  IF avgDaily > 0 AND closing > 0:
    daysRemaining = closing / avgDaily
    predictedDate = today + daysRemaining days
  ELSE:
    daysRemaining = 9999 (xem như không bao giờ hết)

Sort BY daysRemaining ASC (sắp hết trước → lên đầu)
```

#### `handleDisposeAction()` — Hủy / Xuất khác

```
FOR each item in transferCart:
  importMedicine({ stock: -qty, skipLog: true })  # Trừ kho, không log lẻ

logType theo disposeReason:
  EXPIRED  → EXPORT_DESTROY  "Hủy (Hết hạn)"
  DAMAGED  → EXPORT_DESTROY  "Hủy (Hỏng/Vỡ)"
  LOST     → EXPORT_ADJUST   "Cân bằng (Thất thoát)"
  INTERNAL → EXPORT_USE      "Dùng nội bộ"

createInventoryLog({ type: logType, source: myStation, target: reason })
```

#### `handleTransferAction()` — Xuất điều chuyển

```
FOR each item in transferCart:
  importMedicine({ stock: -qty })  # Trừ kho trạm này

Generate transfer data:
  { type:"TRANSFER", id:UUID, source, target, date, items }
→ Download file .dat (JSON)

createInventoryLog({ type: TRANSFER_OUT, target: targetStation })
```

#### `handleSyncFileUpload()` — Nhận điều chuyển

```
1. Parse file JSON
2. Validate:
   - data.type == "TRANSFER"
   - target == myStation (sai địa chỉ → reject)
   - source ≠ myStation (không tự import)
   - Chưa nhập trước đó (markFileImported chặn)
3. Hiện VERIFY MODAL (user nhập số thực nhận)
```

#### `confirmImportTransfer()` — Xác nhận nhập kho

```
FOR each verified item:
  IF realStock > 0:
    importMedicine({ stock: realStock }, myStation)

createInventoryLog({ type: TRANSFER_IN })
markFileImported({ fileId })  # Chặn nhập lại lần 2
```

#### `handleExcelImport()` — Nhập Excel bulk

```
1. Parse Excel:
   - cellDates: false → convert date serial → "YYYY-MM-DD"
     Formula: new Date((serial - 25569) * 86400000)

2. Column mapping (flexible):
   "Tên thuốc" | "Tên vật tư" | "Name"       → name (bắt buộc)
   "Số lượng" | "SL"                           → qty
   "Nhóm" | "Nhóm thuốc"                      → group
   "ĐVT" | "Đơn vị tính"                      → unit
   "Số lô" | "Lô"                             → batchNumber
   "Hạn dùng" | "HSD"                         → expiryDate
   "Ngày SX"                                   → mfgDate

3. FOR each row:
   importMedicine({ ...row, skipLog: true })

4. createInventoryLog({
     type: isSetupMode ? IMPORT_INIT : IMPORT,
     note: "Nhập Excel: N mặt hàng"
   })
```

#### `handleExportXLSX()` — Xuất báo cáo Excel

```
Format:
STT | Tên | Nhóm | ĐVT | Số lô | Hạn SD | Ngày SX
  | Tồn đầu | Nhập | Sử dụng | Chuyển trạm | Hủy/Khác | Tồn cuối | Ghi chú

Rows:
  Master row: tổng hợp tất cả lô
  Batch rows: chi tiết từng lô (thụt vào)
```

---

### 4.3 Luồng quản lý kho

```
[NHẬP KHO]
  ├─ Đơn lẻ: Form → importMedicine() → INSERT/UPDATE + LOG
  ├─ Excel bulk: parse → FOR each: importMedicine(skipLog) → LOG chung
  └─ Setup đầu kỳ: Excel + isSetupMode → LOG type=IMPORT_INIT

[XEM BÁO CÁO]
  ├─ Flow: calculateFlowData() → scan logs → opening/import/usage/closing
  ├─ Analysis: calculateAnalysisData() → avgDaily → daysRemaining
  └─ History: lọc logs theo trạm & kỳ → group theo timestamp

[XUẤT / HỦY]
  ├─ Hủy: chọn items + lý do → trừ kho + LOG(DESTROY/ADJUST)
  ├─ Transfer: chọn items + trạm đích → trừ kho + .dat file + LOG(TRANSFER_OUT)
  └─ Nhận transfer: upload .dat → verify số lượng → importMedicine + LOG(TRANSFER_IN)
```

---

## 5. DB-SERVICE — BACKEND LOGIC

### 5.1 `smartDeductStock(medicineName, neededQty, stationName, logNote)`
Trừ kho thông minh theo FEFO (First Expiry First Out):

```
1. Query batches:
   WHERE name = medicineName
     AND (station = stationName OR 'Unknown' OR 'MASTER_DATA')
     AND stock > 0
     AND batch_number ≠ 'DANH_MUC_GOC'
   ORDER BY expiryDate ASC, mfgDate ASC     ← FEFO

2. DEDUCTION LOOP:
   remaining = neededQty
   FOR each batch:
     take = min(batch.stock, remaining)
     UPDATE medicines SET stock -= take
     remaining -= take
   
   IF remaining > 0:
     console.warn("Thiếu ${remaining} đơn vị")

3. INSERT inventory_logs:
   type: EXPORT_USE, source: stationName, target: PATIENT
```

**Ví dụ:**
```
Cần: 100 Panadol
  Lô A (hạn 2024-01-01): 30 → trừ 30, còn 70
  Lô B (hạn 2024-02-01): 50 → trừ 50, còn 20
  Lô C (hạn 2024-03-01): 40 → trừ 20, còn 0 ✓
```

---

### 5.2 `smartRestoreStock(medicineName, qty, stationName, logNote)`
Hoàn kho khi xóa phiếu khám:

```
1. Query batch (LIMIT 1):
   WHERE name = medicineName AND station = stationName
   ORDER BY expiryDate ASC     ← ưu tiên lô đã bị trừ trước

2. UPDATE medicines SET stock += qty WHERE id = batch.id

3. INSERT inventory_logs:
   type: RESTORE, source: PATIENT, target: stationName
```

---

### 5.3 `updateEncounter(data)`
Cập nhật phiếu khám, trừ kho:

```
1. Get current prescriptions (accumulate, không ghi đè)
2. FOR each newRx:
   smartDeductStock(name, qty, stationName, "Kê đơn cho: patientName")
   Cộng dồn vào totalPrescriptions
3. UPDATE encounters table
4. INSERT clinical_events log (bác sĩ, chẩn đoán, trạng thái)
```

---

### 5.4 `deleteEncounter(id)`
Xóa phiếu khám + hoàn kho:

```
1. SELECT prescriptions, station_name FROM encounters WHERE id = ?
2. FOR each rx in prescriptions:
   smartRestoreStock(name, qty, stationName, "Hoàn kho - xóa phiếu: patientName")
3. DELETE FROM encounters WHERE id = ?
4. DELETE FROM clinical_events WHERE encounter_id = ?
```

---

### 5.5 `importMedicine(data, stationName)`
Thêm hoặc cập nhật stock thuốc:

```
CHECK: SELECT WHERE name = ? AND batch_number = ? AND station = ?

IF exists:
  UPDATE SET stock += data.stock   ← âm = trừ kho, dương = nhập kho

IF not exists:
  INSERT new medicine record

IF !data.skipLog:
  INSERT inventory_logs (type: IMPORT)
```

---

## 6. LUỒNG DỮ LIỆU TỔNG THỂ

```
┌────────────────────────────────────────────────────────────┐
│                    KHÁM BỆNH (CLINICAL)                     │
└────────────────────────────────────────────────────────────┘

Bệnh nhân quẹt thẻ / nhân viên y tế nhập mã
  ↓
findPatient() → Tìm trong SQLite
  ├─ Tìm thấy  → createEncounterForPatient()
  └─ Không có  → Modal nhập thông tin (Clinical)
                  Kiosk → Thông báo "Đưa thẻ cho y tế"
  ↓
Encounter tạo: status=WAITING, prescriptions=[]
  ↓
Bác sĩ chọn phiếu → AUTO status=IN_PROGRESS
  ↓
Bác sĩ nhập: diagnosis, diseaseGroup
  ↓
Kê thuốc:
  ├─ Search → addMedToRx() [block nếu stock=0]
  ├─ Apply Protocol → validate stock, cap qty
  └─ updateRxQty() [không vượt tồn kho]
  ↓
finishEncounter(status)
  ↓
  ┌──────────────────────────────────────────────┐
  │  BACKEND: updateEncounter()                  │
  │                                              │
  │  FOR each prescription:                      │
  │    smartDeductStock(FEFO)                    │
  │    → trừ lô hạn sớm nhất trước              │
  │    → LOG: EXPORT_USE                         │
  │                                              │
  │  UPDATE encounters                           │
  │  INSERT clinical_events                      │
  └──────────────────────────────────────────────┘
  ↓
onDataChange() → Reload Inventory UI

Xóa phiếu:
  ↓
  ┌──────────────────────────────────────────────┐
  │  BACKEND: deleteEncounter()                  │
  │                                              │
  │  FOR each prescription:                      │
  │    smartRestoreStock()                       │
  │    → cộng lại vào lô hạn sớm nhất           │
  │    → LOG: RESTORE                            │
  │                                              │
  │  DELETE encounters, clinical_events          │
  └──────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                    KHO DƯỢC (INVENTORY)                     │
└────────────────────────────────────────────────────────────┘

Nhập kho:
  ├─ Đơn lẻ    → importMedicine() + LOG(IMPORT)
  ├─ Excel     → N × importMedicine(skipLog) + LOG(IMPORT)
  └─ Đầu kỳ   → Excel + isSetupMode + LOG(IMPORT_INIT)

Xuất kho:
  ├─ Kê đơn    → smartDeductStock() FEFO + LOG(EXPORT_USE)
  ├─ Hủy       → importMedicine(-qty) + LOG(DESTROY/ADJUST)
  └─ Chuyển    → importMedicine(-qty) + .dat file + LOG(TRANSFER_OUT)

Nhận chuyển:
  Upload .dat → Validate → Verify qty → importMedicine() + LOG(TRANSFER_IN) + markFileImported()

Báo cáo:
  calculateFlowData()   → scan logs → Tồn đầu/Nhập/Kê đơn/Chuyển/Hủy/Tồn cuối
  calculateAnalysis()   → avgDaily → daysRemaining → predictedDate
  History              → lọc logs theo trạm & kỳ
  Export Excel          → Master rows + Batch detail rows
```

---

## 7. EDGE CASES & SAFETY

### Clinical

| Tình huống | Xử lý |
|-----------|-------|
| Thuốc hết hàng | Block thêm vào đơn, Alert |
| Kê vượt tồn kho | Cap tại maxStock (frontend validation) |
| Phác đồ có thuốc hết | Skip hoặc qty=0 |
| Nhân viên không có trong DB | Modal nhập mới (Clinical) / Thông báo (Kiosk) |
| Nhà thầu | patientId = "NHÀ THẦU" |
| Xóa phiếu | Auto hoàn kho toàn bộ thuốc đã kê |
| Refresh khi đang nhập | Skip reload nếu focus vào input/textarea |
| Real-time trigger | refreshTrigger prop từ App.tsx |
| FEFO không tìm được lô | Warn, không crash app |

### Inventory

| Tình huống | Xử lý |
|-----------|-------|
| Kê đơn vượt tồn | Warn + log, không crash (thiếu bao nhiêu ghi vào log) |
| Closing ≠ tồn thực | Fallback: adjust opening để giải thích chênh lệch |
| Transfer sai địa chỉ | Validate target == myStation, reject |
| Transfer tự chính mình | Reject (source == myStation) |
| Nhập transfer 2 lần | markFileImported() block |
| Excel hàng trống | Skip (name là bắt buộc) |
| Excel date invalid | Fallback: "2030-12-31" |
| Trùng lô thuốc khi nhập | Cộng dồn stock (không tạo dòng mới) |
| Setup mode Excel | LOG type = IMPORT_INIT → tính vào Tồn đầu, không vào Nhập |
| Xuất âm (hoàn kho) | stock += (-qty), UPDATE bình thường |

---

*Tài liệu được tạo tự động từ source code — GoertekVinaCare Smart Medical*
