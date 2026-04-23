// components/OfflineBanner.tsx
// Shows a slim banner when the browser loses network connectivity.
// Disappears automatically when connectivity is restored.

import React, { useEffect, useState } from 'react';

export const OfflineBanner: React.FC = () => {
    const [offline, setOffline] = useState(!navigator.onLine);
    const [justCameBack, setJustCameBack] = useState(false);

    useEffect(() => {
        const goOffline = () => {
            setOffline(true);
            setJustCameBack(false);
        };

        const goOnline = () => {
            setOffline(false);
            setJustCameBack(true);
            // Hide the "back online" notice after 4 seconds
            setTimeout(() => setJustCameBack(false), 4000);
        };

        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);

    if (!offline && !justCameBack) return null;

    return (
        <div
            className={`w-full z-50 px-4 py-2 text-xs font-semibold text-center flex items-center justify-center gap-2 transition-colors ${
                offline
                    ? 'bg-amber-500 text-amber-950'
                    : 'bg-emerald-500 text-emerald-950'
            }`}
        >
            {offline ? (
                <>
                    <span className="text-sm">📡</span>
                    You're offline — your changes are saved locally and will sync to Drive when reconnected.
                </>
            ) : (
                <>
                    <span className="text-sm">✅</span>
                    Back online — resuming Drive sync.
                </>
            )}
        </div>
    );
};

export default OfflineBanner;
