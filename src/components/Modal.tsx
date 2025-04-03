// src/components/Modal.tsx
import React, { useState, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode; // 允许在模态框中放入任何内容 (例如表单)
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    // 背景遮罩层
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center" onClick={onClose}>
      {/* 模态框内容区域 */}
      {/* stopPropagation 防止点击内容区域关闭模态框 */}
      <div
        className="bg-white p-6 rounded-lg shadow-xl z-50 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题和关闭按钮 */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-700">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="Close modal"
          >
            × {/* HTML entity for 'X' */}
          </button>
        </div>
        {/* 模态框主体内容 */}
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}

// --- 密码输入模态框的特定实现 (可以放在 Modal.tsx 或单独文件) ---

interface PasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (password: string) => void;
    title?: string;
    message?: string; // 提示信息
}

export function PasswordModal({
    isOpen,
    onClose,
    onSubmit,
    title = "输入密码",
    message = "请输入所需的密码："
}: PasswordModalProps) {
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(password);
        setPassword(''); // 清空密码
        // onClose(); // 提交后通常会自动关闭，由调用者决定
    };

    // 清理：关闭时清空密码
    React.useEffect(() => {
        if (!isOpen) {
            setPassword('');
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit}>
                {message && <p className="mb-3 text-gray-600">{message}</p>}
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2 border rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="密码"
                    autoFocus // 自动聚焦方便输入
                    required
                />
                <div className="flex justify-end space-x-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        确认
                    </button>
                </div>
            </form>
        </Modal>
    );
}