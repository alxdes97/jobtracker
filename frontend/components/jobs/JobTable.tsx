'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { StarRating } from '@/components/StarRating';
import { TrashIcon } from '@/components/Icons';
import type { Job } from '@/lib/types';
import { classNames, formatDate, formatSalary } from '@/lib/format';

interface JobTableProps {
  jobs: Job[];
  onDelete: (ids: string[]) => void;
  onRate: (jobId: string, excitement: number) => void;
}

type SortKey =
  | 'title'
  | 'companyName'
  | 'salaryMax'
  | 'location'
  | 'status'
  | 'dateSaved'
  | 'deadline'
  | 'dateApplied'
  | 'followUp'
  | 'excitement';

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'title', label: 'Job Position', className: 'min-w-[220px]' },
  { key: 'companyName', label: 'Company' },
  { key: 'salaryMax', label: 'Max. Salary' },
  { key: 'location', label: 'Location' },
  { key: 'status', label: 'Status' },
  { key: 'dateSaved', label: 'Date Saved' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'dateApplied', label: 'Date Applied' },
  { key: 'followUp', label: 'Follow up' },
  { key: 'excitement', label: 'Excitement' },
];

export function JobTable({ jobs, onDelete, onRate }: JobTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: 'dateSaved',
    direction: -1,
  });

  const rows = useMemo(() => {
    const value = (job: Job, key: SortKey): string | number => {
      const raw = job[key];
      if (raw === null || raw === undefined || raw === '') return key === 'excitement' ? 0 : '';
      if (typeof raw === 'number') return raw;
      if (['dateSaved', 'deadline', 'dateApplied', 'followUp'].includes(key)) {
        return new Date(raw as string).getTime();
      }
      return String(raw).toLowerCase();
    };

    return [...jobs].sort((a, b) => {
      const left = value(a, sort.key);
      const right = value(b, sort.key);
      if (left === right) return 0;
      if (left === '') return 1;
      if (right === '') return -1;
      return (left > right ? 1 : -1) * sort.direction;
    });
  }, [jobs, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 1 ? -1 : 1 }
        : { key, direction: 1 },
    );
  }

  // Searching or filtering can hide rows that are still ticked; acting on them
  // would delete jobs the user cannot see.
  const activeSelection = useMemo(() => {
    const visible = new Set(rows.map((job) => job._id));
    return selected.filter((jobId) => visible.has(jobId));
  }, [rows, selected]);

  const allSelected = rows.length > 0 && activeSelection.length === rows.length;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? rows.map((job) => job._id) : [])}
          />
          {activeSelection.length} selected
        </label>
        {activeSelection.length > 0 ? (
          <button
            type="button"
            className="btn-secondary text-red-600"
            onClick={() => {
              onDelete(activeSelection);
              setSelected([]);
            }}
          >
            <TrashIcon />
            Delete
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-2" />
              {COLUMNS.map((column) => (
                <th key={column.key} className={classNames('px-4 py-2', column.className)}>
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-slate-800"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    <span className="text-[10px] text-slate-400">
                      {sort.key === column.key ? (sort.direction === 1 ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-slate-400">
                  No jobs yet.
                </td>
              </tr>
            ) : null}

            {rows.map((job) => (
              <tr key={job._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(job._id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, job._id]
                          : current.filter((id) => id !== job._id),
                      )
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <Link href={`/jobs/${job._id}`} className="font-medium text-slate-800 hover:text-brand-700">
                    {job.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{job.companyName}</td>
                <td className="px-4 py-2 text-slate-600">
                  {formatSalary(null, job.salaryMax, job.salaryCurrency)}
                </td>
                <td className="px-4 py-2 text-slate-600">{job.location || '—'}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{formatDate(job.dateSaved)}</td>
                <td className="px-4 py-2 text-slate-600">{formatDate(job.deadline) || 'N/A'}</td>
                <td className="px-4 py-2 text-slate-600">{formatDate(job.dateApplied) || '—'}</td>
                <td className="px-4 py-2 text-slate-600">{formatDate(job.followUp) || 'Add date'}</td>
                <td className="px-4 py-2">
                  <StarRating value={job.excitement} onChange={(value) => onRate(job._id, value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
