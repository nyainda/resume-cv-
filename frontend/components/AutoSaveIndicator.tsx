// components/AutoSaveIndicator.tsx
// A tiny header badge that reflects the current Drive save status.
// Shows nothing when Drive is not active.

import React from 'react';
import { SaveStatus } from '../hooks/useAutoSave';
import { isDriveActive } from '../services/storage/StorageRouter';

interface Props {
    status: SaveStatus;
}

export const AutoSaveIndicator: React.FC<Props> = ({ status }) => {
    if (!isDriveActive()) return null;
    if (status === 'idle') return null;

    const config = {
        saving: {
            dot: 'bg-blue-400 animate-pulse',
            text: 'text-blue-600 dark:text-blue-400',
            label: 'Saving…',
        },
        saved: {
            dot: 'bg-emerald-500',
            text: 'text-emerald-600 dark:text-emerald-400',
            label: 'Saved ✓',
        },
        error: {
            dot: 'bg-red-500',
            text: 'text-red-600 dark:text-red-400',
            label: 'Sync failed',
        },
        idle: { dot: '', text: '', label: '' },
    }[status];

    return (
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold ${config.text} bg-zinc-100 dark:bg-neutral-800 transition-all`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
            {config.label}
        </div>
    );
};

export default AutoSaveIndicator;
