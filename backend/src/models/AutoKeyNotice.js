import mongoose from 'mongoose';

const autoKeyNoticeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    interview: { type: mongoose.Schema.Types.ObjectId, required: true },
    lastNotifiedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

autoKeyNoticeSchema.index({ user: 1, interview: 1 }, { unique: true });

export const AutoKeyNotice = mongoose.model('AutoKeyNotice', autoKeyNoticeSchema);
