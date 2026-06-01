# Dữ liệu nền mặc định (Seed Data)

Toàn bộ dữ liệu được khởi tạo tự động khi app chạy lần đầu.  
Nguồn: `constants.ts`, `services/storage.ts`, `db-service.js`

---

## 1. Nhân viên Y tế (STAFF_LIST)

Danh sách tài khoản đăng nhập vào app. Nguồn: `constants.ts`

| ID | Họ tên | Vai trò | Kê đơn |
|---|---|---|---|
| 1 | PHAN THỊ LOAN | ADMIN | ✅ |
| 2 | HÀ VĂN MẠNH | STAFF | ✅ |
| 3 | DƯƠNG NGÔ HÙNG | MODERATOR | ✅ |
| 4 | NGUYỄN THỊ NHUNG | STAFF | ✅ |
| 5 | TRẦN THỊ PHƯƠNG | STAFF | ✅ |
| 6 | NGUYỄN THỊ HẰNG | STAFF | ✅ |
| 7 | CHU THỊ DÂNG | STAFF | ✅ |
| 8 | NGUYỄN THỊ THU THỦY | STAFF | ✅ |
| 9 | NGUYỄN THỊ HUYỀN | STAFF | ✅ |
| 10 | NGUYỄN THÚY TRÀ | STAFF | ✅ |
| 11 | VŨ THỊ HÀ | STAFF | ✅ |
| 12 | NGÔ TRÍ TUỆ | MODERATOR | ✅ |

---

## 2. Danh sách Trạm (STATION_PRESETS)

Nguồn: `constants.ts`

| Tên trạm | Loại | Ghi chú |
|---|---|---|
| E4 | HUB | Trung tâm — quản lý tất cả Spoke |
| A6 | SPOKE | Trạm phân nhánh |
| D4 | SPOKE | Trạm phân nhánh |
| C6 | SPOKE | Trạm phân nhánh |

---

## 3. Danh mục Thuốc mặc định (36 loại)

Nguồn: `db-service.js` — tự động nạp vào SQLite khi kho trống.  
Tất cả có `batch_number = 'DANH_MUC_GOC'`, `station = 'MASTER_DATA'`, `stock = 0`.

| STT | ID | Tên thuốc | Nhóm thuốc | Đơn vị |
|---|---|---|---|---|
| 1 | MED_001 | Panadol Extra | Hạ sốt giảm đau | Viên |
| 2 | MED_002 | Efferalgan sủi | Hạ sốt giảm đau | Viên |
| 3 | MED_003 | Panadol cảm cúm | Hạ sốt giảm đau | Viên |
| 4 | MED_004 | Codacmin | Hạ sốt giảm đau | Viên |
| 5 | MED_005 | Viên ngậm ho Eugica | Thuốc Ho | Viên |
| 6 | MED_006 | Methorphan | Thuốc Ho | Viên |
| 7 | MED_007 | Siro ho Bảo thanh | Thuốc Ho | Viên |
| 8 | MED_008 | Yumangel | Thuốc Dạ dày | Gói |
| 9 | MED_009 | Omeprazol 20mg | Thuốc Dạ dày | Viên |
| 10 | MED_010 | Biolac men tiêu hóa | Điều trị Rối loạn tiêu hóa | Viên |
| 11 | MED_011 | Flamipio Loperamid | Điều trị Rối loạn tiêu hóa | Viên |
| 12 | MED_023 | Nospa | Thuốc tiêu hóa khác | Viên |
| 13 | MED_024 | Trà gừng 3g | Thuốc tiêu hóa khác | Gói |
| 14 | MED_025 | Thuốc bôi nhiệt miệng Oracortia | Thuốc tiêu hóa khác | Gói |
| 15 | MED_012 | Natriclorid 0,9% 10ml | Thuốc mắt | Lọ |
| 16 | MED_013 | Dexalevo | Thuốc mắt | Lọ |
| 17 | MED_014 | Tomax | Thuốc bôi ngoài | Tuyp |
| 18 | MED_015 | Gentrisone | Thuốc bôi ngoài | Tuyp |
| 19 | MED_033 | Acyclovir | Thuốc bôi ngoài | Tuyp |
| 20 | MED_034 | Panthenol | Thuốc bôi ngoài | Lọ |
| 21 | MED_035 | Yoosun rau má | Thuốc bôi ngoài | Tuyp |
| 22 | MED_016 | Salonpas | Cao dán | Gói |
| 23 | MED_017 | Salonsip | Cao dán | Gói |
| 24 | MED_018 | Bạch hổ hoạt lạc cao | Cao dán | Lọ |
| 25 | MED_019 | Dầu gió trường sơn phật linh | Cao dán | Lọ |
| 26 | MED_020 | Thylmedi 16mg | Thuốc chống viêm dị ứng | Viên |
| 27 | MED_021 | Loratadin 10mg | Thuốc chống viêm dị ứng | Viên |
| 28 | MED_022 | Alphachoay | Thuốc chống viêm dị ứng | Viên |
| 29 | MED_026 | Naphazolin | Thuốc chống viêm dị ứng | Lọ |
| 30 | MED_027 | Oresol | Thuốc bổ | Gói |
| 31 | MED_028 | Bổ máu Fevit | Thuốc bổ | Viên |
| 32 | MED_029 | Hoạt huyết | Thuốc bổ | Viên |
| 33 | MED_030 | Sủi tăng lực | Thuốc bổ | Lọ |
| 34 | MED_036 | Thymo Immusta | Thuốc bổ | Viên |
| 35 | MED_031 | Amoxicyclin 500mg | Thuốc kháng sinh | Viên |
| 36 | MED_032 | Augcixine 1g | Thuốc kháng sinh | Viên |

