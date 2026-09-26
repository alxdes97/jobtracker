import { User } from '../models/User.js';
import { EmailTemplate, DEFAULT_TEMPLATES } from '../models/EmailTemplate.js';
import { ApiError, asyncHandler } from '../utils/apiError.js';
import { signToken } from '../middleware/auth.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    throw ApiError.badRequest('Name, email and password are required');
  }
  if (String(password).length < 8) {
    throw ApiError.badRequest('Password must be at least 8 characters');
  }

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw ApiError.conflict('An account with that email already exists');

  const user = await User.create({
    name,
    email,
    passwordHash: await User.hashPassword(password),
  });

  await EmailTemplate.insertMany(
    DEFAULT_TEMPLATES.map((template) => ({ ...template, user: user._id })),
  );

  res.status(201).json({ token: signToken(user._id), user });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }

  res.json({ token: signToken(user._id), user: user.toJSON() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
