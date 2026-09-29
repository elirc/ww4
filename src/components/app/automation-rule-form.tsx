"use client";

import { useState } from "react";

import type { BoardColumnView, WorkspaceBootstrap } from "@/types/domain";

type AutomationRuleFormProps = {
  statuses: BoardColumnView[];
  members: NonNullable<WorkspaceBootstrap["selectedProject"]>["members"];
  onSubmit: (input: {
    name: string;
    eventType: "ISSUE_CREATED" | "ISSUE_STATUS_CHANGED";
    actionType: "ADD_COMMENT" | "ASSIGN_USER";
    conditions?: {
      fromStatusId?: string;
      toStatusId?: string;
    };
    actionPayload: Record<string, unknown>;
  }) => Promise<void>;
};

export function AutomationRuleForm({ statuses, members, onSubmit }: AutomationRuleFormProps) {
  const [name, setName] = useState("Done comments");
  const [eventType, setEventType] = useState<"ISSUE_CREATED" | "ISSUE_STATUS_CHANGED">("ISSUE_STATUS_CHANGED");
  const [actionType, setActionType] = useState<"ADD_COMMENT" | "ASSIGN_USER">("ADD_COMMENT");
  const [toStatusId, setToStatusId] = useState("");
  const [comment, setComment] = useState("Issue reached done. QA can verify.");
  const [assigneeId, setAssigneeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
          await onSubmit({
            name,
            eventType,
            actionType,
            conditions: toStatusId ? { toStatusId } : undefined,
            actionPayload: actionType === "ADD_COMMENT" ? { comment } : { assigneeId },
          });
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Automation Rule</p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Rule name"
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select
          value={eventType}
          onChange={(event) => setEventType(event.target.value as "ISSUE_CREATED" | "ISSUE_STATUS_CHANGED")}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="ISSUE_STATUS_CHANGED">On status change</option>
          <option value="ISSUE_CREATED">On issue created</option>
        </select>
        <select
          value={actionType}
          onChange={(event) => setActionType(event.target.value as "ADD_COMMENT" | "ASSIGN_USER")}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="ADD_COMMENT">Add comment</option>
          <option value="ASSIGN_USER">Assign user</option>
        </select>
      </div>
      <select
        value={toStatusId}
        onChange={(event) => setToStatusId(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      >
        <option value="">Any target status</option>
        {statuses.map((status) => (
          <option key={status.status.id} value={status.status.id}>
            {status.status.name}
          </option>
        ))}
      </select>
      {actionType === "ADD_COMMENT" ? (
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        />
      ) : (
        <select
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="">Choose assignee</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : "Create Rule"}
      </button>
    </form>
  );
}
