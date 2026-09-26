import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    storedName: { type: String, required: true },
  },
  { timestamps: true },
);

resumeSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.storedName;
    delete ret.user;
    delete ret.__v;
    return ret;
  },
});

export const Resume = mongoose.model('Resume', resumeSchema);
