import type { Job, ResumeFile } from './types';

export function profileNameOf(resume: Pick<ResumeFile, 'name'>) {
  return resume.name.trim();
}

export function jobProfileNames(job: Pick<Job, 'resumes'>, resumes: ResumeFile[]) {
  const byId = new Map(resumes.map((resume) => [resume._id, profileNameOf(resume)]));
  const names = (job.resumes ?? [])
    .map((resume) => (resume.libraryResume ? byId.get(resume.libraryResume) : ''))
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

export function jobsForProfile(jobs: Job[], resumes: ResumeFile[], profile: string) {
  const resumeIds = new Set(
    resumes.filter((resume) => profileNameOf(resume) === profile).map((resume) => resume._id),
  );
  return jobs.filter((job) =>
    (job.resumes ?? []).some((resume) => resume.libraryResume && resumeIds.has(resume.libraryResume)),
  );
}
