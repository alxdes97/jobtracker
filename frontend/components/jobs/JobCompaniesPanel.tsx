'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon, TrashIcon } from '@/components/Icons';
import { api } from '@/lib/api';
import { useDismiss } from '@/lib/useDismiss';
import type { Company } from '@/lib/types';

interface JobCompaniesPanelProps {
  companyId: string | null;
  companyName: string;
  onConnect: (companyId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

function companyDetail(company: Pick<Company, 'industry' | 'location' | 'type'>) {
  return [company.industry, company.type, company.location].filter(Boolean).join(' — ');
}

export function JobCompaniesPanel({
  companyId,
  companyName,
  onConnect,
  onDisconnect,
}: JobCompaniesPanelProps) {
  const [all, setAll] = useState<Company[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useDismiss(boxRef, open, () => setOpen(false));

  useEffect(() => {
    api
      .listCompanies()
      .then((response) => setAll(response.companies))
      .catch(() => setError('Could not load companies'));
  }, [companyId]);

  const connected = all.find((company) => company._id === companyId) ?? null;
  const term = query.trim().toLowerCase();

  const options = useMemo(() => {
    return all.filter((company) => {
      if (company._id === companyId) return false;
      if (!term) return true;
      return [company.name, company.industry, company.location, company.type]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [all, companyId, term]);

  const selected = options.find((company) => company._id === selectedId) ?? null;

  async function connectSelected() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await onConnect(selected._id);
      setSelectedId('');
      setQuery('');
      setOpen(false);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Could not connect that company');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await onDisconnect();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Could not disconnect that company');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {companyId ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-slate-200 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{connected?.name || companyName}</p>
            {connected && companyDetail(connected) ? (
              <p className="truncate text-xs text-slate-500">{companyDetail(connected)}</p>
            ) : null}
            {connected?.website ? (
              <a
                href={connected.website}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-brand-700 hover:underline"
              >
                {connected.website}
              </a>
            ) : null}
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-red-600 disabled:opacity-50"
            onClick={() => void disconnect()}
            disabled={busy}
            aria-label={`Disconnect ${connected?.name || companyName}`}
          >
            <TrashIcon />
          </button>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No company connected to this job yet.
        </p>
      )}

      <div className="space-y-2 border-t border-slate-200 pt-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div ref={boxRef} className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search companies…"
            value={query}
            role="combobox"
            aria-expanded={open}
            aria-controls="company-search-results"
            aria-autocomplete="list"
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId('');
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />

          {open ? (
            <ul
              id="company-search-results"
              role="listbox"
              className="mt-1 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white py-1"
            >
              {options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  {all.length === 0
                    ? 'No companies yet.'
                    : term
                      ? 'No companies match that search.'
                      : 'Every company is already connected to this job.'}
                </li>
              ) : (
                options.map((company) => {
                  const active = company._id === selectedId;
                  return (
                    <li key={company._id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={`flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 ${
                          active ? 'bg-brand-50' : ''
                        }`}
                        onClick={() => {
                          setSelectedId(company._id);
                          setOpen(false);
                        }}
                      >
                        <span className="text-sm font-medium text-slate-800">{company.name}</span>
                        {companyDetail(company) ? (
                          <span className="truncate text-xs text-slate-500">{companyDetail(company)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>

        {selected ? (
          <p className="text-xs text-slate-600">Selected {selected.name}</p>
        ) : null}

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!selected || busy}
          onClick={() => void connectSelected()}
        >
          {busy && selected ? 'Connecting…' : 'Connect company'}
        </button>
        <Link href="/companies" className="block text-center text-sm text-brand-700 hover:underline">
          Manage companies
        </Link>
      </div>
    </div>
  );
}
