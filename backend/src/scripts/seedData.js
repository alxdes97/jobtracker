import { User } from '../models/User.js';

export const DEMO_EMAIL = 'alexdesmet97@gmail.com';
export const DEMO_PASSWORD = 'alex';

/** Creates the admin account if it is missing, and sets its password. */
export async function seedDemoData() {
  const passwordHash = await User.hashPassword(DEMO_PASSWORD);
  const existing = await User.findOne({ email: DEMO_EMAIL }).select('+passwordHash');

  if (existing) {
    existing.name = 'Alex';
    existing.passwordHash = passwordHash;
    await existing.save();
  } else {
    await User.create({
      name: 'Alex',
      email: DEMO_EMAIL,
      passwordHash,
    });
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}
