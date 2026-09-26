'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { DotsIcon, PlusIcon } from '@/components/Icons';
import { StarRating } from '@/components/StarRating';
import { PIPELINE_STATUSES, type Job, type JobStatus } from '@/lib/types';
import { classNames, formatDate } from '@/lib/format';
import { useDismiss } from '@/lib/useDismiss';

type ColumnSort = 'manual' | 'title' | 'company' | 'date';

interface JobBoardProps {
  jobs: Job[];
  onMove: (jobId: string, status: JobStatus, order: number) => void;
  onAdd: (status: JobStatus) => void;
}

const SORT_LABELS: Record<Exclude<ColumnSort, 'manual'>, string> = {
  title: 'Sort by title',
  company: 'Sort by company',
  date: 'Sort by date',
};

export function JobBoard({ jobs, onMove, onAdd }: JobBoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<JobStatus | null>(null);
  const [openMenu, setOpenMenu] = useState<JobStatus | null>(null);
  const [hidden, setHidden] = useState<JobStatus[]>([]);
  const [sorts, setSorts] = useState<Partial<Record<JobStatus, ColumnSort>>>({});
  const menuRef = useRef<HTMLElement>(null);

  useDismiss(menuRef, openMenu !== null, () => setOpenMenu(null));

  // "Close Job" on a job page parks it outside the pipeline, so the column only
  // appears once something is in it — otherwise those jobs would be unreachable.
  const columns = useMemo(() => {
    const hasClosed = jobs.some((job) => job.status === 'Closed');
    return hasClosed ? [...PIPELINE_STATUSES, 'Closed' as JobStatus] : PIPELINE_STATUSES;
  }, [jobs]);

  const grouped = useMemo(() => {
    const map = new Map<JobStatus, Job[]>();
    for (const status of columns) map.set(status, []);
    for (const job of jobs) {
      if (!map.has(job.status)) map.set(job.status, []);
      map.get(job.status)!.push(job);
    }
    for (const [status, columnJobs] of map) {
      const sort = sorts[status] ?? 'manual';
      const sorted = [...columnJobs].sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (sort === 'company') return a.companyName.localeCompare(b.companyName);
        if (sort === 'date') return +new Date(b.dateSaved) - +new Date(a.dateSaved);
        return a.order - b.order;
      });
      map.set(status, sorted);
    }
    return map;
  }, [jobs, sorts, columns]);

  const visibleColumns = columns.filter((status) => !hidden.includes(status));

  function handleDrop(status: JobStatus, index?: number) {
    if (!dragging) return;
    const columnJobs = grouped.get(status) ?? [];
    const order = index ?? columnJobs.length;
    onMove(dragging, status, order);
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <div className="flex h-full flex-col">
      {hidden.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Hidden columns:</span>
          {hidden.map((status) => (
            <button
              key={status}
              type="button"
              className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
              onClick={() => setHidden((current) => current.filter((item) => item !== status))}
            >
              {status} ✕
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {visibleColumns.map((status) => {
          const columnJobs = grouped.get(status) ?? [];
          return (
            <section
              key={status}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(status);
              }}
              onDragLeave={() => setDropTarget((current) => (current === status ? null : current))}
              onDrop={() => handleDrop(status)}
              className={classNames(
                'flex w-[280px] shrink-0 flex-col rounded-lg border bg-white',
                dropTarget === status ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200',
              )}
            >
              <header
                ref={openMenu === status ? menuRef : undefined}
                className="relative flex items-center justify-between border-b border-slate-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{status}</h3>
                  <span className="text-xs text-slate-400">{columnJobs.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setOpenMenu(openMenu === status ? null : status)}
                    aria-label={`${status} column options`}
                  >
                    <DotsIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => onAdd(status)}
                    aria-label={`Add job to ${status}`}
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>

                {openMenu === status ? (
                  <div className="absolute right-2 top-9 z-20 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={classNames(
                          'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                          sorts[status] === key ? 'text-brand-700' : 'text-slate-700',
                        )}
                        onClick={() => {
                          setSorts((current) => ({ ...current, [status]: key }));
                          setOpenMenu(null);
                        }}
                      >
                        {SORT_LABELS[key]}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setSorts((current) => ({ ...current, [status]: 'manual' }));
                        setOpenMenu(null);
                      }}
                    >
                      Manual order
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setHidden((current) => [...current, status]);
                        setOpenMenu(null);
                      }}
                    >
                      Hide column
                    </button>
                  </div>
                ) : null}
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {columnJobs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No jobs</p>
                ) : null}

                {columnJobs.map((job, index) => (
                  <article
                    key={job._id}
                    draggable
                    onDragStart={() => setDragging(job._id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
                      handleDrop(status, index);
                    }}
                    className={classNames(
                      'cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow',
                      dragging === job._id && 'opacity-40',
                    )}
                  >
                    <Link href={`/jobs/${job._id}`} className="block">
                      <h4 className="text-sm font-medium text-slate-900">{job.title}</h4>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {job.companyName}
                        {job.location ? ` · ${job.location}` : ''}
                      </p>
                    </Link>
                    <div className="mt-2 flex items-center justify-between">
                      <StarRating value={job.excitement} />
                      <span className="text-[11px] text-slate-400">{formatDate(job.dateSaved)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
