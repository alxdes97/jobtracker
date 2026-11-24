import mongoose from 'mongoose';

const applicationSubmitterSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    extensionVersion: { type: String, trim: true, default: '' },
    extensionSeenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applicationSubmitterSchema.index({ email: 1 }, { unique: true });

applicationSubmitterSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

export const ApplicationSubmitter = mongoose.model('ApplicationSubmitter', applicationSubmitterSchema);
