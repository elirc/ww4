# Load-Bearing Files

## src/lib/auth/request-context.ts
- What it does: Builds organization and project access contexts from the active session.
- What calls it: `src/app/api/organizations/[organizationId]/projects/route.ts`, `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts`, `src/app/api/organizations/[organizationId]/filters/route.ts`, `src/app/api/organizations/[organizationId]/automation/process/route.ts`.
- What it calls: `src/lib/auth/session.ts`, `src/repositories/projectRepository.ts`, `src/lib/permissions/permissions.ts`.
- What would break or become insecure if this file were wrong: Routes could run against the wrong tenant or skip permission checks entirely.
- What a junior engineer would likely miswrite here: Checking project membership without first checking organization membership.

## src/lib/permissions/permissions.ts
- What it does: Maps org and project roles to named permissions.
- What calls it: `src/lib/auth/request-context.ts`, `src/services/projects/projectService.ts`, `src/services/issues/issueService.ts`, `src/services/automation/automationService.ts`.
- What it calls: `src/lib/http/errors.ts`.
- What would break or become insecure if this file were wrong: Write endpoints could become available to observers/viewers, or admins could lose expected access.
- What a junior engineer would likely miswrite here: Hard-coding role strings directly in services instead of calling shared permission helpers.

## src/services/issues/issueService.ts
- What it does: Creates issues, updates issues, validates custom fields, enforces transition rules, and records activities.
- What calls it: `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/route.ts`, `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/route.ts`, `src/app/api/organizations/[organizationId]/projects/[projectId]/issues/[issueId]/comments/route.ts`.
- What it calls: `src/repositories/projectRepository.ts`, `src/repositories/issueRepository.ts`, `src/services/workflows/workflowService.ts`, `src/services/automation/automationService.ts`.
- What would break or become insecure if this file were wrong: Invalid status changes, bad custom-field values, or unscoped assignee choices could persist to the database.
- What a junior engineer would likely miswrite here: Trusting the incoming `statusId` or `customFieldValues` without loading project configuration first.

## src/repositories/projectRepository.ts
- What it does: Loads project access, project setup, accessible project lists, and creates a full project graph transactionally.
- What calls it: `src/lib/auth/request-context.ts`, `src/services/projects/projectService.ts`, `src/services/bootstrap/bootstrapService.ts`, `src/services/issues/issueService.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: Tenant isolation and project bootstrapping would both fail in hard-to-diagnose ways.
- What a junior engineer would likely miswrite here: Querying `project.findUnique({ id })` and forgetting the org filter.

## src/repositories/issueRepository.ts
- What it does: Performs issue, comment, activity, and custom-field writes and reads.
- What calls it: `src/services/issues/issueService.ts`, `src/services/bootstrap/bootstrapService.ts`, `src/services/automation/automationService.ts`.
- What it calls: `src/lib/db.ts`.
- What would break or become insecure if this file were wrong: A missing scope on `findIssueForProject()` would let callers read or update another tenant’s issue by id.
- What a junior engineer would likely miswrite here: Updating by `issueId` alone instead of `issueId + projectId + organizationId`.

## src/services/automation/automationService.ts
- What it does: Creates rules, queues issue events, claims pending jobs, and executes automation actions.
- What calls it: `src/services/issues/issueService.ts`, `src/app/api/organizations/[organizationId]/automation/rules/route.ts`, `src/app/api/organizations/[organizationId]/automation/process/route.ts`.
- What it calls: `src/repositories/automationRepository.ts`, `src/repositories/issueRepository.ts`, `src/repositories/projectRepository.ts`.
- What would break or become insecure if this file were wrong: Automation could duplicate comments/assignments or process jobs across the wrong tenant/project.
- What a junior engineer would likely miswrite here: Executing automation inline during issue writes instead of decoupling it into a queue.

## src/services/bootstrap/bootstrapService.ts
- What it does: Assembles the main dashboard payload for the authenticated client.
- What calls it: `src/app/api/bootstrap/route.ts`.
- What it calls: `src/lib/auth/session.ts`, `src/repositories/projectRepository.ts`, `src/repositories/issueRepository.ts`, `src/repositories/filterRepository.ts`, `src/repositories/automationRepository.ts`.
- What would break or become insecure if this file were wrong: The client could receive raw internal shapes, missing tenant filters, or inconsistent project state.
- What a junior engineer would likely miswrite here: Returning raw Prisma models with extra columns and unstable nested structures.

## prisma/schema.prisma
- What it does: Defines the relational model, role enums, workflow state, and tenant ownership columns.
- What calls it: Prisma Client generation and every repository query in `src/repositories/`.
- What it calls: Nothing directly; it is the source of generated DB types and SQL shape.
- What would break or become insecure if this file were wrong: Missing ownership columns or relations would undermine tenant isolation and workflow correctness.
- What a junior engineer would likely miswrite here: Modeling permissions only in code while leaving the data model too ambiguous to enforce them cleanly.
