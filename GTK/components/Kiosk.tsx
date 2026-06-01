import React, { useState, useEffect, useRef } from 'react';
import { User, QrCode, AlertTriangle, Delete, ArrowRight, RotateCcw } from 'lucide-react';
import { storage } from '../services/storage';
import { Encounter, EncounterStatus, Symptom } from '../types';

export const Kiosk: React.FC<{ stationId: string; stationName: string }> = ({ stationId, stationName }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 'error'>(1);
  const [employeeId, setEmployeeId] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [patientInfo, setPatientInfo] = useState<{name: string, dept: string} | null>(null);
  const [symptomsList, setSymptomsList] = useState<Symptom[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Ref để giữ focus cho máy quét thẻ
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSymptomsList(storage.getSymptoms());
  }, []);

  // Tự động focus lại vào ô nhập liệu để nhận tín hiệu từ máy quét thẻ
  useEffect(() => {
    if (step === 1) {
      const focusInterval = setInterval(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 1000); // Check mỗi giây để đảm bảo luôn focus
      return () => clearInterval(focusInterval);
    }
  }, [step]);

  useEffect(() => {
    let timer: any;
    if (step === 3 || step === 'error') {
      setCountdown(step === 'error' ? 5 : 3);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
             clearInterval(timer);
             resetKiosk();
             return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step]);

  const resetKiosk = () => {
    setStep(1);
    setEmployeeId('');
    setSelectedSymptoms([]);
    setPatientInfo(null);
    setIsSubmitting(false);
    // Focus lại ngay khi reset
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // --- XỬ LÝ LOGIC CHECK MÃ ---
  const processSubmit = (idToCheck: string) => {
    if (!idToCheck.trim()) return;
    const id = idToCheck.trim().toUpperCase();
    
    let exists = false;
    let patientData = null;

    // Logic giả lập check nhân viên
    if (id.startsWith('1') || id.startsWith('V')) {
        const dbPatient = storage.findPatient(id);
        if (dbPatient) {
            patientData = dbPatient;
        } else {
            patientData = { name: 'NHAN VIEN MOI', department: 'UNKNOWN' };
        }
        exists = true;
    } else {
        const dbPatient = storage.findPatient(id);
        if (dbPatient) {
            patientData = dbPatient;
            exists = true;
        }
    }
    
    if (exists && patientData) {
        setPatientInfo({
          name: patientData.name,
          dept: patientData.department
        });
        setStep(2);
    } else {
        setStep('error');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processSubmit(employeeId);
  };

  // --- XỬ LÝ BÀN PHÍM SỐ (VIRTUAL KEYPAD) ---
  const handleKeypadPress = (num: string) => {
    if (employeeId.length < 10) {
      setEmployeeId(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setEmployeeId(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setEmployeeId('');
    inputRef.current?.focus();
  };

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!patientInfo || isSubmitting) return;
    setIsSubmitting(true);

    const newEncounter: Encounter = {
      id: crypto.randomUUID(),
      patientId: employeeId,
      patientName: patientInfo.name,
      department: patientInfo.dept,
      symptoms: selectedSymptoms.map(sid => {
        const s = symptomsList.find(sym => sym.id === sid);
        return s ? `${s.vi} (${s.cn})` : sid;
      }),
      startTime: Date.now(),
      status: EncounterStatus.WAITING,
      prescriptions: [],
      stationId: stationId,
      stationName: stationName || 'Unknown'
    };

    try {
        if (window.electron) {
            console.log("📤 [Kiosk] Sending to DB:", newEncounter);
            await window.electron.createEncounter(newEncounter);
        } else {
            storage.addEncounter(newEncounter);
        }
        setStep(3);
    } catch (error) {
        console.error("Lỗi khi lấy số:", error);
        alert("Lỗi hệ thống! Không thể lấy số.");
        setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full h-screen p-4 flex items-center justify-center bg-gray-100 select-none">
      
      {/* STEP 1: LOGIN / QUẸT THẺ */}
      {step === 1 && (
        <div className="w-full h-full max-h-[900px] flex bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-200">
          
          {/* Cột trái: Thông tin chào mừng */}
          <div className="w-5/12 bg-green-50 flex flex-col items-center justify-center p-8 text-center border-r border-gray-100">
             <div className="w-48 h-48 bg-white rounded-full flex items-center justify-center shadow-lg mb-8 text-medical-green animate-pulse">
                <QrCode size={120} />
             </div>
             <h2 className="text-5xl font-extrabold text-gray-800 mb-4 leading-tight">
               QUẸT THẺ <br/> <span className="text-3xl text-gray-400 font-normal">hoặc nhập mã</span>
             </h2>
             <p className="text-2xl text-gray-500 font-medium opacity-80">请刷卡或输入员工ID</p>
          </div>

          {/* Cột phải: Bàn phím số & Hiển thị */}
          <div className="w-7/12 flex flex-col items-center justify-center p-8 bg-white relative">
            
            {/* Input ẩn để hứng dữ liệu từ máy quét thẻ */}
            <input 
                ref={inputRef}
                type="text" 
                className="opacity-0 absolute top-0 left-0 w-1 h-1"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') processSubmit(employeeId);
                }}
                autoFocus
            />

            {/* Màn hình hiển thị số đã nhập */}
            <div className="w-full max-w-md mb-8">
                <div className="w-full h-24 bg-gray-100 rounded-2xl border-2 border-gray-300 flex items-center justify-center text-6xl font-mono font-bold text-gray-700 shadow-inner relative overflow-hidden">
                    {employeeId || <span className="text-gray-300 text-4xl font-sans">Nhập mã số...</span>}
                    {employeeId && (
                         <button onClick={handleClear} className="absolute right-4 text-gray-400 hover:text-red-500">
                             <RotateCcw size={32} />
                         </button>
                    )}
                </div>
            </div>

            {/* Bàn phím số (Grid Layout) */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-md">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button 
                    key={num} 
                    onClick={() => handleKeypadPress(num.toString())}
                    className="h-24 bg-white border-2 border-gray-100 rounded-2xl text-4xl font-bold text-gray-700 shadow-sm hover:bg-green-50 hover:border-green-200 active:scale-95 transition-all"
                  >
                    {num}
                  </button>
                ))}
                
                {/* Hàng cuối: 0 và các nút chức năng */}
                <button 
                    onClick={handleBackspace}
                    className="h-24 bg-red-50 border-2 border-red-100 rounded-2xl flex items-center justify-center text-red-500 hover:bg-red-100 active:scale-95 transition-all"
                >
                    <Delete size={40} />
                </button>

                <button 
                    onClick={() => handleKeypadPress('0')}
                    className="h-24 bg-white border-2 border-gray-100 rounded-2xl text-4xl font-bold text-gray-700 shadow-sm hover:bg-green-50 hover:border-green-200 active:scale-95 transition-all"
                >
                    0
                </button>

                <button 
                    onClick={() => processSubmit(employeeId)}
                    disabled={!employeeId}
                    className="h-24 bg-medical-green text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowRight size={48} />
                </button>
            </div>
            
            <p className="mt-8 text-gray-400 text-sm">Chạm vào màn hình để nhập liệu</p>
          </div>
        </div>
      )}

      {/* STEP ERROR: BÁO LỖI */}
      {step === 'error' && (
          <div className="bg-white p-20 rounded-[3rem] shadow-2xl text-center relative overflow-hidden max-w-4xl w-full border border-red-200">
            <div className="absolute top-0 left-0 w-full h-3 bg-red-100">
                <div className="h-full bg-red-500 transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 5) * 100}%` }}></div>
            </div>
            
            <div className="w-40 h-40 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-10 text-red-500 border-4 border-white shadow-lg animate-pulse">
                <AlertTriangle size={80} />
            </div>
            <h2 className="text-5xl font-extrabold text-gray-800 mb-6 tracking-tight">Không tìm thấy dữ liệu</h2>
            <p className="text-3xl text-gray-600 font-medium">Mã nhân viên: <b>{employeeId}</b> chưa được cập nhật.</p>
            <p className="text-2xl text-gray-400 mt-4 mb-12">未找到数据。 请联系医务人员。</p>

            <button onClick={resetKiosk} className="px-10 py-5 bg-gray-100 rounded-full border border-gray-300 text-2xl font-bold text-gray-600 hover:bg-gray-200">
                Thử lại ngay ({countdown}s)
            </button>
          </div>
      )}

      {/* STEP 2: CHỌN TRIỆU CHỨNG */}
      {step === 2 && patientInfo && (
        <div className="w-full h-full max-h-[900px] bg-white rounded-[2rem] shadow-2xl flex overflow-hidden border border-gray-200">
           {/* Left Info Panel */}
           <div className="w-4/12 bg-blue-50/50 flex flex-col p-10 justify-between border-r border-gray-100">
              <div>
                  <div className="mb-2 text-gray-500 text-xl font-bold uppercase tracking-wider">Xin chào / 您好</div>
                  <h3 className="text-5xl font-extrabold text-medical-green mb-4 leading-tight">{patientInfo.name}</h3>
                  <div className="inline-block bg-white px-6 py-4 rounded-2xl border border-blue-100 shadow-sm w-full">
                      <p className="text-2xl text-gray-700 font-bold font-mono mb-1">{patientInfo.dept}</p>
                      <p className="text-lg text-gray-400 font-mono">ID: {employeeId}</p>
                  </div>
              </div>

              <div className="my-6">
                 <h4 className="text-4xl font-bold text-gray-800 mb-2 leading-snug">Bạn đang bị sao?</h4>
                 <p className="text-2xl text-gray-500 font-medium mb-6">您感觉如何?</p>
                 <div className="p-4 bg-white/80 rounded-xl border border-dashed border-gray-300 text-gray-500 text-lg">
                    Vui lòng chọn các triệu chứng ở màn hình bên phải.
                 </div>
              </div>

              <button 
                onClick={() => setStep(1)} 
                className="w-full bg-white border-2 border-gray-200 text-gray-500 text-2xl font-bold py-5 rounded-2xl hover:bg-gray-50 hover:text-gray-700 transition-all"
              >
                 Quay lại / 返回
              </button>
           </div>

           {/* Right Symptoms Panel */}
           <div className="w-8/12 p-6 flex flex-col bg-white">
              <div className="flex-1 grid grid-cols-3 gap-4 auto-rows-fr h-full overflow-y-auto pb-4">
                 {symptomsList.map(sym => (
                    <button
                      key={sym.id}
                      onClick={() => toggleSymptom(sym.id)}
                      className={`relative rounded-3xl border-4 flex flex-col items-center justify-center text-center transition-all duration-200 active:scale-95 p-2 ${
                        selectedSymptoms.includes(sym.id)
                          ? 'border-medical-green bg-green-50 text-medical-green shadow-xl ring-2 ring-green-100 z-10'
                          : 'border-gray-100 hover:border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex flex-col justify-center items-center w-full">
                        <span className="text-2xl md:text-3xl font-extrabold mb-1 w-full break-words">{sym.vi}</span>
                        <span className="text-lg md:text-xl opacity-70 w-full break-words">{sym.cn}</span>
                      </div>
                      {selectedSymptoms.includes(sym.id) && (
                          <div className="absolute top-3 right-3 w-8 h-8 bg-medical-green rounded-full flex items-center justify-center text-white shadow-md">
                              ✓
                          </div>
                      )}
                    </button>
                 ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                  <button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="w-full bg-medical-green text-white text-4xl font-bold py-6 rounded-2xl shadow-xl hover:bg-green-600 transition-all active:scale-95 flex items-center justify-center space-x-4 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <span>{isSubmitting ? 'Đang xử lý...' : 'Xác nhận khám / 确认'}</span>
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* STEP 3: SUCCESS */}
      {step === 3 && (
        <div className="bg-white p-20 rounded-[3rem] shadow-2xl text-center relative overflow-hidden max-w-4xl w-full border border-gray-200">
           <div className="absolute top-0 left-0 w-full h-3 bg-gray-100">
               <div className="h-full bg-medical-green transition-all duration-1000 ease-linear" style={{ width: `${(countdown / 3) * 100}%` }}></div>
           </div>
           
           <div className="w-40 h-40 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-10 text-medical-green animate-bounce border-4 border-white shadow-lg">
             <User size={80} />
           </div>
           <h2 className="text-6xl font-extrabold text-medical-green mb-6 tracking-tight">Đăng ký thành công!</h2>
           <p className="text-4xl text-gray-600 font-medium">Vui lòng ngồi chờ gọi tên.</p>
           <p className="text-3xl text-gray-400 mt-4 mb-12">注册成功！请稍候。</p>

           <div className="inline-block px-10 py-5 bg-gray-50 rounded-full border border-gray-200">
               <span className="text-2xl font-bold text-gray-500">Tự động quay lại sau <span className="text-medical-green text-4xl mx-2 font-mono">{countdown}</span> giây</span>
           </div>
        </div>
      )}
    </div>
  );
};