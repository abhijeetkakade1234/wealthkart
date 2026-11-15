"use client";

import { Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Address } from "viem";

import { Button } from "@/components/kit";
import { inviteLink } from "@/lib/membership";
import { notify } from "@/lib/toast";

/**
 * "Invite a friend": a link that carries only the circle address and who invited (RT-04:
 * no secret codes). The friend asks to join, and the members vote.
 */
export function InviteCard({ circle, me }: { circle: Address; me: Address }) {
  const [origin, setOrigin] = useState("");
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
  }, []);
  const link = origin ? inviteLink(origin, circle, me) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      notify.copied("Invite link");
    } catch {
      notify.error("We couldn't copy the link. Select it and copy it yourself.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Join my WealthKart circle", url: link });
    } catch {
      // Closing the share sheet isn't an error worth showing.
    }
  }

  return (
    <div className="grid content-start gap-5 rounded-[14px] border border-border bg-card p-[26px]">
      <div className="grid gap-1.5">
        <h3 className="text-[15px] font-semibold">Invite a friend</h3>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Send this link. Your friend picks a name and asks to join; then the members vote, and 66%
          yes lets them in.
        </p>
      </div>
      <input
        readOnly
        aria-label="Invite link"
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full truncate rounded-[10px] border border-line-soft bg-secondary px-3.5 py-2.5 font-mono text-[12.5px] text-muted-foreground outline-none"
      />
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" icon={Copy} onClick={copy} disabled={!link}>
          Copy link
        </Button>
        {canShare && (
          <Button variant="ghost" icon={Share2} onClick={share} disabled={!link}>
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
