import mongoose from 'mongoose';
import { CONTACT_GOALS, CONTACT_RELATIONSHIPS, CONTACT_STATUSES } from '../constants.js';

const contactSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    jobTitle: { type: String, trim: true, default: '' },
    companyName: { type: String, trim: true, default: '' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    email: { type: String, trim: true, lowercase: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    twitter: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    relationship: { type: String, enum: [...CONTACT_RELATIONSHIPS, ''], default: '' },
    goal: { type: String, enum: [...CONTACT_GOALS, ''], default: '' },
    status: { type: String, enum: [...CONTACT_STATUSES, ''], default: '' },
    dateSaved: { type: Date, default: Date.now },
    lastContacted: { type: Date, default: null },
    followUp: { type: Date, default: null },
    notes: { type: String, default: '' },
    relatedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  },
  { timestamps: true },
);

contactSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

contactSchema.set('toJSON', { virtuals: true });
contactSchema.set('toObject', { virtuals: true });

export const Contact = mongoose.model('Contact', contactSchema);
