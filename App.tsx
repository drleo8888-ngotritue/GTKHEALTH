import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom'; // 🔥 QUAN TRỌNG: Thêm Router
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Kiosk } from './components/Kiosk';
import { Clinical } from './components/Clinical';
import { Inventory } from './components/Inventory';
import { Reports } from './components/Reports';
import { RestMonitor } from './components/RestMonitor';
import { Admin } from './components/Admin';
import { StationConfig, StationType, User } from './types';
import { STAFF_LIST, STATION_PRESETS } from './constants';
import { storage } from './services/storage';
import { Settings, Lock, AlertTriangle } from 'lucide-react';

// --- CÁC COMPONENT SETUP, LOGIN, MODAL (GIỮ NGUYÊN NHƯ CŨ) ---

const SetupScreen: React.FC<{ onSetup: (config: StationConfig) => void }> = ({ onSetup }) => {
  const allStations = storage.getKnownStations().length > 0
    ? storage.getKnownStations()
    : STATION_PRESETS.map(p => ({ name: p.name, type: p.type }));
  const [selectedPreset, setSelectedPreset] = useState(allStations[0]?.name || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const preset = allStations.find(p => p.name === selectedPreset);
    if (!preset) return;
    onSetup({
      id: crypto.randomUUID(),
      name: preset.name,
      type: preset.type as StationType,
      isConfigured: true
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
        <h1 className="text-2xl font-bold text-medical-green mb-6 flex items-center">
          <Settings className="mr-2"/> Thiết lập Trạm (Station Setup)
        </h1>
        <p className="text-sm text-gray-500 mb-6 bg-yellow-50 p-3 rounded border border-yellow-200">
            ⚠️ Lưu ý: Máy tính này sẽ bị <strong>KHÓA CỨNG (Ghim)</strong> với cấu hình này.
            <br/>注意：此计算机将被<strong>锁定</strong>在此配置中。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">Chọn Trạm / 选择站点</label>
             <select
               value={selectedPreset}
               onChange={e => setSelectedPreset(e.target.value)}
               className="w-full border p-3 rounded-lg text-lg"
             >
                {allStations.map(p => (
                  <option key={p.name} value={p.name}>{p.name} ({p.type})</option>
                ))}
             </select>
           </div>
           <button type="submit" className="w-full bg-medical-green text-white py-3 rounded-lg font-bold hover:bg-green-600 transition">
             Lưu cấu hình / 保存配置
           </button>
        </form>
      </div>
    </div>
  );
};

const ResetModal: React.FC<{ onClose: () => void, onConfirm: () => void }> = ({ onClose, onConfirm }) => {
    const [password, setPassword] = useState("");
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmitPass = () => {
        if (password === 'abc1234' || password === 'abc123') {
            setShowConfirm(true);
        } else {
            alert('Sai mật khẩu! / 密码错误!');
            setPassword("");
        }
    };

    const handleFinalConfirm = () => {
        onConfirm();
    };

    if (showConfirm) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-xl w-80 shadow-2xl relative animate-scale-in">
                    <div className="text-center mb-4 text-red-600">
                        <AlertTriangle className="mx-auto mb-2" size={32}/>
                        <h3 className="font-bold text-lg">Xác nhận xóa? / 确认删除?</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-6 text-center">
                        Bạn có chắc chắn muốn xóa cấu hình trạm này? Hành động này không thể hoàn tác.
                        <br/>您确定要删除此站点配置吗？此操作无法撤消。
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowConfirm(false)} className="text-gray-500 font-bold px-3 py-2">Quay lại / 返回</button>
                        <button onClick={handleFinalConfirm} className="bg-red-600 text-white font-bold px-3 py-2 rounded shadow-lg hover:bg-red-700">
                            XÓA CẤU HÌNH / 删除配置
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl w-80 shadow-2xl relative animate-scale-in">
                <h3 className="font-bold mb-4 text-gray-800">Thoát trạm / 重置站点</h3>
                <input 
                    autoFocus
                    type="password" 
                    placeholder="Mật khẩu / 密码 (abc123)" 
                    className="w-full border-2 p-2 rounded mb-4 focus:ring-2 focus:ring-red-500 outline-none"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmitPass()}
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="text-gray-500 font-bold px-3 py-2">Hủy / 取消</button>
                    <button onClick={handleSubmitPass} className="bg-red-500 text-white font-bold px-3 py-2 rounded hover:bg-red-600">Tiếp tục / 继续</button>
                </div>
            </div>
        </div>
    );
};

