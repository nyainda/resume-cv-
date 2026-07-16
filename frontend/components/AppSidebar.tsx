// Dark / light-aware fixed sidebar — the background, text, and icon colours all
// adapt to the current theme so the sidebar feels native in both modes.
// All nav props are identical to the old version so App.tsx needs no changes.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile, UserProfileSlot, ProfileColor } from '../types';
import type { WorkerUser } from '../services/authService';
import { ProfileManager } from './ProfileManager';
import { isPureFreeTier, getTier } from '../services/accountTierService';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import { Settings } from './icons';

const GOLD = '#C9A84C';
// Dark mode surfaces: neutral-900 territory — no blue, matches App.tsx dark bg
const DARK_BG = '#111111';

// ── Shared types (mirror AppNavbar) ─────────────────────────────────────────
interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}
export interface AppSidebarProps {
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
  onOpenCmdPalette?: () => void;
}

// ── Theme helpers ─────────────────────────────────────────────────────────────
// These return Tailwind class strings that change based on the current mode,
// keeping all theme logic in one place rather than scattered inline.

const tw = {
  sidebarBg: (dark: boolean) =>
    dark ? '' : 'bg-white border-r border-zinc-200',

  sidebarStyle: (dark: boolean) =>
    dark ? { background: DARK_BG } : {},

  logoText: (dark: boolean) =>
    dark ? 'text-white' : 'text-[#1B2B4B]',

  sectionLabel: (dark: boolean) =>
    dark ? 'text-white/30' : 'text-zinc-400',

  navInactive: (dark: boolean) =>
    dark
      ? 'text-white/60 hover:text-white hover:bg-white/5'
      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50',

  navActive: (dark: boolean) =>
    dark
      ? 'text-[#C9A84C] bg-[#C9A84C]/10'
      : 'text-[#B8922A] bg-amber-50',

  proBadgeBg: (dark: boolean) =>
    dark ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.15)',

  divider: (dark: boolean) =>
    dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',

  premiumBanner: (dark: boolean) =>
    dark
      ? { background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }
      : { background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)' },

  premiumTitle: (dark: boolean) =>
    dark ? 'text-white' : 'text-zinc-900',

  premiumSubtext: (dark: boolean) =>
    dark ? 'text-white/45' : 'text-zinc-500',

  userDisplayName: (dark: boolean) =>
    dark ? 'text-white' : 'text-zinc-900',

  userPlan: (isPremium: boolean, dark: boolean) =>
    isPremium ? '' : (dark ? 'rgba(255,255,255,0.35)' : '#6B7280'),

  iconBtn: (dark: boolean) =>
    dark
      ? 'text-white/35 hover:text-white/80 hover:bg-white/5'
      : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100',

  profileChevron: (dark: boolean) =>
    dark ? 'text-white/25' : 'text-zinc-300',

  profileRow: (dark: boolean) =>
    dark ? 'hover:bg-white/5' : 'hover:bg-zinc-50',

  mobileBar: (dark: boolean) =>
    dark ? { background: DARK_BG, borderBottom: '1px solid rgba(255,255,255,0.07)' }
         : { background: '#ffffff', borderBottom: '1px solid #E5E2DC' },

  mobileLogoText: (dark: boolean) =>
    dark ? 'text-white' : 'text-[#1B2B4B]',

  mobileIconBtn: (dark: boolean) =>
    dark
      ? 'text-white/50 hover:text-white hover:bg-white/10'
      : 'text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100',

  mobileHamburger: (dark: boolean) =>
    dark
      ? 'text-white/60 hover:text-white hover:bg-white/10'
      : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100',
};

