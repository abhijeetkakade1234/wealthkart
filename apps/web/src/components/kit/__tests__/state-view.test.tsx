import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { messages } from "@/lib/messages";

import { StateView } from "../state-view";
import { TxTracker } from "../tx-tracker";

describe("StateView", () => {
  it("S-UX-02 loading renders the caller's skeleton", () => {
    render(<StateView state="loading" skeleton={<div data-testid="skeleton" />} />);
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("S-UX-02 success renders the children", () => {
    render(<StateView state="success">Circle value 42 AVAX</StateView>);
    expect(screen.getByText("Circle value 42 AVAX")).toBeInTheDocument();
  });

  it("S-UX-02 empty renders illustration, one sentence and the action", async () => {
    const onAction = vi.fn();
    render(
      <StateView
        state="empty"
        message="No loans yet. When someone asks for one, the vote shows up here."
        action={{ label: "Ask for a loan", onAction }}
      />,
    );
    expect(screen.getByTestId("spot-placeholder")).toBeInTheDocument();
    expect(screen.getByText(/No loans yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ask for a loan" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("S-UX-02 error renders a plain message and a Retry button", async () => {
    const onRetry = vi.fn();
    render(<StateView state="error" onRetry={onRetry} details="HttpRequestError 503" />);
    expect(screen.getByText(messages.loadFailed())).toBeInTheDocument();
    expect(screen.queryByText("HttpRequestError 503")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("S-UX-02 failed renders the failed transaction message", () => {
    render(<StateView state="failed" message={messages.alreadyPaid("December")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("You've already paid for December.");
  });

  it("S-UX-02 stale renders the data, the saved-at note and Refresh", () => {
    render(
      <StateView state="stale" savedAt={0} now={4 * 60_000} onRefresh={() => undefined}>
        Cached list
      </StateView>,
    );
    expect(screen.getByText("Cached list")).toBeInTheDocument();
    expect(screen.getByText("Showing saved data from 4 min ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("S-UX-02 offline renders the offline banner", () => {
    render(<StateView state="offline" />);
    expect(
      screen.getByText(
        "You're offline. You can look around, but paying and voting need a connection.",
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["no-wallet", "Connect your Core wallet", "Connect Core"],
    ["wrong-network", "Switch to Avalanche", "Switch to Avalanche"],
    ["not-member", "You're not in this circle yet", "Go to my circles"],
  ] as const)(
    "S-UX-02 access (%s) renders one clear card with an action",
    (reason, title, action) => {
      render(<StateView state="access" reason={reason} onAction={() => undefined} />);
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    },
  );

  it("S-UX-02 pending transactions use TxTracker with an explorer link", () => {
    const { rerender } = render(
      <TxTracker status="sending" explorerUrl="https://snowtrace.io/tx/0x1" />,
    );
    expect(screen.getByText("Sending").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Confirm in Core").closest("li")).toHaveAttribute(
      "data-step-state",
      "done",
    );
    expect(screen.getByRole("link", { name: /View on explorer/ })).toHaveAttribute(
      "href",
      "https://snowtrace.io/tx/0x1",
    );
    rerender(
      <TxTracker status="failed" failedAt="confirm" failedMessage={messages.userRejected()} />,
    );
    expect(screen.getByText("Confirm in Core").closest("li")).toHaveAttribute(
      "data-step-state",
      "failed",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(messages.userRejected());
  });
});
