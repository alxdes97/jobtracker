/**
 * End-to-end smoke test for the API. Boots an in-memory MongoDB so it can run
 * without a local database: `npm run test:smoke -w backend`.
 */
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';

let token = '';
let baseUrl = '';

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = text && text.startsWith('{') ? JSON.parse(text) : text;
  return { status: response.status, payload };
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('rejects unauthenticated requests', async () => {
  const { status } = await call('GET', '/api/jobs');
  assert.equal(status, 401);
});

check('registers a user', async () => {
  const { status, payload } = await call('POST', '/api/auth/register', {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  });
  assert.equal(status, 201);
  assert.ok(payload.token);
  token = payload.token;
});

check('rejects a duplicate email', async () => {
  const { status } = await call('POST', '/api/auth/register', {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  });
  assert.equal(status, 409);
});

check('logs in with the right password only', async () => {
  const bad = await call('POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'wrong-password',
  });
  assert.equal(bad.status, 401);

  const good = await call('POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'password123',
  });
  assert.equal(good.status, 200);
});

let jobId = '';

check('creates a job, links a company and extracts keywords', async () => {
  const { status, payload } = await call('POST', '/api/jobs', {
    title: 'AI Engineer',
    companyName: 'Stride',
    location: 'Remote',
    description: `Requirements:
- Hands-on experience with TensorFlow, PyTorch and scikit-learn.
- Proficiency with AWS, Docker, Kubernetes and Terraform.
- High attention to detail and accuracy.

Job Responsibilities:
- Drive adoption of AI across the product.
- Build APIs and data pipelines with Docker.`,
  });

  assert.equal(status, 201);
  jobId = payload.job._id;
  assert.equal(payload.job.status, 'Bookmarked');
  assert.ok(payload.job.checklist.length > 0, 'guidance checklist is seeded');

  const sections = payload.job.keywords.sections.map((section) => section.key);
  assert.ok(sections.includes('requirements'), 'requirements section detected');
  assert.ok(sections.includes('responsibilities'), 'responsibilities section detected');

  const docker = payload.job.keywords.sections
    .flatMap((section) => section.keywords)
    .find((keyword) => keyword.term === 'docker');
  assert.ok(docker, 'docker keyword found');
  assert.equal(docker.count, 2, 'keyword counts use the whole description');

  const companies = await call('GET', '/api/companies');
  assert.ok(
    companies.payload.companies.some((company) => company.name === 'Stride'),
    'company auto-created from the job',
  );
});

check('merges repeated sections into one keyword group', async () => {
  const { status, payload } = await call('POST', '/api/jobs', {
    title: 'ML Engineer',
    companyName: 'Stride',
    description: `About the role
Stride is hiring an engineer to ship machine learning systems.

Requirements:
- Proficiency with Docker and Kubernetes.

Responsibilities:
- Drive adoption of AI across the product.`,
  });

  assert.equal(status, 201);
  const keys = payload.job.keywords.sections.map((section) => section.key);
  // Removed up front so a failing assertion cannot skew the later stats check.
  await call('DELETE', `/api/jobs/${payload.job._id}`);

  assert.deepEqual(keys, [...new Set(keys)], 'a section key appears at most once');
  assert.deepEqual(keys, ['requirements', 'responsibilities'], 'groups keep a stable order');
});

check('moves a job and stamps the applied date', async () => {
  const { status, payload } = await call('PATCH', `/api/jobs/${jobId}/move`, {
    status: 'Applied',
    order: 0,
  });
  assert.equal(status, 200);
  assert.equal(payload.job.status, 'Applied');
  assert.ok(payload.job.dateApplied, 'dateApplied set automatically');
  assert.equal(payload.job.statusHistory.length, 2);
});

check('tracks checklist progress in the guidance summary', async () => {
  const { payload: before } = await call('GET', `/api/jobs/${jobId}`);
  const item = before.job.checklist.find((entry) => entry.stage === 'Applied');
  assert.ok(item, 'checklist gained items for the new stage');

  const { payload: after } = await call('PATCH', `/api/jobs/${jobId}/checklist/${item._id}`, {
    done: true,
  });
  assert.equal(after.job.guidance.completed, 1);
  assert.ok(after.job.guidance.percent > 0);
});

