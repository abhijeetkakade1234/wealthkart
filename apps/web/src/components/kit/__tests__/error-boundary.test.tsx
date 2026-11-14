import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { messages } from "@/lib/messages";

import { ErrorBoundary } from "../error-boundary";

let shouldThrow = true;

function Chart() {
  if (shouldThrow) throw new Error("Cannot read properties of undefined (reading 'map')");
  return <p>Chart is back</p>;
}

describe("ErrorBoundary", () => {
  it("S-UX-04 widget boundary catches a throwing child, siblings still render, Retry resets", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    const onReset = vi.fn(() => {
      shouldThrow = false;
    });

    render(
      <div>
        <ErrorBoundary preset="widget" onReset={onReset}>
          <Chart />
        </ErrorBoundary>
        <p>Members list still works</p>
      </div>,
    );

    expect(screen.getByText("Members list still works")).toBeInTheDocument();
    const card = screen.getByRole("alert");
    expect(card).toHaveAttribute("data-boundary", "widget");
    expect(card).toHaveTextContent(messages.widgetErrorTitle());
    // Raw error text is not in the main message, only behind Details.
    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/Cannot read properties/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Chart is back")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("S-UX-04 app preset shows a full-page friendly error with Reload", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary preset="app">
        <Chart />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: messages.appErrorTitle() })).toBeInTheDocument();
    expect(screen.getByText(messages.unknown())).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("S-UX-04 page preset shows a section-sized error with Try again", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary preset="page">
        <Chart />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: messages.pageErrorTitle() })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
