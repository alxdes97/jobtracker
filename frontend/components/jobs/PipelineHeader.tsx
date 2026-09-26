'use client';

import { PIPELINE_STATUSES, type JobStatus } from '@/lib/types';
import { classNames } from '@/lib/format';

interface PipelineHeaderProps {
  counts: Record<string, number>;
  activeStatus: JobStatus | null;
  onSelect: (status: JobStatus | null) => void;
}

export function PipelineHeader({ counts, activeStatus, onSelect }: PipelineHeaderProps) {
  // Closed sits outside the pipeline, so it only earns a slot once it has jobs.
  const statuses: JobStatus[] =
    (counts.Closed ?? 0) > 0 ? [...PIPELINE_STATUSES, 'Closed'] : PIPELINE_STATUSES;

  return (
    <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white">
      {statuses.map((status, index) => {
        const count = counts[status] ?? 0;
        const active = activeStatus === status;
        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(active ? null : status)}
            className={classNames(
              'relative flex min-w-[150px] flex-1 flex-col items-center justify-center px-4 py-3 text-center transition',
              active ? 'bg-amber-50' : 'bg-white hover:bg-slate-50',
              index > 0 && 'border-l border-slate-200',
            )}
          >
            <span
              className={classNames(
                'text-lg font-semibold',
                count > 0 ? 'text-slate-900' : 'text-slate-300',
              )}
            >
              {count > 0 ? count : '— —'}
            </span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {status}
            </span>
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-400" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
