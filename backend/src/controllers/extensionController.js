import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import jwt from 'jsonwebtoken';
import { ApplicationSubmitter } from '../models/ApplicationSubmitter.js';
import { EXTENSIONS, ExtensionRelease } from '../models/ExtensionRelease.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';

const EXTENSION_PACKAGES = {
  'application-track': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../application-track'),
};

async function packageFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await packageFiles(fullPath, relative));
    else if (entry.isFile()) files.push({ name: relative.replaceAll('\\', '/'), data: await readFile(fullPath) });
  }
  return files;
}

function zipStored(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const checksum = crc32(file.data);
    const size = file.data.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    local.push(header, name, file.data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(size, 20);
    directory.writeUInt32LE(size, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + size;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

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

async function packagedVersion(key) {
  const directory = EXTENSION_PACKAGES[key];
  if (!directory) return '';
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    return cleanVersion(manifest.version);
  } catch {
    return '';
  }
}

export const listExtensions = asyncHandler(async (_req, res) => {
  const extensions = await ensureExtensions();
  const listed = await Promise.all(extensions.map(async (extension) => ({
    ...extension.toJSON(),
    packageVersion: await packagedVersion(extension.key),
  })));
  res.json({ extensions: listed });
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

export const downloadExtension = asyncHandler(async (req, res) => {
  const key = String(req.params.key || '');
  const directory = EXTENSION_PACKAGES[key];
  if (!directory) throw ApiError.notFound('Extension not found');
  let files = [];
  try {
    files = await packageFiles(directory);
  } catch {
    throw ApiError.notFound('Extension package is not on this server');
  }
  if (!files.some((file) => file.name === 'manifest.json')) {
    throw ApiError.notFound('Extension package is not on this server');
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${key}.zip"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(zipStored(files));
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
