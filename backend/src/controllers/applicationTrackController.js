import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ApplicationSubmitter } from '../models/ApplicationSubmitter.js';
import { TrackedApplication } from '../models/TrackedApplication.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { publishApplicationUpdate, subscribeApplicationUpdates, subscribePresence } from '../realtime/applicationUpdates.js';

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
    const fieldValue = String(item?.value ?? '').trim().slice(0, VALUE_LIMIT);
    if (!label && !name) continue;
    fields.push({ label, name, value: fieldValue });
    if (fields.length >= FIELD_LIMIT) break;
  }
  return fields;
}

function fieldMatch(fields, pattern) {
  return fields.find((field) => pattern.test(`${field.label} ${field.name}`))?.value || '';
}

function captchaLabel(value) {
  return /recaptcha|hcaptcha|turnstile/i.test(String(value || ''));
}

function applicationTitle({ title, pageTitle, fields, url }) {
  const candidates = [
    String(title || '').trim(),
    fieldMatch(fields, /job title|position|role title|\brole\b/i),
    String(pageTitle || '').trim(),
  ];
  const chosen = candidates.find((value) => value && !captchaLabel(value));
  if (chosen) return chosen.slice(0, 180);
  return String(url || '').slice(0, 2000);
}

function isMailbox(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (/(^|\.)mail\.google\.com$/.test(host) || host === 'gmail.com' || host === 'inbox.google.com') return true;
    if (/(^|\.)outlook\.(live|office|office365)\.com$/.test(host) || host === 'outlook.cloud.microsoft') return true;
    if (/(^|\.)mail\.yahoo\./.test(host)) return true;
    if (host === 'mail.proton.me' || host === 'mail.protonmail.com' || host === 'app.proton.me') return true;
    if (/(^|\.)mail\.aol\.com$/.test(host) || /(^|\.)mail\.zoho\.com$/.test(host)) return true;
    if (/(^|\.)fastmail\.com$/.test(host) || host === 'app.hey.com' || /(^|\.)superhuman\.com$/.test(host)) return true;
    if (host === 'www.icloud.com' && /^\/mail(\/|$)/.test(parsed.pathname)) return true;
    if (/^webmail\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function isEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    if (/(^|\.)recaptcha\.net$/i.test(host)) return true;
    if (/(^|\.)google\.com$/i.test(host) && /recaptcha/i.test(path)) return true;
    if (/(^|\.)gstatic\.com$/i.test(host)) return true;
    if (/(^|\.)hcaptcha\.com$/i.test(host)) return true;
    if (/(^|\.)cloudflare\.com$/i.test(host) && /challenge|turnstile/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function fullJobUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    parsed.hash = '';
    if (isMailbox(parsed.toString())) return '';
    if (/(^|\.)greenhouse\.io$/i.test(parsed.hostname) && /\/embed\/job_app/i.test(parsed.pathname)) {
      const board = parsed.searchParams.get('for') || '';
      const token = parsed.searchParams.get('token') || '';
      if (/^[\w.-]+$/.test(board) && /^[\w.-]+$/.test(token)) {
        return `https://job-boards.greenhouse.io/${board}/jobs/${token}`;
      }
    }
    if (!parsed.pathname || parsed.pathname === '/') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function embedParentUrl(url) {
  try {
    const parsed = new URL(url);
    const encoded = parsed.searchParams.get('co');
    if (!encoded) return '';
    const parent = new URL(Buffer.from(encoded, 'base64').toString('utf8'));
    if (isEmbedUrl(parent.toString())) return '';
    return fullJobUrl(parent.toString());
  } catch {
    return '';
  }
}

function preferJobUrl(current, incoming) {
  if (!incoming) return current || '';
  if (!current) return incoming;
  const incomingJob = /\/jobs\/[^/?#]+/i.test(incoming);
  const currentJob = /\/jobs\/[^/?#]+/i.test(current);
  if (incomingJob && !currentJob) return incoming;
  if (currentJob && !incomingJob) return current;
  try {
    const incomingPath = new URL(incoming).pathname;
    const currentPath = new URL(current).pathname;
    if (incomingPath.length > currentPath.length) return incoming;
    if (currentPath.length > incomingPath.length) return current;
  } catch {
    return incoming;
  }
  return incoming;
}

function pageKeyFrom(url, domain) {
  try {
    const parsed = new URL(url);
    if (/(^|\.)applytojob\.com$/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      const applyAt = parts.findIndex((part) => part.toLowerCase() === 'apply');
      if (applyAt >= 0) {
        const rest = parts.slice(applyAt + 1);
        const id = rest[0]?.toLowerCase() === 'confirm' ? rest[1] : rest[0];
        if (id && /^[A-Za-z0-9_-]+$/.test(id)) return `${parsed.origin}/apply/${id}`.slice(0, 300);
      }
    }
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${path}`.slice(0, 300);
  } catch {
    return String(domain || '').trim().slice(0, 300);
  }
}

function mergeFields(current, incoming) {
  const merged = new Map();
  for (const field of current || []) {
    merged.set(`${field.name}|${field.label}`, field);
  }
  for (const field of incoming || []) {
    merged.set(`${field.name}|${field.label}`, field);
  }
  return [...merged.values()].slice(0, FIELD_LIMIT);
}

function applySnapshot(application, snapshot) {
  const nextUrl = preferJobUrl(application.url, snapshot.url);
  application.url = nextUrl || application.url;
  if (nextUrl) {
    application.pageKey = pageKeyFrom(nextUrl, snapshot.domain || application.domain);
    try {
      application.domain = new URL(nextUrl).hostname;
    } catch {
      application.domain = snapshot.domain || application.domain;
    }
  } else {
    application.domain = snapshot.domain || application.domain;
    application.pageKey = snapshot.pageKey || application.pageKey;
  }
  application.pageTitle = captchaLabel(snapshot.pageTitle)
    ? (captchaLabel(application.pageTitle) ? '' : application.pageTitle)
    : (snapshot.pageTitle || application.pageTitle);
  application.sessionId = snapshot.sessionId || application.sessionId;
  application.title = captchaLabel(snapshot.title)
    ? (application.url || application.title)
    : (snapshot.title || (captchaLabel(application.title) ? application.url : application.title));
  application.company = snapshot.company || application.company;
  application.fields = mergeFields(application.fields, snapshot.fields);
  application.appliedAt = new Date();
  if (snapshot.submitted) application.submitted = true;
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
  const rawUrl = String(req.body.url || '').trim().slice(0, 2000);
  let url = fullJobUrl(isEmbedUrl(rawUrl) ? embedParentUrl(rawUrl) : rawUrl);
  if (!url) {
    res.status(204).end();
    return;
  }
  let domain = String(req.body.domain || '').trim().slice(0, 180);
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = domain.slice(0, 180);
    }
  }
  const pageTitleRaw = String(req.body.pageTitle || '').trim().slice(0, 300);
  const pageTitle = captchaLabel(pageTitleRaw) ? '' : pageTitleRaw;
  const title = applicationTitle({
    title: req.body.title,
    pageTitle: pageTitleRaw,
    fields,
    url,
  });
  const company = String(req.body.company || '').trim().slice(0, 180)
    || fieldMatch(fields, /company/i);
  const submitted = req.body.submitted === true;
  const sessionId = String(req.body.sessionId || '').trim().slice(0, 80);
  if (isEmbedUrl(url)) {
    res.status(204).end();
    return;
  }
  const pageKey = pageKeyFrom(url, domain);
  if (!pageKey && fields.length === 0) throw ApiError.badRequest('Application content is required');
  if (!submitted && fields.length === 0) {
    res.status(204).end();
    return;
  }

  const snapshot = {
    url,
    domain,
    title,
    company,
    pageTitle,
    pageKey,
    sessionId,
    fields,
    submitted,
  };
  const openFilter = {
    owner: req.submitter.owner,
    submitter: req.submitter._id,
    pageKey,
    submitted: { $ne: true },
  };
  let application = pageKey
    ? await TrackedApplication.findOne(sessionId ? { ...openFilter, sessionId } : openFilter).sort({ updatedAt: -1 })
    : null;
  if (!application && pageKey) {
    application = await TrackedApplication.findOne(openFilter).sort({ updatedAt: -1 });
  }

  if (application) {
    applySnapshot(application, snapshot);
    await application.save();
    publishApplicationUpdate(req.submitter.owner);
    res.json({ application });
    return;
  }

  application = await TrackedApplication.create({
    owner: req.submitter.owner,
    submitter: req.submitter._id,
    submitterEmail: req.submitter.email,
    submitterName: req.submitter.name,
    ...snapshot,
    appliedAt: new Date(),
  });
  publishApplicationUpdate(req.submitter.owner);
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
  const found = await TrackedApplication.find(filter).sort({ appliedAt: -1 }).limit(500);
  const openByPage = new Map();
  const kept = [];
  const removeIds = [];
  for (const application of found) {
    if (captchaLabel(application.pageTitle)) application.pageTitle = '';
    if (captchaLabel(application.title)) application.title = application.url || '';
    const pageKey = application.pageKey || pageKeyFrom(application.url, application.domain);
    if (pageKey && application.pageKey !== pageKey) application.pageKey = pageKey;
    if (application.submitted || !pageKey) {
      if (application.isModified()) await application.save();
      kept.push(application);
      continue;
    }
    const groupKey = `${application.submitter}|${pageKey}`;
    const existing = openByPage.get(groupKey);
    if (!existing) {
      openByPage.set(groupKey, application);
      kept.push(application);
      continue;
    }
    existing.fields = mergeFields(existing.fields, application.fields);
    if (!existing.url) existing.url = application.url;
    if (!existing.title) existing.title = application.title;
    if (!existing.company) existing.company = application.company;
    removeIds.push(application._id);
  }
  await Promise.all([...openByPage.values()].filter((application) => application.isModified()).map((application) => application.save()));
  if (removeIds.length) {
    await TrackedApplication.deleteMany({ _id: { $in: removeIds }, owner: req.user._id });
  }
  res.json({
    applications: kept.filter((application) => application.submitted === true && !isMailbox(application.url)),
  });
});

export const deleteApplication = asyncHandler(async (req, res) => {
  const application = await TrackedApplication.findOneAndDelete({
    _id: req.params.id,
    owner: req.user._id,
  });
  if (!application) throw ApiError.notFound('Application not found');
  publishApplicationUpdate(req.user._id);
  res.status(204).end();
});

export function streamApplications(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: ready\ndata: {}\n\n');
  const unsubscribe = subscribeApplicationUpdates(req.user._id, () => {
    res.write('event: update\ndata: {}\n\n');
  });
  const unsubscribePresence = subscribePresence(req.user._id, () => {
    res.write('event: presence\ndata: {}\n\n');
  });
  const ping = setInterval(() => {
    res.write(': ping\n\n');
  }, 20000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    unsubscribePresence();
  });
}
