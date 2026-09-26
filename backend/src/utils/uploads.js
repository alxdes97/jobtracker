import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from './apiError.js';

const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

let r2Client;

function usingR2() {
  return Boolean(env.r2.accountId && env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.bucket);
}

function r2() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return r2Client;
}

export function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

export function displayName(filename) {
  const base = path.basename(String(filename || 'file'));
  const ext = extensionOf(base);
  const stem = base.slice(0, base.length - ext.length).trim();
  return (stem || base).slice(0, 180);
}

function folderSegment(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return cleaned || fallback;
}

/** Object prefix for files attached to one job: jobs/{profile}/{job title}/ */
export function jobAttachmentPrefix(profileName, jobTitle) {
  return `jobs/${folderSegment(profileName, 'profile')}/${folderSegment(jobTitle, 'job')}`;
}

function assertKey(storedName) {
  const key = String(storedName || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = key.split('/');
  const allowedRoot = parts[0] === 'resume' || parts[0] === 'jobs';
  if (!allowedRoot || parts.some((part) => !part || part === '.' || part === '..')) {
    throw ApiError.notFound('File not found');
  }
  return key;
}

function localPath(key) {
  const filePath = path.resolve(uploadsDir, ...key.split('/'));
  const relative = path.relative(uploadsDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw ApiError.notFound('File not found');
  }
  return filePath;
}

function attachmentDisposition(downloadName) {
  const name = String(downloadName || 'download').slice(0, 180);
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function missingObject(error) {
  return error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
}

export async function saveUploadedFile(file, prefix, contentType) {
  const filename = `${crypto.randomUUID()}${extensionOf(file.originalname)}`;
  const key = assertKey(`${String(prefix).replace(/^\/+|\/+$/g, '')}/${filename}`);
  const type = contentType || file.mimetype || 'application/octet-stream';

  if (usingR2()) {
    await r2().send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: type,
      }),
    );
    return key;
  }

  const filePath = localPath(key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, file.buffer);
  return key;
}

export async function removeStoredFile(storedName) {
  if (!storedName) return;
  const key = assertKey(storedName);

  if (usingR2()) {
    try {
      await r2().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    } catch (error) {
      if (!missingObject(error)) throw error;
    }
    return;
  }

  await fs.promises.unlink(localPath(key)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

export async function sendStoredFile(res, storedName, downloadName) {
  const key = assertKey(storedName);

  if (usingR2()) {
    let object;
    try {
      object = await r2().send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    } catch (error) {
      if (missingObject(error)) throw ApiError.notFound('File not found');
      throw error;
    }
    res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', attachmentDisposition(downloadName));
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
    await new Promise((resolve, reject) => {
      object.Body.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      object.Body.pipe(res);
    });
    return;
  }

  const filePath = localPath(key);
  try {
    await fs.promises.access(filePath);
  } catch {
    throw ApiError.notFound('File not found');
  }
  res.download(filePath, downloadName || 'download');
}

export function createUpload(allowed, message) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter(_req, file, callback) {
      if (!allowed.has(extensionOf(file.originalname))) {
        callback(ApiError.badRequest(message));
        return;
      }
      callback(null, true);
    },
  }).single('file');
}
