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
import { Settings, Lock, AlertTriangle, KeyRound } from 'lucide-react';

const hashPassword = async (password: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

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

const ChangePasswordModal: React.FC<{ user: User, onClose: () => void }> = ({ user, onClose }) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!oldPass || !newPass || !confirmPass) { setError('Vui lòng điền đầy đủ / 请填写所有项'); return; }
    if (newPass.length < 6) { setError('Mật khẩu mới ít nhất 6 ký tự / 新密码至少6位'); return; }
    if (newPass !== confirmPass) { setError('Xác nhận mật khẩu không khớp / 确认密码不一致'); return; }

    const oldHash = await hashPassword(oldPass);
    const storedHash = storage.getUserPasswordHash(user.id);
    const defaultHash = await hashPassword(user.mnv);
    const isOldValid = storedHash ? oldHash === storedHash : oldHash === defaultHash;

    if (!isOldValid) { setError('Mật khẩu hiện tại sai / 当前密码错误'); setOldPass(''); return; }

    storage.setUserPasswordHash(user.id, await hashPassword(newPass));
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl w-96 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={20} className="text-green-600" />
          <h3 className="font-bold text-gray-800">Đổi mật khẩu / 修改密码</h3>
        </div>
        {success ? (
          <p className="text-green-600 font-bold text-center py-4">✅ Đổi mật khẩu thành công!</p>
        ) : (
          <div className="space-y-3">
            <input type="password" placeholder="Mật khẩu hiện tại / 当前密码" className="w-full border-2 p-3 rounded-lg outline-none focus:border-green-500" value={oldPass} onChange={e => { setOldPass(e.target.value); setError(''); }} />
            <input type="password" placeholder="Mật khẩu mới / 新密码 (ít nhất 6 ký tự)" className="w-full border-2 p-3 rounded-lg outline-none focus:border-green-500" value={newPass} onChange={e => { setNewPass(e.target.value); setError(''); }} />
            <input type="password" placeholder="Xác nhận mật khẩu mới / 确认新密码" className="w-full border-2 p-3 rounded-lg outline-none focus:border-green-500" value={confirmPass} onChange={e => { setConfirmPass(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Hủy / 取消</button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">Lưu / 保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const LoginScreen: React.FC<{ onLogin: (user: User) => void, onReset: () => void }> = ({ onLogin, onReset }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const stationName = storage.getStationConfig()?.name || '';

  const handleLogin = async () => {
    if (!selectedUserId || !password) return;
    const user = STAFF_LIST.find(u => u.id === selectedUserId);
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const inputHash = await hashPassword(password);
      const storedHash = storage.getUserPasswordHash(user.id);
      const isValid = storedHash
        ? inputHash === storedHash
        : inputHash === await hashPassword(user.mnv);
      if (isValid) {
        onLogin(user);
      } else {
        setError('Sai mật khẩu! / 密码错误！');
        setPassword('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[var(--app-h,100vh)] bg-medical-green flex items-center justify-center p-4 overflow-hidden">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center relative">
        <button onClick={() => setShowResetModal(true)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500">
          <Lock size={20} />
        </button>
        <div className="mb-5">
          <img src="./inapp.png" alt="GoertekVina Smart Medical" className="w-full max-h-28 object-contain mb-2" />
          <p className="text-gray-400 text-sm">Hệ thống Y tế Thông minh</p>
        </div>

        {/* Banner chào mừng — hiển thị phòng y tế đang đăng nhập */}
        {stationName && (
          <div className="mb-6 rounded-2xl bg-medical-green/10 border-2 border-medical-green/30 px-5 py-3">
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-0.5">Chào mừng đến / 欢迎来到</p>
            <p className="text-2xl font-black text-green-700 leading-tight">
              PHÒNG Y TẾ {stationName.toUpperCase()}
            </p>
          </div>
        )}

        <div className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Nhân viên / 员工</label>
            <select
              className="w-full p-4 border-2 border-gray-200 rounded-xl bg-gray-50 text-lg outline-none focus:border-medical-green"
              value={selectedUserId}
              onChange={e => { setSelectedUserId(e.target.value); setError(''); }}
            >
              <option value="">-- Chọn nhân viên / 员工列表 --</option>
              {STAFF_LIST.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Mật khẩu / 密码</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu / 输入密码"
              className={`w-full p-4 border-2 rounded-xl text-lg outline-none focus:border-medical-green ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            {error && <p className="text-red-500 text-sm mt-1 font-medium">{error}</p>}
            <p className="text-xs text-gray-400 mt-1">Mật khẩu mặc định = Mã nhân viên (MNV) / 默认密码 = 员工编号</p>
          </div>

          <button
            disabled={!selectedUserId || !password || loading}
            onClick={handleLogin}
            className="w-full bg-medical-green text-white font-bold text-xl py-4 rounded-xl hover:bg-green-600 disabled:opacity-50 shadow-lg"
          >
            {loading ? 'Đang kiểm tra... / 验证中...' : 'Đăng nhập / 登录'}
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
  const [showChangePassword, setShowChangePassword] = useState(false);

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

        // Spoke: tự động nhận phác đồ mới từ Hub qua server
        if (window.electron.onSpokeProtocolsUpdate) {
            window.electron.onSpokeProtocolsUpdate((protocols: any[]) => {
                protocols.forEach(p => storage.saveProtocol(p));
                console.log(`✅ [APP] Đã cập nhật ${protocols.length} phác đồ từ server`);
                setRefreshTrigger(prev => prev + 1);
            });
        }

        // Đẩy sync config và station config xuống main process khi khởi động
        const syncCfg = storage.getServerSyncConfig();
        window.electron.updateServerSyncConfig(syncCfg).catch(() => {});
        if (config) {
          window.electron.updateServerStationConfig({ id: config.id, name: config.name, type: config.type }).catch(() => {});
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

  // Lãnh đạo: chỉ được ở 3 tab này; chặn mọi điều hướng sang tab khác (kể cả quick-link)
  const leader = !!currentUser.leaderView;
  const allowedLeaderTabs = ['dashboard', 'inventory', 'reports', 'admin'];
  const safeSetActiveTab = (tab: string) => {
    if (leader && !allowedLeaderTabs.includes(tab)) return;
    setActiveTab(tab);
  };
  const safeActiveTab = leader && !allowedLeaderTabs.includes(activeTab) ? 'dashboard' : activeTab;

  return (
    <>
    {showChangePassword && currentUser && (
      <ChangePasswordModal user={currentUser} onClose={() => setShowChangePassword(false)} />
    )}
    <Layout
      activeTab={safeActiveTab}
      onTabChange={safeSetActiveTab}
      currentUser={currentUser}
      stationConfig={stationConfig}
      onLogout={() => setCurrentUser(null)}
      onChangePassword={() => setShowChangePassword(true)}
    >
      <RestMonitor />

      {safeActiveTab === 'dashboard' && (
        <Dashboard
          currentUser={currentUser}
          stationConfig={stationConfig}
          onTabChange={safeSetActiveTab}
          refreshTrigger={refreshTrigger}
        />
      )}

      {/* Tab Kiosk vẫn giữ ở đây để Admin có thể xem trước */}
      {safeActiveTab === 'kiosk' && <Kiosk stationId={stationConfig.id} stationName={stationConfig.name} />}

      {safeActiveTab === 'clinical' && (
          <Clinical
              stationId={stationConfig.id}
              stationName={stationConfig.name}
              refreshTrigger={refreshTrigger}
              onDataChange={triggerRefresh}
              currentUser={currentUser}
          />
      )}

      {safeActiveTab === 'inventory' && (
          <Inventory
              stationConfig={stationConfig}
              refreshTrigger={refreshTrigger}
              currentUser={currentUser}
          />
      )}

      {safeActiveTab === 'reports' && <Reports stationConfig={stationConfig} currentUser={currentUser} refreshTrigger={refreshTrigger} />}

      {safeActiveTab === 'admin' && <Admin currentUser={currentUser} />}
    </Layout>
    </>
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