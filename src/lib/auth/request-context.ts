/**
 * What this file does:
 * Resolves the authenticated actor into organization and project access contexts before services execute.
 * What calls it:
 * Route handlers in src/app/api and authenticated pages that need current-session metadata.
 * What it calls:
 * src/lib/auth/session.ts, src/lib/permissions/permissions.ts, and src/repositories/projectRepository.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Performing membership checks after the repository call, which can accidentally let callers probe whether foreign records exist.
 */
import { NotFoundError } from "@/lib/http/errors";
import { assertProjectPermission } from "@/lib/permissions/permissions";
import { projectRepository } from "@/repositories/projectRepository";
import type { ProjectAccessContext } from "@/types/domain";

import { requireSessionContext } from "./session";

export async function requireOrganizationContext(organizationId: string) {
  const session = await requireSessionContext();
  const membership = session.organizations.find((organization) => organization.id === organizationId);

  if (!membership) {
    throw new NotFoundError("Organization membership was not found for the current user.");
  }

  return {
    session,
    organization: membership,
  };
}

export async function requireProjectAccess(input: {
  organizationId: string;
  projectId: string;
  permission?: Parameters<typeof assertProjectPermission>[1];
}) {
  const { session, organization } = await requireOrganizationContext(input.organizationId);
  const project = await projectRepository.findProjectAccess({
    organizationId: input.organizationId,
    projectId: input.projectId,
    userId: session.user.id,
  });

  if (!project) {
    throw new NotFoundError("Project not found in the active organization.");
  }

  const access: ProjectAccessContext = {
    organizationId: organization.id,
    organizationRole: organization.role,
    projectId: project.id,
    projectKey: project.key,
    projectRole: project.projectMemberships[0]?.role ?? null,
  };

  if (input.permission) {
    assertProjectPermission(access, input.permission);
  }

  return {
    session,
    organization,
    project,
    access,
  };
}
