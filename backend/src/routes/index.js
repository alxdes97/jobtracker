import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as jobs from '../controllers/jobController.js';
import * as contacts from '../controllers/contactController.js';
import * as companies from '../controllers/companyController.js';
import * as templates from '../controllers/templateController.js';
import * as resumes from '../controllers/resumeController.js';
import {
  COMPANY_SIZES,
  COMPANY_TYPES,
  CONTACT_GOALS,
  CONTACT_RELATIONSHIPS,
  CONTACT_STATUSES,
  JOB_STATUSES,
} from '../constants.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.get('/meta', (_req, res) =>
  res.json({
    jobStatuses: JOB_STATUSES,
    contactRelationships: CONTACT_RELATIONSHIPS,
    contactGoals: CONTACT_GOALS,
    contactStatuses: CONTACT_STATUSES,
    companySizes: COMPANY_SIZES,
    companyTypes: COMPANY_TYPES,
  }),
);

router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.get('/auth/me', requireAuth, auth.me);

router.use(requireAuth);

router.get('/jobs', jobs.listJobs);
router.post('/jobs', jobs.createJob);
router.get('/jobs/stats', jobs.jobStats);
router.get('/jobs/export', jobs.exportJobs);
router.get('/jobs/:id', jobs.getJob);
router.patch('/jobs/:id', jobs.updateJob);
router.delete('/jobs/:id', jobs.deleteJob);
router.patch('/jobs/:id/move', jobs.moveJob);
router.post('/jobs/:id/notes', jobs.addNote);
router.patch('/jobs/:id/notes/:noteId', jobs.updateNote);
router.delete('/jobs/:id/notes/:noteId', jobs.deleteNote);
router.post('/jobs/:id/todos', jobs.addTodo);
router.patch('/jobs/:id/todos/:todoId', jobs.updateTodo);
router.delete('/jobs/:id/todos/:todoId', jobs.deleteTodo);
router.post('/jobs/:id/checklist', jobs.addChecklistItem);
router.patch('/jobs/:id/checklist/:itemId', jobs.updateChecklistItem);
router.delete('/jobs/:id/checklist/:itemId', jobs.deleteChecklistItem);
router.post('/jobs/:id/interviews', jobs.addInterview);
router.patch('/jobs/:id/interviews/:interviewId', jobs.updateInterview);
router.delete('/jobs/:id/interviews/:interviewId', jobs.deleteInterview);
router.post('/jobs/:id/interviews/:interviewId/interviewers', jobs.addInterviewer);
router.delete(
  '/jobs/:id/interviews/:interviewId/interviewers/:interviewerId',
  jobs.deleteInterviewer,
);
router.post('/jobs/:id/interviews/:interviewId/conversation', jobs.addConversationEntry);
router.delete(
  '/jobs/:id/interviews/:interviewId/conversation/:entryId',
  jobs.deleteConversationEntry,
);
router.post('/jobs/:id/interviews/:interviewId/feedback', jobs.addFeedback);
router.delete('/jobs/:id/interviews/:interviewId/feedback/:feedbackId', jobs.deleteFeedback);
router.post('/jobs/:id/interviews/:interviewId/practice', jobs.addPracticeSession);
router.post(
  '/jobs/:id/interviews/:interviewId/attachments',
  jobs.interviewAttachmentUpload,
  jobs.addInterviewAttachment,
);
router.get(
  '/jobs/:id/interviews/:interviewId/attachments/:attachmentId/file',
  jobs.downloadInterviewAttachment,
);
router.delete(
  '/jobs/:id/interviews/:interviewId/attachments/:attachmentId',
  jobs.deleteInterviewAttachment,
);
router.post('/jobs/:id/resumes/link', jobs.linkLibraryResume);
router.post('/jobs/:id/resumes', jobs.addResume);
router.delete('/jobs/:id/resumes/:resumeId', jobs.deleteResume);
router.post('/jobs/:id/contacts', jobs.linkContact);
router.delete('/jobs/:id/contacts/:contactId', jobs.unlinkContact);
router.put('/jobs/:id/company', jobs.connectCompany);
router.delete('/jobs/:id/company', jobs.disconnectCompany);

router.get('/contacts', contacts.listContacts);
router.post('/contacts', contacts.createContact);
router.get('/contacts/export', contacts.exportContacts);
router.get('/contacts/:id', contacts.getContact);
router.patch('/contacts/:id', contacts.updateContact);
router.delete('/contacts/:id', contacts.deleteContact);

router.get('/companies', companies.listCompanies);
router.post('/companies', companies.createCompany);
router.get('/companies/export', companies.exportCompanies);
router.get('/companies/:id', companies.getCompany);
router.patch('/companies/:id', companies.updateCompany);
router.delete('/companies/:id', companies.deleteCompany);

router.get('/resumes', resumes.listResumes);
router.post('/resumes', resumes.resumeUpload, resumes.createResume);
router.patch('/resumes/:id', resumes.updateResume);
router.get('/resumes/:id/file', resumes.downloadResume);
router.delete('/resumes/:id', resumes.deleteResume);

router.get('/templates', templates.listTemplates);
router.post('/templates', templates.createTemplate);
router.patch('/templates/:id', templates.updateTemplate);
router.delete('/templates/:id', templates.deleteTemplate);
