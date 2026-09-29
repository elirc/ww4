# Auth And Permissions

WorkGrid uses cookie-backed server-side sessions plus explicit organization and project authorization contexts.

## Session Flow

- Login payload is validated in `src/lib/validation/authSchemas.ts` with `loginSchema`.
- `src/app/api/auth/login/route.ts` parses the payload and calls `authService.login()`.
- `src/services/auth/authService.ts` verifies the password through `verifyPassword()` in `src/lib/auth/password.ts`, loads memberships with `authRepository.findUserByEmail()` in `src/repositories/authRepository.ts`, and creates the session through `createSessionCookie()` in `src/lib/auth/session.ts`.
- Session lookup happens in `src/lib/auth/session.ts` inside `getSessionContext()`. The cookie token is hashed, resolved back to a `Session` row through `authRepository.findSessionByTokenHash()`, and refreshed with `authRepository.updateSessionHeartbeat()`.
- `src/lib/auth/session.ts` deletes orphaned or expired sessions before the request continues. That means a stale cookie is not enough to stay authenticated.

## Organization Membership

- Organization access starts in `src/lib/auth/request-context.ts` with `requireOrganizationContext(organizationId)`.
- That function loads the current session from `src/lib/auth/session.ts` and then checks whether the authenticated user has a matching organization membership in `session.organizations`.
- If the organization is missing, `requireOrganizationContext()` throws `NotFoundError`, which `src/lib/http/responses.ts` converts into a JSON 404 response.

## Project Access

- Project access is resolved in `src/lib/auth/request-context.ts` with `requireProjectAccess()`.
- `requireProjectAccess()` first checks org membership, then calls `projectRepository.findProjectAccess()` in `src/repositories/projectRepository.ts`.
- The tenant guard is in `src/repositories/projectRepository.ts` inside the `where` clause for `findProjectAccess()`: both `id` and `organizationId` must match before the project can resolve.
- Project roles are loaded from the project’s `projectMemberships` include and converted into `ProjectAccessContext`.

## Role-Based Access Control

- The permission matrix lives in `src/lib/permissions/permissions.ts`.
- Org-wide admin behavior is defined by `isOrganizationAdmin()`, which treats `ORG_OWNER` and `ORG_ADMIN` as bypass roles for all project-level permissions.
- `assertOrganizationCanCreateProject()` in `src/lib/permissions/permissions.ts` protects project creation in `src/services/projects/projectService.ts`.
- `assertProjectPermission()` in `src/lib/permissions/permissions.ts` protects issue creation, issue edits, comments, filter sharing, automation rule creation, and job processing.
- Example: `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` resolves access through `requireProjectAccess(... permission: "issue:create")` before `issueService.createIssue()` runs.
- Example: `src/app/api/organizations/[organizationId]/automation/process/route.ts` requires `"job:process"` before `automationService.processPendingJobs()` can claim queued jobs.

## Tenant Isolation

- Tenant isolation is first-class. The tenant owner is `Organization`, and child records such as `Project`, `Issue`, `SavedFilter`, and `AutomationJob` all carry `organizationId` in `prisma/schema.prisma`.
- Repository methods keep the tenant filter near the query:
  `src/repositories/projectRepository.ts` scopes `findProjectAccess()` and `getProjectSetup()` by `organizationId`.
  `src/repositories/issueRepository.ts` scopes `listIssuesForProject()` and `findIssueForProject()` by both `organizationId` and `projectId`.
  `src/repositories/filterRepository.ts` scopes visible filters by `organizationId`.
  `src/repositories/automationRepository.ts` scopes rules, jobs, and queue counts by `organizationId`.
- The data-isolation test in `src/repositories/projectRepository.test.ts` specifically guards that `projectRepository.findProjectAccess()` always includes the org filter.

## Middleware

- `middleware.ts` only performs coarse UX redirects for `/app` and `/login` based on cookie presence.
- Real security does not rely on middleware alone. The authoritative checks still happen inside `src/lib/auth/session.ts`, `src/lib/auth/request-context.ts`, and `src/lib/permissions/permissions.ts` before services run.
