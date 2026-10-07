# WorkGrid

WorkGrid is a small Jira-style work tracker used as a backend-engineering study project. The code covers multi-tenant organizations, database-backed cookie sessions, a central role-to-permission matrix, projects with per-project workflows, issues, comments, custom fields, saved filters, a default board per project, an issue activity log, and a queue of automation jobs that is drained by an explicit "Process Queue" request.

It is a teaching codebase, not a finished product. Several features are deliberately thin (see "What is not here" below), and the docs under `docs/` point out real defects you can find in the code.

## Stack (from `package.json`)

- Next.js 16.2.3 App Router with React 19.2.4
- TypeScript, Tailwind CSS 4
- PostgreSQL through Prisma 6 (`prisma/schema.prisma`, `provider = "postgresql"`)
- Zod 4 for request validation (`src/lib/validation/`)
- TanStack React Query 5 on the client (`src/hooks/use-workspace-bootstrap.ts`, `src/components/app/workspace-shell.tsx`)
- bcryptjs for password hashing (`src/lib/auth/password.ts`)
- Vitest 3 for tests (`vitest.config.ts`, `environment: "node"`)

`jose` and `uuid` are listed as dependencies but nothing under `src/` imports them.

## Quick Start

1. Configure the environment. There is no `.env.example` in the repo (`.gitignore` ignores `.env*`). `src/lib/env.ts` supplies defaults for everything, so the only value you usually need is `DATABASE_URL`. Without it the app falls back to `postgresql://postgres:postgres@localhost:5432/workgrid?schema=public` (`src/lib/env.ts:11`). Prisma CLI commands read `DATABASE_URL` themselves (`prisma/schema.prisma:7`), so put it in a `.env` file or your shell.
2. Start PostgreSQL and create the database named in `DATABASE_URL`.
3. `npm install`
4. `npm run db:generate` (runs `prisma generate`)
5. `npm run db:push` (runs `prisma db push`; there is no `prisma/migrations/` folder)
6. `npm run db:seed` (runs `tsx prisma/seed.ts`; the seed deletes every table's rows first, `prisma/seed.ts:20-37`)
7. `npm run dev`

Optional environment variables, all defined in `src/lib/env.ts:3-8`:

| Variable | Default | Used by |
| --- | --- | --- |
| `SESSION_COOKIE_NAME` | `workgrid_session` | `src/lib/auth/session.ts`, `middleware.ts:4` |
| `SESSION_TTL_HOURS` | `72` | `createSessionCookie()` in `src/lib/auth/session.ts:51` |
| `INTERNAL_JOB_TOKEN` | `local-job-token` | Parsed but never read anywhere in `src/` |

## Demo Accounts

All seeded users share the password `Password123!` (`DEMO_PASSWORD`, `prisma/seed.ts:17`). Roles come from `prisma/seed.ts:251-284`:

| Email | Org role | OPS project role | MOB project role |
| --- | --- | --- | --- |
| `owner@acme.test` | `ORG_OWNER` in Acme | admin bypass | admin bypass |
| `lead@acme.test` | `MEMBER` in Acme | `LEAD` | `LEAD` |
| `member@acme.test` | `MEMBER` in Acme | `CONTRIBUTOR` | `CONTRIBUTOR` |
| `viewer@acme.test` | `VIEWER` in Acme | `OBSERVER` | none |
| `outsider@globex.test` | `ORG_OWNER` in Globex | none | none |

The Globex tenant has its own project that also uses key `OPS` (`prisma/seed.ts:286-293`), so the two tenants have colliding project keys on purpose.

## Useful Commands

- `npm run lint` (ESLint 9)
- `npm run test:run` (Vitest, single run)
- `npm run build`

There are four Vitest files with one test case each: `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.test.ts`, `src/lib/validation/issueSchemas.test.ts`, `src/services/workflows/workflowService.test.ts`, and `src/repositories/projectRepository.test.ts`.

This repo also has a separate runtime lab, `tests/issue-service-runtime.test.mjs`, with five `node:test` cases. It loads the real `src/services/issues/issueService.ts` through `tests/helpers/load-typescript.mjs`, which strips TypeScript types with `node:module`'s `stripTypeScriptTypes` and runs the code in a `node:vm` context. The helper's header gives the command: `node --experimental-vm-modules --test <test.mjs>` (`tests/helpers/load-typescript.mjs:2`). No `package.json` script runs it. Nothing in either suite touches a real database. See `docs/learning/testing-rationale.md` for what each one does and does not prove.

## HTTP Surface

Every API route lives under `src/app/api/`. There are exactly these handlers:

| Method and path | File | Permission checked |
| --- | --- | --- |
| `POST /api/auth/login` | `src/app/api/auth/login/route.ts` | none (credentials) |
| `POST /api/auth/logout` | `src/app/api/auth/logout/route.ts` | none |
| `GET /api/bootstrap?projectId=` | `src/app/api/bootstrap/route.ts` | session only |
| `POST /api/organizations/:orgId/projects` | `.../projects/route.ts` | org admin (`assertOrganizationCanCreateProject`) |
| `POST /api/organizations/:orgId/projects/:projectId/issues` | `.../issues/route.ts` | `issue:create` |
| `PATCH /api/organizations/:orgId/projects/:projectId/issues/:issueId` | `.../issues/[issueId]/route.ts` | `issue:edit`, plus `issue:transition` when `statusId` is sent |
| `POST .../issues/:issueId/comments` | `.../comments/route.ts` | `comment:create` |
| `POST /api/organizations/:orgId/filters` | `.../filters/route.ts` | `filter:create`, plus `filter:share` when shared |
| `POST /api/organizations/:orgId/automation/rules` | `.../automation/rules/route.ts` | `automation:manage` |
| `POST /api/organizations/:orgId/automation/process` | `.../automation/process/route.ts` | `job:process` |

## What is not here

These are absent from the code, so do not go looking for them:

- No delete endpoints for anything, and no endpoint to edit, disable, or delete automation rules (`isEnabled` can only be set by the seed).
- No endpoint to switch the active organization. The session's active org is the first membership at login (`src/services/auth/authService.ts:31-40`).
- No project membership management API. Project roles exist only through the seed or the creator becoming `LEAD` (`src/repositories/projectRepository.ts:195-200`).
- No board drag-and-drop or WIP enforcement. `wipLimit` is written (`src/repositories/projectRepository.ts:244`) and displayed (`src/components/app/workspace-shell.tsx:525`) but never checked.
- No background worker. Queued automation jobs run only when someone calls the process endpoint.
- Saved filters are stored server-side but applied client-side (`applySavedFilter()` in `src/components/app/workspace-shell.tsx:97-141`).

## Docs

Start with `docs/learning/guided-reading-path.md`, then:

- `docs/architecture/README.md` - layer map and folder tour
- `docs/architecture/request-lifecycle.md` - five requests traced file by file
- `docs/architecture/auth-and-permissions.md` - sessions, RBAC, tenant isolation
- `docs/architecture/domain-model.md` - every Prisma model and who writes it
- `docs/learning/flow-traces.md` - client-to-database traces with exercises
- `docs/learning/load-bearing-files.md` - files where a mistake hurts most
- `docs/learning/concepts-demonstrated.md` - patterns and where they are imperfect
- `docs/learning/testing-rationale.md` - the four tests and the gaps around them
- `docs/learning/build-journal.md` - design decisions and a senior review of the result

A separate workshop on `issueService.createIssue` lives in `astraupskill/` (start at `astraupskill/README.md`). It pairs with the runtime lab in `tests/`.
