"use client";

import { useState } from "react";

import { defaultProjectTemplate } from "@/services/projects/projectTemplates";

type CreateProjectFormProps = {
  onSubmit: (input: {
    key: string;
    name: string;
    description?: string | null;
    workflowName: string;
    statuses: typeof defaultProjectTemplate.statuses;
    customFields: typeof defaultProjectTemplate.customFields;
  }) => Promise<void>;
};

export function CreateProjectForm({ onSubmit }: CreateProjectFormProps) {
  const [key, setKey] = useState("OPS");
  const [name, setName] = useState("Operations");
  const [description, setDescription] = useState("Cross-team delivery planning.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
          await onSubmit({
            key,
            name,
            description,
            workflowName: defaultProjectTemplate.workflowName,
            statuses: defaultProjectTemplate.statuses,
            customFields: defaultProjectTemplate.customFields,
          });
          setKey("OPS");
          setName("Operations");
          setDescription("Cross-team delivery planning.");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Create Project</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={key}
          onChange={(event) => setKey(event.target.value.toUpperCase())}
          placeholder="KEY"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
        />
      </div>
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
        rows={3}
        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
      >
        {isSubmitting ? "Creating..." : "Create Project"}
      </button>
    </form>
  );
}