check('adds a to-do and marks it done', async () => {
  const created = await call('POST', `/api/jobs/${jobId}/todos`, { text: 'Send the portfolio link' });
  assert.equal(created.status, 201);
  assert.equal(created.payload.job.todos[0].text, 'Send the portfolio link');
  assert.equal(created.payload.job.todos[0].done, false);
  const todoId = created.payload.job.todos[0]._id;

  const updated = await call('PATCH', `/api/jobs/${jobId}/todos/${todoId}`, { done: true });
  assert.equal(updated.payload.job.todos[0].done, true);

  const removed = await call('DELETE', `/api/jobs/${jobId}/todos/${todoId}`);
  assert.equal(removed.payload.job.todos.length, 0);
});

check('keeps a hiring process of dated steps', async () => {
  const { payload: createdJob } = await call('GET', `/api/jobs/${jobId}`);
  assert.deepEqual(
    createdJob.job.hiringProcess.map((step) => step.name),
    ['Recruiter screen', 'Hiring manager', 'Technical interview', 'Final interview', 'Offer'],
  );

  const added = await call('POST', `/api/jobs/${jobId}/hiring-process`, { name: 'Team match' });
  assert.equal(added.status, 201);
  const step = added.payload.job.hiringProcess.at(-1);
  assert.equal(step.name, 'Team match');
  assert.equal(step.done, false);

  const updated = await call('PATCH', `/api/jobs/${jobId}/hiring-process/${step._id}`, {
    done: true,
    date: '2026-11-20',
  });
  const saved = updated.payload.job.hiringProcess.find((item) => item._id === step._id);
  const savedDate = new Date(saved.date);
  assert.equal(saved.done, true);
  assert.equal(savedDate.getFullYear(), 2026);
  assert.equal(savedDate.getMonth(), 10);
  assert.equal(savedDate.getDate(), 20);

  const current = updated.payload.job.hiringProcess.map((item) => item._id);
  const reordered = await call('PATCH', `/api/jobs/${jobId}/hiring-process`, {
    order: [step._id, ...current.filter((id) => id !== step._id)],
  });
  assert.equal(reordered.payload.job.hiringProcess[0].name, 'Team match');

  const removed = await call('DELETE', `/api/jobs/${jobId}/hiring-process/${step._id}`);
  assert.equal(removed.payload.job.hiringProcess.length, 5);
  assert.equal(removed.payload.job.hiringProcess[0].name, 'Recruiter screen');
});

check('saves a meeting onto the job and the calendar', async () => {
  const created = await call('POST', `/api/jobs/${jobId}/meetings`, {
    startsAt: '2026-11-18T18:00:00.000Z',
    endsAt: '2026-11-18T19:00:00.000Z',
    date: '2026-11-18',
    interviewer: 'Avery Chen',
    conversation: [{ speaker: 'Me', message: 'Walked through the design.' }],
    feedback: 'Strong systems answers.',
  });
  assert.equal(created.status, 201);
  const interview = created.payload.job.interviews.at(-1);
  assert.equal(interview.interviewers[0].name, 'Avery Chen');
  assert.equal(interview.conversation[0].message, 'Walked through the design.');
  assert.equal(interview.feedback[0].body, 'Strong systems answers.');
  assert.ok(interview.startsAt);
  assert.equal(created.payload.job.status, 'Interviewing');
  assert.ok(created.payload.job.checklist.some((item) => item.stage === 'Interviewing'));

  const calendar = await call('GET', '/api/calendar');
  assert.equal(calendar.status, 200);
  const meeting = calendar.payload.meetings.find((item) => item.interview._id === interview._id);
  assert.ok(meeting);
  assert.equal(meeting.step, created.payload.job.interviews.length);
  assert.deepEqual(meeting.profiles, []);
});

check('requires sign-in before AutoKey can read reminders', async () => {
  const saved = token;
  token = '';
  try {
    const { status } = await call('GET', '/api/autokey/reminders');
    assert.equal(status, 401);
  } finally {
    token = saved;
  }
});

