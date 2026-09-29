import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: findFirstMock,
    },
  },
}));

describe("projectRepository.findProjectAccess", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue(null);
  });

  it("always scopes project access queries by organizationId", async () => {
    // This test matters because tenant-isolation bugs often happen when a repository forgets one parent filter and starts resolving foreign records by id.
    const { projectRepository } = await import("./projectRepository");

    await projectRepository.findProjectAccess({
      organizationId: "org_acme",
      projectId: "project_shared_id",
      userId: "user_1",
    });

    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org_acme",
          id: "project_shared_id",
        }),
      }),
    );
  });
});
