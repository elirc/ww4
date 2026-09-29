/**
 * What this file does:
 * Builds the main workspace payload that the frontend consumes after authentication.
 * What calls it:
 * src/app/api/bootstrap/route.ts.
 * What it calls:
 * Session, project, issue, filter, and automation repositories to compose a tenant-scoped dashboard view.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Returning raw Prisma models directly, which leaks internal columns and makes API contracts unstable during schema changes.
 */
import { getSessionContext, requireSessionContext } from "@/lib/auth/session";
import { isOrganizationAdmin } from "@/lib/permissions/permissions";
import { automationRepository } from "@/repositories/automationRepository";
import { filterRepository } from "@/repositories/filterRepository";
import { issueRepository } from "@/repositories/issueRepository";
import { projectRepository } from "@/repositories/projectRepository";
import type { WorkspaceBootstrap } from "@/types/domain";

function serializeIssue(projectKey: string, issue: Awaited<ReturnType<typeof issueRepository.listIssuesForProject>>[number]) {
  return {
    id: issue.id,
    key: `${projectKey}-${issue.sequenceNumber}`,
    sequenceNumber: issue.sequenceNumber,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    priority: issue.priority,
    dueDate: issue.dueDate?.toISOString() ?? null,
    status: {
      id: issue.status.id,
      key: issue.status.key,
      name: issue.status.name,
      category: issue.status.category,
    },
    reporter: issue.reporter,
    assignee: issue.assignee,
    customFieldValues: issue.customFieldValues,
    comments: issue.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      isSystem: comment.isSystem,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
    })),
    activities: issue.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      message: activity.message,
      createdAt: activity.createdAt.toISOString(),
      actor: activity.actor,
    })),
  };
}

export const bootstrapService = {
  async getWorkspaceBootstrap(selectedProjectId?: string): Promise<WorkspaceBootstrap> {
    const session = await requireSessionContext();
    const isOrgAdmin = isOrganizationAdmin(session.activeOrganization.role);
    const projects = await projectRepository.listProjectsForUserInOrganization({
      organizationId: session.activeOrganization.id,
      userId: session.user.id,
      isOrgAdmin,
    });

    const selectedProject = selectedProjectId
      ? projects.find((project) => project.id === selectedProjectId)
      : projects[0];

    if (!selectedProject) {
      return {
        session,
        projects: projects.map((project) => ({
          id: project.id,
          key: project.key,
          name: project.name,
          description: project.description,
          memberRole: project.projectMemberships[0]?.role ?? null,
          issueCount: project._count.issues,
          openIssueCount: project.issues.length,
        })),
        selectedProject: null,
      };
    }

    const [projectSetup, issues, filters, rules, pendingAutomationJobs, members] = await Promise.all([
      projectRepository.getProjectSetup({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
        userId: session.user.id,
      }),
      issueRepository.listIssuesForProject({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
      }),
      filterRepository.listVisibleFilters({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
        ownerId: session.user.id,
      }),
      automationRepository.listRulesForProject({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
      }),
      automationRepository.countPendingJobs({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
      }),
      projectRepository.listProjectMembers({
        organizationId: session.activeOrganization.id,
        projectId: selectedProject.id,
      }),
    ]);

    if (!projectSetup) {
      throw new Error("Selected project setup could not be loaded for the authenticated user.");
    }

    return {
      session,
      projects: projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        memberRole: project.projectMemberships[0]?.role ?? null,
        issueCount: project._count.issues,
        openIssueCount: project.issues.length,
      })),
      selectedProject: {
        id: projectSetup.id,
        key: projectSetup.key,
        name: projectSetup.name,
        description: projectSetup.description,
        memberRole: projectSetup.projectMemberships[0]?.role ?? null,
        statuses:
          projectSetup.boards[0]?.columns.map((column) => ({
            id: column.id,
            name: column.name,
            position: column.position,
            wipLimit: column.wipLimit,
            status: {
              id: column.status.id,
              key: column.status.key,
              name: column.status.name,
              category: column.status.category,
            },
          })) ?? [],
        customFields: projectSetup.customFields.map((field) => ({
          id: field.id,
          key: field.key,
          name: field.name,
          type: field.type,
          required: field.required,
          position: field.position,
          config: (field.config ?? null) as Record<string, unknown> | null,
        })),
        issues: issues.map((issue) => serializeIssue(projectSetup.key, issue)),
        savedFilters: filters.map((filter) => ({
          id: filter.id,
          name: filter.name,
          isShared: filter.isShared,
          query: filter.query as Record<string, unknown>,
          owner: filter.owner,
        })),
        automationRules: rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          isEnabled: rule.isEnabled,
          eventType: rule.eventType,
          actionType: rule.actionType,
          conditions: (rule.conditions ?? null) as Record<string, unknown> | null,
          actionPayload: rule.actionPayload as Record<string, unknown>,
        })),
        pendingAutomationJobs,
        members: members.map((member) => member.user),
      },
    };
  },

  async getOptionalSession() {
    return getSessionContext();
  },
};
