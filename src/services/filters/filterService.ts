/**
 * What this file does:
 * Applies filter visibility rules and stores saved project queries.
 * What calls it:
 * src/app/api/organizations/[organizationId]/filters/route.ts.
 * What it calls:
 * src/lib/permissions/permissions.ts and src/repositories/filterRepository.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating “shared” as a UI-only flag and forgetting that it changes who is allowed to create or see the filter.
 */
import { Prisma } from "@prisma/client";

import { assertProjectPermission } from "@/lib/permissions/permissions";
import { filterRepository } from "@/repositories/filterRepository";
import type { ProjectAccessContext } from "@/types/domain";

export const filterService = {
  async createFilter(input: {
    access: ProjectAccessContext;
    actorUserId: string;
    payload: {
      name: string;
      isShared: boolean;
      query: Record<string, unknown>;
    };
  }) {
    assertProjectPermission(input.access, "filter:create");

    if (input.payload.isShared) {
      assertProjectPermission(input.access, "filter:share");
    }

    return filterRepository.createFilter({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      ownerId: input.actorUserId,
      name: input.payload.name,
      isShared: input.payload.isShared,
      query: input.payload.query as Prisma.InputJsonValue,
    });
  },
};
