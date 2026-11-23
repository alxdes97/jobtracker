'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { ApplicationSubmitter, TrackedApplication } from '@/lib/types';

const PAGE_SIZE = 100;

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

function itemTitle(application: TrackedApplication) {
  const title = application.title || application.pageTitle || '';
  if (!title || /recaptcha|hcaptcha|turnstile/i.test(title)) {
    return application.url || application.domain || 'Application';
  }
  return title;
}

function submitterEmail(application: TrackedApplication) {
  return application.submitterEmail || 'Unknown';
}

export default function ApplicationTrackerPage() {
  const [tab, setTab] = useState<'submitters' | 'jobs'>('jobs');
  const [submitters, setSubmitters] = useState<ApplicationSubmitter[]>([]);
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayValue);
  const [emailTab, setEmailTab] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);

  const loadSubmitters = useCallback(async () => {
    const response = await api.listApplicationSubmitters();
    setSubmitters(response.submitters);
  }, []);

  const loadApplications = useCallback(async () => {
    const range = dayRange(date);
    const response = await api.listTrackedApplications(range.from, range.to);
    setApplications(response.applications);
  }, [date]);

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

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let attempt = 0;

    async function connect() {
      while (!stopped) {
        try {
          await api.watchTrackedApplications(controller.signal, {
            onOpen: () => {
              attempt = 0;
              setLive(true);
            },
            onUpdate: () => {
              loadApplications().catch(() => {});
            },
          });
        } catch {
          if (stopped || controller.signal.aborted) return;
        }
        if (stopped) return;
        setLive(false);
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 500 * attempt)));
      }
    }

    connect();
    return () => {
      stopped = true;
      setLive(false);
      controller.abort();
    };
  }, [loadApplications]);

  const emails = useMemo(() => {
    const found = new Set<string>();
    for (const application of applications) found.add(submitterEmail(application));
    return [...found].sort((left, right) => left.localeCompare(right));
  }, [applications]);

  const filtered = useMemo(() => {
    if (!emailTab) return applications;
    return applications.filter((application) => submitterEmail(application) === emailTab);
  }, [applications, emailTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const selected = applications.find((application) => application._id === selectedId) || null;

  useEffect(() => {
    setPage(1);
  }, [date, emailTab]);

  useEffect(() => {
    if (emailTab && !emails.includes(emailTab)) setEmailTab('');
  }, [emails, emailTab]);

  useEffect(() => {
    if (selectedId && !applications.some((application) => application._id === selectedId)) {
      setSelectedId('');
    }
  }, [applications, selectedId]);

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

  async function removeApplication(id: string) {
    if (!window.confirm('Delete this application?')) return;
    setError('');
    try {
      await api.deleteTrackedApplication(id);
      if (selectedId === id) setSelectedId('');
      setApplications((current) => current.filter((application) => application._id !== id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not delete that application');
    }
  }

  async function removeSubmitter(id: string) {
    if (!window.confirm('Remove this submitter? Applications they already sent stay on this page.')) return;
    setError('');
    try {
      await api.deleteApplicationSubmitter(id);
      await loadSubmitters();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove that submitter');
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.25rem)] min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4">
        <nav className="flex">
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'submitters' ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTab('submitters')}
          >
            Submitters
          </button>
          <button
            type="button"
            className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === 'jobs' ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            onClick={() => setTab('jobs')}
          >
            Job list
          </button>
        </nav>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-green-600' : 'bg-amber-500'}`} />
          {live ? 'Live' : 'Reconnecting'}
        </p>
      </div>

      {error ? <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p> : null}

      {tab === 'submitters' ? (
        <div className="mx-auto w-full max-w-3xl p-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800">Add a submitter</h2>
            <p className="mt-1 text-sm text-slate-500">
              These accounts sign in to the Application Track extension.
            </p>
            <form onSubmit={addSubmitter} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
            <label className="mt-3 block text-sm text-slate-600">
              Name
              <input className="input mt-1 max-w-sm" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <ul className="mt-4 divide-y divide-slate-100">
              {submitters.length === 0 ? <li className="py-3 text-sm text-slate-400">No submitters yet.</li> : null}
              {submitters.map((submitter) => (
                <li key={submitter._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{submitter.name || submitter.email}</span>
                    {submitter.name ? <span className="ml-2 text-slate-500">{submitter.email}</span> : null}
                  </span>
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeSubmitter(submitter._id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <label className="block text-sm text-slate-600">
              Date
              <input className="input mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2 pb-0.5">
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-medium ${emailTab === '' ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                onClick={() => setEmailTab('')}
              >
                All
              </button>
              {emails.map((address) => (
                <button
                  key={address}
                  type="button"
                  className={`max-w-full truncate rounded-full border px-3 py-1 text-xs font-medium ${emailTab === address ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setEmailTab(address)}
                >
                  {address}
                </button>
              ))}
            </div>
            <p className="pb-2 text-sm text-slate-500">{filtered.length} submitted</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="flex max-h-80 w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {pageItems.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400">No applications on this date.</p>
                ) : null}
                {pageItems.map((application) => {
                  const active = application._id === selectedId;
                  return (
                    <button
                      key={application._id}
                      type="button"
                      className={`block w-full border-b border-slate-100 px-4 py-3 text-left ${active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                      onClick={() => setSelectedId(application._id)}
                    >
                      <span className="block truncate text-sm font-medium text-slate-800">{itemTitle(application)}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {application.submitted === false && application.sessionId ? 'In progress' : formatWhen(application.appliedAt)}
                        {' · '}
                        {submitterEmail(application)}
                        {application.company ? ` · ${application.company}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  {filtered.length === 0 ? '0' : `${pageStart + 1}–${pageStart + pageItems.length}`} of {filtered.length}
                </span>
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </aside>

            <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
              {selected ? (
                <div className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words text-base font-semibold text-slate-800">{itemTitle(selected)}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {selected.submitted === false && selected.sessionId ? 'In progress' : formatWhen(selected.appliedAt)}
                        {' · '}
                        {selected.submitterName || submitterEmail(selected)}
                        {selected.company ? ` · ${selected.company}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => removeApplication(selected._id)}
                    >
                      Delete
                    </button>
                  </div>
                  {selected.url ? (
                    <a className="mt-3 block break-all text-sm text-brand-700 hover:underline" href={selected.url} target="_blank" rel="noreferrer">
                      {selected.url}
                    </a>
                  ) : null}
                  <dl className="mt-4 space-y-3 text-sm text-slate-700">
                    {selected.fields.length === 0 ? <p className="text-slate-400">No form fields were captured.</p> : null}
                    {selected.fields.map((field, index) => (
                      <div key={`${field.name}-${index}`}>
                        <dt className="text-xs font-medium text-slate-500">{field.label || field.name}</dt>
                        <dd className="whitespace-pre-wrap">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="px-2 py-8 text-sm text-slate-400">Select a job to preview its content.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
