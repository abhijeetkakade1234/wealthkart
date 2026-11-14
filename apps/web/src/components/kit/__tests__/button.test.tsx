import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Send } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../button";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Button", () => {
  it("S-UX-01 double click fires onAction once, shows the working label, then returns to idle", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onAction = vi.fn(() => pending.promise);

    render(
      <Button
        icon={Send}
        workingLabel="Paying…"
        doneLabel="Paid"
        onAction={onAction}
        feedbackMs={300}
      >
        Pay
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Pay" });
    await user.dblClick(button);

    expect(onAction).toHaveBeenCalledTimes(1);
    const working = screen.getByRole("button", { name: "Paying…" });
    expect(working).toBeDisabled();
    expect(working).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("button-spinner")).toBeInTheDocument();

    // Clicking again while working still does nothing.
    await user.click(working);
    expect(onAction).toHaveBeenCalledTimes(1);

    pending.resolve();
    expect(await screen.findByRole("button", { name: "Paid" })).toBeInTheDocument();
    expect(screen.getByTestId("draw-check")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("button", { name: "Pay" })).toBeEnabled());
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "idle");
  });

  it("S-UX-01 a rejected action shows failed, reports the error and never throws", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(
      <Button
        workingLabel="Paying…"
        onAction={() => Promise.reject(new Error("boom"))}
        onError={onError}
        feedbackMs={300}
      >
        Pay
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Pay" }));
    expect(await screen.findByTestId("button-failed")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("data-state", "idle"));
  });

  it("S-UX-01 keeps the same width: all labels are rendered in one grid cell", () => {
    render(
      <Button workingLabel="Sending vote…" onAction={() => undefined}>
        Vote
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Vote" });
    expect(button).toHaveTextContent("Sending vote…");
  });

  it("controlled state drives the label and disables while working", () => {
    const { rerender } = render(
      <Button state="idle" workingLabel="Paying…">
        Pay
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Pay" })).toBeEnabled();
    rerender(
      <Button state="working" workingLabel="Paying…">
        Pay
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Paying…" })).toBeDisabled();
  });

  it("disabled with a reason exposes the reason to assistive tech", () => {
    render(
      <Button disabled disabledReason="You've already paid this month.">
        Pay
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Pay" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("You've already paid this month.");
  });
});
