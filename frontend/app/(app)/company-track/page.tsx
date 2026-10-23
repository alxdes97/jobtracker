'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrashIcon } from '@/components/Icons';
import { api, tokenStore } from '@/lib/api';
import { classNames, formatDate, timeAgo } from '@/lib/format';
import type { CompanyTrack } from '@/lib/types';

type SortKey = 'name' | 'domain' | 'url' | 'trackedAt' | 'lastTrackedAt' | 'lastViewedAt' | 'note';

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'name', label: 'Company', className: 'min-w-[180px]' },
  { key: 'domain', label: 'Domain' },
  { key: 'url', label: 'Tracking page', className: 'min-w-[220px]' },
  { key: 'trackedAt', label: 'Track started' },
  { key: 'lastTrackedAt', label: 'Last tracked' },
  { key: 'lastViewedAt', label: 'Last viewed' },
  { key: 'note', label: 'Note', className: 'min-w-[200px]' },
];

function logoDomain(track: CompanyTrack) {
  if (track.domain) return track.domain;
  try {
    return new URL(track.website || track.url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function CompanyLogo({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const src = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
    : '';

  if (!src || failed) {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600"
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded-md bg-white object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function viewedLabel(value?: string | null) {
  if (!value) return 'Last viewed: Not yet';
  const when = formatDate(value);
  const ago = timeAgo(value);
  return `Last viewed: ${when}${ago ? ` · ${ago}` : ''}`;
}

function TrackNote({
  track,
  onSaved,
}: {
  track: CompanyTrack;
  onSaved: (track: CompanyTrack) => void;
}) {
  const [note, setNote] = useState(track.note || '');
  const [savedNote, setSavedNote] = useState(track.note || '');
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    if (document.activeElement?.id === `note-${track._id}`) return;
    setNote(track.note || '');
    setSavedNote(track.note || '');
  }, [track._id, track.note]);

  async function save(next: string) {
    if (next === savedNote) return;
    setSaving(true);
    setNoteError('');
    try {
      const response = await api.updateCompanyTrack(track._id, { note: next });
      setSavedNote(response.track.note || '');
      setNote(response.track.note || '');
      onSaved(response.track);
    } catch (saveError) {
      setNoteError(saveError instanceof Error ? saveError.message : 'Could not save that note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <input
        id={`note-${track._id}`}
        className="input"
        aria-label={`Note for ${track.name}`}
        placeholder="Add a note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={(event) => {
          const next = event.currentTarget.value;
          setNote(next);
          void save(next);
        }}
      />
      {saving ? <p className="mt-1 text-xs text-slate-400">Saving…</p> : null}
      {noteError ? <p className="mt-1 text-xs text-red-600">{noteError}</p> : null}
    </div>
  );
}

function newestCommit(track: CompanyTrack) {
  const commits = track.commits || [];
  return [...commits].sort(
    (left, right) => new Date(right.trackedAt).getTime() - new Date(left.trackedAt).getTime(),
  )[0];
}

export default function CompanyTrackPage() {
  const [tracks, setTracks] = useState<CompanyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewing, setViewing] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: 'lastTrackedAt',
    direction: -1,
  });

  useEffect(() => {
    api
      .listCompanyTracks()
      .then((response) => setTracks(response.tracks))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Could not load tracked companies'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function copyToken() {
    const token = tokenStore.get();
    if (!token) {
      setError('Sign in again, then copy the token.');
      return;
    }
    await navigator.clipboard.writeText(token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function removeMany(ids: string[]) {
    const previous = tracks;
    setTracks((current) => current.filter((item) => !ids.includes(item._id)));
    setSelectedIds([]);
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    try {
      await Promise.all(ids.map((id) => api.deleteCompanyTrack(id)));
    } catch (deleteError) {
      setTracks(previous);
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove that company');
    }
  }

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 1 ? -1 : 1 }
        : { key, direction: 1 },
    );
  }

  const rows = useMemo(() => {
    const value = (track: CompanyTrack, key: SortKey): string | number => {
      if (key === 'lastViewedAt') {
        const viewed = newestCommit(track)?.lastViewedAt;
        return viewed ? new Date(viewed).getTime() : '';
      }
      if (key === 'trackedAt' || key === 'lastTrackedAt') {
        const raw = track[key];
        return raw ? new Date(raw).getTime() : '';
      }
      return String(track[key] || '').toLowerCase();
    };

    return [...tracks].sort((left, right) => {
      const a = value(left, sort.key);
      const b = value(right, sort.key);
      if (a === b) return 0;
      if (a === '') return 1;
      if (b === '') return -1;
      return (a > b ? 1 : -1) * sort.direction;
    });
  }, [tracks, sort]);

  const activeSelection = selectedIds.filter((id) => rows.some((track) => track._id === id));
  const allSelected = rows.length > 0 && activeSelection.length === rows.length;

  async function openCommit(track: CompanyTrack) {
    setSelectedId(track._id);
    setViewing(true);
    try {
      const response = await api.viewCompanyTrackCommits(track._id);
      setTracks((current) =>
        current.map((item) => (item._id === track._id ? response.track : item)),
      );
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : 'Could not open that commit');
    } finally {
      setViewing(false);
    }
  }

  const selected = tracks.find((track) => track._id === selectedId) || null;
  const selectedCommits = selected
    ? [...(selected.commits || [])].sort(
        (left, right) => new Date(right.trackedAt).getTime() - new Date(left.trackedAt).getTime(),
      )
    : [];

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Company Track</h1>
          <p className="mt-1 text-sm text-slate-500">
            Career pages saved from the extension. Tracking again compares open roles with the last visit.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => void copyToken()}>
          {copied ? 'Token copied' : 'Copy extension token'}
        </button>
      </div>

      <section className="card mt-4 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Install the Chrome extension</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Open Chrome and go to chrome://extensions.</li>
          <li>Turn on Developer mode.</li>
          <li>
            Choose Load unpacked and select the <span className="font-medium">ex</span> folder in this
            Job Tracker project.
          </li>
          <li>Open the extension and sign in. The demo email and password are already filled in.</li>
          <li>On a company website, open the extension and choose Track this company.</li>
        </ol>
      </section>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) =>
                setSelectedIds(event.target.checked ? rows.map((track) => track._id) : [])
              }
            />
            {activeSelection.length} selected
          </label>
          {activeSelection.length > 0 ? (
            <button
              type="button"
              className="btn-secondary text-red-600"
              onClick={() => void removeMany(activeSelection)}
            >
              <TrashIcon />
              Delete
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-4 py-2" />
                {COLUMNS.map((column) => (
                  <th key={column.key} className={classNames('px-4 py-2', column.className)}>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-slate-800"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      <span className="text-[10px] text-slate-400">
                        {sort.key === column.key ? (sort.direction === 1 ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2">New commit</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-4 py-10 text-center text-slate-400">
                    Loading tracked companies…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-4 py-10 text-center text-slate-400">
                    No companies yet.
                  </td>
                </tr>
              ) : null}
              {!loading
                ? rows.map((track) => (
                    <tr
                      key={track._id}
                      className={classNames(
                        'border-b border-slate-100 last:border-0 hover:bg-slate-50',
                        selectedId === track._id && 'bg-brand-50',
                      )}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={activeSelection.includes(track._id)}
                          aria-label={`Select ${track.name}`}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, track._id]
                                : current.filter((id) => id !== track._id),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <CompanyLogo name={track.name} domain={track.domain || logoDomain(track)} />
                          <span className="font-medium text-slate-800">{track.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{track.domain || '—'}</td>
                      <td className="max-w-[240px] truncate px-4 py-2">
                        {track.url ? (
                          <a
                            href={track.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-700 hover:underline"
                          >
                            {track.url}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{formatDate(track.trackedAt) || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {formatDate(track.lastTrackedAt || track.trackedAt) || '—'}
                        {track.lastTrackedAt ? ` · ${timeAgo(track.lastTrackedAt)}` : ''}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {newestCommit(track)?.lastViewedAt
                          ? viewedLabel(newestCommit(track)?.lastViewedAt).replace('Last viewed: ', '')
                          : 'Not yet'}
                      </td>
                      <td className="px-4 py-2">
                        <TrackNote
                          track={track}
                          onSaved={(updated) =>
                            setTracks((current) =>
                              current.map((item) => (item._id === updated._id ? updated : item)),
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        {track.commits?.length ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => void openCommit(track)}
                          >
                            New commit
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      <aside className="card h-fit p-4 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-slate-800">New commit</h2>
        {!selected ? (
          <p className="mt-3 text-sm text-slate-500">
            Choose New commit on a company to see the roles that appeared.
          </p>
        ) : (
          <div className="mt-3">
            <p className="font-medium text-slate-900">{selected.name}</p>
            {viewing ? <p className="mt-2 text-xs text-slate-400">Updating last viewed…</p> : null}
            <div className="mt-4 space-y-4">
              {selectedCommits.map((commit) => (
                <section key={commit._id} className="border-t border-slate-100 pt-3">
                  <p className="text-sm font-medium text-slate-800">New commit</p>
                  <p className="mt-1 text-xs text-slate-500">{viewedLabel(commit.lastViewedAt)}</p>
                  {commit.trackedAt ? (
                    <p className="mt-1 text-xs text-slate-400">Tracked {formatDate(commit.trackedAt)}</p>
                  ) : null}
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {commit.roles.map((role) => (
                      <li key={role}>{role}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
