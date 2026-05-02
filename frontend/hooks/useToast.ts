import { useState, useCallback } from 'react';
import { ToastType } from '../components/ui/Toast';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    onUndo?: () => void;
}

export const useToast = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: ToastType, message: string, description?: string, onUndo?: () => void) => {
        const id = Date.now().toString() + Math.random().toString(36);
        setToasts((prev) => [...prev, { id, type, message, description, onUndo }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const success = useCallback((message: string, description?: string) => {
        addToast('success', message, description);
    }, [addToast]);

    const error = useCallback((message: string, description?: string) => {
        addToast('error', message, description);
    }, [addToast]);

    const warning = useCallback((message: string, description?: string) => {
        addToast('warning', message, description);
    }, [addToast]);

    const info = useCallback((message: string, description?: string, onUndo?: () => void) => {
        addToast('info', message, description, onUndo);
    }, [addToast]);

    return {
        toasts,
        removeToast,
        success,
        error,
        warning,
        info,
    };
};
