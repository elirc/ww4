import { describe, expect, it } from "vitest";

import { assertValidStatusTransition } from "@/services/workflows/workflowService";

describe("assertValidStatusTransition", () => {
  it("rejects moving an issue out of a done status", () => {
    // This test matters because terminal-state regressions can quietly reopen completed work and break downstream reporting or automation.
    expect(() =>
      assertValidStatusTransition(
        {
          id: "done",
          workflowId: "workflow_1",
          key: "done",
          name: "Done",
          category: "DONE",
          position: 3,
          isInitial: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "in-progress",
          workflowId: "workflow_1",
          key: "in-progress",
          name: "In Progress",
          category: "ACTIVE",
          position: 1,
          isInitial: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ),
    ).toThrow("Issues in a done state cannot move back to an active state.");
  });
});
