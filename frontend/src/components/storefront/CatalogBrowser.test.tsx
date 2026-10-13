import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getCatalog } from "../../lib/api/catalog";
import type { Game, GamesResponse } from "../../lib/api/contracts";
import { CatalogBrowser } from "./CatalogBrowser";

const navigation = vi.hoisted(() => ({ push: vi.fn(), searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => "/",
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("../../lib/api/catalog", () => ({
  getCatalog: vi.fn(),
  catalogMediaPath: (id: string, kind: string, version: string) => `/api/games/${id}/${kind}?version=${version}`,
  catalogDownloadPath: (id: string, version: string, architecture: string) => `/api/games/${id}/download?version=${version}&architecture=${architecture}`,
}));

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "org.example.pong",
  title: "PRG32 Pong",
  summary: "A synthetic cartridge for the catalog contract.",
  authors: [{ name: "PRG32 Lab" }],
  tags: ["arcade", "multiplayer"],
  latest_version: "1.0.0",
  selected_version: "1.0.0",
  versions: ["1.0.0"],
  architectures: ["qemu", "esp32c6"],
  metadata: { abi: "prg32-metadata-1.0", genre: "arcade" },
  colophon: null,
  variants: { qemu: { size: 2048, has_screenshot: false }, esp32c6: { size: 3072, has_screenshot: false } },
  publisher: "PRG32 Lab",
  updated_at: "2026-10-13T00:00:00Z",
  ...overrides,
});

function response(games: Game[]): GamesResponse {
  return { ok: true, games, pagination: { page: 1, per_page: 100, total: games.length, pages: 1, has_next: false, has_prev: false, next_page: null, prev_page: null } };
}

function renderBrowser() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CatalogBrowser /></QueryClientProvider>);
}

describe("CatalogBrowser", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.searchParams = new URLSearchParams();
    vi.mocked(getCatalog).mockReset();
  });

  test("renders real catalog results and exposes detail/download navigation", async () => {
    vi.mocked(getCatalog).mockResolvedValue(response([game(), game({ id: "org.example.tetris", title: "PRG32 Tetris", architectures: ["qemu"] })]));

    renderBrowser();

    expect(await screen.findByRole("heading", { name: "PRG32 Pong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open PRG32 Tetris" })).toHaveAttribute("href", "/games/org.example.tetris");
    expect(screen.getAllByRole("link", { name: "Download" })[0]).toHaveAttribute("href", "/api/games/org.example.pong/download?version=1.0.0&architecture=qemu");
    expect(screen.getByLabelText("Search cartridges")).toBeInTheDocument();
  });

  test("keeps search and supported client-side filters shareable in the URL", async () => {
    const user = userEvent.setup();
    vi.mocked(getCatalog).mockResolvedValue(response([game()]));
    renderBrowser();

    await user.type(await screen.findByLabelText("Search cartridges"), "pong");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(navigation.push).toHaveBeenCalledWith("/?q=pong");

    await user.selectOptions(screen.getByLabelText("Filter by architecture"), "esp32c6");
    expect(navigation.push).toHaveBeenLastCalledWith("/?architecture=esp32c6");
  });

  test("renders explicit empty and API failure states", async () => {
    vi.mocked(getCatalog).mockResolvedValue(response([]));
    renderBrowser();
    expect(await screen.findByText("The catalog is empty.")).toBeInTheDocument();

    vi.mocked(getCatalog).mockRejectedValueOnce(new TypeError("network down"));
    navigation.searchParams = new URLSearchParams("q=missing");
    renderBrowser();
    expect(await screen.findByRole("alert")).toHaveTextContent("catalog could not be loaded");
    await waitFor(() => expect(getCatalog).toHaveBeenCalled());
  });
});
