'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import type { Interview, Job } from '@/lib/types';
import { formatDate } from '@/lib/format';

interface InterviewPortalProps {
  jobs: Job[];
  onClose: () => void;
}

function ordinal(index: number) {
  const n = index + 1;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Later interview steps push the title bar from white toward red. */
function titleBarStyle(stepIndex: number, stepCount: number) {
  const progress = stepCount <= 1 ? 0 : stepIndex / (stepCount - 1);
  const red = Math.round(255 - 35 * progress);
  const green = Math.round(255 - 202 * progress);
  const blue = Math.round(255 - 186 * progress);
  return {
    backgroundColor: `rgb(${red}, ${green}, ${blue})`,
    color: progress >= 0.7 ? '#ffffff' : '#0f172a',
  };
}

function interviewSummary(interview: Interview) {
  const parts = [formatDate(interview.date), interview.type, interview.format].filter(Boolean);
  const people = interview.interviewers.map((person) => person.name).filter(Boolean);
  return { parts, people };
}

export function InterviewPortal({ jobs, onClose }: InterviewPortalProps) {
  const { user } = useAuth();
  const interviewing = jobs.filter((job) => job.status === 'Interviewing');
  const furthest = interviewing.reduce(
    (max, job) => Math.max(max, job.interviews?.length ?? 0),
    0,
  );
  const stepCount = Math.max(7, furthest);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Interview Tracker</h2>
          <p className="text-xs text-slate-500">
            {interviewing.length} job{interviewing.length === 1 ? '' : 's'} in Interviewing
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Back to board
        </button>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {Array.from({ length: stepCount }, (_, index) => {
          const cards = interviewing.flatMap((job) => {
            const interview = job.interviews?.[index];
            if (!interview) return [];
            return [{ job, interview }];
          });

          return (
            <section
              key={index}
              className="flex w-[280px] shrink-0 flex-col rounded-lg border border-slate-200 bg-white"
            >
              <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <h3 className="text-sm font-semibold text-slate-800">{ordinal(index)} Interview</h3>
                <span className="text-xs text-slate-400">{cards.length}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {cards.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">No interviews</p>
                ) : (
                  cards.map(({ job, interview }) => {
                    const summary = interviewSummary(interview);
                    return (
                      <article
                        key={interview._id}
                        className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
                      >
                        <Link href={`/jobs/${job._id}`} className="block">
                          <div
                            className="border-b border-black/10 px-3 py-2"
                            style={titleBarStyle(index, stepCount)}
                          >
                            <h4 className="text-sm font-medium">{job.title}</h4>
                            {user?.name ? (
                              <p className="mt-0.5 truncate text-xs opacity-80">{user.name}</p>
                            ) : null}
                          </div>
                        </Link>
                        <div className="space-y-1 px-3 py-2 text-xs text-slate-600">
                          <p className="text-slate-500">
                            {job.companyName}
                            {job.location ? ` · ${job.location}` : ''}
                          </p>
                          <p>{summary.parts.length > 0 ? summary.parts.join(' · ') : 'Details not set'}</p>
                          {summary.people.length > 0 ? <p>{summary.people.join(', ')}</p> : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
