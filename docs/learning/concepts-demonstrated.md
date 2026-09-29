# Concepts Demonstrated

## Service Layer
Where to look: `src/services/issues/issueService.ts` — `createIssue()`, `updateIssue()`, and `addComment()` own the business rules instead of route handlers or React components.
Also see: `src/services/projects/projectService.ts` for transactional project bootstrapping.
Risk if wrong: Business rules drift across routes and become impossible to review consistently.

## Repository Pattern
Where to look: `src/repositories/projectRepository.ts` — `findProjectAccess()` and `createProjectGraph()` isolate tenant-scoped queries and graph creation.
Also see: `src/repositories/issueRepository.ts` for issue/comment/activity persistence.
Risk if wrong: DB access starts leaking into services and tenant filters become inconsistent.

## Zod Validation Boundary
Where to look: `src/lib/validation/issueSchemas.ts` — `createIssueSchema` and `updateIssueSchema` reject malformed request shapes before service logic executes.
Also see: `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` for where `.parse()` is called.
Risk if wrong: Invalid payloads can create partial writes or force services to defend every field manually.

## Auth / Session Flow
Where to look: `src/lib/auth/session.ts` — `createSessionCookie()` and `getSessionContext()` turn a browser cookie into a revocable server-side session.
Also see: `src/services/auth/authService.ts` for the login orchestration.
Risk if wrong: Expired or orphaned sessions can continue to act as authenticated users.

## Role-Based Access Control
Where to look: `src/lib/permissions/permissions.ts` — `assertProjectPermission()` and `assertOrganizationCanCreateProject()` define the actual RBAC rules.
Also see: `src/lib/auth/request-context.ts` for where those checks are applied before services run.
Risk if wrong: Unauthorized users gain write access or privileged users lose expected capabilities.

## Multi-Tenancy
Where to look: `src/repositories/projectRepository.ts` — `findProjectAccess()` always filters by `organizationId`.
Also see: `src/repositories/issueRepository.ts` for issue-level scoping by `organizationId` and `projectId`.
Risk if wrong: A valid child id from one tenant can resolve records in another tenant.

## Status / State Transitions
Where to look: `src/services/workflows/workflowService.ts` — `assertValidStatusTransition()` rejects done-to-active moves.
Also see: `src/services/issues/issueService.ts` for where status updates call into workflow validation.
Risk if wrong: Completed work can reopen silently and break audit history, reporting, or automation assumptions.

## Audit Logging
Where to look: `src/repositories/issueRepository.ts` — `createActivity()` writes `IssueActivity` rows for issue creation, updates, comments, and automation side effects.
Also see: `src/services/issues/issueService.ts` for when those activity writes happen.
Risk if wrong: Operational timelines become incomplete and reviewers cannot reconstruct who changed what.

## Background Job Design
Where to look: `src/services/automation/automationService.ts` — `enqueueIssueEvent()` writes queue records while `processPendingJobs()` claims and processes them later.
Also see: `src/repositories/automationRepository.ts` for the queue claim/complete/fail persistence methods.
Risk if wrong: Automations can run twice, get lost, or block primary issue writes.

## API Composition For Frontend Consumption
Where to look: `src/services/bootstrap/bootstrapService.ts` — `getWorkspaceBootstrap()` builds a UI-ready payload from multiple repositories.
Also see: `src/components/app/workspace-shell.tsx` for how the client consumes that payload without reaching into the DB layer.
Risk if wrong: The frontend becomes tightly coupled to raw ORM model shapes and breaks whenever the schema changes.
