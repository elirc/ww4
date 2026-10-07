# Flow Traces

These traces start in the browser (`src/components/app/workspace-shell.tsx`) and end in Prisma. `docs/architecture/request-lifecycle.md` covers the server half in more depth. Here the focus is on how the client and the server fit together, and on what you can observe in the code at each hop. Each flow ends with exercises.

How the client is wired: `useWorkspaceBootstrap(selectedProjectId)` (`src/hooks/use-workspace-bootstrap.ts:8-14`) fetches `/api/bootstrap` under the React Query key `["workspace-bootstrap", projectId]`. Every mutation's `onSuccess` calls `invalidateWorkspace()` (`workspace-shell.tsx:200-204`), which refetches the whole bootstrap payload. There are no optimistic updates. After any write, the UI shows exactly what the server returns on the next bootstrap. `apiFetch()` (`src/lib/api/client.ts:1-20`) throws `new Error(body.error)` on any non-2xx response, and the mutation surfaces that error.

---

## Flow 0: First load of `/app`

1. `middleware.ts:10-12`: no cookie redirects to `/login`.
2. `src/app/app/page.tsx` renders `<WorkspaceShell />`, which calls `useWorkspaceBootstrap(undefined)` (`workspace-shell.tsx:160`).
3. `GET /api/bootstrap` (`src/app/api/bootstrap/route.ts:14-24`) passes `projectId` from the query string, or `undefined`.
4. `bootstrapService.getWorkspaceBootstrap()` (`src/services/bootstrap/bootstrapService.ts:56-178`):
   - `requireSessionContext()` (`:57`);
   - lists projects in the active org. Org admins see all of them, everyone else only projects where they have a membership (`:59-63`; `src/repositories/projectRepository.ts:16-62`);
   - picks the requested project or the first one (`:65-67`). An unknown `projectId` silently returns `selectedProject: null` (`:69-83`) instead of an error;
   - otherwise runs six queries in parallel with `Promise.all` (`:85-112`): project setup, issues (with all comments and the latest 8 activities each), visible filters, rules, pending job count, and members;
   - serializes everything into `WorkspaceBootstrap` (`src/types/domain.ts:143`), converting dates with `toISOString()` (`serializeIssue`, `:19-53`).

Cost: every write refetches all issues with all of their comments. That is fine for seed data and grows linearly with project size.

**Exercises**
- **Goal:** Find why `viewer@acme.test` sees only one project.
  **Check:** `isOrgAdmin` is false for `VIEWER` (`bootstrapService.ts:58`). `projectRepository.ts:21-29` then requires `projectMemberships.some({ userId })`, and the viewer has a membership only on OPS (`prisma/seed.ts:270`).
- **Goal:** Find the unscoped serialization.
  **Check:** `customFieldValues` is passed through as-is (`bootstrapService.ts:37`), while comments and activities are mapped field by field. Decide whether that matters given the repository `select` at `issueRepository.ts:82-87`.

---

## Flow 1: Create issue (happy path)

1. The `CreateIssueForm` component (rendered when `canCreateIssue`, `workspace-shell.tsx:425`) calls `createIssueMutation` (`:223-236`).
2. `apiFetch` sends `POST /api/organizations/${activeOrganization.id}/projects/${effectiveProjectId}/issues`. The org id in the URL always comes from the session's active org.
3. `issues/route.ts:22-26`: `requireProjectAccess` with `issue:create`.
4. `src/lib/auth/request-context.ts:32-66`: session, then org membership, then `findProjectAccess`, then the permission check.
5. `issues/route.ts:27`: `createIssueSchema.parse`.
6. `src/services/issues/issueService.ts:135-168`: permission re-check, project setup, assignee check, custom-field validation, initial status.
7. `issueService.ts:170-241` transaction: sequence number, issue row, custom values, `ISSUE_CREATED` activity, `AutomationJob`.
8. **201** `{ id, key }`. `onSuccess` shows "Created issue OPS-3." and invalidates the bootstrap.

**Exercises**
- **Goal:** Identify what makes the default project's create form fail when "Customer Impact" is left empty.
  **Check:** `validateCustomFieldValues` (`issueService.ts:100-110`) builds `providedIds` from non-empty values and throws for each required definition that is missing. The definition comes from `src/services/projects/projectTemplates.ts:46-54` (`required: true`).
