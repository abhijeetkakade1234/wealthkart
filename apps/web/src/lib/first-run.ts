/**
 * First-run checklist on the home screen (ADR 0054): what a new wallet still needs before it
 * can take part in a circle. Two items are read from the chain (AVAX for fees, being in a
 * circle); two can only be ticked by the person (recovery phrase written down, backup wallet
 * picked), because nobody else can know. Ticks and "hide" are kept per wallet in this
 * browser's localStorage; every read and write is wrapped so a blocked store just means the
 * list starts fresh.
 */

export interface FirstRunState {
  dismissed: boolean;
  /** Self-reported: recovery phrase written down. */
  phrase: boolean;
  /** Self-reported: backup (nominee) wallet picked. */
  nominee: boolean;
}

export const EMPTY_FIRST_RUN: FirstRunState = { dismissed: false, phrase: false, nominee: false };

export function firstRunKey(address: string): string {
  return `wk:first-run:${address.toLowerCase()}`;
}

export function readFirstRun(address: string): FirstRunState {
  try {
    const raw = window.localStorage.getItem(firstRunKey(address));
    if (!raw) return EMPTY_FIRST_RUN;
    const v = JSON.parse(raw) as Partial<FirstRunState>;
    return {
      dismissed: v.dismissed === true,
      phrase: v.phrase === true,
      nominee: v.nominee === true,
    };
  } catch {
    return EMPTY_FIRST_RUN;
  }
}

export function writeFirstRun(address: string, state: FirstRunState): void {
  try {
    window.localStorage.setItem(firstRunKey(address), JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the list simply shows again next time.
  }
}

/** done/todo, or still being read, or the read failed. */
export type CheckStatus = "done" | "todo" | "checking" | "unknown";

export type ChecklistId = "phrase" | "gas" | "nominee" | "circle";

export interface ChecklistItem {
  id: ChecklistId;
  title: string;
  hint: string;
  /** Guide step that explains it. */
  href: string;
  status: CheckStatus;
  /** The person ticks it themselves. */
  manual: boolean;
}

/** `undefined` = still loading, `null` = couldn't read. */
type Read = boolean | undefined | null;

function fromRead(v: Read): CheckStatus {
  if (v === undefined) return "checking";
  if (v === null) return "unknown";
  return v ? "done" : "todo";
}

export function checklistItems(input: {
  hasGas: Read;
  inCircle: Read;
  state: FirstRunState;
  testnet: boolean;
}): ChecklistItem[] {
  return [
    {
      id: "phrase",
      title: "Write down your recovery phrase",
      hint: "On paper, kept safe. Nobody can recover a lost wallet.",
      href: "/start/#create-wallet",
      status: input.state.phrase ? "done" : "todo",
      manual: true,
    },
    {
      id: "gas",
      title: "Have a little AVAX for network fees",
      hint: input.testnet
        ? "Test AVAX is free from the Fuji faucet."
        : "Every payment and vote costs a small fee in AVAX.",
      href: "/start/#get-avax",
      status: fromRead(input.hasGas),
      manual: false,
    },
    {
      id: "nominee",
      title: "Pick a backup wallet",
      hint: "Someone who should get your savings if you lose access for good.",
      href: "/start/#backup-wallet",
      status: input.state.nominee ? "done" : "todo",
      manual: true,
    },
    {
      id: "circle",
      title: "Join or start a circle",
      hint: "Open a friend's invite link, or start one yourself.",
      href: "/start/#join",
      status: fromRead(input.inCircle),
      manual: false,
    },
  ];
}

/** Show the list until it's hidden or everything on it is done. */
export function showChecklist(items: ChecklistItem[], state: FirstRunState): boolean {
  if (state.dismissed) return false;
  return !items.every((i) => i.status === "done");
}
