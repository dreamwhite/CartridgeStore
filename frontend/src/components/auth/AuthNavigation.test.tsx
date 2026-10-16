import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthNavigation } from "./AuthNavigation";

const authState = vi.hoisted(() => ({ value: { isPending: false, error: null as Error | null, user: null as null | { username: string; permissions: string[] } } }));
const routerState = vi.hoisted(() => ({ replace: vi.fn() }));
const logoutState = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
}));

vi.mock("../../lib/auth/config", () => ({ authIntegrationEnabled: true }));

vi.mock("../../lib/auth/use-current-user", () => ({
  useCurrentUser: () => authState.value,
}));

vi.mock("../../lib/api/auth", () => ({
  authErrorMessage: () => "The authentication service could not be reached.",
  logoutLocal: logoutState.logout,
}));

describe("AuthNavigation", () => {
  beforeEach(() => {
    authState.value = { isPending: false, error: new TypeError("auth down"), user: null };
    routerState.replace.mockReset();
    logoutState.logout.mockReset();
  });

  test("keeps an authentication outage compact while exposing an accessible retry", () => {
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><AuthNavigation /></QueryClientProvider>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Auth unavailable");
    expect(alert).toHaveAttribute("title", "The authentication service could not be reached.");
    expect(screen.getByRole("link", { name: "Retry authentication" })).toHaveAttribute("href", "/login");
  });

  test("shows a prominent anonymous sign-in action", () => {
    authState.value = { isPending: false, error: null, user: null };
    render(<QueryClientProvider client={new QueryClient()}><AuthNavigation /></QueryClientProvider>);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveClass("bg-[var(--color-primary)]");
  });

  test("exposes only permission-aware destinations and logout in the account menu", async () => {
    const user = userEvent.setup();
    authState.value = { isPending: false, error: null, user: { username: "ada", permissions: ["catalog:submit"] } };
    render(<QueryClientProvider client={new QueryClient()}><AuthNavigation /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: "Open account menu for ada" }));
    expect(screen.getByRole("menuitem", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Creator Studio" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Review queue" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(logoutState.logout).toHaveBeenCalledOnce();
  });
});
