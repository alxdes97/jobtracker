'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ContactModal } from '@/components/people/ContactModal';
import { PencilIcon, TrashIcon } from '@/components/Icons';
import { api } from '@/lib/api';
import { toDateInput } from '@/lib/format';
import type { Contact, Meta } from '@/lib/types';

const DATE_FIELDS = [
  { key: 'dateSaved', label: 'Date saved' },
  { key: 'lastContacted', label: 'Last contacted' },
  { key: 'followUp', label: 'Follow up' },
] as const;

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [contactResponse, metaResponse] = await Promise.all([api.getContact(id), api.meta()]);
      setContact(contactResponse.contact);
      setMeta(metaResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load contact');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(data: Partial<Contact>) {
    const response = await api.updateContact(id, data);
    // The list endpoint does not populate related jobs, so keep what we already have.
    setContact((current) =>
      current ? { ...response.contact, relatedJobs: current.relatedJobs } : response.contact,
    );
  }

  async function remove() {
    if (!window.confirm('Delete this contact?')) return;
    await api.deleteContact(id);
    router.push('/people');
  }

  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!contact) return <p className="p-8 text-sm text-slate-500">Loading contact…</p>;

  const relatedJobs = Array.isArray(contact.relatedJobs)
    ? (contact.relatedJobs as Array<{ _id: string; title: string; companyName: string }>).filter(
        (job) => typeof job === 'object',
      )
    : [];

  return (
    <div className="p-4">
      <header className="mb-4 flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500">
          {contact.firstName.charAt(0)}
          {contact.lastName.charAt(0)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{contact.fullName}</h1>
          <p className="text-sm text-slate-600">{contact.jobTitle || contact.companyName}</p>
          <div className="mt-2 flex gap-3 text-sm">
            <button
              type="button"
              className="flex items-center gap-1 text-slate-600 hover:text-brand-700"
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
              Edit
            </button>
            <button
              type="button"
              className="flex items-center gap-1 text-slate-600 hover:text-red-600"
              onClick={remove}
            >
              <TrashIcon />
              Delete
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Networking</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="relationship">
                  Relationship
                </label>
                <select
                  id="relationship"
                  className="input"
                  value={contact.relationship}
                  onChange={(event) => patch({ relationship: event.target.value })}
                >
                  <option value="">Select a relationship</option>
                  {meta?.contactRelationships.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="goal">
                  Goal
                </label>
                <select
                  id="goal"
                  className="input"
                  value={contact.goal}
                  onChange={(event) => patch({ goal: event.target.value })}
                >
                  <option value="">Select a goal</option>
                  {meta?.contactGoals.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  className="input"
                  value={contact.status}
                  onChange={(event) => patch({ status: event.target.value })}
                >
                  <option value="">Select a status</option>
                  {meta?.contactStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Dates</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {DATE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={field.key}>
                    {field.label}
                  </label>
                  <input
                    id={field.key}
                    type="date"
                    className="input"
                    value={toDateInput(contact[field.key])}
                    onChange={(event) => patch({ [field.key]: event.target.value || null })}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Contact Information</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd>
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="text-brand-700 hover:underline">
                      {contact.email}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone Number</dt>
                <dd>{contact.phone || '-'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">LinkedIn</dt>
                <dd className="truncate">
                  {contact.linkedin ? (
                    <a
                      href={contact.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-700 hover:underline"
                    >
                      {contact.linkedin}
                    </a>
                  ) : (
                    '-'
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Location</dt>
                <dd>{contact.location || '-'}</dd>
              </div>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Notes</h2>
            <textarea
              className="input min-h-[120px]"
              defaultValue={contact.notes}
              placeholder="What did you talk about?"
              onBlur={(event) =>
                event.target.value !== contact.notes && patch({ notes: event.target.value })
              }
            />
          </section>
        </div>

        <aside className="card h-fit p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Related Jobs</h2>
          {relatedJobs.length === 0 ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-500">No linked jobs yet</p>
              <Link href="/jobs" className="btn-primary w-full">
                Create a New Job
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {relatedJobs.map((job) => (
                <li key={job._id}>
                  <Link
                    href={`/jobs/${job._id}`}
                    className="block rounded-md border border-slate-200 p-3 hover:border-brand-300"
                  >
                    <p className="text-sm font-medium text-slate-800">{job.title}</p>
                    <p className="text-xs text-slate-500">{job.companyName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <ContactModal
        open={editing}
        contact={contact}
        onClose={() => setEditing(false)}
        onSaved={(updated) =>
          setContact((current) =>
            current ? { ...updated, relatedJobs: current.relatedJobs } : updated,
          )
        }
      />
    </div>
  );
}
