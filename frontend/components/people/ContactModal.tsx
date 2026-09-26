'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import type { Contact } from '@/lib/types';

interface ContactModalProps {
  open: boolean;
  contact?: Contact | null;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}

const FIELDS = [
  { key: 'firstName', label: 'First Name', placeholder: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', placeholder: 'Last Name' },
  { key: 'jobTitle', label: 'Job Title', placeholder: 'Job Title' },
  { key: 'companyName', label: 'Company Name', placeholder: 'Company Name' },
  { key: 'email', label: 'Email', placeholder: 'Email Address', type: 'email' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'LinkedIn Profile' },
  { key: 'twitter', label: 'Twitter', placeholder: 'Twitter Handle URL' },
  { key: 'location', label: 'Location', placeholder: 'Location' },
  { key: 'phone', label: 'Phone Number', placeholder: 'Phone Number' },
] as const;

type FormState = Record<(typeof FIELDS)[number]['key'], string>;

const emptyForm = Object.fromEntries(FIELDS.map((field) => [field.key, ''])) as FormState;

export function ContactModal({ open, contact, onClose, onSaved }: ContactModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      contact
        ? (Object.fromEntries(
            FIELDS.map((field) => [field.key, (contact[field.key] as string) || '']),
          ) as FormState)
        : emptyForm,
    );
    setError('');
  }, [open, contact]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = contact
        ? await api.updateContact(contact._id, form)
        : await api.createContact(form);
      onSaved(response.contact);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save contact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={contact ? 'Edit Contact' : 'Add a New Contact'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="contact-form" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Contact'}
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={handleSubmit} className="space-y-3">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="label" htmlFor={`contact-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`contact-${field.key}`}
              className="input"
              type={'type' in field ? field.type : 'text'}
              placeholder={field.placeholder}
              required={'required' in field ? field.required : false}
              value={form[field.key]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
