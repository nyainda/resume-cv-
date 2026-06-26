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
} from '../components/nav/NavIcons';
import { FileText, Target, List, BookOpen } from '../components/icons';
import { isPureFreeTier } from '../services/accountTierService';
import { hasCompletedOnboarding } from '../components/OnboardingWizard';

// ── View type ────────────────────────────────────────────────────────────────
export type AppView =
  | 'dashboard'
  | 'generator'
  | 'linkedin'
  | 'interview'
  | 'essays'
  | 'history'
  | 'tracker'
  | 'toolkit'
  | 'email'
  | 'negotiation'
  | 'analytics'
  | 'score'
  | 'pivot'
  | 'account'
  | 'admin-leaks'
  | 'admin-cv-engine'
  | 'storage-map';

const VIEW_KEY = 'procv:lastView';
const RESTORABLE_VIEWS = [
  'dashboard', 'generator', 'linkedin', 'interview', 'essays',
  'history', 'tracker', 'toolkit', 'email', 'negotiation',
  'analytics', 'score', 'pivot',
] as const;
type RestorableView = typeof RESTORABLE_VIEWS[number];

const GATED_VIEWS = new Set([
  'interview', 'email', 'negotiation', 'pivot', 'essays', 'analytics',
]);

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

  // When auth validation completes and no valid session exists, return to landing
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setShowLanding(true);
    }
  }, [isAuthLoading, isAuthenticated, setShowLanding]);

  const handleNavClick = useCallback((id: string) => {
    if (isPureFreeTier() && GATED_VIEWS.has(id)) {
      setIsPricingOpen(true);
      return;
    }
    setCurrentView(id as AppView);
    setShowMoreMenu(false);
    setShowMobileMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryNav = [
    { id: 'dashboard', label: 'Home',          icon: FileText },
    { id: 'generator', label: 'CV Generator',  icon: FileText },
    { id: 'score',     label: 'Score My CV',   icon: ScoreNavIcon },
    { id: 'interview', label: 'Interview Prep', icon: InterviewNavIcon },
    { id: 'tracker',   label: 'Job Tracker',   icon: Target },
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
        { id: 'pivot', label: 'Career Pivot', icon: PivotNavIcon },
      ],
    },
    {
      label: 'Track',
      items: [
        { id: 'history',   label: 'CV History', icon: List },
        { id: 'analytics', label: 'Analytics',  icon: AnalyticsNavIcon },
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
