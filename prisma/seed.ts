/**
 * What this file does:
 * Seeds realistic organizations, memberships, projects, issues, filters, and automation rules for local development.
 * What calls it:
 * npm run db:seed via Prisma's seed command.
 * What it calls:
 * PrismaClient plus shared password/template helpers from src/.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Seeding only happy-path records and forgetting to include enough role, workflow, and tenant variety to exercise the real code paths.
 */
import { PrismaClient, Prisma, ProjectRole } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";
import { defaultProjectTemplate } from "../src/services/projects/projectTemplates";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Password123!";

async function resetDatabase() {
  await prisma.issueActivity.deleteMany();
  await prisma.automationJob.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.issueCustomFieldValue.deleteMany();
  await prisma.issueComment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.boardColumn.deleteMany();
  await prisma.board.deleteMany();
  await prisma.workflowStatus.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.projectMembership.deleteMany();
  await prisma.project.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

async function createProjectGraph(input: {
  organizationId: string;
  key: string;
  name: string;
  description: string;
  creatorUserId: string;
  memberAssignments: Array<{ userId: string; role: ProjectRole }>;
}) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description,
        projectMemberships: {
          create: [
            {
              userId: input.creatorUserId,
              role: ProjectRole.LEAD,
            },
            ...input.memberAssignments,
          ],
        },
        workflow: {
          create: {
            organizationId: input.organizationId,
            name: defaultProjectTemplate.workflowName,
            statuses: {
              create: defaultProjectTemplate.statuses,
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
    const workflow = project.workflow;

    if (!board || !workflow) {
      throw new Error("Expected seeded project board and workflow to exist.");
    }

    await tx.boardColumn.createMany({
      data: workflow.statuses.map((status) => ({
        boardId: board.id,
        statusId: status.id,
        name: status.name,
        position: status.position,
        wipLimit: status.category === "ACTIVE" ? 5 : null,
      })),
    });

    await tx.customFieldDefinition.createMany({
      data: defaultProjectTemplate.customFields.map((field) => ({
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

    return tx.project.findUniqueOrThrow({
      where: {
        id: project.id,
      },
      include: {
        workflow: {
          include: {
            statuses: true,
          },
        },
        customFields: true,
      },
    });
  });
}

async function createIssue(input: {
  organizationId: string;
  project: Awaited<ReturnType<typeof createProjectGraph>>;
  sequenceNumber: number;
  title: string;
  description: string;
  type: "TASK" | "BUG" | "STORY";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reporterId: string;
  assigneeId: string | null;
  statusKey: string;
  customFieldValues: Record<string, string>;
  comments?: Array<{ authorId: string; body: string; isSystem?: boolean }>;
}) {
  const workflow = input.project.workflow;

  if (!workflow) {
    throw new Error("Seeded project workflow was missing.");
  }

  const status = workflow.statuses.find((entry) => entry.key === input.statusKey);

  if (!status) {
    throw new Error(`Status ${input.statusKey} not found for seeded project ${input.project.key}.`);
  }

  return prisma.issue.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.project.id,
      workflowId: workflow.id,
      statusId: status.id,
      sequenceNumber: input.sequenceNumber,
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority,
      reporterId: input.reporterId,
      assigneeId: input.assigneeId,
      customFieldValues: {
        create: Object.entries(input.customFieldValues).map(([fieldKey, value]) => {
          const field = input.project.customFields.find((entry) => entry.key === fieldKey);

          if (!field) {
            throw new Error(`Custom field ${fieldKey} not found for project ${input.project.key}.`);
          }

          return {
            organizationId: input.organizationId,
            customFieldId: field.id,
            value,
          };
        }),
      },
      comments: {
        create: (input.comments ?? []).map((comment) => ({
          organizationId: input.organizationId,
          authorId: comment.authorId,
          body: comment.body,
          isSystem: comment.isSystem ?? false,
        })),
      },
      activities: {
        create: [
          {
            organizationId: input.organizationId,
            projectId: input.project.id,
            actorUserId: input.reporterId,
            type: "ISSUE_CREATED",
            message: `${input.project.key}-${input.sequenceNumber} created in ${status.name}.`,
          },
        ],
      },
    },
  });
}

async function main() {
  await resetDatabase();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owner = await prisma.user.create({
    data: { name: "Olivia Owner", email: "owner@acme.test", passwordHash },
  });
  const lead = await prisma.user.create({
    data: { name: "Leo Lead", email: "lead@acme.test", passwordHash },
  });
  const member = await prisma.user.create({
    data: { name: "Mina Member", email: "member@acme.test", passwordHash },
  });
  const viewer = await prisma.user.create({
    data: { name: "Vera Viewer", email: "viewer@acme.test", passwordHash },
  });
  const outsider = await prisma.user.create({
    data: { name: "Gabe Globex", email: "outsider@globex.test", passwordHash },
  });

  const acme = await prisma.organization.create({
    data: {
      name: "Acme Delivery",
      slug: "acme-delivery",
    },
  });
  const globex = await prisma.organization.create({
    data: {
      name: "Globex Internal Tools",
      slug: "globex-tools",
    },
  });

  await prisma.membership.createMany({
    data: [
      { organizationId: acme.id, userId: owner.id, role: "ORG_OWNER" },
      { organizationId: acme.id, userId: lead.id, role: "MEMBER" },
      { organizationId: acme.id, userId: member.id, role: "MEMBER" },
      { organizationId: acme.id, userId: viewer.id, role: "VIEWER" },
      { organizationId: globex.id, userId: outsider.id, role: "ORG_OWNER" },
    ],
  });

  const opsProject = await createProjectGraph({
    organizationId: acme.id,
    key: "OPS",
    name: "Operations Control",
    description: "Run product delivery, incidents, and maintenance work in one queue.",
    creatorUserId: owner.id,
    memberAssignments: [
      { userId: lead.id, role: ProjectRole.LEAD },
      { userId: member.id, role: ProjectRole.CONTRIBUTOR },
      { userId: viewer.id, role: ProjectRole.OBSERVER },
    ],
  });

  const mobileProject = await createProjectGraph({
    organizationId: acme.id,
    key: "MOB",
    name: "Mobile Release Train",
    description: "Coordinate weekly mobile releases and QA signoff.",
    creatorUserId: owner.id,
    memberAssignments: [
      { userId: lead.id, role: ProjectRole.LEAD },
      { userId: member.id, role: ProjectRole.CONTRIBUTOR },
    ],
  });

  const globexProject = await createProjectGraph({
    organizationId: globex.id,
    key: "OPS",
    name: "Globex Ops",
    description: "A separate tenant used to prove data isolation.",
    creatorUserId: outsider.id,
    memberAssignments: [],
  });

  const issueOne = await createIssue({
    organizationId: acme.id,
    project: opsProject,
    sequenceNumber: 1,
    title: "Stabilize incident escalation dashboard",
    description: "Refactor stale widgets and capture missing SLA metadata.",
    type: "TASK",
    priority: "HIGH",
    reporterId: owner.id,
    assigneeId: lead.id,
    statusKey: "in-progress",
    customFieldValues: {
      "customer-impact": "High",
      "target-release": "2026.04",
    },
    comments: [
      {
        authorId: member.id,
        body: "API payload drift is causing the stale widget tiles.",
      },
    ],
  });

  const issueTwo = await createIssue({
    organizationId: acme.id,
    project: opsProject,
    sequenceNumber: 2,
    title: "Backfill alert ownership for backend rotation",
    description: "Every critical alert needs an explicit owning team before launch week.",
    type: "STORY",
    priority: "MEDIUM",
    reporterId: lead.id,
    assigneeId: member.id,
    statusKey: "todo",
    customFieldValues: {
      "customer-impact": "Medium",
      "target-release": "2026.05",
    },
  });

  await createIssue({
    organizationId: acme.id,
    project: mobileProject,
    sequenceNumber: 1,
    title: "Patch release checklist for iOS build",
    description: "Update the checklist to include crash analytics signoff.",
    type: "BUG",
    priority: "CRITICAL",
    reporterId: owner.id,
    assigneeId: lead.id,
    statusKey: "in-review",
    customFieldValues: {
      "customer-impact": "High",
      "target-release": "2026.04-mobile",
    },
  });

  await createIssue({
    organizationId: globex.id,
    project: globexProject,
    sequenceNumber: 1,
    title: "Globex-only tenant data",
    description: "This issue should never appear to Acme users.",
    type: "TASK",
    priority: "LOW",
    reporterId: outsider.id,
    assigneeId: outsider.id,
    statusKey: "todo",
    customFieldValues: {
      "customer-impact": "Low",
      "target-release": "2026.06",
    },
  });

  await prisma.savedFilter.create({
    data: {
      organizationId: acme.id,
      projectId: opsProject.id,
      ownerId: lead.id,
      name: "High Priority Active",
      isShared: true,
      query: {
        projectId: opsProject.id,
        statusIds: [opsProject.workflow!.statuses.find((status) => status.key === "in-progress")!.id],
        priority: "HIGH",
      },
    },
  });

  await prisma.automationRule.create({
    data: {
      organizationId: acme.id,
      projectId: opsProject.id,
      name: "Done issues get QA note",
      isEnabled: true,
      eventType: "ISSUE_STATUS_CHANGED",
      actionType: "ADD_COMMENT",
      conditions: {
        toStatusId: opsProject.workflow!.statuses.find((status) => status.key === "done")!.id,
      },
      actionPayload: {
        comment: "Issue reached done. QA can verify and close the release checklist.",
      },
    },
  });

  await prisma.automationJob.create({
    data: {
      organizationId: acme.id,
      projectId: opsProject.id,
      issueId: issueOne.id,
      eventType: "ISSUE_STATUS_CHANGED",
      payload: {
        issueId: issueOne.id,
        fromStatusId: opsProject.workflow!.statuses.find((status) => status.key === "in-progress")!.id,
        toStatusId: opsProject.workflow!.statuses.find((status) => status.key === "done")!.id,
        priority: "HIGH",
      },
    },
  });

  await prisma.issueActivity.create({
    data: {
      organizationId: acme.id,
      projectId: opsProject.id,
      issueId: issueTwo.id,
      actorUserId: lead.id,
      type: "ISSUE_UPDATED",
      message: "Backlog grooming updated the rollout notes.",
    },
  });

  console.log("Seeded demo organizations, projects, issues, filters, and automation.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