const LoginScreen: React.FC<{ onLogin: (user: User) => void, onReset: () => void }> = ({ onLogin, onReset }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  const handleLogin = () => {
    const user = STAFF_LIST.find(u => u.id === selectedUserId);
    if (user) onLogin(user);
  };

  return (
    <div className="min-h-screen bg-medical-green flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg w-full text-center relative">
        <button onClick={() => setShowResetModal(true)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500">
          <Lock size={20} />
        </button>
        <div className="mb-8">
          <img src="./inapp.png" alt="GoertekVina Smart Medical" className="w-full object-contain mb-3" />
          <p className="text-gray-400 text-sm">Hệ thống Y tế Thông minh</p>
        </div>
        
        <div className="space-y-4 text-left">
           <label className="block text-sm font-bold text-gray-700">Chọn nhân viên / 选择员工</label>
           <select 
             className="w-full p-4 border-2 border-gray-200 rounded-xl bg-gray-50 text-lg outline-none focus:border-medical-green"
             value={selectedUserId}
             onChange={e => setSelectedUserId(e.target.value)}
           >
             <option value="">-- Danh sách nhân viên / 员工列表 --</option>
             {STAFF_LIST.map(u => (
               <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
             ))}
           </select>
           
           <button 
             disabled={!selectedUserId}
             onClick={handleLogin}
             className="w-full bg-medical-green text-white font-bold text-xl py-4 rounded-xl hover:bg-green-600 disabled:opacity-50 shadow-lg mt-6"
           >
             Đăng nhập / 登录 (Login)
           </button>
        </div>
      </div>

      {showResetModal && (
          <ResetModal 
              onClose={() => setShowResetModal(false)}
              onConfirm={() => {
                  onReset();
                  setShowResetModal(false);
              }}
          />
      )}
    </div>
  );
};

// --- 🔥 1. COMPONENT DÀNH RIÊNG CHO CỬA SỔ KIOSK ĐỘC LẬP ---
const StandaloneKioskWrapper = () => {
    const [config, setConfig] = useState<StationConfig | null>(null);

    useEffect(() => {
        // Lấy thông tin trạm hiện tại từ Storage
        const savedConfig = storage.getStationConfig();
        if (savedConfig) {
            setConfig(savedConfig);
        } else {
            // Fallback nếu chưa cấu hình
            setConfig({
                id: 'UNKNOWN_STATION',
                name: 'Kiosk Độc Lập',
                type: 'KIOSK',
                isConfigured: true
            });
        }
    }, []);

    if (!config) return <div className="p-10 text-center">Đang tải dữ liệu Kiosk...</div>;

    // Component này chạy thẳng, không cần Login
    return <Kiosk stationId={config.id} stationName={config.name} />;
};

// --- 🔥 2. MAIN APP (LOGIC CŨ ĐƯỢC BỌC VÀO ĐÂY) ---
const MainApp = () => {
  const [stationConfig, setStationConfig] = useState<StationConfig | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const config = storage.getStationConfig();
    if (config) {
      setStationConfig(config);
    }

    if (window.electron) {
        console.log("📡 Đã kết nối với Backend, sẵn sàng nhận tín hiệu...");
        window.electron.onDataUpdate(() => {
            console.log("🔄 [APP] Nhận tín hiệu cập nhật dữ liệu!");
            setRefreshTrigger(prev => prev + 1);
        });

        // Đẩy sync config và station config xuống main process khi khởi động
        const syncCfg = storage.getServerSyncConfig();
        window.electron.updateServerSyncConfig(syncCfg).catch(() => {});
        if (config) {
          window.electron.updateServerStationConfig({ id: config.id, name: config.name }).catch(() => {});
        }

        // Pull danh sách nhân viên mới nhất từ server (nếu sync đang bật)
        if (syncCfg.enabled && syncCfg.serverUrl) {
          window.electron.pullEmployees().then(res => {
            if (res.success && res.data.length > 0) {
              const count = storage.mergeFromServer(res.data);
              console.log(`✅ Đã cập nhật ${count} nhân viên từ server`);
            }
          }).catch(() => {});
        }
    }

    return () => {
        if (window.electron && window.electron.removeDataUpdateListener) {
            window.electron.removeDataUpdateListener();
        }
    };
  }, []);

  const handleSetup = (config: StationConfig) => {
    storage.setStationConfig(config);
    setStationConfig(config);
  };

  const handleReset = () => {
    storage.resetStationConfig();
    setStationConfig(null);
    setCurrentUser(null);
  };

  const triggerRefresh = () => {
      console.log("🔔 App: Triggering Global Refresh...");
      setRefreshTrigger(prev => prev + 1);
  };

  if (!stationConfig) {
    return <SetupScreen onSetup={handleSetup} />;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} onReset={handleReset} />;
  }

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab} 
      currentUser={currentUser} 
      stationConfig={stationConfig}
      onLogout={() => setCurrentUser(null)}
    >
      <RestMonitor />

      {activeTab === 'dashboard' && (
        <Dashboard
          currentUser={currentUser}
          stationConfig={stationConfig}
          onTabChange={setActiveTab}
          refreshTrigger={refreshTrigger}
        />
      )}

      {/* Tab Kiosk vẫn giữ ở đây để Admin có thể xem trước */}
      {activeTab === 'kiosk' && <Kiosk stationId={stationConfig.id} stationName={stationConfig.name} />}
      
      {activeTab === 'clinical' && (
          <Clinical 
              stationId={stationConfig.id} 
              stationName={stationConfig.name} 
              refreshTrigger={refreshTrigger} 
              onDataChange={triggerRefresh} 
              currentUser={currentUser} 
          />
      )}

      {activeTab === 'inventory' && (
          <Inventory
              stationConfig={stationConfig}
              refreshTrigger={refreshTrigger}
              currentUser={currentUser}
          />
      )}
      
      {activeTab === 'reports' && <Reports stationConfig={stationConfig} currentUser={currentUser} refreshTrigger={refreshTrigger} />}
      
      {activeTab === 'admin' && <Admin currentUser={currentUser} />}
    </Layout>
  );
};

// --- 🔥 3. ROOT APP VỚI ROUTER (QUAN TRỌNG NHẤT) ---
export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Nếu URL là /kiosk -> Chạy Kiosk Wrapper (Bỏ qua Login) */}
        <Route path="/kiosk" element={<StandaloneKioskWrapper />} />

        {/* Nếu URL là / -> Chạy Main App (Có Login) */}
        <Route path="/" element={<MainApp />} />
      </Routes>
    </HashRouter>
  );
}