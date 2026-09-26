# Job Tracker

A job application tracker: a kanban pipeline for job posts, a CRM for the people you talk to, and a list of the companies you are targeting.

- **Frontend** — Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Backend** — Node.js + Express REST API
- **Database** — MongoDB with Mongoose

## Features

**Jobs**
- Kanban board across Bookmarked → Applying → Applied → Interviewing → Negotiating → Offer Accepted, with drag-and-drop between columns, per-column sorting and hideable columns
- "Close Job" parks a job outside the pipeline; a Closed column appears on the board while any job sits there, so it can be dragged back
- List view with sortable columns, inline excitement rating and bulk delete
- Pipeline header with per-stage counts that doubles as a status filter
- Job detail page with a status stepper, stage-aware guidance checklist and progress bar, dates, notes with autosave, attached resumes, linked contacts and email templates
- Keyword extraction from the job description, grouped into Requirements / Job Responsibilities / Preferred Qualifications with occurrence counts

**People**
- Contacts table with search, grouping, inline editing of goal, status and relationship, and CSV export
- Contact detail page with networking fields, dates, contact information and related jobs

**Companies**
- Companies are created automatically when a job or contact names one, and can be added or edited by hand
- Job and contact counts per company, search, grouping and CSV export

**Accounts**
- Email and password sign-up with bcrypt hashing and JWT sessions; every record is scoped to its owner

## Getting started

### 1. Install dependencies

```bash
npm install
```

This installs both workspaces (`backend` and `frontend`).

### 2. Configure the environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

`backend/.env`:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGODB_URI` | `mongodb://localhost:27017/jobtracker` | Local MongoDB or an Atlas connection string |
| `JWT_SECRET` | — | Required in production; use a long random string |
| `JWT_EXPIRES_IN` | `7d` | Session lifetime |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list of allowed origins |
| `CLOUDFLARE_ACCOUNT_ID` | — | Cloudflare account that owns the R2 bucket |
| `R2_ACCESS_KEY_ID` | — | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | — | R2 API token secret |
| `R2_BUCKET` | `jobtracker` | Private bucket for resumes and job attachments |

### 3. Start MongoDB

Any MongoDB 6+ instance works. With Docker:

```bash
docker compose up -d
```

Or point `MONGODB_URI` at MongoDB Atlas.

### 4. Run the app

```bash
npm run dev
```

The API starts on <http://localhost:5000/api> and the web app on <http://localhost:3000>.

### No MongoDB installed?

```bash
npm run dev:memory
```

This boots a throwaway in-memory MongoDB, seeds the demo account and starts both servers. Data is discarded when you stop it.

### Demo data

```bash
npm run seed
```

Creates `demo@jobtracker.dev` / `demo1234` with one job, one contact and one company.

## Tests

```bash
npm run test:smoke -w backend
```

Runs the API end to end against an in-memory MongoDB: auth, per-user data isolation, job creation, keyword extraction, stage moves, checklists, resumes, contact linking, stats, CSV export and validation.

## Project layout

```
backend/
  src/
    config/        env and database connection
    models/        User, Job, Contact, Company, EmailTemplate
    controllers/   request handlers
    routes/        API surface
    middleware/    JWT auth and error handling
    utils/         keyword extraction, CSV, errors
    scripts/       seed, in-memory dev server, smoke test
frontend/
  app/             App Router pages ((app) group is the authenticated shell)
  components/      UI, grouped by feature
  lib/             API client, shared types, formatting
```

## API

All routes are prefixed with `/api`. Everything except `/health`, `/meta` and `/auth/*` requires an `Authorization: Bearer <token>` header.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register`, `/auth/login` | Create a session |
| `GET` | `/auth/me` | Current user |
| `GET` | `/meta` | Enum values for dropdowns |
| `GET` `POST` | `/jobs` | List and create jobs |
| `GET` `PATCH` `DELETE` | `/jobs/:id` | Read, update, delete a job |
| `PATCH` | `/jobs/:id/move` | Change stage and board position |
| `GET` | `/jobs/stats` | Counts per stage |
| `GET` | `/jobs/export` | CSV download |
| `POST` `PATCH` `DELETE` | `/jobs/:id/checklist[/:itemId]` | Guidance checklist |
| `POST` `DELETE` | `/jobs/:id/resumes[/:resumeId]` | Attached resumes |
| `POST` `DELETE` | `/jobs/:id/contacts[/:contactId]` | Link contacts to a job |
| `GET` `POST` | `/contacts`, `/companies`, `/templates` | List and create |
| `GET` `PATCH` `DELETE` | `/contacts/:id`, `/companies/:id`, `/templates/:id` | Read, update, delete |
| `GET` | `/contacts/export`, `/companies/export` | CSV download |

## Production build

```bash
npm run build   # builds the Next.js app
npm start       # runs the API and the built frontend
```
