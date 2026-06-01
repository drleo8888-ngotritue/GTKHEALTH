/**
 * Anonymize patient data before sending to Gemini AI.
 *
 * NEVER include: employee_id, patient_name, phone, CCCD/CMND, department name.
 * ONLY include: medical indicators, health class, diagnoses, medicine names.
 */

function getAgeGroup(yearOfBirth) {
  if (!yearOfBirth) return null;
  const age = new Date().getFullYear() - yearOfBirth;
  if (age < 25) return 'dưới 25 tuổi';
  if (age < 30) return '25–29 tuổi';
  if (age < 35) return '30–34 tuổi';
  if (age < 40) return '35–39 tuổi';
  if (age < 45) return '40–44 tuổi';
  if (age < 50) return '45–49 tuổi';
  if (age < 55) return '50–54 tuổi';
  return '55 tuổi trở lên';
}

function parsePrescriptions(prescriptionsJson) {
  if (!prescriptionsJson) return [];
  try {
    const items = JSON.parse(prescriptionsJson);
    if (!Array.isArray(items)) return [];
    // Chỉ lấy tên thuốc và nhóm thuốc — bỏ ID, batch, v.v.
    return items.map(p => ({
      medicine: p.medicineName || p.name || 'Không rõ',
      group: p.groupName || p.group || '',
      quantity: p.quantity,
      unit: p.unit,
    }));
  } catch {
    return [];
  }
}

function parseExamDetails(examDetailsJson) {
  if (!examDetailsJson) return {};
  try {
    return typeof examDetailsJson === 'string' ? JSON.parse(examDetailsJson) : examDetailsJson;
  } catch {
    return {};
  }
}

/**
 * Build anonymized health summary to pass as AI context.
 * @param {object} opts
 * @param {string} opts.gender - "Nam" / "Nữ"
 * @param {number|null} opts.yearOfBirth - năm sinh (có thể null)
 * @param {Array} opts.checkups - rows from health_checkups
 * @param {Array} opts.encounters - rows from encounters (recent)
 * @returns {object} safe to serialize and send to Gemini
 */
function anonymize({ gender, yearOfBirth, checkups, encounters }) {
  return {
    // Demographics — không có tên, mã NV, số điện thoại, CCCD
    gender: gender || null,
    ageGroup: getAgeGroup(yearOfBirth),

    // Lịch sử KSK (tối đa 5 kỳ gần nhất)
    healthCheckups: checkups.slice(0, 5).map(c => ({
      year: c.year,
      month: c.checkup_month || null,
      healthClass: c.health_class || null,        // Loại I/II/III/IV/V
      conclusion: c.health_conclusion || null,     // Kết luận sức khỏe
      diseases: c.disease_conclusion || null,      // Bệnh phát hiện
      consultation: c.consultation || null,        // Tư vấn bác sĩ
      examDetails: parseExamDetails(c.exam_details), // Chỉ số: huyết áp, BMI...
    })),

    // Ca khám gần đây (tối đa 10 ca, 6 tháng qua)
    recentVisits: encounters.slice(0, 10).map(e => ({
      date: e.start_time ? new Date(e.start_time).toLocaleDateString('vi-VN') : null,
      symptoms: e.symptoms || null,
      diagnosis: e.diagnosis || null,
      diseaseGroup: e.disease_group || null,
      medicines: parsePrescriptions(e.prescriptions),
      outcome: e.status || null,
    })),
  };
}

module.exports = { anonymize };
