# Request Lifecycle

Five requests traced from handler to database. Line numbers refer to the files as they are in this repo. Each trace ends with the HTTP result and a note on what can go wrong in between.

Shared mechanics, so they are not repeated below:

- Every handler wraps its body in `try { ... } catch (error) { return handleRouteError(error); }`.
- `handleRouteError()` (`src/lib/http/responses.ts:20-52`) maps a `ZodError` to 400 with `details: error.flatten()` (`:21-31`). It maps any `AppError` subclass to its `statusCode` (`:33-41`): `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `BadRequestError` 400 (`src/lib/http/errors.ts:22-55`). Anything else is logged with `console.error` and returned as a generic 500 (`:43-51`).
- Dynamic route `params` is a Promise in Next 16, so every handler starts with `await params`.

---

## Request 1: Log in with email and password

`POST /api/auth/login` with body `{ email, password }`

1. `src/app/api/auth/login/route.ts:17` runs `loginSchema.parse(await request.json())`. Malformed JSON throws a `SyntaxError`, which is not a `ZodError` or an `AppError`, so it becomes a **500**, not a 400.
2. `src/lib/validation/authSchemas.ts:13-16` checks `z.email()` with a lowercase transform and `password` of at least 8 characters.
3. `src/services/auth/authService.ts:18-41` runs `login()`:
   - `authRepository.findUserByEmail()` (`src/repositories/authRepository.ts:14-25`) loads the user with memberships and organizations;
   - `verifyPassword()` (`src/lib/auth/password.ts:19-21`) runs bcrypt compare;
   - it rejects users with zero memberships (`:31-35`).
4. `src/lib/auth/session.ts:46-71`, `createSessionCookie()`: random token, SHA-256 hash stored through `authRepository.createSession()` (`authRepository.ts:27-40`), and the cookie is set.
5. The response is **200** `{ success: true }` (`route.ts:20-22`).

Failure modes: unknown email or wrong password gives **401** "Invalid email or password." A valid user with no org gives **401** "This account is not assigned to an organization." A short password is rejected by Zod with **400** before any database work.

---

## Request 2: Create an issue in a project

`POST /api/organizations/:organizationId/projects/:projectId/issues`

1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts:22-26` calls `requireProjectAccess({ organizationId, projectId, permission: "issue:create" })`. Access is checked **before** the body is parsed.
2. `src/lib/auth/request-context.ts:32-66` runs `requireSessionContext()`, then the in-memory org membership check (`:18-30`), then `projectRepository.findProjectAccess()` with `{ id, organizationId }`, then builds `ProjectAccessContext`.
3. `src/lib/permissions/permissions.ts:78-82`, `assertProjectPermission(access, "issue:create")`.
4. `route.ts:27` runs `createIssueSchema.parse()` (`src/lib/validation/issueSchemas.ts:19-27`): title 3-140 characters, enum `type` and `priority`, optional ISO `dueDate`, and up to 20 custom-field entries.
5. `src/services/issues/issueService.ts:135-242`, `createIssue()`:
   - re-asserts `issue:create` (`:148`);
   - loads `getProjectSetup()` (`src/repositories/projectRepository.ts:84-131`), which returns workflow statuses, the default board, and custom fields, scoped by org (`:150-158`);
   - checks the assignee with `assertAssigneeIsProjectMember()`, which fetches **all** project members and searches in memory (`:113-132`, `:160-164`);
   - validates custom fields against the project's definitions (`:166`). Unknown field ids, type mismatches, invalid select options, and missing required fields all throw `BadRequestError`. The default template makes "Customer Impact" required (`src/services/projects/projectTemplates.ts:45-55`);
   - picks the initial status with `requireInitialWorkflowStatus()` (`:168`; `src/services/workflows/workflowService.ts:25-33`).