check('tells AutoKey which interviews in the next hour are due', async () => {
  async function addMeeting(minutesAhead, interviewer) {
    const startsAt = new Date(Date.now() + minutesAhead * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const created = await call('POST', `/api/jobs/${jobId}/meetings`, {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      interviewer,
    });
    assert.equal(created.status, 201);
    return created.payload.job.interviews.at(-1)._id;
  }

  const soonId = await addMeeting(20, 'Soon Person');
  const closeId = await addMeeting(10, 'Close Person');
  const laterId = await addMeeting(50, 'Later Person');
  const farId = await addMeeting(180, 'Far Person');

  const first = await call('GET', '/api/autokey/reminders');
  assert.equal(first.status, 200);
  const dueIds = first.payload.due.map((item) => item.interviewId);
  assert.ok(dueIds.includes(soonId));
  assert.ok(dueIds.includes(closeId));
  assert.ok(dueIds.includes(laterId));
  assert.equal(dueIds.includes(farId), false);

  const soon = first.payload.due.find((item) => item.interviewId === soonId);
  assert.equal(soon.companyName, 'Stride');
  assert.equal(soon.interviewer, 'Soon Person');
  assert.equal(soon.remindEveryMinutes, 10);
  assert.match(soon.stepLabel, /^\d+(st|nd|rd|th) interview$/);
  assert.match(soon.remainingLabel, /minute/);
  const close = first.payload.due.find((item) => item.interviewId === closeId);
  assert.equal(close.remindEveryMinutes, 5);
  const later = first.payload.due.find((item) => item.interviewId === laterId);
  assert.equal(later.remindEveryMinutes, 15);

  const ack = await call('POST', '/api/autokey/reminders/ack', {
    interviewIds: [soonId, '507f1f77bcf86cd799439011'],
  });
  assert.equal(ack.status, 200);
  assert.deepEqual(ack.payload.acknowledged, [soonId]);

  const second = await call('GET', '/api/autokey/reminders');
  const dueAgain = second.payload.due.map((item) => item.interviewId);
  assert.equal(dueAgain.includes(soonId), false);
  assert.ok(dueAgain.includes(closeId));
  assert.ok(second.payload.upcoming.some((item) => item.interviewId === soonId && item.due === false));
});

check('adds, edits and removes a job note', async () => {
  const created = await call('POST', `/api/jobs/${jobId}/notes`, {
    body: 'Ask about the on-call rotation.',
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.job.noteItems[0].body, 'Ask about the on-call rotation.');
  const noteId = created.payload.job.noteItems[0]._id;

  const updated = await call('PATCH', `/api/jobs/${jobId}/notes/${noteId}`, {
    body: 'Ask about on-call and timezone.',
  });
  assert.equal(updated.payload.job.noteItems[0].body, 'Ask about on-call and timezone.');

  const removed = await call('DELETE', `/api/jobs/${jobId}/notes/${noteId}`);
  assert.equal(removed.payload.job.noteItems.length, 0);
});

check('tracks interviews, interviewers and a practice session', async () => {
  const created = await call('POST', `/api/jobs/${jobId}/interviews`);
  assert.equal(created.status, 201);
  const interviewId = created.payload.interviewId;
  const before = created.payload.job.interviews.length;
  assert.ok(before >= 1);
  const interviewOf = (payload) => payload.job.interviews.find((item) => item._id === interviewId);

  const updated = await call('PATCH', `/api/jobs/${jobId}/interviews/${interviewId}`, {
    date: '2026-10-02',
    type: 'Technical',
    format: 'Video',
  });
  assert.equal(interviewOf(updated.payload).type, 'Technical');
  assert.equal(interviewOf(updated.payload).format, 'Video');
  assert.ok(interviewOf(updated.payload).date);

  const moved = await call('PATCH', `/api/jobs/${jobId}/interviews/${interviewId}`, {
    startsAt: '2026-11-20T15:00:00.000Z',
    endsAt: '2026-11-20T16:00:00.000Z',
  });
  assert.equal(new Date(interviewOf(moved.payload).startsAt).toISOString(), '2026-11-20T15:00:00.000Z');
  assert.equal(new Date(interviewOf(moved.payload).endsAt).toISOString(), '2026-11-20T16:00:00.000Z');

  const person = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/interviewers`, {
    name: 'Stephanie Scotto',
    title: 'Recruiter',
  });
  assert.equal(person.status, 201);
  assert.equal(interviewOf(person.payload).interviewers[0].name, 'Stephanie Scotto');

  const conversation = await call(
    'POST',
    `/api/jobs/${jobId}/interviews/${interviewId}/conversation`,
    { speaker: 'Interviewer', message: 'Walk me through a recent project.' },
  );
  assert.equal(conversation.status, 201);
  assert.equal(interviewOf(conversation.payload).conversation[0].message, 'Walk me through a recent project.');
  const entryId = interviewOf(conversation.payload).conversation[0]._id;
  const edited = await call(
    'PATCH',
    `/api/jobs/${jobId}/interviews/${interviewId}/conversation/${entryId}`,
    { message: 'Walk me through a recent project, including the tradeoffs.' },
  );
  assert.equal(edited.status, 200);
  assert.equal(
    interviewOf(edited.payload).conversation[0].message,
    'Walk me through a recent project, including the tradeoffs.',
  );

  const feedback = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/feedback`, {
    body: 'Strong on system design, light on metrics.',
  });
  assert.equal(interviewOf(feedback.payload).feedback[0].body, 'Strong on system design, light on metrics.');

  const practice = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/practice`, {
    notes: 'Rehearse the pipeline story.',
  });
  assert.equal(interviewOf(practice.payload).practiceSessions.length, 1);

  const attachmentForm = new FormData();
  attachmentForm.append(
    'file',
    new Blob([Buffer.from('take-home notes')], { type: 'text/plain' }),
    'take-home.txt',
  );
  const attached = await fetch(
    `${baseUrl}/api/jobs/${jobId}/interviews/${interviewId}/attachments`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: attachmentForm },
  );
  const attachedPayload = await attached.json();
  assert.equal(attached.status, 201);
  const attachment = attachedPayload.job.interviews
    .find((item) => item._id === interviewId)
    .attachments[0];
  assert.equal(attachment.originalName, 'take-home.txt');
  assert.equal(attachment.storedName, undefined);

  const downloaded = await fetch(
    `${baseUrl}/api/jobs/${jobId}/interviews/${interviewId}/attachments/${attachment._id}/file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /take-home notes/);

  const rewritten = await call('PATCH', `/api/jobs/${jobId}/interviews/${interviewId}`, {
    interviewer: 'Avery Chen',
    conversation: 'Updated the whole history.',
    feedback: 'Clearer on metrics.',
  });
  assert.equal(interviewOf(rewritten.payload).interviewers[0].name, 'Avery Chen');
  assert.equal(interviewOf(rewritten.payload).conversation.length, 1);
  assert.equal(interviewOf(rewritten.payload).conversation[0].message, 'Updated the whole history.');
  assert.equal(interviewOf(rewritten.payload).feedback[0].body, 'Clearer on metrics.');
  const cleared = await call('PATCH', `/api/jobs/${jobId}/interviews/${interviewId}`, { conversation: '   ' });
  assert.equal(interviewOf(cleared.payload).conversation.length, 0);

  const removed = await call('DELETE', `/api/jobs/${jobId}/interviews/${interviewId}`);
  assert.equal(removed.payload.job.interviews.length, before - 1);
  assert.equal(interviewOf(removed.payload), undefined);
});

