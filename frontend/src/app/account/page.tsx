import { ProtectedRoute } from "../../components/auth/ProtectedRoute";
import { AccountWorkspace } from "../../components/account/AccountWorkspace";
import { ContextualNavigation } from "../../components/layout/ContextualNavigation";

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <main className="page-gutter grid gap-6 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-10"><ContextualNavigation context="account" /><div className="min-w-0"><AccountWorkspace /></div></main>
    </ProtectedRoute>
  );
}
