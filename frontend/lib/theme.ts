'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'black';

const STORAGE_KEY = 'job-tracker-theme';
const listeners = new Set<() => void>();

export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'black' ? 'black' : 'light';
}

export function applyTheme(theme: Theme) {
  if (theme === 'black') document.documentElement.dataset.theme = 'black';
  else delete document.documentElement.dataset.theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const sync = () => setTheme(readTheme());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return theme;
}
