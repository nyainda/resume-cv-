import React from 'react';
import AdminCVEnginePage from '../AdminCVEnginePage';
import { useAdminTheme } from './AdminContext';

export default function CVEngineTab() {
  const { theme } = useAdminTheme();
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: theme.text, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>CV Engine</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.sub }}>Read-only view of verbs, banned phrases, voice profiles, and generation rules</p>
      </div>
      <AdminCVEnginePage />
    </div>
  );
}