// ── Small building blocks ─────────────────────────────────────────────────────

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  isGated: boolean;
  darkMode: boolean;
  onClick: () => void;
}
const NavLink: React.FC<NavLinkProps> = ({ item, isActive, isGated, darkMode: dark, onClick }) => (
  <button
    onClick={onClick}
    title={item.label}
    className={`w-full flex items-center gap-2.5 pl-4 pr-2 py-[7px] text-[11.5px] font-semibold transition-all duration-150 text-left ${
      isActive ? tw.navActive(dark) : tw.navInactive(dark)
    }`}
    style={{
      borderLeft: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
    }}
  >
    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
    <span className="flex-1 leading-tight">{item.label}</span>
    {isGated && (
      <span
        className="text-[7px] font-black px-1 py-0.5 rounded mr-1 flex-shrink-0"
        style={{ background: tw.proBadgeBg(dark), color: GOLD }}
      >
        PRO
      </span>
    )}
  </button>
);

interface SidebarSectionProps {
  label: string;
  items: NavItem[];
  currentView: string;
  darkMode: boolean;
  onNavClick: (id: string) => void;
  GATED_VIEWS: Set<string>;
}
const SidebarSection: React.FC<SidebarSectionProps> = ({
  label, items, currentView, darkMode: dark, onNavClick, GATED_VIEWS,
}) => (
  <div>
    <p className={`pl-4 mb-1 text-[9px] font-black uppercase tracking-[0.14em] ${tw.sectionLabel(dark)}`}>
      {label}
    </p>
    {items.map((item) => (
      <NavLink
        key={item.id}
        item={item}
        isActive={currentView === item.id}
        isGated={isPureFreeTier() && GATED_VIEWS.has(item.id)}
        darkMode={dark}
        onClick={() => onNavClick(item.id)}
      />
    ))}
  </div>
);

// ── Inner sidebar content — extracted so it can be reused in mobile drawer ───
interface SidebarInnerProps extends AppSidebarProps {
  onAfterNavClick?: () => void;
  profileManagerRef: React.RefObject<HTMLDivElement | null>;
  showProfileManager: boolean;
  setShowProfileManager: (v: boolean | ((p: boolean) => boolean)) => void;
}

