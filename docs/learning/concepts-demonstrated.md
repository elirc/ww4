# Concepts Demonstrated

Each concept gives: where it lives, how it works in this code, what goes wrong if it is done badly, where this codebase falls short, and a **Check** you can complete by reading.

## Service Layer

**Where to look:** `src/services/issues/issueService.ts`. `createIssue()` (`:135`), `updateIssue()` (`:244`), and `addComment()` (`:389`) own the rules. The route handlers that call them are 38-39 lines each.
**How it works:** Services take a pre-built `ProjectAccessContext` plus a typed payload. They never see `Request` or cookies. That makes them callable from tests, scripts, or a future worker without HTTP. `bootstrapService` breaks the pattern by calling `requireSessionContext()` itself (`src/services/bootstrap/bootstrapService.ts:57`).
**Risk if wrong:** Rules drift across routes and nobody can review them in one place.
**Where it falls short:** Automation writes through repositories instead of services (`src/services/automation/automationService.ts:163-196`), so service-level rules do not apply to automated edits.
**Check:** Find the one service that cannot be called without a Next.js request scope, and the line that ties it to one. Answer: `bootstrapService`, because `requireSessionContext` uses `cookies()` from `next/headers`.

## Repository Pattern

**Where to look:** `src/repositories/*.ts`. All five export a plain object literal of functions, not a class.
**How it works:** Repositories own query shape and tenant filters. `issueRepository` and `automationRepository` accept an optional `DbClient` (`src/repositories/repositoryTypes.ts:3`) through `getClient(client)` (`issueRepository.ts:17-19`). The same function can therefore run on the global client or inside a caller's transaction.
**Risk if wrong:** Tenant filters become inconsistent once queries spread into services.
**Where it falls short:** `projectRepository`, `filterRepository`, and `authRepository` do not accept a `DbClient`, so they cannot join a transaction. `projectRepository.createProjectGraph` opens its own (`:188`) instead.
**Check:** List the repository methods that can take `tx`. Search for `client?: DbClient`. It appears on twelve repository methods: eight in `issueRepository` and four in `automationRepository` (`enqueueJob`, `claimPendingJobs`, `completeJob`, `failJob`). It also appears on the two private `getClient` helpers and on `automationService.enqueueIssueEvent`.

## Zod Validation Boundary

**Where to look:** `src/lib/validation/issueSchemas.ts`, `projectSchemas.ts`, `automationSchemas.ts`, `filterSchemas.ts`, `authSchemas.ts`.
**How it works:** Routes call `.parse()`. On failure Zod throws, and `handleRouteError` returns 400 with `error.flatten()` details (`src/lib/http/responses.ts:21-31`). Notable techniques:
- `.refine` to reject an empty PATCH (`issueSchemas.ts:39-41`);
- `.superRefine` for the cross-field "exactly one initial status" rule (`projectSchemas.ts:51-60`);
- a `z.union` of two object schemas so that `actionPayload` must match `actionType` (`automationSchemas.ts:35-44`).
**Risk if wrong:** Services have to defend every field, or partial writes slip through.
**Where it falls short:** `customFieldValueSchema.value` is `z.unknown()` (`issueSchemas.ts:16`). Type checking is deferred to the service, which is correct because it needs project config, but the boundary itself accepts anything. `createProjectSchema` does not reject duplicate status keys or two statuses with the same `position`. The DB catches duplicate keys (`@@unique([workflowId, key])`) as a 500.
**Check:** Find the schema whose `.default([])` makes `customFieldValues` optional on create but required in the service type. Answer: `createIssueSchema` (`issueSchemas.ts:26`).

## Auth / Session Flow

**Where to look:** `src/lib/auth/session.ts`.
**How it works:** The server generates a random token, stores its SHA-256 hash, and puts the raw token in an httpOnly cookie. On each request it hashes the cookie, looks up the row, checks expiry, reloads memberships, and writes a heartbeat. Logout deletes the row.
**Risk if wrong:** Expired or revoked sessions keep working.
**Where it falls short:** Expired rows are not purged (`:94-97`). Login timing reveals which emails are registered (`src/services/auth/authService.ts:21-29`). There is no rate limiting.
**Check:** Find which of the five session-related repository functions is called on **every** authenticated request. Answer: `findSessionByTokenHash`, `listMembershipsForUser`, and `updateSessionHeartbeat`, which is three.

## Role-Based Access Control

