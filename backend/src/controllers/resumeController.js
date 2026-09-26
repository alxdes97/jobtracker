import path from 'node:path';
import { Resume } from '../models/Resume.js';
import { Job } from '../models/Job.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import {
  createUpload,
  displayName,
  extensionOf,
  removeStoredFile,
  saveUploadedFile,
  sendStoredFile,
} from '../utils/uploads.js';

const ALLOWED = new Map([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

export const resumeUpload = createUpload(ALLOWED, 'Upload a PDF, DOC, or DOCX resume');

export const listResumes = asyncHandler(async (req, res) => {
  const resumes = await Resume.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ resumes });
});

export const createResume = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a resume file to upload');

  const ext = extensionOf(req.file.originalname);
  const originalName = path.basename(req.file.originalname).slice(0, 180);
  const mimeType = ALLOWED.get(ext);
  const storedName = await saveUploadedFile(req.file, 'resume', mimeType);

  try {
    const resume = await Resume.create({
      user: req.user._id,
      name: String(req.body.profileName || '').trim().slice(0, 180) || displayName(originalName),
      originalName,
      mimeType,
      size: req.file.size,
      storedName,
    });
    res.status(201).json({ resume });
  } catch (error) {
    await removeStoredFile(storedName);
    throw error;
  }
});

export const updateResume = asyncHandler(async (req, res) => {
  const profileName = String(req.body.profileName ?? req.body.name ?? '').trim().slice(0, 180);
  if (!profileName) throw ApiError.badRequest('Profile name is required');

  const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
  if (!resume) throw ApiError.notFound('Resume not found');

  resume.name = profileName;
  await resume.save();
  res.json({ resume });
});

export const downloadResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
  if (!resume) throw ApiError.notFound('Resume not found');
  await sendStoredFile(res, resume.storedName, resume.originalName);
});

export const deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!resume) throw ApiError.notFound('Resume not found');
  await Job.updateMany(
    { user: req.user._id },
    { $pull: { resumes: { libraryResume: resume._id } } },
  );
  await removeStoredFile(resume.storedName);
  res.status(204).end();
});
