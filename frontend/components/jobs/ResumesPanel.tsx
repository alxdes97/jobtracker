'use client';

import { useState } from 'react';
import { PaperclipIcon, TrashIcon } from '@/components/Icons';
import { formatDate } from '@/lib/format';
import type { JobResume } from '@/lib/types';

interface ResumesPanelProps {
  resumes: JobResume[];
  onAdd: (data: { name: string; url: string; isTailored: boolean }) => Promise<void>;
  onDelete: (resumeId: string) => void;
}

export function ResumesPanel({ resumes, onAdd, onDelete }: ResumesPanelProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [isTailored, setIsTailored] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), url: url.trim(), isTailored });
      setName('');
      setUrl('');
      setIsTailored(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {resumes.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Track which resume version you sent for this role.
          </li>
        ) : null}

        {resumes.map((resume) => (
          <li
            key={resume._id}
            className="flex items-start justify-between gap-2 rounded-md border border-slate-200 p-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <PaperclipIcon className="h-4 w-4 text-slate-400" />
                {resume.url ? (
                  <a
                    href={resume.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-brand-700 hover:underline"
                  >
                    {resume.name}
                  </a>
                ) : (
                  <span className="truncate">{resume.name}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {resume.isTailored ? 'Tailored · ' : ''}
                Attached {formatDate(resume.attachedAt)}
              </p>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onDelete(resume._id)}
              aria-label={`Remove ${resume.name}`}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-slate-200 pt-4">
        <input
          className="input"
          placeholder="Resume name (e.g. AI Engineer v3)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="input"
          placeholder="Link to the file (Drive, Dropbox, …)"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isTailored}
            onChange={(event) => setIsTailored(event.target.checked)}
          />
          Tailored to this posting
        </label>
        <button type="submit" className="btn-primary w-full" disabled={saving || !name.trim()}>
          {saving ? 'Attaching…' : 'Attach resume'}
        </button>
      </form>
    </div>
  );
}
