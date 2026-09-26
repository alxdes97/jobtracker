import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { Contact } from '../models/Contact.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { toCsv } from '../utils/csv.js';

const EDITABLE_FIELDS = [
  'name',
  'industry',
  'size',
  'type',
  'location',
  'website',
  'linkedin',
  'yearFounded',
  'notes',
];

function pickEditable(body) {
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    if (field === 'yearFounded') {
      const value = body[field];
      update[field] = value === '' || value === null ? null : Number(value);
      if (update[field] !== null && Number.isNaN(update[field])) {
        throw ApiError.badRequest('Year founded must be a number');
      }
      continue;
    }
    update[field] = body[field];
  }
  return update;
}

/** Companies list rows show how much of the pipeline touches each company. */
async function decorate(userId, companies) {
  const ids = companies.map((company) => company._id);
  const [jobCounts, contactCounts] = await Promise.all([
    Job.aggregate([
      { $match: { user: userId, company: { $in: ids } } },
      { $group: { _id: '$company', count: { $sum: 1 } } },
    ]),
    Contact.aggregate([
      { $match: { user: userId, company: { $in: ids } } },
      { $group: { _id: '$company', count: { $sum: 1 } } },
    ]),
  ]);

  const jobMap = new Map(jobCounts.map((row) => [String(row._id), row.count]));
  const contactMap = new Map(contactCounts.map((row) => [String(row._id), row.count]));

  return companies.map((company) => ({
    ...(company.toJSON ? company.toJSON() : company),
    jobCount: jobMap.get(String(company._id)) || 0,
    contactCount: contactMap.get(String(company._id)) || 0,
  }));
}

export const listCompanies = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.search) {
    const term = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: term }, { industry: term }, { location: term }];
  }
  const companies = await Company.find(filter).sort({ name: 1 });
  res.json({ companies: await decorate(req.user._id, companies) });
});

export const getCompany = asyncHandler(async (req, res) => {
  const company = await Company.findOne({ _id: req.params.id, user: req.user._id });
  if (!company) throw ApiError.notFound('Company not found');

  const [jobs, contacts] = await Promise.all([
    Job.find({ user: req.user._id, company: company._id }).select('title status location dateSaved'),
    Contact.find({ user: req.user._id, company: company._id }).select('firstName lastName jobTitle email'),
  ]);

  res.json({ company: company.toJSON(), jobs, contacts });
});

export const createCompany = asyncHandler(async (req, res) => {
  if (!req.body.name?.trim()) throw ApiError.badRequest('Company name is required');
  const company = await Company.create({ ...pickEditable(req.body), user: req.user._id });
  res.status(201).json({ company: company.toJSON() });
});

export const updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    pickEditable(req.body),
    { new: true, runValidators: true },
  );
  if (!company) throw ApiError.notFound('Company not found');
  res.json({ company: company.toJSON() });
});

export const deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!company) throw ApiError.notFound('Company not found');
  await Promise.all([
    Job.updateMany({ user: req.user._id, company: company._id }, { company: null }),
    Contact.updateMany({ user: req.user._id, company: company._id }, { company: null }),
  ]);
  res.status(204).end();
});

export const exportCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({ user: req.user._id }).sort({ name: 1 });
  const rows = await decorate(req.user._id, companies);
  const csv = toCsv(
    [
      { key: 'name', label: 'Name' },
      { key: 'industry', label: 'Industry' },
      { key: 'size', label: 'Company Size' },
      { key: 'type', label: 'Company Type' },
      { key: 'location', label: 'Location' },
      { key: 'website', label: 'Website' },
      { key: 'linkedin', label: 'LinkedIn' },
      { key: 'yearFounded', label: 'Year Founded' },
      { key: 'jobCount', label: 'Jobs' },
      { key: 'contactCount', label: 'Contacts' },
    ],
    rows,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="companies.csv"');
  res.send(csv);
});
