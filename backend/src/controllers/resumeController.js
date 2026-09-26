import path from 'node:path';
import { Resume } from '../models/Resume.js';
import { Job } from '../models/Job.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import {
  createUpload,
  displayName,
  extensionOf,
  removeStoredFile,
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

  try {
    const resume = await Resume.create({
      user: req.user._id,
      name: displayName(originalName),
      originalName,
      mimeType: ALLOWED.get(ext),
      size: req.file.size,
      storedName: req.file.filename,
    });
    res.status(201).json({ resume });
  } catch (error) {
    await removeStoredFile(req.file.filename);
    throw error;
  }
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
