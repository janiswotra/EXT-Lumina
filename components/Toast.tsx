import React, { useEffect, useRef } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const bgClass = type === 'success'
    ? 'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]'
    : 'bg-[#fef2f2] text-[#991b1b] border-[#fecaca]';

  return (
    <div className={`fixed bottom-5 right-5 z-[2147483647] flex items-center px-4 py-3 rounded-lg shadow-lg border ${bgClass} transition-all transform animate-fade-in-up`}>
      <div className="mr-3 text-xl">
        {type === 'success' ? '✓' : '⚠'}
      </div>
      <div className="font-medium text-base">{message}</div>
      <button onClick={onClose} className="ml-4 hover:opacity-75">
        ✕
      </button>
    </div>
  );
};
