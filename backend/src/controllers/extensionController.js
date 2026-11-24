import jwt from 'jsonwebtoken';
import { ApplicationSubmitter } from '../models/ApplicationSubmitter.js';
import { EXTENSIONS, ExtensionRelease } from '../models/ExtensionRelease.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';

function cleanVersion(value) {
  return String(value || '').trim().slice(0, 40);
}

function versionOlder(installed, required) {
  const parts = (value) => String(value).split('.').map((part) => Number.parseInt(part, 10));
  const left = parts(installed);
  const right = parts(required);
  if (left.length < 3 || left.some((part) => Number.isNaN(part))) return true;
  if (right.length < 3 || right.some((part) => Number.isNaN(part))) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

async function ensureExtensions() {
  await Promise.all(EXTENSIONS.map(async (item) => {
    const existing = await ExtensionRelease.findOne({ key: item.key });
    if (!existing) {
      await ExtensionRelease.create(item);
      return;
    }
    if (versionOlder(existing.version, item.version)) {
      existing.version = item.version;
      await existing.save();
    }
  }));
  return ExtensionRelease.find().sort({ name: 1 });
}

export const listExtensions = asyncHandler(async (_req, res) => {
  const extensions = await ensureExtensions();
  res.json({ extensions });
});

export const updateExtension = asyncHandler(async (req, res) => {
  const version = cleanVersion(req.body.version);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw ApiError.badRequest('Use a version like 1.2.0');
  await ensureExtensions();
  const extension = await ExtensionRelease.findOneAndUpdate(
    { key: String(req.params.key || '') },
    { version },
    { new: true },
  );
  if (!extension) throw ApiError.notFound('Extension not found');
  res.json({ extension });
});

export const reportExtension = asyncHandler(async (req, res) => {
  const extensions = await ensureExtensions();
  const extension = extensions.find((item) => item.key === String(req.params.key || ''));
  if (!extension) throw ApiError.notFound('Extension not found');
  const installedVersion = cleanVersion(req.body.version);
  if (!installedVersion) throw ApiError.badRequest('Extension version is required');

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      const seen = { extensionVersion: installedVersion, extensionSeenAt: new Date() };
      if (payload.kind === 'submitter' && extension.key === 'application-track') {
        await ApplicationSubmitter.updateOne({ _id: payload.sub }, seen);
      } else if (!payload.kind && extension.key === 'job-tracker') {
        await User.updateOne({ _id: payload.sub }, seen);
      }
    } catch {
      // A stale sign-in can still learn whether this copy should be updated.
    }
  }

  res.json({
    key: extension.key,
    name: extension.name,
    version: extension.version,
    installedVersion,
    update: versionOlder(installedVersion, extension.version),
  });
});
