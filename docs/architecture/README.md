# Architecture Overview

WorkGrid is a multi-tenant Jira-like work management platform built around explicit request boundaries and reviewable backend layers. The main data path is `route -> auth/request context -> Zod validation -> service -> repository -> Prisma`, which keeps business rules and tenant scoping out of React components.

## Top-Level Folders

- `prisma/`
  Seed and schema live here. `prisma/schema.prisma` defines the tenant boundary with `Organization`, `Membership`, `Project`, `Issue`, `AutomationJob`, and related models. `prisma/seed.ts` creates realistic demo tenants and workflow data.
- `src/app/`
  App Router pages and REST handlers. For example, `src/app/api/bootstrap/route.ts` builds the authenticated workspace payload and `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts` handles issue creation.
- `src/lib/`
  Cross-cutting infrastructure. `src/lib/auth/session.ts` resolves the cookie-backed session, `src/lib/auth/request-context.ts` turns that session into organization or project access, `src/lib/permissions/permissions.ts` maps roles to permissions, and `src/lib/validation/issueSchemas.ts` holds the Zod request shapes.
- `src/repositories/`
  Database access only. `src/repositories/projectRepository.ts` scopes project reads by `organizationId`, `src/repositories/issueRepository.ts` owns issue/comment/activity queries, and `src/repositories/automationRepository.ts` owns automation queue reads and claims.
- `src/services/`
  Business logic and workflow rules. `src/services/issues/issueService.ts` owns issue creation/update/comment behavior, `src/services/workflows/workflowService.ts` enforces terminal done-state transitions, `src/services/projects/projectService.ts` creates project graphs, and `src/services/automation/automationService.ts` executes queued rules.
- `src/components/` and `src/hooks/`
  Client-side orchestration only. `src/components/app/workspace-shell.tsx` calls REST APIs via `src/lib/api/client.ts` and fetches dashboard state through `src/hooks/use-workspace-bootstrap.ts`.
- `docs/`
  Architecture and learning notes tied to real files in this codebase. Start with `docs/architecture/request-lifecycle.md` if you want to trace a request end to end.

## Why The Layers Matter

- Route handlers stay small and reviewable because they mostly parse input and delegate.
- Services own the product rules, such as project creation, status transitions, and automation dispatch.
- Repositories own tenant scoping, which lowers the chance of a future data leak when new services are added.
- The frontend only speaks HTTP to the backend, so the request lifecycle remains visible and teachable.
