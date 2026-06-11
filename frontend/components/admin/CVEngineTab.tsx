import React from 'react';
import AdminCVEnginePage from '../AdminCVEnginePage';

const NAVY = '#1B2B4B';

export default function CVEngineTab() {
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>CV Engine</h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>Manage verbs, banned phrases, voice profiles, and generation rules</p>
            </div>
            <AdminCVEnginePage />
        </div>
    );
}
