import mongoose from 'mongoose';
import { INTERVIEW_FORMATS, INTERVIEW_TYPES, JOB_STATUSES } from '../constants.js';

const noteItemSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const todoItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const checklistItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    stage: { type: String, enum: JOB_STATUSES, default: 'Bookmarked' },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const resumeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    isTailored: { type: Boolean, default: false },
    libraryResume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null },
    attachedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const interviewerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: '' },
  },
  { _id: true },
);

const practiceSessionSchema = new mongoose.Schema(
  {
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const conversationEntrySchema = new mongoose.Schema(
  {
    speaker: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    storedName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

attachmentSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.storedName;
    return ret;
  },
});

const feedbackNoteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const interviewSchema = new mongoose.Schema(
  {
    date: { type: Date, default: null },
    type: { type: String, enum: [...INTERVIEW_TYPES, ''], default: '' },
    format: { type: String, enum: [...INTERVIEW_FORMATS, ''], default: '' },
    interviewers: { type: [interviewerSchema], default: [] },
    conversation: { type: [conversationEntrySchema], default: [] },
    feedback: { type: [feedbackNoteSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    practiceSessions: { type: [practiceSessionSchema], default: [] },
  },
  { _id: true },
);

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: JOB_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const jobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    location: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    status: { type: String, enum: JOB_STATUSES, default: 'Bookmarked', index: true },
    /** Manual ordering inside a kanban column. */
    order: { type: Number, default: 0 },
    salaryMin: { type: Number, default: null },
    salaryMax: { type: Number, default: null },
    salaryCurrency: { type: String, default: 'USD' },
    excitement: { type: Number, min: 0, max: 5, default: 0 },
    dateSaved: { type: Date, default: Date.now },
    dateApplied: { type: Date, default: null },
    deadline: { type: Date, default: null },
    followUp: { type: Date, default: null },
    notes: { type: String, default: '' },
    noteItems: { type: [noteItemSchema], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
    todos: { type: [todoItemSchema], default: [] },
    interviews: { type: [interviewSchema], default: [] },
    resumes: { type: [resumeSchema], default: [] },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    statusHistory: { type: [statusEventSchema], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

jobSchema.index({ user: 1, status: 1, order: 1 });

jobSchema.pre('save', function setInitialHistory(next) {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, changedAt: new Date() });
  }
  next();
});

export const Job = mongoose.model('Job', jobSchema);
