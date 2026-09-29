/**
 * What this file does:
 * Handles automation rules and queue records so async workflow execution stays explicit and auditable.
 * What calls it:
 * src/services/automation/automationService.ts and src/services/bootstrap/bootstrapService.ts.
 * What it calls:
 * src/lib/db.ts and repository transaction helpers.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Processing queue jobs without first claiming them in the database, which creates duplicate automation actions under concurrent workers.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type { DbClient } from "./repositoryTypes";

function getClient(client?: DbClient) {
  return client ?? db;
}

export const automationRepository = {
  listRulesForProject(input: { organizationId: string; projectId: string }) {
    return db.automationRule.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  createRule(data: Prisma.AutomationRuleUncheckedCreateInput) {
    return db.automationRule.create({
      data,
    });
  },

  enqueueJob(data: Prisma.AutomationJobUncheckedCreateInput, client?: DbClient) {
    return getClient(client).automationJob.create({
      data,
    });
  },

  async claimPendingJobs(input: { organizationId: string; projectId: string; limit: number }, client?: DbClient) {
    const prisma = getClient(client);
    const jobs = await prisma.automationJob.findMany({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "PENDING",
        availableAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: input.limit,
    });

    const claimedJobIds: string[] = [];

    for (const job of jobs) {
      const update = await prisma.automationJob.updateMany({
        where: {
          id: job.id,
          status: "PENDING",
        },
        data: {
          status: "PROCESSING",
          attempts: {
            increment: 1,
          },
        },
      });

      if (update.count === 1) {
        claimedJobIds.push(job.id);
      }
    }

    return prisma.automationJob.findMany({
      where: {
        id: {
          in: claimedJobIds,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  },

  completeJob(jobId: string, client?: DbClient) {
    return getClient(client).automationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  },

  failJob(jobId: string, errorMessage: string, client?: DbClient) {
    return getClient(client).automationJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        processedAt: new Date(),
        errorMessage,
      },
    });
  },

  countPendingJobs(input: { organizationId: string; projectId: string }) {
    return db.automationJob.count({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "PENDING",
      },
    });
  },
};
