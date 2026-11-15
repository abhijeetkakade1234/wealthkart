import { type Address, isAddress, parseEther } from "viem";

/** Create-circle form: shape, defaults (G1 values) and validation mirroring the contract (ADR 0022). */

export const MAX_FOUNDERS = 200;
/** Join-vote settings until the wizard exposes them (ADR 0022 defaults). */
export const DEFAULT_VOTING_WINDOW_SECONDS = 48 * 60 * 60;
export const DEFAULT_QUORUM_PCT = 50;
/** 0 = no member cap. */
export const DEFAULT_MAX_MEMBERS = 0;

export interface FormState {
  name: string;
  installment: string;
  dueDay: string;
  fee1: string;
  fee2: string;
  secondFeeDay: string;
  holidays: string;
  /** Missed installments before a dormant vote is allowed (ADR 0032). */
  dormantAfter: string;
  founders: string;
}

export const DEFAULTS: FormState = {
  name: "",
  installment: "0.5",
  dueDay: "10",
  fee1: "0.01",
  fee2: "0.01",
  secondFeeDay: "20",
  holidays: "3",
  dormantAfter: "3",
  founders: "",
};

export function parseAvax(v: string): bigint | null {
  if (!/^\d+(\.\d{1,18})?$/.test(v.trim())) return null;
  try {
    return parseEther(v.trim());
  } catch {
    return null;
  }
}

/** Client-side checks that mirror the contract (ADR 0022), in plain words. */
export function validate(f: FormState, self: Address | undefined) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const nameBytes = new TextEncoder().encode(f.name.trim()).length;
  if (nameBytes === 0) errors.name = "Give the circle a name.";
  else if (nameBytes > 48) errors.name = "Keep the name under 48 characters.";

  const installment = parseAvax(f.installment);
  if (installment === null || installment === 0n)
    errors.installment = "Enter an amount above 0, like 0.5.";
  const fee1 = parseAvax(f.fee1);
  if (fee1 === null) errors.fee1 = "Enter a fee, or 0 for none.";
  const fee2 = parseAvax(f.fee2);
  if (fee2 === null) errors.fee2 = "Enter a fee, or 0 for none.";
  // ADR 0030: each late fee is at most half the installment.
  if (installment !== null && installment > 0n) {
    if (fee1 !== null && fee1 * 2n > installment)
      errors.fee1 = "Keep each late fee at or below half the monthly amount.";
    if (fee2 !== null && fee2 * 2n > installment)
      errors.fee2 = "Keep each late fee at or below half the monthly amount.";
  }

  const dueDay = Number(f.dueDay);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)
    errors.dueDay = "Pick a day from 1 to 28.";
  const secondFeeDay = Number(f.secondFeeDay);
  if (!Number.isInteger(secondFeeDay) || secondFeeDay <= dueDay || secondFeeDay > 28)
    errors.secondFeeDay = "Must be after the due day and no later than the 28th.";
  const holidays = Number(f.holidays);
  if (!Number.isInteger(holidays) || holidays < 0 || holidays > 12)
    errors.holidays = "Pick 0 to 12.";
  const dormantAfter = Number(f.dormantAfter);
  if (!Number.isInteger(dormantAfter) || dormantAfter < 1 || dormantAfter > 12)
    errors.dormantAfter = "Pick 1 to 12.";

  const lines = f.founders
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = lines.find((l) => !isAddress(l));
  const set = new Map<string, Address>();
  if (self) set.set(self.toLowerCase(), self);
  for (const l of lines) if (isAddress(l)) set.set(l.toLowerCase(), l as Address);
  if (bad) errors.founders = `"${bad.slice(0, 16)}…" isn't a wallet address.`;
  else if (set.size > MAX_FOUNDERS)
    errors.founders = `A circle can start with at most ${MAX_FOUNDERS} members.`;

  return {
    errors,
    ok: Object.keys(errors).length === 0,
    founders: [...set.values()],
    /** Everyone except the creator: they get an invite and must accept (ADR 0028). */
    invitees: [...set.values()].filter((a) => a.toLowerCase() !== self?.toLowerCase()),
    cfg:
      installment !== null && fee1 !== null && fee2 !== null
        ? {
            name: f.name.trim(),
            installment,
            fee1,
            fee2,
            dueDay,
            secondFeeDay,
            holidaysPerYear: holidays,
            votingWindow: DEFAULT_VOTING_WINDOW_SECONDS,
            quorumPct: DEFAULT_QUORUM_PCT,
            maxMembers: DEFAULT_MAX_MEMBERS,
            dormantAfter,
          }
        : null,
  };
}