**Where to look:** `src/lib/permissions/permissions.ts`.
**How it works:** A static `Record<ProjectRole, ProjectPermission[]>` plus an org-admin bypass. Routes request a permission through `requireProjectAccess`, and services assert it again.
**Risk if wrong:** Unauthorized writes, or admins locked out.
**Where it falls short:** The client duplicates the matrix and already disagrees with it on project creation (`src/components/app/workspace-shell.tsx:82-84` vs `permissions.ts:60-64`). Org roles below admin are inert.
**Check:** Find the only permission check that depends on payload content rather than the route. There are two: `issue:transition` when `statusId` is present (`issueService.ts:260-262`), and `filter:share` when `isShared` (`src/services/filters/filterService.ts:29-31`).

## Multi-Tenancy

**Where to look:** `src/repositories/projectRepository.ts:64-82`, `issueRepository.ts:120-150`.
**How it works:** Shared database and shared schema, with an `organizationId` column on tenant-owned rows. The org id comes from the URL and is checked against session memberships. Every repository read then filters on it.
**Risk if wrong:** A valid id from tenant A resolves in tenant B.
**Where it falls short:** There is no database-level enforcement (no Postgres row-level security). Isolation depends entirely on every query remembering the filter. Only one query has a test (`src/repositories/projectRepository.test.ts`).
**Check:** The seed gives both tenants a project keyed `OPS` (`prisma/seed.ts:261-293`). Find why that is legal. Answer: `@@unique([organizationId, key])` (`prisma/schema.prisma:160`).

## Status / State Transitions

**Where to look:** `src/services/workflows/workflowService.ts:39-48`.
**How it works:** Category-based: DONE is terminal, and everything else moves freely. Each transition writes a `STATUS_CHANGED` activity with from/to metadata and enqueues an automation event.
**Risk if wrong:** Completed work reopens silently, and reports and automations that assume "done means done" break.
**Where it falls short:**
- No per-workflow transition table.
- The check is not atomic with the write (see `docs/architecture/request-lifecycle.md`, Request 3).
- The UI re-sends the current status on every save, which creates "Moved from X to X" activities.
**Check:** In `updateIssue`, find the line where a same-status "transition" still produces a `STATUS_CHANGED` activity. Answer: `:350` checks only that `input.payload.statusId` is truthy, not that it differs from the current status.

## Audit Logging

**Where to look:** `issueRepository.createActivity` (`:241-248`) and its callers.
**How it works:** Activity rows are written in the same transaction as the change: create (`issueService.ts:209-219`), update or status (`:344-362`), custom fields (`:331-341`), comment (`:420-430`), automation (`automationService.ts:199-209`). An activity cannot exist without its change, and the reverse holds too.
**Risk if wrong:** Incomplete timelines.
**Where it falls short:** `ISSUE_UPDATED` stores no diff (`metadata: Prisma.JsonNull`, `issueService.ts:359`), so "Issue details updated." does not say which fields changed. Automation activities name the human who clicked "Process Queue" as the actor.
**Check:** Find the activity type that is defined in the enum but whose rows are only ever written by the seed. Answer: none. All six `IssueActivityType` values (`prisma/schema.prisma:66-73`) have a runtime writer. Confirm this by searching for each value.

## Background Job Design (transactional outbox + manual drain)

**Where to look:** `automationService.enqueueIssueEvent` (`:90-110`), `processPendingJobs` (`:112-228`), `automationRepository.claimPendingJobs` (`:46-94`).
**How it works:** Events are inserted in the same transaction as the issue write. A separate request claims them with a compare-and-set `updateMany` and processes them.
**Risk if wrong:** Automations run twice, get lost, or block the main write.
**Where it falls short:**
- There is no worker; a human must click.
- No retry and no backoff, even though `availableAt` and `attempts` exist.
- `PROCESSING` jobs are orphaned after a crash.
- Partial rule application is possible.
- Conditions use the event snapshot, not the current issue state.
**Check:** Find the column that would support delayed retries if anything wrote to it. Answer: `AutomationJob.availableAt` (`prisma/schema.prisma:370`), read at `automationRepository.ts:53-55`.

## API Composition For Frontend Consumption

**Where to look:** `src/services/bootstrap/bootstrapService.ts` and `src/types/domain.ts:143`.
**How it works:** One endpoint returns the session, project summaries, and the selected project's columns, fields, issues (with comments and activities), filters, rules, pending count, and members. It is serialized field by field.
**Risk if wrong:** The client couples to ORM shapes. Over-fetching leaks columns.
**Where it falls short:** Every mutation refetches the whole payload (`workspace-shell.tsx:200-204`), including every comment on every issue. There is no pagination.
**Check:** Find the activity limit and the comment limit per issue. Answer: activities `take: 8` (`issueRepository.ts:105`); comments have no limit (`:88-100`).
