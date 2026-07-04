// Top navigation bar — logo, profile switcher, desktop/mobile nav, user menu.
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, UserProfileSlot } from '../types';
import type { WorkerUser } from '../services/authService';
import { ProfileManager } from './ProfileManager';
import { ProfileColor } from '../types';
import { colorBg, navTimeAgo } from '../utils/profileUtils';
import { isPureFreeTier, getTier } from '../services/accountTierService';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import { UsersIcon } from './nav/NavIcons';
import {
  FileText, Settings, User, Moon, Sun,
} from './icons';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface AppNavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  primaryNav: NavItem[];
  moreNavGroups: NavGroup[];
  isMoreActive: boolean;
  handleNavClick: (id: string) => void;
  GATED_VIEWS: Set<string>;
  profileExists: boolean;
  isEditingProfile: boolean;
  activeSlot: UserProfileSlot | null | undefined;
  profiles: UserProfileSlot[];
  userProfile: UserProfile | null;
  user: WorkerUser | null | undefined;
  isAuthenticated: boolean;
  darkMode: boolean;
  setDarkMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  setIsSettingsOpen: (v: boolean) => void;
  setIsPricingOpen: (v: boolean) => void;
  setIsEditingProfile: (v: boolean) => void;
  setShowLanding: (v: boolean) => void;
  isMobile: boolean;
  signOut: () => Promise<void>;
  onSwitchProfile: (slot: UserProfileSlot) => void;
  onCreateProfile: (name: string, color: ProfileColor, cloneFrom?: UserProfile) => void;
  onDeleteProfile: (id: string) => Promise<void>;
  onRenameProfile: (id: string, name: string, color: ProfileColor) => void;
}

