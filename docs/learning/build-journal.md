# Build Journal

## Stage 1 — Project Summary And Major Decisions
- Built: The initial architectural shape for a multi-tenant Jira-like platform with projects, issues, workflows, comments, filters, boards, custom fields, and automation.
- Decision: Include multi-tenancy because this product is realistically organization-owned, and tenant boundaries become first-class in `prisma/schema.prisma`, `src/lib/auth/request-context.ts`, and repository `organizationId` filters.
- Decision: Use Next.js + REST instead of tRPC so request lifecycles remain explicit in `src/app/api/.../route.ts` files and easier to trace in docs.
- Why: The project is meant to teach backend-oriented product engineering, so visible API boundaries matter more than reducing endpoint boilerplate.

## Stage 2 — Schema, Auth, And Permission Foundations
- Built: `prisma/schema.prisma`, `src/lib/auth/session.ts`, `src/lib/auth/request-context.ts`, `src/lib/permissions/permissions.ts`, and validation schemas under `src/lib/validation/`.
- Decision: Use cookie-backed DB sessions instead of client-trusted JWT-only auth.
- Options considered:
  1. JWT-only sessions
     Pros: fewer DB reads.
     Cons: harder revocation, stale membership context.
  2. Database-backed sessions
     Pros: revocable, org context can be refreshed, clearer for teaching.
     Cons: one extra lookup per request.
- Chosen: Database-backed sessions in `src/lib/auth/session.ts`.
- Why this won:
  Junior engineers often notice “extra DB call”; mid-level engineers notice revocation and expiry; senior engineers care that role changes eventually reflect in auth without a migration-sized rewrite.

## Stage 3 — Service / Repository Split
- Built: Repositories in `src/repositories/` and services in `src/services/`.
- Decision: Keep route handlers thin and move business logic into services, with repositories owning tenant-scoped DB access.
- Options considered:
  1. Business logic in routes
     Pros: fewer files.
     Cons: validation, auth, and workflow rules mix together quickly.
  2. Generic helper layer only
     Pros: less naming overhead.
     Cons: product rules become hard to locate.
  3. Explicit route -> service -> repository split
     Pros: reviewable boundaries, easier tests, clear docs.
     Cons: more files.
- Chosen: Explicit service/repository split.
- Why this won:
  Junior engineers often optimize for fewer files; mid-level engineers notice duplication pressure; senior engineers care about future change isolation once workflows, permissions, and automation get more complex.

## Stage 4 — Core Product Flows
- Built: Project creation, issue creation/update/comment flows, board bootstrap payload, saved filters, and the main workspace client.
- Decision: Use `src/services/bootstrap/bootstrapService.ts` to build one initial dashboard payload instead of many small first-load API calls.
- Options considered:
  1. One request per dashboard widget
     Pros: easy to code incrementally.
     Cons: more client orchestration and harder request tracing.
  2. Aggregated bootstrap payload
     Pros: cleaner first render and clearer learning artifact.
     Cons: larger response.
- Chosen: Aggregated bootstrap payload from `getWorkspaceBootstrap()`.
- Why this won:
  Junior engineers often focus on UI assembly speed; mid-level engineers notice network chatter; senior engineers notice that bootstrapping a page is itself a backend design problem.

## Stage 5 — Workflow Rules And Async Automation
- Built: `src/services/workflows/workflowService.ts`, `src/services/automation/automationService.ts`, and `src/repositories/automationRepository.ts`.
- Decision: Queue automation in `AutomationJob` rows instead of running rules inline during issue writes.
- Options considered:
  1. Inline automation execution
     Pros: fewer moving parts.
     Cons: one broken rule can fail primary issue writes.
  2. Queue-backed processing
     Pros: isolated failures, auditable processing, closer to real systems.
     Cons: more schema and service code.
- Chosen: Queue-backed processing.
- Why this won:
  Junior engineers often see “extra complexity”; mid-level engineers notice resilience and auditability; senior engineers worry about coupling optional side effects to primary write latency.

## Stage 6 — Tests And Teaching Docs
- Built: Focused tests in `src/app/api/.../issues/route.test.ts`, `src/lib/validation/issueSchemas.test.ts`, `src/services/workflows/workflowService.test.ts`, and `src/repositories/projectRepository.test.ts`, plus the architecture/learning docs under `docs/`.
- Decision: Favor a small number of high-signal tests over wide shallow scaffolding.
- Why: The project goal is to demonstrate where production bugs usually enter the system, not to pad test counts.

