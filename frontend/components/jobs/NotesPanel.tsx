'use client';

import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@/components/Icons';
import { formatDate } from '@/lib/format';
import type { NoteItem } from '@/lib/types';

interface NotesPanelProps {
  items: NoteItem[];
  legacy: string;
  onAdd: (body: string) => Promise<void>;
  onUpdate: (noteId: string, body: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onClearLegacy: () => Promise<void>;
}

export function NotesPanel({
  items,
  legacy,
  onAdd,
  onUpdate,
  onDelete,
  onClearLegacy,
}: NotesPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const notes = [...(items ?? [])].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(body);
      setDraft('');
      setOpen(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Could not add that note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-50"
          aria-label="Add note"
          onClick={() => setOpen((current) => !current)}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {open ? (
        <form onSubmit={handleAdd} className="mb-3 space-y-2">
          <textarea
            className="input min-h-[120px] resize-none"
            placeholder="Interview prep, recruiter conversations, things to follow up on…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={saving || !draft.trim()}>
            {saving ? 'Adding…' : 'Add note'}
          </button>
        </form>
      ) : null}

      {notes.length === 0 && !legacy.trim() && !open ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No notes yet. Use + to add one.
        </p>
      ) : null}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note._id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-slate-400">{formatDate(note.createdAt)}</p>
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                aria-label="Delete note"
                onClick={() => void onDelete(note._id)}
              >
                <TrashIcon />
              </button>
            </div>
            <textarea
              className="mt-1 w-full resize-none bg-transparent text-sm text-slate-700 outline-none"
              rows={Math.min(8, Math.max(2, note.body.split('\n').length))}
              defaultValue={note.body}
              key={note.body}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== note.body) void onUpdate(note._id, next);
              }}
            />
          </li>
        ))}
        {legacy.trim() ? (
          <li className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-slate-400">Earlier note</p>
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                aria-label="Delete earlier note"
                onClick={() => void onClearLegacy()}
              >
                <TrashIcon />
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{legacy}</p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
