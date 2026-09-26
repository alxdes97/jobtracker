'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanyModal } from '@/components/companies/CompanyModal';
import {
  BuildingIcon,
  ChevronDownIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/Icons';
import { api, downloadExport } from '@/lib/api';
import { useDismiss } from '@/lib/useDismiss';
import type { Company, Meta } from '@/lib/types';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'industry', label: 'Industry' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Location' },
  { key: 'jobCount', label: 'Jobs' },
  { key: 'contactCount', label: 'Contacts' },
] as const;

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'industry'>('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    Promise.all([api.listCompanies(), api.meta()])
      .then(([companiesResponse, metaResponse]) => {
        setCompanies(companiesResponse.companies);
        setMeta(metaResponse);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Could not load companies'),
      )
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = companies.filter((company) =>
      !term
        ? true
        : [company.name, company.industry, company.location]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(term)),
    );
    if (groupBy === 'none') return filtered;
    return [...filtered].sort((a, b) => (a.industry || 'zzz').localeCompare(b.industry || 'zzz'));
  }, [companies, search, groupBy]);

  async function remove(company: Company) {
    if (!window.confirm(`Delete ${company.name}?`)) return;
    try {
      await api.deleteCompany(company._id);
      setCompanies((current) => current.filter((item) => item._id !== company._id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the company');
    }
  }

  function upsert(company: Company) {
    setCompanies((current) => {
      const exists = current.some((item) => item._id === company._id);
      return exists
        ? current.map((item) => (item._id === company._id ? { ...item, ...company } : item))
        : [...current, company];
    });
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input w-52 pl-8"
            placeholder="Filter Companies"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <label className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600">
          Group by:
          <select
            className="bg-transparent outline-none"
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
          >
            <option value="none">None</option>
            <option value="industry">Industry</option>
          </select>
        </label>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setMenuOpen((current) => !current)}
          >
            Menu
            <ChevronDownIcon />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  downloadExport('companies');
                  setMenuOpen(false);
                }}
              >
                <DownloadIcon />
                Download Data
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <PlusIcon />
          Add a Company
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-500">Loading companies…</p>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <BuildingIcon className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">No companies in your tracker yet</h2>
          <p className="max-w-md text-sm text-slate-500">
            Companies are added automatically when you save a job or a contact, and you can add the
            ones you are researching here.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <PlusIcon />
            Add a Company
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {COLUMNS.map((column) => (
                  <th key={column.key} className="px-4 py-2">
                    {column.label}
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <tr
                  key={company._id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-800">{company.name}</p>
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-700 hover:underline"
                      >
                        {company.website}
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{company.industry || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{company.size || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{company.type || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{company.location || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{company.jobCount}</td>
                  <td className="px-4 py-2 text-slate-600">{company.contactCount}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-slate-400 hover:text-brand-700"
                        onClick={() => {
                          setEditing(company);
                          setModalOpen(true);
                        }}
                        aria-label={`Edit ${company.name}`}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => remove(company)}
                        aria-label={`Delete ${company.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompanyModal
        open={modalOpen}
        company={editing}
        meta={meta}
        onClose={() => setModalOpen(false)}
        onSaved={upsert}
      />
    </div>
  );
}