## PR Slices

### Slice 1 — Tenant-aware schema, auth, and permission bedrock
- Purpose: Establish the data model, DB session flow, and centralized RBAC before feature work.
- Novel logic files:
  `prisma/schema.prisma`
  `src/lib/auth/session.ts`
  `src/lib/auth/request-context.ts`
  `src/lib/permissions/permissions.ts`
  `src/lib/validation/*.ts`
- Reviewer focus:
  Check `prisma/schema.prisma` for consistent `organizationId` ownership on tenant-owned records.
  Check `src/lib/auth/request-context.ts` around `requireProjectAccess()` to verify membership and permission checks happen before services run.
  Check `src/lib/permissions/permissions.ts` to verify org admins and project roles map to the intended permissions.
- Strong-reviewer flag: A junior reviewer might approve session logic that trusts the cookie alone; a stronger reviewer insists on server-side session lookup and expiry handling.

### Slice 2 — Project graph creation and bootstrap read model
- Purpose: Create projects transactionally and expose a first-load dashboard payload.
- Novel logic files:
  `src/repositories/projectRepository.ts`
  `src/services/projects/projectService.ts`
  `src/services/bootstrap/bootstrapService.ts`
  `src/app/api/bootstrap/route.ts`
- Reviewer focus:
  Check `src/repositories/projectRepository.ts` around `createProjectGraph()` to verify board columns and custom fields are created in the same transaction.
  Check `src/services/bootstrap/bootstrapService.ts` for tenant-safe project selection and intentional API serialization.
- Strong-reviewer flag: A junior reviewer might approve raw Prisma model returns; a stronger reviewer asks for a stable API shape.

### Slice 3 — Issue CRUD, comments, and workflow validation
- Purpose: Implement the core issue-management lifecycle with state transitions and activity logging.
- Novel logic files:
  `src/services/issues/issueService.ts`
  `src/services/workflows/workflowService.ts`
  `src/repositories/issueRepository.ts`
  `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/*.ts`
- Reviewer focus:
  Check `src/services/issues/issueService.ts` around `validateCustomFieldValues()` and `updateIssue()` to verify custom fields and transitions are validated against project configuration.
  Check `src/repositories/issueRepository.ts` around `findIssueForProject()` to verify all writes stay scoped by `organizationId` and `projectId`.
- Strong-reviewer flag: A junior reviewer might approve status changes as generic patches; a stronger reviewer asks for explicit transition rules.

### Slice 4 — Filters, automation, and background-style queue processing
- Purpose: Add saved filters, automation rules, and queued job execution.
- Novel logic files:
  `src/services/filters/filterService.ts`
  `src/services/automation/automationService.ts`
  `src/repositories/automationRepository.ts`
  `src/app/api/organizations/[organizationId]/automation/*.ts`
- Reviewer focus:
  Check `src/services/automation/automationService.ts` around `processPendingJobs()` to verify jobs are claimed before execution and completed/failed explicitly.
  Check `src/repositories/automationRepository.ts` around `claimPendingJobs()` for duplicate-processing risk.
- Strong-reviewer flag: A junior reviewer might approve inline automation side effects inside issue writes; a stronger reviewer flags the coupling and asks for queue isolation.

### Slice 5 — Client shell, tests, and code-anchored docs
- Purpose: Build the UI shell that exercises the APIs and add focused enforcement tests plus learning docs.
- Novel logic files:
  `src/components/app/workspace-shell.tsx`
  `src/components/auth/login-form.tsx`
  `vitest.config.ts`
  `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.test.ts`
  `docs/architecture/*`
  `docs/learning/*`
- Reviewer focus:
  Check `src/components/app/workspace-shell.tsx` to ensure it only consumes APIs and does not reimplement backend logic.
  Check `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.test.ts` and `src/repositories/projectRepository.test.ts` to verify the tests are protecting the right failure modes.
- Strong-reviewer flag: A junior reviewer might approve UI-only permission hiding as “secure enough”; a stronger reviewer checks that server tests still prove rejection paths.
