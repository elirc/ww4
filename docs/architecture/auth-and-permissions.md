# Auth And Permissions

WorkGrid uses an opaque random token stored in an httpOnly cookie. Each token maps to a `Session` row in PostgreSQL. On top of the session sit two authorization contexts, organization and project, and a single permission matrix. This page walks through each layer with exact line references and ends with review findings.

## 1. Session creation (login)

1. `POST /api/auth/login` (`src/app/api/auth/login/route.ts:15-26`) parses the body with `loginSchema` (`src/lib/validation/authSchemas.ts:13-16`). The schema requires a valid email, lowercases it, and requires a password of at least 8 characters.
2. `authService.login()` (`src/services/auth/authService.ts:18-41`):
   - loads the user and memberships with `authRepository.findUserByEmail()` (`src/repositories/authRepository.ts:14-25`), which lowercases again at `:16`;
   - throws `UnauthorizedError("Invalid email or password.")` if the user is missing (`:21-23`) or the bcrypt compare fails (`:25-29`);
   - throws if the user has no memberships (`:31-35`);
   - calls `createSessionCookie()` with the **first** membership's org as the active organization (`:37-40`).
3. `createSessionCookie()` (`src/lib/auth/session.ts:46-71`):
   - generates 32 random bytes as hex (`createRawSessionToken`, `:24-26`);
   - stores only the SHA-256 hash of the token (`hashToken`, `:20-22`; `createSession`, `:53-58`);
   - sets the raw token as an `httpOnly`, `sameSite: "lax"` cookie, `secure` only in production, that expires after `SESSION_TTL_HOURS` (default 72, `src/lib/env.ts:6`) (`:62-68`).

The database never stores the raw token. Someone who reads the `Session` table cannot replay its rows as cookies. The header comment in `session.ts` calls the cookie "signed", but it is not: no HMAC or JWT is involved (`jose` is installed but unused). It is an opaque bearer token whose security comes from its 256 bits of randomness plus the server-side lookup.

`memberships[0]` at `authService.ts:31` comes from an `include` with no `orderBy` (`authRepository.ts:17-23`), so for a user in several orgs the active org at login is whatever order Postgres returns. `getSessionContext()` does sort memberships by `createdAt` (`authRepository.ts:58-60`), but the session row already stores the login-time choice.

## 2. Session resolution (every authenticated request)

`getSessionContext()` (`src/lib/auth/session.ts:84-124`) runs on every API call that needs a user:

1. It reads the cookie. If there is none, it returns `null` (`:85-90`).
2. It hashes the token and loads the `Session` row with its user (`:92`, `authRepository.findSessionByTokenHash`, `authRepository.ts:42-50`).
3. If the row is missing or `expiresAt` is in the past, it deletes the **cookie** and returns `null` (`:94-97`). It does **not** delete an expired row from the database. Expired rows stay until a logout with that same cookie, which cannot happen because the cookie is gone. `Session.expiresAt` is indexed (`prisma/schema.prisma:104`), so a cleanup job would be easy to add, but none exists.
4. It reloads all memberships fresh from the database (`:99`). Role changes and removed memberships therefore take effect on the next request. This is the main benefit of DB sessions over a JWT that carries roles.
5. It picks the active org: the stored `activeOrganizationId` if the user is still a member, otherwise the first remaining membership (`:102-103`).
6. If no membership survives, it deletes the session row **and** the cookie (`:105-110`). This is the orphan-session branch.
7. It writes a heartbeat (`lastSeenAt`, active org) on every request (`:112`, `authRepository.ts:64-72`). One extra UPDATE per API call is the price of the `lastSeenAt` column.

`requireSessionContext()` (`:126-134`) wraps it and throws `UnauthorizedError` (401).

Logout (`src/app/api/auth/logout/route.ts:14-24` -> `authService.logout()` -> `clearSessionCookie()`, `session.ts:73-82`) deletes the row by token hash and then deletes the cookie, so a stolen copy of the cookie stops working.

## 3. Organization membership

`requireOrganizationContext(organizationId)` (`src/lib/auth/request-context.ts:18-30`) searches the session's in-memory `organizations` list for the URL's org id (`:20`). If the user is not a member it throws `NotFoundError` (404), not `ForbiddenError` (`:22-24`). A 404 does not tell an outsider whether the org exists.

