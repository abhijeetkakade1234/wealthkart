"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useSignMessage } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { messages } from "@/lib/messages";
import {
  browserFacts,
  type CircleSetting,
  type DeviceRecord,
  keyBytes,
  PushApiError,
  pushApi,
  pushSupport,
  readDevice,
  REMINDERS_CONFIGURED,
  signInMessage,
  VAPID_PUBLIC_KEY,
  writeDevice,
} from "@/lib/push";

/**
 * Reminders on this device (ADR 0052). One state the cards render from:
 *
 *   loading -> not-set-up | unsupported | ios-install | denied | off | other-wallet | on
 *
 * Turning on: ask for notification permission, subscribe with the push service, sign one
 * message in Core (free), send it to the Worker, keep the device token here. Turning off works
 * with that token. Settings changes use the token too, so they never need another signature.
 */
export type ReminderStatus =
  | "loading"
  | "not-set-up"
  | "unsupported"
  | "ios-install"
  | "denied"
  | "off"
  | "other-wallet"
  | "on";

/** Plain message for a push API or browser failure. */
export function reminderError(err: unknown): string {
  if (err instanceof PushApiError) {
    if (err.status === 429) return messages.remindersBusy();
    if (err.status === 404) return messages.remindersCircleUnknown();
    if (err.status === 503) return messages.remindersNotSetUp();
    if (err.status === 502) return messages.remindersTestFailed();
    return messages.remindersFailed();
  }
  const e = err as { name?: string; code?: number; message?: string } | null;
  if (e?.name === "NotAllowedError") return messages.remindersDenied();
  if (
    e?.code === 4001 ||
    e?.name === "UserRejectedRequestError" ||
    /user (rejected|denied)/i.test(e?.message ?? "")
  ) {
    return messages.userRejected();
  }
  return messages.remindersFailed();
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Production registers the worker on load; dev registers it now, only for reminders.
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export function useReminders() {
  const { address, chainId, targetChain } = useCoreWallet();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [support, setSupport] = useState<ReturnType<typeof pushSupport> | null>(null);

  // Browser facts only exist after mount (static export).
  useEffect(() => {
    const s = pushSupport(browserFacts());
    setSupport(s);
    setPermission(s === "ready" ? Notification.permission : null);
    setDevice(readDevice());
  }, []);

  const mine =
    device && address && device.address.toLowerCase() === address.toLowerCase() ? device : null;

  const settings = useQuery({
    queryKey: ["reminders", mine?.endpoint, mine?.address],
    enabled: Boolean(mine) && REMINDERS_CONFIGURED,
    queryFn: async () => {
      try {
        return await pushApi.settings({ endpoint: mine!.endpoint, token: mine!.token });
      } catch (err) {
        // The Worker no longer knows this device (turned off elsewhere, or the push service
        // dropped it): forget it here too so the card offers "Turn on" again.
        if (err instanceof PushApiError && err.status === 401) {
          writeDevice(null);
          setDevice(null);
          return { address: mine!.address, circles: [] as CircleSetting[] };
        }
        throw err;
      }
    },
  });

  let status: ReminderStatus;
  if (support === null) status = "loading";
  else if (!REMINDERS_CONFIGURED) status = "not-set-up";
  else if (support !== "ready") status = support;
  else if (permission === "denied") status = "denied";
  else if (mine && permission === "granted") status = "on";
  else if (device && !mine && permission === "granted") status = "other-wallet";
  else status = "off";

  const turnOn = useCallback(
    async (circles: string[]) => {
      if (!address) throw new Error("No wallet");
      const asked = await Notification.requestPermission();
      setPermission(asked);
      if (asked !== "granted") {
        const err = new Error("denied");
        err.name = "NotAllowedError";
        throw err;
      }
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
        }));
      const json = sub.toJSON();
      const endpoint = json.endpoint ?? sub.endpoint;
      const message = await signInMessage({
        address,
        action: "on",
        endpoint,
        chainId: chainId ?? targetChain.id,
        origin: window.location.origin,
      });
      const signature = await signMessageAsync({ message });
      const res = await pushApi.subscribe({ message, signature, subscription: json, circles });
      const rec: DeviceRecord = {
        endpoint,
        token: res.token,
        address: res.address,
        chainId: chainId ?? targetChain.id,
      };
      writeDevice(rec);
      setDevice(rec);
      qc.setQueryData(["reminders", rec.endpoint, rec.address], {
        address: res.address,
        circles: res.circles,
      });
    },
    [address, chainId, qc, signMessageAsync, targetChain.id],
  );

  const turnOff = useCallback(async () => {
    const rec = device;
    if (rec) {
      try {
        await pushApi.unsubscribe({ endpoint: rec.endpoint, token: rec.token });
      } catch (err) {
        // The Worker may already have dropped it; anything else, say so and keep the record.
        if (!(err instanceof PushApiError && err.status === 401)) throw err;
      }
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
    } catch {
      // Unsubscribing locally is best effort; the Worker no longer sends anything.
    }
    writeDevice(null);
    setDevice(null);
    await qc.invalidateQueries({ queryKey: ["reminders"] });
  }, [device, qc]);

  const setCircle = useMutation({
    mutationFn: async (v: { circle: string; kinds: number }) => {
      if (!mine) throw new Error("Reminders are off");
      return pushApi.setCircle({ endpoint: mine.endpoint, token: mine.token, ...v });
    },
    onMutate: async (v) => {
      const key = ["reminders", mine?.endpoint, mine?.address];
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<{ address: string; circles: CircleSetting[] }>(key);
      if (before) {
        const circle = v.circle.toLowerCase();
        const rest = before.circles.filter((c) => c.circle !== circle);
        qc.setQueryData(key, { ...before, circles: [...rest, { circle, kinds: v.kinds }] });
      }
      return { before, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(ctx.key, ctx.before);
    },
  });

  const sendTest = useCallback(async () => {
    if (!mine) throw new Error("Reminders are off");
    const res = await pushApi.test({ endpoint: mine.endpoint, token: mine.token });
    if (res.gone) {
      writeDevice(null);
      setDevice(null);
    }
    return res;
  }, [mine]);

  /** Kinds for a circle; 0 when this wallet has no setting for it yet. */
  const kindsFor = (circle: string) =>
    settings.data?.circles.find((c) => c.circle === circle.toLowerCase())?.kinds ?? 0;

  return {
    status,
    device,
    settings,
    kindsFor,
    turnOn,
    turnOff,
    setCircle,
    sendTest,
  };
}
