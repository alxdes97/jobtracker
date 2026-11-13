'use client';

import { applyTheme, useTheme } from '@/lib/theme';
import { classNames } from '@/lib/format';

export function ThemeToggle() {
  const theme = useTheme();

  return (
    <div className="flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Color mode">
      {(['light', 'black'] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={classNames(
            'px-2.5 py-1 text-xs font-medium capitalize',
            theme === option ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
          )}
          aria-pressed={theme === option}
          onClick={() => applyTheme(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
