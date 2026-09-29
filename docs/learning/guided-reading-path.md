# Guided Reading Path

## Step 1 — src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts
**Why read this:** It is the cleanest example of the route-handler pattern used across the app.
**What to look for:** The order of operations: auth context first, Zod parse second, service call third.
**What to trace:** It calls `requireProjectAccess()` in `src/lib/auth/request-context.ts`, `createIssueSchema` in `src/lib/validation/issueSchemas.ts`, and `issueService.createIssue()` in `src/services/issues/issueService.ts`.
**What a junior would likely miss:** The security check happens before the service ever sees the payload.

## Step 2 — src/lib/auth/request-context.ts
**Why read this:** It is where session data becomes tenant-aware organization or project access.
**What to look for:** `requireOrganizationContext()` and `requireProjectAccess()` turn the session into scoped access objects.
**What to trace:** It calls `requireSessionContext()` in `src/lib/auth/session.ts`, `projectRepository.findProjectAccess()` in `src/repositories/projectRepository.ts`, and `assertProjectPermission()` in `src/lib/permissions/permissions.ts`.
**What a junior would likely miss:** Membership checks need to happen before service logic, not after.

## Step 3 — src/lib/auth/session.ts
**Why read this:** It shows the cookie-to-database session pattern without hiding revocation or expiry behind a framework.
**What to look for:** `createSessionCookie()`, `getSessionContext()`, and the orphan-session cleanup branch.
**What to trace:** It calls `authRepository.createSession()`, `authRepository.findSessionByTokenHash()`, and `authRepository.updateSessionHeartbeat()` in `src/repositories/authRepository.ts`.
**What a junior would likely miss:** The browser cookie is not trusted on its own; the token is resolved back to a DB session row.

## Step 4 — src/lib/permissions/permissions.ts
**Why read this:** It is the central RBAC matrix for the application.
**What to look for:** How org admin roles bypass project-level checks and how project roles map to named permissions.
**What to trace:** It is called by `src/lib/auth/request-context.ts`, `src/services/projects/projectService.ts`, `src/services/issues/issueService.ts`, and `src/services/automation/automationService.ts`.
**What a junior would likely miss:** The permission names are part of the architecture; once they drift, docs and reviews get harder.

## Step 5 — src/services/issues/issueService.ts
**Why read this:** This is the highest-value business logic file in the codebase.
**What to look for:** `createIssue()`, `updateIssue()`, and `addComment()` each own real product rules instead of pushing them into the UI or repository.
**What to trace:** It calls `projectRepository.getProjectSetup()`, `issueRepository.findIssueForProject()`, `issueRepository.createActivity()`, and `automationService.enqueueIssueEvent()`.
**What a junior would likely miss:** Custom-field validation is contextual and depends on project configuration loaded from the database.

## Step 6 — src/services/workflows/workflowService.ts
**Why read this:** It isolates the workflow/state-transition rules from general issue editing.
**What to look for:** `assertValidStatusTransition()` rejecting done-to-active moves.
**What to trace:** It is called from `src/services/issues/issueService.ts`.
**What a junior would likely miss:** Status updates are not just generic field patches; they are state transitions.

## Step 7 — src/repositories/issueRepository.ts
**Why read this:** It shows how multi-tenant issue reads and writes stay scoped in the data layer.
**What to look for:** `findIssueForProject()` and its deliberate `organizationId + projectId + issueId` guard.
**What to trace:** It is called by `src/services/issues/issueService.ts`, `src/services/bootstrap/bootstrapService.ts`, and `src/services/automation/automationService.ts`.
**What a junior would likely miss:** Child records like comments and custom-field values still need tenant context, not just the parent issue id.

## Step 8 — src/repositories/projectRepository.ts
**Why read this:** It contains the project access query and the project graph creation transaction.
**What to look for:** `findProjectAccess()`, `getProjectSetup()`, and `createProjectGraph()`.
**What to trace:** It is called by `src/lib/auth/request-context.ts`, `src/services/projects/projectService.ts`, and `src/services/bootstrap/bootstrapService.ts`.
**What a junior would likely miss:** Project creation is more than one row; it bootstraps workflow statuses, a board, board columns, and custom fields.

## Step 9 — src/services/automation/automationService.ts
**Why read this:** It demonstrates a small but realistic async workflow design.
**What to look for:** `enqueueIssueEvent()` versus `processPendingJobs()` and why they are separate.
**What to trace:** It calls `automationRepository.claimPendingJobs()`, `automationRepository.completeJob()`, and issue repository write methods.
**What a junior would likely miss:** Queue processing has to claim work first or concurrent processors will duplicate side effects.

## Step 10 — src/services/bootstrap/bootstrapService.ts
**Why read this:** It shows how to compose a dashboard payload without exposing raw ORM models.
**What to look for:** `getWorkspaceBootstrap()` selecting one project and serializing nested board, issue, and automation data for the client.
**What to trace:** It calls `projectRepository.listProjectsForUserInOrganization()`, `projectRepository.getProjectSetup()`, `issueRepository.listIssuesForProject()`, `filterRepository.listVisibleFilters()`, and `automationRepository.listRulesForProject()`.
**What a junior would likely miss:** API contracts should be shaped intentionally instead of returning whatever Prisma gives back.

## Step 11 — src/components/app/workspace-shell.tsx
**Why read this:** It is the main client consumer of the backend API surface.
**What to look for:** React Query mutations call REST endpoints, but no business rules live here.
**What to trace:** It calls `/api/bootstrap`, `/api/.../issues`, `/api/.../filters`, and `/api/.../automation/...` through `src/lib/api/client.ts`.
**What a junior would likely miss:** Client-side permission checks are UX hints only; the real protection still lives on the server.

## Step 12 — prisma/schema.prisma
**Why read this:** It is the ground truth for the domain model and tenant ownership.
**What to look for:** Which records carry `organizationId`, where many-to-many roles live, and how issue workflow state is modeled.
**What to trace:** Repository files under `src/repositories/` issue queries directly against these models.
**What a junior would likely miss:** If `organizationId` is missing from a child model, later isolation work becomes much harder.
