import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
    value: { type: String, default: '' },
  },
  { _id: false },
);

const trackedApplicationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submitter: { type: mongoose.Schema.Types.ObjectId, ref: 'ApplicationSubmitter', default: null },
    submitterEmail: { type: String, required: true, trim: true },
    submitterName: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    domain: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    pageTitle: { type: String, trim: true, default: '' },
    pageKey: { type: String, trim: true, default: '' },
    sessionId: { type: String, trim: true, default: '' },
    submitted: { type: Boolean, default: false },
    fields: { type: [fieldSchema], default: [] },
    appliedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

trackedApplicationSchema.index({ owner: 1, appliedAt: -1 });
trackedApplicationSchema.index({ owner: 1, submitter: 1, pageKey: 1, submitted: 1 });

export const TrackedApplication = mongoose.model('TrackedApplication', trackedApplicationSchema);
