// hooks/useAppNavigation.ts
// Manages the current view, URL hash routing, nav item definitions,
// feature gating, and view-persistence across page refreshes and auth cycles.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MailIcon,
  PivotNavIcon,
  ScoreNavIcon,
  InterviewNavIcon,
  NegotiationNavIcon,
  AnalyticsNavIcon,
  LinkedInNavIcon,
  ShareNavIcon,
  RoomsNavIcon,
  HomeNavIcon,
  CVGenNavIcon,
  BuildNavIcon,
} from '../components/nav/NavIcons';
import { Target, List, BookOpen, FileText } from '../components/icons';
import { isPureFreeTier, getEffectiveTier } from '../services/accountTierService';
import { hasCompletedOnboarding } from '../components/OnboardingWizard';

// ── View type ────────────────────────────────────────────────────────────────
export type AppView =
  | 'dashboard'
  | 'rooms'
  | 'vault'
  | 'generator'
  | 'build'
  | 'linkedin'
  | 'interview'
  | 'essays'
  | 'history'
  | 'cover-letters'
  | 'tracker'
  | 'toolkit'
  | 'email'
  | 'negotiation'
  | 'analytics'
  | 'score'
  | 'pivot'
  | 'account'
  | 'settings'
  | 'share-profile'
  | 'admin-leaks'
  | 'admin-cv-engine'
  | 'storage-map';

const VIEW_KEY = 'procv:lastView';
const RESTORABLE_VIEWS = [
  'dashboard', 'rooms', 'vault', 'generator', 'build', 'linkedin', 'interview', 'essays',
  'history', 'cover-letters', 'tracker', 'toolkit', 'email', 'negotiation',
  'analytics', 'score', 'pivot',
] as const;
type RestorableView = typeof RESTORABLE_VIEWS[number];

/**
 * Views that require BYOK or Premium (blocked for pure-free users).
 * Free users clicking these see the pricing modal.
 */
const FREE_GATED_VIEWS = new Set([
  'interview', 'email', 'essays', 'analytics',
]);

/**
 * Views that require Premium only (blocked for both free AND byok users).
 * BYOK users clicking these also see the pricing/upgrade modal.
 */
const PREMIUM_ONLY_VIEWS = new Set([
  'negotiation', 'pivot', 'linkedin',
]);

/** Union used by AppNavbar to mark nav items as gated (for UI badge rendering). */
const GATED_VIEWS = new Set([...FREE_GATED_VIEWS, ...PREMIUM_ONLY_VIEWS]);

interface UseAppNavigationConfig {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isNewUser: boolean;
  setShowLanding: (v: boolean) => void;
  setShowOnboarding: (v: boolean) => void;
  setIsPricingOpen: (v: boolean) => void;
  setShowMoreMenu: (v: boolean) => void;
  setShowMobileMenu: (v: boolean) => void;
}

