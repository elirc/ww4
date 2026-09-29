/**
 * What this file does:
 * Centralizes role-to-permission mapping for organization-level and project-level actions.
 * What calls it:
 * src/lib/auth/request-context.ts plus service files that need explicit authorization before business logic runs.
 * What it calls:
 * src/lib/http/errors.ts when access must be rejected.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Hard-coding role checks inline per route, which guarantees drift once one endpoint evolves and the others do not.
 */
import type { OrganizationRole, ProjectRole } from "@prisma/client";

import { ForbiddenError } from "@/lib/http/errors";
import type { ProjectAccessContext } from "@/types/domain";

export type ProjectPermission =
  | "project:view"
  | "project:manage"
  | "issue:create"
  | "issue:edit"
  | "issue:transition"
  | "comment:create"
  | "filter:create"
  | "filter:share"
  | "custom-field:manage"
  | "automation:manage"
  | "job:process";

const orgAdminRoles: OrganizationRole[] = ["ORG_OWNER", "ORG_ADMIN"];

const projectRolePermissions: Record<ProjectRole, ProjectPermission[]> = {
  LEAD: [
    "project:view",
    "project:manage",
    "issue:create",
    "issue:edit",
    "issue:transition",
    "comment:create",
    "filter:create",
    "filter:share",
    "custom-field:manage",
    "automation:manage",
    "job:process",
  ],
  CONTRIBUTOR: [
    "project:view",
    "issue:create",
    "issue:edit",
    "issue:transition",
    "comment:create",
    "filter:create",
  ],
  OBSERVER: ["project:view", "comment:create", "filter:create"],
};

export function isOrganizationAdmin(role: OrganizationRole) {
  return orgAdminRoles.includes(role);
}

export function assertOrganizationCanCreateProject(role: OrganizationRole) {
  if (!isOrganizationAdmin(role)) {
    throw new ForbiddenError("Only organization admins can create projects.");
  }
}

export function hasProjectPermission(access: ProjectAccessContext, permission: ProjectPermission) {
  if (isOrganizationAdmin(access.organizationRole)) {
    return true;
  }

  if (!access.projectRole) {
    return false;
  }

  return projectRolePermissions[access.projectRole].includes(permission);
}

export function assertProjectPermission(access: ProjectAccessContext, permission: ProjectPermission) {
  if (!hasProjectPermission(access, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}.`);
  }
}
