import React from 'react';
import AdminLeaksPage from '../AdminLeaksPage';

const NAVY = '#1B2B4B';

export default function LeakQueueTab() {
    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: 'Playfair Display, Georgia, serif', letterSpacing: '-0.5px' }}>Leak Queue</h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>Review AI-detected phrases for promotion to the global banned list</p>
            </div>
            <AdminLeaksPage />
        </div>
    );
}