6. **Transaction** (`:170-241`), all through `tx`:
   - `issueRepository.getNextSequenceNumber()`, which computes `MAX + 1` (`src/repositories/issueRepository.ts:152-164`);
   - `issueRepository.createIssue()` (`:166-176`);
   - `upsertCustomFieldValues()` when values were sent (`:195-222`). Values pass through `normalizeJsonValue()` (`issueService.ts:22-38`), which turns `""` into `JsonNull`;
   - `createActivity()` with type `ISSUE_CREATED` and message `"OPS-n created in To Do."` (`issueService.ts:209-219`);
   - `automationService.enqueueIssueEvent()` inserts an `AutomationJob` row (`src/services/automation/automationService.ts:90-110`).
7. The response is **201** `{ id, key }` (`route.ts:34`).

Because the job is enqueued inside the same transaction as the issue, the issue and its job are committed together or not at all. This is the transactional-outbox idea. A job can never point at a rolled-back issue, and a committed issue always has its job.

What can go wrong: two simultaneous creates in one project can compute the same `sequenceNumber`. The second fails the `@@unique([projectId, sequenceNumber])` constraint and the caller gets a generic **500** (see `docs/architecture/domain-model.md`, finding 1).

---

## Request 3: Transition an issue to a new status

`PATCH /api/organizations/:organizationId/projects/:projectId/issues/:issueId` with `{ statusId }`

