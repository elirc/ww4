import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.28),_transparent_30%),linear-gradient(160deg,_#f8fafc,_#fff7ed_52%,_#ecfccb)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.32em] text-amber-700">WorkGrid</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
              Configurable work management built for reviewing backend decisions, not just demos.
            </h1>
          </div>
          <Link
            href="/login"
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Open Demo
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-slate-500">What is included</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                "Projects, workflows, and board columns",
                "Issue CRUD with status transitions",
                "Comments, activities, and audit trail",
                "Custom fields and saved filters",
                "Automation rules plus queued job processing",
                "Organization + project-level RBAC",
              ].map((item) => (
                <div key={item} className="rounded-3xl bg-slate-950 px-5 py-4 text-sm text-slate-100">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 shadow-[0_24px_80px_rgba(217,119,6,0.18)]">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-amber-800">Demo accounts</p>
            <div className="mt-6 space-y-4 text-sm text-amber-950">
              <p>`owner@acme.test` / `Password123!`</p>
              <p>`lead@acme.test` / `Password123!`</p>
              <p>`member@acme.test` / `Password123!`</p>
              <p>`viewer@acme.test` / `Password123!`</p>
              <p>`outsider@globex.test` / `Password123!`</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
