/**
 * What this file does:
 * Encapsulates project and project-access queries, including org scoping and project membership lookups.
 * What calls it:
 * src/lib/auth/request-context.ts, src/services/projects/projectService.ts, and src/services/bootstrap/bootstrapService.ts.
 * What it calls:
 * src/lib/db.ts for Prisma access.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Fetching a project by id alone and assuming the caller already scoped it to the organization, which is a classic tenant data leak.
 */
import { Prisma, WorkflowStatusCategory } from "@prisma/client";

import { db } from "@/lib/db";

export const projectRepository = {
  listProjectsForUserInOrganization(input: { organizationId: string; userId: string; isOrgAdmin: boolean }) {
    return db.project.findMany({
      // Tenant scope belongs in the repository so every caller inherits the org boundary by default.
      where: {
        organizationId: input.organizationId,
        ...(input.isOrgAdmin
          ? {}
          : {
              projectMemberships: {
                some: {
                  userId: input.userId,
                },
              },
            }),
      },
      include: {
        projectMemberships: {
          where: {
            userId: input.userId,
          },
          select: {
            role: true,
          },
        },
        _count: {
          select: {
            issues: true,
          },
        },
        issues: {
          where: {
            status: {
              category: {
                not: WorkflowStatusCategory.DONE,
              },
            },
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  findProjectAccess(input: { organizationId: string; projectId: string; userId: string }) {
    return db.project.findFirst({
      // ⚠️ SENIOR NOTE: The organizationId filter is the load-bearing tenant guard; without it, a valid project id from another tenant would resolve.
      where: {
        id: input.projectId,
        organizationId: input.organizationId,
      },
      include: {
        projectMemberships: {
          where: {
            userId: input.userId,
          },
          select: {
            role: true,
          },
        },
      },
    });
  },

  getProjectSetup(input: { organizationId: string; projectId: string; userId: string }) {
    return db.project.findFirst({
      where: {
        id: input.projectId,
        // Tenant scope stays here so status and custom-field reads cannot float across organizations.
        organizationId: input.organizationId,
      },
      include: {
        projectMemberships: {
          where: {
            userId: input.userId,
          },
          select: {
            role: true,
          },
        },
        workflow: {
          include: {
            statuses: {
              orderBy: {
                position: "asc",
              },
            },
          },
        },
        boards: {
          where: {
            isDefault: true,
          },
          include: {
            columns: {
              include: {
                status: true,
              },
              orderBy: {
                position: "asc",
              },
            },
          },
        },
        customFields: {
          orderBy: {
            position: "asc",
          },
        },
      },
    });
  },

  listProjectMembers(input: { organizationId: string; projectId: string }) {
    return db.projectMembership.findMany({
      where: {
        projectId: input.projectId,
        project: {
          organizationId: input.organizationId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  findProjectByKey(input: { organizationId: string; key: string }) {
    return db.project.findFirst({
      where: {
        organizationId: input.organizationId,
        key: input.key,
      },
    });
  },

  createProjectGraph(input: {
    organizationId: string;
    key: string;
    name: string;
    description: string | null;
    creatorUserId: string;
    workflowName: string;
    statuses: Array<{
      key: string;
      name: string;
      category: WorkflowStatusCategory;
      position: number;
      isInitial: boolean;
    }>;
    customFields: Array<{
      key: string;
      name: string;
      type: "TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT";
      required: boolean;
      position: number;
      config: Record<string, unknown> | null;
    }>;
  }) {
    return db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          key: input.key,
          name: input.name,
          description: input.description,
          projectMemberships: {
            create: {
              userId: input.creatorUserId,
              role: "LEAD",
            },
          },
          workflow: {
            create: {
              organizationId: input.organizationId,
              name: input.workflowName,
              statuses: {
                create: input.statuses,
              },
            },
          },
          boards: {
            create: {
              organizationId: input.organizationId,
              name: `${input.name} Board`,
              isDefault: true,
            },
          },
        },
        include: {
          workflow: {
            include: {
              statuses: {
                orderBy: {
                  position: "asc",
                },
              },
            },
          },
          boards: true,
        },
      });

      const board = project.boards[0];

      if (!board || !project.workflow) {
        throw new Error("Expected project board and workflow to be created in the same transaction.");
      }

      await tx.boardColumn.createMany({
        data: project.workflow.statuses.map((status: (typeof project.workflow.statuses)[number]) => ({
          boardId: board.id,
          statusId: status.id,
          name: status.name,
          position: status.position,
          wipLimit: status.category === WorkflowStatusCategory.ACTIVE ? 5 : null,
        })),
      });

      await tx.customFieldDefinition.createMany({
        data: input.customFields.map((field) => ({
          organizationId: input.organizationId,
          projectId: project.id,
          key: field.key,
          name: field.name,
          type: field.type,
          required: field.required,
          position: field.position,
          config: (field.config ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
        })),
      });

      return project;
    });
  },
};
