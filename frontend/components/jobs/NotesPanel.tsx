'use client';

import { useEffect, useRef, useState } from 'react';

interface NotesPanelProps {
  value: string;
  onSave: (notes: string) => Promise<void>;
}

/** Autosaves a short moment after typing stops, like the reference app does. */
export function NotesPanel({ value, onSave }: NotesPanelProps) {
  const [notes, setNotes] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latestSaved = useRef(value);

  useEffect(() => {
    // Ignore the prop updating with the value we just saved: the user may have
    // kept typing while the request was in flight.
    if (value === latestSaved.current) return;
    setNotes(value);
    latestSaved.current = value;
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleChange(next: string) {
    setNotes(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (next === latestSaved.current) return;
      latestSaved.current = next;
      setState('saving');
      await onSave(next);
      setState('saved');
      setTimeout(() => setState((current) => (current === 'saved' ? 'idle' : current)), 3000);
    }, 700);
  }

  return (
    <div className="flex h-full flex-col">
      <textarea
        className="input min-h-[320px] flex-1 resize-none"
        placeholder="Interview prep, recruiter conversations, things to follow up on…"
        value={notes}
        onChange={(event) => handleChange(event.target.value)}
      />
      <p className="mt-2 text-xs text-slate-400">
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : '* changes will be automatically saved'}
      </p>
    </div>
  );
}
