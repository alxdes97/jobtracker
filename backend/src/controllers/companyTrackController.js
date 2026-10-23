import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { Company } from '../models/Company.js';
import { CompanyTrack } from '../models/CompanyTrack.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function websiteFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.replace(/^www\./i, '');
    return hostname ? `https://${hostname}` : '';
  } catch {
    return '';
  }
}

function domainFromUrl(value) {
  const website = websiteFromUrl(value);
  return website.replace(/^https?:\/\//i, '');
}

function canonicalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return raw.slice(0, 2000);
  }
}

function normalizeRoles(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const roles = [];
  for (const item of value) {
    const text = String(item || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (text.length < 4 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    roles.push(text);
    if (roles.length >= 200) break;
  }
  return roles;
}

function diffRoles(previous, current) {
  const previousRoles = new Map(previous.map((role) => [role.toLowerCase(), role]));
  const currentRoles = new Map(current.map((role) => [role.toLowerCase(), role]));
  const added = [...currentRoles].filter(([key]) => !previousRoles.has(key)).map(([, role]) => role);
  const removed = [...previousRoles].filter(([key]) => !currentRoles.has(key)).map(([, role]) => role);
  return { added, removed, hasChanges: added.length > 0 || removed.length > 0 };
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rolesFromHtml(html) {
  const roles = [];
  const seen = new Set();
  const add = (value) => {
    const text = stripTags(value).slice(0, 140);
    const key = text.toLowerCase();
    if (text.length < 4 || seen.has(key)) return;
    seen.add(key);
    roles.push(text);
  };

  const blocks = String(html).matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    try {
      const walk = (data) => {
        if (!data || roles.length >= 200) return;
        if (Array.isArray(data)) {
          data.forEach(walk);
          return;
        }
        if (typeof data !== 'object') return;
        const type = data['@type'];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes('JobPosting')) add(data.title);
        if (data['@graph']) walk(data['@graph']);
        if (data.itemListElement) walk(data.itemListElement);
      };
      walk(JSON.parse(block[1]));
    } catch {
      // Ignore career pages that embed invalid JSON-LD.
    }
  }

  const links = String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const link of links) {
    if (roles.length >= 200) break;
    if (/job|career|opening|position|apply|role/i.test(link[1])) add(link[2]);
  }
  return roles;
}

function isPrivateAddress(address) {
  const ip = address.toLowerCase();
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function rolesFromPage(pageUrl) {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw ApiError.badRequest('Only public web pages can be tracked');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw ApiError.badRequest('That address cannot be tracked');
  }
  const addresses = isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);
  if (addresses.some(isPrivateAddress)) throw ApiError.badRequest('That address cannot be tracked');

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'JobTrackerCompanyTrack/1.0' },
  });
  if (!response.ok) throw ApiError.badRequest('Could not read that page');
  const html = (await response.text()).slice(0, 500_000);
  return rolesFromHtml(html);
}

function nameFromWebsite(website) {
  const host = website.replace(/^https?:\/\//i, '').split('.')[0] || 'Company';
  return host.charAt(0).toUpperCase() + host.slice(1);
}

async function companyForTrack(userId, name, website) {
  const existing = await Company.findOne({
    user: userId,
    name: new RegExp(`^${escapeRegExp(name)}$`, 'i'),
  });
  if (existing) {
    if (website && !existing.website) {
      existing.website = website;
      await existing.save();
    }
    return existing;
  }

  return Company.create({ user: userId, name, website });
}

function rememberNewRoles(track, roles, trackedAt) {
  if (!roles.length) return;
  track.commits.push({ roles, trackedAt, lastViewedAt: null });
  if (track.commits.length > 30) {
    track.commits = track.commits.slice(-30);
  }
}

export const listCompanyTracks = asyncHandler(async (req, res) => {
  const tracks = await CompanyTrack.find({ user: req.user._id })
    .sort({ lastTrackedAt: -1, trackedAt: -1 })
    .limit(200)
    .populate('company', 'name website');

  await Promise.all(
    tracks.map(async (track) => {
      if (track.commits?.length || !track.addedRoles?.length) return;
      rememberNewRoles(track, track.addedRoles, track.lastTrackedAt || new Date());
      await track.save();
    }),
  );

  res.json({ tracks: tracks.map((track) => track.toJSON()) });
});

export const createCompanyTrack = asyncHandler(async (req, res) => {
  const url = canonicalUrl(req.body.url || req.body.website);
  const website = websiteFromUrl(req.body.website || url);
  const domain = domainFromUrl(url || website);
  if (!website && !url) throw ApiError.badRequest('A company website is required');

  const suppliedRoles = normalizeRoles(req.body.roles);
  let roles = suppliedRoles;
  if (!roles && url) {
    try {
      roles = await rolesFromPage(url);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && /cannot be tracked/.test(error.message)) {
        throw error;
      }
      roles = null;
    }
  }

  const name = String(req.body.name || '').trim().slice(0, 180) || nameFromWebsite(website);
  const company = await companyForTrack(req.user._id, name, website);
  const now = new Date();
  const pageTitle = String(req.body.pageTitle || '').trim().slice(0, 300);
  const existing = await CompanyTrack.findOne({ user: req.user._id, url });

  if (!existing) {
    const track = await CompanyTrack.create({
      user: req.user._id,
      company: company._id,
      name: company.name,
      website: website || company.website,
      domain,
      url,
      pageTitle,
      trackedAt: now,
      lastTrackedAt: now,
      roles: roles || [],
      addedRoles: [],
      removedRoles: [],
      hasChanges: false,
      commits: [],
    });
    const saved = await CompanyTrack.findById(track._id).populate('company', 'name website');
    res.status(201).json({ track: saved.toJSON() });
    return;
  }

  const compared = roles ? diffRoles(existing.roles || [], roles) : null;
  existing.company = company._id;
  existing.name = company.name;
  existing.website = website || existing.website;
  existing.domain = domain || existing.domain;
  existing.pageTitle = pageTitle || existing.pageTitle;
  existing.lastTrackedAt = now;
  if (compared) {
    existing.roles = roles;
    existing.addedRoles = compared.added;
    existing.removedRoles = compared.removed;
    existing.hasChanges = compared.hasChanges;
    rememberNewRoles(existing, compared.added, now);
  }
  await existing.save();

  const saved = await CompanyTrack.findById(existing._id).populate('company', 'name website');
  res.json({ track: saved.toJSON() });
});

export const updateCompanyTrack = asyncHandler(async (req, res) => {
  const track = await CompanyTrack.findOne({ _id: req.params.id, user: req.user._id });
  if (!track) throw ApiError.notFound('Tracked company not found');
  if (req.body.note !== undefined) {
    track.note = String(req.body.note || '').slice(0, 4000);
  }
  await track.save();
  const saved = await CompanyTrack.findById(track._id).populate('company', 'name website');
  res.json({ track: saved.toJSON() });
});

export const viewCompanyTrackCommits = asyncHandler(async (req, res) => {
  const track = await CompanyTrack.findOne({ _id: req.params.id, user: req.user._id });
  if (!track) throw ApiError.notFound('Tracked company not found');

  const now = new Date();
  for (const commit of track.commits) {
    commit.lastViewedAt = now;
  }
  await track.save();

  const saved = await CompanyTrack.findById(track._id).populate('company', 'name website');
  res.json({ track: saved.toJSON() });
});

export const deleteCompanyTrack = asyncHandler(async (req, res) => {
  const track = await CompanyTrack.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!track) throw ApiError.notFound('Tracked company not found');
  res.status(204).end();
});