1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/route.ts:22-26` calls `requireProjectAccess` with `"issue:edit"`.
2. `route.ts:27` runs `updateIssueSchema.parse()` (`src/lib/validation/issueSchemas.ts:29-41`). All fields are optional, and `.refine` rejects `{}`.
3. `src/services/issues/issueService.ts:244-387`, `updateIssue()`:
   - checks `issue:edit` (`:258`), and `issue:transition` because `statusId` is present (`:260-262`);
   - `issueRepository.findIssueForProject()` loads the issue, its status, workflow statuses, and the project's custom fields, filtered by `{ id, projectId, organizationId }` (`src/repositories/issueRepository.ts:120-150`). A missing issue gives **404** (`:270-272`);
   - `requireWorkflowStatus()` checks the target is in this issue's workflow (`workflowService.ts:15-23`). A foreign status id gives **400**;
   - `assertValidStatusTransition()` (`workflowService.ts:39-48`). The same status passes immediately (`:40-42`). DONE to non-DONE throws `ConflictError` (**409**).
4. **Transaction** (`:298-386`):
   - `issueRepository.updateIssue()` runs `updateMany` with `{ id, organizationId, projectId }` (`issueRepository.ts:178-193`). A count other than 1 gives 404 (`:316-318`);
   - `createActivity()` with type `STATUS_CHANGED`, message `"Moved from X to Y."`, and metadata `{ fromStatusId, toStatusId }` (`:344-362`);
   - `enqueueIssueEvent()` with `ISSUE_STATUS_CHANGED` and `priority: payload.priority ?? issue.priority` (`:364-381`).
5. The response is **200** `{ id }`.

**Race:** the transition is validated against the status read at step 3, outside the transaction. The `UPDATE` at step 4 does not include the old `statusId` in its `where`. If two requests move the same issue at once, for example one to Done and one to In Review, both can pass validation and the last write wins. The issue can then leave Done without the terminal rule ever seeing a DONE to ACTIVE transition. Adding `statusId: issue.status.id` to the `updateMany` filter and treating `count === 0` as a 409 would close it.

**UI side effect:** the issue detail form in `src/components/app/workspace-shell.tsx:566-575` **always** sends `statusId`, even when the user only edited the title. Every save from the UI therefore:

- requires `issue:transition`;
- writes a `STATUS_CHANGED` activity such as "Moved from Done to Done.";
- enqueues an `ISSUE_STATUS_CHANGED` job.

The seeded rule "Done issues get QA note" matches on `toStatusId` = done only (`prisma/seed.ts:384-399`). So editing the title of a done issue and then processing the queue posts another QA comment. The same form also sends every custom field (`:572-575`), so each save also writes a `CUSTOM_FIELD_SET` activity.

---

## Request 4: Process queued automation jobs

`POST /api/organizations/:organizationId/automation/process` with `{ projectId, limit? }`

1. `src/app/api/organizations/[organizationId]/automation/process/route.ts:22` runs `processAutomationJobsSchema.parse()` **first**, because `projectId` comes from the body (`src/lib/validation/automationSchemas.ts:46-49`, `limit` 1-25, default 10).
2. `route.ts:23-27` calls `requireProjectAccess` with `"job:process"`. Only `LEAD` or an org admin has it.
3. `src/services/automation/automationService.ts:112-228`, `processPendingJobs()`:
   - re-asserts the permission (`:117`);
   - `automationRepository.claimPendingJobs()` (`src/repositories/automationRepository.ts:46-94`) selects up to `limit` `PENDING` jobs whose `availableAt <= now`, then for each one runs `updateMany({ id, status: "PENDING" } -> PROCESSING, attempts + 1)`. Only rows where `count === 1` are claimed (`:65-82`). This compare-and-set prevents two concurrent processors from claiming the same job;
   - loads all rules for the project once (`:125-128`);
   - for each job, re-loads the issue with tenant filters (`:134-142`), then for each enabled rule with a matching `eventType` and matching conditions (`matchesConditions`, `:22-43`) it runs one transaction containing the action (`ADD_COMMENT` or `ASSIGN_USER`) and an `AUTOMATION_TRIGGERED` activity (`:155-210`);
   - marks the job `COMPLETED` (`:215`), or `FAILED` with the error message on any throw (`:221-224`).
4. The response is **200** `{ processed: result.length, jobs: result }` (`route.ts:34-37`).

What the response hides: failed jobs are not added to `results`, so `processed` counts only successes, and a batch where every job failed returns `{ processed: 0, jobs: [] }`. Other weaknesses are covered in `docs/learning/flow-traces.md`: partial application across rules, no retry, jobs stuck in `PROCESSING`, and conditions evaluated against the event snapshot.

---

## Request 5: Viewer attempts to create an issue and is rejected

`viewer@acme.test` (org `VIEWER`, project `OBSERVER` on OPS) sends `POST .../projects/<OPS id>/issues`

1. `issues/route.ts:22-26` calls `requireProjectAccess` with `"issue:create"`.
2. `request-context.ts:48-54` builds the context with `organizationRole: "VIEWER"` and `projectRole: "OBSERVER"`.
3. `permissions.ts:66-76`: not an org admin, and `OBSERVER`'s list (`:53`) lacks `issue:create`, so it returns false. `assertProjectPermission` throws `ForbiddenError("Missing permission: issue:create.")` (`:78-82`).
4. `handleRouteError()` maps it to `{ error: "Missing permission: issue:create.", details: null }` with **403**.

The body is never parsed, so a viewer gets 403 even for a malformed body. The same request against MOB, where the viewer has no project role, also returns 403 (not 404), because `findProjectAccess` does not require membership. See `docs/architecture/auth-and-permissions.md`, section 4.

---

## Exercises

1. **Goal:** Find a request whose response code depends on the order of auth and parsing.
   **Check:** Send `{}` to the automation rules route as a user with no access to anything. `rules/route.ts:22` parses first, so the response is 400, not 404 or 403. Compare with the issues route, where the same caller gets 404 or 403 first.
2. **Goal:** Confirm the outbox property.
   **Check:** In `issueService.ts`, verify that `enqueueIssueEvent(..., tx)` at `:221-235` and `:365-380` receives the transaction client, and that `automationRepository.enqueueJob` (`automationRepository.ts:40-44`) uses `getClient(client)`.
3. **Goal:** Reproduce the duplicate QA note in your head.
   **Check:** Start with an issue in Done. The UI form sends `{ title, ..., statusId: <done id> }`. Follow `updateIssue` to `:364-381` and confirm a job is enqueued with `toStatusId` = done. Then follow `matchesConditions` (`automationService.ts:34-36`) and confirm the seeded rule matches.
4. **Goal:** Explain the 500 on malformed JSON.
   **Check:** `request.json()` throws a `SyntaxError`. `handleRouteError` checks only `ZodError` (`responses.ts:21`) and `AppError` (`:33`), so the error falls through to `:43-51`.
