import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StatusBar } from './StatusBar';
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
  { path: '/eight-impacts', labelKey: 'nav.eightImpacts', defaultLabel: 'Eight Impacts', icon: 'grid_view' },
  { path: '/insight-agent', labelKey: 'nav.insightAgent', defaultLabel: 'Insight Agent', icon: 'auto_awesome' },
  { path: '/data-quality', labelKey: 'nav.dataQuality', defaultLabel: 'Data Quality', icon: 'verified_user' },
  { path: '/pipeline-freshness', labelKey: 'nav.pipelineFreshness', defaultLabel: 'Pipeline & Freshness', icon: 'history_toggle_off' },
  { path: '/about-limits', labelKey: 'nav.aboutLimits', defaultLabel: 'About & Limits', icon: 'info' },
];

export const Layout: React.FC<LayoutProps> = ({ meta, isLoadingMeta = false }) => {
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ur' ? 'en' : 'ur';
    i18n.changeLanguage(nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
  };

  const isRtl = i18n.language === 'ur';

  return (
    <div className={`min-h-screen bg-background text-on-surface flex flex-col ${isRtl ? 'font-urdu' : 'font-sans'}`}>
      {/* ============================================================ */}
      {/* DESKTOP SIDEBAR (hidden on mobile < md)                      */}
      {/* ============================================================ */}
      <aside
        className={`hidden md:flex fixed top-0 bottom-0 ${
          isRtl ? 'right-0' : 'left-0'
        } w-[260px] bg-primary-container text-on-primary z-50 flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.06)]`}
        aria-label="Main Navigation"
      >
        <div className="flex flex-col">
          {/* Logo & Civic Branding */}
          <div className="h-16 px-space-md flex items-center gap-space-sm bg-primary border-b border-primary-container">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-on-secondary text-[22px]" aria-hidden="true">
                shield
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-title-md text-title-md text-on-primary truncate tracking-tight font-bold">
                ClimateShield 360
              </span>
              <span className="font-mono text-[10px] text-on-primary-container uppercase tracking-wider truncate">
                SINDH PDMA / KMC
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="px-space-md py-space-sm">
            <div className="font-mono text-[11px] text-on-primary-container uppercase tracking-wider mb-space-xs font-semibold">
              Operational Console
            </div>
            <nav className="flex flex-col gap-1" aria-label="Console Modules">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-space-sm px-space-sm py-2 rounded-lg transition-colors font-medium text-body-md ${
                      isActive
                        ? 'bg-secondary text-on-secondary font-semibold shadow-sm'
                        : 'text-on-primary-container hover:bg-primary hover:text-on-primary'
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="truncate">{t(item.labelKey, item.defaultLabel)}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer: Hotline & Officer Profile */}
        <div className="p-space-md flex flex-col gap-space-sm bg-primary border-t border-primary-container">
          <div className="bg-error/20 p-space-sm rounded-lg flex items-center gap-space-sm border border-error/30">
            <span className="material-symbols-outlined text-error text-[20px] shrink-0" aria-hidden="true">
              emergency
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-[10px] text-on-primary font-bold uppercase tracking-wider">
                Emergency Hotline
              </span>
              <span className="font-mono text-[11px] text-on-primary font-bold">
                PDMA: 1736 | 1122
              </span>
            </div>
          </div>

          <div className="flex items-center gap-space-sm p-space-xs">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-secondary text-[18px]" aria-hidden="true">
                person
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-body-sm text-body-sm text-on-primary font-semibold truncate">
                Engr. Tariq Khan
              </span>
              <span className="font-mono text-[10px] text-on-primary-container truncate">
                Karachi East Ops Cell
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTENT AREA WITH TOP BAR AND FOOTER                    */}
      {/* ============================================================ */}
      <div className={`flex-1 flex flex-col ${isRtl ? 'md:pr-[260px]' : 'md:pl-[260px]'}`}>
        {/* Top Header */}
        <header
          className={`fixed top-0 right-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-outline-variant/30 shadow-sm ${
            isRtl ? 'left-0 md:right-[260px]' : 'left-0 md:left-[260px]'
          }`}
        >
          <div className="h-16 w-full px-space-md lg:px-space-lg flex items-center justify-between gap-space-md">
            {/* Left: Mobile Brand & Filters */}
            <div className="flex items-center gap-space-md min-w-0">
              <div className="flex md:hidden items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[24px]">shield</span>
                <span className="font-bold text-title-md text-on-surface truncate">ClimateShield</span>
              </div>

              {/* Time Horizon Filter */}
              <div className="hidden sm:flex items-center bg-surface-container-high rounded-full p-0.5 border border-outline-variant/30">
                <button
                  type="button"
                  className="px-space-sm py-1 rounded-full font-mono text-[11px] bg-primary text-on-primary font-semibold shadow-sm"
                >
                  Next 24h
                </button>
                <button
                  type="button"
                  className="px-space-sm py-1 rounded-full font-mono text-[11px] text-on-surface-variant hover:text-on-surface"
                >
                  48h
                </button>
                <button
                  type="button"
                  className="px-space-sm py-1 rounded-full font-mono text-[11px] text-on-surface-variant hover:text-on-surface"
                >
                  7 days
                </button>
              </div>

              {/* Zone Selector */}
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  className="flex items-center gap-space-xs px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm border border-outline-variant/30 hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    location_on
                  </span>
                  <span>All Karachi Zones (18 Towns / Cantt)</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                </button>
              </div>
            </div>

            {/* Right: Status Telemetry & Controls */}
            <div className="flex items-center gap-space-sm sm:gap-space-md shrink-0">
              {/* StatusBar Telemetry */}
              <div className="hidden md:block">
                <StatusBar meta={meta} isLoading={isLoadingMeta} />
              </div>

              {/* Language Toggle (English | Urdu) */}
              <button
                type="button"
                onClick={toggleLanguage}
                title="Switch English / Urdu"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30 text-xs font-semibold transition-colors"
                aria-label="Toggle language"
              >
                <span className="material-symbols-outlined text-[18px]">translate</span>
                <span className="font-mono text-[11px]">
                  {i18n.language === 'ur' ? 'English' : 'اردو'}
                </span>
              </button>

              {/* Profile icon */}
              <div
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm"
                aria-label="Operator account"
              >
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Workspace */}
        <main className="w-full pt-20 pb-24 md:pb-16 bg-surface min-h-screen">
          <Outlet />
        </main>

        {/* ============================================================ */}
        {/* OFFICIAL ADVICE DISCLAIMER FOOTER (Rule 6)                   */}
        {/* ============================================================ */}
        <footer
          className={`fixed bottom-0 z-40 bg-surface-container-highest border-t border-outline-variant/40 shadow-sm ${
            isRtl ? 'left-0 md:right-[260px]' : 'left-0 md:left-[260px]'
          } right-0 mb-14 md:mb-0`}
        >
          <div className="h-10 md:h-12 w-full px-space-md lg:px-space-lg flex items-center justify-between text-on-surface-variant text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="material-symbols-outlined text-error text-[18px] shrink-0" aria-hidden="true">
                warning
              </span>
              <span className="font-bold text-on-surface shrink-0">OFFICIAL NOTICE:</span>
              <span className="truncate">
                Information only, not professional advice. In an emergency contact official services (Sindh PDMA 1736 | Rescue 1122).
              </span>
            </div>
            <div className="hidden sm:block shrink-0 ml-space-md font-mono text-[11px] text-on-surface-variant font-medium">
              SINDH PDMA / KMC CELL v0.1
            </div>
          </div>
        </footer>

        {/* ============================================================ */}
        {/* MOBILE BOTTOM TAB BAR (< md)                                 */}
        {/* ============================================================ */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-primary-container text-on-primary border-t border-primary flex items-center justify-around px-1 shadow-lg"
          aria-label="Mobile Navigation"
        >
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 transition-colors text-[10px] ${
                  isActive
                    ? 'text-secondary-container font-bold'
                    : 'text-on-primary-container hover:text-on-primary'
                }`
              }
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {item.icon}
              </span>
              <span className="truncate max-w-[64px] text-center">
                {t(item.labelKey, item.defaultLabel)}
              </span>
            </NavLink>
          ))}
          {/* More link for remaining items on mobile */}
          <NavLink
            to="/about-limits"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 transition-colors text-[10px] ${
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
