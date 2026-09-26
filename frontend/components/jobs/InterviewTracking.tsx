'use client';

import { useRef, useState } from 'react';
import { DownloadIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { downloadInterviewAttachment } from '@/lib/api';
import { formatDate, toDateInput } from '@/lib/format';
import { INTERVIEW_FORMATS, INTERVIEW_TYPES, type Interview } from '@/lib/types';

interface InterviewTrackingProps {
  jobId: string;
  interviews: Interview[];
  onAdd: () => Promise<string>;
  onUpdate: (interviewId: string, data: { date?: string | null; type?: string; format?: string }) => Promise<void>;
  onDelete: (interviewId: string) => Promise<void>;
  onAddInterviewer: (interviewId: string, data: { name: string; title?: string }) => Promise<void>;
  onDeleteInterviewer: (interviewId: string, interviewerId: string) => Promise<void>;
  onAddConversation: (interviewId: string, data: { speaker: string; message: string }) => Promise<void>;
  onDeleteConversation: (interviewId: string, entryId: string) => Promise<void>;
  onAddFeedback: (interviewId: string, body: string) => Promise<void>;
  onDeleteFeedback: (interviewId: string, feedbackId: string) => Promise<void>;
  onAddAttachment: (interviewId: string, file: File) => Promise<void>;
  onDeleteAttachment: (interviewId: string, attachmentId: string) => Promise<void>;
  onAddPractice: (interviewId: string, notes: string) => Promise<void>;
}

function ordinal(index: number) {
  const n = index + 1;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function InterviewTracking({
  jobId,
  interviews,
  onAdd,
  onUpdate,
  onDelete,
  onAddInterviewer,
  onDeleteInterviewer,
  onAddConversation,
  onDeleteConversation,
  onAddFeedback,
  onDeleteFeedback,
  onAddAttachment,
  onDeleteAttachment,
  onAddPractice,
}: InterviewTrackingProps) {
  const [selectedId, setSelectedId] = useState(interviews[0]?._id ?? '');
  const [adding, setAdding] = useState(false);
  const [interviewerOpen, setInterviewerOpen] = useState(false);
  const [interviewerName, setInterviewerName] = useState('');
  const [interviewerTitle, setInterviewerTitle] = useState('');
  const [conversationOpen, setConversationOpen] = useState(false);
  const [speaker, setSpeaker] = useState('Me');
  const [message, setMessage] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBody, setFeedbackBody] = useState('');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceNotes, setPracticeNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentRef = useRef<HTMLInputElement>(null);

  const selected =
    interviews.find((interview) => interview._id === selectedId) ?? interviews[0] ?? null;

  async function handleAdd() {
    setAdding(true);
    try {
      const interviewId = await onAdd();
      setSelectedId(interviewId);
      setInterviewerOpen(false);
      setPracticeOpen(false);
    } finally {
      setAdding(false);
    }
  }

  async function handleAddInterviewer(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !interviewerName.trim()) return;
    setBusy(true);
    try {
      await onAddInterviewer(selected._id, {
        name: interviewerName.trim(),
        title: interviewerTitle.trim(),
      });
      setInterviewerName('');
      setInterviewerTitle('');
      setInterviewerOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !message.trim()) return;
    setBusy(true);
    try {
      await onAddConversation(selected._id, { speaker, message: message.trim() });
      setMessage('');
      setConversationOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !feedbackBody.trim()) return;
    setBusy(true);
    try {
      await onAddFeedback(selected._id, feedbackBody.trim());
      setFeedbackBody('');
      setFeedbackOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleAttachment(file: File | undefined) {
    if (!selected || !file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'txt'].includes(extension)) {
      setAttachmentError('Upload a PDF, Word document, image, or text file');
      if (attachmentRef.current) attachmentRef.current.value = '';
      return;
    }
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      setAttachmentError(file.size === 0 ? 'That file is empty' : 'Attachment must be 8 MB or smaller');
      if (attachmentRef.current) attachmentRef.current.value = '';
      return;
    }
    setBusy(true);
    setAttachmentError('');
    try {
      await onAddAttachment(selected._id, file);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Could not add that attachment');
    } finally {
      setBusy(false);
      if (attachmentRef.current) attachmentRef.current.value = '';
    }
  }

  async function handleAddPractice(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !practiceNotes.trim()) return;
    setBusy(true);
    try {
      await onAddPractice(selected._id, practiceNotes.trim());
      setPracticeNotes('');
      setPracticeOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Interview Tracking</h3>
      </header>

      <div className="grid min-h-[220px] md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 bg-slate-50/70 p-3 md:border-b-0 md:border-r">
          <ul className="space-y-1">
            {interviews.map((interview, index) => {
              const active = selected?._id === interview._id;
              return (
                <li key={interview._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(interview._id)}
                    className={
                      active
                        ? 'w-full rounded px-2 py-1.5 text-left text-sm font-semibold text-slate-900'
                        : 'w-full rounded px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-white'
                    }
                  >
                    {ordinal(index)} Interview
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 px-2 py-1 text-sm font-medium text-amber-700 hover:text-amber-800"
            onClick={handleAdd}
            disabled={adding}
          >
            <PlusIcon className="h-4 w-4" />
            {adding ? 'Adding…' : 'Add Interview'}
          </button>
        </div>

        <div className="p-4">
          {selected ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-800">Details</h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-600 hover:text-brand-800"
                    onClick={() => setPracticeOpen((current) => !current)}
                  >
                    New Practice Session
                  </button>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Delete interview"
                    onClick={async () => {
                      if (!window.confirm('Delete this interview?')) return;
                      await onDelete(selected._id);
                      setSelectedId('');
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor={`interview-date-${selected._id}`}>
                    Date of Interview
                  </label>
                  <input
                    id={`interview-date-${selected._id}`}
                    type="date"
                    className="input"
                    value={toDateInput(selected.date)}
                    onChange={(event) =>
                      onUpdate(selected._id, { date: event.target.value || null })
                    }
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`interview-type-${selected._id}`}>
                    Type
                  </label>
                  <select
                    id={`interview-type-${selected._id}`}
                    className="input"
                    value={selected.type}
                    onChange={(event) => onUpdate(selected._id, { type: event.target.value })}
                  >
                    <option value="">—</option>
                    {INTERVIEW_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`interview-format-${selected._id}`}>
                    Format
                  </label>
                  <select
                    id={`interview-format-${selected._id}`}
                    className="input"
                    value={selected.format}
                    onChange={(event) => onUpdate(selected._id, { format: event.target.value })}
                  >
                    <option value="">—</option>
                    {INTERVIEW_FORMATS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-slate-800">Interviewers</h4>
                {selected.interviewers.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {selected.interviewers.map((person) => (
                      <li
                        key={person._id}
                        className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium text-slate-800">{person.name}</span>
                          {person.title ? (
                            <span className="text-slate-500"> · {person.title}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          aria-label={`Remove ${person.name}`}
                          onClick={() => onDeleteInterviewer(selected._id, person._id)}
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {interviewerOpen ? (
                  <form onSubmit={handleAddInterviewer} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      className="input"
                      placeholder="Name"
                      value={interviewerName}
                      onChange={(event) => setInterviewerName(event.target.value)}
                      required
                    />
                    <input
                      className="input"
                      placeholder="Title (optional)"
                      value={interviewerTitle}
                      onChange={(event) => setInterviewerTitle(event.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={busy || !interviewerName.trim()}>
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
                    onClick={() => setInterviewerOpen(true)}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Interviewers
                  </button>
                )}
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-slate-800">Conversation history</h4>
                {(selected.conversation ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {(selected.conversation ?? []).map((entry) => (
                      <li
                        key={entry._id}
                        className="flex items-start justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-xs text-slate-400">
                            {entry.speaker || 'Note'}
                            {entry.createdAt ? ` · ${formatDate(entry.createdAt)}` : ''}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{entry.message}</p>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Remove conversation entry"
                          onClick={() => onDeleteConversation(selected._id, entry._id)}
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {conversationOpen ? (
                  <form onSubmit={handleAddConversation} className="mt-3 space-y-2">
                    <select
                      className="input"
                      value={speaker}
                      onChange={(event) => setSpeaker(event.target.value)}
                    >
                      <option value="Me">Me</option>
                      <option value="Interviewer">Interviewer</option>
                    </select>
                    <textarea
                      className="input min-h-[80px]"
                      placeholder="What was said"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary" disabled={busy || !message.trim()}>
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
                    onClick={() => setConversationOpen(true)}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add conversation
                  </button>
                )}
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-slate-800">Feedback</h4>
                {(selected.feedback ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {(selected.feedback ?? []).map((note) => (
                      <li
                        key={note._id}
                        className="flex items-start justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-xs text-slate-400">{formatDate(note.createdAt)}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{note.body}</p>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Remove feedback"
                          onClick={() => onDeleteFeedback(selected._id, note._id)}
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {feedbackOpen ? (
                  <form onSubmit={handleAddFeedback} className="mt-3 space-y-2">
                    <textarea
                      className="input min-h-[80px]"
                      placeholder="What went well, what to improve, what they told you"
                      value={feedbackBody}
                      onChange={(event) => setFeedbackBody(event.target.value)}
                      required
                    />
                    <button type="submit" className="btn-primary" disabled={busy || !feedbackBody.trim()}>
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
                    onClick={() => setFeedbackOpen(true)}
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add feedback
                  </button>
                )}
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-slate-800">Attachments</h4>
                {(selected.attachments ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {(selected.attachments ?? []).map((attachment) => (
                      <li
                        key={attachment._id}
                        className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">{attachment.originalName}</p>
                          <p className="text-xs text-slate-400">{formatDate(attachment.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-brand-700"
                            aria-label={`Download ${attachment.originalName}`}
                            onClick={() =>
                              void downloadInterviewAttachment(
                                jobId,
                                selected._id,
                                attachment._id,
                                attachment.originalName,
                              ).catch((error) =>
                                setAttachmentError(
                                  error instanceof Error ? error.message : 'Could not download that attachment',
                                ),
                              )
                            }
                          >
                            <DownloadIcon />
                          </button>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-red-600"
                            aria-label={`Remove ${attachment.originalName}`}
                            onClick={() => onDeleteAttachment(selected._id, attachment._id)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {attachmentError ? <p className="mt-2 text-sm text-red-600">{attachmentError}</p> : null}
                <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800">
                  <PlusIcon className="h-4 w-4" />
                  {busy ? 'Uploading…' : 'Add attachment'}
                  <input
                    ref={attachmentRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                    className="sr-only"
                    onChange={(event) => void handleAttachment(event.target.files?.[0])}
                  />
                </label>
              </div>

              {practiceOpen ? (
                <form onSubmit={handleAddPractice} className="mt-4 space-y-2">
                  <label className="label" htmlFor={`practice-${selected._id}`}>
                    Practice notes
                  </label>
                  <textarea
                    id={`practice-${selected._id}`}
                    className="input min-h-[80px]"
                    placeholder="Questions to rehearse, stories to tell, things to look up…"
                    value={practiceNotes}
                    onChange={(event) => setPracticeNotes(event.target.value)}
                  />
                  <button type="submit" className="btn-secondary" disabled={busy || !practiceNotes.trim()}>
                    Save session
                  </button>
                </form>
              ) : null}

              {selected.practiceSessions.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {selected.practiceSessions.map((session) => (
                    <li key={session._id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                      <p className="text-xs text-slate-400">{formatDate(session.createdAt)}</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{session.notes}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No interviews yet. Add the first one to track the date, type, and who you meet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
