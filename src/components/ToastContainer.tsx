import { CheckCircle2, Info, AlertCircle } from 'lucide-react';
import { ToastMessage } from '../types/foldary';

interface ToastContainerProps {
  toasts: ToastMessage[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto px-3.5 py-2 rounded-lg bg-[#1F1F1F] dark:bg-[#F3F3F3] text-white dark:text-[#1A1A1A] shadow-lg border border-white/10 dark:border-black/10 flex items-center gap-2 text-xs font-medium"
        >
          {toast.tone === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400 dark:text-red-600 shrink-0" />
          ) : toast.tone === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600 shrink-0" />
          ) : (
            <Info className="w-3.5 h-3.5 text-sky-400 dark:text-[#0067C0] shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
