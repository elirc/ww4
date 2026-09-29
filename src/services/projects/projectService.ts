/**
 * What this file does:
 * Owns project creation rules and keeps workflow/custom-field bootstrapping out of HTTP handlers.
 * What calls it:
 * src/app/api/organizations/[organizationId]/projects/route.ts.
 * What it calls:
 * src/lib/permissions/permissions.ts, src/repositories/projectRepository.ts, and src/services/projects/projectTemplates.ts.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Creating the project first and the workflow later in separate requests, which leaves partially configured projects behind when one step fails.
 */
import type { OrganizationRole } from "@prisma/client";

import { ConflictError } from "@/lib/http/errors";
import { assertOrganizationCanCreateProject } from "@/lib/permissions/permissions";
import { projectRepository } from "@/repositories/projectRepository";
import { defaultProjectTemplate } from "@/services/projects/projectTemplates";

export const projectService = {
  async createProject(input: {
    organizationId: string;
    actor: {
      userId: string;
      organizationRole: OrganizationRole;
    };
    payload: {
      key: string;
      name: string;
      description?: string | null;
      workflowName?: string;
      statuses?: Array<{
        key: string;
        name: string;
        category: "TODO" | "ACTIVE" | "DONE";
        position: number;
        isInitial: boolean;
      }>;
      customFields?: Array<{
        key: string;
        name: string;
        type: "TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT";
        required: boolean;
        position: number;
        config: Record<string, unknown> | null;
      }>;
    };
  }) {
    assertOrganizationCanCreateProject(input.actor.organizationRole);

    const existingProject = await projectRepository.findProjectByKey({
      organizationId: input.organizationId,
      key: input.payload.key,
    });

    if (existingProject) {
      throw new ConflictError("A project with this key already exists in the organization.");
    }

    return projectRepository.createProjectGraph({
      organizationId: input.organizationId,
      key: input.payload.key,
      name: input.payload.name,
      description: input.payload.description ?? null,
      creatorUserId: input.actor.userId,
      workflowName: input.payload.workflowName ?? defaultProjectTemplate.workflowName,
      statuses: input.payload.statuses ?? defaultProjectTemplate.statuses,
      customFields: input.payload.customFields ?? defaultProjectTemplate.customFields,
    });
  },
};
