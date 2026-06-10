import { User, Role, Medicine, Protocol, Symptom, StationType } from './types';

// --- DANH SÁCH NHÂN SỰ ---
export const STAFF_LIST: User[] = [
  { id: '1',  name: 'PHAN THỊ LOAN',       mnv: '0949894', role: Role.ADMIN,     canPrescribe: true, leaderView: true },
  { id: '2',  name: 'HÀ VĂN MẠNH',         mnv: '0910619', role: Role.STAFF,     canPrescribe: true },
  { id: '3',  name: 'DƯƠNG NGÔ HÙNG',       mnv: '1338733', role: Role.MODERATOR, canPrescribe: true },
  { id: '4',  name: 'NGUYỄN THỊ NHUNG',     mnv: '0710979', role: Role.STAFF,     canPrescribe: true },
  { id: '5',  name: 'TRẦN THỊ PHƯƠNG',      mnv: '0831488', role: Role.STAFF,     canPrescribe: true },
  { id: '6',  name: 'NGUYỄN THỊ HẰNG',      mnv: '0781866', role: Role.STAFF,     canPrescribe: true },
  { id: '7',  name: 'CHU THỊ DÂNG',         mnv: '0390741', role: Role.STAFF,     canPrescribe: true },
  { id: '8',  name: 'NGUYỄN THỊ THU THỦY',  mnv: '1347896', role: Role.STAFF,     canPrescribe: true },
  { id: '9',  name: 'NGUYỄN THỊ HUYỀN',     mnv: '1349595', role: Role.STAFF,     canPrescribe: true },
  { id: '10', name: 'NGUYỄN THÚY TRÀ',      mnv: '1439552', role: Role.STAFF,     canPrescribe: true },
  { id: '11', name: 'VŨ THỊ HÀ',            mnv: '0387432', role: Role.STAFF,     canPrescribe: true },
  { id: '12', name: 'NGÔ TRÍ TUỆ',          mnv: '1638051', role: Role.MODERATOR, canPrescribe: true, leaderView: true },
];

// --- 🔥 CẤU HÌNH MẠNG LƯỚI TRẠM (QUAN TRỌNG) 🔥 ---
// E4 là HUB, còn lại là SPOKE
export const STATION_PRESETS = [
  { name: 'E4', type: StationType.HUB, label: 'E4 (Trung tâm / HUB)' }, 
  { name: 'A6', type: StationType.SPOKE, label: 'Trạm A6' },
  { name: 'D4', type: StationType.SPOKE, label: 'Trạm D4' },
  { name: 'C6', type: StationType.SPOKE, label: 'Trạm C6' },
  // Bạn có thể thêm các trạm khác vào đây
];

// --- BỆNH TRUYỀN NHIỄM THEO NHÓM A/B/C (Luật PCBTN 2007) ---
export const INITIAL_INFECTIOUS_DISEASES: Record<'A' | 'B' | 'C', string[]> = {
  A: ['Bại liệt', 'Dịch hạch', 'Tả', 'Đậu mùa', 'Sốt vàng', 'Ebola', 'Marburg / Lassa', 'SARS', 'MERS-CoV', 'Cúm A/H5N1', 'Cúm A/H7N9', 'COVID-19'],
  B: ['Bạch hầu', 'Ho gà', 'Uốn ván', 'Sởi', 'Rubella', 'Quai bị', 'Thủy đậu', 'Viêm não Nhật Bản', 'Sốt xuất huyết Dengue', 'Sốt rét', 'Thương hàn', 'Viêm gan A', 'Viêm gan B', 'Viêm gan C', 'HIV/AIDS', 'Dại', 'Lỵ amíp', 'Lỵ trực khuẩn', 'Tiêu chảy cấp', 'Liên cầu lợn', 'Cúm mùa', 'Tay chân miệng', 'Sốt mò', 'Whitmore', 'Adenovirus'],
  C: ['Sốt phát ban', 'Ghẻ', 'Mắt hột', 'Nấm Candida', 'Giun sán', 'Nhiễm khuẩn hô hấp cấp', 'Lao']
};

// --- NHÓM BỆNH ---
export const DISEASE_GROUPS = [
  'Hô hấp / 呼吸科',
  'Tiêu hóa / 消化科',
  'Cơ xương khớp / 肌肉骨骼科',
  'Thần kinh / 神经科',
  'Tim mạch / 心脏科',
  'Da liễu / 皮肤科',
  'Tai Mũi Họng / 耳鼻喉科',
  'Răng Hàm Mặt / 口腔科',
  'Mắt / 眼科',
  'Ngoại khoa/Chấn thương / 外科/创伤',
  'Sản phụ khoa / 产科妇科',
  'Nội khoa khác / 其他内科',
  'Khác / 其他'
]; 

// --- 🔥 NHÓM THUỐC (PHẢI KHỚP VỚI DATABASE) 🔥 ---
export const MEDICINE_GROUPS = [
  'Hạ sốt giảm đau',
  'Thuốc Ho',
  'Thuốc Dạ dày',
  'Điều trị Rối loạn tiêu hóa',
  'Thuốc tiêu hóa khác',
  'Thuốc mắt',
  'Thuốc bôi ngoài',
  'Cao dán',
  'Thuốc chống viêm dị ứng',
  'Thuốc bổ',
  'Thuốc kháng sinh',
  'Khác'
];

// --- NHÓM VẬT TƯ Y TẾ ---
export const SUPPLY_GROUPS = [
  'Vật tư tiêu hao',
  'Thiết bị y tế',
  'Thiết bị sơ cấp cứu',
  'Văn phòng phẩm',
  'Khác'
];

// --- DỮ LIỆU MẪU (Dùng khi khởi tạo hoặc test) ---
export const INITIAL_MEDICINES: Medicine[] = [
  // Bạn có thể để rỗng hoặc giữ lại vài mẫu để test UI khi chưa có DB
];

export const INITIAL_PROTOCOLS: Protocol[] = [
  {
    id: 'p1',
    name: 'Cảm cúm / 流感',
    diagnosis: 'Viêm đường hô hấp trên',
    diseaseGroup: 'Hô hấp / 呼吸科',
    medicines: [{ medicineId: 'm1', quantity: 2 }, { medicineId: 'm3', quantity: 2 }],
    isApproved: true
  },
  {
    id: 'p2',
    name: 'Đau bụng / 腹痛',
    diagnosis: 'Rối loạn tiêu hóa',
    diseaseGroup: 'Tiêu hóa / 消化科',
    medicines: [{ medicineId: 'm2', quantity: 5 }, { medicineId: 'm4', quantity: 1 }],
    isApproved: true
  }
];

export const INITIAL_SYMPTOMS: Symptom[] = [
  { id: 'sym1', vi: 'Đau đầu', cn: '头痛', icon: 'Frown' },
  { id: 'sym2', vi: 'Đau bụng', cn: '腹痛', icon: 'CircleDot' },
  { id: 'sym3', vi: 'Sốt', cn: '发烧', icon: 'Thermometer' },
  { id: 'sym4', vi: 'Ho / Đau họng', cn: '咳嗽/喉咙痛', icon: 'Wind' },
  { id: 'sym5', vi: 'Chấn thương', cn: '外伤', icon: 'Bandage' },
  { id: 'sym6', vi: 'Mệt mỏi', cn: '疲劳', icon: 'BatteryLow' },
];