---

## 4. Nhóm bệnh (DISEASE_GROUPS)

Nguồn: `constants.ts` — có thể chỉnh sửa trong Admin → Quản lý Nhóm bệnh.

| # | Tên nhóm |
|---|---|
| 1 | Hô hấp / 呼吸科 |
| 2 | Tiêu hóa / 消化科 |
| 3 | Cơ xương khớp / 肌肉骨骼科 |
| 4 | Thần kinh / 神经科 |
| 5 | Tim mạch / 心脏科 |
| 6 | Da liễu / 皮肤科 |
| 7 | Tai Mũi Họng / 耳鼻喉科 |
| 8 | Răng Hàm Mặt / 口腔科 |
| 9 | Mắt / 眼科 |
| 10 | Ngoại khoa/Chấn thương / 外科/创伤 |
| 11 | Sản phụ khoa / 产科妇科 |
| 12 | Nội khoa khác / 其他内科 |
| 13 | Khác / 其他 |

---

## 5. Nhóm thuốc (MEDICINE_GROUPS)

Nguồn: `constants.ts`

| # | Tên nhóm |
|---|---|
| 1 | Hạ sốt giảm đau |
| 2 | Thuốc Ho |
| 3 | Thuốc Dạ dày |
| 4 | Điều trị Rối loạn tiêu hóa |
| 5 | Thuốc tiêu hóa khác |
| 6 | Thuốc mắt |
| 7 | Thuốc bôi ngoài |
| 8 | Cao dán |
| 9 | Thuốc chống viêm dị ứng |
| 10 | Thuốc bổ |
| 11 | Thuốc kháng sinh |
| 12 | Khác |

---

## 6. Nhóm vật tư y tế (SUPPLY_GROUPS)

Nguồn: `constants.ts`

| # | Tên nhóm |
|---|---|
| 1 | Vật tư tiêu hao |
| 2 | Thiết bị y tế |
| 3 | Thiết bị sơ cấp cứu |
| 4 | Văn phòng phẩm |
| 5 | Khác |

---

## 7. Triệu chứng mặc định (INITIAL_SYMPTOMS)

Nguồn: `constants.ts` — có thể chỉnh sửa trong Admin → Quản lý Triệu chứng.

| ID | Tiếng Việt | Tiếng Trung | Icon |
|---|---|---|---|
| sym1 | Đau đầu | 头痛 | Frown |
| sym2 | Đau bụng | 腹痛 | CircleDot |
| sym3 | Sốt | 发烧 | Thermometer |
| sym4 | Ho / Đau họng | 咳嗽/喉咙痛 | Wind |
| sym5 | Chấn thương | 外伤 | Bandage |
| sym6 | Mệt mỏi | 疲劳 | BatteryLow |

---

## 8. Phác đồ mặc định (INITIAL_PROTOCOLS)

Nguồn: `constants.ts` — có thể chỉnh sửa trong Admin → Quản lý Phác đồ.

| ID | Tên phác đồ | Chẩn đoán | Nhóm bệnh |
|---|---|---|---|
| p1 | Cảm cúm / 流感 | Viêm đường hô hấp trên | Hô hấp / 呼吸科 |
| p2 | Đau bụng / 腹痛 | Rối loạn tiêu hóa | Tiêu hóa / 消化科 |

---

## 9. Nhân viên mẫu — CHỈ DÙNG ĐỂ TEST

> ⚠️ Dữ liệu giả, chỉ dùng khi chưa import danh sách nhân viên thật.  
> Thay thế bằng file Excel thực tế qua Admin → Quản lý Nhân viên.

Nguồn: `services/storage.ts`

| Mã NV | Họ tên | Bộ phận |
|---|---|---|
| 100001 | NGUYEN VAN AN | ASSEMBLY A1 |
| 100002 | TRAN THI BICH | QA/QC |
| 100003 | LE VAN CUONG | WAREHOUSE |
| 123456 | PHAM THI DUNG | HR |

---

## Ghi chú

| Loại dữ liệu | Có thể sửa trong app? | Nơi sửa |
|---|---|---|
| Nhân viên y tế | ❌ Phải sửa code | `constants.ts` |
| Trạm | ❌ Phải sửa code | `constants.ts` |
| Danh mục thuốc | ✅ | Admin → Import Excel hoặc nhập tay |
| Nhóm bệnh | ✅ | Admin → Quản lý Nhóm bệnh |
| Triệu chứng | ✅ | Admin → Quản lý Triệu chứng |
| Phác đồ | ✅ | Admin → Quản lý Phác đồ |
| Nhân viên lao động | ✅ | Admin → Quản lý Nhân viên (import Excel) |
