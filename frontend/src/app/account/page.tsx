import { ProtectedRoute } from "../../components/auth/ProtectedRoute";
import { AccountWorkspace } from "../../components/account/AccountWorkspace";

export default function AccountPage() {
  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-4xl px-6 py-12"><AccountWorkspace /></main>
    </ProtectedRoute>
  );
}
