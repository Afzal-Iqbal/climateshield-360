import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

export interface CommandItem {
  id: string;
  title: string;
  path: string;
  category: 'Operations' | 'Intelligence' | 'System';
  icon: string;
  description: string;
}

const COMMAND_ITEMS: CommandItem[] = [
  {
    id: 'overview',
    title: 'Overview',
    path: '/',
    category: 'Operations',
    icon: 'dashboard',
    description: 'City hazard summary, key risk metrics and priority ranked zones',
  },
  {
    id: 'risk-map',
    title: '3D Risk Map',
    path: '/risk-map',
    category: 'Operations',
    icon: 'radar',
    description: 'Interactive 3D district extrusions and infrastructure overlay',
  },
  {
    id: 'forecast',
    title: 'Heat & Rain Forecast',
    path: '/forecast',
    category: 'Intelligence',
    icon: 'cyclone',
    description: 'Probabilistic weather models, uncertainty bounds and error tables',
  },
  {
    id: 'eight-impacts',
    title: 'Eight-Impact Analysis',
    path: '/eight-impacts',
    category: 'Intelligence',
    icon: 'grid_view',
    description: 'Civic vulnerability domains across health, power, transit, and food',
  },
  {
    id: 'data-quality',
    title: 'Data Quality Center',
    path: '/data-quality',
    category: 'System',
    icon: 'verified_user',
    description: 'DuckDB validation audits, automated rule actions and daily counts',
  },
  {
    id: 'ai-assistant',
    title: 'AI Climate Assistant',
    path: '/ai-assistant',
    category: 'Intelligence',
    icon: 'auto_awesome',
    description: 'Grounded decision-support RAG querying local warehouse knowledge',
  },
  {
    id: 'emergency-planner',
    title: 'Emergency Action Planner',
    path: '/emergency-planner',
    category: 'Operations',
    icon: 'emergency',
    description: 'Action checklists, shelter dispatch, and resource distribution plan',
  },
  {
    id: 'system-health',
    title: 'Automation & System Health',
    path: '/system-health',
    category: 'System',
    icon: 'health_and_safety',
    description: 'Prefect pipeline status, SLA freshness tracking, and run histories',
  },
  {
    id: 'methodology',
    title: 'Data Sources & Methodology',
    path: '/methodology',
    category: 'System',
    icon: 'library_books',
    description: 'Table contracts, citations, limitations and architectural specifications',
  },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = COMMAND_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          navigate(filteredItems[selectedIndex].path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filteredItems, selectedIndex, navigate]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-xl rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 bg-white border border-white/20 dark:border-white/20 border-slate-300 shadow-2xl overflow-hidden z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 dark:border-white/10 border-slate-200">
              <span className="material-symbols-outlined text-[20px] text-cyan-400">search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to page or module... (Esc to close)"
                className="w-full bg-transparent text-sm text-white dark:text-white text-slate-900 placeholder:text-slate-500 focus:outline-none"
                autoFocus
              />
              <span className="text-[10px] font-mono-val px-2 py-0.5 rounded bg-white/10 text-slate-400 border border-white/10">
                ESC
              </span>
            </div>

            {/* Filtered list */}
            <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No matching module found.
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        navigate(item.path);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-gradient-to-r from-cyan-500/20 to-teal-500/15 border border-cyan-400/40 text-white'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                              : 'bg-white/5 text-slate-400 border-white/10'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {item.icon}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold truncate font-display">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate">
                            {item.description}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-full bg-white/5 text-slate-400 uppercase tracking-wider shrink-0">
                        {item.category}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
