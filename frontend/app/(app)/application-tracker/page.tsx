'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ApplicationSubmitter, TrackedApplication } from '@/lib/types';

function todayValue() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dayRange(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, day || 1);
  const end = new Date(year, (month || 1) - 1, (day || 1) + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ApplicationTrackerPage() {
  const [submitters, setSubmitters] = useState<ApplicationSubmitter[]>([]);
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayValue);
  const [submitterId, setSubmitterId] = useState('');
  const [openId, setOpenId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSubmitters = useCallback(async () => {
    const response = await api.listApplicationSubmitters();
    setSubmitters(response.submitters);
  }, []);

  const loadApplications = useCallback(async () => {
    const range = dayRange(date);
    const response = await api.listTrackedApplications(range.from, range.to, submitterId);
    setApplications(response.applications);
  }, [date, submitterId]);

  useEffect(() => {
    loadSubmitters().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Could not load submitters');
    });
  }, [loadSubmitters]);

  useEffect(() => {
    loadApplications().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Could not load applications');
    });
  }, [loadApplications]);

  async function addSubmitter(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createApplicationSubmitter({ email, password, name });
      setEmail('');
      setPassword('');
      setName('');
      await loadSubmitters();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not add that submitter');
    } finally {
      setSaving(false);
    }
  }

  async function removeSubmitter(id: string) {
    if (!window.confirm('Remove this submitter? Applications they already sent stay on this page.')) return;
    setError('');
    try {
      await api.deleteApplicationSubmitter(id);
      if (submitterId === id) setSubmitterId('');
      await loadSubmitters();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove that submitter');
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-slate-800">Application submitters</h2>
        <p className="mt-1 text-sm text-slate-500">
          These accounts sign in to the Application Track extension. A successful submission is saved here.
        </p>
        <form onSubmit={addSubmitter} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="block text-sm text-slate-600">
            Name
            <input className="input mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            Email
            <input className="input mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="block text-sm text-slate-600">
            Password
            <input className="input mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add submitter'}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-slate-100">
          {submitters.length === 0 ? <li className="py-3 text-sm text-slate-400">No submitters yet.</li> : null}
          {submitters.map((submitter) => (
            <li key={submitter._id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-800">{submitter.name}</span>
                <span className="ml-2 text-slate-500">{submitter.email}</span>
              </span>
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeSubmitter(submitter._id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm text-slate-600">
            Date
            <input className="input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="block text-sm text-slate-600">
            Submitter
            <select className="input mt-1" value={submitterId} onChange={(event) => setSubmitterId(event.target.value)}>
              <option value="">All submitters</option>
              {submitters.map((submitter) => (
                <option key={submitter._id} value={submitter._id}>{submitter.email}</option>
              ))}
            </select>
          </label>
          <p className="pb-2 text-sm text-slate-500">{applications.length} submitted</p>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 space-y-3">
          {applications.length === 0 ? <p className="text-sm text-slate-400">No applications on this date.</p> : null}
          {applications.map((application) => {
            const open = openId === application._id;
            return (
              <article key={application._id} className="rounded-md border border-slate-200">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
                  onClick={() => setOpenId(open ? '' : application._id)}
                >
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      {application.title || application.pageTitle || application.domain || 'Application'}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {formatWhen(application.appliedAt)}
                      {' · '}
                      {application.submitterName || application.submitterEmail}
                      {application.company ? ` · ${application.company}` : ''}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">{open ? 'Hide' : 'Content'}</span>
                </button>
                {open ? (
                  <div className="border-t border-slate-100 px-3 py-3 text-sm text-slate-700">
                    {application.url ? (
                      <a className="break-all text-brand-700 hover:underline" href={application.url} target="_blank" rel="noreferrer">
                        {application.url}
                      </a>
                    ) : null}
                    <dl className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                      {application.fields.length === 0 ? <p className="text-slate-400">No form fields were captured.</p> : null}
                      {application.fields.map((field, index) => (
                        <div key={`${field.name}-${index}`}>
                          <dt className="text-xs font-medium text-slate-500">{field.label || field.name}</dt>
                          <dd className="whitespace-pre-wrap">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
