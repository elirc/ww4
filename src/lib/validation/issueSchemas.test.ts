import { describe, expect, it } from "vitest";

import { createIssueSchema } from "@/lib/validation/issueSchemas";

describe("createIssueSchema", () => {
  it("rejects a malformed issue payload", () => {
    // This test matters because malformed issue payloads should fail at the boundary before they can create partial or impossible records.
    expect(() =>
      createIssueSchema.parse({
        title: "",
        type: "TASK",
        priority: "MEDIUM",
        customFieldValues: [],
      }),
    ).toThrow();
  });
});
