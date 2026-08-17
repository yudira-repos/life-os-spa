"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Button } from "@/components/ui/button";

// Plaid Link, wrapped.
//
// The flow: ask our server for a link token -> Plaid's UI collects the bank
// credentials (they never touch our servers or this component) -> Plaid hands
// back a short-lived public token -> our server exchanges it for the real
// access token and stores it encrypted.
//
// `mode: "update"` re-authenticates an existing connection after the bank
// invalidates it, which happens routinely and is otherwise a dead end for the
// user.

export function PlaidLinkButton({
  mode = "new",
  itemId,
  label,
  variant = "primary",
}: {
  mode?: "new" | "update";
  itemId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "exchanging">("idle");
  const [error, setError] = useState<string | null>(null);

  const requestToken = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/financial/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "update" ? { itemId } : {}),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not start the connection.");
        setStatus("idle");
        return;
      }
      setLinkToken(data.linkToken);
    } catch {
      setError("Could not reach the server.");
      setStatus("idle");
    }
  }, [mode, itemId]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setStatus("exchanging");
      try {
        const response = await fetch("/api/financial/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Could not finish connecting.");
        }
      } catch {
        setError("Could not finish connecting.");
      } finally {
        setStatus("idle");
        setLinkToken(null);
        router.refresh();
      }
    },
    [router]
  );

  // usePlaidLink must be called unconditionally (hook rules), but it only
  // becomes `ready` once a real token exists — hence the empty-string default.
  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    // Plaid types public_token as nullable; there is nothing to exchange
    // without one, so treat a null as an abandoned flow.
    onSuccess: (publicToken) => {
      if (publicToken) void onSuccess(publicToken);
    },
    onExit: () => {
      setStatus("idle");
      setLinkToken(null);
    },
  });

  // Open as soon as the token arrives, so the whole thing is one click.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const busy = status !== "idle";

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant={variant} disabled={busy} onClick={() => void requestToken()}>
        {status === "exchanging"
          ? "Finishing up…"
          : status === "loading"
            ? "Opening…"
            : (label ?? (mode === "update" ? "Reconnect" : "Link a bank account"))}
      </Button>
      {error && <p className="max-w-md text-xs text-rose-300">{error}</p>}
    </div>
  );
}
