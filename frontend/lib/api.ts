import type {
  Company,
  Contact,
  EmailTemplate,
  Job,
  JobStatus,
  Meta,
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

  addChecklistItem: (id: string, label: string) =>
    request<{ job: Job }>(`/jobs/${id}/checklist`, { method: 'POST', body: body({ label }) }),
  updateChecklistItem: (id: string, itemId: string, data: { done?: boolean; label?: string }) =>
    request<{ job: Job }>(`/jobs/${id}/checklist/${itemId}`, {
      method: 'PATCH',
      body: body(data),
    }),
  deleteChecklistItem: (id: string, itemId: string) =>
    request<{ job: Job }>(`/jobs/${id}/checklist/${itemId}`, { method: 'DELETE' }),

  addResume: (id: string, data: { name: string; url?: string; isTailored?: boolean }) =>
    request<{ job: Job }>(`/jobs/${id}/resumes`, { method: 'POST', body: body(data) }),
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
