import mongoose from 'mongoose';

const extensionReleaseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const ExtensionRelease = mongoose.model('ExtensionRelease', extensionReleaseSchema);

export const EXTENSIONS = [
  { key: 'application-track', name: 'Application Track', version: '1.1.0' },
  { key: 'job-tracker', name: 'Job Tracker', version: '1.1.0' },
];
