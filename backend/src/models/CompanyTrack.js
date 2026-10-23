import mongoose from 'mongoose';

const commitSchema = new mongoose.Schema(
  {
    /** Role titles that appeared on this visit. */
    roles: { type: [String], default: [] },
    trackedAt: { type: Date, default: Date.now },
    lastViewedAt: { type: Date, default: null },
  },
  { _id: true },
);

const companyTrackSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    name: { type: String, required: true, trim: true },
    website: { type: String, trim: true, default: '' },
    domain: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    pageTitle: { type: String, trim: true, default: '' },
    note: { type: String, default: '', maxlength: 4000 },
    /** First time this page was tracked. */
    trackedAt: { type: Date, default: Date.now },
    lastTrackedAt: { type: Date, default: Date.now },
    /** Latest role titles found on the page. */
    roles: { type: [String], default: [] },
    addedRoles: { type: [String], default: [] },
    removedRoles: { type: [String], default: [] },
    hasChanges: { type: Boolean, default: false },
    /** Each time new roles appear, that visit is kept as its own commit. */
    commits: { type: [commitSchema], default: [] },
  },
  { timestamps: true },
);

companyTrackSchema.index({ user: 1, trackedAt: -1 });

export const CompanyTrack = mongoose.model('CompanyTrack', companyTrackSchema);
