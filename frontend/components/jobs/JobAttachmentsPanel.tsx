'use client';

import { useRef, useState } from 'react';
import { DownloadIcon, PlusIcon, TrashIcon } from '@/components/Icons';
import { downloadJobAttachment } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { InterviewAttachment } from '@/lib/types';

const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.txt';
const MAX_BYTES = 8 * 1024 * 1024;

interface JobAttachmentsPanelProps {
  jobId: string;
  attachments: InterviewAttachment[];
  onAdd: (file: File) => Promise<void>;
  onDelete: (attachmentId: string) => Promise<void>;
}

function fileProblem(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'txt'].includes(extension)) {
    return 'Upload a PDF, Word document, image, or text file';
  }
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_BYTES) return 'Attachment must be 8 MB or smaller';
  return '';
}

export function JobAttachmentsPanel({
  jobId,
  attachments,
  onAdd,
  onDelete,
}: JobAttachmentsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setError(problem);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onAdd(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not add that attachment');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function download(attachment: InterviewAttachment) {
    try {
      await downloadJobAttachment(jobId, attachment._id, attachment.originalName);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download that attachment');
    }
  }

  return (
    <div className="space-y-4">
      {attachments.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No attachments on this job yet. Add a resume, cover letter, or other file.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment._id}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{attachment.originalName}</p>
                <p className="text-xs text-slate-400">Attached {formatDate(attachment.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="text-slate-400 hover:text-brand-700"
                  aria-label={`Download ${attachment.originalName}`}
                  onClick={() => void download(attachment)}
                >
                  <DownloadIcon />
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${attachment.originalName}`}
                  onClick={() => void onDelete(attachment._id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <label className="btn-primary inline-flex w-full cursor-pointer items-center justify-center gap-1">
        <PlusIcon className="h-4 w-4" />
        {busy ? 'Uploading…' : 'Add attachment'}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}
