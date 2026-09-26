import mongoose from 'mongoose';
import { COMPANY_SIZES, COMPANY_TYPES } from '../constants.js';

const companySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    industry: { type: String, trim: true, default: '' },
    size: { type: String, enum: [...COMPANY_SIZES, ''], default: '' },
    type: { type: String, enum: [...COMPANY_TYPES, ''], default: '' },
    location: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
    yearFounded: { type: Number, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

companySchema.index({ user: 1, name: 1 }, { unique: true });

export const Company = mongoose.model('Company', companySchema);
