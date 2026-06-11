import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface AdminTheme {
  bg: string;
  card: string;
  cardHover: string;
  border: string;
  text: string;
  sub: string;
  muted: string;
  navy: string;
  gold: string;
  input: string;
  inputBorder: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarBorder: string;
  tableBorder: string;
  tableHover: string;
  badge: { ok: { bg: string; text: string }; err: { bg: string; text: string }; warn: { bg: string; text: string }; info: { bg: string; text: string } };
  isDark: boolean;
}

export const LIGHT: AdminTheme = {
  bg: '#F8F7F4',
  card: '#FFFFFF',
  cardHover: '#F5F3EF',
  border: '#E8E5DE',
  text: '#1B2B4B',
  sub: '#555',
  muted: '#999',
  navy: '#1B2B4B',
  gold: '#C9A84C',
  input: '#FAFAFA',
  inputBorder: '#E0DDD8',
  sidebarBg: '#1B2B4B',
  sidebarText: 'rgba(255,255,255,0.75)',
  sidebarBorder: 'rgba(255,255,255,0.08)',
  tableBorder: '#F0EDE6',
  tableHover: '#FAFAF8',
  badge: {
    ok:   { bg: '#EAF7EF', text: '#1B6B3A' },
    err:  { bg: '#FFF1F1', text: '#C62828' },
    warn: { bg: '#FFF8E1', text: '#B45309' },
    info: { bg: '#EEF4FE', text: '#1A73E8' },
  },
  isDark: false,
};

export const DARK: AdminTheme = {
  bg: '#0C1420',
  card: '#152030',
  cardHover: '#1C2A3C',
  border: '#243040',
  text: '#D4E2F0',
  sub: '#8AA4BE',
  muted: '#4A6070',
  navy: '#C9A84C',
  gold: '#C9A84C',
  input: '#192635',
  inputBorder: '#2A3A50',
  sidebarBg: '#080F18',
  sidebarText: 'rgba(212,226,240,0.75)',
  sidebarBorder: 'rgba(255,255,255,0.06)',
  tableBorder: '#1C2D3E',
  tableHover: '#1A2B3C',
  badge: {
    ok:   { bg: '#0D2E1E', text: '#4ADE80' },
    err:  { bg: '#2A0E0E', text: '#F87171' },
    warn: { bg: '#281D08', text: '#FBBF24' },
    info: { bg: '#0E1E35', text: '#60A5FA' },
  },
  isDark: true,
};

interface AdminContextValue {
  theme: AdminTheme;
  isDark: boolean;
  toggleDark: () => void;
}

const AdminCtx = createContext<AdminContextValue | null>(null);

export function AdminContextProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('procv_admin_dark') === '1'; } catch { return false; }
  });
  const toggleDark = () => setIsDark(d => {
    const next = !d;
    try { localStorage.setItem('procv_admin_dark', next ? '1' : '0'); } catch {}
    return next;
  });
  return (
    <AdminCtx.Provider value={{ theme: isDark ? DARK : LIGHT, isDark, toggleDark }}>
      {children}
    </AdminCtx.Provider>
  );
}

export function useAdminTheme(): AdminContextValue {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdminTheme must be inside AdminContextProvider');
  return ctx;
}
