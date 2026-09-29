/**
 * What this file does:
 * Stores and retrieves saved issue filters for one organization, including shared and personal visibility rules.
 * What calls it:
 * src/services/filters/filterService.ts and src/services/bootstrap/bootstrapService.ts.
 * What it calls:
 * src/lib/db.ts for Prisma access.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Listing all shared filters in the database instead of constraining them to the caller's organization first.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export const filterRepository = {
  listVisibleFilters(input: { organizationId: string; projectId: string; ownerId: string }) {
    return db.savedFilter.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        OR: [{ ownerId: input.ownerId }, { isShared: true }],
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ isShared: "desc" }, { createdAt: "asc" }],
    });
  },

  createFilter(data: Prisma.SavedFilterUncheckedCreateInput) {
    return db.savedFilter.create({
      data,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
};
