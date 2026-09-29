"use client";

import { useState } from "react";

import type { CustomFieldView, WorkspaceBootstrap } from "@/types/domain";

type CreateIssueFormProps = {
  members: NonNullable<WorkspaceBootstrap["selectedProject"]>["members"];
  customFields: CustomFieldView[];
  onSubmit: (input: {
    title: string;
    description?: string | null;
    type: "TASK" | "BUG" | "STORY";
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    assigneeId?: string | null;
    dueDate?: string | null;
    customFieldValues: Array<{ customFieldId: string; value: unknown }>;
  }) => Promise<void>;
};

export function CreateIssueForm({ members, customFields, onSubmit }: CreateIssueFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [type, setType] = useState<"TASK" | "BUG" | "STORY">("TASK");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
          await onSubmit({
            title,
            description: description || null,
            type,
            priority,
            assigneeId: assigneeId || null,
            dueDate: dueDate ? new Date(dueDate).toISOString() : null,
            customFieldValues: customFields.map((field) => ({
              customFieldId: field.id,
              value: fieldValues[field.id] ?? null,
            })),
          });

          setTitle("");
          setDescription("");
          setAssigneeId("");
          setDueDate("");
          setPriority("MEDIUM");
          setType("TASK");
          setFieldValues({});
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Create Issue</p>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Issue title"
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        rows={3}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as "TASK" | "BUG" | "STORY")}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="TASK">Task</option>
          <option value="BUG">Bug</option>
          <option value="STORY">Story</option>
        </select>
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        />
      </div>
      {customFields.length ? (
        <div className="mt-3 grid gap-3">
          {customFields.map((field) => (
            <input
              key={field.id}
              value={fieldValues[field.id] ?? ""}
              onChange={(event) =>
                setFieldValues((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                }))
              }
              placeholder={field.name}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
          ))}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isSubmitting ? "Creating..." : "Create Issue"}
      </button>
    </form>
  );
}
