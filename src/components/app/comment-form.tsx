"use client";

import { useState } from "react";

type CommentFormProps = {
  onSubmit: (body: string) => Promise<void>;
};

export function CommentForm({ onSubmit }: CommentFormProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
          await onSubmit(body);
          setBody("");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Add Comment</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder="Share context, blockers, or handoff details."
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {isSubmitting ? "Posting..." : "Post Comment"}
      </button>
    </form>
  );
}
