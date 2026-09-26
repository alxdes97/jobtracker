'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DocumentIcon, DownloadIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/Icons';
import { api, downloadResume } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ResumeFile } from '@/lib/types';

const ACCEPT = '.pdf,.doc,.docx';
const MAX_BYTES = 8 * 1024 * 1024;

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileProblem(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['pdf', 'doc', 'docx'].includes(extension)) {
    return 'Upload a PDF, DOC, or DOCX resume';
  }
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_BYTES) return 'Resume must be 8 MB or smaller';
  return '';
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<ResumeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    api
      .listResumes()
      .then((response) => setResumes(response.resumes))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Could not load resumes'),
      )
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return resumes;
    return resumes.filter((resume) =>
      [resume.name, resume.originalName].some((field) => field.toLowerCase().includes(term)),
    );
  }, [resumes, search]);

  async function uploadFiles(fileList: FileList | File[]) {
    const files = [...fileList];
    if (files.length === 0) return;

    const problem = files.map(fileProblem).find(Boolean);
    if (problem) {
      setError(problem);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setError('');
    setUploading(true);
    try {
      for (const file of files) {
        await api.uploadResume(file);
      }
      setResumes((await api.listResumes()).resumes);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload that resume');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(resume: ResumeFile) {
    const previous = resumes;
    setResumes((current) => current.filter((item) => item._id !== resume._id));
    try {
      await api.deleteResume(resume._id);
    } catch (deleteError) {
      setResumes(previous);
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete that resume');
    }
  }

  async function download(resume: ResumeFile) {
    try {
      await downloadResume(resume._id, resume.originalName);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download that resume');
    }
  }

  return (
    <div
      className="mx-auto max-w-5xl px-6 py-8"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      <h1 className="text-xl font-semibold text-slate-900">Resumes</h1>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <label
          className={`card flex h-36 w-full max-w-[220px] cursor-pointer flex-col items-center justify-center gap-3 text-center transition hover:border-brand-300 ${
            dragging ? 'border-brand-400 bg-brand-50' : ''
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void uploadFiles(event.target.files);
            }}
          />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <PlusIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-700">
              {uploading ? 'Uploading…' : 'Upload resume'}
            </span>
            <span className="mt-0.5 block text-xs text-slate-400">PDF, DOC, or DOCX</span>
          </span>
        </label>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Recent resumes</h2>
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Search resumes</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search resumes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading resumes…</p>
      ) : visible.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <DocumentIcon className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {resumes.length === 0
              ? 'Upload a resume to keep a copy you can download later.'
              : 'No resumes match that search.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {visible.map((resume) => (
            <li key={resume._id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{resume.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {resume.originalName} · {formatBytes(resume.size)}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Uploaded {formatDate(resume.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700"
                    aria-label={`Download ${resume.originalName}`}
                    onClick={() => void download(resume)}
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${resume.name}`}
                    onClick={() => void remove(resume)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
