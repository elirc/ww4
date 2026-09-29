# Request Lifecycle

Request: Log in with email and password
1. `src/app/api/auth/login/route.ts` — reads `Request.json()`, validates the payload with `loginSchema`, and calls `authService.login()`
2. `src/lib/validation/authSchemas.ts` — `loginSchema.parse()` rejects malformed email/password input
3. `src/services/auth/authService.ts` — `login()` loads the user, verifies the password, checks that at least one org membership exists, and delegates session creation
4. `src/repositories/authRepository.ts` — `findUserByEmail()` loads the user plus memberships; `createSession()` inserts the backing session row
5. `src/lib/auth/session.ts` — `createSessionCookie()` hashes the token, stores the session, and sets the cookie
6. Returns `200` with `{ success: true }`

Request: Create an issue in a project
1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` — parses JSON and asks for `"issue:create"` access
2. `src/lib/auth/request-context.ts` — `requireProjectAccess()` verifies org membership, resolves the project through `projectRepository.findProjectAccess()`, and builds `ProjectAccessContext`
3. `src/lib/permissions/permissions.ts` — `assertProjectPermission()` confirms the actor can create issues
4. `src/lib/validation/issueSchemas.ts` — `createIssueSchema.parse()` validates the request shape
5. `src/services/issues/issueService.ts` — `createIssue()` validates assignee membership, validates custom fields, resolves the initial workflow status, creates the issue, writes activity, and enqueues automation
6. `src/repositories/projectRepository.ts` — `getProjectSetup()` loads workflow statuses and custom fields scoped by `organizationId`
7. `src/repositories/issueRepository.ts` — `getNextSequenceNumber()`, `createIssue()`, `upsertCustomFieldValues()`, and `createActivity()` issue the project-scoped writes
8. `src/services/automation/automationService.ts` — `enqueueIssueEvent()` inserts a queued automation job for the new issue
9. Returns `201` with `{ id, key }`

Request: Transition an issue to a new status
1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/route.ts` — parses the PATCH body and resolves `"issue:edit"` access
2. `src/lib/auth/request-context.ts` — `requireProjectAccess()` loads actor/project context
3. `src/lib/validation/issueSchemas.ts` — `updateIssueSchema.parse()` validates the shape
4. `src/services/issues/issueService.ts` — `updateIssue()` checks whether `statusId` is present and then enforces `"issue:transition"` permission
5. `src/repositories/issueRepository.ts` — `findIssueForProject()` loads the current issue, current status, workflow statuses, and project custom fields with tenant filters
6. `src/services/workflows/workflowService.ts` — `requireWorkflowStatus()` verifies the target status belongs to this workflow and `assertValidStatusTransition()` rejects invalid done-to-active moves
7. `src/repositories/issueRepository.ts` — `updateIssue()` writes the change and `createActivity()` records the transition
8. `src/services/automation/automationService.ts` — `enqueueIssueEvent()` queues an `ISSUE_STATUS_CHANGED` job
9. Returns `200` with `{ id }`

Request: Process queued automation jobs
1. `src/app/api/organizations/[organizationId]/automation/process/route.ts` — validates the batch payload and resolves `"job:process"` access for the target project
2. `src/lib/auth/request-context.ts` — `requireProjectAccess()` verifies tenant membership and project visibility
3. `src/lib/validation/automationSchemas.ts` — `processAutomationJobsSchema.parse()` validates `projectId` and `limit`
4. `src/services/automation/automationService.ts` — `processPendingJobs()` claims pending jobs, loads rules, evaluates conditions, runs actions, and completes or fails jobs
5. `src/repositories/automationRepository.ts` — `claimPendingJobs()`, `listRulesForProject()`, `completeJob()`, and `failJob()` issue the queue operations
6. `src/repositories/issueRepository.ts` — `findIssueForProject()`, `createComment()`, `updateIssue()`, and `createActivity()` perform the resulting issue-side effects
7. Returns `200` with `{ processed, jobs }`

Request: Viewer attempts to create an issue and is rejected
1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` — starts the create-issue request
2. `src/lib/auth/request-context.ts` — `requireProjectAccess()` builds the actor/project context
3. `src/lib/permissions/permissions.ts` — `assertProjectPermission()` rejects `"issue:create"` for an observer/viewer actor
4. `src/lib/http/responses.ts` — `handleRouteError()` converts `ForbiddenError` into JSON
5. Returns `403` with `{ error: "Missing permission: issue:create." }`
