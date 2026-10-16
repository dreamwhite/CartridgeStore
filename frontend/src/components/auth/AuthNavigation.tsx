"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ApiRequestError } from "../../lib/api/client";
import { logoutLocal } from "../../lib/api/auth";
import { authQueryKeys } from "../../lib/api/query-keys";
import { removeSensitiveQueryData } from "../../lib/auth/query-cache";
import { authErrorMessage } from "../../lib/api/auth";
import { authIntegrationEnabled } from "../../lib/auth/config";
import { useCurrentUser } from "../../lib/auth/use-current-user";
import { accountNavigation } from "../layout/navigation";
import { Button } from "../ui/button";
import { StatusMessage } from "../ui/status";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";

export function AuthNavigation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const current = useCurrentUser();
  const logout = useMutation({
    mutationFn: logoutLocal,
    onSuccess: () => {
      removeSensitiveQueryData(queryClient);
      queryClient.setQueryData(authQueryKeys.currentUser(), null);
      router.replace("/login");
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        removeSensitiveQueryData(queryClient);
        queryClient.setQueryData(authQueryKeys.currentUser(), null);
        router.replace("/login?reason=expired");
      }
    },
  });

  if (!authIntegrationEnabled) return null;
  if (current.isPending) return <span className="text-sm text-[var(--color-text-muted)]" role="status">Checking session…</span>;
  if (current.error) {
    const message = authErrorMessage(current.error, "session");
    return <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300" role="alert" title={message}><AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /><span aria-hidden="true" className="hidden sm:inline">Auth unavailable</span><span className="sr-only">{message}. </span><Link aria-label="Retry authentication" className="shrink-0 font-semibold underline underline-offset-2" href="/login">Retry</Link></span>;
  }
  if (!current.user) return <Button asChild size="sm" className="px-3"><Link href="/login">Sign in</Link></Button>;

  const contextualLinks = accountNavigation(current.user.permissions).filter((item) => item.href !== "/account");

  return (
    <div className="flex items-center gap-2 text-sm">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="max-w-48 px-2" aria-label={`Open account menu for ${current.user.username}`}>
            <UserRound aria-hidden="true" className="size-4" />
            <span className="truncate">{current.user.username}</span>
            <ChevronDown aria-hidden="true" className="size-3.5 text-[var(--color-text-muted)]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem asChild><Link href="/account">Your account</Link></DropdownMenuItem>
          {contextualLinks.map((item) => <DropdownMenuItem key={item.href} asChild><Link href={item.href}>{item.label}</Link></DropdownMenuItem>)}
          {current.user.permissions?.includes("federation:read") && <DropdownMenuItem asChild><Link href="/admin/federation">Federation</Link></DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href={`/users/${encodeURIComponent(current.user.username)}`}>Public profile</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logout.mutate()}>
            <LogOut aria-hidden="true" className="mr-2 size-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {logout.isPending && <span className="sr-only" role="status">Signing out…</span>}
      {logout.error && <StatusMessage tone="danger" className="px-2 py-1">{authErrorMessage(logout.error, "logout")}</StatusMessage>}
    </div>
  );
}
