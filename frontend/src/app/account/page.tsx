import { ProtectedRoute } from "../../components/auth/ProtectedRoute";

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Authenticated area</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Your account</h1>
          <p className="mt-3 text-[var(--color-text-muted)]">This isolated page consumes the Fastify session. Existing Flask-backed pages are not implicitly authenticated by it.</p>
        </section>
      </main>
    </ProtectedRoute>
  );
}
