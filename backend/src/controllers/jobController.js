import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { Contact } from '../models/Contact.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { GUIDANCE_CHECKLIST, JOB_STATUSES } from '../constants.js';
import { extractKeywords } from '../utils/keywords.js';
import { toCsv } from '../utils/csv.js';

const EDITABLE_FIELDS = [
  'title',
  'companyName',
  'location',
  'url',
  'description',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'excitement',
  'dateSaved',
  'dateApplied',
  'deadline',
  'followUp',
  'notes',
  'archived',
];

const DATE_FIELDS = new Set(['dateSaved', 'dateApplied', 'deadline', 'followUp']);
const NUMBER_FIELDS = new Set(['salaryMin', 'salaryMax', 'excitement']);

function coerce(field, value) {
  if (value === '' || value === null) return DATE_FIELDS.has(field) || NUMBER_FIELDS.has(field) ? null : '';
  if (DATE_FIELDS.has(field)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`${field} is not a valid date`);
    return date;
  }
  if (NUMBER_FIELDS.has(field)) {
    const num = Number(value);
    if (Number.isNaN(num)) throw ApiError.badRequest(`${field} must be a number`);
    return num;
  }
  return value;
}

function pickEditable(body) {
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) update[field] = coerce(field, body[field]);
  }
  return update;
}

/** Keeps the Companies tab in sync when a job names a company we have not seen. */
async function linkCompany(userId, companyName) {
  const name = String(companyName || '').trim();
  if (!name) return null;
  const company = await Company.findOneAndUpdate(
    { user: userId, name },
    { $setOnInsert: { user: userId, name } },
    { new: true, upsert: true },
  );
  return company._id;
}

function guidanceFor(status) {
  return (GUIDANCE_CHECKLIST[status] || []).map((label) => ({ label, stage: status, done: false }));
}

function withDerived(jobDoc) {
  const job = jobDoc.toJSON ? jobDoc.toJSON() : jobDoc;
  const stageItems = job.checklist.filter((item) => item.stage === job.status);
  const doneCount = stageItems.filter((item) => item.done).length;
  return {
    ...job,
    keywords: extractKeywords(job.description),
    guidance: {
      stage: job.status,
      total: stageItems.length,
      completed: doneCount,
      percent: stageItems.length ? Math.round((doneCount / stageItems.length) * 100) : 0,
    },
  };
}

export const listJobs = asyncHandler(async (req, res) => {
  const { status, search, sort = 'order', archived } = req.query;
  const filter = { user: req.user._id };

  if (status) filter.status = { $in: String(status).split(',') };
  if (archived === 'true') filter.archived = true;
  else if (archived !== 'all') filter.archived = false;
  if (search) {
    const term = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: term }, { companyName: term }, { location: term }];
  }

  const sortMap = {
    order: { status: 1, order: 1 },
    title: { title: 1 },
    company: { companyName: 1 },
    date: { dateSaved: -1 },
    deadline: { deadline: 1 },
    excitement: { excitement: -1 },
  };

  const jobs = await Job.find(filter).sort(sortMap[sort] || sortMap.order);
  res.json({ jobs: jobs.map((job) => withDerived(job)) });
});

export const jobStats = asyncHandler(async (req, res) => {
  const rows = await Job.aggregate([
    { $match: { user: req.user._id, archived: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(JOB_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row._id] = row.count;
  res.json({ counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) });
});

export const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id }).populate(
    'contacts',
    'firstName lastName jobTitle email companyName linkedin',
  );
  if (!job) throw ApiError.notFound('Job not found');
  res.json({ job: withDerived(job) });
});

export const createJob = asyncHandler(async (req, res) => {
  const { title, companyName, status } = req.body;
  if (!title || !companyName) throw ApiError.badRequest('Job title and company name are required');
  if (status && !JOB_STATUSES.includes(status)) throw ApiError.badRequest('Unknown status');

  const jobStatus = status || 'Bookmarked';
  const last = await Job.findOne({ user: req.user._id, status: jobStatus })
    .sort({ order: -1 })
    .select('order');

  const job = await Job.create({
    ...pickEditable(req.body),
    title,
    companyName,
    status: jobStatus,
    user: req.user._id,
    company: await linkCompany(req.user._id, companyName),
    order: (last?.order ?? -1) + 1,
    checklist: guidanceFor(jobStatus),
  });

  res.status(201).json({ job: withDerived(job) });
});

export const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const update = pickEditable(req.body);
  Object.assign(job, update);
  if ('companyName' in update) {
    job.company = await linkCompany(req.user._id, update.companyName);
  }

  await job.save();
  res.json({ job: withDerived(job) });
});

