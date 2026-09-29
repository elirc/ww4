"use client";

import { useState } from "react";

type SaveFilterFormProps = {
  onSubmit: (input: {
    name: string;
    isShared: boolean;
  }) => Promise<void>;
};

export function SaveFilterForm({ onSubmit }: SaveFilterFormProps) {
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
          await onSubmit({ name, isShared });
          setName("");
          setIsShared(false);
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Save Filter</p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="High Priority Active"
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <label className="mt-3 flex items-center gap-3 text-sm text-slate-600">
        <input type="checkbox" checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />
        Share with the whole project
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : "Save Filter"}
      </button>
    </form>
  );
}
