# Build Journal

This journal records the design decisions visible in the code, the alternatives that were weighed, and, added during review, how each decision held up when checked against the final code. The "Review notes" are based only on reading this repository. They are not claims about runtime results.

## Stage 1: Project summary and major decisions

- **Built:** The shape of a multi-tenant Jira-like tracker: projects, issues, workflows, comments, filters, a board, custom fields, and automation.
- **Decision:** Make multi-tenancy first-class. `organizationId` is a column on 12 of the 18 models in `prisma/schema.prisma` (13 counting `Session.activeOrganizationId`), in `src/lib/auth/request-context.ts`, and in every repository read.
- **Decision:** Use Next.js REST route handlers instead of tRPC, so each request lifecycle is one visible file under `src/app/api/.../route.ts`.
- **Why:** The project teaches backend product engineering, and explicit API boundaries are easier to trace and document.
- **Review notes:** Tenancy held up. Every repository read takes `organizationId`, and the only DB-level gap is that isolation is application-enforced, with no row-level security. The REST choice produced ten handlers that each follow an identical try/catch shape. The cost is that the client builds every URL by hand (`src/components/app/workspace-shell.tsx:209-306`) with no shared route table.

## Stage 2: Schema, auth, and permission foundations

- **Built:** `prisma/schema.prisma`, `src/lib/auth/session.ts`, `src/lib/auth/request-context.ts`, `src/lib/permissions/permissions.ts`, `src/lib/validation/*`.
- **Decision:** Cookie-backed DB sessions instead of JWTs.
- **Options considered:**
  1. JWT-only sessions. Pros: no DB read. Cons: hard to revoke, and membership data goes stale.
  2. Database-backed sessions. Pros: revocable, membership reloaded per request. Cons: extra queries.
- **Chosen:** DB sessions with a hashed opaque token (`session.ts:20-26`, `:53-58`).
- **Why this won:** Role changes take effect on the next request without a token-refresh design.
- **Review notes:** The extra cost turned out to be three queries per request, not one: session lookup, membership list, and a heartbeat **write** (`session.ts:92`, `:99`, `:112`). Expired rows are never purged. `jose` remains in `package.json` but unused, which suggests a JWT path was considered and then dropped. `INTERNAL_JOB_TOKEN` (`src/lib/env.ts:7`) suggests a machine-to-machine job trigger was planned, but nothing reads it.

## Stage 3: Service and repository split

- **Built:** `src/repositories/` (5 files) and `src/services/` (7 service files plus `projectTemplates.ts`).
- **Decision:** Thin routes, services for rules, repositories for scoped DB access.
- **Options considered:**
  1. Logic in routes. Fewer files, but validation, auth, and rules tangle.
  2. A generic helper layer. Less naming overhead, but rules are hard to find.
  3. An explicit route, service, repository split. More files, but reviewable boundaries.
- **Chosen:** Option 3.
- **Review notes:** Routes are 24-50 lines each, which is the intended effect. The split leaks in two places: automation bypasses services and writes through repositories (`src/services/automation/automationService.ts:163-196`), and `assertAssigneeIsProjectMember` is duplicated in two services. Only two of five repositories accept a transaction client.

## Stage 4: Core product flows

- **Built:** Project creation, issue create, update, and comment, the bootstrap payload, saved filters, and the workspace client.
- **Decision:** One aggregated bootstrap payload (`src/services/bootstrap/bootstrapService.ts:56-178`) instead of one request per widget.
- **Options considered:**
  1. One request per widget: easy to add incrementally, but chatty.
  2. An aggregated payload: one round trip, but a larger response.
- **Chosen:** Aggregated.
- **Review notes:** The trade-off shows up in the invalidation strategy. Every mutation refetches the entire payload (`workspace-shell.tsx:200-204`), including every comment on every issue. Saved filters ended up client-side only (`applySavedFilter`, `workspace-shell.tsx:97-141`), which left the server filter code in `issueRepository.listIssuesForProject` unused.

## Stage 5: Workflow rules and async automation

- **Built:** `workflowService.ts`, `automationService.ts`, `automationRepository.ts`.
- **Decision:** Queue automation as `AutomationJob` rows written in the issue transaction, and drain them through a separate request.
- **Options considered:**
  1. Inline execution: simple, but a broken rule fails the user's edit.
  2. A queue: isolated failures and auditable state, at the cost of more code.
- **Chosen:** Queue (a transactional outbox).
- **Review notes:** The enqueue side is correct: the job commits atomically with the issue (`src/services/issues/issueService.ts:221-235`). The consumer side is a prototype. There is no worker, the claim has no lease or timeout, no retry, partial rule application, and failures are omitted from the response. The terminal-DONE rule is enforced, but not atomically with the write.

