/**
 * What this file does:
 * Owns issue, comment, custom-field value, and issue-activity queries for a single tenant-scoped project.
 * What calls it:
 * src/services/issues/issueService.ts, src/services/bootstrap/bootstrapService.ts, and src/services/automation/automationService.ts.
 * What it calls:
 * src/lib/db.ts and src/repositories/repositoryTypes.ts for Prisma access.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Updating an issue by id without joining back to its project and organization, which silently removes tenant isolation from write paths.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type { DbClient } from "./repositoryTypes";

function getClient(client?: DbClient) {
  return client ?? db;
}

export const issueRepository = {
  listIssuesForProject(
    input: {
      organizationId: string;
      projectId: string;
      filter?: {
        search?: string;
        assigneeId?: string;
        statusIds?: string[];
        priority?: string;
        onlyMyIssues?: boolean;
        currentUserId?: string;
      };
    },
    client?: DbClient,
  ) {
    return getClient(client).issue.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        ...(input.filter?.search
          ? {
              OR: [
                {
                  title: {
                    contains: input.filter.search,
                    mode: "insensitive",
                  },
                },
                {
                  description: {
                    contains: input.filter.search,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
        ...(input.filter?.assigneeId ? { assigneeId: input.filter.assigneeId } : {}),
        ...(input.filter?.statusIds?.length ? { statusId: { in: input.filter.statusIds } } : {}),
        ...(input.filter?.priority ? { priority: input.filter.priority as never } : {}),
        ...(input.filter?.onlyMyIssues && input.filter.currentUserId
          ? {
              assigneeId: input.filter.currentUserId,
            }
          : {}),
      },
      include: {
        status: true,
        reporter: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
        customFieldValues: {
          select: {
            customFieldId: true,
            value: true,
          },
        },
        comments: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        activities: {
          orderBy: {
            createdAt: "desc",
          },
          take: 8,
          include: {
            actor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  },

  findIssueForProject(input: { organizationId: string; projectId: string; issueId: string }, client?: DbClient) {
    return getClient(client).issue.findFirst({
      where: {
        id: input.issueId,
        // ⚠️ SENIOR NOTE: id + projectId + organizationId is intentionally redundant; it protects both child and parent ownership assumptions.
        projectId: input.projectId,
        organizationId: input.organizationId,
      },
      include: {
        status: true,
        workflow: {
          include: {
            statuses: {
              orderBy: {
                position: "asc",
              },
            },
          },
        },
        project: {
          include: {
            customFields: {
              orderBy: {
                position: "asc",
              },
            },
          },
        },
      },
    });
  },

  async getNextSequenceNumber(input: { organizationId: string; projectId: string }, client?: DbClient) {
    const result = await getClient(client).issue.aggregate({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
      _max: {
        sequenceNumber: true,
      },
    });

    return (result._max.sequenceNumber ?? 0) + 1;
  },

  createIssue(
    data: Prisma.IssueUncheckedCreateInput,
    client?: DbClient,
  ) {
    return getClient(client).issue.create({
      data,
      include: {
        status: true,
      },
    });
  },

  updateIssue(
    issueId: string,
    organizationId: string,
    projectId: string,
    data: Prisma.IssueUncheckedUpdateInput,
    client?: DbClient,
  ) {
    return getClient(client).issue.updateMany({
      where: {
        id: issueId,
        organizationId,
        projectId,
      },
      data,
    });
  },

  upsertCustomFieldValues(
    issueId: string,
    organizationId: string,
    values: Array<{ customFieldId: string; value: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput }>,
    client?: DbClient,
  ) {
    return Promise.all(
      values.map((entry) =>
        getClient(client).issueCustomFieldValue.upsert({
          where: {
            issueId_customFieldId: {
              issueId,
              customFieldId: entry.customFieldId,
            },
          },
          update: {
            value: entry.value,
          },
          create: {
            issueId,
            organizationId,
            customFieldId: entry.customFieldId,
            value: entry.value,
          },
        }),
      ),
    );
  },

  createComment(
    data: Prisma.IssueCommentUncheckedCreateInput,
    client?: DbClient,
  ) {
    return getClient(client).issueComment.create({
      data,
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  createActivity(
    data: Prisma.IssueActivityUncheckedCreateInput,
    client?: DbClient,
  ) {
    return getClient(client).issueActivity.create({
      data,
    });
  },
};
