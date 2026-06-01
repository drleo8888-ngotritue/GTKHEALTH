import React from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';

interface ImportFailModalProps {
  message?: string;
  onDownloadTemplate: () => void;
  onClose: () => void;
}

export const ImportFailModal: React.FC<ImportFailModalProps> = ({
  message,
  onDownloadTemplate,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex flex-col items-center pt-7 pb-4 px-6">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-red-600" />
          </div>
          <h3 className="text-xl font-black text-gray-800 text-center">Nhập không thành công / 导入失败</h3>
          {message && (
            <p className="text-sm text-gray-500 text-center mt-2 leading-relaxed">{message}</p>
          )}
        </div>

        {/* Hint */}
        <div className="mx-6 mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Tải file template để xem đúng định dạng cột cần nhập, sau đó điền dữ liệu và upload lại.
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
          >
            Kết thúc / 关闭
          </button>
          <button
            onClick={onDownloadTemplate}
            className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
          >
            <Download size={16} className="shrink-0"/><span>Tải Template<span className="block text-[9px] font-normal opacity-80 leading-tight">下载模板</span></span>
          </button>
        </div>
      </div>
    </div>
  );
};
