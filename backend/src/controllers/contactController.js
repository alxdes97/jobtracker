import { Contact } from '../models/Contact.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { toCsv } from '../utils/csv.js';

const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'jobTitle',
  'companyName',
  'email',
  'linkedin',
  'twitter',
  'location',
  'phone',
  'relationship',
  'goal',
  'status',
  'dateSaved',
  'lastContacted',
  'followUp',
  'notes',
];

const DATE_FIELDS = new Set(['dateSaved', 'lastContacted', 'followUp']);

function pickEditable(body) {
  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (DATE_FIELDS.has(field)) {
      if (value === '' || value === null) {
        update[field] = null;
        continue;
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`${field} is not a valid date`);
      update[field] = date;
      continue;
    }
    update[field] = value;
  }
  return update;
}

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

export const listContacts = asyncHandler(async (req, res) => {
  const { search, groupBy } = req.query;
  const filter = { user: req.user._id };
  if (search) {
    const term = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { firstName: term },
      { lastName: term },
      { companyName: term },
      { jobTitle: term },
      { email: term },
    ];
  }

  const sort = groupBy === 'company' ? { companyName: 1, firstName: 1 } : { firstName: 1 };
  const contacts = await Contact.find(filter).sort(sort);
  res.json({ contacts });
});

export const getContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, user: req.user._id }).populate(
    'relatedJobs',
    'title companyName status location',
  );
  if (!contact) throw ApiError.notFound('Contact not found');
  res.json({ contact });
});

export const createContact = asyncHandler(async (req, res) => {
  if (!req.body.firstName?.trim()) throw ApiError.badRequest('First name is required');

  const contact = await Contact.create({
    ...pickEditable(req.body),
    user: req.user._id,
    company: await linkCompany(req.user._id, req.body.companyName),
  });
  res.status(201).json({ contact });
});

export const updateContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, user: req.user._id });
  if (!contact) throw ApiError.notFound('Contact not found');

  const update = pickEditable(req.body);
  Object.assign(contact, update);
  if ('companyName' in update) {
    contact.company = await linkCompany(req.user._id, update.companyName);
  }
  await contact.save();
  res.json({ contact });
});

export const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!contact) throw ApiError.notFound('Contact not found');
  await Job.updateMany({ user: req.user._id }, { $pull: { contacts: contact._id } });
  res.status(204).end();
});

export const exportContacts = asyncHandler(async (req, res) => {
  const contacts = await Contact.find({ user: req.user._id }).sort({ firstName: 1 }).lean();
  const csv = toCsv(
    [
      { key: 'fullName', label: 'Full Name' },
      { key: 'jobTitle', label: 'Job Title' },
      { key: 'companyName', label: 'Company' },
      { key: 'location', label: 'Location' },
      { key: 'goal', label: 'Goal' },
      { key: 'status', label: 'Status' },
      { key: 'relationship', label: 'Relationship' },
      { key: 'followUp', label: 'Follow up' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'linkedin', label: 'LinkedIn' },
    ],
    contacts.map((contact) => ({
      ...contact,
      fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    })),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  res.send(csv);
});
