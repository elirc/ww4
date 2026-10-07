# Testing Rationale

The Vitest suite is four files with one test each (a fifth, separate `node:test` lab is covered in section 5), all run by Vitest in a Node environment (`vitest.config.ts:6`, `environment: "node"`, with `@` aliased to `src`). None of them needs a database: two mock modules with `vi.mock`, and two call pure functions. `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` are installed but no test renders a component.

This page explains what each test proves, what it does **not** prove, and which tests would catch the defects described elsewhere in these docs. These docs make no claims about the tests' current pass or fail status. Run `npm run test:run` yourself.

## 1. `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.test.ts`

**Test:** "returns 403 when a viewer tries to create an issue" (`:22-35`).

**How it works:** `vi.mock` replaces `@/lib/auth/request-context` with `{ requireProjectAccess: requireProjectAccessMock }` (`:7-9`) and stubs `issueService.createIssue` (`:11-15`). The mock is set to reject with `new ForbiddenError("Missing permission: issue:create.")` (`:24`). The test imports `POST` dynamically and calls it with a `Request` plus `params: Promise.resolve({...})` (`:27-32`). It asserts `response.status === 403` (`:34`).

**What it proves:** The route turns a `ForbiddenError` thrown by access resolution into a 403 through `handleRouteError`. It also shows the error happens before the body is parsed: the body is `"{}"`, which would fail `createIssueSchema`, and the result is still 403, not 400.

**What it does not prove:** That a viewer actually lacks `issue:create`. The permission matrix is never executed, because the mock decides the outcome. If someone added `"issue:create"` to `OBSERVER` in `permissions.ts:53`, this test would still pass. The name says "viewer", but nothing in the test involves a viewer.

**Better coverage:**
- A pure unit test of `hasProjectPermission` for each (org role, project role, permission) combination. The function is pure (`src/lib/permissions/permissions.ts:66-76`), so this needs no mocks.
- A route test that mocks only `getSessionContext` and `projectRepository.findProjectAccess`, so the real `requireProjectAccess` and the real matrix run.

## 2. `src/lib/validation/issueSchemas.test.ts`

**Test:** "rejects a malformed issue payload" (`:6-16`).

**How it works:** It calls `createIssueSchema.parse({ title: "", type: "TASK", priority: "MEDIUM", customFieldValues: [] })` and expects a throw.

**What it proves:** An empty title is rejected (`title: z.string().trim().min(3)`, `src/lib/validation/issueSchemas.ts:20`).

**What it does not prove:** Which rule failed. `.toThrow()` with no argument passes on any error. A title of `"ab"`, a whitespace-only title (which `.trim()` turns into `""`), and bad enums are all untested. So is the update schema's empty-object `.refine` (`:39-41`).

**Better coverage:** A table-driven `safeParse` test that asserts the specific `issues[0].path` for each bad field, plus one valid payload to prove the schema is not simply rejecting everything.

## 3. `src/services/workflows/workflowService.test.ts`

**Test:** "rejects moving an issue out of a done status" (`:6-34`).

**How it works:** It builds two full `WorkflowStatus` literals (DONE and ACTIVE) and expects `assertValidStatusTransition` to throw the exact message "Issues in a done state cannot move back to an active state." (`:33`).

**What it proves:** The DONE to ACTIVE rejection and its message.

**What it does not prove:**
- DONE to TODO, which is also rejected.
- That allowed transitions (TODO to ACTIVE, ACTIVE to DONE, same-status) do **not** throw. A version of the function that always throws would pass this test.
- `requireWorkflowStatus` and `requireInitialWorkflowStatus` are untested.

**Better coverage:** A `describe.each` over all nine category pairs, asserting throw or no-throw for each.

## 4. `src/repositories/projectRepository.test.ts`

**Test:** "always scopes project access queries by organizationId" (`:19-37`).

**How it works:** It mocks `@/lib/db` so that `db.project.findFirst` is a spy (`:3-11`). It calls `findProjectAccess` and asserts the spy got `where` containing both `organizationId` and `id` (`:29-36`).

**What it proves:** The query **shape** includes the tenant key. If someone "simplifies" it to `{ id }`, this test fails.

