import React, { useEffect, useRef } from 'react';
import { FolderOpen, Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  /** Desktop shell: the folder is remembered across restarts. Browser: it may need reconnecting. */
  isDesktop: boolean;
  onChooseFolder: () => void;
  onTryDemo: () => void;
}

/** First-run screen: pick the project folder Foldary opens on every launch, or explore the demo. */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  isDesktop,
  onChooseFolder,
  onTryDemo,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  // Keep Tab inside the two buttons; the app behind is not usable until a choice is made
  const handleTrapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const buttons = Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>('button'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F3F3F3] dark:bg-[#202020]"
      onKeyDown={handleTrapTab}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-description"
        className="w-full max-w-md rounded-lg border border-[#E5E5E5] dark:border-[#383838] bg-white dark:bg-[#272727] shadow-xl p-6"
      >
        <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-[#0067C0]/10 dark:bg-[#60CDFF]/10 mb-4">
          <FolderOpen className="w-6 h-6 text-[#0067C0] dark:text-[#60CDFF]" />
        </div>
        <h1 id="welcome-title" className="text-xl font-semibold text-[#1A1A1A] dark:text-[#F3F3F3]">
          Welcome to Foldary
        </h1>
        <p id="welcome-description" className="mt-2 text-sm text-[#5C5C5C] dark:text-[#A6A6A6]">
          Choose your project folder. Foldary opens it on every launch, with your files ready to sort
          and filter.
          {isDesktop
            ? ''
            : ' In the browser, you may be asked to allow access again after a reload.'}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            ref={primaryRef}
            type="button"
            onClick={onChooseFolder}
            className="h-10 px-4 rounded-md inline-flex items-center justify-center gap-2 text-sm font-medium bg-[#0067C0] hover:bg-[#005A9E] text-white dark:bg-[#60CDFF] dark:hover:bg-[#4CC2FF] dark:text-[#1A1A1A] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#60CDFF] focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#272727] transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Choose project folder</span>
          </button>
          <button
            type="button"
            onClick={onTryDemo}
            className="h-10 px-4 rounded-md inline-flex items-center justify-center gap-2 text-sm font-medium bg-white dark:bg-[#2F2F2F] text-[#1A1A1A] dark:text-[#F3F3F3] border border-[#DCDCDC] dark:border-[#444444] hover:bg-[#F3F3F3] dark:hover:bg-[#383838] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#60CDFF] transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Try the demo</span>
          </button>
        </div>
        <p className="mt-4 text-xs text-[#5C5C5C] dark:text-[#A6A6A6]">
          You can add more folders, or change the Default Folder, at any time.
        </p>
      </div>
    </div>
  );
};
