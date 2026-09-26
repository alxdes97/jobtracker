'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ContactModal } from '@/components/people/ContactModal';
import {
  ChevronDownIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/Icons';
import { api, downloadExport } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useDismiss } from '@/lib/useDismiss';
import type { Contact, Meta } from '@/lib/types';

type SortKey = 'fullName' | 'companyName' | 'location' | 'goal' | 'status' | 'relationship' | 'followUp';

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'companyName', label: 'Company' },
  { key: 'location', label: 'Location' },
  { key: 'goal', label: 'Goal' },
  { key: 'status', label: 'Status' },
  { key: 'relationship', label: 'Relationship' },
  { key: 'followUp', label: 'Follow up' },
];

const PLACEHOLDERS: Partial<Record<SortKey, string>> = {
  location: 'Add location',
  goal: 'Add Goal',
  status: 'Add Status',
  relationship: 'Add Relationship',
  followUp: 'Add date',
};

export default function PeoplePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'company' | 'status'>('none');
  const [selected, setSelected] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: 'fullName',
    direction: 1,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    Promise.all([api.listContacts(), api.meta()])
      .then(([contactsResponse, metaResponse]) => {
        setContacts(contactsResponse.contacts);
        setMeta(metaResponse);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : 'Could not load contacts'),
      )
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = contacts.filter((contact) =>
      !term
        ? true
        : [contact.fullName, contact.companyName, contact.jobTitle, contact.email]
            .filter(Boolean)
            .some((field) => field.toLowerCase().includes(term)),
    );

    return filtered.sort((a, b) => {
      const left = String(a[sort.key] ?? '').toLowerCase();
      const right = String(b[sort.key] ?? '').toLowerCase();
      if (left === right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return (left > right ? 1 : -1) * sort.direction;
    });
  }, [contacts, search, sort]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', rows }];
    const map = new Map<string, Contact[]>();
    for (const contact of rows) {
      const key = (groupBy === 'company' ? contact.companyName : contact.status) || 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(contact);
    }
    return [...map.entries()].map(([label, groupRows]) => ({ label, rows: groupRows }));
  }, [rows, groupBy]);

  // Filtering can hide rows that are still ticked; acting on them would delete
  // records the user cannot see.
  const activeSelection = useMemo(() => {
    const visible = new Set(rows.map((contact) => contact._id));
    return selected.filter((contactId) => visible.has(contactId));
  }, [rows, selected]);

  async function updateField(contactId: string, field: keyof Contact, value: string) {
    try {
      const response = await api.updateContact(contactId, { [field]: value } as Partial<Contact>);
      setContacts((current) =>
        current.map((contact) => (contact._id === contactId ? response.contact : contact)),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not save the change');
    }
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${activeSelection.length} contact(s)?`)) return;
    try {
      await Promise.all(activeSelection.map((contactId) => api.deleteContact(contactId)));
      setContacts((current) => current.filter((contact) => !activeSelection.includes(contact._id)));
      setSelected([]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete contacts');
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={rows.length > 0 && activeSelection.length === rows.length}
            onChange={(event) =>
              setSelected(event.target.checked ? rows.map((contact) => contact._id) : [])
            }
          />
          {activeSelection.length} selected
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {activeSelection.length > 0 ? (
            <button type="button" className="btn-secondary text-red-600" onClick={deleteSelected}>
              <TrashIcon />
              Delete
            </button>
          ) : null}

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input w-52 pl-8"
              placeholder="Filter Contacts"
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
              <option value="company">Company</option>
              <option value="status">Status</option>
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
                    downloadExport('contacts');
                    setMenuOpen(false);
                  }}
                >
                  <DownloadIcon />
                  Download Data
                </button>
              </div>
            ) : null}
          </div>

          <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
            <PlusIcon />
            Add a New Contact
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-4 py-2" />
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:text-slate-800"
                    onClick={() =>
                      setSort((current) =>
                        current.key === column.key
                          ? { key: column.key, direction: current.direction === 1 ? -1 : 1 }
                          : { key: column.key, direction: 1 },
                      )
                    }
                  >
                    {column.label}
                    <span className="text-[10px] text-slate-400">
                      {sort.key === column.key ? (sort.direction === 1 ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-slate-400">
                  Loading contacts…
                </td>
              </tr>
            ) : null}

            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-slate-400">
                  No contacts yet. Add the recruiters and referrals you are talking to.
                </td>
              </tr>
            ) : null}

            {groups.map((group) => (
              <Fragment key={group.label || 'all'}>
                {group.label ? (
                  <tr className="bg-slate-50">
                    <td
                      colSpan={COLUMNS.length + 1}
                      className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {group.label} ({group.rows.length})
                    </td>
                  </tr>
                ) : null}

                {group.rows.map((contact) => (
                  <tr
                    key={contact._id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(contact._id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, contact._id]
                              : current.filter((contactId) => contactId !== contact._id),
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/people/${contact._id}`}
                        className="font-medium text-slate-800 hover:text-brand-700"
                      >
                        {contact.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{contact.companyName || '—'}</td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full bg-transparent text-slate-600 outline-none placeholder:text-slate-400"
                        placeholder={PLACEHOLDERS.location}
                        defaultValue={contact.location}
                        onBlur={(event) =>
                          event.target.value !== contact.location &&
                          updateField(contact._id, 'location', event.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="w-full bg-transparent text-slate-600 outline-none"
                        value={contact.goal}
                        onChange={(event) => updateField(contact._id, 'goal', event.target.value)}
                      >
                        <option value="">{PLACEHOLDERS.goal}</option>
                        {meta?.contactGoals.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="w-full bg-transparent text-slate-600 outline-none"
                        value={contact.status}
                        onChange={(event) => updateField(contact._id, 'status', event.target.value)}
                      >
                        <option value="">{PLACEHOLDERS.status}</option>
                        {meta?.contactStatuses.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="w-full bg-transparent text-slate-600 outline-none"
                        value={contact.relationship}
                        onChange={(event) =>
                          updateField(contact._id, 'relationship', event.target.value)
                        }
                      >
                        <option value="">{PLACEHOLDERS.relationship}</option>
                        {meta?.contactRelationships.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {formatDate(contact.followUp) || PLACEHOLDERS.followUp}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(contact) => setContacts((current) => [...current, contact])}
      />
    </div>
  );
}
