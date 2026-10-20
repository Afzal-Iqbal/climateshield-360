import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: Toast['type'], duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: Toast['type'] = 'info', duration: number = 3500) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string) => toast(message, 'success'), [toast]);
  const error = useCallback((message: string) => toast(message, 'error', 4500), [toast]);
  const warning = useCallback((message: string) => toast(message, 'warning'), [toast]);
  const info = useCallback((message: string) => toast(message, 'info'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const config = {
              info: {
                bg: 'bg-slate-900/95 dark:bg-slate-900/95 bg-white border-white/20 dark:border-white/20 border-slate-300 text-slate-100 dark:text-slate-100 text-slate-900',
                icon: 'info',
                iconColor: 'text-cyan-400',
              },
              success: {
                bg: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200',
                icon: 'check_circle',
                iconColor: 'text-emerald-400',
              },
              warning: {
                bg: 'bg-amber-950/95 border-amber-500/40 text-amber-200',
                icon: 'warning',
                iconColor: 'text-amber-400',
              },
              error: {
                bg: 'bg-red-950/95 border-red-500/40 text-red-200',
                icon: 'error',
                iconColor: 'text-red-400',
              },
            }[t.type || 'info'];

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className={`pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium font-body ${config.bg}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`material-symbols-outlined text-[18px] shrink-0 ${config.iconColor}`}>
                    {config.icon}
                  </span>
                  <span className="truncate">{t.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  className="text-slate-400 hover:text-white cursor-pointer ml-1"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
