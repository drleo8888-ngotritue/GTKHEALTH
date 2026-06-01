const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const authMiddleware = require('../middleware/auth');
const db = require('../db');
const { anonymize } = require('../utils/anonymize');
const config = require('../config');

router.use(authMiddleware);

router.use((req, res, next) => {
  if (req.user.mustChange) {
    return res.status(403).json({ error: 'Vui lòng đổi mật khẩu trước', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
});

if (!config.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY chưa cấu hình — chatbot sẽ không hoạt động');
}

const groq = config.GROQ_API_KEY ? new Groq({ apiKey: config.GROQ_API_KEY }) : null;

function buildSystemPrompt(anonData) {
  const lines = [
    'Bạn là trợ lý sức khỏe AI của phòng y tế nhà máy.',
    'Dưới đây là hồ sơ sức khỏe ẩn danh của người dùng (không có tên, mã NV, số điện thoại, CCCD):',
    '',
    `- Giới tính: ${anonData.gender || 'Không rõ'}`,
    `- Nhóm tuổi: ${anonData.ageGroup || 'Không rõ'}`,
    '',
  ];

  if (anonData.healthCheckups.length > 0) {
    lines.push('## KẾT QUẢ KHÁM SỨC KHỎE ĐỊNH KỲ:');
    for (const c of anonData.healthCheckups) {
      lines.push(`\n### Năm ${c.year}${c.month ? ` (tháng ${c.month})` : ''}:`);
      if (c.healthClass) lines.push(`- Phân loại sức khỏe: ${c.healthClass}`);
      if (c.conclusion) lines.push(`- Kết luận: ${c.conclusion}`);
      if (c.diseases) lines.push(`- Bệnh phát hiện: ${c.diseases}`);
      if (c.consultation) lines.push(`- Tư vấn: ${c.consultation}`);
      if (c.examDetails && Object.keys(c.examDetails).length > 0) {
        lines.push('- Chỉ số đo lường:');
        for (const [k, v] of Object.entries(c.examDetails)) {
          if (v !== null && v !== undefined && v !== '') {
            lines.push(`  • ${k}: ${v}`);
          }
        }
      }
    }
    lines.push('');
  }

  if (anonData.recentVisits.length > 0) {
    lines.push('## CA KHÁM GẦN ĐÂY (6 THÁNG QUA):');
    for (const v of anonData.recentVisits) {
      lines.push(`\n- Ngày: ${v.date || 'Không rõ'}`);
      if (v.symptoms) lines.push(`  Triệu chứng: ${v.symptoms}`);
      if (v.diagnosis) lines.push(`  Chẩn đoán: ${v.diagnosis}`);
      if (v.diseaseGroup) lines.push(`  Nhóm bệnh: ${v.diseaseGroup}`);
      if (v.medicines.length > 0) {
        lines.push(`  Thuốc kê: ${v.medicines.map(m => m.medicine).join(', ')}`);
      }
    }
    lines.push('');
  }

  lines.push(
    '## HƯỚNG DẪN TRẢ LỜI:',
    '1. Trả lời bằng tiếng Việt, thân thiện, dễ hiểu với công nhân.',
    '2. Giải thích ý nghĩa các chỉ số sức khỏe khi được hỏi.',
    '3. Đưa ra lời khuyên phòng ngừa, lối sống phù hợp với tình trạng sức khỏe.',
    '4. KHÔNG chẩn đoán thay bác sĩ. Nếu có vấn đề nghiêm trọng, hãy khuyên đến gặp bác sĩ.',
    '5. KHÔNG yêu cầu hoặc đề cập đến thông tin cá nhân như tên, số điện thoại, số CCCD.',
    '6. Nếu câu hỏi không liên quan đến sức khỏe, hãy nhẹ nhàng từ chối và hướng về chủ đề sức khỏe.',
  );

  return lines.join('\n');
}

// POST /api/chat — streaming response
// Body: { message: string, history: [{role: 'user'|'assistant', content: string}][] }
router.post('/', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Tin nhắn không được để trống' });
  }
  if (!groq) {
    return res.status(503).json({ error: 'Chatbot AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.' });
  }

  try {
    const employeeId = req.user.employeeId;
    const checkups  = db.getCheckups(employeeId);
    const encounters = db.getRecentEncounters(employeeId, 6);
    const gender = checkups[0]?.gender || null;

    // Ẩn danh hóa — KHÔNG gửi tên, mã NV, CCCD lên AI
    const anonData = anonymize({ gender, yearOfBirth: null, checkups, encounters });
    const systemPrompt = buildSystemPrompt(anonData);

    // Validate history (Groq/OpenAI format: role user|assistant, content string)
    const safeHistory = Array.isArray(history)
      ? history.slice(-20).filter(h =>
          (h.role === 'user' || h.role === 'assistant') &&
          typeof h.content === 'string' && h.content.trim()
        )
      : [];

    const messages = [
      { role: 'system',    content: systemPrompt },
      ...safeHistory,
      { role: 'user',      content: message.trim() },
    ];

    // Stream response về client
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const stream = await groq.chat.completions.create({
      messages,
      model: 'llama-3.1-8b-instant',
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) res.write(text);
    }
    res.end();

  } catch (err) {
    console.error('chat error:', err);
    if (!res.headersSent) {
      const msg = err.message || '';
      if (msg.includes('401') || msg.includes('API_KEY')) {
        return res.status(503).json({ error: 'API key không hợp lệ. Liên hệ quản trị viên.' });
      }
      if (msg.includes('429') || msg.includes('quota')) {
        return res.status(429).json({ error: 'Hệ thống AI đang bận, vui lòng thử lại sau ít phút.' });
      }
      res.status(500).json({ error: 'Không thể kết nối AI, vui lòng thử lại.' });
    } else {
      res.end();
    }
  }
});

module.exports = router;
