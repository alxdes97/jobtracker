import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/authController.js';
import * as jobs from '../controllers/jobController.js';
import * as contacts from '../controllers/contactController.js';
import * as companies from '../controllers/companyController.js';
import * as templates from '../controllers/templateController.js';
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
router.post('/jobs/:id/checklist', jobs.addChecklistItem);
router.patch('/jobs/:id/checklist/:itemId', jobs.updateChecklistItem);
router.delete('/jobs/:id/checklist/:itemId', jobs.deleteChecklistItem);
router.post('/jobs/:id/resumes', jobs.addResume);
router.delete('/jobs/:id/resumes/:resumeId', jobs.deleteResume);
router.post('/jobs/:id/contacts', jobs.linkContact);
router.delete('/jobs/:id/contacts/:contactId', jobs.unlinkContact);

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

router.get('/templates', templates.listTemplates);
router.post('/templates', templates.createTemplate);
router.patch('/templates/:id', templates.updateTemplate);
router.delete('/templates/:id', templates.deleteTemplate);
