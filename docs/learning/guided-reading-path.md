# Guided Reading Path

Twelve stops, in order. Each stop says why to read the file, what to look for, what to trace into, what a junior reader usually misses, and ends with a **Check** you can complete with only the file open. Budget about two hours for the whole path. The three largest files are `src/services/issues/issueService.ts` (435 lines), `prisma/schema.prisma` (400), and `src/components/app/workspace-shell.tsx` (741).

Most source files open with a header comment covering "What this file does / What calls it / What it calls / One thing a junior engineer would likely get wrong". Read those headers, but check their claims against the code. At least two are wrong: `session.ts` calls the cookie "signed" (it is an opaque token), and `issueService.ts` says automation processing calls it (automation calls `issueRepository` directly).

## Step 1: `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts`

**Why read this:** At 38 lines it is the cleanest example of the route-handler pattern.
**What to look for:** The order is `await params`, then `requireProjectAccess(... "issue:create")` (`:22-26`), then `createIssueSchema.parse` (`:27`), then `issueService.createIssue` (`:28-32`), then `ok(issue, { status: 201 })`, with `handleRouteError` in the catch.
**What to trace:** `requireProjectAccess` in `src/lib/auth/request-context.ts`, `createIssueSchema` in `src/lib/validation/issueSchemas.ts:19-27`, `createIssue` in `src/services/issues/issueService.ts:135`.
**What a junior would likely miss:** The access check runs before the body is read, so an unauthorized caller never reaches the parser or the service. Not every route can do this. Open `src/app/api/organizations/[organizationId]/filters/route.ts` and see why it must parse first.
**Check:** Name the HTTP status an outsider (Globex) gets when posting to an Acme project URL, and the line that decides it. Answer: 404, from `request-context.ts:22-24`.

## Step 2: `src/lib/auth/request-context.ts`

**Why read this:** This is where a session becomes tenant-aware access.
**What to look for:** `requireOrganizationContext` (`:18-30`) is a pure in-memory lookup on `session.organizations`. `requireProjectAccess` (`:32-66`) adds the database lookup and builds `ProjectAccessContext`.
**What to trace:** `requireSessionContext` (`src/lib/auth/session.ts:126-134`), `projectRepository.findProjectAccess` (`src/repositories/projectRepository.ts:64-82`), `assertProjectPermission` (`src/lib/permissions/permissions.ts:78-82`).
**What a junior would likely miss:** `projectRole` can be `null` (`:53`). The project resolves even for an org member with no project membership. Permission checks then fail with 403, not 404.
**Check:** Find the exact expression that sets `projectRole`, and explain why `[0]` is safe. Answer: `project.projectMemberships[0]?.role ?? null`. The include filters to the current user, and `@@unique([projectId, userId])` (`prisma/schema.prisma:173`) allows at most one row.

## Step 3: `src/lib/auth/session.ts`

**Why read this:** It shows the cookie-to-database session pattern with nothing hidden behind a framework.
**What to look for:** `createSessionCookie` (`:46-71`), `getSessionContext` (`:84-124`), the orphan branch (`:105-110`), and the heartbeat (`:112`).
**What to trace:** `authRepository.createSession`, `findSessionByTokenHash`, `listMembershipsForUser`, `updateSessionHeartbeat`, and `deleteSessionByTokenHash` (`src/repositories/authRepository.ts:27-78`).
**What a junior would likely miss:** Memberships are reloaded on every request (`:99`), so revoking access takes effect immediately. A JWT with embedded roles would not do that.
**Check:** Find the branch where the DB row survives but the cookie is deleted. Answer: the expiry branch at `:94-97`. Then explain why that row will never be cleaned up.

## Step 4: `src/lib/permissions/permissions.ts`

**Why read this:** The whole RBAC matrix fits in 82 lines.
**What to look for:** The admin bypass (`:66-69`), the role lists (`:31-54`), and the org-level rule for project creation (`:60-64`).
**What to trace:** Callers: `request-context.ts:57`, `issueService.ts:148, 258, 261, 396`, `automationService.ts:77, 117`, `filterService.ts:27, 30`, `projectService.ts:47`.
**What a junior would likely miss:** The client has a separate, hand-written copy of this matrix (`src/components/app/workspace-shell.tsx:71-95`), and the two copies already disagree. The client lets `LEAD` see the Create Project form. The server allows only org admins.
**Check:** Write the client and server answers for "can `lead@acme.test` create a project?" side by side, with line numbers for each.

## Step 5: `src/services/issues/issueService.ts`

**Why read this:** It holds the most business logic in the codebase.
**What to look for:** `validateCustomFieldValues` (`:40-111`), `createIssue` (`:135-242`), `updateIssue` (`:244-387`), `addComment` (`:389-434`). Notice what happens outside versus inside `db.$transaction`.
**What to trace:** `projectRepository.getProjectSetup`, `issueRepository.findIssueForProject` / `createIssue` / `updateIssue` / `upsertCustomFieldValues` / `createActivity`, `automationService.enqueueIssueEvent`, and the three workflow helpers.
**What a junior would likely miss:** Validation (assignee, custom fields, transition) reads the database **before** the transaction. The transaction then writes without re-checking. Look at the `where` of `issueRepository.updateIssue` (`src/repositories/issueRepository.ts:185-190`): it has no `statusId` guard.
**Check:** In `updateIssue`, find the condition that decides between a `STATUS_CHANGED` and an `ISSUE_UPDATED` activity (`:350`). Then explain why every save from the UI produces `STATUS_CHANGED` (hint: `workspace-shell.tsx:571`).

## Step 6: `src/services/workflows/workflowService.ts`

