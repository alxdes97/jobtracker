/** How far ahead AutoKey asks about, and how often each window repeats. */
export const HORIZON_MS = 60 * 60 * 1000;

export function remindEveryMinutes(remainingMs) {
  if (remainingMs <= 15 * 60 * 1000) return 5;
  if (remainingMs <= 30 * 60 * 1000) return 10;
  return 15;
}

export function remainingLabel(remainingMs) {
  const minutes = Math.floor(remainingMs / 60000);
  if (minutes <= 0) return 'less than 1 minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function interviewStepLabel(step) {
  const number = Number.isInteger(step) && step > 0 ? step : 1;
  let suffix = 'th';
  const mod100 = number % 100;
  if (mod100 < 11 || mod100 > 13) {
    const last = number % 10;
    if (last === 1) suffix = 'st';
    else if (last === 2) suffix = 'nd';
    else if (last === 3) suffix = 'rd';
  }
  return `${number}${suffix} interview`;
}

export function isReminderDue(lastNotifiedAt, everyMinutes, now) {
  if (!lastNotifiedAt) return true;
  const elapsed = now.getTime() - new Date(lastNotifiedAt).getTime();
  return elapsed >= everyMinutes * 60 * 1000;
}

export function describeReminder({ job, interview, step, start }, now, lastNotifiedAt) {
  const remainingMs = start.getTime() - now.getTime();
  const every = remindEveryMinutes(remainingMs);
  const names = (interview.interviewers || [])
    .map((person) => String(person?.name || '').trim())
    .filter(Boolean);
  return {
    interviewId: String(interview._id),
    jobId: String(job._id),
    jobTitle: job.title || '',
    companyName: job.companyName || '',
    step,
    stepLabel: interviewStepLabel(step),
    interviewer: names.join(', ') || 'Not set',
    startsAt: start.toISOString(),
    remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000)),
    remainingLabel: remainingLabel(remainingMs),
    remindEveryMinutes: every,
    due: isReminderDue(lastNotifiedAt, every, now),
  };
}
