'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PipelineHeader } from '@/components/jobs/PipelineHeader';
import { JobBoard } from '@/components/jobs/JobBoard';
import { JobTable } from '@/components/jobs/JobTable';
import { AddJobModal } from '@/components/jobs/AddJobModal';
import { BoardIcon, DownloadIcon, ListIcon, PlusIcon, SearchIcon } from '@/components/Icons';
import { api, downloadExport } from '@/lib/api';
import { PIPELINE_STATUSES, type Job, type JobStatus } from '@/lib/types';
import { classNames } from '@/lib/format';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);
  const [modalStatus, setModalStatus] = useState<JobStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.listJobs();
      setJobs(response.jobs);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = Object.fromEntries(
      PIPELINE_STATUSES.map((status) => [status, 0]),
    );
    for (const job of jobs) result[job.status] = (result[job.status] ?? 0) + 1;
    return result;
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter && job.status !== statusFilter) return false;
      if (!term) return true;
      return [job.title, job.companyName, job.location]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [jobs, search, statusFilter]);

  async function handleMove(jobId: string, status: JobStatus, order: number) {
    const previous = jobs;
    // Optimistic: the card jumps columns immediately, then the server reorders.
    setJobs((current) =>
      current.map((job) => (job._id === jobId ? { ...job, status, order } : job)),
    );
    try {
      await api.moveJob(jobId, { status, order });
      await load();
    } catch (moveError) {
      setJobs(previous);
      setError(moveError instanceof Error ? moveError.message : 'Could not move job');
    }
  }

  async function handleRate(jobId: string, excitement: number) {
    const previous = jobs;
    setJobs((current) =>
      current.map((job) => (job._id === jobId ? { ...job, excitement } : job)),
    );
    try {
      await api.updateJob(jobId, { excitement });
    } catch (rateError) {
      setJobs(previous);
      setError(rateError instanceof Error ? rateError.message : 'Could not save the rating');
    }
  }

  async function handleDelete(ids: string[]) {
    if (!window.confirm(`Delete ${ids.length} job${ids.length === 1 ? '' : 's'}?`)) return;
    try {
      await Promise.all(ids.map((id) => api.deleteJob(id)));
      setJobs((current) => current.filter((job) => !ids.includes(job._id)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete jobs');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <PipelineHeader counts={counts} activeStatus={statusFilter} onSelect={setStatusFilter} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input w-64 pl-8"
            placeholder="Search jobs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button
              type="button"
              className={classNames(
                'px-2 py-1.5',
                view === 'list' ? 'bg-brand-50 text-brand-700' : 'bg-white text-slate-500',
              )}
              onClick={() => setView('list')}
              aria-label="List view"
            >
              <ListIcon />
            </button>
            <button
              type="button"
              className={classNames(
                'border-l border-slate-300 px-2 py-1.5',
                view === 'board' ? 'bg-brand-50 text-brand-700' : 'bg-white text-slate-500',
              )}
              onClick={() => setView('board')}
              aria-label="Board view"
            >
              <BoardIcon />
            </button>
          </div>

          <button type="button" className="btn-secondary" onClick={() => downloadExport('jobs')}>
            <DownloadIcon />
            Download Data
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setModalStatus(statusFilter ?? 'Bookmarked')}
          >
            <PlusIcon />
            Add Job
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-500">Loading jobs…</p>
      ) : view === 'board' ? (
        <JobBoard jobs={visibleJobs} onMove={handleMove} onAdd={(status) => setModalStatus(status)} />
      ) : (
        <JobTable jobs={visibleJobs} onDelete={handleDelete} onRate={handleRate} />
      )}

      <AddJobModal
        open={modalStatus !== null}
        defaultStatus={modalStatus ?? 'Bookmarked'}
        onClose={() => setModalStatus(null)}
        onCreated={(job) => setJobs((current) => [...current, job])}
      />
    </div>
  );
}
