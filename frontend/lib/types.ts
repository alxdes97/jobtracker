export const JOB_STATUSES = [
  'Bookmarked',
  'Applying',
  'Applied',
  'Interviewing',
  'Negotiating',
  'Offer Accepted',
  'Closed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses rendered as kanban columns; "Closed" is reachable from a job page. */
export const PIPELINE_STATUSES: JobStatus[] = JOB_STATUSES.filter((status) => status !== 'Closed');

export interface User {
  _id: string;
  name: string;
  email: string;
}

export interface NoteItem {
  _id: string;
  body: string;
  createdAt: string;
}

export interface ChecklistItem {
  _id: string;
  label: string;
  stage: JobStatus;
  done: boolean;
}

export const INTERVIEW_TYPES = [
  'Phone Screen',
  'Recruiter',
  'Hiring Manager',
  'Technical',
  'Behavioral',
  'Panel',
  'Final',
  'Other',
] as const;

export const INTERVIEW_FORMATS = ['Phone', 'Video', 'In Person', 'Hybrid'] as const;

export interface Interviewer {
  _id: string;
  name: string;
  title: string;
}

export interface ConversationEntry {
  _id: string;
  speaker: string;
  message: string;
  createdAt: string;
}

export interface FeedbackNote {
  _id: string;
  body: string;
  createdAt: string;
}

export interface PracticeSession {
  _id: string;
  notes: string;
  createdAt: string;
}

export interface InterviewAttachment {
  _id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface Interview {
  _id: string;
  date: string | null;
  type: string;
  format: string;
  interviewers: Interviewer[];
  conversation: ConversationEntry[];
  feedback: FeedbackNote[];
  attachments: InterviewAttachment[];
  practiceSessions: PracticeSession[];
}

export interface JobResume {
  _id: string;
  name: string;
  originalName?: string;
  url: string;
  isTailored: boolean;
  libraryResume?: string | null;
  attachedAt: string;
}

export interface Keyword {
  term: string;
  label: string;
  count: number;
}

export interface KeywordSection {
  key: string;
  label: string;
  keywords: Keyword[];
}

export interface JobContact {
  _id: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  companyName?: string;
  linkedin?: string;
}

export interface Job {
  _id: string;
  title: string;
  companyName: string;
  company: string | null;
  location: string;
  url: string;
  description: string;
  status: JobStatus;
  order: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  excitement: number;
  dateSaved: string;
  dateApplied: string | null;
  deadline: string | null;
  followUp: string | null;
  notes: string;
  noteItems: NoteItem[];
  checklist: ChecklistItem[];
  interviews: Interview[];
  resumes: JobResume[];
  contacts: JobContact[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  keywords: { sections: KeywordSection[]; total: number };
  guidance: { stage: JobStatus; total: number; completed: number; percent: number };
}

export interface Contact {
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  companyName: string;
  company: string | null;
  email: string;
  linkedin: string;
  twitter: string;
  location: string;
  phone: string;
  relationship: string;
  goal: string;
  status: string;
  dateSaved: string;
  lastContacted: string | null;
  followUp: string | null;
  notes: string;
  relatedJobs: Array<{ _id: string; title: string; companyName: string; status: JobStatus }> | string[];
}

export interface Company {
  _id: string;
  name: string;
  industry: string;
  size: string;
  type: string;
  location: string;
  website: string;
  linkedin: string;
  yearFounded: number | null;
  notes: string;
  jobCount: number;
  contactCount: number;
}

export interface ResumeFile {
  _id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplate {
  _id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

export interface Meta {
  jobStatuses: JobStatus[];
  contactRelationships: string[];
  contactGoals: string[];
  contactStatuses: string[];
  companySizes: string[];
  companyTypes: string[];
}
