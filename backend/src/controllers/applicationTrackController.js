import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ApplicationSubmitter } from '../models/ApplicationSubmitter.js';
import { TrackedApplication } from '../models/TrackedApplication.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';

const FIELD_LIMIT = 200;
const VALUE_LIMIT = 20_000;

function signSubmitter(submitterId) {
  return jwt.sign({ sub: String(submitterId), kind: 'submitter' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

export async function requireSubmitter(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized();
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.kind !== 'submitter') throw ApiError.unauthorized();
    const submitter = await ApplicationSubmitter.findById(payload.sub);
    if (!submitter) throw ApiError.unauthorized('Session expired, please sign in again');
    req.submitter = submitter;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized('Session expired, please sign in again'));
      return;
    }
    next(error);
  }
}

function cleanFields(value) {
  if (!Array.isArray(value)) return [];
  const fields = [];
  for (const item of value) {
    const name = String(item?.name || '').trim().slice(0, 180);
    const label = String(item?.label || name || 'Field').trim().slice(0, 180);
    const fieldValue = String(item?.value || '').trim().slice(0, VALUE_LIMIT);
    if (!fieldValue) continue;
    fields.push({ label, name, value: fieldValue });
    if (fields.length >= FIELD_LIMIT) break;
  }
  return fields;
}

function fieldMatch(fields, pattern) {
  return fields.find((field) => pattern.test(`${field.label} ${field.name}`))?.value || '';
}

export const login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const submitter = await ApplicationSubmitter.findOne({ email }).select('+passwordHash');
  if (!submitter || !(await bcrypt.compare(password, submitter.passwordHash))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }

  res.json({
    token: signSubmitter(submitter._id),
    submitter: { email: submitter.email, name: submitter.name },
  });
});

export const session = asyncHandler(async (req, res) => {
  res.json({ submitter: { email: req.submitter.email, name: req.submitter.name } });
});

export const record = asyncHandler(async (req, res) => {
  const fields = cleanFields(req.body.fields);
  const url = String(req.body.url || '').trim().slice(0, 2000);
  const domain = String(req.body.domain || '').trim().slice(0, 180);
  const pageTitle = String(req.body.pageTitle || '').trim().slice(0, 300);
  const title = String(req.body.title || '').trim().slice(0, 180)
    || fieldMatch(fields, /job title|position|role title|\brole\b/i)
    || pageTitle;
  const company = String(req.body.company || '').trim().slice(0, 180)
    || fieldMatch(fields, /company/i);
  if (!url && fields.length === 0) throw ApiError.badRequest('Application content is required');

  const application = await TrackedApplication.create({
    owner: req.submitter.owner,
    submitter: req.submitter._id,
    submitterEmail: req.submitter.email,
    submitterName: req.submitter.name,
    url,
    domain,
    title,
    company,
    pageTitle,
    fields,
    appliedAt: new Date(),
  });
  res.status(201).json({ application });
});

export const listSubmitters = asyncHandler(async (req, res) => {
  const submitters = await ApplicationSubmitter.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json({ submitters });
});

export const createSubmitter = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim().slice(0, 80) || email.split('@')[0] || 'Submitter';
  if (!email || !email.includes('@')) throw ApiError.badRequest('A valid email is required');
  if (password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');

  const existing = await ApplicationSubmitter.findOne({ email });
  if (existing) throw ApiError.conflict('A submitter with that email already exists');

  const submitter = await ApplicationSubmitter.create({
    owner: req.user._id,
    name,
    email,
    passwordHash: await User.hashPassword(password),
  });
  res.status(201).json({ submitter });
});

export const deleteSubmitter = asyncHandler(async (req, res) => {
  const submitter = await ApplicationSubmitter.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!submitter) throw ApiError.notFound('Submitter not found');
  res.status(204).end();
});

export const listApplications = asyncHandler(async (req, res) => {
  const from = new Date(String(req.query.from || ''));
  const to = new Date(String(req.query.to || ''));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiError.badRequest('Choose a date');
  }
  const filter = { owner: req.user._id, appliedAt: { $gte: from, $lt: to } };
  if (req.query.submitterId) filter.submitter = String(req.query.submitterId);
  const applications = await TrackedApplication.find(filter).sort({ appliedAt: -1 }).limit(500);
  res.json({ applications });
});
