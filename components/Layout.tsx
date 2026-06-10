import React from 'react';
import {
  UserPlus,
  Stethoscope,
  Pill,
  BarChart3,
  Settings,
  LogOut,
  Activity,
  Monitor,
  ExternalLink,
  LayoutDashboard,
  KeyRound,
} from 'lucide-react';
import { User, StationConfig } from '../types';
import { SyncControl } from './SyncControl';
import { NotificationBell } from './NotificationBell';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User;
  stationConfig: StationConfig;
  onLogout: () => void;
  onChangePassword: () => void;
}

// Component item đơn giản cho Sidebar
const SidebarItem = ({ id, label, icon: Icon, active, onClick }: any) => (
  <button
    onClick={() => onClick(id)}
    className={`w-full flex items-center px-4 py-3 mb-1 rounded-lg transition-all duration-200 group relative ${
      active 
        ? 'bg-green-50 text-green-700 font-bold shadow-sm' 
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
    }`}
  >
    {active && <div className="absolute left-0 top-2 bottom-2 w-1 bg-green-600 rounded-r-md"></div>}
    <Icon size={20} className={`mr-3 transition-colors ${active ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
    <span className="text-sm font-medium text-left">{label}</span>
  </button>
);

export const Layout: React.FC<LayoutProps> = ({
  children, activeTab, onTabChange, currentUser, stationConfig, onLogout, onChangePassword
}) => {

  // Chế độ lãnh đạo: chỉ Dashboard / Kho dược / Báo cáo, dữ liệu từ server
  const leader = !!currentUser.leaderView;

  // --- HÀM MỞ CỬA SỔ KIOSK RIÊNG ---
  const handleOpenKioskWindow = async () => {
    if (window.electron) {
      const result = await window.electron.openKiosk();
      if (result.status === 'ALREADY_OPEN') {
         alert("⚠️ Màn hình Kiosk đang mở rồi!");
      }
    } else {
      alert("Chức năng này cần chạy trên Electron App.");
    }
  };

  return (
    <div className="flex bg-gray-50 font-sans text-gray-800 overflow-hidden" style={{ height: 'var(--app-h, 100vh)' }}>
      
      {/* SIDEBAR */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-20 shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-100">
          <img src="./inapp.png" alt="GoertekVina Smart Medical" className="w-full object-contain select-none" />
        </div>

        {/* Station Info */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <div className="flex flex-col">
                <span className="text-[10px] uppercase text-gray-400 font-bold">Trạm làm việc / 工作站</span>
                <span className="text-sm font-bold text-gray-800 truncate max-w-[150px]">{stationConfig.name}</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${stationConfig.type === 'HUB' ? 'bg-purple-500' : 'bg-blue-500'}`} title={stationConfig.type}></div>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-1">
          {/* Các tab chức năng chính */}
          <SidebarItem id="dashboard" label="Tổng quan / 总览" icon={LayoutDashboard} active={activeTab === 'dashboard'} onClick={onTabChange} />
          {!leader && <SidebarItem id="kiosk" label="Tiếp đón / 接待" icon={UserPlus} active={activeTab === 'kiosk'} onClick={onTabChange} />}
          {!leader && <SidebarItem id="clinical" label="Lâm sàng / 诊所" icon={Stethoscope} active={activeTab === 'clinical'} onClick={onTabChange} />}
          <SidebarItem id="inventory" label="Kho dược / 药房" icon={Pill} active={activeTab === 'inventory'} onClick={onTabChange} />
          <SidebarItem id="reports" label="Báo cáo / 报告" icon={BarChart3} active={activeTab === 'reports'} onClick={onTabChange} />

          <div className="my-4 border-t border-gray-100"></div>

          {!leader && <>
          {/* --- 🔥 NÚT MỞ KIOSK (CẬP NHẬT MỚI) --- */}
          <div className="px-1 mb-2">
             <p className="px-2 text-[10px] font-bold text-gray-400 uppercase mb-2">Mở rộng / 扩展</p>
             <button
               onClick={handleOpenKioskWindow}
               className="w-full flex items-center px-4 py-3 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-all duration-200 group"
             >
               <Monitor size={20} className="mr-3 text-blue-600 group-hover:scale-110 transition-transform" />
               <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-bold">Mở màn hình Kiosk</span>
                  <span className="text-[10px] opacity-70 font-normal">打开挂号屏窗口</span>
               </div>
               <ExternalLink size={14} className="ml-auto opacity-50" />
             </button>
          </div>

          <div className="my-2 border-t border-gray-100"></div>
          </>}

          {/* Cấu hình — lãnh đạo vẫn vào được */}
          <SidebarItem id="admin" label="Cấu hình / 设置" icon={Settings} active={activeTab === 'admin'} onClick={onTabChange} />
          <div className="px-4 pt-1 pb-2">
            <span className="text-xs text-gray-400 font-semibold select-none">v{__APP_VERSION__}</span>
          </div>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-100 bg-white">
          <div className="flex items-center mb-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold border border-gray-200">
              {currentUser.name.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-bold text-gray-800 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-500 uppercase">{currentUser.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onChangePassword} className="flex-1 flex items-center justify-center p-2 text-sm font-medium text-gray-500 hover:text-green-700 bg-gray-50 hover:bg-green-50 rounded-lg transition-colors" title="Đổi mật khẩu / 修改密码">
              <KeyRound size={15} className="mr-1" /> Đổi MK
            </button>
            <button onClick={onLogout} className="flex-1 flex items-center justify-center p-2 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
              <LogOut size={15} className="mr-1" /> Đăng xuất
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-gray-50" style={{ height: 'var(--app-h, 100vh)' }}>
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight flex items-center">
                {activeTab === 'dashboard' && <LayoutDashboard className="mr-2 text-green-600" size={24}/>}
                {activeTab === 'kiosk' && <UserPlus className="mr-2 text-green-600" size={24}/>}
                {activeTab === 'clinical' && <Stethoscope className="mr-2 text-green-600" size={24}/>}
                {activeTab === 'inventory' && <Pill className="mr-2 text-green-600" size={24}/>}
                {activeTab === 'reports' && <BarChart3 className="mr-2 text-green-600" size={24}/>}
                {activeTab === 'admin' && <Settings className="mr-2 text-green-600" size={24}/>}

                {activeTab === 'dashboard' && "Tổng quan / 总览"}
                {activeTab === 'kiosk' && "Tiếp đón bệnh nhân / 接待病人"}
                {activeTab === 'clinical' && "Phòng khám lâm sàng / 临床诊室"}
                {activeTab === 'inventory' && "Quản lý kho dược / 药房库存管理"}
                {activeTab === 'reports' && "Báo cáo & Thống kê / 报告与统计"}
                {activeTab === 'admin' && "Quản trị hệ thống / 系统管理"}
            </h2>
          </div>
          <div className="flex items-center space-x-3">
            <NotificationBell stationConfig={stationConfig} />

            <div className="h-6 w-px bg-gray-300 mx-2"></div>

            <SyncControl />

            <div className="h-6 w-px bg-gray-300 mx-2"></div>
            <div className="flex items-center px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-bold shadow-sm">
              <Activity size={14} className="mr-1.5 animate-pulse" /> Online
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
          <div className="w-full h-full flex flex-col">
             {children}
          </div>
        </div>
      </main>
    </div>
  );
};