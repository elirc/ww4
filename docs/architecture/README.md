# Architecture Overview

WorkGrid is a multi-tenant Jira-style tracker organized around one data path:

```
route handler -> auth/request context -> Zod parse -> service -> repository -> Prisma -> PostgreSQL
```

Business rules and tenant filters stay out of React components. The client only talks to the server over HTTP through `apiFetch()` in `src/lib/api/client.ts`.

The order of "auth" and "Zod parse" is not the same in every route. Routes whose URL already names the project (issues, issue update, comments) resolve access first and parse second. Routes that read the project id from the request body (filters, automation rules, automation processing) must parse first, because they need `payload.projectId` before they can check access. Compare `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts:22-27` with `src/app/api/organizations/[organizationId]/filters/route.ts:22-27`.

## Top-Level Folders

- `prisma/`
  `prisma/schema.prisma` defines 18 models and 10 enums. `Organization` is the tenant root. `prisma/seed.ts` wipes every table (`prisma/seed.ts:20-37`) and then creates two tenants (Acme and Globex), three projects, four issues, one shared saved filter, one automation rule, and one pending automation job.
- `src/app/`
  App Router pages and REST handlers. Pages: `/` (`src/app/page.tsx`, a static landing page), `/login` (`src/app/login/page.tsx`), and `/app` (`src/app/app/page.tsx`, which just renders `<WorkspaceShell />`). API handlers live under `src/app/api/`. The README lists all ten of them.
- `src/lib/`
  Cross-cutting infrastructure:
  - `src/lib/auth/session.ts` turns the cookie into a server-side session.
  - `src/lib/auth/request-context.ts` turns the session into organization or project access.
  - `src/lib/permissions/permissions.ts` holds the role-to-permission matrix.
  - `src/lib/validation/*.ts` holds the Zod request schemas.
  - `src/lib/http/errors.ts` and `src/lib/http/responses.ts` define typed errors and map them to JSON responses.
  - `src/lib/env.ts` parses environment variables with defaults.
  - `src/lib/db.ts` creates a singleton `PrismaClient`.
- `src/repositories/`
  Only database access. Five repositories: `authRepository`, `projectRepository`, `issueRepository`, `filterRepository`, `automationRepository`. `issueRepository` and `automationRepository` accept an optional `DbClient` (`src/repositories/repositoryTypes.ts:3`), so services can pass a transaction client (`tx`) and run several writes atomically.
- `src/services/`
  Business rules:
  - `issues/issueService.ts` handles issue create, update, and comment, plus custom-field validation.
  - `workflows/workflowService.ts` checks status membership and the "done is terminal" rule.
  - `projects/projectService.ts` and `projects/projectTemplates.ts` create projects from the default template.
  - `automation/automationService.ts` creates rules, enqueues jobs, and processes them.
  - `filters/filterService.ts` saves filters.
  - `bootstrap/bootstrapService.ts` builds the dashboard payload.
  - `auth/authService.ts` handles login and logout.
- `src/components/` and `src/hooks/`
  Client code. `src/components/app/workspace-shell.tsx` (741 lines) is the whole authenticated UI. It reads `/api/bootstrap` through `useWorkspaceBootstrap()` (`src/hooks/use-workspace-bootstrap.ts:8-14`) and sends every write through a React Query mutation (`src/components/app/workspace-shell.tsx:206-328`).
- `src/types/domain.ts`
  Hand-written API view types (`WorkspaceBootstrap`, `IssueView`, `ProjectAccessContext`, and others). These are the response contract between `bootstrapService` and the client.
- `middleware.ts`
  Redirects only, based on whether a cookie exists. It does not validate the session. See `docs/architecture/auth-and-permissions.md`.

## Walkthrough: one write, every layer

Use `PATCH /api/organizations/:orgId/projects/:projectId/issues/:issueId` to see each layer do its job:

