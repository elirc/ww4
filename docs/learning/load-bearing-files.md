# Load-Bearing Files

These are the files where a small mistake causes a security hole or data corruption rather than a visible bug. For each file: what it does, who calls it (verified by import search), what it calls, what breaks if it is wrong, a likely junior mistake, and one current weakness with a line reference.

## `src/lib/auth/request-context.ts` (66 lines)

- **What it does:** Turns the session into `{ session, organization }` or `{ session, organization, project, access }`.
- **What calls it:** `requireOrganizationContext` is called only by `src/app/api/organizations/[organizationId]/projects/route.ts:22`. `requireProjectAccess` is called by the issues, issue PATCH, comments, filters, automation rules, and automation process routes. `bootstrapService` does **not** use it; it reads the session directly.
- **What it calls:** `requireSessionContext` (`src/lib/auth/session.ts`), `projectRepository.findProjectAccess`, `assertProjectPermission`.
- **What breaks if wrong:** Dropping `organizationId` from the project lookup, or skipping the membership check at `:20-24`, would let any logged-in user act on any tenant's project whose id they know.
- **Likely junior mistake:** Checking project membership without first checking org membership, or making `permission` required and forgetting that the filters, rules, and process routes need the body parsed first.
- **Current weakness:** `permission` is optional (`:35`). A new route that omits it gets a context with **no** permission check, and only the service-layer assert stands in the way.

## `src/lib/permissions/permissions.ts` (82 lines)

- **What it does:** Maps org and project roles to 11 named permissions.
- **What calls it:** `request-context.ts`, `issueService.ts`, `automationService.ts`, `filterService.ts`, `projectService.ts`, and `bootstrapService.ts` (`isOrganizationAdmin` only, `:58`).
- **What it calls:** `ForbiddenError` from `src/lib/http/errors.ts`.
- **What breaks if wrong:** Observers could write, or admins could lose the bypass. Because the bypass is a single `includes` on `orgAdminRoles` (`:29`, `:56-58`), adding a role to that array grants it everything.
- **Likely junior mistake:** Hard-coding `role === "LEAD"` inside services. The codebase avoids this on the server but does exactly this on the client (`workspace-shell.tsx:71-95`).
- **Current weakness:** Org `MEMBER` and `VIEWER` are never consulted, and three declared permissions are never checked (`project:view`, `project:manage`, `custom-field:manage`).

## `src/lib/auth/session.ts` (134 lines)

- **What it does:** Creates, resolves, heartbeats, and clears DB-backed sessions.
- **What calls it:** `authService.ts` (create and clear), `request-context.ts` (`requireSessionContext`), `bootstrapService.ts` (`requireSessionContext`, `getSessionContext`).
- **What it calls:** `authRepository`, `next/headers` `cookies()`, `node:crypto`.
- **What breaks if wrong:** Storing the raw token instead of its hash means a database leak becomes a session-hijack kit. Skipping the expiry check makes cookies valid forever.
- **Likely junior mistake:** Trusting a user id stored in the cookie.
- **Current weakness:** Expired rows are never deleted (`:94-97`), and every request performs a write (`:112`).

## `src/services/issues/issueService.ts` (435 lines)

- **What it does:** Issue create, update, and comment; custom-field validation; assignee membership check; transition enforcement; activity and outbox writes.
- **What calls it:** The issues `POST`, issue `PATCH`, and comments `POST` routes. Nothing else. Automation does not call it, despite the header comment.
- **What it calls:** `projectRepository`, `issueRepository`, `automationService.enqueueIssueEvent`, and the `workflowService` helpers.
- **What breaks if wrong:** Bad custom values, foreign statuses, or non-member assignees get persisted. None of those has a DB constraint (see the invariant table in `docs/architecture/domain-model.md`).
- **Likely junior mistake:** Trusting `statusId` or `customFieldValues` from the client without loading the project configuration first.
- **Current weaknesses:**
  - Transition validation happens outside the transaction, with no optimistic guard (`:290-296` vs `:299-314`).
  - `validateCustomFieldValues` enforces **all** required fields on every update that includes any custom values (`:100-110`), so a partial custom-field update fails unless it re-sends every required field. The UI hides this by always sending all fields.
  - Duplicate `customFieldId` entries in one payload are not rejected. Both go into `Promise.all` upserts on the same unique key (`issueRepository.ts:201-221`).

## `src/repositories/projectRepository.ts` (264 lines)

