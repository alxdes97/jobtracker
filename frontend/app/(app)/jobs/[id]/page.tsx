'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { StarRating } from '@/components/StarRating';
import { StatusStepper } from '@/components/jobs/StatusStepper';
import { KeywordPanel } from '@/components/jobs/KeywordPanel';
import { NotesPanel } from '@/components/jobs/NotesPanel';
import { ChecklistPanel } from '@/components/jobs/ChecklistPanel';
import { TodoPanel } from '@/components/jobs/TodoPanel';
import { LinkResume } from '@/components/jobs/LinkResume';
import { ResumesPanel } from '@/components/jobs/ResumesPanel';
import { JobAttachmentsPanel } from '@/components/jobs/JobAttachmentsPanel';
import { JobContactsPanel } from '@/components/jobs/JobContactsPanel';
import { JobCompaniesPanel } from '@/components/jobs/JobCompaniesPanel';
import { EmailTemplatesPanel } from '@/components/jobs/EmailTemplatesPanel';
import { InterviewTracking } from '@/components/jobs/InterviewTracking';
import {
  BuildingIcon,
  CheckSquareIcon,
  DocumentIcon,
  InfoIcon,
  ListIcon,
  MailIcon,
  NoteIcon,
  PaperclipIcon,
  TrashIcon,
  UsersIcon,
} from '@/components/Icons';
import { api } from '@/lib/api';
import { classNames, hostnameOf, timeAgo, toDateInput } from '@/lib/format';
import type { Job, JobStatus } from '@/lib/types';

