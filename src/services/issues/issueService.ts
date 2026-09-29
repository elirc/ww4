/**
 * What this file does:
 * Owns issue creation, updates, comments, custom-field validation, and workflow transition rules.
 * What calls it:
 * Issue and comment route handlers plus automation processing when it needs issue context.
 * What it calls:
 * Repositories for projects, issues, and automation plus src/services/workflows/workflowService.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Letting the UI decide which status is initial or which custom-field values are valid instead of re-checking against database-backed project configuration.
 */
import { CustomFieldType, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/http/errors";
import { assertProjectPermission } from "@/lib/permissions/permissions";
import { issueRepository } from "@/repositories/issueRepository";
import { projectRepository } from "@/repositories/projectRepository";
import { automationService } from "@/services/automation/automationService";
import { assertValidStatusTransition, requireInitialWorkflowStatus, requireWorkflowStatus } from "@/services/workflows/workflowService";
import type { ProjectAccessContext } from "@/types/domain";

function normalizeJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined || value === "") {
    return Prisma.JsonNull;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  ) {
    return value as Prisma.InputJsonValue;
  }

  throw new BadRequestError("Unsupported custom field value type.");
}

function validateCustomFieldValues(
  definitions: Array<{
    id: string;
    name: string;
    type: CustomFieldType;
    required: boolean;
    config: Prisma.JsonValue | null;
  }>,
  values: Array<{ customFieldId: string; value: unknown }>,
) {
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));

  for (const entry of values) {
    const definition = definitionMap.get(entry.customFieldId);

    if (!definition) {
      throw new BadRequestError("A custom field value referenced a field that does not belong to this project.");
    }

    if (definition.required && (entry.value === null || entry.value === undefined || entry.value === "")) {
      throw new BadRequestError(`Custom field "${definition.name}" is required.`);
    }

    if (entry.value === null || entry.value === undefined || entry.value === "") {
      continue;
    }

    switch (definition.type) {
      case CustomFieldType.TEXT:
        if (typeof entry.value !== "string") {
          throw new BadRequestError(`Custom field "${definition.name}" must be text.`);
        }
        break;
      case CustomFieldType.NUMBER:
        if (typeof entry.value !== "number") {
          throw new BadRequestError(`Custom field "${definition.name}" must be a number.`);
        }
        break;
      case CustomFieldType.DATE:
        if (typeof entry.value !== "string" || Number.isNaN(Date.parse(entry.value))) {
          throw new BadRequestError(`Custom field "${definition.name}" must be an ISO date string.`);
        }
        break;
      case CustomFieldType.SINGLE_SELECT: {
        if (typeof entry.value !== "string") {
          throw new BadRequestError(`Custom field "${definition.name}" must be a selected option.`);
        }

        const config = (definition.config ?? {}) as { options?: string[] };

        if (!config.options?.includes(entry.value)) {
          throw new BadRequestError(`Custom field "${definition.name}" received an invalid option.`);
        }
        break;
      }
      default:
        throw new BadRequestError("Unsupported custom field type.");
    }
  }

  const providedIds = new Set(
    values
      .filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== "")
      .map((entry) => entry.customFieldId),
  );

  for (const definition of definitions) {
    if (definition.required && !providedIds.has(definition.id)) {
      throw new BadRequestError(`Custom field "${definition.name}" is required.`);
    }
  }
}

