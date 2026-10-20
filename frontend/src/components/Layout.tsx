import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { StatusBar } from './StatusBar';
import { SampleBanner } from './SampleBanner';
import { ZoneSelector } from './ZoneSelector';
import { CommandPalette } from './CommandPalette';
import { Drawer } from './ui/Drawer';
import { Tooltip } from './ui/Tooltip';
import { useTheme } from '../context/ThemeContext';
import { MetaData } from '../types';
import { formatPKT } from '../api/client';

interface LayoutProps {
  meta?: MetaData | null;
  isLoadingMeta?: boolean;
}

interface NavItem {
  path: string;
  labelKey: string;
  defaultLabel: string;
  icon: string;
  section: 'Operations' | 'Intelligence' | 'System';
}

const NAV_ITEMS: NavItem[] = [
  // Operations
  { path: '/', labelKey: 'nav.overview', defaultLabel: 'Overview', icon: 'dashboard', section: 'Operations' },
  { path: '/risk-map', labelKey: 'nav.riskMap', defaultLabel: '3D Risk Map', icon: 'radar', section: 'Operations' },
  { path: '/emergency-planner', labelKey: 'nav.emergencyPlanner', defaultLabel: 'Emergency Planner', icon: 'emergency', section: 'Operations' },
  // Intelligence
  { path: '/forecast', labelKey: 'nav.forecast', defaultLabel: 'Heat & Rain Forecast', icon: 'cyclone', section: 'Intelligence' },
  { path: '/eight-impacts', labelKey: 'nav.eightImpacts', defaultLabel: 'Eight-Impact Analysis', icon: 'grid_view', section: 'Intelligence' },
  { path: '/ai-assistant', labelKey: 'nav.aiAssistant', defaultLabel: 'AI Climate Assistant', icon: 'auto_awesome', section: 'Intelligence' },
  // System
  { path: '/data-quality', labelKey: 'nav.dataQuality', defaultLabel: 'Data Quality Center', icon: 'verified_user', section: 'System' },
  { path: '/system-health', labelKey: 'nav.systemHealth', defaultLabel: 'System Health', icon: 'health_and_safety', section: 'System' },
  { path: '/methodology', labelKey: 'nav.methodology', defaultLabel: 'Methodology & Data', icon: 'library_books', section: 'System' },
];

