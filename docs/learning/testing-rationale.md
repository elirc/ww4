# Testing Rationale

## `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.test.ts` — returns 403 when a viewer tries to create an issue
This behavior matters because permission regressions on write endpoints usually do not show up as crashes. They show up as unauthorized data mutations that look legitimate after the fact. This test guards the route-level contract that protected endpoints return the right status when `requireProjectAccess()` fails with `ForbiddenError`.

A more thorough production suite would add:
- direct tests for contributor vs lead vs observer behavior across multiple endpoints
- integration coverage that exercises real session resolution instead of mocking `requireProjectAccess()`
- regression cases for org admin bypass behavior

## `src/lib/validation/issueSchemas.test.ts` — rejects a malformed issue payload
This behavior matters because once malformed payloads cross the validation boundary, downstream code has to defensively re-check every field or risk partial writes. This test protects the contract that issue shape validation happens before service logic.

A more thorough production suite would add:
- table-driven tests for invalid `priority`, `type`, and malformed `dueDate`
- route-level assertions that malformed payloads return `400` with flattened Zod errors
- cases for oversized descriptions and custom-field arrays

## `src/services/workflows/workflowService.test.ts` — rejects moving an issue out of a done status
This behavior matters because workflow/state regressions can silently corrupt reporting and reopen work that downstream teams assumed was complete. This test specifically protects the terminal done-state rule implemented in `assertValidStatusTransition()`.

A more thorough production suite would add:
- a matrix of allowed and rejected status transitions
- service-level tests proving `issueService.updateIssue()` surfaces the workflow error correctly
- tests for projects with misconfigured workflows that are missing an initial status

## `src/repositories/projectRepository.test.ts` — always scopes project access queries by organizationId
This behavior matters because cross-tenant leaks often happen through one missing parent filter on an otherwise correct query. This test checks the repository call shape directly so reviewers have a failing test if someone later “simplifies” the query to id-only lookup.

A more thorough production suite would add:
- integration tests against a real database with two organizations and colliding child ids
- equivalent scoping tests for issue, filter, and automation repositories
- end-to-end tests proving a user from one org cannot resolve another org’s project through any route
