/**
 * What this file does:
 * Stores automation rules, queues issue events, and processes pending automation jobs.
 * What calls it:
 * Issue services queue events, automation API routes create rules and trigger job processing.
 * What it calls:
 * Automation, project, and issue repositories plus workflow validation logic.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Mixing synchronous side effects directly into the issue update transaction, which makes a simple status change fail because an optional automation action was misconfigured.
 */
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { BadRequestError, NotFoundError } from "@/lib/http/errors";
import { assertProjectPermission } from "@/lib/permissions/permissions";
import { automationRepository } from "@/repositories/automationRepository";
import { issueRepository } from "@/repositories/issueRepository";
import { projectRepository } from "@/repositories/projectRepository";
import type { DbClient } from "@/repositories/repositoryTypes";
import type { ProjectAccessContext } from "@/types/domain";

function matchesConditions(
  conditions: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown>,
) {
  if (!conditions) {
    return true;
  }

  if (conditions.fromStatusId && conditions.fromStatusId !== payload.fromStatusId) {
    return false;
  }

  if (conditions.toStatusId && conditions.toStatusId !== payload.toStatusId) {
    return false;
  }

  if (conditions.priority && conditions.priority !== payload.priority) {
    return false;
  }

  return true;
}

async function assertAssigneeIsProjectMember(input: {
  organizationId: string;
  projectId: string;
  assigneeId: string;
}) {
  const members = await projectRepository.listProjectMembers({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const member = members.find((entry) => entry.user.id === input.assigneeId);

  if (!member) {
    throw new BadRequestError("Automation assignee must be a member of the selected project.");
  }
}

export const automationService = {
  createRule(input: {
    access: ProjectAccessContext;
    payload: {
      name: string;
      eventType: "ISSUE_CREATED" | "ISSUE_STATUS_CHANGED";
      actionType: "ADD_COMMENT" | "ASSIGN_USER";
      conditions?: {
        fromStatusId?: string;
        toStatusId?: string;
        priority?: string;
      };
      actionPayload: Record<string, unknown>;
    };
  }) {
    assertProjectPermission(input.access, "automation:manage");

    return automationRepository.createRule({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      name: input.payload.name,
      eventType: input.payload.eventType,
      actionType: input.payload.actionType,
      conditions: toJsonValue(input.payload.conditions),
      actionPayload: toJsonValue(input.payload.actionPayload),
    });
  },

  enqueueIssueEvent(
    input: {
      organizationId: string;
      projectId: string;
      issueId: string;
      eventType: "ISSUE_CREATED" | "ISSUE_STATUS_CHANGED";
      payload: Record<string, unknown>;
    },
    client?: DbClient,
  ) {
    return automationRepository.enqueueJob(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        issueId: input.issueId,
        eventType: input.eventType,
        payload: toJsonValue(input.payload),
      },
      client,
    );
  },

  async processPendingJobs(input: {
    access: ProjectAccessContext;
    actorUserId: string;
    limit: number;
  }) {
    assertProjectPermission(input.access, "job:process");

    const jobs = await automationRepository.claimPendingJobs({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      limit: input.limit,
    });

    const rules = await automationRepository.listRulesForProject({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
    });

    const results: Array<{ jobId: string; appliedRuleCount: number }> = [];

    for (const job of jobs) {
      try {
        const issue = await issueRepository.findIssueForProject({
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          issueId: job.issueId,
        });

        if (!issue) {
          throw new NotFoundError("Automation job referenced an issue that no longer exists.");
        }

        let appliedRuleCount = 0;

        for (const rule of rules) {
          if (!rule.isEnabled || rule.eventType !== job.eventType) {
            continue;
          }

          if (!matchesConditions((rule.conditions ?? null) as Record<string, unknown> | null, job.payload as Record<string, unknown>)) {
            continue;
          }

          await db.$transaction(async (tx) => {
            if (rule.actionType === "ADD_COMMENT") {
              const payload = rule.actionPayload as { comment?: string };

              if (!payload.comment) {
                throw new BadRequestError("Automation comment payload is missing a comment body.");
              }

              await issueRepository.createComment(
                {
                  organizationId: input.access.organizationId,
                  issueId: issue.id,
                  authorId: input.actorUserId,
                  body: payload.comment,
                  isSystem: true,
                },
                tx,
              );
            }

            if (rule.actionType === "ASSIGN_USER") {
              const payload = rule.actionPayload as { assigneeId?: string };

              if (!payload.assigneeId) {
                throw new BadRequestError("Automation assign-user payload is missing an assignee.");
              }

              await assertAssigneeIsProjectMember({
                organizationId: input.access.organizationId,
                projectId: input.access.projectId,
                assigneeId: payload.assigneeId,
              });

              await issueRepository.updateIssue(
                issue.id,
                input.access.organizationId,
                input.access.projectId,
                {
                  assigneeId: payload.assigneeId,
                },
                tx,
              );
            }

            await issueRepository.createActivity(
              {
                organizationId: input.access.organizationId,
                projectId: input.access.projectId,
                issueId: issue.id,
                actorUserId: input.actorUserId,
                type: "AUTOMATION_TRIGGERED",
                message: `Automation rule "${rule.name}" ran for ${job.eventType}.`,
              },
              tx,
            );
          });

          appliedRuleCount += 1;
        }

        await automationRepository.completeJob(job.id);

        results.push({
          jobId: job.id,
          appliedRuleCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown automation processing error.";
        await automationRepository.failJob(job.id, message);
      }
    }

    return results;
  },
};
function toJsonValue(value: Record<string, unknown> | null | undefined) {
  return (value ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull;
}