## Stage 6: Tests and teaching docs

- **Built:** Four single-case test files plus `docs/`.
- **Decision:** A few high-signal tests rather than broad scaffolding.
- **Review notes:** "High-signal" holds for the tenant-filter shape test. The route 403 test mocks away the permission matrix it is named after (see `docs/learning/testing-rationale.md`). No test hits a database, so neither race condition in this codebase could be caught.

---

## PR Slices

The intended review order, with a focus list for each slice. Reviewer-focus items are now phrased as concrete things to verify.

### Slice 1: Tenant-aware schema, auth, and permission bedrock

- **Files:** `prisma/schema.prisma`, `src/lib/auth/session.ts`, `src/lib/auth/request-context.ts`, `src/lib/permissions/permissions.ts`, `src/lib/validation/*.ts`, `src/lib/http/*.ts`.
- **Reviewer focus:**
  - Every tenant-owned model has `organizationId`, or a parent that does.
  - `requireProjectAccess` checks org membership (`request-context.ts:37`) before the project lookup (`:38`).
  - The role matrix (`permissions.ts:31-54`) matches the product intent.
- **Strong-reviewer flag:** Insist on hashing the session token (done, `session.ts:54`), and ask what `MEMBER` and `VIEWER` org roles are for (unanswered in code).

### Slice 2: Project graph creation and bootstrap read model

- **Files:** `src/repositories/projectRepository.ts`, `src/services/projects/projectService.ts`, `src/services/projects/projectTemplates.ts`, `src/services/bootstrap/bootstrapService.ts`, `src/app/api/bootstrap/route.ts`, `src/app/api/organizations/[organizationId]/projects/route.ts`.
- **Reviewer focus:**
  - Board columns and custom fields are created in the same `$transaction` as the project (`projectRepository.ts:188-262`).
  - Bootstrap serializes explicitly instead of returning Prisma rows.
- **Strong-reviewer flag:** The key-uniqueness pre-check (`projectService.ts:49-56`) races with the insert. Ask for P2002 to be mapped to 409.

### Slice 3: Issue CRUD, comments, and workflow validation

- **Files:** `src/services/issues/issueService.ts`, `src/services/workflows/workflowService.ts`, `src/repositories/issueRepository.ts`, the three issue route files.
- **Reviewer focus:**
  - `validateCustomFieldValues` (`issueService.ts:40-111`) runs against DB config, not client hints.
  - Every issue write uses the three-key `where`.
- **Strong-reviewer flag:** Status changes need an optimistic guard (`where: { statusId: current }`). Sequence numbers need a race-safe allocator.

### Slice 4: Filters, automation, and queue processing

- **Files:** `src/services/filters/filterService.ts`, `src/repositories/filterRepository.ts`, `src/services/automation/automationService.ts`, `src/repositories/automationRepository.ts`, the filters, rules, and process routes.
- **Reviewer focus:**
  - Jobs are claimed with compare-and-set before execution (`automationRepository.ts:65-82`).
  - Each job ends in `COMPLETED` or `FAILED`.
- **Strong-reviewer flag:** Ask about stuck `PROCESSING` rows, retries, idempotency per rule, and validating rule conditions and assignees when the rule is created.

### Slice 5: Client shell, tests, and docs

- **Files:** `src/components/app/*.tsx`, `src/components/auth/login-form.tsx`, `src/hooks/use-workspace-bootstrap.ts`, `vitest.config.ts`, the four test files, `docs/`.
- **Reviewer focus:**
  - The client only consumes APIs.
  - Tests protect real failure modes.
- **Strong-reviewer flag:** The client permission helper duplicates the server matrix and already disagrees with it (Create Project for `LEAD`). The issue form always sends `statusId`, which turns every edit into a "transition" with an automation event.

---

## Senior review summary (top findings, ranked)

1. **Every UI save is a status transition.** `workspace-shell.tsx:571` always sends `statusId`, and `issueService.ts:350` and `:364-381` treat any present `statusId` as a transition. Result: misleading activity rows and spurious `ISSUE_STATUS_CHANGED` jobs. With the seeded rule, a done issue gets a fresh QA comment every time it is edited and the queue is processed.
2. **The transition check is not atomic with the write** (`issueService.ts:290-314`). Concurrent PATCHes can move an issue out of DONE.
3. **Issue sequence allocation races** (`issueRepository.ts:152-164`). The loser gets a generic 500 because `handleRouteError` does not map Prisma errors.
4. **Automation consumer gaps:** partial rule application, no retry, no reclaim of `PROCESSING`, and conditions evaluated against a stale snapshot.
5. **Client/server RBAC drift:** `LEAD` sees Create Project, and the server always answers 403.
6. **Login email enumeration through timing** (`authService.ts:21-29`), and no rate limiting.
