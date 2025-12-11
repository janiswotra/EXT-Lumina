import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgClass = type === 'success' ? 'bg-green-900 text-green-100 border-green-700' : 'bg-red-900 text-red-100 border-red-700';

  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center px-4 py-3 rounded-lg shadow-lg border ${bgClass} transition-all transform animate-fade-in-up`}>
      <div className="mr-3 text-xl">
        {type === 'success' ? '✓' : '⚠'}
      </div>
      <div className="font-medium text-sm">{message}</div>
      <button onClick={onClose} className="ml-4 hover:opacity-75">
        ✕
      </button>
    </div>
  );
};
