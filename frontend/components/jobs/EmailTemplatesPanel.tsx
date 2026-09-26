'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { EmailTemplate, Job } from '@/lib/types';

interface EmailTemplatesPanelProps {
  job: Job;
  userName: string;
}

/** Replaces the `{{placeholder}}` tokens a template can contain. */
function fillTemplate(text: string, job: Job, userName: string) {
  const contact = job.contacts[0];
  const values: Record<string, string> = {
    jobTitle: job.title,
    companyName: job.companyName,
    location: job.location,
    dateApplied: formatDate(job.dateApplied) || 'recently',
    contactFirstName: contact?.firstName || 'there',
    myName: userName,
  };
  return text.replace(/{{\s*(\w+)\s*}}/g, (match, key: string) => values[key] ?? match);
}

export function EmailTemplatesPanel({ job, userName }: EmailTemplatesPanelProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeId, setActiveId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .listTemplates()
      .then((response) => {
        setTemplates(response.templates);
        setActiveId((current) => current || response.templates[0]?._id || '');
      })
      .catch(() => setTemplates([]));
  }, []);

  const active = templates.find((template) => template._id === activeId);
  const filled = useMemo(
    () =>
      active
        ? {
            subject: fillTemplate(active.subject, job, userName),
            body: fillTemplate(active.body, job, userName),
          }
        : null,
    [active, job, userName],
  );

  async function copy() {
    if (!filled) return;
    await navigator.clipboard.writeText(`Subject: ${filled.subject}\n\n${filled.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <select
        className="input"
        value={activeId}
        onChange={(event) => setActiveId(event.target.value)}
      >
        {templates.map((template) => (
          <option key={template._id} value={template._id}>
            {template.category} — {template.name}
          </option>
        ))}
      </select>

      {filled ? (
        <>
          <div>
            <p className="label">Subject</p>
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {filled.subject}
            </p>
          </div>
          <div>
            <p className="label">Body</p>
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-sans text-slate-700">
              {filled.body}
            </pre>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={copy}>
              {copied ? 'Copied' : 'Copy email'}
            </button>
            {job.contacts[0]?.email ? (
              <a
                className="btn-secondary"
                href={`mailto:${job.contacts[0].email}?subject=${encodeURIComponent(
                  filled.subject,
                )}&body=${encodeURIComponent(filled.body)}`}
              >
                Open in mail
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">No templates yet.</p>
      )}
    </div>
  );
}