1. **Route.** `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/route.ts:16-39` awaits `params` (a Promise in Next 16). It calls `requireProjectAccess({ permission: "issue:edit" })`, parses the body with `updateIssueSchema`, and passes `access`, the actor id, and the payload to `issueService.updateIssue()`. It has no business logic.
2. **Request context.** `requireProjectAccess()` (`src/lib/auth/request-context.ts:32-66`) loads the session, checks org membership in memory, loads the project with an org filter, and builds a `ProjectAccessContext` (`src/types/domain.ts:32-38`).
3. **Validation.** `updateIssueSchema` (`src/lib/validation/issueSchemas.ts:29-41`) makes every field optional but rejects an empty object through `.refine`.
4. **Service.** `issueService.updateIssue()` (`src/services/issues/issueService.ts:244-387`) checks permissions again (`:258-262`), loads the issue with tenant filters, validates assignee, custom fields, and transition, and then opens a transaction (`:298`).
5. **Repositories inside the transaction.** The service calls `issueRepository.updateIssue()` (an `updateMany` scoped by id, org, and project, `src/repositories/issueRepository.ts:178-193`), `upsertCustomFieldValues()`, `createActivity()`, and `automationService.enqueueIssueEvent()`, all with the same `tx`.
6. **Errors.** Any thrown `AppError` or `ZodError` reaches `handleRouteError()` (`src/lib/http/responses.ts:20-52`) and becomes `{ error, details }` with the right status code.

## Why The Layers Matter (and where they leak)

- Route handlers stay small. Every handler is 24-50 lines and follows the same try/catch pattern into `handleRouteError()`.
- Services own product rules. Examples: the default project template (`src/services/projects/projectService.ts:64-66`), status transitions (`src/services/workflows/workflowService.ts:39-48`), and automation dispatch.
- Repositories own tenant scoping. Every read in `issueRepository`, `filterRepository`, and `automationRepository` filters on `organizationId`.
- **Leak 1: automation bypasses the issue service.** `automationService.processPendingJobs()` writes comments and assignments by calling `issueRepository` directly (`src/services/automation/automationService.ts:163-196`), not `issueService.addComment()` or `updateIssue()`. Rules in those service methods, such as custom-field validation, do not apply to automation writes. `assertAssigneeIsProjectMember` is also defined twice (`issueService.ts:113-132` and `automationService.ts:45-60`).
- **Leak 2: the permission matrix is duplicated on the client.** `hasClientPermission()` (`src/components/app/workspace-shell.tsx:71-95`) re-implements `projectRolePermissions` by hand. Nothing keeps it in sync with `src/lib/permissions/permissions.ts:31-54`. The server is still authoritative, so drift here hides or shows buttons incorrectly but cannot grant access.
- **Leak 3: dead server-side filtering.** `issueRepository.listIssuesForProject()` accepts a `filter` argument (`src/repositories/issueRepository.ts:26-33`, applied at `:41-66`), but its only caller, `bootstrapService` (`src/services/bootstrap/bootstrapService.ts:91-94`), never passes one. All filtering happens in the browser.

## Exercises

1. **Goal:** Find every place `organizationId` is used as a query filter.
   **Check:** Search `src/repositories/` for `organizationId`. Every `findMany`, `findFirst`, `count`, and `updateMany` that reads tenant data should show up. Then find the three writes keyed by primary key only: `completeJob`, `failJob` (`src/repositories/automationRepository.ts:96-116`), and `updateSessionHeartbeat` (`src/repositories/authRepository.ts:64-72`). For each one, explain why the id it receives is already trusted.
2. **Goal:** Explain why the filters route parses before it checks auth.
   **Check:** Open `src/app/api/organizations/[organizationId]/filters/route.ts`. Line 22 parses the body and line 25 uses `payload.query.projectId`. Then describe what an unauthenticated caller learns from a 400 validation error on that route, compared with a 401.
3. **Goal:** Find out how much server code the client imports.
   **Check:** Search `src/components/` and `src/hooks/` for `@/` imports. Most of them are `apiFetch` (`src/lib/api/client.ts`) or types from `src/types/domain.ts`. There are two exceptions. `src/components/auth/login-form.tsx:19` imports `loginSchema`, so the browser and the server share one validation schema, which is a good thing. `src/components/app/create-project-form.tsx:5` imports `defaultProjectTemplate` from `src/services/projects/projectTemplates.ts`, and that file imports enums from `@prisma/client` (`projectTemplates.ts:11`). Decide whether the template belongs in `src/services/` or in a shared module.
