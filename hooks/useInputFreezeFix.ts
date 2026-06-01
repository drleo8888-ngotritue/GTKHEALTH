import { useEffect } from 'react';

/**
 * Hook này giải quyết vấn đề input bị đóng băng (không gõ được) trong Electron
 * Nguyên nhân thường do mất focus giữa Main Process và Renderer Process
 */
export const useInputFreezeFix = () => {
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // 1. Lấy phần tử đang được click
      const target = e.target as HTMLElement;

      // 2. Kiểm tra xem nó có phải là ô nhập liệu không
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isContentEditable = target.getAttribute('contenteditable') === 'true';

      if (isInput || isContentEditable) {
        // 3. Hack: Sử dụng setTimeout 0 để đẩy việc focus xuống cuối hàng đợi sự kiện (Event Loop)
        // Điều này đảm bảo focus được thực hiện SAU KHI các sự kiện "gây đơ" (như đóng modal) đã xong.
        setTimeout(() => {
          if (target.isConnected) { // Kiểm tra xem element còn trên màn hình không
            target.focus();
            // Đôi khi cần click ảo để kích hoạt lại caret (con trỏ soạn thảo)
            // target.click(); 
          }
        }, 0);
      }
    };

    // Lắng nghe sự kiện click trên toàn bộ ứng dụng
    window.addEventListener('mousedown', handleMouseDown);

    // Dọn dẹp khi unmount
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);
};