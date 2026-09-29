/**
 * What this file does:
 * Provides the default workflow and custom-field template used for new projects and seed data.
 * What calls it:
 * src/services/projects/projectService.ts, prisma/seed.ts, and the create-project UI.
 * What it calls:
 * Prisma enums only.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Duplicating template defaults separately in the UI and backend, which guarantees they drift over time.
 */
import { CustomFieldType, WorkflowStatusCategory } from "@prisma/client";

export const defaultProjectTemplate = {
  workflowName: "Default Delivery Workflow",
  statuses: [
    {
      key: "todo",
      name: "To Do",
      category: WorkflowStatusCategory.TODO,
      position: 0,
      isInitial: true,
    },
    {
      key: "in-progress",
      name: "In Progress",
      category: WorkflowStatusCategory.ACTIVE,
      position: 1,
      isInitial: false,
    },
    {
      key: "in-review",
      name: "In Review",
      category: WorkflowStatusCategory.ACTIVE,
      position: 2,
      isInitial: false,
    },
    {
      key: "done",
      name: "Done",
      category: WorkflowStatusCategory.DONE,
      position: 3,
      isInitial: false,
    },
  ],
  customFields: [
    {
      key: "customer-impact",
      name: "Customer Impact",
      type: CustomFieldType.SINGLE_SELECT,
      required: true,
      position: 0,
      config: {
        options: ["Low", "Medium", "High"],
      },
    },
    {
      key: "target-release",
      name: "Target Release",
      type: CustomFieldType.TEXT,
      required: false,
      position: 1,
      config: null,
    },
  ],
};
