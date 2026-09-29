"use client";

/**
 * What this file does:
 * Renders the authenticated workspace, drives REST mutations, and keeps UI state separate from backend business rules.
 * What calls it:
 * src/app/app/page.tsx.
 * What it calls:
 * React Query hooks, src/lib/api/client.ts, and the form components in this folder.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Re-implementing server authority in the browser instead of treating the client as a thin orchestrator over explicit APIs.
 */
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api/client";
import { useWorkspaceBootstrap } from "@/hooks/use-workspace-bootstrap";
import type { SavedFilterView, WorkspaceBootstrap } from "@/types/domain";

import { AutomationRuleForm } from "./automation-rule-form";
import { CommentForm } from "./comment-form";
import { CreateIssueForm } from "./create-issue-form";
import { CreateProjectForm } from "./create-project-form";
import { SaveFilterForm } from "./save-filter-form";

type CreateProjectPayload = {
  key: string;
  name: string;
  description?: string | null;
  workflowName: string;
  statuses: Array<{
    key: string;
    name: string;
    category: "TODO" | "ACTIVE" | "DONE";
    position: number;
    isInitial: boolean;
  }>;
  customFields: Array<{
    key: string;
    name: string;
    type: "TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT";
    required: boolean;
    position: number;
    config: Record<string, unknown> | null;
  }>;
};

type CreateIssuePayload = {
  title: string;
  description?: string | null;
  type: "TASK" | "BUG" | "STORY";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeId?: string | null;
  dueDate?: string | null;
  customFieldValues: Array<{ customFieldId: string; value: unknown }>;
};

type CreateAutomationRulePayload = {
  name: string;
  eventType: "ISSUE_CREATED" | "ISSUE_STATUS_CHANGED";
  actionType: "ADD_COMMENT" | "ASSIGN_USER";
  conditions?: {
    fromStatusId?: string;
    toStatusId?: string;
  };
  actionPayload: Record<string, unknown>;
};

function hasClientPermission(
  sessionRole: WorkspaceBootstrap["session"]["activeOrganization"]["role"],
  projectRole: NonNullable<WorkspaceBootstrap["selectedProject"]>["memberRole"],
  permission: "project-manage" | "issue-create" | "comment-create" | "share-filter" | "automation-manage",
) {
  const isOrgAdmin = sessionRole === "ORG_OWNER" || sessionRole === "ORG_ADMIN";

  if (isOrgAdmin) {
    return true;
  }

  if (permission === "project-manage" || permission === "automation-manage" || permission === "share-filter") {
    return projectRole === "LEAD";
  }

  if (permission === "issue-create") {
    return projectRole === "LEAD" || projectRole === "CONTRIBUTOR";
  }

  if (permission === "comment-create") {
    return projectRole === "LEAD" || projectRole === "CONTRIBUTOR" || projectRole === "OBSERVER";
  }

  return false;
}

function applySavedFilter(
  filter: SavedFilterView | undefined,
  project: NonNullable<WorkspaceBootstrap["selectedProject"]>,
  currentUserId: string,
) {
  if (!filter) {
    return project.issues;
  }

  const query = filter.query as {
    search?: string;
    assigneeId?: string;
    statusIds?: string[];
    priority?: string;
    onlyMyIssues?: boolean;
  };

  return project.issues.filter((issue) => {
    if (query.search) {
      const haystack = `${issue.title} ${issue.description ?? ""}`.toLowerCase();

      if (!haystack.includes(query.search.toLowerCase())) {
        return false;
      }
    }

    if (query.assigneeId && issue.assignee?.id !== query.assigneeId) {
      return false;
    }

    if (query.statusIds?.length && !query.statusIds.includes(issue.status.id)) {
      return false;
    }

    if (query.priority && issue.priority !== query.priority) {
      return false;
    }

    if (query.onlyMyIssues && issue.assignee?.id !== currentUserId) {
      return false;
    }

    return true;
  });
}

function issueFieldValue(issue: NonNullable<WorkspaceBootstrap["selectedProject"]>["issues"][number], customFieldId: string) {
  return String(issue.customFieldValues.find((entry) => entry.customFieldId === customFieldId)?.value ?? "");
}