check('attaches a file to the job and downloads it', async () => {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('cover letter')], { type: 'text/plain' }), 'cover-letter.txt');
  const attached = await fetch(`${baseUrl}/api/jobs/${jobId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const attachedPayload = await attached.json();
  assert.equal(attached.status, 201);
  const attachment = attachedPayload.job.attachments[0];
  assert.equal(attachment.originalName, 'cover-letter.txt');
  assert.equal(attachment.storedName, undefined);

  const downloaded = await fetch(`${baseUrl}/api/jobs/${jobId}/attachments/${attachment._id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /cover letter/);

  const removed = await call('DELETE', `/api/jobs/${jobId}/attachments/${attachment._id}`);
  assert.equal(removed.payload.job.attachments.length, 0);
});

check('attaches a resume', async () => {
  const { status, payload } = await call('POST', `/api/jobs/${jobId}/resumes`, {
    name: 'AI Engineer v2',
    isTailored: true,
  });
  assert.equal(status, 201);
  assert.equal(payload.job.resumes.length, 1);
});

let contactId = '';

check('creates a contact and links it to the job both ways', async () => {
  const created = await call('POST', '/api/contacts', {
    firstName: 'Stephanie',
    lastName: 'Scotto',
    companyName: 'Stride',
    relationship: 'Recruiter',
  });
  assert.equal(created.status, 201);
  contactId = created.payload.contact._id;
  assert.equal(created.payload.contact.fullName, 'Stephanie Scotto');

  const linked = await call('POST', `/api/jobs/${jobId}/contacts`, { contactId });
  assert.equal(linked.payload.job.contacts.length, 1);

  const contact = await call('GET', `/api/contacts/${contactId}`);
  assert.equal(contact.payload.contact.relatedJobs.length, 1);
});

