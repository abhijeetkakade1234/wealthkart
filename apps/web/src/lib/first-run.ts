/**
 * First-run checklist on the home screen (ADR 0054): what a new wallet still needs before it
 * can take part in a circle. Three items are read from the chain (AVAX for fees, being in a
 * circle, a backup wallet set in every circle: `nomineeOf`, ADR 0056); one can only be ticked
 * by the person (recovery phrase written down), because nobody else can know. Ticks and
 * "hide" are kept per wallet in this browser's localStorage; every read and write is wrapped
 * so a blocked store just means the list starts fresh.
 */

import { t } from "@/i18n/runtime";
import "@/i18n/en/checklist";

export interface FirstRunState {
  dismissed: boolean;
  /** Self-reported: recovery phrase written down. */
  phrase: boolean;
  /** Old self-tick for the backup wallet; kept so stored state still parses. It is read from
   *  the chain now (ADR 0056) and no longer counts. */
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
  /** Every circle this wallet is in has a backup wallet set (`nomineeOf`). */
  hasNominee: Read;
  state: FirstRunState;
  testnet: boolean;
}): ChecklistItem[] {
  return [
    {
      id: "phrase",
      title: t("checklist.phraseTitle"),
      hint: t("checklist.phraseHint"),
      href: "/start/#create-wallet",
      status: input.state.phrase ? "done" : "todo",
      manual: true,
    },
    {
      id: "gas",
      title: t("checklist.gasTitle"),
      hint: input.testnet ? t("checklist.gasHintTestnet") : t("checklist.gasHint"),
      href: "/start/#get-avax",
      status: fromRead(input.hasGas),
      manual: false,
    },
    {
      id: "nominee",
      title: t("checklist.nomineeTitle"),
      hint:
        input.inCircle === false ? t("checklist.nomineeHintNoCircle") : t("checklist.nomineeHint"),
      href: "/start/#backup-wallet",
      status: input.inCircle === false ? "todo" : fromRead(input.hasNominee),
      manual: false,
    },
    {
      id: "circle",
      title: t("checklist.circleTitle"),
      hint: t("checklist.circleHint"),
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
