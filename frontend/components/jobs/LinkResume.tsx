'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DownloadIcon, SearchIcon, TrashIcon } from '@/components/Icons';
import { api, downloadResume } from '@/lib/api';
import { useDismiss } from '@/lib/useDismiss';
import type { JobResume, ResumeFile } from '@/lib/types';

interface LinkResumeProps {
  resumes: JobResume[];
  onLink: (resumeId: string) => Promise<void>;
  onUnlink: (resumeId: string) => Promise<void>;
  showLinked?: boolean;
}

export function LinkResume({ resumes, onLink, onUnlink, showLinked = true }: LinkResumeProps) {
  const [library, setLibrary] = useState<ResumeFile[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [tailored, setTailored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useDismiss(boxRef, open, () => setOpen(false));

  useEffect(() => {
    api
      .listResumes()
      .then((response) => setLibrary(response.resumes))
      .catch(() => setError('Could not load resumes'));
  }, [resumes]);

  const linkedIds = useMemo(
    () => new Set(resumes.map((resume) => resume.libraryResume).filter(Boolean)),
    [resumes],
  );
  const term = query.trim().toLowerCase();
  const options = library.filter((resume) => {
    if (linkedIds.has(resume._id)) return false;
    if (!term) return true;
    return [resume.name, resume.originalName].some((field) => field.toLowerCase().includes(term));
  });
  const selected = options.find((resume) => resume._id === selectedId) ?? null;

  async function linkSelected() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await onLink(selected._id);
      setSelectedId('');
      setQuery('');
      setTailored(false);
      setOpen(false);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Could not link that resume');
    } finally {
      setBusy(false);
    }
  }

  async function download(resume: JobResume) {
    if (!resume.libraryResume) return;
    try {
      await downloadResume(resume.libraryResume, resume.originalName || `${resume.name}.pdf`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download that resume');
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showLinked && resumes.filter((resume) => resume.libraryResume).length > 0 ? (
        <ul className="space-y-2">
          {resumes
            .filter((resume) => resume.libraryResume)
            .map((resume) => (
              <li
                key={resume._id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{resume.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {resume.isTailored ? 'Tailored · ' : ''}
                    {resume.originalName || 'From your resumes'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700"
                    aria-label={`Download ${resume.name}`}
                    onClick={() => void download(resume)}
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Unlink ${resume.name}`}
                    onClick={() => void onUnlink(resume._id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      ) : null}

      <div ref={boxRef} className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search your resumes…"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls="resume-link-results"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open ? (
          <ul
            id="resume-link-results"
            className="mt-1 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white py-1"
          >
            {library.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">
                No resumes yet.{' '}
                <Link href="/resumes" className="text-brand-700 hover:underline">
                  Upload one
                </Link>
              </li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">
                {term ? 'No resumes match that search.' : 'Every resume is already linked to this job.'}
              </li>
            ) : (
              options.map((resume) => (
                <li key={resume._id}>
                  <button
                    type="button"
                    className={`flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 ${
                      resume._id === selectedId ? 'bg-brand-50' : ''
                    }`}
                    onClick={() => {
                      setSelectedId(resume._id);
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm font-medium text-slate-800">{resume.name}</span>
                    <span className="truncate text-xs text-slate-500">{resume.originalName}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {selected ? <p className="text-xs text-slate-600">Selected {selected.name}</p> : null}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={tailored}
          onChange={(event) => setTailored(event.target.checked)}
        />
        Tailored to this job
      </label>
      <button
        type="button"
        className="btn-primary w-full"
        disabled={!selected || busy}
        onClick={() => void linkSelected()}
      >
        {busy ? 'Linking…' : 'Link resume'}
      </button>
    </div>
  );
}