**Why read this:** It separates state-transition rules from field patching.
**What to look for:** `requireWorkflowStatus` (`:15-23`), `requireInitialWorkflowStatus` (`:25-33`), `assertValidStatusTransition` (`:39-48`).
**What to trace:** Callers are only in `issueService.ts`: lines 168, 291, and 295. The file header says automation calls it too, but `automationService.ts` imports nothing from it.
**What a junior would likely miss:** The rule is category-based. Any move between non-DONE statuses is allowed, including TODO straight to DONE.
**Check:** Write the 3x3 category matrix (TODO/ACTIVE/DONE to TODO/ACTIVE/DONE) and mark the two rejected cells.

## Step 7: `src/repositories/issueRepository.ts`

**Why read this:** It shows how tenant scoping is done in the data layer.
**What to look for:** The three-key `where` in `findIssueForProject` (`:122-127`), `updateMany` instead of `update` (`:185`), and the optional `client` argument (`:17-19`).
**What to trace:** Callers: `issueService.ts`, `bootstrapService.ts:91`, `automationService.ts:134, 163, 188, 199`.
**What a junior would likely miss:** Prisma's `update` requires a unique `where`, so tenant scoping on writes forces `updateMany`, which returns `{ count }` instead of the row. `issueService.ts:316-318` turns `count !== 1` into a 404.
**Check:** Find the method that writes `organizationId` on creation but uses only `issueId_customFieldId` to locate an existing row. Answer: `upsertCustomFieldValues` (`:203-218`). Explain why the issue id is already trusted at that point.

## Step 8: `src/repositories/projectRepository.ts`

**Why read this:** It contains the access query and the largest transaction in the app.
**What to look for:** `findProjectAccess` (`:64-82`), `getProjectSetup` (`:84-131`), `createProjectGraph` (`:165-263`).
**What to trace:** `request-context.ts:38`, `projectService.ts:58`, `bootstrapService.ts:59, 86, 108`, `issueService.ts:122, 150`, `automationService.ts:50`.
**What a junior would likely miss:** Creating a project makes seven kinds of rows (project, creator `LEAD` membership, workflow, statuses, board, board columns, custom fields) in one transaction. Columns need status ids, so they are created in a second statement (`:238-246`) after the nested create returns.
**Check:** Find the line that throws if the nested create did not return a board or workflow, and say whether it can ever fire. Answer: `:234-236`. It cannot under normal Prisma behavior, so it is a defensive guard.

## Step 9: `src/services/automation/automationService.ts`

**Why read this:** It is a small queue consumer with real failure modes.
**What to look for:** `enqueueIssueEvent` (`:90-110`) versus `processPendingJobs` (`:112-228`), per-rule transactions (`:155`), and the catch-all `failJob` (`:221-224`).
**What to trace:** `automationRepository.claimPendingJobs` / `completeJob` / `failJob`, `issueRepository` writes, `projectRepository.listProjectMembers`.
**What a junior would likely miss:** Claiming prevents double **claiming**, but not double **effects**. A rule that commits before a later rule fails stays applied, and nothing retries.
**Check:** Explain what `attempts` is used for. Answer: it is incremented at `automationRepository.ts:73-75` and never read.

## Step 10: `src/services/bootstrap/bootstrapService.ts`

**Why read this:** It shapes the first-load API contract.
**What to look for:** Project selection (`:65-67`), the six-way `Promise.all` (`:85-112`), and explicit serialization (`serializeIssue`, `:19-53`).
**What to trace:** `projectRepository.listProjectsForUserInOrganization`, `getProjectSetup`, `listProjectMembers`; `issueRepository.listIssuesForProject`; `filterRepository.listVisibleFilters`; `automationRepository.listRulesForProject`, `countPendingJobs`.
**What a junior would likely miss:** The service reads the session itself (`:57`) instead of receiving it from the route. That is the only service that does.
**Check:** Find the dead export in this file. Answer: `getOptionalSession` (`:180-182`) has no callers in `src/`.

## Step 11: `src/components/app/workspace-shell.tsx`

**Why read this:** It is the only client consumer of the API.
**What to look for:** Eight mutations (`:206-328`), client-side filtering (`:97-141`, `:166-194`), and permission flags (`:344-368`).
**What to trace:** All network calls go through `apiFetch` (`src/lib/api/client.ts`). The bootstrap read goes through `useWorkspaceBootstrap`.
**What a junior would likely miss:** Hiding a form is a UX hint, not security. The detail form is never hidden at all.
**Check:** Count the mutations that send `data?.session.activeOrganization.id` in the URL. Answer: all seven org-scoped ones (`:209`, `:226`, `:241`, `:256`, `:270`, `:291`, `:306`; logout does not). Explain what would happen if `data` were undefined.

## Step 12: `prisma/schema.prisma`

**Why read this:** It is the ground truth for the domain.
**What to look for:** Which models carry `organizationId`, every `@@unique`, and the `onDelete` behaviors (`Cascade` almost everywhere, `Restrict` on `Issue.status` and `Issue.reporter`, `SetNull` on `Issue.assignee` and `SavedFilter.project`).
**What to trace:** Each `@@unique` back to the code path that relies on it. `Issue @@unique([projectId, sequenceNumber])` (`:267`) is the backstop for `getNextSequenceNumber`.
**What a junior would likely miss:** There are no `prisma/migrations/`. The README uses `db push`, so schema changes are not versioned.
**Check:** Find the constraint that turns a duplicate project key race into a 500 instead of a 409. Answer: `@@unique([organizationId, key])` at `:160`, combined with `handleRouteError` not mapping Prisma P2002.