const AppNavbar: React.FC<AppNavbarProps> = ({
  currentView,
  setCurrentView,
  primaryNav,
  moreNavGroups,
  isMoreActive,
  handleNavClick,
  GATED_VIEWS,
  profileExists,
  isEditingProfile,
  activeSlot,
  profiles,
  userProfile,
  user,
  isAuthenticated,
  darkMode,
  setDarkMode,
  setIsSettingsOpen,
  setIsPricingOpen,
  setIsEditingProfile,
  setShowLanding,
  isMobile,
  signOut,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
}) => {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const profileManagerRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const slotColor = activeSlot?.color ?? 'indigo';

  // Close More menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  // Close profile manager dropdown on outside click — desktop only
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: MouseEvent) => {
      if (
        profileManagerRef.current &&
        !profileManagerRef.current.contains(e.target as Node)
      ) {
        setShowProfileManager(false);
      }
    };
    if (showProfileManager) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileManager, isMobile]);

  return (
    <header className="bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 sticky top-0 z-20 shadow-sm">
      {/* ── Row 1: Logo + Controls ──────────────────────────────────── */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-between items-center gap-3">
        <button
          onClick={() => {
            if (isAuthenticated) {
              setCurrentView('dashboard');
            } else {
              setShowLanding(true);
            }
          }}
          className="flex items-center gap-2.5 group flex-shrink-0"
          title="Go to dashboard"
        >
          <img
            src="/logo.svg"
            alt="ProCV"
            className="h-9 w-9 rounded-xl flex-shrink-0"
            draggable={false}
          />
          <div className="text-left">
            <h1
              className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 leading-none"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              ProCV
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5 hidden sm:block">
              Your Personal Career Consultant
            </p>
          </div>
          <div className="hidden sm:block w-px h-8 bg-[#C9A84C]/30 ml-1" />
        </button>

        <div className="flex items-center gap-2">
          {/* ── Profile switcher ───────────────────────────── */}
          {profileExists && (
            <div className="relative" ref={profileManagerRef}>
              <button
                onClick={() => setShowProfileManager((v) => !v)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 text-sm font-bold rounded-xl border transition-all ${showProfileManager ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 border-[#C9A84C]/40 dark:border-[#1B2B4B]/40 text-[#1B2B4B] dark:text-[#C9A84C]/80' : 'bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-neutral-700'}`}
                title="Switch profile"
              >
                <div
                  className={`w-7 h-7 rounded-full ${colorBg(slotColor)} flex items-center justify-center text-[10px] text-white font-extrabold flex-shrink-0`}
                >
                  {(
                    activeSlot?.profile?.personalInfo?.name ||
                    activeSlot?.name ||
                    '?'
                  )
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <span className="hidden sm:flex flex-col items-start leading-none gap-0.5 min-w-0">
                  <span className="max-w-[90px] truncate text-sm font-bold">
                    {activeSlot?.name ?? 'Profile'}
                  </span>
                  {(activeSlot?.lastAtsScore !== undefined || activeSlot?.lastGeneratedAt) && (
                    <span className="flex items-center gap-1">
                      {activeSlot?.lastAtsScore !== undefined && (
                        <span
                          className="text-[9px] font-extrabold px-1 py-px rounded"
                          style={{
                            background:
                              activeSlot.lastAtsScore >= 80 ? '#dcfce7'
                              : activeSlot.lastAtsScore >= 60 ? '#fef9c3'
                              : '#fee2e2',
                            color:
                              activeSlot.lastAtsScore >= 80 ? '#15803d'
                              : activeSlot.lastAtsScore >= 60 ? '#a16207'
                              : '#b91c1c',
                          }}
                        >
                          ATS {activeSlot.lastAtsScore}
                        </span>
                      )}
                      {activeSlot?.lastGeneratedAt && (
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">
                          {navTimeAgo(activeSlot.lastGeneratedAt)}
                        </span>
                      )}
                    </span>
                  )}
                </span>

                <UsersIcon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
              </button>

              {/* Desktop dropdown */}
              {showProfileManager && !isMobile && (
                <div className="absolute right-0 top-full mt-2 w-[380px] bg-white dark:bg-neutral-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-zinc-200 dark:border-neutral-700 p-4 z-50 flex flex-col md:max-h-[70vh]">
                  <ProfileManager
                    profiles={profiles}
                    activeProfileId={activeSlot?.id ?? null}
                    onSwitch={onSwitchProfile}
                    onCreate={onCreateProfile}
                    onDelete={onDeleteProfile}
                    onRename={onRenameProfile}
                    currentProfile={userProfile}
                    onClose={() => setShowProfileManager(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Upgrade / Plans button ── */}
          {getTier() !== 'premium' && (
            <button
              onClick={() => setIsPricingOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border transition-all flex-shrink-0"
              style={{ background: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.35)', color: '#C9A84C' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,168,76,0.16)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,168,76,0.08)'; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
              Plans
            </button>
          )}

          {/* ── Dark mode toggle ── */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-neutral-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-neutral-700 transition-colors flex-shrink-0"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* ── Consolidated user menu ── */}
          <div className="relative flex-shrink-0" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className={`group flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-all ${
                showUserMenu
                  ? 'bg-[#1B2B4B]/5 dark:bg-[#C9A84C]/10 border-[#C9A84C]/40 dark:border-[#C9A84C]/30'
                  : 'bg-zinc-100 dark:bg-neutral-800 border-zinc-200 dark:border-neutral-700 hover:bg-zinc-200 dark:hover:bg-neutral-700'
              }`}
              aria-label="User menu"
            >
              {(isAuthenticated && user?.picture) ? (
                <img src={user.picture} alt={user.name} referrerPolicy="no-referrer"
                     className="w-7 h-7 rounded-full ring-2 ring-[#C9A84C]/50 shadow-sm flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#1B2B4B] dark:bg-[#C9A84C] flex items-center justify-center text-[11px] text-white dark:text-[#1B2B4B] font-black flex-shrink-0">
                  {((isAuthenticated && user ? (user.name || user.email) : '') || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:inline text-xs font-bold text-zinc-700 dark:text-zinc-200 max-w-[90px] truncate">
                {isAuthenticated && user
                  ? (user.name || user.email || '').split(' ')[0]
                  : 'Menu'}
              </span>
              <svg className={`h-3 w-3 text-zinc-400 transition-transform flex-shrink-0 ${showUserMenu ? 'rotate-180' : ''}`}
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 overflow-hidden z-50 animate-nav-slide-down">
                {(isAuthenticated && user) && (
                  <div className="px-4 py-3 border-b border-zinc-100 dark:border-neutral-700 bg-zinc-50 dark:bg-neutral-900/50">
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-100 truncate">{user.name || user.email?.split('@')[0]}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{user.email}</p>
                  </div>
                )}
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { setShowUserMenu(false); setIsSettingsOpen(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                  >
                    <Settings className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                    Settings &amp; API Keys
                  </button>
                  {isAuthenticated && (
                    <button
                      onClick={() => { setShowUserMenu(false); setIsEditingProfile(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                    >
                      <User className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                      {profileExists ? 'Edit Profile' : 'Create Profile'}
                    </button>
                  )}
                  {isAuthenticated && (
                    <button
                      onClick={() => { setShowUserMenu(false); setCurrentView('account'); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                    >
                      <svg className="h-4 w-4 text-zinc-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                      My Account
                    </button>
                  )}
                </div>
                {isAuthenticated && (
                  <div className="p-1.5 border-t border-zinc-100 dark:border-neutral-700">
                    <button
                      onClick={async () => {
                        setShowUserMenu(false);
                        await clearQueueForAccount().catch(() => {});
                        await signOut();
                        setShowLanding(true);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                    >
                      <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
                {!isAuthenticated && (
                  <div className="p-1.5">
                    <button
                      onClick={() => { setShowUserMenu(false); setIsSettingsOpen(true); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#1B2B4B] dark:text-[#C9A84C] hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-colors text-left"
                    >
                      <Settings className="h-4 w-4 flex-shrink-0" />
                      Cloud Sync &amp; Settings
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Responsive Nav ───────────────────────────────────── */}
      {profileExists && !isEditingProfile && (
        <div className="border-t border-zinc-200 dark:border-neutral-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            {/* ── Desktop nav ── */}
            <div className="hidden sm:flex items-center gap-0.5 py-1">
              {primaryNav.map((item) => {
                const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={item.label}
                    className={`flex items-center gap-1.5 px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                      currentView === item.id
                        ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C] border-b-2 border-[#C9A84C]'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800 border-b-2 border-transparent'
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{item.label}</span>
                    {gated && <span className="ml-0.5 text-[8px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                  </button>
                );
              })}

              {/* ── More dropdown ── */}
              <div className="relative ml-1" ref={moreMenuRef}>
                <button
                  onClick={() => setShowMoreMenu((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                    isMoreActive || showMoreMenu
                      ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/30 text-[#1B2B4B] dark:text-[#C9A84C]'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span>More</span>
                  <svg
                    className={`h-3 w-3 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {showMoreMenu && (
                  <div className="animate-nav-slide-down absolute left-0 top-full mt-1 w-64 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-neutral-700 p-2 z-50">
                    {moreNavGroups.map((group) => (
                      <div key={group.label} className="mb-1 last:mb-0">
                        <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          {group.label}
                        </p>
                        {group.items.map((item) => {
                          const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleNavClick(item.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                                currentView === item.id
                                  ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
                              }`}
                            >
                              <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="flex-1">{item.label}</span>
                              {gated && <span className="text-[8px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Mobile nav: hamburger + slide-down ── */}
            <div className="sm:hidden flex items-center justify-between py-1.5">
              <div className="flex gap-0.5 overflow-x-auto no-scrollbar">
                {primaryNav.slice(0, 3).map((item) => {
                  const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                        currentView === item.id
                          ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <item.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{item.label}</span>
                      {gated && <span className="ml-0.5 text-[7px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowMobileMenu((v) => !v)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ml-1 ${
                  showMobileMenu || isMoreActive
                    ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-neutral-800'
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>

            {/* ── Mobile slide-down full menu ── */}
            {showMobileMenu && (
              <div className="animate-mobile-menu sm:hidden pb-3 border-t border-zinc-100 dark:border-neutral-700 pt-2">
                {moreNavGroups.map((group) => (
                  <div key={group.label} className="mb-1">
                    <p className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.items.map((item) => {
                        const gated = isPureFreeTier() && GATED_VIEWS.has(item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                              currentView === item.id
                                ? 'bg-[#F8F7F4] dark:bg-[#1B2B4B]/20 text-[#1B2B4B] dark:text-[#C9A84C]'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700'
                            }`}
                          >
                            <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            {gated && <span className="text-[7px] font-black px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">PRO</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* ── Mobile account/sign-out row ── */}
                {isAuthenticated && (
                  <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-neutral-700 px-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        setCurrentView('account');
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-neutral-700 transition-all"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                      My Account
                      {user?.email && (
                        <span className="ml-auto text-[10px] font-normal text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">{user.email}</span>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        setShowMobileMenu(false);
                        await clearQueueForAccount().catch(() => {});
                        await signOut();
                        setShowLanding(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile ProfileManager bottom-sheet ── */}
      {showProfileManager && isMobile && profileExists && (
        <ProfileManager
          isMobileOverlay
          profiles={profiles}
          activeProfileId={activeSlot?.id ?? null}
          onSwitch={onSwitchProfile}
          onCreate={onCreateProfile}
          onDelete={onDeleteProfile}
          onRename={onRenameProfile}
          currentProfile={userProfile}
          onClose={() => setShowProfileManager(false)}
        />
      )}
    </header>
  );
};

export default AppNavbar;
