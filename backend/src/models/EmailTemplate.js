import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    category: { type: String, default: 'General', trim: true },
  },
  { timestamps: true },
);

export const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

/**
 * Templates every new account starts with. Placeholders are filled in by the
 * frontend from the job that is open when the template is used.
 */
export const DEFAULT_TEMPLATES = [
  {
    name: 'Recruiter outreach',
    category: 'Outreach',
    subject: 'Interested in the {{jobTitle}} role at {{companyName}}',
    body: `Hi {{contactFirstName}},

I came across the {{jobTitle}} opening at {{companyName}} and it lines up closely with what I have been building lately.

Would you be open to a short conversation about the role and the team?

Thanks,
{{myName}}`,
  },
  {
    name: 'Application follow-up',
    category: 'Follow up',
    subject: 'Following up on my {{jobTitle}} application',
    body: `Hi {{contactFirstName}},

I applied for the {{jobTitle}} role at {{companyName}} on {{dateApplied}} and wanted to follow up.

I am still very interested and happy to share more about my work whenever it is useful.

Best,
{{myName}}`,
  },
  {
    name: 'Post-interview thank you',
    category: 'Interview',
    subject: 'Thank you for your time',
    body: `Hi {{contactFirstName}},

Thank you for taking the time to talk through the {{jobTitle}} role today. I enjoyed hearing how the team approaches its work.

Please let me know if there is anything else I can share.

Best,
{{myName}}`,
  },
];
