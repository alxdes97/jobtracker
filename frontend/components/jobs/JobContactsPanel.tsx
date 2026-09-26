'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon, TrashIcon } from '@/components/Icons';
import { api } from '@/lib/api';
import { useDismiss } from '@/lib/useDismiss';
import type { Contact, JobContact } from '@/lib/types';

interface JobContactsPanelProps {
  contacts: JobContact[];
  onLink: (contactId: string) => Promise<void>;
  onUnlink: (contactId: string) => void;
}

function contactName(contact: { firstName?: string; lastName?: string; fullName?: string }) {
  return contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}

function contactDetail(contact: { jobTitle?: string; companyName?: string; email?: string }) {
  return [contact.jobTitle, contact.companyName].filter(Boolean).join(' — ') || contact.email || '';
}

export function JobContactsPanel({ contacts, onLink, onUnlink }: JobContactsPanelProps) {
  const [all, setAll] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useDismiss(boxRef, open, () => setOpen(false));

  useEffect(() => {
    api
      .listContacts()
      .then((response) => setAll(response.contacts))
      .catch(() => setError('Could not load contacts'));
  }, [contacts.length]);

  const term = query.trim().toLowerCase();

  const options = useMemo(() => {
    const linkedIds = new Set(contacts.map((contact) => contact._id));
    return all.filter((contact) => {
      if (linkedIds.has(contact._id)) return false;
      if (!term) return true;
      return [contact.fullName, contact.companyName, contact.jobTitle, contact.email]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term));
    });
  }, [all, contacts, term]);

  const selected = options.find((contact) => contact._id === selectedId) ?? null;

  async function linkSelected() {
    if (!selected) return;
    setLinking(true);
    setError('');
    try {
      await onLink(selected._id);
      setSelectedId('');
      setQuery('');
      setOpen(false);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Could not link that contact');
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {contacts.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No contacts linked to this job yet.
          </li>
        ) : null}

        {contacts.map((contact) => (
          <li
            key={contact._id}
            className="flex items-start justify-between gap-2 rounded-md border border-slate-200 p-3"
          >
            <div className="min-w-0">
              <Link
                href={`/people/${contact._id}`}
                className="text-sm font-medium text-slate-800 hover:text-brand-700"
              >
                {contactName(contact)}
              </Link>
              <p className="truncate text-xs text-slate-500">{contactDetail(contact)}</p>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onUnlink(contact._id)}
              aria-label={`Unlink ${contactName(contact)}`}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div ref={boxRef} className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search contacts…"
            value={query}
            role="combobox"
            aria-expanded={open}
            aria-controls="contact-search-results"
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
              id="contact-search-results"
              role="listbox"
              className="mt-1 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white py-1"
            >
              {options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">
                  {all.length === 0
                    ? 'No contacts yet.'
                    : term
                      ? 'No contacts match that search.'
                      : 'Every contact is already linked to this job.'}
                </li>
              ) : (
                options.map((contact) => {
                  const active = contact._id === selectedId;
                  return (
                    <li key={contact._id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={`flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50 ${
                          active ? 'bg-brand-50' : ''
                        }`}
                        onClick={() => {
                          setSelectedId(contact._id);
                          setOpen(false);
                        }}
                      >
                        <span className="text-sm font-medium text-slate-800">{contactName(contact)}</span>
                        {contactDetail(contact) ? (
                          <span className="truncate text-xs text-slate-500">{contactDetail(contact)}</span>
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
          <p className="text-xs text-slate-600">
            Selected {contactName(selected)}
            {selected.companyName ? ` — ${selected.companyName}` : ''}
          </p>
        ) : null}

        <button
          type="button"
          className="btn-primary w-full"
          disabled={!selected || linking}
          onClick={() => void linkSelected()}
        >
          {linking ? 'Linking…' : 'Link contact'}
        </button>
        <Link href="/people" className="block text-center text-sm text-brand-700 hover:underline">
          Manage contacts
        </Link>
      </div>
    </div>
  );
}
