import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { AppConfig } from '../types/foldary';
import { loadSavedConfig, saveConfig } from '../services/configStorage';

/** The persisted app config: loaded once, saved on every change, and drives the dark class. */
export function useAppConfig(): [AppConfig, Dispatch<SetStateAction<AppConfig>>] {
  const [config, setConfig] = useState<AppConfig>(() => loadSavedConfig());

  // Sync Tailwind dark mode class with config.theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', config.theme === 'dark');
  }, [config.theme]);

  // Persist config changes to localStorage
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  return [config, setConfig];
}
