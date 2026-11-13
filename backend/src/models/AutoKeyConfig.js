import mongoose from 'mongoose';

const bindingSchema = new mongoose.Schema(
  {
    hotkey: { type: String, required: true, trim: true },
    file: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const pairSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, default: '' },
  },
  { _id: false },
);

const autoKeyConfigSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    bindings: { type: [bindingSchema], default: [] },
    clipboardTransform: {
      enabled: { type: Boolean, default: false },
      pairs: { type: [pairSchema], default: [] },
    },
  },
  { timestamps: true },
);

export const AutoKeyConfig = mongoose.model('AutoKeyConfig', autoKeyConfigSchema);
