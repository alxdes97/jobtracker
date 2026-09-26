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

check('tracks interviews, interviewers and a practice session', async () => {
  const created = await call('POST', `/api/jobs/${jobId}/interviews`);
  assert.equal(created.status, 201);
  const interviewId = created.payload.interviewId;
  assert.equal(created.payload.job.interviews.length, 1);

  const updated = await call('PATCH', `/api/jobs/${jobId}/interviews/${interviewId}`, {
    date: '2026-10-02',
    type: 'Technical',
    format: 'Video',
  });
  assert.equal(updated.payload.job.interviews[0].type, 'Technical');
  assert.equal(updated.payload.job.interviews[0].format, 'Video');
  assert.ok(updated.payload.job.interviews[0].date);

  const person = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/interviewers`, {
    name: 'Stephanie Scotto',
    title: 'Recruiter',
  });
  assert.equal(person.status, 201);
  assert.equal(person.payload.job.interviews[0].interviewers[0].name, 'Stephanie Scotto');

  const conversation = await call(
    'POST',
    `/api/jobs/${jobId}/interviews/${interviewId}/conversation`,
    { speaker: 'Interviewer', message: 'Walk me through a recent project.' },
  );
  assert.equal(conversation.status, 201);
  assert.equal(conversation.payload.job.interviews[0].conversation[0].message, 'Walk me through a recent project.');

  const feedback = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/feedback`, {
    body: 'Strong on system design, light on metrics.',
  });
  assert.equal(feedback.payload.job.interviews[0].feedback[0].body, 'Strong on system design, light on metrics.');

  const practice = await call('POST', `/api/jobs/${jobId}/interviews/${interviewId}/practice`, {
    notes: 'Rehearse the pipeline story.',
  });
  assert.equal(practice.payload.job.interviews[0].practiceSessions.length, 1);

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
  const attachment = attachedPayload.job.interviews[0].attachments[0];
  assert.equal(attachment.originalName, 'take-home.txt');
  assert.equal(attachment.storedName, undefined);

  const downloaded = await fetch(
    `${baseUrl}/api/jobs/${jobId}/interviews/${interviewId}/attachments/${attachment._id}/file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(downloaded.status, 200);
  assert.match(await downloaded.text(), /take-home notes/);

  const removed = await call('DELETE', `/api/jobs/${jobId}/interviews/${interviewId}`);
  assert.equal(removed.payload.job.interviews.length, 0);
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
