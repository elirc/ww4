import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,_#111827,_#1e293b_40%,_#0f172a)] px-6 py-12">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-white backdrop-blur">
          <p className="font-mono text-sm uppercase tracking-[0.32em] text-amber-300">WorkGrid</p>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight">
            Log into a realistic issue platform with workflows, filters, automation, and RBAC.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            This demo is structured to teach how requests move through route handlers, validation, services,
            repositories, and tenant-aware authorization.
          </p>
        </section>

        <LoginForm />
      </div>
    </main>
  );
}
