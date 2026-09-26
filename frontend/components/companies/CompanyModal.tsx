'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import type { Company, Meta } from '@/lib/types';

interface CompanyModalProps {
  open: boolean;
  company?: Company | null;
  meta: Meta | null;
  onClose: () => void;
  onSaved: (company: Company) => void;
}

const emptyForm = {
  name: '',
  industry: '',
  size: '',
  type: '',
  location: '',
  website: '',
  linkedin: '',
  yearFounded: '',
};

export function CompanyModal({ open, company, meta, onClose, onSaved }: CompanyModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      company
        ? {
            name: company.name,
            industry: company.industry,
            size: company.size,
            type: company.type,
            location: company.location,
            website: company.website,
            linkedin: company.linkedin,
            yearFounded: company.yearFounded ? String(company.yearFounded) : '',
          }
        : emptyForm,
    );
    setError('');
  }, [open, company]);

  function update(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        yearFounded: form.yearFounded ? Number(form.yearFounded) : null,
      } as Partial<Company>;
      const response = company
        ? await api.updateCompany(company._id, payload)
        : await api.createCompany(payload);
      onSaved(response.company);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save company');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={company ? 'Edit Company' : 'Add a New Company'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="company-form" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Company'}
          </button>
        </>
      }
    >
      <form id="company-form" onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="company-name">
            Name
          </label>
          <input
            id="company-name"
            className="input"
            placeholder="Name"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="company-industry">
            Industry
          </label>
          <input
            id="company-industry"
            className="input"
            placeholder="Select an industry"
            value={form.industry}
            onChange={(event) => update('industry', event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="company-size">
            Company Size
          </label>
          <select
            id="company-size"
            className="input"
            value={form.size}
            onChange={(event) => update('size', event.target.value)}
          >
            <option value="">Select a company size</option>
            {meta?.companySizes.map((option) => (
              <option key={option} value={option}>
                {option} employees
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="company-type">
            Company Type
          </label>
          <select
            id="company-type"
            className="input"
            value={form.type}
            onChange={(event) => update('type', event.target.value)}
          >
            <option value="">Select a company type</option>
            {meta?.companyTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="company-location">
            Location
          </label>
          <input
            id="company-location"
            className="input"
            placeholder="Location"
            value={form.location}
            onChange={(event) => update('location', event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="company-website">
            Website
          </label>
          <input
            id="company-website"
            className="input"
            placeholder="Website"
            value={form.website}
            onChange={(event) => update('website', event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="company-linkedin">
            LinkedIn
          </label>
          <input
            id="company-linkedin"
            className="input"
            placeholder="LinkedIn Profile"
            value={form.linkedin}
            onChange={(event) => update('linkedin', event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="company-year">
            Year Founded
          </label>
          <input
            id="company-year"
            type="number"
            min="1800"
            max="2100"
            className="input"
            placeholder="Year Founded"
            value={form.yearFounded}
            onChange={(event) => update('yearFounded', event.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
