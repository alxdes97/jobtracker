import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import jwt from 'jsonwebtoken';
import { ApplicationSubmitter } from '../models/ApplicationSubmitter.js';
import { EXTENSIONS, ExtensionRelease } from '../models/ExtensionRelease.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { publishPresence } from '../realtime/applicationUpdates.js';
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

async function mobileUserscript() {
  const directory = EXTENSION_PACKAGES['application-track'];
  const [host, background, content, manifestText] = await Promise.all([
    readFile(path.join(directory, 'mobile-host.js'), 'utf8'),
    readFile(path.join(directory, 'background.js'), 'utf8'),
    readFile(path.join(directory, 'content.js'), 'utf8'),
    readFile(path.join(directory, 'manifest.json'), 'utf8'),
  ]);
  const version = cleanVersion(JSON.parse(manifestText).version) || '1.3.3';
  return `// ==UserScript==
// @name         Application Track
// @namespace    application-track
// @version      ${version}
// @description  Record a submitted job application from Android or iPad
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==
${host}
installMobile(${JSON.stringify(background)}, ${JSON.stringify(content)}, ${JSON.stringify(version)});
`;
}

export const mobileScript = asyncHandler(async (req, res) => {
  if (String(req.params.key || '') !== 'application-track') throw ApiError.notFound('Extension not found');
  let script = '';
  try {
    script = await mobileUserscript();
  } catch {
    throw ApiError.notFound('Extension package is not on this server');
  }
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="application-track.user.js"');
  res.send(script);
});

export const downloadMobile = asyncHandler(async (req, res) => {
  if (String(req.params.key || '') !== 'application-track') throw ApiError.notFound('Extension not found');
  const directory = EXTENSION_PACKAGES['application-track'];
  let files = [];
  try {
    files = await packageFiles(directory);
    files.push({ name: 'application-track.user.js', data: Buffer.from(await mobileUserscript()) });
  } catch {
    throw ApiError.notFound('Extension package is not on this server');
  }
  if (!files.some((file) => file.name === 'manifest.json')) {
    throw ApiError.notFound('Extension package is not on this server');
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="application-track-mobile.zip"');
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
        const submitter = await ApplicationSubmitter.findOneAndUpdate({ _id: payload.sub }, seen, { new: true });
        if (submitter) publishPresence(submitter.owner);
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

export const leaveExtension = asyncHandler(async (req, res) => {
  if (String(req.params.key || '') !== 'application-track') throw ApiError.notFound('Extension not found');
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw ApiError.unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized();
  }
  if (payload.kind !== 'submitter') throw ApiError.unauthorized();
  const submitter = await ApplicationSubmitter.findOneAndUpdate(
    { _id: payload.sub },
    { extensionSeenAt: null },
    { new: true },
  );
  if (!submitter) throw ApiError.unauthorized();
  publishPresence(submitter.owner);
  res.status(204).end();
});
