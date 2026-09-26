'use client';

import { useState } from 'react';
import { StarIcon } from './Icons';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
}

export function StarRating({ value, onChange, size = 'sm' }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  const dimension = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          className={
            onChange ? 'cursor-pointer text-amber-400' : 'cursor-default text-amber-400'
          }
          onMouseEnter={() => onChange && setHover(star)}
          onClick={() => onChange?.(star === value ? 0 : star)}
        >
          <StarIcon
            className={`${dimension} ${star <= active ? 'text-amber-400' : 'text-slate-300'}`}
            filled={star <= active}
          />
        </button>
      ))}
    </div>
  );
}
