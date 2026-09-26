'use client';

import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@/components/Icons';
import type { TodoItem } from '@/lib/types';

interface TodoPanelProps {
  items: TodoItem[];
  onToggle: (itemId: string, done: boolean) => void;
  onAdd: (text: string) => Promise<void>;
  onDelete: (itemId: string) => void;
}

export function TodoPanel({ items, onToggle, onAdd, onDelete }: TodoPanelProps) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    try {
      await onAdd(text.trim());
      setText('');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No to-dos yet. Add one below.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item._id}
              className="group flex items-start gap-2 rounded px-1 py-1 hover:bg-slate-50"
            >
              <input
                id={`todo-${item._id}`}
                type="checkbox"
                className="mt-1"
                checked={item.done}
                onChange={(event) => onToggle(item._id, event.target.checked)}
              />
              <label
                htmlFor={`todo-${item._id}`}
                className={
                  item.done
                    ? 'flex-1 text-sm text-slate-400 line-through'
                    : 'flex-1 text-sm text-slate-700'
                }
              >
                {item.text}
              </label>
              <button
                type="button"
                className="invisible text-slate-400 hover:text-red-600 group-hover:visible"
                onClick={() => onDelete(item._id)}
                aria-label={`Delete ${item.text}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="input"
          placeholder="Add a to-do"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="To-do text"
        />
        <button type="submit" className="btn-secondary" disabled={adding || !text.trim()} aria-label="Add to-do">
          <PlusIcon />
        </button>
      </form>
    </div>
  );
}
