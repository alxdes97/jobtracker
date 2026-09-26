'use client';

import { PIPELINE_STATUSES, type JobStatus } from '@/lib/types';
import { classNames } from '@/lib/format';

interface StatusStepperProps {
  status: JobStatus;
  onChange: (status: JobStatus) => void;
}

export function StatusStepper({ status, onChange }: StatusStepperProps) {
  const currentIndex = PIPELINE_STATUSES.indexOf(status);

  return (
    <div className="flex items-stretch overflow-x-auto rounded-md border border-slate-200 bg-white">
      {PIPELINE_STATUSES.map((step, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        const isCurrent = step === status;
        return (
          <button
            key={step}
            type="button"
            onClick={() => onChange(step)}
            className={classNames(
              'relative flex-1 whitespace-nowrap px-5 py-2 text-xs font-medium transition',
              reached ? 'bg-brand-200 text-brand-900' : 'bg-white text-slate-500 hover:bg-slate-50',
              isCurrent && 'font-semibold',
              index > 0 && 'border-l border-slate-200',
            )}
          >
            {step === 'Offer Accepted' ? 'Accepted' : step}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange('Closed')}
        className={classNames(
          'whitespace-nowrap border-l border-slate-200 px-5 py-2 text-xs font-medium',
          status === 'Closed'
            ? 'bg-slate-700 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50',
        )}
      >
        Close Job
      </button>
    </div>
  );
}
