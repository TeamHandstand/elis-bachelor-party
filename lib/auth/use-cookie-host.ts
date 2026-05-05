"use client";

import { useEffect, useState } from "react";

/**
 * Client-side check: does this browser hold a valid host cookie? The cookie
 * is httpOnly so we can't read it directly; we ping /api/host/me on mount.
 * Returns the boolean result and a 'loading' flag for first-render flicker
 * suppression.
 */
export function useCookieHost(): { isHost: boolean; loading: boolean } {
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/host/me", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { isHost: boolean };
        if (!cancelled) {
          setIsHost(!!data.isHost);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isHost, loading };
}
