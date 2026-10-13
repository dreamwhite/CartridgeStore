import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getScores } from "../../lib/api/scores";
import type { ScoreRecord } from "../../lib/api/contracts";
import { Scoreboard } from "./Scoreboard";

const navigation = vi.hoisted(() => ({ push: vi.fn(), searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => "/scores",
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("../../lib/api/scores", () => ({ getScores: vi.fn() }));

const score = (overrides: Partial<ScoreRecord> = {}): ScoreRecord => ({ game: "pong", player: "Ada", score: 42, created_at: 1_760_000_000, submitted_by: "Ada", ...overrides });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Scoreboard /></QueryClientProvider>);
}

describe("Scoreboard", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.searchParams = new URLSearchParams();
    vi.mocked(getScores).mockReset();
  });

  test("renders backend ordering without inventing identity or tie rules", async () => {
    vi.mocked(getScores).mockResolvedValue([score(), score({ player: "Grace", score: 1200, created_at: 1_760_000_001 })]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Returned scores" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1,200" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "PRG32 scoreboard results" })).toBeInTheDocument();
    expect(screen.queryByText("Global rank")).not.toBeInTheDocument();
    expect(getScores).toHaveBeenCalledWith({ game: "", player: "", limit: 20 });
  });

  test("applies supported game, player and bounded row filters", async () => {
    const user = userEvent.setup();
    vi.mocked(getScores).mockResolvedValue([score()]);
    renderPage();

    await user.type(await screen.findByLabelText("Filter scores by game"), "pong");
    await user.type(screen.getByLabelText("Filter scores by player"), "Ada");
    await user.selectOptions(screen.getByLabelText("Scoreboard rows"), "50");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(navigation.push).toHaveBeenCalledWith("/scores?game=pong&player=Ada&limit=50");
  });

  test("renders empty and failure states", async () => {
    vi.mocked(getScores).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No scores match these filters.")).toBeInTheDocument();

    vi.mocked(getScores).mockRejectedValueOnce(new Error("unavailable"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("scoreboard could not be loaded");
  });
});
