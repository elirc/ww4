# WorkGrid

WorkGrid is a production-style Jira-like work management platform built to teach backend-oriented product engineering. It includes multi-tenant organizations, DB-backed auth sessions, centralized RBAC, projects, issues, workflows, comments, custom fields, saved filters, boards, audit activity, and queued automation jobs.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- Zod
- React Query
- REST APIs
- Vitest

## Quick Start

1. Copy `.env.example` to `.env`
2. Start PostgreSQL and create the database in `DATABASE_URL`
3. Install dependencies
   `npm install`
4. Generate the Prisma client
   `npm run db:generate`
5. Push the schema
   `npm run db:push`
6. Seed demo data
   `npm run db:seed`
7. Start the app
   `npm run dev`

## Demo Accounts

- `owner@acme.test` / `Password123!`
- `lead@acme.test` / `Password123!`
- `member@acme.test` / `Password123!`
- `viewer@acme.test` / `Password123!`
- `outsider@globex.test` / `Password123!`

## Useful Commands

- `npm run lint`
- `npm run test:run`
- `npm run build`

## Docs

- `docs/architecture/README.md`
- `docs/architecture/request-lifecycle.md`
- `docs/learning/guided-reading-path.md`
- `docs/learning/flow-traces.md`