async function assertAssigneeIsProjectMember(input: {
  organizationId: string;
  projectId: string;
  assigneeId: string | null | undefined;
}) {
  if (!input.assigneeId) {
    return;
  }

  const members = await projectRepository.listProjectMembers({
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const member = members.find((entry) => entry.user.id === input.assigneeId);

  if (!member) {
    throw new BadRequestError("Assignee must be a member of the selected project.");
  }
}

export const issueService = {
  async createIssue(input: {
    access: ProjectAccessContext;
    actorUserId: string;
    payload: {
      title: string;
      description?: string | null;
      type: "TASK" | "BUG" | "STORY";
      priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      assigneeId?: string | null;
      dueDate?: string | null;
      customFieldValues: Array<{ customFieldId: string; value: unknown }>;
    };
  }) {
    assertProjectPermission(input.access, "issue:create");

    const project = await projectRepository.getProjectSetup({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      userId: input.actorUserId,
    });

    if (!project?.workflow) {
      throw new NotFoundError("Project workflow could not be loaded.");
    }

    await assertAssigneeIsProjectMember({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      assigneeId: input.payload.assigneeId,
    });

    validateCustomFieldValues(project.customFields, input.payload.customFieldValues);
    const workflow = project.workflow;
    const initialStatus = requireInitialWorkflowStatus(workflow.statuses);

    return db.$transaction(async (tx) => {
      const sequenceNumber = await issueRepository.getNextSequenceNumber(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
        },
        tx,
      );

      const issue = await issueRepository.createIssue(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          workflowId: workflow.id,
          statusId: initialStatus.id,
          sequenceNumber,
          title: input.payload.title,
          description: input.payload.description ?? null,
          type: input.payload.type,
          priority: input.payload.priority,
          reporterId: input.actorUserId,
          assigneeId: input.payload.assigneeId ?? null,
          dueDate: input.payload.dueDate ? new Date(input.payload.dueDate) : null,
        },
        tx,
      );

      if (input.payload.customFieldValues.length) {
        await issueRepository.upsertCustomFieldValues(
          issue.id,
          input.access.organizationId,
          input.payload.customFieldValues.map((entry) => ({
            customFieldId: entry.customFieldId,
            value: normalizeJsonValue(entry.value),
          })),
          tx,
        );
      }

      await issueRepository.createActivity(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          issueId: issue.id,
          actorUserId: input.actorUserId,
          type: "ISSUE_CREATED",
          message: `${input.access.projectKey}-${sequenceNumber} created in ${initialStatus.name}.`,
        },
        tx,
      );

      await automationService.enqueueIssueEvent(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          issueId: issue.id,
          eventType: "ISSUE_CREATED",
          payload: {
            actorUserId: input.actorUserId,
            issueId: issue.id,
            toStatusId: initialStatus.id,
            priority: input.payload.priority,
          },
        },
        tx,
      );

      return {
        id: issue.id,
        key: `${input.access.projectKey}-${sequenceNumber}`,
      };
    });
  },

  async updateIssue(input: {
    access: ProjectAccessContext;
    actorUserId: string;
    issueId: string;
    payload: {
      title?: string;
      description?: string | null;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      assigneeId?: string | null;
      dueDate?: string | null;
      statusId?: string;
      customFieldValues?: Array<{ customFieldId: string; value: unknown }>;
    };
  }) {
    assertProjectPermission(input.access, "issue:edit");

    if (input.payload.statusId) {
      assertProjectPermission(input.access, "issue:transition");
    }

    const issue = await issueRepository.findIssueForProject({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      issueId: input.issueId,
    });

    if (!issue) {
      throw new NotFoundError("Issue not found for this project.");
    }

    if (!issue.workflow) {
      throw new ConflictError("Issue workflow metadata could not be loaded.");
    }

    if (input.payload.assigneeId !== undefined) {
      await assertAssigneeIsProjectMember({
        organizationId: input.access.organizationId,
        projectId: input.access.projectId,
        assigneeId: input.payload.assigneeId,
      });
    }

    if (input.payload.customFieldValues) {
      validateCustomFieldValues(issue.project.customFields, input.payload.customFieldValues);
    }

    const nextStatus = input.payload.statusId
      ? requireWorkflowStatus(issue.workflow.statuses, input.payload.statusId)
      : issue.status;

    if (input.payload.statusId) {
      assertValidStatusTransition(issue.status, nextStatus);
    }

    return db.$transaction(async (tx) => {
      const update = await issueRepository.updateIssue(
        input.issueId,
        input.access.organizationId,
        input.access.projectId,
        {
          ...(input.payload.title !== undefined ? { title: input.payload.title } : {}),
          ...(input.payload.description !== undefined ? { description: input.payload.description } : {}),
          ...(input.payload.priority !== undefined ? { priority: input.payload.priority } : {}),
          ...(input.payload.assigneeId !== undefined ? { assigneeId: input.payload.assigneeId } : {}),
          ...(input.payload.dueDate !== undefined
            ? { dueDate: input.payload.dueDate ? new Date(input.payload.dueDate) : null }
            : {}),
          ...(input.payload.statusId ? { statusId: input.payload.statusId } : {}),
        },
        tx,
      );

      if (update.count !== 1) {
        throw new NotFoundError("Issue update failed because the issue was not found.");
      }

      if (input.payload.customFieldValues?.length) {
        await issueRepository.upsertCustomFieldValues(
          input.issueId,
          input.access.organizationId,
          input.payload.customFieldValues.map((entry) => ({
            customFieldId: entry.customFieldId,
            value: normalizeJsonValue(entry.value),
          })),
          tx,
        );

        await issueRepository.createActivity(
          {
            organizationId: input.access.organizationId,
            projectId: input.access.projectId,
            issueId: input.issueId,
            actorUserId: input.actorUserId,
            type: "CUSTOM_FIELD_SET",
            message: "Custom fields updated.",
          },
          tx,
        );
      }

      await issueRepository.createActivity(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          type: input.payload.statusId ? "STATUS_CHANGED" : "ISSUE_UPDATED",
          message: input.payload.statusId
            ? `Moved from ${issue.status.name} to ${nextStatus.name}.`
            : "Issue details updated.",
          metadata: input.payload.statusId
            ? {
                fromStatusId: issue.status.id,
                toStatusId: nextStatus.id,
              }
            : Prisma.JsonNull,
        },
        tx,
      );

      if (input.payload.statusId) {
        await automationService.enqueueIssueEvent(
          {
            organizationId: input.access.organizationId,
            projectId: input.access.projectId,
            issueId: input.issueId,
            eventType: "ISSUE_STATUS_CHANGED",
            payload: {
              actorUserId: input.actorUserId,
              issueId: input.issueId,
              fromStatusId: issue.status.id,
              toStatusId: nextStatus.id,
              priority: input.payload.priority ?? issue.priority,
            },
          },
          tx,
        );
      }

      return {
        id: input.issueId,
      };
    });
  },

  async addComment(input: {
    access: ProjectAccessContext;
    actorUserId: string;
    issueId: string;
    body: string;
    isSystem?: boolean;
  }) {
    assertProjectPermission(input.access, "comment:create");

    const issue = await issueRepository.findIssueForProject({
      organizationId: input.access.organizationId,
      projectId: input.access.projectId,
      issueId: input.issueId,
    });

    if (!issue) {
      throw new NotFoundError("Issue not found for this project.");
    }

    return db.$transaction(async (tx) => {
      const comment = await issueRepository.createComment(
        {
          organizationId: input.access.organizationId,
          issueId: input.issueId,
          authorId: input.actorUserId,
          body: input.body,
          isSystem: input.isSystem ?? false,
        },
        tx,
      );

      await issueRepository.createActivity(
        {
          organizationId: input.access.organizationId,
          projectId: input.access.projectId,
          issueId: input.issueId,
          actorUserId: input.actorUserId,
          type: "COMMENT_ADDED",
          message: input.isSystem ? "Automation added a comment." : "Comment added to issue.",
        },
        tx,
      );

      return comment;
    });
  },
};