check('tracks a company website from a page address', async () => {
  const created = await call('POST', '/api/company-tracks', {
    name: 'Harbor Careers',
    url: 'https://www.harbor.example/careers',
    pageTitle: 'Careers at Harbor',
    roles: ['AI Engineer', 'Product Designer'],
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.track.website, 'https://harbor.example');
  assert.equal(created.payload.track.domain, 'harbor.example');
  assert.equal(created.payload.track.pageTitle, 'Careers at Harbor');
  assert.equal(created.payload.track.hasChanges, false);
  assert.equal(created.payload.track.roles.length, 2);
  assert.ok(created.payload.track.company);

  const noted = await call('PATCH', `/api/company-tracks/${created.payload.track._id}`, {
    note: 'Follow up after the new research role is posted.',
  });
  assert.equal(noted.status, 200);
  assert.equal(noted.payload.track.note, 'Follow up after the new research role is posted.');

  const again = await call('POST', '/api/company-tracks', {
    name: 'Harbor Careers',
    url: 'https://www.harbor.example/careers/',
    pageTitle: 'Careers at Harbor',
    roles: ['AI Engineer', 'Research Scientist'],
  });
  assert.equal(again.status, 200);
  assert.equal(again.payload.track._id, created.payload.track._id);
  assert.deepEqual(again.payload.track.addedRoles, ['Research Scientist']);
  assert.deepEqual(again.payload.track.removedRoles, ['Product Designer']);
  assert.equal(again.payload.track.hasChanges, true);
  assert.equal(again.payload.track.trackedAt, created.payload.track.trackedAt);
  assert.equal(again.payload.track.note, 'Follow up after the new research role is posted.');
  assert.equal(again.payload.track.commits.length, 1);
  assert.deepEqual(again.payload.track.commits[0].roles, ['Research Scientist']);
  assert.equal(again.payload.track.commits[0].lastViewedAt, null);

  const viewed = await call('POST', `/api/company-tracks/${created.payload.track._id}/view`);
  assert.equal(viewed.status, 200);
  assert.ok(viewed.payload.track.commits[0].lastViewedAt);

  const listed = await call('GET', '/api/company-tracks');
  assert.equal(listed.payload.tracks[0].name, 'Harbor Careers');

  const removed = await call('DELETE', `/api/company-tracks/${created.payload.track._id}`);
  assert.equal(removed.status, 204);
});

check('connects a company from the directory and can disconnect it', async () => {
  const created = await call('POST', '/api/companies', {
    name: 'Northwind Labs',
    industry: 'Software',
    location: 'Remote',
  });
  assert.equal(created.status, 201);
  const companyId = created.payload.company._id;

  const connected = await call('PUT', `/api/jobs/${jobId}/company`, { companyId });
  assert.equal(connected.status, 200);
  assert.equal(connected.payload.job.company, companyId);
  assert.equal(connected.payload.job.companyName, 'Northwind Labs');
  assert.equal(connected.payload.job.contacts[0].firstName, 'Stephanie');

  const listed = await call('GET', '/api/companies');
  const northwind = listed.payload.companies.find((company) => company._id === companyId);
  assert.equal(northwind.jobCount, 1);

  const disconnected = await call('DELETE', `/api/jobs/${jobId}/company`);
  assert.equal(disconnected.payload.job.company, null);
  assert.equal(disconnected.payload.job.companyName, 'Northwind Labs');

  await call('PATCH', `/api/jobs/${jobId}`, { companyName: 'Stride' });
});

check('returns populated contacts after a stage move', async () => {
  const { payload } = await call('PATCH', `/api/jobs/${jobId}/move`, {
    status: 'Interviewing',
    order: 0,
  });
  // The job page renders this response directly, so bare ids would blank the
  // Contacts tab until the next reload.
  assert.equal(payload.job.contacts.length, 1);
  assert.equal(payload.job.contacts[0].firstName, 'Stephanie');
  assert.equal(payload.job.order, 0, 'the column is renumbered from zero');

  await call('PATCH', `/api/jobs/${jobId}/move`, { status: 'Applied', order: 0 });
});

check('counts jobs per status', async () => {
  const { payload } = await call('GET', '/api/jobs/stats');
  assert.equal(payload.counts.Applied, 1);
  assert.equal(payload.total, 1);
});

check('exports CSV', async () => {
  const response = await fetch(`${baseUrl}/api/jobs/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const csv = await response.text();
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.ok(csv.startsWith('Job Position,Company,Max Salary'));
  assert.ok(csv.includes('AI Engineer'));
});

check('stores AutoKey hotkeys and clipboard settings on the signed-in account', async () => {
  const savedToken = token;
  token = '';
  const locked = await call('GET', '/api/autokey/config');
  token = savedToken;
  assert.equal(locked.status, 401);

  const empty = await call('GET', '/api/autokey/config');
  assert.equal(empty.status, 200);
  assert.equal(empty.payload.configured, false);

  const saved = await call('PUT', '/api/autokey/config', {
    bindings: [
      { hotkey: 'ctrl+shift+a', file: 'C:\\notes\\intro.txt' },
      { hotkey: 'ctrl+shift+a', file: 'C:\\notes\\duplicate.txt' },
    ],
    clipboard_transform: {
      enabled: true,
      pairs: [
        { from: 'A', to: 'B' },
        { from: '', to: 'skip' },
      ],
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.configured, true);
  assert.equal(saved.payload.bindings.length, 1);
  assert.equal(saved.payload.bindings[0].file, 'C:\\notes\\intro.txt');
  assert.equal(saved.payload.clipboard_transform.enabled, true);
  assert.deepEqual(saved.payload.clipboard_transform.pairs, [{ from: 'A', to: 'B' }]);

  const exported = await call('GET', '/api/autokey/config/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.payload.bindings[0].hotkey, 'ctrl+shift+a');
  assert.equal(exported.payload.configured, undefined);

  const imported = await call('POST', '/api/autokey/config/import', {
    bindings: [{ hotkey: 'ctrl+alt+1', file: 'D:\\other.txt' }],
    clipboard_transform: { enabled: false, pairs: [{ from: 'hello', to: 'hi' }] },
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.payload.bindings[0].hotkey, 'ctrl+alt+1');
  assert.equal(imported.payload.clipboard_transform.enabled, false);

  const again = await call('GET', '/api/autokey/config');
  assert.equal(again.payload.bindings[0].file, 'D:\\other.txt');

  const bad = await call('PUT', '/api/autokey/config', { bindings: 'nope' });
  assert.equal(bad.status, 400);
});

check('keeps another user out of this data', async () => {
  const other = await call('POST', '/api/auth/register', {
    name: 'Other User',
    email: 'other@example.com',
    password: 'password123',
  });
  const previousToken = token;
  token = other.payload.token;

  const jobs = await call('GET', '/api/jobs');
  assert.equal(jobs.payload.jobs.length, 0, 'jobs are scoped per user');

  const stolen = await call('GET', `/api/jobs/${jobId}`);
  assert.equal(stolen.status, 404);

  const config = await call('GET', '/api/autokey/config');
  assert.equal(config.payload.configured, false);
  assert.equal(config.payload.bindings.length, 0);

  token = previousToken;
});

check('validates input', async () => {
  const { status, payload } = await call('POST', '/api/jobs', { title: 'No company' });
  assert.equal(status, 400);
  assert.match(payload.error, /company name/i);
});

check('uploads a resume and downloads the same file', async () => {
  const form = new FormData();
  form.append(
    'file',
    new Blob([Buffer.from('%PDF-1.4 resume bytes')], { type: 'application/pdf' }),
    'Alex Resume.pdf',
  );

  const created = await fetch(`${baseUrl}/api/resumes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 201);
  assert.equal(createdPayload.resume.originalName, 'Alex Resume.pdf');
  assert.equal(createdPayload.resume.name, 'Alex Resume');
  assert.equal(createdPayload.resume.storedName, undefined);

  const listed = await call('GET', '/api/resumes');
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.resumes.length, 1);

  const linked = await call('POST', `/api/jobs/${jobId}/resumes/link`, {
    resumeId: createdPayload.resume._id,
    isTailored: true,
  });
  assert.equal(linked.status, 201);
  const linkedResume = linked.payload.job.resumes.find(
    (item) => item.libraryResume === createdPayload.resume._id,
  );
  assert.ok(linkedResume);
  assert.equal(linkedResume.name, 'Alex Resume');

  const duplicate = await call('POST', `/api/jobs/${jobId}/resumes/link`, {
    resumeId: createdPayload.resume._id,
  });
  assert.equal(duplicate.status, 400);

  const file = await fetch(`${baseUrl}/api/resumes/${createdPayload.resume._id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(file.status, 200);
  assert.match(await file.text(), /resume bytes/);

  const rejected = new FormData();
  rejected.append('file', new Blob(['notes'], { type: 'text/plain' }), 'notes.txt');
  const bad = await fetch(`${baseUrl}/api/resumes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: rejected,
  });
  assert.equal(bad.status, 400);

  const removed = await call('DELETE', `/api/resumes/${createdPayload.resume._id}`);
  assert.equal(removed.status, 204);
  const after = await call('GET', '/api/resumes');
  assert.equal(after.payload.resumes.length, 0);

  const job = await call('GET', `/api/jobs/${jobId}`);
  assert.equal(
    job.payload.job.resumes.some((item) => item.libraryResume === createdPayload.resume._id),
    false,
  );
});

