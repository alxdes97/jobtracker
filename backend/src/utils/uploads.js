import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { ApiError } from './apiError.js';

const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

export function displayName(filename) {
  const base = path.basename(String(filename || 'file'));
  const ext = extensionOf(base);
  const stem = base.slice(0, base.length - ext.length).trim();
  return (stem || base).slice(0, 180);
}

export function storedFilePath(storedName) {
  const safeName = path.basename(String(storedName || ''));
  if (!safeName) throw ApiError.notFound('File not found');
  const filePath = path.resolve(uploadsDir, safeName);
  if (filePath !== path.join(uploadsDir, safeName)) throw ApiError.notFound('File not found');
  return filePath;
}

export async function removeStoredFile(storedName) {
  if (!storedName) return;
  await fs.promises.unlink(storedFilePath(storedName)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

export async function sendStoredFile(res, storedName, downloadName) {
  const filePath = storedFilePath(storedName);
  try {
    await fs.promises.access(filePath);
  } catch {
    throw ApiError.notFound('File not found');
  }
  res.download(filePath, downloadName || 'download');
}

export function createUpload(allowed, message) {
  return multer({
    storage: multer.diskStorage({
      destination(_req, _file, callback) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        callback(null, uploadsDir);
      },
      filename(_req, file, callback) {
        callback(null, `${crypto.randomUUID()}${extensionOf(file.originalname)}`);
      },
    }),
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