**What it does not prove:** That Postgres returns null for a foreign project. Nothing runs against a real database. Only `findProjectAccess` is covered: `getProjectSetup`, every `issueRepository` method, `filterRepository.listVisibleFilters`, and the `automationRepository` queries have no equivalent test.

**Better coverage:** An integration test against a disposable Postgres, seeded with two orgs, asserting that each repository method returns nothing across tenants. The seed's two `OPS` projects (`prisma/seed.ts:261-293`) are a ready-made fixture.

## 5. `tests/issue-service-runtime.test.mjs` (runtime lab, not Vitest)

**How it runs:** `node:test` plus `node:assert/strict`. `loadTypeScript()` (`tests/helpers/load-typescript.mjs:8`) evaluates the real `issueService.ts` in a `vm` context. Only `@prisma/client`, `@/lib/db`, `projectRepository`, `issueRepository`, and `automationService` are replaced with recording stubs (`tests/issue-service-runtime.test.mjs:10-16`). The permission map, the workflow helpers, and the error classes are the real modules. The fake `$transaction` passes a sentinel `tx` object, and every recorded repository call asserts it received that same object (`:9`, `:12`).

**Five cases:**
- `:20-25` checks call order `setup -> tx -> sequence -> create -> activity -> event`, and that tenant ids, the initial status, and `ISSUE_CREATED` are forwarded.
- `:26-29` checks that an `OBSERVER` is refused with 403 using the **real** matrix, before any repository call. A missing project gives 404 and a workflow with no initial status gives 409, both before the transaction opens.
- `:30-32` checks that a foreign assignee gives 400 after a scoped `listProjectMembers` call, with no writes.
- `:33-37` checks that a required NUMBER field that is missing, mistyped, or a foreign field id gives 400 with no transaction, and that a valid value reaches `upsertCustomFieldValues`.
- `:38-40` checks that a failing activity write propagates and that no automation event is enqueued after it.

**What it closes:** This suite covers the gap left by test 1. A change that gave `OBSERVER` the `issue:create` permission would fail `:27`. It also proves the outbox call shares the issue's transaction client.

**What it does not prove:** Real rollback. The stub `$transaction` just calls the function, so "no event after failure" shows call order, not database atomicity. `updateIssue` and `addComment` are not exercised. `astraupskill/VERIFICATION.md` makes the same point in its own words.

## Defects in these docs that no current test would catch

| Defect | Where | Test that would catch it |
| --- | --- | --- |
| Sequence-number race gives a 500 | `issueRepository.ts:152-164` | Concurrent `createIssue` x2 against real Postgres; assert both succeed, or one gets a clean 409 |
| Transition race lets an issue leave DONE | `issueService.ts:290-314` | Two concurrent PATCHes; assert at most one changes the row |
| UI always sends `statusId`, creating "Moved from X to X" | `workspace-shell.tsx:571`, `issueService.ts:350` | Service test: PATCH with the same `statusId` should write `ISSUE_UPDATED`, not `STATUS_CHANGED`, and enqueue nothing |
| Partial rule application | `automationService.ts:146-213` | Two rules, the second throws; assert job state and the first rule's side effect |
| Client/server permission drift on project creation | `workspace-shell.tsx:82-84` vs `permissions.ts:60-64` | Shared table test: import both and compare decisions |
| Unhandled Prisma P2002 becomes a 500 | `responses.ts:43-51` | Route test where the service throws a P2002-shaped error |
| Malformed JSON body becomes a 500 | `request.json()` in every route | Route test with body `"{"`; expect 400 |

## Exercises

1. **Goal:** Show that test 1 does not depend on the permission matrix.
   **Check:** Read `route.test.ts:7-9` and confirm `@/lib/permissions/permissions` is never imported or reached. The mocked `requireProjectAccess` short-circuits before `assertProjectPermission` could run.
2. **Goal:** Write, on paper, the assertion that would make test 2 fail if the title rule were removed but the schema still threw for some other reason.
   **Check:** Use `createIssueSchema.safeParse(...)`, then `expect(result.error?.issues[0].path).toEqual(["title"])`.
3. **Goal:** Find a pure function that is security-relevant and has no test.
   **Check:** `hasProjectPermission` (`permissions.ts:66-76`) or `matchesConditions` (`automationService.ts:22-43`). Neither is imported by any `*.test.ts`. The runtime lab exercises `hasProjectPermission` only indirectly, through `createIssue`.
