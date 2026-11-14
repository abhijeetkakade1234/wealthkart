/**
 * Toast helpers on top of sonner (docs/ui.md §12).
 *
 * Toasts report the result of something the user just did. Success and info hide
 * after 4 s; errors stay until dismissed. Messages come from the catalogue, so
 * a raw error object never reaches the screen. Use an inline alert, not a toast,
 * for anything the user must act on later.
 */
import { toast as sonner, type ExternalToast } from "sonner";

import { type FriendlyErrorContext, messages, toFriendlyError } from "./messages";

const AUTO_HIDE_MS = 4000;

export type ToastOptions = Pick<ExternalToast, "id" | "action" | "description">;

export const notify = {
  success(message: string, options?: ToastOptions) {
    return sonner.success(message, { duration: AUTO_HIDE_MS, ...options });
  },

  info(message: string, options?: ToastOptions) {
    return sonner.info(message, { duration: AUTO_HIDE_MS, ...options });
  },

  /**
   * Shows a friendly error. Accepts a catalogue string, a FriendlyError, or anything
   * thrown (mapped through `toFriendlyError`). Stays until the user dismisses it.
   */
  error(error: unknown, options?: ToastOptions & { context?: FriendlyErrorContext }) {
    const { context, ...rest } = options ?? {};
    const message = typeof error === "string" ? error : toFriendlyError(error, context).message;
    return sonner.error(message, { duration: Infinity, closeButton: true, ...rest });
  },

  dismiss(id?: string | number) {
    sonner.dismiss(id);
  },

  // Shortcuts for the common results in the catalogue
  paid: (month: string, amountAvax: string) => notify.success(messages.paid(month, amountAvax)),
  voted: (votes: number, members: number) => notify.success(messages.voted(votes, members)),
  copied: (what?: string) => notify.success(messages.copied(what)),
};
