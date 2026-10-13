"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApiRequestError } from "../../lib/api/client";
import { CURRENT_USER_QUERY_KEY, logoutLocal } from "../../lib/api/auth";
import { authErrorMessage } from "../../lib/api/auth";
import { authIntegrationEnabled } from "../../lib/auth/config";
import { useCurrentUser } from "../../lib/auth/use-current-user";
import { Button } from "../ui/button";

function FederationLink({ permissions }: { permissions?: string[] }) {
  if (!permissions?.includes("federation:read")) return null;
  return <Link className="font-semibold text-violet-700 hover:underline" href="/admin/federation">Federation admin</Link>;
}

export function AuthNavigation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const current = useCurrentUser();
  const logout = useMutation({
    mutationFn: logoutLocal,
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
      router.replace("/login");
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
        router.replace("/login?reason=expired");
      }
    },
  });

  if (!authIntegrationEnabled) return null;
  if (current.isPending) return <span className="text-sm text-[var(--color-text-muted)]" role="status">Checking session…</span>;
  if (current.error) return <span className="flex items-center gap-2 text-xs text-rose-700" role="alert">{authErrorMessage(current.error, "session")} <Link className="font-semibold underline" href="/login">Retry</Link></span>;
  if (!current.user) return <Link className="text-sm font-semibold text-violet-700 hover:underline" href="/login">Sign in</Link>;

  return (
    <div className="flex items-center gap-3 text-sm">
      <FederationLink permissions={current.user.permissions} />
      <Link className="font-semibold text-violet-700 hover:underline" href="/account">{current.user.username}</Link>
      <Button type="button" variant="secondary" className="min-h-9 px-3 py-1 text-xs" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Signing out…" : "Sign out"}
      </Button>
      {logout.error && <span className="text-xs text-rose-700" role="alert">{authErrorMessage(logout.error, "logout")}</span>}
    </div>
  );
}