export function WorkspaceShell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [issueSearch, setIssueSearch] = useState("");
  const [statusFilterId, setStatusFilterId] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [onlyMyIssues, setOnlyMyIssues] = useState(false);
  const [activeSavedFilterId, setActiveSavedFilterId] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(issueSearch);
  const { data, isLoading, error } = useWorkspaceBootstrap(selectedProjectId);

  const selectedProject = data?.selectedProject ?? null;
  const effectiveProjectId = selectedProjectId ?? selectedProject?.id;
  const activeSavedFilter = selectedProject?.savedFilters.find((filter) => filter.id === activeSavedFilterId);

  const visibleIssues = useMemo(() => {
    if (!data || !selectedProject) {
      return [];
    }

    const issuesAfterSavedFilter = applySavedFilter(activeSavedFilter, selectedProject, data.session.user.id);

    return issuesAfterSavedFilter.filter((issue) => {
      const haystack = `${issue.key} ${issue.title} ${issue.description ?? ""}`.toLowerCase();

      if (deferredSearch && !haystack.includes(deferredSearch.toLowerCase())) {
        return false;
      }

      if (statusFilterId && issue.status.id !== statusFilterId) {
        return false;
      }

      if (priorityFilter && issue.priority !== priorityFilter) {
        return false;
      }

      if (onlyMyIssues && issue.assignee?.id !== data.session.user.id) {
        return false;
      }

      return true;
    });
  }, [activeSavedFilter, data, deferredSearch, onlyMyIssues, priorityFilter, selectedProject, statusFilterId]);

  const effectiveSelectedIssueId =
    selectedIssueId && visibleIssues.some((issue) => issue.id === selectedIssueId) ? selectedIssueId : visibleIssues[0]?.id;
  const selectedIssue = visibleIssues.find((issue) => issue.id === effectiveSelectedIssueId) ?? null;

  const invalidateWorkspace = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["workspace-bootstrap"],
    });
  };

  const createProjectMutation = useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      apiFetch<{ id: string; key: string; name: string }>(
        `/api/organizations/${data?.session.activeOrganization.id}/projects`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (project) => {
      setMessage(`Created project ${project.key}.`);
      setActiveSavedFilterId(null);
      startTransition(() => setSelectedProjectId(project.id));
      await invalidateWorkspace();
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: (payload: CreateIssuePayload) =>
      apiFetch<{ id: string; key: string }>(
        `/api/organizations/${data?.session.activeOrganization.id}/projects/${effectiveProjectId}/issues`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (issue) => {
      setMessage(`Created issue ${issue.key}.`);
      await invalidateWorkspace();
    },
  });

  const updateIssueMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<{ id: string }>(
        `/api/organizations/${data?.session.activeOrganization.id}/projects/${effectiveProjectId}/issues/${effectiveSelectedIssueId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async () => {
      setMessage(`Updated ${selectedIssue?.key}.`);
      await invalidateWorkspace();
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch(
        `/api/organizations/${data?.session.activeOrganization.id}/projects/${effectiveProjectId}/issues/${effectiveSelectedIssueId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      ),
    onSuccess: async () => {
      setMessage(`Comment added to ${selectedIssue?.key}.`);
      await invalidateWorkspace();
    },
  });

  const saveFilterMutation = useMutation({
    mutationFn: (payload: { name: string; isShared: boolean }) =>
      apiFetch<{ id: string; name: string }>(`/api/organizations/${data?.session.activeOrganization.id}/filters`, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          query: {
            projectId: effectiveProjectId,
            search: issueSearch || undefined,
            statusIds: statusFilterId ? [statusFilterId] : undefined,
            priority: priorityFilter || undefined,
            onlyMyIssues,
          },
        }),
      }),
    onSuccess: async (filter) => {
      setMessage(`Saved filter ${filter.name}.`);
      await invalidateWorkspace();
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: (payload: CreateAutomationRulePayload) =>
      apiFetch<{ id: string; name: string }>(`/api/organizations/${data?.session.activeOrganization.id}/automation/rules`, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          projectId: effectiveProjectId,
        }),
      }),
    onSuccess: async (rule) => {
      setMessage(`Created automation rule ${rule.name}.`);
      await invalidateWorkspace();
    },
  });

  const processJobsMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ processed: number }>(`/api/organizations/${data?.session.activeOrganization.id}/automation/process`, {
        method: "POST",
        body: JSON.stringify({
          projectId: effectiveProjectId,
          limit: 10,
        }),
      }),
    onSuccess: async (result) => {
      setMessage(`Processed ${result.processed} automation jobs.`);
      await invalidateWorkspace();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/auth/logout", {
        method: "POST",
      }),
    onSuccess: () => {
      router.push("/login");
      router.refresh();
    },
  });

  if (isLoading) {
    return <main className="p-10 text-sm text-slate-600">Loading workspace...</main>;
  }

  if (error || !data) {
    return (
      <main className="p-10">
        <div className="rounded-3xl bg-rose-50 p-6 text-sm text-rose-700">
          {error instanceof Error ? error.message : "Unable to load workspace."}
        </div>
      </main>
    );
  }

  const canManageProject = hasClientPermission(
    data.session.activeOrganization.role,
    selectedProject?.memberRole ?? null,
    "project-manage",
  );
  const canCreateIssue = hasClientPermission(
    data.session.activeOrganization.role,
    selectedProject?.memberRole ?? null,
    "issue-create",
  );
  const canComment = hasClientPermission(
    data.session.activeOrganization.role,
    selectedProject?.memberRole ?? null,
    "comment-create",
  );
  const canShareFilters = hasClientPermission(
    data.session.activeOrganization.role,
    selectedProject?.memberRole ?? null,
    "share-filter",
  );
  const canManageAutomation = hasClientPermission(
    data.session.activeOrganization.role,
    selectedProject?.memberRole ?? null,
    "automation-manage",
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,_#e2e8f0,_#fff7ed_45%,_#ffffff)] px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-700">
                {data.session.activeOrganization.name}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">WorkGrid Workspace</h1>
              <p className="mt-2 text-sm text-slate-500">
                Signed in as {data.session.user.name} ({data.session.activeOrganization.role})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={effectiveProjectId ?? ""}
                onChange={(event) =>
                  startTransition(() => {
                    setActiveSavedFilterId(null);
                    setSelectedIssueId(undefined);
                    setSelectedProjectId(event.target.value);
                  })
                }
                className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.key} · {project.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => logoutMutation.mutate()}
                className="rounded-full border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Log Out
              </button>
            </div>
          </div>
          {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p> : null}
        </section>

        {selectedProject ? (
          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                {canManageProject ? (
                  <CreateProjectForm
                    onSubmit={async (payload) => {
                      await createProjectMutation.mutateAsync(payload);
                    }}
                  />
                ) : null}
                {canCreateIssue ? (
                  <CreateIssueForm
                    members={selectedProject.members}
                    customFields={selectedProject.customFields}
                    onSubmit={async (payload) => {
                      await createIssueMutation.mutateAsync(payload);
                    }}
                  />
                ) : null}
              </div>

              <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Board</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                      {selectedProject.key} · {selectedProject.name}
                    </h2>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <input
                      value={issueSearch}
                      onChange={(event) => setIssueSearch(event.target.value)}
                      placeholder="Search issues"
                      className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                    <select
                      value={statusFilterId}
                      onChange={(event) => setStatusFilterId(event.target.value)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                      <option value="">All statuses</option>
                      {selectedProject.statuses.map((column) => (
                        <option key={column.status.id} value={column.status.id}>
                          {column.status.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={priorityFilter}
                      onChange={(event) => setPriorityFilter(event.target.value)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                      <option value="">All priorities</option>
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                    <label className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <input type="checkbox" checked={onlyMyIssues} onChange={(event) => setOnlyMyIssues(event.target.checked)} />
                      Mine
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedProject.savedFilters.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => {
                        if (activeSavedFilterId === filter.id) {
                          setActiveSavedFilterId(null);
                          return;
                        }

                        const query = filter.query as {
                          search?: string;
                          statusIds?: string[];
                          priority?: string;
                          onlyMyIssues?: boolean;
                        };

                        setActiveSavedFilterId(filter.id);
                        setIssueSearch(query.search ?? "");
                        setStatusFilterId(query.statusIds?.[0] ?? "");
                        setPriorityFilter(query.priority ?? "");
                        setOnlyMyIssues(query.onlyMyIssues ?? false);
                      }}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                        activeSavedFilterId === filter.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {filter.name}
                    </button>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-4">
                  {selectedProject.statuses.map((column) => {
                    const issues = visibleIssues.filter((issue) => issue.status.id === column.status.id);

                    return (
                      <div key={column.id} className="rounded-3xl bg-slate-950 p-4 text-slate-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">{column.name}</h3>
                            <p className="text-xs text-slate-400">{issues.length} issues</p>
                          </div>
                          {column.wipLimit ? <span className="text-xs text-amber-300">WIP {column.wipLimit}</span> : null}
                        </div>
                        <div className="mt-4 space-y-3">
                          {issues.map((issue) => (
                            <button
                              key={issue.id}
                              onClick={() => setSelectedIssueId(issue.id)}
                              className={`w-full rounded-3xl border p-4 text-left transition ${
                                selectedIssue?.id === issue.id
                                  ? "border-amber-300 bg-amber-50 text-slate-900"
                                  : "border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-600"
                              }`}
                            >
                              <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-70">{issue.key}</p>
                              <p className="mt-2 text-sm font-semibold">{issue.title}</p>
                              <div className="mt-3 flex items-center justify-between text-xs opacity-75">
                                <span>{issue.priority}</span>
                                <span>{issue.assignee?.name ?? "Unassigned"}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              {selectedIssue ? (
                <section className="rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Issue Detail</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{selectedIssue.key}</h2>
                  <form
                    key={selectedIssue.id}
                    className="mt-4 space-y-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);

                      await updateIssueMutation.mutateAsync({
                        title: String(formData.get("title") ?? ""),
                        description: String(formData.get("description") ?? ""),
                        priority: String(formData.get("priority") ?? "MEDIUM"),
                        assigneeId: String(formData.get("assigneeId") ?? "") || null,
                        statusId: String(formData.get("statusId") ?? selectedIssue.status.id),
                        customFieldValues: selectedProject.customFields.map((field) => ({
                          customFieldId: field.id,
                          value: String(formData.get(`customField:${field.id}`) ?? "") || null,
                        })),
                      });
                    }}
                  >
                    <input
                      name="title"
                      defaultValue={selectedIssue.title}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    />
                    <textarea
                      name="description"
                      defaultValue={selectedIssue.description ?? ""}
                      rows={4}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        name="priority"
                        defaultValue={selectedIssue.priority}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                      <select
                        name="statusId"
                        defaultValue={selectedIssue.status.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      >
                        {selectedProject.statuses.map((column) => (
                          <option key={column.status.id} value={column.status.id}>
                            {column.status.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      name="assigneeId"
                      defaultValue={selectedIssue.assignee?.id ?? ""}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {selectedProject.members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                    {selectedProject.customFields.map((field) => (
                      <input
                        key={field.id}
                        name={`customField:${field.id}`}
                        defaultValue={issueFieldValue(selectedIssue, field.id)}
                        placeholder={field.name}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                    ))}
                    <button
                      type="submit"
                      disabled={updateIssueMutation.isPending}
                      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {updateIssueMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </form>

                  {canComment ? (
                    <div className="mt-5">
                      <CommentForm
                        onSubmit={async (body) => {
                          await addCommentMutation.mutateAsync(body);
                        }}
                      />
                    </div>
                  ) : null}

                  <div className="mt-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
                    {selectedIssue.activities.map((activity) => (
                      <div key={activity.id} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">{activity.message}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {activity.actor?.name ?? "System"} / {formatDistanceToNow(new Date(activity.createdAt))} ago
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
                    {selectedIssue.comments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                        <p>{comment.body}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {comment.author.name}
                          {comment.isSystem ? " / automation" : ""} /{" "}
                          {formatDistanceToNow(new Date(comment.createdAt))} ago
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="grid gap-5">
                <SaveFilterForm
                  onSubmit={async (payload) => {
                    if (payload.isShared && !canShareFilters) {
                      throw new Error("Only project leads or org admins can share filters.");
                    }

                    await saveFilterMutation.mutateAsync(payload);
                  }}
                />

                {canManageAutomation ? (
                  <AutomationRuleForm
                    statuses={selectedProject.statuses}
                    members={selectedProject.members}
                    onSubmit={async (payload) => {
                      await createRuleMutation.mutateAsync(payload);
                    }}
                  />
                ) : null}

                {canManageAutomation ? (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Automation Queue</p>
                    <p className="mt-4 text-3xl font-semibold text-slate-900">{selectedProject.pendingAutomationJobs}</p>
                    <p className="mt-2 text-sm text-slate-500">Pending jobs waiting for batch processing.</p>
                    <button
                      onClick={() => processJobsMutation.mutate()}
                      disabled={processJobsMutation.isPending}
                      className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {processJobsMutation.isPending ? "Processing..." : "Process Queue"}
                    </button>
                  </section>
                ) : null}
              </div>
            </aside>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-white/70 bg-white/80 p-10 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <h2 className="text-2xl font-semibold text-slate-900">No accessible projects yet</h2>
            <p className="mt-3 text-sm text-slate-500">
              Create a project as an organization admin to start working with issues, boards, and automation.
            </p>
            {canManageProject ? (
              <div className="mt-6 max-w-xl">
                <CreateProjectForm
                  onSubmit={async (payload) => {
                    await createProjectMutation.mutateAsync(payload);
                  }}
                />
              </div>
            ) : null}
          </section>
        )}

        {isNavigating ? <p className="text-xs text-slate-500">Switching projects...</p> : null}
      </div>
    </main>
  );
}
