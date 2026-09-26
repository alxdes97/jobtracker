'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TrashIcon } from '@/components/Icons';
import { api } from '@/lib/api';
import type { Contact, JobContact } from '@/lib/types';

interface JobContactsPanelProps {
  contacts: JobContact[];
  onLink: (contactId: string) => Promise<void>;
  onUnlink: (contactId: string) => void;
}

export function JobContactsPanel({ contacts, onLink, onUnlink }: JobContactsPanelProps) {
  const [all, setAll] = useState<Contact[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    api
      .listContacts()
      .then((response) => setAll(response.contacts))
      .catch(() => setAll([]));
  }, [contacts.length]);

  const linkedIds = new Set(contacts.map((contact) => contact._id));
  const options = all.filter((contact) => !linkedIds.has(contact._id));

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
                {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
              </Link>
              <p className="truncate text-xs text-slate-500">
                {contact.jobTitle || contact.companyName || contact.email}
              </p>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onUnlink(contact._id)}
              aria-label="Unlink contact"
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        <select
          className="input"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Link an existing contact…</option>
          {options.map((contact) => (
            <option key={contact._id} value={contact._id}>
              {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
              {contact.companyName ? ` — ${contact.companyName}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!selected}
          onClick={async () => {
            await onLink(selected);
            setSelected('');
          }}
        >
          Link contact
        </button>
        <Link href="/people" className="block text-center text-sm text-brand-700 hover:underline">
          Manage contacts
        </Link>
      </div>
    </div>
  );
}