- **Goal:** Count the queries `createIssue` makes before the transaction opens.
  **Check:** `getProjectSetup` (1) plus `listProjectMembers` (1, only if `assigneeId` is set). That is in addition to the session, membership, heartbeat, and `findProjectAccess` queries done by `requireProjectAccess`.

---

## Flow 2: Permission rejection for a viewer creating an issue

1. In the UI, `canCreateIssue` is false for an `OBSERVER` (`hasClientPermission`, `workspace-shell.tsx:86-88`), so the form is not rendered. A viewer can still send the request with `fetch` from DevTools.
2. `issues/route.ts:22-26`, then `request-context.ts:56-58`, then `permissions.ts:78-82` throws `ForbiddenError`.
3. `src/lib/http/responses.ts:33-41` returns **403** `{ error: "Missing permission: issue:create.", details: null }`.

**Exercises**
- **Goal:** Find a UI control that the server forbids for a role the UI does not check.
  **Check:** The issue detail form (`workspace-shell.tsx:559-641`) is rendered for every role. There is no `canEdit` flag among `:344-368`. An `OBSERVER` who submits it gets 403 "Missing permission: issue:edit."
- **Goal:** Find a control that the UI shows to a role the server always rejects.
  **Check:** `CreateProjectForm` is rendered when `canManageProject` (`workspace-shell.tsx:418-424`). `hasClientPermission` grants `project-manage` to `LEAD` (`:82-84`). The server, however, requires an org admin (`assertOrganizationCanCreateProject`, `src/lib/permissions/permissions.ts:60-64`). `lead@acme.test` (org `MEMBER`) sees the form, and every submit returns 403 "Only organization admins can create projects."

---

## Flow 3: Invalid done-to-active transition

1. The issue detail form submits `updateIssueMutation.mutateAsync({ title, description, priority, assigneeId, statusId, customFieldValues })` (`workspace-shell.tsx:566-575`).
2. `apiFetch` sends `PATCH .../issues/${effectiveSelectedIssueId}`.
3. `[issueId]/route.ts:22-27`: access with `issue:edit`, then `updateIssueSchema.parse`.
4. `issueService.updateIssue()`: `issue:transition` (`:260-262`), then `findIssueForProject` (`:264-268`), then `requireWorkflowStatus` (`:290-292`), then `assertValidStatusTransition` (`:294-296`).
5. `src/services/workflows/workflowService.ts:45-47` throws `ConflictError`, and the response is **409** `{ error: "Issues in a done state cannot move back to an active state." }`.

The rule only looks at categories. TODO to DONE (skipping ACTIVE) is allowed, and DONE to another DONE status is allowed. The check runs before the transaction (see the race in `request-lifecycle.md`, Request 3).

**Exercises**
- **Goal:** List every transition that `assertValidStatusTransition` allows.
  **Check:** Read `workflowService.ts:39-48`. Every pair is allowed except (DONE to TODO) and (DONE to ACTIVE).
- **Goal:** Find why a 409 here is never retried by React Query.
  **Check:** `src/components/providers/query-provider.tsx:10-17` sets only query defaults (`staleTime: 15_000`, `refetchOnWindowFocus: false`). It configures nothing for mutations, and React Query does not retry mutations by default, so the 409 goes straight to the caller.

---

## Flow 4: Save a shared filter

1. The `SaveFilterForm` submit handler (`workspace-shell.tsx:683-690`) blocks `isShared` when `!canShareFilters` before calling `saveFilterMutation`.
2. `saveFilterMutation` (`:268-287`) sends `POST /api/organizations/:orgId/filters` with `{ name, isShared, query: { projectId, search, statusIds, priority, onlyMyIssues } }`. The current UI state becomes the query. `assigneeId` is valid in the schema but the UI never sets it.
3. `src/app/api/organizations/[organizationId]/filters/route.ts:22` runs `saveFilterSchema.parse` **first** (`src/lib/validation/filterSchemas.ts:23-27`).
4. `filters/route.ts:23-27`: `requireProjectAccess` with `projectId: payload.query.projectId` and `filter:create`.
5. `src/services/filters/filterService.ts:27-31`: `filter:create`, plus `filter:share` when shared.
6. `src/repositories/filterRepository.ts:35-47`: insert with `organizationId`, `projectId`, `ownerId`, and the owner name included.
7. **201** with the saved row.

