'use client';

import { useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from '@/components/Icons';
import type { ChecklistItem, JobStatus } from '@/lib/types';

interface ChecklistPanelProps {
  items: ChecklistItem[];
  currentStage: JobStatus;
  onToggle: (itemId: string, done: boolean) => void;
  onAdd: (label: string) => Promise<void>;
  onDelete: (itemId: string) => void;
}

export function ChecklistPanel({
  items,
  currentStage,
  onToggle,
  onAdd,
  onDelete,
}: ChecklistPanelProps) {
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of items) {
      if (!map.has(item.stage)) map.set(item.stage, []);
      map.get(item.stage)!.push(item);
    }
    // Current stage first so the guidance bar and this list agree.
    return [...map.entries()].sort(([a], [b]) =>
      a === currentStage ? -1 : b === currentStage ? 1 : a.localeCompare(b),
    );
  }, [items, currentStage]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    setAdding(true);
    try {
      await onAdd(label.trim());
      setLabel('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5">
      {grouped.map(([stage, stageItems]) => (
        <div key={stage}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {stage}
            {stage === currentStage ? ' · current stage' : ''}
          </h4>
          <ul className="space-y-1">
            {stageItems.map((item) => (
              <li
                key={item._id}
                className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-slate-50"
              >
                <input
                  id={`check-${item._id}`}
                  type="checkbox"
                  className="mt-1"
                  checked={item.done}
                  onChange={(event) => onToggle(item._id, event.target.checked)}
                />
                <label
                  htmlFor={`check-${item._id}`}
                  className={
                    item.done ? 'flex-1 text-sm text-slate-400 line-through' : 'flex-1 text-sm text-slate-700'
                  }
                >
                  {item.label}
                </label>
                <button
                  type="button"
                  className="invisible text-slate-400 hover:text-red-600 group-hover:visible"
                  onClick={() => onDelete(item._id)}
                  aria-label={`Delete ${item.label}`}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="input"
          placeholder="Add a step"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={adding || !label.trim()}>
          <PlusIcon />
        </button>
      </form>
    </div>
  );
}
