"use client";
import { useEffect, useMemo } from "react";
import { useToastyStore } from "@/lib/store";
import {
  fetchHistory,
  getPubNubClient,
  publishToEvent,
  subscribeToEvent,
} from "@/lib/pubnub/client";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import type { GetEventResponse } from "@/lib/api/contract";
import type { ProgressMsg } from "@/lib/types";

// Module-scope: which event codes have already been hydrated from PubNub
// history in this session. Replaying history is destructive when combined
// with PubNub's lossy retention — once we've seen this event, trust the
// in-memory store + live subscription going forward.
const hydratedEventCodes = new Set<string>();

/**
 * Subscribe a player (or host monitor) to an event.
 *
 *  - Fetches initial config/teams/players from the API.
 *  - Bootstraps the Zustand store (progress is preserved on same-event re-bootstrap).
 *  - On the FIRST mount per event-code in this session, hydrates progress
 *    from PubNub message history. Subsequent mounts skip history to avoid
 *    losing accumulated state when PubNub retention is lossy.
 *  - Subscribes to live PubNub messages.
 *
 * Pass `myPlayerId = null` to subscribe in spectator mode (host monitor).
 */
export function useEventBootstrap(code: string, myPlayerId: string | null): void {
  const bootstrap = useToastyStore((s) => s.bootstrap);
  const receive = useToastyStore((s) => s.receive);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    (async () => {
      const deviceId = getOrCreateDeviceId();

      const res = await fetch(`/api/events/${code}`);
      if (!res.ok) return;
      const data = (await res.json()) as GetEventResponse;
      if (cancelled) return;

      bootstrap({
        event: data.event,
        teams: data.teams,
        players: data.players,
        myPlayerId: myPlayerId ?? "__spectator__",
        myDeviceId: deviceId,
      });

      const client = getPubNubClient(myPlayerId ?? deviceId);

      if (!hydratedEventCodes.has(code)) {
        try {
          const history = await fetchHistory(client, code, 100);
          for (const msg of history) receive(msg);
          hydratedEventCodes.add(code);
        } catch (err) {
          console.warn("[bootstrap] history fetch failed", err);
        }
      }

      if (cancelled) return;

      const sub = subscribeToEvent(client, code, receive);
      unsub = sub.unsubscribe;
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [code, myPlayerId, bootstrap, receive]);
}

/**
 * Drop the hydration flag for `code` so the next bootstrap re-fetches
 * history. Call after host-driven resets (Reset Progress / Reset to Lobby)
 * if you want all clients to re-hydrate cleanly.
 */
export function invalidateEventHydration(code: string): void {
  hydratedEventCodes.delete(code);
}

/**
 * Convenience: get a publisher bound to a code. Memoized — stable function
 * reference across renders (only changes if `code` does), so it's safe
 * to use in useEffect dependency arrays without re-mounting effects.
 */
export function usePublisher(code: string): (msg: ProgressMsg) => Promise<void> {
  return useMemo(() => {
    return async (msg: ProgressMsg) => {
      const deviceId = getOrCreateDeviceId();
      const client = getPubNubClient(deviceId);
      await publishToEvent(client, code, msg);
    };
  }, [code]);
}
