import { User } from '../models/User.js';
import { Job } from '../models/Job.js';
import { Contact } from '../models/Contact.js';
import { Company } from '../models/Company.js';
import { EmailTemplate, DEFAULT_TEMPLATES } from '../models/EmailTemplate.js';
import { GUIDANCE_CHECKLIST } from '../constants.js';

export const DEMO_EMAIL = 'demo@jobtracker.dev';
export const DEMO_PASSWORD = 'demo1234';

const JOB_DESCRIPTION = `About the role
Stride is hiring an AI Engineer to design, build and ship machine learning systems that power our customer-facing products.

Requirements:
- Bachelor's degree in Computer Science, Math, Physics, Engineering, or related quantitative field AND six (6) years' related experience; OR equivalent combination of education and experience.
- Hands-on experience with modern ML libraries (e.g., TensorFlow, PyTorch, scikit-learn) and understanding of statistical principles.
- Proficiency with AWS, Azure, Docker, Kubernetes, and Terraform to build scalable, secure, and high-performing environments.
- Ability to design, implement, and maintain robust ML pipelines, including version control, containerization (Docker, Kubernetes), and CI/CD processes.
- Ensures model integrity and reliability, validating outputs to deliver precise and actionable insights.
- High attention to detail and high level of accuracy.
- Strong analytical skills.
- Strong customer service orientation.
- Professional integrity necessary to maintain confidentiality.
- Strong planning skills and ability to manage multiple projects simultaneously.
- Excellent verbal and written communication skills.

Job Responsibilities:
- Partner with product and data teams to drive adoption of AI features across the platform.
- Build and maintain APIs that expose model inference to downstream services.
- Instrument data pipelines and monitoring so model accuracy is measurable in production.
- Mentor engineers on MLOps practices, testing, and deployment automation.

Preferred Qualifications:
- Experience with large language model applications, prompt engineering, and retrieval systems.
- Familiarity with Snowflake, Databricks, or Spark for large-scale data processing.
- Prior experience in a regulated environment with strong security and compliance requirements.`;

/** Wipes and recreates the demo account's data. Returns its credentials. */
export async function seedDemoData() {
  const user =
    (await User.findOne({ email: DEMO_EMAIL })) ||
    (await User.create({
      name: 'Demo User',
      email: DEMO_EMAIL,
      passwordHash: await User.hashPassword(DEMO_PASSWORD),
    }));

  await Promise.all([
    Job.deleteMany({ user: user._id }),
    Contact.deleteMany({ user: user._id }),
    Company.deleteMany({ user: user._id }),
    EmailTemplate.deleteMany({ user: user._id }),
  ]);

  const stride = await Company.create({
    user: user._id,
    name: 'Stride',
    industry: 'Software Development',
    size: '201-500',
    type: 'Private',
    location: 'New York, NY',
    website: 'https://www.stride.build',
    yearFounded: 2015,
  });

  const job = await Job.create({
    user: user._id,
    title: 'AI Engineer - Mark Ellis Joseph',
    companyName: 'Stride',
    company: stride._id,
    location: 'Remote',
    url: 'https://strideinc.wd1.myworkdayjobs.com',
    description: JOB_DESCRIPTION,
    status: 'Bookmarked',
    order: 0,
    excitement: 4,
    checklist: GUIDANCE_CHECKLIST.Bookmarked.map((label) => ({
      label,
      stage: 'Bookmarked',
      done: false,
    })),
  });

  const contact = await Contact.create({
    user: user._id,
    firstName: 'Stephanie',
    lastName: 'Scotto',
    jobTitle: 'Stride Opportunity - Remote AI Engineer at Stride',
    companyName: 'Stride',
    company: stride._id,
    linkedin: 'https://www.linkedin.com/in/stephanie-scotto-a4a527153/',
    relationship: 'Recruiter',
    relatedJobs: [job._id],
  });

  await Job.updateOne({ _id: job._id }, { $addToSet: { contacts: contact._id } });
  await EmailTemplate.insertMany(
    DEFAULT_TEMPLATES.map((template) => ({ ...template, user: user._id })),
  );

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
}
