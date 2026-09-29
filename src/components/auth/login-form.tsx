"use client";

/**
 * What this file does:
 * Renders the login form and sends credentials to the auth API using client-side form state.
 * What calls it:
 * src/app/login/page.tsx.
 * What it calls:
 * src/lib/api/client.ts and the /api/auth/login endpoint.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Navigating to the app before the login request finishes, which causes flaky redirects and stale auth state.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { apiFetch } from "@/lib/api/client";
import { loginSchema } from "@/lib/validation/authSchemas";

type LoginValues = {
  email: string;
  password: string;
};

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@acme.test",
      password: "Password123!",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);

    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });

      startTransition(() => {
        router.push("/app");
        router.refresh();
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Login failed.");
    }
  });

  return (
    <section className="rounded-[2rem] border border-white/15 bg-white p-8 shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Demo Sign In</h2>
      <p className="mt-2 text-sm text-slate-500">Seeded accounts are listed on the left.</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
          <input
            {...form.register("email")}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-400 focus:bg-white"
          />
          <span className="mt-1 block text-xs text-rose-600">{form.formState.errors.email?.message}</span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
          <input
            {...form.register("password")}
            type="password"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-400 focus:bg-white"
          />
          <span className="mt-1 block text-xs text-rose-600">{form.formState.errors.password?.message}</span>
        </label>

        {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <button
          type="submit"
          disabled={form.formState.isSubmitting || isPending}
          className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {form.formState.isSubmitting || isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </section>
  );
}