Only `POST /api/organizations/:orgId/projects` calls this function directly (`src/app/api/organizations/[organizationId]/projects/route.ts:22`). Every other org-scoped route goes through `requireProjectAccess()`, which calls it first.

## 4. Project access

`requireProjectAccess()` (`src/lib/auth/request-context.ts:32-66`):

1. Runs `requireOrganizationContext()` (`:37`).
2. Loads the project with `projectRepository.findProjectAccess()` (`:38-42`). The `where` clause is `{ id, organizationId }` (`src/repositories/projectRepository.ts:67-70`). This filter is the tenant guard: a Globex project id sent under an Acme URL will not match.
3. Throws `NotFoundError` if no project is found (`:44-46`).
4. Builds `ProjectAccessContext` (`:48-54`). `projectRole` is the caller's `ProjectMembership.role`, or `null` if they have no membership (`:53`). The membership include is filtered to the current user (`projectRepository.ts:72-79`).
5. If a `permission` was passed, it calls `assertProjectPermission()` (`:56-58`).

**Subtlety:** `findProjectAccess` does not require a project membership. An Acme `MEMBER` with no role on project MOB still resolves the project, gets `projectRole: null`, and then receives **403** "Missing permission" instead of 404. Inside one tenant this tells the caller that the project exists. `bootstrapService` hides such projects from the list (`listProjectsForUserInOrganization`, `projectRepository.ts:21-29`), so the UI and the API answer the same question differently.

## 5. The permission matrix

All of it is in `src/lib/permissions/permissions.ts`:

- `ProjectPermission` lists 11 names (`:16-27`).
- `ORG_OWNER` and `ORG_ADMIN` bypass every project check (`orgAdminRoles`, `:29`; `hasProjectPermission`, `:66-69`).
- Project roles map to permissions as follows (`:31-54`):

| Permission | LEAD | CONTRIBUTOR | OBSERVER |
| --- | --- | --- | --- |
| `project:view` | yes | yes | yes |
| `project:manage` | yes | - | - |
| `issue:create` | yes | yes | - |
| `issue:edit` | yes | yes | - |
| `issue:transition` | yes | yes | - |
| `comment:create` | yes | yes | yes |
| `filter:create` | yes | yes | yes |
| `filter:share` | yes | - | - |
| `custom-field:manage` | yes | - | - |
| `automation:manage` | yes | - | - |
| `job:process` | yes | - | - |

- Project creation is org-level only: `assertOrganizationCanCreateProject()` (`:60-64`) allows `ORG_OWNER` and `ORG_ADMIN`. The seeded `lead@acme.test` is org `MEMBER`, so the lead of both projects cannot create a new project.
- `project:view`, `project:manage`, and `custom-field:manage` are defined but never checked anywhere. There is no endpoint that needs them.
- Org roles `MEMBER` and `VIEWER` (`prisma/schema.prisma:13-14`) are never read by any code. An org `VIEWER` who is given project `LEAD` gets full lead write access. The org role does not cap the project role.

### Defense in depth: checks happen twice

Every write route asks `requireProjectAccess()` for a permission, and the service asserts it again:

| Route permission | Service re-check |
| --- | --- |
| `issue:create` (`issues/route.ts:25`) | `issueService.ts:148` |
| `issue:edit` (`[issueId]/route.ts:25`) | `issueService.ts:258`, plus `issue:transition` at `:260-262` |
| `comment:create` (`comments/route.ts:25`) | `issueService.ts:396` |
| `filter:create` (`filters/route.ts:26`) | `filterService.ts:27`, plus `filter:share` at `:29-31` |
| `automation:manage` (`rules/route.ts:26`) | `automationService.ts:77` |
| `job:process` (`process/route.ts:26`) | `automationService.ts:117` |

Two permissions are checked only in the service, because they depend on the payload: `issue:transition` and `filter:share`. If a future route skips the service, those two checks disappear with it.

## 6. Tenant isolation

