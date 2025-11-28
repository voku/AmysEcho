/**
 * Message Context for Web
 * Provides toast notifications and debug logging.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastDescriptor {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  createdAt: number;
}

export interface ToastRequest {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

export interface DebugLogEntry {
  id: string;
  message: string;
  tone: ToastTone;
  timestamp: number;
}

interface MessageContextValue {
  toasts: ToastDescriptor[];
  showToast: (request: ToastRequest) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  logEntries: DebugLogEntry[];
  isDebugVisible: boolean;
  toggleDebug: () => void;
}

const DEFAULT_DURATION_MS = 5000;
const MAX_TOASTS = 3;
const MAX_LOG_ENTRIES = 50;

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

const toneStyles: Record<ToastTone, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'rgba(59, 130, 246, 0.95)',
    border: 'rgba(37, 99, 235, 0.95)',
    icon: 'ℹ️',
  },
  success: {
    bg: 'rgba(74, 222, 128, 0.95)',
    border: 'rgba(34, 197, 94, 0.95)',
    icon: '✅',
  },
  warning: {
    bg: 'rgba(251, 191, 36, 0.95)',
    border: 'rgba(217, 119, 6, 0.95)',
    icon: '⚠️',
  },
  error: {
    bg: 'rgba(248, 113, 113, 0.95)',
    border: 'rgba(239, 68, 68, 0.95)',
    icon: '⛔',
  },
};

export function MessageProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastDescriptor[]>([]);
  const [logEntries, setLogEntries] = useState<DebugLogEntry[]>([]);
  const [isDebugVisible, setDebugVisible] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    ({ message, tone = 'info', durationMs = DEFAULT_DURATION_MS }: ToastRequest) => {
      if (!message.trim()) {
        return '';
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const descriptor: ToastDescriptor = {
        id,
        message,
        tone,
        durationMs: Math.max(durationMs, 0),
        createdAt: Date.now(),
      };

      setToasts((current) => {
        const next = [...current, descriptor];
        if (next.length <= MAX_TOASTS) {
          return next;
        }
        return next.slice(next.length - MAX_TOASTS);
      });

      setLogEntries((entries) => {
        const next: DebugLogEntry[] = [
          {
            id,
            message,
            tone,
            timestamp: Date.now(),
          },
          ...entries,
        ];
        if (next.length > MAX_LOG_ENTRIES) {
          return next.slice(0, MAX_LOG_ENTRIES);
        }
        return next;
      });

      return id;
    },
    [],
  );

  useEffect(() => {
    const timers = timersRef.current;

    toasts.forEach((toast) => {
      if (toast.durationMs > 0 && !timers.has(toast.id)) {
        const timeout = setTimeout(() => {
          setToasts((current) => current.filter((item) => item.id !== toast.id));
          timers.delete(toast.id);
        }, toast.durationMs);
        timers.set(toast.id, timeout);
      }
    });

    timers.forEach((timeout, toastId) => {
      const stillPresent = toasts.some((toast) => toast.id === toastId);
      if (!stillPresent) {
        clearTimeout(timeout);
        timers.delete(toastId);
      }
    });
  }, [toasts]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timeout) => clearTimeout(timeout));
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0 && isDebugVisible) {
      setDebugVisible(false);
    }
  }, [isDebugVisible, toasts.length]);

  const toggleDebug = useCallback(() => {
    setDebugVisible((prev) => !prev);
  }, []);

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      clearToasts,
      logEntries,
      isDebugVisible,
      toggleDebug,
    }),
    [clearToasts, dismissToast, isDebugVisible, logEntries, showToast, toasts, toggleDebug],
  );

  return (
    <MessageContext.Provider value={contextValue}>
      {children}
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '90vw',
          width: '400px',
        }}>
          {toasts.map((toast) => {
            const style = toneStyles[toast.tone];
            return (
              <div
                key={toast.id}
                role="alert"
                aria-live="polite"
                style={{
                  backgroundColor: style.bg,
                  borderColor: style.border,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              >
                <span>{style.icon}</span>
                <span style={{ flex: 1, color: '#fff' }}>{toast.message}</span>
                <button
                  onClick={() => dismissToast(toast.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '1.25rem',
                    padding: '0.25rem',
                  }}
                  aria-label="Schließen"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return ctx;
}
