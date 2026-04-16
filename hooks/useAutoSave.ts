// hooks/useAutoSave.ts
// Listens to drive-save-success / drive-save-error events and exposes
// a status string so the header can show "Saving…" / "Saved ✓" / "Sync failed".

import { useState, useEffect } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useAutoSave() {
    const [status, setStatus] = useState<SaveStatus>('idle');

    useEffect(() => {
        let resetTimer: ReturnType<typeof setTimeout>;

        const onSuccess = () => {
            clearTimeout(resetTimer);
            setStatus('saved');
            resetTimer = setTimeout(() => setStatus('idle'), 3000);
        };

        const onError = () => {
            clearTimeout(resetTimer);
            setStatus('error');
            resetTimer = setTimeout(() => setStatus('idle'), 6000);
        };

        // "saving" is triggered just before a save starts
        const onStart = () => {
            clearTimeout(resetTimer);
            setStatus('saving');
        };

        window.addEventListener('drive-save-start', onStart);
        window.addEventListener('drive-save-success', onSuccess);
        window.addEventListener('drive-save-error', onError);

        return () => {
            clearTimeout(resetTimer);
            window.removeEventListener('drive-save-start', onStart);
            window.removeEventListener('drive-save-success', onSuccess);
            window.removeEventListener('drive-save-error', onError);
        };
    }, []);

    return status;
}