export const moveJob = asyncHandler(async (req, res) => {
  const { status, order } = req.body;
  if (!JOB_STATUSES.includes(status)) throw ApiError.badRequest('Unknown status');

  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const previousStatus = job.status;
  const targetOrder = Number.isFinite(Number(order)) ? Number(order) : 0;

  // Open a slot at the target position, then close the gap left behind.
  await Job.updateMany(
    { user: req.user._id, status, _id: { $ne: job._id }, order: { $gte: targetOrder } },
    { $inc: { order: 1 } },
  );

  job.status = status;
  job.order = targetOrder;
  if (previousStatus !== status) {
    job.statusHistory.push({ status, changedAt: new Date() });
    if (status === 'Applied' && !job.dateApplied) job.dateApplied = new Date();

    const hasStageItems = job.checklist.some((item) => item.stage === status);
    if (!hasStageItems) job.checklist.push(...guidanceFor(status));
  }
  await job.save();

  // Both columns changed shape, so renumber them 0..n-1 to keep `order` dense.
  const touched = previousStatus === status ? [status] : [previousStatus, status];
  for (const columnStatus of touched) {
    const column = await Job.find({ user: req.user._id, status: columnStatus }).sort({ order: 1 });
    await Promise.all(
      column.map((item, index) =>
        item.order === index ? null : Job.updateOne({ _id: item._id }, { order: index }),
      ),
    );
  }

  const moved = await Job.findById(job._id).populate(
    'contacts',
    'firstName lastName jobTitle email companyName linkedin',
  );
  res.json({ job: withDerived(moved) });
});

export const addChecklistItem = asyncHandler(async (req, res) => {
  const { label } = req.body;
  if (!label?.trim()) throw ApiError.badRequest('Checklist item needs a label');

  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  job.checklist.push({ label: label.trim(), stage: job.status, done: false });
  await job.save();
  res.status(201).json({ job: withDerived(job) });
});

export const updateChecklistItem = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const item = job.checklist.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Checklist item not found');

  if ('done' in req.body) item.done = Boolean(req.body.done);
  if ('label' in req.body && req.body.label.trim()) item.label = req.body.label.trim();

  await job.save();
  res.json({ job: withDerived(job) });
});

export const deleteChecklistItem = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const item = job.checklist.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Checklist item not found');

  item.deleteOne();
  await job.save();
  res.json({ job: withDerived(job) });
});

export const addResume = asyncHandler(async (req, res) => {
  const { name, url = '', isTailored = false } = req.body;
  if (!name?.trim()) throw ApiError.badRequest('Resume name is required');

  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  job.resumes.push({ name: name.trim(), url: url.trim(), isTailored: Boolean(isTailored) });
  await job.save();
  res.status(201).json({ job: withDerived(job) });
});

export const deleteResume = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const resume = job.resumes.id(req.params.resumeId);
  if (!resume) throw ApiError.notFound('Resume not found');

  resume.deleteOne();
  await job.save();
  res.json({ job: withDerived(job) });
});

export const linkContact = asyncHandler(async (req, res) => {
  const { contactId } = req.body;
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  const contact = await Contact.findOne({ _id: contactId, user: req.user._id });
  if (!contact) throw ApiError.notFound('Contact not found');

  await Job.updateOne({ _id: job._id }, { $addToSet: { contacts: contact._id } });
  await Contact.updateOne({ _id: contact._id }, { $addToSet: { relatedJobs: job._id } });

  const updated = await Job.findById(job._id).populate(
    'contacts',
    'firstName lastName jobTitle email companyName linkedin',
  );
  res.json({ job: withDerived(updated) });
});

export const unlinkContact = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');

  await Job.updateOne({ _id: job._id }, { $pull: { contacts: req.params.contactId } });
  await Contact.updateOne({ _id: req.params.contactId }, { $pull: { relatedJobs: job._id } });

  const updated = await Job.findById(job._id).populate(
    'contacts',
    'firstName lastName jobTitle email companyName linkedin',
  );
  res.json({ job: withDerived(updated) });
});

export const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!job) throw ApiError.notFound('Job not found');
  await Contact.updateMany({ user: req.user._id }, { $pull: { relatedJobs: job._id } });
  res.status(204).end();
});

export const exportJobs = asyncHandler(async (req, res) => {
  const jobs = await Job.find({ user: req.user._id }).sort({ dateSaved: -1 }).lean();
  const csv = toCsv(
    [
      { key: 'title', label: 'Job Position' },
      { key: 'companyName', label: 'Company' },
      { key: 'salaryMax', label: 'Max Salary' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
      { key: 'dateSaved', label: 'Date Saved' },
      { key: 'deadline', label: 'Deadline' },
      { key: 'dateApplied', label: 'Date Applied' },
      { key: 'followUp', label: 'Follow up' },
      { key: 'excitement', label: 'Excitement' },
      { key: 'url', label: 'URL' },
    ],
    jobs,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="jobs.csv"');
  res.send(csv);
});
