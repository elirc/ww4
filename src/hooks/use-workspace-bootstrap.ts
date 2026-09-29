"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { WorkspaceBootstrap } from "@/types/domain";

export function useWorkspaceBootstrap(projectId?: string) {
  return useQuery({
    queryKey: ["workspace-bootstrap", projectId],
    queryFn: () =>
      apiFetch<WorkspaceBootstrap>(projectId ? `/api/bootstrap?projectId=${projectId}` : "/api/bootstrap"),
  });
}