export const Layout: React.FC<LayoutProps> = ({ meta, isLoadingMeta = false }) => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  // Collapsible sidebar state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cs360_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Global Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cs360_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ur' ? 'en' : 'ur';
    i18n.changeLanguage(nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
  };

  const isRtl = i18n.language === 'ur';

  // Current page item
  const currentItem =
    NAV_ITEMS.find((item) =>
      item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
    ) || NAV_ITEMS[0];

  const sidebarWidthClass = isCollapsed ? 'w-[72px]' : 'w-64';
  const contentMarginClass = isRtl
    ? isCollapsed
      ? 'sm:pr-[72px]'
      : 'sm:pr-64'
    : isCollapsed
    ? 'sm:pl-[72px]'
    : 'sm:pl-64';

  const sections: ('Operations' | 'Intelligence' | 'System')[] = [
    'Operations',
    'Intelligence',
    'System',
  ];

  return (
    <div
      className={`min-h-screen bg-command-grid bg-slate-950 text-slate-100 flex flex-col ${
        isRtl ? 'font-urdu' : 'font-sans'
      } antialiased selection:bg-cyan-500/30 selection:text-cyan-200`}
    >
      {/* ============================================================ */}
      {/* DESKTOP & TABLET COLLAPSIBLE SIDEBAR                         */}
      {/* ============================================================ */}
      <aside
        className={`hidden sm:flex fixed top-0 bottom-0 ${
          isRtl ? 'right-0 border-l' : 'left-0 border-r'
        } ${sidebarWidthClass} bg-slate-950/90 dark:bg-slate-950/90 bg-white/95 backdrop-blur-xl border-white/10 dark:border-white/10 border-slate-200/80 z-50 flex-col justify-between transition-all duration-300 shadow-2xl`}
        aria-label="Main Navigation"
      >
        <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
          {/* Header & Logo */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 dark:border-white/10 border-slate-200/80 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(6,182,212,0.35)]">
                <span className="material-symbols-outlined text-slate-950 text-[20px] font-bold">
                  shield
                </span>
              </div>
              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-white dark:text-white text-slate-900 truncate font-display tracking-tight">
                    ClimateShield 360
                  </span>
                  <span className="font-mono-val text-[9px] text-cyan-400 uppercase tracking-widest truncate">
                    Karachi Command Cell
                  </span>
                </div>
              )}
            </div>

            {/* Collapse toggle button */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isCollapsed
                  ? isRtl
                    ? 'chevron_left'
                    : 'chevron_right'
                  : isRtl
                  ? 'chevron_right'
                  : 'chevron_left'}
              </span>
            </button>
          </div>

          {/* Grouped Nav Sections */}
          <div className="px-2.5 py-4 flex flex-col gap-5">
            {sections.map((section) => {
              const items = NAV_ITEMS.filter((i) => i.section === section);
              return (
                <div key={section} className="flex flex-col gap-1">
                  {!isCollapsed && (
                    <div className="px-3 pb-1 text-[10px] font-mono-val uppercase tracking-widest text-slate-500 font-semibold select-none">
                      {section}
                    </div>
                  )}
                  {items.map((item) => {
                    const isActive =
                      item.path === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.path);

                    const content = (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/'}
                        className={`relative flex items-center ${
                          isCollapsed ? 'justify-center px-0' : 'justify-start px-3'
                        } min-h-[42px] rounded-xl transition-all duration-150 select-none group ${
                          isActive
                            ? 'text-cyan-300 font-semibold'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeNavIndicator"
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 to-teal-500/10 border border-cyan-400/40 shadow-[0_0_14px_rgba(6,182,212,0.2)]"
                            transition={
                              shouldReduceMotion
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 450, damping: 35 }
                            }
                          />
                        )}
                        <span
                          className={`material-symbols-outlined text-[20px] relative z-10 shrink-0 transition-colors ${
                            isActive
                              ? 'text-cyan-400'
                              : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                          aria-hidden="true"
                        >
                          {item.icon}
                        </span>
                        {!isCollapsed && (
                          <span className="relative z-10 truncate text-xs ml-3 font-medium">
                            {t(item.labelKey, item.defaultLabel)}
                          </span>
                        )}
                      </NavLink>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.path} content={item.defaultLabel} position="right">
                          {content}
                        </Tooltip>
                      );
                    }
                    return content;
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: Neutral Profile with Zero Invented Persona */}
        <div className="p-3 border-t border-white/10 dark:border-white/10 border-slate-200/80 bg-slate-900/40 shrink-0">
          <div
            className={`flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-start'
            } gap-2.5 px-2 py-1.5 rounded-xl bg-white/5 border border-white/5`}
          >
            <div className="w-7 h-7 rounded-lg bg-slate-800 text-cyan-400 flex items-center justify-center font-mono-val font-bold text-xs shrink-0 border border-white/10">
              DU
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  Demo user
                </span>
                <span className="font-mono-val text-[9px] text-slate-500 truncate">
                  Sindh PDMA Desk
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN LAYOUT WRAPPER                                          */}
      {/* ============================================================ */}
      <div className={`flex-1 flex flex-col min-w-0 w-full transition-all duration-300 ${contentMarginClass}`}>
        {/* Sticky Glass Top Navbar */}
        <header className="sticky top-0 z-40 bg-slate-950/85 dark:bg-slate-950/85 bg-white/90 backdrop-blur-xl border-b border-white/10 dark:border-white/10 border-slate-200/80 shadow-md">
          {/* Subtle animated aura gradient banner in header */}
          <div className="absolute inset-0 header-aura pointer-events-none opacity-40" />

          {/* Clean Row 1: Title/Breadcrumb, Ctrl+K Palette, District Popover, Status Pill, Controls */}
          <div className="relative w-full px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 border-slate-200/60">
            {/* Left: Mobile Title / Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex sm:hidden items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold">
                  <span className="material-symbols-outlined text-[17px]">shield</span>
                </div>
                <span className="font-bold text-xs text-white dark:text-white text-slate-900 truncate font-display">
                  ClimateShield
                </span>
              </div>

              {/* Breadcrumb on Desktop */}
              <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-400">
                <span className="text-slate-500 font-mono-val uppercase tracking-wider text-[10px]">
                  {currentItem.section}
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-white dark:text-white text-slate-900 font-semibold">
                  {currentItem.defaultLabel}
                </span>
              </div>

              {/* City & District Selector Popover (never overlaps) */}
              <ZoneSelector className="shrink-0" />
            </div>

            {/* Right: Command Palette, Status Pill, Theme/Lang, Profile */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              {/* Command Palette Trigger (Ctrl+K) */}
              <button
                type="button"
                onClick={() => setIsCommandOpen(true)}
                className="min-h-[40px] px-3 hidden md:flex items-center gap-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-medium transition-colors cursor-pointer shadow-xs"
                title="Search commands and jump to pages (Ctrl+K)"
                aria-label="Open command palette"
              >
                <span className="material-symbols-outlined text-[17px] text-cyan-400">search</span>
                <span className="hidden lg:inline text-slate-400">Quick jump...</span>
                <kbd className="font-mono-val text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-slate-400 border border-white/10">
                  Ctrl+K
                </kbd>
              </button>

              {/* Mobile Search Button */}
              <button
                type="button"
                onClick={() => setIsCommandOpen(true)}
                className="min-h-[40px] min-w-[40px] md:hidden flex items-center justify-center rounded-xl bg-slate-900/80 text-slate-300 border border-white/10 cursor-pointer"
                aria-label="Search"
              >
                <span className="material-symbols-outlined text-[18px] text-cyan-400">search</span>
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              {/* Language Toggle */}
              <button
                type="button"
                onClick={toggleLanguage}
                title="Switch English / Urdu"
                className="min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
                aria-label="Toggle language"
              >
                <span className="material-symbols-outlined text-[16px] text-cyan-400">translate</span>
                <span className="font-mono-val text-[11px] hidden sm:inline">
                  {i18n.language === 'ur' ? 'EN' : 'اردو'}
                </span>
              </button>

              {/* Neutral Profile Avatar */}
              <div
                className="min-h-[40px] flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 select-none"
                aria-label="Demo User Account"
              >
                <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                  DU
                </div>
                <span className="hidden xl:inline font-medium">Demo user</span>
              </div>
            </div>
          </div>

          {/* Thin Row 2: Status chips wrapping or scrolling on mobile */}
          <div className="relative w-full px-4 sm:px-6 lg:px-8 py-1.5 flex items-center overflow-x-auto no-scrollbar">
            <StatusBar meta={meta} isLoading={isLoadingMeta} />
          </div>

          {/* Dismissible Sample Data Strip */}
          <SampleBanner isSample={meta?.is_sample} />
        </header>

        {/* ============================================================ */}
        {/* MAIN WORKSPACE CONTENT CONTAINER                             */}
        {/* ============================================================ */}
        <main className="w-full flex-1 flex flex-col pb-16 sm:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="w-full flex-1 flex flex-col"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ============================================================ */}
        {/* OPAQUE STATIC FOOTER (In content flow, never overlapping)    */}
        {/* ============================================================ */}
        <footer className="w-full bg-slate-950/95 dark:bg-slate-950/95 bg-slate-900 border-t border-white/10 dark:border-white/10 border-slate-200/80 py-4 px-4 sm:px-6 lg:px-8 mt-auto mb-14 sm:mb-0 relative z-20 shadow-xl">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            {/* Row 1: Official Disclaimer */}
            <div className="flex items-center gap-2 text-center sm:text-left">
              <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0" aria-hidden="true">
                warning
              </span>
              <span className="font-semibold text-slate-200 shrink-0">EMERGENCY PROTOCOL:</span>
              <span className="leading-relaxed">
                Information only, not professional advice. In an emergency contact official services (Sindh PDMA 1736 | Rescue 1122).
              </span>
            </div>

            {/* Row 2: Build version, source & refresh */}
            <div className="shrink-0 flex items-center gap-3 font-mono-val text-[11px] text-slate-500">
              <span>DUCKDB READ-ONLY</span>
              <span>·</span>
              <span>BUILD v{meta?.version || '0.2.0'}</span>
              <span>·</span>
              <span>UPDATED: {formatPKT(meta?.last_run?.finished_at || null)}</span>
            </div>
          </div>
        </footer>

        {/* ============================================================ */}
        {/* MOBILE BOTTOM NAVIGATION BAR (< 640px)                      */}
        {/* 5 key pages + "More" drawer trigger                         */}
        {/* ============================================================ */}
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-slate-950/95 border-t border-white/15 flex items-center justify-around px-1 shadow-2xl backdrop-blur-xl"
          aria-label="Mobile Navigation"
        >
          {NAV_ITEMS.slice(0, 4).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors text-[10px] ${
                  isActive
                    ? 'text-cyan-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {item.icon}
              </span>
              <span className="truncate max-w-[62px] text-center font-medium">
                {t(item.labelKey, item.defaultLabel)}
              </span>
            </NavLink>
          ))}

          {/* 5th Key Page: AI Assistant */}
          <NavLink
            to="/ai-assistant"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors text-[10px] ${
                isActive ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              auto_awesome
            </span>
            <span className="truncate max-w-[62px] text-center font-medium">AI Assist</span>
          </NavLink>

          {/* "More" Sheet Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileMoreOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-slate-400 hover:text-white text-[10px] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              more_horiz
            </span>
            <span className="truncate font-medium">More</span>
          </button>
        </nav>
      </div>

      {/* Global Command Palette */}
      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />

      {/* Mobile "More" Drawer Sheet */}
      <Drawer
        isOpen={isMobileMoreOpen}
        onClose={() => setIsMobileMoreOpen(false)}
        title="Command Cell Navigation"
        subtitle="All operational, intelligence, and system modules"
        position="bottom"
      >
        <div className="flex flex-col gap-4 pb-6">
          {sections.map((section) => (
            <div key={section} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono-val uppercase tracking-widest text-slate-500 font-semibold px-2">
                {section}
              </span>
              <div className="grid grid-cols-1 gap-1">
                {NAV_ITEMS.filter((i) => i.section === section).map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMoreOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 transition-colors"
                  >
                    <span className="material-symbols-outlined text-cyan-400 text-[20px]">
                      {item.icon}
                    </span>
                    <span className="text-xs font-medium">{item.defaultLabel}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
};