- **What it does:** Project listing, access lookup, setup loading, member listing, key lookup, and transactional project graph creation.
- **What calls it:** `request-context.ts`, `projectService.ts`, `bootstrapService.ts`, `issueService.ts` (setup and members), `automationService.ts` (members).
- **What it calls:** `src/lib/db.ts`.
- **What breaks if wrong:** `findProjectAccess` is the single tenant gate for every project-scoped route.
- **Likely junior mistake:** `db.project.findUnique({ where: { id } })` without the org filter.
- **Current weakness:** `listProjectMembers` returns every member every time it is called. Assignee checks then scan the list in memory (`issueService.ts:122-127`, `automationService.ts:50-55`). A `findFirst({ projectId, userId })` would be one indexed lookup.

## `src/repositories/issueRepository.ts` (249 lines)

- **What it does:** Issue list, lookup, sequence numbers, create, update, custom-value upsert, comments, activities.
- **What calls it:** `issueService.ts`, `bootstrapService.ts`, `automationService.ts`.
- **What it calls:** `src/lib/db.ts`, `DbClient` type.
- **What breaks if wrong:** Any write keyed on `id` alone would let one tenant mutate another's issue by id.
- **Likely junior mistake:** `issue.update({ where: { id } })`.
- **Current weakness:** `getNextSequenceNumber` (`:152-164`) is a read-then-insert race that only the unique index catches. The `priority as never` cast (`:61`) skips type checking for an unused filter path.

## `src/services/automation/automationService.ts` (232 lines)

- **What it does:** Rule creation, job enqueueing (inside callers' transactions), and batch processing.
- **What calls it:** `issueService.ts` (enqueue), the rules route, the process route.
- **What it calls:** `automationRepository`, `issueRepository`, `projectRepository`.
- **What breaks if wrong:** Duplicate or cross-project side effects. Every repository call here passes `input.access.organizationId` / `projectId`, so a job from project A cannot touch project B's issue.
- **Likely junior mistake:** Running rules inline in the issue transaction. Then a broken rule would make the user's own edit fail.
- **Current weaknesses:**
  - Per-rule transactions mean partial application (`:155`).
  - No retry, and `attempts` is unused.
  - `PROCESSING` jobs are never reclaimed.
  - Rule conditions and action payload are not validated against the project when the rule is created (`createRule`, `:63-88`). A `toStatusId` from another project, or an `assigneeId` who is not a member, is accepted and fails only at run time.

## `src/services/bootstrap/bootstrapService.ts` (183 lines)

- **What it does:** Builds the entire dashboard payload.
- **What calls it:** `src/app/api/bootstrap/route.ts:18`.
- **What it calls:** `session.ts`, `permissions.ts`, and four repositories.
- **What breaks if wrong:** It is the only read path for the UI. A missing org filter here would show another tenant's issues to every user.
- **Likely junior mistake:** Returning raw Prisma objects (with `passwordHash` on included users, for example). The repository `select`s (`issueRepository.ts:70-79`, `projectRepository.ts:142-148`) prevent that.
- **Current weakness:** It always uses the session's **active** org (`:60`). There is no way to view a second org's projects without changing `activeOrganizationId`, and no endpoint does that.

## `prisma/schema.prisma` (400 lines)

- **What it does:** Defines 18 models, 10 enums, and the unique and index constraints.
- **What calls it:** `prisma generate` produces the client that every repository imports. `db push` applies it.
- **What breaks if wrong:** Losing `@@unique([projectId, sequenceNumber])` would let duplicate issue keys commit silently. Losing `organizationId` from a child model would force joins for every tenant filter.
- **Likely junior mistake:** Modeling invariants (one initial status, assignee is a member) only in code without saying so anywhere. This schema does that, and `docs/architecture/domain-model.md` lists them.

## Exercises

1. **Goal:** Verify the "what calls it" lists yourself.
   **Check:** For each file above, search `src/` for its import path (for example `@/lib/auth/request-context`). The results should match the bullet. Note any discrepancy against the file's header comment.
2. **Goal:** Find the single change that would most widen the blast radius of a bug.
   **Check:** Compare removing `organizationId` from `findProjectAccess` (`projectRepository.ts:69`) with removing it from `findIssueForProject` (`issueRepository.ts:126`). The first opens every project route to other tenants. The second is still guarded by `projectId`, which was already tenant-checked. Explain why.
