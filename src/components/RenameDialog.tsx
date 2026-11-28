import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

interface RenameDialogProps {
  /** Heading, e.g. `Rename file` or `Rename pinned folder`. */
  title: string;
  /** Explains what is renamed (on disk, or only the name shown in Foldary). */
  note: string;
  initialName: string;
  /** Characters selected when the dialog opens. */
  selection: [number, number];
  maxLength: number;
  /** Returns an error message for a name, or null when it can be used. */
  validate: (name: string) => string | null;
  /** Resolves to an error message to show, or null once renamed. */
  onSubmit: (name: string) => Promise<string | null> | string | null;
  onClose: () => void;
}

/** Small modal with one name field, used to rename items on disk and pinned folders. */
export const RenameDialog: React.FC<RenameDialogProps> = ({
  title,
  note,
  initialName,
  selection,
  maxLength,
  validate,
  onSubmit,
  onClose,
}) => {
  const [name, setName] = useState(initialName);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(selection[0], selection[1]);
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    // Only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc works even when focus fell to the page (the Rename button is disabled while busy)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const unchanged = name === initialName;
  const validationError = useMemo(() => (unchanged ? null : validate(name)), [name, unchanged, validate]);
  const error = validationError ?? submitError;
  const canSubmit = !unchanged && !validationError && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await onSubmit(name);
      if (result) {
        setSubmitError(result);
        setBusy(false);
        // Back to the field so the name can be fixed (focus left the disabled button)
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'The item could not be renamed');
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 dark:bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        aria-describedby="rename-note"
        className="w-full max-w-sm rounded-lg border border-[#E5E5E5] dark:border-[#383838] bg-white dark:bg-[#272727] shadow-xl p-5"
      >
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-[#0067C0] dark:text-[#60CDFF]" aria-hidden="true" />
          <h2 id="rename-title" className="font-display text-base font-semibold text-[#1A1A1A] dark:text-[#F3F3F3]">
            {title}
          </h2>
        </div>
        <p id="rename-note" className="mt-1.5 text-xs text-[#5C5C5C] dark:text-[#A6A6A6]">
          {note}
        </p>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="rename-input" className="sr-only">
            New name
          </label>
          <input
            id="rename-input"
            ref={inputRef}
            type="text"
            value={name}
            maxLength={maxLength + 1}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'rename-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setSubmitError(null);
            }}
            className={`w-full h-9 px-3 rounded-md text-sm bg-white dark:bg-[#1F1F1F] text-[#1A1A1A] dark:text-[#F3F3F3] border focus:outline-none focus:ring-2 focus:ring-[#0067C0] dark:focus:ring-[#60CDFF] ${
              error ? 'border-[#C42B1C] dark:border-[#FF99A4]' : 'border-[#DCDCDC] dark:border-[#444444]'
            }`}
          />
          <p
            id="rename-error"
            role="alert"
            className="min-h-[1.25rem] mt-1.5 text-xs text-[#C42B1C] dark:text-[#FF99A4]"
          >
            {error ?? ''}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-8 px-3 rounded-md text-sm bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#60CDFF] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-8 px-3 rounded-md text-sm font-medium bg-[#0067C0] hover:bg-[#005A9E] text-white dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] dark:text-[#1A1A1A] disabled:bg-[#E5E5E5] disabled:text-[#5C5C5C] dark:disabled:bg-[#383838] dark:disabled:text-[#A6A6A6] disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#60CDFF] focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#272727] transition-colors"
            >
              {busy ? 'Renaming…' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
