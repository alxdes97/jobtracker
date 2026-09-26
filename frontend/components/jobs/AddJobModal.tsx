'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import { JOB_STATUSES, type Job, type JobStatus } from '@/lib/types';

interface AddJobModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
  defaultStatus?: JobStatus;
}

const emptyForm = {
  title: '',
  url: '',
  companyName: '',
  location: '',
  description: '',
  salaryMin: '',
  salaryMax: '',
  deadline: '',
};

export function AddJobModal({ open, onClose, onCreated, defaultStatus = 'Bookmarked' }: AddJobModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<JobStatus>(defaultStatus);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The modal stays mounted between openings, so the column the user clicked
  // "+" on only reaches the form if we resync each time it opens.
  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setStatus(defaultStatus);
    setError('');
  }, [open, defaultStatus]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function close() {
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await api.createJob({
        ...form,
        status,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        deadline: form.deadline || null,
      } as Partial<Job>);
      onCreated(response.job);
      close();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save job');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add a New Job Post"
      onClose={close}
      width="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" form="add-job-form" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Job'}
          </button>
        </>
      }
    >
      <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md bg-brand-50 px-4 py-3 text-center text-sm text-brand-800">
          Paste a posting URL and the job stays linked to the original listing.
        </div>

        <div>
          <label className="label" htmlFor="job-title">
            Job Title
          </label>
          <input
            id="job-title"
            className="input"
            placeholder="Job Title"
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="job-url">
            URL for Original Posting
          </label>
          <input
            id="job-url"
            className="input"
            placeholder="https://"
            value={form.url}
            onChange={(event) => update('url', event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-company">
              Company Name
            </label>
            <input
              id="job-company"
              className="input"
              placeholder="Company Name"
              value={form.companyName}
              onChange={(event) => update('companyName', event.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="job-location">
              Location
            </label>
            <input
              id="job-location"
              className="input"
              placeholder="Location"
              value={form.location}
              onChange={(event) => update('location', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="job-status">
              Status
            </label>
            <select
              id="job-status"
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as JobStatus)}
            >
              {JOB_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="job-salary-min">
              Min Salary
            </label>
            <input
              id="job-salary-min"
              type="number"
              min="0"
              className="input"
              value={form.salaryMin}
              onChange={(event) => update('salaryMin', event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="job-salary-max">
              Max Salary
            </label>
            <input
              id="job-salary-max"
              type="number"
              min="0"
              className="input"
              value={form.salaryMax}
              onChange={(event) => update('salaryMax', event.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="job-deadline">
            Deadline
          </label>
          <input
            id="job-deadline"
            type="date"
            className="input"
            value={form.deadline}
            onChange={(event) => update('deadline', event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="job-description">
            Job Description
          </label>
          <textarea
            id="job-description"
            className="input min-h-[180px]"
            placeholder="Paste the job description to pull out keywords"
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