const TABS = [
  { key: 'info', label: 'Job Info', icon: InfoIcon },
  { key: 'notes', label: 'Notes', icon: NoteIcon },
  { key: 'resumes', label: 'Resumes', icon: PaperclipIcon },
  { key: 'attachments', label: 'Attachments', icon: DocumentIcon },
  { key: 'contacts', label: 'Contacts', icon: UsersIcon },
  { key: 'companies', label: 'Companies', icon: BuildingIcon },
  { key: 'templates', label: 'Email Templates', icon: MailIcon },
  { key: 'checklist', label: 'Check List', icon: CheckSquareIcon },
  { key: 'todo', label: 'To Do', icon: ListIcon },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const DATE_FIELDS = [
  { key: 'dateSaved', label: 'Date saved' },
  { key: 'dateApplied', label: 'Date applied' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'followUp', label: 'Follow up' },
] as const;

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<TabKey>('info');
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.getJob(id);
      setJob(response.job);
      setDescription(response.job.description);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load job');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(data: Partial<Job>) {
    const response = await api.updateJob(id, data);
    setJob(response.job);
  }

  async function changeStatus(status: JobStatus) {
    const response = await api.moveJob(id, { status, order: 0 });
    setJob(response.job);
  }

  async function remove() {
    if (!window.confirm('Delete this job?')) return;
    await api.deleteJob(id);
    router.push('/jobs');
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <Link href="/jobs" className="mt-4 inline-block text-sm text-brand-700 hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  if (!job) return <p className="p-8 text-sm text-slate-500">Loading job…</p>;

  const sidePanelTitle = TABS.find((item) => item.key === tab)?.label ?? '';

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <input
            className="w-full min-w-[280px] rounded border border-transparent bg-transparent text-2xl font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-400"
            value={job.title}
            onChange={(event) => setJob({ ...job, title: event.target.value })}
            onBlur={(event) => patch({ title: event.target.value })}
          />
          <p className="mt-1 text-sm font-medium text-slate-600">
            {job.companyName}
            {job.location ? ` — ${job.location}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Saved {timeAgo(job.dateSaved)}
            {job.url ? (
              <>
                {' on '}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  {hostnameOf(job.url)}
                </a>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="number"
              className="input w-28 py-1"
              placeholder="Min"
              value={job.salaryMin ?? ''}
              onChange={(event) =>
                setJob({ ...job, salaryMin: event.target.value ? Number(event.target.value) : null })
              }
              onBlur={(event) =>
                patch({ salaryMin: event.target.value ? Number(event.target.value) : null })
              }
            />
            <span>–</span>
            <input
              type="number"
              className="input w-28 py-1"
              placeholder="Max"
              value={job.salaryMax ?? ''}
              onChange={(event) =>
                setJob({ ...job, salaryMax: event.target.value ? Number(event.target.value) : null })
              }
              onBlur={(event) =>
                patch({ salaryMax: event.target.value ? Number(event.target.value) : null })
              }
            />
          </div>
          <div className="flex items-center gap-3">
            <StarRating
              value={job.excitement}
              size="md"
              onChange={(value) => patch({ excitement: value })}
            />
            <button
              type="button"
              className="btn-ghost text-red-600"
              onClick={remove}
              aria-label="Delete job"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </header>

      <StatusStepper status={job.status} onChange={changeStatus} />

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-700">
            <span className="font-medium text-brand-800">Guidance</span>
            {' › '}
            {job.status} Steps: {job.guidance.percent}% Complete
          </p>
          <button
            type="button"
            className="text-xs text-brand-700 hover:underline"
            onClick={() => setTab('checklist')}
          >
            Open checklist
          </button>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${job.guidance.percent}%` }}
          />
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={classNames(
                'flex items-center gap-2 rounded-t-md px-3 py-2 text-sm',
                tab === item.key
                  ? 'bg-white font-medium text-brand-800 shadow-[inset_0_-2px_0_0_#166051]'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Dates</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DATE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={`date-${field.key}`}>
                    {field.label}
                  </label>
                  <input
                    id={`date-${field.key}`}
                    type="date"
                    className="input"
                    value={toDateInput(job[field.key])}
                    onChange={(event) => patch({ [field.key]: event.target.value || null })}
                  />
                </div>
              ))}
            </div>
          </section>

          {job.status === 'Interviewing' ? (
          <InterviewTracking
            jobId={id}
            interviews={job.interviews ?? []}
            onAdd={async () => {
              const response = await api.addInterview(id);
              setJob(response.job);
              return response.interviewId;
            }}
            onUpdate={async (interviewId, data) =>
              setJob((await api.updateInterview(id, interviewId, data)).job)
            }
            onDelete={async (interviewId) => setJob((await api.deleteInterview(id, interviewId)).job)}
            onAddInterviewer={async (interviewId, data) =>
              setJob((await api.addInterviewer(id, interviewId, data)).job)
            }
            onDeleteInterviewer={async (interviewId, interviewerId) =>
              setJob((await api.deleteInterviewer(id, interviewId, interviewerId)).job)
            }
            onAddConversation={async (interviewId, data) =>
              setJob((await api.addConversation(id, interviewId, data)).job)
            }
            onDeleteConversation={async (interviewId, entryId) =>
              setJob((await api.deleteConversation(id, interviewId, entryId)).job)
            }
            onAddFeedback={async (interviewId, body) =>
              setJob((await api.addFeedback(id, interviewId, body)).job)
            }
            onDeleteFeedback={async (interviewId, feedbackId) =>
              setJob((await api.deleteFeedback(id, interviewId, feedbackId)).job)
            }
            onAddAttachment={async (interviewId, file) =>
              setJob((await api.uploadInterviewAttachment(id, interviewId, file)).job)
            }
            onDeleteAttachment={async (interviewId, attachmentId) =>
              setJob((await api.deleteInterviewAttachment(id, interviewId, attachmentId)).job)
            }
            onAddPractice={async (interviewId, notes) =>
              setJob((await api.addPracticeSession(id, interviewId, notes)).job)
            }
          />
          ) : null}

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Job Description &amp; Keywords</h3>
              <button
                type="button"
                className="text-xs text-brand-700 hover:underline"
                onClick={async () => {
                  if (editingDescription) await patch({ description });
                  setEditingDescription(!editingDescription);
                }}
              >
                {editingDescription ? 'Save description' : 'Edit description'}
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              {editingDescription ? (
                <textarea
                  className="input min-h-[420px]"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              ) : (
                <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {job.description || (
                    <span className="text-slate-400">
                      No description saved. Paste the posting to extract keywords.
                    </span>
                  )}
                </div>
              )}

              <div className="xl:border-l xl:border-slate-100 xl:pl-4">
                <KeywordPanel sections={job.keywords.sections} total={job.keywords.total} />
              </div>
            </div>
          </section>
        </div>

        <aside className="card h-fit p-4">
          {tab === 'notes' ? null : (
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{sidePanelTitle}</h3>
          )}

          {tab === 'info' ? (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="info-company">
                  Company
                </label>
                <input
                  id="info-company"
                  className="input"
                  value={job.companyName}
                  onChange={(event) => setJob({ ...job, companyName: event.target.value })}
                  onBlur={(event) => patch({ companyName: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="info-location">
                  Location
                </label>
                <input
                  id="info-location"
                  className="input"
                  value={job.location}
                  onChange={(event) => setJob({ ...job, location: event.target.value })}
                  onBlur={(event) => patch({ location: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="info-url">
                  Posting URL
                </label>
                <input
                  id="info-url"
                  className="input"
                  value={job.url}
                  onChange={(event) => setJob({ ...job, url: event.target.value })}
                  onBlur={(event) => patch({ url: event.target.value })}
                />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <h4 className="mb-2 text-sm font-semibold text-slate-800">Resume</h4>
                <LinkResume
                  resumes={job.resumes}
                  onLink={async (resumeId) => setJob((await api.linkLibraryResume(id, resumeId)).job)}
                  onUnlink={async (resumeId) => setJob((await api.deleteJobResume(id, resumeId)).job)}
                />
              </div>
              <dl className="space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Keywords found</dt>
                  <dd className="font-medium text-slate-800">{job.keywords.total}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Contacts linked</dt>
                  <dd className="font-medium text-slate-800">{job.contacts.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Resumes attached</dt>
                  <dd className="font-medium text-slate-800">{job.resumes.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Files attached</dt>
                  <dd className="font-medium text-slate-800">{job.attachments?.length ?? 0}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {tab === 'notes' ? (
            <NotesPanel
              items={job.noteItems ?? []}
              legacy={job.notes ?? ''}
              onAdd={async (body) => setJob((await api.addNote(id, body)).job)}
              onUpdate={async (noteId, body) => setJob((await api.updateNote(id, noteId, body)).job)}
              onDelete={async (noteId) => setJob((await api.deleteNote(id, noteId)).job)}
              onClearLegacy={async () => patch({ notes: '' })}
            />
          ) : null}

          {tab === 'resumes' ? (
            <ResumesPanel
              resumes={job.resumes}
              onAdd={async (data) => setJob((await api.addResume(id, data)).job)}
              onLink={async (resumeId) => setJob((await api.linkLibraryResume(id, resumeId)).job)}
              onDelete={async (resumeId) => setJob((await api.deleteJobResume(id, resumeId)).job)}
            />
          ) : null}

          {tab === 'attachments' ? (
            <JobAttachmentsPanel
              jobId={id}
              attachments={job.attachments ?? []}
              onAdd={async (file) => setJob((await api.uploadJobAttachment(id, file)).job)}
              onDelete={async (attachmentId) =>
                setJob((await api.deleteJobAttachment(id, attachmentId)).job)
              }
            />
          ) : null}

          {tab === 'contacts' ? (
            <JobContactsPanel
              contacts={job.contacts}
              onLink={async (contactId) => setJob((await api.linkContact(id, contactId)).job)}
              onUnlink={async (contactId) => setJob((await api.unlinkContact(id, contactId)).job)}
            />
          ) : null}

          {tab === 'companies' ? (
            <JobCompaniesPanel
              companyId={job.company}
              companyName={job.companyName}
              onConnect={async (companyId) => setJob((await api.connectCompany(id, companyId)).job)}
              onDisconnect={async () => setJob((await api.disconnectCompany(id)).job)}
            />
          ) : null}

          {tab === 'templates' ? (
            <EmailTemplatesPanel job={job} userName={user?.name ?? ''} />
          ) : null}

          {tab === 'checklist' ? (
            <ChecklistPanel
              items={job.checklist}
              currentStage={job.status}
              onToggle={async (itemId, done) =>
                setJob((await api.updateChecklistItem(id, itemId, { done })).job)
              }
              onAdd={async (label) => setJob((await api.addChecklistItem(id, label)).job)}
              onDelete={async (itemId) => setJob((await api.deleteChecklistItem(id, itemId)).job)}
            />
          ) : null}

          {tab === 'todo' ? (
            <TodoPanel
              items={job.todos ?? []}
              onToggle={async (itemId, done) =>
                setJob((await api.updateTodo(id, itemId, { done })).job)
              }
              onAdd={async (text) => setJob((await api.addTodo(id, text)).job)}
              onDelete={async (itemId) => setJob((await api.deleteTodo(id, itemId)).job)}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
