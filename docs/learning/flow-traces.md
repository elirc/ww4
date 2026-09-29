# Flow Traces

## Flow: Create Issue Happy Path
1. `src/components/app/workspace-shell.tsx` — the create-issue form calls `createIssueMutation.mutateAsync()`
2. `src/lib/api/client.ts` — `apiFetch()` sends `POST /api/organizations/[organizationId]/projects/[projectId]/issues`
3. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` — `POST()` parses JSON and calls `requireProjectAccess()`
4. `src/lib/auth/request-context.ts` — `requireProjectAccess()` resolves the actor and project context
5. `src/lib/permissions/permissions.ts` — `assertProjectPermission()` checks `"issue:create"`
6. `src/lib/validation/issueSchemas.ts` — `createIssueSchema.parse()` validates the request payload
7. `src/services/issues/issueService.ts` — `createIssue()` validates assignee membership, validates custom fields, and resolves the initial workflow status
8. `src/repositories/projectRepository.ts` — `getProjectSetup()` loads workflow statuses and project custom fields
9. `src/services/workflows/workflowService.ts` — `requireInitialWorkflowStatus()` picks the initial status
10. `src/repositories/issueRepository.ts` — `getNextSequenceNumber()`, `createIssue()`, `upsertCustomFieldValues()`, and `createActivity()` persist the issue graph
11. `src/services/automation/automationService.ts` — `enqueueIssueEvent()` inserts an `AutomationJob`
12. Returns `{ id, key }`

## Flow: Permission Rejection For Viewer Issue Create
1. `src/components/app/workspace-shell.tsx` — a viewer could still attempt the request manually even if the UI hides the form
2. `src/lib/api/client.ts` — `apiFetch()` sends `POST /api/organizations/[organizationId]/projects/[projectId]/issues`
3. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` — `POST()` asks for `"issue:create"` access
4. `src/lib/auth/request-context.ts` — `requireProjectAccess()` loads membership and project role
5. `src/lib/permissions/permissions.ts` — `assertProjectPermission()` throws `ForbiddenError`
6. `src/lib/http/responses.ts` — `handleRouteError()` serializes the error into status 403
7. Returns `{ error: "Missing permission: issue:create." }`

## Flow: Invalid Done-To-Active Transition
1. `src/components/app/workspace-shell.tsx` — the issue detail form submits `updateIssueMutation.mutateAsync()`
2. `src/lib/api/client.ts` — `apiFetch()` sends `PATCH /api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]`
3. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/route.ts` — `PATCH()` validates the request body with `updateIssueSchema`
4. `src/services/issues/issueService.ts` — `updateIssue()` sees `statusId` in the payload and requires transition permission
5. `src/repositories/issueRepository.ts` — `findIssueForProject()` loads the current issue and workflow statuses
6. `src/services/workflows/workflowService.ts` — `requireWorkflowStatus()` resolves the target status and `assertValidStatusTransition()` rejects the move
7. `src/lib/http/responses.ts` — `handleRouteError()` returns a 409 conflict response
8. Returns `{ error: "Issues in a done state cannot move back to an active state." }`

## Flow: Save Shared Filter
1. `src/components/app/workspace-shell.tsx` — `SaveFilterForm` calls `saveFilterMutation.mutateAsync()`
2. `src/lib/api/client.ts` — `apiFetch()` sends `POST /api/organizations/[organizationId]/filters`
3. `src/app/api/organizations/[organizationId]/filters/route.ts` — `POST()` validates the filter body and resolves project access using `payload.query.projectId`
4. `src/lib/validation/filterSchemas.ts` — `saveFilterSchema.parse()` constrains the supported query JSON shape
5. `src/lib/auth/request-context.ts` — `requireProjectAccess()` resolves the target project context
6. `src/services/filters/filterService.ts` — `createFilter()` checks `"filter:create"` and, if shared, `"filter:share"`
7. `src/repositories/filterRepository.ts` — `createFilter()` writes the saved filter row scoped to the organization and project
8. Returns the saved filter object with owner metadata

## Flow: Process Automation Queue
1. `src/components/app/workspace-shell.tsx` — the queue button calls `processJobsMutation.mutate()`
2. `src/lib/api/client.ts` — `apiFetch()` sends `POST /api/organizations/[organizationId]/automation/process`
3. `src/app/api/organizations/[organizationId]/automation/process/route.ts` — `POST()` validates `projectId` and `limit`
4. `src/lib/auth/request-context.ts` — `requireProjectAccess()` checks `"job:process"`
5. `src/services/automation/automationService.ts` — `processPendingJobs()` claims jobs and loads matching rules
6. `src/repositories/automationRepository.ts` — `claimPendingJobs()` moves rows from `PENDING` to `PROCESSING`
7. `src/repositories/issueRepository.ts` — `findIssueForProject()` loads each affected issue
8. `src/services/automation/automationService.ts` — condition matching decides whether to create a comment or assign a user
9. `src/repositories/issueRepository.ts` — `createComment()`, `updateIssue()`, and `createActivity()` apply the side effect
10. `src/repositories/automationRepository.ts` — `completeJob()` or `failJob()` finalizes queue state
11. Returns `{ processed, jobs }`
