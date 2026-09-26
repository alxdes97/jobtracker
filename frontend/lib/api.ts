import type {
  Company,
  Contact,
  EmailTemplate,
  Job,
  JobStatus,
  Meta,
  ResumeFile,
  User,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
const TOKEN_KEY = 'job-tracker-token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'string' ? payload : payload?.error || 'Request failed';
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  meta: () => request<Meta>('/meta'),

  register: (data: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: body(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: body(data) }),
  me: () => request<{ user: User }>('/auth/me'),

  listJobs: (params: { search?: string; sort?: string; status?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
    ).toString();
    return request<{ jobs: Job[] }>(`/jobs${query ? `?${query}` : ''}`);
  },
  jobStats: () => request<{ counts: Record<JobStatus, number>; total: number }>('/jobs/stats'),
  getJob: (id: string) => request<{ job: Job }>(`/jobs/${id}`),
  createJob: (data: Partial<Job>) =>
    request<{ job: Job }>('/jobs', { method: 'POST', body: body(data) }),
  updateJob: (id: string, data: Partial<Job>) =>
    request<{ job: Job }>(`/jobs/${id}`, { method: 'PATCH', body: body(data) }),
  moveJob: (id: string, data: { status: JobStatus; order: number }) =>
    request<{ job: Job }>(`/jobs/${id}/move`, { method: 'PATCH', body: body(data) }),
  deleteJob: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),

  addNote: (id: string, bodyText: string) =>
    request<{ job: Job }>(`/jobs/${id}/notes`, { method: 'POST', body: body({ body: bodyText }) }),
  updateNote: (id: string, noteId: string, bodyText: string) =>
    request<{ job: Job }>(`/jobs/${id}/notes/${noteId}`, {
      method: 'PATCH',
      body: body({ body: bodyText }),
    }),
  deleteNote: (id: string, noteId: string) =>
    request<{ job: Job }>(`/jobs/${id}/notes/${noteId}`, { method: 'DELETE' }),

  addChecklistItem: (id: string, label: string) =>
    request<{ job: Job }>(`/jobs/${id}/checklist`, { method: 'POST', body: body({ label }) }),
  updateChecklistItem: (id: string, itemId: string, data: { done?: boolean; label?: string }) =>
    request<{ job: Job }>(`/jobs/${id}/checklist/${itemId}`, {
      method: 'PATCH',
      body: body(data),
    }),
  deleteChecklistItem: (id: string, itemId: string) =>
    request<{ job: Job }>(`/jobs/${id}/checklist/${itemId}`, { method: 'DELETE' }),

  addInterview: (id: string) =>
    request<{ job: Job; interviewId: string }>(`/jobs/${id}/interviews`, { method: 'POST' }),
  updateInterview: (
    id: string,
    interviewId: string,
    data: { date?: string | null; type?: string; format?: string },
  ) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}`, {
      method: 'PATCH',
      body: body(data),
    }),
  deleteInterview: (id: string, interviewId: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}`, { method: 'DELETE' }),
  addInterviewer: (id: string, interviewId: string, data: { name: string; title?: string }) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/interviewers`, {
      method: 'POST',
      body: body(data),
    }),
  deleteInterviewer: (id: string, interviewId: string, interviewerId: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/interviewers/${interviewerId}`, {
      method: 'DELETE',
    }),
  addConversation: (id: string, interviewId: string, data: { speaker?: string; message: string }) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/conversation`, {
      method: 'POST',
      body: body(data),
    }),
  deleteConversation: (id: string, interviewId: string, entryId: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/conversation/${entryId}`, {
      method: 'DELETE',
    }),
  addFeedback: (id: string, interviewId: string, bodyText: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/feedback`, {
      method: 'POST',
      body: body({ body: bodyText }),
    }),
  deleteFeedback: (id: string, interviewId: string, feedbackId: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/feedback/${feedbackId}`, {
      method: 'DELETE',
    }),
  addPracticeSession: (id: string, interviewId: string, notes: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/practice`, {
      method: 'POST',
      body: body({ notes }),
    }),
  uploadInterviewAttachment: async (id: string, interviewId: string, file: File) => {
    const token = tokenStore.get();
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${API_URL}/jobs/${id}/interviews/${interviewId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, payload?.error || 'Upload failed');
    return payload as { job: Job };
  },
  deleteInterviewAttachment: (id: string, interviewId: string, attachmentId: string) =>
    request<{ job: Job }>(`/jobs/${id}/interviews/${interviewId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),

  addResume: (id: string, data: { name: string; url?: string; isTailored?: boolean }) =>
    request<{ job: Job }>(`/jobs/${id}/resumes`, { method: 'POST', body: body(data) }),
  linkLibraryResume: (id: string, resumeId: string, isTailored = false) =>
    request<{ job: Job }>(`/jobs/${id}/resumes/link`, {
      method: 'POST',
      body: body({ resumeId, isTailored }),
    }),
  deleteResume: (id: string, resumeId: string) =>
    request<{ job: Job }>(`/jobs/${id}/resumes/${resumeId}`, { method: 'DELETE' }),

  linkContact: (id: string, contactId: string) =>
    request<{ job: Job }>(`/jobs/${id}/contacts`, { method: 'POST', body: body({ contactId }) }),
  unlinkContact: (id: string, contactId: string) =>
    request<{ job: Job }>(`/jobs/${id}/contacts/${contactId}`, { method: 'DELETE' }),

  listContacts: (params: { search?: string; groupBy?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
    ).toString();
    return request<{ contacts: Contact[] }>(`/contacts${query ? `?${query}` : ''}`);
  },
  getContact: (id: string) => request<{ contact: Contact }>(`/contacts/${id}`),
  createContact: (data: Partial<Contact>) =>
    request<{ contact: Contact }>('/contacts', { method: 'POST', body: body(data) }),
  updateContact: (id: string, data: Partial<Contact>) =>
    request<{ contact: Contact }>(`/contacts/${id}`, { method: 'PATCH', body: body(data) }),
  deleteContact: (id: string) => request<void>(`/contacts/${id}`, { method: 'DELETE' }),

  listCompanies: (params: { search?: string } = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
    ).toString();
    return request<{ companies: Company[] }>(`/companies${query ? `?${query}` : ''}`);
  },
  createCompany: (data: Partial<Company>) =>
    request<{ company: Company }>('/companies', { method: 'POST', body: body(data) }),
  updateCompany: (id: string, data: Partial<Company>) =>
    request<{ company: Company }>(`/companies/${id}`, { method: 'PATCH', body: body(data) }),
  deleteCompany: (id: string) => request<void>(`/companies/${id}`, { method: 'DELETE' }),

  listResumes: () => request<{ resumes: ResumeFile[] }>('/resumes'),
  uploadResume: async (file: File) => {
    const token = tokenStore.get();
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${API_URL}/resumes`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(response.status, payload?.error || 'Upload failed');
    }
    return payload as { resume: ResumeFile };
  },
  deleteResume: (id: string) => request<void>(`/resumes/${id}`, { method: 'DELETE' }),

  listTemplates: () => request<{ templates: EmailTemplate[] }>('/templates'),
  createTemplate: (data: Partial<EmailTemplate>) =>
    request<{ template: EmailTemplate }>('/templates', { method: 'POST', body: body(data) }),
  updateTemplate: (id: string, data: Partial<EmailTemplate>) =>
    request<{ template: EmailTemplate }>(`/templates/${id}`, {
      method: 'PATCH',
      body: body(data),
    }),
  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
};

export async function downloadInterviewAttachment(
  jobId: string,
  interviewId: string,
  attachmentId: string,
  filename: string,
) {
  const token = tokenStore.get();
  const response = await fetch(
    `${API_URL}/jobs/${jobId}/interviews/${interviewId}/attachments/${attachmentId}/file`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) throw new ApiError(response.status, 'Could not download that attachment');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadResume(id: string, filename: string) {
  const token = tokenStore.get();
  const response = await fetch(`${API_URL}/resumes/${id}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, 'Could not download that resume');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Streams a CSV export through the authenticated endpoint and saves it. */
export async function downloadExport(resource: 'jobs' | 'contacts' | 'companies') {
  const token = tokenStore.get();
  const response = await fetch(`${API_URL}/${resource}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, 'Export failed');

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${resource}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
