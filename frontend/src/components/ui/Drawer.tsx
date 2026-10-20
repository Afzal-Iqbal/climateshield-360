import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  position?: 'right' | 'bottom';
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  position = 'right',
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isRight = position === 'right';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer content */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={isRight ? { x: '100%' } : { y: '100%' }}
            animate={isRight ? { x: 0 } : { y: 0 }}
            exit={isRight ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`relative z-10 flex flex-col bg-slate-900/95 dark:bg-slate-900/95 bg-white border-white/15 dark:border-white/15 border-slate-300 shadow-2xl backdrop-blur-xl ${
              isRight
                ? 'ml-auto h-full w-full max-w-md sm:max-w-lg border-l'
                : 'mt-auto w-full max-h-[85vh] rounded-t-2xl border-t'
            } ${className}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5 border-b border-white/10 dark:border-white/10 border-slate-200">
              <div className="flex flex-col gap-0.5 min-w-0">
                {title && (
                  <h3 className="text-base sm:text-lg font-bold text-white dark:text-white text-slate-900 font-display truncate">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-400 dark:text-slate-400 text-slate-600 truncate font-body">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                aria-label="Close drawer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
