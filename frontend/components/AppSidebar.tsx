// Dark fixed sidebar — design-only replacement for the horizontal AppNavbar.
// All nav props are identical so App.tsx swaps it with one import change.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile, UserProfileSlot, ProfileColor } from '../types';
import type { WorkerUser } from '../services/authService';
import { ProfileManager } from './ProfileManager';
import { isPureFreeTier, getTier } from '../services/accountTierService';
import { clearQueueForAccount } from '../services/storage/syncQueue';
import { Settings } from './icons';

const SIDEBAR_BG = '#1B2B4B';
const GOLD = '#C9A84C';

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
}

// ── Small building blocks (defined outside to avoid remount antipattern) ────

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  isGated: boolean;
  onClick: () => void;
}
const NavLink: React.FC<NavLinkProps> = ({ item, isActive, isGated, onClick }) => (
  <button
    onClick={onClick}
    title={item.label}
    className={`w-full flex items-center gap-2.5 pl-4 pr-2 py-[7px] text-[11.5px] font-semibold transition-all duration-150 text-left ${
      isActive ? 'text-[#C9A84C] bg-[#C9A84C]/10' : 'text-white/60 hover:text-white hover:bg-white/5'
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
        style={{ background: 'rgba(201,168,76,0.2)', color: GOLD }}
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
  onNavClick: (id: string) => void;
  GATED_VIEWS: Set<string>;
}
const SidebarSection: React.FC<SidebarSectionProps> = ({
  label, items, currentView, onNavClick, GATED_VIEWS,
}) => (
  <div>
    <p className="pl-4 mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/30">
      {label}
    </p>
    {items.map((item) => (
      <NavLink
        key={item.id}
        item={item}
        isActive={currentView === item.id}
        isGated={isPureFreeTier() && GATED_VIEWS.has(item.id)}
        onClick={() => onNavClick(item.id)}
      />
    ))}
  </div>
);

// ── Inner sidebar content — extracted so it can be reused in mobile drawer ──
interface SidebarInnerProps extends AppSidebarProps {
  /** Called after any nav click so mobile drawer can close itself */
  onAfterNavClick?: () => void;
  profileManagerRef: React.RefObject<HTMLDivElement | null>;
  showProfileManager: boolean;
  setShowProfileManager: (v: boolean | ((p: boolean) => boolean)) => void;
}

const SidebarInner: React.FC<SidebarInnerProps> = ({
  currentView,
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
  profileManagerRef,
  showProfileManager,
  setShowProfileManager,
}) => {
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

  // primaryNav[0] = dashboard → MAIN section
  // primaryNav[1..] = generator, score, interview, tracker → CORE section
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
            className="text-[14px] font-extrabold text-white"
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
          onNavClick={clickAndClose}
          GATED_VIEWS={GATED_VIEWS}
        />
        <SidebarSection
          label="Core"
          items={coreItems}
          currentView={currentView}
          onNavClick={clickAndClose}
          GATED_VIEWS={GATED_VIEWS}
        />
        {moreNavGroups.map((group) => (
          <SidebarSection
            key={group.label}
            label={group.label}
            items={group.items}
            currentView={currentView}
            onNavClick={clickAndClose}
            GATED_VIEWS={GATED_VIEWS}
          />
        ))}
      </nav>

      {/* ── Go Premium banner ─────────────────────────────────────── */}
      {!isPremium && (
        <div
          className="mx-2 mb-2 rounded-xl p-3 flex-shrink-0"
          style={{
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.18)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill={GOLD}>
              <path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z" />
            </svg>
            <span className="text-[10.5px] font-black text-white">Go Premium</span>
          </div>
          <p className="text-[9px] text-white/45 leading-snug mb-2.5">
            Unlock all features, unlimited downloads &amp; priority support.
          </p>
          <button
            onClick={() => { setIsPricingOpen(true); onAfterNavClick?.(); }}
            className="w-full py-1.5 rounded-lg text-[10px] font-black transition-opacity hover:opacity-90 active:scale-95"
            style={{ background: GOLD, color: SIDEBAR_BG }}
          >
            Upgrade Now
          </button>
        </div>
      )}

      {/* ── User / profile area ───────────────────────────────────── */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>

        {/* Profile switcher button */}
        <div className="relative" ref={profileManagerRef}>
          <button
            onClick={() => setShowProfileManager((v) => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-3 transition-colors hover:bg-white/5"
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
                style={{ background: GOLD, color: SIDEBAR_BG }}
              >
                {userInitial}
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-bold text-white truncate leading-tight">
                {userDisplayName}
              </p>
              <p
                className="text-[9px] font-semibold leading-tight mt-0.5"
                style={{ color: isPremium ? GOLD : 'rgba(255,255,255,0.35)' }}
              >
                {isPremium ? '★ Premium' : 'Free plan'}
              </p>
            </div>
            <svg
              className="h-3 w-3 flex-shrink-0 text-white/25"
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
              className="absolute bottom-full left-0 mb-1 w-[340px] bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-zinc-200 dark:border-neutral-700 p-4 z-50 overflow-y-auto"
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
          {/* Settings */}
          <button
            onClick={() => { setIsSettingsOpen(true); onAfterNavClick?.(); }}
            title="Settings &amp; API Keys"
            className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors text-white/35 hover:text-white/80 hover:bg-white/5"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          {/* Dark mode */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            title="Toggle dark mode"
            className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors text-white/35 hover:text-white/80 hover:bg-white/5"
          >
            {darkMode ? (
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
              className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors text-white/35 hover:text-red-400 hover:bg-red-500/10"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={() => { setIsSettingsOpen(true); onAfterNavClick?.(); }}
              title="Cloud Sync &amp; Settings"
              className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-colors text-white/35 hover:text-white/80 hover:bg-white/5"
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

// ── Main sidebar component ──────────────────────────────────────────────────
const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [showProfileManager, setShowProfileManager] = useState(false);
  const profileManagerRef = useRef<HTMLDivElement>(null);

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

  // Shared inner props
  const innerProps: SidebarInnerProps = {
    ...props,
    profileManagerRef,
    showProfileManager,
    setShowProfileManager,
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 w-[148px] sticky top-0 h-screen z-20"
        style={{ background: SIDEBAR_BG }}
      >
        <SidebarInner {...innerProps} />
      </aside>

      {/* ── Mobile: sticky top bar ───────────────────────────────────────── */}
      <header
        className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 shadow-md"
        style={{ background: SIDEBAR_BG, borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Logo */}
        <button
          onClick={() =>
            props.isAuthenticated
              ? props.setCurrentView('dashboard')
              : props.setShowLanding(true)
          }
          className="flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <img src="/logo.svg" alt="ProCV" className="h-7 w-7 rounded-lg" draggable={false} />
          <span
            className="text-[13px] font-extrabold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            ProCV
          </span>
        </button>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => props.setDarkMode((d) => !d)}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Toggle dark mode"
          >
            {props.darkMode ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button
            onClick={() => setShowMobileDrawer(true)}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Open navigation"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Mobile slide-over drawer ─────────────────────────────────────── */}
      {showMobileDrawer && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileDrawer(false)}
          />
          {/* Drawer panel */}
          <div
            className="relative w-[220px] h-full flex-shrink-0 shadow-2xl overflow-hidden"
            style={{ background: SIDEBAR_BG }}
          >
            {/* Close button */}
            <button
              onClick={() => setShowMobileDrawer(false)}
              className="absolute top-4 right-3 z-10 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close navigation"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <SidebarInner
              {...innerProps}
              onAfterNavClick={() => setShowMobileDrawer(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AppSidebar;
