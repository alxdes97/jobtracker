'use client';

import { useEffect, useState } from 'react';
import { ChevronDownIcon, DotsIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { toDateInput } from '@/lib/format';
import type { HiringStep } from '@/lib/types';

interface HiringProcessPanelProps {
  steps: HiringStep[];
  onToggle: (stepId: string, done: boolean) => void;
  onUpdate: (stepId: string, data: { name?: string; date?: string | null }) => Promise<void>;
  onAdd: (name: string) => Promise<void>;
  onUseStandard: () => Promise<void>;
  onDelete: (stepId: string) => void;
  onReorder: (order: string[]) => Promise<void>;
}

export function HiringProcessPanel({
  steps,
  onToggle,
  onUpdate,
  onAdd,
  onUseStandard,
  onDelete,
  onReorder,
}: HiringProcessPanelProps) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const doneCount = steps.filter((step) => step.done).length;

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await onAdd(name.trim());
      setName('');
    } finally {
      setAdding(false);
    }
  }

  async function move(from: number, to: number) {
    if (moving || to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [step] = next.splice(from, 1);
    next.splice(to, 0, step);
    setMoving(true);
    try {
      await onReorder(next.map((item) => item._id));
    } finally {
      setMoving(false);
    }
  }

  function dropOn(targetId: string) {
    const from = steps.findIndex((step) => step._id === dragId);
    const to = steps.findIndex((step) => step._id === targetId);
    setDragId(null);
    setOverId(null);
    if (from >= 0 && to >= 0) move(from, to);
  }

  return (
    <div className="space-y-4">
      {steps.length > 0 ? (
        <p className="text-xs font-medium text-slate-500">
          {doneCount} of {steps.length} complete
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">No hiring steps yet.</p>
          <button type="button" className="btn-secondary" onClick={() => onUseStandard()} disabled={adding}>
            Use a standard process
          </button>
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <StepRow
            key={step._id}
            step={step}
            index={index}
            total={steps.length}
            dragging={dragId === step._id}
            dropTarget={overId === step._id && dragId !== step._id}
            onToggle={onToggle}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onMove={move}
            onDragStart={() => setDragId(step._id)}
            onDragEnter={() => dragId && setOverId(step._id)}
            onDrop={() => dropOn(step._id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
          />
        ))}
      </ol>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="input"
          placeholder="Add a step"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Hiring step name"
        />
        <button type="submit" className="btn-secondary" disabled={adding || !name.trim()} aria-label="Add hiring step">
          <PlusIcon />
        </button>
      </form>
    </div>
  );
}

function StepRow({
  step,
  index,
  total,
  dragging,
  dropTarget,
  onToggle,
  onUpdate,
  onDelete,
  onMove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  step: HiringStep;
  index: number;
  total: number;
  dragging: boolean;
  dropTarget: boolean;
  onToggle: HiringProcessPanelProps['onToggle'];
  onUpdate: HiringProcessPanelProps['onUpdate'];
  onDelete: HiringProcessPanelProps['onDelete'];
  onMove: (from: number, to: number) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [name, setName] = useState(step.name);

  useEffect(() => {
    setName(step.name);
  }, [step.name]);

  return (
    <li
      className={
        dropTarget
          ? 'rounded border border-brand-400 bg-brand-50 px-1 py-1'
          : dragging
            ? 'rounded px-1 py-1 opacity-50'
            : 'rounded px-1 py-1'
      }
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          draggable
          className="cursor-grab text-slate-400 active:cursor-grabbing"
          aria-label={`Drag ${step.name}`}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', step._id);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <DotsIcon className="h-4 w-4" />
        </button>
        <span className="w-4 shrink-0 text-xs text-slate-400">{index + 1}</span>
        <input
          id={`hiring-${step._id}`}
          type="checkbox"
          checked={step.done}
          onChange={(event) => onToggle(step._id, event.target.checked)}
          aria-label={`Mark ${step.name} done`}
        />
        <input
          className={
            step.done
              ? 'input min-w-0 flex-1 py-1 text-slate-400 line-through'
              : 'input min-w-0 flex-1 py-1'
          }
          value={name}
          aria-label={`Step ${index + 1} name`}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== step.name) onUpdate(step._id, { name: next });
            else setName(step.name);
          }}
        />
      </div>
      <div className="mt-1 flex items-center gap-1 pl-5">
        <input
          type="date"
          className="input min-w-0 flex-1 py-1"
          value={toDateInput(step.date)}
          aria-label={`${step.name} date`}
          onChange={(event) => onUpdate(step._id, { date: event.target.value || null })}
        />
        <button
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
          disabled={index === 0}
          aria-label={`Move ${step.name} up`}
          onClick={() => onMove(index, index - 1)}
        >
          <ChevronDownIcon className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
          disabled={index === total - 1}
          aria-label={`Move ${step.name} down`}
          onClick={() => onMove(index, index + 1)}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
          onClick={() => onDelete(step._id)}
          aria-label={`Delete ${step.name}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
