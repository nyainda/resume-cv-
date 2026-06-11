import React from 'react';
import AdminLeaksPage from '../AdminLeaksPage';
import { useAdminTheme } from './AdminContext';

export default function LeakQueueTab() {
  const { theme } = useAdminTheme();
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: theme.text, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>Leak Queue</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.sub }}>Review AI-detected phrases for promotion to the global banned list</p>
      </div>
      <AdminLeaksPage />
    </div>
  );
}
