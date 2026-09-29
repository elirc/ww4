import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/http/errors";

const requireProjectAccessMock = vi.fn();

vi.mock("@/lib/auth/request-context", () => ({
  requireProjectAccess: requireProjectAccessMock,
}));

vi.mock("@/services/issues/issueService", () => ({
  issueService: {
    createIssue: vi.fn(),
  },
}));

describe("POST /api/organizations/[organizationId]/projects/[projectId]/issues", () => {
  beforeEach(() => {
    requireProjectAccessMock.mockReset();
  });

  it("returns 403 when a viewer tries to create an issue", async () => {
    // This test matters because permission regressions on write endpoints tend to surface as silent data corruption, not compile errors.
    requireProjectAccessMock.mockRejectedValue(new ForbiddenError("Missing permission: issue:create."));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/issues", { method: "POST", body: "{}" }), {
      params: Promise.resolve({
        organizationId: "org_1",
        projectId: "project_1",
      }),
    });

    expect(response.status).toBe(403);
  });
});
