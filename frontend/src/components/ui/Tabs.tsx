import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface TabOption {
  id: string;
  label: string;
  icon?: string;
  badge?: string | number;
}

interface TabsProps {
  tabs: TabOption[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  size = 'md',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const padClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs sm:text-sm';

  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 rounded-xl bg-slate-900/60 dark:bg-slate-900/60 bg-slate-200/80 border border-white/10 dark:border-white/10 border-slate-300 backdrop-blur-md overflow-x-auto no-scrollbar max-w-full ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative min-h-[38px] flex items-center gap-2 rounded-lg font-medium transition-colors select-none shrink-0 ${padClass} ${
              isActive
                ? 'text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-100'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 450, damping: 35 }
                }
              />
            )}
            {tab.icon && (
              <span
                className={`material-symbols-outlined text-[17px] relative z-10 leading-none ${
                  isActive ? 'text-cyan-400' : 'text-slate-500'
                }`}
                aria-hidden="true"
              >
                {tab.icon}
              </span>
            )}
            <span className="relative z-10 truncate">{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`relative z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono-val ${
                  isActive
                    ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                    : 'bg-white/10 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
