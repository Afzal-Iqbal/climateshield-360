import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { StatusBar } from './StatusBar';
import { SampleBanner } from './SampleBanner';
import { ZoneSelector } from './ZoneSelector';
import { useTheme } from '../context/ThemeContext';
import { MetaData } from '../types';

interface LayoutProps {
  meta?: MetaData | null;
  isLoadingMeta?: boolean;
}

interface NavItem {
  path: string;
  labelKey: string;
  defaultLabel: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.overview', defaultLabel: 'Overview', icon: 'dashboard' },
  { path: '/risk-map', labelKey: 'nav.riskMap', defaultLabel: 'Risk Map', icon: 'radar' },
  { path: '/forecast', labelKey: 'nav.forecast', defaultLabel: 'Heat & Rain Forecast', icon: 'cyclone' },
  { path: '/eight-impacts', labelKey: 'nav.eightImpacts', defaultLabel: 'Eight-Impact Analysis', icon: 'grid_view' },
  { path: '/data-quality', labelKey: 'nav.dataQuality', defaultLabel: 'Data Quality Center', icon: 'verified_user' },
  { path: '/ai-assistant', labelKey: 'nav.aiAssistant', defaultLabel: 'AI Climate Assistant', icon: 'auto_awesome' },
  { path: '/emergency-planner', labelKey: 'nav.emergencyPlanner', defaultLabel: 'Emergency Action Planner', icon: 'emergency' },
  { path: '/system-health', labelKey: 'nav.systemHealth', defaultLabel: 'Automation & System Health', icon: 'health_and_safety' },
  { path: '/methodology', labelKey: 'nav.methodology', defaultLabel: 'Data Sources & Methodology', icon: 'library_books' },
];