export function useAppNavigation({
  isAuthenticated,
  isAuthLoading,
  isNewUser,
  setShowLanding,
  setShowOnboarding,
  setIsPricingOpen,
  setShowMoreMenu,
  setShowMobileMenu,
}: UseAppNavigationConfig) {
  const prevAuthenticatedRef = useRef(false);

  const [currentView, setCurrentView] = useState<AppView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && (RESTORABLE_VIEWS as readonly string[]).includes(saved)) {
        return saved as RestorableView;
      }
    } catch { /* non-fatal */ }
    return 'dashboard';
  });

  // Admin routes — accessible at #admin/* hashes, hidden from main nav
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#admin/leaks')
        setCurrentView('admin-leaks');
      else if (window.location.hash === '#admin/cv-engine')
        setCurrentView('admin-cv-engine');
      else if (window.location.hash === '#admin/storage-map')
        setCurrentView('storage-map');
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Persist currentView to localStorage so it survives page refreshes and
  // sign-out → sign-in cycles
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, currentView);
      sessionStorage.setItem(VIEW_KEY, currentView);
    } catch { /* non-fatal */ }
  }, [currentView]);

  // Hide landing when authenticated; show onboarding for brand-new accounts;
  // restore the view the user was on before they signed out
  useEffect(() => {
    const wasAuthenticated = prevAuthenticatedRef.current;
    prevAuthenticatedRef.current = isAuthenticated;

    if (isAuthenticated) {
      setShowLanding(false);
      if (isNewUser && !hasCompletedOnboarding()) {
        setShowOnboarding(true);
      }
      if (!wasAuthenticated) {
        try {
          const saved = sessionStorage.getItem(VIEW_KEY) || localStorage.getItem(VIEW_KEY);
          if (saved && (RESTORABLE_VIEWS as readonly string[]).includes(saved)) {
            setCurrentView(saved as RestorableView);
          }
        } catch { /* non-fatal */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isNewUser]);

  // When auth validation completes and no valid session exists, return to landing.
  // Exception: anonymous visitors opening a shared-CV / public-profile hash link
  // (#s=, #share=, #p=) must never be bounced to the marketing landing page —
  // they're not signing in, they're viewing someone else's shared document.
  useEffect(() => {
    const hash = window.location.hash;
    const isShareLink = hash.startsWith('#s=') || hash.startsWith('#share=') || hash.startsWith('#p=');
    if (!isAuthLoading && !isAuthenticated && !isShareLink) {
      setShowLanding(true);
    }
  }, [isAuthLoading, isAuthenticated, setShowLanding]);

  const handleNavClick = useCallback((id: string) => {
    const tier = getEffectiveTier();
    // Premium-only views: blocked for both free and BYOK.
    if (PREMIUM_ONLY_VIEWS.has(id) && tier !== 'premium') {
      setIsPricingOpen(true);
      return;
    }
    // BYOK+Premium views: blocked for pure-free only.
    if (FREE_GATED_VIEWS.has(id) && isPureFreeTier()) {
      setIsPricingOpen(true);
      return;
    }
    setCurrentView(id as AppView);
    setShowMoreMenu(false);
    setShowMobileMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryNav = [
    { id: 'dashboard', label: 'Home',           icon: HomeNavIcon },
    { id: 'rooms',     label: 'Career Rooms',   icon: RoomsNavIcon },
    { id: 'generator', label: 'CV Generator',   icon: CVGenNavIcon },
    { id: 'build',     label: 'Build Report',   icon: BuildNavIcon },
    { id: 'score',     label: 'Score My CV',    icon: ScoreNavIcon },
    { id: 'interview', label: 'Interview Prep', icon: InterviewNavIcon },
    { id: 'tracker',   label: 'Job Tracker',    icon: Target },
  ];

  const moreNavGroups = [
    {
      label: 'Apply',
      items: [
        { id: 'email',       label: 'Email Apply',       icon: MailIcon },
        { id: 'negotiation', label: 'Salary Negotiation', icon: NegotiationNavIcon },
        { id: 'essays',      label: 'Scholarship',        icon: BookOpen },
      ],
    },
    {
      label: 'Tools',
      items: [
        { id: 'linkedin', label: 'LinkedIn Profile', icon: LinkedInNavIcon },
        { id: 'pivot',    label: 'Career Pivot',     icon: PivotNavIcon },
      ],
    },
    {
      label: 'Track',
      items: [
        { id: 'history',        label: 'CV History',      icon: List },
        { id: 'cover-letters',  label: 'Cover Letters',   icon: FileText },
        { id: 'analytics',      label: 'Analytics',       icon: AnalyticsNavIcon },
      ],
    },
    {
      label: 'Share',
      items: [
        { id: 'share-profile', label: 'Share & Profile', icon: ShareNavIcon },
      ],
    },
  ];

  const allMoreItems = moreNavGroups.flatMap((g) => g.items);
  const isMoreActive = allMoreItems.some((item) => item.id === currentView);

  return {
    currentView,
    setCurrentView,
    primaryNav,
    moreNavGroups,
    allMoreItems,
    isMoreActive,
    handleNavClick,
    GATED_VIEWS,
  };
}
