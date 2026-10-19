import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BootSplash } from "./BootSplash";

describe("BootSplash", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the boot screen until it completes automatically", () => {
    render(<BootSplash />);

    expect(
      screen.getByRole("status", {
        name: "Starting PRG32 Cartridge Store",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "PRG32 retro gaming and coding",
      }),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2500));
    act(() => vi.advanceTimersByTime(260));

    expect(
      screen.queryByRole("status", {
        name: "Starting PRG32 Cartridge Store",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not replay after the first visit in a session", () => {
    sessionStorage.setItem("prg32-boot-splash-seen", "1");

    render(<BootSplash />);
    act(() => vi.advanceTimersByTime(1));

    expect(
      screen.queryByRole("status", {
        name: "Starting PRG32 Cartridge Store",
      }),
    ).not.toBeInTheDocument();
  });
});
