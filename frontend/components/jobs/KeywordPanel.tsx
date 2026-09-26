'use client';

import type { KeywordSection } from '@/lib/types';

interface KeywordPanelProps {
  sections: KeywordSection[];
  total: number;
}

export function KeywordPanel({ sections, total }: KeywordPanelProps) {
  if (total === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        Paste a job description to pull out the keywords this posting emphasises.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-brand-700 px-4 py-3 text-sm text-white">
        <p className="font-medium">{total} keywords found in this posting</p>
        <p className="mt-0.5 text-xs text-brand-100">
          Mirror the ones that match your experience in your resume and cover letter.
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.key}>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">{section.label}</h4>
          <div className="flex flex-wrap gap-1.5">
            {section.keywords.map((keyword) => (
              <span key={keyword.term} className="chip">
                {keyword.label}
                <span className="text-brand-500">{keyword.count}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