check('deletes a job and unlinks it from contacts', async () => {
  const { status } = await call('DELETE', `/api/jobs/${jobId}`);
  assert.equal(status, 204);

  const contact = await call('GET', `/api/contacts/${contactId}`);
  assert.equal(contact.payload.contact.relatedJobs.length, 0);
});

check('records one submitted application for a submitter', async () => {
  const created = await call('POST', '/api/application-submitters', {
    name: 'Casey',
    email: 'submitter@example.com',
    password: 'password123',
  });
  assert.equal(created.status, 201);

  const previousToken = token;
  const signedIn = await call('POST', '/api/application-track/login', {
    email: 'submitter@example.com',
    password: 'password123',
  });
  assert.equal(signedIn.status, 200);
  token = signedIn.payload.token;
  const blocked = await call('GET', '/api/jobs');
  assert.equal(blocked.status, 401);
  const recorded = await call('POST', '/api/application-track/applications', {
    url: 'https://jobs.example.com/apply',
    domain: 'jobs.example.com',
    pageTitle: 'Apply',
    fields: [
      { label: 'Job title', name: 'title', value: 'Engineer' },
      { label: 'Phone', name: 'phone', value: '555-0100' },
      { label: 'Website', name: 'website', value: '' },
    ],
  });
  assert.equal(recorded.status, 201);
  assert.equal(recorded.payload.application.title, 'Engineer');
  assert.equal(recorded.payload.application.fields.find((field) => field.name === 'website')?.value, '');
  const again = await call('POST', '/api/application-track/applications', {
    url: 'https://jobs.example.com/apply?step=2',
    domain: 'jobs.example.com',
    pageTitle: 'Apply',
    submitted: false,
    fields: [{ label: 'Phone', name: 'phone', value: '555-0100' }],
  });
  assert.equal(again.status, 200);
  assert.equal(String(again.payload.application._id), String(recorded.payload.application._id));
  assert.equal(again.payload.application.submitted, false);
  const submitted = await call('POST', '/api/application-track/applications', {
    url: 'https://jobs.example.com/apply?done=1',
    domain: 'jobs.example.com',
    pageTitle: 'Apply',
    submitted: true,
    fields: [{ label: 'Phone', name: 'phone', value: '555-0100' }],
  });
  assert.equal(String(submitted.payload.application._id), String(recorded.payload.application._id));
  assert.equal(submitted.payload.application.submitted, true);
  const captcha = await call('POST', '/api/application-track/applications', {
    url: 'https://www.recaptcha.net/recaptcha/enterprise/anchor?ar=1',
    domain: 'www.recaptcha.net',
    pageTitle: 'reCAPTCHA',
    fields: [{ label: 'Job title', name: 'title', value: 'Should not save' }],
  });
  assert.equal(captcha.status, 204);
  const originOnly = await call('POST', '/api/application-track/applications', {
    url: 'https://www.recaptcha.net/recaptcha/enterprise/anchor?co=aHR0cHM6Ly9qb2ItYm9hcmRzLmdyZWVuaG91c2UuaW86NDQz',
    domain: 'www.recaptcha.net',
    pageTitle: 'Apply',
    fields: [{ label: 'Job title', name: 'title', value: 'Greenhouse role' }],
  });
  assert.equal(originOnly.status, 204);
  const jobUrl = 'https://job-boards.greenhouse.io/acme/jobs/456';
  const fromCaptcha = await call('POST', '/api/application-track/applications', {
    url: `https://www.recaptcha.net/recaptcha/enterprise/anchor?co=${Buffer.from(jobUrl).toString('base64')}`,
    domain: 'www.recaptcha.net',
    pageTitle: 'Apply',
    fields: [{ label: 'Job title', name: 'title', value: 'Greenhouse role' }],
  });
  assert.equal(fromCaptcha.status, 201);
  assert.equal(fromCaptcha.payload.application.url, jobUrl);
  assert.equal(fromCaptcha.payload.application.domain, 'job-boards.greenhouse.io');
  const captchaTitleUrl = 'https://job-boards.greenhouse.io/acme/jobs/789';
  const titledByUrl = await call('POST', '/api/application-track/applications', {
    url: captchaTitleUrl,
    domain: 'job-boards.greenhouse.io',
    pageTitle: 'reCAPTCHA',
    submitted: true,
    fields: [{ label: 'Phone', name: 'phone', value: '555-0199' }],
  });
  assert.equal(titledByUrl.status, 201);
  assert.equal(titledByUrl.payload.application.title, captchaTitleUrl);

  token = previousToken;
  const removedTitle = await call('DELETE', `/api/applications/${titledByUrl.payload.application._id}`);
  assert.equal(removedTitle.status, 204);
  const removedCaptcha = await call('DELETE', `/api/applications/${fromCaptcha.payload.application._id}`);
  assert.equal(removedCaptcha.status, 204);
  const streamAbort = new AbortController();
  try {
    const stream = await fetch(`${baseUrl}/api/applications/live`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: streamAbort.signal,
    });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let liveText = '';
    while (!liveText.includes('event: ready')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      liveText += decoder.decode(chunk.value);
    }
    token = signedIn.payload.token;
    const extra = await call('POST', '/api/application-track/applications', {
      url: 'https://live.example.com/job',
      domain: 'live.example.com',
      pageTitle: 'Live role',
      fields: [{ label: 'Job title', name: 'title', value: 'Live role' }],
    });
    assert.equal(extra.status, 201);
    token = previousToken;
    const deadline = Date.now() + 3000;
    while (!liveText.includes('event: update') && Date.now() < deadline) {
      const chunk = await reader.read();
      if (chunk.done) break;
      liveText += decoder.decode(chunk.value);
    }
    assert.match(liveText, /event: update/);
    await reader.cancel();
    const removedExtra = await call('DELETE', `/api/applications/${extra.payload.application._id}`);
    assert.equal(removedExtra.status, 204);
  } finally {
    streamAbort.abort();
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const query = `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
  const listed = await call('GET', `/api/applications?${query}`);
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.applications.length, 1);
  assert.equal(listed.payload.applications[0].submitterEmail, 'submitter@example.com');
  assert.equal(listed.payload.applications[0].fields[1].value, '555-0100');

  const removed = await call('DELETE', `/api/application-submitters/${created.payload.submitter._id}`);
  assert.equal(removed.status, 204);
  const kept = await call('GET', `/api/applications?${query}`);
  assert.equal(kept.payload.applications.length, 1);
  const deleted = await call('DELETE', `/api/applications/${kept.payload.applications[0]._id}`);
  assert.equal(deleted.status, 204);
  const afterDelete = await call('GET', `/api/applications?${query}`);
  assert.equal(afterDelete.payload.applications.length, 0);
});

async function run() {
  const mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('job-tracker-test'));

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  let failures = 0;
  for (const { name, fn } of checks) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${error.message}`);
    }
  }

  server.close();
  await disconnectDatabase();
  await mongo.stop();

  console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