export const Layout: React.FC<LayoutProps> = ({ meta, isLoadingMeta = false }) => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ur' ? 'en' : 'ur';
    i18n.changeLanguage(nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
  };

  const isRtl = i18n.language === 'ur';

  return (
    <div className={`min-h-screen bg-background text-on-surface flex flex-col ${isRtl ? 'font-urdu' : 'font-sans'} antialiased`}>
      {/* ============================================================ */}
      {/* DESKTOP & TABLET SIDEBAR                                     */}
      {/* Mobile (<640px): hidden (replaced by bottom tab bar)         */}
      {/* Tablet (640-1024px): compact icon sidebar (w-[72px])         */}
      {/* Desktop (>1024px): full sidebar (w-[250px])                  */}
      {/* ============================================================ */}
      <aside
        className={`hidden sm:flex fixed top-0 bottom-0 ${
          isRtl ? 'right-0' : 'left-0'
        } sm:w-[72px] lg:w-[250px] bg-primary-container text-on-primary z-50 flex-col justify-between shadow-md transition-all duration-300 border-r border-primary`}
        aria-label="Main Navigation"
      >
        <div className="flex flex-col">
          {/* Logo & Civic Branding */}
          <div className="h-16 px-3 lg:px-4 flex items-center sm:justify-center lg:justify-start gap-2.5 bg-primary border-b border-primary-container">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-on-secondary text-[22px]" aria-hidden="true">
                shield
              </span>
            </div>
            <div className="hidden lg:flex flex-col min-w-0">
              <span className="font-bold text-sm text-on-primary truncate tracking-tight">
                ClimateShield 360
              </span>
              <span className="font-mono text-[10px] text-on-primary-container uppercase tracking-wider truncate">
                SINDH PDMA / KMC
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="px-2 lg:px-3 py-3">
            <div className="hidden lg:block font-mono text-[10px] text-on-primary-container uppercase tracking-wider mb-2 font-semibold px-2">
              Operational Console
            </div>
            <nav className="flex flex-col gap-1" aria-label="Console Modules">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  title={item.defaultLabel}
                  className={({ isActive }) =>
                    `flex items-center sm:justify-center lg:justify-start gap-2.5 px-3 py-2.5 rounded-xl transition-all min-h-[44px] ${
                      isActive
                        ? 'bg-secondary text-on-secondary font-semibold shadow-xs'
                        : 'text-on-primary-container hover:bg-primary hover:text-on-primary'
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="hidden lg:inline truncate text-xs">
                    {t(item.labelKey, item.defaultLabel)}
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer: Neutral Demo User Account (Rule 6: Persona removed) */}
        <div className="p-2 lg:p-3 flex flex-col gap-2 bg-primary border-t border-primary-container">
          <div className="flex items-center sm:justify-center lg:justify-start gap-2.5 px-2 py-1.5 rounded-xl bg-primary-container/60">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-on-secondary shrink-0 text-xs font-bold">
              DU
            </div>
            <div className="hidden lg:flex flex-col min-w-0">
              <span className="text-xs font-semibold text-on-primary truncate">Demo user</span>
              <span className="font-mono text-[10px] text-on-primary-container truncate">Karachi Ops Cell</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTAINER: TWO-ROW STICKY TOP BAR + CONTENT + FOOTER   */}
      {/* ============================================================ */}
      <div
        className={`flex-1 flex flex-col min-w-0 w-full ${
          isRtl ? 'sm:pr-[72px] lg:pr-[250px]' : 'sm:pl-[72px] lg:pl-[250px]'
        }`}
      >
        {/* Sticky Two-Row Header (Requirement 1) */}
        <header className="sticky top-0 z-40 bg-surface/95 dark:bg-background/95 backdrop-blur-md border-b border-outline-variant/30 shadow-xs">
          {/* Row 1: Logo/Title, Zone Selector, Theme & Language Toggles, Profile */}
          <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 border-b border-outline-variant/20">
            {/* Left: Mobile Title & Zone Selector */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex sm:hidden items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">shield</span>
                <span className="font-bold text-sm text-on-surface truncate">ClimateShield</span>
              </div>

              {/* Headless UI Zone Selector (Requirement 1) */}
              <ZoneSelector className="shrink-0" />
            </div>

            {/* Right: Controls & Toggles */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Dark / Light Theme Toggle (Requirement 11) */}
              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-surface-container/70 dark:bg-surface-container-high/60 hover:bg-surface-container dark:hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition-colors"
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                <span className="material-symbols-outlined text-[19px]">
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>

              {/* Language Toggle */}
              <button
                type="button"
                onClick={toggleLanguage}
                title="Switch English / Urdu"
                className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-xl bg-surface-container/70 dark:bg-surface-container-high/60 hover:bg-surface-container dark:hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/30 text-xs font-semibold transition-colors"
                aria-label="Toggle language"
              >
                <span className="material-symbols-outlined text-[18px]">translate</span>
                <span className="font-mono text-[11px] hidden sm:inline">
                  {i18n.language === 'ur' ? 'English' : 'اردو'}
                </span>
              </button>

              {/* Neutral User Profile Avatar (Requirement 6) */}
              <div
                className="min-h-[44px] flex items-center gap-2 px-2 py-1 rounded-xl bg-surface-container/60 border border-outline-variant/30 text-xs text-on-surface select-none"
                aria-label="Demo User Account"
              >
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-[11px]">
                  DU
                </div>
                <span className="hidden md:inline font-medium">Demo user</span>
              </div>
            </div>
          </div>

          {/* Row 2: Status Telemetry Chips (Wraps and scrolls horizontally on small screens) */}
          <div className="w-full px-4 sm:px-6 lg:px-8 py-1.5 flex items-center overflow-x-auto no-scrollbar">
            <StatusBar meta={meta} isLoading={isLoadingMeta} />
          </div>

          {/* Slim Dismissible Sample Data Strip (Requirement 2) */}
          <SampleBanner isSample={meta?.is_sample} />
        </header>

        {/* ============================================================ */}
        {/* MAIN WORKSPACE CONTENT CONTAINER (Requirement 3 & 4)        */}
        {/* ============================================================ */}
        <main className="w-full flex-1 flex flex-col pb-12 sm:pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="w-full flex-1 flex flex-col"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ============================================================ */}
        {/* NON-OVERLAPPING OPAQUE STATIC FOOTER (Requirement 5 & Rule 6)*/}
        {/* Placed in standard content flow so nothing is hidden behind  */}
        {/* ============================================================ */}
        <footer className="w-full bg-surface-container-high dark:bg-primary-container border-t border-outline-variant/30 py-3.5 px-4 sm:px-6 lg:px-8 mt-auto mb-14 sm:mb-0 relative z-20 shadow-xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-on-surface-variant">
            <div className="flex items-center gap-2 text-center sm:text-left">
              <span className="material-symbols-outlined text-error text-[18px] shrink-0" aria-hidden="true">
                warning
              </span>
              <span className="font-bold text-on-surface shrink-0">OFFICIAL NOTICE:</span>
              <span>
                Information only, not professional advice. In an emergency contact official services (Sindh PDMA 1736 | Rescue 1122).
              </span>
            </div>
            <div className="shrink-0 font-mono text-[10px] text-on-surface-variant">
              SINDH PDMA / KMC CELL v0.2 · DUCKDB READ-ONLY
            </div>
          </div>
        </footer>

        {/* ============================================================ */}
        {/* MOBILE BOTTOM NAVIGATION BAR (< 640px)                      */}
        {/* Touch targets >= 44px                                       */}
        {/* ============================================================ */}
        <nav
          className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-primary-container text-on-primary border-t border-primary flex items-center justify-around px-1 shadow-2xl"
          aria-label="Mobile Bottom Navigation"
        >
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors text-[10px] ${
                  isActive
                    ? 'text-secondary-container font-bold'
                    : 'text-on-primary-container hover:text-on-primary'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {item.icon}
              </span>
              <span className="truncate max-w-[60px] text-center">
                {t(item.labelKey, item.defaultLabel)}
              </span>
            </NavLink>
          ))}
          <NavLink
            to="/methodology"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] transition-colors text-[10px] ${
                isActive
                  ? 'text-secondary-container font-bold'
                  : 'text-on-primary-container hover:text-on-primary'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              more_horiz
            </span>
            <span className="truncate">More</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
};
