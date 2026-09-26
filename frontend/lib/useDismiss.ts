import { useEffect, useRef, type RefObject } from 'react';

/**
 * Closes a popover when the user clicks outside it or presses Escape.
 * The callback is held in a ref so callers do not have to memoise it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  open: boolean,
  onDismiss: () => void,
) {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) latest.current();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') latest.current();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, open]);
}
