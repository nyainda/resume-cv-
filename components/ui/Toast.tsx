import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle, X } from '../icons';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
    type: ToastType;
    message: string;
    description?: string;
    onClose: () => void;
    onUndo?: () => void;
    autoClose?: boolean;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
    type,
    message,
    description,
    onClose,
    onUndo,
    autoClose = true,
    duration = 5000
}) => {
    React.useEffect(() => {
        if (autoClose) {
            const timer = setTimeout(onClose, duration);
            return () => clearTimeout(timer);
        }
    }, [autoClose, duration, onClose]);

    const config = {
        success: {
            icon: CheckCircle,
            bgColor: 'bg-green-50 dark:bg-green-900/20',
            borderColor: 'border-green-200 dark:border-green-800',
            iconColor: 'text-green-600 dark:text-green-400',
            textColor: 'text-green-900 dark:text-green-100',
            descColor: 'text-green-700 dark:text-green-300',
            undoColor: 'text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 border-green-300 dark:border-green-700',
        },
        error: {
            icon: XCircle,
            bgColor: 'bg-red-50 dark:bg-red-900/20',
            borderColor: 'border-red-200 dark:border-red-800',
            iconColor: 'text-red-600 dark:text-red-400',
            textColor: 'text-red-900 dark:text-red-100',
            descColor: 'text-red-700 dark:text-red-300',
            undoColor: 'text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 border-red-300 dark:border-red-700',
        },
        warning: {
            icon: AlertCircle,
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
            borderColor: 'border-amber-200 dark:border-amber-800',
            iconColor: 'text-amber-600 dark:text-amber-400',
            textColor: 'text-amber-900 dark:text-amber-100',
            descColor: 'text-amber-700 dark:text-amber-300',
            undoColor: 'text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 border-amber-300 dark:border-amber-700',
        },
        info: {
            icon: Info,
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
            borderColor: 'border-blue-200 dark:border-blue-800',
            iconColor: 'text-blue-600 dark:text-blue-400',
            textColor: 'text-blue-900 dark:text-blue-100',
            descColor: 'text-blue-700 dark:text-blue-300',
            undoColor: 'text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 border-blue-300 dark:border-blue-700',
        },
    };

    const { icon: Icon, bgColor, borderColor, iconColor, textColor, descColor, undoColor } = config[type];

    return (
        <div className={`${bgColor} ${borderColor} border rounded-lg p-4 shadow-lg animate-slide-in-right`}>
            <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 ${iconColor} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${textColor}`}>{message}</p>
                    {description && (
                        <p className={`text-sm ${descColor} mt-1`}>{description}</p>
                    )}
                    {onUndo && (
                        <button
                            onClick={() => { onUndo(); onClose(); }}
                            className={`mt-2 text-xs font-bold px-2.5 py-1 rounded border ${undoColor} transition-colors`}
                        >
                            ↩ Undo
                        </button>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className={`${iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
                    aria-label="Close notification"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    onUndo?: () => void;
}

interface ToastContainerProps {
    toasts: ToastItem[];
    onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
    return (
        <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md w-full pointer-events-none">
            <div className="pointer-events-auto space-y-3">
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        type={toast.type}
                        message={toast.message}
                        description={toast.description}
                        onUndo={toast.onUndo}
                        onClose={() => onRemove(toast.id)}
                    />
                ))}
            </div>
        </div>
    );
};