`Organization` is the tenant root. These models carry their own `organizationId` column: `Session` (as active org), `Membership`, `Project`, `Workflow`, `Board`, `Issue`, `IssueComment`, `CustomFieldDefinition`, `IssueCustomFieldValue`, `SavedFilter`, `AutomationRule`, `AutomationJob`, and `IssueActivity` (`prisma/schema.prisma`). `ProjectMembership`, `WorkflowStatus`, and `BoardColumn` do not. They are reached only through a parent that does.

Where the repositories apply the filter:

- `projectRepository.findProjectAccess()` and `getProjectSetup()`: `{ id, organizationId }` (`src/repositories/projectRepository.ts:67-70`, `:86-90`). `listProjectMembers()` filters through the relation `project: { organizationId }` (`:135-140`).
- `issueRepository.listIssuesForProject()`: `{ organizationId, projectId }` (`src/repositories/issueRepository.ts:38-40`). `findIssueForProject()`: `{ id, projectId, organizationId }` (`:122-127`). `updateIssue()` uses `updateMany` with all three keys (`:185-190`), so a wrong id updates 0 rows. `issueService` turns that into a 404 (`src/services/issues/issueService.ts:316-318`).
- `filterRepository.listVisibleFilters()`: `{ organizationId, projectId, OR: [owner, shared] }` (`src/repositories/filterRepository.ts:18-21`).
- `automationRepository`: rules, the claim query, and pending counts all filter on `{ organizationId, projectId }` (`src/repositories/automationRepository.ts:24-27`, `:49-52`, `:120-123`).

The only test of this is `src/repositories/projectRepository.test.ts`. It mocks `db.project.findFirst` and asserts the `where` contains both keys. It covers only `findProjectAccess`.

## 7. Middleware

`middleware.ts:6-20` checks only whether the cookie **exists**. `/app/*` without a cookie redirects to `/login`. `/login` with a cookie redirects to `/app`. The matcher is `["/app/:path*", "/login"]` (`:22-24`), so `/api/*` never goes through middleware. With a stale or forged cookie, middleware lets you into `/app`, and the page's first `/api/bootstrap` call then returns 401. The real checks are in `session.ts`, `request-context.ts`, and `permissions.ts`.

## Senior review findings

1. **Login timing leaks which emails exist.** When the email is unknown, `authService.login()` returns at `:21-23` without running bcrypt. When the email is known, it runs a 10-round bcrypt compare (`src/lib/auth/password.ts:13`, `:19-21`). The response time difference reveals which emails are registered. Fix: compare against a dummy hash when the user is missing. There is also no rate limit or lockout anywhere in the login path.
2. **Expired sessions are never purged** (`session.ts:94-97`). See section 2.
3. **The heartbeat writes on every request** (`session.ts:112`). Under load that is one UPDATE per GET. Throttling it, for example only when `lastSeenAt` is older than a minute, would keep the feature.
4. **Org `VIEWER` is decorative.** See section 5. Either remove the enum value or make `hasProjectPermission` cap project roles by org role.
5. **Errors leak project existence within a tenant** (403 instead of 404). See section 4.

## Exercises

1. **Goal:** Prove the DB never stores the cookie value.
   **Check:** In `src/lib/auth/session.ts`, follow `token` from `:50` to `:54`. Only `hashToken(token)` reaches `authRepository.createSession`. The raw value appears only in `cookieStore.set` at `:62`.
2. **Goal:** Predict what happens when an owner removes the viewer's Acme membership while the viewer is logged in.
   **Check:** Trace `getSessionContext()`. Line `:99` reloads memberships. The viewer has only one org, so `activeOrganization` is undefined, and `:105-110` deletes the session. The next `/api/bootstrap` returns 401 from `requireSessionContext()` (`:129-131`).
3. **Goal:** Find the response for `lead@acme.test` posting an issue to Globex's project id under the Acme org URL.
   **Check:** `requireOrganizationContext` passes (Acme member). `findProjectAccess` filters `{ id: globexProjectId, organizationId: acmeId }` and returns null. `request-context.ts:44-46` throws, and the response is 404 "Project not found in the active organization."
4. **Goal:** List the permissions that exist but are never checked.
   **Check:** Search for each name from `permissions.ts:16-27` across `src/`. `project:view`, `project:manage`, and `custom-field:manage` appear only in `permissions.ts`.
