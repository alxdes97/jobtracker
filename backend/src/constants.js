export const JOB_STATUSES = [
  'Bookmarked',
  'Applying',
  'Applied',
  'Interviewing',
  'Negotiating',
  'Offer Accepted',
  'Closed',
];

export const CONTACT_RELATIONSHIPS = [
  'Recruiter',
  'Hiring Manager',
  'Referral',
  'Colleague',
  'Friend',
  'Mentor',
  'Other',
];

export const CONTACT_GOALS = [
  'Informational Interview',
  'Referral',
  'Job Opportunity',
  'Advice',
  'Stay In Touch',
];

export const CONTACT_STATUSES = [
  'To Contact',
  'Contacted',
  'Waiting On Reply',
  'In Conversation',
  'Closed',
];

export const COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10000+',
];

export const INTERVIEW_TYPES = [
  'Phone Screen',
  'Recruiter',
  'Hiring Manager',
  'Technical',
  'Behavioral',
  'Panel',
  'Final',
  'Other',
];

export const INTERVIEW_FORMATS = ['Phone', 'Video', 'In Person', 'Hybrid'];

export const COMPANY_TYPES = [
  'Public',
  'Private',
  'Startup',
  'Non-profit',
  'Government',
  'Agency',
  'Contract',
];

/**
 * Checklist items Teal-style guidance shows for each pipeline stage. Progress on
 * a job's current stage drives the "Guidance" completion bar in the UI.
 */
export const GUIDANCE_CHECKLIST = {
  Bookmarked: [
    'Review the job description',
    'Research the company',
    'Identify a contact at the company',
    'Decide if this role is worth applying to',
  ],
  Applying: [
    'Tailor your resume to the job description',
    'Write a cover letter',
    'Collect the keywords you are missing',
    'Prepare your portfolio or work samples',
  ],
  Applied: [
    'Save the confirmation email',
    'Connect with the recruiter',
    'Set a follow-up reminder',
  ],
  Interviewing: [
    'Research your interviewers',
    'Prepare STAR stories',
    'Prepare questions to ask',
    'Send a thank-you note',
  ],
  Negotiating: [
    'Research the salary range',
    'Decide your walk-away number',
    'Get the offer in writing',
  ],
  'Offer Accepted': ['Sign the offer', 'Notify other companies', 'Set a start date'],
  Closed: ['Log what you learned'],
};