const SidebarInner: React.FC<SidebarInnerProps> = ({
  currentView,
  setCurrentView,
  primaryNav,
  moreNavGroups,
  handleNavClick,
  GATED_VIEWS,
  profileExists,
  activeSlot,
  profiles,
  userProfile,
  user,
  isAuthenticated,
  darkMode,
  setDarkMode,
  setIsSettingsOpen,
  setIsPricingOpen,
  setShowLanding,
  signOut,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onAfterNavClick,
  onOpenCmdPalette,
  profileManagerRef,
  showProfileManager,
  setShowProfileManager,
}) => {
  const dark = darkMode;
  const isPremium = getTier() === 'premium';
  const userInitial = ((isAuthenticated && user ? (user.name || user.email) : '') || 'U')
    .charAt(0)
    .toUpperCase();
  const userDisplayName = isAuthenticated && user
    ? (user.name || user.email || '').split(' ')[0]
    : 'Guest';

  const clickAndClose = useCallback((id: string) => {
    handleNavClick(id);
    onAfterNavClick?.();
  }, [handleNavClick, onAfterNavClick]);

  const handleSignOut = useCallback(async () => {
    onAfterNavClick?.();
    await clearQueueForAccount().catch(() => {});
    await signOut();
    setShowLanding(true);
  }, [signOut, setShowLanding, onAfterNavClick]);

  const mainItems = primaryNav.slice(0, 1);
  const coreItems = primaryNav.slice(1);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          if (isAuthenticated) {
            clickAndClose('dashboard');
          } else {
            setShowLanding(true);
            onAfterNavClick?.();
          }
        }}
        className="flex items-center gap-2.5 px-4 pt-5 pb-4 flex-shrink-0 hover:opacity-90 transition-opacity"
      >
        <img
          src="/logo.svg"
          alt="ProCV"
          className="h-8 w-8 rounded-lg flex-shrink-0 shadow-md"
          draggable={false}
        />
        <div className="text-left leading-none">
          <div
            className={`text-[14px] font-extrabold ${tw.logoText(dark)}`}
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            ProCV
          </div>
          <div
            className="text-[8px] font-black tracking-[0.12em] uppercase mt-0.5"
            style={{ color: GOLD }}
          >
            Career Suite
          </div>
        </div>
      </button>

      {/* ── Nav sections ──────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4 no-scrollbar">
        <SidebarSection
          label="Main"
          items={mainItems}
          currentView={currentView}
          darkMode={dark}
          onNavClick={clickAndClose}
          GATED_VIEWS={GATED_VIEWS}
        />
        <SidebarSection
          label="Core"
          items={coreItems}
          currentView={currentView}
          darkMode={dark}
          onNavClick={clickAndClose}
          GATED_VIEWS={GATED_VIEWS}
        />
        {moreNavGroups.map((group) => (
          <SidebarSection
            key={group.label}
            label={group.label}
            items={group.items}
            currentView={currentView}
            darkMode={dark}
            onNavClick={clickAndClose}
            GATED_VIEWS={GATED_VIEWS}
          />
        ))}
      </nav>

      {/* ── Go Premium banner ─────────────────────────────────────── */}
      {!isPremium && (
        <div
          className="mx-2 mb-2 rounded-xl p-3 flex-shrink-0"
          style={tw.premiumBanner(dark)}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill={GOLD}>
              <path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
            </svg>
            <span className={`text-[10.5px] font-black ${tw.premiumTitle(dark)}`}>Go Premium</span>
          </div>
          <p className={`text-[9px] leading-snug mb-2.5 ${tw.premiumSubtext(dark)}`}>
            Unlock all features, unlimited downloads &amp; priority support.
          </p>
          <button
            onClick={() => { setIsPricingOpen(true); onAfterNavClick?.(); }}
            className="w-full py-1.5 rounded-lg text-[10px] font-black transition-opacity hover:opacity-90 active:scale-95"
            style={{ background: GOLD, color: dark ? DARK_BG : '#1B2B4B' }}
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* ── User / profile area ───────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: tw.divider(dark) }}
      >

        {/* Profile switcher button */}
        <div className="relative" ref={profileManagerRef}>
          <button
            onClick={() => setShowProfileManager((v) => !v)}
            className={`w-full flex items-center gap-2.5 px-3 py-3 transition-colors ${tw.profileRow(dark)}`}
          >
            {isAuthenticated && user?.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? ''}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full flex-shrink-0"
                style={{ outline: `2px solid rgba(201,168,76,0.45)`, outlineOffset: 1 }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                style={{ background: GOLD, color: DARK_BG }}
              >
                {userInitial}
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-[11px] font-bold truncate leading-tight ${tw.userDisplayName(dark)}`}>
                {userDisplayName}
              </p>
              <p
                className="text-[9px] font-semibold leading-tight mt-0.5"
                style={{ color: isPremium ? GOLD : tw.userPlan(isPremium, dark) }}
              >
                {isPremium ? '★ Premium' : 'Free plan'}
              </p>
            </div>
            <svg
              className={`h-3 w-3 flex-shrink-0 ${tw.profileChevron(dark)}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* Profile manager dropdown (opens upward) */}
          {showProfileManager && profileExists && (
            <div
              className="absolute bottom-full left-0 mb-1 w-[340px] max-w-[calc(100vw-2rem)] bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 p-4 z-50 overflow-y-auto"
              style={{ maxHeight: '70vh' }}
            >
              <ProfileManager
                profiles={profiles}
                activeProfileId={activeSlot?.id ?? null}
                onSwitch={(slot) => { onSwitchProfile(slot); setShowProfileManager(false); }}
                onCreate={onCreateProfile}
                onDelete={onDeleteProfile}
                onRename={onRenameProfile}
                currentProfile={userProfile}
                onClose={() => setShowProfileManager(false)}
              />
            </div>
          )}
        </div>

        {/* Quick-action icon strip */}
        <div className="flex items-center justify-around px-3 pb-3 gap-1">
          {/* ⌘K search */}
          <button
            onClick={() => { onOpenCmdPalette?.(); onAfterNavClick?.(); }}
            title="Search — ⌘K"
            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${tw.iconBtn(dark)}`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </button>

          {/* Settings */}
          <button
            onClick={() => { setCurrentView('settings'); onAfterNavClick?.(); }}
            title="Settings"
            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${tw.iconBtn(dark)}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${tw.iconBtn(dark)}`}
          >
            {dark ? (
              /* Sun */
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              /* Moon */
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>

          {/* Sign out (authenticated) or sign-in placeholder */}
          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              title="Sign out"
              className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${
                dark
                  ? 'text-white/35 hover:text-red-400 hover:bg-red-500/10'
                  : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={() => { setCurrentView('settings'); onAfterNavClick?.(); }}
              title="Settings"
              className={`flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors ${tw.iconBtn(dark)}`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main sidebar component ───────────────────────────────────────────────────
const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [showProfileManager, setShowProfileManager] = useState(false);
  const profileManagerRef = useRef<HTMLDivElement>(null);
  const { darkMode } = props;
  const dark = darkMode;

  // User info needed for the mobile bottom sheet (mirrors SidebarInner logic)
  const isPremium = getTier() === 'premium';
  const userInitial = (
    (props.isAuthenticated && props.user ? (props.user.name || props.user.email) : '') || 'U'
  ).charAt(0).toUpperCase();
  const userDisplayName =
    props.isAuthenticated && props.user
      ? (props.user.name || props.user.email || '').split(' ')[0]
      : 'Guest';

  const handleMobileSignOut = useCallback(async () => {
    setShowMobileDrawer(false);
    await clearQueueForAccount().catch(() => {});
    await props.signOut();
    props.setShowLanding(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close profile manager on outside click
  useEffect(() => {
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
  }, [showProfileManager]);

  // Close drawer on Escape
  useEffect(() => {
    if (!showMobileDrawer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMobileDrawer(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showMobileDrawer]);

  const innerProps: SidebarInnerProps = {
    ...props,
    profileManagerRef,
    showProfileManager,
    setShowProfileManager,
  };

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col flex-shrink-0 w-[148px] sticky top-0 h-screen z-20 transition-colors duration-300 ${tw.sidebarBg(dark)}`}
        style={tw.sidebarStyle(dark)}
      >
        <SidebarInner {...innerProps} />
      </aside>

      {/* ── Mobile: sticky top bar ──────────────────────────────────────── */}
      <header
        className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 transition-colors duration-300"
        style={{
          ...tw.mobileBar(dark),
          boxShadow: dark ? '0 1px 0 rgba(255,255,255,0.06)' : '0 1px 0 #E5E2DC',
        }}
      >
        {/* Logo */}
        <button
          onClick={() =>
            props.isAuthenticated
              ? props.handleNavClick('dashboard')
              : props.setShowLanding(true)
          }
          className="flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <img src="/logo.svg" alt="ProCV" className="h-7 w-7 rounded-lg" draggable={false} />
          <span
            className={`text-[13px] font-extrabold ${tw.mobileLogoText(dark)}`}
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            ProCV
          </span>
        </button>

        {/* Right controls: search · dark-mode · avatar */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => props.onOpenCmdPalette?.()}
            className={`p-2 rounded-xl transition-colors ${tw.mobileIconBtn(dark)}`}
            aria-label="Search"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
          </button>
          <button
            onClick={() => props.setDarkMode((d) => !d)}
            className={`p-2 rounded-xl transition-colors ${tw.mobileIconBtn(dark)}`}
            aria-label={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          {/* Avatar → opens bottom sheet */}
          <button
            onClick={() => setShowMobileDrawer(true)}
            className="ml-1 h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
            style={{ background: GOLD, color: DARK_BG }}
            aria-label="Open menu"
          >
            {props.isAuthenticated && props.user?.picture
              ? <img src={props.user.picture} className="h-8 w-8 rounded-full object-cover" alt="" />
              : userInitial
            }
          </button>
        </div>
      </header>

      {/* ── Mobile: bottom tab bar ───────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch transition-colors duration-300"
        style={{
          ...(dark
            ? { background: DARK_BG, borderTop: '1px solid rgba(255,255,255,0.08)' }
            : { background: '#ffffff', borderTop: '1px solid #E5E2DC' }),
          paddingBottom: 'env(safe-area-inset-bottom)',
          height: 'calc(58px + env(safe-area-inset-bottom))',
        }}
        aria-label="Primary navigation"
      >
        {props.primaryNav.map((item) => {
          const isActive = props.currentView === item.id;
          const isGated  = isPureFreeTier() && props.GATED_VIEWS.has(item.id);
          const shortLabel = item.label === 'CV Generator' ? 'CV Gen'
            : item.label === 'Interview Prep' ? 'Interview'
            : item.label === 'Job Tracker' ? 'Tracker'
            : item.label === 'Score My CV' ? 'Score'
            : item.label;
          return (
            <button
              key={item.id}
              onClick={() => props.handleNavClick(item.id)}
              className="flex-1 relative flex flex-col items-center justify-center gap-[3px] min-w-0 transition-all active:scale-95"
              style={{ color: isActive ? GOLD : dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Gold pill indicator at top of active tab */}
              <span
                className="absolute top-0 inset-x-1/4 h-[3px] rounded-b-full transition-all duration-200"
                style={{ background: isActive ? GOLD : 'transparent' }}
              />
              <div className="relative">
                <item.icon className="h-[19px] w-[19px]" />
                {isGated && (
                  <span
                    className="absolute -top-1 -right-1.5 text-[6px] font-black px-0.5 py-px rounded leading-none"
                    style={{ background: GOLD, color: DARK_BG }}
                  >
                    PRO
                  </span>
                )}
              </div>
              <span className="text-[9px] font-semibold leading-none truncate max-w-full px-1">
                {shortLabel}
              </span>
            </button>
          );
        })}

        {/* "More" — opens bottom sheet with secondary nav */}
        <button
          onClick={() => setShowMobileDrawer(true)}
          className="flex-1 relative flex flex-col items-center justify-center gap-[3px] min-w-0 transition-all active:scale-95"
          style={{ color: showMobileDrawer ? GOLD : dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}
          aria-label="More options"
        >
          <span
            className="absolute top-0 inset-x-1/4 h-[3px] rounded-b-full transition-all duration-200"
            style={{ background: showMobileDrawer ? GOLD : 'transparent' }}
          />
          <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
          </svg>
          <span className="text-[9px] font-semibold leading-none">More</span>
        </button>
      </nav>

      {/* ── Mobile: bottom sheet ─────────────────────────────────────────── */}
      {/* Replaces the old left slide-over. Only shows SECONDARY nav groups  */}
      {/* (moreNavGroups) — primary items already live in the bottom tab bar. */}
      {showMobileDrawer && (
        <>
          <style>{`
            @keyframes procv-sheet-up {
              from { transform: translateY(100%); }
              to   { transform: translateY(0);    }
            }
          `}</style>
          <div className="md:hidden fixed inset-0 z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setShowMobileDrawer(false)}
            />
            {/* Sheet panel */}
            <div
              className={`absolute bottom-0 inset-x-0 flex flex-col rounded-t-[24px] shadow-2xl overflow-hidden transition-colors duration-300 ${tw.sidebarBg(dark)}`}
              style={{
                ...tw.sidebarStyle(dark),
                maxHeight: '82vh',
                animation: 'procv-sheet-up 0.28s cubic-bezier(0.32,0.72,0,1)',
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div
                  className="w-9 h-[3px] rounded-full"
                  style={{ background: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)' }}
                />
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 no-scrollbar">

                {/* ── User profile row ── */}
                {props.isAuthenticated && props.user && (
                  <div
                    className="flex items-center gap-3 px-5 py-4 mx-4 mt-2 mb-1 rounded-2xl"
                    style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(27,43,75,0.04)' }}
                  >
                    {props.user.picture ? (
                      <img src={props.user.picture} className="h-10 w-10 rounded-full object-cover flex-shrink-0" alt="" />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                        style={{ background: GOLD, color: DARK_BG }}
                      >
                        {userInitial}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight truncate" style={{ color: dark ? '#fff' : DARK_BG }}>
                        {userDisplayName}
                      </p>
                      <p className="text-[11px] leading-tight truncate mt-0.5" style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                        {props.user.email}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                      style={{
                        background: isPremium ? `${GOLD}25` : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                        color: isPremium ? GOLD : (dark ? 'rgba(255,255,255,0.45)' : '#6B7280'),
                      }}
                    >
                      {isPremium ? '✦ Premium' : 'Free'}
                    </span>
                  </div>
                )}

                {/* ── Secondary nav groups ── */}
                {props.moreNavGroups.map((group) => (
                  <div key={group.label} className="mt-3">
                    <p
                      className="px-5 pb-1 text-[10px] font-black uppercase tracking-[0.14em]"
                      style={{ color: dark ? 'rgba(255,255,255,0.28)' : '#9CA3AF' }}
                    >
                      {group.label}
                    </p>
                    {group.items.map((item) => {
                      const isActive = props.currentView === item.id;
                      const isGated  = isPureFreeTier() && props.GATED_VIEWS.has(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => { props.handleNavClick(item.id); setShowMobileDrawer(false); }}
                          className="w-full flex items-center gap-3 px-5 py-3 transition-colors"
                          style={{
                            background: isActive
                              ? (dark ? `${GOLD}14` : `${GOLD}0D`)
                              : 'transparent',
                            color: isActive
                              ? GOLD
                              : (dark ? 'rgba(255,255,255,0.75)' : '#1B2B4B'),
                            borderLeft: `3px solid ${isActive ? GOLD : 'transparent'}`,
                          }}
                        >
                          <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                          <span className="flex-1 text-[13px] font-medium text-left">{item.label}</span>
                          {isGated && (
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                              style={{ background: `${GOLD}22`, color: GOLD }}
                            >
                              PRO
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* ── Bottom actions ── */}
                <div
                  className="mx-4 mt-4 mb-2 rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}
                >
                  <button
                    onClick={() => { props.handleNavClick('settings'); setShowMobileDrawer(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                    style={{ color: dark ? 'rgba(255,255,255,0.7)' : '#374151' }}
                  >
                    <Settings className="h-[18px] w-[18px] flex-shrink-0" />
                    <span className="text-[13px] font-medium">Settings</span>
                  </button>
                  <div style={{ height: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                  {!isPremium && (
                    <>
                      <button
                        onClick={() => { props.setIsPricingOpen(true); setShowMobileDrawer(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                        style={{ color: GOLD }}
                      >
                        <svg className="h-[18px] w-[18px] flex-shrink-0" viewBox="0 0 24 24" fill={GOLD}>
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        <span className="text-[13px] font-bold">Go Premium</span>
                      </button>
                      <div style={{ height: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                    </>
                  )}
                  <button
                    onClick={handleMobileSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
                    style={{ color: '#f87171' }}
                  >
                    <svg className="h-[18px] w-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    <span className="text-[13px] font-medium">Sign Out</span>
                  </button>
                </div>

                {/* Safe-area bottom padding */}
                <div style={{ height: 'calc(env(safe-area-inset-bottom) + 16px)' }} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default AppSidebar;