Applying a saved filter happens entirely in the browser. Clicking a filter copies its query into local state (`workspace-shell.tsx:483-505`), and `applySavedFilter()` (`:97-141`) filters the already-loaded `project.issues`. The server-side filter support in `issueRepository.listIssuesForProject` (`src/repositories/issueRepository.ts:41-66`) is never used.

**Exercises**
- **Goal:** Find whether a saved filter can reference a status from another project.
  **Check:** `filterQuerySchema.statusIds` is just `string[]` (`filterSchemas.ts:18`). Nothing checks the ids against the project's workflow. A foreign id is harmless because filtering is client-side, but it is stored.
- **Goal:** Find who can see a non-shared filter.
  **Check:** `filterRepository.ts:21`: `OR: [{ ownerId }, { isShared: true }]`. Only the owner.

---

## Flow 5: Process the automation queue

1. The "Process Queue" button is rendered only when `canManageAutomation` (`workspace-shell.tsx:702-714`). It calls `processJobsMutation.mutate()` (`:304-317`) with `{ projectId, limit: 10 }`.
2. `process/route.ts:22`: parse, then `:23-27`: access with `job:process`.
3. `src/services/automation/automationService.ts:119-123`: `claimPendingJobs`, which runs `findMany` (`src/repositories/automationRepository.ts:48-61`) and then a per-row compare-and-set `updateMany` (`:65-82`).
4. `automationService.ts:125-128`: load rules, then for each job `findIssueForProject` (`:134-138`).
5. For each enabled rule with the right event type whose conditions match (`:146-153`), one transaction runs the action and writes an `AUTOMATION_TRIGGERED` activity (`:155-210`).
6. `completeJob` (`:215`) or, on any throw, `failJob` (`:221-224`).
7. **200** `{ processed, jobs }`. The toast reads "Processed N automation jobs." (`workspace-shell.tsx:314`).

### Failure semantics, read from the code

- **Partial application.** Each rule runs in its own transaction (`:155`). If rule 1 commits and rule 2 throws, the job is marked `FAILED` but rule 1's comment stays. Nothing records which rules already ran.
- **No retry.** `FAILED` is terminal. `attempts` is incremented on claim (`automationRepository.ts:73-75`) but nothing reads it, and nothing re-queues failed jobs.
- **Stuck jobs.** If the process dies between claim and complete, the job stays `PROCESSING` forever. The claim query only looks at `PENDING` (`automationRepository.ts:52`), and nothing reclaims stale `PROCESSING` rows.
- **Snapshot conditions.** `matchesConditions` compares rule conditions with the **job payload**, which was captured at enqueue time (`automationService.ts:151`), not with the issue's current state. The seeded job (`prisma/seed.ts:401-414`) claims OPS-1 moved to Done, but the seeded issue is In Progress (`prisma/seed.ts:295-305`). Processing it posts "Issue reached done..." on an In Progress issue.
- **Who is the author.** Automation comments use `authorId: input.actorUserId` (`automationService.ts:166`), the human who clicked "Process Queue", with `isSystem: true`. `AUTOMATION_TRIGGERED` activities also carry that human as `actorUserId` (`:204`).
- **Failures are invisible in the response.** Failed jobs are not pushed to `results` (`:221-224`), so the UI's count excludes them, and no endpoint lists failed jobs.

**Exercises**
- **Goal:** Show that two simultaneous "Process Queue" clicks cannot double-apply one job.
  **Check:** Both requests may `findMany` the same job, but only one `updateMany({ id, status: "PENDING" })` can return `count: 1` (`automationRepository.ts:66-81`). The loser drops the job from `claimedJobIds`.
- **Goal:** Find what an `ASSIGN_USER` rule does if the assignee was removed from the project after the rule was created.
  **Check:** `assertAssigneeIsProjectMember` (`automationService.ts:182-186`) throws `BadRequestError` inside the rule transaction, so that job becomes `FAILED`. `createRule` (`:63-88`) never validated the assignee in the first place.
