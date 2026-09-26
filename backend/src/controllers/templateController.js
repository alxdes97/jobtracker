import { EmailTemplate, DEFAULT_TEMPLATES } from '../models/EmailTemplate.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';

export const listTemplates = asyncHandler(async (req, res) => {
  let templates = await EmailTemplate.find({ user: req.user._id }).sort({ createdAt: 1 });
  if (templates.length === 0) {
    templates = await EmailTemplate.insertMany(
      DEFAULT_TEMPLATES.map((template) => ({ ...template, user: req.user._id })),
    );
  }
  res.json({ templates });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const { name, subject = '', body = '', category = 'General' } = req.body;
  if (!name?.trim()) throw ApiError.badRequest('Template name is required');
  const template = await EmailTemplate.create({
    user: req.user._id,
    name,
    subject,
    body,
    category,
  });
  res.status(201).json({ template });
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const { name, subject, body, category } = req.body;
  const template = await EmailTemplate.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    {
      ...(name !== undefined ? { name } : {}),
      ...(subject !== undefined ? { subject } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(category !== undefined ? { category } : {}),
    },
    { new: true, runValidators: true },
  );
  if (!template) throw ApiError.notFound('Template not found');
  res.json({ template });
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!template) throw ApiError.notFound('Template not found');
  res.status(204).end();
});
