import { useCallback, useState } from 'react';
import { ToastMessage } from '../types/foldary';

export type Notify = (text: string, tone?: ToastMessage['tone']) => void;

const TOAST_LIFETIME_MS = 2800;
const MAX_VISIBLE_TOASTS = 3;

/** Non-blocking notifications: keeps the newest few and drops each after a short delay. */
export function useToasts(): { toasts: ToastMessage[]; notify: Notify } {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback<Notify>((text, tone = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  return { toasts, notify };
}
